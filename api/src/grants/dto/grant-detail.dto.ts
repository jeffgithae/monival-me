import {
  IsDateString, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Length, Min,
} from 'class-validator';
import { AMENDMENT_TYPES, REPORT_STATUSES, REPORT_TYPES } from '../schemas/grant.schema';

const DISBURSEMENT_STATUSES = ['scheduled', 'received', 'delayed', 'cancelled'] as const;

export class AddDisbursementDto {
  @IsDateString()
  plannedDate!: string;

  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsEnum(DISBURSEMENT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDisbursementDto {
  @IsOptional() @IsDateString() plannedDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsEnum(DISBURSEMENT_STATUSES) status?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class AddReportingObligationDto {
  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsEnum(REPORT_TYPES)
  type?: string;

  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: string;

  @IsOptional()
  @IsMongoId()
  reportingPeriodId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReportingObligationDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(REPORT_TYPES) type?: string;
  @IsOptional() @IsEnum(REPORT_STATUSES) status?: string;
  @IsOptional() @IsDateString() submittedDate?: string;
  @IsOptional() @IsMongoId() reportingPeriodId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RecordAmendmentDto {
  @IsDateString()
  effectiveDate!: string;

  @IsEnum(AMENDMENT_TYPES)
  type!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  newAmount?: number;

  @IsOptional()
  @IsDateString()
  newEndDate?: string;

  @IsOptional()
  @IsString()
  donorReference?: string;
}

export class UpdateSpendingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountSpent!: number;
}
