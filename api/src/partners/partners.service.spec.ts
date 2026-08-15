import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PartnersService } from './partners.service';
import { Partner } from './schemas/partner.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { AuditService } from '../audit/audit.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const PARTNER_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

function partnerDoc(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(PARTNER_ID),
    organizationId: new Types.ObjectId(ORG_ID),
    name: 'Lake Basin Development Trust',
    country: 'Kenya',
    ...overrides,
  };
}

describe('PartnersService', () => {
  let service: PartnersService;
  let partnerModel: any;
  let activityModel: { countDocuments: jest.Mock };
  let projectModel: { countDocuments: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    partnerModel = {
      find: jest.fn().mockReturnValue(q([])),
      findOne: jest.fn().mockReturnValue(q(partnerDoc())),
      findById: jest.fn().mockReturnValue(q(partnerDoc())),
      findOneAndUpdate: jest.fn().mockImplementation((_f: any, u: any) => q(partnerDoc(u))),
      create: jest.fn().mockResolvedValue(partnerDoc()),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    activityModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    projectModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnersService,
        { provide: getModelToken(Partner.name), useValue: partnerModel },
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: getModelToken(Project.name), useValue: projectModel },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(PartnersService);
  });

  describe('tenant scoping', () => {
    it('throws NotFound for a partner owned by another organisation', async () => {
      partnerModel.findOne.mockReturnValue(q(null));

      await expect(service.findOne(ORG_ID, PARTNER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scopes the list query to the caller organisation', () => {
      service.list(ORG_ID);

      const [filter] = partnerModel.find.mock.calls[0];
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
    });
  });

  describe('list filters', () => {
    it('escapes regex metacharacters in the search term', () => {
      service.list(ORG_ID, { search: 'Trust (a+)+$' });

      const [filter] = partnerModel.find.mock.calls[0];
      // A raw '(a+)+$' would be catastrophic-backtracking input to Mongo.
      expect(filter.$or[0].name.source).toContain('\\(a\\+\\)\\+\\$');
    });

    it('filters by country when supplied', () => {
      service.list(ORG_ID, { country: 'Uganda' });

      const [filter] = partnerModel.find.mock.calls[0];
      expect(filter.country).toBe('Uganda');
    });
  });

  describe('create', () => {
    it('flattens latitude/longitude into a geoPoint', async () => {
      await service.create(ORG_ID, { name: 'X', latitude: -1.29, longitude: 36.82 } as any, USER_ID);

      const [payload] = partnerModel.create.mock.calls[0];
      expect(payload.geoPoint).toEqual({ latitude: -1.29, longitude: 36.82 });
    });

    it('leaves geoPoint undefined when only one coordinate is given', async () => {
      await service.create(ORG_ID, { name: 'X', latitude: -1.29 } as any, USER_ID);

      const [payload] = partnerModel.create.mock.calls[0];
      expect(payload.geoPoint).toBeUndefined();
    });

    it('records an audit event', async () => {
      await service.create(ORG_ID, { name: 'X' } as any, USER_ID);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'partner.created', entityType: 'partner' }),
      );
    });
  });

  describe('update', () => {
    it('does not touch geoPoint when no coordinate is supplied', async () => {
      await service.update(ORG_ID, PARTNER_ID, { name: 'Renamed' } as any, USER_ID);

      const [, update] = partnerModel.findOneAndUpdate.mock.calls[0];
      expect(update).not.toHaveProperty('geoPoint');
      expect(update.name).toBe('Renamed');
    });

    it('preserves the existing coordinate when only one axis is updated', async () => {
      partnerModel.findById.mockReturnValue(
        q(partnerDoc({ geoPoint: { latitude: -1.29, longitude: 36.82 } })),
      );

      await service.update(ORG_ID, PARTNER_ID, { latitude: -1.5 } as any, USER_ID);

      const [, update] = partnerModel.findOneAndUpdate.mock.calls[0];
      expect(update.geoPoint).toEqual({ latitude: -1.5, longitude: 36.82 });
    });

    it('never writes raw latitude/longitude alongside geoPoint', async () => {
      await service.update(ORG_ID, PARTNER_ID, { latitude: -1.5, longitude: 36.8 } as any, USER_ID);

      const [, update] = partnerModel.findOneAndUpdate.mock.calls[0];
      expect(update).not.toHaveProperty('latitude');
      expect(update).not.toHaveProperty('longitude');
    });
  });

  describe('delete guard', () => {
    it('refuses to delete a partner still linked to projects', async () => {
      projectModel.countDocuments.mockResolvedValue(2);

      await expect(service.remove(ORG_ID, PARTNER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(partnerModel.deleteOne).not.toHaveBeenCalled();
    });

    it('refuses to delete a partner still linked to activities', async () => {
      activityModel.countDocuments.mockResolvedValue(7);

      await expect(service.remove(ORG_ID, PARTNER_ID, USER_ID)).rejects.toThrow(
        /7 activity\/activities/,
      );
      expect(partnerModel.deleteOne).not.toHaveBeenCalled();
    });

    it('names both link types when the partner is referenced by each', async () => {
      projectModel.countDocuments.mockResolvedValue(1);
      activityModel.countDocuments.mockResolvedValue(3);

      await expect(service.remove(ORG_ID, PARTNER_ID, USER_ID)).rejects.toThrow(
        /1 project\(s\) and 3 activity\/activities/,
      );
    });

    it('deletes and audits when the partner has no references', async () => {
      const result = await service.remove(ORG_ID, PARTNER_ID, USER_ID);

      expect(partnerModel.deleteOne).toHaveBeenCalledWith({
        _id: PARTNER_ID,
        organizationId: new Types.ObjectId(ORG_ID),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'partner.deleted', entityType: 'partner' }),
      );
      expect(result).toEqual({ deleted: true, id: PARTNER_ID });
    });

    it('scopes the reference counts to the caller organisation', async () => {
      await service.remove(ORG_ID, PARTNER_ID, USER_ID);

      const [projectFilter] = projectModel.countDocuments.mock.calls[0];
      expect(projectFilter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
      expect(projectFilter.partnerIds).toEqual(new Types.ObjectId(PARTNER_ID));
    });
  });
});
