import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as path from 'path';
import * as officeparser from 'officeparser';
import * as WordExtractor from 'word-extractor';
import xlsx from 'node-xlsx';
import { getImageFromPdf } from './pdf.utility';
import { getImagesFromDocx } from './word.utility';
import { ACCEPTED_FILE_MIME_TYPES, ACCEPTED_FILE_NOTATIONS } from '@Sibasi/core';

@Injectable()
export class OpenaiService {
    constructor(private readonly httpService: HttpService) {}

    payload = {
        messages: [
            {
                role: 'system',
                content: [
                    {
                        type: 'text',
                        text: 'You are an AI assistant called Eboard-AI. You are in a platform called Eboard. Be professional, concise and well-detailed in your responses.',
                    },
                ],
            },
        ],
        temperature: process.env.TEMPERATURE,
        top_p: 0.95,
        max_tokens: process.env.MAX_OUTPUT_TOKENS,
    };

    async handleIMage(imageBuffers: Buffer[]) {
        let result: string[] = [];
        for (let i = 0; i < imageBuffers.length; i++) {
            let imageBuffer = imageBuffers[i];
            let encodedImage = imageBuffer.toString('base64');

            result.push(encodedImage);
        }

        return result;
    }

    async getOpenaiResponse(payload: any): Promise<{
        content: string;
        role: string;
    }> {
        // return payload
        const headers = {
            'Content-Type': 'application/json',
            'api-key': process.env.OPENAI_API_KEY,
        };

        // const encodedImage = imageBuffer.toString('base64');

        try {
            const response = await firstValueFrom(this.httpService.post(process.env.OPENAI_ENDPOINT || '', payload, { headers }));

            return response.data.choices[0].message.content;
        } catch (error: any) {
            throw new HttpException(`${error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    async checkFileType(file: Express.Multer.File) {
        const allowedMimeTypes = [...ACCEPTED_FILE_MIME_TYPES];
        const allowedFileNotations = [...ACCEPTED_FILE_NOTATIONS];
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (!(allowedMimeTypes.includes(file.mimetype) && allowedFileNotations.includes(fileExt))) {
            throw new HttpException(`Only ${ACCEPTED_FILE_NOTATIONS.join(' or ')} files are allowed!`, HttpStatus.BAD_REQUEST);
        } else {
            return fileExt;
        }
    }

    async parseDocxPdf(file: Express.Multer.File) {
        let data = await officeparser.parseOfficeAsync(file.buffer);

        return data.trim();
    }

    async parseDoc(file: Express.Multer.File) {
        let extractor = new WordExtractor();
        let data = await extractor.extract(file.buffer);

        return data.getBody().trim();
    }

    async parseXlsxXls(file: Express.Multer.File) {
        const data = xlsx.parse(file.buffer);
        let results: string = '';

        data.forEach((sheet) => {
            results = results + sheet.name + '\n';

            sheet.data.forEach((row) => {
                if (row.length > 0) {
                    results = results + '\n' + row.join(' ');
                }
            });
        });

        return results.trim();
    }

    async handleOCR(imageBuffers: Buffer[]) {}

    async getDataFromFile(file: Express.Multer.File) {
        if (!file) {
            throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
        }
        const fileType = await this.checkFileType(file);

        let data: { fileType: string; fileContent: { type: string; content: string[] }[] };

        if (fileType === '.pdf' || fileType === '.docx') {
            let content = await this.parseDocxPdf(file);
            let imagesData: any[] = [];

            if (fileType === '.docx') {
                let extractedImages = await getImagesFromDocx(file.buffer);
                imagesData = await this.handleIMage(extractedImages);
            } else if (fileType === '.pdf') {
                let extractedImages = await getImageFromPdf(file.buffer);
                imagesData = await this.handleIMage(extractedImages);
            }

            data =
                imagesData.length > 0
                    ? {
                          fileType: 'docImg',
                          fileContent: [
                              { type: 'text', content: [content] },
                              { type: 'images', content: [...imagesData] },
                          ],
                      }
                    : {
                          fileType: 'doc',
                          fileContent: [{ type: 'text', content: [content] }],
                      };
        } else if (fileType === '.xls' || fileType === '.xlsx') {
            let content = await this.parseXlsxXls(file);
            data = {
                fileType: 'doc',
                fileContent: [{ type: 'text', content: [content] }],
            };
        } else if (fileType === '.doc') {
            let content = await this.parseDoc(file);
            data = {
                fileType: 'doc',
                fileContent: [{ type: 'text', content: [content] }],
            };
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif'].includes(fileType)) {
            const encodedImage = await this.handleIMage([file.buffer]);
            data = {
                fileType: 'img',
                fileContent: [{ type: 'images', content: [...encodedImage] }],
            };
        } else {
            // Handle all other file types explicitly
            throw new HttpException('Unsupported file type', HttpStatus.BAD_REQUEST);
        }

        return data;
    }

    async getOpenAIResponseFromFiles(prompt: string, files: Express.Multer.File[]) {
        let data: any[] = [];
        let newMessageContent: any[] = [];

        for (let i = 0; i < files.length; i++) {
            let currentFile = files[i];
            let currentFileData = await this.getDataFromFile(currentFile);
            // {
            //   role: 'user',
            //   content: [
            //     {
            //       type: 'image_url',
            //       image_url: {
            //         url: `data:image/jpeg;base64,${encodedImage}`,
            //       },
            //     },
            // {
            //   type: 'text',
            //   text: 'Tell me about this file',
            // },
            //   ],
            // },

            if (currentFileData.fileType === 'doc') {
                newMessageContent.push({ type: 'text', text: currentFileData.fileContent[0].content[0] });
            } else if (currentFileData.fileType === 'docImg') {
                newMessageContent.push({ type: 'text', text: currentFileData.fileContent[0].content[0] });
                currentFileData.fileContent[1].content.map((item) => {
                    newMessageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${item}`,
                        },
                    });
                });
            } else if (currentFileData.fileType === 'img') {
                currentFileData.fileContent[0].content.map((item) => {
                    newMessageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${item}`,
                        },
                    });
                });
            }
        }

        let newPromptPayload = {
            role: 'user',
            content: [
                ...newMessageContent,
                {
                    type: 'text',
                    text: prompt,
                },
            ],
        };

        let payload = { ...this.payload };
        payload.messages.push(newPromptPayload);
        // this.payload.messages.push(newPromptPayload)
        const openaiResponse = await this.getOpenaiResponse(payload);
        return openaiResponse;
    }
}
