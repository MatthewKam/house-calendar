import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AuthGate from './components/AuthGate';
import './styles/app.css';
import { guardTouch } from './lib/touchGuard';

const queryClient = new QueryClient({
  // Edits show straight away and save in the background; if a save fails, the screen goes back and
  // the app says so (App.tsx shows the message).
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      // Signed out shows the PIN screen; some edits show their own error (e.g. a wrong PIN in a dialog).
      if (/Sign in/.test(err.message) || mutation.meta?.inline) return;
      // Refused because this device is locked (it timed out, say): show it as locked again.
      if (/^Locked/.test(err.message)) void queryClient.invalidateQueries({ queryKey: ['auth'] });
      window.dispatchEvent(new CustomEvent('household:save-failed', { detail: err.message }));
    },
  }),
  // Refresh when the app comes back into view: a phone pauses it (and its refresh timers) in the
  // background, so without this it would show what it had before (e.g. stars ticked meanwhile).
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true } },
});

// In landscape, iOS gives the same notch room to both sides of the screen; mark which side the notch
// is really on (by which way the phone is turned), so the other side can use its space.
function markNotch() {
  // 90: turned left, so the notch (at the top of the phone) is on the left. Older iPhones say -90 for 270.
  const angle = screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0);
  const side = angle === 90 ? 'left' : angle === 270 || angle === -90 ? 'right' : '';
  if (side) document.documentElement.dataset.notch = side;
  else delete document.documentElement.dataset.notch;
}
markNotch();
screen.orientation?.addEventListener('change', markNotch);
window.addEventListener('resize', markNotch);

// Lets the installed app open offline and start fast. Only in the built app: in development it
// would keep serving old files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Buttons press reliably on touch screens (no stray text selection or long-press menus).
guardTouch();

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
