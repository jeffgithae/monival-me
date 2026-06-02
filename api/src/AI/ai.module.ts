import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ReportingPeriod, ReportingPeriodSchema } from '../reporting/schemas/reporting-period.schema';
import { CopilotController } from './copilot/copilot.controller';
import { CopilotService } from './copilot/copilot.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: ReportingPeriod.name, schema: ReportingPeriodSchema },
    ]),
  ],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class AIModule {}
