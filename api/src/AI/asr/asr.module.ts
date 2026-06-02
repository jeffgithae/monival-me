import { Module } from '@nestjs/common';
import { AsrService } from './asr.service';
import { AsrController } from './asr.controller';

@Module({
    providers: [AsrService],
    controllers: [AsrController],
})
export class AsrModule {}
