import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Controller, Get, Param, UseInterceptors, Post, UploadedFile, UploadedFiles, HttpException, HttpStatus } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { GptService } from './gpt.service';
import { getDataFromFile } from '../utilities/file.read';
import { parseAIResponse } from '../utilities/utilities';
import { OPENAI_PROMPTS } from '@Sibasi/core';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('openai')
@ApiTags('OpenAI')
export class OpenaiController {
    constructor(private readonly gptService: GptService) {}

    @Post('file/:prompt')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
    @ApiParam({ name: 'prompt', type: String, description: 'Prompt gpt-4o-mini about the uploaded file' })
    @UseInterceptors(FilesInterceptor('files', Number(process.env.MAX_UPLOAD_FILES) || 10))
    async summarizeFiles(@UploadedFiles() files: Express.Multer.File[], @Param('prompt') prompt: string) {
        const data = await this.gptService.getDataFromMultipleFiles(files);
        if (data) {
            const response = await this.gptService.getOpenaiResponse(`${prompt}: ${data}`);
            return response;
        } else {
            return {
                message: `I am sorry but I do have the data to be summarized. Maybe the file was not read.`,
            };
        }
    }

    @Post('translateFile/:language')
    @ApiParam({ name: 'language', type: String, description: 'Translate a file based to a particular language' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async translateFile(@UploadedFile() file: Express.Multer.File, @Param('language') language: string) {
        const data = await getDataFromFile(file);
        if (data) {
            const response = await this.gptService.getOpenaiResponse(`Translate this content: ${data} to ${language}. Do not remove anything even the escape sequence or spaces`);
            return response;
        } else {
            return {
                message: `I am sorry but I do have the data to be summarized. Maybe the file was not read.`,
            };
        }
    }

    @Post('transcriptInfo')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async transcriptInfo(@UploadedFile() file: Express.Multer.File) {
        const data = await getDataFromFile(file);
        if (data) {
            const response = await this.gptService.getOpenaiResponse(`${OPENAI_PROMPTS.TRANSCRIPT_INFO}: ${data}`);
            return parseAIResponse(response.data);
        } else {
            return {
                message: `I am sorry but I do have the data to be summarized. Maybe the file was not read.`,
            };
        }
    }

    @Post('summarizeFiles')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
    @UseInterceptors(FilesInterceptor('files', Number(process.env.MAX_UPLOAD_FILES) || 10))
    async summarize(@UploadedFiles() files: Express.Multer.File[]) {
        const combinedData = await this.gptService.getDataFromMultipleFiles(files);
        //
        const response = await this.gptService.getOpenaiResponse(`${OPENAI_PROMPTS.SUMMARIZE_FILES} \n\n Here is the data from those files: ${combinedData}`);

        return parseAIResponse(response.data);
    }
    @Get('costs')
    async openaiUserCosts() {
        const response = await this.gptService.getOpenAICosts();

        return response;
    }

    @Get(':prompt')
    @ApiParam({ name: 'prompt', type: String, description: 'Prompt Open AI' })
    async openaiResponse(@Param('prompt') prompt: string) {
        const response = await this.gptService.getOpenaiResponse(prompt);
        return response;
    }
}