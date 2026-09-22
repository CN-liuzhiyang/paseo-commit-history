import { describe, expect, it } from "vitest";
import type { CommitLogPage } from "../shared/commit-log";
import { mergeCommitLogPages, resolveCommitLogQueryResult } from "./commit-log-state";

function commit(sha: string) {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    subject: `Commit ${sha.slice(0, 7)}`,
    authorName: "Ada",
    authorDate: "2026-06-13T10:00:00.000Z",
    refs: [],
    parents: [],
  };
}

function page(overrides: Partial<CommitLogPage>): CommitLogPage {
  return {
    scope: "head",
    commits: [],
    nextCursor: null,
    hasMore: false,
    cursorExpired: false,
    pinnedTipCount: 1,
    pinnedTipsTruncated: false,
    ...overrides,
  };
}

describe("resolveCommitLogQueryResult", () => {
  const data = { commits: [commit("1".repeat(40))], hasMore: true, pinnedTipsTruncated: false };

  it("reports loading before the first page arrives", () => {
    expect(
      resolveCommitLogQueryResult({ data: undefined, isFetchingNextPage: false, error: null }),
    ).toEqual({ status: "loading" });
  });

  it("reports an error when the cold load fails", () => {
    const error = new Error("boom");
    expect(
      resolveCommitLogQueryResult({ data: undefined, isFetchingNextPage: false, error }),
    ).toEqual({
      status: "error",
      error,
    });
  });

  it("keeps showing loaded pages when a later fetch fails", () => {
    expect(
      resolveCommitLogQueryResult({ data, isFetchingNextPage: true, error: new Error("boom") }),
    ).toEqual({ status: "loaded", data, isLoadingMore: true });
  });
});

describe("mergeCommitLogPages", () => {
  it("flattens pages, dedupes by sha, and reads hasMore from the last page", () => {
    const a = commit("a".repeat(40));
    const b = commit("b".repeat(40));
    const merged = mergeCommitLogPages([
      page({ commits: [a, b], hasMore: true, nextCursor: "c1", pinnedTipsTruncated: true }),
      page({ commits: [b], hasMore: false }),
    ]);
    expect(merged).toEqual({ commits: [a, b], hasMore: false, pinnedTipsTruncated: true });
  });

  it("returns nothing when a page reports an expired cursor", () => {
    expect(
      mergeCommitLogPages([
        page({ commits: [commit("a".repeat(40))], hasMore: true, nextCursor: "c1" }),
        page({ cursorExpired: true }),
      ]),
    ).toBeUndefined();
  });

  it("returns nothing for no pages", () => {
    expect(mergeCommitLogPages([])).toBeUndefined();
  });
});
