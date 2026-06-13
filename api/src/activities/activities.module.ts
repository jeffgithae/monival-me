import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GrantsModule } from '../grants/grants.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { Beneficiary, BeneficiarySchema } from '../beneficiaries/schemas/beneficiary.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Partner, PartnerSchema } from '../partners/schemas/partner.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { ActivityTemplate, ActivityTemplateSchema } from './schemas/activity-template.schema';

@Module({
  imports: [
    NotificationsModule,
    AuditModule,
    GrantsModule,
    WebhooksModule,
    MongooseModule.forFeature([
      { name: Activity.name,         schema: ActivitySchema         },
      { name: ActivityTemplate.name, schema: ActivityTemplateSchema },
      { name: Project.name,          schema: ProjectSchema          },
      { name: Indicator.name,        schema: IndicatorSchema        },
      { name: Partner.name,          schema: PartnerSchema          },
      { name: Beneficiary.name,      schema: BeneficiarySchema      },
    ]),
  ],
  controllers: [ActivitiesController],
  providers:   [ActivitiesService],
  exports:     [ActivitiesService],
})
export class ActivitiesModule {}