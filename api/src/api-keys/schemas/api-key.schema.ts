import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId!: Types.ObjectId;

  /** Human-readable label, e.g. "DHIS2 integration" */
  @Prop({ required: true, trim: true })
  name!: string;

  /**
   * bcrypt hash of the raw key (raw key is shown ONCE on creation, never stored).
   * Prefix stored separately for quick lookup without full scan.
   */
  @Prop({ required: true })
  keyHash!: string;

  /** First 8 chars of the raw key — used to identify which key was used */
  @Prop({ required: true, index: true })
  keyPrefix!: string;

  /** Optional IP allowlist — empty means unrestricted */
  @Prop({ type: [String], default: [] })
  allowedIps!: string[];

  /** Scopes this key is limited to, e.g. ['indicators:read', 'activities:read'] */
  @Prop({ type: [String], default: [] })
  scopes!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  expiresAt?: Date;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: 0 })
  useCount!: number;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ organizationId: 1, isActive: 1 });
ApiKeySchema.index({ keyPrefix: 1 });