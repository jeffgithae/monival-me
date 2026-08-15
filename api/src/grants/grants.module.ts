import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Grant, GrantSchema } from './schemas/grant.schema';
import { Donor, DonorSchema } from '../donors/schemas/donor.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { BudgetAllocation, BudgetAllocationSchema } from '../budget/schemas/budget.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { FxModule } from '../fx/fx.module';
import { GrantsService } from './grants.service';
import { GrantsController } from './grants.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

import { WorkflowsModule } from '../workflows/workflows.module';
@Module({
  imports: [
    WebhooksModule,
    WorkflowsModule,
    AuditModule,
    NotificationsModule,
    FxModule,
    MongooseModule.forFeature([
      { name: Grant.name, schema: GrantSchema },
      { name: Donor.name, schema: DonorSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: BudgetAllocation.name, schema: BudgetAllocationSchema },
    ]),
  ],
  controllers: [GrantsController],
  providers: [GrantsService],
  exports: [GrantsService],
})
export class GrantsModule {}
