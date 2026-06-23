import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Controller, Get, Param, UseInterceptors, Post, UploadedFile, UploadedFiles, HttpException, HttpStatus } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { WhisperService } from './whisper.service';
import { ApiTags, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('whisper')
@ApiTags('Whisper')
export class WhisperController {
    constructor(private readonly whisperService: WhisperService) {}

    @Post('openai')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async getOpenAITranscript(@UploadedFile() file: Express.Multer.File) {
        //
        const response = await this.whisperService.callOpenaiWhisper(file);

        return response;
    }

    @Post('local')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async getLocalTranscript(@UploadedFile() file: Express.Multer.File) {
        //
        const response = await this.whisperService.callLocalWhisper(file);

        return response;
    }
}