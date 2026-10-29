import { type ItemDataInput, ItemDataSchema, type ItemType } from "@repo/types";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportCsv, exportDocument, parseExportDocument, selectForExport } from "../export";
import type { FolderEntry, VaultEntry } from "../store";
import { parseCsv, toCsv } from "./csv";
import { ImportFormatError, parseImportFile, planImport, summarize } from "./index";

const SECRET = "JBSWY3DPEHPK3PXP";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas, newlines, CRLF, BOM and unicode", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\nümlaut,😀,\n\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
      ["ümlaut", "😀", ""],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [
      ["name", "value"],
      ['a "quoted", value', " padded "],
      ["multi\nline", "plain"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("generic CSV", () => {
  it("maps common column names and infers notes", () => {
    const csv = [
      "Title,URL,Username,Password,Notes,Folder,TOTP",
      `GitHub,https://github.com,octo,pw1,,Dev,${SECRET}`,
      "Just a note,,,,remember this,,",
      ",https://www.example.com/login,me,pw2,,,",
    ].join("\n");
    const parsed = parseImportFile("generic_csv", csv);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.items.map((i) => [i.type, i.data.name, i.folder])).toEqual([
      ["login", "GitHub", "Dev"],
      ["note", "Just a note", null],
      ["login", "example.com", null], // name from the site
    ]);
    expect(parsed.items[0]?.data.login?.totp?.secret).toBe(SECRET);
    expect(parsed.items[1]?.data.note).toBe("remember this");
  });

  it("refuses a file without any recognizable column", () => {
    expect(() => parseImportFile("generic_csv", "foo,bar\n1,2")).toThrow(ImportFormatError);
  });

  it("keeps an invalid TOTP as a hidden field, with a warning", () => {
    const parsed = parseImportFile("generic_csv", "name,password,totp\nX,pw,not-base32!");
    expect(parsed.items[0]?.data.customFields).toMatchObject([
      { label: "TOTP", value: "not-base32!", hidden: true },
    ]);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("skips rows over the limits, with the row number", () => {
    const parsed = parseImportFile("generic_csv", `name,password\nOk,pw\nBig,${"x".repeat(5000)}`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.skipped).toMatchObject([{ where: "Row 3" }]);
  });
});

describe("Bitwarden", () => {
  it("reads the JSON export: folders, fields, TOTP, history, cards as notes", () => {
    const json = JSON.stringify({
      encrypted: false,
      folders: [{ id: "f1", name: "Work" }],
      items: [
        {
          type: 1,
          name: "Mail",
          folderId: "f1",
          favorite: true,
          notes: "n",
          fields: [
            { name: "PIN", value: "1234", type: 1 },
            { name: "Linked", value: null, type: 3 },
          ],
          login: {
            username: "me",
            password: "pw",
            totp: `otpauth://totp/Mail:me?secret=${SECRET}&issuer=Mail`,
            uris: [{ uri: "https://mail.example" }],
          },
          passwordHistory: [{ password: "old", lastUsedDate: "2025-01-01T00:00:00.000Z" }],
        },
        { type: 2, name: "Secret note", notes: "body", secureNote: { type: 0 } },
        { type: 3, name: "Visa", card: { number: "4111", code: "123", brand: "Visa" } },
        { type: 5, name: "SSH key" },
      ],
    });
    const parsed = parseImportFile("bitwarden_json", json);
    expect(parsed.skipped).toMatchObject([{ message: "Unsupported item type." }]);
    const [mail, note, card] = parsed.items;
    expect(mail).toMatchObject({ type: "login", folder: "Work" });
    expect(mail?.data).toMatchObject({
      name: "Mail",
      favorite: true,
      note: "n",
      login: { username: "me", password: "pw", uris: [{ uri: "https://mail.example" }] },
      customFields: [{ label: "PIN", value: "1234", hidden: true }],
      passwordHistory: [{ password: "old", changedAt: "2025-01-01T00:00:00.000Z" }],
    });
    expect(mail?.data.login?.totp?.secret).toBe(SECRET);
    expect(note).toMatchObject({ type: "note", data: { note: "body" } });
    expect(card?.type).toBe("note");
    expect(card?.data.customFields.map((f) => [f.label, f.hidden])).toEqual([
      ["Brand", false],
      ["Number", true],
      ["Security code", true],
    ]);
  });

  it("refuses an encrypted Bitwarden export", () => {
    expect(() =>
      parseImportFile("bitwarden_json", JSON.stringify({ encrypted: true, items: [] })),
    ).toThrow(/encrypted/);
  });

  it("reads the CSV export with several URIs and fields", () => {
    const csv = toCsv([
      [
        "folder",
        "favorite",
        "type",
        "name",
        "notes",
        "fields",
        "reprompt",
        "login_uri",
        "login_username",
        "login_password",
        "login_totp",
      ],
      [
        "Work",
        "1",
        "login",
        "Mail",
        "",
        "a: 1\nb: two",
        "0",
        "https://a.example,https://b.example",
        "me",
        "pw",
        SECRET,
      ],
      ["", "", "note", "Note", "text", "", "0", "", "", "", ""],
    ]);
    const parsed = parseImportFile("bitwarden_csv", csv);
    expect(parsed.items[0]?.data.login?.uris).toEqual([
      { uri: "https://a.example" },
      { uri: "https://b.example" },
    ]);
    expect(parsed.items[0]?.data.customFields.map((f) => [f.label, f.value])).toEqual([
      ["a", "1"],
      ["b", "two"],
    ]);
    expect(parsed.items[0]?.data.favorite).toBe(true);
    expect(parsed.items[1]).toMatchObject({ type: "note", data: { note: "text" } });
  });
});

describe("1Password", () => {
  it("reads 1PUX: login fields, sections, TOTP, archived skipped, vaults as folders", () => {
    const exportData = {
      accounts: [
        {
          attrs: { name: "Me" },
          vaults: [
            {
              attrs: { name: "Private" },
              items: [
                {
                  uuid: "1",
                  favIndex: 1,
                  state: "active",
                  categoryUuid: "001",
                  overview: { title: "Shop", url: "https://shop.example", urls: [] },
                  details: {
                    loginFields: [
                      { designation: "username", value: "me" },
                      { designation: "password", value: "pw" },
                    ],
                    notesPlain: "hello",
                    sections: [
                      {
                        title: "",
                        fields: [
                          { title: "one-time password", value: { totp: SECRET } },
                          { title: "PIN", value: { concealed: "9999" } },
                          { title: "Email", value: { email: { email_address: "a@b.c" } } },
                        ],
                      },
                    ],
                    passwordHistory: [{ value: "older", time: 1700000000 }],
                  },
                },
                {
                  uuid: "2",
                  state: "archived",
                  categoryUuid: "001",
                  overview: { title: "Old" },
                  details: {},
                },
              ],
            },
            {
              attrs: { name: "Shared" },
              items: [
                {
                  uuid: "3",
                  state: "active",
                  categoryUuid: "003",
                  overview: { title: "Wifi note" },
                  details: { notesPlain: "pass: x" },
                },
              ],
            },
          ],
        },
      ],
    };
    const zip = zipSync({ "export.data": strToU8(JSON.stringify(exportData)) });
    const parsed = parseImportFile("onepassword_1pux", zip);
    expect(parsed.skipped).toMatchObject([{ message: "Archived in 1Password." }]);
    const [shop, wifi] = parsed.items;
    expect(shop).toMatchObject({ type: "login", folder: "Private" });
    expect(shop?.data).toMatchObject({
      name: "Shop",
      favorite: true,
      note: "hello",
      login: { username: "me", password: "pw", uris: [{ uri: "https://shop.example" }] },
    });
    expect(shop?.data.login?.totp?.secret).toBe(SECRET);
    expect(shop?.data.customFields.map((f) => [f.label, f.value, f.hidden])).toEqual([
      ["PIN", "9999", true],
      ["Email", "a@b.c", false],
    ]);
    expect(shop?.data.passwordHistory).toEqual([
      { password: "older", changedAt: new Date(1700000000 * 1000).toISOString() },
    ]);
    expect(wifi).toMatchObject({ type: "note", folder: "Shared", data: { note: "pass: x" } });
  });

  it("refuses a file that isn't a zip", () => {
    expect(() => parseImportFile("onepassword_1pux", strToU8("nope"))).toThrow(ImportFormatError);
  });

  it("reads the CSV export", () => {
    const csv = [
      "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes",
      `Bank,https://bank.example,me,pw,otpauth://totp/Bank?secret=${SECRET},true,false,Finance;Home,`,
      "Gone,,,x,,false,true,,",
    ].join("\n");
    const parsed = parseImportFile("onepassword_csv", csv);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ folder: "Finance", data: { favorite: true } });
    expect(parsed.items[0]?.data.login?.totp?.secret).toBe(SECRET);
  });
});

describe("LastPass CSV", () => {
  it("reads logins, secure notes (url http://sn) and nested groups", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://site.example,me,pw,,some notes,Site,Social\\Friends,1",
      'http://sn,,,,"NoteType:Server\nHost:x",Server,,0',
    ].join("\n");
    const parsed = parseImportFile("lastpass_csv", csv);
    expect(parsed.items.map((i) => [i.type, i.data.name, i.folder])).toEqual([
      ["login", "Site", "Social/Friends"],
      ["note", "Server", null],
    ]);
    expect(parsed.items[1]?.data.note).toBe("NoteType:Server\nHost:x");
  });
});

// --- export → import round trip ---------------------------------------------

const T = "2026-10-01T00:00:00.000Z";

function entry(id: string, type: ItemType, input: ItemDataInput, folderId: string | null) {
  const data = ItemDataSchema.parse(input);
  return {
    id,
    type,
    folderId,
    revision: 1,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    data,
    name: data.name,
    search: "",
    encrypted: {} as VaultEntry["encrypted"],
  } satisfies VaultEntry;
}

const FOLDERS: FolderEntry[] = [{ id: "f1", name: "Work", revision: 1 }];
const VAULT: VaultEntry[] = [
  entry(
    "00000000-0000-4000-8000-000000000001",
    "login",
    {
      name: 'Mail, "work"',
      favorite: true,
      login: {
        username: "me",
        password: 'p,"w\n2',
        uris: [{ uri: "https://mail.example" }, { uri: "https://webmail.example" }],
        totp: { secret: SECRET, algorithm: "SHA1", digits: 6, period: 30 },
      },
      note: "multi\nline ünïcode",
      customFields: [
        { id: "00000000-0000-4000-8000-0000000000aa", label: "PIN", value: "1", hidden: false },
      ],
    },
    "f1",
  ),
  entry("00000000-0000-4000-8000-000000000002", "note", { name: "Note", note: "body" }, null),
  {
    ...entry("00000000-0000-4000-8000-000000000003", "note", { name: "Gone", note: "" }, null),
    deletedAt: T,
  },
];

describe("export → import round trip", () => {
  it("encrypted-export document keeps everything", () => {
    const selection = selectForExport(VAULT, FOLDERS);
    expect(selection.items).toHaveLength(2); // trash excluded
    const parsed = parseExportDocument(JSON.stringify(exportDocument(selection)));
    expect(parsed.skipped).toEqual([]);
    expect(parsed.items.map((i) => ({ type: i.type, folder: i.folder, data: i.data }))).toEqual([
      { type: "login", folder: "Work", data: VAULT[0]?.data },
      { type: "note", folder: null, data: VAULT[1]?.data },
    ]);
  });

  it("CSV re-imports through the Bitwarden CSV reader", () => {
    const csv = exportCsv(selectForExport(VAULT, FOLDERS));
    const parsed = parseImportFile("bitwarden_csv", csv);
    expect(parsed.skipped).toEqual([]);
    const [mail, note] = parsed.items;
    const original = VAULT[0]?.data;
    expect(mail?.folder).toBe("Work");
    expect(mail?.data).toMatchObject({
      name: original?.name,
      favorite: true,
      note: original?.note,
      login: {
        username: "me",
        password: original?.login?.password,
        uris: original?.login?.uris,
      },
      customFields: [{ label: "PIN", value: "1" }],
    });
    expect(mail?.data.login?.totp).toEqual(original?.login?.totp);
    expect(note).toMatchObject({ type: "note", data: { name: "Note", note: "body" } });
  });
});

describe("planImport", () => {
  it("reuses existing folders by name and creates each new one in its first item's batch", () => {
    let n = 0;
    const id = () => `id-${++n}`;
    const items = Array.from({ length: 1001 }, (_, i) => ({
      type: "note" as const,
      folder: i === 0 ? "work" : i === 1000 ? "Later" : i % 2 ? "Personal" : null,
      data: ItemDataSchema.parse({ name: `N${i}`, note: "" }),
    }));
    const chunks = planImport(items, FOLDERS, id);
    expect(chunks.map((c) => c.items.length)).toEqual([500, 500, 1]);
    // "work" matches the existing "Work" folder: not created again.
    expect(chunks[0]?.items[0]?.folderId).toBe("f1");
    expect(chunks[0]?.folders.map((f) => f.name)).toEqual(["Personal"]);
    expect(chunks[1]?.folders).toEqual([]);
    expect(chunks[2]?.folders.map((f) => f.name)).toEqual(["Later"]);
    expect(summarize({ items, skipped: [], warnings: [] })).toMatchObject({
      total: 1001,
      folders: 3,
    });
  });
});
