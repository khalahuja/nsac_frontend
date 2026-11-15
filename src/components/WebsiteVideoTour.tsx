import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, ChevronRight, ChevronLeft, X,
  ExternalLink, Moon, Compass, Award, CalendarDays, Rocket,
  FlaskConical, Sun, Volume2, VolumeX, FastForward, CheckCircle2,
  Info, Sparkles, Navigation, Eye
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PageId } from '../lib/navigation';

export interface TourChapter {
  id: string;
  title: string;
  shortTitle: string;
  durationSec: number;
  mode: PageId;
  icon: LucideIcon;
  tagline: string;
  description: string;
  proTip: string;
  shortcut: string;
  metrics: Array<{ label: string; value: string }>;
  imageSrc: string;
  hotspot: { label: string; x: string; y: string };
}

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: 'atlas',
    title: '1. Lunar Atlas & Site Selection',
    shortTitle: 'Lunar Atlas',
    durationSec: 35,
    mode: 'selene',
    icon: Moon,
    tagline: 'Interactive 3D Moon with textured topography and lighting',
    description: 'Explore the 3D Moon globe with real-time solar illumination and high-resolution crater mapping. Select south-pole candidate sites like Connecting Ridge C1 or Shackleton to instantly inspect live solar geometry, elevation, and surface temperature.',
    proTip: 'Connecting Ridge C1 receives ~92% annual sunlight at 2 m elevation, making it a prime candidate for solar-powered lunar surface assets.',
    shortcut: 'Left-click + Drag to rotate globe · Scroll wheel to zoom · Click any crater marker to inspect.',
    metrics: [
      { label: 'Primary Target', value: 'Connecting Ridge (C1)' },
      { label: 'Latitude / Longitude', value: '89.44° S, 137.17° W' },
      { label: 'Sun Elevation', value: '+1.4°' },
      { label: 'Equilibrium Temp', value: '242 K (-31 °C)' }
    ],
    imageSrc: '/tour/ch1_atlas.png',
    hotspot: { label: 'Mission Context & Site Preset Dropdown', x: '18%', y: '16%' }
  },
  {
    id: 'sky',
    title: '2. Local Horizon & DTE Sky Plot',
    shortTitle: 'Local Sky',
    durationSec: 30,
    mode: 'horizon',
    icon: Compass,
    tagline: 'Azimuth and elevation of Sun and Earth above local terrain',
    description: 'Assess communications and power geometry. The sky plot projects the Sun and Earth paths against surrounding crater terrain, identifying Direct-to-Earth (DTE) communication visibility windows and terrain occultation.',
    proTip: 'Earth visibility is essential for high-throughput S-band and Ka-band links without requiring an active orbital relay satellite.',
    shortcut: 'Toggle between polar and orthographic projections · Hover over path points for UTC timestamps.',
    metrics: [
      { label: 'Earth Elevation', value: '+6.2° (Continuous DTE)' },
      { label: 'Sun Azimuth', value: '184.2° (South)' },
      { label: 'Path Loss (X-band)', value: '-212.4 dB' },
      { label: 'Terrain Clearance', value: '+4.8° above crater rim' }
    ],
    imageSrc: '/tour/ch2_sky.png',
    hotspot: { label: 'Horizon & Sun/Earth Elevation Grid', x: '45%', y: '32%' }
  },
  {
    id: 'compare',
    title: '3. South Pole Candidate Comparison',
    shortTitle: 'Compare Sites',
    durationSec: 35,
    mode: 'compare',
    icon: Award,
    tagline: 'Multi-criteria evaluation matrix for Artemis & CLPS sites',
    description: 'Evaluate prime south-pole landing candidates side-by-side: Connecting Ridge, Shackleton Rim, Malapert Massif, de Gerlache, Haworth, and Nobile. Compare sunlight persistence, maximum shadow duration, slope hazards, and derived battery survival mass.',
    proTip: 'A low slope (<8°) significantly minimizes lander tipping risks, while shorter shadow durations drastically reduce required battery mass.',
    shortcut: 'Click candidate cards to toggle radar chart highlights · Sort table columns by sunlight or slope.',
    metrics: [
      { label: 'Best Illumination', value: 'Connecting Ridge (92%)' },
      { label: 'Max Shadow Window', value: '54 hours (Connecting Ridge)' },
      { label: 'Ice Proximity', value: '1.2 km to Shackleton PSR' },
      { label: 'Avg Slope Gradient', value: '6.4° (Safe landing)' }
    ],
    imageSrc: '/tour/ch3_compare.png',
    hotspot: { label: 'Candidate Sunlight & Slope Scorecard', x: '50%', y: '25%' }
  },
  {
    id: 'forecast',
    title: '4. Diurnal Environmental Forecast',
    shortTitle: 'Forecast',
    durationSec: 35,
    mode: 'forecast',
    icon: CalendarDays,
    tagline: 'Predictive thermal and solar flux time series with Excel export',
    description: 'Generate multi-day environmental forecasts showing diurnal surface temperature (100 K to 380 K), solar irradiance (0 to 1,361 W/m²), and Earth elevation. Export complete datasets as formatted Excel (.xlsx) workbooks or CSV files.',
    proTip: 'Thermal models account for solar incidence angle, regolith thermal inertia, and radiative equilibrium cooling during lunar nights.',
    shortcut: 'Drag date range picker · Adjust step size (1h to 24h) · Click Download for instant spreadsheet export.',
    metrics: [
      { label: 'Simulated Window', value: '14 Days (Lunar Day/Night)' },
      { label: 'Peak Solar Flux', value: '1,361 W/m²' },
      { label: 'Cryogenic Low', value: '104 K (-169 °C)' },
      { label: 'Export Options', value: 'Excel (.xlsx) & CSV' }
    ],
    imageSrc: '/tour/ch4_forecast.png',
    hotspot: { label: 'Diurnal Temperature Curve & Forecast Generator', x: '35%', y: '24%' }
  },
  {
    id: 'trajectories',
    title: '5. Earth–Moon Trajectory Explorer',
    shortTitle: 'Trajectories',
    durationSec: 30,
    mode: 'trajectories',
    icon: Rocket,
    tagline: '2,400 screened transfer cases with 2D/3D orbital visualization',
    description: 'Filter and inspect trans-lunar injection trajectories, translunar coast durations, and lunar orbit insertion delta-V budgets. Includes 2D/3D trajectory rendering and propellant mass calculations via the Tsiolkovsky rocket equation.',
    proTip: 'Transfers with 4.2 to 4.8-day transit times offer optimal balance between launch vehicle payload mass and lunar arrival speed.',
    shortcut: 'Filter by Max Delta-V and Transit Duration · Click any trajectory row to view 3D orbital transfer path.',
    metrics: [
      { label: 'Transfer Solutions', value: '2,400 Ephemeris Cases' },
      { label: 'Optimal Transit Time', value: '4.35 Days' },
      { label: 'Insertion Delta-V', value: '824 m/s' },
      { label: 'Propellant Mass Frac', value: '54.2% (Isp = 315s)' }
    ],
    imageSrc: '/tour/ch5_trajectories.png',
    hotspot: { label: 'Transfer Orbits & Delta-V Screen', x: '42%', y: '30%' }
  },
  {
    id: 'mission-lab',
    title: '6. Mission Lab & Autonomous Agent Swarm',
    shortTitle: 'Mission Lab',
    durationSec: 40,
    mode: 'mission-lab',
    icon: FlaskConical,
    tagline: 'Integrated feasibility verification, hazard modeling, and report export',
    description: 'Test end-to-end mission feasibility: launch window compatibility, descent burn propellant, hazard footprint containment, rover traverse energy consumption, and power survival. Export reproducible scientific JSON reports with full provenance.',
    proTip: 'The Agent Swarm uses deterministic LangGraph validation chains with explicit mathematical model citations for flight-level traceability.',
    shortcut: 'Use natural-language mission query or tweak parametric sliders · Export reproducible JSON dossier.',
    metrics: [
      { label: 'Feasibility Score', value: '94% (High Confidence)' },
      { label: 'Landing Error (3σ)', value: '100 m containment' },
      { label: 'Relay Redundancy', value: 'Orbiter + Direct Earth' },
      { label: 'Provenance', value: 'JPL SPICE DE440 + LOLA' }
    ],
    imageSrc: '/tour/ch6_missionlab.png',
    hotspot: { label: 'Unified Mission Lab & Hazard Matrix', x: '40%', y: '22%' }
  },
  {
    id: 'tools',
    title: '7. Engineering Sizing Calculators',
    shortTitle: 'Engineering Tools',
    durationSec: 35,
    mode: 'solar',
    icon: Sun,
    tagline: 'Parametric tools for solar arrays, batteries, radio links, and thermal',
    description: 'Size lunar mission sub-systems using verified aerospace engineering formulas: photovoltaic array area and mass, dark-period lithium-ion battery storage, line-of-sight geometric horizons, and RF link budget margins.',
    proTip: 'All formulas cite primary equations and provide immediate parametric recalculation on slider change.',
    shortcut: 'Access from the Tools dropdown in the top navbar · Click any result parameter to inspect formula derivation.',
    metrics: [
      { label: 'Solar Array Area', value: '3.4 m² (for 450W payload)' },
      { label: 'Battery Capacity', value: '14.2 kWh (54h survival)' },
      { label: 'Battery Mass', value: '88.8 kg (160 Wh/kg)' },
      { label: 'Link Margin', value: '+7.4 dB (S-Band Earth)' }
    ],
    imageSrc: '/tour/ch7_tools.png',
    hotspot: { label: 'Photovoltaic & Battery Sizing Sliders', x: '48%', y: '28%' }
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (mode: PageId) => void;
}

export function WebsiteVideoTour({ isOpen, onClose, onNavigate }: Props) {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedInChapter, setElapsedInChapter] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [audioVisualizer, setAudioVisualizer] = useState(false);
  const [viewMode, setViewMode] = useState<'screenshot' | 'schematic'>('screenshot');

  const chapter = TOUR_CHAPTERS[activeChapterIndex];
  const timerRef = useRef<number | null>(null);

  // Total tour duration
  const totalTourDuration = TOUR_CHAPTERS.reduce((sum, ch) => sum + ch.durationSec, 0);

  // Calculate global elapsed time
  const globalElapsed = TOUR_CHAPTERS.slice(0, activeChapterIndex).reduce((sum, ch) => sum + ch.durationSec, 0) + elapsedInChapter;

  // Format mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Playback timer loop
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const interval = 100; // 100ms tick
    timerRef.current = window.setInterval(() => {
      setElapsedInChapter(prev => {
        const next = prev + (0.1 * playbackSpeed);
        if (next >= chapter.durationSec) {
          // Advance to next chapter
          if (activeChapterIndex < TOUR_CHAPTERS.length - 1) {
            setActiveChapterIndex(i => i + 1);
            return 0;
          } else {
            // Finished all chapters
            setIsPlaying(false);
            return chapter.durationSec;
          }
        }
        return next;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isPlaying, activeChapterIndex, playbackSpeed, chapter.durationSec]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeChapterIndex]);

  const handleNext = () => {
    if (activeChapterIndex < TOUR_CHAPTERS.length - 1) {
      setActiveChapterIndex(i => i + 1);
      setElapsedInChapter(0);
    }
  };

  const handlePrev = () => {
    if (activeChapterIndex > 0) {
      setActiveChapterIndex(i => i - 1);
      setElapsedInChapter(0);
    } else {
      setElapsedInChapter(0);
    }
  };

  const handleSeekChapter = (index: number) => {
    setActiveChapterIndex(index);
    setElapsedInChapter(0);
  };

  const handleTryInApp = () => {
    onNavigate(chapter.mode);
    onClose();
  };

  if (!isOpen) return null;

  const chapterProgressPercent = Math.min(100, (elapsedInChapter / chapter.durationSec) * 100);
  const globalProgressPercent = Math.min(100, (globalElapsed / totalTourDuration) * 100);

  return (
    <div className="sl-tour-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Website Video Tour">
      <div className="sl-tour-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="sl-tour-header">
          <div className="sl-tour-title-wrap">
            <span className="sl-tour-badge">
              <Sparkles size={13} /> Guided Video Tour
            </span>
            <div>
              <h2>How to Use Selene — Lunar Mission Explorer</h2>
              <div className="sl-tour-subtitle">
                Interactive chapter-by-chapter walkthrough of the digital twin, environmental telemetry, and planning systems
              </div>
            </div>
          </div>

          <button
            type="button"
            className="sl-tour-close-btn"
            onClick={onClose}
            title="Close Tour (Esc)"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {/* Dialog Body */}
        <div className="sl-tour-body">
          {/* Chapter Sidebar */}
          <aside className="sl-tour-sidebar" aria-label="Tour Chapters">
            <div className="sl-tour-sidebar-heading">Walkthrough Chapters (7)</div>
            {TOUR_CHAPTERS.map((ch, index) => {
              const Icon = ch.icon;
              const isActive = index === activeChapterIndex;
              const isPast = index < activeChapterIndex;

              return (
                <button
                  key={ch.id}
                  type="button"
                  className={`sl-tour-chapter-item${isActive ? ' is-active' : ''}`}
                  onClick={() => handleSeekChapter(index)}
                >
                  <div className="sl-tour-chapter-num">
                    {isPast ? <CheckCircle2 size={13} color="#34d399" /> : index + 1}
                  </div>
                  <div className="sl-tour-chapter-info">
                    <div className="sl-tour-chapter-title">
                      <span>{ch.shortTitle}</span>
                      <span className="sl-tour-chapter-dur">{formatTime(ch.durationSec)}</span>
                    </div>
                    <div className="sl-tour-chapter-desc">{ch.tagline}</div>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Main Stage */}
          <main className="sl-tour-stage">
            {/* Simulated Video Player */}
            <div className="sl-tour-video-box">
              {/* Screen / Canvas Simulation */}
              <div className="sl-tour-screen">
                <div className="sl-tour-screen-badge">
                  <chapter.icon size={14} /> {chapter.title}
                </div>

                <div className="sl-tour-viewmode-toggle" style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 12 }}>
                  <button
                    type="button"
                    className={`sl-tour-viewmode-btn${viewMode === 'screenshot' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('screenshot')}
                    title="View real captured UI of this section"
                  >
                    <Eye size={12} /> Live UI
                  </button>
                  <button
                    type="button"
                    className={`sl-tour-viewmode-btn${viewMode === 'schematic' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('schematic')}
                    title="View scientific schematic and math"
                  >
                    <Sparkles size={12} /> Schematic
                  </button>
                </div>

                <div className="sl-tour-screen-rec">
                  <span className="sl-tour-rec-dot" /> LIVE DEMO
                </div>

                {/* Viewport: Live Screenshot or Animated Schematic */}
                {viewMode === 'screenshot' ? (
                  <div className="sl-tour-screenshot-viewport">
                    <img
                      src={chapter.imageSrc}
                      alt={chapter.title}
                      className="sl-tour-screenshot-img"
                    />
                    <div className="sl-tour-screenshot-overlay" />
                    <div
                      className="sl-tour-hotspot-pin"
                      style={{ left: chapter.hotspot.x, top: chapter.hotspot.y }}
                    >
                      <span className="sl-tour-hotspot-dot" />
                      <span>{chapter.hotspot.label}</span>
                    </div>
                  </div>
                ) : (
                  <div className="sl-tour-demo-viewport">
                    {renderChapterGraphic(chapter.id, elapsedInChapter)}
                  </div>
                )}

                {/* Action Callout bar */}
                <div className="sl-tour-callout">
                  <div className="sl-tour-callout-text">
                    <h4>{chapter.tagline}</h4>
                    <p>{chapter.description}</p>
                  </div>
                  <button
                    type="button"
                    className="sl-tour-try-btn"
                    onClick={handleTryInApp}
                    title={`Open ${chapter.shortTitle} page in the real app`}
                  >
                    <ExternalLink size={14} /> Try in App
                  </button>
                </div>
              </div>

              {/* Player Control Bar */}
              <div className="sl-tour-controls-bar">
                {/* Timeline Scrubber */}
                <div
                  className="sl-tour-scrubber-track"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const targetSec = ratio * totalTourDuration;

                    // Find which chapter corresponds to targetSec
                    let accumulated = 0;
                    for (let i = 0; i < TOUR_CHAPTERS.length; i++) {
                      if (accumulated + TOUR_CHAPTERS[i].durationSec >= targetSec) {
                        setActiveChapterIndex(i);
                        setElapsedInChapter(targetSec - accumulated);
                        break;
                      }
                      accumulated += TOUR_CHAPTERS[i].durationSec;
                    }
                  }}
                  title="Click to scrub through the walkthrough"
                >
                  <div
                    className="sl-tour-scrubber-fill"
                    style={{ width: `${globalProgressPercent}%` }}
                  />
                  <div className="sl-tour-markers-row">
                    {TOUR_CHAPTERS.map((ch, idx) => {
                      const widthPct = (ch.durationSec / totalTourDuration) * 100;
                      return (
                        <div
                          key={ch.id}
                          className="sl-tour-marker-tick"
                          style={{ width: `${widthPct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Control buttons */}
                <div className="sl-tour-ctrl-buttons">
                  <div className="sl-tour-ctrl-left">
                    <button
                      type="button"
                      className="sl-tour-ctrl-btn"
                      onClick={handlePrev}
                      disabled={activeChapterIndex === 0 && elapsedInChapter === 0}
                      title="Previous Chapter (Left Arrow)"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <button
                      type="button"
                      className="sl-tour-ctrl-btn is-primary"
                      onClick={() => setIsPlaying(p => !p)}
                      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    </button>

                    <button
                      type="button"
                      className="sl-tour-ctrl-btn"
                      onClick={handleNext}
                      disabled={activeChapterIndex === TOUR_CHAPTERS.length - 1}
                      title="Next Chapter (Right Arrow)"
                    >
                      <ChevronRight size={18} />
                    </button>

                    <button
                      type="button"
                      className="sl-tour-ctrl-btn"
                      onClick={() => {
                        setActiveChapterIndex(0);
                        setElapsedInChapter(0);
                        setIsPlaying(true);
                      }}
                      title="Replay from Beginning"
                    >
                      <RotateCcw size={15} />
                    </button>

                    <span className="sl-tour-time-display">
                      {formatTime(globalElapsed)} / {formatTime(totalTourDuration)}
                    </span>
                  </div>

                  <div className="sl-tour-ctrl-right">
                    <button
                      type="button"
                      className={`sl-tour-speed-chip${playbackSpeed === 1 ? ' is-active' : ''}`}
                      onClick={() => setPlaybackSpeed(s => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
                      title="Change Playback Speed"
                    >
                      {playbackSpeed}x Speed
                    </button>

                    <button
                      type="button"
                      className="sl-tour-ctrl-btn"
                      onClick={() => setAudioVisualizer(a => !a)}
                      title={audioVisualizer ? 'Audio Mode Active' : 'Muted'}
                    >
                      {audioVisualizer ? <Volume2 size={16} color="#38bdf8" /> : <VolumeX size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Telemetry Matrix */}
            <div className="sl-tour-notes-grid">
              <div className="sl-tour-card">
                <div className="sl-tour-card-label">
                  <Info size={13} /> Mission Science & Pro-Tip
                </div>
                <p className="sl-tour-card-body">{chapter.proTip}</p>
                <div style={{ marginTop: 8, fontSize: '11.5px', color: '#94a3b8' }}>
                  <strong>Key Interaction:</strong> {chapter.shortcut}
                </div>
              </div>

              <div className="sl-tour-card">
                <div className="sl-tour-card-label">
                  <Navigation size={13} /> Live System Telemetry
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {chapter.metrics.map(m => (
                    <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: 6 }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{m.label}</div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0', marginTop: 1 }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/** Renders high-fidelity dynamic visual animations simulating each feature */
function renderChapterGraphic(chapterId: string, elapsed: number) {
  switch (chapterId) {
    case 'atlas':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Deep Space Starfield */}
          <circle cx="50" cy="40" r="1" fill="#ffffff" opacity="0.6" />
          <circle cx="120" cy="190" r="1.5" fill="#38bdf8" opacity="0.8" />
          <circle cx="520" cy="50" r="1" fill="#ffffff" opacity="0.7" />
          <circle cx="560" cy="210" r="1.5" fill="#ffffff" opacity="0.5" />
          
          {/* Moon Sphere with Lighting Gradient */}
          <defs>
            <radialGradient id="moonGrad" cx="38%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#d1d5db" />
              <stop offset="60%" stopColor="#4b5563" />
              <stop offset="90%" stopColor="#1f2937" />
              <stop offset="100%" stopColor="#090d16" />
            </radialGradient>
            <linearGradient id="sunRay" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Sunlight Vector */}
          <line x1="40" y1="130" x2="200" y2="130" stroke="url(#sunRay)" strokeWidth="3" strokeDasharray="4 4" />
          <text x="50" y="120" fill="#facc15" fontSize="11" fontFamily="sans-serif" fontWeight="bold">Sun Incident Vector (1,361 W/m²)</text>

          {/* Moon Sphere */}
          <circle cx="300" cy="130" r="95" fill="url(#moonGrad)" filter="drop-shadow(0 0 25px rgba(165, 180, 252, 0.2))" />

          {/* Craters with shadows */}
          <ellipse cx="260" cy="100" rx="16" ry="12" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
          <ellipse cx="330" cy="80" rx="12" ry="9" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
          <ellipse cx="270" cy="170" rx="22" ry="16" fill="#1f2937" stroke="#374151" strokeWidth="1.5" />
          <ellipse cx="340" cy="155" rx="18" ry="13" fill="#1f2937" stroke="#374151" strokeWidth="1.5" />

          {/* South Pole Target (Connecting Ridge C1) */}
          <circle cx="305" cy="205" r="7" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="2 2" />
          <circle cx="305" cy="205" r="3" fill="#38bdf8" />
          
          {/* Target HUD Callout */}
          <polyline points="305,205 340,225 470,225" stroke="#38bdf8" strokeWidth="1.5" />
          <rect x="350" y="195" width="135" height="42" rx="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
          <text x="360" y="212" fill="#38bdf8" fontSize="11" fontWeight="bold">CONNECTING RIDGE</text>
          <text x="360" y="228" fill="#94a3b8" fontSize="10">89.44° S, 137.17° W · 92% Sun</text>
        </svg>
      );

    case 'sky':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Horizon Line and Coordinate Grid */}
          <line x1="60" y1="180" x2="540" y2="180" stroke="#475569" strokeWidth="2" />
          <text x="60" y="198" fill="#64748b" fontSize="10">0° Local Horizon (Crater Rim)</text>

          {/* Elevation Grids */}
          <line x1="60" y1="140" x2="540" y2="140" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <text x="30" y="144" fill="#64748b" fontSize="10">+5°</text>
          <line x1="60" y1="100" x2="540" y2="100" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <text x="25" y="104" fill="#64748b" fontSize="10">+10°</text>

          {/* Jagged Crater Skyline Terrain Silhouette */}
          <polygon points="60,180 100,165 150,172 200,158 260,170 320,155 380,168 440,160 500,174 540,180 540,240 60,240" fill="#1e293b" opacity="0.7" />

          {/* Earth Orbit / Position (Continuous DTE) */}
          <path d="M 120,135 Q 300,115 480,135" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" fill="none" />
          <circle cx="300" cy="120" r="10" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" filter="drop-shadow(0 0 10px #38bdf8)" />
          <text x="320" y="124" fill="#38bdf8" fontSize="11" fontWeight="bold">Earth (+6.2° Elev) — Constant DTE Link</text>

          {/* Sun Low Horizon Orbit */}
          <path d="M 80,170 Q 300,160 520,170" stroke="#facc15" strokeWidth="2" fill="none" />
          <circle cx="210" cy="164" r="8" fill="#eab308" filter="drop-shadow(0 0 12px #facc15)" />
          <text x="140" y="152" fill="#facc15" fontSize="11" fontWeight="bold">Sun (+1.4° Elev)</text>
        </svg>
      );

    case 'compare':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Comparison Bar Graph / Radar Representation */}
          <rect x="70" y="40" width="460" height="190" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1" />
          <text x="90" y="65" fill="#f8fafc" fontSize="13" fontWeight="bold">South-Pole Candidate Site Scoring</text>

          {/* Site 1: Connecting Ridge */}
          <text x="90" y="100" fill="#cbd5e1" fontSize="11">Connecting Ridge (C1)</text>
          <rect x="230" y="90" width="220" height="12" rx="3" fill="#6366f1" />
          <text x="460" y="100" fill="#a5b4fc" fontSize="11" fontWeight="bold">92% Sunlight · 54h Dark</text>

          {/* Site 2: Shackleton Vicinity */}
          <text x="90" y="130" fill="#cbd5e1" fontSize="11">Shackleton Rim</text>
          <rect x="230" y="120" width="180" height="12" rx="3" fill="#38bdf8" />
          <text x="460" y="130" fill="#7dd3fc" fontSize="11" fontWeight="bold">78% Sunlight · 86h Dark</text>

          {/* Site 3: Malapert Massif */}
          <text x="90" y="160" fill="#cbd5e1" fontSize="11">Malapert Massif</text>
          <rect x="230" y="150" width="165" height="12" rx="3" fill="#10b981" />
          <text x="460" y="160" fill="#6ee7b7" fontSize="11" fontWeight="bold">72% Sunlight · High Relief</text>

          {/* Site 4: de Gerlache */}
          <text x="90" y="190" fill="#cbd5e1" fontSize="11">de Gerlache Rim</text>
          <rect x="230" y="180" width="140" height="12" rx="3" fill="#f59e0b" />
          <text x="460" y="190" fill="#fcd34d" fontSize="11" fontWeight="bold">64% Sunlight · Ice Proximity</text>
        </svg>
      );

    case 'forecast':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Diurnal Thermal Curve */}
          <rect x="60" y="30" width="480" height="200" rx="8" fill="#090d16" stroke="#1e293b" />
          <text x="80" y="55" fill="#f1f5f9" fontSize="12" fontWeight="bold">14-Day Diurnal Environmental Timeline (Connecting Ridge)</text>

          {/* Grid lines */}
          <line x1="80" y1="180" x2="520" y2="180" stroke="#1e293b" strokeWidth="1" />
          <line x1="80" y1="130" x2="520" y2="130" stroke="#1e293b" strokeWidth="1" />
          <line x1="80" y1="80" x2="520" y2="80" stroke="#1e293b" strokeWidth="1" />

          {/* Temperature Wave Line (Red/Orange) */}
          <path d="M 80,170 Q 150,75 220,90 T 360,185 T 500,95" stroke="#f97316" strokeWidth="2.5" fill="none" />
          <circle cx="220" cy="90" r="5" fill="#f97316" />
          <text x="235" y="88" fill="#fdba74" fontSize="10" fontWeight="bold">Max 285 K (+12 °C)</text>

          <circle cx="360" cy="185" r="5" fill="#38bdf8" />
          <text x="375" y="195" fill="#7dd3fc" fontSize="10" fontWeight="bold">Night Low 104 K (-169 °C)</text>

          {/* Solar Irradiance Fill (Yellow) */}
          <path d="M 80,180 Q 150,110 220,115 T 320,180 L 320,200 L 80,200 Z" fill="#eab308" opacity="0.15" />
          <text x="80" y="220" fill="#94a3b8" fontSize="10">Day 1 · Day 3 · Day 5 · Day 7 (Lunar Noon) · Day 10 · Day 14</text>
        </svg>
      );

    case 'trajectories':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Earth */}
          <circle cx="120" cy="130" r="28" fill="#1d4ed8" stroke="#60a5fa" strokeWidth="2" filter="drop-shadow(0 0 16px rgba(59, 130, 246, 0.4))" />
          <text x="98" y="134" fill="#ffffff" fontSize="11" fontWeight="bold">Earth</text>

          {/* Moon Orbit & Moon */}
          <ellipse cx="120" cy="130" rx="360" ry="85" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" fill="none" />
          <circle cx="480" cy="130" r="14" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="463" y="156" fill="#cbd5e1" fontSize="10" fontWeight="bold">Moon</text>

          {/* Transfer Trajectory Curve (Keplerian) */}
          <path d="M 148,130 C 230,50 380,80 472,122" stroke="#ec4899" strokeWidth="2.5" fill="none" strokeDasharray="5 3" />
          <circle cx="310" cy="85" r="4" fill="#f43f5e" />
          <text x="325" y="80" fill="#fda4af" fontSize="10" fontWeight="bold">Transit: 4.35 Days · Δv = 3,920 m/s</text>

          <text x="120" y="215" fill="#94a3b8" fontSize="11">Translunar Injection (TLI) → Coast Phase → Lunar Orbit Insertion (LOI)</text>
        </svg>
      );

    case 'mission-lab':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Pipeline flow nodes */}
          <rect x="40" y="90" width="85" height="50" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
          <text x="56" y="112" fill="#c7d2fe" fontSize="10" fontWeight="bold">Launch</text>
          <text x="52" y="126" fill="#818cf8" fontSize="9">Window T0</text>

          <line x1="125" y1="115" x2="155" y2="115" stroke="#6366f1" strokeWidth="2" />

          <rect x="155" y="90" width="85" height="50" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
          <text x="170" y="112" fill="#c7d2fe" fontSize="10" fontWeight="bold">Transfer</text>
          <text x="166" y="126" fill="#818cf8" fontSize="9">4.3d Coast</text>

          <line x1="240" y1="115" x2="270" y2="115" stroke="#6366f1" strokeWidth="2" />

          <rect x="270" y="90" width="85" height="50" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
          <text x="285" y="112" fill="#c7d2fe" fontSize="10" fontWeight="bold">Descent</text>
          <text x="279" y="126" fill="#818cf8" fontSize="9">Powered Burn</text>

          <line x1="355" y1="115" x2="385" y2="115" stroke="#6366f1" strokeWidth="2" />

          <rect x="385" y="90" width="85" height="50" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
          <text x="398" y="112" fill="#c7d2fe" fontSize="10" fontWeight="bold">Landing</text>
          <text x="393" y="126" fill="#818cf8" fontSize="9">DEM Hazard</text>

          <line x1="470" y1="115" x2="500" y2="115" stroke="#10b981" strokeWidth="2" />

          <rect x="500" y="90" width="85" height="50" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
          <text x="515" y="112" fill="#a7f3d0" fontSize="10" fontWeight="bold">Surface Ops</text>
          <text x="512" y="126" fill="#34d399" fontSize="9">Feasible: 94%</text>

          {/* Score Badge */}
          <rect x="180" y="180" width="240" height="34" rx="17" fill="#047857" opacity="0.3" stroke="#10b981" />
          <text x="205" y="202" fill="#34d399" fontSize="11" fontWeight="bold">Deterministic Multi-Agent Verification PASSED</text>
        </svg>
      );

    case 'tools':
      return (
        <svg className="sl-tour-svg-scene" viewBox="0 0 600 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Engineering Calculator Sliders */}
          <rect x="60" y="35" width="480" height="190" rx="8" fill="#0f172a" stroke="#334155" />
          <text x="85" y="65" fill="#f8fafc" fontSize="13" fontWeight="bold">Photovoltaic Array & Battery Sizing Calculator</text>

          {/* Slider 1: Solar Array Area */}
          <text x="85" y="100" fill="#94a3b8" fontSize="11">Photovoltaic Array Area (m²)</text>
          <line x1="85" y1="115" x2="380" y2="115" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
          <line x1="85" y1="115" x2="260" y2="115" stroke="#eab308" strokeWidth="4" strokeLinecap="round" />
          <circle cx="260" cy="115" r="8" fill="#facc15" stroke="#ffffff" strokeWidth="2" />
          <text x="400" y="118" fill="#facc15" fontSize="12" fontWeight="bold">3.4 m² (462 W)</text>

          {/* Slider 2: Battery Storage Capacity */}
          <text x="85" y="155" fill="#94a3b8" fontSize="11">Darkness Interval Battery Storage (kWh)</text>
          <line x1="85" y1="170" x2="380" y2="170" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
          <line x1="85" y1="170" x2="310" y2="170" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
          <circle cx="310" cy="170" r="8" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
          <text x="400" y="173" fill="#38bdf8" fontSize="12" fontWeight="bold">14.2 kWh (88.8 kg)</text>

          <text x="85" y="208" fill="#64748b" fontSize="10">Formulas: P = A · η · S · cos(θ) · (1 - L) | E_bat = P_load · t_dark / (DoD · η_bat)</text>
        </svg>
      );

    default:
      return null;
  }
}
