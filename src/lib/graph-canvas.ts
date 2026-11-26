import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export type RGB = [number, number, number];

export interface GraphTheme {
  isLight: boolean;
  background: RGB;
  foreground: RGB;
  muted: RGB;
  border: RGB;
  primary: RGB;
  typeColors: Record<string, RGB>;
  clusterColors: RGB[];
  fallback: RGB;
}

const hex = (value: string): RGB => {
  const v = value.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

const DARK_TYPES = { note: hex("#38bdf8"), essay: hex("#a78bfa"), article: hex("#fbbf24") };
const LIGHT_TYPES = { note: hex("#0284c7"), essay: hex("#7c3aed"), article: hex("#c2780a") };

const DARK_CLUSTERS = [
  "#f2c46d", "#7dd3fc", "#c4b5fd", "#86efac", "#f9a8d4",
  "#fca5a5", "#5eead4", "#fdba74", "#a5b4fc", "#bef264",
].map(hex);
const LIGHT_CLUSTERS = [
  "#b7791f", "#0284c7", "#7c3aed", "#15803d", "#db2777",
  "#dc2626", "#0f766e", "#ea580c", "#4f46e5", "#65a30d",
].map(hex);

/** Hex colors used by the DOM legends, matching the canvas colors. */
export const TYPE_LEGEND = {
  dark: { note: "#38bdf8", essay: "#a78bfa", article: "#fbbf24" },
  light: { note: "#0284c7", essay: "#7c3aed", article: "#c2780a" },
} as const;

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function readVar(style: CSSStyleDeclaration, name: string, fallback: RGB): RGB {
  const raw = style.getPropertyValue(name).trim();
  const m = raw.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return fallback;
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function readGraphTheme(): GraphTheme {
  const isLight = typeof document !== "undefined" && document.documentElement.classList.contains("light");
  const style =
    typeof window !== "undefined" && typeof getComputedStyle === "function"
      ? getComputedStyle(document.documentElement)
      : null;
  const pick = (name: string, dark: string, light: string) =>
    style ? readVar(style, name, hex(isLight ? light : dark)) : hex(isLight ? light : dark);

  return {
    isLight,
    background: pick("--background", "#0d0e17", "#faf7f2"),
    foreground: pick("--foreground", "#efe9df", "#25263a"),
    muted: pick("--muted-foreground", "#a2a5b4", "#62637a"),
    border: pick("--border", "#30313f", "#ddd5ca"),
    primary: pick("--primary", "#ebc27a", "#a66c27"),
    typeColors: isLight ? LIGHT_TYPES : DARK_TYPES,
    clusterColors: isLight ? LIGHT_CLUSTERS : DARK_CLUSTERS,
    fallback: isLight ? hex("#64748b") : hex("#94a3b8"),
  };
}

/** Re-reads the palette whenever the site theme (html.light) changes. */
export function useGraphTheme(): GraphTheme {
  const [theme, setTheme] = useState<GraphTheme>(() => readGraphTheme());
  useEffect(() => {
    // The theme toggle may flip html.light before this effect subscribes, so re-read now.
    setTheme(readGraphTheme());
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => setTheme(readGraphTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

export const clusterColor = (theme: GraphTheme, index: number | undefined) =>
  index === undefined ? theme.fallback : theme.clusterColors[index % theme.clusterColors.length];

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

export interface SimLink {
  source: number;
  target: number;
  weight: number;
}

export interface ForceParams {
  repel: number;
  linkStrength: number;
  linkDistance: (weight: number) => number;
  center: number;
  damping: number;
  maxSpeed: number;
  alpha: number;
  draggedIndex?: number;
}

/** One force-directed step. Returns the kinetic energy of the free nodes. */
export function stepSimulation(nodes: SimNode[], links: SimLink[], p: ForceParams): number {
  const n = nodes.length;
  const a = p.alpha;
  for (let i = 0; i < n; i++) {
    const ni = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const nj = nodes[j];
      let dx = nj.x - ni.x;
      let dy = nj.y - ni.y;
      if (dx === 0 && dy === 0) {
        dx = (i - j) * 0.01;
        dy = 0.01;
      }
      const d2 = Math.max(dx * dx + dy * dy, 16);
      const dist = Math.sqrt(d2);
      let force = (p.repel / d2) * a;
      // Soft collision so nodes and their halos never sit on top of each other.
      const minDist = ni.radius + nj.radius + 6;
      if (dist < minDist) force += (minDist - dist) * 0.25;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      ni.vx -= fx;
      ni.vy -= fy;
      nj.vx += fx;
      nj.vy += fy;
    }
  }

  for (const l of links) {
    const s = nodes[l.source];
    const t = nodes[l.target];
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (dist - p.linkDistance(l.weight)) * p.linkStrength * a;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  let energy = 0;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.pinned || i === p.draggedIndex) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += -node.x * p.center * a;
    node.vy += -node.y * p.center * a;
    node.vx *= p.damping;
    node.vy *= p.damping;
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > p.maxSpeed) {
      node.vx = (node.vx / speed) * p.maxSpeed;
      node.vy = (node.vy / speed) * p.maxSpeed;
    }
    node.x += node.vx;
    node.y += node.vy;
    energy += node.vx * node.vx + node.vy * node.vy;
  }
  return energy;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/** World origin sits at the center of the canvas, offset by (x, y). */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export const worldToScreen = (cam: Camera, W: number, H: number, wx: number, wy: number) => ({
  sx: W / 2 + cam.x + wx * cam.scale,
  sy: H / 2 + cam.y + wy * cam.scale,
});

export const screenToWorld = (cam: Camera, W: number, H: number, sx: number, sy: number) => ({
  wx: (sx - W / 2 - cam.x) / cam.scale,
  wy: (sy - H / 2 - cam.y) / cam.scale,
});

/** Zoom keeping the screen point (sx, sy) fixed. */
export function zoomAt(cam: Camera, W: number, H: number, sx: number, sy: number, nextScale: number): Camera {
  const { wx, wy } = screenToWorld(cam, W, H, sx, sy);
  return { scale: nextScale, x: sx - W / 2 - wx * nextScale, y: sy - H / 2 - wy * nextScale };
}

export function fitCamera(
  allNodes: Array<{ x: number; y: number; radius: number; importance?: number }>,
  W: number,
  H: number,
  opts: { padding?: number; maxScale?: number; minScale?: number } = {}
): Camera | null {
  if (allNodes.length === 0 || W <= 0 || H <= 0) return null;
  const { padding = 40, maxScale = 2, minScale = 0.1 } = opts;
  // Isolated nodes orbit far out; frame the connected core when it is most of the graph.
  const connected = allNodes.filter((n) => (n.importance ?? 1) > 0);
  let nodes = connected.length >= allNodes.length * 0.7 && connected.length > 0 ? connected : allNodes;
  if (nodes.length > 40) {
    // Ignore the few farthest stragglers so the main body fills the viewport.
    const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
    const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
    nodes = nodes
      .slice()
      .sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2))
      .slice(0, Math.ceil(nodes.length * 0.96));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxY = Math.max(maxY, n.y + n.radius + 14);
  }
  const scale = Math.max(
    minScale,
    Math.min(maxScale, (W - padding * 2) / Math.max(1, maxX - minX), (H - padding * 2) / Math.max(1, maxY - minY))
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, x: -cx * scale, y: -cy * scale };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export interface RenderNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: RGB;
  label: string;
  /** Larger = label wins collisions. */
  importance: number;
}

export interface RenderLink {
  source: number;
  target: number;
  weight: number;
  kind: string;
}

export interface RenderOptions {
  W: number;
  H: number;
  dpr: number;
  camera: Camera;
  theme: GraphTheme;
  nodes: RenderNode[];
  links: RenderLink[];
  /** Node that anchors the view (current article / selected node). */
  focusId?: string | null;
  hoverId?: string | null;
  /** Ids that stay bright while the highlight is active. */
  highlightIds?: Set<string> | null;
  /** 0..1 eased highlight strength (for smooth fade in/out). */
  highlightT: number;
  searchIds?: Set<string> | null;
  /** Zoom level at which every label is shown. */
  labelScale: number;
  linkOpacity?: number;
  linkThickness?: number;
  showArrows?: boolean;
  fontFamily?: string;
  maxLabelChars?: number;
  drawBackground?: boolean;
  /** How strongly non-highlighted nodes fade (0..1). */
  dimStrength?: number;
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function renderGraph(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const { W, H, camera: cam, theme, nodes, links } = o;
  const font = o.fontFamily ?? "'Space Grotesk', system-ui, sans-serif";
  const maxChars = o.maxLabelChars ?? 32;
  const ht = o.highlightT;
  const highlight = o.highlightIds && o.highlightIds.size > 0 ? o.highlightIds : null;
  const hasSearch = !!o.searchIds;
  const linkOpacity = o.linkOpacity ?? 1;
  const thickness = o.linkThickness ?? 1;
  const dim = o.dimStrength ?? 0.8;

  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (o.drawBackground) {
    ctx.fillStyle = rgba(theme.background, 1);
    ctx.fillRect(0, 0, W, H);
  }

  // Dot grid that follows the camera.
  const grid = 28 * Math.max(0.5, Math.min(2, cam.scale));
  const ox = ((W / 2 + cam.x) % grid + grid) % grid;
  const oy = ((H / 2 + cam.y) % grid + grid) % grid;
  ctx.fillStyle = rgba(theme.muted, theme.isLight ? 0.12 : 0.07);
  for (let gx = ox; gx < W; gx += grid) {
    for (let gy = oy; gy < H; gy += grid) ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
  }

  const zoomR = Math.max(0.45, Math.pow(cam.scale, 0.85));
  const pos = nodes.map((n) => ({
    sx: W / 2 + cam.x + n.x * cam.scale,
    sy: H / 2 + cam.y + n.y * cam.scale,
    r: Math.max(1.8, n.radius * zoomR),
  }));
  const pad = 60;
  const onScreen = pos.map((p) => p.sx > -pad && p.sx < W + pad && p.sy > -pad && p.sy < H + pad);

  const active = (id: string) => !highlight || highlight.has(id);
  const nodeAlpha = (id: string) => {
    let a = 1;
    if (highlight && !highlight.has(id)) a = 1 - dim * ht;
    if (hasSearch && !o.searchIds!.has(id)) a = Math.min(a, 0.2);
    return a;
  };
  const anchor = o.hoverId ?? o.focusId ?? null;

  // Links: dim pass first, highlighted links on top.
  ctx.lineCap = "round";
  const baseLinkAlpha = theme.isLight ? 0.2 : 0.16;
  const drawLink = (l: RenderLink, emphasized: boolean) => {
    const s = pos[l.source];
    const t = pos[l.target];
    if (!s || !t || (!onScreen[l.source] && !onScreen[l.target])) return;
    const sid = nodes[l.source].id;
    const tid = nodes[l.target].id;
    const w = Math.min(1, l.weight / 10);
    let alpha: number;
    let color: RGB;
    let width: number;
    if (emphasized) {
      color = theme.primary;
      alpha = (0.55 + w * 0.35) * (0.4 + 0.6 * ht);
      width = (1.1 + w * 1.6) * thickness;
    } else {
      color = l.kind === "direct" ? theme.foreground : theme.muted;
      alpha = (baseLinkAlpha + w * 0.22) * linkOpacity * (l.kind === "category" ? 0.55 : 1);
      if (highlight) alpha *= 1 - Math.min(0.9, dim + 0.05) * ht;
      if (hasSearch && !(o.searchIds!.has(sid) && o.searchIds!.has(tid))) alpha *= 0.3;
      width = (0.6 + w * 0.9) * thickness;
    }
    width *= Math.max(0.6, Math.min(1.6, Math.sqrt(cam.scale)));
    ctx.beginPath();
    ctx.moveTo(s.sx, s.sy);
    ctx.lineTo(t.sx, t.sy);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();

    if (o.showArrows) {
      const ang = Math.atan2(t.sy - s.sy, t.sx - s.sx);
      const ex = t.sx - Math.cos(ang) * (t.r + 2);
      const ey = t.sy - Math.sin(ang) * (t.r + 2);
      const len = 5 + width * 2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - len * Math.cos(ang - Math.PI / 7), ey - len * Math.sin(ang - Math.PI / 7));
      ctx.lineTo(ex - len * Math.cos(ang + Math.PI / 7), ey - len * Math.sin(ang + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = rgba(color, alpha);
      ctx.fill();
    }
  };
  const emphasizedLinks: RenderLink[] = [];
  for (const l of links) {
    const sid = nodes[l.source]?.id;
    const tid = nodes[l.target]?.id;
    if (anchor && highlight && (sid === anchor || tid === anchor)) emphasizedLinks.push(l);
    else drawLink(l, false);
  }
  emphasizedLinks.forEach((l) => drawLink(l, true));

  // Nodes: dimmed first so bright ones draw on top.
  const order = nodes.map((_, i) => i).sort((a, b) => {
    const aa = active(nodes[a].id) ? 1 : 0;
    const bb = active(nodes[b].id) ? 1 : 0;
    return aa - bb || nodes[a].radius - nodes[b].radius;
  });

  for (const i of order) {
    if (!onScreen[i]) continue;
    const n = nodes[i];
    const p = pos[i];
    const alpha = nodeAlpha(n.id);
    const isFocus = n.id === o.focusId;
    const isHover = n.id === o.hoverId;
    const isSearch = hasSearch && o.searchIds!.has(n.id);

    if (isFocus || isHover || isSearch) {
      const glowColor = isFocus ? theme.primary : n.color;
      const g = ctx.createRadialGradient(p.sx, p.sy, p.r * 0.6, p.sx, p.sy, p.r + 16);
      g.addColorStop(0, rgba(glowColor, theme.isLight ? 0.28 : 0.38));
      g.addColorStop(1, rgba(glowColor, 0));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r + 16, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // Fade by blending toward the background so dimmed nodes stay solid (no muddy overlaps).
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(mixRgb(n.color, theme.background, (1 - alpha) * 0.92), 1);
    ctx.fill();
    // Thin outline in the background color separates overlapping nodes.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(theme.background, 0.9);
    ctx.stroke();

    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r + 3.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = rgba(isFocus ? theme.primary : theme.foreground, isFocus ? 0.85 : 0.55);
      ctx.stroke();
    }
  }

  // Labels: priority ordered, collision checked in screen space.
  // Hubs get their labels first; leaves only once zoomed in to `labelScale`.
  let maxImportance = 1;
  for (const n of nodes) maxImportance = Math.max(maxImportance, n.importance);
  const zoomLabelAlphaFor = (importance: number) => {
    const full = o.labelScale * (1.3 - 0.75 * Math.sqrt(importance / maxImportance));
    const start = full * 0.78;
    return Math.max(0, Math.min(1, (cam.scale - start) / (full - start)));
  };
  const candidates: Array<{ i: number; prio: number; alpha: number; strong: boolean }> = [];
  nodes.forEach((n, i) => {
    if (!onScreen[i]) return;
    const isFocus = n.id === o.focusId;
    const isHover = n.id === o.hoverId;
    const isSearch = hasSearch && o.searchIds!.has(n.id);
    const isHighlighted = !!highlight && highlight.has(n.id) && ht > 0.05;
    let prio = -1;
    let alpha = 0;
    if (isHover) { prio = 5; alpha = 1; }
    else if (isFocus) { prio = 4; alpha = 1; }
    else if (isSearch) { prio = 3; alpha = 1; }
    else if (isHighlighted) { prio = 2; alpha = 0.6 + 0.4 * ht; }
    else if (!hasSearch) {
      const za = zoomLabelAlphaFor(n.importance);
      if (za > 0.02) {
        prio = 1;
        alpha = za * (highlight ? 1 - ht : 1);
      }
    }
    if (prio < 0 || alpha < 0.03) return;
    candidates.push({ i, prio, alpha, strong: prio >= 4 });
  });
  candidates.sort((a, b) => b.prio - a.prio || nodes[b.i].importance - nodes[a.i].importance);

  const boxes: Array<[number, number, number, number]> = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const c of candidates) {
    const n = nodes[c.i];
    const p = pos[c.i];
    const size = c.strong ? 12.5 : 11.5;
    ctx.font = `${c.strong ? 600 : 500} ${size}px ${font}`;
    const text = truncate(n.label, c.prio >= 4 ? maxChars + 18 : maxChars);
    const tw = ctx.measureText(text).width;
    // Keep labels inside the canvas instead of clipping at the edges.
    const lx = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, p.sx));
    const bx = lx - tw / 2 - 3;
    const by = p.sy + p.r + 4;
    const bw = tw + 6;
    const bh = size + 4;
    const hit = boxes.some(([x, y, w, h]) => bx < x + w && bx + bw > x && by < y + h && by + bh > y);
    if (hit && c.prio < 4) continue;
    if (c.prio <= 1 && n.importance < maxImportance * 0.45) {
      // Zoom labels must not cover other nodes either.
      let coversNode = false;
      for (let k = 0; k < pos.length && !coversNode; k++) {
        if (k === c.i || !onScreen[k]) continue;
        const q = pos[k];
        coversNode = q.sx + q.r > bx && q.sx - q.r < bx + bw && q.sy + q.r > by && q.sy - q.r < by + bh;
      }
      if (coversNode) continue;
    }
    boxes.push([bx, by, bw, bh]);
    ctx.lineJoin = "round";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = rgba(theme.background, 0.92 * c.alpha);
    ctx.strokeText(text, lx, by + 1);
    ctx.fillStyle = c.prio === 4 ? rgba(theme.primary, c.alpha) : rgba(theme.foreground, (c.prio >= 3 ? 0.95 : 0.8) * c.alpha);
    ctx.fillText(text, lx, by + 1);
  }
}

/** Index of the node under a screen point (nearest within its radius + slop). */
export function hitTest(
  nodes: Array<{ x: number; y: number; radius: number }>,
  cam: Camera,
  W: number,
  H: number,
  sx: number,
  sy: number,
  slop = 6,
  isCandidate?: (index: number) => boolean
): number {
  const zoomR = Math.max(0.45, Math.pow(cam.scale, 0.85));
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    if (isCandidate && !isCandidate(i)) continue;
    const n = nodes[i];
    const px = W / 2 + cam.x + n.x * cam.scale;
    const py = H / 2 + cam.y + n.y * cam.scale;
    const r = Math.max(1.8, n.radius * zoomR) + slop;
    const d = (px - sx) ** 2 + (py - sy) ** 2;
    if (d <= r * r && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Radius from connection count, sqrt-scaled so hubs stand out without dwarfing leaves. */
export const radiusForDegree = (degree: number, maxDegree: number, min = 3.5, max = 11) =>
  min + (max - min) * Math.sqrt(degree / Math.max(1, maxDegree));
