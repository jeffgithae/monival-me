import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  // Never returned by a query unless asked for with `.select('+passwordHash')`:
  // a user document that ends up in a response must not carry it.
  @Prop({ required: false, select: false })
  passwordHash!: string;

  /** Google OAuth subject ID — set when user signs in/up via Google */
  @Prop({ type: String, sparse: true, unique: true })
  googleId?: string;

  /** URL to the user's Google profile picture */
  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: false })
  organizationId!: Types.ObjectId;

  /**
   * Incremented on password change or forced logout.
   * JWT validation checks this matches the token's tokenVersion claim —
   * mismatches reject the token immediately without waiting for expiry.
   */
  @Prop({ default: 0 })
  tokenVersion!: number;

  /** SHA-256 hash of the most recent refresh token. Null = no active refresh session. */
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash!: string | null;

  /**
   * Hash of the refresh token that was just rotated out. Honoured for a short
   * grace window so a concurrent tab/reload that raced the rotation isn't
   * logged out when it presents the previous token.
   */
  @Prop({ type: String, default: null, select: false })
  prevRefreshTokenHash?: string | null;

  @Prop({ type: Date, default: null, select: false })
  prevRefreshTokenGraceUntil?: Date | null;

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
