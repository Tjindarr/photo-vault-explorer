import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, MapPin, Calendar, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';
import TimelineScrubber from './TimelineScrubber';

interface PhotoGridProps {
  photos: Photo[];
  onSelect?: (photo: Photo) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  deleteMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
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

function PhotoThumbnail({ photo, onSelect, deleteMode, selected, onToggleSelect }: {
  photo: Photo;
  onSelect?: (p: Photo) => void;
  deleteMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const imgSrc = failed ? null : (photo.thumbnailUrl || photo.fullUrl);

  const handleClick = () => {
    if (deleteMode && onToggleSelect) {
      onToggleSelect(photo.id);
    } else if (onSelect) {
      onSelect(photo);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group relative overflow-hidden bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none active:scale-[0.97] transition-all duration-150",
        deleteMode && selected && "ring-2 ring-destructive ring-offset-1 ring-offset-background",
      )}
      style={{ borderRadius: 'var(--thumb-radius)', aspectRatio: '1' }}
    >
      {imgSrc && !failed ? (
        <img
          src={imgSrc}
          alt={photo.filename}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-all duration-500',
            loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
            !deleteMode && 'group-hover:scale-[1.03] group-hover:brightness-110',
            deleteMode && selected && 'brightness-75',
          )}
        />
      ) : null}
      {(!loaded || failed || !imgSrc) && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          {failed || !imgSrc ? (
            <span className="text-[10px] text-muted-foreground truncate px-2">{photo.filename}</span>
          ) : (
            <div className="w-full h-full animate-pulse bg-muted" />
          )}
        </div>
      )}

      {photo.type === 'video' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-overlay/70 backdrop-blur-sm">
          <Play className="h-3 w-3 text-white fill-white" />
          <span className="text-[10px] text-white font-medium">
            {photo.duration != null
              ? `${Math.floor(photo.duration / 60)}:${Math.floor(photo.duration % 60).toString().padStart(2, '0')}`
              : 'Video'}
          </span>
        </div>
      )}

      {deleteMode && (
        <div className="absolute top-1.5 right-1.5 z-10">
          {selected ? (
            <CheckCircle2 className="h-5 w-5 text-destructive drop-shadow-md" />
          ) : (
            <Circle className="h-5 w-5 text-white/70 drop-shadow-md" />
          )}
        </div>
      )}

      {!deleteMode && (
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
      )}
    </button>
  );
}

export default function PhotoGrid({ photos, onSelect, hasMore, loadingMore, onLoadMore, deleteMode, selectedIds, onToggleSelect }: PhotoGridProps) {
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

  // Infinite scroll: load more when near bottom
  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (loadingMore) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 800) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loadingMore, onLoadMore]);

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

  // Scroll to a date header by label
  const handleScrollToDate = useCallback((label: string) => {
    const idx = rows.findIndex(r => r.type === 'header' && r.label === label);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'start' });
    }
  }, [rows, virtualizer]);

  return (
    <div className="h-full flex flex-col relative">
      <TimelineScrubber photos={photos} onScrollToDate={handleScrollToDate} />
      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin min-h-0 pr-10 sm:pr-12">
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
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  onSelect={onSelect}
                  deleteMode={deleteMode}
                  selected={selectedIds?.has(photo.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
        </div>
      )}
      </div>
    </div>
  );
}
