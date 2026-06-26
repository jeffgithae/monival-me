import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IndicatorDocument = HydratedDocument<Indicator>;

@Schema({ _id: false })
export class DisaggregationCategory {
  @Prop({ required: true }) label!: string;
  @Prop({ type: [String], default: [] }) values!: string[];
}

@Schema({ _id: false })
export class AnnualTarget {
  @Prop({ required: true }) year!: number;
  @Prop({ required: true, type: Number }) target!: number;
  @Prop({ type: Number }) achieved?: number;
  @Prop() notes?: string;
}

@Schema({ timestamps: true })
export class Indicator {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  parentId?: Types.ObjectId;

  // ── Logframe position ─────────────────────────────────────────────────────
  @Prop({ type: String, default: 'output', enum: ['goal', 'outcome', 'output', 'process', 'input'] })
  level!: string;

  @Prop({ required: true, trim: true, index: true })
  code!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  definition?: string;

  @Prop({ trim: true })
  rationale?: string;        // Why this indicator was chosen

  // ── Measurement ───────────────────────────────────────────────────────────
  @Prop({ trim: true })
  unit?: string;

  @Prop({ enum: ['number', 'percentage', 'ratio', 'yes_no', 'text', 'currency', 'score'], default: 'number' })
  indicatorType!: string;

  @Prop({ enum: ['increasing', 'decreasing', 'maintain'], default: 'increasing' })
  direction!: string;

  @Prop({ type: Boolean, default: true })
  cumulative!: boolean;

  // ── Targets & baselines ───────────────────────────────────────────────────
  @Prop({ default: 0 })
  baseline!: number;

  @Prop()
  baselineDate?: Date;

  @Prop({ trim: true })
  baselineSource?: string;

  @Prop({ required: true })
  target!: number;

  @Prop({ type: Number, default: 0 })
  achieved!: number;

  // Multi-year targets: each year has its own incremental target
  @Prop({ type: [AnnualTarget], default: [] })
  annualTargets!: AnnualTarget[];

  @Prop({ enum: ['monthly', 'quarterly', 'semiannual', 'annual', 'endline'], default: 'quarterly' })
  frequency!: string;

  // ── Disaggregation ────────────────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  disaggregation!: string[];

  @Prop({ type: [DisaggregationCategory], default: [] })
  disaggregationCategories!: DisaggregationCategory[];

  // ── Gender & inclusion markers ────────────────────────────────────────────
  @Prop({ enum: ['0', '1', '2', '2+', 'n/a'], default: 'n/a' })
  genderMarker!: string;   // OECD DAC gender marker

  @Prop({ type: Boolean, default: false })
  isGenderDisaggregated!: boolean;

  @Prop({ type: Boolean, default: false })
  isAgeDisaggregated!: boolean;

  // ── Data collection ───────────────────────────────────────────────────────
  @Prop({ trim: true })
  dataSource?: string;

  @Prop({ trim: true })
  dataCollectionMethod?: string;

  @Prop({ trim: true })
  meansOfVerification?: string;

  @Prop({ trim: true })
  dataCollectionTool?: string;

  @Prop({ trim: true })
  reportingResponsibility?: string;  // Team/unit responsible for reporting (vs collection)

  @Prop({ enum: ['monthly', 'quarterly', 'semiannual', 'annual'], default: 'quarterly' })
  verificationFrequency!: string;   // How often data is verified

  // ── Responsibility ────────────────────────────────────────────────────────
  @Prop({ trim: true })
  responsiblePerson?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  // ── Quality & validity ────────────────────────────────────────────────────
  @Prop({ trim: true })
  assumptions?: string;

  @Prop({ trim: true })
  limitations?: string;

  @Prop({ trim: true })
  precautionsForDataQuality?: string;  // Steps taken to ensure data quality

  @Prop({ type: Boolean, default: false })
  isCore!: boolean;

  @Prop({ type: Boolean, default: false })
  isStandardIndicator!: boolean;  // From an indicator library/standard list

  @Prop({ trim: true })
  standardIndicatorCode?: string;  // Reference code in USAID FACTS, IATI, etc.

  @Prop({ enum: ['pdm', 'pop', 'impact', 'eu_results', 'usaid_facts', 'ocha', 'custom', null], default: null, type: String })
  standardFramework?: string;

  // ── SDG alignment ─────────────────────────────────────────────────────────
  @Prop({ type: [Number], default: [] })
  sdgGoals!: number[];

  @Prop({ type: [String], default: [] })
  sdgTargets!: string[];  // e.g. ['3.1', '3.2']

  // ── Status & sort ─────────────────────────────────────────────────────────
  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder!: number;

  // ── Computed (cached) ─────────────────────────────────────────────────────
  @Prop({ type: Number })
  lastAchievedValue?: number;

  @Prop()
  lastAchievedDate?: Date;
}

export const IndicatorSchema = SchemaFactory.createForClass(Indicator);
IndicatorSchema.index({ organizationId: 1, projectId: 1, code: 1 });
IndicatorSchema.index({ organizationId: 1, projectId: 1, level: 1 });
IndicatorSchema.index({ organizationId: 1, projectId: 1, isCore: 1 });
IndicatorSchema.index({ organizationId: 1, standardIndicatorCode: 1 });