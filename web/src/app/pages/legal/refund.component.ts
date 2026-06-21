import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-refund',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './refund.component.html',
  styleUrl: './legal.component.scss',
})
export class RefundComponent {
  readonly updated = 'June 21, 2026';
}