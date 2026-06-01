import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrgRole } from '../common/constants/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { Document } from './schemas/document.schema';
import { DocumentVersion } from './schemas/document-version.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document.name) private readonly documentModel: Model<Document>,
    @InjectModel(DocumentVersion.name) private readonly versionModel: Model<DocumentVersion>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    private readonly notificationsService: NotificationsService,
  ) {}

  findDocuments(organizationId: string, projectId?: string) {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (projectId) {
      query.projectId = new Types.ObjectId(projectId);
    }
    return this.documentModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async findDocument(organizationId: string, id: string) {
    const document = await this.documentModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async createDocument(organizationId: string, dto: CreateDocumentDto, userId: string) {
    if (dto.projectId) {
      await this.assertProjectExists(organizationId, dto.projectId);
    }

    const document = await this.documentModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      createdByUserId: new Types.ObjectId(userId),
      title: dto.title,
      description: dto.description,
      category: dto.category,
      tags: dto.tags,
      storageKey: dto.storageKey,
      fileUrl: dto.fileUrl,
    });

    await this.notificationsService.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
      {
        type: 'document.created',
        title: 'Document created',
        message: `New document "${dto.title}" was uploaded.`,
        entityType: 'document',
        entityId: document._id.toString(),
        link: `/documents/${document._id}`,
      },
      userId,
    );

    return document;
  }

  async updateDocument(organizationId: string, id: string, dto: UpdateDocumentDto) {
    if (dto.projectId) {
      await this.assertProjectExists(organizationId, dto.projectId);
    }

    const document = await this.documentModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          ...dto,
          projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
        },
        { new: true },
      )
      .lean();

    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async removeDocument(organizationId: string, id: string) {
    const result = await this.documentModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Document not found');
    }
    return { deleted: true };
  }

  async findDocumentVersions(organizationId: string, documentId: string) {
    await this.assertDocumentExists(organizationId, documentId);
    return this.versionModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        documentId: new Types.ObjectId(documentId),
      })
      .sort({ versionNumber: -1 })
      .lean();
  }

  async createDocumentVersion(
    organizationId: string,
    documentId: string,
    dto: CreateDocumentVersionDto,
    userId: string,
  ) {
    await this.assertDocumentExists(organizationId, documentId);

    const latestVersion = await this.versionModel
      .findOne({
        organizationId: new Types.ObjectId(organizationId),
        documentId: new Types.ObjectId(documentId),
      })
      .sort({ versionNumber: -1 })
      .lean();

    const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const version = await this.versionModel.create({
      organizationId: new Types.ObjectId(organizationId),
      documentId: new Types.ObjectId(documentId),
      versionNumber,
      releaseNotes: dto.releaseNotes,
      storageKey: dto.storageKey,
      fileUrl: dto.fileUrl,
      createdByUserId: new Types.ObjectId(userId),
    });

    await this.notificationsService.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
      {
        type: 'document.version',
        title: 'New document version',
        message: `A new version (${versionNumber}) was added to document ${documentId}.`,
        entityType: 'document',
        entityId: documentId,
        link: `/documents/${documentId}`,
      },
      userId,
    );

    return version;
  }

  private async assertProjectExists(organizationId: string, projectId: string) {
    const exists = await this.projectModel.exists({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!exists) {
      throw new NotFoundException('Project not found');
    }
  }

  private async assertDocumentExists(organizationId: string, documentId: string) {
    const exists = await this.documentModel.exists({
      _id: documentId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!exists) {
      throw new NotFoundException('Document not found');
    }
  }
}
