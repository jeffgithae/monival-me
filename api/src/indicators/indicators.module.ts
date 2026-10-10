import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Activity, ActivitySchema } from '../activities/schemas/activity.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { IndicatorResult, IndicatorResultSchema } from '../reporting/schemas/indicator-result.schema';
import { IndicatorTarget, IndicatorTargetSchema } from '../reporting/schemas/indicator-target.schema';
import { ReportingPeriod, ReportingPeriodSchema } from '../reporting/schemas/reporting-period.schema';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { Indicator, IndicatorSchema } from './schemas/indicator.schema';
import { FormResponse, FormResponseSchema } from '../forms/schemas/form-response.schema';

@Module({
  imports: [
    OrganizationsModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: Indicator.name,       schema: IndicatorSchema       },
      { name: Project.name,         schema: ProjectSchema         },
      { name: Activity.name,        schema: ActivitySchema        },
      { name: IndicatorResult.name, schema: IndicatorResultSchema },
      { name: IndicatorTarget.name, schema: IndicatorTargetSchema },
      { name: ReportingPeriod.name, schema: ReportingPeriodSchema },
      { name: FormResponse.name,    schema: FormResponseSchema    },
    ]),
  ],
  controllers: [IndicatorsController],
  providers:   [IndicatorsService],
  exports:     [IndicatorsService],
})
export class IndicatorsModule {}