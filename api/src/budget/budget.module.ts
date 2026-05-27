import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BudgetAllocation, BudgetAllocationSchema } from './schemas/budget-allocation.schema';
import { BudgetLineItem, BudgetLineItemSchema } from './schemas/budget-line-item.schema';
import { BudgetVariance, BudgetVarianceSchema } from './schemas/budget-variance.schema';
import { BudgetService } from './budget.service';
import { BudgetController } from './budget.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BudgetAllocation.name, schema: BudgetAllocationSchema },
      { name: BudgetLineItem.name, schema: BudgetLineItemSchema },
      { name: BudgetVariance.name, schema: BudgetVarianceSchema },
    ]),
  ],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
