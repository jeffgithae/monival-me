import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEvent } from './schemas/audit-event.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEvent.name) private readonly auditModel: Model<AuditEvent>) {}

  /**
   * Record an audit event.
   *
   * `before`/`after`/`reason` are first-class arguments rather than something
   * each caller buries in `metadata` under its own key — the UI renders a
   * change diff from them, and it previously found nothing because the one
   * service that captured them nested them inside `metadata`.
   */
  record(data: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    /** State before the change. Rendered as the left side of the diff. */
    before?: unknown;
    /** State after the change. Rendered as the right side of the diff. */
    after?: unknown;
    /** Free-text justification (rejection reason, override note, …). */
    reason?: string;
    metadata?: Record<string, unknown> | unknown;
  }) {
    const meta: Record<string, unknown> =
      (data.metadata && typeof data.metadata === 'object' ? { ...(data.metadata as object) } : {}) as Record<string, unknown>;

    if (data.before !== undefined) meta.before = this.redact(data.before);
    if (data.after !== undefined) meta.after = this.redact(data.after);
    if (data.reason !== undefined) meta.reason = data.reason;

    return this.auditModel.create({
      organizationId: new Types.ObjectId(data.organizationId),
      actorUserId: data.actorUserId ? new Types.ObjectId(data.actorUserId) : undefined,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: meta,
    });
  }

  /**
   * Audit rows are long-lived and readable by admins, so never let a secret
   * ride along in a before/after snapshot.
   */
  private redact(value: unknown): unknown {
    const SENSITIVE = /password|secret|token|apiKey|clientSecret|accessToken|refreshToken/i;
    const walk = (v: unknown, depth = 0): unknown => {
      if (depth > 6 || v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE.test(k) ? '[redacted]' : walk(val, depth + 1);
      }
      return out;
    };
    return walk(value);
  }

  async list(
    organizationId: string,
    opts: {
      entityType?: string;
      entityId?: string;
      action?: string;
      userEmail?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (opts.entityType) filter.entityType = opts.entityType;
    if (opts.entityId) filter.entityId = opts.entityId;
    // Stored actions are snake_case like `create_project`; the UI filters send
    // a bare verb (CREATE, APPROVE, …) so match it as a case-insensitive prefix.
    if (opts.action) filter.action = new RegExp('^' + escape(opts.action), 'i');
    if (opts.userEmail) {
      const users = await this.auditModel.db
        .model('User')
        .find({ email: new RegExp(escape(opts.userEmail), 'i') }, { _id: 1 })
        .lean();
      filter.actorUserId = { $in: users.map((u) => u._id) };
    }

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));

    const [rows, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorUserId', 'email name')
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    const data = rows.map((e: any) => ({
      ...e,
      entity: e.entityType,
      userEmail: e.actorUserId?.email ?? '',
      actorUserId: e.actorUserId?._id ?? e.actorUserId,
      // Lifted out of `metadata` so the change-diff panel can read them —
      // the UI has always rendered `before`/`after`/`reason` at top level.
      before: e.metadata?.before,
      after: e.metadata?.after,
      reason: e.metadata?.reason,
    }));
    return { data, total };
  }
}
