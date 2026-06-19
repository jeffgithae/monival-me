import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 128" fill="none" [style.height]="size" [style.width]="full ? 'auto' : size" [attr.viewBox]="full ? '0 0 400 128' : '0 0 128 128'">
      <g [attr.transform]="full ? 'translate(16, 0)' : null">
        <path d="M24 24h28v14H24zM24 48h40v14H24zM24 72h24v14H24zM24 96h48v14H24z" fill="currentColor"/>
        <path d="M52 24l32 36-18 18 24 22" stroke="currentColor" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="96" cy="104" r="12" stroke="currentColor" stroke-width="10"/>
        <path d="M104 112l8 8" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
      </g>
      @if (full) {
        <text x="160" y="80" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="56" fill="currentColor" letter-spacing="1">EVIDARA</text>
        <text x="164" y="106" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="16" fill="currentColor" letter-spacing="4" opacity="0.7">MONITORING &amp; EVALUATION</text>
      }
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      display: block;
    }
  `]
})
export class LogoComponent {
  @Input() size = '32px';
  @Input() full = false;
}
