import type { PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;

/**
 * What repositories receive. `writer` = primary (all writes, and reads that
 * must see their own writes). `reader` = replica-safe reads; it's the same
 * client as `writer` until DATABASE_REPLICA_URL is set.
 */
export interface DbHandles {
  writer: Db;
  reader: Db;
}
