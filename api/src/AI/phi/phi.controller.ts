import { Controller, Get, Param, UseInterceptors, Post, UploadedFile, UploadedFiles, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PhiService } from './phi.service';
import { GeminiService } from '../gemini/gemini.service';
import { getDataFromFile } from '../utilities/file.read';

@Controller('phi')
@ApiTags('Phi')
export class PhiController {
    constructor(
        private readonly phiService: PhiService,
        private readonly geminiService: GeminiService,
    ) {}

    @Post('file/:prompt')
    @ApiParam({ name: 'prompt', type: String, description: 'Prompt Phi3 about the uploaded file' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(@UploadedFile() file: Express.Multer.File, @Param('prompt') prompt: string) {
        // prompt = prompt.trim();
        const data = await getDataFromFile(file);
        if (data) {
            const response = await this.phiService.getPhiResponse(`${prompt}: ${data}`);
            return response;
        } else {
            return {
                message: `I am sorry but I do have the data to be summarized. Maybe the file was not read.`,
            };
        }
    }

    @Get(':prompt')
    @ApiParam({ name: 'prompt', type: String, description: 'Talk to Phi3' })
    async geminiResponse(@Param('prompt') prompt: string) {
        const response = await this.phiService.getPhiResponse(prompt);

        return response;
    }
}
