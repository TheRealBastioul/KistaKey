import { describe, expect, it } from "vitest";
import { AuditActionSchema } from "./audit";

describe("AuditActionSchema", () => {
  it.each(["auth.login", "item.fill", "gated.totp_issued", "org.member.role_changed"])(
    "accepts %s",
    (action) => {
      expect(AuditActionSchema.safeParse(action).success).toBe(true);
    },
  );

  it.each(["login", "Auth.Login", "auth.", ".login", "auth login", "auth.login;drop"])(
    "rejects %s",
    (action) => {
      expect(AuditActionSchema.safeParse(action).success).toBe(false);
    },
  );
});
