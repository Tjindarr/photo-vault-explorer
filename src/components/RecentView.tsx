import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { fetchRecentPhotos } from '@/lib/api-client';
import { type Photo } from '@/lib/mock-data';
import PhotoGrid from './PhotoGrid';

interface RecentViewProps {
  onSelectPhoto?: (photo: Photo) => void;
}

export default function RecentView({ onSelectPhoto }: RecentViewProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRecentPhotos(300)
      .then(res => setPhotos(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Clock className="h-10 w-10 opacity-40" />
        <p className="text-sm">No recently added files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 sm:px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Recently Added</h2>
        <p className="text-xs text-muted-foreground">{photos.length} files, sorted by index date</p>
      </div>
      <div className="flex-1 min-h-0 px-3 sm:px-5">
        <PhotoGrid
          photos={photos}
          onSelect={onSelectPhoto}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => {}}
          deleteMode={false}
          selectedIds={new Set()}
          onToggleSelect={() => {}}
        />
      </div>
    </div>
  );
}