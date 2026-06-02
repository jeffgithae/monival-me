import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CopilotResponse, Project } from '../../core/models';

@Component({
  selector: 'app-ai-copilot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-copilot.component.html',
  styleUrl: './ai-copilot.component.scss',
})
export class AiCopilotComponent implements OnInit {
  private readonly api = inject(ApiService);

  projects = signal<Project[]>([]);
  selectedProjectId = signal('');
  message = signal('What should I prioritize for reporting this week?');
  response = signal<CopilotResponse | null>(null);
  loading = signal(false);
  error = signal('');

  ngOnInit() {
    this.api.projects().subscribe({
      next: (projects) => this.projects.set(projects),
      error: () => this.projects.set([]),
    });
  }

  ask() {
    const message = this.message().trim();
    if (!message) return;

    this.loading.set(true);
    this.error.set('');
    this.api.copilotMessage(message, this.selectedProjectId()).subscribe({
      next: (response) => {
        this.response.set(response);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Copilot could not respond right now.');
        this.loading.set(false);
      },
    });
  }

  usePrompt(prompt: string) {
    this.message.set(prompt);
    this.ask();
  }
}
