import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { CreateGrantDto } from './create-grant.dto';

/**
 * Every creatable field is patchable. Note that changing `amount` or
 * `endDate` here bypasses the amendment history — prefer
 * `POST /grants/:id/amendments`, which records what the values were and why
 * they changed. Direct patching is retained for corrections and for clients
 * predating the amendment endpoint.
 */
export class UpdateGrantDto extends PartialType(CreateGrantDto) {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountSpent?: number;
}
