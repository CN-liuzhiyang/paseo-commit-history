import { useRpc } from "@getpaseo/plugin/client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMMIT_LOG_PAGE_LIMIT,
  listCommitLog,
  type CommitLogPage,
  type CommitLogScope,
} from "../shared/commit-log";
import {
  mergeCommitLogPages,
  resolveCommitLogQueryResult,
  type CommitLogQueryResult,
} from "./commit-log-state";

// History only moves when the user commits, pulls, or pushes. This just keeps a
// tab switch warm; the toolbar refresh button is the explicit invalidation.
const COMMIT_LOG_STALE_TIME_MS = 30_000;

export interface UseCommitLog {
  result: CommitLogQueryResult;
  loadMore: () => void;
  refresh: () => void;
  isRefreshing: boolean;
  /** True once after history moved under a cursor and the list restarted. */
  didResetAfterExpiry: boolean;
  acknowledgeReset: () => void;
}

export function useCommitLog({
  hostId,
  workspaceId,
  scope,
}: {
  hostId: string;
  workspaceId: string;
  scope: CommitLogScope;
}): UseCommitLog {
  const queryClient = useQueryClient();
  const callListCommitLog = useRpc(listCommitLog);
  const [didResetAfterExpiry, setDidResetAfterExpiry] = useState(false);
  const queryKey = useMemo(
    () => ["commit-log", hostId, workspaceId, scope] as const,
    [hostId, workspaceId, scope],
  );

  const query = useInfiniteQuery<
    CommitLogPage,
    Error,
    { pages: CommitLogPage[] },
    typeof queryKey,
    string | null
  >({
    queryKey,
    staleTime: COMMIT_LOG_STALE_TIME_MS,
    initialPageParam: null,
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    queryFn: ({ pageParam }) =>
      callListCommitLog({
        workspaceId,
        scope,
        limit: COMMIT_LOG_PAGE_LIMIT,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
  });

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching, refetch } =
    query;

  const pages = data?.pages;
  const commitLogData = useMemo(() => mergeCommitLogPages(pages ?? []), [pages]);

  // A pinned tip vanished under us (force-push, prune, gc). Merging that page
  // would splice a shifted list into the loaded one, so restart from page 1.
  const sawExpiredCursor = (pages ?? []).some((page) => page.cursorExpired);
  useEffect(() => {
    if (!sawExpiredCursor) {
      return;
    }
    setDidResetAfterExpiry(true);
    void queryClient.resetQueries({ queryKey });
  }, [queryClient, queryKey, sawExpiredCursor]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const refresh = useCallback(() => {
    setDidResetAfterExpiry(false);
    void refetch();
  }, [refetch]);

  const acknowledgeReset = useCallback(() => setDidResetAfterExpiry(false), []);

  return {
    result: resolveCommitLogQueryResult({
      data: commitLogData,
      isFetchingNextPage,
      error,
    }),
    loadMore,
    refresh,
    isRefreshing: isRefetching,
    didResetAfterExpiry,
    acknowledgeReset,
  };
}
