import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { Donor } from './schemas/donor.schema';

@Injectable()
export class DonorsService {
  constructor(@InjectModel(Donor.name) private readonly donorModel: Model<Donor>) {}

  findAll(organizationId: string) {
    return this.donorModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ name: 1 })
      .lean();
  }

  async findOne(organizationId: string, id: string) {
    const donor = await this.donorModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!donor) {
      throw new NotFoundException('Donor not found');
    }
    return donor;
  }

  create(organizationId: string, dto: CreateDonorDto) {
    return this.donorModel.create({
      organizationId: new Types.ObjectId(organizationId),
      ...dto,
    });
  }

  async update(organizationId: string, id: string, dto: UpdateDonorDto) {
    const donor = await this.donorModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        dto,
        { new: true },
      )
      .lean();
    if (!donor) {
      throw new NotFoundException('Donor not found');
    }
    return donor;
  }

  async remove(organizationId: string, id: string) {
    const result = await this.donorModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Donor not found');
    }
    return { deleted: true };
  }
}
