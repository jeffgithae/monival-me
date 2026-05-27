import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../members/schemas/organization-member.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
