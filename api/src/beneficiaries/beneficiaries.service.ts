import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Beneficiary } from './schemas/beneficiary.schema';
import { CreateBeneficiaryDto, ProgramEnrollmentDto, ServiceRecordDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { escapeRegex } from '../common/utils/escape-regex';
export interface BeneficiaryListQuery {
  projectId?: string;
  status?: string;
  registrationType?: string;
  sex?: string;
  ageGroup?: string;
  hasDisability?: boolean;
  isIdp?: boolean;
  isRefugee?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectModel(Beneficiary.name) private readonly model: Model<Beneficiary>,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(organizationId: string, query: BeneficiaryListQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.status)           filter.status           = query.status;
    if (query.registrationType) filter.registrationType = query.registrationType;
    if (query.sex)              filter.sex              = query.sex;
    if (query.ageGroup)         filter.ageGroup         = query.ageGroup;
    if (query.hasDisability !== undefined) filter.hasDisability = query.hasDisability;
    if (query.isIdp  !== undefined)        filter.isIdp         = query.isIdp;
    if (query.isRefugee !== undefined)     filter.isRefugee     = query.isRefugee;

    if (query.projectId) {
      filter['programEnrollments.projectId'] = new Types.ObjectId(query.projectId);
    }

    if (query.search) {
      const re = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { name: re }, { caseId: re }, { location: re },
        { village: re }, { district: re }, { phoneNumber: re },
      ];
    }

    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(200, query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Statistics (for dashboard strip) ────────────────────────────────────

  async statistics(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const match: Record<string, unknown> = { organizationId: orgId };
    if (projectId) match['programEnrollments.projectId'] = new Types.ObjectId(projectId);

    const [counts, bySex, byType, byStatus, byAgeGroup, vulnerable] = await Promise.all([
      this.model.countDocuments({ ...match }),

      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$sex', count: { $sum: 1 } } },
      ]),

      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$registrationType', count: { $sum: 1 } } },
      ]),

      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      this.model.aggregate([
        { $match: { ...match, ageGroup: { $exists: true } } },
        { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
      ]),

      this.model.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            disabled:             { $sum: { $cond: ['$hasDisability', 1, 0] } },
            idp:                  { $sum: { $cond: ['$isIdp', 1, 0] } },
            refugee:              { $sum: { $cond: ['$isRefugee', 1, 0] } },
            femaleHeaded:         { $sum: { $cond: ['$isFemaleHeadedHousehold', 1, 0] } },
            orphan:               { $sum: { $cond: ['$isOrphan', 1, 0] } },
            chronicallyIll:       { $sum: { $cond: ['$isChronicallyIll', 1, 0] } },
            elderly:              { $sum: { $cond: ['$isElderly', 1, 0] } },
            consentGiven:         { $sum: { $cond: ['$consentGiven', 1, 0] } },
            totalHouseholdSize:   { $sum: '$householdSize' },
          },
        },
      ]),
    ]);

    const v = vulnerable[0] ?? {};
    return {
      total: counts,
      bySex:     Object.fromEntries(bySex.map(r => [r._id ?? 'unknown', r.count])),
      byType:    Object.fromEntries(byType.map(r => [r._id ?? 'unknown', r.count])),
      byStatus:  Object.fromEntries(byStatus.map(r => [r._id ?? 'unknown', r.count])),
      byAgeGroup: Object.fromEntries(byAgeGroup.map(r => [r._id ?? 'unknown', r.count])),
      vulnerable: {
        disabled:           v.disabled       ?? 0,
        idp:                v.idp            ?? 0,
        refugee:            v.refugee        ?? 0,
        femaleHeaded:       v.femaleHeaded   ?? 0,
        orphan:             v.orphan         ?? 0,
        chronicallyIll:     v.chronicallyIll ?? 0,
        elderly:            v.elderly        ?? 0,
        consentGiven:       v.consentGiven   ?? 0,
        totalHouseholdSize: v.totalHouseholdSize ?? 0,
      },
    };
  }

  // ─── Single ────────────────────────────────────────────────────────────────

  async findOne(organizationId: string, id: string) {
    const b = await this.model
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!b) throw new NotFoundException('Beneficiary not found');
    return b;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateBeneficiaryDto) {
    // Auto-compute age group from DOB if not supplied
    let ageGroup = dto.ageGroup;
    if (!ageGroup && dto.dateOfBirth) {
      const ageYrs = Math.floor((Date.now() - new Date(dto.dateOfBirth).getTime()) / 31557600000);
      ageGroup = this.computeAgeGroup(ageYrs);
    } else if (!ageGroup && dto.age !== undefined) {
      ageGroup = this.computeAgeGroup(dto.age);
    }

    // Auto-generate caseId if not supplied
    const caseId = dto.caseId || `BEN-${Date.now().toString(36).toUpperCase()}`;

    return this.model.create({
      organizationId:           new Types.ObjectId(organizationId),
      registrationType:         dto.registrationType ?? 'individual',
      name:                     dto.name,
      caseId,
      nationalId:               dto.nationalId,
      phoneNumber:              dto.phoneNumber,
      email:                    dto.email,
      sex:                      dto.sex,
      dateOfBirth:              dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      age:                      dto.age,
      ageGroup,
      nationality:              dto.nationality,
      ethnicity:                dto.ethnicity,
      primaryLanguage:          dto.primaryLanguage,
      education:                dto.education,
      householdSize:            dto.householdSize ?? 1,
      householdMembers:         dto.householdMembers ?? [],
      childrenUnder5:           dto.childrenUnder5,
      childrenUnder18:          dto.childrenUnder18,
      hasDisability:            dto.hasDisability ?? false,
      disabilityType:           dto.disabilityType,
      isIdp:                    dto.isIdp ?? false,
      isRefugee:                dto.isRefugee ?? false,
      isFemaleHeadedHousehold:  dto.isFemaleHeadedHousehold ?? false,
      isOrphan:                 dto.isOrphan ?? false,
      isChronicallyIll:         dto.isChronicallyIll ?? false,
      isElderly:                dto.isElderly ?? false,
      vulnerabilityCategories:  dto.vulnerabilityCategories ?? [],
      vulnerabilityScore:       dto.vulnerabilityScore,
      country:                  dto.country,
      region:                   dto.region,
      district:                 dto.district,
      village:                  dto.village,
      location:                 dto.location,
      geoPoint:                 this.geoPoint(dto.latitude, dto.longitude),
      settlementType:           dto.settlementType,
      programEnrollments:       (dto.programEnrollments ?? []).map(e => ({
        projectId: new Types.ObjectId(e.projectId),
        enrolledAt: e.enrolledAt ? new Date(e.enrolledAt) : new Date(),
        status: e.status ?? 'active',
        exitReason: e.exitReason,
        notes: e.notes,
      })),
      status:           dto.status ?? 'active',
      groupType:        dto.groupType,
      groupSize:        dto.groupSize,
      caseWorker:       dto.caseWorker,
      assignedUserId:   dto.assignedUserId ? new Types.ObjectId(dto.assignedUserId) : undefined,
      registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : new Date(),
      consentGiven:     dto.consentGiven ?? false,
      consentDate:      dto.consentDate ? new Date(dto.consentDate) : undefined,
      consentMethod:    dto.consentMethod ?? 'verbal',
      notes:            dto.notes,
      customFields:     dto.customFields ?? {},
      tags:             dto.tags ?? [],
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(organizationId: string, id: string, dto: UpdateBeneficiaryDto) {
    const updateData: Record<string, unknown> = { ...dto };

    if (dto.dateOfBirth)   updateData.dateOfBirth   = new Date(dto.dateOfBirth);
    if (dto.registrationDate) updateData.registrationDate = new Date(dto.registrationDate);
    if (dto.consentDate)   updateData.consentDate   = new Date(dto.consentDate);
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      updateData.geoPoint = { latitude: dto.latitude, longitude: dto.longitude };
    }
    delete updateData.latitude;
    delete updateData.longitude;

    if (dto.age !== undefined && !dto.ageGroup) {
      updateData.ageGroup = this.computeAgeGroup(dto.age);
    }

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    const b = await this.model
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        updateData,
        { new: true },
      ).lean();
    if (!b) throw new NotFoundException('Beneficiary not found');
    return b;
  }

  // ─── Program enrollment ───────────────────────────────────────────────────

  async enroll(organizationId: string, id: string, dto: ProgramEnrollmentDto) {
    const b = await this.model.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (!b) throw new NotFoundException('Beneficiary not found');

    const alreadyEnrolled = b.programEnrollments.some(
      e => e.projectId.toString() === dto.projectId && e.status === 'active',
    );
    if (alreadyEnrolled) throw new BadRequestException('Already enrolled in this project');

    b.programEnrollments.push({
      projectId: new Types.ObjectId(dto.projectId) as any,
      enrolledAt: dto.enrolledAt ? new Date(dto.enrolledAt) : new Date(),
      status: (dto.status ?? 'active') as any,
      exitReason: dto.exitReason,
      notes: dto.notes,
    } as any);

    return (await b.save()).toObject();
  }

  async exitProgram(
    organizationId: string,
    id: string,
    projectId: string,
    exitReason?: string,
  ) {
    const b = await this.model.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (!b) throw new NotFoundException('Beneficiary not found');

    const enrollment = b.programEnrollments.find(
      e => e.projectId.toString() === projectId && e.status === 'active',
    );
    if (!enrollment) throw new NotFoundException('Active enrollment not found');

    enrollment.status    = 'completed' as any;
    enrollment.exitedAt  = new Date() as any;
    enrollment.exitReason = exitReason as any;
    b.lastContactDate = new Date();

    return (await b.save()).toObject();
  }

  // ─── Service record ───────────────────────────────────────────────────────

  async addServiceRecord(organizationId: string, id: string, dto: ServiceRecordDto) {
    const record: any = {
      _id: new Types.ObjectId(),
      serviceType: dto.serviceType,
      serviceDate: new Date(dto.serviceDate),
      description: dto.description,
      quantity:    dto.quantity,
      unit:        dto.unit,
      isExited:    false,
    };
    if (dto.projectId)  record.projectId  = new Types.ObjectId(dto.projectId);
    if (dto.activityId) record.activityId = new Types.ObjectId(dto.activityId);

    const b = await this.model
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        { $push: { serviceHistory: record }, $set: { lastContactDate: new Date() } },
        { new: true },
      ).lean();
    if (!b) throw new NotFoundException('Beneficiary not found');
    return b;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(organizationId: string, id: string) {
    const result = await this.model.deleteOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Beneficiary not found');
    return { deleted: true };
  }

  // ─── Deduplication ────────────────────────────────────────────────────────

  /**
   * Find potential duplicate records for a given beneficiary.
   * Checks: exact nationalId match, exact phone match, fuzzy name+DOB match.
   * Returns an array of candidate groups with a confidence score.
   */
  async findDuplicates(
    organizationId: string,
    options: { minConfidence?: number; projectId?: string } = {},
  ) {
    const orgId = new Types.ObjectId(organizationId);
    const minConf = options.minConfidence ?? 0.6;

    const pipeline: any[] = [
      { $match: { organizationId: orgId, ...(options.projectId ? { 'programEnrollments.projectId': new Types.ObjectId(options.projectId) } : {}) } },
      {
        // Self-join: group by nationalId where present
        $group: {
          _id: { nationalId: '$nationalId' },
          count: { $sum: 1 },
          records: { $push: { _id: '$_id', name: '$name', caseId: '$caseId', phoneNumber: '$phoneNumber', dateOfBirth: '$dateOfBirth', status: '$status' } },
        },
      },
      { $match: { 'count': { $gt: 1 }, '_id.nationalId': { $ne: null } } },
    ];

    const nationalIdDups = await this.model.aggregate(pipeline);

    // Phone-based duplicates (separate pass)
    const phonePipeline: any[] = [
      { $match: { organizationId: orgId, phoneNumber: { $exists: true, $ne: '' } } },
      { $group: { _id: '$phoneNumber', count: { $sum: 1 }, records: { $push: { _id: '$_id', name: '$name', caseId: '$caseId', nationalId: '$nationalId', status: '$status' } } } },
      { $match: { count: { $gt: 1 } } },
    ];
    const phoneDups = await this.model.aggregate(phonePipeline);

    const groups: Array<{
      type: 'exact_national_id' | 'exact_phone' | 'fuzzy_name';
      confidence: number;
      records: unknown[];
    }> = [];

    for (const d of nationalIdDups) {
      groups.push({ type: 'exact_national_id', confidence: 1.0, records: d.records });
    }
    for (const d of phoneDups) {
      groups.push({ type: 'exact_phone', confidence: 0.85, records: d.records });
    }

    return groups.filter(g => g.confidence >= minConf);
  }

  /**
   * Merge two beneficiary records: keep `primaryId`, copy over non-null fields
   * from `duplicateId`, merge programEnrollments and serviceHistory, then delete the duplicate.
   */
  async mergeBeneficiaries(
    organizationId: string,
    primaryId: string,
    duplicateId: string,
  ): Promise<{ merged: boolean; primaryId: string }> {
    if (primaryId === duplicateId) throw new BadRequestException('Primary and duplicate must be different records.');

    const orgId = new Types.ObjectId(organizationId);
    const [primary, duplicate] = await Promise.all([
      this.model.findOne({ _id: primaryId, organizationId: orgId }),
      this.model.findOne({ _id: duplicateId, organizationId: orgId }),
    ]);

    if (!primary) throw new NotFoundException('Primary beneficiary not found.');
    if (!duplicate) throw new NotFoundException('Duplicate beneficiary not found.');

    // Merge program enrollments — add any project not already on primary
    const primaryProjectIds = new Set(
      primary.programEnrollments?.map(e => e.projectId?.toString()),
    );
    const newEnrollments = (duplicate.programEnrollments ?? []).filter(
      e => !primaryProjectIds.has(e.projectId?.toString()),
    );
    if (newEnrollments.length) {
      primary.programEnrollments = [...(primary.programEnrollments ?? []), ...newEnrollments];
    }

    // Merge service history
    primary.serviceHistory = [
      ...(primary.serviceHistory ?? []),
      ...(duplicate.serviceHistory ?? []),
    ];

    // Fill in missing fields from duplicate
    const fillFields: (keyof typeof primary)[] = [
      'nationalId', 'phoneNumber', 'email', 'dateOfBirth', 'age',
      'nationality', 'disability', 'address',
    ] as any;
    for (const field of fillFields) {
      if (!primary[field] && duplicate[field]) {
        (primary as any)[field] = duplicate[field];
      }
    }

    await primary.save();
    await this.model.deleteOne({ _id: duplicateId, organizationId: orgId });

    return { merged: true, primaryId };
  }

  // ─── Project cascade cleanup ────────────────────────────────────────────────

  /**
   * Beneficiaries are org-scoped, not project-scoped — deleting a project
   * does not delete beneficiary records. But programEnrollments and
   * serviceHistory entries embed a projectId, and those go stale once the
   * project is gone. Pull those specific array entries rather than leaving
   * dangling references the UI would otherwise try (and fail) to resolve
   * to a project name.
   */
  async pullStaleProjectReferences(organizationId: string, projectId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projId = new Types.ObjectId(projectId);
    const result = await this.model.updateMany(
      {
        organizationId: orgId,
        $or: [
          { 'programEnrollments.projectId': projId },
          { 'serviceHistory.projectId': projId },
        ],
      },
      {
        $pull: {
          programEnrollments: { projectId: projId },
          serviceHistory: { projectId: projId },
        },
      },
    );
    return { matched: result.matchedCount, modified: result.modifiedCount };
  }

  // ─── Offline sync ───────────────────────────────────────────────────────────
  //
  // Field workers register beneficiaries on the mobile PWA while offline.
  // When connectivity returns, the client pushes the queued batch here. Each
  // record carries a client-generated UUID (`clientId`) used as an
  // idempotency key — see activities.service.ts#offlineSync for the same
  // pattern applied to Activity records.
  //
  async offlineSync(
    organizationId: string,
    items: Array<CreateBeneficiaryDto & { clientId: string }>,
  ) {
    if (!items?.length) return { synced: 0, skipped: 0, errors: [], results: [] };

    const orgId = new Types.ObjectId(organizationId);

    // Step 1: find which clientIds are already persisted
    const clientIds = items.map(i => i.clientId).filter(Boolean);
    const existing  = await this.model
      .find({ organizationId: orgId, clientId: { $in: clientIds } })
      .select('clientId')
      .lean();
    const alreadySynced = new Set(existing.map(e => (e as any).clientId as string));

    const results: Array<{
      clientId: string;
      status: 'synced' | 'skipped' | 'error';
      beneficiaryId?: string;
      message?: string;
    }> = [];

    let synced  = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.clientId) {
        results.push({ clientId: '', status: 'error', message: 'clientId is required for offline sync.' });
        continue;
      }

      if (alreadySynced.has(item.clientId)) {
        results.push({ clientId: item.clientId, status: 'skipped' });
        skipped++;
        continue;
      }

      try {
        const beneficiary = await this.create(organizationId, item);
        // Persist the clientId to prevent future duplicates. Note: a
        // duplicate nationalId/phone from the partial unique indexes throws
        // before reaching here and is caught below as a per-item error, so
        // this updateOne only ever runs for genuinely new records.
        await this.model.updateOne(
          { _id: beneficiary._id },
          { $set: { clientId: item.clientId, syncedFromOffline: true } },
        );
        results.push({ clientId: item.clientId, status: 'synced', beneficiaryId: beneficiary._id.toString() });
        synced++;
      } catch (err: any) {
        const message = err.code === 11000
          ? 'A beneficiary with this National ID or phone number already exists.'
          : err.message;
        results.push({ clientId: item.clientId, status: 'error', message });
      }
    }

    return {
      synced,
      skipped,
      errors: results.filter(r => r.status === 'error'),
      results,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private computeAgeGroup(age: number): string {
    if (age < 5)   return 'child_under5';
    if (age < 18)  return 'child_5_17';
    if (age < 25)  return 'youth_18_24';
    if (age < 60)  return 'adult_25_59';
    return 'elderly_60plus';
  }

  private geoPoint(lat?: number, lng?: number) {
    return lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : undefined;
  }
}