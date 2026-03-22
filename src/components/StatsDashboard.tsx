import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { MapPin, Camera, Calendar, Film, Image, Globe, Building2 } from 'lucide-react';

interface StatsData {
  total: number;
  images: number;
  videos: number;
  totalSize: number;
  locations: number;
  byCamera: { name: string; count: number }[];
  byLocation: { name: string; count: number }[];
  byYear: { name: string; count: number }[];
  byCountry?: { name: string; count: number }[];
  byCity?: { name: string; count: number }[];
}

interface StatsDashboardProps {
  stats: StatsData | null;
}

const COLORS = [
  'hsl(220, 65%, 46%)',
  'hsl(36, 90%, 54%)',
  'hsl(160, 60%, 40%)',
  'hsl(340, 65%, 50%)',
  'hsl(270, 50%, 55%)',
  'hsl(190, 70%, 42%)',
  'hsl(30, 80%, 50%)',
  'hsl(100, 50%, 42%)',
];

function StatCard({ icon: Icon, label, value }: { icon: typeof Camera; label: string; value: string | number }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div>
        <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-1.5 shadow-lg text-xs">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground tabular-nums">{payload[0].value} photos</p>
    </div>
  );
};

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StatsDashboard({ stats }: StatsDashboardProps) {
  const [locationView, setLocationView] = useState<'country' | 'city' | 'location'>('country');

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center fade-in">
          <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading stats...</p>
        </div>
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Calendar className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium mb-1">No data to show</p>
        <p className="text-sm text-muted-foreground">Index some photos first.</p>
      </div>
    );
  }

  const byType = [
    { name: 'Photo', count: stats.images },
    { name: 'Video', count: stats.videos },
  ].filter(t => t.count > 0);

  const locationData = locationView === 'country'
    ? (stats.byCountry || [])
    : locationView === 'city'
    ? (stats.byCity || [])
    : stats.byLocation;

  const locationTitle = locationView === 'country'
    ? 'Photos by Country'
    : locationView === 'city'
    ? 'Photos by City'
    : 'Photos by Location';

  return (
    <div className="space-y-5 fade-in-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Image} label="Total photos" value={stats.images} />
        <StatCard icon={Film} label="Total videos" value={stats.videos} />
        <StatCard icon={MapPin} label="Locations" value={stats.locations} />
        <StatCard icon={Camera} label="Total size" value={formatSize(stats.totalSize)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Photos by Year">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byYear} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={locationTitle}>
          <div className="flex gap-1 mb-3">
            {(['country', 'city', 'location'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setLocationView(view)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  locationView === view
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {view === 'country' ? 'Country' : view === 'city' ? 'City' : 'Location'}
              </button>
            ))}
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locationData.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Bar dataKey="count" fill="hsl(36, 90%, 54%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Photos by Camera">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byCamera.slice(0, 8)}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="name"
                  stroke="none"
                >
                  {stats.byCamera.slice(0, 8).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} photos`, name]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(value) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="File Types">
          <div className="h-52 flex items-center justify-center">
            <div className="flex gap-8">
              {byType.map((item, i) => {
                const pct = Math.round((item.count / stats.total) * 100);
                return (
                  <div key={item.name} className="text-center">
                    <div className="relative w-24 h-24 mx-auto mb-2">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="14" fill="none"
                          stroke={COLORS[i]}
                          strokeWidth="3"
                          strokeDasharray={`${pct * 0.88} 88`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-semibold text-foreground tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{item.count} files</p>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
