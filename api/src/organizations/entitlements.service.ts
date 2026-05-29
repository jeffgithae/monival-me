import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { getPlan } from '../common/constants/plans';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Organization } from './schemas/organization.schema';

@Injectable()
export class EntitlementsService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
  ) {}

  async assertCanAddProject(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).lean();
    if (!org) {
      throw new ForbiddenException('Organisation not found');
    }
    const plan = getPlan(org.planId);
    const count = await this.projectModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
    });
    if (plan.maxProjects !== null && count >= plan.maxProjects) {
      throw new ForbiddenException(
        `Project limit reached (${plan.maxProjects}). Upgrade your plan in Billing.`,
      );
    }
  }

  async assertCanAddMember(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).lean();
    if (!org) {
      throw new ForbiddenException('Organisation not found');
    }
    const plan = getPlan(org.planId);
    const count = await this.memberModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      status: { $in: ['active', 'invited'] },
    });
    if (plan.maxUsers !== null && count >= plan.maxUsers) {
      throw new ForbiddenException(
        `User limit reached (${plan.maxUsers}). Upgrade your plan in Billing.`,
      );
    }
  }

  async assertCanAddIndicator(organizationId: string, projectId: string) {
    const org = await this.orgModel.findById(organizationId).lean();
    if (!org) {
      throw new ForbiddenException('Organisation not found');
    }
    const plan = getPlan(org.planId);
    const count = await this.indicatorModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(projectId),
    });
    if (plan.maxIndicatorsPerProject !== null && count >= plan.maxIndicatorsPerProject) {
      throw new ForbiddenException(
        `Indicator limit reached for this project (${plan.maxIndicatorsPerProject}). Upgrade your plan.`,
      );
    }
  }
}
