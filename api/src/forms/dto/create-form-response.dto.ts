import { IsArray, IsBoolean, IsMongoId, IsNotEmpty, IsObject, IsOptional, IsString, IsIn } from 'class-validator';

export class CreateFormResponseDto {
  @IsMongoId()
  projectId!: string;

  @IsMongoId()
  templateId!: string;

  @IsOptional()
  @IsMongoId()
  indicatorId?: string;

  @IsOptional()
  @IsMongoId()
  activityId?: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['draft', 'submitted'])
  status?: string;
}
