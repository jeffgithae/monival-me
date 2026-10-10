import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BalancedScorecard, BalancedScorecardSchema } from './schemas/balanced-scorecard.schema';
import { BalancedScorecardService } from './bsc.service';
import { BalancedScorecardController } from './bsc.controller';
import { AuditModule } from '../audit/audit.module';
import { OKRsModule } from '../okrs/okrs.module';

@Module({
  imports: [
    AuditModule,
    OKRsModule,
    MongooseModule.forFeature([{ name: BalancedScorecard.name, schema: BalancedScorecardSchema }]),
  ],
  controllers: [BalancedScorecardController],
  providers: [BalancedScorecardService],
  exports: [BalancedScorecardService],
})
export class BalancedScorecardModule {}
