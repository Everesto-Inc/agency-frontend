/** Runtime settings: /config.js (written by the container from API_URL) → same image in dev and prod. */
declare global {
  interface Window { __AGENCY_CONFIG__?: { apiUrl?: string } }
}

export const apiUrl = (window.__AGENCY_CONFIG__?.apiUrl || 'http://localhost:8000').replace(/\/+$/, '');
