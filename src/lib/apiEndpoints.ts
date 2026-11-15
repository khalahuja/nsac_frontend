/** One API origin for chat, science, and mission planning. */
export const API = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
