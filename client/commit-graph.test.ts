import { describe, expect, it } from "vitest";
import { layoutCommitGraph } from "./commit-graph";

function commit(sha: string, ...parents: string[]) {
  return { sha, parents };
}

describe("layoutCommitGraph", () => {
  it("draws a linear history as one lane in one colour", () => {
    const graph = layoutCommitGraph([commit("a", "b"), commit("b", "c"), commit("c")]);

    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(graph.rows.map((row) => row.color)).toEqual([0, 0, 0]);
    expect(graph.rows[0]?.edgesDown).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(graph.rows[1]?.edgesDown).toEqual([{ from: 0, to: 0, color: 0 }]);
    // The root commit ends the line.
    expect(graph.rows[2]?.edgesDown).toEqual([]);
  });

  it("fans a merge out to the right and folds it back at the fork commit", () => {
    // M merges F into A; both descend from C.
    const graph = layoutCommitGraph([
      commit("m", "a", "f"),
      commit("a", "c"),
      commit("f", "c"),
      commit("c"),
    ]);

    expect(graph.laneCount).toBe(2);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 1, 0]);
    expect(graph.rows[0]).toMatchObject({ isMerge: true, color: 0 });
    // The merge edge leaves the node and opens lane 1 in a new colour.
    expect(graph.rows[0]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ]);
    // Lane 1 passes A untouched.
    expect(graph.rows[1]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
    ]);
    // Both lanes are waiting for C, so lane 1 bends into lane 0 at C's row.
    expect(graph.rows[2]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
    ]);
    expect(graph.rows[3]?.edgesDown).toEqual([]);
  });

  it("gives an unmerged branch tip its own lane until it meets its parent", () => {
    const graph = layoutCommitGraph([commit("a", "b"), commit("f", "b"), commit("b")]);

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(graph.rows[1]?.color).toBe(1);
    // Nothing runs into a tip from above: A's outgoing lines never touch lane 1.
    expect(graph.rows[0]?.edgesDown).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(graph.rows[1]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
    ]);
  });

  it("bends a merge edge straight into its parent when that parent is the next row", () => {
    const graph = layoutCommitGraph([commit("m", "a", "x"), commit("x", "a"), commit("a")]);

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(graph.rows[0]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ]);
  });

  it("joins an existing lane instead of opening another one for a shared parent", () => {
    // Two merges bring in the same side branch commit S.
    const graph = layoutCommitGraph([
      commit("m2", "m1", "s"),
      commit("m1", "a", "s"),
      commit("s", "c"),
      commit("a", "c"),
      commit("c"),
    ]);

    expect(graph.laneCount).toBe(2);
    expect(graph.rows[1]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
      { from: 0, to: 1, color: 1 },
    ]);
  });

  it("reuses a lane freed by a root commit", () => {
    const graph = layoutCommitGraph([commit("r1"), commit("r2")]);

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0]);
    expect(graph.rows.map((row) => row.color)).toEqual([0, 1]);
    expect(graph.rows[0]?.edgesDown).toEqual([]);
    expect(graph.laneCount).toBe(1);
  });

  it("runs open lanes off the bottom when the parent is on a page not loaded yet", () => {
    const graph = layoutCommitGraph([commit("m", "a", "f")]);

    expect(graph.rows[0]?.edgesDown).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ]);
    expect(graph.laneCount).toBe(2);
  });

  it("handles an empty list", () => {
    expect(layoutCommitGraph([])).toEqual({ rows: [], laneCount: 0 });
  });
});
