// Dev only (the vault page shows the button when import.meta.env.DEV):
// creates a folder and a few sample items through the real API, encrypted
// in the worker like any client write, so the vault pages can be tried
// without typing items into the editor.
import { type ItemDataInput, type ItemType, itemDataSchemaFor } from "@repo/types";
import { vaultApi } from "../api/vault";
import { keyStore } from "../auth/keyStore";
import { cryptoClient } from "../crypto/client";
import { vaultStore } from "./useVault";

const SAMPLES: { type: ItemType; inFolder: boolean; data: ItemDataInput }[] = [
  {
    type: "login",
    inFolder: false,
    data: {
      name: "GitHub",
      favorite: true,
      login: {
        username: "octocat@example.com",
        password: "correct-horse-battery-staple",
        uris: [{ uri: "https://github.com/login" }],
        totp: { secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 },
      },
      passwordHistory: [{ password: "old-password-1", changedAt: "2026-09-01T10:00:00.000Z" }],
    },
  },
  {
    type: "login",
    inFolder: true,
    data: {
      name: "Company email",
      login: {
        username: "me@company.example",
        password: "Tr0ub4dor&3",
        uris: [{ uri: "mail.company.example" }],
      },
      customFields: [
        { id: crypto.randomUUID(), label: "Employee ID", value: "E-1042", hidden: false },
        { id: crypto.randomUUID(), label: "Door PIN", value: "4821", hidden: true },
      ],
    },
  },
  {
    type: "note",
    inFolder: true,
    data: {
      name: "Wi-Fi at the office",
      note: "Network: Office-5G\nPassword: in the drawer, ask Sam.",
    },
  },
  {
    type: "totp",
    inFolder: false,
    data: {
      name: "AWS root",
      login: {
        username: "root@example.com",
        totp: {
          secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        },
      },
    },
  },
  {
    type: "login",
    inFolder: false,
    data: {
      name: "Café Zürich loyalty",
      login: { username: "regular", password: "espresso!", uris: [{ uri: "cafe.example" }] },
    },
  },
];

export async function seedSampleVault(): Promise<void> {
  const key = keyStore.get();
  if (!key) throw new Error("The vault is locked");
  const folderId = crypto.randomUUID();
  await vaultApi.createFolder({
    id: folderId,
    encryptedName: await cryptoClient.call("encryptFolderName", key, folderId, "Work"),
  });
  for (const sample of SAMPLES) {
    const id = crypto.randomUUID();
    const data = itemDataSchemaFor(sample.type).parse(sample.data);
    const encrypted = await cryptoClient.call("encryptItem", key, id, data);
    await vaultApi.createItem({
      id,
      type: sample.type,
      folderId: sample.inFolder ? folderId : null,
      ...encrypted,
    });
  }
  await vaultStore.sync();
}
