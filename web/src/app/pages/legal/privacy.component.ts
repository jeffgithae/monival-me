import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  templateUrl: './privacy.component.html',
  styleUrl: './legal.component.scss',
})
export class PrivacyComponent {
  readonly updated = 'June 21, 2026';
}