import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// Groq free tier — https://console.groq.com (free, no card, instant key)
const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';

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

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const anthropicKey = (this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();
    const groqKey      = (this.config.get<string>('GROQ_API_KEY') ?? '').trim();

    if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.backend = 'anthropic';
      this.logger.log('Evidara Copilot: using Anthropic Claude.');
    } else if (groqKey) {
      this.groqKey = groqKey;
      this.backend = 'groq';
      this.logger.log(`Evidara Copilot: using Groq (${GROQ_MODEL}) — free tier.`);
    } else {
      this.backend = 'none';
      this.logger.warn(
        'No AI key configured. Set GROQ_API_KEY in Railway variables. ' +
        'Get a free key at https://console.groq.com',
      );
    }
  }

  async complete(systemPrompt: string, userPrompt: string, maxTokens = 2048): Promise<string> {
    this.assertConfigured();
    if (this.backend === 'groq') {
      return this.groqComplete(systemPrompt, [{ role: 'user', content: userPrompt }], maxTokens);
    }
    const response = await this.anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');
    return block.text;
  }

  async chat(systemPrompt: string, messages: ClaudeMessage[], maxTokens = 2048): Promise<string> {
    this.assertConfigured();
    if (this.backend === 'groq') {
      return this.groqComplete(systemPrompt, messages, maxTokens);
    }
    const response = await this.anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');
    return block.text;
  }

  private async groqComplete(systemPrompt: string, messages: ClaudeMessage[], maxTokens: number): Promise<string> {
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
      error?: { message: string };
    };

    if (data.error) throw new Error(`Groq error: ${data.error.message}`);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from Groq');
    return text;
  }

  private assertConfigured() {
    if (this.backend === 'none') {
      throw new Error(
        'AI Copilot is not configured. Set GROQ_API_KEY in Railway variables. ' +
        'Get a free key at https://console.groq.com',
      );
    }
  }
}