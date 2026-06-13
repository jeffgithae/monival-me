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

    // ── Core ──────────────────────────────────────────────────────────────────
    items.push({ id: 'dashboard', label: 'Dashboard', icon: '📊', route: '/dashboard' });

    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)) {
      items.push({ id: 'projects', label: 'Projects', icon: '📁', route: '/projects' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      items.push({ id: 'workplan', label: 'Workplans', icon: '📅', route: '/workplan' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      items.push({ id: 'workflows', label: 'Workflows', icon: '✅', route: '/workflows' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)) {
      items.push({ id: 'data-collection', label: 'Data Collection', icon: '🗂', route: '/data-collection' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      items.push({ id: 'data-reporting', label: 'Reports & Data', icon: '📊', route: '/data-reporting' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      items.push({ id: 'strategic', label: 'Strategic Overview', icon: '🎯', route: '/strategic' });
    }

    // ── Funding ───────────────────────────────────────────────────────────────
    const fundingSection = 'Funding';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)) {
      items.push({ id: 'beneficiaries', label: 'Beneficiaries', icon: '👥', route: '/beneficiaries', section: fundingSection });
      items.push({ id: 'donors', label: 'Donors', icon: '🤝', route: '/donors' });
      items.push({ id: 'grants', label: 'Grants', icon: '💵', route: '/grants' });
    } else if (atLeast(OrgRole.FIELD_OFFICER)) {
      items.push({ id: 'beneficiaries', label: 'Beneficiaries', icon: '👥', route: '/beneficiaries', section: fundingSection });
    }

    // ── Reporting ─────────────────────────────────────────────────────────────
    const reportingSection = 'Reporting';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      items.push({ id: 'reporting', label: 'Reporting Periods', icon: '📋', route: '/reporting', section: reportingSection });
      items.push({ id: 'ai', label: 'AI Copilot', icon: '✨', route: '/ai' });
      items.push({ id: 'donor-reports', label: 'Donor Reports', icon: '📄', route: '/reports/donor' });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER)) {
      if (!items.find(i => i.id === 'reporting')) {
        items.push({ id: 'reporting', label: 'Reporting Periods', icon: '📋', route: '/reporting', section: reportingSection });
      }
      items.push({ id: 'documents', label: 'Documents', icon: '📂', route: '/documents' });
    }

    // ── Frameworks ────────────────────────────────────────────────────────────
    const frameworkSection = 'Frameworks';
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)) {
      items.push({ id: 'budget', label: 'Budget Tracking', icon: '💰', route: '/budget', section: frameworkSection });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)) {
      items.push({ id: 'bsc', label: 'Balanced Scorecard', icon: '📈', route: '/bsc' });
      items.push({ id: 'okrs', label: 'OKRs', icon: '🎯', route: '/okrs' });
    }

    // ── Settings ──────────────────────────────────────────────────────────────
    const settingsSection = 'Settings';
    if (hasAuditLog && atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      items.push({ id: 'audit', label: 'Audit Log', icon: '🔍', route: '/audit', section: settingsSection });
    }
    if (atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      if (!items.find(i => i.id === 'audit')) {
        items.push({ id: 'team', label: 'Team', icon: '👥', route: '/settings/team', section: settingsSection });
      } else {
        items.push({ id: 'team', label: 'Team', icon: '👥', route: '/settings/team' });
      }
    }
    if (atLeast(OrgRole.OWNER)) {
      items.push({ id: 'billing', label: 'Billing', icon: '💳', route: '/settings/billing' });
    }
    if (hasEnterprise && atLeast(OrgRole.OWNER, OrgRole.ADMIN)) {
      const badge = plan.name;
      items.push({ id: 'enterprise', label: 'Enterprise', icon: '🏢', route: '/enterprise', badge });
    }

    return items;
  }
}