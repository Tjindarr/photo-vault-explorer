import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Globe, RefreshCw, Loader2, Sparkles, BarChart3, Trash2, Sun, Moon, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSettings, updateSetting, fetchIndexStatus, triggerReindex, triggerQuickReindex, fetchStats } from '@/lib/api-client';
import { toast } from 'sonner';
import CleanupView from './CleanupView';
import StatsDashboard from './StatsDashboard';
import TrashView from './TrashView';
import type { Photo } from '@/lib/mock-data';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'da', label: 'Dansk (Danish)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'fi', label: 'Suomi (Finnish)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
];

interface SettingsViewProps {
  onSelectPhoto?: (photo: Photo) => void;
}

type SettingsTab = 'general' | 'cleanup' | 'stats' | 'trash';

export default function SettingsView({ onSelectPhoto }: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [geocodeLang, setGeocodeLang] = useState('en');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Theme
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('imgvault-theme', next ? 'dark' : 'light');
  };

  // Reindex
  const [indexStatus, setIndexStatus] = useState<{ running: boolean; progress: number; total: number; last_run: string | null }>({
    running: false, progress: 0, total: 0, last_run: null,
  });
  const [reindexing, setReindexing] = useState(false);
  const wasRunningRef = useRef(false);

  const pollIndex = useCallback(async () => {
    try {
      const s = await fetchIndexStatus();
      setIndexStatus(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollIndex();
    const id = setInterval(pollIndex, 3000);
    return () => clearInterval(id);
  }, [pollIndex]);

  useEffect(() => {
    if (wasRunningRef.current && !indexStatus.running) {
      setReindexing(false);
    }
    wasRunningRef.current = indexStatus.running;
  }, [indexStatus.running]);

  const handleReindex = async () => {
    if (indexStatus.running || reindexing) return;
    setReindexing(true);
    try {
      await triggerReindex();
      await pollIndex();
      toast.success('Full reindexing started');
    } catch {
      toast.error('Failed to start reindex');
      setReindexing(false);
    }
  };

  const handleQuickReindex = async () => {
    if (indexStatus.running || reindexing) return;
    setReindexing(true);
    try {
      await triggerQuickReindex();
      await pollIndex();
      toast.success('Quick reindexing started — only new photos will be scanned');
    } catch {
      toast.error('Failed to start quick reindex');
      setReindexing(false);
    }
  };

  // Load settings
  useEffect(() => {
    fetchSettings()
      .then(s => {
        if (s.geocode_language) setGeocodeLang(s.geocode_language);
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  // Load stats
  useEffect(() => {
    if (tab === 'stats' && !stats) {
      fetchStats().then(setStats).catch(console.error);
    }
  }, [tab, stats]);

  const handleLangChange = async (lang: string) => {
    setGeocodeLang(lang);
    setSaving(true);
    try {
      await updateSetting('geocode_language', lang);
      toast.success('Location language updated. Run a full reindex to apply to existing photos.');
    } catch {
      toast.error('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: SettingsTab; icon: typeof Settings; label: string }[] = [
    { id: 'general', icon: Settings, label: 'General' },
    { id: 'cleanup', icon: Sparkles, label: 'Cleanup' },
    { id: 'stats', icon: BarChart3, label: 'Stats' },
    { id: 'trash', icon: Trash2, label: 'Trash' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-1 pt-3 pb-3 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
              tab === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pt-4">
        {tab === 'general' && (
          <div className="max-w-lg space-y-6">
            {/* Appearance */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  {dark ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm text-foreground">Dark mode</span>
                </div>
                <button
                  onClick={toggleTheme}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    dark ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                    dark ? 'translate-x-6' : 'translate-x-1',
                  )} />
                </button>
              </div>
            </section>

            {/* Location language */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Location Language</h2>
              <p className="text-xs text-muted-foreground">
                Choose the language for reverse-geocoded location names (country, city, street).
                After changing, run a full reindex to update existing photos.
              </p>
              {loadingSettings ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    value={geocodeLang}
                    onChange={e => handleLangChange(e.target.value)}
                    disabled={saving}
                    className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            {/* Reindex */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Indexing</h2>
              <div className="rounded-lg border border-border bg-surface p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Full Reindex</p>
                    <p className="text-xs text-muted-foreground">
                      Rescan all files, regenerate thumbnails, and update location data.
                    </p>
                  </div>
                  <button
                    onClick={handleReindex}
                    disabled={indexStatus.running || reindexing}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors',
                      indexStatus.running || reindexing
                        ? 'cursor-not-allowed bg-muted text-muted-foreground'
                        : 'bg-surface text-foreground hover:bg-secondary',
                    )}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', (indexStatus.running || reindexing) && 'animate-spin')} />
                    {indexStatus.running ? 'Indexing…' : 'Reindex'}
                  </button>
                </div>
                {indexStatus.running && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {indexStatus.progress.toLocaleString()} files processed
                    </p>
                  </div>
                )}
                {indexStatus.last_run && !indexStatus.running && (
                  <p className="text-xs text-muted-foreground">
                    Last run: {new Date(indexStatus.last_run).toLocaleString()}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'cleanup' && (
          <div className="h-full -mx-3 sm:-mx-5">
            <CleanupView onSelect={onSelectPhoto} />
          </div>
        )}

        {tab === 'stats' && (
          <StatsDashboard stats={stats} />
        )}

        {tab === 'trash' && (
          <div className="h-full -mx-3 sm:-mx-5">
            <TrashView />
          </div>
        )}
      </div>
    </div>
  );
}
