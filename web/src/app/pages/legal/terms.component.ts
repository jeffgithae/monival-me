import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './terms.component.html',
  styleUrl: './legal.component.scss',
})
export class TermsComponent {
  readonly updated = 'June 21, 2026';
}