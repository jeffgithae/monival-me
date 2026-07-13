import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types, SchemaTypes } from 'mongoose';

@Schema({ timestamps: true })
export class DocumentVersion {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Document' })
  documentId: Types.ObjectId;

  @Prop({ required: true })
  versionNumber: number;

  @Prop()
  releaseNotes?: string;

  @Prop()
  storageKey?: string;

  @Prop()
  fileUrl?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'OrganizationMember' })
  createdByUserId?: Types.ObjectId;
}

export type DocumentVersionDocument = DocumentVersion & MongooseDocument;
export const DocumentVersionSchema = SchemaFactory.createForClass(DocumentVersion);

// ─── Indexes ──────────────────────────────────────────────────────────────────
DocumentVersionSchema.index({ organizationId: 1, documentId: 1, versionNumber: -1 });
DocumentVersionSchema.index({ documentId: 1 });