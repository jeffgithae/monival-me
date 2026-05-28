import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Controller('beneficiaries')
@UseGuards(JwtAuthGuard)
export class BeneficiariesController {
  constructor(private readonly svc: BeneficiariesService) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.list(req.user.organizationId);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateBeneficiaryDto) {
    return this.svc.create(req.user.organizationId, body);
  }
}
