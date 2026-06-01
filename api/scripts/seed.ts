/**
 * Seeds demo M&E data for local testing.
 * Run: npm run seed
 */
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import mongoose, { Schema, Types } from 'mongoose';
import { join } from 'path';

const SEED_EMAIL = 'demo@monival.test';
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
const ProjectSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    name: String,
    donor: String,
    description: String,
    startDate: Date,
    endDate: Date,
    status: { type: String, default: 'active' },
  },
  { timestamps: true },
);
const IndicatorSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Indicator' },
    level: { type: String, default: 'output' },
    code: String,
    title: String,
    unit: String,
    meansOfVerification: String,
    baseline: { type: Number, default: 0 },
    target: Number,
    frequency: { type: String, default: 'quarterly' },
  },
  { timestamps: true },
);
const ActivitySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    indicatorId: { type: Schema.Types.ObjectId, ref: 'Indicator' },
    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    beneficiaryIds: [{ type: Schema.Types.ObjectId, ref: 'Beneficiary' }],
    title: String,
    description: String,
    activityDate: Date,
    location: String,
    participants: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    notes: String,
    status: { type: String, default: 'approved' },
  },
  { timestamps: true },
);

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
  await ActivityTemplate.deleteMany({ organizationId: orgId });
  await FormResponse.deleteMany({ organizationId: orgId });
  await FormTemplate.deleteMany({ organizationId: orgId });
  await IndicatorResult.deleteMany({ organizationId: orgId });
  await IndicatorTarget.deleteMany({ organizationId: orgId });
  await ReportingPeriod.deleteMany({ organizationId: orgId });
  await Notification.deleteMany({ organizationId: orgId });
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
  const BudgetAllocation = mongoose.model('BudgetAllocation', require('../src/budget/schemas/budget-allocation.schema').BudgetAllocationSchema) as mongoose.Model<unknown>;
  const BudgetLineItem = mongoose.model('BudgetLineItem', require('../src/budget/schemas/budget-line-item.schema').BudgetLineItemSchema) as mongoose.Model<unknown>;
  const BudgetVariance = mongoose.model('BudgetVariance', require('../src/budget/schemas/budget-variance.schema').BudgetVarianceSchema) as mongoose.Model<unknown>;
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
  );

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const org = await Organization.create({
    name: 'Lakeside Community Development Trust',
    country: 'Kenya',
    sector: 'Health & WASH',
    planId: 'professional',
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
    email: 'grace.otieno@monival.test',
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
    email: 'joseph.mwangi@monival.test',
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
    email: 'rita.kimani@monival.test',
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
    email: 'daniel.achem@monival.test',
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
    email: 'new.collaborator@monival.test',
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
    },
    {
      organizationId: org._id,
      name: 'Community Water Committee — Ward A',
      contactEmail: 'cwc-warda@example.org',
      country: 'Kenya',
      notes: 'Community-level water management committee',
    },
  ]);

  const beneficiaries = await Beneficiary.insertMany([
    {
      organizationId: org._id,
      name: 'Household Group — Ward A',
      groupType: 'household',
      location: 'Kisumu, Ward A',
      notes: 'Representative household grouping used for monitoring',
    },
    {
      organizationId: org._id,
      name: 'Pregnant women cohort — Siaya',
      groupType: 'cohort',
      location: 'Siaya County',
      notes: 'Cohort tracked for ANC follow-up and referrals',
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
    },
  ]);

  // Attach a partner and beneficiaries to a sample activity (if present)
  try {
    const mobileActivity = await Activity.findOne({ title: 'Mobile clinic — ANC day', organizationId: org._id }).lean();
    if (mobileActivity) {
      await Activity.updateOne({ _id: mobileActivity._id }, { $set: { partnerId: partners[0]._id, beneficiaryIds: [beneficiaries[1]._id] } });
    }
  } catch (e) {
    // ignore if update fails in older seed runs
  }

  const maternal = await Project.create({
    organizationId: org._id,
    name: 'Maternal Health Outreach',
    donor: 'USAID',
    description: 'Mobile clinics and ANC uptake in rural wards.',
    startDate: new Date('2024-07-01'),
    endDate: new Date('2025-06-30'),
    status: 'active',
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
  });

  await BudgetLineItem.insertMany([
    {
      budgetAllocationId: budget._id,
      organizationId: org._id,
      description: 'Staff salaries',
      amount: 60000,
      spent: 20000,
      category: 'personnel',
      status: 'committed',
    },
    {
      budgetAllocationId: budget._id,
      organizationId: org._id,
      description: 'Field supplies',
      amount: 25000,
      spent: 8000,
      category: 'supplies',
      status: 'committed',
    },
  ]);

  await BudgetVariance.create({
    organizationId: org._id,
    budgetAllocationId: budget._id,
    period: '2026-03',
    budgetedAmount: 30000,
    actualAmount: 28000,
    variance: 2000,
    variancePercentage: 6.67,
    trend: 'favorable',
    notes: 'Slight underspending due to delayed procurement.'
  });

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
  // --- End demo data ---

  console.log('\n✓ Seed complete\n');
  console.log('  Login at http://localhost:4200/login\n');
  console.log('  Email:    ', SEED_EMAIL);
  console.log('  Password: ', SEED_PASSWORD);
  console.log('\n  Organisation: Lakeside Community Development Trust');
  console.log('  Projects:     WASH & Sanitation Programme, Maternal Health Outreach');
  console.log('  (Re-run npm run seed to reset demo data)\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
