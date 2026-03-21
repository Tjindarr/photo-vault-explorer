import { useEffect, useCallback, useState, useRef } from 'react';
import { X, MapPin, Camera, Clock, Maximize2, Trash2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface PhotoViewerProps {
  photo: Photo;
  photos: Photo[];
  onClose: () => void;
  onNavigate: (photo: Photo) => void;
  onDelete?: (photo: Photo) => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const SWIPE_THRESHOLD = 50;
const SWIPE_DOWN_THRESHOLD = 100;

export default function PhotoViewer({ photo, photos, onClose, onNavigate, onDelete }: PhotoViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  // Touch/swipe state
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeY, setSwipeY] = useState(0);
  const swipeDirection = useRef<'horizontal' | 'vertical' | null>(null);

  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(photos[currentIndex - 1]);
  }, [hasPrev, currentIndex, photos, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(photos[currentIndex + 1]);
  }, [hasNext, currentIndex, photos, onNavigate]);

  useEffect(() => {
    setLoaded(false);
    setSwipeOffset(0);
    setSwipeY(0);
    swipeDirection.current = null;
  }, [photo.id]);

  // Scroll thumbnail strip to center current photo
  useEffect(() => {
    if (thumbStripRef.current) {
      const activeThumb = thumbStripRef.current.querySelector('[data-active="true"]');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'i') setShowInfo((s) => !s);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  // Touch handlers for swipe (horizontal nav + vertical dismiss)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swipeDirection.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;

    // Determine direction on first significant movement
    if (!swipeDirection.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        swipeDirection.current = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      }
      return;
    }

    if (swipeDirection.current === 'horizontal') {
      setSwipeOffset(dx);
    } else {
      // Only allow downward swipe to dismiss
      setSwipeY(Math.max(0, dy));
    }
  };

  const handleTouchEnd = () => {
    if (swipeDirection.current === 'horizontal') {
      if (swipeOffset < -SWIPE_THRESHOLD && hasNext) goNext();
      else if (swipeOffset > SWIPE_THRESHOLD && hasPrev) goPrev();
    } else if (swipeDirection.current === 'vertical') {
      if (swipeY > SWIPE_DOWN_THRESHOLD) onClose();
    }
    setSwipeOffset(0);
    setSwipeY(0);
    swipeDirection.current = null;
    touchStart.current = null;
  };

  const meta = photo.metadata;

  // Thumbnail strip: show nearby photos
  const THUMB_RANGE = 12;
  const thumbStart = Math.max(0, currentIndex - THUMB_RANGE);
  const thumbEnd = Math.min(photos.length, currentIndex + THUMB_RANGE + 1);
  const nearbyPhotos = photos.slice(thumbStart, thumbEnd);

  // Dismiss opacity based on swipe
  const dismissProgress = Math.min(swipeY / (SWIPE_DOWN_THRESHOLD * 2), 1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-overlay/95 backdrop-blur-sm fade-in"
      style={{
        opacity: 1 - dismissProgress * 0.5,
      }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-2 sm:px-4 z-10"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: close button */}
        <button
          onClick={onClose}
          className="p-2.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
          aria-label="Close"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Center: counter */}
        <span className="text-white/60 text-xs tabular-nums">
          {currentIndex + 1} / {photos.length}
        </span>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          {onDelete && (
            <button
              onClick={() => onDelete(photo)}
              className="p-2.5 rounded-full text-white/60 hover:text-red-400 hover:bg-white/10 transition-colors active:scale-95"
              aria-label="Delete photo"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          )}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              'p-2.5 rounded-full transition-colors active:scale-95',
              showInfo ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10',
            )}
            aria-label="Show info"
          >
            <Info className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Main content area with swipe */}
      <div
        className="flex-1 flex min-h-0 relative"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Desktop prev/next buttons */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all active:scale-95"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={goNext}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-all active:scale-95"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Image or Video */}
        <div
          className={cn('flex-1 flex items-center justify-center p-2 sm:p-12 transition-all duration-300', showInfo && 'lg:mr-72')}
          style={{
            transform: swipeDirection.current === 'horizontal' && swipeOffset
              ? `translateX(${swipeOffset * 0.4}px)`
              : swipeDirection.current === 'vertical' && swipeY
              ? `translateY(${swipeY * 0.6}px) scale(${1 - dismissProgress * 0.1})`
              : undefined,
            transition: (swipeOffset || swipeY) ? 'none' : 'transform 0.3s ease',
          }}
        >
          {photo.type === 'video' ? (
            <video
              key={photo.id}
              src={photo.fullUrl}
              controls
              autoPlay
              playsInline
              x-webkit-airplay="allow"
              onLoadedData={() => setLoaded(true)}
              className={cn(
                'max-w-full max-h-full rounded-sm transition-all duration-500',
                loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
              )}
            />
          ) : (
            <img
              src={photo.fullUrl}
              alt={photo.filename}
              onLoad={() => setLoaded(true)}
              className={cn(
                'max-w-full max-h-full object-contain rounded-sm transition-all duration-500 select-none',
                loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
              )}
              draggable={false}
            />
          )}
          {!loaded && (
            <div className="absolute w-12 h-12 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          )}
        </div>

        {/* Info panel (desktop) */}
        {showInfo && (
          <div
            className="hidden lg:block absolute right-0 top-0 bottom-0 w-72 bg-card border-l border-border overflow-y-auto p-5 fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground mb-4">Details</h3>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">File</p>
                <p className="text-foreground font-medium">{photo.filename}</p>
                <p className="text-muted-foreground text-xs">{photo.width} × {photo.height} · {formatFileSize(photo.fileSize)}</p>
              </div>

              {meta.dateTaken && (
                <div className="flex items-start gap-2.5">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Date</p>
                    <p className="text-foreground">{formatDateTime(meta.dateTaken)}</p>
                  </div>
                </div>
              )}

              {meta.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Location</p>
                    <p className="text-foreground">{meta.location}</p>
                  </div>
                </div>
              )}

              {meta.camera && (
                <div className="flex items-start gap-2.5">
                  <Camera className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Camera</p>
                    <p className="text-foreground">{meta.camera}</p>
                  </div>
                </div>
              )}

              {(meta.aperture || meta.shutterSpeed || meta.iso) && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Exposure</p>
                  <div className="grid grid-cols-3 gap-2">
                    {meta.aperture && (
                      <div className="bg-muted rounded-md p-2 text-center">
                        <p className="text-xs text-muted-foreground">Aperture</p>
                        <p className="text-foreground font-mono text-sm">{meta.aperture}</p>
                      </div>
                    )}
                    {meta.shutterSpeed && (
                      <div className="bg-muted rounded-md p-2 text-center">
                        <p className="text-xs text-muted-foreground">Shutter</p>
                        <p className="text-foreground font-mono text-sm">{meta.shutterSpeed}</p>
                      </div>
                    )}
                    {meta.iso && (
                      <div className="bg-muted rounded-md p-2 text-center">
                        <p className="text-xs text-muted-foreground">ISO</p>
                        <p className="text-foreground font-mono text-sm">{meta.iso}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Path</p>
                <p className="text-foreground font-mono text-xs break-all">{photo.path}</p>
              </div>
            </div>
          </div>
        )}

        {/* Mobile info sheet */}
        {showInfo && (
          <div
            className="lg:hidden absolute inset-x-0 bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border rounded-t-2xl max-h-[50vh] overflow-y-auto p-4 fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-foreground font-medium truncate">{photo.filename}</p>
                <p className="text-muted-foreground text-xs">{photo.width} × {photo.height} · {formatFileSize(photo.fileSize)}</p>
              </div>
              {meta.dateTaken && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground text-xs">{formatDateTime(meta.dateTaken)}</span>
                </div>
              )}
              {meta.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground text-xs">{meta.location}</span>
                </div>
              )}
              {meta.camera && (
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground text-xs">{meta.camera}</span>
                </div>
              )}
              {(meta.aperture || meta.shutterSpeed || meta.iso) && (
                <div className="flex gap-2">
                  {meta.aperture && <span className="bg-muted rounded px-2 py-1 text-xs text-foreground">{meta.aperture}</span>}
                  {meta.shutterSpeed && <span className="bg-muted rounded px-2 py-1 text-xs text-foreground">{meta.shutterSpeed}</span>}
                  {meta.iso && <span className="bg-muted rounded px-2 py-1 text-xs text-foreground">ISO {meta.iso}</span>}
                </div>
              )}
              <p className="text-muted-foreground font-mono text-[10px] break-all pt-1 border-t border-border">{photo.path}</p>
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail strip at bottom — desktop only */}
      <div
        className="shrink-0 hidden sm:block bg-overlay/80 backdrop-blur-sm border-t border-white/10 py-2 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={thumbStripRef}
          className="flex gap-1.5 overflow-x-auto scrollbar-thin justify-center"
          style={{ scrollbarWidth: 'none' }}
        >
          {nearbyPhotos.map((p, i) => {
            const realIndex = thumbStart + i;
            const isActive = realIndex === currentIndex;
            return (
              <button
                key={p.id}
                data-active={isActive}
                onClick={() => onNavigate(p)}
                className={cn(
                  'shrink-0 rounded-md overflow-hidden transition-all duration-200',
                  isActive
                    ? 'ring-2 ring-primary w-14 h-14 sm:w-16 sm:h-16 opacity-100'
                    : 'w-10 h-10 sm:w-12 sm:h-12 opacity-50 hover:opacity-80',
                )}
              >
                <img
                  src={p.thumbnailUrl || p.fullUrl}
                  alt={p.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
