import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Controller, Delete, Get, Param, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { VectorstoreService } from './vectorstore.service';
import { ApiTags, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';

@ApiTags('Vectorstore')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('vectorstore')
export class VectorstoreController {
    constructor(private readonly vectorStoreService: VectorstoreService) {}

    @Get('collections')
    async allCollections() {
        const collections = await this.vectorStoreService.listCollections();

        return collections;
    }

    @Post('createCollection/:collection')
    @ApiParam({ name: 'collection', type: String, description: 'Get all documents in a collection' })
    async addCollection(@Param('collection') collectionName: string) {
        const message = await this.vectorStoreService.createCollection(collectionName);

        return message;
    }

    @Delete('deleteCollection/:collection')
    @ApiParam({ name: 'collection', type: String, description: 'Delete a collection' })
    async removeCollection(@Param('collection') collectionName: string) {
        const results = await this.vectorStoreService.deleteCollection(collectionName);

        return {
            message: `success`,
            results: results,
        };
    }

    @Get('documents/:collection')
    @ApiParam({ name: 'collection', type: String, description: 'Get all documents in a collection' })
    async allDocuments(@Param('collection') collectionName: string) {
        const documents = await this.vectorStoreService.getAllDocuments(collectionName);

        return documents;
    }

    // @Get('test/:collection')
    // @ApiParam({name: 'collection', type: String, description: "Get all documents in a collection"})
    // async test(@Param('collection') collectionName: string){
    //     const collections = await this.vectorStoreService.checkIfIdExists(collectionName, '626')

    //     return collections;
    // }

    @Post('converFileToEmbeddings/:documentId')
    @ApiParam({ name: 'documentId', type: String, description: 'Get all documents in a collection' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(
        FileInterceptor('file', {
            storage: multer.memoryStorage(),
        }),
    )
    async fileToEmbeddings(@UploadedFile() file: Express.Multer.File, @Param('documentId') documentId: string) {
        const vectorStoreResults = await this.vectorStoreService.documentToVectorstore(file, documentId);

        return vectorStoreResults;
    }

    @Post('updateFileEmbeddings/:documentId')
    @ApiParam({ name: 'documentId', type: String, description: 'Get all documents in a collection' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
    @UseInterceptors(FileInterceptor('file'))
    async updateDocumentsInStore(@UploadedFile() file: Express.Multer.File, @Param('documentId') documentId: string) {
        const vectorStoreResults = await this.vectorStoreService.updateDocumentsById(process.env.VECTOR_STORE_COLLECTION || '', documentId, file);

        return vectorStoreResults;
    }

    @Delete('document/:collection/:documentId')
    @ApiParam({ name: 'collection', type: String, description: 'The collection name' })
    @ApiParam({ name: 'documentId', type: String, description: 'The documents IDs' })
    async testingVectorStore(@Param('collection') collection: string, @Param('documentId') documentId: string) {
        const results = await this.vectorStoreService.deleteDocumentsById(collection, documentId);

        return {
            message: `success`,
            results: results,
        };
    }

    @Get('chat/:prompt/:documentId')
    @ApiParam({ name: 'prompt', type: String, description: 'User prompt' })
    @ApiParam({ name: 'documentId', type: String, description: 'The documents IDs' })
    async chatWithStore(@Param('prompt') prompt: string, @Param('documentId') documentId: string) {
        const results = await this.vectorStoreService.chatWithStoreHistoryAware(prompt, [documentId]);

        return {
            message: `success`,
            results: results,
        };
    }
}