import { Module } from '@nestjs/common';
import { VectorstoreController } from './vectorstore.controller';
import { VectorstoreService } from './vectorstore.service';

@Module({
    controllers: [VectorstoreController],
    providers: [VectorstoreService],
})
export class VectorstoreModule {}
