import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// Direct REST call — no SDK dependency, works with any key format
// Models with free tier: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash-lite
const GEMINI_MODEL    = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

type Backend = 'anthropic' | 'gemini' | 'none';

@Injectable()
export class AnthropicService implements OnModuleInit {
  private readonly logger = new Logger(AnthropicService.name);
  private backend: Backend = 'none';
  private anthropicClient!: Anthropic;
  private geminiKey = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const anthropicKey = (this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();
    const geminiKey    = (this.config.get<string>('GEMINI_API_KEY') ?? '').trim();

    if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.backend = 'anthropic';
      this.logger.log('Evidara Copilot: using Anthropic Claude.');
    } else if (geminiKey) {
      this.geminiKey = geminiKey;
      this.backend = 'gemini';
      this.logger.log(`Evidara Copilot: using Google Gemini (${GEMINI_MODEL}) via REST.`);
    } else {
      this.backend = 'none';
      this.logger.warn(
        'No AI key configured. Set GEMINI_API_KEY in Railway variables. ' +
        'Get a free key at https://aistudio.google.com',
      );
    }
  }

  async complete(systemPrompt: string, userPrompt: string, maxTokens = 2048): Promise<string> {
    this.assertConfigured();
    if (this.backend === 'gemini') {
      return this.geminiComplete(systemPrompt, userPrompt, maxTokens);
    }
    const response = await this.anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
    return block.text;
  }

  async chat(systemPrompt: string, messages: ClaudeMessage[], maxTokens = 2048): Promise<string> {
    this.assertConfigured();
    if (this.backend === 'gemini') {
      const history = messages.slice(0, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const lastMsg = messages[messages.length - 1]?.content ?? '';
      const combined = history ? `${history}\n\nUser: ${lastMsg}` : lastMsg;
      return this.geminiComplete(systemPrompt, combined, maxTokens);
    }
    const response = await this.anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
    return block.text;
  }

  // Direct REST call — bypasses SDK version issues entirely
  private async geminiComplete(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${this.geminiKey}`;

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message: string };
    };

    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  }

  private assertConfigured() {
    if (this.backend === 'none') {
      throw new Error(
        'AI Copilot is not configured. Set GEMINI_API_KEY in Railway variables. ' +
        'Get a free key at https://aistudio.google.com',
      );
    }
  }
}