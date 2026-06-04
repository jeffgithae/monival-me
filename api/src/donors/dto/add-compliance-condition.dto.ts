import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class AddComplianceConditionDto {
  @IsString()
  @MinLength(5)
  description!: string;

  @IsOptional()
  @IsEnum(['pending','met','waived','overdue'])
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  metDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateComplianceConditionDto {
  @IsOptional()
  @IsEnum(['pending','met','waived','overdue'])
  status?: string;

  @IsOptional()
  @IsDateString()
  metDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}