import {
  IsString, IsNumber, IsOptional, IsEnum, IsBoolean,
  IsArray, IsDateString, IsMongoId, Min, Max, IsEmail,
  ValidateNested, IsPositive, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  BudgetCategory, BudgetStatus, LineItemStatus, RevisionReason,
} from '../schemas/budget.schema';

// ─── Alert Thresholds ─────────────────────────────────────────────────────────

export class AlertThresholdDto {
  @ApiProperty({ example: 75, description: 'Warn when spend % reaches this level' })
  @IsNumber() @Min(0) @Max(100)
  warningPercent?: number;

  @ApiProperty({ example: 90 })
  @IsNumber() @Min(0) @Max(100)
  criticalPercent?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  notifyFinance?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  notifyAdmin?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['cfo@org.org'] })
  @IsOptional() @IsArray() @IsEmail({}, { each: true })
  additionalEmails?: string[];
}

// ─── Create Budget Allocation ─────────────────────────────────────────────────

export class CreateBudgetAllocationDto {
  @ApiProperty({ example: 'USAID Year 2 Operations Budget' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Link to a project' })
  @IsOptional() @IsMongoId()
  projectId!: string;

  @ApiPropertyOptional({ description: 'Link to a grant (enables burn-rate vs grant tracking)' })
  @IsOptional() @IsMongoId()
  grantId!: string;

  @ApiPropertyOptional({ description: 'Donor who restricted this fund' })
  @IsOptional() @IsMongoId()
  donorId!: string;

  @ApiProperty({ example: 500000 })
  @IsNumber() @IsPositive()
  allocatedAmount!: number;

  @ApiPropertyOptional({ example: 'KES', description: 'ISO 4217 currency code' })
  @IsOptional() @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'Exchange rate to USD at time of budget creation' })
  @IsOptional() @IsNumber() @IsPositive()
  exchangeRateToUSD!: number;

  @ApiProperty({ enum: BudgetCategory })
  @IsEnum(BudgetCategory)
  category!: BudgetCategory;

  @ApiProperty({ example: 2026 })
  @IsNumber() @Min(2000) @Max(2100)
  fiscalYear!: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ type: [String], example: ['salaries', 'travel', 'supplies'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  allowedExpenseTypes!: string[];

  @ApiPropertyOptional({ default: false, description: 'True for donor-restricted funds' })
  @IsOptional() @IsBoolean()
  isRestricted!: boolean;

  @ApiPropertyOptional({ type: AlertThresholdDto })
  @IsOptional() @ValidateNested() @Type(() => AlertThresholdDto)
  alertThresholds!: AlertThresholdDto;
}

// ─── Update Budget Allocation ─────────────────────────────────────────────────

export class UpdateBudgetAllocationDto extends PartialType(CreateBudgetAllocationDto) {
  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  spentAmount?: number;

  @ApiPropertyOptional({ enum: BudgetStatus })
  @IsOptional() @IsEnum(BudgetStatus)
  status?: BudgetStatus;
}

// ─── Approve Budget ───────────────────────────────────────────────────────────

export class ApproveBudgetDto {
  @ApiProperty()
  @IsMongoId()
  approverUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// ─── Revise Budget ────────────────────────────────────────────────────────────

export class ReviseBudgetDto {
  @ApiProperty({ example: 550000, description: 'New total allocated amount after revision' })
  @IsNumber() @IsPositive()
  newAllocatedAmount!: number;

  @ApiProperty({ enum: RevisionReason })
  @IsEnum(RevisionReason)
  reason!: RevisionReason;

  @ApiPropertyOptional({ example: 'Donor amendment letter ref: DA-2026-003' })
  @IsOptional() @IsString()
  notes!: string;
}

// ─── Create Line Item ─────────────────────────────────────────────────────────

export class CreateLineItemDto {
  @ApiProperty()
  @IsMongoId()
  budgetAllocationId!: string;

  @ApiProperty({ example: 'Project Manager — 12 person-months' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'salaries', description: 'Must match allowedExpenseTypes on parent budget' })
  @IsString()
  costCategory!: string;

  @ApiProperty({ example: 'person-month' })
  @IsString()
  unitDescription!: string;

  @ApiProperty({ example: 12 })
  @IsNumber() @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 3000 })
  @IsNumber() @IsPositive()
  unitCost!: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes!: string;

  @ApiPropertyOptional({ description: 'Link this spend to an M&E activity' })
  @IsOptional() @IsMongoId()
  linkedActivityId!: string;

  @ApiPropertyOptional({ description: 'Link this spend to an indicator' })
  @IsOptional() @IsMongoId()
  linkedIndicatorId!: string;

  @ApiPropertyOptional({ description: 'Link to reporting period' })
  @IsOptional() @IsMongoId()
  reportingPeriodId!: string;

  @ApiPropertyOptional({ example: 'INV-2026-001' })
  @IsOptional() @IsString()
  invoiceReference!: string;

  @ApiPropertyOptional({ example: '2026-03-15' })
  @IsOptional() @IsDateString()
  paymentDate!: string;

  @ApiPropertyOptional({ description: 'USAID or donor cost categorisation' })
  @IsOptional() @IsString()
  donorCostCategory!: string;

  @ApiPropertyOptional({ type: [String], description: 'URLs to uploaded expense attachments' })
  @IsOptional() @IsArray() @IsString({ each: true })
  attachmentUrls!: string[];
}

// ─── Update Line Item ─────────────────────────────────────────────────────────

export class UpdateLineItemDto {
  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  spent?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  committed?: number;

  @ApiPropertyOptional({ enum: LineItemStatus })
  @IsOptional() @IsEnum(LineItemStatus)
  status?: LineItemStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  invoiceReference?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  attachmentUrls?: string[];
}

// ─── Calculate Variance ───────────────────────────────────────────────────────

export class CalculateVarianceDto {
  @ApiProperty({ example: '2026-01', description: 'YYYY-MM period string' })
  @IsString()
  period!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes!: string;
}

// ─── Query Filters ────────────────────────────────────────────────────────────

export class BudgetQueryDto {
  @ApiPropertyOptional({ enum: BudgetStatus })
  @IsOptional() @IsEnum(BudgetStatus)
  status?: BudgetStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Type(() => Number)
  fiscalYear?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsMongoId()
  grantId?: string;

  @ApiPropertyOptional({ enum: BudgetCategory })
  @IsOptional() @IsEnum(BudgetCategory)
  category?: BudgetCategory;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) @Max(100)
  limit?: number = 20;
}

export class VarianceQueryDto {
  @ApiPropertyOptional({ example: '2026-01' })
  @IsOptional() @IsString()
  fromPeriod?: string;

  @ApiPropertyOptional({ example: '2026-12' })
  @IsOptional() @IsString()
  toPeriod?: string;
}

export class BudgetSummaryQueryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Type(() => Number)
  fiscalYear?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsMongoId()
  grantId?: string;
}