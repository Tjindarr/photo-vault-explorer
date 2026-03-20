import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import AppHeader, { type ViewMode } from '@/components/AppHeader';
import FolderSidebar from '@/components/FolderSidebar';
import SearchBar from '@/components/SearchBar';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoMap from '@/components/PhotoMap';
import StatsDashboard from '@/components/StatsDashboard';
import PhotoViewer from '@/components/PhotoViewer';
import TimelineSlider from '@/components/TimelineSlider';
import { type Photo, type Folder } from '@/lib/mock-data';
import { fetchPhotos, fetchFolders, isApiAvailable } from '@/lib/api-client';

export default function Index() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);

  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingApi, setUsingApi] = useState(false);

  // Load photos and folders
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const apiReady = await isApiAvailable();
      setUsingApi(apiReady);

      const [photosResult, foldersResult] = await Promise.all([
        fetchPhotos({ limit: 10000 }),
        fetchFolders(),
      ]);
      setAllPhotos(photosResult.items);
      setFolders(foldersResult);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Client-side filtering (works for both mock and API data)
  const filteredPhotos = useMemo(() => {
    let photos = allPhotos;

    if (selectedFolder) {
      photos = photos.filter((p) => p.folder.startsWith(selectedFolder));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      photos = photos.filter((p) =>
        p.filename.toLowerCase().includes(q) ||
        p.metadata.location?.toLowerCase().includes(q) ||
        p.metadata.camera?.toLowerCase().includes(q) ||
        p.metadata.dateTaken?.includes(q) ||
        p.folder.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q)
      );
    }

    if (dateRange) {
      photos = photos.filter((p) => {
        if (!p.metadata.dateTaken) return false;
        const d = new Date(p.metadata.dateTaken);
        return d >= dateRange[0] && d <= dateRange[1];
      });
    }

    return photos;
  }, [allPhotos, selectedFolder, searchQuery, dateRange]);

  const photosBeforeDateFilter = useMemo(() => {
    let photos = allPhotos;
    if (selectedFolder) photos = photos.filter((p) => p.folder.startsWith(selectedFolder));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      photos = photos.filter((p) =>
        p.filename.toLowerCase().includes(q) ||
        p.metadata.location?.toLowerCase().includes(q) ||
        p.metadata.camera?.toLowerCase().includes(q) ||
        p.metadata.dateTaken?.includes(q) ||
        p.folder.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q)
      );
    }
    return photos;
  }, [allPhotos, selectedFolder, searchQuery]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <AppHeader
        onToggleSidebar={() => setSidebarOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex flex-1 min-h-0">
        <FolderSidebar
          folders={folders}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              resultCount={filteredPhotos.length}
            />
          </div>
          <div className={cn(
            "flex-1 min-h-0 px-3 sm:px-5",
            viewMode !== 'grid' && "overflow-y-auto scrollbar-thin pb-6"
          )}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center fade-in">
                  <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading library...</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <PhotoGrid photos={filteredPhotos} onSelect={setSelectedPhoto} />
            ) : viewMode === 'map' ? (
              <PhotoMap photos={filteredPhotos} onSelect={setSelectedPhoto} />
            ) : (
              <StatsDashboard photos={filteredPhotos} />
            )}
          </div>
          <TimelineSlider
            photos={photosBeforeDateFilter}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        </main>
      </div>

      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          photos={filteredPhotos}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={setSelectedPhoto}
        />
      )}
    </div>
  );
}
