import { useMemo, useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Maximize2, ZoomIn, ZoomOut, RotateCcw, Focus } from "lucide-react";
import { allPosts } from "@/content";
import { buildHybridGraph, buildPreviewGraph, seededUnit } from "@/lib/graph-engine";
import {
  TYPE_LEGEND,
  fitCamera,
  hitTest,
  radiusForDegree,
  renderGraph,
  stepSimulation,
  useGraphTheme,
  zoomAt,
  type Camera,
  type RenderLink,
  type RenderNode,
  type SimNode,
} from "@/lib/graph-canvas";

const MAX_GRAPH_DPR = 2;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

interface LocalNode extends SimNode, RenderNode {
  slug: string;
  title: string;
  type: string;
  category: string;
}

const postHref = (type: string, slug: string) => (type === "article" ? `/artikel/${slug}` : `/writing/${slug}`);
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

function ControlBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded-lg bg-background/90 border border-border/40 text-muted-foreground/80 hover:text-foreground hover:bg-background hover:border-border/70 transition-colors shadow-sm backdrop-blur-sm"
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export default function GraphView({ currentSlug }: { currentSlug?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const theme = useGraphTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showWheelHint, setShowWheelHint] = useState(false);
  const [isInViewport, setIsInViewport] = useState(() => typeof window === "undefined");
  const [isPageVisible, setIsPageVisible] = useState(
    () => (typeof document === "undefined" ? true : document.visibilityState !== "hidden")
  );

  const camRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const camTargetRef = useRef<Camera | null>(null);
  const autoFitRef = useRef(true);
  const sizeRef = useRef({ w: 0, h: 0 });
  const alphaRef = useRef(1);
  const dirtyRef = useRef(true);
  const highlightTRef = useRef(0);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const hoveredRef = useRef(hoveredId);
  hoveredRef.current = hoveredId;

  const pointer = useRef<{
    mode: "none" | "pan" | "node";
    index: number;
    startX: number;
    startY: number;
    camX: number;
    camY: number;
    moved: boolean;
    wasPinned: boolean;
  }>({ mode: "none", index: -1, startX: 0, startY: 0, camX: 0, camY: 0, moved: false, wasPinned: false });
  const touchTap = useRef<{ x: number; y: number; t: number; valid: boolean } | null>(null);
  const pinch = useRef<{ dist: number } | null>(null);
  const wheelHintTimer = useRef<number | undefined>(undefined);

  const { nodes, links, neighbors, indexById } = useMemo(() => {
    const fullGraph = buildHybridGraph(allPosts);
    const graph = buildPreviewGraph(fullGraph, {
      focusId: currentSlug,
      maxNodes: 48,
      maxEdges: 120,
      maxFocusNeighbors: 18,
      maxEdgesPerNode: 7,
      includeCategoryEdges: false,
    });
    const degree = new Map<string, number>();
    graph.edges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    });
    const maxDegree = Math.max(1, ...Array.from(degree.values()));
    const count = Math.max(1, graph.nodes.length);
    const list: LocalNode[] = graph.nodes.map((node, i) => {
      const isCurrent = node.slug === currentSlug;
      const angle = (i / count) * Math.PI * 2 + seededUnit(`${node.id}:angle`) * 0.8;
      const r = isCurrent ? 0 : 70 + seededUnit(`${node.id}:radius`) * 110;
      const d = degree.get(node.id) ?? 0;
      return {
        id: node.id,
        slug: node.slug,
        title: node.title,
        label: node.title,
        type: node.type,
        category: node.category,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        pinned: false,
        radius: isCurrent ? 10 : radiusForDegree(d, maxDegree, 3.5, 8),
        importance: d,
        color: [0, 0, 0],
      };
    });
    const idx = new Map(list.map((n, i) => [n.id, i]));
    const linkList: RenderLink[] = graph.edges
      .filter((e) => idx.has(e.source) && idx.has(e.target))
      .map((e) => ({ source: idx.get(e.source)!, target: idx.get(e.target)!, weight: e.weight, kind: e.kind }));
    return { nodes: list, links: linkList, neighbors: graph.neighbors, indexById: idx };
  }, [currentSlug]);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Restart layout + auto-fit when the article changes.
  useEffect(() => {
    alphaRef.current = 1;
    autoFitRef.current = true;
    camTargetRef.current = null;
    dirtyRef.current = true;
  }, [nodes]);

  // Theme colors are applied to nodes in place, then a redraw is requested.
  useEffect(() => {
    nodes.forEach((n) => {
      n.color = theme.typeColors[n.type] ?? theme.fallback;
    });
    dirtyRef.current = true;
  }, [nodes, theme]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    dirtyRef.current = true;
  }, [hoveredId]);

  useEffect(() => {
    if (isCollapsed) return;
    const container = containerRef.current;
    if (!container) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsInViewport(Boolean(entry?.isIntersecting)), {
      threshold: 0.02,
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isCollapsed]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => setIsPageVisible(document.visibilityState !== "hidden");
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const isGraphActive = !isCollapsed && isInViewport && isPageVisible;

  // HiDPI canvas sizing
  useEffect(() => {
    if (isCollapsed) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_GRAPH_DPR);
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      sizeRef.current = { w: rect.width, h: rect.height };
      if (autoFitRef.current) camTargetRef.current = null;
      dirtyRef.current = true;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [isCollapsed]);

  // Simulation + render loop (only while visible on screen)
  useEffect(() => {
    if (!isGraphActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let lastZoomShown = -1;
    const simLinks = links;

    const tick = () => {
      const ns = nodesRef.current;
      const { w: W, h: H } = sizeRef.current;
      const hovered = hoveredRef.current;

      if (alphaRef.current > 0.004) {
        stepSimulation(ns, simLinks, {
          repel: 900,
          linkStrength: 0.012,
          linkDistance: (w) => 105 - w * 4,
          center: 0.006,
          damping: 0.82,
          maxSpeed: 6,
          alpha: alphaRef.current,
          draggedIndex: pointer.current.mode === "node" ? pointer.current.index : undefined,
        });
        alphaRef.current *= 0.982;
        dirtyRef.current = true;
      }

      // Keep the whole neighbourhood in frame until the user takes the camera.
      if (autoFitRef.current && W > 0) {
        const fit = fitCamera(ns, W, H, { padding: 34, maxScale: 1.6, minScale: MIN_SCALE });
        if (fit) camTargetRef.current = fit;
      }
      const target = camTargetRef.current;
      if (target) {
        const cam = camRef.current;
        const k = 0.16;
        const next = {
          x: cam.x + (target.x - cam.x) * k,
          y: cam.y + (target.y - cam.y) * k,
          scale: cam.scale + (target.scale - cam.scale) * k,
        };
        const done =
          Math.abs(next.x - target.x) < 0.3 && Math.abs(next.y - target.y) < 0.3 && Math.abs(next.scale - target.scale) < 0.002;
        camRef.current = done ? target : next;
        if (done && !autoFitRef.current) camTargetRef.current = null;
        if (!done) dirtyRef.current = true;
      }

      const wantT = hovered || currentSlug ? 1 : 0;
      if (Math.abs(highlightTRef.current - wantT) > 0.01) {
        highlightTRef.current += (wantT - highlightTRef.current) * 0.2;
        dirtyRef.current = true;
      } else {
        highlightTRef.current = wantT;
      }

      if (dirtyRef.current && W > 0) {
        dirtyRef.current = false;
        const anchor = hovered ?? currentSlug ?? null;
        let highlightIds: Set<string> | null = null;
        if (anchor) {
          highlightIds = new Set([anchor, ...(neighbors.get(anchor) ?? [])]);
          if (currentSlug) highlightIds.add(currentSlug);
        }
        renderGraph(ctx, {
          W,
          H,
          dpr: Math.min(window.devicePixelRatio || 1, MAX_GRAPH_DPR),
          camera: camRef.current,
          theme: themeRef.current,
          nodes: ns,
          links: simLinks,
          focusId: currentSlug,
          hoverId: hovered,
          highlightIds,
          highlightT: highlightTRef.current,
          labelScale: 2.2,
          maxLabelChars: 26,
          dimStrength: 0.62,
        });
        const z = Math.round(camRef.current.scale * 100);
        if (z !== lastZoomShown) {
          lastZoomShown = z;
          setZoomLevel(z);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [links, neighbors, currentSlug, isGraphActive]);

  const getPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { mx: clientX - rect.left, my: clientY - rect.top } : { mx: 0, my: 0 };
  }, []);

  const nodeAt = useCallback(
    (mx: number, my: number, slop = 6) => {
      const { w, h } = sizeRef.current;
      return hitTest(nodesRef.current, camRef.current, w, h, mx, my, slop);
    },
    []
  );

  const takeCamera = useCallback(() => {
    autoFitRef.current = false;
    camTargetRef.current = null;
  }, []);

  const setCamera = useCallback((cam: Camera) => {
    camRef.current = cam;
    dirtyRef.current = true;
  }, []);

  const animateCamera = useCallback((cam: Camera) => {
    camTargetRef.current = cam;
    dirtyRef.current = true;
  }, []);

  // Wheel: Ctrl/⌘ + wheel (and trackpad pinch) zooms; plain wheel keeps scrolling the article.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isCollapsed) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        setShowWheelHint(true);
        window.clearTimeout(wheelHintTimer.current);
        wheelHintTimer.current = window.setTimeout(() => setShowWheelHint(false), 1400);
        return;
      }
      e.preventDefault();
      takeCamera();
      const { mx, my } = getPos(e.clientX, e.clientY);
      const { w, h } = sizeRef.current;
      const factor = Math.exp(-e.deltaY * 0.0025);
      setCamera(zoomAt(camRef.current, w, h, mx, my, clampScale(camRef.current.scale * factor)));
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinch.current = { dist: Math.hypot(dx, dy) };
        if (touchTap.current) touchTap.current.valid = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      takeCamera();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const { mx, my } = getPos(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2
      );
      const { w, h } = sizeRef.current;
      setCamera(zoomAt(camRef.current, w, h, mx, my, clampScale(camRef.current.scale * (dist / pinch.current.dist))));
      pinch.current.dist = dist;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      window.clearTimeout(wheelHintTimer.current);
    };
  }, [isCollapsed, getPos, setCamera, takeCamera]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        // Touch: never capture, so one-finger vertical scrolling keeps working.
        touchTap.current = { x: e.clientX, y: e.clientY, t: Date.now(), valid: e.isPrimary };
        return;
      }
      if (e.button !== 0) return;
      const { mx, my } = getPos(e.clientX, e.clientY);
      const index = nodeAt(mx, my);
      const p = pointer.current;
      p.startX = e.clientX;
      p.startY = e.clientY;
      p.moved = false;
      p.index = index;
      p.camX = camRef.current.x;
      p.camY = camRef.current.y;
      if (index >= 0) {
        p.mode = "node";
        p.wasPinned = nodesRef.current[index].pinned;
      } else {
        p.mode = "pan";
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [getPos, nodeAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        const tap = touchTap.current;
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.valid = false;
        return;
      }
      const p = pointer.current;
      const { mx, my } = getPos(e.clientX, e.clientY);
      if (p.mode !== "none" && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 3) p.moved = true;

      if (p.mode === "node" && p.moved) {
        const node = nodesRef.current[p.index];
        const cam = camRef.current;
        const { w, h } = sizeRef.current;
        node.x = (mx - w / 2 - cam.x) / cam.scale;
        node.y = (my - h / 2 - cam.y) / cam.scale;
        node.pinned = true;
        alphaRef.current = Math.max(alphaRef.current, 0.35);
        takeCamera();
        markDirty();
        return;
      }
      if (p.mode === "pan") {
        if (p.moved) {
          takeCamera();
          setCamera({ ...camRef.current, x: p.camX + (e.clientX - p.startX), y: p.camY + (e.clientY - p.startY) });
        }
        return;
      }
      const index = nodeAt(mx, my);
      const id = index >= 0 ? nodesRef.current[index].id : null;
      if (id !== hoveredRef.current) setHoveredId(id);
      e.currentTarget.style.cursor = index >= 0 ? "pointer" : "grab";
    },
    [getPos, nodeAt, markDirty, setCamera, takeCamera]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        const tap = touchTap.current;
        touchTap.current = null;
        if (!tap || !tap.valid || Date.now() - tap.t > 600 || pinch.current) return;
        const { mx, my } = getPos(e.clientX, e.clientY);
        const index = nodeAt(mx, my, 14);
        if (index >= 0) navigate(postHref(nodesRef.current[index].type, nodesRef.current[index].slug));
        return;
      }
      const p = pointer.current;
      if (p.mode === "node" && !p.moved && p.index >= 0) {
        const node = nodesRef.current[p.index];
        node.pinned = p.wasPinned;
        navigate(postHref(node.type, node.slug));
      }
      p.mode = "none";
      p.index = -1;
    },
    [getPos, nodeAt, navigate]
  );

  const handlePointerLeave = useCallback(() => {
    if (pointer.current.mode === "none") setHoveredId(null);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      takeCamera();
      const { w, h } = sizeRef.current;
      const base = camTargetRef.current ?? camRef.current;
      animateCamera(zoomAt(base, w, h, w / 2, h / 2, clampScale(base.scale * factor)));
    },
    [animateCamera, takeCamera]
  );

  const fitToContent = useCallback(() => {
    const { w, h } = sizeRef.current;
    const fit = fitCamera(nodesRef.current, w, h, { padding: 34, maxScale: 1.6, minScale: MIN_SCALE });
    if (!fit) return;
    autoFitRef.current = false;
    animateCamera(fit);
  }, [animateCamera]);

  const resetView = useCallback(() => {
    nodesRef.current.forEach((n) => {
      n.pinned = false;
    });
    alphaRef.current = 0.8;
    autoFitRef.current = true;
    camTargetRef.current = null;
    markDirty();
  }, [markDirty]);

  const hovered = hoveredId ? nodes[indexById.get(hoveredId) ?? -1] : undefined;
  const legend = theme.isLight ? TYPE_LEGEND.light : TYPE_LEGEND.dark;
  const fullPageHref = currentSlug ? `/graph?focus=${encodeURIComponent(currentSlug)}` : "/graph";

  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        className="w-full px-4 py-2.5 border-b border-border/30 flex items-center justify-between gap-3 hover:bg-secondary/30 transition-colors"
      >
        <span className="text-xs uppercase tracking-widest text-muted-foreground/60 font-heading">Graph View</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 text-[10px] text-muted-foreground/70">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: legend.note }} /> Note</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: legend.essay }} /> Essay</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: legend.article }} /> Article</span>
          </div>
          {isCollapsed ? <ChevronDown size={14} className="text-muted-foreground/50" /> : <ChevronUp size={14} className="text-muted-foreground/50" />}
        </div>
      </button>

      {!isCollapsed && (
        <div ref={containerRef} className="relative h-[340px] sm:h-[420px]">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Graph koneksi tulisan: ${nodes.length} tulisan, ${links.length} koneksi`}
            className="block w-full h-full touch-pan-y select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />
          {hovered && (
            <div className="absolute top-3 left-3 right-16 pointer-events-none">
              <div className="inline-flex max-w-full flex-col gap-0.5 bg-background/90 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-border/40 shadow-sm">
                <span className="text-xs font-medium text-foreground truncate">{hovered.title}</span>
                <span className="text-[10px] text-muted-foreground/70 capitalize">
                  {hovered.type} · {hovered.category} · {neighbors.get(hovered.id)?.size ?? 0} koneksi
                </span>
              </div>
            </div>
          )}
          <div
            className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center transition-opacity duration-300 ${showWheelHint ? "opacity-100" : "opacity-0"}`}
            aria-hidden
          >
            <span className="text-xs text-foreground/80 bg-background/85 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/40 shadow-sm">
              Tahan Ctrl / ⌘ + scroll untuk zoom
            </span>
          </div>
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            <ControlBtn onClick={() => zoomBy(1.35)} title="Zoom in"><ZoomIn size={14} /></ControlBtn>
            <ControlBtn onClick={() => zoomBy(1 / 1.35)} title="Zoom out"><ZoomOut size={14} /></ControlBtn>
            <ControlBtn onClick={fitToContent} title="Muat semua node"><Focus size={14} /></ControlBtn>
            <ControlBtn onClick={resetView} title="Reset tata letak"><RotateCcw size={14} /></ControlBtn>
            <ControlBtn onClick={() => navigate(fullPageHref)} title="Buka graph penuh"><Maximize2 size={14} /></ControlBtn>
          </div>
          <span className="absolute bottom-3 left-3 text-[10px] text-muted-foreground/60 bg-background/70 px-2 py-0.5 rounded-md backdrop-blur-sm border border-border/30 tabular-nums">
            {zoomLevel}%
          </span>
        </div>
      )}
    </div>
  );
}
