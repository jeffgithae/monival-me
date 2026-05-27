import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OKR, OKRSchema } from './schemas/okr.schema';
import { OKRService } from './okrs.service';
import { OKRController } from './okrs.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: OKR.name, schema: OKRSchema }])],
  controllers: [OKRController],
  providers: [OKRService],
  exports: [OKRService],
})
export class OKRsModule {}
