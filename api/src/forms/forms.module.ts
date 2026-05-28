import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { FormTemplate, FormTemplateSchema } from './schemas/form-template.schema';
import { FormResponse, FormResponseSchema } from './schemas/form-response.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: FormResponse.name, schema: FormResponseSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
