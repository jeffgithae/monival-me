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
  /**
   * True when the request authenticated with an Enterprise API key rather than
   * a session token. API keys carry the `viewer` role, so RolesGuard already
   * confines them to read routes; this flag lets code that must never run for a
   * machine caller (e.g. anything issuing a session) check explicitly.
   */
  isApiKey?: boolean;
  /** Scopes granted to the API key, when `isApiKey` is true. */
  scopes?: string[];
}