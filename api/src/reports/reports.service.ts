import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
  ) {}

  async donorReport(
    organizationId: string,
    projectId: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const orgId = new Types.ObjectId(organizationId);
    const project = await this.projectModel
      .findOne({ _id: projectId, organizationId: orgId })
      .lean();
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const org = await this.orgModel.findById(orgId).lean();
    const indicators = await this.indicatorModel
      .find({ projectId: new Types.ObjectId(projectId), organizationId: orgId })
      .sort({ code: 1 })
      .lean();

    const activityFilter: Record<string, unknown> = {
      projectId: new Types.ObjectId(projectId),
      organizationId: orgId,
      status: { $in: ['approved', 'submitted'] },
    };
    if (fromDate || toDate) {
      activityFilter.activityDate = {};
      if (fromDate) {
        (activityFilter.activityDate as Record<string, Date>).$gte = new Date(fromDate);
      }
      if (toDate) {
        (activityFilter.activityDate as Record<string, Date>).$lte = new Date(toDate);
      }
    }

    const activities = await this.activityModel
      .find(activityFilter)
      .sort({ activityDate: -1 })
      .lean();

    const approvedOnly = activities.filter((a) => a.status === 'approved');
    const forProgress = approvedOnly.length > 0 ? approvedOnly : activities;

    const progressByIndicator = await Promise.all(
      indicators.map(async (indicator) => {
        const linked = forProgress.filter(
          (a) => a.indicatorId?.toString() === indicator._id.toString(),
        );
        const achieved = linked.reduce((sum, a) => sum + (a.quantity ?? 0), 0);
        const target = indicator.target;
        const baseline = indicator.baseline ?? 0;
        const percent =
          target > baseline
            ? Math.min(100, Math.round(((achieved - baseline) / (target - baseline)) * 100))
            : achieved >= target
              ? 100
              : 0;

        return {
          id: indicator._id.toString(),
          code: indicator.code,
          title: indicator.title,
          unit: indicator.unit,
          baseline,
          target,
          achieved,
          percentComplete: percent,
          activityCount: linked.length,
        };
      }),
    );

    const totalParticipants = activities.reduce((s, a) => s + (a.participants ?? 0), 0);

    return {
      generatedAt: new Date().toISOString(),
      organization: org
        ? { name: org.name, country: org.country, sector: org.sector }
        : null,
      project: {
        id: project._id.toString(),
        name: project.name,
        donor: project.donor,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      summary: {
        indicatorCount: indicators.length,
        activityCount: activities.length,
        totalParticipants,
        averageProgress:
          progressByIndicator.length > 0
            ? Math.round(
                progressByIndicator.reduce((s, i) => s + i.percentComplete, 0) /
                  progressByIndicator.length,
              )
            : 0,
      },
      indicators: progressByIndicator,
      recentActivities: activities.slice(0, 10).map((a) => ({
        id: a._id.toString(),
        title: a.title,
        activityDate: a.activityDate,
        location: a.location,
        participants: a.participants,
        quantity: a.quantity,
        indicatorId: a.indicatorId?.toString(),
      })),
    };
  }
}
