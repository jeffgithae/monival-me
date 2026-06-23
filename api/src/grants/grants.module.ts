import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Grant, GrantSchema } from './schemas/grant.schema';
import { Donor, DonorSchema } from '../donors/schemas/donor.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { GrantsService } from './grants.service';
import { GrantsController } from './grants.controller';

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Grant.name, schema: GrantSchema },
      { name: Donor.name, schema: DonorSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [GrantsController],
  providers: [GrantsService],
  exports: [GrantsService],
})
export class GrantsModule {}