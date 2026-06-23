import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OKR, OKRSchema } from './schemas/okr.schema';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OKRService } from './okrs.service';
import { OKRController } from './okrs.controller';

@Module({
  imports: [MongooseModule.forFeature([
    { name: OKR.name,       schema: OKRSchema       },
    { name: Indicator.name, schema: IndicatorSchema  },
  ])],
  controllers: [OKRController],
  providers: [OKRService],
  exports: [OKRService],
})
export class OKRsModule {}