import { IsObject, IsString, Length } from 'class-validator';

export class SetManualRatesDto {
  @IsString()
  @Length(3, 3)
  baseCurrency!: string;

  /** { "KES": 129.4, "EUR": 0.92 } — units of quote per 1 base. */
  @IsObject()
  rates!: Record<string, number>;
}
