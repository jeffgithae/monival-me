import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { planHasFeature } from '../common/constants/plans';

export interface CreateApiKeyDto {
  name: string;
  allowedIps?: string[];
  scopes?: string[];
  expiresAt?: string;
}

export interface ValidatedApiKeyContext {
  organizationId: string;
  keyId: string;
  scopes: string[];
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name)
    private readonly keyModel: Model<ApiKeyDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ key: string; record: Omit<ApiKeyDocument, 'keyHash'> }> {
    await this.assertApiAccessEnabled(organizationId);

    const existing = await this.keyModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      isActive: true,
    });
    if (existing >= 20) {
      throw new BadRequestException('Maximum of 20 active API keys per organisation.');
    }

    // Generate a secure random key: "mk_live_<32 random hex chars>"
    const raw = `mk_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(raw, 10);
    const keyPrefix = raw.slice(0, 8);

    const record = await this.keyModel.create({
      organizationId: new Types.ObjectId(organizationId),
      createdByUserId: new Types.ObjectId(userId),
      name: dto.name,
      keyHash,
      keyPrefix,
      allowedIps: dto.allowedIps ?? [],
      scopes: dto.scopes ?? [],
      isActive: true,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    // Return raw key ONCE — never stored again
    return { key: raw, record };
  }

  // ── List ────────────────────────────────────────────────────────────────────

  findAll(organizationId: string) {
    return this.keyModel
      .find({ organizationId: new Types.ObjectId(organizationId), isActive: true })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── Revoke ──────────────────────────────────────────────────────────────────

  async revoke(organizationId: string, keyId: string): Promise<{ revoked: boolean }> {
    const result = await this.keyModel.findOneAndUpdate(
      { _id: keyId, organizationId: new Types.ObjectId(organizationId) },
      { isActive: false },
    );
    if (!result) throw new NotFoundException('API key not found.');
    return { revoked: true };
  }

  // ── Validate (called by ApiKeyGuard) ─────────────────────────────────────

  async validate(
    rawKey: string,
    requestIp?: string,
  ): Promise<ValidatedApiKeyContext> {
    if (!rawKey.startsWith('mk_live_')) {
      throw new UnauthorizedException('Invalid API key format.');
    }

    const prefix = rawKey.slice(0, 8);
    const candidates = await this.keyModel
      .find({ keyPrefix: prefix, isActive: true })
      .lean();

    for (const candidate of candidates) {
      const match = await bcrypt.compare(rawKey, candidate.keyHash);
      if (!match) continue;

      if (candidate.expiresAt && candidate.expiresAt < new Date()) {
        throw new UnauthorizedException('API key has expired.');
      }

      if (candidate.allowedIps.length > 0 && requestIp) {
        if (!candidate.allowedIps.includes(requestIp)) {
          throw new ForbiddenException('Request IP is not in the allowed list for this API key.');
        }
      }

      // Update usage stats asynchronously (non-blocking)
      this.keyModel
        .updateOne(
          { _id: candidate._id },
          { $inc: { useCount: 1 }, $set: { lastUsedAt: new Date() } },
        )
        .catch(() => undefined);

      return {
        organizationId: candidate.organizationId.toString(),
        keyId: candidate._id.toString(),
        scopes: candidate.scopes,
      };
    }

    throw new UnauthorizedException('Invalid or revoked API key.');
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async assertApiAccessEnabled(organizationId: string) {
    const org = await this.orgModel
      .findById(organizationId)
      .select('planId')
      .lean();
    if (!org) throw new NotFoundException('Organisation not found.');
    if (!planHasFeature(org.planId, 'hasApiAccess')) {
      throw new ForbiddenException(
        'API key access is available on the Organization plan and above. Upgrade to enable it.',
      );
    }
  }
}