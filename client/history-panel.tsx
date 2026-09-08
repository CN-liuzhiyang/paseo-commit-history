import { useWorkspace, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { copyText, FlatList, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import type { CommitLogEntry, CommitLogScope } from "../shared/commit-log";
import { CommitRow } from "./commit-row";
import type { PluginTheme } from "./theme";
import { useCommitLog } from "./use-commit-log";

// Below this the author column crowds the subject out on a sidebar-width pane.
const AUTHOR_MIN_WIDTH = 560;
const SKELETON_ROWS = 6;

const SCOPE_OPTIONS: readonly { value: CommitLogScope; label: string }[] = [
  { value: "head", label: "Current branch" },
  { value: "all", label: "All branches" },
];

function usePanelStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () => ({
      container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
      toolbar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      segmented: {
        flexDirection: "row" as const,
        borderRadius: 6,
        backgroundColor: theme.colors.surface1,
        padding: 2,
        gap: 2,
      },
      segment: {
        paddingHorizontal: compact ? 10 : 8,
        paddingVertical: compact ? 6 : 3,
        borderRadius: 4,
      },
      segmentActive: { backgroundColor: theme.colors.surface2 },
      segmentText: { fontSize: 12, color: theme.colors.foregroundMuted },
      segmentTextActive: { color: theme.colors.foreground },
      iconButton: {
        width: compact ? 32 : 26,
        height: compact ? 32 : 26,
        borderRadius: 6,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      iconButtonActive: { backgroundColor: theme.colors.surface1 },
      notice: {
        fontSize: 12,
        color: theme.colors.foregroundMuted,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      listContent: { paddingBottom: 8 },
      centerState: {
        flex: 1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        paddingHorizontal: 24,
        paddingTop: 64,
      },
      mutedText: {
        fontSize: 14,
        color: theme.colors.foregroundMuted,
        textAlign: "center" as const,
      },
      errorText: { fontSize: 14, color: theme.colors.statusDanger, textAlign: "center" as const },
      ghostButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
      ghostButtonText: { fontSize: 13, color: theme.colors.foreground },
      footer: { alignItems: "center" as const, paddingVertical: 8 },
      skeletonRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 8,
        minHeight: 28,
      },
      skeletonBlock: { height: 10, borderRadius: 4, backgroundColor: theme.colors.surface2 },
    }),
    [theme, compact],
  );
}

type PanelStyles = ReturnType<typeof usePanelStyles>;

function Skeleton({ styles }: { styles: PanelStyles }) {
  return (
    <View accessible accessibilityLabel="Loading history">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={[styles.skeletonBlock, { width: 70 }]} />
          <View style={[styles.skeletonBlock, { flex: 1, height: 12 }]} />
          <View style={[styles.skeletonBlock, { width: 40 }]} />
        </View>
      ))}
    </View>
  );
}

function CenteredMessage({
  styles,
  message,
  tone = "muted",
  action,
}: {
  styles: PanelStyles;
  message: string;
  tone?: "muted" | "error";
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centerState}>
      <Text style={tone === "error" ? styles.errorText : styles.mutedText}>{message}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Toolbar({
  styles,
  theme,
  compact,
  scope,
  onScopeChange,
  onRefresh,
  isRefreshing,
}: {
  styles: PanelStyles;
  theme: PluginTheme;
  compact: boolean;
  scope: CommitLogScope;
  onScopeChange: (scope: CommitLogScope) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {SCOPE_OPTIONS.map((option) => {
          const active = option.value === scope;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onScopeChange(option.value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRefreshing ? "Refreshing" : "Refresh"}
        disabled={isRefreshing}
        onPress={onRefresh}
        style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonActive]}
      >
        <Icon
          name={isRefreshing ? "LoaderCircle" : "RotateCw"}
          size={compact ? 18 : 14}
          color={theme.colors.foregroundMuted}
        />
      </Pressable>
    </View>
  );
}

export function HistoryPanel({
  theme,
  layout,
  host,
  workspaceId,
  navigation,
}: PluginWorkspacePanelProps) {
  const styles = usePanelStyles(theme, layout.compact);
  const toast = useToast();
  const workspace = useWorkspace(workspaceId, ({ projectKind, directory }) => ({
    projectKind,
    directory,
  }));
  const [scope, setScope] = useState<CommitLogScope>("head");
  const [showAuthor, setShowAuthor] = useState(true);
  const { result, loadMore, refresh, isRefreshing, didResetAfterExpiry, acknowledgeReset } =
    useCommitLog({ hostId: host.id, workspaceId, scope });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setShowAuthor(event.nativeEvent.layout.width >= AUTHOR_MIN_WIDTH);
  }, []);

  const handleScopeChange = useCallback(
    (next: CommitLogScope) => {
      acknowledgeReset();
      setScope(next);
    },
    [acknowledgeReset],
  );

  // Older hosts have no commit-diff navigation; copying the SHA is the next best
  // thing and still lets the user open it elsewhere.
  const openCommitDiff = navigation?.openCommitDiff;
  const handleCommitPress = useCallback(
    (sha: string) => {
      if (openCommitDiff) {
        openCommitDiff({ workspaceId, sha });
        return;
      }
      copyText(sha).then(
        () => toast.show(`Copied ${sha.slice(0, 7)}. Update Paseo to open commit diffs.`),
        () => toast.error("Could not copy the commit SHA."),
      );
    },
    [openCommitDiff, toast, workspaceId],
  );

  const renderItem = useCallback(
    ({ item }: { item: CommitLogEntry }) => (
      <CommitRow
        commit={item}
        now={now}
        showAuthor={showAuthor}
        theme={theme}
        onPress={handleCommitPress}
      />
    ),
    [handleCommitPress, now, showAuthor, theme],
  );
  const keyExtractor = useCallback((item: CommitLogEntry) => item.sha, []);

  const notice = didResetAfterExpiry
    ? "History changed while loading. Reloaded from the top."
    : result.status === "loaded" && result.data.pinnedTipsTruncated
      ? "Showing only the most recently updated branches and tags."
      : null;

  if (workspace && workspace.projectKind !== "git") {
    return (
      <View style={styles.container}>
        <CenteredMessage styles={styles} message="Not a git repository." />
      </View>
    );
  }

  let body;
  if (result.status === "loading") {
    body = <Skeleton styles={styles} />;
  } else if (result.status === "error") {
    body = (
      <CenteredMessage
        styles={styles}
        message={`Failed to load commit history: ${result.error.message}`}
        tone="error"
        action={{ label: "Retry", onPress: refresh }}
      />
    );
  } else if (result.data.commits.length === 0) {
    body = <CenteredMessage styles={styles} message="No commits yet." />;
  } else {
    body = (
      <FlatList
        data={result.data.commits}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          result.data.hasMore ? (
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                disabled={result.isLoadingMore}
                onPress={loadMore}
                style={styles.ghostButton}
              >
                <Text style={styles.ghostButtonText}>
                  {result.isLoadingMore ? "Loading…" : "Load more"}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Toolbar
        styles={styles}
        theme={theme}
        compact={layout.compact}
        scope={scope}
        onScopeChange={handleScopeChange}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {body}
    </View>
  );
}
