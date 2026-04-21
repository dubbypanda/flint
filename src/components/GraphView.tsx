import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { X } from 'lucide-react';

interface GraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

export function GraphView() {
  const { state, dispatch, extractLinks, getNoteByTitle } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const animRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const { notes } = state;

  const buildGraph = useCallback(() => {
    const edges: GraphEdge[] = [];
    const connectionCount: Record<string, number> = {};

    notes.forEach(note => {
      const links = extractLinks(note.content);
      links.forEach(linkTitle => {
        const target = getNoteByTitle(linkTitle);
        if (target) {
          edges.push({ source: note.id, target: target.id });
          connectionCount[note.id] = (connectionCount[note.id] || 0) + 1;
          connectionCount[target.id] = (connectionCount[target.id] || 0) + 1;
        }
      });
    });

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const nodes: GraphNode[] = notes.map((note, i) => {
      const angle = (2 * Math.PI * i) / notes.length;
      const radius = 150 + Math.random() * 100;
      return {
        id: note.id,
        title: note.title,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: connectionCount[note.id] || 0,
      };
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [notes, extractLinks, getNoteByTitle]);

  useEffect(() => {
    buildGraph();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const damping = 0.85;
      const repulsion = 2000;
      const attraction = 0.005;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx;
          nodes[i].vy += fy;
          nodes[j].vx -= fx;
          nodes[j].vy -= fy;
        }
      }

      // Attraction along edges
      edges.forEach(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        source.vx += dx * attraction;
        source.vy += dy * attraction;
        target.vx -= dx * attraction;
        target.vy -= dy * attraction;
      });

      // Center gravity
      nodes.forEach(node => {
        node.vx += (cx - node.x) * 0.0003;
        node.vy += (cy - node.y) * 0.0003;
      });

      // Apply velocity
      nodes.forEach(node => {
        if (dragRef.current.nodeId === node.id) return;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
      });

      draw();
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [buildGraph]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const scale = scaleRef.current;
    const pan = panRef.current;

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1;
    const gridSize = 40 * scale;
    const offsetX = (pan.x * scale) % gridSize;
    const offsetY = (pan.y * scale) % gridSize;
    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    // Draw edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target) return;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      const baseRadius = 4 + node.connections * 2;
      const radius = Math.min(baseRadius, 14);

      // Glow
      if (node.connections > 0) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 4);
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      if (node.id === state.activeNoteId) {
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = node.connections > 0 ? '#f59e0b' : '#444';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = node.id === state.activeNoteId ? '#fbbf24' : 'rgba(245, 158, 11, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.font = `${node.id === state.activeNoteId ? '600' : '400'} 11px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = node.id === state.activeNoteId ? '#fff' : '#777';
      ctx.fillText(node.title, node.x, node.y + radius + 16);
    });

    ctx.restore();

    // HUD info
    ctx.fillStyle = '#333';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${nodes.length} notes · ${edges.length} links`, 16, canvas.height - 16);
  }, [state.activeNoteId]);

  const getNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const nodes = nodesRef.current;
    const scale = scaleRef.current;
    const pan = panRef.current;
    const x = (mx - pan.x) / scale;
    const y = (my - pan.y) / scale;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const r = 4 + Math.min(nodes[i].connections * 2, 14) + 4;
      const dx = nodes[i].x - x;
      const dy = nodes[i].y - y;
      if (dx * dx + dy * dy < r * r) return nodes[i];
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) {
      const scale = scaleRef.current;
      const pan = panRef.current;
      dragRef.current = {
        nodeId: node.id,
        offsetX: (e.clientX - pan.x) / scale - node.x,
        offsetY: (e.clientY - pan.y) / scale - node.y,
      };
    } else {
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [getNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node) {
        const scale = scaleRef.current;
        const pan = panRef.current;
        node.x = (e.clientX - pan.x) / scale - dragRef.current.offsetX;
        node.y = (e.clientY - pan.y) / scale - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
    } else if (isPanningRef.current) {
      panRef.current.x += e.clientX - lastMouseRef.current.x;
      panRef.current.y += e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    scaleRef.current = Math.max(0.2, Math.min(3, scaleRef.current * delta));
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node && !dragRef.current.nodeId) {
      dispatch({ type: 'OPEN_TAB', payload: node.id });
    }
  }, [getNodeAt, dispatch]);

  return (
    <div ref={containerRef} className="flint-graph-container">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0a0a] border-b border-[#1a1a1a] z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
          <span className="text-xs font-medium text-[#888]">Graph View</span>
          <span className="text-[10px] text-[#444] ml-2">
            {notes.length} nodes · {edgesRef.current.length} edges
          </span>
        </div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
          className="p-1.5 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleNodeClick}
        onWheel={handleWheel}
      />

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-[#0a0a0a]/90 border border-[#1a1a1a] rounded-lg px-3 py-2 text-[10px] text-[#555] space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span>Connected note</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#444]" />
          <span>Isolated note</span>
        </div>
        <div className="text-[#333] mt-1">Scroll to zoom · Drag to pan</div>
      </div>
    </div>
  );
}
