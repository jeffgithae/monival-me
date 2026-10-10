/**
 * Adds a realistic volume of data to the demo organisation, on top of what
 * `npm run seed` creates: a multi-year, multi-donor portfolio of the size a
 * mid-sized NGO actually runs. Use it to see how lists, tables, charts and
 * reports behave when they are full.
 *
 *   npm run seed            # base demo organisation (wipes and recreates it)
 *   npm run seed:volume     # add the bulk portfolio
 *   npm run seed:volume -- --reset   # remove what this script added, then stop
 *
 * It is additive and never touches records it did not create: every id it
 * inserts is written to the `seedmanifests` collection, which is what --reset
 * (and a re-run) deletes. Output is deterministic — the same data every run.
 */
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import mongoose, { Schema, Types } from 'mongoose';
import { join } from 'path';

const SEED_EMAIL = 'demo@evidara.test';
const SEED_PASSWORD = 'Demo1234!';
const TODAY = new Date();

function loadEnv() {
  try {
    const text = readFileSync(join(__dirname, '../.env'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      // An explicit MONGODB_URI in the environment wins over .env.
      if (idx > 0 && process.env[trimmed.slice(0, idx).trim()] === undefined) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  } catch {
    /* .env optional */
  }
}

// ─── Deterministic randomness ────────────────────────────────────────────────

let seedState = 20261010;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const chance = (p: number) => rand() < p;
const sample = <T>(list: readonly T[], n: number): T[] => {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};
const weighted = <T>(pairs: ReadonlyArray<readonly [T, number]>): T => {
  let r = rand() * pairs.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
};
const round = (n: number, step = 1) => Math.round(n / step) * step;
const date = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const between = (a: Date, b: Date) => new Date(a.getTime() + rand() * Math.max(0, b.getTime() - a.getTime()));
const clampDate = (d: Date, max: Date) => (d.getTime() > max.getTime() ? max : d);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─── Reference data ──────────────────────────────────────────────────────────

const COUNTIES = [
  { name: 'Kisumu', lat: -0.0917, lng: 34.768, wards: ['Kondele', 'Nyalenda', 'Kolwa East', 'Ahero', 'Kajulu', 'Seme'] },
  { name: 'Siaya', lat: 0.0612, lng: 34.2881, wards: ['Ugunja', 'Bondo', 'Yala', 'Usonga', 'Gem'] },
  { name: 'Homa Bay', lat: -0.5273, lng: 34.4571, wards: ['Rangwe', 'Mbita', 'Ndhiwa', 'Kasipul', 'Suba'] },
  { name: 'Migori', lat: -1.0634, lng: 34.4731, wards: ['Rongo', 'Awendo', 'Nyatike', 'Kuria West', 'Uriri'] },
  { name: 'Busia', lat: 0.4608, lng: 34.1115, wards: ['Budalangi', 'Nambale', 'Teso North', 'Butula', 'Funyula'] },
  { name: 'Kakamega', lat: 0.2827, lng: 34.7519, wards: ['Lurambi', 'Mumias', 'Malava', 'Shinyalu', 'Butere'] },
  { name: 'Vihiga', lat: 0.0763, lng: 34.7228, wards: ['Sabatia', 'Hamisi', 'Luanda', 'Emuhaya'] },
  { name: 'Kisii', lat: -0.6817, lng: 34.7667, wards: ['Nyaribari', 'Bobasi', 'Kitutu Chache', 'Bomachoge'] },
  { name: 'Turkana', lat: 3.1191, lng: 35.5973, wards: ['Lodwar', 'Kakuma', 'Kalokol', 'Lokichar'] },
  { name: 'Kilifi', lat: -3.6305, lng: 39.8499, wards: ['Ganze', 'Malindi', 'Kaloleni', 'Magarini'] },
] as const;

const FIRST_F = ['Achieng', 'Akinyi', 'Atieno', 'Adhiambo', 'Wanjiru', 'Nyambura', 'Mercy', 'Faith', 'Grace', 'Esther', 'Mary', 'Jane', 'Caroline', 'Beatrice', 'Lilian', 'Nafula', 'Nekesa', 'Chebet', 'Jepkoech', 'Halima', 'Zainab', 'Amina', 'Rose', 'Dorcas', 'Eunice', 'Pamela', 'Sharon', 'Irene', 'Josephine', 'Margaret'];
const FIRST_M = ['Otieno', 'Ochieng', 'Omondi', 'Odhiambo', 'Kamau', 'Mwangi', 'Kiprono', 'Kibet', 'Wafula', 'Barasa', 'Juma', 'Hassan', 'Peter', 'John', 'David', 'Samuel', 'Daniel', 'Joseph', 'Brian', 'Kevin', 'Dennis', 'Felix', 'George', 'Patrick', 'Stephen', 'Collins', 'Victor', 'Moses', 'Elijah', 'Isaac'];
const LAST = ['Odhiambo', 'Owino', 'Okoth', 'Onyango', 'Oloo', 'Wekesa', 'Simiyu', 'Wanyama', 'Mutua', 'Kariuki', 'Njoroge', 'Kimani', 'Chepkemoi', 'Rotich', 'Koech', 'Nyaga', 'Abdi', 'Mohamed', 'Ouma', 'Awuor', 'Makokha', 'Shikuku', 'Ekai', 'Lokiru', 'Charo', 'Kahindi', 'Mbugua', 'Gathoni', 'Anyango', 'Nyongesa'];
const personName = (sex: 'male' | 'female') => `${pick(sex === 'female' ? FIRST_F : FIRST_M)} ${pick(LAST)}`;

const STAFF: Array<{ name: string; email: string; role: string }> = [
  { name: 'Dr. Peter Omollo', email: 'peter.omollo', role: 'admin' },
  { name: 'Lucy Wambui', email: 'lucy.wambui', role: 'me_officer' },
  { name: 'Brian Kiplagat', email: 'brian.kiplagat', role: 'me_officer' },
  { name: 'Sarah Nekesa', email: 'sarah.nekesa', role: 'me_officer' },
  { name: 'Hassan Abdullahi', email: 'hassan.abdullahi', role: 'field_officer' },
  { name: 'Mercy Adhiambo', email: 'mercy.adhiambo', role: 'field_officer' },
  { name: 'Kevin Mutiso', email: 'kevin.mutiso', role: 'field_officer' },
  { name: 'Faith Chebet', email: 'faith.chebet', role: 'field_officer' },
  { name: 'Samuel Wafula', email: 'samuel.wafula', role: 'field_officer' },
  { name: 'Esther Njeri', email: 'esther.njeri', role: 'field_officer' },
  { name: 'Caroline Awino', email: 'caroline.awino', role: 'finance' },
  { name: 'George Kamau', email: 'george.kamau', role: 'finance' },
  { name: 'Lilian Barasa', email: 'lilian.barasa', role: 'viewer' },
  { name: 'Prof. James Oduor', email: 'james.oduor', role: 'viewer' },
];

const DONORS: Array<{ name: string; shortName: string; type: string; country: string; cadence: string; status?: string }> = [
  { name: 'United States Agency for International Development', shortName: 'USAID', type: 'bilateral', country: 'United States', cadence: 'quarterly' },
  { name: 'Foreign, Commonwealth & Development Office', shortName: 'FCDO', type: 'bilateral', country: 'United Kingdom', cadence: 'quarterly' },
  { name: 'European Union Delegation to Kenya', shortName: 'EU', type: 'multilateral', country: 'Belgium', cadence: 'semiannual' },
  { name: 'United Nations Children\'s Fund', shortName: 'UNICEF', type: 'multilateral', country: 'United States', cadence: 'quarterly' },
  { name: 'World Food Programme', shortName: 'WFP', type: 'multilateral', country: 'Italy', cadence: 'monthly' },
  { name: 'Bill & Melinda Gates Foundation', shortName: 'BMGF', type: 'foundation', country: 'United States', cadence: 'semiannual' },
  { name: 'Mastercard Foundation', shortName: 'MCF', type: 'foundation', country: 'Canada', cadence: 'quarterly' },
  { name: 'Deutsche Gesellschaft für Internationale Zusammenarbeit', shortName: 'GIZ', type: 'bilateral', country: 'Germany', cadence: 'quarterly' },
  { name: 'Swedish International Development Cooperation Agency', shortName: 'Sida', type: 'bilateral', country: 'Sweden', cadence: 'annual' },
  { name: 'Norwegian Agency for Development Cooperation', shortName: 'Norad', type: 'bilateral', country: 'Norway', cadence: 'annual' },
  { name: 'Irish Aid', shortName: 'Irish Aid', type: 'bilateral', country: 'Ireland', cadence: 'semiannual' },
  { name: 'Global Affairs Canada', shortName: 'GAC', type: 'bilateral', country: 'Canada', cadence: 'quarterly' },
  { name: 'Aga Khan Foundation', shortName: 'AKF', type: 'foundation', country: 'Switzerland', cadence: 'quarterly' },
  { name: 'Safaricom Foundation', shortName: 'Safaricom Fdn', type: 'corporate', country: 'Kenya', cadence: 'quarterly' },
  { name: 'Equity Group Foundation', shortName: 'EGF', type: 'corporate', country: 'Kenya', cadence: 'quarterly' },
  { name: 'County Government of Kisumu', shortName: 'CGK', type: 'government', country: 'Kenya', cadence: 'quarterly' },
  { name: 'Ministry of Health — Kenya', shortName: 'MoH', type: 'government', country: 'Kenya', cadence: 'quarterly' },
  { name: 'Comic Relief', shortName: 'Comic Relief', type: 'foundation', country: 'United Kingdom', cadence: 'semiannual' },
  { name: 'Ford Foundation', shortName: 'Ford', type: 'foundation', country: 'United States', cadence: 'annual', status: 'prospect' },
  { name: 'Children\'s Investment Fund Foundation', shortName: 'CIFF', type: 'foundation', country: 'United Kingdom', cadence: 'semiannual', status: 'prospect' },
  { name: 'Japan International Cooperation Agency', shortName: 'JICA', type: 'bilateral', country: 'Japan', cadence: 'annual', status: 'prospect' },
  { name: 'Danish International Development Agency', shortName: 'Danida', type: 'bilateral', country: 'Denmark', cadence: 'annual', status: 'former' },
  { name: 'The Waterloo Foundation', shortName: 'Waterloo', type: 'foundation', country: 'United Kingdom', cadence: 'annual', status: 'inactive' },
  { name: 'Friends of Lakeside (individual giving)', shortName: 'Friends', type: 'individual', country: 'Kenya', cadence: 'annual' },
];

const PARTNERS = [
  'Nyanza Reproductive Health Society', 'Kisumu Urban Apostolate Programme', 'Siaya Community Water Trust', 'Homa Bay Women\'s Network',
  'Migori Youth Agribusiness Cooperative', 'Busia Cross-Border Traders Association', 'Western Kenya Disability Forum', 'Kakamega Farmers\' Field School Union',
  'Turkana Pastoralist Development Organisation', 'Kilifi Coastal Education Initiative', 'Vihiga Community Health Volunteers Network', 'Kisii Smallholder Tea Growers',
  'Lake Region Legal Aid Clinic', 'Rusinga Island Fisherfolk BMU', 'Kenya Red Cross — Nyanza Branch', 'Jaramogi Oginga Odinga Teaching Hospital',
];

type IndicatorSpec = { level: 'goal' | 'outcome' | 'output'; title: string; unit: string; type?: string; target: [number, number]; baseline?: [number, number]; activity?: string };
type SectorSpec = { sector: string; names: string[]; description: string; groups: string[]; sdg: number[]; indicators: IndicatorSpec[]; workplan: string[]; activityTitles: Record<string, string[]> };

const SECTORS: SectorSpec[] = [
  {
    sector: 'health',
    names: ['Community Health Systems Strengthening', 'Integrated HIV & TB Care', 'Maternal & Newborn Survival', 'Adolescent Sexual & Reproductive Health', 'Malaria Elimination Partnership', 'Primary Health Care Outreach'],
    description: 'Strengthens facility and community health services so that women, children and adolescents receive timely, quality care close to home.',
    groups: ['Women of reproductive age', 'Children under 5', 'Adolescents', 'Community health volunteers'],
    sdg: [3, 5],
    indicators: [
      { level: 'goal', title: 'Under-five mortality rate in target sub-counties', unit: 'deaths per 1,000 live births', target: [28, 38], baseline: [52, 68] },
      { level: 'outcome', title: 'Pregnant women completing four or more antenatal visits', unit: '%', type: 'percentage', target: [75, 90], baseline: [41, 58] },
      { level: 'outcome', title: 'Deliveries attended by a skilled birth attendant', unit: '%', type: 'percentage', target: [80, 92], baseline: [55, 68] },
      { level: 'output', title: 'Community health volunteers trained and equipped', unit: 'volunteers', target: [180, 600], activity: 'training' },
      { level: 'output', title: 'Household visits conducted by community health volunteers', unit: 'visits', target: [12000, 60000], activity: 'health_service' },
      { level: 'output', title: 'Children under five fully immunised', unit: 'children', target: [4000, 18000], activity: 'health_service' },
      { level: 'output', title: 'Integrated outreach clinics held', unit: 'clinics', target: [120, 480], activity: 'health_service' },
      { level: 'output', title: 'Health facilities receiving supportive supervision', unit: 'facilities', target: [24, 80], activity: 'monitoring' },
    ],
    workplan: ['Facility readiness assessment', 'CHV recruitment and training', 'Outreach clinic schedule roll-out', 'Commodity supply chain strengthening', 'Data quality audits', 'Community dialogue days', 'Supportive supervision visits', 'Annual review with county health team'],
    activityTitles: {
      training: ['CHV basic module training', 'Refresher training for CHVs', 'Training of facility in-charges'],
      health_service: ['Integrated outreach clinic', 'Household visit round', 'Immunisation catch-up campaign', 'ANC defaulter tracing'],
      monitoring: ['Supportive supervision visit', 'Data quality audit'],
    },
  },
  {
    sector: 'wash',
    names: ['Safe Water for Schools', 'Rural Water Supply Rehabilitation', 'Community-Led Total Sanitation', 'Urban Informal Settlements WASH', 'Climate-Resilient Water Points'],
    description: 'Expands access to safe water, sanitation and hygiene through rehabilitated infrastructure and community-led behaviour change.',
    groups: ['Rural households', 'School children', 'Water user committees'],
    sdg: [6, 3],
    indicators: [
      { level: 'goal', title: 'Diarrhoeal disease incidence among children under five', unit: 'cases per 1,000', target: [60, 110], baseline: [190, 260] },
      { level: 'outcome', title: 'Households using a safely managed water source', unit: '%', type: 'percentage', target: [70, 88], baseline: [32, 51] },
      { level: 'outcome', title: 'Villages certified open-defecation free', unit: 'villages', target: [30, 120], baseline: [0, 8] },
      { level: 'output', title: 'Water points constructed or rehabilitated', unit: 'water points', target: [25, 140], activity: 'construction' },
      { level: 'output', title: 'People gaining access to safe water', unit: 'people', target: [15000, 90000], activity: 'construction' },
      { level: 'output', title: 'Household latrines constructed', unit: 'latrines', target: [400, 2600], activity: 'construction' },
      { level: 'output', title: 'Water user committees trained', unit: 'committees', target: [25, 140], activity: 'training' },
      { level: 'output', title: 'People reached with hygiene promotion', unit: 'people', target: [20000, 120000], activity: 'awareness' },
    ],
    workplan: ['Hydrogeological surveys', 'Borehole drilling and rehabilitation', 'Latrine construction', 'Water committee formation', 'CLTS triggering', 'Hygiene promotion campaigns', 'Water quality testing', 'Handover to county water department'],
    activityTitles: {
      construction: ['Borehole rehabilitation', 'Water kiosk commissioning', 'Latrine block construction', 'Rainwater harvesting tank installation'],
      training: ['Water user committee training', 'Pump mechanic training'],
      awareness: ['Hygiene promotion session', 'Global Handwashing Day event', 'CLTS triggering meeting'],
    },
  },
  {
    sector: 'education',
    names: ['Girls\' Education & Retention', 'Foundational Literacy & Numeracy', 'Inclusive Education for Learners with Disabilities', 'TVET Skills for Youth', 'Early Childhood Development Centres'],
    description: 'Improves access to quality, inclusive learning — from early childhood to vocational skills — with a focus on girls and marginalised learners.',
    groups: ['Primary school learners', 'Adolescent girls', 'Teachers', 'Out-of-school youth'],
    sdg: [4, 5],
    indicators: [
      { level: 'goal', title: 'Primary-to-secondary transition rate', unit: '%', type: 'percentage', target: [82, 94], baseline: [58, 71] },
      { level: 'outcome', title: 'Grade 3 learners reading at grade level', unit: '%', type: 'percentage', target: [55, 75], baseline: [18, 34] },
      { level: 'outcome', title: 'Girls\' average school attendance rate', unit: '%', type: 'percentage', target: [88, 96], baseline: [66, 79] },
      { level: 'output', title: 'Teachers trained in structured pedagogy', unit: 'teachers', target: [200, 900], activity: 'training' },
      { level: 'output', title: 'Learners receiving remedial support', unit: 'learners', target: [3000, 16000], activity: 'capacity_building' },
      { level: 'output', title: 'Scholarships and bursaries awarded', unit: 'scholarships', target: [150, 1200], activity: 'distribution' },
      { level: 'output', title: 'Classrooms constructed or renovated', unit: 'classrooms', target: [12, 60], activity: 'construction' },
      { level: 'output', title: 'Dignity kits distributed to adolescent girls', unit: 'kits', target: [2000, 12000], activity: 'distribution' },
    ],
    workplan: ['Baseline learning assessment', 'Teacher training cohorts', 'Remedial learning camps', 'Classroom renovation', 'Scholarship selection', 'School management committee strengthening', 'Midline learning assessment', 'Endline evaluation'],
    activityTitles: {
      training: ['Structured pedagogy workshop', 'Head teacher leadership training'],
      capacity_building: ['Remedial reading camp', 'Mentorship club session'],
      distribution: ['Bursary award ceremony', 'Dignity kit distribution', 'Textbook distribution'],
      construction: ['Classroom renovation handover', 'Accessible latrine construction'],
    },
  },
  {
    sector: 'food_security',
    names: ['Climate-Smart Agriculture', 'Smallholder Market Access', 'Drought Resilience & Livestock', 'Kitchen Gardens for Nutrition', 'Fisheries Value Chain Development'],
    description: 'Raises smallholder productivity and incomes through climate-smart practices, inputs and reliable links to markets.',
    groups: ['Smallholder farmers', 'Women farmer groups', 'Pastoralist households'],
    sdg: [2, 13, 1],
    indicators: [
      { level: 'goal', title: 'Households with acceptable food consumption score', unit: '%', type: 'percentage', target: [72, 88], baseline: [38, 55] },
      { level: 'outcome', title: 'Average maize yield per acre', unit: '90-kg bags', target: [16, 24], baseline: [7, 11] },
      { level: 'outcome', title: 'Farmers selling through collective marketing', unit: '%', type: 'percentage', target: [50, 70], baseline: [9, 22] },
      { level: 'output', title: 'Farmers trained in climate-smart practices', unit: 'farmers', target: [2500, 14000], activity: 'training' },
      { level: 'output', title: 'Farmers receiving certified seed and inputs', unit: 'farmers', target: [2000, 12000], activity: 'distribution' },
      { level: 'output', title: 'Demonstration plots established', unit: 'plots', target: [40, 220], activity: 'capacity_building' },
      { level: 'output', title: 'Producer groups linked to buyers', unit: 'groups', target: [30, 160], activity: 'coordination' },
      { level: 'output', title: 'Village savings and loan groups formed', unit: 'groups', target: [50, 260], activity: 'community_engagement' },
    ],
    workplan: ['Farmer group mobilisation', 'Demonstration plot establishment', 'Input distribution', 'Extension field days', 'Post-harvest handling training', 'Buyer linkage forums', 'VSLA formation', 'Seasonal yield assessment'],
    activityTitles: {
      training: ['Climate-smart agriculture field school', 'Post-harvest handling training'],
      distribution: ['Certified seed distribution', 'Drought-tolerant seedling distribution'],
      capacity_building: ['Demonstration plot field day'],
      coordination: ['Buyer linkage forum', 'Cooperative contract signing'],
      community_engagement: ['VSLA formation meeting', 'Farmer group mobilisation baraza'],
    },
  },
  {
    sector: 'livelihoods',
    names: ['Youth Enterprise Accelerator', 'Women\'s Economic Empowerment', 'Graduation Out of Extreme Poverty', 'Digital Skills for Jobs'],
    description: 'Builds skills, savings and enterprises so that young people and women earn a dependable income.',
    groups: ['Unemployed youth', 'Women entrepreneurs', 'Ultra-poor households'],
    sdg: [8, 1, 5],
    indicators: [
      { level: 'goal', title: 'Participants living above the national poverty line', unit: '%', type: 'percentage', target: [60, 78], baseline: [22, 37] },
      { level: 'outcome', title: 'Participants in employment or self-employment after 6 months', unit: '%', type: 'percentage', target: [65, 82], baseline: [14, 28] },
      { level: 'outcome', title: 'Average monthly income of participants', unit: 'KES', type: 'currency', target: [14000, 24000], baseline: [4500, 7500] },
      { level: 'output', title: 'Youth completing business skills training', unit: 'youth', target: [1200, 7000], activity: 'training' },
      { level: 'output', title: 'Enterprises receiving start-up grants', unit: 'enterprises', target: [300, 1800], activity: 'cash_transfer' },
      { level: 'output', title: 'Participants completing digital skills bootcamps', unit: 'participants', target: [600, 3500], activity: 'training' },
      { level: 'output', title: 'Savings groups established', unit: 'groups', target: [60, 320], activity: 'community_engagement' },
      { level: 'output', title: 'Mentorship sessions delivered', unit: 'sessions', target: [800, 4500], activity: 'capacity_building' },
    ],
    workplan: ['Participant targeting and enrolment', 'Business skills cohorts', 'Start-up grant disbursement', 'Mentorship matching', 'Savings group formation', 'Market linkage events', 'Tracer study', 'Graduation ceremonies'],
    activityTitles: {
      training: ['Business skills training cohort', 'Digital skills bootcamp', 'Financial literacy training'],
      cash_transfer: ['Start-up grant disbursement', 'Asset transfer round'],
      community_engagement: ['Savings group formation meeting'],
      capacity_building: ['Mentorship clinic', 'Business coaching visit'],
    },
  },
  {
    sector: 'nutrition',
    names: ['First 1,000 Days Nutrition', 'School Feeding & Nutrition', 'Community Management of Acute Malnutrition'],
    description: 'Prevents and treats malnutrition among young children and mothers through screening, counselling and supplementary feeding.',
    groups: ['Children under 5', 'Pregnant and lactating women', 'School children'],
    sdg: [2, 3],
    indicators: [
      { level: 'goal', title: 'Stunting prevalence among children under five', unit: '%', type: 'percentage', target: [16, 22], baseline: [27, 36] },
      { level: 'outcome', title: 'Infants exclusively breastfed to six months', unit: '%', type: 'percentage', target: [70, 85], baseline: [42, 58] },
      { level: 'outcome', title: 'Acute malnutrition cure rate', unit: '%', type: 'percentage', target: [82, 92], baseline: [60, 72] },
      { level: 'output', title: 'Children screened for acute malnutrition', unit: 'children', target: [12000, 70000], activity: 'health_service' },
      { level: 'output', title: 'Children admitted to therapeutic feeding', unit: 'children', target: [900, 5200], activity: 'health_service' },
      { level: 'output', title: 'Mother-to-mother support groups active', unit: 'groups', target: [60, 300], activity: 'community_engagement' },
      { level: 'output', title: 'School meals served', unit: 'meals', target: [400000, 2400000], activity: 'distribution' },
    ],
    workplan: ['Mass MUAC screening', 'Therapeutic feeding site support', 'Mother support group facilitation', 'School feeding logistics', 'Growth monitoring days', 'Cooking demonstrations', 'SMART nutrition survey'],
    activityTitles: {
      health_service: ['Mass MUAC screening', 'Outpatient therapeutic feeding day', 'Growth monitoring session'],
      community_engagement: ['Mother-to-mother support group meeting', 'Cooking demonstration'],
      distribution: ['School meals delivery', 'Fortified flour distribution'],
    },
  },
  {
    sector: 'protection',
    names: ['Ending Gender-Based Violence', 'Child Protection Systems', 'Access to Justice for Women'],
    description: 'Prevents violence and strengthens the community and legal systems that protect women and children.',
    groups: ['Survivors of GBV', 'Children at risk', 'Community paralegals'],
    sdg: [5, 16],
    indicators: [
      { level: 'goal', title: 'Women reporting they feel safe in their community', unit: '%', type: 'percentage', target: [70, 85], baseline: [35, 50] },
      { level: 'outcome', title: 'GBV cases receiving a comprehensive response within 72 hours', unit: '%', type: 'percentage', target: [80, 92], baseline: [28, 45] },
      { level: 'output', title: 'Survivors receiving psychosocial support', unit: 'survivors', target: [600, 3200], activity: 'health_service' },
      { level: 'output', title: 'Community paralegals trained', unit: 'paralegals', target: [80, 320], activity: 'training' },
      { level: 'output', title: 'People reached through community dialogues', unit: 'people', target: [8000, 45000], activity: 'awareness' },
      { level: 'output', title: 'Legal aid cases supported', unit: 'cases', target: [250, 1400], activity: 'advocacy' },
      { level: 'output', title: 'Child protection committees functional', unit: 'committees', target: [30, 140], activity: 'community_engagement' },
    ],
    workplan: ['Referral pathway mapping', 'Paralegal training', 'Safe space establishment', 'Community dialogues', 'Legal aid clinics', '16 Days of Activism campaign', 'Case management audits'],
    activityTitles: {
      health_service: ['Psychosocial counselling clinic', 'Safe space group therapy'],
      training: ['Community paralegal training', 'Police gender desk training'],
      awareness: ['Community dialogue on GBV', '16 Days of Activism event'],
      advocacy: ['Mobile legal aid clinic', 'Court users committee meeting'],
      community_engagement: ['Child protection committee meeting'],
    },
  },
  {
    sector: 'environment',
    names: ['Lake Victoria Basin Restoration', 'Community Forest & Clean Cooking'],
    description: 'Restores degraded landscapes and cuts household emissions while creating green income for communities.',
    groups: ['Riparian communities', 'Community forest associations', 'Women-headed households'],
    sdg: [13, 15, 7],
    indicators: [
      { level: 'goal', title: 'Tree cover in target landscapes', unit: '%', type: 'percentage', target: [14, 20], baseline: [6, 9] },
      { level: 'outcome', title: 'Households using improved cookstoves', unit: '%', type: 'percentage', target: [55, 75], baseline: [8, 20] },
      { level: 'output', title: 'Trees planted and surviving after one year', unit: 'trees', target: [120000, 900000], activity: 'community_engagement' },
      { level: 'output', title: 'Improved cookstoves distributed', unit: 'stoves', target: [3000, 18000], activity: 'distribution' },
      { level: 'output', title: 'Hectares of riparian land restored', unit: 'hectares', target: [150, 900], activity: 'construction' },
      { level: 'output', title: 'Community forest associations strengthened', unit: 'associations', target: [8, 40], activity: 'capacity_building' },
    ],
    workplan: ['Tree nursery establishment', 'Community planting days', 'Cookstove distribution', 'Riparian restoration works', 'CFA governance training', 'Survival rate monitoring'],
    activityTitles: {
      community_engagement: ['Community tree planting day', 'School greening day'],
      distribution: ['Improved cookstove distribution'],
      construction: ['Riparian buffer restoration', 'Gabion and terrace construction'],
      capacity_building: ['CFA governance training'],
    },
  },
  {
    sector: 'governance',
    names: ['Citizen Voice in County Budgets', 'Civil Society Capacity Strengthening'],
    description: 'Helps citizens and local organisations take part in, and hold to account, the county decisions that shape their services.',
    groups: ['Ward residents', 'Civil society organisations', 'County officials'],
    sdg: [16, 17],
    indicators: [
      { level: 'goal', title: 'Citizens satisfied with county service delivery', unit: '%', type: 'percentage', target: [58, 74], baseline: [26, 40] },
      { level: 'outcome', title: 'Citizen priorities adopted in county budgets', unit: 'priorities', target: [20, 70], baseline: [2, 8] },
      { level: 'output', title: 'Citizens participating in budget forums', unit: 'citizens', target: [4000, 22000], activity: 'meeting' },
      { level: 'output', title: 'Civil society organisations trained', unit: 'organisations', target: [30, 140], activity: 'training' },
      { level: 'output', title: 'Social audits completed', unit: 'audits', target: [20, 90], activity: 'assessment' },
      { level: 'output', title: 'Policy briefs published', unit: 'briefs', target: [8, 30], activity: 'research' },
    ],
    workplan: ['Ward budget forums', 'CSO organisational capacity assessments', 'Social audit cycles', 'Policy brief production', 'County assembly engagement', 'Learning exchange visits'],
    activityTitles: {
      meeting: ['Ward budget forum', 'County assembly public hearing'],
      training: ['CSO financial management training', 'Advocacy skills workshop'],
      assessment: ['Social audit of health facility', 'Social audit of ward projects'],
      research: ['Policy brief validation workshop'],
    },
  },
];

const RISKS = [
  ['Delayed donor disbursement', 'Tranches arrive later than scheduled, stalling field implementation.', 'Maintain a two-month operating reserve and agree a pre-financing arrangement.'],
  ['Flooding and extreme weather', 'Seasonal floods cut off project sites and damage infrastructure.', 'Front-load field work before the long rains; pre-position supplies.'],
  ['Staff turnover', 'Loss of trained field staff reduces delivery quality.', 'Retention incentives, structured handover and cross-training.'],
  ['Currency depreciation', 'A weaker shilling raises the cost of imported inputs.', 'Budget in the donor currency and review unit costs quarterly.'],
  ['Election-period insecurity', 'Political tension restricts movement and community gatherings.', 'Adjust the workplan around the electoral calendar; monitor security advisories.'],
  ['Supply chain disruption', 'Key commodities are out of stock at national level.', 'Hold buffer stock and qualify a second supplier.'],
  ['Low community uptake', 'Participation falls below the level the design assumed.', 'Co-design with community leaders and adapt the delivery model.'],
  ['Data quality gaps', 'Incomplete or late field reports undermine results reporting.', 'Routine data quality audits and mobile data capture.'],
];

const FEEDBACK = {
  very_positive: ['The new water point has changed our lives — my daughters now get to school on time.', 'The training was excellent and the facilitators respected us.', 'For the first time the clinic came to our village. We are grateful.'],
  positive: ['The seeds arrived on time this season and germination was good.', 'The savings group has helped me restock my shop.', 'Staff explained clearly how beneficiaries were selected.'],
  neutral: ['The meeting was useful but started two hours late.', 'We would like the sessions to be held closer to the market.', 'Some of the materials were only in English.'],
  negative: ['The borehole pump has been broken for three weeks and nobody has come.', 'Distribution lists left out several widows in our village.', 'The stipend for volunteers has not been paid for two months.'],
  very_negative: ['A community leader asked for payment to add names to the list.', 'We were promised latrines last year and nothing has happened.'],
} as const;

const DOC_CATEGORIES = ['Report', 'Evidence', 'Policy', 'Agreement', 'Financial', 'Training', 'Other'];
const DOC_TITLES: Record<string, string[]> = {
  Report: ['Quarterly Progress Report', 'Annual Narrative Report', 'Midterm Review Report', 'Baseline Survey Report', 'Field Monitoring Report', 'Endline Evaluation Report'],
  Evidence: ['Signed Attendance Sheets', 'Geo-tagged Site Photos', 'Distribution Lists', 'Water Quality Test Results', 'Post-Distribution Monitoring Data'],
  Policy: ['Safeguarding Policy', 'Data Protection Policy', 'Procurement Manual', 'Whistleblowing Policy'],
  Agreement: ['Grant Agreement', 'Sub-grant Agreement', 'Memorandum of Understanding', 'No-Cost Extension Letter'],
  Financial: ['Financial Report', 'Audit Report', 'Budget vs Actuals', 'Cost-Share Documentation'],
  Training: ['Training Curriculum', 'Facilitator Guide', 'Participant Handbook'],
  Other: ['Project Brief', 'Stakeholder Map', 'Communications Plan'],
};

// ─── Script ──────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production (set ALLOW_SEED=true to override).');
  }
  await mongoose.connect(uri);
  console.log(`Connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  /* eslint-disable @typescript-eslint/no-require-imports */
  const model = (name: string, file: string, exp: string) => mongoose.model(name, require(file)[exp]) as mongoose.Model<any>;
  const M = {
    User: model('User', '../src/users/schemas/user.schema', 'UserSchema'),
    OrganizationMember: model('OrganizationMember', '../src/members/schemas/organization-member.schema', 'OrganizationMemberSchema'),
    Donor: model('Donor', '../src/donors/schemas/donor.schema', 'DonorSchema'),
    Partner: model('Partner', '../src/partners/schemas/partner.schema', 'PartnerSchema'),
    Project: model('Project', '../src/projects/schemas/project.schema', 'ProjectSchema'),
    Indicator: model('Indicator', '../src/indicators/schemas/indicator.schema', 'IndicatorSchema'),
    Activity: model('Activity', '../src/activities/schemas/activity.schema', 'ActivitySchema'),
    Grant: model('Grant', '../src/grants/schemas/grant.schema', 'GrantSchema'),
    BudgetAllocation: model('BudgetAllocation', '../src/budget/schemas/budget.schema', 'BudgetAllocationSchema'),
    BudgetLineItem: model('BudgetLineItem', '../src/budget/schemas/budget.schema', 'BudgetLineItemSchema'),
    Beneficiary: model('Beneficiary', '../src/beneficiaries/schemas/beneficiary.schema', 'BeneficiarySchema'),
    Document: model('Document', '../src/documents/schemas/document.schema', 'DocumentSchema'),
    ReportingPeriod: model('ReportingPeriod', '../src/reporting/schemas/reporting-period.schema', 'ReportingPeriodSchema'),
    IndicatorTarget: model('IndicatorTarget', '../src/reporting/schemas/indicator-target.schema', 'IndicatorTargetSchema'),
    IndicatorResult: model('IndicatorResult', '../src/reporting/schemas/indicator-result.schema', 'IndicatorResultSchema'),
    StakeholderFeedback: model('StakeholderFeedback', '../src/stakeholder-feedback/schemas/stakeholder-feedback.schema', 'StakeholderFeedbackSchema'),
    ImpactStory: model('ImpactStory', '../src/impact-stories/schemas/impact-story.schema', 'ImpactStorySchema'),
    OKR: model('OKR', '../src/okrs/schemas/okr.schema', 'OKRSchema'),
    BalancedScorecard: model('BalancedScorecard', '../src/bsc/schemas/balanced-scorecard.schema', 'BalancedScorecardSchema'),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Manifest = mongoose.model(
    'SeedManifest',
    new Schema({ organizationId: Schema.Types.ObjectId, ids: Schema.Types.Mixed }, { timestamps: true }),
  );

  const owner = await M.User.findOne({ email: SEED_EMAIL }).lean<{ _id: Types.ObjectId; organizationId: Types.ObjectId }>();
  if (!owner?.organizationId) {
    throw new Error(`Demo organisation not found (${SEED_EMAIL}). Run "npm run seed" first.`);
  }
  const orgId = owner.organizationId;

  // ── Remove what a previous run added ───────────────────────────────────────
  const previous = await Manifest.find({ organizationId: orgId }).lean<Array<{ _id: Types.ObjectId; ids: Record<string, Types.ObjectId[]> }>>();
  for (const manifest of previous) {
    for (const [name, ids] of Object.entries(manifest.ids ?? {})) {
      if ((M as Record<string, mongoose.Model<any>>)[name] && ids?.length) {
        await (M as Record<string, mongoose.Model<any>>)[name].deleteMany({ _id: { $in: ids } });
      }
    }
    await Manifest.deleteOne({ _id: manifest._id });
  }
  if (previous.length) console.log('Removed data from a previous volume seed.');
  if (process.argv.includes('--reset')) {
    await mongoose.disconnect();
    return;
  }

  const created: Record<string, Types.ObjectId[]> = {};
  const insert = async <T extends Record<string, any>>(name: keyof typeof M, docs: T[]): Promise<Array<T & { _id: Types.ObjectId }>> => {
    if (docs.length === 0) return [];
    const withIds = docs.map((d) => ({ _id: new Types.ObjectId(), ...d })) as Array<T & { _id: Types.ObjectId }>;
    for (let i = 0; i < withIds.length; i += 1000) {
      await M[name].insertMany(withIds.slice(i, i + 1000), { ordered: true });
    }
    (created[name] ??= []).push(...withIds.map((d) => d._id));
    // Written as we go, so a failed run can still be cleaned up by --reset.
    await Manifest.updateOne({ organizationId: orgId }, { $set: { ids: created } }, { upsert: true });
    return withIds;
  };
  const org = { organizationId: orgId };

  // ── People ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const existingEmails = new Set((await M.User.find({}, { email: 1 }).lean<Array<{ email: string }>>()).map((u) => u.email));
  const newStaff = STAFF.filter((s) => !existingEmails.has(`${s.email}@evidara.test`));
  const users = await insert('User', newStaff.map((s) => ({ email: `${s.email}@evidara.test`, passwordHash, name: s.name, organizationId: orgId })));
  await insert('OrganizationMember', users.map((u, i) => ({
    userId: u._id, ...org, role: newStaff[i].role, status: 'active', joinedAt: between(date(2023, 1), date(2026, 6)),
  })));
  const members = await M.OrganizationMember.find({ organizationId: orgId, status: 'active' }).lean<Array<{ userId: Types.ObjectId; role: string }>>();
  const allUsers = await M.User.find({ organizationId: orgId }, { name: 1 }).lean<Array<{ _id: Types.ObjectId; name: string }>>();
  const nameOf = new Map(allUsers.map((u) => [u._id.toString(), u.name]));
  const byRole = (...roles: string[]) => {
    const list = members.filter((m) => roles.includes(m.role)).map((m) => m.userId);
    return list.length ? list : [owner._id];
  };
  const managers = byRole('owner', 'admin', 'me_officer');
  const meOfficers = byRole('me_officer');
  const fieldOfficers = byRole('field_officer', 'me_officer');
  const financeUsers = byRole('finance', 'admin', 'owner');

  // ── Donors & partners ─────────────────────────────────────────────────────
  const existingDonors = await M.Donor.find({ organizationId: orgId }).lean<Array<{ _id: Types.ObjectId; name: string; shortName?: string }>>();
  const taken = new Set(existingDonors.flatMap((d) => [d.name.toLowerCase(), (d.shortName ?? '').toLowerCase()]));
  const donors = await insert('Donor', DONORS.filter((d) => !taken.has(d.name.toLowerCase()) && !taken.has(d.shortName.toLowerCase())).map((d) => {
    const contactSex = chance(0.55) ? 'female' : 'male';
    const contact = personName(contactSex);
    const domain = `${slug(d.shortName)}.example`;
    return {
      ...org, name: d.name, shortName: d.shortName, type: d.type, status: d.status ?? 'active', country: d.country,
      address: { city: d.country === 'Kenya' ? 'Nairobi' : undefined, country: d.country },
      contactName: contact, contactEmail: `${slug(contact)}@${domain}`, contactPhone: `+254 7${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`,
      contacts: [
        { name: contact, title: 'Programme Officer', email: `${slug(contact)}@${domain}`, isPrimary: true },
        { name: personName('male'), title: 'Grants & Compliance Manager', email: `grants@${domain}`, isPrimary: false },
      ],
      website: `https://www.${domain}`,
      description: `${d.shortName} funds ${pick(['health and nutrition', 'water and sanitation', 'education and youth', 'livelihoods and resilience', 'governance and rights'])} programming in western Kenya.`,
      preferredReportingFormat: pick(['Donor template (Word)', 'Online portal', 'IATI + narrative PDF', 'Logframe results table']),
      requiresDisaggregation: chance(0.75), reportingCadence: d.cadence,
      requiredDisaggregationDimensions: sample(['sex', 'age', 'disability', 'location'], int(1, 3)),
      currency: pick(['USD', 'USD', 'EUR', 'GBP', 'KES']), fiscalYearEnd: pick([3, 6, 9, 12]),
      signedAgreementDate: d.status === 'prospect' ? undefined : between(date(2022, 1), date(2025, 6)),
      agreementReferenceNumber: d.status === 'prospect' ? undefined : `${slug(d.shortName).toUpperCase()}-FA-${int(2022, 2025)}-${int(100, 999)}`,
      complianceConditions: d.status === 'prospect' ? [] : sample([
        'Annual external audit submitted within 90 days of year end', 'Safeguarding policy reviewed and signed by all staff',
        'Branding and visibility plan approved', 'Asset register updated and shared', 'Anti-terrorism vetting of sub-recipients completed',
        'Environmental screening for construction works',
      ], int(2, 4)).map((description) => {
        const status = weighted([['met', 5], ['pending', 3], ['overdue', 1], ['waived', 1]] as const);
        const dueDate = between(date(2025, 6), date(2027, 3));
        return { description, status, dueDate, metDate: status === 'met' ? addDays(dueDate, -int(5, 40)) : undefined };
      }),
      engagements: Array.from({ length: d.status === 'prospect' ? int(1, 3) : int(3, 8) }, () => {
        const type = pick(['call', 'email', 'meeting', 'site_visit', 'proposal_submission', 'report_submission'] as const);
        return {
          type, date: between(date(2024, 6), TODAY), recordedBy: pick(managers),
          summary: {
            call: 'Quarterly check-in call on progress and pipeline.', email: 'Shared updated results framework and budget realignment request.',
            meeting: 'Portfolio review meeting at the donor\'s Nairobi office.', site_visit: 'Joint monitoring visit to project sites.',
            proposal_submission: 'Submitted full proposal in response to the call for applications.', report_submission: 'Submitted narrative and financial report for the period.',
          }[type],
          outcome: pick(['Positive — no follow-up needed', 'Follow-up actions agreed', 'Awaiting donor feedback', 'Donor requested additional data']),
        };
      }).sort((a, b) => a.date.getTime() - b.date.getTime()),
      tags: sample(['strategic', 'renewal-2027', 'institutional', 'consortium', 'local'], int(0, 2)),
    };
  }));
  const fundingDonors = [...donors.filter((d) => d.status === 'active'), ...existingDonors.map((d) => ({ ...d, status: 'active' }))] as Array<{ _id: Types.ObjectId; name: string; shortName?: string }>;

  const partners = await insert('Partner', PARTNERS.map((name) => {
    const county = pick(COUNTIES);
    return {
      ...org, name, contactEmail: `info@${slug(name)}.example`, contactPhone: `+254 7${int(10, 99)} ${int(100, 999)} ${int(100, 999)}`,
      country: 'Kenya', region: county.name, district: pick(county.wards),
      geoPoint: { latitude: county.lat + (rand() - 0.5) * 0.2, longitude: county.lng + (rand() - 0.5) * 0.2 },
      notes: 'Implementing partner under a sub-grant agreement; capacity assessment on file.',
    };
  }));

  // ── Projects ──────────────────────────────────────────────────────────────
  type ProjectPlan = { spec: SectorSpec; name: string; status: string; start: Date; end: Date; county: (typeof COUNTIES)[number]; perf: number };
  const plans: ProjectPlan[] = [];
  const STATUS_MIX: Array<readonly [string, number]> = [['active', 22], ['completed', 9], ['pipeline', 3], ['design', 2], ['paused', 2], ['cancelled', 1]];
  for (const spec of SECTORS) {
    for (const baseName of spec.names) {
      const status = weighted(STATUS_MIX);
      const county = pick(COUNTIES);
      let start: Date;
      let months = pick([18, 24, 24, 36, 36, 48]);
      if (status === 'completed') { start = date(int(2021, 2023), pick([1, 4, 7, 10])); months = pick([18, 24, 30]); }
      else if (status === 'pipeline' || status === 'design') start = date(2027, pick([1, 4, 7]));
      else start = date(int(2024, 2026), pick([1, 4, 7, 10]));
      if (status !== 'pipeline' && status !== 'design' && start > TODAY) start = date(2026, 4);
      const end = addDays(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1)), -1);
      plans.push({ spec, name: `${baseName} — ${county.name}`, status: status === 'active' && end < TODAY ? 'completed' : status, start, end, county, perf: 0.55 + rand() * 0.6 });
    }
  }

  const projects = await insert('Project', plans.map((p, i) => {
    const donor = pick(fundingDonors);
    const manager = pick(managers);
    const me = pick(meOfficers);
    const budget = round(int(180, 2400) * 1000, 5000);
    const elapsed = Math.min(1, Math.max(0, (TODAY.getTime() - p.start.getTime()) / (p.end.getTime() - p.start.getTime())));
    const started = p.status !== 'pipeline' && p.status !== 'design';
    const span = p.end.getTime() - p.start.getTime();
    const direct = round(int(3, 80) * 1000, 500);
    return {
      ...org, name: p.name, projectCode: `LCDT-${p.spec.sector.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      description: p.spec.description,
      objectives: p.spec.indicators.filter((ind) => ind.level !== 'output').map((ind) => `Improve: ${ind.title.toLowerCase()}`),
      tags: sample(['flagship', 'consortium', 'county-partnership', 'innovation', 'scale-up', 'pilot'], int(0, 2)),
      sector: p.spec.sector, status: p.status,
      projectPhase: !started ? 'inception' : p.status === 'completed' ? 'completed' : elapsed > 0.85 ? 'closeout' : elapsed > 0.6 ? 'scale_up' : elapsed > 0.12 ? 'implementation' : 'inception',
      evaluationStatus: p.status === 'completed' ? 'completed' : elapsed > 0.5 && started ? pick(['in_progress', 'not_started', 'under_review']) : 'not_started',
      problemStatement: `Communities in ${p.county.name} County face persistent gaps that this project addresses: ${p.spec.description.toLowerCase()}`,
      changeHypothesis: 'If services are brought closer to communities and local structures are strengthened, then uptake rises and outcomes improve sustainably.',
      keyAssumptions: ['County government sustains its co-financing commitments', 'Security and access to project sites remain stable', 'Communities remain willing to participate'],
      donor: donor.shortName ?? donor.name, donorId: donor._id, grantReference: `${slug(donor.shortName ?? donor.name).toUpperCase()}/KE/${p.start.getUTCFullYear()}/${int(100, 999)}`,
      totalBudget: budget, currency: 'USD', startDate: p.start, endDate: p.end,
      closureDate: p.status === 'completed' ? addDays(p.end, int(20, 80)) : undefined,
      nextReviewDate: p.status === 'active' ? addDays(TODAY, int(10, 120)) : undefined,
      country: 'Kenya', region: p.county.name, district: pick(p.county.wards),
      geoPoint: { latitude: p.county.lat + (rand() - 0.5) * 0.25, longitude: p.county.lng + (rand() - 0.5) * 0.25 },
      implementationAreas: sample(p.county.wards, int(2, 4)), coverageArea: `${int(2, 5)} sub-counties of ${p.county.name}`,
      targetBeneficiaryCount: direct * 4, targetDirectBeneficiaries: direct, targetIndirectBeneficiaries: direct * 3,
      targetGroups: p.spec.groups, populationServed: p.spec.groups.join(', '),
      partnerIds: sample(partners, int(1, 3)).map((x) => x._id),
      projectManagerId: manager, projectManagerName: nameOf.get(manager.toString()), meOfficerId: me, meOfficerName: nameOf.get(me.toString()),
      milestones: ['Inception report approved', 'Baseline survey completed', 'Midterm review', 'Sustainability plan agreed', 'Endline evaluation'].map((title, m) => {
        const due = new Date(p.start.getTime() + span * [0.08, 0.18, 0.5, 0.8, 0.97][m]);
        const done = started && due < TODAY && (p.status === 'completed' || chance(0.8));
        return {
          title, dueDate: due, ownerId: manager, ownerName: nameOf.get(manager.toString()),
          status: !started ? 'not_started' : done ? 'completed' : due < TODAY ? 'overdue' : due < addDays(TODAY, 90) ? 'in_progress' : 'not_started',
          completedDate: done ? addDays(due, int(-10, 25)) : undefined, progressPct: done ? 100 : due < addDays(TODAY, 90) && started ? int(20, 80) : 0,
        };
      }),
      workplan: p.spec.workplan.map((title, w) => {
        const wStart = new Date(p.start.getTime() + span * (w / p.spec.workplan.length) * 0.9);
        const wEnd = new Date(wStart.getTime() + span * 0.22);
        const done = started && wEnd < TODAY && (p.status === 'completed' || chance(0.85));
        const running = started && wStart < TODAY && !done;
        const cost = round((budget * 0.7) / p.spec.workplan.length, 500);
        const responsible = pick(fieldOfficers);
        return {
          title, description: `${title} across ${p.county.name} County implementation sites.`, startDate: wStart, endDate: wEnd,
          responsibleUserId: responsible, responsibleName: nameOf.get(responsible.toString()),
          status: done ? 'completed' : running ? (wEnd < TODAY ? 'delayed' : 'in_progress') : p.status === 'cancelled' ? 'cancelled' : 'planned',
          progressPct: done ? 100 : running ? int(15, 85) : 0, quarter: `Q${Math.floor(wStart.getUTCMonth() / 3) + 1}`,
          estimatedCost: cost, actualCost: done ? round(cost * (0.85 + rand() * 0.3), 100) : running ? round(cost * rand() * 0.7, 100) : 0,
          outputDescription: `${title} completed and documented.`,
        };
      }),
      risks: sample(RISKS, int(2, 4)).map(([title, description, mitigationPlan]) => ({
        title, description, mitigationPlan, likelihood: pick(['low', 'medium', 'medium', 'high']), impact: pick(['medium', 'medium', 'high', 'critical']),
        status: p.status === 'completed' ? 'closed' : weighted([['open', 5], ['mitigated', 3], ['accepted', 1]] as const),
        ownerId: manager, ownerName: nameOf.get(manager.toString()), reviewDate: addDays(TODAY, int(15, 120)),
      })),
      stakeholders: [
        { name: personName('male'), organisation: `County Government of ${p.county.name}`, role: 'County Director', type: 'government', influence: 'high', interest: 'medium', engagementStrategy: 'keep_satisfied', isActive: true },
        { name: personName('female'), organisation: donor.shortName ?? donor.name, role: 'Programme Officer', type: 'donor', influence: 'high', interest: 'high', engagementStrategy: 'manage_closely', isActive: true },
        { name: personName('female'), organisation: 'Community representatives', role: 'Ward committee chair', type: 'community', influence: 'medium', interest: 'high', engagementStrategy: 'keep_informed', isActive: true },
      ],
      sdgGoals: p.spec.sdg, frameworks: ['logframe'], reportingFrequency: pick(['quarterly', 'quarterly', 'semiannual', 'monthly']),
      requiresEvidencePerActivity: chance(0.4), requiresDisaggregation: chance(0.7),
      dataQualityScore: started ? int(62, 97) : undefined, dataQualityLastChecked: started ? addDays(TODAY, -int(5, 90)) : undefined,
      isArchived: false, isTemplate: false,
    };
  }));
  const planOf = new Map(projects.map((p, i) => [p._id.toString(), plans[i]]));
  const hasStarted = (p: { status: string }) => !['pipeline', 'design'].includes(p.status);
  const liveProjects = projects.filter(hasStarted);

  // ── Indicators ────────────────────────────────────────────────────────────
  const indicatorDocs: Array<Record<string, any>> = [];
  for (const project of projects) {
    const plan = planOf.get(project._id.toString())!;
    const counters = { goal: 0, outcome: 0, output: 0 };
    const prefix = { goal: 'G', outcome: 'OC', output: 'OP' };
    for (const spec of plan.spec.indicators) {
      counters[spec.level] += 1;
      const target = spec.type === 'percentage' ? int(spec.target[0], spec.target[1]) : round(int(spec.target[0], spec.target[1]), spec.target[1] > 5000 ? 100 : spec.target[1] > 500 ? 10 : 1);
      const baseline = spec.baseline ? int(spec.baseline[0], spec.baseline[1]) : 0;
      const responsible = pick(meOfficers);
      indicatorDocs.push({
        ...org, projectId: project._id, level: spec.level, code: `${prefix[spec.level]}${counters[spec.level]}`, title: spec.title,
        definition: `${spec.title}, measured in ${spec.unit} across all project sites.`, unit: spec.unit, indicatorType: spec.type ?? 'number',
        direction: baseline > target ? 'decreasing' : 'increasing', cumulative: spec.level === 'output',
        baseline, baselineDate: addDays(plan.start, int(20, 80)), baselineSource: spec.level === 'output' ? 'Project records' : 'Baseline household survey',
        target, frequency: spec.level === 'goal' ? 'annual' : spec.level === 'outcome' ? 'semiannual' : 'quarterly',
        disaggregation: spec.level === 'output' ? ['sex', 'age'] : [], genderMarker: pick(['1', '2', '2', 'n/a']),
        isGenderDisaggregated: spec.level === 'output', isAgeDisaggregated: spec.level === 'output' && chance(0.5),
        dataSource: spec.level === 'output' ? 'Activity reports and attendance registers' : 'Household survey', dataCollectionMethod: spec.level === 'output' ? 'Routine monitoring' : 'Sample survey',
        meansOfVerification: spec.level === 'output' ? 'Signed registers, photos, distribution lists' : 'Survey report and dataset',
        verificationFrequency: 'quarterly', responsibleUserId: responsible, responsiblePerson: nameOf.get(responsible.toString()),
        isCore: spec.level !== 'output', isStandardIndicator: chance(0.25), sdgGoals: plan.spec.sdg, isActive: true, sortOrder: indicatorDocs.length,
        _spec: spec,
      });
    }
  }
  const specOf = new Map<string, IndicatorSpec>();
  const indicators = await insert('Indicator', indicatorDocs.map(({ _spec, ...doc }) => {
    const _id = new Types.ObjectId();
    specOf.set(_id.toString(), _spec);
    return { _id, ...doc } as Record<string, any>;
  }));
  const indicatorsByProject = new Map<string, typeof indicators>();
  for (const ind of indicators) {
    const key = ind.projectId.toString();
    indicatorsByProject.set(key, [...(indicatorsByProject.get(key) ?? []), ind]);
  }

  // ── Grants ────────────────────────────────────────────────────────────────
  const grants = await insert('Grant', projects.filter((p) => p.status !== 'cancelled').map((project) => {
    const plan = planOf.get(project._id.toString())!;
    const started = hasStarted(project);
    const status = !started ? pick(['prospect', 'applied', 'applied', 'awarded']) : project.status === 'completed' ? pick(['completed', 'closed']) : project.status === 'paused' ? 'pending' : 'active';
    const amount = project.totalBudget;
    const elapsed = Math.min(1, Math.max(0, (TODAY.getTime() - plan.start.getTime()) / (plan.end.getTime() - plan.start.getTime())));
    const spent = started ? round(amount * Math.min(1.06, elapsed * (0.75 + rand() * 0.4)), 100) : 0;
    const tranches = pick([3, 4, 4, 6]);
    const quarters: Date[] = [];
    for (let d = new Date(plan.start); d < plan.end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) quarters.push(d);
    const reportingSchedule = started ? quarters.slice(1).map((q, i) => {
      const dueDate = addDays(q, 30);
      const past = dueDate < TODAY;
      const status2 = past ? weighted([['accepted', 7], ['submitted', 2], ['overdue', 1]] as const) : 'pending';
      return { dueDate, type: i % 4 === 3 ? 'financial' : 'narrative', status: status2, submittedDate: past && status2 !== 'overdue' ? addDays(dueDate, -int(0, 12)) : undefined };
    }) : [];
    const amended = started && chance(0.25);
    return {
      ...org, name: `${project.donor} — ${project.name}`, description: `Grant financing ${project.name}.`, donorId: project.donorId,
      amount, currency: 'USD', amountSpent: spent, isOverspent: spent > amount, overspendAmount: Math.max(0, spent - amount),
      indirectCostRate: pick([7, 10, 10, 12, 15]), fundClassification: chance(0.85) ? 'restricted' : 'unrestricted',
      matchFunding: chance(0.3) ? { required: true, requiredAmount: round(amount * 0.1, 1000), securedAmount: round(amount * 0.1 * rand(), 1000), source: 'County government co-financing' } : { required: false, requiredAmount: 0, securedAmount: 0 },
      status, startDate: plan.start, endDate: plan.end, linkedProjects: [project._id],
      amendments: amended ? [{
        effectiveDate: between(plan.start, clampDate(plan.end, TODAY)), type: 'budget_revision', previousAmount: round(amount * 0.9, 1000), newAmount: amount,
        reason: 'Scope expanded to two additional wards at the donor\'s request.', donorReference: `AMD-${int(1, 9)}`, recordedBy: pick(financeUsers), recordedAt: between(plan.start, clampDate(plan.end, TODAY)),
      }] : [],
      disbursements: started ? Array.from({ length: tranches }, (_, i) => {
        const plannedDate = new Date(plan.start.getTime() + ((plan.end.getTime() - plan.start.getTime()) * i) / tranches);
        const past = plannedDate < TODAY;
        const status2 = past ? weighted([['received', 8], ['delayed', 1]] as const) : 'scheduled';
        return { plannedDate, receivedDate: status2 === 'received' ? addDays(plannedDate, int(0, 35)) : undefined, amount: round(amount / tranches, 100), currency: 'USD', status: status2, reference: `TRN-${int(10000, 99999)}` };
      }) : [],
      reportingSchedule, nextReportDue: reportingSchedule.find((r) => r.status === 'pending')?.dueDate ?? null,
      requiresMonthlyReporting: project.reportingFrequency === 'monthly', requiresFinalReport: true,
      termsAndConditions: 'Funds are restricted to approved budget lines. Variances above 10% per line require prior written approval.',
      createdBy: pick(financeUsers), updatedBy: pick(financeUsers),
    };
  }));
  const grantByProject = new Map(grants.map((g) => [g.linkedProjects[0].toString(), g]));
  for (const project of projects) {
    const grant = grantByProject.get(project._id.toString());
    if (grant) await M.Project.updateOne({ _id: project._id }, { $set: { grantIds: [grant._id] } });
  }

  // ── Activities ────────────────────────────────────────────────────────────
  const activities: Array<Record<string, any>> = [];
  for (const project of liveProjects) {
    const plan = planOf.get(project._id.toString())!;
    const windowEnd = clampDate(plan.end, TODAY);
    if (windowEnd <= plan.start) continue;
    const elapsed = Math.min(1, (windowEnd.getTime() - plan.start.getTime()) / (plan.end.getTime() - plan.start.getTime()));
    const grant = grantByProject.get(project._id.toString());
    for (const indicator of indicatorsByProject.get(project._id.toString()) ?? []) {
      const spec = specOf.get(indicator._id.toString())!;
      if (spec.level !== 'output') {
        // Outcome and goal indicators move through periodic surveys: the most
        // recent approved survey figure is what the indicator reports.
        if (elapsed < 0.3) continue;
        const progress = Math.min(1, elapsed * plan.perf * 1.05);
        const value = Math.round(indicator.baseline + (indicator.target - indicator.baseline) * progress);
        activities.push({
          ...org, projectId: project._id, indicatorId: indicator._id, title: `${elapsed > 0.9 ? 'Endline' : 'Midline'} survey — ${indicator.title}`,
          description: 'Sample survey measuring progress against the outcome indicator.', activityDate: addDays(windowEnd, -int(20, 120)), activityType: 'survey',
          location: `${plan.county.name} County`, country: 'Kenya', region: plan.county.name, participants: int(380, 1200), quantity: value,
          status: 'approved', submittedByUserId: pick(meOfficers), reviewedByUserId: pick(managers), hasPhotoEvidence: false, hasSignatureSheet: false,
          notes: 'Sample size calculated for 95% confidence, 5% margin of error.', grantId: grant?._id,
        });
        continue;
      }
      const totalToDate = indicator.target * Math.min(1.12, elapsed * plan.perf);
      const count = Math.max(4, Math.min(34, Math.round(elapsed * int(18, 34))));
      const titles = plan.spec.activityTitles[spec.activity ?? 'training'] ?? ['Field activity'];
      let remaining = totalToDate;
      for (let i = 0; i < count; i++) {
        const share = i === count - 1 ? remaining : Math.min(remaining, (totalToDate / count) * (0.5 + rand()));
        remaining -= share;
        const quantity = Math.max(1, Math.round(share));
        const when = between(plan.start, windowEnd);
        const recent = when > addDays(TODAY, -45);
        const status = recent ? weighted([['submitted', 5], ['draft', 2], ['approved', 3]] as const) : weighted([['approved', 92], ['rejected', 4], ['submitted', 4]] as const);
        const ward = pick(plan.county.wards);
        const peopleUnit = /people|children|farmers|youth|learners|participants|volunteers|teachers|survivors|paralegals|citizens/.test(spec.unit);
        const participants = peopleUnit ? quantity : int(12, 140);
        const female = Math.round(participants * (0.42 + rand() * 0.3));
        const submitter = pick(fieldOfficers);
        activities.push({
          ...org, projectId: project._id, indicatorId: indicator._id, title: `${pick(titles)} — ${ward}`,
          description: `${pick(titles)} delivered in ${ward}, ${plan.county.name} County.`, activityDate: when, activityType: spec.activity ?? 'training',
          location: `${ward}, ${plan.county.name}`, country: 'Kenya', region: plan.county.name, district: ward,
          geoPoint: { latitude: plan.county.lat + (rand() - 0.5) * 0.3, longitude: plan.county.lng + (rand() - 0.5) * 0.3 },
          participants, quantity, participantsFemale: female, participantsMale: participants - female,
          participantsUnder18: Math.round(participants * rand() * 0.3), participantsPwd: Math.round(participants * rand() * 0.06),
          cost: round(int(150, 4200), 10), costCurrency: 'USD', grantId: grant?._id, partnerId: chance(0.3) ? pick(partners)._id : undefined,
          hasPhotoEvidence: chance(0.7), hasSignatureSheet: chance(0.6),
          notes: chance(0.5) ? pick(['Turnout exceeded the plan.', 'Heavy rain delayed the start by two hours.', 'County officials attended and gave remarks.', 'Follow-up visit scheduled for next month.']) : undefined,
          challenges: chance(0.2) ? pick(['Poor road access after rains.', 'Venue double-booked; relocated to the chief\'s camp.', 'Some participants lacked identity documents.']) : undefined,
          status, rejectionReason: status === 'rejected' ? pick(['Attendance sheet missing signatures.', 'Quantity does not match the distribution list.', 'Duplicate of an earlier entry.']) : undefined,
          submittedByUserId: status === 'draft' ? undefined : submitter, submittedAt: status === 'draft' ? undefined : addDays(when, int(0, 6)),
          reviewedByUserId: ['approved', 'rejected'].includes(status) ? pick(managers) : undefined, reviewedAt: ['approved', 'rejected'].includes(status) ? addDays(when, int(3, 14)) : undefined,
          syncedFromOffline: chance(0.25),
        });
      }
    }
  }
  const insertedActivities = await insert('Activity', activities);

  // The API keeps each indicator's running total in step as activities are
  // approved; these were inserted directly, so set it the same way here.
  const approvedTotals = new Map<string, { total: number; last: Date }>();
  for (const activity of insertedActivities) {
    if (activity.status !== 'approved' || !activity.indicatorId) continue;
    const key = activity.indicatorId.toString();
    const entry = approvedTotals.get(key) ?? { total: 0, last: activity.activityDate };
    approvedTotals.set(key, { total: entry.total + (activity.quantity ?? 0), last: activity.activityDate > entry.last ? activity.activityDate : entry.last });
  }
  await M.Indicator.bulkWrite([...approvedTotals].map(([id, { total, last }]) => ({
    updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { lastAchievedValue: total, lastAchievedDate: last } } },
  })));

  // ── Budgets ───────────────────────────────────────────────────────────────
  const COST_LINES: Array<[string, string, string, number]> = [
    ['Programme staff salaries', 'personnel', 'person-months', 0.34], ['Field travel and transport', 'travel', 'trips', 0.11],
    ['Training and workshops', 'project', 'events', 0.17], ['Supplies and materials', 'project', 'lots', 0.19],
    ['Equipment', 'equipment', 'units', 0.07], ['Monitoring and evaluation', 'project', 'studies', 0.06], ['Indirect costs', 'indirect', 'lump sum', 0.06],
  ];
  const allocations: Array<Record<string, any>> = [];
  const lineItems: Array<Record<string, any>> = [];
  for (const project of projects.filter((p) => p.status !== 'cancelled')) {
    const plan = planOf.get(project._id.toString())!;
    const grant = grantByProject.get(project._id.toString());
    const firstYear = plan.start.getUTCFullYear();
    const lastYear = Math.min(plan.end.getUTCFullYear(), 2027);
    for (let year = Math.max(firstYear, 2025); year <= lastYear; year++) {
      const years = plan.end.getUTCFullYear() - firstYear + 1;
      const allocated = round(project.totalBudget / years, 500);
      const isPast = year < TODAY.getUTCFullYear();
      const isCurrent = year === TODAY.getUTCFullYear();
      const started = hasStarted(project);
      const burn = !started ? 0 : isPast ? 0.82 + rand() * 0.24 : isCurrent ? 0.45 + rand() * 0.45 : 0;
      const spent = round(allocated * burn, 50);
      const committed = isCurrent && started ? round(allocated * rand() * 0.15, 50) : 0;
      const _id = new Types.ObjectId();
      const creator = pick(financeUsers);
      allocations.push({
        _id, ...org, name: `${project.name} — FY${year}`, description: `Annual budget for ${project.name}.`, projectId: project._id, grantId: grant?._id,
        allocatedAmount: allocated, spentAmount: spent, committedAmount: committed, uncommittedAmount: Math.max(0, allocated - spent - committed),
        currency: 'USD', allocatedAmountUSD: allocated, category: 'project',
        status: !started ? pick(['draft', 'submitted', 'under_review']) : isPast ? 'closed' : isCurrent ? 'active' : pick(['draft', 'approved', 'submitted']),
        fiscalYear: year, startDate: date(year, 1, 1), endDate: date(year, 12, 31), isRestricted: true, donorId: project.donorId,
        approvedBy: started ? pick(managers) : undefined, approvalDate: started ? date(year - 1, 12, int(1, 20)) : undefined,
        alertThresholds: { warningPercent: 80, criticalPercent: 95, notifyFinance: true, notifyAdmin: true, additionalEmails: [] },
        revisions: [], currentRevisionNumber: 0, burnRateHistory: [], createdBy: creator, lastModifiedBy: creator, closedAt: isPast && started ? date(year + 1, 1, 31) : undefined, isDeleted: false,
      });
      for (const [description, costCategory, unitDescription, weight] of COST_LINES) {
        const amount = round(allocated * weight, 10);
        const quantity = int(1, 24);
        const lineSpent = round(amount * Math.min(1.15, burn * (0.8 + rand() * 0.4)), 10);
        lineItems.push({
          budgetAllocationId: _id, ...org, description, costCategory, unitDescription, quantity, unitCost: round(amount / quantity, 0.01), amount,
          spent: lineSpent, committed: isCurrent && started ? round(amount * rand() * 0.1, 10) : 0,
          status: !started || (!isPast && !isCurrent) ? 'planned' : isPast ? 'spent' : pick(['committed', 'spent', 'planned']),
          linkedGrantId: grant?._id, donorCostCategory: costCategory === 'indirect' ? 'Indirect' : 'Direct programme', createdBy: creator, isDeleted: false,
        });
      }
    }
  }
  for (const [name, category, amount] of [['Head office operations', 'operational', 420000], ['Monitoring, evaluation & learning unit', 'strategic', 185000], ['Vehicles and ICT replacement', 'equipment', 96000], ['Emergency response reserve', 'emergency', 60000]] as const) {
    for (const year of [2025, 2026]) {
      const _id = new Types.ObjectId();
      const burn = year < TODAY.getUTCFullYear() ? 0.9 + rand() * 0.12 : 0.5 + rand() * 0.3;
      const creator = pick(financeUsers);
      allocations.push({
        _id, ...org, name: `${name} — FY${year}`, description: `Core ${category} budget.`, allocatedAmount: amount, spentAmount: round(amount * burn, 50), committedAmount: 0,
        uncommittedAmount: round(amount * (1 - burn), 50), currency: 'USD', allocatedAmountUSD: amount, category, status: year < TODAY.getUTCFullYear() ? 'closed' : 'active',
        fiscalYear: year, startDate: date(year, 1, 1), endDate: date(year, 12, 31), isRestricted: false,
        alertThresholds: { warningPercent: 80, criticalPercent: 95, notifyFinance: true, notifyAdmin: true, additionalEmails: [] },
        revisions: [], currentRevisionNumber: 0, burnRateHistory: [], createdBy: creator, isDeleted: false,
      });
    }
  }
  await insert('BudgetAllocation', allocations);
  await insert('BudgetLineItem', lineItems);

  // ── Reporting periods, targets and results ────────────────────────────────
  const periods: Array<Record<string, any>> = [];
  for (const project of liveProjects) {
    const plan = planOf.get(project._id.toString())!;
    const from = Math.max(plan.start.getTime(), date(2025, 1).getTime());
    for (let d = new Date(from); d < plan.end && d < addDays(TODAY, 100); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) {
      const qStart = date(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 1);
      const qEnd = addDays(date(qStart.getUTCFullYear(), qStart.getUTCMonth() + 4), -1);
      const dueDate = addDays(qEnd, 30);
      const closed = qEnd < TODAY;
      const status = !closed ? 'open' : dueDate < addDays(TODAY, -60) ? weighted([['locked', 7], ['approved', 2]] as const) : weighted([['submitted', 5], ['open', 3], ['approved', 2]] as const);
      const submitter = pick(meOfficers);
      periods.push({
        ...org, projectId: project._id, name: `Q${Math.floor(qStart.getUTCMonth() / 3) + 1} ${qStart.getUTCFullYear()}`, cadence: 'quarterly', startDate: qStart, endDate: qEnd, dueDate,
        donorRequirements: `Narrative and financial report to ${project.donor}.`,
        narrative: status === 'open' ? undefined : 'Implementation remained broadly on track this quarter. Output delivery was strongest in training and outreach; construction works were slowed by rains.',
        challenges: status === 'open' ? undefined : 'Heavy rains limited access to some sites; two field officer positions were vacant for part of the period.',
        lessonsLearned: status === 'open' ? undefined : 'Scheduling community sessions on market days improved turnout considerably.',
        nextPeriodPlans: status === 'open' ? undefined : 'Complete delayed works, run the planned data quality audit, and prepare for the joint monitoring visit.',
        status, submittedByUserId: status === 'open' ? undefined : submitter, submittedAt: status === 'open' ? undefined : addDays(dueDate, -int(1, 10)),
        approvedByUserId: ['approved', 'locked'].includes(status) ? pick(managers) : undefined, approvedAt: ['approved', 'locked'].includes(status) ? addDays(dueDate, int(1, 12)) : undefined,
        lockedAt: status === 'locked' ? addDays(dueDate, int(14, 30)) : undefined,
        completionPct: status === 'open' ? (closed ? int(30, 80) : int(0, 30)) : 100, narrativeComplete: status !== 'open', financialsComplete: status !== 'open' || chance(0.3),
      });
    }
  }
  const insertedPeriods = await insert('ReportingPeriod', periods);

  // Quantity delivered per indicator per period, from the approved activities above.
  const delivered = new Map<string, { sum: number; count: number }>();
  const periodsByProject = new Map<string, typeof insertedPeriods>();
  for (const period of insertedPeriods) {
    const key = period.projectId.toString();
    periodsByProject.set(key, [...(periodsByProject.get(key) ?? []), period]);
  }
  for (const activity of insertedActivities) {
    if (activity.status !== 'approved' || activity.activityType === 'survey') continue;
    const period = (periodsByProject.get(activity.projectId.toString()) ?? []).find((p) => activity.activityDate >= p.startDate && activity.activityDate <= p.endDate);
    if (!period) continue;
    const key = `${period._id}:${activity.indicatorId}`;
    const entry = delivered.get(key) ?? { sum: 0, count: 0 };
    delivered.set(key, { sum: entry.sum + activity.quantity, count: entry.count + 1 });
  }
  const targets: Array<Record<string, any>> = [];
  const results: Array<Record<string, any>> = [];
  for (const period of insertedPeriods) {
    const plan = planOf.get(period.projectId.toString())!;
    const quarters = Math.max(1, Math.round((plan.end.getTime() - plan.start.getTime()) / (91 * 86_400_000)));
    for (const indicator of indicatorsByProject.get(period.projectId.toString()) ?? []) {
      if (indicator.level !== 'output') continue;
      targets.push({ ...org, projectId: period.projectId, reportingPeriodId: period._id, indicatorId: indicator._id, baseline: 0, target: Math.max(1, Math.round(indicator.target / quarters)) });
      if (period.status === 'open') continue;
      const entry = delivered.get(`${period._id}:${indicator._id}`);
      results.push({
        ...org, projectId: period.projectId, reportingPeriodId: period._id, indicatorId: indicator._id, achieved: entry?.sum ?? 0, activityCount: entry?.count ?? 0,
        // "approved" is left to real sign-off in the app: an approved period
        // result is treated as the indicator's authoritative figure, and these
        // are per-quarter values rather than cumulative ones.
        status: period.status === 'approved' ? 'submitted' : period.status, source: 'calculated',
        narrative: entry ? undefined : 'No approved activity was recorded against this indicator in the period.',
        submittedByUserId: period.submittedByUserId, submittedAt: period.submittedAt,
      });
    }
  }
  await insert('IndicatorTarget', targets);
  await insert('IndicatorResult', results);

  // ── Beneficiaries ─────────────────────────────────────────────────────────
  const beneficiaries: Array<Record<string, any>> = [];
  const enrolTargets = liveProjects.filter((p) => p.status !== 'cancelled');
  for (let i = 0; i < 2400; i++) {
    const project = pick(enrolTargets);
    const plan = planOf.get(project._id.toString())!;
    const ward = pick(plan.county.wards);
    const type = weighted([['individual', 78], ['household', 16], ['group', 6]] as const);
    const sex = chance(0.58) ? 'female' : 'male';
    const age = type === 'individual' ? weighted([[int(1, 4), 10], [int(5, 17), 22], [int(18, 24), 20], [int(25, 59), 40], [int(60, 84), 8]] as const) : int(22, 70);
    const registered = between(plan.start, clampDate(plan.end, TODAY));
    const status = project.status === 'completed' ? weighted([['closed', 6], ['active', 2], ['transferred', 1]] as const) : weighted([['active', 88], ['inactive', 7], ['transferred', 3], ['deceased', 1]] as const);
    const hasDisability = chance(0.07);
    const consent = chance(0.93);
    const householdSize = int(1, 9);
    const name = type === 'group' ? `${pick(['Upendo', 'Tumaini', 'Neema', 'Jitegemee', 'Umoja', 'Bidii', 'Baraka'])} ${pick(['Women\'s Group', 'Youth Group', 'Self-Help Group', 'Farmers Group'])} — ${ward}`
      : type === 'household' ? `${pick(LAST)} household — ${ward}` : personName(sex);
    const secondProject = chance(0.12) ? pick(enrolTargets) : null;
    beneficiaries.push({
      ...org, registrationType: type, name, caseId: `LCDT-${String(100000 + i)}`,
      phoneNumber: chance(0.7) ? `+2547${int(10000000, 99999999)}` : undefined,
      sex: type === 'group' ? undefined : sex, age: type === 'group' ? undefined : age,
      ageGroup: type === 'group' ? undefined : age < 5 ? 'child_under5' : age < 18 ? 'child_5_17' : age < 25 ? 'youth_18_24' : age < 60 ? 'adult_25_59' : 'elderly_60plus',
      nationality: 'Kenyan', primaryLanguage: pick(['Dholuo', 'Luhya', 'Kiswahili', 'Ekegusii', 'Kiswahili', 'Turkana', 'Giriama']),
      education: pick(['None', 'Primary incomplete', 'Primary complete', 'Secondary', 'Tertiary']),
      householdSize, childrenUnder5: Math.min(householdSize, int(0, 3)), childrenUnder18: Math.min(householdSize, int(0, 5)),
      hasDisability, disabilityType: hasDisability ? pick(['Physical', 'Visual', 'Hearing', 'Intellectual']) : undefined,
      isIdp: chance(0.03), isRefugee: plan.county.name === 'Turkana' && chance(0.3), isFemaleHeadedHousehold: sex === 'female' && chance(0.3),
      isOrphan: age < 18 && chance(0.08), isChronicallyIll: chance(0.06), isElderly: age >= 60,
      vulnerabilityCategories: sample(['food_insecure', 'female_headed', 'disability', 'chronic_illness', 'orphan', 'elderly'], int(0, 2)), vulnerabilityScore: int(0, 10),
      country: 'Kenya', region: plan.county.name, district: ward, village: `${ward} ${pick(['Central', 'East', 'West', 'North', 'South'])}`, location: `${ward}, ${plan.county.name}`,
      geoPoint: { latitude: plan.county.lat + (rand() - 0.5) * 0.3, longitude: plan.county.lng + (rand() - 0.5) * 0.3 }, settlementType: pick(['rural', 'rural', 'peri-urban', 'urban informal']),
      programEnrollments: [
        { projectId: project._id, enrolledAt: registered, status: status === 'closed' ? 'completed' : status === 'transferred' ? 'transferred' : status === 'deceased' ? 'deceased' : 'active', exitedAt: status === 'closed' ? plan.end : undefined },
        ...(secondProject && secondProject._id.toString() !== project._id.toString() ? [{ projectId: secondProject._id, enrolledAt: between(registered, TODAY), status: 'active' }] : []),
      ],
      serviceHistory: Array.from({ length: int(0, 4) }, () => ({
        projectId: project._id, serviceType: pick(['Training', 'Health service', 'Input distribution', 'Cash transfer', 'Counselling', 'Home visit']),
        serviceDate: between(registered, clampDate(plan.end, TODAY)), quantity: 1, unit: 'session',
      })),
      status, groupType: type === 'group' ? 'self_help_group' : type === 'household' ? 'household' : undefined, groupSize: type === 'group' ? int(12, 35) : type === 'household' ? householdSize : undefined,
      caseWorker: nameOf.get(pick(fieldOfficers).toString()), assignedUserId: pick(fieldOfficers), registrationDate: registered, lastContactDate: between(registered, TODAY),
      consentGiven: consent, consentDate: consent ? registered : undefined, consentMethod: pick(['written', 'verbal', 'digital']), tags: [], syncedFromOffline: chance(0.3),
    });
  }
  const insertedBeneficiaries = await insert('Beneficiary', beneficiaries);

  // ── Stakeholder feedback ──────────────────────────────────────────────────
  const feedback = await insert('StakeholderFeedback', Array.from({ length: 320 }, () => {
    const project = pick(liveProjects);
    const plan = planOf.get(project._id.toString())!;
    const sentiment = weighted([['very_positive', 18], ['positive', 34], ['neutral', 22], ['negative', 20], ['very_negative', 6]] as const);
    const content = pick(FEEDBACK[sentiment]);
    const collectedAt = between(plan.start, clampDate(plan.end, TODAY));
    const old = collectedAt < addDays(TODAY, -40);
    const negative = sentiment === 'negative' || sentiment === 'very_negative';
    const status = old ? weighted([['closed', 6], ['actioned', 3], ['reviewed', 1]] as const) : weighted([['received', 5], ['reviewed', 3], ['actioned', 2]] as const);
    const sex = chance(0.6) ? 'female' : 'male';
    const anonymous = chance(negative ? 0.5 : 0.15);
    return {
      ...org, projectId: project._id, collectedByUserId: pick(fieldOfficers), isAnonymous: anonymous,
      respondentName: anonymous ? undefined : personName(sex), respondentSex: sex, respondentAge: int(18, 72), respondentLocation: `${pick(plan.county.wards)}, ${plan.county.name}`,
      title: content.split(/[.—-]/)[0].slice(0, 70), content,
      channel: negative ? pick(['complaint', 'sms', 'suggestion', 'interview']) : pick(['survey', 'focus_group_discussion', 'interview', 'suggestion', 'sms']),
      sentiment, sentimentScore: { very_positive: 95, positive: 75, neutral: 50, negative: 25, very_negative: 5 }[sentiment],
      thematicTags: sample(['service quality', 'timeliness', 'targeting', 'staff conduct', 'infrastructure', 'information sharing', 'safeguarding'], int(1, 2)),
      status, consentToPublish: !negative && chance(0.4), collectedAt,
      responseNotes: ['actioned', 'closed'].includes(status) ? pick(['Field team visited and resolved the issue.', 'Feedback shared with the project manager; action taken.', 'Respondent contacted and thanked; no further action needed.']) : undefined,
      actionsLog: ['actioned', 'closed'].includes(status) ? [{ action: negative ? 'Investigated and resolved' : 'Acknowledged', takenAt: addDays(collectedAt, int(1, 14)), byUserId: pick(managers) }] : [],
    };
  }));

  // ── Impact stories ────────────────────────────────────────────────────────
  await insert('ImpactStory', Array.from({ length: 42 }, () => {
    const project = pick(liveProjects);
    const plan = planOf.get(project._id.toString())!;
    const sex = chance(0.65) ? 'female' : 'male';
    const subject = personName(sex);
    const first = subject.split(' ')[0];
    const ward = pick(plan.county.wards);
    const status = weighted([['published', 6], ['review', 2], ['draft', 2], ['archived', 1]] as const);
    const author = pick(fieldOfficers);
    const indicator = pick((indicatorsByProject.get(project._id.toString()) ?? []).filter((x) => x.level === 'output'));
    const publishedAt = status === 'published' ? between(plan.start, clampDate(plan.end, TODAY)) : undefined;
    return {
      ...org, projectId: project._id, indicatorId: indicator?._id, authorUserId: author,
      title: pick([`${first}'s story: a new start in ${ward}`, `How ${ward} came together`, `"Now my children are in school" — ${first}`, `From struggle to stability in ${ward}`, `${first} leads the change in ${ward}`]),
      narrative: `${subject} lives in ${ward}, ${plan.county.name} County. Before ${project.name} began, daily life was shaped by the very gaps the project set out to close. ` +
        `Through the project, ${first} took part in activities under "${indicator?.title ?? 'the programme'}" and says the difference at home has been tangible. ` +
        `"We were given knowledge, not just things," ${first} explains. Neighbours have since asked to join, and the ward committee is planning how to keep the work going after the project ends.`,
      pullQuote: pick(['We were given knowledge, not just things.', 'I no longer walk three hours for water.', 'My business now pays the school fees.', 'The clinic came to us for the first time.']),
      subjectName: subject, subjectAge: int(19, 68), subjectSex: sex, subjectLocation: `${ward}, ${plan.county.name}`,
      consentObtained: true, isAnonymised: false, tags: sample(['resilience', 'women', 'youth', 'community-led', 'innovation'], int(1, 3)), thematicArea: plan.spec.sector, sdgGoals: plan.spec.sdg,
      status, publishedAt, publishedByUserId: publishedAt ? pick(managers) : undefined, viewCount: status === 'published' ? int(12, 900) : 0, isPubliclyVisible: status === 'published' && chance(0.6),
    };
  }));

  // ── Documents ─────────────────────────────────────────────────────────────
  const documents: Array<Record<string, any>> = [];
  for (const project of projects) {
    for (let i = 0; i < int(3, 7); i++) {
      const category = weighted([['Report', 30], ['Evidence', 25], ['Agreement', 12], ['Financial', 14], ['Training', 10], ['Other', 9]] as const);
      const title = pick(DOC_TITLES[category]);
      documents.push({
        ...org, projectId: project._id, createdByUserId: pick(managers), title: `${title} — ${project.name}${category === 'Report' ? ` (${pick(['Q1', 'Q2', 'Q3', 'Q4'])} ${pick([2025, 2026])})` : ''}`,
        description: `${title} for ${project.name}.`, category, tags: sample([planOf.get(project._id.toString())!.spec.sector, 'donor', 'field', 'final', 'draft', 'signed'], int(1, 3)),
        fileUrl: chance(0.9) ? `https://drive.example.org/lcdt/${slug(project.name)}/${slug(title)}-${i + 1}.pdf` : undefined,
      });
    }
  }
  for (const title of DOC_TITLES.Policy) {
    documents.push({ ...org, createdByUserId: pick(managers), title, description: `Organisation-wide ${title.toLowerCase()}.`, category: 'Policy', tags: ['organisational', 'board-approved'], fileUrl: `https://drive.example.org/lcdt/policies/${slug(title)}.pdf` });
  }
  await insert('Document', documents);

  // ── OKRs and scorecards ───────────────────────────────────────────────────
  const OKR_THEMES: Array<[string, string, Array<[string, number, string]>]> = [
    ['Deliver programme results on time and to standard', 'Keep the portfolio on track against its logframes.', [['Projects rated on-track at quarterly review', 85, '%'], ['Activity reports approved within 7 days', 90, '%'], ['Reporting periods submitted on time', 95, '%']]],
    ['Grow and diversify funding', 'Reduce dependence on the two largest donors.', [['New funding secured', 2500000, 'USD'], ['Proposals submitted', 8, 'proposals'], ['Unrestricted income as a share of total', 12, '%']]],
    ['Strengthen data quality and learning', 'Make evidence usable for decisions.', [['Projects passing the data quality audit', 90, '%'], ['Learning briefs published', 4, 'briefs'], ['Staff trained in data use', 40, 'staff']]],
    ['Be accountable to the people we serve', 'Close the feedback loop quickly.', [['Feedback items closed within 14 days', 85, '%'], ['Communities holding a feedback session', 60, 'communities'], ['Safeguarding concerns responded to within 48 hours', 100, '%']]],
    ['Invest in our people', 'Retain and develop the team.', [['Staff completing a development plan', 95, '%'], ['Voluntary staff turnover', 8, '%'], ['Staff engagement score', 80, '%']]],
  ];
  const outputIndicators = indicators.filter((x) => x.level === 'output' && planOf.get(x.projectId.toString())!.status === 'active');
  const okrDocs: Array<Record<string, any>> = [];
  for (const [year, quarter] of [[2025, 4], [2026, 1], [2026, 2], [2026, 3], [2026, 4]] as const) {
    const quarterEnd = addDays(date(year, quarter * 3 + 1), -1);
    const past = quarterEnd < TODAY;
    for (const [title, description, krs] of OKR_THEMES) {
      const keyResults = krs.map(([krTitle, targetValue, unit]) => {
        const progress = past ? 0.6 + rand() * 0.45 : rand() * 0.5;
        const currentValue = Math.min(targetValue * 1.05, Math.round(targetValue * progress * 100) / 100);
        return {
          _id: new Types.ObjectId(), title: krTitle, targetValue, currentValue, unit, confidence: int(40, 95), indicatorId: null,
          status: currentValue >= targetValue ? 'completed' : past ? pick(['at_risk', 'in_progress']) : progress < 0.05 ? 'not_started' : weighted([['in_progress', 7], ['at_risk', 2]] as const),
        };
      });
      // The delivery OKR tracks a real output indicator, so its figure follows field data.
      if (title.startsWith('Deliver') && outputIndicators.length) {
        const indicator = pick(outputIndicators);
        keyResults.push({ _id: new Types.ObjectId(), title: indicator.title, targetValue: indicator.target, currentValue: 0, unit: indicator.unit, confidence: int(55, 90), indicatorId: indicator._id as any, status: 'in_progress' });
      }
      const pct = Math.round(keyResults.reduce((sum, kr) => sum + Math.min(100, (kr.currentValue / kr.targetValue) * 100), 0) / keyResults.length);
      okrDocs.push({
        ...org, title: `${title} (Q${quarter} ${year})`, description, quarter, year, status: past ? pick(['completed', 'completed', 'archived']) : 'active',
        ownerUserId: pick(managers), keyResults, linkedProjects: title.startsWith('Deliver') ? sample(liveProjects.filter((p) => p.status === 'active'), 3).map((p) => p._id) : [],
        progressPercentage: pct, createdBy: owner._id,
      });
    }
  }
  const okrs = await insert('OKR', okrDocs);
  const currentOkrs = okrs.filter((o) => o.status === 'active');
  const okrFor = (prefix: string) => currentOkrs.filter((o) => o.title.startsWith(prefix)).map((o) => o._id);
  const objective = (title: string, weight: number, target: number, current: number, status: string, linkedOkrIds: Types.ObjectId[] = []) => ({ title, weight, target, current, status, linkedOkrIds });
  await insert('BalancedScorecard', [
    {
      ...org, name: 'FY2025 Organisational Scorecard', description: 'Closed-out scorecard for the 2025 strategy year.', fiscalYear: 2025, status: 'archived', createdBy: owner._id,
      perspectives: [
        { perspective: 'financial', objectives: [objective('Grow annual income', 50, 9000000, 8400000, 'on_track'), objective('Hold indirect cost recovery above 10%', 50, 10, 10.4, 'on_track')] },
        { perspective: 'customer', objectives: [objective('People reached across the portfolio', 60, 400000, 371000, 'on_track'), objective('Feedback closed within 14 days (%)', 40, 85, 71, 'at_risk')] },
        { perspective: 'internal', objectives: [objective('Reports submitted on time (%)', 50, 95, 92, 'on_track'), objective('Projects passing the data quality audit (%)', 50, 90, 78, 'at_risk')] },
        { perspective: 'learning', objectives: [objective('Staff with a development plan (%)', 60, 95, 88, 'on_track'), objective('Learning briefs published', 40, 6, 3, 'off_track')] },
      ],
    },
    {
      ...org, name: 'FY2027 Organisational Scorecard', description: 'Draft scorecard for the first year of the 2027–2030 strategy.', fiscalYear: 2027, status: 'draft', createdBy: owner._id,
      perspectives: [
        { perspective: 'financial', objectives: [objective('Grow annual income', 40, 12000000, 0, 'on_track', okrFor('Grow')), objective('Unrestricted income as a share of total (%)', 30, 15, 0, 'on_track'), objective('Months of operating reserve', 30, 4, 0, 'on_track')] },
        { perspective: 'customer', objectives: [objective('People reached across the portfolio', 50, 520000, 0, 'on_track', okrFor('Deliver')), objective('Community satisfaction with services (%)', 50, 85, 0, 'on_track', okrFor('Be accountable'))] },
        { perspective: 'internal', objectives: [objective('Projects rated on-track at review (%)', 50, 85, 0, 'on_track', okrFor('Deliver')), objective('Data quality audit pass rate (%)', 50, 90, 0, 'on_track', okrFor('Strengthen'))] },
        { perspective: 'learning', objectives: [objective('Staff engagement score (%)', 50, 80, 0, 'on_track', okrFor('Invest')), objective('Staff trained in data use', 50, 60, 0, 'on_track', okrFor('Strengthen'))] },
      ],
    },
  ]);

  const summary = Object.entries(created).map(([name, ids]) => `${name}: ${ids.length}`).join(', ');
  console.log(`Volume seed complete for the demo organisation.\n${summary}`);
  console.log(`Feedback: ${feedback.length}, beneficiaries: ${insertedBeneficiaries.length}, activities: ${insertedActivities.length}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
