import { execFile } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

// Read-only invocations: never take the index lock, and keep git's own text in
// the C locale so the parsers see stable output.
const READ_ONLY_GIT_ENV = {
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
} as const;

export interface GitCommandOptions {
  cwd: string;
  /** Exit codes that resolve instead of reject. Defaults to `[0]`. */
  acceptExitCodes?: number[];
}

export interface GitCommandResult {
  stdout: string;
  exitCode: number;
}

export class GitOutputLimitError extends Error {
  constructor() {
    super("Commit history exceeded the git output limit");
    this.name = "GitOutputLimitError";
  }
}

export function runGit(args: string[], options: GitCommandOptions): Promise<GitCommandResult> {
  const acceptExitCodes = options.acceptExitCodes ?? [0];
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      // `core.quotepath=false` makes git emit raw UTF-8 paths instead of octal
      // escapes. `core.fsmonitor=false` prevents repository config from
      // launching a command.
      ["-c", "core.quotepath=false", "-c", "core.fsmonitor=false", ...args],
      {
        cwd: options.cwd,
        env: { ...process.env, ...READ_ONLY_GIT_ENV },
        encoding: "utf8",
        maxBuffer: DEFAULT_MAX_OUTPUT_BYTES,
        timeout: DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, exitCode: 0 });
          return;
        }
        if (error.code === "ENOBUFS") {
          reject(new GitOutputLimitError());
          return;
        }
        if (error.killed) {
          reject(new Error(`git ${args.join(" ")} timed out after ${DEFAULT_TIMEOUT_MS}ms`));
          return;
        }
        if (typeof error.code === "number" && acceptExitCodes.includes(error.code)) {
          resolve({ stdout, exitCode: error.code });
          return;
        }
        const detail = stderr.trim() || error.message;
        reject(new Error(`git ${args.join(" ")} failed (exit ${String(error.code)}): ${detail}`));
      },
    );
  });
}
