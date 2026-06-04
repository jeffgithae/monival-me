import {
  IsArray, IsBoolean, IsDateString, IsIn, IsMongoId,
  IsNumber, IsOptional, IsString, Min, MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(2) name!: string;

  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) objectives?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @IsOptional() @IsIn([
    'health','education','wash','food_security','livelihoods','protection',
    'shelter','nutrition','gender','environment','governance','peacebuilding',
    'drr','economic_development','social_cohesion','mental_health',
    'refugee_response','other',
  ]) sector?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) subSectors?: string[];

  // Phase & lifecycle
  @IsOptional() @IsIn(['pipeline','design','active','completed','paused','cancelled','archived']) status?: string;
  @IsOptional() @IsIn(['inception','implementation','scale_up','closeout','completed']) projectPhase?: string;
  @IsOptional() @IsIn(['not_started','in_progress','completed','under_review']) evaluationStatus?: string;
  @IsOptional() @IsString() evaluationSummary?: string;
  @IsOptional() @IsString() lessonsLearned?: string;
  @IsOptional() @IsString() archiveNotes?: string;

  // Theory of change
  @IsOptional() @IsString() theoreticalApproach?: string;
  @IsOptional() @IsString() problemStatement?: string;
  @IsOptional() @IsString() changeHypothesis?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keyAssumptions?: string[];

  // Funding
  @IsOptional() @IsString() donor?: string;
  @IsOptional() @IsMongoId() donorId?: string;
  @IsOptional() @IsString() grantReference?: string;
  @IsOptional() @IsNumber() @Min(0) totalBudget?: number;
  @IsOptional() @IsString() currency?: string;

  // Timeline
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() closureDate?: string;
  @IsOptional() @IsDateString() nextReviewDate?: string;
  @IsOptional() @IsNumber() @Min(0) extensionMonths?: number;

  // Geography
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) implementationAreas?: string[];
  @IsOptional() @IsString() coverageArea?: string;

  // Beneficiaries
  @IsOptional() @IsNumber() @Min(0) targetBeneficiaryCount?: number;
  @IsOptional() @IsNumber() @Min(0) targetDirectBeneficiaries?: number;
  @IsOptional() @IsNumber() @Min(0) targetIndirectBeneficiaries?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) targetGroups?: string[];
  @IsOptional() @IsString() populationServed?: string;

  // Partnerships
  @IsOptional() @IsArray() @IsString({ each: true }) implementationPartners?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) partnerIds?: string[];

  // Team
  @IsOptional() @IsMongoId() projectManagerId?: string;
  @IsOptional() @IsString() projectManagerName?: string;
  @IsOptional() @IsMongoId() meOfficerId?: string;
  @IsOptional() @IsString() meOfficerName?: string;

  // SDG & frameworks
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) sdgGoals?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) frameworks?: string[];

  // Reporting settings
  @IsOptional() @IsIn(['monthly','quarterly','semiannual','annual']) reportingFrequency?: string;
  @IsOptional() @IsString() reportingNotes?: string;
  @IsOptional() @IsBoolean() requiresEvidencePerActivity?: boolean;
  @IsOptional() @IsBoolean() requiresDisaggregation?: boolean;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
}