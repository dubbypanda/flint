import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useStore } from '../store';
import { FlintLogo } from './FlintLogo';
import { X, ZoomIn, ZoomOut, RotateCcw, Search, Maximize2, Settings, ChevronDown, ChevronRight } from 'lucide-react';

interface GNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  conns: number;
  ring: number;
  angleTarget: number;
  radiusTarget: number;
}

interface GEdge {
  from: string;
  to: string;
}

function getSettingsKey(vaultId: string | null) {
  return `flint-graph-settings-${vaultId || 'default'}`;
}

function loadSettings(vaultId: string | null) {
  try {
    const raw = localStorage.getItem(getSettingsKey(vaultId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSettings(vaultId: string | null, s: Record<string, unknown>) {
  try { localStorage.setItem(getSettingsKey(vaultId), JSON.stringify(s)); } catch { /* */ }
}

function readTheme(): {
  bg: string; surface: string; border: string;
  text: string; textSub: string; textDim: string;
  isDark: boolean;
} {
  const cs = getComputedStyle(document.documentElement);
  const get = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;

  const bg = get('--bg-base', '#1e1e1e');
  const surface = get('--bg-surface', '#252525');
  const border = get('--border', '#333');
  const text = get('--text', '#e0e0e0');
  const textSub = get('--text-secondary', '#999');
  const textDim = get('--text-dim', '#666');

  // Detect dark/light
  let isDark = true;
  const hex = bg.replace('#', '');
  if (hex.length >= 6) {
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    isDark = (r + g + b) / 3 < 128;
  }

  return { bg, surface, border, text, textSub, textDim, isDark };
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return `rgba(150,150,150,${alpha})`;
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function GraphView() {
  const { state, dispatch } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const dragRef = useRef<string | null>(null);
  const wasDragRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0, dragging: false, sx: 0, sy: 0 });
  const zoomRef = useRef(1);
  const animRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const themeRef = useRef(readTheme());

  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [zoom, setZoom] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(readTheme());

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = readTheme();
      themeRef.current = t;
      setTheme(t);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    // Also poll every 500ms as fallback
    const interval = setInterval(() => {
      const t = readTheme();
      themeRef.current = t;
      setTheme(t);
    }, 500);
    return () => { observer.disconnect(); clearInterval(interval); };
  }, []);

  // User settings
  const saved = useMemo(() => loadSettings(state.activeVaultId), [state.activeVaultId]);
  const [nodeColor, setNodeColor] = useState(saved?.nodeColor || '');
  const [activeNodeColor, setActiveNodeColor] = useState(saved?.activeNodeColor || '');
  const [lineColor, setLineColor] = useState(saved?.lineColor || '');
  const [activeLineColor, setActiveLineColor] = useState(saved?.activeLineColor || '');
  const [nodeBaseSize, setNodeBaseSize] = useState<number>(saved?.nodeBaseSize ?? 5);
  const [connBoost, setConnBoost] = useState<number>(saved?.connBoost ?? 0.8);
  const [lineWidth, setLineWidth] = useState<number>(saved?.lineWidth ?? 1);
  const [activeLineWidth, setActiveLineWidth] = useState<number>(saved?.activeLineWidth ?? 2);
  const [lineOpacity, setLineOpacity] = useState<number>(saved?.lineOpacity ?? 0.5);
  const [lineDash, setLineDash] = useState<'solid' | 'dashed' | 'dotted'>(saved?.lineDash || 'solid');
  const [showAllLabels, setShowAllLabels] = useState<boolean>(saved?.showAllLabels ?? false);
  const [radialSpread, setRadialSpread] = useState<number>(saved?.radialSpread ?? 1);

  // Derived colors that follow theme
  const getNodeColor = () => nodeColor || (theme.isDark ? '#a0aab8' : '#4a5568');
  const getActiveNodeColor = () => activeNodeColor || (theme.isDark ? '#ffffff' : '#1a1a2e');
  const getLineColor = () => lineColor || (theme.isDark ? '#4a5568' : '#a0aab8');
  const getActiveLineColor = () => activeLineColor || (theme.isDark ? '#8899aa' : '#555e6e');

  useEffect(() => {
    saveSettings(state.activeVaultId, {
      nodeColor, activeNodeColor, lineColor, activeLineColor,
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread,
    });
  }, [nodeColor, activeNodeColor, lineColor, activeLineColor,
    nodeBaseSize, connBoost, lineWidth, activeLineWidth,
    lineOpacity, lineDash, showAllLabels, radialSpread, state.activeVaultId]);

  const settingsRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    settingsRef.current = {
      nodeColor: getNodeColor(), activeNodeColor: getActiveNodeColor(),
      lineColor: getLineColor(), activeLineColor: getActiveLineColor(),
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread,
    };
  });

  const buildGraph = useCallback(() => {
    const links: Record<string, Set<string>> = {};
    const titleMap = new Map(state.notes.map(n => [n.title.toLowerCase(), n.id]));

    state.notes.forEach(n => { links[n.id] = new Set(); });
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const tid = titleMap.get(m[1].toLowerCase());
        if (tid && tid !== n.id) {
          links[n.id].add(tid);
          if (links[tid]) links[tid].add(n.id);
        }
      }
    });

    const cx = sizeRef.current.w / 2 || 500;
    const cy = sizeRef.current.h / 2 || 400;
    const baseRadius = Math.min(cx, cy) * 0.35 * (settingsRef.current.radialSpread as number);

    // Sort by connection count desc
    const sorted = state.notes
      .map(n => ({ note: n, conns: links[n.id]?.size || 0 }))
      .sort((a, b) => b.conns - a.conns);

    // Assign rings
    const maxConns = sorted[0]?.conns || 1;
    const existing = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    // Count per ring for even spacing
    const ringCounts = [0, 0, 0, 0, 0];
    const ringAssignments: number[] = [];

    sorted.forEach(({ conns }) => {
      let ring: number;
      if (conns >= Math.max(maxConns * 0.6, 4)) ring = 0;
      else if (conns >= Math.max(maxConns * 0.3, 2)) ring = 1;
      else if (conns >= 1) ring = 2;
      else ring = 3;
      ringAssignments.push(ring);
      ringCounts[ring]++;
    });

    const ringRadii = [
      baseRadius * 0.15,
      baseRadius * 0.45,
      baseRadius * 0.78,
      baseRadius * 1.15,
    ];

    const ringIndexes = [0, 0, 0, 0];

    nodesRef.current = sorted.map(({ note, conns }, i) => {
      const ring = ringAssignments[i];
      const count = ringCounts[ring];
      const idx = ringIndexes[ring]++;
      const radius = ringRadii[ring];

      // Even angular spacing with offset per ring
      const ringOffset = ring * 0.4;
      const angle = count > 0
        ? (idx / count) * Math.PI * 2 + ringOffset - Math.PI / 2
        : 0;

      const targetX = cx + Math.cos(angle) * radius;
      const targetY = cy + Math.sin(angle) * radius;

      const old = existing.get(note.id);

      return {
        id: note.id,
        title: note.title,
        x: old?.x ?? targetX,
        y: old?.y ?? targetY,
        vx: 0, vy: 0,
        conns,
        ring,
        angleTarget: angle,
        radiusTarget: radius,
      };
    });

    const edgeSet = new Set<string>();
    edgesRef.current = [];
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const tid = titleMap.get(m[1].toLowerCase());
        if (tid && tid !== n.id) {
          const key = [n.id, tid].sort().join('-');
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edgesRef.current.push({ from: n.id, to: tid });
          }
        }
      }
    });

    setStats({ nodes: nodesRef.current.length, edges: edgesRef.current.length });
  }, [state.notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      sizeRef.current = { w: rect.width, h: rect.height };
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  // Main render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let running = true;

    const getNode = (id: string) => nodesRef.current.find(n => n.id === id);

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const cx = sizeRef.current.w / 2;
      const cy = sizeRef.current.h / 2;

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 5);

          // Stronger repulsion for same ring
          const sameRing = nodes[i].ring === nodes[j].ring;
          const repel = sameRing ? 1800 : 1200;
          const force = repel / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx; nodes[i].vy -= fy;
          nodes[j].vx += fx; nodes[j].vy += fy;
        }
      }

      // Edge springs
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const idealDist = 80 + Math.abs(a.ring - b.ring) * 40;
        const force = (dist - idealDist) * 0.003;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Radial target pull - keeps nodes on their ring
      for (const n of nodes) {
        const targetX = cx + Math.cos(n.angleTarget) * n.radiusTarget;
        const targetY = cy + Math.sin(n.angleTarget) * n.radiusTarget;
        n.vx += (targetX - n.x) * 0.008;
        n.vy += (targetY - n.y) * 0.008;
      }

      // Gentle center gravity
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.00015;
        n.vy += (cy - n.y) * 0.00015;
      }

      // Apply with damping
      for (const n of nodes) {
        if (n.id === dragRef.current) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.82;
        n.vy *= 0.82;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 5) { n.vx = (n.vx / speed) * 5; n.vy = (n.vy / speed) * 5; }
        n.x += n.vx;
        n.y += n.vy;
      }
    };

    const draw = () => {
      if (!running) return;
      simulate();

      const w = canvas.width;
      const h = canvas.height;
      const z = zoomRef.current;
      const p = panRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const activeId = state.activeNoteId;
      const s = settingsRef.current;
      const t = themeRef.current;
      const q = query.toLowerCase();

      const nColor = s.nodeColor as string;
      const aNodeColor = s.activeNodeColor as string;
      const lColor = s.lineColor as string;
      const aLineColor = s.activeLineColor as string;
      const nSize = s.nodeBaseSize as number;
      const cBoost = s.connBoost as number;
      const lWidth = s.lineWidth as number;
      const aLWidth = s.activeLineWidth as number;
      const lOpacity = s.lineOpacity as number;
      const lDash = s.lineDash as string;
      const allLabels = s.showAllLabels as boolean;
      const spread = s.radialSpread as number;

      // Clear with theme bg
      ctx.fillStyle = t.bg;
      ctx.fillRect(0, 0, w, h);

      // Dot grid
      ctx.fillStyle = t.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      const gs = 36 * z;
      if (gs > 8) {
        const ox = ((p.x % gs) + gs) % gs;
        const oy = ((p.y % gs) + gs) % gs;
        for (let x = ox; x < w; x += gs) {
          for (let y = oy; y < h; y += gs) {
            ctx.beginPath();
            ctx.arc(x, y, 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      const cx = sizeRef.current.w / 2;
      const cy = sizeRef.current.h / 2;
      const baseR = Math.min(cx, cy) * 0.35 * spread;

      // Concentric ring guides
      const guideColor = t.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      const ringRadii = [baseR * 0.15, baseR * 0.45, baseR * 0.78, baseR * 1.15];
      for (const r of ringRadii) {
        if (r > 10) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      const isMatch = (n: GNode) => !q || n.title.toLowerCase().includes(q);

      // Connected sets
      const getConnected = (id: string): Set<string> => {
        const s = new Set<string>();
        edges.forEach(e => {
          if (e.from === id) s.add(e.to);
          if (e.to === id) s.add(e.from);
        });
        return s;
      };
      const hoverConn = hoverRef.current ? getConnected(hoverRef.current) : new Set<string>();
      const activeConn = activeId ? getConnected(activeId) : new Set<string>();

      // Dash pattern
      const dashArr = lDash === 'dashed' ? [6, 4] : lDash === 'dotted' ? [2, 3] : [];

      // --- Draw edges ---
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        if (q && !isMatch(a) && !isMatch(b)) continue;

        const isActive = activeId === e.from || activeId === e.to;
        const isHover = hoverRef.current === e.from || hoverRef.current === e.to;
        const highlight = isActive || isHover;

        // Curved edges for cleaner look
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Slight curve toward center for aesthetics
        const curveFactor = Math.min(dist * 0.08, 20);
        const toCenterX = cx - mx;
        const toCenterY = cy - my;
        const toCenterDist = Math.max(Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY), 1);
        const cpx = mx + (toCenterX / toCenterDist) * curveFactor;
        const cpy = my + (toCenterY / toCenterDist) * curveFactor;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);

        if (highlight) {
          ctx.strokeStyle = hexToRgba(aLineColor, 0.85);
          ctx.lineWidth = aLWidth;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = hexToRgba(lColor, lOpacity);
          ctx.lineWidth = lWidth;
          ctx.setLineDash(dashArr);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // --- Draw nodes ---
      for (const n of nodes) {
        const dimmed = q && !isMatch(n);
        if (dimmed) continue;

        const isActive = n.id === activeId;
        const isHover = n.id === hoverRef.current;
        const isConnHover = hoverConn.has(n.id);
        const isConnActive = activeConn.has(n.id);
        const isOrphan = n.conns === 0;

        const boost = Math.min(n.conns * cBoost, nSize * 1.2);
        const radius = nSize + boost;

        // Glow
        if (isActive || isHover) {
          const gr = radius * 3.5;
          const glow = ctx.createRadialGradient(n.x, n.y, radius * 0.5, n.x, n.y, gr);
          const gc = isActive ? aNodeColor : nColor;
          glow.addColorStop(0, hexToRgba(gc, 0.18));
          glow.addColorStop(0.6, hexToRgba(gc, 0.05));
          glow.addColorStop(1, hexToRgba(gc, 0));
          ctx.beginPath();
          ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Connection highlight ring
        if (isConnHover || isConnActive) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = hexToRgba(isConnActive ? aNodeColor : nColor, 0.25);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);

        if (isActive) {
          ctx.fillStyle = aNodeColor;
        } else if (isHover || isConnHover || isConnActive) {
          ctx.fillStyle = hexToRgba(nColor, 0.9);
        } else if (isOrphan) {
          ctx.fillStyle = hexToRgba(nColor, 0.25);
        } else {
          ctx.fillStyle = hexToRgba(nColor, 0.6);
        }
        ctx.fill();

        // Border
        if (isActive) {
          ctx.strokeStyle = aNodeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isHover) {
          ctx.strokeStyle = hexToRgba(nColor, 0.6);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Labels
        const showLabel = allLabels || isActive || isHover || isConnHover;
        if (showLabel) {
          const fs = isActive ? 11 : 10;
          ctx.font = `${isActive ? '600' : '400'} ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';

          const text = n.title;
          const tw = ctx.measureText(text).width;
          const ty = n.y + radius + 14;
          const ph = 5;
          const pv = 3;

          // Background pill
          ctx.fillStyle = t.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
          const bx = n.x - tw / 2 - ph;
          const by = ty - fs;
          const bw = tw + ph * 2;
          const bh = fs + pv * 2;
          const br = 3;
          ctx.beginPath();
          ctx.moveTo(bx + br, by);
          ctx.lineTo(bx + bw - br, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
          ctx.lineTo(bx + bw, by + bh - br);
          ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
          ctx.lineTo(bx + br, by + bh);
          ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
          ctx.lineTo(bx, by + br);
          ctx.quadraticCurveTo(bx, by, bx + br, by);
          ctx.closePath();
          ctx.fill();

          // Subtle border on pill
          ctx.strokeStyle = t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Text
          ctx.fillStyle = isActive ? t.text : t.textSub;
          ctx.fillText(text, n.x, ty);
        }
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.fill();

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [state.activeNoteId, state.notes, query]);

  const getNodeAt = useCallback((mx: number, my: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const wx = (mx - p.x) / z;
    const wy = (my - p.y) / z;
    const s = settingsRef.current;
    const nSize = s.nodeBaseSize as number;
    const cBoost = s.connBoost as number;
    for (const n of [...nodesRef.current].reverse()) {
      const boost = Math.min(n.conns * cBoost, nSize * 1.2);
      const r = nSize + boost + 8;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    wasDragRef.current = false;
    if (node) {
      dragRef.current = node.id;
    } else {
      panRef.current.dragging = true;
      panRef.current.sx = e.clientX - panRef.current.x;
      panRef.current.sy = e.clientY - panRef.current.y;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragRef.current) {
      wasDragRef.current = true;
      const z = zoomRef.current;
      const p = panRef.current;
      const node = nodesRef.current.find(n => n.id === dragRef.current);
      if (node) { node.x = (mx - p.x) / z; node.y = (my - p.y) / z; node.vx = 0; node.vy = 0; }
    } else if (panRef.current.dragging) {
      panRef.current.x = e.clientX - panRef.current.sx;
      panRef.current.y = e.clientY - panRef.current.sy;
    } else {
      const node = getNodeAt(mx, my);
      hoverRef.current = node?.id || null;
      canvasRef.current!.style.cursor = node ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    panRef.current.dragging = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragRef.current) { wasDragRef.current = false; return; }
    const rect = canvasRef.current!.getBoundingClientRect();
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node) dispatch({ type: 'OPEN_TAB', payload: node.id });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZ = zoomRef.current;
    const delta = e.deltaY > 0 ? 0.93 : 1.07;
    const newZ = Math.max(0.1, Math.min(5, oldZ * delta));
    panRef.current.x = mx - (mx - panRef.current.x) * (newZ / oldZ);
    panRef.current.y = my - (my - panRef.current.y) * (newZ / oldZ);
    zoomRef.current = newZ;
    setZoom(newZ);
  };

  const handleZoom = (d: number) => {
    const cx = sizeRef.current.w / 2;
    const cy = sizeRef.current.h / 2;
    const oldZ = zoomRef.current;
    const newZ = Math.max(0.1, Math.min(5, oldZ + d));
    panRef.current.x = cx - (cx - panRef.current.x) * (newZ / oldZ);
    panRef.current.y = cy - (cy - panRef.current.y) * (newZ / oldZ);
    zoomRef.current = newZ;
    setZoom(newZ);
  };

  const resetView = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0, dragging: false, sx: 0, sy: 0 };
    setZoom(1);
    // Force fresh layout
    nodesRef.current = [];
    buildGraph();
  };

  const centerGraph = () => {
    if (nodesRef.current.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodesRef.current.forEach(n => {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    panRef.current.x = sizeRef.current.w / 2 - ((minX + maxX) / 2) * zoomRef.current;
    panRef.current.y = sizeRef.current.h / 2 - ((minY + maxY) / 2) * zoomRef.current;
  };

  const resetDefaults = () => {
    setNodeColor(''); setActiveNodeColor('');
    setLineColor(''); setActiveLineColor('');
    setNodeBaseSize(5); setConnBoost(0.8);
    setLineWidth(1); setActiveLineWidth(2);
    setLineOpacity(0.5); setLineDash('solid');
    setShowAllLabels(false); setRadialSpread(1);
  };

  // Theme-aware UI colors
  const uiBg = theme.isDark ? 'rgba(28,28,28,0.94)' : 'rgba(252,252,252,0.96)';
  const uiBorder = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
  const uiText = theme.isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)';
  const uiTextSub = theme.isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const uiTextDim = theme.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
  const uiInputBg = theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const uiHover = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const BtnStyle = (color: string = uiTextDim): React.CSSProperties => ({
    width: 32, height: 32, background: 'none', border: 'none',
    color, cursor: 'pointer', borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div className="fixed inset-0 animate-fade-in" style={{ zIndex: 110, background: theme.bg }}>
      <canvas ref={canvasRef}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onClick={handleClick} onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Header */}
      <div className="flex items-center justify-between" style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '10px 16px', background: uiBg,
        borderBottom: `1px solid ${uiBorder}`, backdropFilter: 'blur(10px)',
      }}>
        <div className="flex items-center gap-3">
          <FlintLogo size={14} />
          <span style={{ fontSize: 12, fontWeight: 600, color: uiTextSub }}>Graph View</span>
          <span style={{
            fontSize: 10, color: uiTextDim, background: uiInputBg,
            padding: '2px 8px', borderRadius: 4, border: `1px solid ${uiBorder}`,
          }}>
            {stats.nodes} nodes · {stats.edges} links
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" style={{
            padding: '6px 10px', background: uiInputBg,
            border: `1px solid ${uiBorder}`, borderRadius: 6,
          }}>
            <Search size={12} style={{ color: uiTextDim }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Filter nodes..."
              style={{ background: 'none', border: 'none', outline: 'none', color: uiText, fontSize: 12, width: 130 }}
            />
            {query && (
              <button onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', color: uiTextDim, cursor: 'pointer', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
          <span style={{ fontSize: 10, color: uiTextDim, minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
            style={{ background: 'none', border: 'none', color: uiTextDim, cursor: 'pointer', display: 'flex', padding: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = uiText; }}
            onMouseLeave={e => { e.currentTarget.style.color = uiTextDim; }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Settings */}
      <div style={{
        position: 'absolute', top: 56, right: 12, width: 232,
        background: uiBg, backdropFilter: 'blur(12px)',
        border: `1px solid ${uiBorder}`, borderRadius: 8, overflow: 'hidden',
      }}>
        <button onClick={() => setSettingsOpen(!settingsOpen)} style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 12px',
          background: 'none', border: 'none', color: uiText, cursor: 'pointer',
          borderBottom: settingsOpen ? `1px solid ${uiBorder}` : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={13} style={{ color: uiTextDim }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Appearance</span>
          </div>
          {settingsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {settingsOpen && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
            {/* Nodes */}
            <Section title="Nodes" color={uiTextDim}>
              <ColorRow label="Color" value={getNodeColor()} onChange={setNodeColor} sub={uiTextSub} />
              <ColorRow label="Active" value={getActiveNodeColor()} onChange={setActiveNodeColor} sub={uiTextSub} />
              <SliderRow label="Size" value={nodeBaseSize} min={2} max={10} step={0.5}
                onChange={setNodeBaseSize} sub={uiTextSub} dim={uiTextDim} />
              <SliderRow label="Conn boost" value={connBoost} min={0} max={3} step={0.1}
                onChange={setConnBoost} sub={uiTextSub} dim={uiTextDim} />
            </Section>

            {/* Lines */}
            <Section title="Lines" color={uiTextDim}>
              <ColorRow label="Color" value={getLineColor()} onChange={setLineColor} sub={uiTextSub} />
              <ColorRow label="Active" value={getActiveLineColor()} onChange={setActiveLineColor} sub={uiTextSub} />
              <SliderRow label="Width" value={lineWidth} min={0.3} max={4} step={0.1}
                onChange={setLineWidth} sub={uiTextSub} dim={uiTextDim} />
              <SliderRow label="Highlight" value={activeLineWidth} min={0.5} max={5} step={0.2}
                onChange={setActiveLineWidth} sub={uiTextSub} dim={uiTextDim} />
              <SliderRow label="Opacity" value={lineOpacity} min={0.1} max={1} step={0.05}
                onChange={setLineOpacity} sub={uiTextSub} dim={uiTextDim} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: uiTextSub, width: 60 }}>Style</span>
                <select value={lineDash}
                  onChange={e => setLineDash(e.target.value as 'solid' | 'dashed' | 'dotted')}
                  style={{
                    flex: 1, background: uiInputBg, border: `1px solid ${uiBorder}`,
                    borderRadius: 4, padding: '3px 6px', color: uiTextSub, fontSize: 11, outline: 'none',
                  }}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </Section>

            {/* Layout */}
            <Section title="Layout" color={uiTextDim}>
              <SliderRow label="Spread" value={radialSpread} min={0.3} max={2} step={0.05}
                onChange={v => { setRadialSpread(v); nodesRef.current = []; buildGraph(); }}
                sub={uiTextSub} dim={uiTextDim} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: uiTextSub, cursor: 'pointer' }}>
                <input type="checkbox" checked={showAllLabels} onChange={e => setShowAllLabels(e.target.checked)} />
                Show all labels
              </label>
            </Section>

            <button onClick={resetDefaults} style={{
              width: '100%', padding: '7px 0',
              background: uiInputBg, border: `1px solid ${uiBorder}`,
              borderRadius: 6, color: uiTextSub, cursor: 'pointer',
              fontSize: 11, fontWeight: 500,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = uiHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = uiInputBg; }}>
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* Zoom */}
      <div style={{
        position: 'absolute', bottom: 16, right: 12,
        display: 'flex', flexDirection: 'column', gap: 2,
        background: uiBg, border: `1px solid ${uiBorder}`,
        borderRadius: 8, padding: 3, backdropFilter: 'blur(8px)',
      }}>
        {[
          { icon: <ZoomIn size={14} />, fn: () => handleZoom(0.2), t: 'Zoom in' },
          { icon: <ZoomOut size={14} />, fn: () => handleZoom(-0.2), t: 'Zoom out' },
          { icon: <Maximize2 size={14} />, fn: centerGraph, t: 'Center' },
          { icon: <RotateCcw size={14} />, fn: resetView, t: 'Reset' },
        ].map((b, i) => (
          <button key={i} onClick={b.fn} title={b.t} style={BtnStyle(uiTextDim)}
            onMouseEnter={e => { e.currentTarget.style.background = uiHover; e.currentTarget.style.color = uiText; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = uiTextDim; }}>
            {b.icon}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 12,
        background: uiBg, border: `1px solid ${uiBorder}`,
        borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: uiTextDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Legend
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <LegendItem color={getActiveNodeColor()} border size={8} label="Active note" textColor={uiTextSub} />
          <LegendItem color={getNodeColor()} opacity={0.6} size={7} label="Connected" textColor={uiTextSub} />
          <LegendItem color={getNodeColor()} opacity={0.25} size={5} label="Orphan" textColor={uiTextSub} />
        </div>
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${uiBorder}`,
          fontSize: 9, color: uiTextDim, lineHeight: 1.6,
        }}>
          Scroll to zoom · Drag to pan<br />Click node to open
        </div>
      </div>
    </div>
  );
}

// --- Helper components ---

function Section({ title, color, children }: {
  title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, color,
        marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange, sub }: {
  label: string; value: string; onChange: (v: string) => void; sub: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: sub, width: 60 }}>{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 22, height: 18, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
      <span style={{ fontSize: 9, color: sub, opacity: 0.6, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, sub, dim }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; sub: string; dim: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: sub, width: 60 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 3 }} />
      <span style={{ fontSize: 10, color: dim, width: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value % 1 === 0 ? value : value.toFixed(1)}
      </span>
    </div>
  );
}

function LegendItem({ color, opacity, border, size, label, textColor }: {
  color: string; opacity?: number; border?: boolean; size: number; label: string; textColor: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: color, opacity: opacity ?? 1,
        border: border ? `1.5px solid ${color}` : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 10, color: textColor }}>{label}</span>
    </div>
  );
}
