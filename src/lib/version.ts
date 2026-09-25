import { execSync } from "child_process";

export const PIPELINE_VERSION = "2.5.0";

let cachedCommit: string | null = null;

export function getGitCommit(): string {
  if (cachedCommit) return cachedCommit;
  try {
    cachedCommit = execSync("git rev-parse HEAD", { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return cachedCommit;
  } catch {
    cachedCommit = process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "54bcb0db";
    return cachedCommit;
  }
}
