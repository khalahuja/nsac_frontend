/**
 * Questions a scientist would actually ask next.
 *
 * Starters depend on the page, site and period on screen. Follow-ups after a
 * computed result are derived from that result (its best site, longest window,
 * first landing date…), each taking the analysis one step further: tighten,
 * vary a parameter, verify, compare, or move to the next mission phase.
 * Every phrasing is one the assistant can turn into a real calculation.
 */

export type StarterContext = {
  page: string;
  siteName: string;
  latitude: number;
  longitude: number;
  start: string;
  end: string;
};

export type Starter = { title: string; text: string; kind: 'site' | 'windows' | 'mission' | 'compare' | 'method' };

const month = (iso: string) => new Date(iso).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const coords = (lat: number, lon: number) => `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

function siteLabel(c: StarterContext) {
  return /^location\b|^target\b|^assistant/i.test(c.siteName) ? `${coords(c.latitude, c.longitude)}` : c.siteName;
}

export function starterQuestions(c: StarterContext): Starter[] {
  const site = siteLabel(c);
  const period = `${day(c.start)} to ${day(c.end)}`;
  const m = month(c.start);
  const common: Starter[] = [
    { kind: 'site', title: 'Characterise this site', text: `Is Earth ever above the horizon at ${site}, and what fraction of the time is the Sun up?` },
    { kind: 'windows', title: 'Find observing windows', text: `Find windows of at least 24 h at ${site} from ${period} with the Sun up and Earth at least 2° above the horizon` },
    { kind: 'mission', title: 'Plan a landing', text: `Plan a mission landing at ${site} in ${m} with at least 8 days of continuous sunlight and Earth contact at touchdown` },
    { kind: 'compare', title: 'Rank south-pole sites', text: 'Rank south-pole landing sites for slope safety and access to craters with detected surface ice' },
    { kind: 'method', title: 'Check the method', text: 'Which data sets and models produce the Sun, Earth and temperature values, and what are their uncertainties?' },
  ];
  const byPage: Record<string, Starter[]> = {
    swarm: [
      { kind: 'mission', title: 'Launch and landing dates', text: `Find launch and landing dates at ${site} between ${period} with at least 8 days of continuous sunlight` },
      { kind: 'mission', title: 'Let the planner choose', text: `Let the mission planner choose the best south-pole site and landing date in ${m}` },
      { kind: 'method', title: 'Where the margins are', text: 'Which mission step has the smallest margin in the current plan, and what input would improve it?' },
    ],
    'mission-plan': [],
    compare: [
      { kind: 'compare', title: 'Compare the best-lit points', text: 'Compare Connecting Ridge C1, Shackleton rim S0 and Malapert summit area' },
      { kind: 'compare', title: 'Sunlight vs Earth contact', text: `Which compared site has the longest continuous Earth contact from ${period}?` },
    ],
    windows: [
      { kind: 'windows', title: 'Thermal window', text: `Find windows at ${site} from ${period} with surface temperature between -150 and -50 °C for at least 12 h` },
      { kind: 'windows', title: 'Power-positive window', text: `Find windows at ${site} from ${period} with at least 100 W/m² of sunlight for 48 h` },
    ],
    forecast: [
      { kind: 'site', title: 'Longest night', text: `What is the longest continuous darkness at ${site} from ${period}?` },
      { kind: 'site', title: 'Earth outages', text: `When does Earth set and rise at ${site} from ${period}?` },
    ],
    horizon: [
      { kind: 'site', title: 'Sun and Earth paths', text: `How high do the Sun and Earth get above the horizon at ${site} over one lunar day?` },
    ],
    sites: [
      { kind: 'compare', title: 'Water-first ranking', text: 'Rank south-pole sites putting access to detected ice first, then slope safety' },
    ],
    trajectories: [
      { kind: 'mission', title: 'Transfer trade-off', text: `Find transfers launching in ${m} under 4,000 m/s total Δv and compare their transit times` },
    ],
  };
  const specific = byPage[c.page] ?? [];
  // Page-specific questions first, then the general set, without duplicating a kind twice in a row.
  const merged = [...specific, ...common.filter((q) => !specific.some((s) => s.kind === q.kind && s.title === q.title))];
  return merged.slice(0, 5);
}

/* ---------------------------------------------------------- follow-ups ---- */

type WindowLike = { start: string; hours: number };
type RankedLike = { name: string; latitude: number; longitude: number };
type MissionLike = { estimated_landing_utc: string; estimated_launch_utc: string };

export function windowFollowUps(windows: WindowLike[], site: string, stepHours: number, criteriaText: { requireEarth: boolean; requireSun: boolean; minHours: number }): string[] {
  if (!windows.length) return [];
  const longest = windows.reduce((a, w) => (w.hours > a.hours ? w : a), windows[0]);
  const out = [
    `Show the forecast around the ${Math.round(longest.hours)} h window starting ${day(longest.start)}`,
    criteriaText.requireEarth ? 'Repeat with Earth at least 5° above the horizon' : 'Repeat requiring Earth in view throughout',
    stepHours > 0.5 ? `Repeat with ${stepHours >= 2 ? 1 : 0.5} h sampling to tighten the window edges` : `Repeat requiring at least ${Math.max(1, criteriaText.minHours * 2)} h windows`,
    site.includes('Connecting Ridge') ? 'Compare these windows with Shackleton rim S0' : 'Compare these windows with Connecting Ridge C1',
  ];
  return out.slice(0, 4);
}

export function missionFollowUps(candidates: MissionLike[], site: string): string[] {
  if (!candidates.length) {
    return ['Let the planner choose a better-lit south-pole site', 'Extend the landing range by one month', 'Reduce the continuous sunlight requirement to 5 days'];
  }
  const first = candidates[0];
  return [
    `Run the full mission plan for the landing on ${day(first.estimated_landing_utc)}`,
    'Require Earth contact for the whole surface stay',
    `What limits the landing dates at ${site}?`,
    'Rank alternative south-pole sites for the same period',
  ];
}

export function rankingFollowUps(sites: RankedLike[]): string[] {
  if (!sites.length) return [];
  const [best, second] = sites;
  return [
    `Compare the top ${Math.min(3, sites.length)} sites`,
    `Find launch and landing dates at ${best.name} with at least 8 days of sunlight`,
    'Re-rank putting access to detected ice first',
    second ? `Why does ${best.name} rank above ${second.name}?` : 'Explain how the scores are computed and their limits',
  ];
}

export function summaryFollowUps(site: string): string[] {
  return [
    `Find windows at ${site} with the Sun up and Earth in view for at least 24 h`,
    'What limits the surface temperature estimate here?',
    `Plan a mission landing at ${site} with 8 days of sunlight`,
  ];
}
