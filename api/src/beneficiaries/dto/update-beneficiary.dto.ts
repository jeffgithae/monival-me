import {
  IsArray, IsBoolean, IsDateString, IsIn, IsNumber,
  IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HouseholdMemberDto } from './create-beneficiary.dto';

export class UpdateBeneficiaryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsIn(['individual','household','group','community']) registrationType?: string;

  // Identity
  @IsOptional() @IsString() caseId?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() phoneNumber?: string;

  // Demographics
  @IsOptional() @IsIn(['male','female','other','prefer_not_to_say']) sex?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(120) age?: number;
  @IsOptional() @IsIn(['child_under5','child_5_17','youth_18_24','adult_25_59','elderly_60plus']) ageGroup?: string;
  @IsOptional() @IsString() nationality?: string;
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
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}