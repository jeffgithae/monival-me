import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { PricingComponent } from './pages/pricing/pricing.component';
import { ProjectComponent } from './pages/project/project.component';
import { ProjectsListComponent } from './pages/projects/projects-list.component';
import { RegisterComponent } from './pages/register/register.component';
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
import { DataCollectionComponent } from './pages/data-collection/data-collection.component';
import { EnterpriseComponent } from './pages/enterprise/enterprise.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'pricing', component: PricingComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
  {
    path: 'accept-invite',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/accept-invite/accept-invite.component').then(m => m.AcceptInviteComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/legal/terms.component').then(m => m.TermsComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/legal/privacy.component').then(m => m.PrivacyComponent),
  },
  {
    path: 'refund',
    loadComponent: () => import('./pages/legal/refund.component').then(m => m.RefundComponent),
  },
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
      { path: 'workflows', loadComponent: () => import('./pages/workflows/workflows.component').then(m => m.WorkflowsComponent) },
      { path: 'data-collection', component: DataCollectionComponent },
      { path: 'data-reporting',  loadComponent: () => import('./pages/data-reporting/data-reporting.component').then(m => m.DataReportingComponent) },
      { path: 'profile', component: ProfileComponent },
      { path: 'enterprise', component: EnterpriseComponent },
      { path: 'beneficiaries', loadComponent: () => import('./pages/beneficiaries/beneficiaries.component').then(m => m.BeneficiariesComponent) },
      { path: 'feedback', loadComponent: () => import('./pages/feedback/feedback.component').then(m => m.FeedbackComponent) },
      { path: 'roi', loadComponent: () => import('./pages/roi/roi.component').then(m => m.RoiComponent) },
      { path: 'insights', loadComponent: () => import('./pages/insights/insights.component').then(m => m.InsightsComponent) },
      { path: 'map', loadComponent: () => import('./pages/map/map.component').then(m => m.MapComponent) },
    ],
  },
  { path: '**', redirectTo: '/dashboard', pathMatch: 'full' },
];