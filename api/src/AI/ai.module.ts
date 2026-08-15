import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ReportingPeriod, ReportingPeriodSchema } from '../reporting/schemas/reporting-period.schema';
import { IndicatorResult, IndicatorResultSchema } from '../reporting/schemas/indicator-result.schema';
import { Beneficiary, BeneficiarySchema } from '../beneficiaries/schemas/beneficiary.schema';
import { Grant, GrantSchema } from '../grants/schemas/grant.schema';
import { BudgetAllocation, BudgetAllocationSchema } from '../budget/schemas/budget.schema';
import { Donor, DonorSchema } from '../donors/schemas/donor.schema';
import { StakeholderFeedback, StakeholderFeedbackSchema } from '../stakeholder-feedback/schemas/stakeholder-feedback.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { AiUsage, AiUsageSchema } from './schemas/ai-usage.schema';
import { AiUsageService } from './ai-usage.service';
import { CopilotController } from './copilot/copilot.controller';
import { CopilotService } from './copilot/copilot.service';
import { AnthropicService } from './anthropic.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Project.name,             schema: ProjectSchema },
      { name: Indicator.name,           schema: IndicatorSchema },
      { name: Activity.name,            schema: ActivitySchema },
      { name: ReportingPeriod.name,     schema: ReportingPeriodSchema },
      { name: IndicatorResult.name,     schema: IndicatorResultSchema },
      { name: Beneficiary.name,         schema: BeneficiarySchema },
      { name: Grant.name,               schema: GrantSchema },
      { name: BudgetAllocation.name,    schema: BudgetAllocationSchema },
      { name: Donor.name,               schema: DonorSchema },
      { name: StakeholderFeedback.name, schema: StakeholderFeedbackSchema },
      { name: Organization.name,        schema: OrganizationSchema },
      { name: AiUsage.name,             schema: AiUsageSchema },
    ]),
  ],
  controllers: [CopilotController],
  providers: [AnthropicService, AiUsageService, CopilotService],
  exports: [AnthropicService, AiUsageService, CopilotService],
})
export class AIModule {}