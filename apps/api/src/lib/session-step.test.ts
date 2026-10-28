import { describe, expect, it } from "vitest";
import { sessionStep } from "./session-step";

describe("sessionStep (gate order)", () => {
  it("asks an enrolled user for the second factor before anything else", () => {
    expect(sessionStep({ mfaEnabled: true, mfaVerified: false, pendingLegal: 2 })).toBe("mfa");
  });

  it("then pending legal documents", () => {
    expect(sessionStep({ mfaEnabled: true, mfaVerified: true, pendingLegal: 1 })).toBe("legal");
    expect(sessionStep({ mfaEnabled: false, mfaVerified: false, pendingLegal: 1 })).toBe("legal");
  });

  it("then MFA setup for users without a method", () => {
    expect(sessionStep({ mfaEnabled: false, mfaVerified: false, pendingLegal: 0 })).toBe(
      "mfa_setup",
    );
  });

  it("is ready once every gate passed", () => {
    expect(sessionStep({ mfaEnabled: true, mfaVerified: true, pendingLegal: 0 })).toBe("ready");
  });
});
