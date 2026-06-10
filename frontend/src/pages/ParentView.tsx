import { useNavigate } from 'react-router-dom';
import { useStoryStore } from '@/store/storyStore';
import { useDashboard, useStoryHistory } from '@/hooks/useDashboard';
import { ParentDashboard } from '@/components/dashboard/ParentDashboard';
import { StoryHistory } from '@/components/dashboard/StoryHistory';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function ParentView() {
  const navigate = useNavigate();
  const activeProfile = useStoryStore((s) => s.activeProfile);

  const dashboard = useDashboard(activeProfile?.id);
  const history = useStoryHistory(activeProfile?.id);

  return (
    <div className="relative min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <div>
          <h1 className="font-display text-3xl text-parchment">Parent corner</h1>
          {activeProfile && (
            <p className="text-parchment/70">
              Insights for {activeProfile.name}, age {activeProfile.age}
            </p>
          )}
        </div>
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Back to play
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-8">
        {!activeProfile ? (
          <Card className="text-center">
            <p className="text-parchment">
              Choose a child profile on the home screen to see their insights.
            </p>
            <Button variant="magic" className="mt-4" onClick={() => navigate('/')}>
              Go home
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            <ParentDashboard
              data={dashboard.data}
              loading={dashboard.isLoading}
              error={dashboard.isError}
            />
            <StoryHistory
              stories={history.data}
              loading={history.isLoading}
              error={history.isError}
            />
          </div>
        )}
      </main>
    </div>
  );
}
