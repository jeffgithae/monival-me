import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested, IsMongoId, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowEntityType } from '../schemas/workflow.schema';

export class WorkflowStepDto {
  @ApiProperty({ description: '1-based step order', example: 1 })
  @IsNumber()
  @Min(1)
  order!: number;

  @ApiProperty({ example: 'Supervisor Review' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'OrgRole that can approve', example: 'me_officer' })
  @IsString()
  approverRole!: string;

  @ApiPropertyOptional({ description: 'Specific user override (bypasses role)' })
  @IsOptional()
  @IsMongoId()
  approverUserId?: string;

  @ApiPropertyOptional({ default: 72 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  escalateAfterHours?: number;

  @ApiPropertyOptional({ description: 'User to escalate to when SLA breached' })
  @IsOptional()
  @IsMongoId()
  escalateTo?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresComment?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ example: 'Activity Approval Workflow' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: WorkflowEntityType })
  @IsEnum(WorkflowEntityType)
  entityType!: WorkflowEntityType;

  @ApiProperty({ type: [WorkflowStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateWorkflowDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [WorkflowStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StartWorkflowDto {
  @ApiProperty({ description: 'ID of the WorkflowDefinition to use' })
  @IsMongoId()
  definitionId!: string;

  @ApiProperty({ enum: WorkflowEntityType })
  @IsEnum(WorkflowEntityType)
  entityType!: WorkflowEntityType;

  @ApiProperty({ description: 'MongoDB ID of the entity being submitted' })
  @IsMongoId()
  entityId!: string;

  @ApiProperty({ description: 'Human-readable title for notifications' })
  @IsString()
  entityTitle!: string;
}

export class ActOnWorkflowDto {
  @ApiProperty({ enum: ['approve', 'reject', 'escalate', 'recall', 'comment'] })
  @IsEnum(['approve', 'reject', 'escalate', 'recall', 'comment'])
  action!: string;

  @ApiPropertyOptional({ description: 'Required if action=reject or requiresComment=true' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'User to escalate to (for action=escalate)' })
  @IsOptional()
  @IsMongoId()
  escalateToUserId?: string;
}

export class WorkflowQueryDto {
  @ApiPropertyOptional({ enum: WorkflowEntityType })
  @IsOptional()
  @IsEnum(WorkflowEntityType)
  entityType?: WorkflowEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToMe?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}