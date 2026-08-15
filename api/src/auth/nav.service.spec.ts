import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NavService } from './nav.service';
import { User } from '../users/schemas/user.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { OrgRole } from '../common/constants/roles';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  return p;
}

const USER_ID = new Types.ObjectId().toString();
const ORG_ID = new Types.ObjectId();

describe('NavService — menu taxonomy', () => {
  let service: NavService;
  let memberModel: any;

  beforeEach(async () => {
    memberModel = { findOne: jest.fn().mockReturnValue(q({ role: OrgRole.OWNER })) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NavService,
        { provide: getModelToken(User.name), useValue: { findById: () => q({ _id: USER_ID, organizationId: ORG_ID }) } },
        // 'scale' unlocks the enterprise/audit-gated entries.
        { provide: getModelToken(Organization.name), useValue: { findById: () => q({ planId: 'scale' }) } },
        { provide: getModelToken(OrganizationMember.name), useValue: memberModel },
      ],
    }).compile();

    service = module.get(NavService);
  });

  const asRole = (role: OrgRole) => {
    memberModel.findOne.mockReturnValue(q({ role }));
    return service.getMenu(USER_ID);
  };

  /** Section label attaches to the first item of the section. */
  const sectionOf = (items: any[], id: string) => {
    const idx = items.findIndex(i => i.id === id);
    for (let i = idx; i >= 0; i--) if (items[i].section) return items[i].section;
    return null;
  };

  describe('Funding section', () => {
    it('contains donors, grants and budget', async () => {
      const items = await asRole(OrgRole.OWNER);

      expect(sectionOf(items, 'donors')).toBe('Funding');
      expect(sectionOf(items, 'grants')).toBe('Funding');
      expect(sectionOf(items, 'budget')).toBe('Funding');
    });

    it('no longer files budget under Frameworks', async () => {
      const items = await asRole(OrgRole.OWNER);

      expect(sectionOf(items, 'budget')).toBe('Funding');
    });

    it('lists budget exactly once', async () => {
      const items = await asRole(OrgRole.OWNER);

      expect(items.filter(i => i.id === 'budget')).toHaveLength(1);
    });
  });

  describe('Collect section', () => {
    it('holds every route that puts evidence into the system', async () => {
      const items = await asRole(OrgRole.OWNER);

      for (const id of ['field-collect', 'data-collection', 'beneficiaries', 'feedback']) {
        expect(sectionOf(items, id)).toBe('Collect');
      }
    });

    it('no longer files beneficiaries under Funding', async () => {
      const items = await asRole(OrgRole.OWNER);

      expect(sectionOf(items, 'beneficiaries')).not.toBe('Funding');
    });
  });

  describe('task-oriented grouping', () => {
    it('puts the planning frameworks beside the plan they express', async () => {
      const items = await asRole(OrgRole.OWNER);

      for (const id of ['projects', 'workplan', 'strategic', 'bsc', 'okrs']) {
        expect(sectionOf(items, id)).toBe('Plan');
      }
      // The old catch-all "Frameworks" section is gone.
      expect(items.map(i => i.section).filter(Boolean)).not.toContain('Frameworks');
    });

    it('groups the read-only analysis views together', async () => {
      const items = await asRole(OrgRole.OWNER);

      for (const id of ['insights', 'map', 'roi', 'ai']) {
        expect(sectionOf(items, id)).toBe('Analyse');
      }
    });

    it('keeps the reporting cycle in one section', async () => {
      const items = await asRole(OrgRole.OWNER);

      for (const id of ['reporting', 'donor-reports', 'data-reporting', 'stories', 'documents']) {
        expect(sectionOf(items, id)).toBe('Report');
      }
    });

    it('surfaces the approvals queue at the top, beside the dashboard', async () => {
      const items = await asRole(OrgRole.OWNER);

      expect(items[0].id).toBe('dashboard');
      expect(items[1].id).toBe('workflows');
      expect(items[1].label).toBe('Approvals');
      // Nothing before the first section divider except these two.
      expect(items.findIndex(i => !!i.section)).toBe(2);
    });

    it('renames the export tooling so it no longer reads as a third report type', async () => {
      const items = await asRole(OrgRole.OWNER);
      const labels = items.map(i => i.label);

      expect(labels).toContain('Exports & Schedules');
      expect(labels).not.toContain('Reports & Data');
    });
  });

  describe('role gating survives the retaxonomy', () => {
    it('gives finance the funding section but not the collection tools', async () => {
      const items = await asRole(OrgRole.FINANCE);
      const ids = items.map(i => i.id);

      expect(ids).toEqual(expect.arrayContaining(['donors', 'grants', 'budget', 'beneficiaries']));
      expect(ids).not.toContain('data-collection');
      expect(ids).not.toContain('field-collect');
    });

    it('still labels the Collect section for finance, who sees only part of it', async () => {
      const items = await asRole(OrgRole.FINANCE);

      // The divider must attach to whichever item lands first for this role —
      // finance never sees field-collect, so beneficiaries carries the label.
      expect(sectionOf(items, 'beneficiaries')).toBe('Collect');
    });

    it('gives field officers the collection tools but no funding entries', async () => {
      const items = await asRole(OrgRole.FIELD_OFFICER);
      const ids = items.map(i => i.id);

      expect(ids).toEqual(expect.arrayContaining(['beneficiaries', 'data-collection', 'field-collect']));
      expect(ids).not.toContain('donors');
      expect(ids).not.toContain('grants');
      expect(ids).not.toContain('budget');
    });

    it('does not leak settings entries to viewers', async () => {
      const items = await asRole(OrgRole.VIEWER);
      const ids = items.map(i => i.id);

      expect(ids).not.toContain('billing');
      expect(ids).not.toContain('team');
      expect(ids).not.toContain('audit');
    });
  });

  describe('section integrity', () => {
    it('never emits a section label twice', async () => {
      const items = await asRole(OrgRole.OWNER);
      const labels = items.map(i => i.section).filter(Boolean);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it('emits no duplicate menu ids for any role', async () => {
      for (const role of Object.values(OrgRole)) {
        const items = await asRole(role as OrgRole);
        const ids = items.map(i => i.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('gives every item a route', async () => {
      const items = await asRole(OrgRole.OWNER);
      expect(items.every(i => typeof i.route === 'string' && i.route.startsWith('/'))).toBe(true);
    });
  });
});
