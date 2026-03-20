import { useState, useMemo } from 'react';
import AppHeader, { type ViewMode } from '@/components/AppHeader';
import FolderSidebar from '@/components/FolderSidebar';
import SearchBar from '@/components/SearchBar';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoMap from '@/components/PhotoMap';
import PhotoViewer from '@/components/PhotoViewer';
import TimelineSlider from '@/components/TimelineSlider';
import { mockPhotos, mockFolderTree, type Photo } from '@/lib/mock-data';

export default function Index() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);

  const filteredPhotos = useMemo(() => {
    let photos = mockPhotos;

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
  }, [selectedFolder, searchQuery, dateRange]);

  // Photos before date filter (for the timeline histogram)
  const photosBeforeDateFilter = useMemo(() => {
    let photos = mockPhotos;
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
  }, [selectedFolder, searchQuery]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <AppHeader
        onToggleSidebar={() => setSidebarOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex flex-1 min-h-0">
        <FolderSidebar
          folders={mockFolderTree}
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
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-5 pb-6">
            {viewMode === 'grid' ? (
              <PhotoGrid photos={filteredPhotos} onSelect={setSelectedPhoto} />
            ) : (
              <PhotoMap photos={filteredPhotos} onSelect={setSelectedPhoto} />
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
