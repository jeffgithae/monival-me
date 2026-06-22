import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import axios from 'axios';
import { Webhook, WebhookDocument, WebhookEvent, WEBHOOK_EVENTS } from './schemas/webhook.schema';

export interface CreateWebhookDto {
  name: string;
  url: string;
  events: WebhookEvent[];
  projectId?: string;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  organizationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

const MAX_RETRIES   = 3;
const RETRY_DELAYS  = [5_000, 30_000, 120_000]; // ms: 5s, 30s, 2min

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(Webhook.name)
    private readonly model: Model<WebhookDocument>,
  ) {}

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    userId: string,
    dto: CreateWebhookDto,
  ): Promise<Omit<WebhookDocument, 'secret'> & { secret: string }> {
    if (!dto.url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use HTTPS.');
    }

    const invalidEvents = dto.events.filter(e => !WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length) {
      throw new BadRequestException(`Unknown events: ${invalidEvents.join(', ')}`);
    }

    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const hook = await this.model.create({
      organizationId: new Types.ObjectId(organizationId),
      createdByUserId: new Types.ObjectId(userId),
      name: dto.name,
      url: dto.url,
      secret,
      events: dto.events,
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      isActive: true,
    });

    // Return the secret once in full — it won't be exposed again
    return { ...hook.toObject(), secret } as any;
  }

  findAll(organizationId: string) {
    return this.model
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .select('-secret')
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(
    organizationId: string,
    id: string,
    dto: Partial<Pick<CreateWebhookDto, 'name' | 'events' | 'projectId'>> & { isActive?: boolean },
  ) {
    const hook = await this.model.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      dto,
      { new: true },
    ).select('-secret');
    if (!hook) throw new NotFoundException('Webhook not found.');
    return hook;
  }

  async remove(organizationId: string, id: string): Promise<{ deleted: boolean }> {
    const result = await this.model.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Webhook not found.');
    return { deleted: true };
  }

  /**
   * Rotate the signing secret. Returns the new secret ONCE.
   */
  async rotateSecret(
    organizationId: string,
    id: string,
  ): Promise<{ secret: string }> {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const hook = await this.model.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { secret },
    );
    if (!hook) throw new NotFoundException('Webhook not found.');
    return { secret };
  }

  // ── Delivery ───────────────────────────────────────────────────────────────

  /**
   * Fire webhooks for all active subscriptions that match the event.
   * Called by other services (activities, reporting, etc.) after state changes.
   * Non-blocking — errors are logged, not thrown.
   */
  async dispatch(
    organizationId: string,
    event: WebhookEvent,
    data: Record<string, unknown>,
    projectId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      isActive: true,
      events: event,
    };
    if (projectId) {
      filter.$or = [
        { projectId: new Types.ObjectId(projectId) },
        { projectId: { $exists: false } },
      ];
    }

    const hooks = await this.model.find(filter).select('+secret').lean();
    if (!hooks.length) return;

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      organizationId,
      occurredAt: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(hooks.map(hook => this.deliver(hook, payload)));
  }

  private async deliver(
    hook: WebhookDocument & { secret: string },
    payload: WebhookPayload,
    attempt = 0,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.sign(hook.secret, timestamp, body);

    try {
      await axios.post(hook.url, body, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Evidara -Event':     payload.event,
          'X-Evidara -Timestamp': timestamp,
          'X-Evidara -Signature': signature,
          'X-Evidara -Delivery':  payload.id,
          'User-Agent':          'Evidara-Webhooks/1.0',
        },
        validateStatus: (s) => s >= 200 && s < 300,
      });

      await this.model.updateOne(
        { _id: hook._id },
        { lastDeliveryStatus: 'success', lastDeliveredAt: new Date(), failureCount: 0 },
      );
    } catch (err) {
      this.logger.warn(
        `Webhook delivery failed [${hook._id}] event=${payload.event} attempt=${attempt + 1}: ${(err as Error).message}`,
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] ?? 120_000;
        setTimeout(() => this.deliver(hook, payload, attempt + 1), delay);
      } else {
        await this.model.updateOne(
          { _id: hook._id },
          {
            lastDeliveryStatus: 'failed',
            lastDeliveredAt: new Date(),
            $inc: { failureCount: 1 },
          },
        );
      }
    }
  }

  /**
   * HMAC-SHA256 signature: `t=<timestamp>,v1=<hex-digest>`
   * Consumers verify: HMAC-SHA256(secret, `${timestamp}.${body}`) === v1
   */
  private sign(secret: string, timestamp: string, body: string): string {
    const signed = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return `t=${timestamp},v1=${signed}`;
  }

  /**
   * Project cascade cleanup. Webhook.projectId is just an optional scope
   * filter on an otherwise org-level subscription — clearing it makes the
   * webhook org-wide instead of leaving it pointed at a project that no
   * longer exists. The subscription itself (and its signing secret) stays
   * intact.
   */
  async unscopeFromProject(organizationId: string, projectId: string) {
    const result = await this.model.updateMany(
      { organizationId: new Types.ObjectId(organizationId), projectId: new Types.ObjectId(projectId) },
      { $unset: { projectId: 1 } },
    );
    return { modified: result.modifiedCount };
  }
}