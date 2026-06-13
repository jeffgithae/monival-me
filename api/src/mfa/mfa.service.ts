import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User, UserDocument } from '../users/schemas/user.schema';

const BACKUP_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  // ── Enrolment ──────────────────────────────────────────────────────────────

  async enrollStart(userId: string): Promise<{ qrCodeDataUrl: string; secret: string }> {
    const user = await this.userModel.findById(userId).select('+mfaSecret');
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled. Disable it first to re-enrol.');
    }

    const secretObj = speakeasy.generateSecret({ length: 32 });
    const secret    = secretObj.base32;
    const appName   = this.config.get('APP_NAME', 'Monival');

    const otpAuthUrl = speakeasy.otpauthURL({
      secret,
      label:    encodeURIComponent(user.email),
      issuer:   appName,
      encoding: 'base32',
    });

    await this.userModel.updateOne({ _id: userId }, { mfaSecret: secret });

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
    return { qrCodeDataUrl, secret };
  }

  async enrollVerify(userId: string, totpCode: string): Promise<{ backupCodes: string[] }> {
    const user = await this.userModel.findById(userId).select('+mfaSecret +mfaBackupCodes');
    if (!user || !user.mfaSecret) {
      throw new BadRequestException('MFA enrolment not started. Call /mfa/enroll first.');
    }

    const valid = speakeasy.totp.verify({
      secret:   user.mfaSecret,
      encoding: 'base32',
      token:    totpCode,
      window:   1,
    });
    if (!valid) {
      throw new BadRequestException('Invalid TOTP code. Check your authenticator app and try again.');
    }

    const rawCodes    = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
    const hashedCodes = await Promise.all(rawCodes.map(c => bcrypt.hash(c, 10)));

    await this.userModel.updateOne(
      { _id: userId },
      { mfaEnabled: true, mfaBackupCodes: hashedCodes },
    );

    return { backupCodes: rawCodes };
  }

  // ── Verification (login flow) ─────────────────────────────────────────────

  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('+mfaSecret +mfaBackupCodes');
    if (!user || !user.mfaEnabled || !user.mfaSecret) return false;

    const totpValid = speakeasy.totp.verify({
      secret:   user.mfaSecret,
      encoding: 'base32',
      token:    code,
      window:   1,
    });
    if (totpValid) return true;

    // Try backup codes
    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      const match = await bcrypt.compare(code, user.mfaBackupCodes[i]);
      if (match) {
        user.mfaBackupCodes.splice(i, 1);
        await user.save();
        return true;
      }
    }

    return false;
  }

  // ── Disable ────────────────────────────────────────────────────────────────

  async disable(userId: string, totpCode: string): Promise<{ disabled: boolean }> {
    const user = await this.userModel.findById(userId).select('+mfaSecret');
    if (!user) throw new UnauthorizedException();
    if (!user.mfaEnabled) throw new BadRequestException('MFA is not enabled.');

    const valid = speakeasy.totp.verify({
      secret:   user.mfaSecret!,
      encoding: 'base32',
      token:    totpCode,
      window:   1,
    });
    if (!valid) throw new BadRequestException('Invalid TOTP code.');

    await this.userModel.updateOne(
      { _id: userId },
      { mfaEnabled: false, mfaSecret: undefined, mfaBackupCodes: [] },
    );

    return { disabled: true };
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async status(userId: string): Promise<{ mfaEnabled: boolean; backupCodesRemaining: number }> {
    const user = await this.userModel.findById(userId).select('+mfaBackupCodes');
    if (!user) throw new UnauthorizedException();
    return {
      mfaEnabled:          user.mfaEnabled,
      backupCodesRemaining: user.mfaBackupCodes?.length ?? 0,
    };
  }
}