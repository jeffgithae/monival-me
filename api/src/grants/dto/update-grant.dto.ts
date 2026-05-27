import { IsString, IsNumber, IsOptional, IsDateString, IsMongoId, IsArray, IsBoolean, IsEnum, Min } from 'class-validator';

export class UpdateGrantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  donorId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountSpent?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  linkedProjects?: string[];

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
