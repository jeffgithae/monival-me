import { IsString, IsNumber, IsOptional, IsMongoId, IsEnum, Min } from 'class-validator';

export class CreateBudgetLineItemDto {
  @IsMongoId()
  budgetAllocationId!: string;

  @IsString()
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsMongoId()
  linkedActivity?: string;
}

export class UpdateBudgetLineItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  spent?: number;

  @IsOptional()
  @IsEnum(['planned', 'committed', 'spent', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
