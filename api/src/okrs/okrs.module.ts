import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OKR, OKRSchema } from './schemas/okr.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { OKRService } from './okrs.service';
import { OKRController } from './okrs.controller';
import { AuditModule } from '../audit/audit.module';
import { IndicatorsModule } from '../indicators/indicators.module';

@Module({
  imports: [
    AuditModule,
    IndicatorsModule,
    MongooseModule.forFeature([
      { name: OKR.name,     schema: OKRSchema     },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [OKRController],
  providers: [OKRService],
  exports: [OKRService],
})
export class OKRsModule {}
