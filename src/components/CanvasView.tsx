import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useStore } from '../store';
import { FlintLogo } from './FlintLogo';
import { X, ZoomIn, ZoomOut, RotateCcw, Search, Maximize2 } from 'lucide-react';

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

export function GraphView() {
  const { state, dispatch } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const dragRef = useRef<string | null>(null);
  const wasDragRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0, dragging: false, startX: 0, startY: 0 });
  const zoomRef = useRef(1);
  const animRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [zoom, setZoom] = useState(1);

  // Build graph from notes
  const buildGraph = useCallback(() => {
    const links: Record<string, Set<string>> = {};
    const titleMap = new Map(state.notes.map(n => [n.title.toLowerCase(), n.id]));

    state.notes.forEach(n => { links[n.id] = new Set(); });
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const targetId = titleMap.get(m[1].toLowerCase());
        if (targetId && targetId !== n.id) {
          links[n.id].add(targetId);
          links[targetId]?.add(n.id);
        }
      }
    });

    const cx = sizeRef.current.w / 2 || 400;
    const cy = sizeRef.current.h / 2 || 300;

    // Preserve existing positions
    const existing = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    nodesRef.current = state.notes.map(n => {
      const pos = existing.get(n.id);
      return {
        id: n.id,
        title: n.title,
        x: pos?.x ?? cx + (Math.random() - 0.5) * 400,
        y: pos?.y ?? cy + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        conns: links[n.id]?.size || 0,
      };
    });

    const edgeSet = new Set<string>();
    edgesRef.current = [];
    state.notes.forEach(n => {
      const matches = n.content.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g);
      for (const m of matches) {
        const targetId = titleMap.get(m[1].toLowerCase());
        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join('-');
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edgesRef.current.push({ from: n.id, to: targetId });
          }
        }
      }
    });

    setStats({ nodes: nodesRef.current.length, edges: edgesRef.current.length });
  }, [state.notes]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement!;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      sizeRef.current = { w: rect.width, h: rect.height };
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  // Filtered nodes based on search
  const visibleNodeIds = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    const ids = new Set<string>();
    nodesRef.current.forEach(n => {
      if (n.title.toLowerCase().includes(q)) {
        ids.add(n.id);
      }
    });
    // Also include connected nodes
    edgesRef.current.forEach(e => {
      if (ids.has(e.from)) ids.add(e.to);
      if (ids.has(e.to)) ids.add(e.from);
    });
    return ids;
  }, [query, stats]);

  // Main render loop
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

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 3000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Springs
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.006;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center pull
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.0003;
        n.vy += (cy - n.y) * 0.0003;
      }

      // Apply velocities
      for (const n of nodes) {
        if (n.id === dragRef.current) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.85;
        n.vy *= 0.85;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 8) {
          n.vx = (n.vx / speed) * 8;
          n.vy = (n.vy / speed) * 8;
        }
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
      const q = query.toLowerCase();

      // Clear
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, w, h);

      // Grid dots
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      const gridSize = 50 * z;
      if (gridSize > 10) {
        const ox = ((p.x % gridSize) + gridSize) % gridSize;
        const oy = ((p.y % gridSize) + gridSize) % gridSize;
        for (let x = ox; x < w; x += gridSize) {
          for (let y = oy; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      const isVisible = (id: string) => !visibleNodeIds || visibleNodeIds.has(id);
      const matchesQuery = (n: GNode) => !q || n.title.toLowerCase().includes(q);

      // Edges
      for (const e of edges) {
        const a = getNode(e.from);
        const b = getNode(e.to);
        if (!a || !b) continue;
        if (!isVisible(a.id) && !isVisible(b.id)) continue;

        const isActive = activeId === e.from || activeId === e.to;
        const isHover = hoverRef.current === e.from || hoverRef.current === e.to;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = isActive
          ? 'rgba(180,180,180,0.6)'
          : isHover
          ? 'rgba(150,150,150,0.5)'
          : 'rgba(100,100,100,0.25)';
        ctx.lineWidth = isActive ? 1.5 : 1;
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        if (!isVisible(n.id)) continue;

        const isActive = n.id === activeId;
        const isHover = n.id === hoverRef.current;
        const isOrphan = n.conns === 0;
        const dimmed = q && !matchesQuery(n);
        
        const baseRadius = 3 + Math.min(n.conns, 10) * 0.8;
        const radius = isActive ? baseRadius + 2 : baseRadius;

        // Glow for active/hover
        if (isActive || isHover) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = isActive ? 'rgba(200,200,200,0.15)' : 'rgba(150,150,150,0.1)';
          ctx.fill();
        }

        // Node
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);

        if (dimmed) {
          ctx.fillStyle = 'rgba(60,60,60,0.4)';
        } else if (isActive) {
          ctx.fillStyle = '#e0e0e0';
        } else if (isOrphan) {
          ctx.fillStyle = 'rgba(100,100,100,0.5)';
        } else {
          const brightness = Math.min(140 + n.conns * 8, 200);
          ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
        }
        ctx.fill();

        // Border for active
        if (isActive) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label
        if (isActive || isHover) {
          ctx.font = `${isActive ? '600' : '400'} 11px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isActive ? '#fff' : 'rgba(200,200,200,0.9)';
          ctx.fillText(n.title, n.x, n.y + radius + 14);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [state.activeNoteId, state.notes, query, visibleNodeIds]);

  const getNodeAt = useCallback((mx: number, my: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const wx = (mx - p.x) / z;
    const wy = (my - p.y) / z;
    
    for (const n of [...nodesRef.current].reverse()) {
      const r = 3 + Math.min(n.conns, 10) * 0.8 + 8;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = getNodeAt(mx, my);

    wasDragRef.current = false;

    if (node) {
      dragRef.current = node.id;
    } else {
      panRef.current.dragging = true;
      panRef.current.startX = e.clientX - panRef.current.x;
      panRef.current.startY = e.clientY - panRef.current.y;
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
      panRef.current.x = e.clientX - panRef.current.startX;
      panRef.current.y = e.clientY - panRef.current.startY;
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
    if (wasDragRef.current) {
      wasDragRef.current = false;
      return;
    }
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
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZ = Math.max(0.1, Math.min(5, oldZ * delta));
    
    // Zoom toward cursor
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
    panRef.current = { x: 0, y: 0, dragging: false, startX: 0, startY: 0 };
    setZoom(1);
    buildGraph();
  };

  const centerGraph = () => {
    if (nodesRef.current.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    nodesRef.current.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });
    
    const graphCx = (minX + maxX) / 2;
    const graphCy = (minY + maxY) / 2;
    const screenCx = sizeRef.current.w / 2;
    const screenCy = sizeRef.current.h / 2;
    
    panRef.current.x = screenCx - graphCx * zoomRef.current;
    panRef.current.y = screenCy - graphCy * zoomRef.current;
  };

  return (
    <div
      className="fixed inset-0 animate-fade-in"
      style={{ zIndex: 110, background: '#1a1a1a' }}
    >
      {/* Canvas */}
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
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '10px 16px',
          background: 'rgba(20, 20, 20, 0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-3">
          <FlintLogo size={14} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
            Graph View
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.05)',
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {stats.nodes} nodes · {stats.edges} links
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div
            className="flex items-center gap-2"
            style={{
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
            }}
          >
            <Search size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter nodes..."
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 12,
                width: 140,
              }}
            />
          </div>

          {/* Zoom display */}
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              minWidth: 40,
              textAlign: 'center',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          {/* Close */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: 'rgba(30,30,30,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: 4,
          backdropFilter: 'blur(8px)',
        }}
      >
        {[
          { icon: <ZoomIn size={14} />, action: () => handleZoom(0.2), title: 'Zoom in' },
          { icon: <ZoomOut size={14} />, action: () => handleZoom(-0.2), title: 'Zoom out' },
          { icon: <Maximize2 size={14} />, action: centerGraph, title: 'Center graph' },
          { icon: <RotateCcw size={14} />, action: resetView, title: 'Reset view' },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            title={btn.title}
            style={{
              width: 32,
              height: 32,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(30,30,30,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '10px 14px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Legend
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#e0e0e0',
                border: '1px solid #fff',
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Active note</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'rgb(160,160,160)',
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'rgba(100,100,100,0.5)',
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Orphan</span>
          </div>
        </div>
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 9,
            color: 'rgba(255,255,255,0.35)',
            lineHeight: 1.5,
          }}
        >
          Scroll to zoom · Drag to pan
          <br />
          Click node to open
        </div>
      </div>
    </div>
  );
}
