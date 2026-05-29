import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Partner } from './schemas/partner.schema';
import { CreatePartnerDto } from './dto/create-partner.dto';

@Injectable()
export class PartnersService {
  constructor(@InjectModel(Partner.name) private readonly partnerModel: Model<Partner>) {}

  list(organizationId: string) {
    return this.partnerModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ name: 1 }).lean();
  }

  create(organizationId: string, dto: CreatePartnerDto) {
    return this.partnerModel.create({
      organizationId: new Types.ObjectId(organizationId),
      ...dto,
      geoPoint:
        dto.latitude !== undefined && dto.longitude !== undefined
          ? { latitude: dto.latitude, longitude: dto.longitude }
          : undefined,
    });
  }
}
