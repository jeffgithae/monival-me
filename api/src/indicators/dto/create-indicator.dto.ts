import {
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateIndicatorDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @IsOptional()
  @IsIn(['goal', 'outcome', 'output', 'activity'])
  level?: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  meansOfVerification?: string;

  @IsOptional()
  @IsString()
  assumptions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disaggregation?: string[];

  @IsOptional()
  @IsNumber()
  baseline?: number;

  @IsNumber()
  target!: number;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'annual'])
  frequency?: string;
}
