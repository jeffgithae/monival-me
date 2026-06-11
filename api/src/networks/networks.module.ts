import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { NetworksController } from './networks.controller';
import { NetworksService } from './networks.service';
import { OrgNetwork, OrgNetworkSchema } from './schemas/org-network.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrgNetwork.name, schema: OrgNetworkSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [NetworksController],
  providers: [NetworksService],
  exports: [NetworksService],
})
export class NetworksModule {}