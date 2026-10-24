// Tenant scoping. Every query on tenant-owned data takes a Tenant and
// spreads tenantWhere(tenant) into its `where`, so a query without a scope
// is visible in review. Org data is keyed by org_id, personal data by
// user_id. The tenant comes from the authenticated session (Phase 1),
// never from request input.

export type Tenant =
  | { readonly kind: "org"; readonly orgId: string }
  | { readonly kind: "user"; readonly userId: string };

export const orgTenant = (orgId: string): Tenant => ({ kind: "org", orgId });
export const userTenant = (userId: string): Tenant => ({ kind: "user", userId });

/** Prisma `where` fragment for a table with an `orgId` or `userId` column. */
export function tenantWhere(tenant: Tenant): { orgId: string } | { userId: string } {
  return tenant.kind === "org" ? { orgId: tenant.orgId } : { userId: tenant.userId };
}
