import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { environment } from '../../environments/environment.prod';

declare var google: any;

@Component({
  selector: 'app-google-auth',
  standalone: true,
  template: `<div #googleBtn></div>`,
  styles: [`
    :host {
      display: block;
      margin-bottom: 1rem;
    }
    div {
      display: flex;
      justify-content: center;
    }
  `]
})
export class GoogleAuthComponent implements OnInit {
  @ViewChild('googleBtn', { static: true }) googleBtn!: ElementRef;
  @Output() onSuccess = new EventEmitter<string>();

  ngOnInit() {
    this.checkAndRender();
  }

  private checkAndRender() {
    if (typeof google !== 'undefined' && google?.accounts) {
      this.renderButton();
    } else {
      setTimeout(() => this.checkAndRender(), 100);
    }
  }

  private renderButton() {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (res: any) => this.handleCredentialResponse(res),
    });

    google.accounts.id.renderButton(
      this.googleBtn.nativeElement,
      { theme: 'outline', size: 'large', width: '100%', shape: 'rectangular' }
    );
  }

  private handleCredentialResponse(response: any) {
    if (response.credential) {
      this.onSuccess.emit(response.credential);
    }
  }
}
