import { useRef, useState, useCallback, useEffect } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

export function useImageZoom() {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, translateX: 0, translateY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const lastPinchDist = useRef(0);
  const lastPinchCenter = useRef({ x: 0, y: 0 });

  const isZoomed = zoom.scale > 1.05;

  const resetZoom = useCallback(() => {
    setZoom({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const clampTranslate = useCallback((tx: number, ty: number, scale: number) => {
    if (scale <= 1) return { tx: 0, ty: 0 };
    const el = containerRef.current;
    if (!el) return { tx, ty };
    const rect = el.getBoundingClientRect();
    const maxTx = (rect.width * (scale - 1)) / 2;
    const maxTy = (rect.height * (scale - 1)) / 2;
    return {
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }, []);

  // Mouse wheel zoom (desktop)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = -e.deltaY * 0.002;
    setZoom((prev) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale + delta * prev.scale));
      if (newScale <= 1) return { scale: 1, translateX: 0, translateY: 0 };
      const { tx, ty } = clampTranslate(prev.translateX, prev.translateY, newScale);
      return { scale: newScale, translateX: tx, translateY: ty };
    });
  }, [clampTranslate]);

  // Double click to toggle zoom
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev.scale > 1.05) return { scale: 1, translateX: 0, translateY: 0 };
      const el = containerRef.current;
      if (!el) return { scale: 2.5, translateX: 0, translateY: 0 };
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const newScale = 2.5;
      const { tx, ty } = clampTranslate(-cx * (newScale - 1), -cy * (newScale - 1), newScale);
      return { scale: newScale, translateX: tx, translateY: ty };
    });
  }, [clampTranslate]);

  // Mouse pan when zoomed (desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom.scale <= 1) return;
    e.preventDefault();
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, tx: zoom.translateX, ty: zoom.translateY };
  }, [zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    const { tx, ty } = clampTranslate(panStart.current.tx + dx, panStart.current.ty + dy, zoom.scale);
    setZoom((prev) => ({ ...prev, translateX: tx, translateY: ty }));
  }, [zoom.scale, clampTranslate]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Pinch-to-zoom (mobile) — these go on the container
  const handleTouchStartZoom = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      lastPinchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && zoom.scale > 1) {
      isPanning.current = true;
      panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: zoom.translateX, ty: zoom.translateY };
    }
  }, [zoom]);

  const handleTouchMoveZoom = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current > 0) {
        const ratio = dist / lastPinchDist.current;
        setZoom((prev) => {
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * ratio));
          if (newScale <= 1) return { scale: 1, translateX: 0, translateY: 0 };
          const { tx, ty } = clampTranslate(prev.translateX, prev.translateY, newScale);
          return { scale: newScale, translateX: tx, translateY: ty };
        });
      }
      lastPinchDist.current = dist;
    } else if (e.touches.length === 1 && isPanning.current) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      const { tx, ty } = clampTranslate(panStart.current.tx + dx, panStart.current.ty + dy, zoom.scale);
      setZoom((prev) => ({ ...prev, translateX: tx, translateY: ty }));
    }
  }, [zoom.scale, clampTranslate]);

  const handleTouchEndZoom = useCallback(() => {
    lastPinchDist.current = 0;
    isPanning.current = false;
    setZoom((prev) => {
      if (prev.scale < 1.05) return { scale: 1, translateX: 0, translateY: 0 };
      return prev;
    });
  }, []);

  // Double-tap to zoom (mobile)
  const lastTap = useRef(0);
  const handleDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap detected
      setZoom((prev) => {
        if (prev.scale > 1.05) return { scale: 1, translateX: 0, translateY: 0 };
        const el = containerRef.current;
        if (!el) return { scale: 2.5, translateX: 0, translateY: 0 };
        const rect = el.getBoundingClientRect();
        const cx = e.touches[0].clientX - rect.left - rect.width / 2;
        const cy = e.touches[0].clientY - rect.top - rect.height / 2;
        const newScale = 2.5;
        const { tx, ty } = clampTranslate(-cx * (newScale - 1), -cy * (newScale - 1), newScale);
        return { scale: newScale, translateX: tx, translateY: ty };
      });
    }
    lastTap.current = now;
  }, [clampTranslate]);

  const imageStyle: React.CSSProperties = {
    transform: `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`,
    transition: isPanning.current || lastPinchDist.current ? 'none' : 'transform 0.25s ease-out',
    cursor: zoom.scale > 1 ? 'grab' : 'default',
    touchAction: zoom.scale > 1 ? 'none' : 'auto',
  };

  return {
    containerRef,
    zoom,
    isZoomed,
    resetZoom,
    imageStyle,
    handlers: {
      onWheel: handleWheel,
      onDoubleClick: handleDoubleClick,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onTouchStart: (e: React.TouchEvent) => {
        handleDoubleTap(e);
        handleTouchStartZoom(e);
      },
      onTouchMove: handleTouchMoveZoom,
      onTouchEnd: handleTouchEndZoom,
    },
  };
}
