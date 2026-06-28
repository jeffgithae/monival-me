import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { calculateProgressPct } from '../common/utils/progress';
import { OrgNetwork, OrgNetworkDocument } from './schemas/org-network.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { Grant } from '../grants/schemas/grant.schema';
import { planHasFeature } from '../common/constants/plans';

export interface CreateNetworkDto {
  name: string;
  description?: string;
}

export interface InviteMemberDto {
  organizationSlug: string;
  role?: 'lead' | 'implementing' | 'observer';
  label?: string;
  sharedIndicatorCodes?: string[];
}

export interface NetworkRollupResult {
  networkId: string;
  networkName: string;
  generatedAt: string;
  memberCount: number;
  // Aggregated indicator results
  indicators: Array<{
    code: string;
    title: string;
    unit?: string;
    totalTarget: number;
    totalAchieved: number;
    progressPct: number;
    byOrg: Array<{
      orgId: string;
      orgName: string;
      target: number;
      achieved: number;
      direction: string;
      baseline: number | null;
    }>;
  }>;
  // Aggregated activity stats
  activities: {
    total: number;
    approved: number;
    pending: number;
    totalParticipants: number;
    byOrg: Array<{ orgId: string; orgName: string; count: number; participants: number }>;
  };
  // Project portfolio. Expenditure lives on Grant, not Project (no
  // totalExpenditure field exists on Project, and a grant can fund
  // multiple projects with no recorded per-project spend split) — see
  // grantSpendByCurrency for actual spend figures, grouped by currency
  // since there's no FX-rate source anywhere in this system to blend them.
  projects: {
    total: number;
    active: number;
    completed: number;
    totalBudget: number;
    isSingleCurrency: boolean;
    grantSpendByCurrency: Array<{
      currency: string;
      grantCount: number;
      totalAwarded: number;
      totalSpent: number;
    }>;
  };
}

@Injectable()
export class NetworksService {
  constructor(
    @InjectModel(OrgNetwork.name)
    private readonly networkModel: Model<OrgNetworkDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
    @InjectModel(Indicator.name)
    private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<Project>,
    @InjectModel(Grant.name)
    private readonly grantModel: Model<Grant>,
  ) {}

  // ── Network CRUD ───────────────────────────────────────────────────────────

  async create(hubOrgId: string, dto: CreateNetworkDto): Promise<OrgNetworkDocument> {
    await this.assertAggregationEnabled(hubOrgId);
    return this.networkModel.create({
      hubOrganizationId: new Types.ObjectId(hubOrgId),
      name: dto.name,
      description: dto.description,
      members: [],
    });
  }

  async findAllForOrg(organizationId: string): Promise<OrgNetworkDocument[]> {
    const networks = await this.networkModel
      .find({
        $or: [
          { hubOrganizationId: new Types.ObjectId(organizationId) },
          { 'members.organizationId': new Types.ObjectId(organizationId), 'members.status': 'accepted' },
        ],
        isActive: true,
      })
      .populate('members.organizationId', 'name slug')
      .lean() as any[];

    return networks.map(n => ({
      ...n,
      members: n.members.map((m: any) => ({
        ...m,
        organizationName: m.organizationId?.name,
        organizationSlug: m.organizationId?.slug,
        organizationId: m.organizationId?._id?.toString() || m.organizationId?.toString(),
      }))
    })) as any;
  }

  async findOne(networkId: string, requestingOrgId: string): Promise<OrgNetworkDocument> {
    const network = await this.networkModel
      .findById(networkId)
      .populate('members.organizationId', 'name slug')
      .lean() as any;
      
    if (!network) throw new NotFoundException('Network not found.');
    this.assertNetworkAccess(network, requestingOrgId);

    return {
      ...network,
      members: network.members.map((m: any) => ({
        ...m,
        organizationName: m.organizationId?.name,
        organizationSlug: m.organizationId?.slug,
        organizationId: m.organizationId?._id?.toString() || m.organizationId?.toString(),
      }))
    } as any;
  }

  // ── Member Management ──────────────────────────────────────────────────────

  async inviteMember(
    networkId: string,
    hubOrgId: string,
    userId: string,
    dto: InviteMemberDto,
  ): Promise<OrgNetworkDocument> {
    await this.assertAggregationEnabled(hubOrgId);

    const network = await this.networkModel.findOne({
      _id: networkId,
      hubOrganizationId: new Types.ObjectId(hubOrgId),
    });
    if (!network) throw new NotFoundException('Network not found or you are not the hub organisation.');

    const searchSlug = dto.organizationSlug.trim().toLowerCase();
    const invitedOrg = await this.orgModel.findOne({ slug: searchSlug }).lean();
    if (!invitedOrg) throw new NotFoundException('Invited organisation not found by that slug.');

    const alreadyMember = network.members.some(
      m => m.organizationId.toString() === invitedOrg._id.toString(),
    );
    if (alreadyMember) throw new BadRequestException('Organisation is already a member of this network.');

    network.members.push({
      organizationId: invitedOrg._id,
      role: dto.role ?? 'implementing',
      status: 'pending',
      invitedByUserId: new Types.ObjectId(userId),
      invitedAt: new Date(),
      label: dto.label,
      sharedIndicatorCodes: dto.sharedIndicatorCodes ?? [],
    } as any);

    return network.save();
  }

  async respondToInvite(
    networkId: string,
    memberOrgId: string,
    accept: boolean,
  ): Promise<OrgNetworkDocument> {
    const network = await this.networkModel.findById(networkId);
    if (!network) throw new NotFoundException('Network not found.');

    const member = network.members.find(
      m => m.organizationId.toString() === memberOrgId && m.status === 'pending',
    );
    if (!member) throw new NotFoundException('Pending invitation not found.');

    member.status = accept ? 'accepted' : 'declined';
    if (accept) member.acceptedAt = new Date();

    return network.save();
  }

  async removeMember(
    networkId: string,
    hubOrgId: string,
    memberOrgId: string,
  ): Promise<OrgNetworkDocument> {
    const network = await this.networkModel.findOne({
      _id: networkId,
      hubOrganizationId: new Types.ObjectId(hubOrgId),
    });
    if (!network) throw new NotFoundException('Network not found.');

    network.members = network.members.filter(
      m => m.organizationId.toString() !== memberOrgId,
    ) as any;

    return network.save();
  }

  // ── Cross-org Aggregation ──────────────────────────────────────────────────

  async rollup(networkId: string, requestingOrgId: string): Promise<NetworkRollupResult> {
    await this.assertAggregationEnabled(requestingOrgId);

    const network = await this.networkModel.findById(networkId).lean() as any;
    if (!network) throw new NotFoundException('Network not found.');
    this.assertNetworkAccess(network, requestingOrgId);

    const acceptedOrgIds = network.members
      .filter((m: any) => m.status === 'accepted')
      .map((m: any) => m.organizationId);

    const allOrgIds = [network.hubOrganizationId, ...acceptedOrgIds];

    // Fetch org names
    const orgs = await this.orgModel
      .find({ _id: { $in: allOrgIds } })
      .select('_id name')
      .lean();
    const orgMap = new Map(orgs.map(o => [o._id.toString(), (o as any).name as string]));

    // ── Indicator rollup ────────────────────────────────────────────────────
    const indicators = await this.indicatorModel
      .find({ organizationId: { $in: allOrgIds } })
      .select('organizationId code title unit annualTargets lastAchievedValue baseline direction')
      .lean();

    const indByCode = new Map<string, typeof indicators>();
    for (const ind of indicators) {
      const existing = indByCode.get(ind.code) ?? [];
      existing.push(ind);
      indByCode.set(ind.code, existing);
    }

    const aggregatedIndicators = Array.from(indByCode.entries()).map(([code, inds]) => {
      const first = inds[0];
      const byOrg = inds.map(ind => {
        const target = (ind as any).annualTargets?.reduce((s: number, t: any) => s + (t.target ?? 0), 0) ?? 0;
        // Real field is lastAchievedValue — currentValue never existed on
        // the Indicator schema, so this always evaluated to 0 before.
        const achieved = (ind as any).lastAchievedValue ?? 0;
        return {
          orgId: ind.organizationId.toString(),
          orgName: orgMap.get(ind.organizationId.toString()) ?? 'Unknown',
          target,
          achieved,
          direction: (ind as any).direction ?? 'increasing',
          baseline: (ind as any).baseline ?? null,
        };
      });
      const totalTarget = byOrg.reduce((s, o) => s + o.target, 0);
      const totalAchieved = byOrg.reduce((s, o) => s + o.achieved, 0);
      // Direction is assumed consistent across orgs reporting the same
      // indicator code in a consortium (the whole point of a shared code
      // is a shared definition) — using the first org's direction/baseline
      // for the aggregate progress reading.
      const progressPct = calculateProgressPct({
        achieved: totalAchieved,
        target: totalTarget,
        baseline: byOrg[0]?.baseline,
        direction: byOrg[0]?.direction,
      });
      return {
        code,
        title: (first as any).title,
        unit: (first as any).unit,
        totalTarget,
        totalAchieved,
        progressPct: progressPct ?? 0,
        byOrg,
      };
    });

    // ── Activity rollup ──────────────────────────────────────────────────────
    const activities = await this.activityModel
      .find({ organizationId: { $in: allOrgIds } })
      .select('organizationId status participants')
      .lean();

    const actByOrg = new Map<string, { count: number; participants: number }>();
    for (const act of activities) {
      const key = act.organizationId.toString();
      const prev = actByOrg.get(key) ?? { count: 0, participants: 0 };
      actByOrg.set(key, {
        count: prev.count + 1,
        // Real field is `participants` — totalParticipants never existed
        // on the Activity schema, so this always summed to 0 before.
        participants: prev.participants + ((act as any).participants ?? 0),
      });
    }

    const actByOrgArr = Array.from(actByOrg.entries()).map(([orgId, stats]) => ({
      orgId,
      orgName: orgMap.get(orgId) ?? 'Unknown',
      ...stats,
    }));

    // ── Project rollup ───────────────────────────────────────────────────────
    const projects = await this.projectModel
      .find({ organizationId: { $in: allOrgIds } })
      .select('status totalBudget')
      .lean();

    // Expenditure lives on Grant (amountSpent), not Project — there is no
    // totalExpenditure field on Project, and a grant can fund multiple
    // projects (linkedProjects) with no recorded per-project split of its
    // spend. So rather than attribute spend to individual projects (which
    // would require guessing a split that isn't tracked anywhere), this
    // reports total grant spend at the network level, grouped by currency
    // for the same reason the ROI dashboard does — summing different
    // currencies as one number would be meaningless, and there's no
    // FX-rate source anywhere in this system.
    const grants = await this.grantModel
      .find({ organizationId: { $in: allOrgIds } })
      .select('amount amountSpent currency')
      .lean();
    const grantCurrencies = Array.from(new Set(grants.map(g => g.currency ?? 'USD')));
    const grantSpendByCurrency = grantCurrencies.map(currency => {
      const inCurrency = grants.filter(g => (g.currency ?? 'USD') === currency);
      return {
        currency,
        grantCount: inCurrency.length,
        totalAwarded: inCurrency.reduce((s, g) => s + (g.amount ?? 0), 0),
        totalSpent: inCurrency.reduce((s, g) => s + (g.amountSpent ?? 0), 0),
      };
    });

    const projectStats = {
      total: projects.length,
      active: projects.filter(p => (p as any).status === 'active').length,
      completed: projects.filter(p => (p as any).status === 'completed').length,
      totalBudget: projects.reduce((s, p) => s + ((p as any).totalBudget ?? 0), 0),
      isSingleCurrency: grantCurrencies.length <= 1,
      grantSpendByCurrency,
    };

    return {
      networkId: network._id.toString(),
      networkName: network.name,
      generatedAt: new Date().toISOString(),
      memberCount: acceptedOrgIds.length + 1,
      indicators: aggregatedIndicators,
      activities: {
        total: activities.length,
        approved: activities.filter(a => (a as any).status === 'approved').length,
        pending: activities.filter(a => (a as any).status === 'pending').length,
        totalParticipants: actByOrgArr.reduce((s, o) => s + o.participants, 0),
        byOrg: actByOrgArr,
      },
      projects: projectStats,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertAggregationEnabled(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).select('planId').lean();
    if (!org) throw new NotFoundException('Organisation not found.');
    if (!planHasFeature(org.planId, 'hasMultiOrgAggregation')) {
      throw new ForbiddenException(
        'Multi-partner aggregation is available on the Scale plan and above.',
      );
    }
  }

  private assertNetworkAccess(network: any, requestingOrgId: string) {
    const isHub = network.hubOrganizationId.toString() === requestingOrgId;
    const isMember = network.members.some(
      (m: any) => m.organizationId.toString() === requestingOrgId && m.status === 'accepted',
    );
    if (!isHub && !isMember) {
      throw new ForbiddenException('You do not have access to this network.');
    }
  }
}