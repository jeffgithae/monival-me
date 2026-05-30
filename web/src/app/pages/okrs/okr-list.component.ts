import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OKR } from '../../core/models';

@Component({
  selector: 'app-okr-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, FormsModule],
  templateUrl: './okr-list.component.html',
  styleUrl: './okr.scss',
})
export class OKRListComponent implements OnInit {
  okrs = signal<OKR[]>([]);
  loading = signal(true);
  error = signal('');
  isMEOfficer = signal(false);
  selectedQuarter = signal<1 | 2 | 3 | 4>(1);
  selectedYear = signal(new Date().getFullYear());

  newOKRForm = {
    title: '',
    quarter: 1 as 1 | 2 | 3 | 4,
    year: new Date().getFullYear(),
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
    this.loadOKRs();
  }

  loadOKRs() {
    this.loading.set(true);
    this.api
      .getQuarterlyOKRs(this.selectedYear(), this.selectedQuarter())
      .subscribe({
        next: (okrs) => {
          this.okrs.set(okrs);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Failed to load OKRs');
          this.loading.set(false);
          console.error(err);
        },
      });
  }

  createOKR() {
    if (!this.newOKRForm.title) {
      this.error.set('Please enter an objective title');
      return;
    }

    this.api.createOKR({
      ...this.newOKRForm,
      status: 'draft',
      keyResults: [],
    }).subscribe({
      next: () => {
        this.newOKRForm = {
          title: '',
          quarter: this.selectedQuarter(),
          year: this.selectedYear(),
        };
        this.loadOKRs();
      },
      error: () => {
        this.error.set('Failed to create OKR');
      },
    });
  }

  setQuarter(q: 1 | 2 | 3 | 4) {
    this.selectedQuarter.set(q);
    this.loadOKRs();
  }

  getStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      draft: 'status-draft',
      active: 'status-active',
      completed: 'status-completed',
      archived: 'status-archived',
    };
    return statusClasses[status] || '';
  }

  getProgressClass(progress: number): string {
    if (progress >= 80) return 'progress-high';
    if (progress >= 50) return 'progress-medium';
    return 'progress-low';
  }
}