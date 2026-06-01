export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  ME_OFFICER = 'me_officer',
  FIELD_OFFICER = 'field_officer',
  FINANCE = 'finance',
  VIEWER = 'viewer',
}

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  [OrgRole.OWNER]: 100,
  [OrgRole.ADMIN]: 80,
  [OrgRole.ME_OFFICER]: 60,
  [OrgRole.FINANCE]: 50,
  [OrgRole.FIELD_OFFICER]: 40,
  [OrgRole.VIEWER]: 10,
};

/** Minimum role required for common actions */
export const PERMISSIONS = {
  MANAGE_BILLING: [OrgRole.OWNER],
  MANAGE_TEAM: [OrgRole.OWNER, OrgRole.ADMIN],
  MANAGE_PROJECTS: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
  MANAGE_INDICATORS: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
  LOG_ACTIVITIES: [
    OrgRole.OWNER,
    OrgRole.ADMIN,
    OrgRole.ME_OFFICER,
    OrgRole.FIELD_OFFICER,
  ],
  APPROVE_ACTIVITIES: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
  VIEW_REPORTS: [
    OrgRole.OWNER,
    OrgRole.ADMIN,
    OrgRole.ME_OFFICER,
    OrgRole.FIELD_OFFICER,
    OrgRole.FINANCE,
    OrgRole.VIEWER,
  ],
  MANAGE_DONORS: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE],
  MANAGE_BENEFICIARIES: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE],
  MANAGE_DOCUMENTS: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER],
  VIEW_DOCUMENTS: [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER, OrgRole.VIEWER],
} as const;
