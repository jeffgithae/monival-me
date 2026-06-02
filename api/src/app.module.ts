import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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
import { HealthController } from './health/health.controller';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/monival-me'),
      }),
    }),
    MongooseModule.forFeature([{ name: Organization.name, schema: OrganizationSchema }]),
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
  ],
  controllers: [HealthController],
  providers: [
    SubscriptionGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
