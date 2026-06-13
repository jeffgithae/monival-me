import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { Beneficiary } from '../beneficiaries/schemas/beneficiary.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { OrgRole } from '../common/constants/roles';
import { ActivitiesService } from '../activities/activities.service';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';

export type ImportKind = 'activities' | 'beneficiaries';

export interface ImportResult {
  kind: ImportKind;
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @InjectModel(Project.name)     private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name)   private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name)    private readonly activityModel: Model<Activity>,
    @InjectModel(Beneficiary.name) private readonly beneficiaryModel: Model<Beneficiary>,
    private readonly activitiesService: ActivitiesService,
    private readonly beneficiariesService: BeneficiariesService,
  ) {}

  // ── Entry point ───────────────────────────────────────────────────────────

  async import(
    organizationId: string,
    userId: string,
    role: OrgRole,
    kind: ImportKind,
    csvText: string,
    projectId?: string,
  ): Promise<ImportResult> {
    const rows = this.parseCsv(csvText);
    if (rows.length === 0) throw new BadRequestException('CSV file is empty or has no data rows');
    if (rows.length > 2000) throw new BadRequestException('Maximum 2,000 rows per import');

    switch (kind) {
      case 'activities':    return this.importActivities(organizationId, userId, role, rows, projectId);
      case 'beneficiaries': return this.importBeneficiaries(organizationId, userId, rows, projectId);
      default: throw new BadRequestException(`Unknown import kind: ${kind}`);
    }
  }

  // ── Activities import ─────────────────────────────────────────────────────

  private async importActivities(
    organizationId: string,
    userId: string,
    role: OrgRole,
    rows: Record<string, string>[],
    defaultProjectId?: string,
  ): Promise<ImportResult> {
    const orgId = new Types.ObjectId(organizationId);

    // Build lookup maps: projectCode → _id, indicatorCode → _id
    const [projects, indicators] = await Promise.all([
      this.projectModel.find({ organizationId: orgId }).select('_id name').lean(),
      this.indicatorModel.find({ organizationId: orgId }).select('_id code').lean(),
    ]);

    const projectMap  = new Map(projects.map(p  => [p.name.toLowerCase(),  p._id.toString()]));
    const indicMap    = new Map(indicators.map(i => [(i.code ?? '').toLowerCase(), i._id.toString()]));

    const errors: ImportResult['errors'] = [];
    let imported = 0;
    let skipped  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      try {
        // Required: title and activityDate
        if (!row['title']?.trim()) {
          errors.push({ row: rowNum, field: 'title', message: 'title is required' });
          skipped++; continue;
        }
        if (!row['activityDate']?.trim()) {
          errors.push({ row: rowNum, field: 'activityDate', message: 'activityDate is required' });
          skipped++; continue;
        }

        // Resolve project
        let resolvedProjectId = defaultProjectId;
        if (row['projectCode']?.trim()) {
          resolvedProjectId = projectMap.get(row['projectCode'].trim().toLowerCase());
          if (!resolvedProjectId) {
            errors.push({ row: rowNum, field: 'projectCode', message: `Project "${row['projectCode']}" not found` });
            skipped++; continue;
          }
        }
        if (!resolvedProjectId) {
          errors.push({ row: rowNum, field: 'projectCode', message: 'projectCode or a default project is required' });
          skipped++; continue;
        }

        // Resolve indicator (optional)
        let indicatorId: string | undefined;
        if (row['indicatorCode']?.trim()) {
          indicatorId = indicMap.get(row['indicatorCode'].trim().toLowerCase());
          if (!indicatorId) {
            errors.push({ row: rowNum, field: 'indicatorCode', message: `Indicator "${row['indicatorCode']}" not found — row imported without indicator link` });
            // Don't skip — just warn
          }
        }

        await this.activitiesService.create(organizationId, {
          projectId:    resolvedProjectId,
          indicatorId,
          title:        row['title'].trim(),
          activityDate: row['activityDate'].trim(),
          location:     row['location']?.trim()       || undefined,
          latitude:     row['latitude']  ? parseFloat(row['latitude'])  : undefined,
          longitude:    row['longitude'] ? parseFloat(row['longitude']) : undefined,
          participants: row['participants'] ? parseInt(row['participants'], 10) : undefined,
          quantity:     row['quantity']    ? parseFloat(row['quantity'])        : undefined,
          evidenceUrl:  row['evidenceUrl']?.trim()    || undefined,
          evidenceNotes: row['evidenceNotes']?.trim() || undefined,
          partnerName:  row['partnerName']?.trim()    || undefined,
          description:  row['description']?.trim()    || undefined,
        } as any, role, userId);
        imported++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: rowNum, message: msg });
        skipped++;
      }
    }

    return { kind: 'activities', total: rows.length, imported, skipped, errors };
  }

  // ── Beneficiaries import ──────────────────────────────────────────────────

  private async importBeneficiaries(
    organizationId: string,
    userId: string,
    rows: Record<string, string>[],
    defaultProjectId?: string,
  ): Promise<ImportResult> {
    const errors: ImportResult['errors'] = [];
    let imported = 0;
    let skipped  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        if (!row['name']?.trim()) {
          errors.push({ row: rowNum, field: 'name', message: 'name is required' });
          skipped++; continue;
        }

        await this.beneficiariesService.create(organizationId, {
          name:             row['name'].trim(),
          registrationType: (row['registrationType']?.trim() || 'individual') as any,
          sex:              (row['sex']?.trim() || undefined) as any,
          age:              row['age'] ? parseInt(row['age'], 10) : undefined,
          dateOfBirth:      row['dateOfBirth']?.trim() || undefined,
          nationality:      row['nationality']?.trim() || undefined,
          country:          row['country']?.trim()     || undefined,
          region:           row['region']?.trim()      || undefined,
          district:         row['district']?.trim()    || undefined,
          village:          row['village']?.trim()     || undefined,
          location:         row['location']?.trim()    || undefined,
          householdSize:    row['householdSize'] ? parseInt(row['householdSize'], 10) : undefined,
          hasDisability:    row['hasDisability']?.toLowerCase() === 'true',
          isIdp:            row['isIdp']?.toLowerCase() === 'true',
          isRefugee:        row['isRefugee']?.toLowerCase() === 'true',
          isFemaleHeadedHousehold: row['isFemaleHeadedHousehold']?.toLowerCase() === 'true',
          vulnerabilityScore: row['vulnerabilityScore'] ? parseInt(row['vulnerabilityScore'], 10) : undefined,
          consentGiven:     row['consentGiven']?.toLowerCase() === 'true',
          status:           (row['status']?.trim() || 'active') as any,
          notes:            row['notes']?.trim() || undefined,
          projectId:        defaultProjectId,
          createdByUserId:  userId,
        } as any);

        imported++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: rowNum, message: msg });
        skipped++;
      }
    }

    return { kind: 'beneficiaries', total: rows.length, imported, skipped, errors };
  }

  // ── CSV parser ─────────────────────────────────────────────────────────────

  private parseCsv(text: string): Record<string, string>[] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = this.splitLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = this.splitLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim(); });
      return row;
    });
  }

  private splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"')       { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }
}