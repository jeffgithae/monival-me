import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrgNetwork, OrgNetworkDocument } from './schemas/org-network.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { planHasFeature } from '../common/constants/plans';

export interface CreateNetworkDto {
  name: string;
  description?: string;
}

export interface InviteMemberDto {
  organizationId: string;
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
  // Project portfolio
  projects: {
    total: number;
    active: number;
    completed: number;
    totalBudget: number;
    totalExpenditure: number;
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
    return this.networkModel
      .find({
        $or: [
          { hubOrganizationId: new Types.ObjectId(organizationId) },
          { 'members.organizationId': new Types.ObjectId(organizationId), 'members.status': 'accepted' },
        ],
        isActive: true,
      })
      .lean() as any;
  }

  async findOne(networkId: string, requestingOrgId: string): Promise<OrgNetworkDocument> {
    const network = await this.networkModel.findById(networkId).lean() as any;
    if (!network) throw new NotFoundException('Network not found.');
    this.assertNetworkAccess(network, requestingOrgId);
    return network;
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

    const alreadyMember = network.members.some(
      m => m.organizationId.toString() === dto.organizationId,
    );
    if (alreadyMember) throw new BadRequestException('Organisation is already a member of this network.');

    const invitedOrg = await this.orgModel.findById(dto.organizationId).lean();
    if (!invitedOrg) throw new NotFoundException('Invited organisation not found.');

    network.members.push({
      organizationId: new Types.ObjectId(dto.organizationId),
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
      .select('organizationId code title unit annualTargets currentValue')
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
        const achieved = (ind as any).currentValue ?? 0;
        return {
          orgId: ind.organizationId.toString(),
          orgName: orgMap.get(ind.organizationId.toString()) ?? 'Unknown',
          target,
          achieved,
        };
      });
      const totalTarget = byOrg.reduce((s, o) => s + o.target, 0);
      const totalAchieved = byOrg.reduce((s, o) => s + o.achieved, 0);
      return {
        code,
        title: (first as any).title,
        unit: (first as any).unit,
        totalTarget,
        totalAchieved,
        progressPct: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0,
        byOrg,
      };
    });

    // ── Activity rollup ──────────────────────────────────────────────────────
    const activities = await this.activityModel
      .find({ organizationId: { $in: allOrgIds } })
      .select('organizationId status totalParticipants')
      .lean();

    const actByOrg = new Map<string, { count: number; participants: number }>();
    for (const act of activities) {
      const key = act.organizationId.toString();
      const prev = actByOrg.get(key) ?? { count: 0, participants: 0 };
      actByOrg.set(key, {
        count: prev.count + 1,
        participants: prev.participants + ((act as any).totalParticipants ?? 0),
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
      .select('status totalBudget totalExpenditure')
      .lean();

    const projectStats = {
      total: projects.length,
      active: projects.filter(p => (p as any).status === 'active').length,
      completed: projects.filter(p => (p as any).status === 'completed').length,
      totalBudget: projects.reduce((s, p) => s + ((p as any).totalBudget ?? 0), 0),
      totalExpenditure: projects.reduce((s, p) => s + ((p as any).totalExpenditure ?? 0), 0),
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