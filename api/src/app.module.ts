import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { TerminusModule } from '@nestjs/terminus';
import { APP_GUARD } from '@nestjs/core';
import { ActivitiesModule } from './activities/activities.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BudgetModule } from './budget/budget.module';
import { BalancedScorecardModule } from './bsc/bsc.module';
import { OKRsModule } from './okrs/okrs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DonorsModule } from './donors/donors.module';
import { PartnersModule } from './partners/partners.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { GrantsModule } from './grants/grants.module';
import { HealthModule } from './health/health.module';
import { RolesGuard } from './common/guards/roles.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { IndicatorsModule } from './indicators/indicators.module';
import { MembersModule } from './members/members.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { Organization, OrganizationSchema } from './organizations/schemas/organization.schema';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { FormsModule } from './forms/forms.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportingModule } from './reporting/reporting.module';
import { AIModule } from './AI/ai.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    // ── Config ───────────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Rate limiting (C1) — tiered limits: burst / medium / sustained ───────
    ThrottlerModule.forRoot([
      { name: 'burst',     ttl:  1_000, limit: 30  }, // 30 req/s  — prevents DDoS
      { name: 'medium',    ttl: 10_000, limit: 150 }, // 150/10s   — normal browsing
      { name: 'sustained', ttl: 60_000, limit: 500 }, // 500/min   — heavy users
    ]),

    // ── Response cache (H1) — Redis if available, in-memory fallback ─────────
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (redisUrl) {
          try {
            const { redisStore } = await import('cache-manager-redis-yet');
            return {
              store: redisStore,
              url: redisUrl,
              ttl: 30_000,
            };
          } catch {
            // Redis package not available — fall through to in-memory
          }
        }
        // In-memory cache (single-instance fallback, fine for staging/dev)
        return { ttl: 30_000, max: 1000 };
      },
    }),

    // ── MongoDB (C4) — connection pool + timeouts ─────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/monival-me'),
        maxPoolSize:               50,   // up from Mongoose default of 5
        minPoolSize:                5,
        socketTimeoutMS:       45_000,
        connectTimeoutMS:      10_000,
        serverSelectionTimeoutMS: 10_000,
        heartbeatFrequencyMS:  10_000,
        retryWrites:            true,
        w:                   'majority',  // write concern — data durability
      }),
    }),

    MongooseModule.forFeature([{ name: Organization.name, schema: OrganizationSchema }]),

    // ── Health checks (M2) ───────────────────────────────────────────────────
    TerminusModule,
    HealthModule,

    // ── Feature modules ───────────────────────────────────────────────────────
    AuthModule,
    AuditModule,
    OrganizationsModule,
    MembersModule,
    BillingModule,
    ProjectsModule,
    IndicatorsModule,
    ActivitiesModule,
    ReportsModule,
    ReportingModule,
    DonorsModule,
    PartnersModule,
    BeneficiariesModule,
    GrantsModule,
    BudgetModule,
    BalancedScorecardModule,
    OKRsModule,
    DashboardModule,
    FormsModule,
    DocumentsModule,
    NotificationsModule,
    AIModule,
    WorkflowsModule,
  ],
  providers: [
    SubscriptionGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}