import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AuthGate from './components/AuthGate';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
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

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
