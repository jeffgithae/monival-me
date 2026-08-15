import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExchangeRate, ExchangeRateSchema } from './schemas/exchange-rate.schema';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

// ScheduleModule.forRoot() is registered once by ReportsModule; the @Cron in
// FxService is picked up by that global scheduler, as WorkflowsService does.
@Module({
  imports: [MongooseModule.forFeature([{ name: ExchangeRate.name, schema: ExchangeRateSchema }])],
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
