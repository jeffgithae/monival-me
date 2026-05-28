import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';

@Controller('partners')
@UseGuards(JwtAuthGuard)
export class PartnersController {
  constructor(private readonly svc: PartnersService) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.list(req.user.organizationId);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreatePartnerDto) {
    return this.svc.create(req.user.organizationId, body);
  }
}
