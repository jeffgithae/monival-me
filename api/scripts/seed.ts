/**
 * Seeds demo M&E data for local testing.
 * Run: npm run seed
 */
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import mongoose, { Schema, Types } from 'mongoose';
import { join } from 'path';

const SEED_EMAIL = 'demo@evidara.test';
const SEED_PASSWORD = 'Demo1234!';

function loadEnv() {
  try {
    const envPath = join(__dirname, '../.env');
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  } catch {
    /* .env optional */
  }
}

const OrganizationSchema = new Schema(
  {
    name: String,
    country: String,
    sector: String,
    planId: { type: String, default: 'professional' },
    subscriptionStatus: { type: String, default: 'active' },
    trialEndsAt: Date,
    currentPeriodEnd: Date,
  },
  { timestamps: true },
);
const OrganizationMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    role: { type: String, default: 'owner' },
    status: { type: String, default: 'active' },
    joinedAt: Date,
  },
  { timestamps: true },
);
const DonorSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    name: String,
    contactEmail: String,
    country: String,
  },
  { timestamps: true },
);
const UserSchema = new Schema(
  {
    email: { type: String, unique: true, lowercase: true },
    passwordHash: String,
    name: String,
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  },
  { timestamps: true },
);
// Project, Indicator, and Activity now use the REAL schemas (imported below,
// same pattern already used for Beneficiary/Grant/Partner) rather than
// hand-maintained inline copies. The inline versions had drifted badly out
// of sync with their real counterparts — missing geoPoint, direction,
// cumulative, evidenceUrl, grantId, and others — and since Mongoose schemas
// default to strict mode, any seed data trying to set those fields would
// have been silently dropped on save rather than erroring, which is exactly
// the kind of bug that's easy to miss until a feature built against the
// real schema (the map, beneficiary linkage) finds nothing seeded.
const { ProjectSchema } = require('../src/projects/schemas/project.schema');
const { IndicatorSchema } = require('../src/indicators/schemas/indicator.schema');
const { ActivitySchema } = require('../src/activities/schemas/activity.schema');

interface SeedUser {
  _id: Types.ObjectId;
  organizationId?: Types.ObjectId;
}

async function clearDemoData(
  User: mongoose.Model<unknown>,
  Organization: mongoose.Model<unknown>,
  OrganizationMember: mongoose.Model<unknown>,
  Project: mongoose.Model<unknown>,
  Indicator: mongoose.Model<unknown>,
  Activity: mongoose.Model<unknown>,
  Donor: mongoose.Model<unknown>,
  Partner: mongoose.Model<unknown>,
  Beneficiary: mongoose.Model<unknown>,
  Invite: mongoose.Model<unknown>,
  Grant: mongoose.Model<unknown>,
  BudgetAllocation: mongoose.Model<unknown>,
  BudgetLineItem: mongoose.Model<unknown>,
  BudgetVariance: mongoose.Model<unknown>,
  BalancedScorecard: mongoose.Model<unknown>,
  OKR: mongoose.Model<unknown>,
  ActivityTemplate: mongoose.Model<unknown>,
  FormTemplate: mongoose.Model<unknown>,
  FormResponse: mongoose.Model<unknown>,
  ReportingPeriod: mongoose.Model<unknown>,
  IndicatorTarget: mongoose.Model<unknown>,
  IndicatorResult: mongoose.Model<unknown>,
  AuditEvent: mongoose.Model<unknown>,
  Document: mongoose.Model<unknown>,
  DocumentVersion: mongoose.Model<unknown>,
  Notification: mongoose.Model<unknown>,
  StakeholderFeedback: mongoose.Model<unknown>,
  OrgNetwork: mongoose.Model<unknown>,
) {
  const existing = (await User.findOne({ email: SEED_EMAIL.toLowerCase() }).lean()) as
    | SeedUser
    | null;
  if (!existing?.organizationId) {
    return;
  }
  const orgId = existing.organizationId;

  await Invite.deleteMany({ organizationId: orgId });
  await Grant.deleteMany({ organizationId: orgId });
  await BudgetVariance.deleteMany({ organizationId: orgId });
  await BudgetLineItem.deleteMany({ organizationId: orgId });
  await BudgetAllocation.deleteMany({ organizationId: orgId });
  await BalancedScorecard.deleteMany({ organizationId: orgId });
  await OKR.deleteMany({ organizationId: orgId });
  await Donor.deleteMany({ organizationId: orgId });
  await Activity.deleteMany({ organizationId: orgId });
  await Partner.deleteMany({ organizationId: orgId });
  await Beneficiary.deleteMany({ organizationId: orgId });
  // Drop the old sparse unique index if it still exists — the new schema uses a
  // partialFilterExpression index which handles null nationalId values correctly.
  try {
    await Beneficiary.collection.dropIndex('org_nationalId_unique');
  } catch {
    // Index already dropped or never existed — safe to ignore
  }
  await ActivityTemplate.deleteMany({ organizationId: orgId });
  await FormResponse.deleteMany({ organizationId: orgId });
  await FormTemplate.deleteMany({ organizationId: orgId });
  await IndicatorResult.deleteMany({ organizationId: orgId });
  await IndicatorTarget.deleteMany({ organizationId: orgId });
  await ReportingPeriod.deleteMany({ organizationId: orgId });
  await Notification.deleteMany({ organizationId: orgId });
  await StakeholderFeedback.deleteMany({ organizationId: orgId });
  // OrgNetwork has no organizationId field at all — it's a cross-org
  // structure with hubOrganizationId plus a members[] array of other orgs.
  // Clear both directions so a stale network doesn't linger if this org
  // was previously a member of one rather than the hub.
  await OrgNetwork.deleteMany({
    $or: [{ hubOrganizationId: orgId }, { 'members.organizationId': orgId }],
  });
  await AuditEvent.deleteMany({ organizationId: orgId });
  await DocumentVersion.deleteMany({ organizationId: orgId });
  await Document.deleteMany({ organizationId: orgId });
  await Indicator.deleteMany({ organizationId: orgId });
  await Project.deleteMany({ organizationId: orgId });
  await OrganizationMember.deleteMany({ organizationId: orgId });
  await User.deleteMany({ organizationId: orgId });
  await Organization.deleteOne({ _id: orgId });

  console.log('Removed previous demo seed data.');
}

async function seed() {
  loadEnv();
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/monival-me';

  await mongoose.connect(uri);

  const Organization = mongoose.model('Organization', OrganizationSchema);
  const OrganizationMember = mongoose.model('OrganizationMember', OrganizationMemberSchema);
  const Donor = mongoose.model('Donor', DonorSchema);
  const User = mongoose.model('User', UserSchema);
  const Project = mongoose.model('Project', ProjectSchema);
  const Indicator = mongoose.model('Indicator', IndicatorSchema);
  const Activity = mongoose.model('Activity', ActivitySchema);
  const Partner = mongoose.model('Partner', require('../src/partners/schemas/partner.schema').PartnerSchema) as mongoose.Model<unknown>;
  const Beneficiary = mongoose.model('Beneficiary', require('../src/beneficiaries/schemas/beneficiary.schema').BeneficiarySchema) as mongoose.Model<unknown>;
  const Invite = mongoose.model('Invite', require('../src/members/schemas/invite.schema').InviteSchema) as mongoose.Model<unknown>;
  const Grant = mongoose.model('Grant', require('../src/grants/schemas/grant.schema').GrantSchema) as mongoose.Model<unknown>;
  const BudgetAllocation = mongoose.model('BudgetAllocation', require('../src/budget/schemas/budget.schema').BudgetAllocationSchema) as mongoose.Model<unknown>;
  const BudgetLineItem = mongoose.model('BudgetLineItem', require('../src/budget/schemas/budget.schema').BudgetLineItemSchema) as mongoose.Model<unknown>;
  const BudgetVariance = mongoose.model('BudgetVariance', require('../src/budget/schemas/budget.schema').BudgetVarianceSchema) as mongoose.Model<unknown>;
  const BalancedScorecard = mongoose.model('BalancedScorecard', require('../src/bsc/schemas/balanced-scorecard.schema').BalancedScorecardSchema) as mongoose.Model<unknown>;
  const OKR = mongoose.model('OKR', require('../src/okrs/schemas/okr.schema').OKRSchema) as mongoose.Model<unknown>;
  const ActivityTemplate = mongoose.model('ActivityTemplate', require('../src/activities/schemas/activity-template.schema').ActivityTemplateSchema) as mongoose.Model<unknown>;
  const FormTemplate = mongoose.model('FormTemplate', require('../src/forms/schemas/form-template.schema').FormTemplateSchema) as mongoose.Model<unknown>;
  const FormResponse = mongoose.model('FormResponse', require('../src/forms/schemas/form-response.schema').FormResponseSchema) as mongoose.Model<unknown>;
  const ReportingPeriod = mongoose.model('ReportingPeriod', require('../src/reporting/schemas/reporting-period.schema').ReportingPeriodSchema) as mongoose.Model<unknown>;
  const IndicatorTarget = mongoose.model('IndicatorTarget', require('../src/reporting/schemas/indicator-target.schema').IndicatorTargetSchema) as mongoose.Model<unknown>;
  const IndicatorResult = mongoose.model('IndicatorResult', require('../src/reporting/schemas/indicator-result.schema').IndicatorResultSchema) as mongoose.Model<unknown>;
  const AuditEvent = mongoose.model('AuditEvent', require('../src/audit/schemas/audit-event.schema').AuditEventSchema) as mongoose.Model<unknown>;
  const Document = mongoose.model('Document', require('../src/documents/schemas/document.schema').DocumentSchema) as mongoose.Model<unknown>;
  const DocumentVersion = mongoose.model('DocumentVersion', require('../src/documents/schemas/document-version.schema').DocumentVersionSchema) as mongoose.Model<unknown>;
  const Notification = mongoose.model('Notification', require('../src/notifications/schemas/notification.schema').NotificationSchema) as mongoose.Model<unknown>;
  const StakeholderFeedback = mongoose.model('StakeholderFeedback', require('../src/stakeholder-feedback/schemas/stakeholder-feedback.schema').StakeholderFeedbackSchema) as mongoose.Model<unknown>;
  const OrgNetwork = mongoose.model('OrgNetwork', require('../src/networks/schemas/org-network.schema').OrgNetworkSchema) as mongoose.Model<unknown>;

  await clearDemoData(
    User,
    Organization,
    OrganizationMember,
    Project,
    Indicator,
    Activity,
    Donor,
    Partner,
    Beneficiary,
    Invite,
    Grant,
    BudgetAllocation,
    BudgetLineItem,
    BudgetVariance,
    BalancedScorecard,
    OKR,
    ActivityTemplate,
    FormTemplate,
    FormResponse,
    ReportingPeriod,
    IndicatorTarget,
    IndicatorResult,
    AuditEvent,
    Document,
    DocumentVersion,
    Notification,
    StakeholderFeedback,
    OrgNetwork,
  );

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const org = await Organization.create({
    name: 'Lakeside Community Development Trust',
    country: 'Kenya',
    sector: 'Health & WASH',
    // 'scale' (not 'professional') so hasMultiOrgAggregation is true and
    // the Networks tab under Enterprise settings is actually reachable in
    // the demo — it was previously locked behind a plan tier the seed org
    // never had, which is exactly why no network demo data existed before.
    planId: 'scale',
    subscriptionStatus: 'active',
    currentPeriodEnd: periodEnd,
  });

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const user = await User.create({
    email: SEED_EMAIL.toLowerCase(),
    passwordHash,
    name: 'Amina Wanjiku',
    organizationId: org._id,
  });

  await OrganizationMember.create({
    userId: user._id,
    organizationId: org._id,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  });

  const adminUser = await User.create({
    email: 'grace.otieno@evidara.test',
    passwordHash,
    name: 'Grace Otieno',
    organizationId: org._id,
  });
  await OrganizationMember.create({
    userId: adminUser._id,
    organizationId: org._id,
    role: 'admin',
    status: 'active',
    joinedAt: new Date(new Date().setDate(new Date().getDate() - 30)),
  });

  const meOfficerUser = await User.create({
    email: 'joseph.mwangi@evidara.test',
    passwordHash,
    name: 'Joseph Mwangi',
    organizationId: org._id,
  });
  await OrganizationMember.create({
    userId: meOfficerUser._id,
    organizationId: org._id,
    role: 'me_officer',
    status: 'active',
    joinedAt: new Date(new Date().setDate(new Date().getDate() - 20)),
  });

  const financeUser = await User.create({
    email: 'rita.kimani@evidara.test',
    passwordHash,
    name: 'Rita Kimani',
    organizationId: org._id,
  });
  await OrganizationMember.create({
    userId: financeUser._id,
    organizationId: org._id,
    role: 'finance',
    status: 'active',
    joinedAt: new Date(new Date().setDate(new Date().getDate() - 15)),
  });

  const viewerUser = await User.create({
    email: 'daniel.achem@evidara.test',
    passwordHash,
    name: 'Daniel Achem',
    organizationId: org._id,
  });
  await OrganizationMember.create({
    userId: viewerUser._id,
    organizationId: org._id,
    role: 'viewer',
    status: 'active',
    joinedAt: new Date(new Date().setDate(new Date().getDate() - 10)),
  });

  const inviteToken = randomBytes(24).toString('hex');
  await Invite.create({
    email: 'new.collaborator@evidara.test',
    organizationId: org._id,
    invitedByUserId: user._id,
    role: 'field_officer',
    token: inviteToken,
    expiresAt: new Date(new Date().setDate(new Date().getDate() + 7)),
  });

  await Donor.insertMany([
    {
      organizationId: org._id,
      name: 'Global Fund',
      contactEmail: 'grants@globalfund.example',
      country: 'Switzerland',
    },
    {
      organizationId: org._id,
      name: 'USAID',
      contactEmail: 'partners@usaid.example',
      country: 'United States',
    },
  ]);

  // Seed partners and beneficiaries
  const partners = await Partner.insertMany([
    {
      organizationId: org._id,
      name: 'County Health Department, Kisumu',
      contactEmail: 'khd@kisumu.example',
      country: 'Kenya',
      notes: 'Local government health partner',
      geoPoint: { latitude: -0.1022, longitude: 34.7617 },
    },
    {
      organizationId: org._id,
      name: 'Community Water Committee — Ward A',
      contactEmail: 'cwc-warda@example.org',
      country: 'Kenya',
      notes: 'Community-level water management committee',
      geoPoint: { latitude: -0.0978, longitude: 34.7589 },
    },
  ]);

  const beneficiaries = await Beneficiary.insertMany([
    {
      organizationId: org._id,
      registrationType: 'group',
      name: 'Household Group — Ward A',
      groupType: 'household',
      location: 'Kisumu, Ward A',
      notes: 'Representative household grouping used for monitoring',
      geoPoint: { latitude: -0.0985, longitude: 34.7601 },
    },
    {
      organizationId: org._id,
      registrationType: 'group',
      name: 'Pregnant women cohort — Siaya',
      groupType: 'cohort',
      location: 'Siaya County',
      notes: 'Cohort tracked for ANC follow-up and referrals',
      geoPoint: { latitude: 0.0607, longitude: 34.2881 },
    },
  ]);

  const wash = await Project.create({
    organizationId: org._id,
    name: 'WASH & Sanitation Programme',
    donor: 'Global Fund',
    description: 'Community water, sanitation, and hygiene across three counties.',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'active',
    geoPoint: { latitude: -0.1022, longitude: 34.7617 },
  });


  // ─── WASH Workplan ─────────────────────────────────────────────────────────
  await Project.findByIdAndUpdate(wash._id, {
    $set: {
      workplan: [
        {
          title: 'Inception & Community Baseline Survey',
          description: 'Conduct comprehensive baseline survey across all 3 counties to establish WASH status, collect GPS coordinates of water points, and map sanitation coverage.',
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-02-28'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Dr. Amina Wekesa',
          estimatedCost: 120000,
          actualCost: 118500,
          outputDescription: 'Baseline report with GPS-mapped water points and sanitation coverage data for 3 counties',
        },
        {
          title: 'Borehole Rehabilitation – Kisumu County (Phase 1)',
          description: 'Rehabilitate 12 non-functional boreholes in Kisumu County, install solar pumps, construct concrete platforms and drainage channels.',
          startDate: new Date('2025-02-01'),
          endDate: new Date('2025-04-30'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Eng. Peter Otieno',
          estimatedCost: 480000,
          actualCost: 492000,
          outputDescription: '12 rehabilitated boreholes serving 6,000+ households in Kisumu County',
        },
        {
          title: 'Water User Committee Formation & Training',
          description: 'Form and train Water User Committees (WUCs) in all project villages. Training covers governance, financial management, chlorination, and minor repairs.',
          startDate: new Date('2025-03-01'),
          endDate: new Date('2025-05-31'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Faith Atieno',
          estimatedCost: 85000,
          actualCost: 79000,
          outputDescription: '48 functional Water User Committees with trained chairpersons and treasurers',
        },
        {
          title: 'Latrine Construction – Siaya County (Phase 1)',
          description: 'Construct 200 VIP latrines in Siaya County targeting households with open defecation. Includes slab, superstructure, and handwashing station.',
          startDate: new Date('2025-04-01'),
          endDate: new Date('2025-06-30'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q2',
          responsibleName: 'Eng. Peter Otieno',
          estimatedCost: 320000,
          actualCost: 315000,
          outputDescription: '200 VIP latrines constructed benefiting 1,400 household members in Siaya',
        },
        {
          title: 'Community Health Workers – WASH SBCC Training',
          description: 'Train 120 Community Health Workers (CHWs) on WASH behaviour change communication (SBCC). CHWs to conduct monthly household visits and CLTS triggering sessions.',
          startDate: new Date('2025-05-01'),
          endDate: new Date('2025-07-31'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q2',
          responsibleName: 'Mercy Adhiambo',
          estimatedCost: 95000,
          actualCost: 91000,
          outputDescription: '120 CHWs trained and deployed across 3 counties; SBCC materials distributed',
        },
        {
          title: 'School WASH Upgrades – 18 Primary Schools',
          description: 'Construct gender-segregated sanitation blocks, install handwashing stations, and train School Health Committees in 18 primary schools across the project area.',
          startDate: new Date('2025-06-01'),
          endDate: new Date('2025-09-30'),
          status: 'in_progress',
          progressPct: 72,
          quarter: 'Q3',
          responsibleName: 'Eng. Peter Otieno',
          estimatedCost: 540000,
          actualCost: 388000,
          outputDescription: '18 schools with functioning WASH facilities; 5,400 pupils with improved sanitation',
        },
        {
          title: 'Borehole Rehabilitation – Homa Bay County (Phase 2)',
          description: 'Rehabilitate 8 boreholes in Homa Bay County. Includes pump testing, casing repair, apron slabs, and fencing.',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-09-30'),
          status: 'in_progress',
          progressPct: 45,
          quarter: 'Q3',
          responsibleName: 'Eng. James Ochieng',
          estimatedCost: 320000,
          actualCost: 144000,
          outputDescription: '8 rehabilitated boreholes providing clean water to 4,000+ households in Homa Bay',
        },
        {
          title: 'Midterm Review & Data Quality Audit',
          description: 'Conduct project midterm review including field visits, KII, FGDs, and data quality audit. Produce midterm report for Global Fund.',
          startDate: new Date('2025-08-01'),
          endDate: new Date('2025-09-30'),
          status: 'planned',
          progressPct: 0,
          quarter: 'Q3',
          responsibleName: 'Dr. Amina Wekesa',
          estimatedCost: 75000,
          actualCost: 0,
          outputDescription: 'Midterm review report with adaptive management recommendations',
        },
        {
          title: 'Latrine Construction – Homa Bay County (Phase 2)',
          description: 'Construct 150 ecological sanitation latrines in Homa Bay County targeting flood-prone areas.',
          startDate: new Date('2025-10-01'),
          endDate: new Date('2025-12-31'),
          status: 'planned',
          progressPct: 0,
          quarter: 'Q4',
          responsibleName: 'Eng. James Ochieng',
          estimatedCost: 280000,
          actualCost: 0,
          outputDescription: '150 eco-san latrines in flood-resilient designs for Homa Bay households',
        },
        {
          title: 'Community-Led Total Sanitation (CLTS) Triggering',
          description: 'Roll out CLTS in 60 villages targeting open defecation free (ODF) status certification by end of project.',
          startDate: new Date('2025-10-01'),
          endDate: new Date('2026-03-31'),
          status: 'planned',
          progressPct: 0,
          quarter: 'Q4',
          responsibleName: 'Mercy Adhiambo',
          estimatedCost: 110000,
          actualCost: 0,
          outputDescription: '60 villages triggered; 20 villages certified ODF by March 2026',
        },
        {
          title: 'Water Safety Planning & Quality Testing',
          description: 'Develop water safety plans for all rehabilitated boreholes. Conduct quarterly water quality testing and report results to community and county health offices.',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-06-30'),
          status: 'planned',
          progressPct: 0,
          quarter: 'Q1',
          responsibleName: 'Dr. Amina Wekesa',
          estimatedCost: 60000,
          actualCost: 0,
          outputDescription: '20 water safety plans; quarterly lab reports for all water points',
        },
        {
          title: 'Final Evaluation & Donor Report',
          description: 'Conduct final project evaluation using mixed methods. Produce comprehensive end-of-project report for Global Fund including WASH behavior change data.',
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-12-15'),
          status: 'planned',
          progressPct: 0,
          quarter: 'Q4',
          responsibleName: 'Dr. Amina Wekesa',
          estimatedCost: 95000,
          actualCost: 0,
          outputDescription: 'Final evaluation report + donor completion report submitted to Global Fund',
        },
      ],
    },
  });

  const washGoal = await Indicator.create({
    organizationId: org._id,
    projectId: wash._id,
    code: 'IM1',
    level: 'goal',
    title: 'Reduction in waterborne disease incidence',
    unit: 'cases per 1000 population per year',
    baseline: 245,
    target: 50,
    frequency: 'annual',
  });

  const washOutcome = await Indicator.create({
    organizationId: org._id,
    projectId: wash._id,
    parentId: washGoal._id,
    level: 'outcome',
    code: 'OC1',
    title: 'Households with sustainable WASH behavior change',
    unit: '%',
    baseline: 8,
    target: 75,
    frequency: 'quarterly',
  });

  const washIndicators = await Indicator.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      parentId: washOutcome._id,
      level: 'output',
      code: 'O1',
      title: 'Households with access to safe water',
      unit: 'households',
      baseline: 0,
      target: 500,
      frequency: 'quarterly',
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      parentId: washOutcome._id,
      level: 'output',
      code: 'O2',
      title: 'Households using improved latrines',
      unit: 'households',
      baseline: 50,
      target: 200,
      frequency: 'quarterly',
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      parentId: washOutcome._id,
      level: 'output',
      code: 'O3',
      title: 'Community hygiene promotion sessions',
      unit: 'sessions',
      baseline: 0,
      target: 24,
      frequency: 'monthly',
    },
  ]);

  await Activity.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[0]._id,
      title: 'Borehole commissioning — Ward A',
      description: 'Official handover to community water committee.',
      activityDate: new Date('2025-02-14'),
      location: 'Kisumu, Ward A',
      participants: 85,
      quantity: 120,
      notes: '120 households now on piped supply.',
      geoPoint: { latitude: -0.0978, longitude: 34.7589 },
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[0]._id,
      title: 'Water point rehabilitation',
      activityDate: new Date('2025-03-22'),
      location: 'Kisumu, Ward B',
      participants: 42,
      quantity: 65,
      geoPoint: { latitude: -0.1104, longitude: 34.7701 },
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[1]._id,
      title: 'CLTS triggering workshop',
      activityDate: new Date('2025-04-05'),
      location: 'Homa Bay',
      participants: 210,
      quantity: 38,
      geoPoint: { latitude: -0.5273, longitude: 34.4571 },
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[2]._id,
      title: 'School hygiene club training',
      activityDate: new Date('2025-04-18'),
      location: 'Kisumu Central',
      participants: 48,
      quantity: 3,
      geoPoint: { latitude: -0.1022, longitude: 34.7617 },
    },
  ]);

  // lastAchievedValue reflects the sum of recorded activity quantities
  // above for each indicator — kept in sync here since this app's normal
  // workflow (calculateResults(), run against real reporting periods)
  // isn't executed by this seed script. Several dashboards/the network
  // rollup read this field directly, so leaving it unset would show 0
  // even though real activity data exists for these indicators.
  await Indicator.updateOne({ _id: washIndicators[0]._id }, { $set: { lastAchievedValue: 185 } }); // 120 (Ward A) + 65 (Ward B) borehole activities
  await Indicator.updateOne({ _id: washIndicators[1]._id }, { $set: { lastAchievedValue: 38 } }); // CLTS triggering workshop
  await Indicator.updateOne({ _id: washIndicators[2]._id }, { $set: { lastAchievedValue: 3 } }); // School hygiene club training

  // Attach a partner and beneficiaries to a sample activity (if present)
  try {
    const mobileActivity = await Activity.findOne({ title: 'Mobile clinic — ANC day', organizationId: org._id }).lean();
    if (mobileActivity) {
      await Activity.updateOne({ _id: mobileActivity._id }, { $set: { partnerId: partners[0]._id, beneficiaryIds: [beneficiaries[1]._id] } });
    }
  } catch (e) {
    // ignore if update fails in older seed runs
  }

  // ─── Stakeholder Feedback ───────────────────────────────────────────────────
  await StakeholderFeedback.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[0]._id,
      title: 'Borehole water tastes much better since the upgrade',
      content: 'Since the borehole was rehabilitated, the water quality has improved a lot. My family no longer gets stomach issues like before. Thank you for fixing it quickly.',
      channel: 'interview',
      sentiment: 'positive',
      sentimentScore: 82,
      thematicTags: ['water quality', 'health impact'],
      respondentName: 'Grace Atieno',
      respondentSex: 'female',
      respondentAge: 41,
      respondentLocation: 'Kisumu, Ward A',
      isAnonymous: false,
      status: 'reviewed',
      consentToPublish: true,
      collectedAt: new Date('2025-02-20'),
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[1]._id,
      title: 'Latrine construction taking too long',
      content: 'It has been three months since the CLTS training and we still have not received the promised construction materials for the household latrines. Several families are getting frustrated.',
      channel: 'complaint',
      sentiment: 'negative',
      sentimentScore: 22,
      thematicTags: ['delays', 'sanitation', 'materials'],
      isAnonymous: true,
      respondentLocation: 'Homa Bay',
      status: 'actioned',
      actionsLog: [
        {
          action: 'Followed up with supply chain team; materials dispatched',
          takenAt: new Date('2025-04-20'),
          byUserId: user._id,
          notes: 'Confirmed delivery scheduled for first week of May.',
        },
      ],
      responseNotes: 'Escalated to logistics; resolved within two weeks.',
      consentToPublish: false,
      collectedAt: new Date('2025-04-08'),
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      title: 'Suggestion: add a second water collection point',
      content: 'The queue at the water point gets very long in the mornings before school. It would help a lot if a second collection point could be added on the other side of the village.',
      channel: 'suggestion',
      sentiment: 'neutral',
      sentimentScore: 55,
      thematicTags: ['access', 'infrastructure'],
      respondentName: 'Samuel Otieno',
      respondentSex: 'male',
      respondentAge: 34,
      respondentLocation: 'Kisumu, Ward B',
      isAnonymous: false,
      status: 'received',
      consentToPublish: true,
      collectedAt: new Date('2025-03-28'),
    },
    {
      organizationId: org._id,
      projectId: wash._id,
      indicatorId: washIndicators[2]._id,
      title: 'Hygiene club is genuinely changing habits at school',
      content: 'The pupils in the hygiene club now remind each other to wash hands before meals without being told by teachers. The handwashing stations are used every single day.',
      channel: 'focus_group_discussion',
      sentiment: 'very_positive',
      sentimentScore: 91,
      thematicTags: ['behaviour change', 'schools', 'hygiene'],
      respondentLocation: 'Kisumu Central',
      isAnonymous: false,
      respondentName: 'Teacher Focus Group',
      status: 'closed',
      actionsLog: [
        {
          action: 'Shared success story with donor in quarterly update',
          takenAt: new Date('2025-04-25'),
          byUserId: user._id,
        },
      ],
      consentToPublish: true,
      collectedAt: new Date('2025-04-19'),
    },
  ]);

  const maternal = await Project.create({
    organizationId: org._id,
    name: 'Maternal Health Outreach',
    donor: 'USAID',
    description: 'Mobile clinics and ANC uptake in rural wards.',
    startDate: new Date('2024-07-01'),
    endDate: new Date('2025-06-30'),
    status: 'active',
    geoPoint: { latitude: 0.0607, longitude: 34.2881 },
  });

  // ─── Maternal Health Workplan ───────────────────────────────────────────────
  await Project.findByIdAndUpdate(maternal._id, {
    $set: {
      workplan: [
        {
          title: 'Mobile Clinic Fleet Setup & Staffing',
          description: 'Procure and equip 3 mobile clinic vehicles with medical supplies, ANC kits, and communication equipment. Recruit and onboard clinical officers and midwives.',
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-08-31'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Dr. Grace Nyambura',
          estimatedCost: 850000,
          actualCost: 823000,
          outputDescription: '3 fully-equipped mobile clinics deployed; 9 clinical staff recruited and inducted',
        },
        {
          title: 'Community Health Promoter (CHP) Training',
          description: 'Train 80 Community Health Promoters on ANC scheduling, danger sign recognition, birth preparedness, and referral pathways.',
          startDate: new Date('2024-08-01'),
          endDate: new Date('2024-09-30'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Sr. Agnes Kamau',
          estimatedCost: 135000,
          actualCost: 128000,
          outputDescription: '80 CHPs trained and deployed across all target wards',
        },
        {
          title: 'ANC Outreach Campaigns – Q1 (10 Wards)',
          description: 'Conduct ANC outreach sessions in 10 target wards. Provide ANC visits 1-4, iron supplements, malaria prophylaxis, and birth planning.',
          startDate: new Date('2024-09-01'),
          endDate: new Date('2024-11-30'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q1',
          responsibleName: 'Dr. Grace Nyambura',
          estimatedCost: 240000,
          actualCost: 235000,
          outputDescription: '2,840 ANC visits provided; 1,920 women received 4+ ANC visits',
        },
        {
          title: 'Skilled Birth Attendant Capacity Building',
          description: 'Train 30 facility midwives and nurses on BEmONC protocols, partograph use, PPH management, and newborn resuscitation.',
          startDate: new Date('2024-10-01'),
          endDate: new Date('2024-11-30'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q2',
          responsibleName: 'Dr. Collins Omondi',
          estimatedCost: 180000,
          actualCost: 174000,
          outputDescription: '30 midwives trained on BEmONC; clinical competency certified',
        },
        {
          title: 'Facility Upgrade – 5 Health Centres (Maternity Wings)',
          description: 'Renovate maternity wings at 5 selected health centres. Supply delivery kits, MVA kits, and essential medicines.',
          startDate: new Date('2024-11-01'),
          endDate: new Date('2025-01-31'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q2',
          responsibleName: 'Eng. Samuel Kariuki',
          estimatedCost: 620000,
          actualCost: 608000,
          outputDescription: '5 maternity wings renovated; 5 newborn corners established',
        },
        {
          title: 'Postnatal Care (PNC) Protocol Roll-out',
          description: 'Implement structured PNC protocol at all project facilities: 24-hour PNC, mother-baby assessment at 48h, 7-day, and 42-day visits.',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-02-28'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q3',
          responsibleName: 'Sr. Agnes Kamau',
          estimatedCost: 95000,
          actualCost: 89000,
          outputDescription: 'PNC protocol operational in 5 facilities; 2,100 mothers received structured PNC',
        },
        {
          title: 'HMIS Strengthening & Data Clerk Training',
          description: 'Improve HMIS at 5 facilities. Train data clerks on DHIS2 data entry, ANC register completion, and monthly reporting.',
          startDate: new Date('2025-02-01'),
          endDate: new Date('2025-03-31'),
          status: 'completed',
          progressPct: 100,
          quarter: 'Q3',
          responsibleName: 'James Mwangi',
          estimatedCost: 45000,
          actualCost: 43000,
          outputDescription: '10 data clerks trained; DHIS2 reporting completeness improved from 62% to 94%',
        },
        {
          title: 'Male Engagement Campaign – Husbands as Birth Partners',
          description: 'Run targeted community campaign engaging men in maternal health decisions. Conduct 40 community dialogues and train 80 male champions.',
          startDate: new Date('2025-03-01'),
          endDate: new Date('2025-05-31'),
          status: 'in_progress',
          progressPct: 65,
          quarter: 'Q3',
          responsibleName: 'Mercy Adhiambo',
          estimatedCost: 120000,
          actualCost: 78000,
          outputDescription: '40 community dialogues held; 80 male champions trained',
        },
        {
          title: 'Obstetric Emergency Drills – Quarterly',
          description: 'Conduct quarterly obstetric emergency simulation drills at all 5 facilities. Scenarios: PPH, eclampsia, obstructed labour, neonatal resuscitation.',
          startDate: new Date('2025-04-01'),
          endDate: new Date('2025-06-30'),
          status: 'in_progress',
          progressPct: 40,
          quarter: 'Q4',
          responsibleName: 'Dr. Collins Omondi',
          estimatedCost: 60000,
          actualCost: 24000,
          outputDescription: '4 drill cycles completed across all project facilities',
        },
        {
          title: 'End-of-Project Evaluation & USAID Final Report',
          description: 'Conduct final evaluation using LQAS methodology. Measure ANC4+ coverage, skilled birth attendance. Produce USAID completion report.',
          startDate: new Date('2025-05-01'),
          endDate: new Date('2025-06-30'),
          status: 'delayed',
          progressPct: 15,
          quarter: 'Q4',
          responsibleName: 'Dr. Grace Nyambura',
          estimatedCost: 110000,
          actualCost: 16500,
          outputDescription: 'LQAS evaluation report + USAID final performance report',
        },
      ],
    },
  });


  const maternalIndicators = await Indicator.insertMany([
    {
      organizationId: org._id,
      projectId: maternal._id,
      code: 'H1',
      title: 'Women completing 4+ ANC visits',
      unit: 'women',
      baseline: 100,
      target: 800,
      frequency: 'quarterly',
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      code: 'H2',
      title: 'Facility deliveries supported',
      unit: 'deliveries',
      baseline: 0,
      target: 350,
      frequency: 'quarterly',
    },
  ]);

  await Activity.insertMany([
    {
      organizationId: org._id,
      projectId: maternal._id,
      indicatorId: maternalIndicators[0]._id,
      title: 'Mobile clinic — ANC day',
      activityDate: new Date('2025-03-10'),
      location: 'Siaya County',
      participants: 156,
      quantity: 94,
      notes: '94 women registered for follow-up ANC.',
      geoPoint: { latitude: 0.0607, longitude: 34.2881 },
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      indicatorId: maternalIndicators[1]._id,
      title: 'Referral transport facilitation',
      activityDate: new Date('2025-04-02'),
      location: 'Siaya County',
      participants: 12,
      quantity: 12,
      geoPoint: { latitude: 0.0512, longitude: 34.3015 },
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      title: 'CHW mentorship session',
      description: 'General capacity building (not tied to a single indicator).',
      activityDate: new Date('2025-04-25'),
      location: 'Siaya County',
      participants: 24,
      quantity: 0,
      geoPoint: { latitude: 0.0689, longitude: 34.2756 },
    },
  ]);

  const school = await Project.create({
    organizationId: org._id,
    name: 'School Nutrition Initiative',
    donor: 'UNICEF',
    description: 'School meal programs, growth monitoring, and parent nutrition education.',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-12-31'),
    status: 'active',
    geoPoint: { latitude: -0.0917, longitude: 34.7522 },
  });

  const schoolIndicators = await Indicator.insertMany([
    {
      organizationId: org._id,
      projectId: school._id,
      code: 'N1',
      title: 'Children receiving daily nutritious meals',
      unit: 'children',
      baseline: 0,
      target: 1200,
      frequency: 'monthly',
    },
    {
      organizationId: org._id,
      projectId: school._id,
      code: 'N2',
      title: 'Growth monitoring sessions completed',
      unit: 'sessions',
      baseline: 0,
      target: 36,
      frequency: 'monthly',
    },
  ]);

  await Activity.insertMany([
    {
      organizationId: org._id,
      projectId: school._id,
      indicatorId: schoolIndicators[0]._id,
      title: 'School meal distribution launch',
      activityDate: new Date('2025-03-01'),
      location: 'Kisumu Central',
      participants: 1200,
      quantity: 1200,
      notes: 'Program reached all registered pupils on day one.',
      geoPoint: { latitude: -0.0951, longitude: 34.7553 },
    },
    {
      organizationId: org._id,
      projectId: school._id,
      indicatorId: schoolIndicators[1]._id,
      title: 'Growth monitoring clinic',
      activityDate: new Date('2025-03-15'),
      location: 'Kisumu Central',
      participants: 3,
      quantity: 1,
      notes: 'First growth monitoring session completed for 400 pupils.',
      geoPoint: { latitude: -0.0884, longitude: 34.7498 },
    },
  ]);

  const grant = await Grant.create({
    organizationId: org._id,
    name: 'WASH and Maternal Health Integrated Grant',
    description: 'Combined funding package for WASH and maternal health services.',
    donorId: undefined,
    amount: 450000,
    currency: 'USD',
    amountSpent: 148000,
    status: 'active',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2026-12-31'),
    linkedProjects: [wash._id, maternal._id],
    requiresMonthlyReporting: true,
    requiresFinalReport: true,
    termsAndConditions: 'Use funds for program delivery, reporting, and monitoring activities.',
    createdBy: user._id,
    updatedBy: adminUser._id,
  });

  await Grant.create({
    organizationId: org._id,
    name: 'School Nutrition Facility Upgrade',
    description: 'Grant for kitchen equipment and school feeding infrastructure.',
    donorId: undefined,
    amount: 190000,
    currency: 'USD',
    amountSpent: 56000,
    status: 'pending',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-12-31'),
    linkedProjects: [school._id],
    requiresMonthlyReporting: true,
    requiresFinalReport: true,
    termsAndConditions: 'Funds to be managed by the finance team for procurement and quality control.',
    createdBy: financeUser._id,
    updatedBy: financeUser._id,
  });

  // --- Budget, BSC, OKR, Framework demo data ---

  const budget = await BudgetAllocation.create({
    organizationId: org._id,
    name: 'FY26 Core Operations',
    description: 'Annual operational budget for HQ and field activities.',
    projectId: wash._id,
    allocatedAmount: 120000,
    spentAmount: 34000,
    currency: 'USD',
    category: 'operational',
    status: 'active',
    fiscalYear: 2026,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    allowedExpenseTypes: ['personnel', 'supplies', 'travel', 'training'],
    createdBy: user._id,
  });

  const budget2 = await BudgetAllocation.create({
    organizationId: org._id,
    name: 'Maternal Health Q2 Expansion',
    description: 'Quarterly budget for maternal health outreach.',
    projectId: maternal._id,
    allocatedAmount: 45000,
    spentAmount: 15000,
    currency: 'USD',
    category: 'project',
    status: 'active',
    fiscalYear: 2026,
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-06-30'),
    allowedExpenseTypes: ['personnel', 'supplies', 'travel'],
    createdBy: user._id,
  });

  await BudgetLineItem.insertMany([
    {
      budgetAllocationId: budget._id,
      organizationId: org._id,
      description: 'Staff salaries',
      amount: 60000,
      spent: 20000,
      costCategory: 'personnel',
      unitDescription: 'months',
      quantity: 12,
      unitCost: 5000,
      status: 'committed',
      createdBy: user._id,
    },
    {
      budgetAllocationId: budget._id,
      organizationId: org._id,
      description: 'Field supplies',
      amount: 25000,
      spent: 8000,
      costCategory: 'supplies',
      unitDescription: 'units',
      quantity: 100,
      unitCost: 250,
      status: 'committed',
      createdBy: user._id,
    },
  ]);

  const budgetVariance1 = await BudgetVariance.create({
    organizationId: org._id,
    budgetAllocationId: budget._id,
    period: '2026-03',
    budgetedAmount: 30000,
    actualAmount: 28000,
    variance: 2000,
    variancePercentage: 6.67,
    trend: 'favorable',
    burnRate: 93.33,
    notes: 'Slight underspending due to delayed procurement.',
    calculatedBy: user._id,
  });

  await BudgetLineItem.insertMany([
    {
      budgetAllocationId: budget2._id,
      organizationId: org._id,
      description: 'Medical supplies for outreach',
      amount: 15000,
      spent: 5000,
      costCategory: 'supplies',
      unitDescription: 'kits',
      quantity: 50,
      unitCost: 300,
      status: 'committed',
      createdBy: user._id,
    },
    {
      budgetAllocationId: budget2._id,
      organizationId: org._id,
      description: 'Transport costs',
      amount: 5000,
      spent: 2500,
      costCategory: 'travel',
      unitDescription: 'trips',
      quantity: 10,
      unitCost: 500,
      status: 'committed',
      createdBy: user._id,
    },
  ]);

  const budgetVariance2 = await BudgetVariance.create({
    organizationId: org._id,
    budgetAllocationId: budget2._id,
    period: '2026-04',
    budgetedAmount: 15000,
    actualAmount: 7500,
    variance: 7500,
    variancePercentage: 50,
    trend: 'favorable',
    burnRate: 50,
    notes: 'Procurement of kits underway, spending is on track.',
    calculatedBy: user._id,
  });

  const BudgetAuditEvent = mongoose.model('BudgetAuditEvent', require('../src/budget/schemas/budget.schema').BudgetAuditEventSchema) as mongoose.Model<unknown>;
  await BudgetAuditEvent.deleteMany({ organizationId: org._id });
  await BudgetAuditEvent.insertMany([
    {
      organizationId: org._id,
      userId: user._id,
      userEmail: SEED_EMAIL,
      action: 'CREATE_ALLOCATION',
      entity: 'BudgetAllocation',
      entityId: budget._id,
      reason: 'Initial setup for FY26 Core Operations',
    },
    {
      organizationId: org._id,
      userId: user._id,
      userEmail: SEED_EMAIL,
      action: 'APPROVE_ALLOCATION',
      entity: 'BudgetAllocation',
      entityId: budget._id,
      reason: 'Approved by board',
    },
    {
      organizationId: org._id,
      userId: user._id,
      userEmail: SEED_EMAIL,
      action: 'CREATE_ALLOCATION',
      entity: 'BudgetAllocation',
      entityId: budget2._id,
      reason: 'Q2 Expansion setup',
    },
    {
      organizationId: org._id,
      userId: user._id,
      userEmail: SEED_EMAIL,
      action: 'CALCULATE_VARIANCE',
      entity: 'BudgetVariance',
      entityId: budgetVariance1._id,
      reason: 'End of month review',
    },
  ]);

  const bsc = await BalancedScorecard.create({
    organizationId: org._id,
    name: '2026 Strategic BSC',
    description: 'Annual BSC for all programs',
    fiscalYear: 2026,
    status: 'active',
    perspectives: [
      {
        perspective: 'financial',
        strategicTheme: 'Sustainability',
        objectives: [
          { title: 'Increase grant revenue', weight: 60, target: 100000, current: 40000, status: 'on_track' },
          { title: 'Reduce admin costs', weight: 40, target: 20, current: 22, status: 'at_risk' },
        ],
      },
      {
        perspective: 'customer',
        strategicTheme: 'Community Impact',
        objectives: [
          { title: 'Beneficiary satisfaction', weight: 50, target: 90, current: 85, status: 'on_track' },
          { title: 'Expand outreach', weight: 50, target: 10000, current: 4200, status: 'on_track' },
        ],
      },
      {
        perspective: 'internal',
        strategicTheme: 'Process Excellence',
        objectives: [
          { title: 'Improve reporting timeliness', weight: 70, target: 100, current: 80, status: 'at_risk' },
          { title: 'Automate data collection', weight: 30, target: 5, current: 2, status: 'off_track' },
        ],
      },
      {
        perspective: 'learning',
        strategicTheme: 'Capacity Building',
        objectives: [
          { title: 'Staff training hours', weight: 60, target: 500, current: 120, status: 'on_track' },
          { title: 'Leadership development', weight: 40, target: 10, current: 3, status: 'on_track' },
        ],
      },
    ],
  });

  const okr1 = await OKR.create({
    organizationId: org._id,
    title: 'Q2 2026 Field Expansion',
    description: 'Expand field operations to three new counties with 50 new CHWs trained and equipped.',
    quarter: 2,
    year: 2026,
    status: 'active',
    ownerUserId: user._id,
    keyResults: [
      { 
        title: 'Open 3 new field offices in target counties', 
        targetValue: 3, 
        currentValue: 1, 
        unit: 'offices', 
        confidence: 70, 
        status: 'in_progress',
        notes: 'County partnership agreements signed and office spaces secured',
      },
      { 
        title: 'Train and deploy 50 new Community Health Workers', 
        targetValue: 50, 
        currentValue: 18, 
        unit: 'CHWs', 
        confidence: 60, 
        status: 'in_progress',
        notes: 'Baseline CHW training delivered; advanced modules in progress',
      },
      { 
        title: 'Establish 15 community water points with functioning committees', 
        targetValue: 15, 
        currentValue: 6, 
        unit: 'water_points', 
        confidence: 75, 
        status: 'in_progress',
        notes: 'Site assessments complete; 3 boreholes drilled; community committees formed',
      },
    ],
    linkedProjects: [wash._id],
    progressPercentage: 40,
  });

  const okr2 = await OKR.create({
    organizationId: org._id,
    title: 'Q2 2026 Maternal Health Impact',
    description: 'Achieve 800 women completing 4+ ANC visits and support 350 facility deliveries.',
    quarter: 2,
    year: 2026,
    status: 'active',
    ownerUserId: adminUser._id,
    keyResults: [
      { 
        title: 'Enroll 800 women in ANC+ program', 
        targetValue: 800, 
        currentValue: 312, 
        unit: 'women', 
        confidence: 65, 
        status: 'in_progress',
        notes: 'Mobile clinics reaching 12 villages weekly; community mobilization ongoing',
      },
      { 
        title: 'Support 350 facility deliveries with trained birth attendants', 
        targetValue: 350, 
        currentValue: 89, 
        unit: 'deliveries', 
        confidence: 70, 
        status: 'in_progress',
        notes: 'Transport voucher system active; 4 health facilities equipped with materials',
      },
      { 
        title: 'Achieve 90% ANC follow-up completion rate', 
        targetValue: 90, 
        currentValue: 76, 
        unit: '%', 
        confidence: 55, 
        status: 'at_risk',
        notes: 'SMS reminders deployed; CHW follow-up protocol strengthened',
      },
    ],
    linkedProjects: [maternal._id],
    progressPercentage: 38,
  });

  const okr3 = await OKR.create({
    organizationId: org._id,
    title: 'Q2 2026 Organizational Excellence',
    description: 'Strengthen internal systems, governance, and team capacity.',
    quarter: 2,
    year: 2026,
    status: 'active',
    ownerUserId: financeUser._id,
    keyResults: [
      { 
        title: 'Conduct independent financial audit with zero findings', 
        targetValue: 1, 
        currentValue: 0, 
        unit: 'audits', 
        confidence: 80, 
        status: 'in_progress',
        notes: 'Auditor selected; full records prepared; audit scheduled Q2',
      },
      { 
        title: 'Achieve 98% data quality in all field reports', 
        targetValue: 98, 
        currentValue: 84, 
        unit: '%', 
        confidence: 70, 
        status: 'in_progress',
        notes: 'Data validation checklist implemented; weekly QA reviews in place',
      },
      { 
        title: 'Complete staff competency assessments and training plans for 30 staff', 
        targetValue: 30, 
        currentValue: 12, 
        unit: 'staff', 
        confidence: 65, 
        status: 'in_progress',
        notes: 'Training assessment tool developed; 40% of staff assessed',
      },
    ],
    linkedProjects: [],
    progressPercentage: 32,
  });

  const activityTemplates = await ActivityTemplate.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      name: 'Household WASH Monitoring Visit',
      description: 'Standard field visit for water access and sanitation monitoring.',
      defaultLocation: 'Field site',
      defaultActivityType: 'Monitoring visit',
      defaultEvidenceUrl: '',
      defaultParticipants: 1,
      defaultQuantity: 0,
      defaultNotes: 'Collect household WASH indicators and provide hygiene messaging.',
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      name: 'ANC follow-up outreach',
      description: 'Follow-up visit for pregnant women enrolled in ANC support.',
      defaultLocation: 'Community health point',
      defaultActivityType: 'Outreach',
      defaultEvidenceUrl: '',
      defaultParticipants: 10,
      defaultQuantity: 0,
      defaultNotes: 'Record attendance, referrals and health education delivered.',
    },
  ]);

  const formTemplate = await FormTemplate.create({
    organizationId: org._id,
    projectId: wash._id,
    indicatorId: washIndicators[0]._id,
    name: 'WASH Household Survey',
    description: 'Monthly WASH data collection template for household visits.',
    status: 'active',
    sections: [
      {
        title: 'Household details',
        description: 'Basic household and access information.',
        questions: [
          { key: 'household_id', label: 'Household ID', type: 'text', required: true },
          { key: 'water_source', label: 'Primary water source', type: 'select', required: true, options: ['Piped', 'Borehole', 'River', 'Other'] },
          { key: 'latrine_type', label: 'Latrine type', type: 'select', options: ['No latrine', 'Pit latrine', 'VIP latrine', 'Other'] },
          { key: 'household_size', label: 'Household size', type: 'number', required: true },
        ],
      },
      {
        title: 'Visit summary',
        description: 'Field observations and message delivery.',
        questions: [
          { key: 'session_date', label: 'Visit date', type: 'date', required: true },
          { key: 'participants', label: 'Participants reached', type: 'number', required: true },
          { key: 'hygiene_message', label: 'Hygiene message delivered', type: 'textarea' },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
  });

  const baselineActivity = await Activity.findOne({
    title: 'Borehole commissioning — Ward A',
    organizationId: org._id,
  });

  await FormResponse.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      templateId: formTemplate._id,
      indicatorId: washIndicators[0]._id,
      activityId: baselineActivity?._id,
      submittedByUserId: meOfficerUser._id,
      collectedAt: new Date('2025-02-15'),
      answers: {
        household_id: 'WASH-001',
        water_source: 'Borehole',
        latrine_type: 'Pit latrine',
        household_size: 6,
        session_date: '2025-02-14',
        participants: 5,
        hygiene_message: 'Safe water handling and handwashing',
        notes: 'Household received hygiene kit and latrine repair support.',
      },
      status: 'submitted',
    },
  ]);

  const reportingPeriod1 = await ReportingPeriod.create({
    organizationId: org._id,
    projectId: wash._id,
    name: 'Q1 2025',
    cadence: 'quarterly',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-03-31'),
    status: 'approved',
    submittedByUserId: meOfficerUser._id,
    submittedAt: new Date('2025-04-02'),
    approvedByUserId: adminUser._id,
    approvedAt: new Date('2025-04-05'),
    notes: 'Quarterly progress report approved with recommendations for data quality.',
  });

  const reportingPeriod2 = await ReportingPeriod.create({
    organizationId: org._id,
    projectId: maternal._id,
    name: 'Q1 2025',
    cadence: 'quarterly',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-03-31'),
    status: 'submitted',
    submittedByUserId: meOfficerUser._id,
    submittedAt: new Date('2025-04-03'),
    notes: 'Submitted for review ahead of field coordination meeting.',
  });

  await IndicatorTarget.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      reportingPeriodId: reportingPeriod1._id,
      indicatorId: washIndicators[0]._id,
      baseline: 0,
      target: 120,
      notes: 'Target household connections for Q1 2025.',
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      reportingPeriodId: reportingPeriod2._id,
      indicatorId: maternalIndicators[0]._id,
      baseline: 100,
      target: 220,
      notes: 'ANC visit target for maternal outreach.',
    },
  ]);

  await IndicatorResult.insertMany([
    {
      organizationId: org._id,
      projectId: wash._id,
      reportingPeriodId: reportingPeriod1._id,
      indicatorId: washIndicators[0]._id,
      achieved: 118,
      activityCount: 3,
      sourceActivityIds: (await Activity.find({ projectId: wash._id, organizationId: org._id }).limit(3)).map((a) => a._id),
      narrative: 'Almost all planned household connections completed; one water point delayed due to materials.',
      status: 'approved',
      submittedByUserId: meOfficerUser._id,
      submittedAt: new Date('2025-04-02'),
      approvedByUserId: adminUser._id,
      approvedAt: new Date('2025-04-05'),
    },
    {
      organizationId: org._id,
      projectId: maternal._id,
      reportingPeriodId: reportingPeriod2._id,
      indicatorId: maternalIndicators[0]._id,
      achieved: 312,
      activityCount: 4,
      sourceActivityIds: (await Activity.find({ projectId: maternal._id, organizationId: org._id }).limit(2)).map((a) => a._id),
      narrative: 'ANC outreach exceeded target by Q1 thanks to mobile clinic scale-up.',
      status: 'submitted',
      submittedByUserId: meOfficerUser._id,
      submittedAt: new Date('2025-04-03'),
    },
  ]);

  await AuditEvent.insertMany([
    {
      organizationId: org._id,
      actorUserId: user._id,
      action: 'create_project',
      entityType: 'Project',
      entityId: wash._id.toString(),
      metadata: { name: wash.name },
    },
    {
      organizationId: org._id,
      actorUserId: meOfficerUser._id,
      action: 'submit_reporting_period',
      entityType: 'ReportingPeriod',
      entityId: reportingPeriod2._id.toString(),
      metadata: { status: 'submitted' },
    },
    {
      organizationId: org._id,
      actorUserId: adminUser._id,
      action: 'approve_reporting_period',
      entityType: 'ReportingPeriod',
      entityId: reportingPeriod1._id.toString(),
      metadata: { status: 'approved' },
    },
  ]);

  const document = await Document.create({
    organizationId: org._id,
    projectId: wash._id,
    createdByUserId: user._id,
    title: 'WASH Monitoring Report Q1 2025',
    description: 'Quarterly monitoring report for WASH activities and progress.',
    category: 'report',
    tags: ['WASH', 'monitoring', 'Q1'],
    storageKey: 'documents/wash-q1-2025.pdf',
    fileUrl: 'https://example.com/documents/wash-q1-2025.pdf',
  });

  await DocumentVersion.create({
    organizationId: org._id,
    documentId: document._id,
    versionNumber: 1,
    releaseNotes: 'Initial published version.',
    storageKey: 'documents/wash-q1-2025-v1.pdf',
    fileUrl: 'https://example.com/documents/wash-q1-2025-v1.pdf',
    createdByUserId: user._id,
  });

  await Notification.insertMany([
    {
      organizationId: org._id,
      userId: user._id,
      type: 'project_update',
      title: 'New activity logged',
      message: 'A new WASH monitoring visit was logged for Ward A.',
      entityType: 'Activity',
      entityId: wash._id.toString(),
      isRead: false,
    },
    {
      organizationId: org._id,
      userId: financeUser._id,
      type: 'grant_reminder',
      title: 'Grant reporting due soon',
      message: 'The School Nutrition Facility Upgrade grant quarterly report is due within 7 days.',
      entityType: 'Grant',
      entityId: grant._id.toString(),
      isRead: false,
    },
  ]);

  // Add indicator measurements to track progress over time
  const washO1Measurements = [
    { indicatorId: washIndicators[0]._id, period: '2025-Q1', value: 85, narrative: 'Borehole drilling in Ward A completed. Community water committee trained.' },
    { indicatorId: washIndicators[0]._id, period: '2025-Q2', value: 185, narrative: '2 additional boreholes commissioned. 100 HH connected in Ward B.' },
  ];
  
  const maternalH1Measurements = [
    { indicatorId: maternalIndicators[0]._id, period: '2025-Q1', value: 312, narrative: 'Mobile clinic model scaling up. 3 clinics operational across 12 villages.' },
    { indicatorId: maternalIndicators[0]._id, period: '2025-Q2', value: 520, narrative: 'Transportation support expanded. 208 additional women enrolled.' },
  ];

  // Create theory-of-change/results framework for WASH project
  const washFramework = {
    organizationId: org._id,
    projectId: wash._id,
    title: 'WASH Programme Results Framework',
    impactStatement: 'Improved health outcomes and dignity through universal access to safe water and sanitation.',
    impactIndicators: [
      {
        level: 'impact',
        code: 'IM1',
        title: 'Reduction in waterborne disease incidence',
        baseline: 245,
        target: 50,
        unit: 'cases per 1000 population per year',
      },
      {
        level: 'impact',
        code: 'IM2',
        title: 'School absenteeism due to WASH-related illness',
        baseline: 12,
        target: 2,
        unit: '% of students',
      },
    ],
    outcomeIndicators: [
      {
        level: 'outcome',
        code: 'OC1',
        title: 'Households with sustainable WASH behavior change',
        baseline: 8,
        target: 75,
        unit: '%',
      },
      {
        level: 'outcome',
        code: 'OC2',
        title: 'Community water committees actively managing resources',
        baseline: 0,
        target: 15,
        unit: 'committees',
      },
    ],
    outputIndicators: [
      {
        level: 'output',
        code: 'O1',
        title: 'Households with access to safe water',
        baseline: 0,
        target: 500,
        unit: 'households',
      },
      {
        level: 'output',
        code: 'O2',
        title: 'Households using improved latrines',
        baseline: 50,
        target: 200,
        unit: 'households',
      },
      {
        level: 'output',
        code: 'O3',
        title: 'Community hygiene promotion sessions',
        baseline: 0,
        target: 24,
        unit: 'sessions',
      },
    ],
    logicModel: {
      inputs: ['$450k funding', '12 staff', 'Government partnership', 'Community mobilization'],
      activities: ['Borehole drilling', 'Latrine construction', 'Hygiene training', 'Committee formation'],
      outputs: ['500 HH with water access', '200 HH with latrines', '24 hygiene sessions'],
      outcomes: ['Behavior change achieved', 'Community ownership established'],
      impact: ['Health improved', 'Disease incidence reduced', 'School attendance improved'],
    },
    assumptions: [
      'Government land access secured for water points',
      'Community commitment to maintenance sustained',
      'No major security incidents disrupt implementation',
      'Supply chain for equipment remains stable',
    ],
  };

  await Organization.findByIdAndUpdate(org._id, {
    planningFrameworks: ['logframe', 'bsc', 'okr'],
    primaryFramework: 'bsc',
    strategicOverview: {
      vision: 'Transform community health and well-being through integrated water, sanitation, health, and nutrition programs.',
      mission: 'Deliver evidence-based, community-led solutions for sustainable development in rural Kenya.',
      strategicPillars: [
        {
          pillar: 'Health Systems Strengthening',
          description: 'Build resilient health systems with skilled workforce and quality data systems',
          initiatives: ['Maternal health integration', 'CHW capacity building', 'HMIS strengthening'],
        },
        {
          pillar: 'Community Engagement & Ownership',
          description: 'Foster community leadership and sustained behavior change',
          initiatives: ['Water committee formation', 'Health committee activation', 'Beneficiary accountability'],
        },
        {
          pillar: 'Data for Decision-Making',
          description: 'Use real-time data to drive adaptive management and accountability',
          initiatives: ['Dashboard implementation', 'Data literacy training', 'Quality assurance protocols'],
        },
        {
          pillar: 'Financial Sustainability',
          description: 'Develop diversified funding and cost-recovery mechanisms',
          initiatives: ['Water tariff systems', 'Community health insurance', 'Grant diversification'],
        },
      ],
    },
  });

  // ─── Workflow Definitions & Instances ────────────────────────────────────────

  const WorkflowDefinitionSchema = new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
      name: String,
      description: String,
      entityType: String,
      steps: [
        {
          order: Number, name: String, description: String,
          approverRole: String,
          approverUserId: { type: Schema.Types.ObjectId, ref: 'User' },
          escalateAfterHours: { type: Number, default: 72 },
          escalateTo: { type: Schema.Types.ObjectId, ref: 'User' },
          requiresComment: { type: Boolean, default: false },
          isOptional: { type: Boolean, default: false },
        },
      ],
      isActive: { type: Boolean, default: true },
      isDefault: { type: Boolean, default: false },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, collection: 'workflow_definitions' },
  );

  const WorkflowInstanceSchema = new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
      definitionId: { type: Schema.Types.ObjectId, ref: 'WorkflowDefinition' },
      entityType: String,
      entityId: { type: Schema.Types.ObjectId },
      entityTitle: String,
      initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      initiatedByName: String,
      status: { type: String, default: 'pending' },
      currentStep: { type: Number, default: 1 },
      totalSteps: Number,
      steps: [Schema.Types.Mixed],
      history: [
        {
          stepOrder: Number, stepName: String, action: String,
          actorUserId: { type: Schema.Types.ObjectId }, actorName: String, actorRole: String,
          comment: String, createdAt: { type: Date, default: Date.now },
          delegatedFrom: { type: Schema.Types.ObjectId },
        },
      ],
      escalatedAt: Date,
      escalatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
      escalationReason: String,
      stepDeadline: Date,
      completedAt: Date,
      rejectionReason: String,
    },
    { timestamps: true, collection: 'workflow_instances' },
  );

  const WorkflowDefinition = mongoose.model('WorkflowDefinition', WorkflowDefinitionSchema);
  const WorkflowInstance = mongoose.model('WorkflowInstance', WorkflowInstanceSchema);

  await WorkflowDefinition.deleteMany({ organizationId: org._id });
  await WorkflowInstance.deleteMany({ organizationId: org._id });

  // — 3-step Activity Approval: Field Officer → M&E Officer → Director (Owner)
  const activityWf = await WorkflowDefinition.create({
    organizationId: org._id,
    name: 'Activity Approval Workflow',
    description: 'Standard approval chain for field activity reports.',
    entityType: 'activity',
    isDefault: true,
    isActive: true,
    createdBy: user._id,
    steps: [
      {
        order: 1, name: 'Supervisor Review',
        description: 'Field Supervisor verifies activity data quality and accuracy.',
        approverRole: 'me_officer',
        escalateAfterHours: 48, requiresComment: false, isOptional: false,
      },
      {
        order: 2, name: 'M&E Officer Validation',
        description: 'M&E Officer validates indicators and confirms data against targets.',
        approverRole: 'me_officer',
        escalateAfterHours: 72, requiresComment: true, isOptional: false,
      },
      {
        order: 3, name: 'Director Sign-off',
        description: 'Director reviews and approves for reporting.',
        approverRole: 'owner',
        escalateAfterHours: 96, requiresComment: false, isOptional: false,
      },
    ],
  });

  // — 2-step Grant Report: Finance → Admin
  const grantWf = await WorkflowDefinition.create({
    organizationId: org._id,
    name: 'Grant Report Approval',
    description: 'Financial review followed by administrative sign-off.',
    entityType: 'grant',
    isDefault: true,
    isActive: true,
    createdBy: financeUser._id,
    steps: [
      {
        order: 1, name: 'Finance Review',
        description: 'Finance team verifies expenditure against grant budget.',
        approverRole: 'finance',
        escalateAfterHours: 48, requiresComment: true, isOptional: false,
      },
      {
        order: 2, name: 'Admin Approval',
        description: 'Admin approves final grant report for submission to donor.',
        approverRole: 'admin',
        escalateAfterHours: 72, requiresComment: false, isOptional: false,
      },
    ],
  });

  // — 2-step Budget Approval: Finance → Owner
  const budgetWf = await WorkflowDefinition.create({
    organizationId: org._id,
    name: 'Budget Allocation Approval',
    description: 'Finance review and owner approval for budget allocations.',
    entityType: 'budget',
    isDefault: true,
    isActive: true,
    createdBy: financeUser._id,
    steps: [
      {
        order: 1, name: 'Finance Review',
        description: 'Finance validates budget against available funds.',
        approverRole: 'finance',
        escalateAfterHours: 48, requiresComment: true, isOptional: false,
      },
      {
        order: 2, name: 'Director Approval',
        description: 'Director authorises expenditure.',
        approverRole: 'owner',
        escalateAfterHours: 72, requiresComment: false, isOptional: false,
      },
    ],
  });

  // — Demo instances —

  // 1. Fully approved activity
  const approvedSteps = activityWf.toObject().steps;
  await WorkflowInstance.create({
    organizationId: org._id,
    definitionId: activityWf._id,
    entityType: 'activity',
    entityId: wash._id,
    entityTitle: 'Borehole commissioning — Ward A',
    initiatedBy: meOfficerUser._id,
    initiatedByName: 'M&E Officer',
    status: 'approved',
    currentStep: 3,
    totalSteps: 3,
    steps: approvedSteps,
    completedAt: new Date('2025-04-06'),
    history: [
      {
        stepOrder: 1, stepName: 'Supervisor Review',
        action: 'approve', actorUserId: adminUser._id,
        actorName: 'Grace Otieno', actorRole: 'me_officer',
        comment: 'Data verified against field registers.',
        createdAt: new Date('2025-04-02T09:00:00Z'),
      },
      {
        stepOrder: 2, stepName: 'M&E Officer Validation',
        action: 'approve', actorUserId: adminUser._id,
        actorName: 'Grace Otieno', actorRole: 'me_officer',
        comment: 'Indicator W1 target achieved. All source documents validated.',
        createdAt: new Date('2025-04-04T11:30:00Z'),
      },
      {
        stepOrder: 3, stepName: 'Director Sign-off',
        action: 'approve', actorUserId: user._id,
        actorName: 'Amina Wanjiku', actorRole: 'owner',
        comment: 'Excellent work. Approved for Q1 reporting.',
        createdAt: new Date('2025-04-06T08:00:00Z'),
      },
    ],
  });

  // 2. In-review at step 2 (pending M&E validation)
  const pendingSteps = activityWf.toObject().steps;
  await WorkflowInstance.create({
    organizationId: org._id,
    definitionId: activityWf._id,
    entityType: 'activity',
    entityId: maternal._id,
    entityTitle: 'Mobile clinic — ANC day',
    initiatedBy: meOfficerUser._id,
    initiatedByName: 'M&E Officer',
    status: 'in_review',
    currentStep: 2,
    totalSteps: 3,
    steps: pendingSteps,
    stepDeadline: new Date(Date.now() + 40 * 60 * 60 * 1000), // 40h from now
    history: [
      {
        stepOrder: 1, stepName: 'Supervisor Review',
        action: 'approve', actorUserId: adminUser._id,
        actorName: 'Grace Otieno', actorRole: 'me_officer',
        comment: 'Field data cross-checked with CHW registers.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // 3. Rejected grant report
  const rejectedGrantSteps = grantWf.toObject().steps;
  await WorkflowInstance.create({
    organizationId: org._id,
    definitionId: grantWf._id,
    entityType: 'grant',
    entityId: grant._id,
    entityTitle: 'WASH and Maternal Health Integrated Grant — Q1 Report',
    initiatedBy: meOfficerUser._id,
    initiatedByName: 'M&E Officer',
    status: 'rejected',
    currentStep: 1,
    totalSteps: 2,
    steps: rejectedGrantSteps,
    rejectionReason: 'Expenditure receipts missing for 3 line items.',
    completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    history: [
      {
        stepOrder: 1, stepName: 'Finance Review',
        action: 'reject', actorUserId: financeUser._id,
        actorName: 'Finance User', actorRole: 'finance',
        comment: 'Expenditure receipts missing for 3 line items. Please resubmit with full documentation.',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // 4. Escalated budget workflow
  const escalatedBudgetSteps = budgetWf.toObject().steps;
  await WorkflowInstance.create({
    organizationId: org._id,
    definitionId: budgetWf._id,
    entityType: 'budget',
    entityId: budget._id,
    entityTitle: 'FY26 Core Operations — Revision Request',
    initiatedBy: financeUser._id,
    initiatedByName: 'Finance User',
    status: 'escalated',
    currentStep: 1,
    totalSteps: 2,
    steps: escalatedBudgetSteps,
    escalatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    escalationReason: 'Step "Finance Review" exceeded SLA of 48h',
    escalatedTo: user._id,
    stepDeadline: new Date(Date.now() - 3 * 60 * 60 * 1000),
    history: [
      {
        stepOrder: 1, stepName: 'Finance Review',
        action: 'escalate', actorUserId: new Types.ObjectId(),
        actorName: 'System (Auto-Escalation)', actorRole: 'system',
        comment: 'Step "Finance Review" exceeded SLA of 48h',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ],
  });

  // --- End demo data ---

  // ─── Partner Network (multi-org consortium demo) ───────────────────────────
  // A second, lightweight partner org with its own project + indicators that
  // share codes (O1, O2) with the WASH project above, so the network rollup
  // (networks.service.ts#rollup) actually has something real to aggregate
  // across organizations, not just one.
  //
  // This org has no login of its own, so it isn't found/cleared by the
  // SEED_EMAIL lookup clearDemoData() uses for the primary org — instead we
  // look it up by its distinctive name and wipe its own child records the
  // same way, so re-running `npm run seed` doesn't create a second (third,
  // fourth...) duplicate partner org and orphaned project/indicator data
  // every time.
  const PARTNER_ORG_NAME = 'Nyanza Water Alliance';
  const existingPartnerOrg = await Organization.findOne({ name: PARTNER_ORG_NAME }).lean();
  if (existingPartnerOrg) {
    const oldPartnerOrgId = (existingPartnerOrg as any)._id;
    await Activity.deleteMany({ organizationId: oldPartnerOrgId });
    await Indicator.deleteMany({ organizationId: oldPartnerOrgId });
    await Project.deleteMany({ organizationId: oldPartnerOrgId });
    await OrgNetwork.deleteMany({
      $or: [{ hubOrganizationId: oldPartnerOrgId }, { 'members.organizationId': oldPartnerOrgId }],
    });
    await Organization.deleteOne({ _id: oldPartnerOrgId });
  }

  const partnerOrg = await Organization.create({
    name: PARTNER_ORG_NAME,
    country: 'Kenya',
    sector: 'WASH',
    planId: 'professional',
    subscriptionStatus: 'active',
    currentPeriodEnd: periodEnd,
  });

  const partnerProject = await Project.create({
    organizationId: partnerOrg._id,
    name: 'Borehole Expansion — Migori',
    donor: 'Global Fund',
    description: 'Sister WASH programme run by a consortium partner in a neighbouring county.',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'active',
    geoPoint: { latitude: -1.0634, longitude: 34.4731 }, // Migori, Kenya
  });

  const partnerIndicators = await Indicator.insertMany([
    {
      organizationId: partnerOrg._id,
      projectId: partnerProject._id,
      level: 'output',
      code: 'O1',
      title: 'Households with access to safe water',
      unit: 'households',
      baseline: 0,
      target: 300,
      frequency: 'quarterly',
    },
    {
      organizationId: partnerOrg._id,
      projectId: partnerProject._id,
      level: 'output',
      code: 'O2',
      title: 'Households using improved latrines',
      unit: 'households',
      baseline: 20,
      target: 150,
      frequency: 'quarterly',
    },
  ]);

  await Activity.insertMany([
    {
      organizationId: partnerOrg._id,
      projectId: partnerProject._id,
      indicatorId: partnerIndicators[0]._id,
      title: 'Borehole drilling — Migori site 1',
      activityDate: new Date('2025-03-05'),
      location: 'Migori',
      participants: 60,
      quantity: 75,
      geoPoint: { latitude: -1.0634, longitude: 34.4731 },
    },
  ]);
  await Indicator.updateOne({ _id: partnerIndicators[0]._id }, { $set: { lastAchievedValue: 75 } });
  await Indicator.updateOne({ _id: partnerIndicators[1]._id }, { $set: { lastAchievedValue: 38 } });

  await OrgNetwork.create({
    hubOrganizationId: org._id,
    name: 'Lake Region WASH Consortium',
    description: 'Coordinating water and sanitation programming across Lake Victoria counties.',
    members: [
      {
        organizationId: partnerOrg._id,
        role: 'implementing',
        status: 'accepted',
        invitedByUserId: user._id,
        invitedAt: new Date('2025-01-10'),
        acceptedAt: new Date('2025-01-12'),
        label: 'Migori region',
      },
    ],
  });

  console.log('\n✓ Seed complete\n');
  console.log('  Login at http://localhost:4200/login\n');
  console.log('  Email:    ', SEED_EMAIL);
  console.log('  Password: ', SEED_PASSWORD);
  console.log('\n  Organisation: Lakeside Community Development Trust (plan: scale)');
  console.log('  Projects:     WASH & Sanitation Programme, Maternal Health Outreach, School Nutrition Initiative');
  console.log('  Map:          GPS coordinates seeded on projects, activities, partners, and beneficiary groups (Kisumu/Homa Bay/Siaya, Kenya)');
  console.log('  Feedback:     4 stakeholder feedback entries on the WASH project (Insights > Stakeholder Feedback)');
  console.log('  Network:      "Lake Region WASH Consortium" — partner org "Nyanza Water Alliance" (Enterprise > Networks)');
  console.log('  (Re-run npm run seed to reset demo data)\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});