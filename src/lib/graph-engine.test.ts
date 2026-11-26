import { describe, expect, it } from "vitest";
import { buildPreviewGraph, type HybridGraphData } from "@/lib/graph-engine";

function createGraph(nodeIds: string[]): HybridGraphData {
  const nodes = nodeIds.map((id) => ({
    id,
    slug: id,
    title: id.toUpperCase(),
    summary: "",
    type: "essay" as const,
    category: "cat",
    tags: [],
  }));
  return {
    nodes,
    edges: [],
    neighbors: new Map(nodes.map((n) => [n.id, new Set<string>()])),
  };
}

describe("buildPreviewGraph", () => {
  it("keeps the focused node and removes category edges by default", () => {
    const graph = createGraph(["a", "b", "c", "d", "e"]);
    graph.edges = [
      { source: "a", target: "b", weight: 9, kind: "direct" },
      { source: "a", target: "c", weight: 8, kind: "semantic" },
      { source: "a", target: "d", weight: 10, kind: "category" },
      { source: "c", target: "e", weight: 6, kind: "direct" },
    ];

    const preview = buildPreviewGraph(graph, {
      focusId: "a",
      maxNodes: 4,
      maxEdges: 4,
      maxFocusNeighbors: 2,
      maxEdgesPerNode: 3,
    });

    expect(preview.nodes.map((n) => n.id)).toContain("a");
    expect(preview.edges.every((edge) => edge.kind !== "category")).toBe(true);
    expect(preview.nodes.map((n) => n.id)).not.toContain("d");
  });

  it("respects node/edge limits and per-node degree cap", () => {
    const graph = createGraph(["a", "b", "c", "d", "e", "f"]);
    graph.edges = [
      { source: "a", target: "b", weight: 9, kind: "direct" },
      { source: "a", target: "c", weight: 8, kind: "direct" },
      { source: "a", target: "d", weight: 7, kind: "direct" },
      { source: "b", target: "c", weight: 6, kind: "semantic" },
      { source: "c", target: "d", weight: 5, kind: "semantic" },
      { source: "d", target: "e", weight: 4, kind: "direct" },
      { source: "e", target: "f", weight: 3, kind: "direct" },
      { source: "b", target: "f", weight: 2, kind: "semantic" },
    ];

    const preview = buildPreviewGraph(graph, {
      focusId: "a",
      maxNodes: 4,
      maxEdges: 3,
      maxFocusNeighbors: 3,
      maxEdgesPerNode: 2,
    });

    expect(preview.nodes.length).toBeLessThanOrEqual(4);
    expect(preview.edges.length).toBeLessThanOrEqual(3);

    const degree = new Map<string, number>();
    preview.edges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    });
    degree.forEach((count) => expect(count).toBeLessThanOrEqual(2));
  });
});

describe("sparsifyEdges", () => {
  it("keeps the strongest links per node and always keeps direct links", async () => {
    const { sparsifyEdges } = await import("@/lib/graph-engine");
    const edges = [
      { source: "a", target: "b", weight: 9, kind: "semantic" as const },
      { source: "a", target: "c", weight: 5, kind: "semantic" as const },
      { source: "a", target: "d", weight: 1, kind: "semantic" as const },
      { source: "a", target: "e", weight: 1, kind: "direct" as const },
      { source: "c", target: "d", weight: 2, kind: "semantic" as const },
    ];
    const kept = sparsifyEdges(edges, 1);
    const keys = kept.map((e) => `${e.source}-${e.target}`);
    expect(keys).toContain("a-b"); // top for a and b
    expect(keys).toContain("a-e"); // direct links survive
    expect(keys).toContain("c-d"); // top for d (and c's strongest is a-c)
    expect(keys).toContain("a-c"); // top for c
    expect(sparsifyEdges(edges, 0)).toHaveLength(edges.length);
  });
});

describe("detectClusters", () => {
  it("groups densely connected nodes and labels them by their common tag", async () => {
    const { detectClusters } = await import("@/lib/graph-engine");
    const nodes = [
      { id: "a1", tags: ["ai"] },
      { id: "a2", tags: ["ai"] },
      { id: "a3", tags: ["ai", "coding"] },
      { id: "b1", tags: ["filsafat"] },
      { id: "b2", tags: ["filsafat"] },
      { id: "solo", tags: [] },
    ];
    const edges = [
      { source: "a1", target: "a2", weight: 5, kind: "semantic" as const },
      { source: "a2", target: "a3", weight: 5, kind: "semantic" as const },
      { source: "a1", target: "a3", weight: 5, kind: "semantic" as const },
      { source: "b1", target: "b2", weight: 5, kind: "semantic" as const },
      { source: "a3", target: "b1", weight: 1, kind: "semantic" as const },
    ];
    const { clusterOf, clusters } = detectClusters(nodes, edges);
    expect(clusterOf.get("a1")).toBe(clusterOf.get("a2"));
    expect(clusterOf.get("a1")).toBe(clusterOf.get("a3"));
    expect(clusterOf.get("b1")).toBe(clusterOf.get("b2"));
    expect(clusterOf.get("a1")).not.toBe(clusterOf.get("b1"));
    expect(clusters[0].label).toBe("#ai");
    expect(clusters[0].size).toBe(3);
  });
});

describe("buildHybridGraph", () => {
  it("caches the graph per post list", async () => {
    const { buildHybridGraph } = await import("@/lib/graph-engine");
    const posts = [
      { slug: "x", title: "X", summary: "", type: "essay", category: "Tech", tags: ["t"], date: "2026-01-01", readingTime: 1 },
      { slug: "y", title: "Y", summary: "", type: "note", category: "Tech", tags: ["t"], date: "2026-01-02", readingTime: 1 },
    ] as Parameters<typeof buildHybridGraph>[0];
    const first = buildHybridGraph(posts);
    expect(buildHybridGraph(posts)).toBe(first);
    expect(first.edges).toHaveLength(1);
    expect(first.edges[0].kind).toBe("semantic");
  });
});
