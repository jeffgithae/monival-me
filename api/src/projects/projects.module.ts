import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../members/schemas/organization-member.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportingModule } from '../reporting/reporting.module';
import { AuditModule } from '../audit/audit.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  imports: [
    OrganizationsModule,
    NotificationsModule,
    ReportingModule,
    AuditModule,
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