import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Beneficiary, BeneficiarySchema } from '../beneficiaries/schemas/beneficiary.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuditModule } from '../audit/audit.module';
import { ReportingModule } from '../reporting/reporting.module';
import { ActivitiesModule } from '../activities/activities.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BulkImportService } from './bulk-import.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ScheduledReport, ScheduledReportSchema } from './schemas/scheduled-report.schema';

@Module({
  imports: [
    AuditModule,
    ReportingModule,
    ActivitiesModule,
    BeneficiariesModule,
    ScheduleModule.forRoot(),
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }), // 5 MB max CSV
    MongooseModule.forFeature([
      { name: Project.name,          schema: ProjectSchema },
      { name: Organization.name,     schema: OrganizationSchema },
      { name: Indicator.name,        schema: IndicatorSchema },
      { name: Activity.name,         schema: ActivitySchema },
      { name: Beneficiary.name,      schema: BeneficiarySchema },
      { name: User.name,             schema: UserSchema },
      { name: ScheduledReport.name,  schema: ScheduledReportSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ScheduledReportsService, BulkImportService],
  exports: [ReportsService, BulkImportService],
})
export class ReportsModule {}