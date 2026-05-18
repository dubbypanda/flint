import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store';
import { FlintLogo } from './FlintLogo';
import {
  X, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Search,
  Settings, ChevronDown, ChevronRight
} from 'lucide-react';

interface GNode {
  id: string; title: string; x: number; y: number;
  vx: number; vy: number; conns: number; group: string;
}
interface GEdge { from: string; to: string; }

function graphColorKey(vaultId: string | null) {
  return `flint-graph-colors-${vaultId || 'default'}`;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function groupToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return hslToHex(h, 55, 62);
}

function darkenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
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
  const physicsRef = useRef(true);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const timeRef = useRef(0);
  const settingsRef = useRef({
    nodeSize: 4,
    linkDistance: 120,
    repelForce: 80,
    centerForce: 0.03,
    linkForce: 0.3,
    showLabels: 'hover' as 'none' | 'hover' | 'all',
    showOrphans: true,
    colorByGroup: true,
    depthFilter: 0,
    filterQuery: '',
  });
  const groupColorsRef = useRef<Record<string, string>>({});

  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0 });
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [, forceUpdate] = useState(0);

  // Sync refs to state for UI
  const [uiSettings, setUiSettings] = useState({ ...settingsRef.current });
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<string[]>([]);

  const updateSetting = <K extends keyof typeof settingsRef.current>(
    key: K,
    value: typeof settingsRef.current[K]
  ) => {
    settingsRef.current[key] = value;
    setUiSettings({ ...settingsRef.current });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(graphColorKey(state.activeVaultId));
      const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
      setGroupColors(parsed);
      groupColorsRef.current = parsed;
    } catch {
      setGroupColors({});
      groupColorsRef.current = {};
    }
  }, [state.activeVaultId]);

  useEffect(() => {
    try {
      localStorage.setItem(graphColorKey(state.activeVaultId), JSON.stringify(groupColors));
      groupColorsRef.current = groupColors;
    } catch { /* ignore */ }
  }, [groupColors, state.activeVaultId]);

  const buildGraph = useCallback(() => {
    const links: Record<string, Set<string>> = {};
    const noteTitleIdMap = new Map(state.notes.map(n => [n.title.toLowerCase(), n.id]));

    state.notes.forEach(n => { links[n.id] = new Set(); });
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const targetId = noteTitleIdMap.get(m[1].toLowerCase());
        if (targetId && targetId !== n.id) {
          links[n.id].add(targetId);
          links[targetId]?.add(n.id);
        }
      }
    });

    const cx = sizeRef.current.w / 2 || 400;
    const cy = sizeRef.current.h / 2 || 300;

    const deriveGroup = (note: typeof state.notes[number]) => {
      if (note.folderId) {
        const folder = state.folders.find(f => f.id === note.folderId);
        return folder?.name || 'root';
      }
      return 'root';
    };

    const existingPos = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    nodesRef.current = state.notes.map((n) => {
      const group = deriveGroup(n);
      const old = existingPos.get(n.id);
      return {
        group, id: n.id, title: n.title,
        x: old?.x ?? cx + (Math.random() - 0.5) * 300,
        y: old?.y ?? cy + (Math.random() - 0.5) * 300,
        vx: 0, vy: 0,
        conns: links[n.id]?.size || 0,
      };
    });

    const edgeSet = new Set<string>();
    edgesRef.current = [];
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const targetId = noteTitleIdMap.get(m[1].toLowerCase());
        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join('-');
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edgesRef.current.push({ from: n.id, to: targetId });
          }
        }
      }
    });

    const allGroups = [...new Set(nodesRef.current.map(n => n.group))];
    setGroups(allGroups);
    setGraphStats({ nodes: nodesRef.current.length, edges: edgesRef.current.length });
  }, [state.notes, state.folders]);

  // Canvas resize
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

  // Main render loop — runs once, reads refs only
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let running = true;

    function getNode(id: string) {
      return nodesRef.current.find(n => n.id === id);
    }

    function getVisibleIds(): Set<string> | null {
      const depth = settingsRef.current.depthFilter;
      if (depth === 0) return null;
      const activeId = state.activeNoteId;
      if (!activeId) return null;
      const vis = new Set<string>();
      const queue: { id: string; d: number }[] = [{ id: activeId, d: 0 }];
      const visited = new Set([activeId]);
      while (queue.length) {
        const cur = queue.shift()!;
        vis.add(cur.id);
        if (cur.d >= depth) continue;
        for (const e of edgesRef.current) {
          const nid = e.from === cur.id ? e.to : e.to === cur.id ? e.from : null;
          if (nid && !visited.has(nid)) {
            visited.add(nid);
            queue.push({ id: nid, d: cur.d + 1 });
          }
        }
      }
      return vis;
    }

    function simulate() {
      if (!physicsRef.current) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const s = settingsRef.current;
      const cx = sizeRef.current.w / 2;
      const cy = sizeRef.current.h / 2;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = Math.max(dist, 10);
          const force = (s.repelForce * s.repelForce) / (minDist * minDist);
          const fx = (dx / minDist) * force;
          const fy = (dy / minDist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - s.linkDistance) * s.linkForce * 0.008;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      for (const n of nodes) {
        n.vx += (cx - n.x) * s.centerForce * 0.001;
        n.vy += (cy - n.y) * s.centerForce * 0.001;
      }

      for (const n of nodes) {
        if (n.id === dragRef.current) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.62;
        n.vy *= 0.62;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 6) { n.vx = (n.vx / speed) * 6; n.vy = (n.vy / speed) * 6; }
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    function draw() {
      if (!running) return;
      timeRef.current += 0.016;
      simulate();

      const w = canvas!.width;
      const h = canvas!.height;
      const z = zoomRef.current;
      const p = panRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const s = settingsRef.current;
      const colors = groupColorsRef.current;

      ctx.clearRect(0, 0, w, h);

      // Background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      bgGrad.addColorStop(0, '#1e1e2e');
      bgGrad.addColorStop(1, '#11111b');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Dot grid
      const gs = 40 * z;
      if (gs > 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
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

      const visibleIds = getVisibleIds();
      const q = s.filterQuery.toLowerCase();
      const matchQ = (n: GNode) => !q || n.title.toLowerCase().includes(q);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      // Edges
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        if (visibleIds && (!visibleIds.has(a.id) || !visibleIds.has(b.id))) continue;
        if (q && !matchQ(a) && !matchQ(b)) continue;
        if (!s.showOrphans && (a.conns === 0 || b.conns === 0)) continue;

        const isHover = hoverRef.current === e.from || hoverRef.current === e.to;
        const isActive = state.activeNoteId === e.from || state.activeNoteId === e.to;
        const isSel = selectedRef.current === e.from || selectedRef.current === e.to;
        const highlight = isHover || isActive || isSel;

        // Glow pass
        if (highlight) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = isActive
            ? 'rgba(137,180,250,0.18)'
            : isHover
              ? 'rgba(203,166,247,0.15)'
              : 'rgba(166,227,161,0.12)';
          ctx.lineWidth = 3.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = isActive
          ? 'rgba(137,180,250,0.55)'
          : isHover
            ? 'rgba(203,166,247,0.45)'
            : isSel
              ? 'rgba(166,227,161,0.35)'
              : 'rgba(108,112,134,0.18)';
        ctx.lineWidth = highlight ? 1.2 : 0.6;
        ctx.stroke();
      }

      // Nodes
      const activeId = state.activeNoteId;
      for (const n of nodes) {
        if (!s.showOrphans && n.conns === 0) continue;
        if (visibleIds && !visibleIds.has(n.id)) continue;
        const dimmed = q && !matchQ(n);
        if (dimmed) continue;

        const r = s.nodeSize + Math.sqrt(n.conns) * 1.6;
        const isActive = n.id === activeId;
        const isHover = n.id === hoverRef.current;
        const isSel = n.id === selectedRef.current;
        const isOrphan = n.conns === 0;

        let col: string;
        if (isActive) {
          col = '#89b4fa';
        } else if (s.colorByGroup && colors[n.group]) {
          col = colors[n.group];
        } else if (s.colorByGroup) {
          col = groupToColor(n.group);
        } else if (isOrphan) {
          col = '#585b70';
        } else {
          col = '#89b4fa';
        }

        // Glow for highlighted
        if (isActive || isHover || isSel) {
          const glowR = r * (isActive ? 3.5 : 2.5);
          const glow = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, glowR);
          if (isActive) {
            glow.addColorStop(0, 'rgba(137,180,250,0.28)');
            glow.addColorStop(0.5, 'rgba(137,180,250,0.08)');
            glow.addColorStop(1, 'rgba(137,180,250,0)');
          } else if (isHover) {
            glow.addColorStop(0, 'rgba(203,166,247,0.22)');
            glow.addColorStop(0.5, 'rgba(203,166,247,0.06)');
            glow.addColorStop(1, 'rgba(203,166,247,0)');
          } else {
            glow.addColorStop(0, 'rgba(166,227,161,0.18)');
            glow.addColorStop(0.5, 'rgba(166,227,161,0.05)');
            glow.addColorStop(1, 'rgba(166,227,161,0)');
          }
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Pulse on active
        if (isActive) {
          const pulse = 1 + Math.sin(timeRef.current * 2.5) * 0.12;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 2 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(137,180,250,0.06)';
          ctx.fill();
        }

        // Ambient glow for connected nodes
        if (!isOrphan && !isActive && !isHover) {
          const amb = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 1.5);
          amb.addColorStop(0, hexToRgba(col, 0.12));
          amb.addColorStop(1, hexToRgba(col, 0));
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = amb;
          ctx.fill();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

        if (isOrphan) {
          ctx.fillStyle = '#45475a';
        } else {
          const grad = ctx.createRadialGradient(
            n.x - r * 0.25, n.y - r * 0.25, 0,
            n.x, n.y, r * 1.1
          );
          grad.addColorStop(0, col);
          grad.addColorStop(1, darkenHex(col, 40));
          ctx.fillStyle = grad;
        }
        ctx.fill();

        // Border
        if (isActive || isHover || isSel) {
          ctx.strokeStyle = isActive ? '#89b4fa' : isHover ? '#cba6f7' : '#a6e3a1';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Labels
        const showLabel =
          s.showLabels === 'all' ||
          (s.showLabels === 'hover' && (isHover || isActive || isSel));

        if (showLabel) {
          const fs = isActive ? 11 : 10;
          ctx.font = `${isActive ? '600' : '400'} ${fs}px Inter, -apple-system, sans-serif`;
          ctx.textAlign = 'center';

          const tw = ctx.measureText(n.title).width;
          const tx = n.x;
          const ty = n.y + r + 14;
          const pad = 4;

          // Background pill
          ctx.fillStyle = 'rgba(17,17,27,0.75)';
          ctx.beginPath();
          const bx = tx - tw / 2 - pad;
          const by = ty - fs + 1;
          const bw = tw + pad * 2;
          const bh = fs + 5;
          const br = 3;
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

          ctx.fillStyle = isActive ? '#cdd6f4' : '#a6adc8';
          ctx.fillText(n.title, tx, ty);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [state.activeNoteId, state.notes, buildGraph]);

  const getNodeAt = useCallback((mx: number, my: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const wx = (mx - p.x) / z;
    const wy = (my - p.y) / z;
    const s = settingsRef.current;
    for (const n of [...nodesRef.current].reverse()) {
      const r = s.nodeSize + Math.sqrt(n.conns) * 1.6 + 6;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
  }, []);

  const handleDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    wasDragRef.current = false;
    if (n) {
      dragRef.current = n.id;
      const node = nodesRef.current.find(nd => nd.id === n.id);
      if (node) { node.vx = 0; node.vy = 0; }
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
        n.vx = 0; n.vy = 0;
      }
    } else if (panRef.current.dragging) {
      panRef.current.x = e.clientX - panRef.current.sx;
      panRef.current.y = e.clientY - panRef.current.sy;
    } else {
      const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      hoverRef.current = n ? n.id : null;
      canvasRef.current!.style.cursor = n ? 'pointer' : panRef.current.dragging ? 'grabbing' : 'grab';
    }
  };

  const handleUp = () => {
    if (dragRef.current) {
      const n = nodesRef.current.find(nd => nd.id === dragRef.current);
      if (n) { n.vx = 0; n.vy = 0; }
    }
    dragRef.current = null;
    panRef.current.dragging = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragRef.current) { wasDragRef.current = false; return; }
    const rect = canvasRef.current!.getBoundingClientRect();
    const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (n) {
      selectedRef.current = n.id;
      dispatch({ type: 'OPEN_TAB', payload: n.id });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZ = zoomRef.current;
    const newZ = Math.max(0.1, Math.min(5, oldZ * (1 - e.deltaY * 0.0012)));
    panRef.current.x = mx - (mx - panRef.current.x) * (newZ / oldZ);
    panRef.current.y = my - (my - panRef.current.y) * (newZ / oldZ);
    zoomRef.current = newZ;
  };

  const reset = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0, dragging: false, sx: 0, sy: 0 };
    buildGraph();
  };

  const togglePhysics = () => {
    physicsRef.current = !physicsRef.current;
    forceUpdate(n => n + 1);
  };

  // Styles
  const panelBg = 'rgba(24,24,37,0.92)';
  const panelBorder = '1px solid rgba(69,71,90,0.4)';
  const panelRadius = 10;
  const dimText = '#6c7086';
  const subText = '#a6adc8';
  const mainText = '#cdd6f4';

  const SliderRow = ({ label, value, min, max, step, onChange }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: dimText, width: 72, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: '#89b4fa', height: 3 }} />
    </div>
  );

  return (
    <div className="fixed inset-0" style={{ zIndex: 100, background: '#11111b' }}>
      <canvas ref={canvasRef}
        onMouseDown={handleDown} onMouseMove={handleMove}
        onMouseUp={handleUp} onMouseLeave={handleUp}
        onClick={handleClick} onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '10px 16px',
        background: 'linear-gradient(to bottom, rgba(24,24,37,0.95), rgba(24,24,37,0.7))',
        backdropFilter: 'blur(12px)',
        borderBottom: panelBorder,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlintLogo size={15} />
            <span style={{ fontSize: 13, fontWeight: 600, color: mainText }}>Graph</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(30,30,46,0.7)', border: panelBorder,
            borderRadius: 8, padding: '5px 10px',
          }}>
            <Search size={13} style={{ color: dimText }} />
            <input type="text" placeholder="Filter nodes..."
              value={uiSettings.filterQuery}
              onChange={e => {
                updateSetting('filterQuery', e.target.value);
              }}
              style={{
                background: 'none', border: 'none', color: mainText,
                fontSize: 12, outline: 'none', width: 130,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: dimText }}>
            <span><b style={{ color: '#89b4fa' }}>{graphStats.nodes}</b> nodes</span>
            <span><b style={{ color: '#94e2d5' }}>{graphStats.edges}</b> links</span>
          </div>
        </div>

        <button onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
          style={{
            background: 'rgba(30,30,46,0.6)', border: panelBorder,
            color: dimText, cursor: 'pointer', display: 'flex',
            padding: 6, borderRadius: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = mainText; }}
          onMouseLeave={e => { e.currentTarget.style.color = dimText; }}>
          <X size={16} />
        </button>
      </div>

      {/* Settings Panel */}
      <div style={{
        position: 'absolute', top: 56, right: 12, width: 250,
        background: panelBg, backdropFilter: 'blur(16px)',
        border: panelBorder, borderRadius: panelRadius,
        overflow: 'hidden',
      }}>
        <button onClick={() => setSettingsOpen(!settingsOpen)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '10px 12px',
            background: 'none', border: 'none', color: mainText,
            cursor: 'pointer',
            borderBottom: settingsOpen ? panelBorder : 'none',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={13} style={{ color: '#89b4fa' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Settings</span>
          </div>
          {settingsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {settingsOpen && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Display */}
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: dimText,
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8,
              }}>Display</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Orphan nodes', key: 'showOrphans' as const },
                  { label: 'Color by group', key: 'colorByGroup' as const },
                ].map(({ label, key }) => (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 11, color: subText, cursor: 'pointer',
                  }}>
                    <input type="checkbox"
                      checked={uiSettings[key] as boolean}
                      onChange={e => updateSetting(key, e.target.checked)}
                      style={{ accentColor: '#89b4fa' }}
                    />
                    {label}
                  </label>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: dimText, width: 48 }}>Labels</span>
                  <select value={uiSettings.showLabels}
                    onChange={e => updateSetting('showLabels', e.target.value as 'none' | 'hover' | 'all')}
                    style={{
                      flex: 1, background: 'rgba(30,30,46,0.7)',
                      border: panelBorder, borderRadius: 4,
                      padding: '3px 6px', color: subText,
                      fontSize: 11, outline: 'none',
                    }}>
                    <option value="none">None</option>
                    <option value="hover">On hover</option>
                    <option value="all">Always</option>
                  </select>
                </div>

                <SliderRow label="Depth filter"
                  value={uiSettings.depthFilter} min={0} max={6} step={1}
                  onChange={v => updateSetting('depthFilter', v)}
                />
              </div>
            </div>

            {/* Forces */}
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: dimText,
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8,
              }}>Forces</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SliderRow label="Node size" value={uiSettings.nodeSize}
                  min={2} max={10} step={0.5} onChange={v => updateSetting('nodeSize', v)} />
                <SliderRow label="Link dist" value={uiSettings.linkDistance}
                  min={40} max={300} step={5} onChange={v => updateSetting('linkDistance', v)} />
                <SliderRow label="Repel" value={uiSettings.repelForce}
                  min={20} max={200} step={5} onChange={v => updateSetting('repelForce', v)} />
                <SliderRow label="Center" value={uiSettings.centerForce}
                  min={0} max={0.15} step={0.005} onChange={v => updateSetting('centerForce', v)} />
                <SliderRow label="Link pull" value={uiSettings.linkForce}
                  min={0} max={1} step={0.05} onChange={v => updateSetting('linkForce', v)} />
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={togglePhysics}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, padding: '7px 0',
                  background: physicsRef.current
                    ? 'rgba(166,227,161,0.1)' : 'rgba(243,139,168,0.1)',
                  border: `1px solid ${physicsRef.current
                    ? 'rgba(166,227,161,0.25)' : 'rgba(243,139,168,0.25)'}`,
                  borderRadius: 6,
                  color: physicsRef.current ? '#a6e3a1' : '#f38ba8',
                  cursor: 'pointer', fontSize: 11, fontWeight: 500,
                }}>
                {physicsRef.current ? <Pause size={12} /> : <Play size={12} />}
                {physicsRef.current ? 'Pause' : 'Play'}
              </button>
              <button onClick={reset}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '7px 12px',
                  background: 'rgba(69,71,90,0.2)',
                  border: panelBorder, borderRadius: 6,
                  color: '#89b4fa', cursor: 'pointer',
                }}>
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Zoom */}
      <div style={{
        position: 'absolute', bottom: 16, right: 12,
        display: 'flex', flexDirection: 'column', gap: 2,
        background: panelBg, backdropFilter: 'blur(12px)',
        border: panelBorder, borderRadius: 8, padding: 3,
      }}>
        {[
          { icon: <ZoomIn size={15} />, fn: () => { zoomRef.current = Math.min(5, zoomRef.current * 1.3); } },
          { icon: <ZoomOut size={15} />, fn: () => { zoomRef.current = Math.max(0.1, zoomRef.current / 1.3); } },
        ].map((b, i) => (
          <button key={i} onClick={b.fn}
            style={{
              width: 34, height: 34, background: 'none', border: 'none',
              color: dimText, cursor: 'pointer', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(69,71,90,0.4)'; e.currentTarget.style.color = mainText; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = dimText; }}>
            {b.icon}
          </button>
        ))}
      </div>

      {/* Group legend */}
      {uiSettings.colorByGroup && groups.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 16, left: 12,
          background: panelBg, backdropFilter: 'blur(12px)',
          border: panelBorder, borderRadius: panelRadius,
          padding: '10px 12px', maxWidth: 180,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: dimText,
            marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8,
          }}>Groups</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {groups.slice(0, 8).map(g => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color"
                  value={groupColors[g] || groupToColor(g)}
                  onChange={e => setGroupColors(prev => ({ ...prev, [g]: e.target.value }))}
                  style={{ width: 14, height: 14, border: 'none', borderRadius: 3, padding: 0, cursor: 'pointer' }}
                />
                <span style={{
                  fontSize: 11, color: subText,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{g}</span>
              </div>
            ))}
            {groups.length > 8 && (
              <span style={{ fontSize: 10, color: dimText }}>+{groups.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        fontSize: 10, color: '#45475a', display: 'flex', gap: 10,
        pointerEvents: 'none',
      }}>
        <span>Scroll to zoom</span>
        <span>·</span>
        <span>Drag to pan</span>
        <span>·</span>
        <span>Click to open</span>
      </div>
    </div>
  );
}
