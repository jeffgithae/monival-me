import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiUsageService } from './ai-usage.service';

/**
 * Override with ANTHROPIC_MODEL to pin a different generation. Claude Opus 5 is
 * the current generation; `claude-sonnet-4-6` is the cheaper previous-generation
 * Sonnet if cost per call matters more than answer quality here.
 */
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

// Groq free tier — https://console.groq.com (free, no card, instant key)
const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';

/** Who the completion is for, and which route asked for it. */
export interface AiCallContext {
  organizationId: string;
  /** Route identifier used for the per-feature usage breakdown, e.g. `copilot.message`. */
  feature: string;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

type Backend = 'anthropic' | 'groq' | 'none';

@Injectable()
export class AnthropicService implements OnModuleInit {
  private readonly logger = new Logger(AnthropicService.name);
  private backend: Backend = 'none';
  private anthropicClient!: Anthropic;
  private groqKey = '';
  private anthropicModel = DEFAULT_ANTHROPIC_MODEL;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: AiUsageService,
  ) {}

  onModuleInit() {
    const anthropicKey = (this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();
    const groqKey      = (this.config.get<string>('GROQ_API_KEY') ?? '').trim();

    if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.anthropicModel = (this.config.get<string>('ANTHROPIC_MODEL') ?? '').trim()
        || DEFAULT_ANTHROPIC_MODEL;
      this.backend = 'anthropic';
      this.logger.log(`Evidara Copilot: using Anthropic Claude (${this.anthropicModel}).`);
    } else if (groqKey) {
      this.groqKey = groqKey;
      this.backend = 'groq';
      this.logger.log(`Evidara Copilot: using Groq (${GROQ_MODEL}) — free tier.`);
    } else {
      this.backend = 'none';
      this.logger.warn(
        'No AI key configured — the Copilot endpoints will return 503. ' +
        'Set ANTHROPIC_API_KEY (preferred) or GROQ_API_KEY in the API environment: ' +
        'api/.env for local development, or your host\'s environment variables in production.',
      );
    }
  }

  /**
   * `ctx` is required rather than optional so a new call site cannot silently
   * bypass the per-organisation budget check or the usage accounting.
   */
  async complete(
    ctx: AiCallContext,
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    return this.chat(ctx, systemPrompt, [{ role: 'user', content: userPrompt }], maxTokens);
  }

  async chat(
    ctx: AiCallContext,
    systemPrompt: string,
    messages: ClaudeMessage[],
    maxTokens = 2048,
  ): Promise<string> {
    this.assertConfigured();
    await this.usage.assertWithinBudget(ctx.organizationId);

    if (this.backend === 'groq') {
      return this.groqComplete(ctx, systemPrompt, messages, maxTokens);
    }

    const response = await this.anthropicClient.messages.create({
      model: this.anthropicModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    await this.usage.record(ctx.organizationId, ctx.feature, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');
    return block.text;
  }

  private async groqComplete(
    ctx: AiCallContext,
    systemPrompt: string,
    messages: ClaudeMessage[],
    maxTokens: number,
  ): Promise<string> {
    const res = await fetch(GROQ_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message: string };
    };

    if (data.error) throw new Error(`Groq error: ${data.error.message}`);

    await this.usage.record(ctx.organizationId, ctx.feature, {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    });
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from Groq');
    return text;
  }

  private assertConfigured() {
    if (this.backend === 'none') {
      throw new ServiceUnavailableException(
        'AI Copilot is not configured on this server. An administrator needs to set ' +
        'ANTHROPIC_API_KEY or GROQ_API_KEY in the API environment.',
      );
    }
  }
}