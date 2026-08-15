import {
  IsArray, IsDateString, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';

/**
 * DTOs for the project sub-document endpoints (risks, milestones, workplan
 * items, stakeholders).
 *
 * These endpoints previously took `@Body() dto: any`, so the global
 * ValidationPipe had no schema to check and accepted arbitrary payloads —
 * unvalidated dates, out-of-range percentages, and any extra key the caller
 * chose to send, written straight into the project document.
 */

export class ProjectRiskDto {
  @IsString() title!: string;

  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsEnum(['low', 'medium', 'high', 'critical']) likelihood?: string;
  @IsOptional() @IsEnum(['low', 'medium', 'high', 'critical']) impact?: string;

  @IsOptional() @IsString() mitigationPlan?: string;
  @IsOptional() @IsString() contingencyPlan?: string;

  @IsOptional() @IsEnum(['open', 'mitigated', 'accepted', 'closed']) status?: string;

  /** Who owns the mitigation. Settable now that the body is typed. */
  @IsOptional() @IsMongoId() ownerId?: string;
  @IsOptional() @IsString() ownerName?: string;

  @IsOptional() @IsDateString() reviewDate?: string;
  @IsOptional() @IsDateString() closedDate?: string;
  @IsOptional() @IsString() closureNotes?: string;
}

export class ProjectMilestoneDto {
  @IsString() title!: string;

  @IsOptional() @IsString() description?: string;

  @IsDateString() dueDate!: string;

  @IsOptional()
  @IsEnum(['not_started', 'in_progress', 'completed', 'overdue', 'cancelled'])
  status?: string;

  @IsOptional() @IsDateString() completedDate?: string;

  @IsOptional() @IsMongoId() ownerId?: string;
  @IsOptional() @IsString() ownerName?: string;

  @IsOptional() @IsArray() @IsMongoId({ each: true }) linkedIndicatorIds?: string[];

  @IsOptional() @IsNumber() @Min(0) @Max(100) progressPct?: number;

  @IsOptional() @IsString() completionNotes?: string;
}

export class ProjectWorkplanItemDto {
  @IsString() title!: string;

  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;

  @IsOptional() @IsString() status?: string;

  @IsOptional() @IsMongoId() responsibleUserId?: string;
  @IsOptional() @IsString() responsibleName?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(100) progressPct?: number;

  @IsOptional() @IsMongoId() indicatorId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ProjectStakeholderDto {
  @IsString() name!: string;

  @IsOptional() @IsString() organisation?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;

  @IsOptional() @IsEnum(['low', 'medium', 'high']) influence?: string;
  @IsOptional() @IsEnum(['low', 'medium', 'high']) interest?: string;

  @IsOptional() @IsString() engagementStrategy?: string;
  @IsOptional() @IsString() notes?: string;
}
