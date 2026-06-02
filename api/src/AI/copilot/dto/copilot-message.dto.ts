import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CopilotMessageDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
