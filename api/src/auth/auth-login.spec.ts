import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/schemas/user.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { MembersService } from '../members/members.service';
import { BillingService } from '../billing/billing.service';
import { MailerService } from '../mailer/mailer.service';
import { OrgRole } from '../common/constants/roles';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId();
const USER_ID = new Types.ObjectId();
const PASSWORD = 'CorrectHorse1!';

/**
 * Covers the login path rewritten to close the owner-escalation hole. The
 * service had no test coverage at all, so a regression here — the most
 * security-sensitive path in the product — would have shipped silently.
 */
describe('AuthService — login membership resolution', () => {
  let service: AuthService;
  let userModel: any;
  let memberModel: any;
  let membersService: any;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  function makeUser(overrides: Record<string, any> = {}) {
    return {
      _id: USER_ID,
      email: 'field.officer@ngo.test',
      name: 'Field Officer',
      passwordHash,
      organizationId: ORG_ID,
      tokenVersion: 3,
      mfaEnabled: false,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
      findById: jest.fn().mockReturnValue(q(null)),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    memberModel = { findOne: jest.fn().mockReturnValue(q(null)) };
    membersService = { ensureMemberRecord: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Organization.name), useValue: { findById: jest.fn() } },
        { provide: getModelToken(OrganizationMember.name), useValue: memberModel },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key === 'JWT_SECRET' ? 'test-secret' : fallback,
            ),
          },
        },
        { provide: OrganizationsService, useValue: {} },
        { provide: MembersService, useValue: membersService },
        { provide: BillingService, useValue: {} },
        { provide: MailerService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('signs in a user who still has an active membership', async () => {
    userModel.findOne.mockReturnValue(q(makeUser()));
    memberModel.findOne.mockReturnValue(
      q({ _id: new Types.ObjectId(), role: OrgRole.FIELD_OFFICER }),
    );

    const result: any = await service.login({
      email: 'field.officer@ngo.test',
      password: PASSWORD,
    } as any);

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(membersService.ensureMemberRecord).not.toHaveBeenCalled();
  });

  it('refuses login — and never provisions a membership — for a removed member', async () => {
    // The exact B1 shape: the membership is gone but user.organizationId still
    // points at the org. This previously created a brand-new OWNER record.
    userModel.findOne.mockReturnValue(q(makeUser()));
    memberModel.findOne.mockReturnValue(q(null));

    await expect(
      service.login({ email: 'field.officer@ngo.test', password: PASSWORD } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(membersService.ensureMemberRecord).not.toHaveBeenCalled();
  });

  it('clears the dangling organizationId so the state cannot recur', async () => {
    userModel.findOne.mockReturnValue(q(makeUser()));
    memberModel.findOne.mockReturnValue(q(null));

    await expect(
      service.login({ email: 'field.officer@ngo.test', password: PASSWORD } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $unset: { organizationId: '' } },
    );
  });

  it('treats a suspended (non-active) membership as no membership', async () => {
    userModel.findOne.mockReturnValue(q(makeUser()));
    memberModel.findOne.mockReturnValue(q(null)); // query filters status: 'active'

    await expect(
      service.login({ email: 'field.officer@ngo.test', password: PASSWORD } as any),
    ).rejects.toThrow(UnauthorizedException);

    // The membership lookup must be status-scoped, or a suspended member logs in.
    expect(memberModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('lets a user with no organisation through to onboarding', async () => {
    userModel.findOne.mockReturnValue(q(makeUser({ organizationId: undefined })));

    const result: any = await service.login({
      email: 'field.officer@ngo.test',
      password: PASSWORD,
    } as any);

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(userModel.updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      { $unset: { organizationId: '' } },
    );
  });

  it('rejects a wrong password before any membership work happens', async () => {
    userModel.findOne.mockReturnValue(q(makeUser()));

    await expect(
      service.login({ email: 'field.officer@ngo.test', password: 'wrong' } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(memberModel.findOne).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('does not resolve membership until MFA is satisfied', async () => {
    userModel.findOne.mockReturnValue(q(makeUser({ mfaEnabled: true })));

    const result: any = await service.login({
      email: 'field.officer@ngo.test',
      password: PASSWORD,
    } as any);

    expect(result.mfaRequired).toBe(true);
    expect(result.accessToken).toBeUndefined();
    expect(memberModel.findOne).not.toHaveBeenCalled();
  });
});
