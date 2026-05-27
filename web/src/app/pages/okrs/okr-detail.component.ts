import { CommonModule, DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OKR, OKRKeyResult, OKRProgress } from '../../core/models';

@Component({
  selector: 'app-okr-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, SlicePipe, FormsModule],
  templateUrl: './okr-detail.component.html',
  styleUrl: './okr.scss',
})
export class OKRDetailComponent implements OnInit {
  okr = signal<OKR | null>(null);
  progress = signal<OKRProgress | null>(null);
  okrId = '';
  loading = signal(true);
  isMEOfficer = signal(false);

  krForm = {
    title: '',
    unit: '',
    targetValue: 0,
    confidence: 80,
  };

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
    this.okrId = this.route.snapshot.paramMap.get('id') || '';
    this.loadOKR();
  }

  loadOKR() {
    this.loading.set(true);
    this.api.okr(this.okrId).subscribe({
      next: (okr) => {
        this.okr.set(okr);
        this.loadProgress();
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadProgress() {
    this.api.getOKRProgress(this.okrId).subscribe({
      next: (prog) => {
        this.progress.set(prog);
        this.loading.set(false);
      },
    });
  }

  addKeyResult() {
    if (!this.krForm.title || this.krForm.targetValue <= 0) {
      return;
    }

    const okr = this.okr();
    if (!okr) return;

    const kr: OKRKeyResult = {
      title: this.krForm.title,
      unit: this.krForm.unit,
      targetValue: this.krForm.targetValue,
      currentValue: 0,
      confidence: this.krForm.confidence,
      status: 'not_started',
    };

    okr.keyResults.push(kr);

    this.api.updateOKR(this.okrId, { keyResults: okr.keyResults }).subscribe({
      next: () => {
        this.krForm = {
          title: '',
          unit: '',
          targetValue: 0,
          confidence: 80,
        };
        this.loadOKR();
      },
    });
  }

  updateKeyResultValue(krIndex: number, currentValue: number) {
    this.api
      .updateOKRKeyResult(this.okrId, krIndex, { currentValue })
      .subscribe({
        next: () => {
          this.loadOKR();
        },
      });
  }

  updateKeyResultStatus(krIndex: number, status: string) {
    this.api
      .updateOKRKeyResult(this.okrId, krIndex, { status: status as any })
      .subscribe({
        next: () => {
          this.loadOKR();
        },
      });
  }

  updateKeyResultConfidence(krIndex: number, confidence: number) {
    this.api.updateOKRKeyResult(this.okrId, krIndex, { confidence }).subscribe({
      next: () => {
        this.loadOKR();
      },
    });
  }

  updateOKRStatus(status: string) {
    this.api.updateOKR(this.okrId, { status: status as any }).subscribe({
      next: () => {
        this.loadOKR();
      },
    });
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      not_started: 'status-not-started',
      in_progress: 'status-in-progress',
      at_risk: 'status-at-risk',
      completed: 'status-completed',
    };
    return classes[status] || '';
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return 'confidence-high';
    if (confidence >= 60) return 'confidence-medium';
    return 'confidence-low';
  }

  getProgressClass(progress: number): string {
    if (progress >= 80) return 'progress-high';
    if (progress >= 50) return 'progress-medium';
    return 'progress-low';
  }
}
