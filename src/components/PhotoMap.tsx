import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Photo } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

// Fix default marker icons for Leaflet + bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface PhotoMapProps {
  photos: Photo[];
  onSelect: (photo: Photo) => void;
}

interface ClusterGroup {
  lat: number;
  lng: number;
  location: string;
  photos: Photo[];
}

export default function PhotoMap({ photos, onSelect }: PhotoMapProps) {
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

  // Group photos by location
  const clusters = useMemo(() => {
    const map = new Map<string, ClusterGroup>();
    for (const photo of photos) {
      const { gpsLat, gpsLng, location } = photo.metadata;
      if (gpsLat == null || gpsLng == null || !location) continue;
      if (!map.has(location)) {
        map.set(location, { lat: gpsLat, lng: gpsLng, location, photos: [] });
      }
      map.get(location)!.photos.push(photo);
    }
    return Array.from(map.values());
  }, [photos]);

  const geoPhotos = clusters.reduce((n, c) => n + c.photos.length, 0);

  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <svg className="h-7 w-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
        <p className="text-foreground font-medium mb-1">No geotagged photos</p>
        <p className="text-sm text-muted-foreground">Photos with GPS data will appear on the map.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col fade-in">
      <div className="flex items-center gap-2 px-1 py-2">
        <span className="text-xs text-muted-foreground">
          {geoPhotos} geotagged photos across {clusters.length} locations
        </span>
      </div>
      <div className="flex-1 rounded-lg overflow-hidden border border-border relative">
        <MapContainer
          center={[30, 10]}
          zoom={2}
          className="h-full w-full"
          style={{ background: 'hsl(var(--muted))' }}
          scrollWheelZoom={true}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {clusters.map((cluster) => (
            <Marker key={cluster.location} position={[cluster.lat, cluster.lng]}>
              <Popup maxWidth={280} minWidth={200}>
                <div className="font-sans">
                  <p className="font-semibold text-sm mb-1" style={{ margin: 0 }}>{cluster.location}</p>
                  <p className="text-xs text-gray-500 mb-2" style={{ margin: '0 0 8px 0' }}>{cluster.photos.length} photos</p>
                  <div className="grid grid-cols-3 gap-1">
                    {cluster.photos.slice(0, 6).map((photo) => (
                      <button
                        key={photo.id}
                        onClick={() => onSelect(photo)}
                        className="block overflow-hidden rounded active:scale-95 transition-transform"
                      >
                        <img
                          src={photo.thumbnailUrl}
                          alt={photo.filename}
                          className="w-full aspect-square object-cover hover:brightness-110 transition-all"
                        />
                      </button>
                    ))}
                  </div>
                  {cluster.photos.length > 6 && (
                    <p className="text-xs text-gray-400 mt-1 text-center" style={{ margin: '6px 0 0 0' }}>
                      +{cluster.photos.length - 6} more
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
