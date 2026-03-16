/* ============================================================
   Marjal dels Moros – Satellite Seasonal Time Series
   ============================================================
   Temporal resolution: three snapshots per year capturing the
   seasonal peaks and troughs of vegetation and water extent
   for this Mediterranean wetland (Valencia, Spain).

     02 – February : peak water / winter flooding
     05 – May      : peak vegetation (spring green-up)
     08 – August   : summer drought minimum (both indices low)
   ============================================================ */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const START_YEAR     = 1984;
    const END_YEAR       = 2024;
    const SEASONAL_MONTHS = [2, 5, 8];   // Feb, May, Aug
    const MONTH_LABELS   = { 2: 'Feb', 5: 'May', 8: 'Aug' };
    const MONTH_DESC     = {
        2: 'Peak water / winter flooding',
        5: 'Peak vegetation (spring)',
        8: 'Summer drought minimum',
    };
    const CENTER         = [39.64, -0.34];
    const ZOOM           = 13;
    let   IMAGE_BOUNDS   = null;

    // ── Build ordered frame list ───────────────────────────────
    // frames() returns [{year, month}, ...] sorted chronologically.
    function frames() {
        const list = [];
        for (let y = START_YEAR; y <= END_YEAR; y++) {
            for (const m of SEASONAL_MONTHS) {
                list.push({ year: y, month: m });
            }
        }
        return list;
    }
    const FRAMES = frames();
    const TOTAL_FRAMES = FRAMES.length;

    function frameKey(year, month) {
        return `${year}_${String(month).padStart(2, '0')}`;
    }

    function imgPath(idx, year, month) {
        return `data/images/${idx}/${frameKey(year, month)}.png`;
    }

    function frameLabel(year, month) {
        return `${MONTH_LABELS[month]} ${year}`;
    }

    // ── State ──────────────────────────────────────────────────
    const state = {
        frameIndex: 0,           // index into FRAMES
        get year()  { return FRAMES[this.frameIndex].year;  },
        get month() { return FRAMES[this.frameIndex].month; },
        index: 'ndvi',           // 'ndvi' | 'ndwi'
        playing: false,
        speed: 500,
        compareMode: false,
        compareFrameIndex: TOTAL_FRAMES - 1,
        get compareYear()  { return FRAMES[this.compareFrameIndex].year;  },
        get compareMonth() { return FRAMES[this.compareFrameIndex].month; },
        images: { ndvi: {}, ndwi: {} },
        overlays:  { ndvi: {}, ndwi: {} },
        overlays2: { ndvi: {}, ndwi: {} },
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
        els.overlay          = $('#loading-overlay');
        els.status           = $('#loading-status');
        els.progress         = $('#progress-fill');
        els.loadCount        = $('#loading-count');
        els.frameLabel       = $('#current-year');
        els.monthDesc        = $('#month-desc');
        els.slider           = $('#year-slider');
        els.playBtn          = $('#btn-play');
        els.speedSlider      = $('#speed-slider');
        els.btnNdvi          = $('#btn-ndvi');
        els.btnNdwi          = $('#btn-ndwi');
        els.btnCompare       = $('#btn-compare');
        els.comparePanel     = $('#map-panel-2');
        els.compareSlider    = $('#compare-slider');
        els.compareYearLabel = $('#compare-year-label');
        els.contentGrid      = $('#content-grid');
        els.legend           = $('#legend');
        els.extraStats       = $('#extra-stats');
    }

    // ── CSV parser ─────────────────────────────────────────────
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        const hdr   = lines[0].split(',');
        return lines.slice(1).map(l => {
            const vals = l.split(',');
            const obj  = {};
            hdr.forEach((h, i) => {
                const v = vals[i];
                obj[h.trim()] = isNaN(v) ? v : +v;
            });
            return obj;
        });
    }

    // ── Preload all seasonal images ────────────────────────────
    function preloadImages() {
        return new Promise((resolve) => {
            const total = TOTAL_FRAMES * 2;
            let loaded  = 0;
            function tick() {
                loaded++;
                els.progress.style.width = `${(loaded / total) * 100}%`;
                els.loadCount.textContent = `${loaded} / ${total} images`;
                if (loaded === total) resolve();
            }
            FRAMES.forEach(({ year, month }) => {
                ['ndvi', 'ndwi'].forEach(idx => {
                    const img = new Image();
                    img.onload  = tick;
                    img.onerror = tick;
                    img.src     = imgPath(idx, year, month);
                    state.images[idx][frameKey(year, month)] = img;
                });
            });
        });
    }

    // ── Load CSV + GeoJSON ─────────────────────────────────────
    function boundsFromGeoJSON(geojson) {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        function walk(coords) {
            if (typeof coords[0] === 'number') {
                minLng = Math.min(minLng, coords[0]);
                maxLng = Math.max(maxLng, coords[0]);
                minLat = Math.min(minLat, coords[1]);
                maxLat = Math.max(maxLat, coords[1]);
            } else {
                coords.forEach(walk);
            }
        }
        geojson.features.forEach(f => walk(f.geometry.coordinates));
        return [[minLat, minLng], [maxLat, maxLng]];
    }

    async function loadData() {
        els.status.textContent = 'Loading statistics...';
        const [ndviText, ndwiText, boundaryText] = await Promise.all([
            fetch('data/ndvi_stats.csv').then(r => r.text()),
            fetch('data/ndwi_stats.csv').then(r => r.text()),
            fetch('data/boundary.geojson').then(r => r.text()),
        ]);
        state.stats.ndvi = parseCSV(ndviText);
        state.stats.ndwi = parseCSV(ndwiText);
        state.boundary   = JSON.parse(boundaryText);

        try {
            const boundsResp = await fetch('data/bounds.json');
            if (boundsResp.ok) {
                const b      = await boundsResp.json();
                IMAGE_BOUNDS = [[b.south, b.west], [b.north, b.east]];
            } else {
                throw new Error('no bounds.json');
            }
        } catch {
            IMAGE_BOUNDS = boundsFromGeoJSON(state.boundary);
        }
    }

    // ── Map setup ──────────────────────────────────────────────
    let map, map2, boundaryLayer, boundaryLayer2;

    function initMaps() {
        const tileUrl  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        const tileAttr = '&copy; OpenStreetMap &copy; CARTO';

        map = L.map('map', { zoomControl: true, minZoom: 11, maxZoom: 13 })
               .setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { attribution: tileAttr, maxZoom: 18 }).addTo(map);

        boundaryLayer = L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map);

        FRAMES.forEach(({ year, month }) => {
            ['ndvi', 'ndwi'].forEach(idx => {
                const overlay = L.imageOverlay(imgPath(idx, year, month), IMAGE_BOUNDS,
                                               { opacity: 0, interactive: false });
                overlay.addTo(map);
                state.overlays[idx][frameKey(year, month)] = overlay;
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
            icon: L.divIcon({
                className: 'minimap-marker',
                html: '<div style="width:10px;height:10px;background:#fbbf24;border-radius:50%;border:2px solid #fff;"></div>'
            })
        }).addTo(minimap);

        map.on('click', (e) => {
            L.popup()
             .setLatLng(e.latlng)
             .setContent(
                 `<b>${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</b><br>` +
                 `Index: ${state.index.toUpperCase()}<br>` +
                 `${frameLabel(state.year, state.month)}`
             )
             .openOn(map);
        });
    }

    function initCompareMap() {
        if (map2) return;
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        map2 = L.map('map2', { zoomControl: true, minZoom: 11, maxZoom: 13 })
                .setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map2);
        boundaryLayer2 = L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map2);

        FRAMES.forEach(({ year, month }) => {
            ['ndvi', 'ndwi'].forEach(idx => {
                const overlay = L.imageOverlay(imgPath(idx, year, month), IMAGE_BOUNDS, { opacity: 0 });
                overlay.addTo(map2);
                state.overlays2[idx][frameKey(year, month)] = overlay;
            });
        });

        map.on('move', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
        map.on('zoom', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
    }

    // ── Show overlay ───────────────────────────────────────────
    function showFrame(fi, idx) {
        FRAMES.forEach(({ year, month }) => {
            ['ndvi', 'ndwi'].forEach(i => {
                state.overlays[i][frameKey(year, month)].setOpacity(0);
            });
        });
        const { year, month } = FRAMES[fi];
        state.overlays[idx][frameKey(year, month)].setOpacity(0.85);
    }

    function showCompareFrame(fi, idx) {
        FRAMES.forEach(({ year, month }) => {
            ['ndvi', 'ndwi'].forEach(i => {
                state.overlays2[i][frameKey(year, month)].setOpacity(0);
            });
        });
        const { year, month } = FRAMES[fi];
        state.overlays2[idx][frameKey(year, month)].setOpacity(0.85);
    }

    // ── Chart ──────────────────────────────────────────────────
    function initChart() {
        const ctx = $('#timeseries-chart').getContext('2d');
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels:   [],
                datasets: [
                    {
                        label: 'Mean',
                        data: [],
                        borderColor: '#3b9eff',
                        backgroundColor: 'rgba(59,158,255,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 1.5,
                        pointHoverRadius: 5,
                    },
                    {
                        label: 'Annual trend',
                        data: [],
                        borderColor: 'rgba(251,191,36,0.5)',
                        borderDash: [6, 4],
                        pointRadius: 0,
                        tension: 0,
                        fill: false,
                    },
                    {
                        label: 'Current frame',
                        data: [],
                        pointRadius: 7,
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
                animation: { duration: 100 },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#8899aa', boxWidth: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: (items) => items[0]?.label || '',
                        }
                    },
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#8899aa',
                            maxTicksLimit: 14,
                            // Show only year ticks (first month of each year group)
                            callback: function(val, idx) {
                                const lbl = this.getLabelForValue(val);
                                return lbl && lbl.startsWith('Feb') ? lbl.slice(4) : null;
                            }
                        },
                        grid: { color: 'rgba(38,58,78,0.5)' }
                    },
                    y: {
                        ticks: { color: '#8899aa' },
                        grid:  { color: 'rgba(38,58,78,0.5)' }
                    }
                }
            }
        });
    }

    function linearTrend(xs, ys) {
        const n = xs.length;
        if (n < 2) return ys.map(() => ys[0]);
        const sx  = xs.reduce((a, b) => a + b, 0);
        const sy  = ys.reduce((a, b) => a + b, 0);
        const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
        const sxx = xs.reduce((a, x) => a + x * x, 0);
        const m   = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const b   = (sy - m * sx) / n;
        return xs.map(x => m * x + b);
    }

    function updateChart() {
        const data   = state.stats[state.index];
        // Build labels in chronological order: "Feb 1984", "May 1984", "Aug 1984", ...
        const labels = data.map(d => `${MONTH_LABELS[+d.month]} ${d.year}`);
        const means  = data.map(d => d.mean);
        // Trend line over frame index
        const xs     = data.map((_, i) => i);
        const trend  = linearTrend(xs, means);

        const highlight = new Array(data.length).fill(null);
        const ci = data.findIndex(d => d.year === state.year && +d.month === state.month);
        if (ci >= 0) highlight[ci] = means[ci];

        const ds = state.chart.data.datasets;
        state.chart.data.labels = labels;
        ds[0].data  = means;
        ds[0].label = state.index === 'ndvi' ? 'Mean NDVI' : 'Mean NDWI';
        ds[0].borderColor     = state.index === 'ndvi' ? '#34d399' : '#38bdf8';
        ds[0].backgroundColor = state.index === 'ndvi'
            ? 'rgba(52,211,153,0.1)' : 'rgba(56,189,248,0.1)';
        ds[1].data  = trend;
        ds[2].data  = highlight;
        state.chart.update();
    }

    // ── Stats cards ────────────────────────────────────────────
    function updateStats() {
        const data = state.stats[state.index];
        const row  = data.find(d => d.year === state.year && +d.month === state.month);
        if (!row) return;
        $('#stat-mean').textContent   = row.mean.toFixed(3);
        $('#stat-median').textContent = row.median.toFixed(3);
        $('#stat-range').textContent  = `${row.min.toFixed(3)} / ${row.max.toFixed(3)}`;
        $('#stat-std').textContent    = row.std.toFixed(3);

        if (state.index === 'ndwi' && row.water_area_ha !== undefined) {
            els.extraStats.innerHTML =
                `Water area: <strong>${(+row.water_area_ha).toFixed(0)} ha</strong>` +
                ` · Wetland coverage: <strong>${(+row.wetland_coverage_pct).toFixed(1)}%</strong>`;
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
        if (params.has('year') && params.has('month')) {
            const y = +params.get('year');
            const m = +params.get('month');
            const fi = FRAMES.findIndex(f => f.year === y && f.month === m);
            if (fi >= 0) state.frameIndex = fi;
        } else if (params.has('year')) {
            const y  = +params.get('year');
            const fi = FRAMES.findIndex(f => f.year === y);
            if (fi >= 0) state.frameIndex = fi;
        }
        if (params.has('index') && ['ndvi', 'ndwi'].includes(params.get('index'))) {
            state.index = params.get('index');
        }
    }

    function writeHash() {
        history.replaceState(null, '',
            `#year=${state.year}&month=${state.month}&index=${state.index}`);
    }

    // ── Master update ──────────────────────────────────────────
    function update() {
        const lbl = frameLabel(state.year, state.month);
        els.frameLabel.textContent = lbl;
        if (els.monthDesc) {
            els.monthDesc.textContent = MONTH_DESC[state.month] || '';
        }
        els.slider.value = state.frameIndex;
        showFrame(state.frameIndex, state.index);
        if (state.compareMode) showCompareFrame(state.compareFrameIndex, state.index);
        updateChart();
        updateStats();
        updateLegend();
        writeHash();

        // Highlight active jump btn
        $$('.jump-btn').forEach(b => {
            const fi = +b.dataset.frame;
            b.classList.toggle('active', fi === state.frameIndex);
        });
    }

    // ── Animation ──────────────────────────────────────────────
    function play() {
        state.playing = true;
        els.playBtn.textContent = '⏸';
        state.animTimer = setInterval(() => {
            state.frameIndex = state.frameIndex >= TOTAL_FRAMES - 1 ? 0 : state.frameIndex + 1;
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
        els.slider.addEventListener('input', () => {
            state.frameIndex = +els.slider.value;
            update();
        });

        els.playBtn.addEventListener('click', () => state.playing ? pause() : play());

        els.speedSlider.addEventListener('input', () => {
            state.speed = +els.speedSlider.value;
            if (state.playing) { pause(); play(); }
        });

        els.btnNdvi.addEventListener('click', () => { state.index = 'ndvi'; setActiveToggle(); update(); });
        els.btnNdwi.addEventListener('click', () => { state.index = 'ndwi'; setActiveToggle(); update(); });

        $$('.jump-btn').forEach(b => b.addEventListener('click', () => {
            state.frameIndex = +b.dataset.frame;
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
            state.compareFrameIndex = +els.compareSlider.value;
            const { year, month } = FRAMES[state.compareFrameIndex];
            els.compareYearLabel.textContent = frameLabel(year, month);
            showCompareFrame(state.compareFrameIndex, state.index);
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                state.frameIndex = Math.min(TOTAL_FRAMES - 1, state.frameIndex + 1);
                update();
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                state.frameIndex = Math.max(0, state.frameIndex - 1);
                update();
            }
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

        els.overlay.classList.add('hidden');
        setTimeout(() => els.overlay.remove(), 600);
        setTimeout(() => map.invalidateSize(), 200);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
