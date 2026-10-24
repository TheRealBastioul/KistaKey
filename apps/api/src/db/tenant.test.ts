import { describe, expect, it } from "vitest";
import { orgTenant, tenantWhere, userTenant } from "./tenant";

describe("tenantWhere", () => {
  it("scopes org tenants by orgId only", () => {
    expect(tenantWhere(orgTenant("org-1"))).toEqual({ orgId: "org-1" });
  });

  it("scopes personal tenants by userId only", () => {
    expect(tenantWhere(userTenant("user-1"))).toEqual({ userId: "user-1" });
  });
});
