import {
  IsString, IsNumber, IsOptional, IsDateString, IsMongoId, IsArray,
  IsBoolean, IsEnum, Min, Max, Length, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MatchFundingDto {
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) requiredAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) securedAmount?: number;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateGrantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  donorId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Rate to the org base currency, captured at award time. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  exchangeRate?: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  linkedProjects?: string[];

  // ─── Award hierarchy ────────────────────────────────────────────────────────

  @IsOptional()
  @IsMongoId()
  parentGrantId?: string;

  @IsOptional()
  @IsString()
  subRecipientName?: string;

  @IsOptional()
  @IsMongoId()
  subRecipientPartnerId?: string;

  // ─── Financial classification ───────────────────────────────────────────────

  @IsOptional()
  @IsEnum(['restricted', 'unrestricted'])
  fundClassification?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  indirectCostRate?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MatchFundingDto)
  matchFunding?: MatchFundingDto;

  @IsOptional()
  @IsBoolean()
  requiresMonthlyReporting?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresFinalReport?: boolean;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsEnum(['pending', 'active', 'completed', 'closed'])
  status?: string;
}
