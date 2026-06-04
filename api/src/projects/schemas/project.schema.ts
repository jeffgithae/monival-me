import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectDocument = HydratedDocument<Project>;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

@Schema({ _id: true, timestamps: false })
export class ProjectRisk {
  @Prop({ required: true }) title!: string;
  @Prop() description?: string;
  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }) likelihood!: string;
  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }) impact!: string;
  @Prop() mitigationPlan?: string;
  @Prop() contingencyPlan?: string;
  @Prop({ enum: ['open', 'mitigated', 'accepted', 'closed'], default: 'open' }) status!: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) ownerId?: Types.ObjectId;
  @Prop({ type: String }) ownerName?: string;
  @Prop() reviewDate?: Date;
  @Prop() closedDate?: Date;
  @Prop() closureNotes?: string;
}

@Schema({ _id: true, timestamps: false })
export class ProjectMilestone {
  @Prop({ required: true }) title!: string;
  @Prop() description?: string;
  @Prop({ required: true }) dueDate!: Date;
  @Prop({ enum: ['not_started', 'in_progress', 'completed', 'overdue', 'cancelled'], default: 'not_started' }) status!: string;
  @Prop() completedDate?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) ownerId?: Types.ObjectId;
  @Prop({ type: String }) ownerName?: string;
  @Prop({ type: [Types.ObjectId], ref: 'Indicator' }) linkedIndicatorIds?: Types.ObjectId[];
  @Prop({ type: Number, default: 0, min: 0, max: 100 }) progressPct!: number;
  @Prop() completionNotes?: string;
}

@Schema({ _id: true, timestamps: false })
export class WorkplanItem {
  @Prop({ required: true }) title!: string;
  @Prop() description?: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ type: [Types.ObjectId], ref: 'Indicator' }) linkedIndicatorIds?: Types.ObjectId[];
  @Prop({ type: Types.ObjectId, ref: 'User' }) responsibleUserId?: Types.ObjectId;
  @Prop({ type: String }) responsibleName?: string;
  @Prop({ enum: ['planned', 'in_progress', 'completed', 'delayed', 'cancelled'], default: 'planned' }) status!: string;
  @Prop({ default: 0, min: 0, max: 100 }) progressPct!: number;
  @Prop() quarter?: string;
  @Prop({ type: Number }) estimatedCost?: number;
  @Prop({ type: Number }) actualCost?: number;
  @Prop() outputDescription?: string;
}

@Schema({ _id: true, timestamps: false })
export class ProjectStakeholder {
  @Prop({ required: true }) name!: string;
  @Prop() organisation?: string;
  @Prop() role?: string;
  @Prop() email?: string;
  @Prop() phone?: string;
  @Prop({ enum: ['internal', 'external', 'donor', 'government', 'community', 'private_sector', 'un_agency', 'ngo'], default: 'external' }) type!: string;
  @Prop({ enum: ['low', 'medium', 'high'], default: 'medium' }) influence!: string;
  @Prop({ enum: ['low', 'medium', 'high'], default: 'medium' }) interest!: string;
  @Prop({ enum: ['manage_closely', 'keep_satisfied', 'keep_informed', 'monitor'], default: 'monitor' }) engagementStrategy!: string;
  @Prop() notes?: string;
  @Prop({ type: Boolean, default: true }) isActive!: boolean;
}

@Schema({ _id: true, timestamps: false })
export class AnnualTarget {
  @Prop({ required: true }) year!: number;
  @Prop({ required: true, type: Number }) target!: number;
  @Prop({ type: Number }) achieved?: number;
  @Prop() notes?: string;
}

// ─── Main schema ──────────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class Project {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ trim: true, index: true }) projectCode?: string;
  @Prop({ trim: true }) description?: string;
  @Prop({ type: [String], default: [] }) objectives!: string[];
  @Prop({ type: [String], default: [] }) tags!: string[];

  @Prop({
    type: String,
    enum: [
      'health', 'education', 'wash', 'food_security', 'livelihoods',
      'protection', 'shelter', 'nutrition', 'gender', 'environment',
      'governance', 'peacebuilding', 'drr', 'economic_development',
      'social_cohesion', 'mental_health', 'refugee_response', 'other',
    ],
  })
  sector?: string;

  @Prop({ type: [String], default: [] }) subSectors!: string[];

  // ── Phase & lifecycle ─────────────────────────────────────────────────────
  @Prop({
    default: 'active',
    enum: ['pipeline', 'design', 'active', 'completed', 'paused', 'cancelled', 'archived'],
  })
  status!: string;

  @Prop({
    type: String,
    enum: ['inception', 'implementation', 'scale_up', 'closeout', 'completed'],
  })
  projectPhase?: string;

  @Prop({ default: 'not_started', enum: ['not_started', 'in_progress', 'completed', 'under_review'] })
  evaluationStatus!: string;

  @Prop({ trim: true }) evaluationSummary?: string;
  @Prop({ trim: true }) lessonsLearned?: string;
  @Prop({ trim: true }) archiveNotes?: string;

  // ── Theory of change / approach ───────────────────────────────────────────
  @Prop({ trim: true }) theoreticalApproach?: string;   // ToC narrative
  @Prop({ trim: true }) problemStatement?: string;
  @Prop({ trim: true }) changeHypothesis?: string;
  @Prop({ type: [String], default: [] }) keyAssumptions!: string[];

  // ── Funding ───────────────────────────────────────────────────────────────
  @Prop({ trim: true }) donor?: string;
  @Prop({ type: Types.ObjectId, ref: 'Donor', index: true }) donorId?: Types.ObjectId;
  @Prop({ type: [Types.ObjectId], ref: 'Grant', default: [] }) grantIds!: Types.ObjectId[];
  @Prop({ trim: true }) grantReference?: string;        // external grant number
  @Prop({ type: Number, min: 0, default: 0 }) totalBudget!: number;
  @Prop({ trim: true, default: 'USD' }) currency!: string;

  // ── Timeline ──────────────────────────────────────────────────────────────
  @Prop() startDate?: Date;
  @Prop() endDate?: Date;
  @Prop() closureDate?: Date;
  @Prop() nextReviewDate?: Date;
  @Prop({ type: Number, default: 0 }) extensionMonths!: number;

  // ── Geography ─────────────────────────────────────────────────────────────
  @Prop({ trim: true }) country?: string;
  @Prop({ trim: true }) region?: string;
  @Prop({ trim: true }) district?: string;
  @Prop({ type: { latitude: Number, longitude: Number }, _id: false }) geoPoint?: { latitude: number; longitude: number };
  @Prop({ type: [String], default: [] }) implementationAreas!: string[];
  @Prop({ trim: true }) coverageArea?: string;           // narrative coverage description

  // ── Beneficiaries ─────────────────────────────────────────────────────────
  @Prop({ type: Number, min: 0, default: 0 }) targetBeneficiaryCount!: number;
  @Prop({ type: Number, min: 0, default: 0 }) targetDirectBeneficiaries!: number;
  @Prop({ type: Number, min: 0, default: 0 }) targetIndirectBeneficiaries!: number;
  @Prop({ type: [String], default: [] }) targetGroups!: string[];
  @Prop({ trim: true }) populationServed?: string;       // narrative description

  // ── Partnerships ──────────────────────────────────────────────────────────
  @Prop({ type: [String], default: [] }) implementationPartners!: string[];
  @Prop({ type: [Types.ObjectId], ref: 'Partner', default: [] }) partnerIds!: Types.ObjectId[];

  // ── Team ──────────────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User' }) projectManagerId?: Types.ObjectId;
  @Prop({ type: String }) projectManagerName?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) meOfficerId?: Types.ObjectId;
  @Prop({ type: String }) meOfficerName?: string;

  // ── Planning artifacts ────────────────────────────────────────────────────
  @Prop({ type: [ProjectMilestone], default: [] }) milestones!: ProjectMilestone[];
  @Prop({ type: [WorkplanItem], default: [] }) workplan!: WorkplanItem[];
  @Prop({ type: [ProjectRisk], default: [] }) risks!: ProjectRisk[];
  @Prop({ type: [ProjectStakeholder], default: [] }) stakeholders!: ProjectStakeholder[];

  // ── SDG & framework alignment ─────────────────────────────────────────────
  @Prop({ type: [Number], default: [] }) sdgGoals!: number[];
  @Prop({ type: [String], default: [] }) frameworks!: string[];   // e.g. ['OCHA_HPC', 'EU_RESULTS']

  // ── Reporting settings ────────────────────────────────────────────────────
  @Prop({ enum: ['monthly', 'quarterly', 'semiannual', 'annual'], default: 'quarterly' }) reportingFrequency!: string;
  @Prop({ trim: true }) reportingNotes?: string;
  @Prop({ type: Boolean, default: false }) requiresEvidencePerActivity!: boolean;
  @Prop({ type: Boolean, default: false }) requiresDisaggregation!: boolean;

  // ── Quality ───────────────────────────────────────────────────────────────
  @Prop({ type: Number, min: 0, max: 100 }) dataQualityScore?: number;
  @Prop() dataQualityLastChecked?: Date;

  // ── Metadata ─────────────────────────────────────────────────────────────
  @Prop({ type: Boolean, default: false }) isArchived!: boolean;
  @Prop({ type: Boolean, default: false }) isTemplate!: boolean;  // can be used as org template
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ organizationId: 1, status: 1 });
ProjectSchema.index({ organizationId: 1, sector: 1 });
ProjectSchema.index({ organizationId: 1, donorId: 1 });
ProjectSchema.index({ organizationId: 1, projectCode: 1 });
ProjectSchema.index({ organizationId: 1, isArchived: 1 });
ProjectSchema.index({ organizationId: 1, createdAt: -1 });