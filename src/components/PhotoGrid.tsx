import { useState, useMemo } from 'react';
import { Play, MapPin, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface PhotoGridProps {
  photos: Photo[];
  onSelect: (photo: Photo) => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

function PhotoThumbnail({ photo, onSelect, index }: { photo: Photo; onSelect: (p: Photo) => void; index: number }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      onClick={() => onSelect(photo)}
      className="group relative overflow-hidden bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none active:scale-[0.97] transition-transform duration-150"
      style={{
        borderRadius: 'var(--thumb-radius)',
        aspectRatio: '1',
        animationDelay: `${Math.min(index * 40, 400)}ms`,
      }}
    >
      <img
        src={photo.thumbnailUrl}
        alt={photo.filename}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-all duration-500',
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
          'group-hover:scale-[1.03] group-hover:brightness-110',
        )}
      />
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Video badge */}
      {photo.type === 'video' && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-overlay/70 backdrop-blur-sm">
          <Play className="h-3 w-3 text-white fill-white" />
          <span className="text-[10px] text-white font-medium">Video</span>
        </div>
      )}

      {/* Hover overlay with metadata */}
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
  const grouped = useMemo(() => groupByDate(photos), [photos]);

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

  let globalIndex = 0;

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([dateGroup, groupPhotos]) => {
        const startIdx = globalIndex;
        globalIndex += groupPhotos.length;
        return (
          <section key={dateGroup} className="fade-in-up">
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-sm font-semibold text-foreground">{dateGroup}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{groupPhotos.length} items</span>
            </div>
            <div className="gallery-grid">
              {groupPhotos.map((photo, i) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  onSelect={onSelect}
                  index={startIdx + i}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
