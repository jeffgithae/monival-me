import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BeneficiaryDocument = HydratedDocument<Beneficiary>;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class HouseholdMember {
  @Prop({ required: true }) name!: string;
  @Prop() relationship?: string;       // head, spouse, child, other
  @Prop() sex?: 'male' | 'female' | 'other';
  @Prop({ type: Number }) age?: number;
  @Prop({ type: Boolean }) hasDisability?: boolean;
  @Prop() disabilityType?: string;
}

@Schema({ _id: true, timestamps: false })
export class ServiceRecord {
  @Prop({ type: Types.ObjectId, ref: 'Project' }) projectId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Activity' }) activityId?: Types.ObjectId;
  @Prop({ required: true }) serviceType!: string;
  @Prop({ required: true }) serviceDate!: Date;
  @Prop() description?: string;
  @Prop({ type: Number }) quantity?: number;
  @Prop() unit?: string;
  @Prop({ type: Boolean, default: false }) isExited!: boolean;
}

@Schema({ _id: true, timestamps: false })
export class ProgramEnrollment {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true }) projectId!: Types.ObjectId;
  @Prop({ required: true }) enrolledAt!: Date;
  @Prop() exitedAt?: Date;
  @Prop({ enum: ['active', 'completed', 'transferred', 'dropped_out', 'deceased'], default: 'active' }) status!: string;
  @Prop() exitReason?: string;
  @Prop() notes?: string;
}

// ─── Main schema ──────────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class Beneficiary {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  // ── Registration type ─────────────────────────────────────────────────────
  @Prop({ enum: ['individual', 'household', 'group', 'community'], default: 'individual' })
  registrationType!: string;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Prop({ required: true, trim: true, index: true }) name!: string;
  @Prop({ trim: true }) caseId?: string;       // Unique case reference number
  @Prop({ trim: true }) nationalId?: string;
  @Prop({ trim: true }) phoneNumber?: string;
  @Prop({ trim: true }) email?: string;

  // ── Demographics ──────────────────────────────────────────────────────────
  @Prop({ enum: ['male', 'female', 'other', 'prefer_not_to_say'] }) sex?: string;
  @Prop() dateOfBirth?: Date;
  @Prop({ type: Number }) age?: number;        // stored when DOB unknown
  @Prop({ enum: ['child_under5', 'child_5_17', 'youth_18_24', 'adult_25_59', 'elderly_60plus'] }) ageGroup?: string;
  @Prop({ trim: true }) nationality?: string;
  @Prop({ trim: true }) ethnicity?: string;
  @Prop({ trim: true }) primaryLanguage?: string;
  @Prop({ trim: true }) education?: string;   // none, primary, secondary, tertiary

  // ── Household ─────────────────────────────────────────────────────────────
  @Prop({ type: Number, default: 1 }) householdSize!: number;
  @Prop({ type: [HouseholdMember], default: [] }) householdMembers!: HouseholdMember[];
  @Prop({ type: Number }) childrenUnder5?: number;
  @Prop({ type: Number }) childrenUnder18?: number;

  // ── Vulnerability & targeting ─────────────────────────────────────────────
  @Prop({ type: Boolean, default: false }) hasDisability!: boolean;
  @Prop({ trim: true }) disabilityType?: string;
  @Prop({ type: Boolean, default: false }) isIdp!: boolean;       // Internally Displaced Person
  @Prop({ type: Boolean, default: false }) isRefugee!: boolean;
  @Prop({ type: Boolean, default: false }) isFemaleHeadedHousehold!: boolean;
  @Prop({ type: Boolean, default: false }) isOrphan!: boolean;
  @Prop({ type: Boolean, default: false }) isChronicallyIll!: boolean;
  @Prop({ type: Boolean, default: false }) isElderly!: boolean;
  @Prop({ type: [String], default: [] }) vulnerabilityCategories!: string[];
  @Prop({ type: Number, min: 0, max: 100 }) vulnerabilityScore?: number;

  // ── Location ──────────────────────────────────────────────────────────────
  @Prop({ trim: true }) country?: string;
  @Prop({ trim: true }) region?: string;
  @Prop({ trim: true }) district?: string;
  @Prop({ trim: true }) village?: string;
  @Prop({ trim: true }) location?: string;    // free-text address / camp name
  @Prop({ type: { latitude: Number, longitude: Number }, _id: false }) geoPoint?: { latitude: number; longitude: number };
  @Prop({ trim: true }) settlementType?: string; // urban, rural, camp, peri-urban

  // ── Program participation ─────────────────────────────────────────────────
  @Prop({ type: [ProgramEnrollment], default: [] }) programEnrollments!: ProgramEnrollment[];
  @Prop({ type: [ServiceRecord], default: [] }) serviceHistory!: ServiceRecord[];

  // ── Status & case management ──────────────────────────────────────────────
  @Prop({ enum: ['active', 'inactive', 'closed', 'transferred', 'deceased'], default: 'active', index: true })
  status!: string;

  @Prop({ trim: true }) groupType?: string;   // backward compat + community type
  @Prop({ type: Number, default: 1 }) groupSize?: number;  // for group/community type
  @Prop({ trim: true }) caseWorker?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assignedUserId?: Types.ObjectId;
  @Prop() registrationDate?: Date;
  @Prop() lastContactDate?: Date;

  // ── Consent & data protection ─────────────────────────────────────────────
  @Prop({ type: Boolean, default: false }) consentGiven!: boolean;
  @Prop() consentDate?: Date;
  @Prop({ enum: ['written', 'verbal', 'digital'], default: 'verbal' }) consentMethod?: string;

  // ── Notes & custom data ───────────────────────────────────────────────────
  @Prop({ trim: true }) notes?: string;
  @Prop({ type: Object, default: {} }) customFields?: Record<string, unknown>;
  @Prop({ type: [String], default: [] }) tags!: string[];
}

export const BeneficiarySchema = SchemaFactory.createForClass(Beneficiary);
BeneficiarySchema.index({ organizationId: 1, name: 1 });
BeneficiarySchema.index({ organizationId: 1, status: 1 });
BeneficiarySchema.index({ organizationId: 1, registrationType: 1 });
BeneficiarySchema.index({ organizationId: 1, caseId: 1 });
BeneficiarySchema.index({ organizationId: 1, 'programEnrollments.projectId': 1 });
BeneficiarySchema.index({ organizationId: 1, sex: 1, ageGroup: 1 });
// Partial filter index — only indexes documents where nationalId exists AND is a non-empty string.
// This correctly allows unlimited beneficiaries without a nationalId in the same org,
// while still enforcing uniqueness when a nationalId IS provided.
// NOTE: if the old 'org_nationalId_unique' sparse index is present in the DB,
// drop it manually first: db.beneficiaries.dropIndex('org_nationalId_unique')
BeneficiarySchema.index(
  { organizationId: 1, nationalId: 1 },
  {
    unique: true,
    name: 'org_nationalId_unique_partial',
    partialFilterExpression: {
      nationalId: { $exists: true, $type: 'string', $gt: '' },
    },
  },
);
// Phone index — also partial so null/empty phones don't conflict
BeneficiarySchema.index(
  { organizationId: 1, phoneNumber: 1 },
  {
    sparse: true,
    partialFilterExpression: {
      phoneNumber: { $exists: true, $type: 'string', $gt: '' },
    },
  },
);