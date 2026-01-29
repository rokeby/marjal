/* ============================================================
   Marjal dels Moros – Satellite Time Series Visualisation
   ============================================================ */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const START_YEAR = 1984;
    const END_YEAR = 2024;
    const CENTER = [39.64, -0.34];
    const ZOOM = 13;
    const IMAGE_BOUNDS = [[39.593, -0.408], [39.692, -0.275]];

    // ── State ──────────────────────────────────────────────────
    const state = {
        year: START_YEAR,
        index: 'ndvi',            // 'ndvi' | 'ndwi'
        playing: false,
        speed: 500,               // ms per frame
        compareMode: false,
        compareYear: END_YEAR,
        images: { ndvi: {}, ndwi: {} },     // year → Image
        overlays: { ndvi: {}, ndwi: {} },   // year → L.ImageOverlay
        overlays2: { ndvi: {}, ndwi: {} },  // compare map
        stats: { ndvi: [], ndwi: [] },
        boundary: null,
        chart: null,
        animTimer: null,
    };

    // ── DOM refs ───────────────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);
    const els = {};

    function cacheDom() {
        els.overlay = $('#loading-overlay');
        els.status = $('#loading-status');
        els.progress = $('#progress-fill');
        els.loadCount = $('#loading-count');
        els.yearLabel = $('#current-year');
        els.slider = $('#year-slider');
        els.playBtn = $('#btn-play');
        els.speedSlider = $('#speed-slider');
        els.btnNdvi = $('#btn-ndvi');
        els.btnNdwi = $('#btn-ndwi');
        els.btnCompare = $('#btn-compare');
        els.comparePanel = $('#map-panel-2');
        els.compareSlider = $('#compare-slider');
        els.compareYearLabel = $('#compare-year-label');
        els.contentGrid = $('#content-grid');
        els.legend = $('#legend');
        els.extraStats = $('#extra-stats');
    }

    // ── Helpers ────────────────────────────────────────────────
    function years() {
        const a = [];
        for (let y = START_YEAR; y <= END_YEAR; y++) a.push(y);
        return a;
    }

    function imgPath(idx, year) {
        return `data/images/${idx}/${year}.png`;
    }

    // ── CSV parser (simple) ────────────────────────────────────
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        const hdr = lines[0].split(',');
        return lines.slice(1).map(l => {
            const vals = l.split(',');
            const obj = {};
            hdr.forEach((h, i) => {
                const v = vals[i];
                obj[h.trim()] = isNaN(v) ? v : +v;
            });
            return obj;
        });
    }

    // ── Preload all images ─────────────────────────────────────
    function preloadImages() {
        return new Promise((resolve) => {
            const total = years().length * 2;
            let loaded = 0;

            function tick() {
                loaded++;
                els.progress.style.width = `${(loaded / total) * 100}%`;
                els.loadCount.textContent = `${loaded} / ${total} images`;
                if (loaded === total) resolve();
            }

            years().forEach(y => {
                ['ndvi', 'ndwi'].forEach(idx => {
                    const img = new Image();
                    img.onload = tick;
                    img.onerror = tick;
                    img.src = imgPath(idx, y);
                    state.images[idx][y] = img;
                });
            });
        });
    }

    // ── Load data (CSV + GeoJSON) ──────────────────────────────
    async function loadData() {
        els.status.textContent = 'Loading statistics...';
        const [ndviText, ndwiText, boundaryText] = await Promise.all([
            fetch('data/ndvi_stats.csv').then(r => r.text()),
            fetch('data/ndwi_stats.csv').then(r => r.text()),
            fetch('data/boundary.geojson').then(r => r.text()),
        ]);
        state.stats.ndvi = parseCSV(ndviText);
        state.stats.ndwi = parseCSV(ndwiText);
        state.boundary = JSON.parse(boundaryText);
    }

    // ── Map setup ──────────────────────────────────────────────
    let map, map2, boundaryLayer, boundaryLayer2;

    function initMaps() {
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        const tileAttr = '&copy; OpenStreetMap &copy; CARTO';

        map = L.map('map', { zoomControl: true }).setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { attribution: tileAttr, maxZoom: 18 }).addTo(map);

        // Boundary
        boundaryLayer = L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map);

        // Image overlays for all years/indices
        years().forEach(y => {
            ['ndvi', 'ndwi'].forEach(idx => {
                const overlay = L.imageOverlay(imgPath(idx, y), IMAGE_BOUNDS, { opacity: 0, interactive: false });
                overlay.addTo(map);
                state.overlays[idx][y] = overlay;
            });
        });

        // Minimap
        const minimap = L.map('minimap', {
            zoomControl: false, dragging: false,
            scrollWheelZoom: false, doubleClickZoom: false,
            attributionControl: false,
        }).setView([39.5, -0.5], 8);
        L.tileLayer(tileUrl, { maxZoom: 10 }).addTo(minimap);
        L.marker(CENTER, {
            icon: L.divIcon({ className: 'minimap-marker', html: '<div style="width:10px;height:10px;background:#fbbf24;border-radius:50%;border:2px solid #fff;"></div>' })
        }).addTo(minimap);

        // Map click → show pixel info (placeholder)
        map.on('click', function (e) {
            L.popup()
                .setLatLng(e.latlng)
                .setContent(`<b>${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</b><br>Index: ${state.index.toUpperCase()}<br>Year: ${state.year}`)
                .openOn(map);
        });
    }

    function initCompareMap() {
        if (map2) return;
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        map2 = L.map('map2', { zoomControl: false }).setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map2);
        boundaryLayer2 = L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map2);

        years().forEach(y => {
            ['ndvi', 'ndwi'].forEach(idx => {
                const overlay = L.imageOverlay(imgPath(idx, y), IMAGE_BOUNDS, { opacity: 0 });
                overlay.addTo(map2);
                state.overlays2[idx][y] = overlay;
            });
        });

        // Sync maps
        map.on('move', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
        map.on('zoom', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
    }

    // ── Show / hide overlay for a given year ───────────────────
    function showYear(year, idx) {
        // Hide all overlays
        years().forEach(y => {
            ['ndvi', 'ndwi'].forEach(i => {
                state.overlays[i][y].setOpacity(0);
            });
        });
        state.overlays[idx][year].setOpacity(0.85);
    }

    function showCompareYear(year, idx) {
        years().forEach(y => {
            ['ndvi', 'ndwi'].forEach(i => {
                state.overlays2[i][y].setOpacity(0);
            });
        });
        state.overlays2[idx][year].setOpacity(0.85);
    }

    // ── Chart ──────────────────────────────────────────────────
    function initChart() {
        const ctx = $('#timeseries-chart').getContext('2d');
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Mean',
                        data: [],
                        borderColor: '#3b9eff',
                        backgroundColor: 'rgba(59,158,255,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                    },
                    {
                        label: 'Trend',
                        data: [],
                        borderColor: 'rgba(251,191,36,0.6)',
                        borderDash: [6, 4],
                        pointRadius: 0,
                        tension: 0,
                        fill: false,
                    },
                    {
                        label: 'Current Year',
                        data: [],
                        pointRadius: 8,
                        pointBackgroundColor: '#f87171',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        showLine: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 150 },
                plugins: {
                    legend: { display: true, labels: { color: '#8899aa', boxWidth: 12, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false },
                },
                scales: {
                    x: { ticks: { color: '#8899aa', maxTicksLimit: 10 }, grid: { color: 'rgba(38,58,78,0.5)' } },
                    y: { ticks: { color: '#8899aa' }, grid: { color: 'rgba(38,58,78,0.5)' } }
                }
            }
        });
    }

    function linearTrend(ys, vs) {
        const n = vs.length;
        const sx = ys.reduce((a, b) => a + b, 0);
        const sy = vs.reduce((a, b) => a + b, 0);
        const sxy = ys.reduce((a, x, i) => a + x * vs[i], 0);
        const sxx = ys.reduce((a, x) => a + x * x, 0);
        const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const b = (sy - m * sx) / n;
        return ys.map(x => m * x + b);
    }

    function updateChart() {
        const data = state.stats[state.index];
        const yrs = data.map(d => d.year);
        const means = data.map(d => d.mean);
        const trend = linearTrend(yrs, means);
        const highlight = new Array(yrs.length).fill(null);
        const ci = yrs.indexOf(state.year);
        if (ci >= 0) highlight[ci] = means[ci];

        const ds = state.chart.data.datasets;
        state.chart.data.labels = yrs;
        ds[0].data = means;
        ds[0].label = state.index === 'ndvi' ? 'Mean NDVI' : 'Mean NDWI';
        ds[0].borderColor = state.index === 'ndvi' ? '#34d399' : '#38bdf8';
        ds[0].backgroundColor = state.index === 'ndvi' ? 'rgba(52,211,153,0.1)' : 'rgba(56,189,248,0.1)';
        ds[1].data = trend;
        ds[2].data = highlight;
        state.chart.update();
    }

    // ── Stats cards ────────────────────────────────────────────
    function updateStats() {
        const data = state.stats[state.index];
        const row = data.find(d => d.year === state.year);
        if (!row) return;
        $('#stat-mean').textContent = row.mean.toFixed(3);
        $('#stat-median').textContent = row.median.toFixed(3);
        $('#stat-range').textContent = `${row.min.toFixed(3)} / ${row.max.toFixed(3)}`;
        $('#stat-std').textContent = row.std.toFixed(3);

        // Extra stats for NDWI
        if (state.index === 'ndwi' && row.water_area_ha !== undefined) {
            els.extraStats.innerHTML = `Water area: <strong>${row.water_area_ha.toFixed(0)} ha</strong> · Wetland coverage: <strong>${row.wetland_coverage_pct.toFixed(1)}%</strong>`;
        } else {
            els.extraStats.innerHTML = '';
        }
    }

    // ── Legend ──────────────────────────────────────────────────
    function updateLegend() {
        if (state.index === 'ndvi') {
            els.legend.innerHTML = `
                <div class="legend-title">NDVI (Vegetation)</div>
                <div class="legend-bar" style="background:linear-gradient(to right,#8b4513,#f5deb3,#adff2f,#228b22,#006400)"></div>
                <div class="legend-labels"><span>-1 Bare</span><span>0</span><span>1 Dense</span></div>`;
        } else {
            els.legend.innerHTML = `
                <div class="legend-title">NDWI (Water)</div>
                <div class="legend-bar" style="background:linear-gradient(to right,#8b4513,#f5deb3,#87ceeb,#1e90ff,#00008b)"></div>
                <div class="legend-labels"><span>-1 Dry</span><span>0</span><span>1 Water</span></div>`;
        }
    }

    // ── URL hash ───────────────────────────────────────────────
    function readHash() {
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (params.has('year')) state.year = Math.max(START_YEAR, Math.min(END_YEAR, +params.get('year')));
        if (params.has('index') && ['ndvi', 'ndwi'].includes(params.get('index'))) state.index = params.get('index');
    }

    function writeHash() {
        history.replaceState(null, '', `#year=${state.year}&index=${state.index}`);
    }

    // ── Master update ──────────────────────────────────────────
    function update() {
        els.yearLabel.textContent = state.year;
        els.slider.value = state.year;
        showYear(state.year, state.index);
        if (state.compareMode) showCompareYear(state.compareYear, state.index);
        updateChart();
        updateStats();
        updateLegend();
        writeHash();

        // Highlight active jump btn
        $$('.jump-btn').forEach(b => b.classList.toggle('active', +b.dataset.year === state.year));
    }

    // ── Animation ──────────────────────────────────────────────
    function play() {
        state.playing = true;
        els.playBtn.textContent = '⏸';
        state.animTimer = setInterval(() => {
            state.year = state.year >= END_YEAR ? START_YEAR : state.year + 1;
            update();
        }, state.speed);
    }

    function pause() {
        state.playing = false;
        els.playBtn.textContent = '▶';
        clearInterval(state.animTimer);
    }

    // ── Event wiring ───────────────────────────────────────────
    function bindEvents() {
        els.slider.addEventListener('input', () => { state.year = +els.slider.value; update(); });
        els.playBtn.addEventListener('click', () => state.playing ? pause() : play());
        els.speedSlider.addEventListener('input', () => {
            state.speed = +els.speedSlider.value;
            if (state.playing) { pause(); play(); }
        });

        els.btnNdvi.addEventListener('click', () => { state.index = 'ndvi'; setActiveToggle(); update(); });
        els.btnNdwi.addEventListener('click', () => { state.index = 'ndwi'; setActiveToggle(); update(); });

        $$('.jump-btn').forEach(b => b.addEventListener('click', () => {
            state.year = +b.dataset.year;
            update();
        }));

        // Compare
        els.btnCompare.addEventListener('click', () => {
            state.compareMode = !state.compareMode;
            els.btnCompare.classList.toggle('active', state.compareMode);
            els.comparePanel.classList.toggle('hidden', !state.compareMode);
            els.contentGrid.classList.toggle('compare-mode', state.compareMode);
            if (state.compareMode) {
                initCompareMap();
                setTimeout(() => map2.invalidateSize(), 100);
            }
            setTimeout(() => map.invalidateSize(), 100);
            update();
        });

        els.compareSlider.addEventListener('input', () => {
            state.compareYear = +els.compareSlider.value;
            els.compareYearLabel.textContent = state.compareYear;
            showCompareYear(state.compareYear, state.index);
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { state.year = Math.min(END_YEAR, state.year + 1); update(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { state.year = Math.max(START_YEAR, state.year - 1); update(); }
            if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
        });
    }

    function setActiveToggle() {
        els.btnNdvi.classList.toggle('active', state.index === 'ndvi');
        els.btnNdwi.classList.toggle('active', state.index === 'ndwi');
    }

    // ── Boot ───────────────────────────────────────────────────
    async function init() {
        cacheDom();
        readHash();

        els.status.textContent = 'Loading data...';
        await loadData();

        els.status.textContent = 'Preloading images...';
        await preloadImages();

        initMaps();
        initChart();
        bindEvents();
        update();

        // Hide loading overlay
        els.overlay.classList.add('hidden');
        setTimeout(() => els.overlay.remove(), 600);

        // Fix map size after layout settles
        setTimeout(() => map.invalidateSize(), 200);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
