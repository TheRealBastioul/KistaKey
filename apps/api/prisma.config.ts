// Prisma CLI config (generate / migrate / studio). The app runtime connects
// through src/db/client.ts instead; this file is CLI-only.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` doesn't need a database, so don't fail when unset.
    url: process.env.DATABASE_URL ?? "",
  },
});
