import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

function passwordMatch(g: AbstractControl): ValidationErrors | null {
  return g.get('newPassword')?.value === g.get('confirmPassword')?.value
    ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DatePipe],
  templateUrl: './profile.component.html',
  styleUrl:    './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  readonly Math = Math;
  private api  = inject(ApiService);
  auth         = inject(AuthService);
  private fb   = inject(FormBuilder);

  activeTab      = signal<'profile' | 'password' | 'org'>('profile');
  savingProfile  = signal(false);
  savingPassword = signal(false);
  profileMsg     = signal('');
  profileErr     = signal('');
  passwordMsg    = signal('');
  passwordErr    = signal('');
  showCurrent    = signal(false);
  showNew        = signal(false);
  showConfirm    = signal(false);

  user = computed(() => this.auth.user());
  org  = computed(() => this.auth.organization());

  profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword:     ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordMatch });

  ngOnInit() {
    const u = this.user();
    if (u) this.profileForm.patchValue({ name: u.name });
  }

  get initials(): string {
    const n = this.user()?.name ?? '';
    return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      owner: 'Owner', admin: 'Admin', me_officer: 'M&E Officer',
      finance: 'Finance', field_officer: 'Field Officer', viewer: 'Viewer',
    };
    return map[this.user()?.role ?? ''] ?? this.user()?.role ?? '';
  }

  get roleBadge(): string {
    const map: Record<string, string> = {
      owner: 'badge-owner', admin: 'badge-admin', me_officer: 'badge-me',
      finance: 'badge-finance', field_officer: 'badge-field', viewer: 'badge-viewer',
    };
    return map[this.user()?.role ?? ''] ?? 'badge-viewer';
  }

  get planLabel(): string {
    return this.org()?.planName ?? this.org()?.planId ?? 'Free Trial';
  }

  get subscriptionClass(): string {
    const s = this.org()?.subscriptionStatus ?? '';
    if (s === 'active')   return 'sub-active';
    if (s === 'trialing') return 'sub-trial';
    return 'sub-inactive';
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.savingProfile.set(true);
    this.profileMsg.set('');
    this.profileErr.set('');
    const { name } = this.profileForm.value;
    this.api.updateProfile({ name: name! }).subscribe({
      next: () => {
        this.auth.loadProfile().subscribe();
        this.profileMsg.set('Profile updated successfully');
        this.savingProfile.set(false);
        setTimeout(() => this.profileMsg.set(''), 4000);
      },
      error: err => {
        this.profileErr.set(err.error?.message || 'Update failed');
        this.savingProfile.set(false);
      },
    });
  }

  savePassword() {
    if (this.passwordForm.invalid) return;
    this.savingPassword.set(true);
    this.passwordMsg.set('');
    this.passwordErr.set('');
    const { currentPassword, newPassword } = this.passwordForm.value;
    this.api.changePassword(currentPassword!, newPassword!).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.passwordMsg.set('Password changed successfully');
        this.savingPassword.set(false);
        setTimeout(() => this.passwordMsg.set(''), 4000);
      },
      error: err => {
        this.passwordErr.set(err.error?.message || 'Password change failed');
        this.savingPassword.set(false);
      },
    });
  }

  get trialDaysLeft(): number | null {
    const t = this.org()?.trialEndsAt;
    if (!t) return null;
    return Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / 86400000));
  }

  toggleCurrent()  { this.showCurrent.update(v => !v); }
  toggleNew()      { this.showNew.update(v => !v); }
  toggleConfirm()  { this.showConfirm.update(v => !v); }
}