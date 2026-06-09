import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExternalIntegration, IntegrationPlatform } from './schemas/external-integration.schema';
import { FormResponse } from './schemas/form-response.schema';
import { FormTemplate } from './schemas/form-template.schema';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectModel(ExternalIntegration.name)
    private readonly integrationModel: Model<ExternalIntegration>,
    @InjectModel(FormResponse.name)
    private readonly responseModel: Model<FormResponse>,
    @InjectModel(FormTemplate.name)
    private readonly templateModel: Model<FormTemplate>,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  findAll(organizationId: string, projectId?: string) {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (projectId) query.projectId = new Types.ObjectId(projectId);
    return this.integrationModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const doc = await this.integrationModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!doc) throw new NotFoundException('Integration not found');
    return doc;
  }

  async create(
    organizationId: string,
    dto: CreateIntegrationDto,
    userId: string,
  ) {
    return this.integrationModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
      name: dto.name,
      description: dto.description,
      platform: dto.platform as IntegrationPlatform,
      isActive: dto.isActive ?? true,
      config: dto.config ?? {},
      fieldMapping: dto.fieldMapping ?? {},
      indicatorId: dto.indicatorId,
      activityId: dto.activityId,
      syncIntervalMinutes: dto.syncIntervalMinutes,
      createdBy: new Types.ObjectId(userId),
      syncStatus: 'idle' as const,
    });
  }

  async update(organizationId: string, id: string, dto: UpdateIntegrationDto) {
    const updated = await this.integrationModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          ...dto,
          projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
          templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
        },
        { new: true },
      )
      .lean();
    if (!updated) throw new NotFoundException('Integration not found');
    return updated;
  }

  async remove(organizationId: string, id: string) {
    const res = await this.integrationModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (res.deletedCount === 0) throw new NotFoundException('Integration not found');
    return { deleted: true };
  }

  // ── Sync entry point ────────────────────────────────────────────────────────

  async triggerSync(
    organizationId: string,
    id: string,
    submittedByUserId: string,
  ): Promise<{ synced: number; skipped: number; errors: string[] }> {
    const integration = await this.findOne(organizationId, id);

    if (!integration.isActive) {
      throw new BadRequestException('Integration is disabled');
    }

    // Mark as syncing
    await this.integrationModel.findByIdAndUpdate(id, {
      syncStatus: 'syncing',
      lastSyncError: undefined,
    });

    try {
      let result: { synced: number; skipped: number; errors: string[] };

      switch (integration.platform) {
        case 'kobo':
          result = await this.syncKoboToolbox(integration, organizationId, submittedByUserId);
          break;
        case 'odk':
          result = await this.syncODKCentral(integration, organizationId, submittedByUserId);
          break;
        case 'ona':
          result = await this.syncOna(integration, organizationId, submittedByUserId);
          break;
        case 'commcare':
          result = await this.syncCommCare(integration, organizationId, submittedByUserId);
          break;
        case 'webhook':
          result = { synced: 0, skipped: 0, errors: ['Webhook integrations are push-only — data arrives via POST /forms/integrations/:id/webhook'] };
          break;
        case 'csv':
          result = { synced: 0, skipped: 0, errors: ['Use POST /forms/integrations/:id/upload to import a CSV'] };
          break;
        default:
          result = { synced: 0, skipped: 0, errors: [`Unknown platform: ${integration.platform}`] };
      }

      await this.integrationModel.findByIdAndUpdate(id, {
        syncStatus: result.errors.length === 0 ? 'success' : 'error',
        lastSyncAt: new Date(),
        lastBatchCount: result.synced,
        $inc: { totalSynced: result.synced },
        lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      });

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown sync error';
      this.logger.error(`Sync failed for integration ${id}: ${message}`);
      await this.integrationModel.findByIdAndUpdate(id, {
        syncStatus: 'error',
        lastSyncAt: new Date(),
        lastSyncError: message,
      });
      throw new BadRequestException(`Sync failed: ${message}`);
    }
  }

  // ── KoboToolbox sync ────────────────────────────────────────────────────────

  private async syncKoboToolbox(
    integration: ExternalIntegration & { _id: Types.ObjectId },
    organizationId: string,
    submittedByUserId: string,
  ) {
    const { serverUrl, apiToken, assetUid } = integration.config as {
      serverUrl?: string;
      apiToken?: string;
      assetUid?: string;
    };

    if (!serverUrl || !apiToken || !assetUid) {
      throw new BadRequestException('KoboToolbox config requires serverUrl, apiToken, and assetUid');
    }

    const baseUrl = serverUrl.replace(/\/$/, '');
    const url = `${baseUrl}/api/v2/assets/${assetUid}/data/?format=json&limit=5000`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`KoboToolbox API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { results?: Record<string, unknown>[] };
    const submissions: Record<string, unknown>[] = data.results ?? [];

    return this.upsertSubmissions(
      submissions,
      integration,
      organizationId,
      submittedByUserId,
      '_id',        // KoboToolbox unique key
    );
  }

  // ── ODK Central sync ────────────────────────────────────────────────────────

  private async syncODKCentral(
    integration: ExternalIntegration & { _id: Types.ObjectId },
    organizationId: string,
    submittedByUserId: string,
  ) {
    const { serverUrl, projectId, formId, email, password } = integration.config as {
      serverUrl?: string;
      projectId?: string | number;
      formId?: string;
      email?: string;
      password?: string;
    };

    if (!serverUrl || !projectId || !formId || !email || !password) {
      throw new BadRequestException('ODK Central config requires serverUrl, projectId, formId, email, and password');
    }

    const base = serverUrl.replace(/\/$/, '');

    // Session token auth
    const session = await fetch(`${base}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!session.ok) {
      throw new Error(`ODK auth failed: ${session.status}`);
    }

    const { token } = (await session.json()) as { token: string };
    const submissionsUrl =
      `${base}/v1/projects/${projectId}/forms/${formId}/submissions.json`;

    const res = await fetch(submissionsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`ODK submissions fetch failed: ${res.status}`);
    }

    const submissions: Record<string, unknown>[] = (await res.json()) as Record<string, unknown>[];

    return this.upsertSubmissions(
      submissions,
      integration,
      organizationId,
      submittedByUserId,
      '__id',       // ODK unique key
    );
  }

  // ── Ona sync ────────────────────────────────────────────────────────────────

  private async syncOna(
    integration: ExternalIntegration & { _id: Types.ObjectId },
    organizationId: string,
    submittedByUserId: string,
  ) {
    const { serverUrl, apiToken, formId } = integration.config as {
      serverUrl?: string;
      apiToken?: string;
      formId?: string | number;
    };

    if (!serverUrl || !apiToken || !formId) {
      throw new BadRequestException('Ona config requires serverUrl, apiToken, and formId');
    }

    const base = serverUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/data/${formId}?format=json`;

    const res = await fetch(url, {
      headers: { Authorization: `Token ${apiToken}` },
    });

    if (!res.ok) throw new Error(`Ona API error: ${res.status}`);

    const submissions: Record<string, unknown>[] = (await res.json()) as Record<string, unknown>[];

    return this.upsertSubmissions(
      submissions,
      integration,
      organizationId,
      submittedByUserId,
      '_id',
    );
  }

  // ── CommCare sync ───────────────────────────────────────────────────────────

  private async syncCommCare(
    integration: ExternalIntegration & { _id: Types.ObjectId },
    organizationId: string,
    submittedByUserId: string,
  ) {
    const { projectSpace, apiKey, formId } = integration.config as {
      projectSpace?: string;
      apiKey?: string;
      formId?: string;
    };

    if (!projectSpace || !apiKey) {
      throw new BadRequestException('CommCare config requires projectSpace and apiKey');
    }

    let url = `https://www.commcarehq.org/a/${projectSpace}/api/v0.5/form/?format=json&limit=5000`;
    if (formId) url += `&xmlns=${formId}`;

    const res = await fetch(url, {
      headers: { Authorization: `ApiKey ${apiKey}` },
    });

    if (!res.ok) throw new Error(`CommCare API error: ${res.status}`);

    const data = (await res.json()) as { objects?: Record<string, unknown>[] };
    const submissions: Record<string, unknown>[] = data.objects ?? [];

    return this.upsertSubmissions(
      submissions,
      integration,
      organizationId,
      submittedByUserId,
      'id',
    );
  }

  // ── CSV import ──────────────────────────────────────────────────────────────

  async importCsv(
    organizationId: string,
    id: string,
    rows: Record<string, unknown>[],
    submittedByUserId: string,
  ) {
    const integration = await this.findOne(organizationId, id) as ExternalIntegration & { _id: Types.ObjectId };
    const result = await this.upsertSubmissions(
      rows,
      integration,
      organizationId,
      submittedByUserId,
      '__csv_row_index',
    );
    await this.integrationModel.findByIdAndUpdate(id, {
      syncStatus: result.errors.length === 0 ? 'success' : 'error',
      lastSyncAt: new Date(),
      lastBatchCount: result.synced,
      $inc: { totalSynced: result.synced },
      lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : undefined,
    });
    return result;
  }

  // ── Webhook ingest ──────────────────────────────────────────────────────────

  async ingestWebhook(
    organizationId: string,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const integration = await this.findOne(organizationId, id) as ExternalIntegration & { _id: Types.ObjectId };
    const result = await this.upsertSubmissions(
      [payload],
      integration,
      organizationId,
      'webhook',
      '_webhook_id',
    );
    await this.integrationModel.findByIdAndUpdate(id, {
      lastSyncAt: new Date(),
      lastBatchCount: result.synced,
      $inc: { totalSynced: result.synced },
    });
    return result;
  }

  // ── Core upsert logic ───────────────────────────────────────────────────────

  private async upsertSubmissions(
    submissions: Record<string, unknown>[],
    integration: ExternalIntegration & { _id: Types.ObjectId },
    organizationId: string,
    submittedByUserId: string,
    externalIdKey: string,
  ) {
    const errors: string[] = [];
    let synced = 0;
    let skipped = 0;

    for (const [index, raw] of submissions.entries()) {
      try {
        const externalId = String(raw[externalIdKey] ?? `row_${index}`);

        // Check for duplicate via externalSubmissionId stored in answers
        const exists = await this.responseModel.findOne({
          'answers.__externalId': externalId,
          'answers.__integrationId': String(integration._id),
        });

        if (exists) { skipped++; continue; }

        // Apply field mapping
        const answers: Record<string, unknown> = {
          __externalId: externalId,
          __integrationId: String(integration._id),
          __platform: integration.platform,
        };

        const mapping = integration.fieldMapping as Record<string, string>;
        if (Object.keys(mapping).length > 0) {
          for (const [extKey, localKey] of Object.entries(mapping)) {
            if (raw[extKey] !== undefined) {
              answers[localKey] = raw[extKey];
            }
          }
        } else {
          // No mapping configured — import all fields as-is
          Object.assign(answers, raw);
        }

        const collectedAt = this.extractDate(raw) ?? new Date();

        await this.responseModel.create({
          organizationId: new Types.ObjectId(organizationId),
          projectId: integration.projectId,
          templateId: integration.templateId,
          indicatorId: integration.indicatorId
            ? new Types.ObjectId(integration.indicatorId)
            : undefined,
          activityId: integration.activityId
            ? new Types.ObjectId(integration.activityId)
            : undefined,
          submittedByUserId: submittedByUserId !== 'webhook'
            ? new Types.ObjectId(submittedByUserId)
            : undefined,
          collectedAt,
          answers,
          status: 'submitted',
        });

        synced++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${index + 1}: ${msg}`);
      }
    }

    return { synced, skipped, errors };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private extractDate(row: Record<string, unknown>): Date | null {
    const candidates = ['_submission_time', 'end', 'submissionDate', 'created_at', 'date'];
    for (const key of candidates) {
      if (row[key] && typeof row[key] === 'string') {
        const d = new Date(row[key] as string);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  async getStats(organizationId: string) {
    const integrations = await this.integrationModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .lean();

    const total = integrations.length;
    const active = integrations.filter(i => i.isActive).length;
    const totalSynced = integrations.reduce((s, i) => s + (i.totalSynced ?? 0), 0);
    const errors = integrations.filter(i => i.syncStatus === 'error').length;

    return { total, active, totalSynced, errors };
  }
}