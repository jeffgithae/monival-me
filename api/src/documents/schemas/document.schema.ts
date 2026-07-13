import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types, SchemaTypes } from 'mongoose';

@Schema({ timestamps: true })
export class Document {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'OrganizationMember' })
  createdByUserId?: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  category?: string;

  @Prop([String])
  tags?: string[];

  @Prop()
  storageKey?: string;

  @Prop()
  fileUrl?: string;
}

export type DocumentDocument = Document & MongooseDocument;
export const DocumentSchema = SchemaFactory.createForClass(Document);
