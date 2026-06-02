import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { GEMINI_API_KEY, TEMPERATURE, MAX_OUTPUT_TOKENS } from 'src/app.constants';
// import { calculateCost } from '../utilities/calculations.gemini';
// import { getDataFromFile } from '../utilities/file.read';

// const geminiAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// export interface cost {
//     inputTokens: number,
//     outputTokens: number,
//     inputCost: number,
//     outputCost: number,
//     totalCost: number
// }

@Injectable()
export class GeminiService {
    // userCost : cost[] = []
    // async getGeminiResponse(prompt: string){
    //     const geminiModel = geminiAI.getGenerativeModel({
    //         model: "gemini-1.5-pro-latest",
    //         generationConfig:{
    //         temperature: TEMPERATURE, // Adjust for desired response creativity
    //         topP: 0.5, // Adjust for sampling
    //         topK: 30, // Adjust for diversity
    //         maxOutputTokens: MAX_OUTPUT_TOKENS, // Max response length
    //         },
    //         systemInstruction: `You are an AI assitant called Sibasian being used in a platform called Eboard. Make sure your responses are professional.`,
    //     });
    //     try {
    //         let chat = geminiModel.startChat();
    //         let result = await chat.sendMessage(prompt);
    //         //
    //         //
    //         //
    //         let inputTokens = result.response.usageMetadata.promptTokenCount;
    //         let outputTokens = result.response.usageMetadata.candidatesTokenCount;
    //         // let currentCost = calculateCost("1.5 Pro (Pay)", result.response.usageMetadata.promptTokenCount, result.response.usageMetadata.candidatesTokenCount)
    //         let currentCost = calculateCost("1.5 Pro (Pay)", inputTokens, outputTokens)
    //         this.userCost.push({inputTokens, outputTokens, inputCost: currentCost.inputPrice, outputCost: currentCost.outputPrice, totalCost: currentCost.totalCost})
    //         return result.response.text();
    //     } catch (error) {
    //         throw new HttpException(error.message, HttpStatus.BAD_REQUEST)
    //     }
    // }
    // async getCostInfo(){
    //     return this.userCost;
    // }
    // async getDataFromMultipleFiles(files: Express.Multer.File[]){
    //     let data : {file_title: string, file_content: string}[] = []
    //     for (let i = 0; i < files.length; i++){
    //     let currentFile = files[i]
    //     let currentFileData = await getDataFromFile(currentFile);
    //     data.push({
    //         file_title: currentFile.originalname,
    //         file_content: currentFileData
    //     })
    //     }
    //     return JSON.stringify(data);
    // }
}
