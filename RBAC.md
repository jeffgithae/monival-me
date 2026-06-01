# RBAC & Permission Model — Monival M&E SaaS

Goals:
- Fine-grained permission model that supports built-in roles and per-tenant custom roles.
- Permissions enforced in backend (guards) and frontend (UI filtering).
- Support role hierarchies and attribute-based checks when necessary.

Permission naming convention
- Use `resource:action` strings, e.g. `projects:read`, `projects:write`, `activities:approve`, `indicators:manage`, `reports:export`, `billing:manage`.
- Use `*` only for internal admin scopes (avoid tenant-level wildcards for security).

Built-in roles (examples)
- owner: All permissions including billing, tenant settings, user management.
- admin: Manage data, users, projects, grants, but limited billing.
- program_manager: Create/manage projects, activities, milestones.
- me_officer: Manage indicators, reporting periods, validate results.
- finance_officer: View/manage budgets, disbursements, financial reports.
- data_collector: Create activities and submit data only (no exports).
- donor: Read-only access to donor portal and selected reports.
- executive: Read-only executive dashboards and exports.

Custom roles
- Tenants can create roles with a set of permission codes.
- Roles stored in `roles` collection per tenant. Users reference `roles: [roleId]` on their user object.

Permission resolution
1. On login, backend builds an authorization claim that includes `tenantId`, `roles`, and expanded `permissions` (union of role permissions + custom direct grants).
2. JWT includes a short-lived permission claim or `sessionId` and server-side cache is used to fetch permissions for enforcement.
3. Backend `PermissionGuard` checks required permission(s) for an endpoint and denies with 403 if missing.

Frontend enforcement
- UI uses feature flagging and permission service to hide menu items, disable buttons, and prevent navigation to guarded routes. Always rely on backend guard as authoritative.

API patterns
- Endpoints accept no `tenantId` param from client; server infers tenant from token or tenant resolver.
- Example: `POST /api/projects` requires `projects:create` permission and the server will set `tenantId` on the created document.

Advanced: Attribute-Based Access Control (ABAC)
- For some actions (e.g., approving activities where only supervisors for a given region can approve), evaluate policies using user attributes (region, programId).
- Implement a policy engine or keep policies simple initially (role + attribute checks in guards).

Auditing & changes
- Changes to roles/permissions are audited in `audit_logs` collection with `tenantId`, `userId`, and diff.

Sample permission map (non-exhaustive)
- users:manage
- billing:manage
- billing:view
- projects:create
- projects:read
- projects:update
- projects:delete
- grants:create
- grants:read
- grants:update
- indicators:manage
- indicators:read
- activities:log
- activities:approve
- activities:read
- reporting:calculate
- reporting:submit
- reporting:approve
- reports:generate
- reports:export
- documents:upload
- documents:download
- workflows:trigger
- workflows:approve
- search:global
- admin:tenant_promote

Implementation notes
- Store permission codes as strings (avoid embedding large structures in JWTs). Cache expanded permission lists server-side keyed by `sessionId`.
- Keep `roles` collection authoritative for role definitions; provide APIs to preview effective permissions for a user.

Next step: generate an OpenAPI skeleton for Auth, Tenancy, Users, Projects, Indicators, Activities, Reporting endpoints with security schemes and required permissions. Put it in `api/openapi/` when ready.
