import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class BootstrapOrgDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsIn(['trial', 'starter', 'professional', 'organization'])
  planId?: string;
}
