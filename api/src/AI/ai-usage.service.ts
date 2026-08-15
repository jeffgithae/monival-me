import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { getPlan } from '../common/constants/plans';
import { Organization } from '../organizations/schemas/organization.schema';
import { AiUsage } from './schemas/ai-usage.schema';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Per-organisation accounting and budget enforcement for the AI Copilot.
 *
 * The Copilot is the one feature whose cost of goods scales with usage rather
 * than with seats, so it needs both a hard monthly ceiling (enforced before the
 * provider call) and a usage record (written after it) — the latter is what
 * makes the feature priceable.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsage.name) private readonly usageModel: Model<AiUsage>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  /** Billing period key for a date — `YYYY-MM` in UTC. */
  static periodFor(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Throws if the organisation has already spent its monthly token budget.
   * Called before every provider request.
   */
  async assertWithinBudget(organizationId: string): Promise<void> {
    const { used, limit } = await this.currentUsage(organizationId);
    if (limit !== null && used >= limit) {
      throw new ForbiddenException(
        `Your organisation has used its AI Copilot allowance for this month ` +
          `(${used.toLocaleString()} of ${limit.toLocaleString()} tokens). ` +
          `The allowance resets at the start of next month, or you can upgrade your plan for a larger one.`,
      );
    }
  }

  /** Records the tokens a completion consumed. Never throws — accounting must not fail a served request. */
  async record(
    organizationId: string,
    feature: string,
    usage: TokenUsage,
  ): Promise<void> {
    try {
      await this.usageModel.updateOne(
        {
          organizationId: new Types.ObjectId(organizationId),
          period: AiUsageService.periodFor(),
        },
        {
          $inc: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            requests: 1,
            [`requestsByFeature.${feature}`]: 1,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      this.logger.error(
        `Failed to record AI usage for org ${organizationId}: ${(err as Error).message}`,
      );
    }
  }

  /** Current period's consumption and the plan's ceiling. `limit: null` means uncapped. */
  async currentUsage(organizationId: string): Promise<{
    period: string;
    used: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    limit: number | null;
    remaining: number | null;
  }> {
    const period = AiUsageService.periodFor();
    const [org, usage] = await Promise.all([
      this.orgModel.findById(organizationId).select('planId').lean(),
      this.usageModel
        .findOne({ organizationId: new Types.ObjectId(organizationId), period })
        .lean(),
    ]);

    const limit = getPlan(org?.planId).maxAiTokensPerMonth;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const used = inputTokens + outputTokens;

    return {
      period,
      used,
      inputTokens,
      outputTokens,
      requests: usage?.requests ?? 0,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
    };
  }
}
