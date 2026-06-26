import { IsOptional, IsString, MaxLength, IsArray } from 'class-validator';

export class CopilotMessageDto {
  @IsString()
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  /** Prior conversation turns so Claude can maintain context */
  @IsOptional()
  @IsArray()
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}