import type { PluginTheme } from "./theme";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import type { CommitLogEntry } from "../shared/commit-log";
import type { GraphEdge, GraphRow } from "./commit-graph";
import { CommitGraphCell } from "./commit-graph-cell";
import { RefBadges } from "./ref-badges";
import { formatCompactTimeAgo } from "./time-ago";

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

interface CommitRowProps {
  commit: CommitLogEntry;
  graph: GraphRow;
  /** The previous row's outgoing lines, so this row can finish drawing them. */
  graphAbove: readonly GraphEdge[];
  graphWidth: number;
  graphMaxLanes: number;
  rowHeight: number;
  now: Date;
  showSha: boolean;
  showAuthor: boolean;
  theme: PluginTheme;
  onPress: (sha: string) => void;
}

export const CommitRow = memo(function CommitRow({
  commit,
  graph,
  graphAbove,
  graphWidth,
  graphMaxLanes,
  rowHeight,
  now,
  showSha,
  showAuthor,
  theme,
  onPress,
}: CommitRowProps) {
  const handlePress = useCallback(() => onPress(commit.sha), [commit.sha, onPress]);
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingRight: 8,
        // Every row is exactly this tall so the graph halves painted by
        // neighbouring rows meet at the edge.
        height: rowHeight,
      },
      rowActive: { backgroundColor: theme.colors.surface1 },
      shortSha: {
        fontSize: 12,
        fontFamily: MONO_FONT,
        color: theme.colors.foregroundMuted,
        width: 62,
        flexShrink: 0,
      },
      subject: { flex: 1, minWidth: 0, fontSize: 14, color: theme.colors.foreground },
      author: { flexShrink: 0, maxWidth: 120, fontSize: 12, color: theme.colors.foregroundMuted },
      // Fixed rail so relative times of different lengths do not jitter the row.
      timestamp: { flexShrink: 0, width: 56, alignItems: "flex-end" as const },
      timestampText: { fontSize: 12, color: theme.colors.foregroundMuted },
    }),
    [rowHeight, theme],
  );
  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed) && styles.rowActive,
    ],
    [styles],
  );
  const isHead = commit.refs.some((ref) => ref.kind === "head");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${commit.shortSha} ${commit.subject}`}
      onPress={handlePress}
      style={rowStyle}
    >
      {({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <CommitGraphCell
            row={graph}
            above={graphAbove}
            width={graphWidth}
            height={rowHeight}
            maxLanes={graphMaxLanes}
            isHead={isHead}
            // The ring cut-outs must match whatever the row is painted right now.
            background={
              Boolean(hovered) || pressed ? theme.colors.surface1 : theme.colors.surface0
            }
          />
          {showSha ? (
            <Text style={styles.shortSha} numberOfLines={1}>
              {commit.shortSha}
            </Text>
          ) : null}
          <Text style={styles.subject} numberOfLines={1}>
            {commit.subject}
          </Text>
          <RefBadges refs={commit.refs} theme={theme} />
          {showAuthor ? (
            <Text style={styles.author} numberOfLines={1}>
              {commit.authorName}
            </Text>
          ) : null}
          <View style={styles.timestamp}>
            <Text style={styles.timestampText} numberOfLines={1}>
              {formatCompactTimeAgo(new Date(commit.authorDate), now)}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
});
