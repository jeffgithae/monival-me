import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsEnum,
  IsIn, IsNumber, IsObject, IsOptional, IsString,
  Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HouseholdMemberDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsIn(['male','female','other']) sex?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(120) age?: number;
  @IsOptional() @IsBoolean() hasDisability?: boolean;
  @IsOptional() @IsString() disabilityType?: string;
}

export class ServiceRecordDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() activityId?: string;
  @IsString() serviceType!: string;
  @IsDateString() serviceDate!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() unit?: string;
}

export class ProgramEnrollmentDto {
  @IsString() projectId!: string;
  @IsOptional() @IsDateString() enrolledAt?: string;
  @IsOptional() @IsIn(['active','completed','transferred','dropped_out','deceased']) status?: string;
  @IsOptional() @IsString() exitReason?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateBeneficiaryDto {
  // Registration type
  @IsOptional() @IsIn(['individual','household','group','community'])
  registrationType?: string;

  // Identity
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() caseId?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsEmail() email?: string;

  // Demographics
  @IsOptional() @IsIn(['male','female','other','prefer_not_to_say']) sex?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(120) age?: number;
  @IsOptional() @IsIn(['child_under5','child_5_17','youth_18_24','adult_25_59','elderly_60plus'])
  ageGroup?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() ethnicity?: string;
  @IsOptional() @IsString() primaryLanguage?: string;
  @IsOptional() @IsString() education?: string;

  // Household
  @IsOptional() @IsNumber() @Min(1) householdSize?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => HouseholdMemberDto)
  householdMembers?: HouseholdMemberDto[];
  @IsOptional() @IsNumber() @Min(0) childrenUnder5?: number;
  @IsOptional() @IsNumber() @Min(0) childrenUnder18?: number;

  // Vulnerability
  @IsOptional() @IsBoolean() hasDisability?: boolean;
  @IsOptional() @IsString() disabilityType?: string;
  @IsOptional() @IsBoolean() isIdp?: boolean;
  @IsOptional() @IsBoolean() isRefugee?: boolean;
  @IsOptional() @IsBoolean() isFemaleHeadedHousehold?: boolean;
  @IsOptional() @IsBoolean() isOrphan?: boolean;
  @IsOptional() @IsBoolean() isChronicallyIll?: boolean;
  @IsOptional() @IsBoolean() isElderly?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) vulnerabilityCategories?: string[];
  @IsOptional() @IsNumber() @Min(0) @Max(100) vulnerabilityScore?: number;

  // Location
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() settlementType?: string;

  // Program enrollment
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProgramEnrollmentDto)
  programEnrollments?: ProgramEnrollmentDto[];

  // Status
  @IsOptional() @IsIn(['active','inactive','closed','transferred','deceased']) status?: string;
  @IsOptional() @IsString() groupType?: string;
  @IsOptional() @IsNumber() @Min(1) groupSize?: number;
  @IsOptional() @IsString() caseWorker?: string;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsDateString() registrationDate?: string;

  // Consent
  @IsOptional() @IsBoolean() consentGiven?: boolean;
  @IsOptional() @IsDateString() consentDate?: string;
  @IsOptional() @IsIn(['written','verbal','digital']) consentMethod?: string;

  // Misc
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}