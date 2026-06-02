import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { QdrantClient } from '@qdrant/js-client-rest';
import { SYSTEMPROMPT } from '@Sibasi/core';
import { createHash } from 'crypto';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Model, ObjectId } from 'mongoose';
import { getDataFromFile } from '../utilities/file.read';
import { SibasiVectorLogs, SibasiVectorLogsDTO } from './vectorlogs.model';

@Injectable()
export class VectorstoreService {
    private readonly logger = new Logger(VectorstoreService.name);
    private qdrant?: QdrantClient;
    private embeddingsFunction?: AzureOpenAIEmbeddings;
    private vectorStore?: QdrantVectorStore;
    private readonly VECTOR_STORE_COLLECTION: string;
    private readonly VECTOR_STORE_CONNECTION: string;
    private readonly QDRANT_HOST: string;
    private readonly QDRANT_PORT: number;
    private readonly QDRANT_API_KEY?: string;
    private readonly AZUREOPENAIAPIINSTANCENAME?: string;
    private readonly AZUREOPENAIAPIDEPLOYMENTNAME?: string;
    private readonly AZUREOPENAIAPIVERSION?: string;
    private readonly OPENAI_API_KEY?: string;
    private readonly AZUREMBEDDINGSMODELDEPLOYMENTNAME?: string;
    private readonly AZUREMBEDDINGSMODELAPIVERSION?: string;

    chatHistory: (HumanMessage | AIMessage)[] = [];

    constructor(
        @InjectModel(SibasiVectorLogs.name) private sibasiVectorLogsModel: Model<SibasiVectorLogs>,
        private readonly configService: ConfigService,
    ) {
        // Load all config/envs
        this.AZUREOPENAIAPIINSTANCENAME = this.configService.get<string>('AZUREOPENAIAPIINSTANCENAME');
        this.AZUREOPENAIAPIDEPLOYMENTNAME = this.configService.get<string>('AZUREOPENAIAPIDEPLOYMENTNAME');
        this.AZUREOPENAIAPIVERSION = this.configService.get<string>('AZUREOPENAIAPIVERSION');
        this.OPENAI_API_KEY = this.configService.get<string>('OPENAI_API_KEY');
        this.AZUREMBEDDINGSMODELDEPLOYMENTNAME = this.configService.get<string>('AZUREMBEDDINGSMODELDEPLOYMENTNAME');
        this.AZUREMBEDDINGSMODELAPIVERSION = this.configService.get<string>('AZUREMBEDDINGSMODELAPIVERSION');
        this.VECTOR_STORE_COLLECTION = this.configService.get<string>('VECTOR_STORE_COLLECTION') || 'default_collection';
        this.VECTOR_STORE_CONNECTION = this.configService.get<string>('VECTOR_STORE_CONNECTION') || '';
        this.QDRANT_HOST = this.configService.get<string>('QDRANT_HOST') || 'localhost';
        this.QDRANT_PORT = Number.parseInt(this.configService.get<string>('QDRANT_PORT') || '6333', 10);
        this.QDRANT_API_KEY = this.configService.get<string>('QDRANT_API_KEY') || undefined;
    }

    private ensureVectorStoreInitialized() {
        if (this.qdrant && this.embeddingsFunction && this.vectorStore) {
            return;
        }

        try {
            const qdrantConfig = this.VECTOR_STORE_CONNECTION
                ? { url: this.VECTOR_STORE_CONNECTION }
                : { host: this.QDRANT_HOST, port: this.QDRANT_PORT };

            this.qdrant = new QdrantClient({
                ...qdrantConfig,
                ...(this.QDRANT_API_KEY ? { apiKey: this.QDRANT_API_KEY } : {}),
                checkCompatibility: false,
            });

            this.embeddingsFunction = new AzureOpenAIEmbeddings({
                azureOpenAIApiKey: this.OPENAI_API_KEY,
                azureOpenAIApiInstanceName: this.AZUREOPENAIAPIINSTANCENAME,
                azureOpenAIApiDeploymentName: this.AZUREMBEDDINGSMODELDEPLOYMENTNAME,
                azureOpenAIApiVersion: this.AZUREMBEDDINGSMODELAPIVERSION,
            });

            this.vectorStore = new QdrantVectorStore(this.embeddingsFunction, {
                client: this.qdrant,
                collectionName: this.VECTOR_STORE_COLLECTION,
            });
        } catch (error: any) {
            this.logger.error(`Failed to initialize vector store: ${error.message}`);
            throw new ServiceUnavailableException('Vector store is not configured or unavailable.');
        }
    }

    private getQdrantClient(): QdrantClient {
        this.ensureVectorStoreInitialized();
        return this.qdrant!;
    }

    private getEmbeddingsFunction(): AzureOpenAIEmbeddings {
        this.ensureVectorStoreInitialized();
        return this.embeddingsFunction!;
    }

    private getVectorStore(): QdrantVectorStore {
        this.ensureVectorStoreInitialized();
        return this.vectorStore!;
    }

    private getLLM(streaming: boolean = false, streamCallbacks?: any): AzureChatOpenAI {
        // Always create fresh instance based on current env/config
        return new AzureChatOpenAI({
            model: this.configService.get<string>('PROMPTMODEL') || 'gpt-4o-mini',
            temperature: 0.5,
            maxTokens: 1000,
            maxRetries: 2,
            streaming,
            azureOpenAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
            azureOpenAIApiInstanceName: this.configService.get<string>('AZUREOPENAIAPIINSTANCENAME'),
            azureOpenAIApiDeploymentName: this.configService.get<string>('AZUREOPENAIAPIDEPLOYMENTNAME'),
            azureOpenAIApiVersion: this.configService.get<string>('AZUREOPENAIAPIVERSION'),
            callbacks: streamCallbacks
                ? [
                      {
                          handleLLMNewToken(token: string) {
                              if (streamCallbacks.onToken) {
                                  streamCallbacks.onToken(token);
                              }
                          },
                      },
                  ]
                : undefined,
        });
    }

    private hashChunk(text: string): string {
        return createHash('sha256').update(text).digest('hex');
    }

    async createCollection(collectionName: string) {
        try {
            const qdrant = this.getQdrantClient();
            const embeddingsFunction = this.getEmbeddingsFunction();
            const collections = await qdrant.getCollections();
            const collectionExists = collections.collections.some((c) => c.name === collectionName);
            if (!collectionExists) {
                // embedding size from the embeddings function
                const embeddingSize = (await embeddingsFunction.embedQuery('test')).length;
                await qdrant.createCollection(collectionName, {
                    vectors: {
                        size: embeddingSize,
                        distance: 'Cosine',
                    },
                });
            }
            return `Collection created if it did not exist`;
        } catch (error: any) {
            console.error('Error creating collection:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async listCollections() {
        try {
            const collections = await this.getQdrantClient().getCollections();
            return collections.collections;
        } catch (error: any) {
            console.error('Error listing collections:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async deleteCollection(collectionName: string) {
        try {
            await this.getQdrantClient().deleteCollection(collectionName);
            return `Collection deleted if it existed`;
        } catch (error: any) {
            console.error('Error deleting collection:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async getAllDocuments(collectionName: string) {
        const doesCollectionExists = await this.checkIfCollectionExists(collectionName);
        if (!doesCollectionExists) {
            throw new HttpException('Collection does not exists', HttpStatus.NOT_FOUND);
        }
        try {
            // Get all documents from the collection using scroll
            const scrollResult = await this.getQdrantClient().scroll(collectionName, {
                limit: 1000, // Adjust as needed
                with_payload: true,
            });
            const combinedData = scrollResult.points.map((point) => ({
                id: point.id,
                content: point.payload?.text || '',
                metadata: {
                    ...point.payload,
                    text: undefined, // Remove text from metadata as it's already in content
                },
            }));
            return combinedData;
        } catch (error: any) {
            console.error('Error retrieving documents:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async splitDocument(file: Express.Multer.File, documentId: string) {
        const fileData = await getDataFromFile(file);
        try {
            const textSplitter = new RecursiveCharacterTextSplitter({
                chunkSize: 10000,
                chunkOverlap: 2000,
            });
            const docs = await textSplitter.createDocuments([fileData], [{ source: file.originalname, fileID: documentId }], {});
            return docs;
        } catch (error: any) {
            console.error('Error splitting file to documents', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async documentToVectorstore(file: Express.Multer.File, documentId: string) {
        try {
            const splitsWithMetadata = await this.splitDocument(file, documentId);
            await this.getVectorStore().addDocuments(splitsWithMetadata);
            return true;
        } catch (error: any) {
            console.error('Error adding documents to store', error.message);
            return false;
        }
    }

    async checkIfCollectionExists(collectionName: string) {
        const existingCollections = await this.listCollections();
        return existingCollections.some((collection) => collection.name === collectionName);
    }

    async checkIfIdExists(collectionName: string, id: string) {
        const doesCollectionExists = await this.checkIfCollectionExists(collectionName);
        if (!doesCollectionExists) {
            throw new HttpException('Collection does not exists', HttpStatus.NOT_FOUND);
        }
        try {
            // Search for points with the given id in metadata
            const searchResults = await this.getQdrantClient().scroll(collectionName, {
                filter: {
                    must: [
                        {
                            key: 'metadata.fileID',
                            match: {
                                value: id,
                            },
                        },
                    ],
                },
                limit: 1,
            });
            return searchResults.points.length > 0;
        } catch (error: any) {
            console.error('Error checking existing documents:', error.message);
            throw new HttpException('Error checking existing documents', HttpStatus.BAD_REQUEST);
        }
    }

    async deleteDocumentsById(collectionName: string, idToDelete: string) {
        const doesCollectionExists = await this.checkIfCollectionExists(collectionName);
        if (!doesCollectionExists) {
            throw new HttpException('Collection does not exists', HttpStatus.NOT_FOUND);
        }
        try {
            const qdrant = this.getQdrantClient();
            const searchResults = await qdrant.scroll(collectionName, {
                filter: {
                    must: [
                        {
                            key: 'metadata.fileID',
                            match: {
                                value: idToDelete,
                            },
                        },
                    ],
                },
                limit: 10000,
            });
            if (searchResults.points.length > 0) {
                const pointIds = searchResults.points.map((point) => point.id);
                await qdrant.delete(collectionName, {
                    points: pointIds,
                });
            }
            return `Documents deleted if IDs existed`;
        } catch (error: any) {
            console.error('Error deleting documents by ID:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    async updateDocumentsById(collectionName: string, idToUpdate: string, file: Express.Multer.File) {
        const doesCollectionExists = await this.checkIfCollectionExists(collectionName);
        if (!doesCollectionExists) {
            throw new HttpException('Collection does not exists', HttpStatus.NOT_FOUND);
        }
        try {
            await this.deleteDocumentsById(collectionName, idToUpdate);
            return await this.documentToVectorstore(file, idToUpdate);
        } catch (error: any) {
            console.error('Error updating document:', error.message);
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    // Vector logs
    async createVectorLog(data: SibasiVectorLogsDTO) {
        return await this.sibasiVectorLogsModel.create(data);
    }

    async getVectorLogById(organizationId: ObjectId, userId: ObjectId, id: ObjectId) {
        const vectorLog = await this.sibasiVectorLogsModel.findOne({ _id: id, organization: organizationId, user: userId });
        if (vectorLog) {
            return vectorLog;
        }
    }

    async getVectorLogs(organizationId: ObjectId) {
        return await this.sibasiVectorLogsModel.find({ organization: organizationId });
    }

    async updateVectorLog(organizationId: ObjectId, userId: ObjectId, id: ObjectId, data: SibasiVectorLogsDTO) {
        const vectorLog = await this.getVectorLogById(organizationId, userId, id);
        if (vectorLog) {
            return await this.sibasiVectorLogsModel.findByIdAndUpdate(id, data, { new: true });
        }
    }

    async deleteVectorLog(organizationId: ObjectId, userId: ObjectId, id: ObjectId) {
        const vectorLog = await this.getVectorLogById(organizationId, userId, id);
        if (vectorLog) {
            return await this.sibasiVectorLogsModel.findByIdAndDelete(id);
        }
    }

    async chatWithStoreHistoryAware(userPrompt: string, fileIds: string[]) {
        const llm = this.getLLM(false) as any;
        try {
            const vectorStore = this.getVectorStore();
            const prompt = ChatPromptTemplate.fromMessages([['system', `${SYSTEMPROMPT}. Answer the user based on the following context: {context}.`], new MessagesPlaceholder('chat_history'), ['user', '{input}']]);
            const chain = await createStuffDocumentsChain({
                llm: llm,
                prompt: prompt,
            });
            const filter = {
                must: [
                    {
                        key: 'metadata.fileID',
                        match: {
                            any: fileIds,
                        },
                    },
                ],
            };
            const retriever = vectorStore.asRetriever({
                filter: filter,
                k: fileIds.length ? fileIds.length : 2,
            });
            const retriverPrompt = ChatPromptTemplate.fromMessages([new MessagesPlaceholder('chat_history'), ['user', '{input}']]);
            const historyAwareRetriever = await createHistoryAwareRetriever({
                llm: llm,
                retriever: retriever,
                rephrasePrompt: retriverPrompt,
            });
            const conversationChain = await createRetrievalChain({
                combineDocsChain: chain,
                retriever: historyAwareRetriever,
            });
            const response = await conversationChain.invoke({
                input: userPrompt,
                chat_history: this.chatHistory,
            });
            this.chatHistory.push(new HumanMessage(userPrompt)); // push current user prompt to history
            this.chatHistory.push(new AIMessage(response.answer)); // push current AI response to history
            return response.answer;
        } catch (error: any) {
            console.error(error.message);
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async chatWithStoreHistoryAwareStream(
        userPrompt: string,
        fileIds: string[],
        streamCallbacks: {
            onStart?: () => void;
            onToken?: (token: string) => void;
            onComplete?: (fullResponse: string) => void;
            onError?: (error: Error) => void;
        },
    ) {
        const llm = this.getLLM(true, streamCallbacks) as any;
        try {
            const vectorStore = this.getVectorStore();
            const filter = {
                must: [
                    {
                        key: 'metadata.fileID',
                        match: {
                            any: fileIds,
                        },
                    },
                ],
            };
            const prompt = ChatPromptTemplate.fromMessages([['system', `${SYSTEMPROMPT}. Answer the user based on the following context: {context}.`], new MessagesPlaceholder('chat_history'), ['user', '{input}']]);
            const chain = await createStuffDocumentsChain({
                llm: llm,
                prompt: prompt,
            });
            const retriever = vectorStore.asRetriever({
                filter: filter,
                k: fileIds.length ? fileIds.length : 2,
            });
            const retriverPrompt = ChatPromptTemplate.fromMessages([new MessagesPlaceholder('chat_history'), ['user', '{input}']]);
            const historyAwareRetriever = await createHistoryAwareRetriever({
                llm: llm,
                retriever: retriever,
                rephrasePrompt: retriverPrompt,
            });
            const conversationChain = await createRetrievalChain({
                combineDocsChain: chain,
                retriever: historyAwareRetriever,
            });
            if (streamCallbacks.onStart) {
                streamCallbacks.onStart();
            }
            let fullResponse = '';
            const response = await conversationChain.invoke({
                input: userPrompt,
                chat_history: this.chatHistory,
            });
            fullResponse = response.answer;
            this.chatHistory.push(new HumanMessage(userPrompt));
            this.chatHistory.push(new AIMessage(fullResponse));
            if (streamCallbacks.onComplete) {
                streamCallbacks.onComplete(fullResponse);
            }
            return fullResponse;
        } catch (error: any) {
            console.error(error.message);
            if (streamCallbacks.onError) {
                streamCallbacks.onError(error);
            }
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
