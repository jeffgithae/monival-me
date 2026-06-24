import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ReportingPeriod, ReportingPeriodSchema } from '../reporting/schemas/reporting-period.schema';
import { IndicatorResult, IndicatorResultSchema } from '../reporting/schemas/indicator-result.schema';
import { Beneficiary, BeneficiarySchema } from '../beneficiaries/schemas/beneficiary.schema';
import { Grant, GrantSchema } from '../grants/schemas/grant.schema';
import { StakeholderFeedback, StakeholderFeedbackSchema } from '../stakeholder-feedback/schemas/stakeholder-feedback.schema';
import { CopilotController } from './copilot/copilot.controller';
import { CopilotService } from './copilot/copilot.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name,             schema: ProjectSchema },
      { name: Indicator.name,           schema: IndicatorSchema },
      { name: Activity.name,            schema: ActivitySchema },
      { name: ReportingPeriod.name,     schema: ReportingPeriodSchema },
      { name: IndicatorResult.name,     schema: IndicatorResultSchema },
      { name: Beneficiary.name,         schema: BeneficiarySchema },
      { name: Grant.name,               schema: GrantSchema },
      { name: StakeholderFeedback.name, schema: StakeholderFeedbackSchema },
    ]),
  ],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class AIModule {}