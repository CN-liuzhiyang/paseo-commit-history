import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const commitLogScopeSchema = z.enum(["head", "all"]);
export type CommitLogScope = z.infer<typeof commitLogScopeSchema>;

export const commitLogRefSchema = z.object({
  kind: z.enum(["head", "local_branch", "remote_branch", "tag"]),
  name: z.string(),
});
export type CommitLogRef = z.infer<typeof commitLogRefSchema>;

// Deliberately carries no file stats: the history log runs `git log` without
// --raw/--numstat, and a full tree diff per commit is the dominant cost there.
export const commitLogEntrySchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorDate: z.string(), // ISO 8601
  refs: z.array(commitLogRefSchema),
});
export type CommitLogEntry = z.infer<typeof commitLogEntrySchema>;

export const COMMIT_LOG_PAGE_LIMIT = 50;

export const listCommitLog = defineRpc({
  name: "commit-log.list",
  input: z.object({
    workspaceId: z.string(),
    scope: commitLogScopeSchema,
    limit: z.number().int().positive().max(200),
    cursor: z.string().min(1).optional(),
  }),
  output: z.object({
    // Echoed so a client that flipped the scope toggle mid-flight can tell which
    // scope a late page belongs to.
    scope: commitLogScopeSchema,
    commits: z.array(commitLogEntrySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    // The cursor pinned starting commits that no longer exist (force-push + gc,
    // or a pruned remote-tracking branch). The page is empty and the client must
    // restart from page 1 rather than be served a silently shifted page.
    cursorExpired: z.boolean(),
    // "all" scope pins a bounded set of ref tips. These report how many, and
    // whether older refs were dropped, so the UI can say so.
    pinnedTipCount: z.number().int().nonnegative(),
    pinnedTipsTruncated: z.boolean(),
  }),
});

export type CommitLogPage = z.infer<typeof listCommitLog.output>;
