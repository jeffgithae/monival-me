import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class DraftReportDto {
  @IsString()
  reportingPeriodId!: string;

  @IsOptional()
  @IsIn(['narrative', 'bullet', 'executive'])
  style?: 'narrative' | 'bullet' | 'executive';

  @IsOptional()
  @IsBoolean()
  includeFinancials?: boolean;

  @IsOptional()
  @IsBoolean()
  includeFeedback?: boolean;
}