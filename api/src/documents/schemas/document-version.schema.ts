import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class DocumentVersion {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Document' })
  documentId: Types.ObjectId;

  @Prop({ required: true })
  versionNumber: number;

  @Prop()
  releaseNotes?: string;

  @Prop()
  storageKey?: string;

  @Prop()
  fileUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'OrganizationMember' })
  createdByUserId?: Types.ObjectId;
}

export type DocumentVersionDocument = DocumentVersion & MongooseDocument;
export const DocumentVersionSchema = SchemaFactory.createForClass(DocumentVersion);
