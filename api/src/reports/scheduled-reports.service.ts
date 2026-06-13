import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { ScheduledReport, ScheduledReportDocument, ReportCadence } from './schemas/scheduled-report.schema';
import { ReportsService } from './reports.service';
import { MailerService } from '../mailer/mailer.service';
import { Organization } from '../organizations/schemas/organization.schema';
import { Project } from '../projects/schemas/project.schema';
import { User } from '../users/schemas/user.schema';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto';

@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    @InjectModel(ScheduledReport.name)
    private readonly scheduledModel: Model<ScheduledReportDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<Project>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly reportsService: ReportsService,
    private readonly mailer: MailerService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  findAll(organizationId: string, projectId?: string) {
    const q: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (projectId) q['projectId'] = new Types.ObjectId(projectId);
    return this.scheduledModel.find(q).sort({ createdAt: -1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const doc = await this.scheduledModel.findOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!doc) throw new NotFoundException('Scheduled report not found');
    return doc;
  }

  async create(organizationId: string, userId: string, dto: CreateScheduledReportDto) {
    const nextRunAt = this.computeNextRun(dto.cadence, dto.dayOfMonth ?? 1);
    return this.scheduledModel.create({
      organizationId:    new Types.ObjectId(organizationId),
      projectId:         new Types.ObjectId(dto.projectId),
      reportingPeriodId: dto.reportingPeriodId ? new Types.ObjectId(dto.reportingPeriodId) : undefined,
      name:              dto.name,
      recipients:        dto.recipients,
      cadence:           dto.cadence as ReportCadence,
      dayOfMonth:        dto.dayOfMonth ?? 1,
      includeCsv:        dto.includeCsv ?? true,
      isActive:          true,
      nextRunAt,
      createdBy:         new Types.ObjectId(userId),
    });
  }

  async update(organizationId: string, id: string, dto: UpdateScheduledReportDto) {
    const update: Record<string, unknown> = { ...dto };
    if (dto.cadence || dto.dayOfMonth) {
      update['nextRunAt'] = this.computeNextRun(dto.cadence ?? 'monthly', dto.dayOfMonth ?? 1);
    }
    const doc = await this.scheduledModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      update,
      { new: true },
    ).lean();
    if (!doc) throw new NotFoundException('Scheduled report not found');
    return doc;
  }

  async remove(organizationId: string, id: string) {
    const r = await this.scheduledModel.deleteOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (r.deletedCount === 0) throw new NotFoundException('Scheduled report not found');
    return { deleted: true };
  }

  /** Manually trigger a report delivery immediately */
  async triggerNow(organizationId: string, id: string) {
    const schedule = await this.findOne(organizationId, id);
    await this.deliverReport(schedule as ScheduledReportDocument);
    return { triggered: true };
  }

  // ── Cron — runs every hour, checks which schedules are due ────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async runDueReports() {
    if (!this.mailer.isConfigured) return;

    const due = await this.scheduledModel.find({
      isActive: true,
      nextRunAt: { $lte: new Date() },
    }).lean();

    if (due.length === 0) return;
    this.logger.log(`Scheduled reports: ${due.length} due for delivery`);

    for (const schedule of due) {
      try {
        await this.deliverReport(schedule as unknown as ScheduledReportDocument);
      } catch (err) {
        this.logger.error(`Failed to deliver scheduled report ${String(schedule._id)}`, err);
      }
    }
  }

  // ── Delivery ──────────────────────────────────────────────────────────────

  private async deliverReport(schedule: ScheduledReportDocument) {
    const orgId     = schedule.organizationId.toString();
    const projectId = schedule.projectId.toString();
    const periodId  = schedule.reportingPeriodId?.toString();

    const [org, project] = await Promise.all([
      this.orgModel.findById(orgId).select('name').lean(),
      this.projectModel.findById(projectId).select('name').lean(),
    ]);

    if (!org || !project) {
      this.logger.warn(`Scheduled report ${String(schedule._id)}: org or project not found`);
      return;
    }

    // Fetch the report data
    const reportData = await this.reportsService.donorReport(
      orgId, projectId, undefined, undefined, periodId, 'system',
    );

    const csvBuffer = schedule.includeCsv
      ? Buffer.from(await this.reportsService.donorReportCsv(
          orgId, projectId, undefined, undefined, periodId, 'system',
        ) as string)
      : undefined;

    const appUrl = process.env['APP_URL'] ?? 'https://app.monival.app';
    const reportUrl = `${appUrl}/projects/${projectId}?tab=report`;
    const periodName = (reportData as any).reportingPeriod?.name ?? 'Latest period';

    // Send to each recipient
    for (const email of schedule.recipients) {
      const recipientName = await this.userModel
        .findOne({ email })
        .select('name')
        .lean()
        .then(u => u?.name ?? 'Team member');

      const body = this.mailer.reportEmail({
        orgName:       org.name,
        projectName:   project.name,
        periodName,
        reportUrl,
        recipientName,
        csvAttachment: csvBuffer,
      });

      await this.mailer.send({
        to: email,
        subject: `[Monival] Scheduled Report: ${project.name} — ${periodName}`,
        ...body,
      });
    }

    // Update last sent and next run
    await this.scheduledModel.updateOne(
      { _id: schedule._id },
      {
        lastSentAt: new Date(),
        nextRunAt: this.computeNextRun(schedule.cadence, schedule.dayOfMonth),
      },
    );

    this.logger.log(`Scheduled report "${schedule.name}" delivered to ${schedule.recipients.length} recipients`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private computeNextRun(cadence: string, dayOfMonth: number): Date {
    const now = new Date();
    const next = new Date(now);

    switch (cadence) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(8, 0, 0, 0);
        break;
      case 'weekly':
        next.setDate(next.getDate() + (7 - next.getDay() + 1) % 7 || 7); // next Monday
        next.setHours(8, 0, 0, 0);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        next.setDate(Math.min(dayOfMonth, 28));
        next.setHours(8, 0, 0, 0);
        break;
      case 'monthly':
      default:
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(dayOfMonth, 28));
        next.setHours(8, 0, 0, 0);
        break;
    }

    return next;
  }
}