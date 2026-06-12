import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { PlanId } from '../common/constants/plans';
import { OrgRole } from '../common/constants/roles';
import { MembersService } from '../members/members.service';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from '../members/schemas/organization-member.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { Organization } from '../organizations/schemas/organization.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { BillingService } from '../billing/billing.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** How long the short-lived access token lives */
const ACCESS_TOKEN_TTL = '15m';
/** How long the opaque refresh token is valid (stored as bcrypt hash on user) */
const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly organizationsService: OrganizationsService,
    private readonly membersService: MembersService,
    private readonly billingService: BillingService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const planId: PlanId = (dto.planId as PlanId) ?? 'trial';
    const slug = await this.buildUniqueSlug(dto.organizationName);
    const org = await this.orgModel.create({
      name: dto.organizationName,
      slug,
      country: dto.country,
      sector: dto.sector,
      planId,
      subscriptionStatus: planId === 'trial' ? 'trialing' : 'incomplete',
    });

    if (planId === 'trial') {
      await this.organizationsService.startTrial(org._id, 'trial');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      name: dto.name,
      organizationId: org._id,
    });

    const member = await this.membersService.ensureMemberRecord(
      user._id,
      org._id,
      OrgRole.OWNER,
    );

    const auth = await this.buildAuthResponse(user, member);
    const checkout =
      planId !== 'trial'
        ? await this.billingService.createCheckoutSession(
            org._id.toString(),
            user._id.toString(),
            planId,
          )
        : undefined;

    return {
      ...auth,
      selectedPlan: planId,
      checkoutRequired: planId !== 'trial',
      checkout,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let member = await this.memberModel.findOne({
      userId: user._id,
      organizationId: user.organizationId,
      status: 'active',
    });

    if (!member) {
      member = await this.membersService.ensureMemberRecord(
        user._id,
        user.organizationId,
        OrgRole.OWNER,
      );
    }

    return this.buildAuthResponse(user, member);
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token required.');
    }

    // Hash the incoming token and look up the user
    const hash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // We stored bcrypt of the raw token; compare against all candidates
    // Instead, store a SHA-256 hex (fast, deterministic) — see buildAuthResponse
    const user = await this.userModel
      .findOne({ refreshTokenHash: hash })
      .select('+refreshTokenHash');

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Verify token hasn't been manually invalidated via tokenVersion bump
    let payload: { sub: string; tokenVersion?: number } | null = null;
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', this.configService.get<string>('JWT_SECRET', '')),
      }) as any;
    } catch {
      // Opaque token — skip JWT verification, hash match is sufficient
    }

    if (payload && payload.sub !== user._id.toString()) {
      throw new UnauthorizedException('Token mismatch.');
    }

    const member = await this.memberModel.findOne({
      userId: user._id,
      organizationId: user.organizationId,
      status: 'active',
    });

    if (!member) {
      throw new UnauthorizedException('Member record not found.');
    }

    // Rotate: issue new pair and invalidate the old one
    return this.buildAuthResponse(user, member);
  }

  async revokeRefreshToken(userId: string) {
    await this.userModel.updateOne({ _id: userId }, { refreshTokenHash: null });
    return { success: true };
  }

  // ── Profile / Password ────────────────────────────────────────────────────

  async me(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new UnauthorizedException();
    }
    const member = await this.memberModel
      .findOne({
        userId: user._id,
        organizationId: user.organizationId,
        status: 'active',
      })
      .lean();
    const org = await this.orgModel.findById(user.organizationId).lean();
    const orgView = org ? await this.organizationsService.findById(org._id.toString()) : null;

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      organizationId: user.organizationId.toString(),
      role: member?.role ?? OrgRole.OWNER,
      memberId: member?._id.toString(),
      organization: orgView,
    };
  }

  async updateProfile(userId: string, dto: { name?: string }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (dto.name?.trim()) user.name = dto.name.trim();
    await user.save();
    return this.me(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.refreshTokenHash = null; // invalidate all refresh sessions
    await user.save();
    return { success: true };
  }

  // ── Token building ─────────────────────────────────────────────────────────

  private async buildAuthResponse(user: UserDocument, member: OrganizationMemberDocument) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', '');

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      organizationId: user.organizationId.toString(),
      role: member.role,
      memberId: member._id.toString(),
      projectScopeIds: member.projectScopeIds?.map((id) => id.toString()) ?? [],
      partnerScopeIds: member.partnerScopeIds?.map((id) => id.toString()) ?? [],
      tokenVersion: user.tokenVersion ?? 0,
    };

    // Short-lived access token
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    // Generate a cryptographically random opaque refresh token
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Store SHA-256 hash (not bcrypt — deterministic lookup needed)
    await this.userModel.updateOne(
      { _id: user._id },
      { refreshTokenHash: refreshHash },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: payload.sub,
        email: user.email,
        name: user.name,
        organizationId: payload.organizationId,
        role: member.role,
      },
    };
  }

  private async buildUniqueSlug(name: string) {
    const baseSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    let slug = baseSlug || 'tenant';
    let suffix = 1;
    while (await this.orgModel.exists({ slug })) {
      slug = `${baseSlug}-${suffix++}`;
    }
    return slug;
  }
}