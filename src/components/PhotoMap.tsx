import { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Photo } from '@/lib/mock-data';
import { fetchMapClusters, fetchMapCountries, fetchMapCities, type MapCluster } from '@/lib/api-client';
import { Filter, X, Loader2 } from 'lucide-react';

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

function FitBounds({ points, hasFilters }: { points: { lat: number; lng: number }[]; hasFilters: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    if (bounds.isValid()) {
      if (hasFilters || points.length <= 50) {
        map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 14, duration: 0.8 });
      }
    }
  }, [points, hasFilters, map]);
  return null;
}

export default function PhotoMap({ photos, onSelect }: PhotoMapProps) {
  const [countryFilter, setCountryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [countries, setCountries] = useState<{ name: string; count: number }[]>([]);
  const [cities, setCities] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [useClusterMode, setUseClusterMode] = useState(true);

  // Load clusters from backend
  useEffect(() => {
    setLoading(true);
    fetchMapClusters({ country: countryFilter || undefined, city: cityFilter || undefined })
      .then((data) => {
        setClusters(data.clusters);
        setUseClusterMode(true);
      })
      .catch(() => {
        // Fallback: use individual photos
        setUseClusterMode(false);
      })
      .finally(() => setLoading(false));
  }, [countryFilter, cityFilter]);

  // Load countries on mount
  useEffect(() => {
    fetchMapCountries().then(setCountries).catch(() => {});
  }, []);

  // Load cities when country changes
  useEffect(() => {
    fetchMapCities(countryFilter || undefined).then(setCities).catch(() => {});
  }, [countryFilter]);

  // Fallback: filter photos client-side
  const geoPhotos = useMemo(
    () => photos.filter((p) => p.metadata.gpsLat != null && p.metadata.gpsLng != null),
    [photos]
  );

  const filteredPhotos = useMemo(() => {
    if (useClusterMode) return [];
    return geoPhotos.filter((p) => {
      const meta = p.metadata as any;
      if (countryFilter && meta.country !== countryFilter) return false;
      if (cityFilter && meta.city !== cityFilter) return false;
      return true;
    });
  }, [geoPhotos, countryFilter, cityFilter, useClusterMode]);

  const hasFilters = !!(countryFilter || cityFilter);
  const totalPhotos = useClusterMode
    ? clusters.reduce((sum, c) => sum + c.count, 0)
    : filteredPhotos.length;

  const mapPoints = useClusterMode
    ? clusters.map((c) => ({ lat: c.lat, lng: c.lng }))
    : filteredPhotos.map((p) => ({ lat: p.metadata.gpsLat!, lng: p.metadata.gpsLng! }));

  if (geoPhotos.length === 0 && clusters.length === 0 && !loading) {
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

  // Scale circle radius based on photo count
  const maxCount = Math.max(1, ...clusters.map((c) => c.count));

  return (
    <div className="h-full flex flex-col fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-1 py-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          ) : null}
          {totalPhotos} photos across {clusters.length} locations
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {hasFilters && (
            <button
              onClick={() => { setCountryFilter(''); setCityFilter(''); }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              showFilters ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Filter className="h-3 w-3" /> Filter
          </button>
        </div>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex items-center gap-2 px-1 pb-2 flex-wrap">
          <select
            value={countryFilter}
            onChange={(e) => { setCountryFilter(e.target.value); setCityFilter(''); }}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1.5 text-foreground min-w-[140px]"
          >
            <option value="">All countries ({countries.length})</option>
            {countries.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1.5 text-foreground min-w-[140px]"
          >
            <option value="">All cities ({cities.length})</option>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 rounded-lg overflow-hidden border border-border relative">
        <MapContainer
          center={[30, 10]}
          zoom={2}
          className="h-full w-full"
          style={{ background: 'hsl(var(--muted))' }}
          scrollWheelZoom={true}
          zoomControl={false}
        >
          <FitBounds points={mapPoints} hasFilters={hasFilters} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {useClusterMode ? (
            /* Server-side clusters: render as sized circle markers */
            <>
              {clusters.map((cluster) => {
                const radius = Math.max(8, Math.min(30, 8 + (cluster.count / maxCount) * 22));
                return (
                  <CircleMarker
                    key={cluster.id}
                    center={[cluster.lat, cluster.lng]}
                    radius={radius}
                    pathOptions={{
                      fillColor: 'hsl(220, 65%, 46%)',
                      fillOpacity: 0.7,
                      color: 'hsl(220, 65%, 36%)',
                      weight: 1.5,
                    }}
                  >
                    <Popup maxWidth={260} minWidth={180}>
                      <div className="font-sans">
                        <p className="font-semibold text-sm" style={{ margin: '0 0 4px 0' }}>
                          {cluster.label}
                        </p>
                        <p className="text-xs text-muted-foreground" style={{ margin: '0 0 6px 0' }}>
                          {cluster.count} photos
                          {cluster.country && cluster.city && ` · ${cluster.city}, ${cluster.country}`}
                        </p>
                        {cluster.thumbnailUrl && (
                          <img
                            src={cluster.thumbnailUrl}
                            alt={cluster.label}
                            className="w-full aspect-video object-cover rounded"
                          />
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </>
          ) : (
            /* Fallback: individual markers with client-side clustering */
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={60}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
            >
              {filteredPhotos.map((photo) => (
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
          )}
        </MapContainer>
      </div>
    </div>
  );
}
