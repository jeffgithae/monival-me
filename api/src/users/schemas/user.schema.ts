import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: false })
  passwordHash!: string;

  /** Google OAuth subject ID — set when user signs in/up via Google */
  @Prop({ type: String, sparse: true, unique: true })
  googleId?: string;

  /** URL to the user's Google profile picture */
  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: false })
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

  // ── Password Reset ─────────────────────────────────────────────────────────

  @Prop({ type: String, default: null, select: false })
  resetPasswordToken?: string | null;

  @Prop({ type: Date, default: null, select: false })
  resetPasswordExpires?: Date | null;

  // ── MFA / TOTP ─────────────────────────────────────────────────────────────

  /** Whether TOTP 2FA is active for this user */
  @Prop({ default: false })
  mfaEnabled!: boolean;

  /** Base32 TOTP secret — never returned in API responses */
  @Prop({ select: false })
  mfaSecret?: string;

  /** Hashed one-time backup codes, consumed on use */
  @Prop({ type: [String], default: [], select: false })
  mfaBackupCodes!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ organizationId: 1 });
UserSchema.index({ email: 1 }, { unique: true });