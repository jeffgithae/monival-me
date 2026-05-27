import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { OrgRole } from '../common/constants/roles';
import { EntitlementsService } from '../organizations/entitlements.service';
import { User } from '../users/schemas/user.schema';
import { Invite } from './schemas/invite.schema';
import { OrganizationMember } from './schemas/organization-member.schema';

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
    @InjectModel(Invite.name) private readonly inviteModel: Model<Invite>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly entitlements: EntitlementsService,
  ) {}

  async ensureMemberRecord(
    userId: Types.ObjectId,
    organizationId: Types.ObjectId,
    role: OrgRole = OrgRole.OWNER,
  ) {
    const existing = await this.memberModel.findOne({ userId, organizationId });
    if (existing) {
      return existing;
    }
    return this.memberModel.create({
      userId,
      organizationId,
      role,
      status: 'active',
      joinedAt: new Date(),
    });
  }

  async list(organizationId: string) {
    const members = await this.memberModel
      .find({ organizationId: new Types.ObjectId(organizationId), status: 'active' })
      .populate('userId', 'email name')
      .lean();
    return members.map((m) => {
      const populated = m.userId as unknown as {
        _id: Types.ObjectId;
        email: string;
        name: string;
      };
      return {
        id: m._id.toString(),
        userId: populated._id.toString(),
        email: populated.email,
        name: populated.name,
        role: m.role,
        joinedAt: m.joinedAt,
      };
    });
  }

  async listInvites(organizationId: string) {
    return this.inviteModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        acceptedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  async invite(
    organizationId: string,
    invitedByUserId: string,
    email: string,
    role: OrgRole,
  ) {
    await this.entitlements.assertCanAddMember(organizationId);
    const normalized = email.toLowerCase().trim();

    const existingUser = await this.userModel.findOne({ email: normalized });
    if (existingUser) {
      const member = await this.memberModel.findOne({
        userId: existingUser._id,
        organizationId: new Types.ObjectId(organizationId),
      });
      if (member?.status === 'active') {
        throw new ConflictException('User is already a member of this organisation');
      }
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.inviteModel.deleteMany({
      organizationId: new Types.ObjectId(organizationId),
      email: normalized,
      acceptedAt: { $exists: false },
    });

    const invite = await this.inviteModel.create({
      email: normalized,
      organizationId: new Types.ObjectId(organizationId),
      invitedByUserId: new Types.ObjectId(invitedByUserId),
      role,
      token,
      expiresAt,
    });

    return {
      id: invite._id.toString(),
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      acceptUrl: `/accept-invite?token=${invite.token}`,
    };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.inviteModel.findOne({ token });
    if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
      throw new NotFoundException('Invite not found or expired');
    }

    const user = await this.userModel.findById(userId);
    if (!user || user.email !== invite.email) {
      throw new ForbiddenException('Invite email must match your account email');
    }

    await this.memberModel.findOneAndUpdate(
      { userId: user._id, organizationId: invite.organizationId },
      {
        userId: user._id,
        organizationId: invite.organizationId,
        role: invite.role,
        status: 'active',
        joinedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    user.organizationId = invite.organizationId;
    await user.save();

    invite.acceptedAt = new Date();
    await invite.save();

    return {
      organizationId: invite.organizationId.toString(),
      role: invite.role,
    };
  }

  async updateRole(organizationId: string, memberId: string, role: OrgRole, actorRole: OrgRole) {
    if (role === OrgRole.OWNER && actorRole !== OrgRole.OWNER) {
      throw new ForbiddenException('Only owners can assign the owner role');
    }
    const member = await this.memberModel.findOneAndUpdate(
      { _id: memberId, organizationId: new Types.ObjectId(organizationId) },
      { role },
      { new: true },
    );
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  async removeMember(organizationId: string, memberId: string) {
    const owners = await this.memberModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      role: OrgRole.OWNER,
      status: 'active',
    });
    const target = await this.memberModel.findById(memberId);
    if (target?.role === OrgRole.OWNER && owners <= 1) {
      throw new ForbiddenException('Cannot remove the only owner');
    }
    const result = await this.memberModel.deleteOne({
      _id: memberId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Member not found');
    }
    return { deleted: true };
  }
}
