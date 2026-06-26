import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const EVIDARA_MODEL = 'claude-sonnet-4-6';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AnthropicService implements OnModuleInit {
  private readonly logger = new Logger(AnthropicService.name);
  private client!: Anthropic;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set — AI features will be unavailable.');
    }
    this.client = new Anthropic({ apiKey: apiKey ?? 'missing' });
  }

  /**
   * Single-turn completion. Returns the assistant text.
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: EVIDARA_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response block type from Claude');
    return block.text;
  }

  /**
   * Multi-turn conversation. Pass the full history each time.
   */
  async chat(
    systemPrompt: string,
    messages: ClaudeMessage[],
    maxTokens = 2048,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: EVIDARA_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response block type from Claude');
    return block.text;
  }
}