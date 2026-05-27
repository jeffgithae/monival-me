import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BalancedScorecard } from '../../core/models';

@Component({
  selector: 'app-bsc-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, FormsModule],
  templateUrl: './bsc-list.component.html',
  styleUrl: './bsc.scss',
})
export class BSCListComponent implements OnInit {
  scorecards = signal<BalancedScorecard[]>([]);
  loading = signal(true);
  error = signal('');
  isMEOfficer = signal(false);

  newBSCForm = {
    name: '',
    fiscalYear: new Date().getFullYear(),
  };

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isMEOfficer.set(
      ['admin', 'me_officer', 'owner'].includes(this.auth.user()?.role || ''),
    );
  }

  ngOnInit() {
    this.loadScorecards();
  }

  loadScorecards() {
    this.loading.set(true);
    this.api.balancedScorecards().subscribe({
      next: (scorecards) => {
        this.scorecards.set(scorecards);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load scorecards');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  createScorecard() {
    if (!this.newBSCForm.name) {
      this.error.set('Please enter a scorecard name');
      return;
    }

    this.api.createBalancedScorecard({
      ...this.newBSCForm,
      status: 'draft',
      perspectives: [
        { perspective: 'financial', objectives: [] },
        { perspective: 'customer', objectives: [] },
        { perspective: 'internal', objectives: [] },
        { perspective: 'learning', objectives: [] },
      ],
    }).subscribe({
      next: () => {
        this.newBSCForm = {
          name: '',
          fiscalYear: new Date().getFullYear(),
        };
        this.loadScorecards();
      },
      error: () => {
        this.error.set('Failed to create scorecard');
      },
    });
  }

  getStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      draft: 'status-draft',
      active: 'status-active',
      archived: 'status-archived',
    };
    return statusClasses[status] || '';
  }

  getPerspectiveCount(bsc: BalancedScorecard): number {
    return bsc.perspectives.reduce((count, p) => count + p.objectives.length, 0);
  }
}
