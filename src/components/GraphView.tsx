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
}

interface GEdge {
  from: string;
  to: string;
}

type LayoutMode = 'force' | 'ring';

function getSettingsKey(vaultId: string | null) {
  return `flint-graph-settings-${vaultId || 'default'}`;
}

function loadSettings(vaultId: string | null) {
  try {
    const raw = localStorage.getItem(getSettingsKey(vaultId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(vaultId: string | null, settings: Record<string, unknown>) {
  try {
    localStorage.setItem(getSettingsKey(vaultId), JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function isDarkTheme(): boolean {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
  if (!bg) return true;
  if (bg.startsWith('#')) {
    const hex = bg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return (r + g + b) / 3 < 128;
  }
  return true;
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
  const layoutModeRef = useRef<LayoutMode>('force');

  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [zoom, setZoom] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');

  const saved = useMemo(() => loadSettings(state.activeVaultId), [state.activeVaultId]);
  const [nodeColor, setNodeColor] = useState(saved?.nodeColor || '#7c6f9f');
  const [activeNodeColor, setActiveNodeColor] = useState(saved?.activeNodeColor || '#a78bfa');
  const [lineColor, setLineColor] = useState(saved?.lineColor || '#4a4460');
  const [activeLineColor, setActiveLineColor] = useState(saved?.activeLineColor || '#7c6f9f');
  const [nodeBaseSize, setNodeBaseSize] = useState<number>(saved?.nodeBaseSize ?? 4);
  const [connBoost, setConnBoost] = useState<number>(saved?.connBoost ?? 1.2);
  const [lineWidth, setLineWidth] = useState<number>(saved?.lineWidth ?? 1);
  const [activeLineWidth, setActiveLineWidth] = useState<number>(saved?.activeLineWidth ?? 2.0);
  const [lineOpacity, setLineOpacity] = useState<number>(saved?.lineOpacity ?? 0.5);
  const [lineDash, setLineDash] = useState<'solid' | 'dashed' | 'dotted'>(saved?.lineDash || 'solid');
  const [showAllLabels, setShowAllLabels] = useState<boolean>(saved?.showAllLabels ?? false);
  const [radialSpread, setRadialSpread] = useState<number>(saved?.radialSpread ?? 220);

  useEffect(() => {
    saveSettings(state.activeVaultId, {
      nodeColor, activeNodeColor, lineColor, activeLineColor,
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread,
    });
  }, [nodeColor, activeNodeColor, lineColor, activeLineColor,
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread, state.activeVaultId]);

  const settingsRef = useRef({
    nodeColor, activeNodeColor, lineColor, activeLineColor,
    nodeBaseSize, connBoost, lineWidth, activeLineWidth,
    lineOpacity, lineDash, showAllLabels, radialSpread,
  });

  useEffect(() => {
    settingsRef.current = {
      nodeColor, activeNodeColor, lineColor, activeLineColor,
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread,
    };
  }, [nodeColor, activeNodeColor, lineColor, activeLineColor,
      nodeBaseSize, connBoost, lineWidth, activeLineWidth,
      lineOpacity, lineDash, showAllLabels, radialSpread]);

  useEffect(() => {
    layoutModeRef.current = layoutMode;
  }, [layoutMode]);

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
    const spread = settingsRef.current.radialSpread;

    const sorted = state.notes
      .map(n => ({ note: n, conns: links[n.id]?.size || 0 }))
      .sort((a, b) => b.conns - a.conns);

    const existing = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    nodesRef.current = sorted.map(({ note, conns }, index) => {
      const old = existing.get(note.id);

      // Ring layout positions
      let ring: number;
      if (conns >= 5) ring = 0;
      else if (conns >= 3) ring = 1;
      else if (conns >= 1) ring = 2;
      else ring = 3;

      const nodesInRing = sorted.filter(s => {
        if (ring === 0) return s.conns >= 5;
        if (ring === 1) return s.conns >= 3 && s.conns < 5;
        if (ring === 2) return s.conns >= 1 && s.conns < 3;
        return s.conns === 0;
      });

      const indexInRing = nodesInRing.findIndex(s => s.note.id === note.id);
      const countInRing = nodesInRing.length;

      const radius = ring === 0
        ? spread * 0.3
        : ring === 1
        ? spread * 0.65
        : ring === 2
        ? spread * 1.0
        : spread * 1.4;

      const angle = countInRing > 0
        ? (indexInRing / countInRing) * Math.PI * 2 - Math.PI / 2
        : 0;

      const targetX = cx + Math.cos(angle) * radius;
      const targetY = cy + Math.sin(angle) * radius;

      // Force-directed: scatter from center with jitter
      const forceX = cx + (Math.random() - 0.5) * spread * 1.5;
      const forceY = cy + (Math.random() - 0.5) * spread * 1.5;

      return {
        id: note.id,
        title: note.title,
        x: old?.x ?? (layoutModeRef.current === 'ring' ? targetX : forceX),
        y: old?.y ?? (layoutModeRef.current === 'ring' ? targetY : forceY),
        vx: 0,
        vy: 0,
        conns,
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

  // Snap to ring positions
  const applyRingLayout = useCallback(() => {
    const cx = sizeRef.current.w / 2 || 500;
    const cy = sizeRef.current.h / 2 || 400;
    const spread = settingsRef.current.radialSpread;
    const sorted = [...nodesRef.current].sort((a, b) => b.conns - a.conns);

    nodesRef.current.forEach(node => {
      const sortedIdx = sorted.findIndex(n => n.id === node.id);
      const conns = node.conns;
      let ring: number;
      if (conns >= 5) ring = 0;
      else if (conns >= 3) ring = 1;
      else if (conns >= 1) ring = 2;
      else ring = 3;

      const nodesInRing = sorted.filter(n => {
        const c = n.conns;
        if (ring === 0) return c >= 5;
        if (ring === 1) return c >= 3 && c < 5;
        if (ring === 2) return c >= 1 && c < 3;
        return c === 0;
      });

      const indexInRing = nodesInRing.findIndex(n => n.id === node.id);
      const countInRing = nodesInRing.length;
      const radius = ring === 0 ? spread * 0.3 : ring === 1 ? spread * 0.65 : ring === 2 ? spread * 1.0 : spread * 1.4;
      const angle = countInRing > 0 ? (indexInRing / countInRing) * Math.PI * 2 - Math.PI / 2 : 0;

      node.vx += (cx + Math.cos(angle) * radius - node.x) * 0.04;
      node.vy += (cy + Math.sin(angle) * radius - node.y) * 0.04;
    });
  }, []);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let running = true;
    const dark = isDarkTheme();

    // Obsidian dark palette
    const BG = '#0d0d0d';
    const GRID_DOT = 'rgba(255,255,255,0.035)';

    const getNode = (id: string) => nodesRef.current.find(n => n.id === id);

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const mode = layoutModeRef.current;

      if (mode === 'force') {
        const cx = sizeRef.current.w / 2;
        const cy = sizeRef.current.h / 2;

        // Repulsion between all nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = 2800 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }

        // Spring attraction along edges
        for (const e of edges) {
          const a = getNode(e.from);
          const b = getNode(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const naturalLen = 90 + (a.conns + b.conns) * 6;
          const force = (dist - naturalLen) * 0.006;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        // Gravity toward center
        for (const n of nodes) {
          n.vx += (cx - n.x) * 0.00025;
          n.vy += (cy - n.y) * 0.00025;
        }
      } else {
        // Ring layout — pull toward ring positions
        applyRingLayout();
      }

      // Apply velocity with damping
      for (const n of nodes) {
        if (n.id === dragRef.current) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.85;
        n.vy *= 0.85;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 8) { n.vx = (n.vx / speed) * 8; n.vy = (n.vy / speed) * 8; }
        n.x += n.vx;
        n.y += n.vy;
      }
    };

    const hexToRgba = (hex: string, alpha: number): string => {
      const c = hex.replace('#', '');
      const r = parseInt(c.substring(0, 2), 16) || 0;
      const g = parseInt(c.substring(2, 4), 16) || 0;
      const b = parseInt(c.substring(4, 6), 16) || 0;
      return `rgba(${r},${g},${b},${alpha})`;
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
      const q = query.toLowerCase();

      // Obsidian-style deep dark background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // Fine dot grid
      ctx.fillStyle = GRID_DOT;
      const gs = 28 * z;
      if (gs > 6) {
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

      // Ring guides (only in ring mode, or subtly in force)
      if (layoutModeRef.current === 'ring') {
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([3, 8]);
        for (let i = 1; i <= 4; i++) {
          const r = s.radialSpread * (i * 0.35);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      const isMatch = (n: GNode) => !q || n.title.toLowerCase().includes(q);

      const getConnectedIds = (nodeId: string): Set<string> => {
        const ids = new Set<string>();
        edges.forEach(e => {
          if (e.from === nodeId) ids.add(e.to);
          if (e.to === nodeId) ids.add(e.from);
        });
        return ids;
      };

      const hoverConnected = hoverRef.current ? getConnectedIds(hoverRef.current) : new Set<string>();
      const activeConnected = activeId ? getConnectedIds(activeId) : new Set<string>();

      const getDash = (): number[] => {
        if (s.lineDash === 'dashed') return [6, 4];
        if (s.lineDash === 'dotted') return [2, 3];
        return [];
      };

      // Draw edges with smooth curves
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        if (q && !isMatch(a) && !isMatch(b)) continue;

        const isActiveEdge = activeId === e.from || activeId === e.to;
        const isHoverEdge = hoverRef.current === e.from || hoverRef.current === e.to;
        const highlight = isActiveEdge || isHoverEdge;

        ctx.beginPath();
        // Slightly curved lines for Obsidian feel
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        if (highlight) {
          ctx.strokeStyle = hexToRgba(s.activeLineColor, 0.9);
          ctx.lineWidth = s.activeLineWidth / z;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = hexToRgba(s.lineColor, s.lineOpacity);
          ctx.lineWidth = s.lineWidth / z;
          ctx.setLineDash(getDash());
        }

        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Nodes
      for (const n of nodes) {
        const dimmed = q && !isMatch(n);
        if (dimmed) continue;

        const isActive = n.id === activeId;
        const isHover = n.id === hoverRef.current;
        const isConnectedToHover = hoverConnected.has(n.id);
        const isConnectedToActive = activeConnected.has(n.id);

        const boost = Math.min(n.conns * s.connBoost, s.nodeBaseSize * 2);
        const radius = s.nodeBaseSize + boost;

        // Obsidian-style outer glow
        if (isActive || isHover) {
          const glowRadius = radius * 4;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowRadius);
          const glowColor = isActive ? s.activeNodeColor : s.nodeColor;
          glow.addColorStop(0, hexToRgba(glowColor, isActive ? 0.35 : 0.2));
          glow.addColorStop(0.4, hexToRgba(glowColor, isActive ? 0.12 : 0.07));
          glow.addColorStop(1, hexToRgba(glowColor, 0));
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Connected-to-active: subtle highlight ring
        if (isConnectedToActive && !isActive) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 2.5 / z, 0, Math.PI * 2);
          ctx.strokeStyle = hexToRgba(s.activeNodeColor, 0.3);
          ctx.lineWidth = 1 / z;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);

        if (isActive) {
          // Obsidian active: bright with inner gradient
          const grad = ctx.createRadialGradient(n.x - radius * 0.3, n.y - radius * 0.3, 0, n.x, n.y, radius);
          grad.addColorStop(0, hexToRgba(s.activeNodeColor, 1));
          grad.addColorStop(1, hexToRgba(s.activeNodeColor, 0.75));
          ctx.fillStyle = grad;
        } else if (isHover) {
          ctx.fillStyle = hexToRgba(s.nodeColor, 0.95);
        } else if (isConnectedToHover || isConnectedToActive) {
          ctx.fillStyle = hexToRgba(s.nodeColor, 0.85);
        } else if (n.conns === 0) {
          ctx.fillStyle = hexToRgba(s.nodeColor, 0.28);
        } else {
          ctx.fillStyle = hexToRgba(s.nodeColor, 0.65);
        }
        ctx.fill();

        // Stroke ring
        if (isActive) {
          ctx.strokeStyle = hexToRgba(s.activeNodeColor, 0.9);
          ctx.lineWidth = 1.5 / z;
          ctx.stroke();
        } else if (isHover) {
          ctx.strokeStyle = hexToRgba(s.nodeColor, 0.7);
          ctx.lineWidth = 1 / z;
          ctx.stroke();
        }

        // Label rendering — Obsidian style
        const showLabel = s.showAllLabels || isActive || isHover || isConnectedToHover || isConnectedToActive;
        if (showLabel) {
          const fontSize = (isActive ? 12 : isHover ? 11 : 10) / z;
          ctx.font = `${isActive ? '500' : '400'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';

          const text = n.title.length > 28 ? n.title.slice(0, 26) + '…' : n.title;
          const tw = ctx.measureText(text).width;
          const tx = n.x;
          const ty = n.y + radius + (14 / z);
          const padH = 5 / z;
          const padV = 3 / z;

          // Pill background
          ctx.fillStyle = 'rgba(13,13,13,0.78)';
          const bx = tx - tw / 2 - padH;
          const by = ty - fontSize;
          const bw = tw + padH * 2;
          const bh = fontSize + padV * 2;
          const br = 3 / z;
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

          ctx.fillStyle = isActive
            ? hexToRgba(s.activeNodeColor, 0.95)
            : isHover
            ? 'rgba(255,255,255,0.82)'
            : 'rgba(255,255,255,0.55)';
          ctx.fillText(text, tx, ty);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [state.activeNoteId, state.notes, query, layoutMode, applyRingLayout]);

  const getNodeAt = useCallback((mx: number, my: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const wx = (mx - p.x) / z;
    const wy = (my - p.y) / z;
    const s = settingsRef.current;
    for (const n of [...nodesRef.current].reverse()) {
      const boost = Math.min(n.conns * s.connBoost, s.nodeBaseSize * 2);
      const r = s.nodeBaseSize + boost + 6;
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
      if (node) {
        node.x = (mx - p.x) / z;
        node.y = (my - p.y) / z;
        node.vx = 0;
        node.vy = 0;
      }
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
    if (node) {
      dispatch({ type: 'OPEN_TAB', payload: node.id });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZ = zoomRef.current;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZ = Math.max(0.1, Math.min(5, oldZ * delta));
    panRef.current.x = mx - (mx - panRef.current.x) * (newZ / oldZ);
    panRef.current.y = my - (my - panRef.current.y) * (newZ / oldZ);
    zoomRef.current = newZ;
    setZoom(newZ);
  };

  const handleZoom = (delta: number) => {
    const cx = sizeRef.current.w / 2;
    const cy = sizeRef.current.h / 2;
    const oldZ = zoomRef.current;
    const newZ = Math.max(0.1, Math.min(5, oldZ + delta));
    panRef.current.x = cx - (cx - panRef.current.x) * (newZ / oldZ);
    panRef.current.y = cy - (cy - panRef.current.y) * (newZ / oldZ);
    zoomRef.current = newZ;
    setZoom(newZ);
  };

  const resetView = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0, dragging: false, sx: 0, sy: 0 };
    setZoom(1);
    buildGraph();
  };

  const centerGraph = () => {
    if (nodesRef.current.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodesRef.current.forEach(n => {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    const graphCx = (minX + maxX) / 2;
    const graphCy = (minY + maxY) / 2;
    panRef.current.x = sizeRef.current.w / 2 - graphCx * zoomRef.current;
    panRef.current.y = sizeRef.current.h / 2 - graphCy * zoomRef.current;
  };

  const dark = isDarkTheme();
  const borderColor = 'rgba(255,255,255,0.07)';
  const panelBg = 'rgba(18,18,18,0.96)';
  const textMain = 'rgba(255,255,255,0.82)';
  const textDim = 'rgba(255,255,255,0.35)';
  const textSub = 'rgba(255,255,255,0.55)';
  const inputBg = 'rgba(255,255,255,0.04)';
  const accentPurple = '#7c6f9f';

  const btnBase: React.CSSProperties = {
    width: 32, height: 32, background: 'none', border: 'none',
    color: textDim, cursor: 'pointer', borderRadius: 5,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.12s',
  };

  return (
    <div
      className="fixed inset-0 animate-fade-in"
      style={{ zIndex: 110, background: '#0d0d0d' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '9px 14px',
          background: panelBg,
          borderBottom: `1px solid ${borderColor}`,
          backdropFilter: 'blur(14px)',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3">
          <FlintLogo size={14} />
          <span style={{ fontSize: 12, fontWeight: 600, color: textSub, letterSpacing: 0.2 }}>
            Graph View
          </span>
          <span style={{
            fontSize: 10, color: textDim,
            background: inputBg,
            padding: '2px 8px', borderRadius: 4,
            border: `1px solid ${borderColor}`,
          }}>
            {stats.nodes} nodes · {stats.edges} links
          </span>

          {/* Layout toggle */}
          <div style={{
            display: 'flex',
            background: inputBg,
            border: `1px solid ${borderColor}`,
            borderRadius: 6,
            padding: 2,
            gap: 2,
          }}>
            {(['force', 'ring'] as LayoutMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: layoutMode === mode ? accentPurple : 'none',
                  color: layoutMode === mode ? '#fff' : textDim,
                  transition: 'all 0.15s',
                }}
              >
                {mode === 'force' ? 'Force' : 'Ring'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" style={{
            padding: '5px 10px', background: inputBg,
            border: `1px solid ${borderColor}`, borderRadius: 6,
          }}>
            <Search size={11} style={{ color: textDim }} />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Filter nodes..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: textMain, fontSize: 12, width: 130,
                fontFamily: 'inherit',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', color: textDim, cursor: 'pointer', display: 'flex', padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>

          <span style={{
            fontSize: 10, color: textDim, minWidth: 38,
            textAlign: 'center', fontVariantNumeric: 'tabular-nums',
          }}>
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
            style={{ background: 'none', border: 'none', color: textDim, cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = textMain; e.currentTarget.style.background = inputBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = textDim; e.currentTarget.style.background = 'none'; }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <div style={{
        position: 'absolute', top: 54, right: 12, width: 236,
        background: panelBg, backdropFilter: 'blur(14px)',
        border: `1px solid ${borderColor}`, borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '9px 12px',
            background: 'none', border: 'none', color: textMain, cursor: 'pointer',
            borderBottom: settingsOpen ? `1px solid ${borderColor}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={12} style={{ color: textDim }} />
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.2 }}>Appearance</span>
          </div>
          {settingsOpen ? <ChevronDown size={12} style={{ color: textDim }} /> : <ChevronRight size={12} style={{ color: textDim }} />}
        </button>

        {settingsOpen && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflowY: 'auto' }}>

            {/* Nodes */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Nodes
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Color', el: <input type="color" value={nodeColor} onChange={e => setNodeColor(e.target.value)} style={{ width: 22, height: 18, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer', background: 'none' }} /> },
                  { label: 'Active', el: <input type="color" value={activeNodeColor} onChange={e => setActiveNodeColor(e.target.value)} style={{ width: 22, height: 18, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer', background: 'none' }} /> },
                ].map(({ label, el }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: textSub, width: 60 }}>{label}</span>
                    {el}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: textSub, width: 60 }}>Size</span>
                  <input type="range" min={2} max={10} step={0.5} value={nodeBaseSize}
                    onChange={e => setNodeBaseSize(parseFloat(e.target.value))} style={{ flex: 1, accentColor: accentPurple }} />
                  <span style={{ fontSize: 10, color: textDim, width: 20, textAlign: 'right' }}>{nodeBaseSize}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: textSub, width: 60 }}>Boost</span>
                  <input type="range" min={0} max={3} step={0.2} value={connBoost}
                    onChange={e => setConnBoost(parseFloat(e.target.value))} style={{ flex: 1, accentColor: accentPurple }} />
                  <span style={{ fontSize: 10, color: textDim, width: 20, textAlign: 'right' }}>{connBoost}</span>
                </div>
              </div>
            </div>

            {/* Lines */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Lines
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Color', el: <input type="color" value={lineColor} onChange={e => setLineColor(e.target.value)} style={{ width: 22, height: 18, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer' }} /> },
                  { label: 'Active', el: <input type="color" value={activeLineColor} onChange={e => setActiveLineColor(e.target.value)} style={{ width: 22, height: 18, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer' }} /> },
                ].map(({ label, el }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: textSub, width: 60 }}>{label}</span>
                    {el}
                  </div>
                ))}
                {[
                  { label: 'Width', min: 0.5, max: 4, step: 0.1, value: lineWidth, set: setLineWidth },
                  { label: 'Highlight', min: 1, max: 5, step: 0.2, value: activeLineWidth, set: setActiveLineWidth },
                  { label: 'Opacity', min: 0.1, max: 1, step: 0.05, value: lineOpacity, set: setLineOpacity, fmt: (v: number) => v.toFixed(1) },
                ].map(({ label, min, max, step, value, set, fmt }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: textSub, width: 60 }}>{label}</span>
                    <input type="range" min={min} max={max} step={step} value={value}
                      onChange={e => (set as (v: number) => void)(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: accentPurple }} />
                    <span style={{ fontSize: 10, color: textDim, width: 24, textAlign: 'right' }}>
                      {fmt ? fmt(value) : value}
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: textSub, width: 60 }}>Style</span>
                  <select
                    value={lineDash}
                    onChange={e => setLineDash(e.target.value as 'solid' | 'dashed' | 'dotted')}
                    style={{
                      flex: 1, background: inputBg, border: `1px solid ${borderColor}`,
                      borderRadius: 4, padding: '3px 6px', color: textSub,
                      fontSize: 11, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Layout */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Layout
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: textSub, width: 60 }}>Spread</span>
                  <input type="range" min={100} max={500} step={10} value={radialSpread}
                    onChange={e => setRadialSpread(parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: accentPurple }} />
                  <span style={{ fontSize: 10, color: textDim, width: 24, textAlign: 'right' }}>{radialSpread}</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: textSub, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showAllLabels}
                    onChange={e => setShowAllLabels(e.target.checked)}
                    style={{ accentColor: accentPurple }}
                  />
                  Show all labels
                </label>
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={() => {
                setNodeColor('#7c6f9f'); setActiveNodeColor('#a78bfa');
                setLineColor('#4a4460'); setActiveLineColor('#7c6f9f');
                setNodeBaseSize(4); setConnBoost(1.2);
                setLineWidth(1); setActiveLineWidth(2.0);
                setLineOpacity(0.5); setLineDash('solid');
                setShowAllLabels(false); setRadialSpread(220);
              }}
              style={{
                width: '100%', padding: '7px 0',
                background: inputBg, border: `1px solid ${borderColor}`,
                borderRadius: 6, color: textSub, cursor: 'pointer',
                fontSize: 11, fontWeight: 500, letterSpacing: 0.2,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,111,159,0.15)'; e.currentTarget.style.color = textMain; }}
              onMouseLeave={e => { e.currentTarget.style.background = inputBg; e.currentTarget.style.color = textSub; }}
            >
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 16, right: 12,
        display: 'flex', flexDirection: 'column', gap: 1,
        background: panelBg, border: `1px solid ${borderColor}`,
        borderRadius: 8, padding: 3, backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        {[
          { icon: <ZoomIn size={13} />, fn: () => handleZoom(0.2), t: 'Zoom in' },
          { icon: <ZoomOut size={13} />, fn: () => handleZoom(-0.2), t: 'Zoom out' },
          { icon: <Maximize2 size={13} />, fn: centerGraph, t: 'Center graph' },
          { icon: <RotateCcw size={13} />, fn: resetView, t: 'Reset view' },
        ].map((b, i) => (
          <button
            key={i}
            onClick={b.fn}
            title={b.t}
            style={btnBase}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(124,111,159,0.18)';
              e.currentTarget.style.color = textMain;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = textDim;
            }}
          >
            {b.icon}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 12,
        background: panelBg, border: `1px solid ${borderColor}`,
        borderRadius: 8, padding: '10px 13px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Legend
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { size: 8, color: activeNodeColor, opacity: 1, label: 'Active note', border: activeNodeColor },
            { size: 7, color: nodeColor, opacity: 0.85, label: 'Connected' },
            { size: 5, color: nodeColor, opacity: 0.28, label: 'Orphan' },
          ].map(({ size, color, opacity, label, border }) => (
            <div key={label} className="flex items-center gap-2">
              <div style={{
                width: size, height: size, borderRadius: '50%',
                background: color, opacity,
                flexShrink: 0,
                ...(border ? { boxShadow: `0 0 6px ${border}60` } : {}),
              }} />
              <span style={{ fontSize: 10, color: textSub }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${borderColor}`,
          fontSize: 9, color: textDim, lineHeight: 1.7,
        }}>
          Scroll to zoom · Drag to pan
          <br />
          Click node to open · Drag node to move
        </div>
      </div>
    </div>
  );
}
