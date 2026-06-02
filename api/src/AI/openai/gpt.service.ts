import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { AzureChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { loadSummarizationChain } from 'langchain/chains';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { encoding_for_model } from 'tiktoken';

import { LANGCHAIN_PROMPTS } from '@Sibasi/core';
import { calculateChatCost, calculateLangchainCost } from '../utilities/calculations.openai';
import { getDataFromFile } from '../utilities/file.read';
import { AzureOpenAIConfig } from './gpt.provider';

@Injectable()
export class GptService {
    usageCosts: { inputPrice: number; outputPrice: number; totalCost: number }[] = [];

    constructor(
        private readonly httpService: HttpService,
        @Inject('AZURE_OPENAI_CONFIG')
        private readonly azureConfig: AzureOpenAIConfig,
    ) {}

    async countTokens(strings: string[]) {
        const tokenizer = encoding_for_model('gpt-4o-2024-05-13');
        let total = 0;
        for (const currentString of strings) {
            let encoded = tokenizer.encode(currentString);
            total += encoded.length;
        }
        return total;
    }

    async getOpenaiResponse(prompt: string, data?: string) {
        let totalUsage;

        // For direct HTTP to Azure endpoint
        const endpoint = `https://${this.azureConfig.instanceName}.openai.azure.com/openai/deployments/${this.azureConfig.deploymentName}/chat/completions?api-version=${this.azureConfig.apiVersion}`;
        const headers = {
            'Content-Type': 'application/json',
            'api-key': this.azureConfig.apiKey,
        };
        const payload = {
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
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `${prompt}: ${data}`,
                        },
                    ],
                },
            ],
            temperature: this.azureConfig.temperature,
            top_p: 0.95,
            max_tokens: this.azureConfig.maxTokens,
        };
        const tokensInPrompt = await this.countTokens([payload.messages[0].content[0].text, payload.messages[1].content[0].text]);
        const maxInputTokens = this.azureConfig.maxTokens ?? 10000;
        if (tokensInPrompt > maxInputTokens) {
            const lanchainResponse = await this.summarizeWithLangChain(data ?? '');
            totalUsage = lanchainResponse.usage;
            return {
                success: true,
                data: lanchainResponse.summary,
                usage: totalUsage,
            };
        }
        try {
            const response = await firstValueFrom(this.httpService.post(endpoint, payload, { headers }));
            totalUsage = calculateChatCost('GPT-4o-mini Global Deployment', response.data.usage.prompt_tokens, response.data.usage.completion_tokens);
            return {
                success: true,
                data: response.data.choices[0].message.content,
                usage: totalUsage,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async getOpenAICosts() {
        return this.usageCosts;
    }

    async docPrompt(userPrompt: string, fileData: string) {
        let llmUse: any[] = [];
        const { apiKey, instanceName, deploymentName, apiVersion, embeddingDeploymentName, embeddingApiVersion, maxTokens, temperature } = this.azureConfig;

        const llm = new AzureChatOpenAI({
            model: deploymentName,
            temperature: temperature ?? 0.3,
            maxTokens: maxTokens ?? 10000,
            maxRetries: 2,
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiVersion: apiVersion,
            callbacks: [{ handleLLMEnd: (output) => llmUse.push(output) }],
        });

        const prompt = ChatPromptTemplate.fromTemplate(`
      Answer the user's question.
      Context: {context}
      Question: {input}
    `);

        const chain = await createStuffDocumentsChain({
            llm: llm,
            prompt: prompt,
        });

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 5000,
            chunkOverlap: 1000,
        });
        const docs = await textSplitter.createDocuments([fileData]);
        const splits = await textSplitter.splitDocuments(docs);

        const embeddingsFunction = new OpenAIEmbeddings({
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: embeddingDeploymentName,
            azureOpenAIApiVersion: embeddingApiVersion,
        } as any);

        const vectorStore = await MemoryVectorStore.fromDocuments(splits, embeddingsFunction);
        const retriever = vectorStore.asRetriever({ k: 3 });
        const retrievalChain = await createRetrievalChain({
            combineDocsChain: chain,
            retriever,
        });
        const response = await retrievalChain.invoke({ input: userPrompt });
        return response.answer;
    }

    async summarizeWithLangChain(fileData: string) {
        let llmUse: any[] = [];
        const { apiKey, instanceName, deploymentName, apiVersion, temperature, maxTokens } = this.azureConfig;

        const llm = new AzureChatOpenAI({
            model: deploymentName,
            temperature: temperature ?? 0.5,
            maxTokens: maxTokens ?? 10000,
            maxRetries: 2,
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiVersion: apiVersion,
            callbacks: [{ handleLLMEnd: (output) => llmUse.push(output) }],
        });

        const characterSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 50000,
            chunkOverlap: 10000,
        });
        const docs = await characterSplitter.createDocuments([fileData]);
        const splitDocs = await characterSplitter.splitDocuments(docs);

        const summaryTemplate = LANGCHAIN_PROMPTS.SUMMARY_FILES;
        const SUMMARY_PROMPT = PromptTemplate.fromTemplate(summaryTemplate);
        const summaryRefineTemplate = LANGCHAIN_PROMPTS.REFINE_SUMMARY_OF_FILES;
        const SUMMARY_REFINE_PROMPT = PromptTemplate.fromTemplate(summaryRefineTemplate);

        const summarizeChain = loadSummarizationChain(llm, {
            type: 'refine',
            questionPrompt: SUMMARY_PROMPT,
            refinePrompt: SUMMARY_REFINE_PROMPT,
        });

        const res = await summarizeChain.invoke({ input_documents: splitDocs });
        const usage = calculateLangchainCost('GPT-4o-mini Global Deployment', llmUse);
        return { summary: res['output_text'], usage };
    }

    async getDataFromMultipleFiles(files: Express.Multer.File[]) {
        const combinedData: any[] = [];
        for (const currentFile of files) {
            let currentFileData = await getDataFromFile(currentFile);
            combinedData.push({
                file_title: currentFile.originalname,
                file_content: currentFileData,
            });
        }
        return JSON.stringify(combinedData);
    }
}
