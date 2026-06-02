import { Module } from '@nestjs/common';
import { OpenaiController } from './openai.controller';
// import { OpenaiService } from '../utilities/openai.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AzureOpenAIConfigProvider } from './gpt.provider';
import { GptService } from './gpt.service';

@Module({
    imports: [
        HttpModule, // Import HttpModule here
        ConfigModule.forRoot(),
    ],
    controllers: [OpenaiController],
    providers: [GptService, AzureOpenAIConfigProvider],
})
export class OpenaiModule {}
