import { mockPhotos, mockFolderTree, type Photo, type Folder } from './mock-data';

const API_BASE = '/api';

let _apiAvailable: boolean | null = null;
let _lastApiCheck = 0;
const API_CHECK_TTL_MS = 5000;

function isJsonResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json');
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  if (!isJsonResponse(res)) {
    throw new Error('API returned non-JSON response');
  }
  return res.json();
}

async function isApiAvailable(force = false): Promise<boolean> {
  const now = Date.now();

  if (!force && _apiAvailable === true) return true;
  if (!force && _apiAvailable === false && now - _lastApiCheck < API_CHECK_TTL_MS) return false;

  _lastApiCheck = now;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    _apiAvailable = res.ok && isJsonResponse(res);
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

  return fetchJson(`${API_BASE}/photos?${searchParams}`);
}

export async function fetchFolders(): Promise<Folder[]> {
  if (!(await isApiAvailable())) return mockFolderTree;

  return fetchJson(`${API_BASE}/folders`);
}

export async function fetchStats(): Promise<any> {
  if (!(await isApiAvailable())) return null;

  return fetchJson(`${API_BASE}/stats`);
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

  return fetchJson(`${API_BASE}/map-photos?${searchParams}`);
}

export async function triggerReindex(): Promise<{ message: string }> {
  return fetchJson(`${API_BASE}/reindex?full=true`, { method: 'POST' });
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
  return fetchJson(`${API_BASE}/index-status`);
}

export async function fetchDuplicates(): Promise<{
  groups: { hash: string; photos: Photo[] }[];
  totalGroups: number;
  totalDuplicates: number;
}> {
  if (!(await isApiAvailable())) {
    return { groups: [], totalGroups: 0, totalDuplicates: 0 };
  }
  return fetchJson(`${API_BASE}/duplicates`);
}

export async function deletePhotos(ids: string[]): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/photos/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function fetchTrash(): Promise<{
  items: { id: string; filename: string; originalPath: string; folder: string; type: string; width: number; height: number; thumbnailUrl: string | null; fileSize: number; deletedAt: string; metadata: { dateTaken: string | null; location: string | null; camera: string | null } }[];
  total: number;
}> {
  if (!(await isApiAvailable())) return { items: [], total: 0 };
  return fetchJson(`${API_BASE}/trash`);
}

export async function restoreFromTrash(ids: string[]): Promise<{ restored: number }> {
  return fetchJson(`${API_BASE}/trash/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function emptyTrash(ids?: string[]): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/trash/empty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids || null }),
  });
}

export async function fetchCleanup(): Promise<{
  screenshots: Photo[];
  shortVideos: Photo[];
  largeVideos: Photo[];
  similarGroups: Photo[][];
  summary: {
    screenshotCount: number;
    screenshotSize: number;
    shortVideoCount: number;
    shortVideoSize: number;
    largeVideoCount: number;
    largeVideoSize: number;
    similarGroupCount: number;
    similarPhotoCount: number;
  };
}> {
  if (!(await isApiAvailable())) {
    return {
      screenshots: [], shortVideos: [], largeVideos: [], similarGroups: [],
      summary: { screenshotCount: 0, screenshotSize: 0, shortVideoCount: 0, shortVideoSize: 0, largeVideoCount: 0, largeVideoSize: 0, similarGroupCount: 0, similarPhotoCount: 0 },
    };
  }
  return fetchJson(`${API_BASE}/cleanup`);
}

export { isApiAvailable };
