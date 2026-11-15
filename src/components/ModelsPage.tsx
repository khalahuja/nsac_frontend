/** Model assumptions are kept next to sources, separate from the atlas. */
export function ModelsPage() {
  return <article className="sl-models-page">
    <header><span className="sl-models-eyebrow">Reference</span><h1>Models, assumptions & sources</h1><p>Use the tools to explore trade-offs. Check the source and assumptions before interpreting a result.</p></header>
    <section><h2>Environment estimates</h2><div className="sl-models-grid">
      <div><h3>Sunlight on a horizontal surface</h3><code>Q = S₀ (1 AU / d)² max(0, n · s)</code><p>S₀ = 1,361 W/m². The backend accounts for Sun distance; the browser fallback holds it at 1 AU. Terrain shadows need an installed DEM and a horizon model.</p></div>
      <div><h3>Instantaneous surface temperature</h3><code>T = [(1 − A)Q / (εσ) + T₀⁴]¼</code><p>Uses albedo 0.12, emissivity 0.95 and an assumed 100 K night floor. This simple floor is unsuitable for diagnosing polar cold traps or ice stability.</p></div>
      <div><h3>Forecast temperature response</h3><code>Tnext = Teq + (T − Teq) exp(−Δt / τ)</code><p>The backend uses a fixed 30-minute integration step after spin-up. Heating (10 h) and cooling (55 h) times are uncalibrated assumptions. The browser fallback is coarser and separately labelled.</p></div>
      <div><h3>Visibility and science windows</h3><p>Local sky geometry depends on the selected site, date and active astronomy provider. Window edges depend on sampling; every condition must pass at the same sample. The offline browser forecast fixes Earth elevation at 45° and cannot support a reliable contact plan.</p></div>
    </div></section>
    <section><h2>Mission calculations</h2><div className="sl-models-grid">
      <div><h3>Landing probability screen</h3><code>Pinside = 1 − exp[−R² / (2σ²)]</code><p>Assumes unbiased, independent Gaussian north/east errors. Multiplying containment by assumed terrain safety and vehicle reliability assumes independence. The result is a scenario estimate.</p></div>
      <div><h3>Orbit insertion and landing timeline</h3><code>vp² = v∞² + 2μ/rp · vorbit² = μ(2/rp − 1/a)</code><p>The ideal burn is the difference in speeds at perilune. μ = 4,902.800066 km³/s²; reference radius = 1,737.4 km. Orbit waiting and descent durations are editable assumptions. NRHO transfers and powered descent need numerical propagation.</p></div>
      <div><h3>Water-ice evidence</h3><p>PSR confirmation, a sourced maximum temperature and remote-sensing signals contribute to a visible triage score. Unknown evidence receives zero weight. This is an uncalibrated score, so the app does not convert it into an ice probability or abundance.</p></div>
      <div><h3>Candidate regions and map boundaries</h3><p>The finder records NASA’s October 2024 set of nine regions, as a historical reference. Representative site points are not official region polygons. Crater shading uses catalogue centre/diameter on a reference sphere; the circular outline approximates the full footprint. The 2K globe texture is an overview image, not a surface-resolution DEM.</p></div>
    </div></section>
    <section><h2>Explore the source data</h2><div className="sl-source-links">
      <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer"><strong>NASA Moon Trek</strong><span>Imagery, terrain layers, measurements and detailed surface exploration</span></a>
      <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/" target="_blank" rel="noreferrer"><strong>NASA candidate-region announcement</strong><span>October 2024 region names and selection criteria</span></a>
      <a href="https://science.nasa.gov/moon/moon-water-and-ices/" target="_blank" rel="noreferrer"><strong>NASA Moon water and ices</strong><span>Multiple lines of evidence for lunar water</span></a>
      <a href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noreferrer"><strong>USGS / IAU nomenclature</strong><span>Named crater coordinates, diameters and control-network differences</span></a>
    </div></section>
  </article>;
}
