import { OrgRole } from '../constants/roles';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: OrgRole;
  memberId: string;
  projectScopeIds?: string[];
  partnerScopeIds?: string[];
  tokenVersion?: number;
  /**
   * Added by JwtStrategy.validate() as an alias for `sub` so legacy code
   * that expects Mongo-style `_id` on the request user keeps working.
   * Always equal to `sub` — prefer `sub` in new code.
   */
  _id?: string;
}