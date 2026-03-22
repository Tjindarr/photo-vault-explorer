// Mock data simulating what the backend API would return
// In production, these come from GET /api/photos, /api/folders, /api/search

export interface Photo {
  id: string;
  filename: string;
  path: string;
  folder: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  thumbnailUrl: string;
  fullUrl: string;
  fileSize: number;
  duration?: number;
  metadata: {
    dateTaken?: string;
    location?: string;
    camera?: string;
    lens?: string;
    iso?: number;
    aperture?: string;
    shutterSpeed?: string;
    gpsLat?: number;
    gpsLng?: number;
  };
  createdAt: string;
}

export interface Folder {
  path: string;
  name: string;
  photoCount: number;
  children: Folder[];
}

const locations = ['Barcelona, Spain', 'Tokyo, Japan', 'Portland, Oregon', 'Lake Tahoe, CA', 'Reykjavik, Iceland', 'Banff, Canada', 'Amalfi Coast, Italy', 'Queenstown, NZ'];
const cameras = ['Sony A7IV', 'Canon R5', 'Fuji X-T5', 'Nikon Z6 III', 'iPhone 15 Pro', 'Pixel 8 Pro', 'DJI Mavic 3'];
const locationCoords: Record<string, [number, number]> = {
  'Barcelona, Spain': [41.3874, 2.1686],
  'Tokyo, Japan': [35.6762, 139.6503],
  'Portland, Oregon': [45.5152, -122.6784],
  'Lake Tahoe, CA': [39.0968, -120.0324],
  'Reykjavik, Iceland': [64.1466, -21.9426],
  'Banff, Canada': [51.1784, -115.5708],
  'Amalfi Coast, Italy': [40.6340, 14.6027],
  'Queenstown, NZ': [-45.0312, 168.6626],
};

const folders = ['2024/Summer Trip', '2024/Family', '2023/Holiday', '2023/Nature', '2022/Wedding', '2022/Landscapes', '2024/Drone Shots', '2023/Portraits'];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const mockPhotos: Photo[] = Array.from({ length: 2000 }, (_, i) => {
  const r = seededRandom(i + 1);
  const r2 = seededRandom(i + 100);
  const r3 = seededRandom(i + 200);
  const isVideo = r > 0.85;
  const folder = folders[Math.floor(r2 * folders.length)];
  const w = [3, 4, 16, 1][Math.floor(r3 * 4)];
  const h = [2, 3, 9, 1][Math.floor(r3 * 4)];
  const year = folder.split('/')[0];
  const month = String(Math.floor(r * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(r2 * 28) + 1).padStart(2, '0');

  return {
    id: `photo-${i}`,
    filename: isVideo ? `VID_${year}${month}${day}_${i}.mp4` : `IMG_${year}${month}${day}_${i}.jpg`,
    path: `/${folder}/${isVideo ? 'VID' : 'IMG'}_${year}${month}${day}_${i}.${isVideo ? 'mp4' : 'jpg'}`,
    folder,
    type: isVideo ? 'video' : 'image',
    width: w * 400,
    height: h * 400,
    thumbnailUrl: `https://picsum.photos/seed/${i + 10}/${w * 100}/${h * 100}`,
    fullUrl: `https://picsum.photos/seed/${i + 10}/${w * 400}/${h * 400}`,
    fileSize: Math.floor(r * 15000000) + 500000,
    duration: isVideo ? Math.max(1, Math.floor(seededRandom(i + 300) * 180)) : undefined,
    metadata: {
      dateTaken: `${year}-${month}-${day}T${String(Math.floor(r * 24)).padStart(2, '0')}:${String(Math.floor(r2 * 60)).padStart(2, '0')}:00`,
      location: locations[Math.floor(r3 * locations.length)],
      camera: cameras[Math.floor(r * cameras.length)],
      iso: [100, 200, 400, 800, 1600, 3200][Math.floor(r2 * 6)],
      aperture: ['f/1.4', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0'][Math.floor(r3 * 6)],
      shutterSpeed: ['1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60'][Math.floor(r * 6)],
      gpsLat: locationCoords[locations[Math.floor(r3 * locations.length)]]?.[0],
      gpsLng: locationCoords[locations[Math.floor(r3 * locations.length)]]?.[1],
    },
    createdAt: `${year}-${month}-${day}`,
  };
});

export const mockFolderTree: Folder[] = [
  {
    path: '2024',
    name: '2024',
    photoCount: 52,
    children: [
      { path: '2024/Summer Trip', name: 'Summer Trip', photoCount: 24, children: [] },
      { path: '2024/Family', name: 'Family', photoCount: 18, children: [] },
      { path: '2024/Drone Shots', name: 'Drone Shots', photoCount: 10, children: [] },
    ],
  },
  {
    path: '2023',
    name: '2023',
    photoCount: 40,
    children: [
      { path: '2023/Holiday', name: 'Holiday', photoCount: 15, children: [] },
      { path: '2023/Nature', name: 'Nature', photoCount: 14, children: [] },
      { path: '2023/Portraits', name: 'Portraits', photoCount: 11, children: [] },
    ],
  },
  {
    path: '2022',
    name: '2022',
    photoCount: 28,
    children: [
      { path: '2022/Wedding', name: 'Wedding', photoCount: 16, children: [] },
      { path: '2022/Landscapes', name: 'Landscapes', photoCount: 12, children: [] },
    ],
  },
];
