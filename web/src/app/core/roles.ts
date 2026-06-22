export type OrgRole =
  | 'owner'
  | 'admin'
  | 'me_officer'
  | 'field_officer'
  | 'finance'
  | 'viewer';

export function roleLabel(role: OrgRole): string {
  const labels: Record<OrgRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    me_officer: 'M&E Officer',
    field_officer: 'Field Officer',
    finance: 'Finance',
    viewer: 'Viewer',
  };
  return labels[role] ?? role;
}

export function canManageProjects(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer'].includes(role);
}

export function canManageIndicators(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer'].includes(role);
}

export function canManageTeam(role: OrgRole): boolean {
  return ['owner', 'admin'].includes(role);
}

export function canManageBilling(role: OrgRole): boolean {
  return ['owner', 'admin'].includes(role);
}

export function canLogActivities(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer', 'field_officer'].includes(role);
}

export function canApproveActivities(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer'].includes(role);
}

export function canManageOrganization(role: OrgRole): boolean {
  return ['owner', 'admin'].includes(role);
}

export function canManageBeneficiaries(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer', 'finance', 'field_officer'].includes(role);
}

export function canManageGrants(role: OrgRole): boolean {
  return ['owner', 'admin', 'finance'].includes(role);
}

export function canManageDonors(role: OrgRole): boolean {
  return ['owner', 'admin', 'finance', 'me_officer'].includes(role);
}

export function canManageDataCollection(role: OrgRole): boolean {
  return ['owner', 'admin', 'me_officer', 'field_officer'].includes(role);
}