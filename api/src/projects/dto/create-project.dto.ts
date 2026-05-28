import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  donor?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['active', 'completed', 'paused'])
  status?: string;

  @IsOptional()
  @IsIn(['not_started', 'in_progress', 'completed'])
  evaluationStatus?: string;

  @IsOptional()
  @IsString()
  evaluationSummary?: string;

  @IsOptional()
  @IsString()
  lessonsLearned?: string;

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;
}
