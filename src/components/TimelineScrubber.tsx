import { useMemo, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Photo } from '@/lib/mock-data';

interface TimelineScrubberProps {
  photos: Photo[];
  onScrollToDate: (label: string) => void;
  activeLabel?: string | null;
}

interface YearGroup {
  year: string;
  months: { month: string; label: string; count: number }[];
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TimelineScrubber({ photos, onScrollToDate, activeLabel }: TimelineScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const yearGroups = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    let minYear = Infinity, maxYear = -Infinity;
    for (const p of photos) {
      const d = p.metadata.dateTaken ? new Date(p.metadata.dateTaken) : null;
      if (!d) continue;
      const year = d.getFullYear();
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
      const ys = year.toString();
      if (!map.has(ys)) map.set(ys, new Map());
      const monthMap = map.get(ys)!;
      const m = d.getMonth();
      monthMap.set(m, (monthMap.get(m) || 0) + 1);
    }
    if (minYear === Infinity) return [];
    const groups: YearGroup[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      const ys = y.toString();
      const monthMap = map.get(ys);
      const months = monthMap
        ? Array.from(monthMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([m, count]) => {
              const date = new Date(y, m, 1);
              const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              return { month: MONTH_NAMES[m], label, count };
            })
        : [];
      groups.push({ year: ys, months });
    }
    return groups;
  }, [photos]);

  const allLabels = useMemo(() => {
    const labels: string[] = [];
    for (const g of yearGroups) {
      for (const m of g.months) labels.push(m.label);
    }
    return labels;
  }, [yearGroups]);

  const getLabelAtY = useCallback((clientY: number) => {
    if (!trackRef.current || allLabels.length === 0) return null;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const idx = Math.round(ratio * (allLabels.length - 1));
    return allLabels[idx];
  }, [allLabels]);

  // Position of the active dot as a percentage
  const activeRatio = useMemo(() => {
    const label = isDragging ? dragLabel : activeLabel;
    if (!label || allLabels.length === 0) return 0;
    const idx = allLabels.indexOf(label);
    if (idx < 0) return 0;
    return idx / (allLabels.length - 1);
  }, [activeLabel, dragLabel, isDragging, allLabels]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const label = getLabelAtY(e.clientY);
    if (label) {
      setDragLabel(label);
      onScrollToDate(label);
    }
  }, [getLabelAtY, onScrollToDate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const label = getLabelAtY(e.clientY);
    if (label && label !== dragLabel) {
      setDragLabel(label);
      onScrollToDate(label);
    }
  }, [isDragging, getLabelAtY, dragLabel, onScrollToDate]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setDragLabel(null);
  }, []);

  if (yearGroups.length === 0) return null;

  const displayLabel = isDragging ? dragLabel : activeLabel;

  return (
    <div
      className={cn(
        "absolute right-0 top-0 bottom-0 z-20 flex",
        "select-none touch-none",
        "w-14 sm:w-16",
      )}
    >
      {/* Year labels column */}
      <div className="flex flex-col items-center justify-between py-3 flex-1">
        {yearGroups.map((g) => {
          const isActive = displayLabel && g.months.some(m => m.label === displayLabel);
          return (
            <button
              key={g.year}
              className={cn(
                "text-[10px] font-bold tabular-nums transition-colors cursor-pointer",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => g.months.length > 0 && onScrollToDate(g.months[0].label)}
            >
              {g.year}
            </button>
          );
        })}
      </div>

      {/* Drag track + dot */}
      <div
        ref={trackRef}
        className="relative w-5 flex items-center justify-center cursor-grab active:cursor-grabbing py-3"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track line */}
        <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 w-[2px] bg-border rounded-full" />

        {/* Active dot */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 transition-all",
            isDragging ? "duration-0" : "duration-200",
          )}
          style={{ top: `calc(12px + ${activeRatio * 100}% * (1 - 24px / 100%))`, top: `calc(12px + ${activeRatio} * (100% - 24px))` }}
        >
          <div className={cn(
            "w-3 h-3 rounded-full bg-primary border-2 border-primary-foreground shadow-md",
            isDragging && "w-4 h-4 shadow-lg shadow-primary/30",
          )} />
        </div>

        {/* Tooltip on drag */}
        {isDragging && displayLabel && (
          <div
            className="absolute right-7 -translate-y-1/2 z-50 pointer-events-none"
            style={{ top: `calc(12px + ${activeRatio} * (100% - 24px))` }}
          >
            <div className="bg-primary text-primary-foreground text-xs font-medium px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap">
              {displayLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
