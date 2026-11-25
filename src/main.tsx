import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError } from '@/api/errors';
import { AuthProvider } from '@/auth/AuthContext';
import { App } from './App';
import './index.css';

// theme before the first paint: saved choice, else the system's
try {
  const saved = localStorage.getItem('agency.theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
} catch { /* ignore */ }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // never retry client errors (401/403/404/422) — only network / 5xx, twice
      retry: (count, e) => count < 2 && !(e instanceof ApiError && e.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
