import {
  IsArray, IsBoolean, IsIn, IsMongoId, IsNumber,
  IsOptional, IsString, MinLength,
} from 'class-validator';

export class CreateIndicatorDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional() @IsMongoId()
  parentId?: string;

  @IsOptional() @IsIn(['goal','outcome','output','activity'])
  level?: string;

  @IsString() @MinLength(1)
  code!: string;

  @IsString() @MinLength(2)
  title!: string;

  @IsOptional() @IsString() definition?: string;
  @IsOptional() @IsString() rationale?: string;
  @IsOptional() @IsString() unit?: string;

  @IsOptional() @IsIn(['number','percentage','yes_no','text','currency'])
  indicatorType?: string;

  @IsOptional() @IsIn(['increasing','decreasing','maintained'])
  direction?: string;

  @IsOptional() @IsBoolean() cumulative?: boolean;
  @IsOptional() @IsNumber()  baseline?: number;
  @IsOptional() @IsString()  baselineSource?: string;

  @IsNumber() target!: number;

  @IsOptional() @IsArray()
  annualTargets?: Array<{ year: number; target: number }>;

  @IsOptional() @IsIn(['monthly','quarterly','semiannual','annual'])
  frequency?: string;

  @IsOptional() @IsIn(['monthly','quarterly','semiannual','annual'])
  verificationFrequency?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  disaggregation?: string[];

  @IsOptional() @IsArray()
  disaggregationCategories?: Array<{ dimension: string; categories: string[] }>;

  @IsOptional() @IsIn(['n/a','0','1','2','3'])
  genderMarker?: string;

  @IsOptional() @IsBoolean() isGenderDisaggregated?: boolean;
  @IsOptional() @IsBoolean() isAgeDisaggregated?: boolean;

  @IsOptional() @IsString() dataSource?: string;
  @IsOptional() @IsString() dataCollectionMethod?: string;
  @IsOptional() @IsString() meansOfVerification?: string;
  @IsOptional() @IsString() dataCollectionTool?: string;
  @IsOptional() @IsString() reportingResponsibility?: string;
  @IsOptional() @IsString() responsiblePerson?: string;
  @IsOptional() @IsMongoId() responsibleUserId?: string;

  @IsOptional() @IsString() assumptions?: string;
  @IsOptional() @IsString() limitations?: string;
  @IsOptional() @IsString() precautionsForDataQuality?: string;

  @IsOptional() @IsBoolean() isCore?: boolean;
  @IsOptional() @IsBoolean() isStandardIndicator?: boolean;
  @IsOptional() @IsString()  standardIndicatorCode?: string;
  @IsOptional() @IsString()  standardFramework?: string;

  @IsOptional() @IsArray() @IsNumber({}, { each: true })
  sdgGoals?: number[];

  @IsOptional() @IsArray() @IsString({ each: true })
  sdgTargets?: string[];

  @IsOptional() @IsNumber() sortOrder?: number;
}