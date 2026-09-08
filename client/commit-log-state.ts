import type { CommitLogEntry, CommitLogPage } from "../shared/commit-log";

export interface CommitLogData {
  commits: CommitLogEntry[];
  hasMore: boolean;
  pinnedTipsTruncated: boolean;
}

export type CommitLogQueryResult =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "loaded"; data: CommitLogData; isLoadingMore: boolean };

export function resolveCommitLogQueryResult({
  data,
  isFetchingNextPage,
  error,
}: {
  data: CommitLogData | undefined;
  isFetchingNextPage: boolean;
  error: Error | null;
}): CommitLogQueryResult {
  if (data) {
    return { status: "loaded", data, isLoadingMore: isFetchingNextPage };
  }
  if (error) {
    return { status: "error", error };
  }
  return { status: "loading" };
}

/**
 * Flattens loaded pages into one list. Returns undefined when any page reports an
 * expired cursor: merging that page would splice a shifted list into the loaded
 * one, so the caller restarts from page 1 instead.
 */
export function mergeCommitLogPages(pages: readonly CommitLogPage[]): CommitLogData | undefined {
  if (pages.length === 0 || pages.some((page) => page.cursorExpired)) {
    return undefined;
  }
  const seen = new Set<string>();
  const commits: CommitLogEntry[] = [];
  for (const page of pages) {
    for (const commit of page.commits) {
      if (!seen.has(commit.sha)) {
        seen.add(commit.sha);
        commits.push(commit);
      }
    }
  }
  return {
    commits,
    hasMore: pages[pages.length - 1]?.hasMore === true,
    pinnedTipsTruncated: pages[0]?.pinnedTipsTruncated === true,
  };
}
