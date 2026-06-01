import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  BalancedScorecard,
  BalancedScorecardObjective,
  BSCPerformanceSummary,
} from '../../core/models';

type Tab = 'financial' | 'customer' | 'internal' | 'learning' | 'performance';

@Component({
  selector: 'app-bsc-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './bsc-detail.component.html',
  styleUrl: './bsc.scss',
})
export class BSCDetailComponent implements OnInit {
  bsc = signal<BalancedScorecard | null>(null);
  performance = signal<BSCPerformanceSummary | null>(null);
  tab = signal<Tab>('financial');
  bscId = '';
  loading = signal(true);
  isMEOfficer = signal(false);

  objectiveForm = {
    title: '',
    description: '',
    weight: 25,
    target: 100,
  };

  objectiveToEdit: { perspectiveIndex: number; objectiveIndex: number } | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isMEOfficer.set(
      ['admin', 'me_officer', 'owner'].includes(this.auth.user()?.role || ''),
    );
  }

  ngOnInit() {
    this.bscId = this.route.snapshot.paramMap.get('id') || '';
    this.loadBSC();
  }

  loadBSC() {
    this.loading.set(true);
    this.api.balancedScorecard(this.bscId).subscribe({
      next: (bsc) => {
        this.bsc.set(bsc);
        this.loadPerformance();
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadPerformance() {
    this.api.getBSCPerformance(this.bscId).subscribe({
      next: (perf) => {
        this.performance.set(perf);
        this.loading.set(false);
      },
    });
  }

  setTab(t: Tab) {
    this.tab.set(t);
  }

  addObjective() {
    if (!this.objectiveForm.title.trim()) {
      return;
    }

    const bsc = this.bsc();
    if (!bsc) return;

    const perspectiveIndex = bsc.perspectives.findIndex((p) => p.perspective === this.tab());
    if (perspectiveIndex === -1) return;

    const objective: BalancedScorecardObjective = {
      title: this.objectiveForm.title,
      description: this.objectiveForm.description,
      weight: this.objectiveForm.weight,
      target: this.objectiveForm.target,
      current: 0,
      status: 'on_track',
    };

    bsc.perspectives[perspectiveIndex].objectives.push(objective);

    this.api.updateBalancedScorecard(this.bscId, bsc).subscribe({
      next: () => {
        this.objectiveForm = {
          title: '',
          description: '',
          weight: 25,
          target: 100,
        };
        this.loadBSC();
      },
    });
  }

  updateObjectiveStatus(perspectiveIndex: number, objectiveIndex: number, status: string) {
    const bsc = this.bsc();
    if (!bsc) return;

    const obj = bsc.perspectives[perspectiveIndex].objectives[objectiveIndex];
    obj.status = status as any;

    this.api
      .updateBSCObjective(this.bscId, perspectiveIndex, objectiveIndex, { status })
      .subscribe({
        next: () => {
          this.loadBSC();
        },
      });
  }

  updateObjectiveProgress(perspectiveIndex: number, objectiveIndex: number, current: number) {
    this.api
      .updateBSCObjective(this.bscId, perspectiveIndex, objectiveIndex, { current })
      .subscribe({
        next: () => {
          this.loadBSC();
        },
      });
  }

  getPerspectiveEmoji(perspective: string): string {
    const emojis: Record<string, string> = {
      financial: '💰',
      customer: '👥',
      internal: '⚙️',
      learning: '🎓',
    };
    return emojis[perspective] || '📊';
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      on_track: 'status-on-track',
      at_risk: 'status-at-risk',
      off_track: 'status-off-track',
    };
    return classes[status] || '';
  }

  getPercentageClass(percentage: number): string {
    if (percentage >= 80) return 'percentage-high';
    if (percentage >= 50) return 'percentage-medium';
    return 'percentage-low';
  }
}
