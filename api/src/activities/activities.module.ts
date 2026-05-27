import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
