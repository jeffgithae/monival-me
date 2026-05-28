import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsMongoId,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class FormQuestionDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'boolean'])
  type!: string;

  @IsOptional()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  repeatGroup?: boolean;
}

class FormSectionDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormQuestionDto)
  questions!: FormQuestionDto[];

  @IsOptional()
  @IsBoolean()
  repeatGroup?: boolean;
}

export class CreateFormTemplateDto {
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsMongoId()
  indicatorId?: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSectionDto)
  sections!: FormSectionDto[];
}
