import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Beneficiary } from './schemas/beneficiary.schema';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(@InjectModel(Beneficiary.name) private readonly beneficiaryModel: Model<Beneficiary>) {}

  list(organizationId: string) {
    return this.beneficiaryModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ name: 1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const beneficiary = await this.beneficiaryModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!beneficiary) {
      throw new NotFoundException('Beneficiary not found');
    }
    return beneficiary;
  }

  create(organizationId: string, dto: CreateBeneficiaryDto) {
    return this.beneficiaryModel.create({ organizationId: new Types.ObjectId(organizationId), ...dto });
  }

  async update(organizationId: string, id: string, dto: UpdateBeneficiaryDto) {
    const updateData: Record<string, unknown> = {
      ...dto,
    };
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

    const beneficiary = await this.beneficiaryModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        updateData,
        { new: true },
      )
      .lean();

    if (!beneficiary) {
      throw new NotFoundException('Beneficiary not found');
    }

    return beneficiary;
  }

  async remove(organizationId: string, id: string) {
    const result = await this.beneficiaryModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Beneficiary not found');
    }

    return { deleted: true };
  }
}
