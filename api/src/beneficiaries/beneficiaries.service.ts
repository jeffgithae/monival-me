import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Beneficiary } from './schemas/beneficiary.schema';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(@InjectModel(Beneficiary.name) private readonly beneficiaryModel: Model<Beneficiary>) {}

  list(organizationId: string) {
    return this.beneficiaryModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ name: 1 }).lean();
  }

  create(organizationId: string, dto: CreateBeneficiaryDto) {
    return this.beneficiaryModel.create({ organizationId: new Types.ObjectId(organizationId), ...dto });
  }
}
