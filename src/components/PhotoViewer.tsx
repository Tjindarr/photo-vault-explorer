import { useEffect, useCallback, useState } from 'react';
import { X, ChevronLeft, ChevronRight, MapPin, Camera, Clock, Aperture, Gauge, Maximize2 } from 'lucide-react';
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

export default function PhotoViewer({ photo, photos, onClose, onNavigate }: PhotoViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'i') setShowInfo((s) => !s);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  const meta = photo.metadata;

  return (
    <div className="fixed inset-0 z-50 flex bg-overlay/95 backdrop-blur-sm fade-in" onClick={onClose}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-white/80 text-sm font-medium truncate max-w-[50%]">{photo.filename}</div>
        <div className="flex items-center gap-1">
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

      {/* Navigation */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-overlay/40 text-white/70 hover:text-white hover:bg-overlay/60 transition-all active:scale-95"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-overlay/40 text-white/70 hover:text-white hover:bg-overlay/60 transition-all active:scale-95"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Image or Video */}
      <div className={cn('flex-1 flex items-center justify-center p-12 transition-all duration-300', showInfo && 'mr-72')} onClick={(e) => e.stopPropagation()}>
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
              'max-w-full max-h-full object-contain rounded-sm transition-all duration-500',
              loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
            )}
          />
        )}
        {!loaded && (
          <div className="absolute w-12 h-12 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        )}
      </div>

      {/* Info panel */}
      {showInfo && (
        <div
          className="absolute right-0 top-0 bottom-0 w-72 bg-card border-l border-border overflow-y-auto p-5 fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold text-foreground mb-4 mt-10">Details</h3>
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

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs tabular-nums">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  );
}
