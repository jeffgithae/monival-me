import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';

interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  maxProjects: number | null;
  maxUsers: number | null;
  features: string[];
}

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss',
})
export class PricingComponent implements OnInit {
  plans = signal<Plan[]>([]);

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    this.api.plans().subscribe((p) => this.plans.set(p.filter((x) => x.id !== 'trial')));
  }
}
