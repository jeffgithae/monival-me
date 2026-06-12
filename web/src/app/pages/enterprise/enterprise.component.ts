import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NetworkAcceptedPipe } from '../../shared/network-accepted.pipe';
import {
  ApiKey, ApiKeyCreatedResponse, SsoConfig, BrandingConfig,
  OrgNetwork, NetworkRollupResult, UpsertSsoConfigDto, UpdateBrandingDto,
} from '../../core/models';

type Tab = 'api-keys' | 'sso' | 'branding' | 'networks';

@Component({
  selector: 'app-enterprise',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NetworkAcceptedPipe, DatePipe, DecimalPipe],
  templateUrl: './enterprise.component.html',
  styleUrl: './enterprise.component.scss',
})
export class EnterpriseComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  activeTab = signal<Tab>('api-keys');
  saving    = signal(false);
  error     = signal('');
  success   = signal('');

  // ── API Keys ──────────────────────────────────────────────────────────────
  apiKeys        = signal<ApiKey[]>([]);
  newKeyName     = signal('');
  newKeyScopes   = signal('');
  newKeyExpiry   = signal('');
  newKeyIps      = signal('');
  newKeyResult   = signal<ApiKeyCreatedResponse | null>(null);
  loadingKeys    = signal(false);
  revokingKeyId  = signal('');

  // ── SSO ───────────────────────────────────────────────────────────────────
  ssoConfig     = signal<SsoConfig | null>(null);
  ssoForm       = signal<UpsertSsoConfigDto>({ protocol: 'saml', isEnabled: false });
  loadingSso    = signal(false);
  ssoTab        = signal<'saml' | 'oidc'>('saml');

  // ── Branding ──────────────────────────────────────────────────────────────
  branding      = signal<BrandingConfig | null>(null);
  brandingForm  = signal<UpdateBrandingDto>({});
  loadingBrand  = signal(false);
  domainVerInfo = signal<{ token: string; txtRecord: string; domain: string } | null>(null);
  colorPreview  = signal('#4f46e5');

  // ── Networks ──────────────────────────────────────────────────────────────
  networks      = signal<OrgNetwork[]>([]);
  loadingNets   = signal(false);
  newNetName    = signal('');
  newNetDesc    = signal('');
  activeNetwork = signal<OrgNetwork | null>(null);
  rollup        = signal<NetworkRollupResult | null>(null);
  loadingRollup = signal(false);
  inviteOrgId   = signal('');
  inviteRole    = signal<'implementing' | 'lead' | 'observer'>('implementing');
  inviteLabel   = signal('');

  orgId = computed(() => this.auth.organization()?.id ?? '');

  ngOnInit() {
    this.loadTab('api-keys');
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    this.error.set('');
    this.success.set('');
    this.loadTab(tab);
  }

  private loadTab(tab: Tab) {
    if (tab === 'api-keys') this.loadApiKeys();
    else if (tab === 'sso') this.loadSso();
    else if (tab === 'branding') this.loadBranding();
    else if (tab === 'networks') this.loadNetworks();
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  loadApiKeys() {
    this.loadingKeys.set(true);
    this.api.apiKeys().subscribe({
      next: keys => { this.apiKeys.set(keys); this.loadingKeys.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed to load API keys'); this.loadingKeys.set(false); },
    });
  }

  createApiKey() {
    if (!this.newKeyName().trim()) return;
    this.saving.set(true);
    this.newKeyResult.set(null);
    this.api.createApiKey({
      name: this.newKeyName().trim(),
      scopes: this.newKeyScopes() ? this.newKeyScopes().split(',').map(s => s.trim()) : [],
      allowedIps: this.newKeyIps() ? this.newKeyIps().split(',').map(s => s.trim()) : [],
      expiresAt: this.newKeyExpiry() || undefined,
    }).subscribe({
      next: result => {
        this.newKeyResult.set(result);
        this.apiKeys.update(keys => [result.record, ...keys]);
        this.newKeyName.set('');
        this.newKeyScopes.set('');
        this.newKeyExpiry.set('');
        this.newKeyIps.set('');
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Failed to create API key'); this.saving.set(false); },
    });
  }

  revokeKey(id: string) {
    if (!confirm('Revoke this API key? Any integrations using it will immediately stop working.')) return;
    this.revokingKeyId.set(id);
    this.api.revokeApiKey(id).subscribe({
      next: () => {
        this.apiKeys.update(keys => keys.filter(k => k._id !== id));
        this.revokingKeyId.set('');
      },
      error: err => { this.error.set(err.error?.message || 'Revoke failed'); this.revokingKeyId.set(''); },
    });
  }

  copyKey(key: string) {
    navigator.clipboard.writeText(key);
    this.success.set('API key copied to clipboard.');
    setTimeout(() => this.success.set(''), 3000);
  }

  // ── SSO ───────────────────────────────────────────────────────────────────

  loadSso() {
    this.loadingSso.set(true);
    this.api.ssoConfig().subscribe({
      next: cfg => {
        this.ssoConfig.set(cfg);
        if (cfg) {
          this.ssoForm.set({ ...cfg });
          this.ssoTab.set(cfg.protocol);
        }
        this.loadingSso.set(false);
      },
      error: () => this.loadingSso.set(false),
    });
  }

  saveSso() {
    this.saving.set(true);
    this.api.upsertSsoConfig(this.ssoForm()).subscribe({
      next: cfg => {
        this.ssoConfig.set(cfg);
        this.success.set('SSO configuration saved.');
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'SSO save failed'); this.saving.set(false); },
    });
  }

  toggleEnforcement(enforce: boolean) {
    this.saving.set(true);
    this.api.toggleSsoEnforcement(enforce).subscribe({
      next: cfg => {
        this.ssoConfig.set(cfg);
        this.success.set(enforce ? 'SSO enforcement enabled. Password login is now blocked.' : 'SSO enforcement disabled.');
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Failed to toggle enforcement'); this.saving.set(false); },
    });
  }

  updateSsoForm(field: string, value: unknown) {
    this.ssoForm.update(f => ({ ...f, [field]: value }));
  }

  updateAllowedDomains(event: string | null | undefined) {
    const domains = event ? event.split(',').map(s => s.trim()).filter(Boolean) : [];
    this.updateSsoForm('allowedDomains', domains);
  }

  samlMetadataUrl = computed(() => this.api.samlSpMetadataUrl(this.orgId()));

  // ── Branding ──────────────────────────────────────────────────────────────

  loadBranding() {
    this.loadingBrand.set(true);
    this.api.brandingConfig().subscribe({
      next: b => {
        this.branding.set(b);
        if (b) {
          this.brandingForm.set({
            appName: b.appName,
            logoUrl: b.logoUrl,
            faviconUrl: b.faviconUrl,
            primaryColor: b.primaryColor,
            accentColor: b.accentColor,
            customDomain: b.customDomain,
            reportFooterText: b.reportFooterText,
            hidePoweredBy: b.hidePoweredBy,
            defaultTheme: b.defaultTheme,
            supportEmail: b.supportEmail,
            supportUrl: b.supportUrl,
          });
          this.colorPreview.set(b.primaryColor ?? '#4f46e5');
        }
        this.loadingBrand.set(false);
      },
      error: () => this.loadingBrand.set(false),
    });
  }

  saveBranding() {
    this.saving.set(true);
    this.api.updateBranding(this.brandingForm()).subscribe({
      next: b => {
        this.branding.set(b);
        this.success.set('Branding saved.');
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Branding save failed'); this.saving.set(false); },
    });
  }

  updateBrandingForm(field: string, value: unknown) {
    this.brandingForm.update(f => ({ ...f, [field]: value }));
    if (field === 'primaryColor') this.colorPreview.set(value as string);
  }

  initiateDomainVerification() {
    this.saving.set(true);
    this.api.initiateDomainVerification().subscribe({
      next: info => { this.domainVerInfo.set(info); this.saving.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed'); this.saving.set(false); },
    });
  }

  verifyDomain() {
    this.saving.set(true);
    this.api.verifyDomain().subscribe({
      next: result => {
        this.success.set(result.message);
        if (result.verified) this.loadBranding();
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Verification failed'); this.saving.set(false); },
    });
  }

  copyTxtRecord() {
    const info = this.domainVerInfo();
    if (info) {
      navigator.clipboard.writeText(info.txtRecord);
      this.success.set('DNS record copied to clipboard.');
      setTimeout(() => this.success.set(''), 3000);
    }
  }

  // ── Networks ──────────────────────────────────────────────────────────────

  loadNetworks() {
    this.loadingNets.set(true);
    this.api.networks().subscribe({
      next: nets => { this.networks.set(nets); this.loadingNets.set(false); },
      error: () => this.loadingNets.set(false),
    });
  }

  createNetwork() {
    if (!this.newNetName().trim()) return;
    this.saving.set(true);
    this.api.createNetwork({ name: this.newNetName(), description: this.newNetDesc() }).subscribe({
      next: net => {
        this.networks.update(n => [net, ...n]);
        this.newNetName.set('');
        this.newNetDesc.set('');
        this.saving.set(false);
        this.success.set('Network created.');
      },
      error: err => { this.error.set(err.error?.message || 'Create failed'); this.saving.set(false); },
    });
  }

  openNetwork(net: OrgNetwork) {
    this.activeNetwork.set(net);
    this.rollup.set(null);
  }

  loadRollup() {
    const net = this.activeNetwork();
    if (!net) return;
    this.loadingRollup.set(true);
    this.api.networkRollup(net._id).subscribe({
      next: r => { this.rollup.set(r); this.loadingRollup.set(false); },
      error: err => { this.error.set(err.error?.message || 'Rollup failed'); this.loadingRollup.set(false); },
    });
  }

  inviteMember() {
    const net = this.activeNetwork();
    if (!net || !this.inviteOrgId().trim()) return;
    this.saving.set(true);
    this.api.inviteNetworkMember(net._id, {
      organizationId: this.inviteOrgId().trim(),
      role: this.inviteRole(),
      label: this.inviteLabel() || undefined,
    }).subscribe({
      next: updated => {
        this.activeNetwork.set(updated);
        this.inviteOrgId.set('');
        this.inviteLabel.set('');
        this.saving.set(false);
        this.success.set('Invitation sent.');
      },
      error: err => { this.error.set(err.error?.message || 'Invite failed'); this.saving.set(false); },
    });
  }

  removeMember(orgId: string) {
    const net = this.activeNetwork();
    if (!net) return;
    if (!confirm('Remove this member from the network?')) return;
    this.api.removeNetworkMember(net._id, orgId).subscribe({
      next: updated => this.activeNetwork.set(updated),
      error: err => this.error.set(err.error?.message || 'Remove failed'),
    });
  }

  memberStatusColor(status: string): string {
    return { accepted: '#10b981', pending: '#f59e0b', declined: '#ef4444', revoked: '#64748b' }[status] ?? '#64748b';
  }
}