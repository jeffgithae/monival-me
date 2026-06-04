import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateActivityDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional() @IsMongoId()
  indicatorId?: string;

  @IsOptional() @IsMongoId()
  partnerId?: string;

  @IsOptional() @IsMongoId()
  grantId?: string;

  @IsOptional() @IsMongoId()
  templateId?: string;

  @IsOptional() @IsArray() @IsMongoId({ each: true })
  beneficiaryIds?: string[];

  @IsString() @MinLength(2)
  title!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsDateString()
  activityDate!: string;

  @IsOptional() @IsString()
  activityType?: string;

  // Location
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() site?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;

  // Participants — total and disaggregated breakdown
  @IsOptional() @IsNumber() participants?: number;
  @IsOptional() @IsNumber() participantsMale?: number;
  @IsOptional() @IsNumber() participantsFemale?: number;
  @IsOptional() @IsNumber() participantsOther?: number;
  @IsOptional() @IsNumber() participantsUnder18?: number;
  @IsOptional() @IsNumber() participantsOver60?: number;
  @IsOptional() @IsNumber() participantsPwd?: number;
  @IsOptional() @IsNumber() participantsIdp?: number;
  @IsOptional() @IsNumber() participantsRefugee?: number;

  // Quantitative output
  @IsOptional() @IsNumber() quantity?: number;

  // Disaggregation (key-value pairs for indicator-level breakdown)
  @IsOptional() @IsArray()
  disaggregationData?: Array<{ dimension: string; category: string; value: number }>;

  // Cost / budget
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsString() costCurrency?: string;
  @IsOptional() @IsString() budgetLine?: string;

  // Evidence
  @IsOptional() @IsString() evidenceUrl?: string;
  @IsOptional() @IsString() evidenceNotes?: string;
  @IsOptional() @IsBoolean() hasPhotoEvidence?: boolean;
  @IsOptional() @IsBoolean() hasSignatureSheet?: boolean;

  // Narrative fields
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() challenges?: string;
  @IsOptional() @IsString() recommendations?: string;
  @IsOptional() @IsString() followUpActions?: string;

  @IsOptional() @IsIn(['draft', 'submitted'])
  status?: 'draft' | 'submitted';
}