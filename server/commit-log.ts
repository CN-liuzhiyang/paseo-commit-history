import type {
  CommitLogEntry,
  CommitLogPage,
  CommitLogRef,
  CommitLogScope,
} from "../shared/commit-log";
import { runGit } from "./git";

/** Refs read from `for-each-ref` before the "all" scope stops looking. */
const COMMIT_LOG_REF_SCAN_LIMIT = 500;
/** Unique commit OIDs we put on the `git log` argv (~41 bytes each). */
const COMMIT_LOG_MAX_PINNED_TIPS = 100;
/** `--skip` walks every skipped commit, so paging is bounded rather than endless. */
const COMMIT_LOG_MAX_SKIP = 10_000;
/** Badges past this crowd the row out; the tail is never the interesting one. */
const COMMIT_LOG_MAX_REFS_PER_COMMIT = 8;

const COMMIT_RECORD_SEPARATOR = "\x1e";
const COMMIT_FIELD_SEPARATOR = "\x00";

// Seven NUL-separated fields, record-separated, with the subject last so arbitrary
// subject text can never swallow a delimiter. `%D` is the ref decoration, `%P`
// the space-separated parent OIDs.
const COMMIT_LOG_HISTORY_FORMAT = "%x1e%H%x00%h%x00%an%x00%aI%x00%D%x00%P%x00%s";

// Cursors carry commit OIDs straight onto the git argv, so they are validated as
// hex and nothing else. This also rejects `-`-prefixed option injection.
const COMMIT_OID_PATTERN = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

const CURSOR_VERSION = 1;

export class CommitLogCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitLogCursorError";
  }
}

interface CommitLogCursor {
  v: number;
  scope: CommitLogScope;
  /** Commit OIDs resolved at page 1, newest ref first. */
  tips: string[];
  skip: number;
}

export interface ListCommitLogPageInput {
  cwd: string;
  scope: CommitLogScope;
  limit: number;
  cursor?: string;
}

export function encodeCommitLogCursor(cursor: CommitLogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCommitLogCursor(raw: string, expectedScope: CommitLogScope): CommitLogCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new CommitLogCursorError("Invalid commit log cursor");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CommitLogCursorError("Invalid commit log cursor");
  }

  const payload = parsed as Partial<CommitLogCursor>;
  if (payload.v !== CURSOR_VERSION) {
    throw new CommitLogCursorError("Unsupported commit log cursor version");
  }
  if (payload.scope !== expectedScope) {
    throw new CommitLogCursorError("Commit log cursor does not match the requested scope");
  }
  if (
    typeof payload.skip !== "number" ||
    !Number.isInteger(payload.skip) ||
    payload.skip < 0 ||
    payload.skip > COMMIT_LOG_MAX_SKIP
  ) {
    throw new CommitLogCursorError("Commit log cursor is out of range");
  }
  if (
    !Array.isArray(payload.tips) ||
    payload.tips.length === 0 ||
    payload.tips.length > COMMIT_LOG_MAX_PINNED_TIPS ||
    payload.tips.some((tip) => typeof tip !== "string" || !COMMIT_OID_PATTERN.test(tip))
  ) {
    throw new CommitLogCursorError("Invalid commit log cursor");
  }

  return { v: CURSOR_VERSION, scope: expectedScope, tips: payload.tips, skip: payload.skip };
}

/**
 * Classifies one full ref path into a badge. Refs the user never navigates to
 * (stash, notes, pull, replace) are dropped rather than crowding the badge row.
 */
function pushClassifiedRef(refs: CommitLogRef[], fullRef: string): void {
  if (fullRef.startsWith("refs/heads/")) {
    refs.push({ kind: "local_branch", name: fullRef.slice("refs/heads/".length) });
    return;
  }
  if (fullRef.startsWith("refs/remotes/")) {
    const name = fullRef.slice("refs/remotes/".length);
    // origin/HEAD is a symref alias, not a branch anyone thinks about.
    if (!name.endsWith("/HEAD")) {
      refs.push({ kind: "remote_branch", name });
    }
    return;
  }
  if (fullRef.startsWith("refs/tags/")) {
    refs.push({ kind: "tag", name: fullRef.slice("refs/tags/".length) });
  }
}

/**
 * Parses a `%D` decoration produced with `--decorate=full`, e.g.
 * `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1`.
 *
 * git's check-ref-format forbids ASCII space in a ref name, so `", "`, `" -> "`,
 * and `"tag: "` are unambiguous separators — a ref may contain a comma, but never
 * a comma followed by a space. `--decorate=full` is what makes classification
 * possible at all: short names cannot distinguish a remote-tracking branch from a
 * local branch literally named `origin/main`.
 */
export function parseCommitDecoration(raw: string): CommitLogRef[] {
  if (raw.length === 0) {
    return [];
  }
  const refs: CommitLogRef[] = [];
  for (const entry of raw.split(", ")) {
    const arrow = entry.indexOf(" -> ");
    if (arrow !== -1) {
      refs.push({ kind: "head", name: "HEAD" });
      pushClassifiedRef(refs, entry.slice(arrow + " -> ".length));
      continue;
    }
    if (entry === "HEAD") {
      // Detached HEAD decorates on its own.
      refs.push({ kind: "head", name: "HEAD" });
      continue;
    }
    pushClassifiedRef(refs, entry.startsWith("tag: ") ? entry.slice("tag: ".length) : entry);
  }
  return refs.slice(0, COMMIT_LOG_MAX_REFS_PER_COMMIT);
}

export function parseCommitLogRecords(stdout: string): CommitLogEntry[] {
  const commits: CommitLogEntry[] = [];
  for (const record of stdout.split(COMMIT_RECORD_SEPARATOR)) {
    if (record.length === 0) {
      continue;
    }
    const fields = record.split(COMMIT_FIELD_SEPARATOR);
    if (fields.length < 7) {
      continue;
    }
    const sha = (fields[0] ?? "").trim();
    if (!sha) {
      continue;
    }
    commits.push({
      sha,
      shortSha: (fields[1] ?? "").trim(),
      authorName: fields[2] ?? "",
      authorDate: (fields[3] ?? "").trim(),
      refs: parseCommitDecoration((fields[4] ?? "").trim()),
      parents: (fields[5] ?? "").split(" ").filter((parent) => parent.length > 0),
      // Trailing newline belongs to the record framing, not the subject.
      subject: (fields[6] ?? "").replace(/\n$/, ""),
    });
  }
  return commits;
}

async function resolveHeadTip(cwd: string): Promise<string | null> {
  const { stdout } = await runGit(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], {
    cwd,
    // Exit 1 with no output is an unborn branch, not a failure.
    acceptExitCodes: [0, 1],
  });
  const sha = stdout.trim();
  return COMMIT_OID_PATTERN.test(sha) ? sha : null;
}

/**
 * Materializes the ref tips for "all" scope once, so every page of a given cursor
 * traverses the same DAG. Passing `--all` instead would re-expand to whatever refs
 * exist at call time and silently shift rows between pages.
 */
async function resolvePinnedTips(cwd: string): Promise<{ tips: string[]; truncated: boolean }> {
  const { stdout } = await runGit(
    [
      "for-each-ref",
      // Annotated tags carry no committer date, so -committerdate sorts them last.
      "--sort=-creatordate",
      `--count=${COMMIT_LOG_REF_SCAN_LIMIT}`,
      // %(*objectname) is the peeled commit of an annotated tag, empty otherwise.
      "--format=%(objectname)%09%(*objectname)",
      "refs/heads",
      "refs/remotes",
      "refs/tags",
    ],
    { cwd },
  );

  const lines = stdout.split("\n").filter((line) => line.length > 0);
  const ordered: string[] = [];
  for (const line of lines) {
    const [objectName = "", peeled = ""] = line.split("\t");
    const oid = (peeled.trim() || objectName.trim()).toLowerCase();
    if (COMMIT_OID_PATTERN.test(oid)) {
      ordered.push(oid);
    }
  }

  // HEAD goes first so the current branch is never what the cap drops.
  const headSha = await resolveHeadTip(cwd);
  if (headSha) {
    ordered.unshift(headSha);
  }

  const unique = [...new Set(ordered)];
  return {
    tips: unique.slice(0, COMMIT_LOG_MAX_PINNED_TIPS),
    truncated:
      unique.length > COMMIT_LOG_MAX_PINNED_TIPS || lines.length >= COMMIT_LOG_REF_SCAN_LIMIT,
  };
}

/**
 * Returns the pinned tips git can no longer resolve. `--ignore-missing` makes this
 * one process instead of one `rev-parse` per tip: it exits 0 and omits dead OIDs.
 */
async function findMissingTips(cwd: string, tips: string[]): Promise<string[]> {
  const { stdout } = await runGit(["rev-list", "--no-walk", "--ignore-missing", ...tips], {
    cwd,
  });
  const alive = new Set(
    stdout
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean),
  );
  return tips.filter((tip) => !alive.has(tip));
}

async function readCommitLogPage({
  cwd,
  tips,
  skip,
  limit,
}: {
  cwd: string;
  tips: string[];
  skip: number;
  limit: number;
}): Promise<{ commits: CommitLogEntry[]; hasMore: boolean }> {
  const { stdout } = await runGit(
    [
      "log",
      ...tips,
      "--date-order",
      `--skip=${skip}`,
      // One extra row answers hasMore without a second rev-list --count.
      `--max-count=${limit + 1}`,
      // `log.showSignature = true` in user config would otherwise inject GPG
      // output into every record body. --format= does not imply this.
      "--no-show-signature",
      "--decorate=full",
      `--format=${COMMIT_LOG_HISTORY_FORMAT}`,
    ],
    { cwd },
  );

  const parsed = parseCommitLogRecords(stdout);
  return { commits: parsed.slice(0, limit), hasMore: parsed.length > limit };
}

function emptyPage(scope: CommitLogScope, overrides: Partial<CommitLogPage> = {}): CommitLogPage {
  return {
    scope,
    commits: [],
    nextCursor: null,
    hasMore: false,
    cursorExpired: false,
    pinnedTipCount: 0,
    pinnedTipsTruncated: false,
    ...overrides,
  };
}

/**
 * Reads one page of full commit history.
 *
 * Page 1 resolves the starting commits and pins them into the returned cursor;
 * every later page replays those exact OIDs with `--skip`, so concurrent commits,
 * fetches, and branch churn cannot shift a page under the reader. When a pinned
 * OID disappears (force-push plus gc, or a pruned remote-tracking branch) the page
 * comes back empty with `cursorExpired` set rather than silently shifted.
 */
export async function listCommitLogPage({
  cwd,
  scope,
  limit,
  cursor,
}: ListCommitLogPageInput): Promise<CommitLogPage> {
  if (cursor !== undefined) {
    const decoded = decodeCommitLogCursor(cursor, scope);
    const missing = await findMissingTips(cwd, decoded.tips);
    if (missing.length > 0) {
      return emptyPage(scope, { cursorExpired: true, pinnedTipCount: decoded.tips.length });
    }
    const { commits, hasMore } = await readCommitLogPage({
      cwd,
      tips: decoded.tips,
      skip: decoded.skip,
      limit,
    });
    const nextSkip = decoded.skip + commits.length;
    const canContinue = hasMore && nextSkip <= COMMIT_LOG_MAX_SKIP;
    return {
      scope,
      commits,
      hasMore: canContinue,
      nextCursor: canContinue
        ? encodeCommitLogCursor({ v: CURSOR_VERSION, scope, tips: decoded.tips, skip: nextSkip })
        : null,
      cursorExpired: false,
      pinnedTipCount: decoded.tips.length,
      pinnedTipsTruncated: false,
    };
  }

  let tips: string[];
  let pinnedTipsTruncated = false;
  if (scope === "all") {
    const pinned = await resolvePinnedTips(cwd);
    tips = pinned.tips;
    pinnedTipsTruncated = pinned.truncated;
  } else {
    const headSha = await resolveHeadTip(cwd);
    tips = headSha ? [headSha] : [];
  }
  if (tips.length === 0) {
    // Unborn branch, or a repository with no refs at all.
    return emptyPage(scope, { pinnedTipsTruncated });
  }

  const { commits, hasMore } = await readCommitLogPage({ cwd, tips, skip: 0, limit });
  return {
    scope,
    commits,
    hasMore,
    nextCursor: hasMore
      ? encodeCommitLogCursor({ v: CURSOR_VERSION, scope, tips, skip: commits.length })
      : null,
    cursorExpired: false,
    pinnedTipCount: tips.length,
    pinnedTipsTruncated,
  };
}
