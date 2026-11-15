# QDRR air quality

A Thai, single-page static dashboard for the public QDRR PM2.5 and temperature feeds. Plain HTML, CSS, JavaScript and SVG; no build dependencies, backend, API key or account required to view it. Typography uses Google Sans (including Thai) from Google Fonts, with a system sans-serif fallback.

## Local preview

Use Node.js 24 or newer for tests and packaging; Python 3 for the preview server. No `npm install` is needed.

```sh
npm test
npm run dev
```

Open http://127.0.0.1:5173. The page requires an internet connection for live Adafruit data and Google Fonts. The layout and fallback font work if Google Fonts is unavailable.

`npm run build` copies only the public HTML, CSS and JavaScript into `_site/`. Preview that output with `python3 -m http.server 5173 --directory _site --bind 127.0.0.1`.

## GitHub Pages

1. Push this repository to GitHub with `main` as the default branch.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. Push a commit to `main`, or manually run **Deploy GitHub Pages** from the Actions tab.

The workflow tests the code, packages `_site/`, and deploys with the official Pages actions. No secrets are needed. Relative asset URLs support both a repository subpath (`https://USER.github.io/REPO/`) and a custom domain. This implementation does not create a repository, push commits or trigger a deployment itself.

## Data

Source dashboard: https://io.adafruit.com/srakrn/dashboards/qdrr-air-quality

API root: `https://io.adafruit.com/api/v2/srakrn/feeds/`

| Feed | Measurement |
| --- | --- |
| `qdrr-particle-sensor` | PM2.5, µg/m³ |
| `qdrr-temperature` | Temperature, °C |

- `/data?limit=1`: latest readings, checked every minute.
- `/data/chart?hours=24`: chart history, checked every five minutes. The API can aggregate history; chart points are the values returned by Adafruit, not hourly category results.
- `/data?start_time=…&end_time=…&limit=1000`: raw data for the rolling hour ending at the latest valid PM2.5 reading, plus ten minutes before that window. Pagination uses an exposed cursor when available and an `end_time` fallback when CORS hides the Link header. New PM2.5 timestamps trigger an updated assessment after the latest-reading poll; unchanged windows are rechecked at most every five minutes. Assessment failures retain their retry backoff.

Requests are independent, have 20-second timeouts and never overlap for the same job. Polling stops while the page is hidden; due requests resume when visible. Errors back off from one to sixteen minutes. HTTP 429 pauses all new requests for at least one minute and honours `Retry-After` when the browser exposes it. Adafruit's upstream limits still apply; unlimited access is not promised. Successful values remain visible with their original timestamps when a later request fails. Nothing is persisted across reloads.

## European PM2.5 categories — not Thai criteria

Reference: [EEA European Air Quality Index methodology](https://airindex.eea.europa.eu/AQI/?webgl=0), checked November 15, 2026. Colours match EEA's published stylesheet.

| Concentration (µg/m³) | Category | Colour |
| --- | --- | --- |
| 0–5 | ดี / Good | `#50f0e6` |
| >5–15 | พอใช้ / Fair | `#50ccaa` |
| >15–50 | ปานกลาง / Moderate | `#f0e641` |
| >50–90 | ไม่ดี / Poor | `#ff5050` |
| >90–140 | ไม่ดีมาก / Very poor | `#960032` |
| >140 | ไม่ดีอย่างยิ่ง / Extremely poor | `#7d2181` |

EEA publishes bands using whole-number ranges. This dashboard extends those as contiguous decimal intervals, with exact boundary values included in the lower category. Classification uses the unrounded mean. Thai labels are dashboard translations of the English categories.

The prominent report applies those **European hourly PM2.5 bands**, not Thailand's criteria and not WHO guideline comparisons. It is an indicative, PM2.5-only consumer-sensor assessment, not an official EEA station assessment or a combined index for all pollutants. Latest readings are displayed separately and are never classified as an hourly result.

The assessment uses a **rolling 60-minute window ending at the latest valid PM2.5 sample timestamp**, including its seconds, rather than the wall clock or a completed clock hour. If the sensor stops reporting, the window stays anchored to that last sample; its dates and times remain visible. Each valid sample is held until the next sample, for at most **ten minutes**. Samples from the ten minutes before the window can contribute only their remaining hold time. Invalid samples terminate the preceding hold. Duplicate timestamps are counted once. The mean is time-weighted over covered intervals; missing intervals are not treated as zero. At least **75% coverage** is required for categorisation. Otherwise the dashboard reports insufficient data. The rolling window, coverage and carry-forward rules are dashboard choices, **not EEA requirements**. Irregular or change-only reporting may consequently result in no hourly category, even when the latest reading is available.

History charts show returned measurements on a real 24-hour time axis, connecting consecutive valid points with a continuous line even across reporting gaps. Those lines are visual connections, not extra measurements and do not change hourly coverage calculations. Native point tooltips provide exact values. All displayed timestamps use Asia/Bangkok. The outdoor sensor is an IKEA VINDSTYRKA (Sensirion SEN54).

The original Thai disclaimer is preserved verbatim in the page footer.
