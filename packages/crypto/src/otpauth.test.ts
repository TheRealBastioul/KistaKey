import { describe, expect, it } from "vitest";
import { CryptoError } from "./errors";
import { formatOtpAuthUri, parseOtpAuthUri } from "./otpauth";

const SECRET = "JBSWY3DPEHPK3PXP";

describe("parseOtpAuthUri", () => {
  it("reads every parameter", () => {
    expect(
      parseOtpAuthUri(
        `otpauth://totp/ACME%20Co:john.doe@email.com?secret=${SECRET}&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60`,
      ),
    ).toEqual({
      secret: SECRET,
      algorithm: "SHA256",
      digits: 8,
      period: 60,
      issuer: "ACME Co",
      account: "john.doe@email.com",
    });
  });

  it("fills in defaults for missing parameters", () => {
    expect(parseOtpAuthUri(`otpauth://totp/alice?secret=${SECRET}`)).toEqual({
      secret: SECRET,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      issuer: "",
      account: "alice",
    });
  });

  it("takes the issuer from the label when there's no issuer parameter", () => {
    const otp = parseOtpAuthUri(`otpauth://totp/Example:alice%40example.com?secret=${SECRET}`);
    expect(otp).toMatchObject({ issuer: "Example", account: "alice@example.com" });
  });

  it("decodes an encoded colon and spaces in the label", () => {
    const otp = parseOtpAuthUri(`otpauth://totp/Big%20Corp%3A%20bob?secret=${SECRET}`);
    expect(otp).toMatchObject({ issuer: "Big Corp", account: "bob" });
  });

  it("prefers the issuer parameter over the label prefix", () => {
    const otp = parseOtpAuthUri(`otpauth://totp/Old:bob?secret=${SECRET}&issuer=New`);
    expect(otp).toMatchObject({ issuer: "New", account: "bob" });
  });

  it("treats + as a space in query values (form encoding)", () => {
    expect(parseOtpAuthUri(`otpauth://totp/bob?secret=${SECRET}&issuer=Big+Corp`).issuer).toBe(
      "Big Corp",
    );
  });

  it("normalizes a lowercase, padded secret and is case-insensitive about scheme and keys", () => {
    const otp = parseOtpAuthUri(
      "OTPAUTH://TOTP/bob?SECRET=jbswy3dpehpk3pxp%3D%3D&Algorithm=sha512",
    );
    expect(otp).toMatchObject({ secret: SECRET, algorithm: "SHA512" });
  });

  it("accepts an empty label", () => {
    expect(parseOtpAuthUri(`otpauth://totp/?secret=${SECRET}`)).toMatchObject({
      issuer: "",
      account: "",
    });
  });

  it.each([
    ["not a URI", "hello"],
    ["another scheme", `https://example.com/?secret=${SECRET}`],
    ["HOTP", `otpauth://hotp/bob?secret=${SECRET}&counter=1`],
    ["unknown type", `otpauth://motp/bob?secret=${SECRET}`],
    ["no secret", "otpauth://totp/bob?issuer=X"],
    ["empty secret", "otpauth://totp/bob?secret="],
    ["invalid base32", "otpauth://totp/bob?secret=not-base32!"],
    ["bad algorithm", `otpauth://totp/bob?secret=${SECRET}&algorithm=MD5`],
    ["too few digits", `otpauth://totp/bob?secret=${SECRET}&digits=4`],
    ["too many digits", `otpauth://totp/bob?secret=${SECRET}&digits=10`],
    ["non-numeric digits", `otpauth://totp/bob?secret=${SECRET}&digits=six`],
    ["zero period", `otpauth://totp/bob?secret=${SECRET}&period=0`],
    ["broken percent-encoding", `otpauth://totp/bob%ZZ?secret=${SECRET}`],
  ])("rejects %s", (_name, uri) => {
    expect(() => parseOtpAuthUri(uri)).toThrow(CryptoError);
  });
});

describe("formatOtpAuthUri", () => {
  it("round-trips through the parser", () => {
    const otp = {
      secret: SECRET,
      algorithm: "SHA256",
      digits: 7,
      period: 45,
      issuer: "Ex & Co",
      account: "a b@example.com",
    } as const;
    expect(parseOtpAuthUri(formatOtpAuthUri(otp))).toEqual(otp);
  });

  it("omits the issuer when there is none", () => {
    const uri = formatOtpAuthUri({
      secret: SECRET,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      issuer: "",
      account: "bob",
    });
    expect(uri).toBe(`otpauth://totp/bob?secret=${SECRET}&algorithm=SHA1&digits=6&period=30`);
  });
});
