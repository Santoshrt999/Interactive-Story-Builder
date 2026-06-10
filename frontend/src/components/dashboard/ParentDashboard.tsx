import { motion } from 'framer-motion';
import type { DashboardData, DashboardThemes } from '@/api/types';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

interface ParentDashboardProps {
  data: DashboardData | undefined;
  loading: boolean;
  error: boolean;
}

const THEME_META: Record<keyof DashboardThemes, { label: string; color: string }> = {
  joy: { label: 'Joy', color: '#ff8ad8' },
  courage: { label: 'Courage', color: '#ffd166' },
  friendship: { label: 'Friendship', color: '#5be0a0' },
  mystery: { label: 'Mystery', color: '#7c6cff' },
};

function StatTile({ value, label, emoji }: { value: string; label: string; emoji: string }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-2xl">{emoji}</span>
      <span className="font-display text-3xl text-firefly">{value}</span>
      <span className="text-sm text-parchment/70">{label}</span>
    </Card>
  );
}

function ThemeBars({ themes }: { themes: DashboardThemes }) {
  const entries = (Object.keys(THEME_META) as Array<keyof DashboardThemes>).map((k) => ({
    key: k,
    value: themes[k] ?? 0,
    ...THEME_META[k],
  }));
  const max = Math.max(1, ...entries.map((e) => e.value));

  return (
    <Card>
      <CardTitle>Story themes explored</CardTitle>
      <div className="mt-4 flex flex-col gap-3">
        {entries.map((e, i) => (
          <div key={e.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-parchment/80">{e.label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: e.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(e.value / max) * 100}%` }}
                transition={{ delay: i * 0.08, duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="w-8 text-right text-sm tabular-nums text-parchment/70">
              {e.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatReadingTime(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function ParentDashboard({ data, loading, error }: ParentDashboardProps) {
  if (loading) return <Spinner label="Gathering insights…" className="py-16" />;
  if (error || !data)
    return (
      <Card>
        <p className="text-parchment/80">
          We couldn&apos;t load the dashboard right now. Please try again later.
        </p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile emoji="📚" value={String(data.stories_count)} label="Stories created" />
        <StatTile
          emoji="⏱️"
          value={formatReadingTime(data.total_reading_seconds)}
          label="Reading time"
        />
        <StatTile emoji="🔤" value={String(data.vocabulary.length)} label="New words" />
        <StatTile
          emoji="🎨"
          value={`${Math.round(data.creativity_score)}`}
          label="Creativity score"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ThemeBars themes={data.themes} />

        <Card>
          <CardTitle>Vocabulary garden</CardTitle>
          {data.vocabulary.length === 0 ? (
            <p className="mt-3 text-parchment/70">New words will sprout here.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {data.vocabulary.slice(0, 8).map((v) => (
                <li key={v.word} className="rounded-2xl bg-white/5 p-3">
                  <span className="font-display text-firefly">{v.word}</span>
                  <span className="text-parchment/70"> — {v.definition}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Recent curious thoughts 💭</CardTitle>
        {data.recent_curiosity_answers.length === 0 ? (
          <p className="mt-3 text-parchment/70">No reflections captured yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.recent_curiosity_answers.slice(0, 6).map((quote, i) => (
              <blockquote
                key={i}
                className="rounded-2xl border-l-4 border-blossom bg-white/5 p-4 italic text-parchment/90"
              >
                “{quote}”
              </blockquote>
            ))}
          </div>
        )}
      </Card>

      {data.titles.length > 0 && (
        <Card>
          <CardTitle>Story titles</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.titles.map((t, i) => (
              <span
                key={`${i}-${t}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
