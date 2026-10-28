/** Prisma's "unique constraint failed" (P2002), without importing the generated error class. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
