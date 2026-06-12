import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;

  /**
   * Incremented on password change or forced logout.
   * JWT validation checks this matches the token's tokenVersion claim —
   * mismatches reject the token immediately without waiting for expiry.
   */
  @Prop({ default: 0 })
  tokenVersion!: number;

  /** bcrypt hash of the most recent refresh token. Null = no active refresh session. */
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash!: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ organizationId: 1 });
UserSchema.index({ email: 1 }, { unique: true });