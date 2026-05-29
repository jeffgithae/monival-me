import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { AuditModule } from '../audit/audit.module';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { IndicatorResult, IndicatorResultSchema } from './schemas/indicator-result.schema';
import { IndicatorTarget, IndicatorTargetSchema } from './schemas/indicator-target.schema';
import { ReportingPeriod, ReportingPeriodSchema } from './schemas/reporting-period.schema';

@Module({
  imports: [
    OrganizationsModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: ReportingPeriod.name, schema: ReportingPeriodSchema },
      { name: IndicatorResult.name, schema: IndicatorResultSchema },
      { name: IndicatorTarget.name, schema: IndicatorTargetSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService, MongooseModule],
})
export class ReportingModule {}
