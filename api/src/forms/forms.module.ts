import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { FormTemplate, FormTemplateSchema } from './schemas/form-template.schema';
import { FormResponse, FormResponseSchema } from './schemas/form-response.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ExternalIntegration, ExternalIntegrationSchema } from './schemas/external-integration.schema';

@Module({
  imports: [
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }), // 10 MB
    MongooseModule.forFeature([
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: FormResponse.name, schema: FormResponseSchema },
      { name: ExternalIntegration.name, schema: ExternalIntegrationSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  controllers: [FormsController, IntegrationsController],
  providers: [FormsService, IntegrationsService],
  exports: [IntegrationsService],
})
export class FormsModule {}