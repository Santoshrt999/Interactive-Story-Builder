import { useLayoutEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MusicProvider } from '@/hooks/useMusic';
import { useSettingsStore } from '@/store/settingsStore';
import { Home } from '@/pages/Home';
import { Setup } from '@/pages/Setup';
import { Story } from '@/pages/Story';
import { ParentView } from '@/pages/ParentView';

export function App() {
  // Bedtime dims and warms the whole app through html[data-mode] (see index.css).
  // Layout effect: no flash of the daytime look when a bedtime page loads.
  const bedtime = useSettingsStore((s) => s.bedtime);
  useLayoutEffect(() => {
    document.documentElement.dataset.mode = bedtime ? 'bedtime' : 'day';
  }, [bedtime]);

  return (
    <ErrorBoundary>
      <MusicProvider>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/story" element={<Story />} />
            <Route path="/parent" element={<ParentView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </MusicProvider>
    </ErrorBoundary>
  );
}
