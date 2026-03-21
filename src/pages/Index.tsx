import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import AppHeader, { type ViewMode } from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import FolderSidebar from '@/components/FolderSidebar';
import SearchBar from '@/components/SearchBar';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoMap from '@/components/PhotoMap';
import StatsDashboard from '@/components/StatsDashboard';
import DuplicatesView from '@/components/DuplicatesView';
import TrashView from '@/components/TrashView';
import PhotoViewer from '@/components/PhotoViewer';
import { type Photo, type Folder } from '@/lib/mock-data';
import { fetchPhotos, fetchFolders, fetchMapPhotos, fetchStats, deletePhotos, isApiAvailable } from '@/lib/api-client';
import { toast } from 'sonner';

const PAGE_SIZE = 500;

export default function Index() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mapPhotos, setMapPhotos] = useState<Photo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    type: typeFilter || undefined,
  }), [selectedFolder, debouncedQuery, typeFilter]);

  // Load first page when filters change
  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPhotos({ ...apiParams, limit: PAGE_SIZE, offset: 0 });
      setPhotos(result.items);
      setTotalCount(result.total);

      const mapResult = await fetchMapPhotos({ ...apiParams, limit: 20000 });
      setMapPhotos(mapResult.items);
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

  // Initial load
  useEffect(() => {
    const init = async () => {
      await isApiAvailable();
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} file(s)? They will be moved to trash.`)) return;
    try {
      await deletePhotos(Array.from(selectedIds));
      setPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
      setMapPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
      setTotalCount(prev => prev - selectedIds.size);
      toast.success(`${selectedIds.size} file(s) moved to trash`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to delete files');
    }
  };

  const handleDeleteSingle = async (photo: Photo) => {
    if (!confirm(`Delete "${photo.filename}"? It will be moved to trash.`)) return;
    try {
      await deletePhotos([photo.id]);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      setMapPhotos(prev => prev.filter(p => p.id !== photo.id));
      setTotalCount(prev => prev - 1);
      toast.success('Moved to trash');
      const idx = photos.findIndex(p => p.id === photo.id);
      const remaining = photos.filter(p => p.id !== photo.id);
      if (remaining.length === 0) {
        setSelectedPhoto(null);
      } else {
        setSelectedPhoto(remaining[Math.min(idx, remaining.length - 1)]);
      }
    } catch {
      toast.error('Failed to delete file');
    }
  };

  return (
    <div className="app-shell flex flex-col bg-background overflow-hidden">
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
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          {(viewMode === 'grid' || viewMode === 'map') && (
            <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2 space-y-2">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={totalCount}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
              />
            </div>
          )}
          <div className={cn(
            "flex-1 min-h-0 px-3 sm:px-5",
            viewMode !== 'grid' && "overflow-y-auto scrollbar-thin pb-6",
            (viewMode === 'duplicates' || viewMode === 'trash') && "overflow-hidden"
          )}>
            {loading && (viewMode === 'grid' || viewMode === 'map') ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center fade-in">
                  <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading library...</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <PhotoGrid
                photos={photos}
                onSelect={deleteMode ? undefined : setSelectedPhoto}
                hasMore={photos.length < totalCount}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                deleteMode={deleteMode}
                selectedIds={selectedIds}
                onToggleSelect={(id) => {
                  setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onDeleteModeChange={(on) => {
                  setDeleteMode(on);
                  if (!on) setSelectedIds(new Set());
                }}
                onDeleteSelected={handleDeleteSelected}
              />
            ) : viewMode === 'map' ? (
              <PhotoMap photos={mapPhotos} onSelect={setSelectedPhoto} />
            ) : viewMode === 'duplicates' ? (
              <DuplicatesView onSelect={setSelectedPhoto} />
            ) : viewMode === 'trash' ? (
              <TrashView />
            ) : (
              <StatsDashboard stats={stats} />
            )}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav viewMode={viewMode} onViewModeChange={setViewMode} />

      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          photos={photos}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={setSelectedPhoto}
          onDelete={handleDeleteSingle}
        />
      )}
    </div>
  );
}
