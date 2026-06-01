import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';

@Injectable()
export class TenantService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
  ) {}

  async findBySlug(slug: string) {
    const org = await this.orgModel.findOne({ slug }).lean();
    if (!org) {
      throw new NotFoundException('Tenant not found');
    }
    return org;
  }

  async findByDomain(domain: string) {
    const org = await this.orgModel.findOne({ domain }).lean();
    if (!org) {
      throw new NotFoundException('Tenant not found');
    }
    return org;
  }

  async findById(id: string) {
    const org = await this.orgModel.findById(id).lean();
    if (!org) {
      throw new NotFoundException('Tenant not found');
    }
    return org;
  }
}
