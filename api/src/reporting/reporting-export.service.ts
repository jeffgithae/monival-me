import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Organization } from '../organizations/schemas/organization.schema';
import { Project } from '../projects/schemas/project.schema';
import { ReportingPeriod } from './schemas/reporting-period.schema';
import { ReportingService } from './reporting.service';

export interface ExportableResult {
  indicatorId: { code?: string; title?: string; unit?: string } | string;
  achieved: number;
  targetValue: number | null;
  percentAchieved: number | null;
  narrative?: string;
}

@Injectable()
export class ReportingExportService {
  constructor(
    @InjectModel(ReportingPeriod.name) private readonly periodModel: Model<ReportingPeriod>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Organization.name) private readonly organizationModel: Model<Organization>,
    private readonly reportingService: ReportingService,
  ) {}

  /**
   * Gathers everything an export needs in one place: the enriched period
   * (project name, submitter/approver), its indicator results joined with
   * targets, and the organization name for the document header. Shared by
   * both the PDF and Excel renderers so they can never drift apart on what
   * data they show.
   */
  private async gatherExportData(organizationId: string, reportingPeriodId: string) {
    const [period, results, organization] = await Promise.all([
      this.reportingService.getPeriod(organizationId, reportingPeriodId),
      this.reportingService.listResults(organizationId, reportingPeriodId),
      this.organizationModel.findById(organizationId).select('name').lean(),
    ]);
    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }
    return { period, results: results as unknown as ExportableResult[], organizationName: organization?.name ?? '' };
  }

  async exportExcel(organizationId: string, reportingPeriodId: string): Promise<Buffer> {
    const { period, results, organizationName } = await this.gatherExportData(organizationId, reportingPeriodId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = organizationName || 'Monival';
    workbook.created = new Date();

    // ── Summary sheet ─────────────────────────────────────────────────────
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [{ width: 24 }, { width: 50 }];
    const summaryRows: Array<[string, string]> = [
      ['Organization', organizationName],
      ['Project', (period as any).projectName ?? ''],
      ['Reporting period', period.name],
      ['Cadence', period.cadence],
      ['Start date', this.formatDate(period.startDate)],
      ['End date', this.formatDate(period.endDate)],
      ['Due date', period.dueDate ? this.formatDate(period.dueDate) : '—'],
      ['Status', period.status],
      ['Submitted by', (period as any).submittedBy?.name ?? '—'],
      ['Approved by', (period as any).approvedBy?.name ?? '—'],
      ['Generated at', new Date().toISOString()],
    ];
    summaryRows.forEach(([label, value]) => {
      const row = summary.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    });
    summary.addRow([]);
    summary.addRow(['Narrative']).getCell(1).font = { bold: true, size: 12 };
    summary.addRow([period.narrative ?? '—']);
    summary.addRow(['Challenges']).getCell(1).font = { bold: true, size: 12 };
    summary.addRow([period.challenges ?? '—']);
    summary.addRow(['Lessons learned']).getCell(1).font = { bold: true, size: 12 };
    summary.addRow([period.lessonsLearned ?? '—']);
    summary.addRow(['Plans for next period']).getCell(1).font = { bold: true, size: 12 };
    summary.addRow([period.nextPeriodPlans ?? '—']);

    // ── Results sheet ──────────────────────────────────────────────────────
    const sheet = workbook.addWorksheet('Indicator Results');
    sheet.columns = [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Indicator', key: 'title', width: 40 },
      { header: 'Unit', key: 'unit', width: 12 },
      { header: 'Target', key: 'target', width: 12 },
      { header: 'Achieved', key: 'achieved', width: 12 },
      { header: '% Achieved', key: 'pct', width: 12 },
      { header: 'Narrative', key: 'narrative', width: 50 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

    for (const r of results) {
      const ind = typeof r.indicatorId === 'object' ? r.indicatorId : undefined;
      sheet.addRow({
        code: ind?.code ?? '',
        title: ind?.title ?? '',
        unit: ind?.unit ?? '',
        target: r.targetValue ?? '',
        achieved: r.achieved,
        pct: r.percentAchieved !== null ? `${r.percentAchieved}%` : '—',
        narrative: r.narrative ?? '',
      });
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportPdf(organizationId: string, reportingPeriodId: string): Promise<Buffer> {
    const { period, results, organizationName } = await this.gatherExportData(organizationId, reportingPeriodId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Header ───────────────────────────────────────────────────────────
      doc.fontSize(18).font('Helvetica-Bold').text(period.name);
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`${organizationName}${(period as any).projectName ? ' · ' + (period as any).projectName : ''}`);
      doc.moveDown(0.3);
      doc.text(
        `${this.formatDate(period.startDate)} – ${this.formatDate(period.endDate)}  ·  Status: ${period.status}`,
      );
      doc.fillColor('#0f172a');
      doc.moveDown(1);

      // ── Narrative sections ───────────────────────────────────────────────
      this.pdfSection(doc, 'Narrative', period.narrative);
      this.pdfSection(doc, 'Challenges & Risks', period.challenges);
      this.pdfSection(doc, 'Lessons Learned', period.lessonsLearned);
      this.pdfSection(doc, 'Plans for Next Period', period.nextPeriodPlans);

      // ── Results table ────────────────────────────────────────────────────
      doc.moveDown(0.5);
      doc.fontSize(13).font('Helvetica-Bold').text('Indicator Results');
      doc.moveDown(0.3);

      const colX = { code: 50, title: 110, target: 320, achieved: 380, pct: 440 };
      const rowTop = () => doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      let y = rowTop();
      doc.text('Code', colX.code, y, { width: 55 });
      doc.text('Indicator', colX.title, y, { width: 200 });
      doc.text('Target', colX.target, y, { width: 55 });
      doc.text('Achieved', colX.achieved, y, { width: 55 });
      doc.text('% Achieved', colX.pct, y, { width: 70 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(9);
      for (const r of results) {
        const ind = typeof r.indicatorId === 'object' ? r.indicatorId : undefined;
        if (doc.y > 720) doc.addPage();
        y = doc.y;
        doc.text(ind?.code ?? '', colX.code, y, { width: 55 });
        doc.text(ind?.title ?? '', colX.title, y, { width: 200 });
        doc.text(r.targetValue !== null ? String(r.targetValue) : '—', colX.target, y, { width: 55 });
        doc.text(String(r.achieved), colX.achieved, y, { width: 55 });
        doc.text(r.percentAchieved !== null ? `${r.percentAchieved}%` : '—', colX.pct, y, { width: 70 });
        doc.moveDown(0.6);
      }

      if (results.length === 0) {
        doc.fillColor('#64748b').text('No indicator results recorded for this period.');
        doc.fillColor('#0f172a');
      }

      doc.end();
    });
  }

  private pdfSection(doc: PDFKit.PDFDocument, title: string, content?: string) {
    doc.fontSize(11).font('Helvetica-Bold').text(title);
    doc.fontSize(10).font('Helvetica').fillColor('#334155').text(content?.trim() || '—', { width: 495 });
    doc.fillColor('#0f172a');
    doc.moveDown(0.6);
  }

  private formatDate(d: Date | string): string {
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}