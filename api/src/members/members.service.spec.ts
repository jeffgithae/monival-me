import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MembersService } from './members.service';
import { OrganizationMember } from './schemas/organization-member.schema';
import { Invite } from './schemas/invite.schema';
import { User } from '../users/schemas/user.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { EntitlementsService } from '../organizations/entitlements.service';
import { MailerService } from '../mailer/mailer.service';
import { OrgRole } from '../common/constants/roles';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.populate = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const MEMBER_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId();

describe('MembersService', () => {
  let service: MembersService;
  let memberModel: any;
  let userModel: any;
  let orgModel: any;
  let mailer: any;

  beforeEach(async () => {
    memberModel = {
      countDocuments: jest.fn().mockResolvedValue(2),
      findById: jest.fn(),
      findOne: jest.fn().mockReturnValue(q(null)),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      create: jest.fn(),
      find: jest.fn().mockReturnValue(q([])),
    };
    userModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findById: jest.fn().mockReturnValue(q(null)),
    };
    orgModel = { findById: jest.fn().mockReturnValue(q(null)) };
    mailer = {
      send: jest.fn(),
      memberRemovedEmail: jest.fn(),
      roleUpdatedEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        {
          provide: getModelToken(OrganizationMember.name),
          useValue: memberModel,
        },
        { provide: getModelToken(Invite.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Organization.name), useValue: orgModel },
        {
          provide: EntitlementsService,
          useValue: { assertCanAddUser: jest.fn() },
        },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = module.get(MembersService);
  });

  describe('removeMember', () => {
    it("revokes the removed member's session and clears their org pointer", async () => {
      memberModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(MEMBER_ID),
        userId: USER_ID,
        role: OrgRole.ME_OFFICER,
      });

      await service.removeMember(ORG_ID, MEMBER_ID);

      // Regression guard for the owner-escalation bug: removal used to delete
      // only the membership, leaving the user's JWT valid for the rest of its
      // 8h TTL and `user.organizationId` still pointing at the org — which the
      // login path then treated as grounds to provision a fresh OWNER record.
      expect(userModel.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update] = userModel.updateOne.mock.calls[0];

      expect(filter._id).toEqual(USER_ID);
      expect(update.$inc).toEqual({ tokenVersion: 1 });
      expect(update.$unset).toHaveProperty('organizationId');
      expect(update.$set.refreshTokenHash).toBeNull();
    });

    it('scopes the user update to the organisation being removed from', async () => {
      memberModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(MEMBER_ID),
        userId: USER_ID,
        role: OrgRole.VIEWER,
      });

      await service.removeMember(ORG_ID, MEMBER_ID);

      // Without the organizationId in the filter, removing someone from org A
      // would clear a pointer that had already moved to org B.
      const [filter] = userModel.updateOne.mock.calls[0];
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
    });

    it('refuses to remove the last remaining owner', async () => {
      memberModel.countDocuments.mockResolvedValue(1);
      memberModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(MEMBER_ID),
        userId: USER_ID,
        role: OrgRole.OWNER,
      });

      await expect(service.removeMember(ORG_ID, MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(memberModel.deleteOne).not.toHaveBeenCalled();
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('throws when the member does not belong to the organisation', async () => {
      memberModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(MEMBER_ID),
        userId: USER_ID,
        role: OrgRole.VIEWER,
      });
      memberModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await expect(service.removeMember(ORG_ID, MEMBER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('ensureMemberRecord', () => {
    it('returns the existing membership without creating a second one', async () => {
      const existing = { _id: new Types.ObjectId(), role: OrgRole.VIEWER };
      memberModel.findOne.mockReturnValue(q(existing));

      const result = await service.ensureMemberRecord(
        USER_ID,
        new Types.ObjectId(ORG_ID),
        OrgRole.VIEWER,
      );

      expect(result).toBe(existing);
      expect(memberModel.create).not.toHaveBeenCalled();
    });

    it('creates the membership at exactly the role it was given', async () => {
      memberModel.findOne.mockReturnValue(q(null));
      memberModel.create.mockResolvedValue({ role: OrgRole.FIELD_OFFICER });

      await service.ensureMemberRecord(
        USER_ID,
        new Types.ObjectId(ORG_ID),
        OrgRole.FIELD_OFFICER,
      );

      // The role is a required argument precisely so that no caller can fall
      // through to an implicit OWNER default.
      expect(memberModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: OrgRole.FIELD_OFFICER,
          status: 'active',
        }),
      );
    });
  });

  describe('updateRole', () => {
    it('bumps tokenVersion so the old role cannot outlive the change', async () => {
      memberModel.findOneAndUpdate.mockResolvedValue({
        _id: new Types.ObjectId(MEMBER_ID),
        userId: USER_ID,
        role: OrgRole.ADMIN,
      });

      await service.updateRole(ORG_ID, MEMBER_ID, OrgRole.ADMIN, OrgRole.OWNER);

      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: USER_ID },
        { $inc: { tokenVersion: 1 } },
      );
    });

    it('only owners may grant the owner role', async () => {
      await expect(
        service.updateRole(ORG_ID, MEMBER_ID, OrgRole.OWNER, OrgRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(memberModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
