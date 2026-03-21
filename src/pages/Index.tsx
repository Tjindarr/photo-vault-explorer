import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import AppHeader, { type ViewMode } from '@/components/AppHeader';
import FolderSidebar from '@/components/FolderSidebar';
import SearchBar from '@/components/SearchBar';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoMap from '@/components/PhotoMap';
import StatsDashboard from '@/components/StatsDashboard';
import PhotoViewer from '@/components/PhotoViewer';
import { type Photo, type Folder } from '@/lib/mock-data';
import { fetchPhotos, fetchFolders, fetchStats, isApiAvailable } from '@/lib/api-client';

const PAGE_SIZE = 500;

export default function Index() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [usingApi, setUsingApi] = useState(false);

  // Debounce search query
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Build API params from current filters
  const apiParams = useMemo(() => ({
    folder: selectedFolder || undefined,
    query: debouncedQuery || undefined,
  }), [selectedFolder, debouncedQuery]);

  // Load first page when filters change
  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPhotos({ ...apiParams, limit: PAGE_SIZE, offset: 0 });
      setPhotos(result.items);
      setTotalCount(result.total);
    } catch (e) {
      console.error('Failed to load photos:', e);
    } finally {
      setLoading(false);
    }
  }, [apiParams]);

  // Load next page (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || photos.length >= totalCount) return;
    setLoadingMore(true);
    try {
      const result = await fetchPhotos({ ...apiParams, limit: PAGE_SIZE, offset: photos.length });
      setPhotos(prev => [...prev, ...result.items]);
    } catch (e) {
      console.error('Failed to load more photos:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [apiParams, photos.length, totalCount, loadingMore]);

  // Initial load + reload on filter changes
  useEffect(() => {
    const init = async () => {
      const apiReady = await isApiAvailable();
      setUsingApi(apiReady);
      const [, foldersResult] = await Promise.all([
        loadPhotos(),
        fetchFolders(),
      ]);
      setFolders(foldersResult);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload photos when filters change (not on first mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    loadPhotos();
  }, [loadPhotos]);

  // Load stats from server when switching to stats view
  useEffect(() => {
    if (viewMode === 'stats' && !stats) {
      fetchStats().then(setStats).catch(console.error);
    }
  }, [viewMode, stats]);

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
          <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2 space-y-2">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              resultCount={totalCount}
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
              <PhotoGrid
                photos={photos}
                onSelect={setSelectedPhoto}
                hasMore={photos.length < totalCount}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
              />
            ) : viewMode === 'map' ? (
              <PhotoMap photos={photos} onSelect={setSelectedPhoto} />
            ) : (
              <StatsDashboard stats={stats} />
            )}
          </div>
        </main>
      </div>

      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          photos={photos}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={setSelectedPhoto}
        />
      )}
    </div>
  );
}
