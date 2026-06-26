import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL    = 'gemini-1.5-flash-8b';

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
  private geminiClient!: GoogleGenerativeAI;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const anthropicKey = (this.config.get<string>('ANTHROPIC_API_KEY') ?? '').trim();
    const geminiKey    = (this.config.get<string>('GEMINI_API_KEY') ?? '').trim();

    if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.backend = 'anthropic';
      this.logger.log('Evidara Copilot: using Anthropic Claude.');
    } else if (geminiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiKey);
      this.backend = 'gemini';
      this.logger.log('Evidara Copilot: using Google Gemini (free tier).');
    } else {
      this.backend = 'none';
      this.logger.warn(
        'No AI key configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in Railway variables. ' +
        'Get a free Gemini key at https://aistudio.google.com',
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
      return this.geminiComplete(systemPrompt, history ? `${history}\n\nUser: ${lastMsg}` : lastMsg, maxTokens);
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

  private async geminiComplete(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    const model = this.geminiClient.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: maxTokens },
    });
    const result = await model.generateContent(userPrompt);
    return result.response.text();
  }

  private assertConfigured() {
    if (this.backend === 'none') {
      throw new Error(
        'AI Copilot is not configured. Please set GEMINI_API_KEY in Railway environment variables. ' +
        'Get a free key at https://aistudio.google.com',
      );
    }
  }
}