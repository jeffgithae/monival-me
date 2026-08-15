import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { OrgRole } from '../common/constants/roles';
import { getPlan, planHasFeature } from '../common/constants/plans';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  /** If set, renders as a section divider before this item */
  section?: string;
  /** Highlighted as a badge next to the label */
  badge?: string;
}

@Injectable()
export class NavService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMember>,
  ) {}

  async getMenu(userId: string): Promise<NavItem[]> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new UnauthorizedException();

    const member = await this.memberModel
      .findOne({ userId: user._id, organizationId: user.organizationId, status: 'active' })
      .lean();
    const role: OrgRole = (member?.role as OrgRole) ?? OrgRole.OWNER;

    const org = await this.orgModel.findById(user.organizationId).lean();
    const plan = getPlan(org?.planId);

    const hasAuditLog  = planHasFeature(plan.id, 'hasAuditLog');
    const hasApiAccess = planHasFeature(plan.id, 'hasApiAccess');
    const hasSso       = planHasFeature(plan.id, 'hasSso');
    const hasWL        = planHasFeature(plan.id, 'hasWhiteLabel');
    const hasNetworks  = planHasFeature(plan.id, 'hasMultiOrgAggregation');
    const hasEnterprise = hasApiAccess || hasSso || hasWL || hasNetworks;

    // Role helper
    const atLeast = (...roles: OrgRole[]) => roles.includes(role);

    const items: NavItem[] = [];

    /**
     * The client renders a divider on the first item carrying `section`.
     * Role gates differ per item, so which item lands first in a section
     * varies by role — this attaches the label to whichever actually does.
     */
    const seenSections = new Set<string>();
    const push = (item: NavItem, section?: string) => {
      if (section && !seenSections.has(section)) {
        seenSections.add(section);
        items.push({ ...item, section });
      } else {
        items.push(item);
      }
    };

    // ── Today ─────────────────────────────────────────────────────────────────
    // Landing + the approvals queue: the two things a user opens the app for.
    push({ id: 'dashboard', label: 'Dashboard', icon: '📊', route: '/dashboard' });
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      push({ id: 'workflows', label: 'Approvals', icon: '✅', route: '/workflows' });
    }

    // ── Plan ──────────────────────────────────────────────────────────────────
    // Designing the intervention: what we intend to do and how we measure it.
    const planSection = 'Plan';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)) {
      push({ id: 'projects', label: 'Projects', icon: '📁', route: '/projects' }, planSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      push({ id: 'workplan', label: 'Workplans', icon: '📅', route: '/workplan' }, planSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      push({ id: 'strategic', label: 'Strategic Overview', icon: '🎯', route: '/strategic' }, planSection);
      // The planning frameworks belong beside the plan they express, not in a
      // separate "Frameworks" bucket at the bottom of the menu.
      push({ id: 'bsc', label: 'Balanced Scorecard', icon: '📈', route: '/bsc' }, planSection);
      push({ id: 'okrs', label: 'OKRs', icon: '🎯', route: '/okrs' }, planSection);
    }

    // ── Collect ───────────────────────────────────────────────────────────────
    // Everything that puts evidence into the system.
    const collectSection = 'Collect';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      push({ id: 'field-collect', label: 'Field Collection', icon: '📍', route: '/field-collect' }, collectSection);
      push({ id: 'data-collection', label: 'Forms & Imports', icon: '🗂', route: '/data-collection' }, collectSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER)) {
      push({ id: 'beneficiaries', label: 'Beneficiaries', icon: '👥', route: '/beneficiaries' }, collectSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER)) {
      push({ id: 'feedback', label: 'Stakeholder Feedback', icon: '💬', route: '/feedback' }, collectSection);
    }

    // ── Funding ───────────────────────────────────────────────────────────────
    // Budget Tracking sits here rather than under Frameworks: burn rate and
    // variance are grant-management concerns and roll up to the award.
    const fundingSection = 'Funding';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)) {
      push({ id: 'donors', label: 'Donors', icon: '🤝', route: '/donors' }, fundingSection);
      push({ id: 'grants', label: 'Grants', icon: '💵', route: '/grants' }, fundingSection);
      push({ id: 'budget', label: 'Budget Tracking', icon: '💰', route: '/budget' }, fundingSection);
    }

    // ── Analyse ───────────────────────────────────────────────────────────────
    // Making sense of what was collected — read-only views over the data.
    const analyseSection = 'Analyse';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      push({ id: 'insights', label: 'Insights', icon: '💡', route: '/insights' }, analyseSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      push({ id: 'map', label: 'Map', icon: '🗺️', route: '/map' }, analyseSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)) {
      push({ id: 'roi', label: 'Cost per Impact', icon: '📐', route: '/roi' }, analyseSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      // Cross-cutting assistant — it reads the portfolio, it is not a report type.
      push({ id: 'ai', label: 'AI Copilot', icon: '✨', route: '/ai' }, analyseSection);
    }

    // ── Report ────────────────────────────────────────────────────────────────
    // Getting evidence out, in the order the reporting cycle runs.
    const reportSection = 'Report';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER)) {
      push({ id: 'reporting', label: 'Reporting Periods', icon: '📋', route: '/reporting' }, reportSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      push({ id: 'donor-reports', label: 'Donor Reports', icon: '📄', route: '/reports/donor' }, reportSection);
      // Renamed: "Reports & Data" sat beside "Donor Reports" and "Reporting
      // Periods" and read as a third kind of report. It is import/export and
      // scheduling tooling.
      push({ id: 'data-reporting', label: 'Exports & Schedules', icon: '⚙️', route: '/data-reporting' }, reportSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER)) {
      push({ id: 'stories', label: 'Impact Stories', icon: '📖', route: '/stories' }, reportSection);
      push({ id: 'documents', label: 'Documents', icon: '📂', route: '/documents' }, reportSection);
    }

    // ── Settings ──────────────────────────────────────────────────────────────
    const settingsSection = 'Settings';
    if (hasAuditLog && atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      push({ id: 'audit', label: 'Audit Log', icon: '🔍', route: '/audit' }, settingsSection);
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      push({ id: 'team', label: 'Team', icon: '👥', route: '/settings/team' }, settingsSection);
    }
    if (atLeast(OrgRole.OWNER)) {
      push({ id: 'billing', label: 'Billing', icon: '💳', route: '/settings/billing' }, settingsSection);
    }
    if (hasEnterprise && atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      const badge = plan.name;
      push({ id: 'enterprise', label: 'Enterprise', icon: '🏢', route: '/enterprise', badge }, settingsSection);
    }

    return items;
  }
}