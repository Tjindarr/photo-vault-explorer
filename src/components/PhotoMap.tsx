import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Photo } from '@/lib/mock-data';

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

export default function PhotoMap({ photos, onSelect }: PhotoMapProps) {
  const geoPhotos = useMemo(
    () => photos.filter((p) => p.metadata.gpsLat != null && p.metadata.gpsLng != null),
    [photos]
  );

  if (geoPhotos.length === 0) {
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
          {geoPhotos.length} geotagged photos
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
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {geoPhotos.map((photo) => (
              <Marker
                key={photo.id}
                position={[photo.metadata.gpsLat!, photo.metadata.gpsLng!]}
              >
                <Popup maxWidth={260} minWidth={180}>
                  <div className="font-sans">
                    {photo.metadata.location && (
                      <p className="font-semibold text-sm" style={{ margin: '0 0 4px 0' }}>
                        {photo.metadata.location}
                      </p>
                    )}
                    <button
                      onClick={() => onSelect(photo)}
                      className="block overflow-hidden rounded active:scale-95 transition-transform"
                    >
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.filename}
                        className="w-full aspect-video object-cover hover:brightness-110 transition-all rounded"
                      />
                    </button>
                    <p className="text-xs text-muted-foreground" style={{ margin: '4px 0 0 0' }}>
                      {photo.filename}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  );
}
