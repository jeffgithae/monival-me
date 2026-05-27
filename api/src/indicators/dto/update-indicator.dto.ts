import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateIndicatorDto } from './create-indicator.dto';

export class UpdateIndicatorDto extends PartialType(
  OmitType(CreateIndicatorDto, ['projectId'] as const),
) {}
