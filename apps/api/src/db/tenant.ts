// Tenant scoping. Every query on tenant-owned data takes a Tenant and
// spreads tenantWhere(tenant) into its `where`, so a query without a scope
// is visible in review. Org data is keyed by org_id, personal data by
// user_id. The tenant comes from the authenticated session
// (request.auth.tenant), never from request input.

export type OrgTenant = { readonly kind: "org"; readonly orgId: string };
export type UserTenant = { readonly kind: "user"; readonly userId: string };
export type Tenant = OrgTenant | UserTenant;

export const orgTenant = (orgId: string): OrgTenant => ({ kind: "org", orgId });
export const userTenant = (userId: string): UserTenant => ({ kind: "user", userId });

/**
 * Prisma `where` fragment for a table with an `orgId` or `userId` column.
 * Personal-only tables (sessions, devices, MFA...) take a UserTenant and get
 * `{ userId }`, which type-checks against models without an orgId.
 */
export function tenantWhere(tenant: UserTenant): { userId: string };
export function tenantWhere(tenant: OrgTenant): { orgId: string };
export function tenantWhere(tenant: Tenant): { orgId: string } | { userId: string };
export function tenantWhere(tenant: Tenant): { orgId: string } | { userId: string } {
  return tenant.kind === "org" ? { orgId: tenant.orgId } : { userId: tenant.userId };
}
