// ✅ KEEP YOUR IMPORTS EXACTLY AS THEY WERE
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { FlintLogo } from './FlintLogo';
import { Grip, RotateCcw, Search, X, Plus, Type, Trash2, FileText } from 'lucide-react';
import type { CanvasCard } from '../types';

/* ========================================================================
   HELPERS
======================================================================== */

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  side1?: 'top' | 'right' | 'bottom' | 'left',
  side2?: 'top' | 'right' | 'bottom' | 'left'
) {
  const offset = 80;

  const c1 = { x: x1, y: y1 };
  const c2 = { x: x2, y: y2 };

  if (side1 === 'left') c1.x -= offset;
  if (side1 === 'right') c1.x += offset;
  if (side1 === 'top') c1.y -= offset;
  if (side1 === 'bottom') c1.y += offset;

  if (side2 === 'left') c2.x -= offset;
  if (side2 === 'right') c2.x += offset;
  if (side2 === 'top') c2.y -= offset;
  if (side2 === 'bottom') c2.y += offset;

  return `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`;
}

function getSidePt(card: CanvasCard, side: 'top' | 'right' | 'bottom' | 'left') {
  switch (side) {
    case 'top': return { x: card.x + card.w / 2, y: card.y };
    case 'bottom': return { x: card.x + card.w / 2, y: card.y + card.h };
    case 'left': return { x: card.x, y: card.y + card.h / 2 };
    case 'right': return { x: card.x + card.w, y: card.y + card.h / 2 };
  }
}

/* ========================================================================
   COMPONENT
======================================================================== */

export function CanvasView() {
  const { state, dispatch } = useStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<any>(null);
  const canvasDragRef = useRef<any>(null);
  const connDragRef = useRef<any>(null);

  const [connDrag, setConnDrag] = useState<any>(null);
  const [connections, setConnections] = useState<any[]>([]);

  const workspace = state.activeVaultId
    ? state.vaultData[state.activeVaultId]
    : null;

  const cards = workspace?.canvasCards || [];

  const updateCards = useCallback((newCards: CanvasCard[]) => {
    dispatch({ type: 'UPDATE_CANVAS_CARDS', payload: newCards });
  }, [dispatch]);

  /* ========================================================================
     GLOBAL FIXES
  ======================================================================== */

  // ESC cancels connection
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        connDragRef.current = null;
        setConnDrag(null);
        document.body.style.cursor = 'default';
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Fix drag glitches
  useEffect(() => {
    const handleUp = () => {
      dragRef.current = null;
      canvasDragRef.current = null;
      connDragRef.current = null;
      setConnDrag(null);
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, []);

  /* ========================================================================
     MOUSE HANDLERS
  ======================================================================== */

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      updateCards(cards.map(c =>
        c.id === dragRef.current.id
          ? {
              ...c,
              x: (e.clientX - pan.x - dragRef.current.offsetX) / zoom,
              y: (e.clientY - pan.y - dragRef.current.offsetY) / zoom,
            }
          : c
      ));
    }

    if (canvasDragRef.current) {
      setPan({
        x: e.clientX - canvasDragRef.current.x,
        y: e.clientY - canvasDragRef.current.y,
      });
    }

    if (connDragRef.current) {
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = (e.clientX - rect.left - pan.x) / zoom;
      const my = (e.clientY - rect.top - pan.y) / zoom;

      connDragRef.current.mx = mx;
      connDragRef.current.my = my;
      setConnDrag({ ...connDragRef.current });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!connDragRef.current) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;

    const SNAP = 20;

    const target = cards.find(c =>
      c.id !== connDragRef.current.fromCard &&
      mx >= c.x - SNAP &&
      mx <= c.x + c.w + SNAP &&
      my >= c.y - SNAP &&
      my <= c.y + c.h + SNAP
    );

    if (target) {
      const from = cards.find(c => c.id === connDragRef.current.fromCard)!;

      setConnections(prev => [
        ...prev,
        {
          id: `conn-${Date.now()}`,
          fromCard: from.id,
          toCard: target.id,
          fromSide: connDragRef.current.fromSide,
          toSide: 'left',
        },
      ]);
    }

    connDragRef.current = null;
    setConnDrag(null);
  };

  /* ========================================================================
     RENDER
  ======================================================================== */

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      style={{ background: '#1c1c1c' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* SVG Connections */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto',
        }}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,8 L8,4 z" fill="#7f6df2" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {connections.map(conn => {
            const from = cards.find(c => c.id === conn.fromCard);
            const to = cards.find(c => c.id === conn.toCard);
            if (!from || !to) return null;

            const p1 = getSidePt(from, conn.fromSide);
            const p2 = getSidePt(to, conn.toSide);

            return (
              <path
                key={conn.id}
                d={bezierPath(p1.x, p1.y, p2.x, p2.y, conn.fromSide, conn.toSide)}
                stroke="#7f6df2"
                strokeWidth={2 / zoom}
                fill="none"
                markerEnd="url(#arrow)"
                style={{ pointerEvents: 'stroke' }}
                onClick={() =>
                  setConnections(prev => prev.filter(c => c.id !== conn.id))
                }
              />
            );
          })}

          {connDrag && (() => {
            const from = cards.find(c => c.id === connDrag.fromCard);
            if (!from) return null;
            const p1 = getSidePt(from, connDrag.fromSide);
            return (
              <path
                d={bezierPath(
                  p1.x,
                  p1.y,
                  connDrag.mx,
                  connDrag.my,
                  connDrag.fromSide
                )}
                stroke="#7f6df2"
                strokeWidth={2 / zoom}
                strokeDasharray="6 4"
                fill="none"
                markerEnd="url(#arrow)"
              />
            );
          })()}
        </g>
      </svg>

      {/* Cards */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {cards.map(card => (
          <div
            key={card.id}
            style={{
              position: 'absolute',
              left: card.x,
              top: card.y,
              width: card.w,
              minHeight: card.h,
              background: '#2b2b2b',
              border: '1px solid #3a3a3a',
              borderRadius: 8,
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            }}
          >
            {/* Drag Header */}
            <div
              style={{
                padding: 8,
                cursor: 'grab',
                borderBottom: '1px solid #333',
              }}
              onMouseDown={e => {
                dragRef.current = {
                  id: card.id,
                  offsetX: e.clientX - pan.x - card.x * zoom,
                  offsetY: e.clientY - pan.y - card.y * zoom,
                };
              }}
            >
              <Grip size={14} />
            </div>

            {/* Connection Dots */}
            {(['top','right','bottom','left'] as const).map(side => (
              <div
                key={side}
                style={{
                  position: 'absolute',
                  width: 10,
                  height: 10,
                  background: '#7f6df2',
                  borderRadius: '50%',
                  cursor: 'crosshair',
                  ...(side === 'top' && { top: -5, left: '50%', transform: 'translateX(-50%)' }),
                  ...(side === 'bottom' && { bottom: -5, left: '50%', transform: 'translateX(-50%)' }),
                  ...(side === 'left' && { left: -5, top: '50%', transform: 'translateY(-50%)' }),
                  ...(side === 'right' && { right: -5, top: '50%', transform: 'translateY(-50%)' }),
                }}
                onMouseDown={e => {
                  e.stopPropagation();
                  document.body.style.cursor = 'crosshair';
                  const pt = getSidePt(card, side);
                  connDragRef.current = {
                    fromCard: card.id,
                    fromSide: side,
                    mx: pt.x,
                    my: pt.y,
                  };
                  setConnDrag(connDragRef.current);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
