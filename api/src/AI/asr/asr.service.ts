import { Injectable } from '@nestjs/common';
import config from './config';
// Define the PipelineType if it's not already defined in the library
type PipelineType = 'automatic-speech-recognition' | 'text-generation' | 'translation' | 'summarization';

@Injectable()
export class AsrService {
    async transcribe(
        audio: Buffer,
        model: string = config.DEFAULT_MODEL,
        multilingual: boolean = config.DEFAULT_MULTILINGUAL,
        quantized: boolean = config.DEFAULT_QUANTIZED,
        subtask: string = config.DEFAULT_SUBTASK,
        language: string = config.DEFAULT_LANGUAGE,
    ) {
        const { pipeline, env } = await import('@xenova/transformers');

        env.allowLocalModels = false;

        class PipelineFactory {
            static task: PipelineType | null = null;
            static model: string | null = null;
            static quantized: boolean | null = null;
            static instance: any = null;

            tokenizer: any;
            model: any;
            quantized: any;

            constructor(tokenizer: any, model: any, quantized: any) {
                this.tokenizer = tokenizer;
                this.model = model;
                this.quantized = quantized;
            }

            static async getInstance(progress_callback: ((data: any) => void) | null = null) {
                if (this.instance === null) {
                    // TODO:Not Implemented
                    // this.instance = await pipeline(this.task as PipelineType, this.model, {
                    //     quantized: this.quantized,
                    //     progress_callback,
                    //     revision: this.model && this.model.includes('/whisper-medium') ? 'no_attentions' : 'main',
                    // });
                }

                return this.instance;
            }
        }

        class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
            static task: PipelineType = 'automatic-speech-recognition';
            static model: string | null = null;
            static quantized: boolean | null = null;
        }

        const isDistilWhisper = model.startsWith('distil-whisper/');

        let modelName = model;
        if (!isDistilWhisper && !multilingual) {
            modelName += '.en';
        }

        const p = AutomaticSpeechRecognitionPipelineFactory;
        if (p.model !== modelName || p.quantized !== quantized) {
            p.model = modelName;
            p.quantized = quantized;

            if (p.instance !== null) {
                (await p.getInstance()).dispose();
                p.instance = null;
            }
        }

        let transcriber = await p.getInstance((data) => {});

        const time_precision = transcriber.processor.feature_extractor.config.chunk_length / transcriber.model.config.max_source_positions;

        let chunks_to_process = [
            {
                tokens: [],
                finalised: false,
            },
        ];

        function chunk_callback(chunk: any) {
            let last = chunks_to_process[chunks_to_process.length - 1];
            Object.assign(last, chunk);
            last.finalised = true;

            if (!chunk.is_last) {
                chunks_to_process.push({
                    tokens: [],
                    finalised: false,
                });
            }
        }
        // TODO: NOT IMPLEMENTED
        // function callback_function(item: { output_token_ids: number[] }[]) {
        //     let last = chunks_to_process[chunks_to_process.length - 1];
        //     last.tokens = [...item[0].output_token_ids];

        //     let data = transcriber.tokenizer._decode_asr(chunks_to_process, {
        //         time_precision: time_precision,
        //         return_timestamps: true,
        //         force_full_sequences: false,
        //     });
        // }

        let output = await transcriber(audio, {
            top_k: 0,
            do_sample: false,
            chunk_length_s: isDistilWhisper ? 20 : 30,
            stride_length_s: isDistilWhisper ? 3 : 5,
            language: language,
            task: subtask,
            return_timestamps: true,
            force_full_sequences: false,
            // callback_function: callback_function,
            chunk_callback: chunk_callback,
        }).catch((error) => {
            console.error(error);
            return null;
        });

        return output;
    }
}
