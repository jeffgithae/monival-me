import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { BudgetAllocation, BudgetAllocationSchema, BudgetLineItem, BudgetLineItemSchema, BudgetVariance, BudgetVarianceSchema, BudgetAuditEvent, BudgetAuditEventSchema } from './schemas/budget.schema';

// import {
//   BudgetAllocation, BudgetAllocationSchema,
//   BudgetLineItem, BudgetLineItemSchema,
//   BudgetVariance, BudgetVarianceSchema,
//   BudgetAuditEvent, BudgetAuditEventSchema,
// } from './schemas/budget.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BudgetAllocation.name, schema: BudgetAllocationSchema },
      { name: BudgetLineItem.name, schema: BudgetLineItemSchema },
      { name: BudgetVariance.name, schema: BudgetVarianceSchema },
      { name: BudgetAuditEvent.name, schema: BudgetAuditEventSchema },
    ]),
  ],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService], // Export so reporting/grants modules can use BudgetService
})
export class BudgetModule {}