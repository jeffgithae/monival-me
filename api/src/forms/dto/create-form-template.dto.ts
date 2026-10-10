import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class FormQuestionValidationDto {
  @IsOptional() @IsNumber() min?: number;
  @IsOptional() @IsNumber() max?: number;
  @IsOptional() @IsString() pattern?: string;
  @IsOptional() @IsString() patternMessage?: string;
}

class FormQuestionConditionalDto {
  @IsOptional() @IsString() dependsOn?: string;
  @IsOptional() @IsIn(['equals', 'not_equals', 'in', 'not_in']) operator?: string;
  @IsOptional() value?: unknown;
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => FormQuestionValidationDto)
  validation?: FormQuestionValidationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormQuestionConditionalDto)
  conditional?: FormQuestionConditionalDto;
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

  /**
   * Key of the numeric question whose answer contributes to `indicatorId`.
   * Without it an approved response has no defined quantity to contribute.
   */
  @IsOptional()
  @IsString()
  indicatorValueKey?: string;

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
