import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { Donor, DonorSchema } from './schemas/donor.schema';
import { Grant, GrantSchema } from '../grants/schemas/grant.schema';
import { BudgetAllocation, BudgetAllocationSchema } from '../budget/schemas/budget.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Donor.name,            schema: DonorSchema },
      { name: Grant.name,            schema: GrantSchema },
      { name: BudgetAllocation.name, schema: BudgetAllocationSchema },
      { name: Project.name,          schema: ProjectSchema },
      { name: Indicator.name,        schema: IndicatorSchema },
      { name: Organization.name,     schema: OrganizationSchema },
    ]),
  ],
  controllers: [DonorsController],
  providers: [DonorsService],
  exports: [DonorsService],
})
export class DonorsModule {}