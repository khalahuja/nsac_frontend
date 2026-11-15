import type { PageId } from './navigation';

const destinations: Record<string, PageId> = {
  'mission operations': 'operations', 'operations': 'operations', 'best landing dates': 'operations', 'nearby alternatives': 'operations', 'mission requirements': 'operations', 'combined operations timeline': 'operations',
  'agent swarm': 'swarm', 'mission planner': 'swarm', 'mission plan': 'swarm',
  'trajectories': 'trajectories', 'trajectory explorer': 'trajectories',
  'surface shadows': 'surface', 'surface safety': 'surface', 'surface': 'surface',
  'mission lab': 'mission-lab', 'compare sites': 'compare', 'site comparison': 'compare',
  'forecast': 'forecast', 'temperature forecast': 'forecast',
  'science windows': 'windows', 'windows': 'windows',
  'earth visibility plot': 'horizon', 'earth visibility': 'horizon', 'dte sky plot': 'horizon',
  'horizon': 'horizon', 'local sky': 'horizon',
  'moon atlas': 'selene', 'moon map': 'selene', 'atlas': 'selene',
  'landing probability': 'landing', 'landing': 'landing',
  'lunar orbit': 'orbit', 'orbit': 'orbit', 'orbit and timeline': 'orbit',
  'candidate finder': 'sites', 'candidate sites': 'sites', 'water evidence': 'water',
  'solar power': 'solar', 'solar': 'solar', 'battery': 'battery',
  'radio link': 'link', 'link budget': 'link', 'surface contact': 'los',
  'temperature': 'temperature', 'sky envelope': 'sky', 'constants': 'constants',
  'models and sources': 'models', 'models': 'models', 'clps explorer': 'clps', 'clps': 'clps',
};

/** Only an explicit page request can run locally; never discard extra conditions. */
export function localChatNavigation(message: string, currentPage?: PageId): { page: PageId; compare_focus?: 'earth_visibility' } | null {
  const text = message.toLowerCase().replace(/[-\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim();
  if (currentPage === 'compare' && /^compare their earth (?:visibility|contact)[.!?]?$/.test(text)) {
    return { page: 'compare', compare_focus: 'earth_visibility' };
  }
  const match = /^(?:please )?(?:open|show|go to|take me to|navigate to) (?:the )?(.+?)(?: page| tool| calculator)?[.!?]?$/.exec(text);
  const page = match && destinations[match[1]];
  return page ? { page } : null;
}

export function retryDelay(status: number, headers: Pick<Headers, 'get'>): number | null {
  if (status !== 429 && !(status === 503 && headers.get('X-Selene-Error') === 'upstream_rate_limit')) return null;
  const raw = headers.get('Retry-After');
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.min(86400, Math.max(1, Math.ceil(value))) : 60;
}

export function retryLabel(seconds: number): string {
  if (seconds < 60) return `Retry in ${seconds}s`;
  if (seconds < 3600) return `Retry in ${Math.ceil(seconds / 60)}m`;
  return `Retry in ${Math.ceil(seconds / 3600)}h`;
}

/** Retrying a failed request reuses its user turn instead of duplicating it. */
export function historyForSend<T extends { role: string; content: string }>(turns: readonly T[], turn: T, retry: boolean): T[] {
  const latest = turns[turns.length - 1];
  return retry && latest?.role === 'user' && latest.content === turn.content ? [...turns] : [...turns, turn];
}
