import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewFormResponseDto {
  @IsEnum(['approved', 'rejected'])
  approvalStatus!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
