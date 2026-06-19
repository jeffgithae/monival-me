import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { PricingComponent } from './pages/pricing/pricing.component';
import { ProjectComponent } from './pages/project/project.component';
import { ProjectsListComponent } from './pages/projects/projects-list.component';
import { RegisterComponent } from './pages/register/register.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './pages/reset-password/reset-password.component';
import { BillingComponent } from './pages/settings/billing/billing.component';
import { TeamComponent } from './pages/settings/team/team.component';
import { BudgetListComponent } from './pages/budget/budget-list.component';
import { BudgetDetailComponent } from './pages/budget/budget-detail.component';
import { BSCListComponent } from './pages/balanced-scorecard/bsc-list.component';
import { BSCDetailComponent } from './pages/balanced-scorecard/bsc-detail.component';
import { OKRListComponent } from './pages/okrs/okr-list.component';
import { OKRDetailComponent } from './pages/okrs/okr-detail.component';
import { StrategicOverviewComponent } from './pages/strategic-overview/strategic-overview.component';
import { OKRsComponent } from './pages/okrs/okrs.component';
import { DonorsComponent } from './pages/donors/donor.component';
import { ReportingPeriodsComponent } from './pages/reporting/reporting-period.component';
import { GrantsListComponent } from './pages/grant/grant-list.component';
import { AiCopilotComponent } from './pages/ai-copilot/ai-copilot.component';
import { AuditLogComponent } from './pages/audit/audit-log.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { DonorReportComponent } from './pages/donors/donor-report.component';
import { DocumentsComponent } from './pages/documents/documents.component';
import { WorkplanComponent } from './pages/workplan/workplan.component';
import { WorkflowsComponent } from './pages/workflows/workflows.component';
import { DataCollectionComponent } from './pages/data-collection/data-collection.component';
import { EnterpriseComponent } from './pages/enterprise/enterprise.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'pricing', component: PricingComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, canActivate: [guestGuard] },
  { path: 'reset-password', component: ResetPasswordComponent, canActivate: [guestGuard] },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'projects', component: ProjectsListComponent },
      { path: 'strategic', component: StrategicOverviewComponent },
      { path: 'budget', component: BudgetListComponent },
      { path: 'budget/:id', component: BudgetDetailComponent },
      { path: 'bsc', component: BSCListComponent },
      { path: 'bsc/:id', component: BSCDetailComponent },
      { path: 'okrs', component: OKRsComponent },
      { path: 'okrs/:id', component: OKRDetailComponent },
      { path: 'projects/:id', component: ProjectComponent },
      { path: 'settings/billing', component: BillingComponent },
      { path: 'settings/team', component: TeamComponent },
      { path: 'donors', component: DonorsComponent },
      { path: 'reporting', component: ReportingPeriodsComponent },
      { path: 'grants', component: GrantsListComponent },
      { path: 'ai', component: AiCopilotComponent },
      { path: 'audit', component: AuditLogComponent },
      { path: 'reports/donor', component: DonorReportComponent },
      { path: 'documents', component: DocumentsComponent },
      { path: 'workplan', component: WorkplanComponent },
      { path: 'workflows', component: WorkflowsComponent },
      { path: 'data-collection', component: DataCollectionComponent },
      { path: 'data-reporting',  loadComponent: () => import('./pages/data-reporting/data-reporting.component').then(m => m.DataReportingComponent) },
      { path: 'profile', component: ProfileComponent },
      { path: 'enterprise', component: EnterpriseComponent },
      { path: 'beneficiaries', loadComponent: () => import('./pages/beneficiaries/beneficiaries.component').then(m => m.BeneficiariesComponent) },
    ],
  },
  { path: '**', redirectTo: '/dashboard', pathMatch: 'full' },
];