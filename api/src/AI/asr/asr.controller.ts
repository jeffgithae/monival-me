// asr.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { AsrService } from './asr.service';
import config from './config';

@Controller('asr')
export class AsrController {
    constructor(private readonly asrService: AsrService) {}

    @Post('transcribe')
    async transcribe(@Body() body: any) {
        const { audio, model, multilingual, quantized, subtask, language } = body;

        const transcript = await this.asrService.transcribe(
            audio,
            model || config.DEFAULT_MODEL,
            multilingual ?? config.DEFAULT_MULTILINGUAL,
            quantized ?? config.DEFAULT_QUANTIZED,
            subtask || config.DEFAULT_SUBTASK,
            language || config.DEFAULT_LANGUAGE,
        );

        if (transcript === null) {
            return {
                status: 'error',
                message: 'Transcription failed',
            };
        }

        return {
            status: 'complete',
            task: 'automatic-speech-recognition',
            data: transcript,
        };
    }
}
