import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AuditService } from './audit.service';
import { AuditEvent } from './schemas/audit-event.schema';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.skip = () => p;
  p.limit = () => p;
  p.populate = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

describe('AuditService', () => {
  let service: AuditService;
  let model: any;

  beforeEach(async () => {
    model = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(q([])),
      countDocuments: jest.fn().mockResolvedValue(0),
      db: { model: () => ({ find: () => q([]) }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken(AuditEvent.name), useValue: model },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  describe('recording a change', () => {
    it('stores before/after/reason so the diff view has something to render', async () => {
      await service.record({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        action: 'donor.updated',
        entityType: 'donor',
        entityId: 'd1',
        before: { name: 'Old' },
        after: { name: 'New' },
        reason: 'Rename per agreement',
      });

      const [doc] = model.create.mock.calls[0];
      expect(doc.metadata.before).toEqual({ name: 'Old' });
      expect(doc.metadata.after).toEqual({ name: 'New' });
      expect(doc.metadata.reason).toBe('Rename per agreement');
    });

    it('preserves caller metadata alongside the diff', async () => {
      await service.record({
        organizationId: ORG_ID, action: 'grant.updated', entityType: 'Grant',
        metadata: { fields: ['amount'] }, before: { amount: 1 }, after: { amount: 2 },
      });

      const [doc] = model.create.mock.calls[0];
      expect(doc.metadata.fields).toEqual(['amount']);
      expect(doc.metadata.after).toEqual({ amount: 2 });
    });

    it('omits the diff keys entirely when not supplied', async () => {
      await service.record({ organizationId: ORG_ID, action: 'x.y', entityType: 'X' });

      const [doc] = model.create.mock.calls[0];
      expect(doc.metadata).not.toHaveProperty('before');
      expect(doc.metadata).not.toHaveProperty('after');
    });

    it('redacts secrets out of a snapshot', async () => {
      await service.record({
        organizationId: ORG_ID, action: 'integration.updated', entityType: 'Integration',
        after: {
          name: 'Kobo',
          apiKey: 'super-secret',
          nested: { clientSecret: 'also-secret', harmless: 'keep' },
        },
      });

      const [doc] = model.create.mock.calls[0];
      expect(doc.metadata.after.apiKey).toBe('[redacted]');
      expect(doc.metadata.after.nested.clientSecret).toBe('[redacted]');
      expect(doc.metadata.after.nested.harmless).toBe('keep');
      expect(doc.metadata.after.name).toBe('Kobo');
    });

    it('redacts inside arrays too', async () => {
      await service.record({
        organizationId: ORG_ID, action: 'x.y', entityType: 'X',
        after: { creds: [{ token: 'abc', label: 'prod' }] },
      });

      const [doc] = model.create.mock.calls[0];
      expect(doc.metadata.after.creds[0].token).toBe('[redacted]');
      expect(doc.metadata.after.creds[0].label).toBe('prod');
    });
  });

  describe('listing', () => {
    it('lifts before/after/reason to the top level for the UI', async () => {
      model.find.mockReturnValue(q([
        {
          _id: 'e1',
          entityType: 'donor',
          actorUserId: { _id: USER_ID, email: 'me@org.test' },
          metadata: { before: { a: 1 }, after: { a: 2 }, reason: 'why' },
        },
      ]));

      const { data } = await service.list(ORG_ID, {});

      // The UI reads e.before / e.after / e.reason at top level; they used to
      // live only inside metadata, so the diff panel never rendered.
      expect(data[0].before).toEqual({ a: 1 });
      expect(data[0].after).toEqual({ a: 2 });
      expect(data[0].reason).toBe('why');
      expect(data[0].entity).toBe('donor');
      expect(data[0].userEmail).toBe('me@org.test');
    });

    it('leaves the diff fields undefined when an event has none', async () => {
      model.find.mockReturnValue(q([{ _id: 'e1', entityType: 'x', metadata: {} }]));

      const { data } = await service.list(ORG_ID, {});

      expect(data[0].before).toBeUndefined();
      expect(data[0].after).toBeUndefined();
    });
  });
});
