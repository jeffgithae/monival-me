import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
const TransformersApi = Function('return import("@xenova/transformers")')();

@Injectable()
export class WhisperService {
    async callOpenaiWhisper(file: Express.Multer.File) {
        const formData = new FormData();
        formData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });

        const headers = {
            ...formData.getHeaders(),
            'api-key': process.env.OPENAI_SWEDEN_KEY,
        };

        try {
            const response = await axios.post(process.env.OPENAI_SWEDEN_ENDPOINT || '', formData, { headers });
            return response.data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                throw new HttpException(error.response?.data?.error || error.message, HttpStatus.BAD_REQUEST);
            }
            if (error instanceof Error) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }
            throw new HttpException('Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    async callLocalWhisper(file: Express.Multer.File): Promise<string> {
        const wavefile = await import('wavefile');
        const { pipeline } = await TransformersApi;

        try {
            // Configure pipeline
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');

            // Load audio
            const buffer = file.buffer;
            let wav = new wavefile.WaveFile(buffer);
            wav.toBitDepth('32f');
            wav.toSampleRate(16000);

            let audioData = wav.getSamples();
            if (Array.isArray(audioData)) {
                audioData = audioData[0];
            }

            let start = performance.now();
            let output = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
            });
            let end = performance.now();

            console.log(`Transcription took ${(end - start).toFixed(2)} ms`);
            return JSON.stringify(output);
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }
            throw new HttpException('Unknown error occurred during transcription', HttpStatus.BAD_REQUEST);
        }
    }
}
