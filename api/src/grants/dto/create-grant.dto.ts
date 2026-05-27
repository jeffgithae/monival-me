import { IsString, IsNumber, IsOptional, IsDateString, IsMongoId, IsArray, IsBoolean, IsEnum, Min } from 'class-validator';

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
  currency?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

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
