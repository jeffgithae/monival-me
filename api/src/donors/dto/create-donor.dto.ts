import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn,
  IsInt, IsMongoId, IsOptional, IsString, Max, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DonorType {
  BILATERAL    = 'bilateral',
  MULTILATERAL = 'multilateral',
  FOUNDATION   = 'foundation',
  CORPORATE    = 'corporate',
  INDIVIDUAL   = 'individual',
  GOVERNMENT   = 'government',
  OTHER        = 'other',
}

export enum DonorStatus {
  PROSPECT = 'prospect',
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
  FORMER   = 'former',
}

export class DonorAddressDto {
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
}

export class DonorContactDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEmail()  email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateDonorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional() @IsString()          shortName?: string;
  @IsOptional() @IsEnum(DonorType)   type?: string;
  @IsOptional() @IsEnum(DonorStatus) status?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DonorAddressDto)
  address?: DonorAddressDto;

  // Legacy flat contact fields
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail()  contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;

  // Rich contacts list
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DonorContactDto)
  contacts?: DonorContactDto[];

  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;

  // Reporting requirements
  @IsOptional() @IsString() preferredReportingFormat?: string;
  @IsOptional() @IsBoolean() requiresDisaggregation?: boolean;
  @IsOptional() @IsIn(['monthly','quarterly','semiannual','annual']) reportingCadence?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredDisaggregationDimensions?: string[];

  // Financial
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) fiscalYearEnd?: number;

  // Agreement
  @IsOptional() @IsDateString() signedAgreementDate?: string;
  @IsOptional() @IsString() agreementReferenceNumber?: string;

  // Tags
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}