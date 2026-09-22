/**
 * Lays a child-before-parent commit list out as lanes, the way gitk and
 * TortoiseGit draw it. Pure and synchronous so it can run in a memo over the
 * loaded pages and be tested without a renderer.
 *
 * The model: each row has one node in one lane, and a set of lines running from
 * this row's centre to the next row's centre. A line either stays in its lane or
 * curves into another one. Rows draw their own bottom half of the lines leaving
 * them and the top half of the lines arriving, so two adjacent rows together
 * paint one continuous stroke.
 */

export interface GraphEdge {
  /** Lane at this row's centre. */
  from: number;
  /** Lane at the next row's centre. */
  to: number;
  /** Palette index; a line keeps its colour until it merges away. */
  color: number;
}

export interface GraphRow {
  lane: number;
  color: number;
  isMerge: boolean;
  /** Lines leaving this row's centre for the next row's centre. */
  edgesDown: GraphEdge[];
}

export interface CommitGraph {
  rows: GraphRow[];
  /** Widest the graph gets anywhere in the list. */
  laneCount: number;
}

export interface GraphCommit {
  sha: string;
  parents: readonly string[];
}

interface Lane {
  /** The commit this lane is waiting to reach. */
  sha: string;
  color: number;
  /**
   * Opened by the previous row's node for a second parent. The line into it is
   * that node's merge edge, so there is no pass-through stroke to draw above.
   */
  fresh: boolean;
}

function firstFreeLane(lanes: readonly (Lane | null)[], from: number): number {
  for (let index = from; index < lanes.length; index += 1) {
    if (!lanes[index]) {
      return index;
    }
  }
  return Math.max(lanes.length, from);
}

function setLane(lanes: (Lane | null)[], index: number, lane: Lane | null): void {
  while (lanes.length < index) {
    lanes.push(null);
  }
  lanes[index] = lane;
}

export function layoutCommitGraph(commits: readonly GraphCommit[]): CommitGraph {
  const lanes: (Lane | null)[] = [];
  const rows: GraphRow[] = [];
  let pendingNodeEdges: GraphEdge[] = [];
  let laneCount = 0;
  let nextColor = 0;

  for (const commit of commits) {
    // Every lane waiting for this commit converges here. The leftmost keeps
    // going as the commit's own lane; the rest fold into it and close.
    const waiting: number[] = [];
    lanes.forEach((entry, index) => {
      if (entry?.sha === commit.sha) {
        waiting.push(index);
      }
    });
    const lane = waiting.length > 0 ? waiting[0]! : firstFreeLane(lanes, 0);
    const color = waiting.length > 0 ? lanes[lane]!.color : nextColor++;

    // Now that this row's lane is known, the previous row's outgoing lines are
    // fully determined: pass-throughs stay put, lines waiting for this commit
    // bend into its lane, and the previous node's merge edges do the same.
    if (rows.length > 0) {
      const edges: GraphEdge[] = [];
      lanes.forEach((entry, index) => {
        if (!entry) {
          return;
        }
        if (!entry.fresh) {
          edges.push({
            from: index,
            to: entry.sha === commit.sha ? lane : index,
            color: entry.color,
          });
        }
        entry.fresh = false;
      });
      for (const edge of pendingNodeEdges) {
        edges.push({
          ...edge,
          to: lanes[edge.to]?.sha === commit.sha ? lane : edge.to,
        });
      }
      rows[rows.length - 1]!.edgesDown = edges;
    }
    pendingNodeEdges = [];

    for (const index of waiting.slice(1)) {
      lanes[index] = null;
    }

    const [firstParent, ...otherParents] = commit.parents;
    // The first parent continues this lane; a root commit ends it.
    setLane(lanes, lane, firstParent ? { sha: firstParent, color, fresh: false } : null);

    // Other parents are merged-in branches. Join a lane already heading for
    // that parent, otherwise open a new lane to the right of this one.
    const seen = new Set<string>(firstParent ? [firstParent] : []);
    for (const parent of otherParents) {
      if (seen.has(parent)) {
        continue;
      }
      seen.add(parent);
      let target = lanes.findIndex((entry) => entry?.sha === parent);
      if (target === -1) {
        target = firstFreeLane(lanes, lane + 1);
        setLane(lanes, target, { sha: parent, color: nextColor++, fresh: true });
      }
      pendingNodeEdges.push({ from: lane, to: target, color: lanes[target]!.color });
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }
    laneCount = Math.max(laneCount, lanes.length, lane + 1);
    rows.push({ lane, color, isMerge: commit.parents.length > 1, edgesDown: [] });
  }

  // Whatever is still open runs off the bottom, into the pages not loaded yet.
  if (rows.length > 0) {
    const edges: GraphEdge[] = [];
    lanes.forEach((entry, index) => {
      if (entry && !entry.fresh) {
        edges.push({ from: index, to: index, color: entry.color });
      }
    });
    rows[rows.length - 1]!.edgesDown = [...edges, ...pendingNodeEdges];
  }

  return { rows, laneCount };
}
