import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../members/schemas/organization-member.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportingModule } from '../reporting/reporting.module';
import { AuditModule } from '../audit/audit.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { BudgetModule } from '../budget/budget.module';
import { DocumentsModule } from '../documents/documents.module';
import { FormsModule } from '../forms/forms.module';
import { ImpactStoriesModule } from '../impact-stories/impact-stories.module';
import { ReportsModule } from '../reports/reports.module';
import { StakeholderFeedbackModule } from '../stakeholder-feedback/stakeholder-feedback.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  imports: [
    OrganizationsModule,
    NotificationsModule,
    ReportingModule,
    AuditModule,
    BeneficiariesModule,
    BudgetModule,
    DocumentsModule,
    FormsModule,
    ImpactStoriesModule,
    ReportsModule,
    StakeholderFeedbackModule,
    WebhooksModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}