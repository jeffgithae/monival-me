import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Partner, PartnerSchema } from './schemas/partner.schema';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { AuditModule } from '../audit/audit.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: Partner.name,  schema: PartnerSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Project.name,  schema: ProjectSchema },
    ]),
  ],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
