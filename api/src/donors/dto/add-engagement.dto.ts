import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export enum EngagementType {
  CALL               = 'call',
  EMAIL              = 'email',
  MEETING            = 'meeting',
  SITE_VISIT         = 'site_visit',
  PROPOSAL_SUBMISSION = 'proposal_submission',
  REPORT_SUBMISSION  = 'report_submission',
  OTHER              = 'other',
}

export class AddEngagementDto {
  @IsEnum(EngagementType)
  type!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  summary!: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsMongoId()
  relatedGrantId?: string;
}