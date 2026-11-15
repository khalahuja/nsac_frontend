import { CalendarClock, Crosshair, MapPin, RotateCcw } from 'lucide-react';
import { localInput } from '../lib/time';

export type MissionContextBarProps = {
  /** Human-readable name of the selected site, e.g. "Shackleton vicinity". */
  siteName: string;
  sites?: Array<{ name: string; lat: number; lon: number }>;
  onSelectSite?: (site: { name: string; lat: number; lon: number }) => void;
  /** Raw latitude/longitude field text (kept as strings so typing isn't fought). */
  lat: string;
  lon: string;
  onLatChange: (value: string) => void;
  onLonChange: (value: string) => void;
  /** Commit the typed coordinate. */
  onGo: () => void;
  /** Analysis instant, ISO-8601 UTC. */
  instant: string;
  /** IANA zone the date/time is shown and entered in. */
  zone: string;
  /** Receives the raw `datetime-local` value, interpreted in `zone`. */
  onDateTimeChange: (value: string) => void;
  onNow: () => void;
};

/**
 * Shared "where and when" bar shown under the navbar on every page.
 *
 * The site, latitude, longitude, date and time drive every number in the app,
 * so they live in one fixed place, at large size, on every screen — the user
 * never has to hunt for them or wonder which values a page is using.
 */
export function MissionContextBar({
  siteName, sites, onSelectSite, lat, lon, onLatChange, onLonChange, onGo,
  instant, zone, onDateTimeChange, onNow
}: MissionContextBarProps) {
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onGo();
  };

  return (
    <section className="mc-bar" aria-label="Location and time used for every calculation">
      <form className="mc-group" onSubmit={submit}>
        <div className="mc-site">
          <span className="mc-label"><MapPin size={13} aria-hidden="true" /> Site</span>
          {sites && onSelectSite ? (
            <select aria-label="Selected site" value={sites.some(s => s.name === siteName) ? siteName : ''} onChange={event => { const chosen = sites.find(s => s.name === event.target.value); if (chosen) onSelectSite(chosen); }}>
              {!sites.some(s => s.name === siteName) && <option value="">{siteName}</option>}
              {sites.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          ) : <strong title={siteName}>{siteName}</strong>}
        </div>

        <label className="mc-field">
          <span className="mc-label">Latitude</span>
          <input
            type="number" inputMode="decimal" step="0.0001" min={-90} max={90}
            value={lat} onChange={(e) => onLatChange(e.target.value)}
            aria-label="Latitude in degrees, north positive"
          />
        </label>

        <label className="mc-field">
          <span className="mc-label">Longitude</span>
          <input
            type="number" inputMode="decimal" step="0.0001" min={-180} max={180}
            value={lon} onChange={(e) => onLonChange(e.target.value)}
            aria-label="Longitude in degrees, east positive"
          />
        </label>

        <button type="submit" className="mc-btn mc-btn-primary" title="Move to this coordinate">
          <Crosshair size={16} aria-hidden="true" /> Go
        </button>
      </form>

      <div className="mc-divider" aria-hidden="true" />

      <div className="mc-group">
        <label className="mc-field mc-field-time">
          <span className="mc-label">
            <CalendarClock size={13} aria-hidden="true" /> Date &amp; time ({zone})
          </span>
          <input
            type="datetime-local"
            value={localInput(instant, zone)}
            onChange={(e) => onDateTimeChange(e.target.value)}
            aria-label={`Analysis date and time in ${zone}`}
          />
        </label>
        <button type="button" className="mc-btn" onClick={onNow} title="Jump to the current moment">
          <RotateCcw size={15} aria-hidden="true" /> Now
        </button>
      </div>
    </section>
  );
}
