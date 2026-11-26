import type { Post } from "@/data/types";

export type GraphEdgeKind = "direct" | "semantic" | "category";

export interface GraphNodeData {
  id: string;
  slug: string;
  title: string;
  summary: string;
  type: Post["type"];
  category: string;
  tags: string[];
}

export interface GraphEdgeData {
  source: string;
  target: string;
  weight: number;
  kind: GraphEdgeKind;
}

export interface HybridGraphData {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  neighbors: Map<string, Set<string>>;
}

export interface PreviewGraphOptions {
  focusId?: string;
  maxNodes?: number;
  maxEdges?: number;
  maxFocusNeighbors?: number;
  maxEdgesPerNode?: number;
  includeCategoryEdges?: boolean;
}

function normalizeText(value: unknown) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.toLowerCase().trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asPhrase(slug: string) {
  return slug.replace(/[-_]+/g, " ").trim();
}

interface PreparedNode {
  node: GraphNodeData;
  summary: string;
  slug: string;
  tagSet: Set<string>;
  tagList: string[];
  phraseRegex: RegExp | null;
}

function prepareNode(node: GraphNodeData): PreparedNode {
  const slug = normalizeText(node.slug);
  const phrase = normalizeText(asPhrase(node.slug));
  const tagList = node.tags.map(normalizeText);
  return {
    node,
    summary: normalizeText(node.summary || ""),
    slug,
    tagSet: new Set(tagList),
    tagList,
    // Keep phrase matching strict to avoid random accidental matches.
    phraseRegex: phrase.length >= 5 ? new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i") : null,
  };
}

function scoreDirectLink(from: PreparedNode, to: PreparedNode): number {
  const summary = from.summary;
  const toSlug = to.slug;
  const taggedTarget = from.tagSet.has(toSlug);

  if (!summary) {
    return taggedTarget ? 2 : 0;
  }

  let score = 0;
  if (summary.includes(`[[${toSlug}]]`)) score += 3;
  if (summary.includes(`/writing/${toSlug}`) || summary.includes(`/artikel/${toSlug}`)) score += 3;
  if (summary.includes(`#${toSlug}`)) score += 2;
  if (taggedTarget) score += 2;
  if (to.phraseRegex && to.phraseRegex.test(summary)) score += 1;

  return score;
}

function getSharedTagCount(a: PreparedNode, b: PreparedNode): number {
  let count = 0;
  for (const tag of b.tagList) {
    if (a.tagSet.has(tag)) count += 1;
  }
  return count;
}

function getKind(directScore: number, semanticScore: number, categoryScore: number): GraphEdgeKind {
  if (directScore > 0) return "direct";
  if (semanticScore > 0) return "semantic";
  if (categoryScore > 0) return "category";
  return "semantic";
}

// The post list is static for the lifetime of the app, so the (quadratic) graph
// build is cached per array instance instead of being recomputed on every mount.
const hybridGraphCache = new WeakMap<Post[], HybridGraphData>();

export function buildHybridGraph(posts: Post[]): HybridGraphData {
  const cached = hybridGraphCache.get(posts);
  if (cached) return cached;

  const nodes: GraphNodeData[] = posts.map((post) => ({
    id: post.slug,
    slug: post.slug,
    title: post.title,
    summary: post.summary || "",
    type: post.type,
    category: post.category || "uncategorized",
    tags: post.tags || [],
  }));
  const prepared = nodes.map(prepareNode);

  const edges: GraphEdgeData[] = [];
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) neighbors.set(node.id, new Set());

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      const directScore = scoreDirectLink(a, b) + scoreDirectLink(b, a);
      const sharedTags = getSharedTagCount(a, b);
      const semanticScore = sharedTags * 1.2;
      const categoryScore = a.node.category === b.node.category ? 1 : 0;

      if (directScore <= 0 && semanticScore <= 0 && categoryScore <= 0) {
        continue;
      }

      const kind = getKind(directScore, semanticScore, categoryScore);
      const baseWeight =
        directScore > 0
          ? 5 + Math.min(4, directScore) + semanticScore * 0.4 + categoryScore * 0.3
          : semanticScore > 0
            ? semanticScore * 1.3 + categoryScore * 0.9
            : 1.1;

      const weight = Math.min(10, Math.max(1, baseWeight));
      edges.push({ source: a.node.id, target: b.node.id, weight, kind });
      neighbors.get(a.node.id)?.add(b.node.id);
      neighbors.get(b.node.id)?.add(a.node.id);
    }
  }

  const graph = { nodes, edges, neighbors };
  hybridGraphCache.set(posts, graph);
  return graph;
}

/**
 * Keeps the strongest links per node so the global graph shows structure instead
 * of a hairball. An edge survives when it is within the top `perNode` links of
 * either endpoint. Direct links are always kept.
 */
export function sparsifyEdges<T extends GraphEdgeData>(edges: T[], perNode: number): T[] {
  if (!Number.isFinite(perNode) || perNode <= 0) return edges;
  const byNode = new Map<string, T[]>();
  for (const edge of edges) {
    if (!byNode.has(edge.source)) byNode.set(edge.source, []);
    if (!byNode.has(edge.target)) byNode.set(edge.target, []);
    byNode.get(edge.source)!.push(edge);
    byNode.get(edge.target)!.push(edge);
  }
  const keep = new Set<T>();
  byNode.forEach((list) => {
    list
      .slice()
      .sort((a, b) => b.weight - a.weight || (a.source + a.target).localeCompare(b.source + b.target))
      .slice(0, perNode)
      .forEach((edge) => keep.add(edge));
  });
  return edges.filter((edge) => edge.kind === "direct" || keep.has(edge));
}

export interface GraphCluster {
  id: number;
  label: string;
  size: number;
}

/**
 * Deterministic weighted label propagation. Returns a cluster index per node
 * (0 = largest cluster) plus a readable label derived from the most common tag.
 */
export function detectClusters(
  nodes: Pick<GraphNodeData, "id" | "tags">[],
  edges: GraphEdgeData[],
  iterations = 12
): { clusterOf: Map<string, number>; clusters: GraphCluster[] } {
  const ids = nodes.map((n) => n.id).sort();
  const label = new Map<string, string>(ids.map((id) => [id, id]));
  const adjacency = new Map<string, Array<{ id: string; w: number }>>();
  ids.forEach((id) => adjacency.set(id, []));
  edges.forEach((e) => {
    adjacency.get(e.source)?.push({ id: e.target, w: e.weight });
    adjacency.get(e.target)?.push({ id: e.source, w: e.weight });
  });

  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    // Rotate the visiting order each pass so propagation does not stall.
    const offset = (iter * 7919) % Math.max(1, ids.length);
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(k + offset) % ids.length];
      const adj = adjacency.get(id);
      if (!adj || adj.length === 0) continue;
      const score = new Map<string, number>();
      adj.forEach(({ id: other, w }) => {
        const l = label.get(other)!;
        score.set(l, (score.get(l) ?? 0) + w);
      });
      let best = label.get(id)!;
      let bestScore = score.get(best) ?? 0;
      score.forEach((value, l) => {
        if (value > bestScore + 1e-9 || (Math.abs(value - bestScore) <= 1e-9 && l < best)) {
          best = l;
          bestScore = value;
        }
      });
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const groups = new Map<string, string[]>();
  label.forEach((l, id) => {
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(id);
  });
  const tagsById = new Map(nodes.map((n) => [n.id, n.tags]));
  const sorted = Array.from(groups.values()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const clusterOf = new Map<string, number>();
  const usedLabels = new Set<string>();
  const clusters: GraphCluster[] = sorted.map((members, index) => {
    members.forEach((id) => clusterOf.set(id, index));
    const tagCount = new Map<string, number>();
    members.forEach((id) => (tagsById.get(id) ?? []).forEach((t) => {
      const tag = normalizeText(t);
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }));
    const ranked = Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const pick = ranked.find(([tag]) => !usedLabels.has(tag))?.[0] ?? ranked[0]?.[0];
    if (pick) usedLabels.add(pick);
    return { id: index, label: members.length === 1 ? "lainnya" : pick ? `#${pick}` : `klaster ${index + 1}`, size: members.length };
  });

  return { clusterOf, clusters };
}

export function buildPreviewGraph(
  graph: HybridGraphData,
  options: PreviewGraphOptions = {}
): HybridGraphData {
  const {
    focusId,
    maxNodes = 48,
    maxEdges = 120,
    maxFocusNeighbors = 18,
    maxEdgesPerNode = 7,
    includeCategoryEdges = false,
  } = options;

  if (includeCategoryEdges && graph.nodes.length <= maxNodes && graph.edges.length <= maxEdges) {
    return graph;
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidateEdges = graph.edges
    .filter((edge) => includeCategoryEdges || edge.kind !== "category")
    .sort((a, b) => b.weight - a.weight);

  const selectedNodes = new Set<string>();
  const addNode = (id: string) => {
    if (!nodeById.has(id) || selectedNodes.has(id) || selectedNodes.size >= maxNodes) return false;
    selectedNodes.add(id);
    return true;
  };

  if (focusId) addNode(focusId);

  if (focusId && maxFocusNeighbors > 0) {
    let focusCount = 0;
    for (const edge of candidateEdges) {
      if (focusCount >= maxFocusNeighbors || selectedNodes.size >= maxNodes) break;
      if (edge.source !== focusId && edge.target !== focusId) continue;
      const peerId = edge.source === focusId ? edge.target : edge.source;
      if (addNode(peerId)) focusCount += 1;
    }
  }

  for (const edge of candidateEdges) {
    if (selectedNodes.size >= maxNodes) break;
    const hasSource = selectedNodes.has(edge.source);
    const hasTarget = selectedNodes.has(edge.target);
    if (hasSource && hasTarget) continue;
    if (hasSource || hasTarget) {
      addNode(hasSource ? edge.target : edge.source);
    }
  }

  for (const edge of candidateEdges) {
    if (selectedNodes.size >= maxNodes) break;
    const hasSource = selectedNodes.has(edge.source);
    const hasTarget = selectedNodes.has(edge.target);
    if (hasSource && hasTarget) continue;
    addNode(edge.source);
    addNode(edge.target);
  }

  if (selectedNodes.size === 0) {
    for (const node of graph.nodes) {
      if (!addNode(node.id)) break;
    }
  }

  const selectedEdges: GraphEdgeData[] = [];
  const degreeByNode = new Map<string, number>();
  for (const edge of candidateEdges) {
    if (selectedEdges.length >= maxEdges) break;
    if (!selectedNodes.has(edge.source) || !selectedNodes.has(edge.target)) continue;

    const sourceDegree = degreeByNode.get(edge.source) ?? 0;
    const targetDegree = degreeByNode.get(edge.target) ?? 0;
    if (sourceDegree >= maxEdgesPerNode || targetDegree >= maxEdgesPerNode) continue;

    selectedEdges.push(edge);
    degreeByNode.set(edge.source, sourceDegree + 1);
    degreeByNode.set(edge.target, targetDegree + 1);
  }

  const selectedNodeList = graph.nodes.filter((node) => selectedNodes.has(node.id));
  const neighbors = new Map<string, Set<string>>();
  selectedNodeList.forEach((node) => neighbors.set(node.id, new Set()));
  selectedEdges.forEach((edge) => {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  });

  return {
    nodes: selectedNodeList,
    edges: selectedEdges,
    neighbors,
  };
}

function hashString(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

export function seededUnit(seed: string) {
  return (hashString(seed) % 1000) / 1000;
}
