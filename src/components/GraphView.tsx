import { useEffect, useRef, useCallback, useState } from 'react';

import { useStore } from '../store';

import { FlintLogo } from './FlintLogo';

import { X, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Search, Palette } from 'lucide-react';

interface GNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  conns: number;
  group: string;
}

interface GEdge {
  from: string;
  to: string;
}

function graphColorKey(vaultId: string | null) {
  return `flint-graph-colors-${vaultId || 'default'}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '').trim();

  if (clean.length !== 6) return { r: 143, g: 161, b: 191 };

  const n = parseInt(clean, 16);

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
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
  const physicsRef = useRef(true);

  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  const groupTargetRef = useRef<Record<string, { x: number; y: number }>>({});
  const sizeRef = useRef({ w: 0, h: 0 });

  const bloomRef = useRef<Map<string, { start: number; angle: number; magnitude: number; duration: number }>>(new Map());
  const bloomStartRef = useRef(0);

  const firstBuildRef = useRef(true);

  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0 });

  const [filterQuery, setFilterQuery] = useState('');
  const [depthFilter, setDepthFilter] = useState(0);
  const [showAllLabels, setShowAllLabels] = useState(false);

  const [nodeScale, setNodeScale] = useState(1.15);
  const [linkDistance, setLinkDistance] = useState(145);
  const [centerForce, setCenterForce] = useState(0.0032);
  const [groupPull, setGroupPull] = useState(0.0018);
  const [groupSpread, setGroupSpread] = useState(330);

  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [selectedGroup, setSelectedGroup] = useState('root');

  const [showSettings, setShowSettings] = useState(false);
  const [edgeOpacity, setEdgeOpacity] = useState(0.42);
  const [physicsRunning, setPhysicsRunning] = useState(true);

  useEffect(() => {
    physicsRef.current = physicsRunning;
  }, [physicsRunning]);

  useEffect(() => {
    selectedRef.current = state.activeNoteId || null;
  }, [state.activeNoteId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(graphColorKey(state.activeVaultId));
      setGroupColors(raw ? JSON.parse(raw) as Record<string, string> : {});
    } catch {
      setGroupColors({});
    }
  }, [state.activeVaultId]);

  useEffect(() => {
    try {
      localStorage.setItem(graphColorKey(state.activeVaultId), JSON.stringify(groupColors));
    } catch {
      // ignore
    }
  }, [groupColors, state.activeVaultId]);

  const deriveGroup = useCallback((note: typeof state.notes[number]) => {
    if (note.folderId) {
      const folder = state.folders.find(f => f.id === note.folderId);
      return `folder:${folder?.name || note.folderId}`;
    }

    if (note.filePath && note.filePath.includes('/')) {
      const parts = note.filePath.split('/');
      if (parts.length > 1) return `path:${parts.slice(0, -1).join('/')}`;
    }

    return 'root';
  }, [state.folders]);

  const getNodeRadius = useCallback((n: GNode) => {
    const connectionBoost = Math.sqrt(Math.max(0, n.conns)) * 0.85;
    return clamp((2.8 + connectionBoost) * nodeScale, 2.2, 10);
  }, [nodeScale]);

  const animate = useCallback(() => {
    const cx = sizeRef.current.w / 2 || 400;
    const cy = sizeRef.current.h / 2 || 300;

    physicsRef.current = true;
    setPhysicsRunning(true);

    bloomRef.current.clear();

    const now = performance.now();
    bloomStartRef.current = now;

    nodesRef.current.forEach(n => {
      n.x = cx + (Math.random() - 0.5) * 8;
      n.y = cy + (Math.random() - 0.5) * 8;
      n.vx = 0;
      n.vy = 0;
    });

    const total = Math.max(nodesRef.current.length, 1);

    nodesRef.current.forEach((n, i) => {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const angle = i * golden + (Math.random() - 0.5) * 0.25;
      const magnitude = 0.38 + Math.sqrt(n.conns + 1) * 0.05 + Math.random() * 0.15;
      const duration = 2400 + Math.random() * 1300;

      bloomRef.current.set(n.id, {
        start: now + (i / total) * 600,
        angle,
        magnitude,
        duration,
      });
    });
  }, []);

  const buildGraph = useCallback(() => {
    const links: Record<string, Set<string>> = {};
    const noteTitleIdMap = new Map(state.notes.map(n => [n.title.toLowerCase(), n.id] as const));

    state.notes.forEach(n => {
      links[n.id] = new Set();
    });

    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);

      for (const m of matches) {
        const targetId = noteTitleIdMap.get(m[1].toLowerCase());

        if (targetId && targetId !== n.id) {
          links[n.id].add(targetId);
          links[targetId].add(n.id);
        }
      }
    });

    const cx = sizeRef.current.w / 2 || 400;
    const cy = sizeRef.current.h / 2 || 300;

    const groups = Array.from(new Set(state.notes.map(deriveGroup)));
    const targetMap: Record<string, { x: number; y: number }> = {};

    if (groups.length <= 1) {
      targetMap[groups[0] || 'root'] = { x: cx, y: cy };
    } else {
      groups.forEach((g, i) => {
        const angle = (i / groups.length) * Math.PI * 2 - Math.PI / 2;
        const radius = Math.max(groupSpread, 120);

        targetMap[g] = {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
      });
    }

    groupTargetRef.current = targetMap;

    const oldNodes = new Map(nodesRef.current.map(n => [n.id, n]));

    nodesRef.current = state.notes.map((n, i) => {
      const old = oldNodes.get(n.id);

      if (old) {
        return {
          ...old,
          title: n.title,
          group: deriveGroup(n),
          conns: links[n.id]?.size || 0,
        };
      }

      const angle = (i / Math.max(state.notes.length, 1)) * Math.PI * 2;

      return {
        group: deriveGroup(n),
        id: n.id,
        title: n.title,
        x: cx + Math.cos(angle) * 35,
        y: cy + Math.sin(angle) * 35,
        vx: 0,
        vy: 0,
        conns: links[n.id]?.size || 0,
      };
    });

    const edgeSet = new Set<string>();
    const nextEdges: GEdge[] = [];

    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);

      for (const m of matches) {
        const targetId = noteTitleIdMap.get(m[1].toLowerCase());

        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join('::');

          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            nextEdges.push({ from: n.id, to: targetId });
          }
        }
      }
    });

    edgesRef.current = nextEdges;

    setGraphStats({
      nodes: nodesRef.current.length,
      edges: edgesRef.current.length,
    });

    setSelectedGroup(prev => {
      if (groups.includes(prev)) return prev;
      return groups[0] || 'root';
    });

    if (firstBuildRef.current) {
      firstBuildRef.current = false;
      setTimeout(() => animate(), 80);
    }
  }, [state.notes, deriveGroup, groupSpread, animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      sizeRef.current = { w: rect.width, h: rect.height };
    };

    resize();

    window.addEventListener('resize', resize);

    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let running = true;

    function getNode(id: string) {
      return nodesRef.current.find(n => n.id === id);
    }

    function getVisibleNodeIds(): Set<string> | null {
      if (depthFilter === 0) return null;

      const activeId = selectedRef.current || state.activeNoteId;
      if (!activeId) return null;

      const visible = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: activeId, depth: 0 }];
      const visited = new Set<string>([activeId]);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        visible.add(curr.id);

        if (curr.depth >= depthFilter) continue;

        for (const edge of edgesRef.current) {
          let neighborId: string | null = null;

          if (edge.from === curr.id) neighborId = edge.to;
          else if (edge.to === curr.id) neighborId = edge.from;

          if (neighborId && !visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push({ id: neighborId, depth: curr.depth + 1 });
          }
        }
      }

      return visible;
    }

    function simulate() {
      if (!physicsRef.current) return;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      if (nodes.length === 0) return;

      const cx = sizeRef.current.w / 2;
      const cy = sizeRef.current.h / 2;

      const now = performance.now();
      const isBlooming = bloomRef.current.size > 0;
      const bloomElapsed = now - bloomStartRef.current;

      const warmup = isBlooming ? clamp(bloomElapsed / 3200, 0.1, 1) : 1;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];

          let dx = b.x - a.x;
          let dy = b.y - a.y;

          let d2 = dx * dx + dy * dy;

          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 0.1;
            dy = (Math.random() - 0.5) * 0.1;
            d2 = dx * dx + dy * dy;
          }

          const d = Math.sqrt(d2);
          const sameGroup = a.group === b.group;

          const charge = sameGroup ? 1150 : 1850;
          const f = (charge / Math.max(d2, 80)) * warmup;

          const fx = (dx / d) * f;
          const fy = (dy / d) * f;

          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);

        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;

        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);

        const target = linkDistance + Math.min(80, (a.conns + b.conns) * 2);
        const strength = 0.018;

        const f = (d - target) * strength * warmup;

        const fx = (dx / d) * f;
        const fy = (dy / d) * f;

        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      for (const n of nodes) {
        n.vx += (cx - n.x) * centerForce * warmup;
        n.vy += (cy - n.y) * centerForce * warmup;

        const gt = groupTargetRef.current[n.group];

        if (gt) {
          n.vx += (gt.x - n.x) * groupPull * warmup;
          n.vy += (gt.y - n.y) * groupPull * warmup;
        }
      }

      for (const n of nodes) {
        const bloom = bloomRef.current.get(n.id);

        if (!bloom) continue;

        const elapsed = now - bloom.start;

        if (elapsed > 0 && elapsed < bloom.duration) {
          const t = elapsed / bloom.duration;
          const ease = Math.sin(t * Math.PI);

          n.vx += Math.cos(bloom.angle) * bloom.magnitude * ease;
          n.vy += Math.sin(bloom.angle) * bloom.magnitude * ease;
        } else if (elapsed >= bloom.duration) {
          bloomRef.current.delete(n.id);
        }
      }

      for (const n of nodes) {
        if (n.id === dragRef.current) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }

        const damping = isBlooming ? 0.91 : 0.86;

        n.vx *= damping;
        n.vy *= damping;

        const maxSpeed = isBlooming ? 8 : 14;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);

        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }

        n.x += n.vx;
        n.y += n.vy;
      }
    }

    function draw() {
      if (!running) return;

      simulate();

      const dpr = window.devicePixelRatio || 1;
      const w = sizeRef.current.w;
      const h = sizeRef.current.h;

      const z = zoomRef.current;
      const p = panRef.current;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      const css = getComputedStyle(document.body);

      const theme = {
        bgBase: css.getPropertyValue('--bg-base').trim() || '#1e1e1e',
        bgDeep: css.getPropertyValue('--bg-deep').trim() || '#191919',
        bgSurface: css.getPropertyValue('--bg-surface').trim() || '#242424',
        border: css.getPropertyValue('--border').trim() || '#363636',
        text: css.getPropertyValue('--text').trim() || '#dcddde',
        textSecondary: css.getPropertyValue('--text-secondary').trim() || '#b9bbbe',
        textDim: css.getPropertyValue('--text-dim').trim() || '#7d8590',
        accent: css.getPropertyValue('--accent').trim() || '#8b5cf6',
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1f1f23');
      bg.addColorStop(0.55, '#1b1b1f');
      bg.addColorStop(1, '#18181b');

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const gridSize = 42 * z;

      if (gridSize > 9) {
        const ox = ((p.x % gridSize) + gridSize) % gridSize;
        const oy = ((p.y % gridSize) + gridSize) % gridSize;

        ctx.fillStyle = 'rgba(255,255,255,0.025)';

        for (let x = ox; x < w; x += gridSize) {
          for (let y = oy; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (nodes.length === 0) {
        ctx.fillStyle = theme.textDim;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No notes to display', w / 2, h / 2);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const visibleIds = getVisibleNodeIds();
      const queryLower = filterQuery.toLowerCase().trim();

      const selectedId = selectedRef.current;
      const hoveredId = hoverRef.current;

      const selectedNeighbors = new Set<string>();
      const hoveredNeighbors = new Set<string>();

      for (const e of edges) {
        if (selectedId) {
          if (e.from === selectedId) selectedNeighbors.add(e.to);
          if (e.to === selectedId) selectedNeighbors.add(e.from);
        }

        if (hoveredId) {
          if (e.from === hoveredId) hoveredNeighbors.add(e.to);
          if (e.to === hoveredId) hoveredNeighbors.add(e.from);
        }
      }

      const matchesFilter = (n: GNode) => {
        if (!queryLower) return true;
        return n.title.toLowerCase().includes(queryLower);
      };

      const isVisible = (n: GNode) => {
        if (visibleIds && !visibleIds.has(n.id)) return false;
        if (queryLower && !matchesFilter(n)) return false;
        return true;
      };

      const focusId = hoveredId || selectedId;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      const drawTime = performance.now();

      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);

        if (!a || !b) continue;
        if (!isVisible(a) || !isVisible(b)) continue;

        const bloomA = bloomRef.current.get(a.id);
        const bloomB = bloomRef.current.get(b.id);

        const edgeBloomAlpha = Math.min(
          bloomA ? clamp((drawTime - bloomA.start) / 650, 0, 1) : 1,
          bloomB ? clamp((drawTime - bloomB.start) / 650, 0, 1) : 1,
        );

        const connectedToSelected = selectedId && (e.from === selectedId || e.to === selectedId);
        const connectedToHovered = hoveredId && (e.from === hoveredId || e.to === hoveredId);

        const unrelatedToFocus =
          focusId &&
          e.from !== focusId &&
          e.to !== focusId &&
          !selectedNeighbors.has(e.from) &&
          !selectedNeighbors.has(e.to) &&
          !hoveredNeighbors.has(e.from) &&
          !hoveredNeighbors.has(e.to);

        ctx.beginPath();

        if (connectedToHovered || connectedToSelected) {
          ctx.strokeStyle = `rgba(168, 130, 255, ${clamp(edgeOpacity + 0.34, 0, 1) * edgeBloomAlpha})`;
          ctx.lineWidth = 1.45 / Math.sqrt(z);
        } else if (unrelatedToFocus) {
          ctx.strokeStyle = `rgba(120, 128, 145, ${edgeOpacity * 0.22 * edgeBloomAlpha})`;
          ctx.lineWidth = 0.75 / Math.sqrt(z);
        } else {
          ctx.strokeStyle = `rgba(138, 146, 165, ${edgeOpacity * edgeBloomAlpha})`;
          ctx.lineWidth = 0.85 / Math.sqrt(z);
        }

        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        if (!isVisible(n)) continue;

        const bloom = bloomRef.current.get(n.id);
        const bloomScale = bloom ? clamp((drawTime - bloom.start) / 550, 0, 1) : 1;
        const bloomAlpha = bloom ? clamp((drawTime - bloom.start + 120) / 650, 0, 1) : 1;

        const r = getNodeRadius(n) * bloomScale;

        const isSelected = n.id === selectedId;
        const isHovered = n.id === hoveredId;
        const isSelectedNeighbor = selectedNeighbors.has(n.id);
        const isHoveredNeighbor = hoveredNeighbors.has(n.id);

        const unrelatedToFocus =
          focusId &&
          !isSelected &&
          !isHovered &&
          !isSelectedNeighbor &&
          !isHoveredNeighbor;

        const customGroupColor = groupColors[n.group];
        const nodeColor = customGroupColor || '#b8beca';

        const alpha = unrelatedToFocus ? 0.22 : 0.88;

        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 9, 0, Math.PI * 2);
          ctx.fillStyle = rgba(customGroupColor || '#8b5cf6', 0.13 * bloomAlpha);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = rgba(customGroupColor || '#8b5cf6', 0.22 * bloomAlpha);
          ctx.fill();
        } else if (isSelectedNeighbor || isHoveredNeighbor) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(168, 130, 255, 0.10)';
          ctx.fill();
        }

        ctx.save();

        ctx.shadowColor = isSelected || isHovered
          ? rgba(customGroupColor || '#8b5cf6', 0.55)
          : 'rgba(255,255,255,0.06)';

        ctx.shadowBlur = isSelected || isHovered ? 14 : 5;

        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1.5, r), 0, Math.PI * 2);

        if (isSelected) {
          ctx.fillStyle = rgba(customGroupColor || '#8b5cf6', 1 * bloomAlpha);
        } else if (isHovered) {
          ctx.fillStyle = rgba(customGroupColor || '#c8d0df', 0.95 * bloomAlpha);
        } else if (isSelectedNeighbor || isHoveredNeighbor) {
          ctx.fillStyle = rgba(customGroupColor || '#b49cff', 0.88 * bloomAlpha);
        } else {
          ctx.fillStyle = rgba(nodeColor, alpha * bloomAlpha);
        }

        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1.5, r), 0, Math.PI * 2);
        ctx.strokeStyle = unrelatedToFocus
          ? 'rgba(255,255,255,0.035)'
          : 'rgba(255,255,255,0.20)';
        ctx.lineWidth = 0.55 / Math.sqrt(z);
        ctx.stroke();

        ctx.restore();

        const shouldShowLabel =
          showAllLabels ||
          isHovered ||
          isSelected ||
          isSelectedNeighbor ||
          isHoveredNeighbor ||
          z > 1.8;

        if (shouldShowLabel && bloomAlpha > 0.05) {
          ctx.save();

          const labelAlpha = unrelatedToFocus ? 0.25 : 0.94;

          ctx.globalAlpha = labelAlpha * bloomAlpha;
          ctx.font = `${isSelected || isHovered ? '600' : '500'} ${clamp(10 / Math.sqrt(z), 6.5, 11)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const labelY = n.y + r + 11 / z;

          ctx.lineWidth = 3 / z;
          ctx.strokeStyle = 'rgba(24,24,27,0.78)';
          ctx.strokeText(n.title, n.x, labelY);

          ctx.fillStyle = isSelected || isHovered ? theme.text : theme.textSecondary;
          ctx.fillText(n.title, n.x, labelY);

          ctx.restore();
        }
      }

      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [
    state.activeNoteId,
    filterQuery,
    depthFilter,
    nodeScale,
    linkDistance,
    centerForce,
    groupPull,
    edgeOpacity,
    showAllLabels,
    groupColors,
    getNodeRadius,
  ]);

  const screenToWorld = useCallback((mx: number, my: number) => {
    const z = zoomRef.current;
    const p = panRef.current;

    return {
      x: (mx - p.x) / z,
      y: (my - p.y) / z,
    };
  }, []);

  const getNodeAt = useCallback((mx: number, my: number) => {
    const world = screenToWorld(mx, my);

    for (const n of [...nodesRef.current].reverse()) {
      const r = getNodeRadius(n) + 8 / zoomRef.current;

      if ((world.x - n.x) ** 2 + (world.y - n.y) ** 2 < r * r) {
        return n;
      }
    }

    return null;
  }, [screenToWorld, getNodeRadius]);

  const handleDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const n = getNodeAt(mx, my);

    wasDragRef.current = false;

    if (n) {
      dragRef.current = n.id;
      selectedRef.current = n.id;

      const node = nodesRef.current.find(nd => nd.id === n.id);

      if (node) {
        node.vx = 0;
        node.vy = 0;
      }
    } else {
      panRef.current.dragging = true;
      panRef.current.sx = e.clientX - panRef.current.x;
      panRef.current.sy = e.clientY - panRef.current.y;
    }
  };

  const handleMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();

    if (dragRef.current) {
      wasDragRef.current = true;

      const z = zoomRef.current;
      const p = panRef.current;

      const n = nodesRef.current.find(nd => nd.id === dragRef.current);

      if (n) {
        n.x = (e.clientX - rect.left - p.x) / z;
        n.y = (e.clientY - rect.top - p.y) / z;
        n.vx = 0;
        n.vy = 0;
      }

      return;
    }

    if (panRef.current.dragging) {
      wasDragRef.current = true;
      panRef.current.x = e.clientX - panRef.current.sx;
      panRef.current.y = e.clientY - panRef.current.sy;
      return;
    }

    const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);

    hoverRef.current = n ? n.id : null;

    if (canvasRef.current) {
      canvasRef.current.style.cursor = n ? 'pointer' : 'grab';
    }
  };

  const handleUp = () => {
    if (dragRef.current) {
      const n = nodesRef.current.find(nd => nd.id === dragRef.current);

      if (n) {
        n.vx = 0;
        n.vy = 0;
      }
    }

    dragRef.current = null;
    panRef.current.dragging = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragRef.current) {
      wasDragRef.current = false;
      return;
    }

    const rect = canvasRef.current!.getBoundingClientRect();
    const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);

    if (n) {
      selectedRef.current = n.id;
      dispatch({ type: 'OPEN_TAB', payload: n.id });
    } else {
      selectedRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const rect = canvasRef.current!.getBoundingClientRect();

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const before = screenToWorld(mx, my);

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = clamp(zoomRef.current * factor, 0.12, 5.5);

    zoomRef.current = nextZoom;

    panRef.current.x = mx - before.x * nextZoom;
    panRef.current.y = my - before.y * nextZoom;
  };

  const reset = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0, dragging: false, sx: 0, sy: 0 };
    firstBuildRef.current = true;
    buildGraph();
    setTimeout(() => animate(), 40);
  };

  const togglePhysics = () => {
    setPhysicsRunning(prev => !prev);
  };

  const inputStyle = {
    width: '100%',
    accentColor: 'var(--accent)',
    margin: 0,
  };

  const labelStyle = {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginBottom: 5,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center' as const,
  };

  const panelStyle = {
    background: 'rgba(31,31,35,0.86)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 12px 38px rgba(0,0,0,0.42)',
    backdropFilter: 'blur(14px)',
  };

  const groupOptions = Array.from(new Set([
    'root',
    ...state.folders.map(folder => `folder:${folder.name}`),
    ...nodesRef.current.map(n => n.group),
  ])).sort((a, b) => a.localeCompare(b));

  return (
    <div
      className="fixed inset-0 animate-fade-in"
      style={{
        zIndex: 100,
        background: '#1b1b1f',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={() => {
          hoverRef.current = null;
          handleUp();
        }}
        onClick={handleClick}
        onWheel={handleWheel}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: 'grab',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          height: 42,
          borderRadius: 10,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          ...panelStyle,
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Graph settings"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: showSettings ? 'rgba(139,92,246,0.18)' : 'transparent',
              color: showSettings ? '#d8ccff' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.23 1H21a2 2 0 0 1 0 4h-1.37c-.01.35-.09.69-.23 1z" />
            </svg>
          </button>

          <FlintLogo size={15} />

          <span
            style={{
              fontSize: 12,
              fontWeight: 650,
              color: 'var(--text-secondary)',
              letterSpacing: 0.2,
            }}
          >
            Graph view
          </span>

          <span
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              background: 'rgba(255,255,255,0.045)',
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {graphStats.nodes} nodes · {graphStats.edges} links
          </span>
        </div>

        <button
          onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
          title="Close graph view"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-dim)';
          }}
        >
          <X size={18} />
        </button>
      </div>

      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: 66,
            left: 12,
            width: 286,
            borderRadius: 12,
            padding: 14,
            zIndex: 10,
            maxHeight: 'calc(100vh - 84px)',
            overflowY: 'auto',
            ...panelStyle,
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>
              <span>Search</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7,
                padding: '6px 8px',
              }}
            >
              <Search size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />

              <input
                type="text"
                placeholder="Filter nodes..."
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  fontSize: 11,
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Depth</span>
              <span>{depthFilter === 0 ? '∞' : depthFilter}</span>
            </div>

            <input
              type="range"
              min={0}
              max={6}
              value={depthFilter}
              onChange={e => setDepthFilter(parseInt(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Link opacity</span>
              <span>{Math.round(edgeOpacity * 100)}%</span>
            </div>

            <input
              type="range"
              min={0.08}
              max={1}
              step={0.02}
              value={edgeOpacity}
              onChange={e => setEdgeOpacity(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={showAllLabels}
              onChange={e => setShowAllLabels(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Show all titles
          </label>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '10px 0 12px' }} />

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Node size</span>
              <span>{nodeScale.toFixed(2)}</span>
            </div>

            <input
              type="range"
              min={0.5}
              max={3.2}
              step={0.05}
              value={nodeScale}
              onChange={e => setNodeScale(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Link distance</span>
              <span>{linkDistance}px</span>
            </div>

            <input
              type="range"
              min={60}
              max={420}
              step={5}
              value={linkDistance}
              onChange={e => setLinkDistance(parseInt(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Center force</span>
              <span>{centerForce.toFixed(4)}</span>
            </div>

            <input
              type="range"
              min={0.0005}
              max={0.008}
              step={0.0001}
              value={centerForce}
              onChange={e => setCenterForce(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Group force</span>
              <span>{groupPull.toFixed(4)}</span>
            </div>

            <input
              type="range"
              min={0}
              max={0.01}
              step={0.0002}
              value={groupPull}
              onChange={e => setGroupPull(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Group spread</span>
              <span>{groupSpread}px</span>
            </div>

            <input
              type="range"
              min={120}
              max={650}
              step={10}
              value={groupSpread}
              onChange={e => setGroupSpread(parseInt(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '10px 0 12px' }} />

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>
              <span>Color groups</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7,
                padding: '6px 8px',
              }}
            >
              <Palette size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />

              <select
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                style={{
                  background: 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  fontSize: 11,
                  outline: 'none',
                  width: '100%',
                }}
              >
                {groupOptions.map(group => (
                  <option key={group} value={group}>
                    {group.replace(/^folder:/, '').replace(/^path:/, '')}
                  </option>
                ))}
              </select>

              <input
                type="color"
                value={groupColors[selectedGroup] || '#8b5cf6'}
                onChange={e => setGroupColors(prev => ({ ...prev, [selectedGroup]: e.target.value }))}
                style={{
                  width: 22,
                  height: 22,
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            </div>

            <button
              onClick={() => setGroupColors(prev => {
                const next = { ...prev };
                delete next[selectedGroup];
                return next;
              })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: 10,
                marginTop: 6,
                padding: 0,
                opacity: 0.85,
              }}
            >
              Clear color
            </button>
          </div>

          <button
            onClick={animate}
            style={{
              width: '100%',
              padding: '8px 0',
              fontSize: 11,
              color: '#d8ccff',
              background: 'rgba(139,92,246,0.14)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Replay bloom animation
          </button>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 66,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          borderRadius: 10,
          padding: 5,
          zIndex: 10,
          ...panelStyle,
        }}
      >
        {[
          {
            icon: <ZoomIn size={14} />,
            action: () => {
              zoomRef.current = clamp(zoomRef.current * 1.18, 0.12, 5.5);
            },
            title: 'Zoom in',
          },
          {
            icon: <ZoomOut size={14} />,
            action: () => {
              zoomRef.current = clamp(zoomRef.current / 1.18, 0.12, 5.5);
            },
            title: 'Zoom out',
          },
          {
            icon: <RotateCcw size={14} />,
            action: reset,
            title: 'Reset graph',
          },
          {
            icon: physicsRunning ? <Pause size={14} /> : <Play size={14} />,
            action: togglePhysics,
            title: physicsRunning ? 'Pause physics' : 'Resume physics',
          },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            title={btn.title}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
