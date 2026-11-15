Science tools checks
====================

Mission math checks:

    node frontend/tests/mission.cjs

Mission UI checks use a separate headless Edge instance with remote debugging
on port 9228, and the frontend server at localhost:5173:

    node frontend/tests/browser-mission.cjs

This checks all 17 feature URLs, mission form validation, unknown water
evidence defaults, pole controls, automatic chatbot navigation and form fill,
and mobile overflow. Chat responses are mocked to make the UI check repeatable
without consuming Groq quota. The separate test browser is closed on completion.

Run numerical and terrain-import regression checks from the repository root:

    node frontend/tests/science.cjs

Browser checks use a separately launched headless Chromium/Edge instance with
remote debugging on port 9227, and the frontend dev server at localhost:5173.
Run:

    node frontend/tests/browser-science.cjs

The browser test generates forecasts, exercises window thresholds and shared
cursors, compares three sites, imports and removes temporary terrain test points,
and checks mobile overflow. It writes screenshots to tests/previews and closes
only the debugging browser. Imported test values exist only in browser memory.

Interactive map layers
----------------------
Moon > Surface contains imagery, modeled illumination, modeled equilibrium
temperature, and imported elevation/slope controls. Modeled maps use a reference
sphere and 2.5-degree grid; they exclude local terrain shadows and thermal inertia.
Elevation and slope accept a JSON object with source, resolution, and points.
Each point has lat/lon in degrees and elevation_m and/or slope_deg. State the
elevation datum in source. Coverage is rendered as discrete points, not a DEM.

Science windows
---------------
Science Windows > choose a site and date range > calculate science windows.
Show in charts opens the Forecast page at the selected window time. Duration is the elapsed time
between consecutive passing samples. A failing sample, missing timestamp, or
gap larger than the forecast cadence splits windows. Isolated samples do not
form a duration window. Export contains thresholds, UTC boundaries and model.
The local fallback assumes Earth visibility at 45 degrees; the UI identifies it.

Comparison charts
-----------------
Compare Sites > choose up to four sites > Compare forecasts. Each site uses
the same request range and cadence. Charts align on timestamps present in every
result, with a common value scale per quantity and shared cursor. Provenance
identifies backend or fallback output. CSV rows contain site, location, UTC,
chart values and source. Date labels use the selected display time zone.
