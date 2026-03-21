import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, MapPin, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface PhotoGridProps {
  photos: Photo[];
  onSelect: (photo: Photo) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

// A row is either a date header or a row of photo thumbnails
type GridRow =
  | { type: 'header'; label: string; count: number }
  | { type: 'photos'; photos: Photo[] };

function groupByDate(photos: Photo[]): Map<string, Photo[]> {
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    const key = photo.metadata.dateTaken
      ? new Date(photo.metadata.dateTaken).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'Unknown Date';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(photo);
  }
  return groups;
}

function buildRows(photos: Photo[], cols: number): GridRow[] {
  if (cols <= 0) return [];
  const grouped = groupByDate(photos);
  const rows: GridRow[] = [];

  for (const [label, groupPhotos] of grouped) {
    rows.push({ type: 'header', label, count: groupPhotos.length });
    for (let i = 0; i < groupPhotos.length; i += cols) {
      rows.push({ type: 'photos', photos: groupPhotos.slice(i, i + cols) });
    }
  }
  return rows;
}

function PhotoThumbnail({ photo, onSelect }: { photo: Photo; onSelect: (p: Photo) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Fall back to full image if no thumbnail, then to nothing
  const imgSrc = error
    ? (photo.thumbnailUrl ? photo.fullUrl : null)
    : (photo.thumbnailUrl || photo.fullUrl);

  return (
    <button
      onClick={() => onSelect(photo)}
      className="group relative overflow-hidden bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none active:scale-[0.97] transition-transform duration-150"
      style={{ borderRadius: 'var(--thumb-radius)', aspectRatio: '1' }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={photo.filename}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!error) setError(true);
            else setLoaded(true); // give up, show placeholder
          }}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-all duration-500',
            loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
            'group-hover:scale-[1.03] group-hover:brightness-110',
          )}
        />
      ) : null}
      {(!loaded || !imgSrc) && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          {!imgSrc || error ? (
            <span className="text-[10px] text-muted-foreground truncate px-2">{photo.filename}</span>
          ) : (
            <div className="w-full h-full animate-pulse bg-muted" />
          )}
        </div>
      )}

      {photo.type === 'video' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-overlay/70 backdrop-blur-sm">
          <Play className="h-3 w-3 text-white fill-white" />
          <span className="text-[10px] text-white font-medium">Video</span>
        </div>
      )}

      <div className={cn(
        'absolute inset-0 bg-gradient-to-t from-overlay/60 via-transparent to-transparent',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        'flex flex-col justify-end p-2.5',
      )}>
        <p className="text-white text-xs font-medium truncate">{photo.filename}</p>
        {photo.metadata.location && (
          <p className="text-white/70 text-[10px] flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5" />
            {photo.metadata.location}
          </p>
        )}
      </div>
    </button>
  );
}

export default function PhotoGrid({ photos, onSelect }: PhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);

  // Measure container width and compute columns
  const updateCols = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const minSize = width < 640 ? 120 : 200;
    const gap = 4;
    setCols(Math.max(2, Math.floor((width + gap) / (minSize + gap))));
  }, []);

  useEffect(() => {
    updateCols();
    const ro = new ResizeObserver(updateCols);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateCols]);

  const rows = useMemo(() => buildRows(photos, cols), [photos, cols]);

  const HEADER_HEIGHT = 40;
  const GAP = 4;

  // Estimate thumb size from container
  const getThumbSize = useCallback(() => {
    if (!containerRef.current) return 200;
    const width = containerRef.current.clientWidth;
    return (width - GAP * (cols - 1)) / cols;
  }, [cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => {
      const row = rows[i];
      if (row.type === 'header') return HEADER_HEIGHT;
      return getThumbSize() + GAP;
    },
    overscan: 8,
  });

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Calendar className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium mb-1">No photos found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your search or selecting a different folder.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto scrollbar-thin">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (row.type === 'header') {
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-end gap-2 pb-1.5 px-1"
              >
                <h3 className="text-sm font-semibold text-foreground">{row.label}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{row.count} items</span>
              </div>
            );
          }

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: `${GAP}px`,
                paddingBottom: `${GAP}px`,
              }}
            >
              {row.photos.map((photo) => (
                <PhotoThumbnail key={photo.id} photo={photo} onSelect={onSelect} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
