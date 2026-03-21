import { useEffect, useCallback, useState, useRef } from 'react';
import { X, MapPin, Camera, Clock, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface PhotoViewerProps {
  photo: Photo;
  photos: Photo[];
  onClose: () => void;
  onNavigate: (photo: Photo) => void;
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

export default function PhotoViewer({ photo, photos, onClose, onNavigate }: PhotoViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  // Touch/swipe state
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

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

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    setSwipeOffset(dx);
  };

  const handleTouchEnd = () => {
    if (swipeOffset < -SWIPE_THRESHOLD && hasNext) {
      goNext();
    } else if (swipeOffset > SWIPE_THRESHOLD && hasPrev) {
      goPrev();
    }
    setSwipeOffset(0);
    touchStart.current = null;
  };

  const meta = photo.metadata;

  // Thumbnail strip: show nearby photos
  const THUMB_RANGE = 12;
  const thumbStart = Math.max(0, currentIndex - THUMB_RANGE);
  const thumbEnd = Math.min(photos.length, currentIndex + THUMB_RANGE + 1);
  const nearbyPhotos = photos.slice(thumbStart, thumbEnd);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-overlay/95 backdrop-blur-sm fade-in" onClick={onClose}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 z-10" onClick={(e) => e.stopPropagation()}>
        <div className="text-white/80 text-sm font-medium truncate max-w-[50%]">{photo.filename}</div>
        <div className="flex items-center gap-1">
          <span className="text-white/50 text-xs tabular-nums mr-2">
            {currentIndex + 1} / {photos.length}
          </span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              'p-2 rounded-lg transition-colors active:scale-95',
              showInfo ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10',
            )}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors active:scale-95">
            <X className="h-5 w-5" />
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
        {/* Image or Video */}
        <div
          className={cn('flex-1 flex items-center justify-center p-4 sm:p-12 transition-all duration-300', showInfo && 'lg:mr-72')}
          style={{
            transform: swipeOffset ? `translateX(${swipeOffset * 0.4}px)` : undefined,
            transition: swipeOffset ? 'none' : 'transform 0.3s ease',
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
      </div>

      {/* Thumbnail strip at bottom */}
      <div
        className="shrink-0 bg-overlay/80 backdrop-blur-sm border-t border-white/10 py-2 px-2"
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
