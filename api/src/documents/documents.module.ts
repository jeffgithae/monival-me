import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document, DocumentSchema } from './schemas/document.schema';
import { DocumentVersion, DocumentVersionSchema } from './schemas/document-version.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { CloudStorageController } from './cloud-storage/cloud-storage.controller';
import { CloudStorageService } from './cloud-storage/cloud-storage.service';
import { CloudStorageConnection, CloudStorageConnectionSchema } from './schemas/cloud-storage-connection.schema';
@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
      { name: DocumentVersion.name, schema: DocumentVersionSchema },
      { name: CloudStorageConnection.name, schema: CloudStorageConnectionSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [DocumentsController, CloudStorageController],
  providers: [DocumentsService, CloudStorageService],
})
export class DocumentsModule {}