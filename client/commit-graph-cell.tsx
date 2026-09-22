import { memo, useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import type { GraphEdge, GraphRow } from "./commit-graph";

// Lines are 2px so they read at 1x and stay crisp at 2x. Lanes are spaced so a
// curve between neighbours is a clean quarter turn, not a kink.
export const GRAPH_LANE_WIDTH = 14;
const LINE_WIDTH = 2;
const NODE_SIZE = 8;
const HEAD_RING_SIZE = 16;
const HEAD_RING_WIDTH = 1.5;
const PADDING_LEFT = 8;
const PADDING_RIGHT = 2;

// Chosen to read on both light and dark surfaces; the first one is the main line.
const PALETTE = [
  "#0A84FF",
  "#FF9F0A",
  "#30D158",
  "#BF5AF2",
  "#FF375F",
  "#64D2FF",
  "#FFD60A",
  "#5E5CE6",
] as const;

export function graphWidthForLanes(laneCount: number): number {
  return PADDING_LEFT + Math.max(1, laneCount) * GRAPH_LANE_WIDTH + PADDING_RIGHT;
}

function laneX(lane: number): number {
  return PADDING_LEFT + lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
}

function laneColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

/**
 * The lower half of a line: from this row's centre down to the row's bottom
 * edge. A lane change becomes a quarter turn ending horizontal at the midpoint
 * between the two lanes, where the next row's upper half picks it up.
 */
function lowerHalfStyle(edge: GraphEdge, height: number): ViewStyle {
  const centre = height / 2;
  const xFrom = laneX(edge.from);
  const color = laneColor(edge.color);
  if (edge.from === edge.to) {
    return {
      position: "absolute",
      left: xFrom - LINE_WIDTH / 2,
      top: centre,
      width: LINE_WIDTH,
      height: centre,
      backgroundColor: color,
    };
  }
  const xMid = (xFrom + laneX(edge.to)) / 2;
  const width = Math.abs(xMid - xFrom) + LINE_WIDTH;
  const boxHeight = centre + LINE_WIDTH / 2;
  const radius = Math.min(width, boxHeight);
  return xMid > xFrom
    ? {
        position: "absolute",
        left: xFrom - LINE_WIDTH / 2,
        top: centre,
        width,
        height: boxHeight,
        borderColor: color,
        borderLeftWidth: LINE_WIDTH,
        borderBottomWidth: LINE_WIDTH,
        borderBottomLeftRadius: radius,
      }
    : {
        position: "absolute",
        left: xMid - LINE_WIDTH / 2,
        top: centre,
        width,
        height: boxHeight,
        borderColor: color,
        borderRightWidth: LINE_WIDTH,
        borderBottomWidth: LINE_WIDTH,
        borderBottomRightRadius: radius,
      };
}

/**
 * The upper half of a line arriving from the row above: from the top edge down
 * to this row's centre, turning from horizontal back to vertical.
 */
function upperHalfStyle(edge: GraphEdge, height: number): ViewStyle {
  const centre = height / 2;
  const xTo = laneX(edge.to);
  const color = laneColor(edge.color);
  if (edge.from === edge.to) {
    return {
      position: "absolute",
      left: xTo - LINE_WIDTH / 2,
      top: 0,
      width: LINE_WIDTH,
      height: centre,
      backgroundColor: color,
    };
  }
  const xMid = (laneX(edge.from) + xTo) / 2;
  const width = Math.abs(xTo - xMid) + LINE_WIDTH;
  const boxHeight = centre + LINE_WIDTH / 2;
  const radius = Math.min(width, boxHeight);
  return xTo > xMid
    ? {
        position: "absolute",
        left: xMid - LINE_WIDTH / 2,
        top: -LINE_WIDTH / 2,
        width,
        height: boxHeight,
        borderColor: color,
        borderTopWidth: LINE_WIDTH,
        borderRightWidth: LINE_WIDTH,
        borderTopRightRadius: radius,
      }
    : {
        position: "absolute",
        left: xTo - LINE_WIDTH / 2,
        top: -LINE_WIDTH / 2,
        width,
        height: boxHeight,
        borderColor: color,
        borderTopWidth: LINE_WIDTH,
        borderLeftWidth: LINE_WIDTH,
        borderTopLeftRadius: radius,
      };
}

interface CommitGraphCellProps {
  row: GraphRow;
  /** The previous row's outgoing lines; this row paints their top halves. */
  above: readonly GraphEdge[];
  width: number;
  height: number;
  /** Lanes past this are clipped rather than pushing the subject off-screen. */
  maxLanes: number;
  isHead: boolean;
  /** The row background, used to punch the merge ring and HEAD halo out of the lines. */
  background: string;
}

export const CommitGraphCell = memo(function CommitGraphCell({
  row,
  above,
  width,
  height,
  maxLanes,
  isHead,
  background,
}: CommitGraphCellProps) {
  const visible = (edge: GraphEdge) => edge.from < maxLanes && edge.to < maxLanes;
  const upper = above.filter(visible);
  const lower = row.edgesDown.filter(visible);

  const clipped = row.lane >= maxLanes;
  const nodeX = laneX(clipped ? maxLanes - 1 : row.lane);
  const centre = height / 2;
  const color = laneColor(row.color);

  const styles = useMemo(
    () => ({
      cell: { width, height, flexShrink: 0, overflow: "hidden" as const },
      halo: {
        position: "absolute" as const,
        left: nodeX - HEAD_RING_SIZE / 2,
        top: centre - HEAD_RING_SIZE / 2,
        width: HEAD_RING_SIZE,
        height: HEAD_RING_SIZE,
        borderRadius: HEAD_RING_SIZE / 2,
        borderWidth: HEAD_RING_WIDTH,
        borderColor: color,
        backgroundColor: background,
      },
      node: {
        position: "absolute" as const,
        left: nodeX - NODE_SIZE / 2,
        top: centre - NODE_SIZE / 2,
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: NODE_SIZE / 2,
        backgroundColor: row.isMerge ? background : color,
        borderWidth: row.isMerge ? LINE_WIDTH : 0,
        borderColor: color,
        opacity: clipped ? 0.4 : 1,
      },
    }),
    [background, centre, clipped, color, height, nodeX, row.isMerge, width],
  );

  return (
    <View style={styles.cell} pointerEvents="none">
      {upper.map((edge, index) => (
        <View key={`u${index}`} style={upperHalfStyle(edge, height)} />
      ))}
      {lower.map((edge, index) => (
        <View key={`l${index}`} style={lowerHalfStyle(edge, height)} />
      ))}
      {isHead ? <View style={styles.halo} /> : null}
      <View style={styles.node} />
    </View>
  );
});
