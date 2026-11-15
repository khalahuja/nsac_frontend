/** Only the bounded result summary is sent back; no tables or error text. */
export type SearchOutcome = {
  kind: 'windows' | 'mission' | 'ranking' | 'summary' | 'error';
  match_count?: number;
};

type SearchPreview =
  | { status: 'loading' | 'error' | 'summary' }
  | { status: 'windows'; windows: readonly unknown[] }
  | { status: 'mission'; candidates: readonly unknown[] }
  | { status: 'ranking'; sites: readonly unknown[] };

export function summarizeSearch(preview?: SearchPreview): SearchOutcome | null {
  if (!preview || preview.status === 'loading') return null;
  if (preview.status === 'windows') return { kind: 'windows', match_count: preview.windows.length };
  if (preview.status === 'mission') return { kind: 'mission', match_count: preview.candidates.length };
  if (preview.status === 'ranking') return { kind: 'ranking', match_count: preview.sites.length };
  return { kind: preview.status };
}

export function followupOptions(options: readonly string[] | undefined, preview?: SearchPreview): string[] {
  if (preview?.status === 'loading' || preview?.status === 'error') return [];
  if (summarizeSearch(preview)?.match_count === 0) {
    return [
      'Explain which constraints could exclude all matches',
      'Which constraint should I reconsider?',
      'Compare another landing site',
    ];
  }
  const seen = new Set<string>();
  return (options ?? []).filter(option => {
    const key = option.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || option.length > 60 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}
