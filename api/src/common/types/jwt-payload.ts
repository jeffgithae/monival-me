import { OrgRole } from '../constants/roles';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: OrgRole;
  memberId: string;
}
