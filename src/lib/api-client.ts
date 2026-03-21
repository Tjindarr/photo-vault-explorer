import { mockPhotos, mockFolderTree, type Photo, type Folder } from './mock-data';

const API_BASE = '/api';

let _apiAvailable: boolean | null = null;

async function isApiAvailable(): Promise<boolean> {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

export async function fetchPhotos(params: {
  query?: string;
  folder?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Photo[]; total: number }> {
  if (!(await isApiAvailable())) {
    // Fallback to mock data with client-side filtering
    let photos = [...mockPhotos];

    if (params.folder) {
      photos = photos.filter((p) => p.folder.startsWith(params.folder!));
    }
    if (params.query) {
      const q = params.query.toLowerCase();
      photos = photos.filter((p) =>
        p.filename.toLowerCase().includes(q) ||
        p.metadata.location?.toLowerCase().includes(q) ||
        p.metadata.camera?.toLowerCase().includes(q) ||
        p.metadata.dateTaken?.includes(q) ||
        p.folder.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q)
      );
    }
    if (params.dateFrom) {
      photos = photos.filter((p) => p.metadata.dateTaken && p.metadata.dateTaken >= params.dateFrom!);
    }
    if (params.dateTo) {
      photos = photos.filter((p) => p.metadata.dateTaken && p.metadata.dateTaken <= params.dateTo!);
    }
    if (params.type) {
      photos = photos.filter((p) => p.type === params.type);
    }

    const total = photos.length;
    const offset = params.offset || 0;
    const limit = params.limit || 200;
    return { items: photos.slice(offset, offset + limit), total };
  }

  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set('q', params.query);
  if (params.folder) searchParams.set('folder', params.folder);
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);
  if (params.type) searchParams.set('type', params.type);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  const res = await fetch(`${API_BASE}/photos?${searchParams}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  return res.json();
}

export async function fetchFolders(): Promise<Folder[]> {
  if (!(await isApiAvailable())) return mockFolderTree;

  const res = await fetch(`${API_BASE}/folders`);
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function fetchStats(): Promise<any> {
  if (!(await isApiAvailable())) return null;

  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchMapPhotos(params: {
  query?: string;
  folder?: string;
  limit?: number;
}): Promise<{ items: Photo[]; total: number }> {
  if (!(await isApiAvailable())) {
    let photos = [...mockPhotos];

    if (params.folder) {
      photos = photos.filter((p) => p.folder.startsWith(params.folder!));
    }
    if (params.query) {
      const q = params.query.toLowerCase();
      photos = photos.filter((p) =>
        p.filename.toLowerCase().includes(q) ||
        p.metadata.location?.toLowerCase().includes(q) ||
        p.metadata.camera?.toLowerCase().includes(q) ||
        p.folder.toLowerCase().includes(q)
      );
    }

    photos = photos.filter((p) => p.metadata.gpsLat != null && p.metadata.gpsLng != null);
    const limit = params.limit || 20000;
    return { items: photos.slice(0, limit), total: photos.length };
  }

  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set('q', params.query);
  if (params.folder) searchParams.set('folder', params.folder);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`${API_BASE}/map-photos?${searchParams}`);
  if (!res.ok) throw new Error('Failed to fetch map photos');
  return res.json();
}

export async function triggerReindex(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/reindex`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger reindex');
  return res.json();
}

export async function fetchIndexStatus(): Promise<{
  running: boolean;
  progress: number;
  total: number;
  last_run: string | null;
}> {
  if (!(await isApiAvailable())) {
    return { running: false, progress: 0, total: 0, last_run: null };
  }
  const res = await fetch(`${API_BASE}/index-status`);
  if (!res.ok) throw new Error('Failed to fetch index status');
  return res.json();
}

export async function fetchDuplicates(): Promise<{
  groups: { hash: string; photos: Photo[] }[];
  totalGroups: number;
  totalDuplicates: number;
}> {
  if (!(await isApiAvailable())) {
    return { groups: [], totalGroups: 0, totalDuplicates: 0 };
  }
  const res = await fetch(`${API_BASE}/duplicates`);
  if (!res.ok) throw new Error('Failed to fetch duplicates');
  return res.json();
}

export async function deletePhotos(ids: string[]): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/photos/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to delete photos');
  return res.json();
}

export async function fetchTrash(): Promise<{
  items: { id: string; filename: string; originalPath: string; folder: string; type: string; width: number; height: number; thumbnailUrl: string | null; fileSize: number; deletedAt: string; metadata: { dateTaken: string | null; location: string | null; camera: string | null } }[];
  total: number;
}> {
  if (!(await isApiAvailable())) return { items: [], total: 0 };
  const res = await fetch(`${API_BASE}/trash`);
  if (!res.ok) throw new Error('Failed to fetch trash');
  return res.json();
}

export async function restoreFromTrash(ids: string[]): Promise<{ restored: number }> {
  const res = await fetch(`${API_BASE}/trash/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to restore from trash');
  return res.json();
}

export async function emptyTrash(ids?: string[]): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/trash/empty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids || null }),
  });
  if (!res.ok) throw new Error('Failed to empty trash');
  return res.json();
}

export { isApiAvailable };
