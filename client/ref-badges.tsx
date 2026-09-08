import type { PluginTheme } from "./theme";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { CommitLogRef } from "../shared/commit-log";

const ICON_SIZE = 12;
// Past this the badges crowd the subject out, and the tail is never the
// interesting ref. The rest collapse into a +N badge.
const MAX_VISIBLE_BADGES = 3;

function badgeIcon(kind: CommitLogRef["kind"]): string | null {
  if (kind === "local_branch") return "GitBranch";
  if (kind === "remote_branch") return "Cloud";
  if (kind === "tag") return "Tag";
  return null;
}

function badgeColor(theme: PluginTheme, kind: CommitLogRef["kind"] | "overflow"): string {
  if (kind === "head") return theme.colors.statusSuccess;
  if (kind === "tag") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

export function RefBadges({ refs, theme }: { refs: CommitLogRef[]; theme: PluginTheme }) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        // Never squeeze the subject to nothing to fit one more badge.
        flexShrink: 0,
      },
      badge: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingHorizontal: 6,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      label: { fontSize: 11, lineHeight: 14 },
    }),
    [theme],
  );

  const visible = useMemo(() => refs.slice(0, MAX_VISIBLE_BADGES), [refs]);
  if (refs.length === 0) {
    return null;
  }
  const overflow = refs.length - visible.length;

  return (
    <View style={styles.row}>
      {visible.map((ref) => {
        const color = badgeColor(theme, ref.kind);
        const icon = badgeIcon(ref.kind);
        return (
          <View key={`${ref.kind}:${ref.name}`} style={styles.badge}>
            {icon ? <Icon name={icon} size={ICON_SIZE} color={color} /> : null}
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {ref.name}
            </Text>
          </View>
        );
      })}
      {overflow > 0 ? (
        <View style={styles.badge}>
          <Text style={[styles.label, { color: badgeColor(theme, "overflow") }]}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}
