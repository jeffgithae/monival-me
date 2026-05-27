import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
  ) {}

  async overview(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const [projectCount, indicatorCount, activityCount, memberCount, recentActivities] =
      await Promise.all([
        this.projectModel.countDocuments({ organizationId: orgId }),
        this.indicatorModel.countDocuments({ organizationId: orgId }),
        this.activityModel.countDocuments({ organizationId: orgId }),
        this.memberModel.countDocuments({ organizationId: orgId, status: 'active' }),
        this.activityModel
          .find({ organizationId: orgId })
          .sort({ activityDate: -1 })
          .limit(5)
          .lean(),
      ]);

    const pendingApproval = await this.activityModel.countDocuments({
      organizationId: orgId,
      status: 'submitted',
    });

    const projects = await this.projectModel
      .find({ organizationId: orgId, status: 'active' })
      .select('name donor status startDate endDate')
      .lean();

    const projectIds = projects.map((project) => project._id);
    const indicatorsByProject = await this.indicatorModel.aggregate([
      { $match: { organizationId: orgId, projectId: { $in: projectIds } } },
      {
        $group: {
          _id: '$projectId',
          count: { $sum: 1 },
        },
      },
    ]);
    const activitiesByProject = await this.activityModel.aggregate([
      {
        $match: {
          organizationId: orgId,
          projectId: { $in: projectIds },
          status: { $in: ['approved', 'submitted', 'draft'] },
        },
      },
      {
        $group: {
          _id: '$projectId',
          lastActivity: { $max: '$activityDate' },
          count: { $sum: 1 },
        },
      },
    ]);

    const indicatorMap = new Map(indicatorsByProject.map((item) => [item._id.toString(), item.count]));
    const activityMap = new Map(
      activitiesByProject.map((item) => [item._id.toString(), item]),
    );

    const health = {
      onTrack: 0,
      atRisk: 0,
      behind: 0,
      noBaseline: 0,
    };
    const qualityAlerts: Array<{ projectId?: string; title: string; message: string; severity: 'critical' | 'warning' | 'info' }> = [];

    const now = new Date();
    for (const project of projects) {
      const projectId = project._id.toString();
      const indicatorCountForProject = indicatorMap.get(projectId) ?? 0;
      const activitySummary = activityMap.get(projectId);
      const lastActivity = activitySummary?.lastActivity ? new Date(activitySummary.lastActivity) : null;
      const daysSinceLast = lastActivity
        ? Math.ceil((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      if (!indicatorCountForProject) {
        health.noBaseline += 1;
        qualityAlerts.push({
          projectId,
          title: project.name,
          message: 'No indicators defined for this project.',
          severity: 'critical',
        });
      } else if (daysSinceLast === null) {
        health.behind += 1;
        qualityAlerts.push({
          projectId,
          title: project.name,
          message: 'No activity data has been captured yet.',
          severity: 'warning',
        });
      } else if (daysSinceLast > 60) {
        health.behind += 1;
        qualityAlerts.push({
          projectId,
          title: project.name,
          message: `Last activity was ${daysSinceLast} days ago. Field updates may be stale.`,
          severity: 'warning',
        });
      } else if (daysSinceLast > 30) {
        health.atRisk += 1;
        qualityAlerts.push({
          projectId,
          title: project.name,
          message: `No activity update in the last ${daysSinceLast} days.`,
          severity: 'info',
        });
      } else {
        health.onTrack += 1;
      }

      if (project.endDate && new Date(project.endDate) < now) {
        qualityAlerts.push({
          projectId,
          title: project.name,
          message: 'Project end date has passed; verify completion status and reports.',
          severity: 'warning',
        });
      }
    }

    return {
      counts: {
        projects: projectCount,
        indicators: indicatorCount,
        activities: activityCount,
        members: memberCount,
        pendingApprovals: pendingApproval,
      },
      activeProjects: projects.slice(0, 6),
      recentActivities: recentActivities.map((a) => ({
        id: a._id.toString(),
        title: a.title,
        activityDate: a.activityDate,
        status: a.status,
        projectId: a.projectId.toString(),
      })),
      health,
      qualityAlerts,
    };
  }
}
