import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Beneficiary, BeneficiarySchema } from './schemas/beneficiary.schema';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';

import { WorkflowsModule } from '../workflows/workflows.module';
@Module({
  imports: [
    WorkflowsModule,
    AuditModule,MongooseModule.forFeature([{ name: Beneficiary.name, schema: BeneficiarySchema }])],
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}