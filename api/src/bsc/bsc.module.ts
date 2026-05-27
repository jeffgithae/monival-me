import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalancedScorecard, BalancedScorecardSchema } from './schemas/balanced-scorecard.schema';
import { BalancedScorecardService } from './bsc.service';
import { BalancedScorecardController } from './bsc.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: BalancedScorecard.name, schema: BalancedScorecardSchema }])],
  controllers: [BalancedScorecardController],
  providers: [BalancedScorecardService],
  exports: [BalancedScorecardService],
})
export class BalancedScorecardModule {}
