import { Component, OnInit, signal, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { formatHttpError } from '../../../core/http-error';
import { canManageTeam, OrgRole, roleLabel } from '../../../core/roles';
import { ConfirmService } from '../../../shared/confirm.service';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss',
})
export class TeamComponent implements OnInit {
  private confirmSvc = inject(ConfirmService);
  members = signal<
    Array<{ id: string; email: string; name: string; role: OrgRole }>
  >([]);
  pendingInvites = signal<Array<{ _id: string; email: string; role: OrgRole; expiresAt: string }>>([]);
  inviteEmail = '';
  inviteRole: OrgRole = 'me_officer';
  lastInviteLink = signal('');
  error = signal('');
  readonly roleLabel = roleLabel;
  readonly roles: OrgRole[] = [
    'admin',
    'me_officer',
    'field_officer',
    'finance',
    'viewer',
  ];

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {}

  get canManage() {
    return canManageTeam(this.auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.api.members().subscribe((m) => this.members.set(m));
    // Only owners and admins may list invites; for everyone else the section stays hidden.
    if (this.canManage) {
      this.api.pendingInvites().subscribe({
        next: (i) => this.pendingInvites.set(i),
        error: () => this.pendingInvites.set([]),
      });
    }
  }

  /** Guards against a double click sending two invitations. */
  inviting = signal(false);

  invite() {
    if (!this.canManage || this.inviting() || !this.inviteEmail.trim()) return;
    this.error.set('');
    this.inviting.set(true);
    this.api.inviteMember(this.inviteEmail.trim(), this.inviteRole).subscribe({
      next: (res) => {
        this.inviting.set(false);
        this.lastInviteLink.set(
          `${window.location.origin}/accept-invite?token=${res.token}`,
        );
        this.inviteEmail = '';
        this.reload();
      },
      error: (err) => {
        this.inviting.set(false);
        this.error.set(formatHttpError(err, 'Invite failed'));
      },
    });
  }

  changeRole(memberId: string, role: OrgRole) {
    this.api.updateMemberRole(memberId, role).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(formatHttpError(err, 'Update failed')),
    });
  }

  async remove(memberId: string) {
    if (!(await this.confirmSvc.ask({ title: `Remove this team member?`, message: `This action cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    this.api.removeMember(memberId).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(formatHttpError(err, 'Remove failed')),
    });
  }
}
