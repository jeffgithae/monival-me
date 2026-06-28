import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Beneficiary, BeneficiarySchema } from '../beneficiaries/schemas/beneficiary.schema';
import { Grant, GrantSchema } from '../grants/schemas/grant.schema';
import { ImpactStory, ImpactStorySchema } from '../impact-stories/schemas/impact-story.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../members/schemas/organization-member.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Partner, PartnerSchema } from '../partners/schemas/partner.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { IndicatorResult, IndicatorResultSchema } from '../reporting/schemas/indicator-result.schema';
import { ReportingPeriod, ReportingPeriodSchema } from '../reporting/schemas/reporting-period.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name,            schema: ProjectSchema },
      { name: Indicator.name,          schema: IndicatorSchema },
      { name: IndicatorResult.name,    schema: IndicatorResultSchema },
      { name: Activity.name,           schema: ActivitySchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: Organization.name,       schema: OrganizationSchema },
      { name: Beneficiary.name,        schema: BeneficiarySchema },
      { name: Grant.name,              schema: GrantSchema },
      { name: ReportingPeriod.name,    schema: ReportingPeriodSchema },
      { name: ImpactStory.name,        schema: ImpactStorySchema },
      { name: Partner.name,            schema: PartnerSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}