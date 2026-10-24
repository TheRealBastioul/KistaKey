// The ONLY place PrismaClient is constructed. Each instance owns a
// connection pool, so constructing one per call site would exhaust
// Postgres connections. Entry points import `db` and pass it down; modules
// never import this file (they receive DbHandles).
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";
import type { DbHandles } from "./types";

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const writer = createClient(env.DATABASE_URL);
const reader = env.DATABASE_REPLICA_URL ? createClient(env.DATABASE_REPLICA_URL) : writer;

export const db: DbHandles = { writer, reader };

export async function disconnectDb(): Promise<void> {
  await writer.$disconnect();
  if (reader !== writer) await reader.$disconnect();
}
