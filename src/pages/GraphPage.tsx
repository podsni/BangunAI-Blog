import { useRef, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ZoomIn, ZoomOut, Search, ArrowLeft, RotateCcw, Focus, SlidersHorizontal, ChevronDown, Download, X } from "lucide-react";
import { allPosts } from "@/content";
import { buildHybridGraph, detectClusters, seededUnit, sparsifyEdges, type GraphEdgeKind } from "@/lib/graph-engine";
import {
  clusterColor,
  fitCamera,
  hitTest,
  radiusForDegree,
  renderGraph,
  rgba,
  stepSimulation,
  useGraphTheme,
  zoomAt,
  type Camera,
  type GraphTheme,
  type RenderLink,
  type RenderNode,
  type RGB,
  type SimNode,
} from "@/lib/graph-canvas";

type ColorMode = "cluster" | "type" | "category";

interface PageNode extends SimNode, RenderNode {
  slug: string;
  title: string;
  type: string;
  category: string;
  tags: string[];
  searchText: string;
}

const MIN_SCALE = 0.08;
const MAX_SCALE = 5;
const MAX_DPR = 2;
const TYPES = ["note", "essay", "article"] as const;

const DEFAULT_GRAPH_SETTINGS = {
  colorMode: "cluster" as ColorMode,
  linkDensity: 6,
  showLines: true,
  alwaysShowLines: false,
  showArrows: false,
  textFadeThreshold: 1.6,
  nodeSizeScale: 1,
  linkThicknessScale: 1,
  isAnimating: true,
  centerForceScale: 1,
  repelForceScale: 1,
  linkForceScale: 1,
  linkDistance: 120,
};

const postHref = (type: string, slug: string) => (type === "article" ? `/artikel/${slug}` : `/writing/${slug}`);
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
const toCss = (c: RGB) => rgba(c, 1);

/* ---------------------------- small UI pieces ---------------------------- */
/* Declared outside the page so React keeps them mounted between renders      */
/* (inline component definitions remounted every slider on each change).     */

function ControlBtn({
  onClick,
  title,
  children,
  active,
  className = "",
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded-lg border transition-colors shadow-sm backdrop-blur-sm ${
        active
          ? "bg-primary/20 border-primary/40 text-primary"
          : "bg-background/90 border-border/40 text-muted-foreground/80 hover:text-foreground hover:bg-background hover:border-border/70"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-border/70"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="w-full flex items-center justify-between text-left mb-2">
      <span className="text-xs font-medium text-foreground/90">{title}</span>
      <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
    </button>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/80">{label}</span>
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">
          {format ? format(value) : value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-primary cursor-pointer"
      />
    </label>
  );
}

/* --------------------------------- page --------------------------------- */

export default function GraphPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get("focus");
  const theme = useGraphTheme();

  const allTags = useMemo(
    () => Array.from(new Set(allPosts.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b)),
    []
  );
  const allCategories = useMemo(
    () => Array.from(new Set(allPosts.map((p) => p.category))).sort((a, b) => a.localeCompare(b)),
    []
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (focusParam && allPosts.some((p) => p.slug === focusParam) ? focusParam : null)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [activeTypes, setActiveTypes] = useState<string[]>([...TYPES]);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [showKinds, setShowKinds] = useState<Record<GraphEdgeKind, boolean>>({ direct: true, semantic: true, category: false });
  const [colorMode, setColorMode] = useState<ColorMode>(DEFAULT_GRAPH_SETTINGS.colorMode);
  const [linkDensity, setLinkDensity] = useState(DEFAULT_GRAPH_SETTINGS.linkDensity);
  const [showLines, setShowLines] = useState(DEFAULT_GRAPH_SETTINGS.showLines);
  const [alwaysShowLines, setAlwaysShowLines] = useState(DEFAULT_GRAPH_SETTINGS.alwaysShowLines);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(true);
  const [forcesOpen, setForcesOpen] = useState(true);
  const [showArrows, setShowArrows] = useState(DEFAULT_GRAPH_SETTINGS.showArrows);
  const [textFadeThreshold, setTextFadeThreshold] = useState(DEFAULT_GRAPH_SETTINGS.textFadeThreshold);
  const [nodeSizeScale, setNodeSizeScale] = useState(DEFAULT_GRAPH_SETTINGS.nodeSizeScale);
  const [linkThicknessScale, setLinkThicknessScale] = useState(DEFAULT_GRAPH_SETTINGS.linkThicknessScale);
  const [isAnimating, setIsAnimating] = useState(DEFAULT_GRAPH_SETTINGS.isAnimating);
  const [centerForceScale, setCenterForceScale] = useState(DEFAULT_GRAPH_SETTINGS.centerForceScale);
  const [repelForceScale, setRepelForceScale] = useState(DEFAULT_GRAPH_SETTINGS.repelForceScale);
  const [linkForceScale, setLinkForceScale] = useState(DEFAULT_GRAPH_SETTINGS.linkForceScale);
  const [linkDistance, setLinkDistance] = useState(DEFAULT_GRAPH_SETTINGS.linkDistance);
  const [zoomDisplay, setZoomDisplay] = useState(100);
  const [pinVersion, setPinVersion] = useState(0);

  const camRef = useRef<Camera>({ x: 0, y: 0, scale: 0.6 });
  const camTargetRef = useRef<Camera | null>(null);
  const autoFitRef = useRef(true);
  const pendingFocusRef = useRef<string | null>(selectedId);
  const sizeRef = useRef({ w: 0, h: 0 });
  const alphaRef = useRef(1);
  const dirtyRef = useRef(true);
  const highlightTRef = useRef(0);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const hoveredRef = useRef(hoveredId);
  hoveredRef.current = hoveredId;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  /* ------------------------------ graph data ------------------------------ */

  const fullGraph = useMemo(() => buildHybridGraph(allPosts), []);

  const nodes = useMemo<PageNode[]>(() => {
    const count = Math.max(1, fullGraph.nodes.length);
    return fullGraph.nodes.map((node, i) => {
      const angle = (i / count) * Math.PI * 2 + seededUnit(`${node.id}:angle`) * 0.8;
      const radius = 120 + seededUnit(`${node.id}:radius`) * 260;
      return {
        id: node.id,
        slug: node.slug,
        title: node.title,
        label: node.title,
        type: node.type,
        category: node.category,
        tags: node.tags,
        searchText: `${node.title} ${node.tags.join(" ")} ${node.category}`.toLowerCase(),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: 4,
        pinned: false,
        importance: 0,
        color: [148, 163, 184],
      };
    });
  }, [fullGraph]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const visibleNodeIds = useMemo(() => {
    return new Set(
      allPosts
        .filter((p) => activeTypes.includes(p.type))
        .filter((p) => activeCategories.length === 0 || activeCategories.includes(p.category))
        .filter((p) => selectedTag === "all" || p.tags.includes(selectedTag))
        .map((p) => p.slug)
    );
  }, [activeTypes, activeCategories, selectedTag]);

  const kindEdges = useMemo(
    () => fullGraph.edges.filter((e) => showKinds[e.kind] && visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [fullGraph, showKinds, visibleNodeIds]
  );
  const visibleEdges = useMemo(() => sparsifyEdges(kindEdges, linkDensity), [kindEdges, linkDensity]);

  const visibleNeighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    visibleNodeIds.forEach((id) => map.set(id, new Set()));
    visibleEdges.forEach((e) => {
      map.get(e.source)?.add(e.target);
      map.get(e.target)?.add(e.source);
    });
    return map;
  }, [visibleNodeIds, visibleEdges]);

  const clustering = useMemo(() => {
    const visible = nodes.filter((n) => visibleNodeIds.has(n.id));
    return detectClusters(visible, visibleEdges.filter((e) => e.kind !== "category"));
  }, [nodes, visibleNodeIds, visibleEdges]);

  const categoryIndex = useMemo(() => {
    const counts = new Map<string, number>();
    allPosts.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { index: new Map(ranked.map(([c], i) => [c, i])), ranked };
  }, []);

  // Simulation/render subset (visible nodes only) with index-based links.
  const scene = useMemo(() => {
    const list = nodes.filter((n) => visibleNodeIds.has(n.id));
    const idx = new Map(list.map((n, i) => [n.id, i]));
    const links: RenderLink[] = visibleEdges.map((e) => ({
      source: idx.get(e.source)!,
      target: idx.get(e.target)!,
      weight: e.weight,
      kind: e.kind,
    }));
    return { list, idx, links };
  }, [nodes, visibleNodeIds, visibleEdges]);

  const colorFor = useCallback(
    (n: PageNode, t: GraphTheme): RGB => {
      if (colorMode === "type") return t.typeColors[n.type] ?? t.fallback;
      if (colorMode === "category") {
        const i = categoryIndex.index.get(n.category);
        return i !== undefined && i < 9 ? clusterColor(t, i) : t.fallback;
      }
      const c = clustering.clusterOf.get(n.id);
      const size = c !== undefined ? clustering.clusters[c]?.size ?? 0 : 0;
      return c !== undefined && c < 10 && size > 1 ? clusterColor(t, c) : t.fallback;
    },
    [colorMode, categoryIndex, clustering]
  );

  // Sizes and colours are written onto the live simulation nodes.
  useEffect(() => {
    const degree = new Map<string, number>();
    visibleEdges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    });
    const maxDegree = Math.max(1, ...Array.from(degree.values()));
    nodes.forEach((n) => {
      const d = degree.get(n.id) ?? 0;
      n.importance = d;
      n.radius = radiusForDegree(d, maxDegree, 3.5, 14) * nodeSizeScale;
      n.color = colorFor(n, theme);
    });
    dirtyRef.current = true;
  }, [nodes, visibleEdges, nodeSizeScale, colorFor, theme]);

  // Reheat + refit whenever the visible graph or forces change.
  useEffect(() => {
    alphaRef.current = Math.max(alphaRef.current, 0.7);
    dirtyRef.current = true;
  }, [scene, centerForceScale, repelForceScale, linkForceScale, linkDistance]);
  useEffect(() => {
    if (!pendingFocusRef.current) autoFitRef.current = true;
  }, [visibleNodeIds]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [hoveredId, selectedId, searchQuery, showArrows, linkThicknessScale, alwaysShowLines, textFadeThreshold]);

  useEffect(() => {
    if (selectedId && !visibleNodeIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleNodeIds]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const searchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return new Set(scene.list.filter((n) => n.searchText.includes(q)).map((n) => n.id));
  }, [searchQuery, scene]);

  /* ------------------------------ canvas size ----------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      sizeRef.current = { w: rect.width, h: rect.height };
      dirtyRef.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------- main loop ------------------------------ */

  const renderNow = useCallback(
    (ctx: CanvasRenderingContext2D, drawBackground = false) => {
      const { w: W, h: H } = sizeRef.current;
      const hovered = hoveredRef.current;
      const selected = selectedRef.current;
      const anchor = hovered ?? selected;
      const highlightIds = anchor ? new Set([anchor, ...(visibleNeighbors.get(anchor) ?? [])]) : null;
      if (highlightIds && selected) highlightIds.add(selected);
      renderGraph(ctx, {
        W,
        H,
        dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
        camera: camRef.current,
        theme: themeRef.current,
        nodes: scene.list,
        links: showLines ? scene.links : [],
        focusId: selected,
        hoverId: hovered,
        highlightIds,
        highlightT: highlightTRef.current,
        searchIds,
        labelScale: textFadeThreshold,
        linkOpacity: alwaysShowLines ? 2.2 : 1,
        linkThickness: linkThicknessScale,
        showArrows,
        maxLabelChars: 30,
        drawBackground,
      });
    },
    [scene, visibleNeighbors, searchIds, showLines, textFadeThreshold, alwaysShowLines, linkThicknessScale, showArrows]
  );

  const dragIndexRef = useRef(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastZoom = -1;
    let paused = document.visibilityState === "hidden";
    const onVisibility = () => {
      paused = document.visibilityState === "hidden";
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = () => {
      if (paused) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const { w: W, h: H } = sizeRef.current;
      const list = scene.list;

      if (isAnimating && alphaRef.current > 0.003) {
        stepSimulation(list, scene.links, {
          repel: 2000 * repelForceScale,
          linkStrength: 0.032 * linkForceScale,
          linkDistance: (w) => linkDistance * (1.2 - Math.min(10, w) * 0.06),
          center: 0.0042 * centerForceScale,
          damping: 0.8,
          maxSpeed: 12,
          alpha: alphaRef.current,
          draggedIndex: dragIndexRef.current >= 0 ? dragIndexRef.current : undefined,
        });
        alphaRef.current *= 0.986;
        dirtyRef.current = true;
      }

      // Camera follow: focus target, then auto-fit, then explicit animations.
      if (W > 0) {
        const focusId = pendingFocusRef.current;
        if (focusId) {
          const i = scene.idx.get(focusId);
          if (i !== undefined) {
            const n = list[i];
            const s = Math.max(1.1, textFadeThreshold * 1.05);
            camTargetRef.current = { scale: s, x: -n.x * s, y: -n.y * s };
          }
          if (alphaRef.current < 0.08) pendingFocusRef.current = null;
        } else if (autoFitRef.current) {
          const fit = fitCamera(list, W, H, { padding: W < 640 ? 18 : 48, maxScale: 1.5, minScale: MIN_SCALE });
          if (fit) camTargetRef.current = fit;
          if (alphaRef.current < 0.03) autoFitRef.current = false;
        }
      }
      const target = camTargetRef.current;
      if (target) {
        const cam = camRef.current;
        const k = 0.14;
        const next = {
          x: cam.x + (target.x - cam.x) * k,
          y: cam.y + (target.y - cam.y) * k,
          scale: cam.scale + (target.scale - cam.scale) * k,
        };
        const done =
          Math.abs(next.x - target.x) < 0.3 && Math.abs(next.y - target.y) < 0.3 && Math.abs(next.scale - target.scale) < 0.001;
        camRef.current = done ? target : next;
        if (done && !autoFitRef.current && !pendingFocusRef.current) camTargetRef.current = null;
        if (!done) dirtyRef.current = true;
      }

      const wantT = hoveredRef.current || selectedRef.current ? 1 : 0;
      if (Math.abs(highlightTRef.current - wantT) > 0.01) {
        highlightTRef.current += (wantT - highlightTRef.current) * 0.18;
        dirtyRef.current = true;
      } else {
        highlightTRef.current = wantT;
      }

      if (dirtyRef.current && W > 0) {
        dirtyRef.current = false;
        renderNow(ctx);
        const z = Math.round(camRef.current.scale * 100);
        if (z !== lastZoom) {
          lastZoom = z;
          setZoomDisplay(z);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scene, renderNow, isAnimating, repelForceScale, linkForceScale, linkDistance, centerForceScale, textFadeThreshold]);

  /* -------------------------------- camera -------------------------------- */

  const takeCamera = useCallback(() => {
    autoFitRef.current = false;
    pendingFocusRef.current = null;
    camTargetRef.current = null;
  }, []);

  const setCamera = useCallback((cam: Camera) => {
    camRef.current = cam;
    dirtyRef.current = true;
  }, []);

  const animateCamera = useCallback((cam: Camera) => {
    autoFitRef.current = false;
    pendingFocusRef.current = null;
    camTargetRef.current = cam;
    dirtyRef.current = true;
  }, []);

  const zoom = useCallback(
    (factor: number) => {
      const { w, h } = sizeRef.current;
      const base = camTargetRef.current ?? camRef.current;
      animateCamera(zoomAt(base, w, h, w / 2, h / 2, clampScale(base.scale * factor)));
    },
    [animateCamera]
  );

  const fitToContent = useCallback(() => {
    const { w, h } = sizeRef.current;
    const fit = fitCamera(scene.list, w, h, { padding: w < 640 ? 18 : 48, maxScale: 1.5, minScale: MIN_SCALE });
    if (fit) animateCamera(fit);
  }, [animateCamera, scene]);

  const focusNode = useCallback(
    (id: string) => {
      const n = nodeById.get(id);
      if (!n) return;
      setSelectedId(id);
      const s = Math.max(camRef.current.scale, Math.max(1.1, textFadeThreshold * 1.05));
      animateCamera({ scale: s, x: -n.x * s, y: -n.y * s });
    },
    [nodeById, animateCamera, textFadeThreshold]
  );

  const resetView = useCallback(() => {
    nodes.forEach((n) => {
      n.pinned = false;
    });
    setPinVersion((v) => v + 1);
    setSelectedId(null);
    alphaRef.current = 1;
    pendingFocusRef.current = null;
    autoFitRef.current = true;
    dirtyRef.current = true;
  }, [nodes]);

  /* -------------------------------- input --------------------------------- */

  const getPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { mx: clientX - rect.left, my: clientY - rect.top } : { mx: 0, my: 0 };
  }, []);

  const nodeIndexAt = useCallback(
    (mx: number, my: number, slop = 5) => {
      const { w, h } = sizeRef.current;
      return hitTest(scene.list, camRef.current, w, h, mx, my, slop);
    },
    [scene]
  );

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "none" | "pan" | "node" | "pinch";
    index: number;
    startX: number;
    startY: number;
    camX: number;
    camY: number;
    moved: boolean;
    wasPinned: boolean;
    pinchDist: number;
    pinchMid: { x: number; y: number };
  }>({ mode: "none", index: -1, startX: 0, startY: 0, camX: 0, camY: 0, moved: false, wasPinned: false, pinchDist: 0, pinchMid: { x: 0, y: 0 } });
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  const pinchInfo = () => {
    const pts = Array.from(pointers.current.values());
    const [a, b] = pts;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;

      if (pointers.current.size === 2) {
        // Second finger: switch to pinch, release any node being dragged.
        if (g.mode === "node" && g.index >= 0 && !g.moved) scene.list[g.index].pinned = g.wasPinned;
        dragIndexRef.current = -1;
        const { dist, mid } = pinchInfo();
        g.mode = "pinch";
        g.moved = true;
        g.pinchDist = dist;
        g.pinchMid = mid;
        return;
      }
      if (pointers.current.size > 2) return;

      const { mx, my } = getPos(e.clientX, e.clientY);
      const index = nodeIndexAt(mx, my, e.pointerType === "touch" ? 12 : 5);
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.camX = camRef.current.x;
      g.camY = camRef.current.y;
      g.moved = false;
      g.index = index;
      if (index >= 0) {
        g.mode = "node";
        g.wasPinned = scene.list[index].pinned;
      } else {
        g.mode = "pan";
      }
    },
    [getPos, nodeIndexAt, scene]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const g = gesture.current;
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { mx, my } = getPos(e.clientX, e.clientY);

      if (g.mode === "pinch" && pointers.current.size >= 2) {
        takeCamera();
        const { dist, mid } = pinchInfo();
        const { w, h } = sizeRef.current;
        const rect = canvasRef.current!.getBoundingClientRect();
        let cam = zoomAt(camRef.current, w, h, mid.x - rect.left, mid.y - rect.top, clampScale(camRef.current.scale * (dist / g.pinchDist)));
        cam = { ...cam, x: cam.x + (mid.x - g.pinchMid.x), y: cam.y + (mid.y - g.pinchMid.y) };
        setCamera(cam);
        g.pinchDist = dist;
        g.pinchMid = mid;
        return;
      }

      if (g.mode !== "none" && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > (e.pointerType === "touch" ? 8 : 3)) {
        g.moved = true;
      }

      if (g.mode === "node" && g.moved) {
        const node = scene.list[g.index];
        const cam = camRef.current;
        const { w, h } = sizeRef.current;
        node.x = (mx - w / 2 - cam.x) / cam.scale;
        node.y = (my - h / 2 - cam.y) / cam.scale;
        node.pinned = true;
        dragIndexRef.current = g.index;
        alphaRef.current = Math.max(alphaRef.current, 0.3);
        autoFitRef.current = false;
        pendingFocusRef.current = null;
        dirtyRef.current = true;
        return;
      }
      if (g.mode === "pan") {
        if (g.moved) {
          takeCamera();
          setCamera({ ...camRef.current, x: g.camX + (e.clientX - g.startX), y: g.camY + (e.clientY - g.startY) });
        }
        return;
      }
      if (e.pointerType === "mouse") {
        const index = nodeIndexAt(mx, my);
        const id = index >= 0 ? scene.list[index].id : null;
        if (id !== hoveredRef.current) setHoveredId(id);
        e.currentTarget.style.cursor = index >= 0 ? "pointer" : "grab";
      }
    },
    [getPos, nodeIndexAt, scene, setCamera, takeCamera]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      const g = gesture.current;

      if (g.mode === "pinch") {
        if (pointers.current.size === 0) g.mode = "none";
        return;
      }
      if (g.mode === "node") {
        const node = scene.list[g.index];
        dragIndexRef.current = -1;
        if (node && !g.moved) {
          node.pinned = g.wasPinned;
          const now = Date.now();
          if (lastTap.current && lastTap.current.id === node.id && now - lastTap.current.t < 350) {
            lastTap.current = null;
            navigate(postHref(node.type, node.slug));
          } else {
            lastTap.current = { id: node.id, t: now };
            setSelectedId((prev) => (prev === node.id && e.pointerType === "mouse" ? null : node.id));
          }
        } else if (node && g.moved) {
          setPinVersion((v) => v + 1);
        }
      } else if (g.mode === "pan" && !g.moved) {
        setSelectedId(null);
        lastTap.current = null;
      }
      g.mode = "none";
      g.index = -1;
    },
    [navigate, scene]
  );

  const handlePointerLeave = useCallback(() => {
    if (gesture.current.mode === "none") setHoveredId(null);
  }, []);

  // Native, non-passive wheel listener: React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      takeCamera();
      const { mx, my } = getPos(e.clientX, e.clientY);
      const { w, h } = sizeRef.current;
      const speed = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.0013;
      const factor = Math.exp(-e.deltaY * speed);
      setCamera(zoomAt(camRef.current, w, h, mx, my, clampScale(camRef.current.scale * factor)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [getPos, setCamera, takeCamera]);

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderNow(ctx, true);
    const link = document.createElement("a");
    link.download = "graph-bangunai.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    dirtyRef.current = true;
  }, [renderNow]);

  const submitSearch = useCallback(() => {
    if (!searchIds || searchIds.size === 0) return;
    const best = scene.list
      .filter((n) => searchIds.has(n.id))
      .sort((a, b) => {
        const q = searchQuery.trim().toLowerCase();
        const at = a.title.toLowerCase().includes(q) ? 1 : 0;
        const bt = b.title.toLowerCase().includes(q) ? 1 : 0;
        return bt - at || b.importance - a.importance;
      })[0];
    if (best) focusNode(best.id);
  }, [searchIds, scene, searchQuery, focusNode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") zoom(1.3);
      else if (e.key === "-") zoom(1 / 1.3);
      else if (e.key === "0") resetView();
      else if (e.key === "f" || e.key === "F") fitToContent();
      else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom, resetView, fitToContent]);

  /* ------------------------------ derived UI ------------------------------ */

  const selectedPost = useMemo(() => (selectedId ? allPosts.find((p) => p.slug === selectedId) || null : null), [selectedId]);
  const connectedPosts = useMemo(() => {
    if (!selectedId) return [];
    const connected = visibleNeighbors.get(selectedId) ?? new Set<string>();
    return allPosts.filter((p) => connected.has(p.slug));
  }, [selectedId, visibleNeighbors]);
  const selectedNodePinned = useMemo(() => {
    void pinVersion;
    return selectedId ? nodeById.get(selectedId)?.pinned ?? false : false;
  }, [selectedId, pinVersion, nodeById]);

  const legendItems = useMemo(() => {
    if (colorMode === "type") {
      return TYPES.map((t) => ({ key: t, label: t, color: toCss(theme.typeColors[t]) }));
    }
    if (colorMode === "category") {
      return categoryIndex.ranked
        .filter(([c]) => allPosts.some((p) => p.category === c && visibleNodeIds.has(p.slug)))
        .slice(0, 6)
        .map(([c]) => ({ key: c, label: c, color: toCss(clusterColor(theme, categoryIndex.index.get(c))) }));
    }
    return clustering.clusters
      .filter((c) => c.size > 1)
      .slice(0, 6)
      .map((c) => ({ key: String(c.id), label: c.label, color: toCss(clusterColor(theme, c.id)) }));
  }, [colorMode, theme, categoryIndex, clustering, visibleNodeIds]);

  const selectedColor = selectedId ? nodeById.get(selectedId)?.color : undefined;

  const toggleType = (type: string) =>
    setActiveTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  const toggleCategory = (category: string) =>
    setActiveCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  const toggleKind = (kind: GraphEdgeKind) => setShowKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));

  const resetFilters = () => {
    setSelectedTag("all");
    setActiveTypes([...TYPES]);
    setActiveCategories([]);
    setShowKinds({ direct: true, semantic: true, category: false });
    setColorMode(DEFAULT_GRAPH_SETTINGS.colorMode);
    setLinkDensity(DEFAULT_GRAPH_SETTINGS.linkDensity);
    setShowLines(DEFAULT_GRAPH_SETTINGS.showLines);
    setAlwaysShowLines(DEFAULT_GRAPH_SETTINGS.alwaysShowLines);
    setShowArrows(DEFAULT_GRAPH_SETTINGS.showArrows);
    setTextFadeThreshold(DEFAULT_GRAPH_SETTINGS.textFadeThreshold);
    setNodeSizeScale(DEFAULT_GRAPH_SETTINGS.nodeSizeScale);
    setLinkThicknessScale(DEFAULT_GRAPH_SETTINGS.linkThicknessScale);
    setIsAnimating(DEFAULT_GRAPH_SETTINGS.isAnimating);
    setCenterForceScale(DEFAULT_GRAPH_SETTINGS.centerForceScale);
    setRepelForceScale(DEFAULT_GRAPH_SETTINGS.repelForceScale);
    setLinkForceScale(DEFAULT_GRAPH_SETTINGS.linkForceScale);
    setLinkDistance(DEFAULT_GRAPH_SETTINGS.linkDistance);
  };
  const activeFilterCount =
    (selectedTag !== "all" ? 1 : 0) +
    (activeTypes.length !== TYPES.length ? 1 : 0) +
    (activeCategories.length > 0 ? 1 : 0) +
    (showKinds.direct && showKinds.semantic && !showKinds.category ? 0 : 1);

  const searchBox = (className: string) => (
    <div className={`relative ${className}`}>
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
      <input
        ref={className.includes("hidden") ? searchInputRef : undefined}
        type="search"
        placeholder="Cari catatan atau tag…  ( / )"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitSearch();
        }}
        aria-label="Cari node"
        className="pl-8 pr-14 py-1.5 text-xs bg-secondary/50 border border-border/40 rounded-lg w-full focus:outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
      />
      {searchIds && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 tabular-nums">
          {searchIds.size} hasil
        </span>
      )}
    </div>
  );

  return (
    <div className="h-[100svh] flex flex-col pt-14 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Kembali"
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-heading text-sm font-semibold whitespace-nowrap">Graph View</h1>
          <span className="text-[11px] text-muted-foreground/60 hidden md:inline whitespace-nowrap tabular-nums">
            {visibleNodeIds.size} catatan · {visibleEdges.length} koneksi
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={`ml-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors whitespace-nowrap ${
              settingsOpen ? "border-primary/40 bg-primary/15 text-primary" : "border-border/40 text-muted-foreground/80 hover:text-foreground"
            }`}
            aria-expanded={settingsOpen}
            title="Tampilkan/sembunyikan pengaturan"
          >
            <SlidersHorizontal size={12} />
            <span className="hidden sm:inline">{settingsOpen ? "Tutup Pengaturan" : "Pengaturan"}</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] leading-none">{activeFilterCount}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {searchBox("hidden sm:block w-56")}
          <ControlBtn onClick={() => zoom(1.3)} title="Zoom in (+)" className="hidden sm:inline-flex"><ZoomIn size={15} /></ControlBtn>
          <ControlBtn onClick={() => zoom(1 / 1.3)} title="Zoom out (-)" className="hidden sm:inline-flex"><ZoomOut size={15} /></ControlBtn>
          <ControlBtn onClick={fitToContent} title="Muat semua (F)"><Focus size={15} /></ControlBtn>
          <ControlBtn onClick={resetView} title="Reset tata letak (0)"><RotateCcw size={15} /></ControlBtn>
          <ControlBtn onClick={exportPNG} title="Ekspor PNG" className="hidden sm:inline-flex"><Download size={15} /></ControlBtn>
          <span className="text-[10px] text-muted-foreground/60 ml-1 min-w-[34px] text-right tabular-nums hidden sm:inline">{zoomDisplay}%</span>
        </div>
      </div>

      {/* Settings */}
      {settingsOpen && (
        <div className="px-3 sm:px-4 py-2.5 border-b border-border/30 bg-background/90 backdrop-blur-sm space-y-2.5 max-h-[50svh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Warna node</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip active={colorMode === "cluster"} onClick={() => setColorMode("cluster")}>Klaster</Chip>
                <Chip active={colorMode === "type"} onClick={() => setColorMode("type")}>Tipe</Chip>
                <Chip active={colorMode === "category"} onClick={() => setColorMode("category")}>Kategori</Chip>
              </div>
            </div>
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Tipe</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {TYPES.map((type) => (
                  <Chip key={type} active={activeTypes.includes(type)} onClick={() => toggleType(type)}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: toCss(theme.typeColors[type]) }} />
                    {type}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Koneksi</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {(["direct", "semantic", "category"] as GraphEdgeKind[]).map((kind) => (
                  <Chip key={kind} active={showKinds[kind]} onClick={() => toggleKind(kind)}>{kind}</Chip>
                ))}
                <Chip active={showLines} onClick={() => setShowLines((v) => !v)}>Garis {showLines ? "ON" : "OFF"}</Chip>
              </div>
            </div>
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Tag</p>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full px-2 py-1.5 text-[11px] bg-background/70 border border-border/40 rounded-md text-foreground"
              >
                <option value="all">Semua tag</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Kategori</p>
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-1 rounded-md text-[11px] border border-border/40 text-muted-foreground/80 hover:text-foreground"
              >
                Reset semua
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {allCategories.map((category) => (
                <Chip key={category} active={activeCategories.includes(category)} onClick={() => toggleCategory(category)}>
                  {category}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <SectionHeader title="Tampilan" open={displayOpen} onToggle={() => setDisplayOpen((v) => !v)} />
              {displayOpen && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={alwaysShowLines} onClick={() => setAlwaysShowLines((v) => !v)}>Garis tegas</Chip>
                    <Chip active={showArrows} onClick={() => setShowArrows((v) => !v)}>Panah</Chip>
                    <Chip active={isAnimating} onClick={() => setIsAnimating((v) => !v)}>Animasi {isAnimating ? "ON" : "OFF"}</Chip>
                  </div>
                  <RangeField
                    label="Kepadatan koneksi (per node)"
                    value={linkDensity}
                    min={0}
                    max={20}
                    step={1}
                    onChange={setLinkDensity}
                    format={(v) => (v === 0 ? "semua" : String(v))}
                  />
                  <RangeField label="Label muncul di zoom" value={textFadeThreshold} min={0.4} max={3} step={0.1} onChange={setTextFadeThreshold} format={(v) => `${Math.round(v * 100)}%`} />
                  <RangeField label="Ukuran node" value={nodeSizeScale} min={0.5} max={2} step={0.05} onChange={setNodeSizeScale} />
                  <RangeField label="Ketebalan garis" value={linkThicknessScale} min={0.3} max={3} step={0.1} onChange={setLinkThicknessScale} />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <SectionHeader title="Gaya (forces)" open={forcesOpen} onToggle={() => setForcesOpen((v) => !v)} />
              {forcesOpen && (
                <div className="space-y-2.5">
                  <RangeField label="Gaya pusat" value={centerForceScale} min={0} max={3} step={0.05} onChange={setCenterForceScale} />
                  <RangeField label="Gaya tolak" value={repelForceScale} min={0.2} max={3} step={0.05} onChange={setRepelForceScale} />
                  <RangeField label="Gaya tarik link" value={linkForceScale} min={0.2} max={3} step={0.05} onChange={setLinkForceScale} />
                  <RangeField label="Jarak link" value={linkDistance} min={40} max={260} step={1} onChange={setLinkDistance} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile search */}
      <div className="sm:hidden px-3 py-2 border-b border-border/30">{searchBox("w-full")}</div>

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Graph pengetahuan: ${visibleNodeIds.size} catatan dan ${visibleEdges.length} koneksi`}
          className="block w-full h-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />

        {/* Legend */}
        {(
          <div className={`absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-[min(720px,calc(100%-24px))] ${selectedPost ? "hidden sm:flex" : "flex"} flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/30 text-[11px] text-muted-foreground/80`}>
            {legendItems.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5 capitalize">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                <span className="truncate max-w-[140px]">{item.label}</span>
              </span>
            ))}
            <span className="text-muted-foreground/50 hidden lg:inline">
              Scroll = zoom · Seret = geser · Klik = pilih · Klik 2× = buka · / = cari
            </span>
          </div>
        )}

        {/* Info panel */}
        {selectedPost && (
          <div className="absolute left-3 right-3 bottom-3 sm:left-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-72 rounded-xl bg-background/95 backdrop-blur-md border border-border/40 p-4 shadow-xl max-h-[45svh] sm:max-h-[70%] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedColor ? toCss(selectedColor) : undefined }} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 truncate">
                  {selectedPost.type} · {selectedPost.category}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Tutup panel"
                className="p-1 -m-1 rounded-md text-muted-foreground/60 hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            <h3 className="font-heading text-sm font-semibold mb-1.5 leading-snug">{selectedPost.title}</h3>
            <p className="text-xs text-muted-foreground/80 mb-3 line-clamp-2 sm:line-clamp-3">{selectedPost.summary}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {selectedPost.tags.slice(0, 10).map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground/80 hover:text-foreground"
                >
                  #{tag}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mb-3">
              <span>{connectedPosts.length} koneksi</span>
              <span>·</span>
              <span>{selectedPost.readingTime} min baca</span>
            </div>
            {connectedPosts.length > 0 && (
              <div className="border-t border-border/30 pt-2.5 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1.5">Terhubung</span>
                <div className="space-y-1 max-h-24 sm:max-h-32 overflow-y-auto">
                  {connectedPosts.map((p) => (
                    <button
                      type="button"
                      key={p.slug}
                      onClick={() => focusNode(p.slug)}
                      className="flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: toCss(nodeById.get(p.slug)?.color ?? theme.fallback) }} />
                      <span className="truncate">{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate(postHref(selectedPost.type, selectedPost.slug))}
              className="mt-3 w-full py-1.5 text-xs font-medium rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            >
              Buka Artikel →
            </button>
            {selectedNodePinned && (
              <button
                type="button"
                onClick={() => {
                  const node = nodeById.get(selectedPost.slug);
                  if (node) {
                    node.pinned = false;
                    alphaRef.current = Math.max(alphaRef.current, 0.3);
                    setPinVersion((v) => v + 1);
                  }
                }}
                className="mt-2 w-full py-1.5 text-xs font-medium rounded-lg bg-secondary/70 text-muted-foreground hover:text-foreground transition-colors"
              >
                Lepas Pin Node
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
