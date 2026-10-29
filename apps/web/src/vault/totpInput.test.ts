import { describe, expect, it } from "vitest";
import { parseTotpInput, prefillFromTotp } from "./totpInput";

describe("parseTotpInput", () => {
  it("maps an otpauth URI to the stored config plus issuer and account", () => {
    const input = parseTotpInput(
      "otpauth://totp/ACME%20Co:jane@example.com?secret=jbswy3dpehpk3pxp&issuer=ACME+Co&algorithm=SHA256&digits=8&period=60",
    );
    expect(input).toEqual({
      totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA256", digits: 8, period: 60 },
      issuer: "ACME Co",
      account: "jane@example.com",
    });
  });

  it("uses authenticator defaults for missing URI parameters", () => {
    expect(parseTotpInput("otpauth://totp/jane?secret=JBSWY3DPEHPK3PXP").totp).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
  });

  it("accepts a bare secret in groups, with the given settings", () => {
    const input = parseTotpInput(" jbsw y3dp-ehpk 3pxp ", {
      algorithm: "SHA512",
      digits: 7,
      period: 45,
    });
    expect(input).toEqual({
      totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA512", digits: 7, period: 45 },
      issuer: "",
      account: "",
    });
  });

  it("refuses HOTP, empty input and bad secrets with readable messages", () => {
    expect(() => parseTotpInput("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1")).toThrow(
      "HOTP codes aren't supported.",
    );
    expect(() => parseTotpInput("   ")).toThrow(/setup key/);
    expect(() => parseTotpInput("not-base32!")).toThrow(/base32/);
    expect(() => parseTotpInput("ABC")).toThrow(/base32/);
  });
});

describe("prefillFromTotp", () => {
  const input = {
    totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 } as const,
    issuer: "GitHub",
    account: "octocat",
  };

  it("fills only empty fields", () => {
    expect(prefillFromTotp(input, { name: "", username: "" })).toEqual({
      name: "GitHub",
      username: "octocat",
    });
    expect(prefillFromTotp(input, { name: "Work GitHub", username: "me" })).toEqual({
      name: "Work GitHub",
      username: "me",
    });
  });

  it("falls back to the account for the name when there's no issuer", () => {
    expect(prefillFromTotp({ ...input, issuer: "" }, { name: "", username: "" }).name).toBe(
      "octocat",
    );
  });
});
