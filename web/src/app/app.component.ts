import { Component, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: block; min-height: 100vh; }'],
})
export class AppComponent {
  constructor() {
    this.applyUpdatesWhenReady();
  }

  /**
   * The service worker serves the previously cached bundle and fetches a new
   * deploy in the background, so without this a returning user keeps seeing
   * the old app until they happen to reload twice. Switch as soon as the new
   * version is ready — immediately if the page is untouched, otherwise on the
   * next navigation so a half-filled form is never thrown away.
   */
  private applyUpdatesWhenReady() {
    const updates = inject(SwUpdate, { optional: true });
    const router = inject(Router);
    if (!updates?.isEnabled) return;

    let touched = false;
    const markTouched = () => (touched = true);
    addEventListener('pointerdown', markTouched, { once: true, capture: true });
    addEventListener('keydown', markTouched, { once: true, capture: true });

    updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), first())
      .subscribe(() => {
        if (!touched) {
          location.reload();
          return;
        }
        router.events
          .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart), first())
          .subscribe(e => location.assign(e.url));
      });
  }
}
