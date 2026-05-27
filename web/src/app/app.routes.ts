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

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'pricing', component: PricingComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
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
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
