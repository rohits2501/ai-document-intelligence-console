import path from "node:path";

/**
 * Shared data root for upload bytes and the job database (spec 0005 AC-8).
 * Precedence: DATA_DIR env, then serverless `/tmp`, then local `.data`.
 */
export function resolveDataDir(): string {
  const override = process.env.DATA_DIR;
  if (override && override.length > 0) return path.resolve(override);
  if (process.env.VERCEL) return "/tmp";
  return path.join(process.cwd(), ".data");
}
