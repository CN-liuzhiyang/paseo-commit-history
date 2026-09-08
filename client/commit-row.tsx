import type { PluginTheme } from "./theme";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import type { CommitLogEntry } from "../shared/commit-log";
import { RefBadges } from "./ref-badges";
import { formatCompactTimeAgo } from "./time-ago";

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

interface CommitRowProps {
  commit: CommitLogEntry;
  now: Date;
  showAuthor: boolean;
  theme: PluginTheme;
  onPress: (sha: string) => void;
}

export const CommitRow = memo(function CommitRow({
  commit,
  now,
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
        paddingHorizontal: 8,
        paddingVertical: 4,
        // A commit with badges and one without occupy the same box.
        minHeight: 28,
      },
      rowActive: { backgroundColor: theme.colors.surface1 },
      shortSha: {
        fontSize: 12,
        fontFamily: MONO_FONT,
        color: theme.colors.foregroundMuted,
        width: 70,
        flexShrink: 0,
      },
      subject: { flex: 1, minWidth: 0, fontSize: 14, color: theme.colors.foreground },
      author: { flexShrink: 0, maxWidth: 120, fontSize: 12, color: theme.colors.foregroundMuted },
      // Fixed rail so relative times of different lengths do not jitter the row.
      timestamp: { flexShrink: 0, width: 56, alignItems: "flex-end" as const },
      timestampText: { fontSize: 12, color: theme.colors.foregroundMuted },
    }),
    [theme],
  );
  const rowStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed) && styles.rowActive,
    ],
    [styles],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${commit.shortSha} ${commit.subject}`}
      onPress={handlePress}
      style={rowStyle}
    >
      <Text style={styles.shortSha} numberOfLines={1}>
        {commit.shortSha}
      </Text>
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
    </Pressable>
  );
});
