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
    let IMAGE_BOUNDS = null;

    // Timeline event annotations
    const TIMELINE_EVENTS = [
        { year: 1994, label: 'Protected', description: 'Wetland designated as protected area by Generalitat Valenciana' },
        { year: 2005, label: 'Drought', description: 'Major drought year across the Iberian Peninsula with severe water stress' },
        { year: 2012, label: 'Parc Sagunt', description: 'Industrial expansion begins at Parc Sagunt adjacent to wetland' },
        { year: 2024, label: 'DANA', description: 'DANA floods (October 29) – catastrophic rainfall event across Valencia region' },
    ];

    // Layer colors for multi-variable chart
    const LAYER_COLORS = {
        NDVI: '#34d399', NDWI: '#38bdf8', EVI: '#a78bfa',
        MNDWI: '#2dd4bf', NDMI: '#f59e0b', LST: '#f87171',
        ET: '#fb923c', Precipitation: '#60a5fa',
    };

    // ── State ──────────────────────────────────────────────────
    const state = {
        year: START_YEAR,
        index: 'ndvi',
        playing: false,
        speed: 500,
        compareMode: false,
        compareYear: END_YEAR,
        images: { ndvi: {}, ndwi: {} },
        overlays: { ndvi: {}, ndwi: {} },
        overlays2: { ndvi: {}, ndwi: {} },
        stats: { ndvi: [], ndwi: [] },
        boundary: null,
        chart: null,
        animTimer: null,
        // Metadata
        layerDescriptions: null,
        allLayerStats: [],
        allStatsIndex: {},
        qualityData: [],
        qualityIndex: {},
        mvChart: null,
        mvSelectedLayers: ['NDVI', 'NDWI'],
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
        // New elements
        els.modal = $('#layer-info-modal');
        els.modalTitle = $('#modal-title');
        els.modalBody = $('#modal-body');
        els.modalClose = $('#modal-close');
        els.statsPanel = $('#stats-panel');
        els.statsPanelBody = $('#stats-panel-body');
        els.statsPanelClose = $('#stats-panel-close');
        els.btnStatsToggle = $('#btn-stats-toggle');
        els.btnChartToggle = $('#btn-chart-toggle');
        els.btnExport = $('#btn-export');
        els.exportMenu = $('#export-menu');
        els.mvChartPanel = $('#mv-chart-panel');
        els.mvChartControls = $('#mv-chart-controls');
        els.mvChartClose = $('#mv-chart-close');
        els.timelineEvents = $('#timeline-events');
        els.timelineQuality = $('#timeline-quality');
        els.timelineTooltip = $('#timeline-tooltip');
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

    // ── Load data ──────────────────────────────────────────────
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
        state.boundary = JSON.parse(boundaryText);

        try {
            const boundsResp = await fetch('data/bounds.json');
            if (boundsResp.ok) {
                const b = await boundsResp.json();
                IMAGE_BOUNDS = [[b.south, b.west], [b.north, b.east]];
            } else {
                throw new Error('no bounds.json');
            }
        } catch {
            IMAGE_BOUNDS = boundsFromGeoJSON(state.boundary);
        }
    }

    // ── Load metadata ──────────────────────────────────────────
    async function loadMetadata() {
        els.status.textContent = 'Loading metadata...';
        try {
            const [descResp, statsText, qualityText] = await Promise.all([
                fetch('metadata/layer_descriptions.json').then(r => r.ok ? r.json() : null),
                fetch('metadata/all_layers_stats.csv').then(r => r.ok ? r.text() : ''),
                fetch('metadata/data_quality.csv').then(r => r.ok ? r.text() : ''),
            ]);

            if (descResp) state.layerDescriptions = descResp;

            if (statsText) {
                state.allLayerStats = parseCSV(statsText);
                state.allLayerStats.forEach(row => {
                    const key = `${row.layer}_${row.year}`;
                    state.allStatsIndex[key] = row;
                });
            }

            if (qualityText) {
                state.qualityData = parseCSV(qualityText);
                state.qualityData.forEach(row => {
                    state.qualityIndex[row.year] = row;
                });
            }
        } catch (e) {
            console.warn('Metadata loading failed (non-critical):', e);
        }
    }

    // ── Map setup ──────────────────────────────────────────────
    let map, map2, boundaryLayer, boundaryLayer2;

    function initMaps() {
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        const tileAttr = '&copy; OpenStreetMap &copy; CARTO';

        map = L.map('map', {
            zoomControl: true,
            minZoom: 11,
            maxZoom: 13
        }).setView(CENTER, ZOOM);

        L.tileLayer(tileUrl, { attribution: tileAttr, maxZoom: 18 }).addTo(map);

        boundaryLayer = L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map);

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

        // Enhanced click inspector
        map.on('click', onMapClick);
    }

    function initCompareMap() {
        if (map2) return;
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        map2 = L.map('map2', {
            zoomControl: true,
            minZoom: 11,
            maxZoom: 13
        }).setView(CENTER, ZOOM);
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

        map.on('move', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
        map.on('zoom', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
    }

    // ── Show / hide overlay ────────────────────────────────────
    function showYear(year, idx) {
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
                        fill: true, tension: 0.3,
                        pointRadius: 2, pointHoverRadius: 5,
                    },
                    {
                        label: 'Trend',
                        data: [],
                        borderColor: 'rgba(251,191,36,0.6)',
                        borderDash: [6, 4],
                        pointRadius: 0, tension: 0, fill: false,
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

    // ══════════════════════════════════════════════════════════
    // FEATURE 1: Layer Information Cards
    // ══════════════════════════════════════════════════════════

    function showLayerInfo(layerId) {
        if (!state.layerDescriptions) return;
        const layer = state.layerDescriptions.layers.find(l => l.id === layerId || l.name === layerId);
        if (!layer) return;

        els.modalTitle.textContent = `${layer.name} – ${layer.full_name}`;

        let html = '';
        const rows = [
            ['Resolution:', layer.resolution],
            ['Source:', layer.source],
            ['Available:', `${layer.years} (${layer.year_count} years)`],
            ['Range:', layer.range],
            ['Formula:', layer.bands],
        ];
        rows.forEach(([label, value]) => {
            html += `<div class="info-row"><span class="info-label">${label}</span> <span class="info-value">${value}</span></div>`;
        });

        html += `<div class="section-title">Description</div>`;
        html += `<div class="description-text">${layer.description}</div>`;

        if (layer.use_cases && layer.use_cases.length) {
            html += `<div class="section-title">Use Cases</div>`;
            html += `<ul class="use-case-list">${layer.use_cases.map(u => `<li>${u}</li>`).join('')}</ul>`;
        }

        els.modalBody.innerHTML = html;
        els.modal.classList.remove('hidden');
    }

    function closeModal() {
        els.modal.classList.add('hidden');
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 2: Current View Statistics Panel
    // ══════════════════════════════════════════════════════════

    function updateStatsPanel() {
        if (!state.allLayerStats.length) {
            els.statsPanelBody.innerHTML = '<p style="color:var(--text-dim)">No metadata loaded.</p>';
            return;
        }

        const yr = state.year;
        const activeLayer = state.index.toUpperCase();
        const layersToShow = [activeLayer];
        // Also show counterpart
        if (activeLayer === 'NDVI') layersToShow.push('NDWI');
        else layersToShow.push('NDVI');

        let html = `<div style="font-size:0.85rem;color:var(--accent);margin-bottom:0.75rem;">Year: ${yr}</div>`;

        layersToShow.forEach(layerName => {
            const current = state.allStatsIndex[`${layerName}_${yr}`];
            const prev = state.allStatsIndex[`${layerName}_${yr - 1}`];
            const first = state.allStatsIndex[`${layerName}_${START_YEAR}`];

            if (!current) return;

            const isTemp = layerName === 'LST';
            const isPrecip = layerName === 'Precipitation';
            const unit = isTemp ? '\u00b0C' : isPrecip ? ' mm' : '';
            const decimals = isTemp || isPrecip ? 1 : 3;

            html += `<div class="stats-layer-block">`;
            html += `<div class="stats-layer-name">${layerName} <span class="layer-label">${getLayerFullName(layerName)}</span></div>`;
            html += `<div class="stats-row"><span class="stats-key">Mean</span><span class="stats-val">${current.mean.toFixed(decimals)}${unit}</span></div>`;
            html += `<div class="stats-row"><span class="stats-key">Range</span><span class="stats-val">${current.min.toFixed(decimals)} – ${current.max.toFixed(decimals)}${unit}</span></div>`;
            html += `<div class="stats-row"><span class="stats-key">Std Dev</span><span class="stats-val">${current.stdDev.toFixed(decimals)}</span></div>`;

            // Year-over-year change
            if (prev) {
                const diff = current.mean - prev.mean;
                const pct = prev.mean !== 0 ? ((diff / Math.abs(prev.mean)) * 100) : 0;
                const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2194';
                const cls = diff > 0 ? (isTemp ? 'negative' : 'positive') : (isTemp ? 'positive' : 'negative');
                if (isTemp || isPrecip) {
                    html += `<div class="stats-change ${cls}">vs ${yr - 1}: ${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(decimals)}${unit}</div>`;
                } else {
                    html += `<div class="stats-change ${cls}">vs ${yr - 1}: ${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(3)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)</div>`;
                }
            }

            // Long-term trend
            if (first && yr !== START_YEAR) {
                const ltDiff = current.mean - first.mean;
                const ltPct = first.mean !== 0 ? ((ltDiff / Math.abs(first.mean)) * 100) : 0;
                const ltArrow = ltDiff > 0 ? '\u2191' : ltDiff < 0 ? '\u2193' : '\u2194';
                if (isTemp || isPrecip) {
                    html += `<div class="stats-trend">${END_YEAR - START_YEAR}-yr trend: ${ltArrow} ${ltDiff > 0 ? '+' : ''}${ltDiff.toFixed(decimals)}${unit}</div>`;
                } else {
                    html += `<div class="stats-trend">${END_YEAR - START_YEAR}-yr trend: ${ltArrow} ${ltDiff > 0 ? '+' : ''}${ltDiff.toFixed(3)} (${ltPct > 0 ? '+' : ''}${ltPct.toFixed(1)}%)</div>`;
                }
            }

            html += `</div>`;
        });

        els.statsPanelBody.innerHTML = html;
    }

    function getLayerFullName(name) {
        if (!state.layerDescriptions) return '';
        const l = state.layerDescriptions.layers.find(l => l.name === name || l.id === name.toLowerCase());
        return l ? l.full_name : '';
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 3: Data Quality Indicators
    // ══════════════════════════════════════════════════════════

    function getQualityLevel(row) {
        if (!row || row.scene_count === 0) return 'gap';
        if (row.scene_count > 10 && row.mean_cloud_cover < 10) return 'high';
        if (row.scene_count >= 5 && row.mean_cloud_cover <= 20) return 'medium';
        return 'low';
    }

    function getQualityLabel(level) {
        return { high: 'High', medium: 'Medium', low: 'Low', gap: 'No Data' }[level];
    }

    function renderQualityDots() {
        if (!state.qualityData.length) return;
        const container = els.timelineQuality;
        container.innerHTML = '';

        years().forEach(yr => {
            const row = state.qualityIndex[yr];
            const level = getQualityLevel(row);
            const dot = document.createElement('div');
            dot.className = `quality-dot quality-${level}`;
            dot.dataset.year = yr;

            dot.addEventListener('mouseenter', (e) => showQualityTooltip(e, yr, row, level));
            dot.addEventListener('mouseleave', hideTooltip);
            dot.addEventListener('click', () => { state.year = yr; update(); });

            container.appendChild(dot);
        });
    }

    function showQualityTooltip(e, yr, row, level) {
        const tt = els.timelineTooltip;
        const colorMap = { high: 'var(--green)', medium: 'var(--yellow)', low: 'var(--red)', gap: 'var(--text-dim)' };

        let html = `<div class="tt-year">Year: ${yr}</div>`;
        html += `<div class="tt-quality">Quality: <span style="color:${colorMap[level]}">${getQualityLabel(level)}</span></div>`;
        if (row) {
            html += `<div class="tt-detail">${row.scene_count} scenes used</div>`;
            html += `<div class="tt-detail">${row.mean_cloud_cover.toFixed(1)}% avg cloud cover</div>`;
            if (row.first_acquisition && row.last_acquisition) {
                html += `<div class="tt-detail">${row.first_acquisition} to ${row.last_acquisition}</div>`;
            }
        }

        tt.innerHTML = html;
        tt.classList.remove('hidden');
        const rect = e.target.getBoundingClientRect();
        tt.style.left = `${rect.left - 40}px`;
        tt.style.top = `${rect.bottom + 8}px`;
    }

    function hideTooltip() {
        els.timelineTooltip.classList.add('hidden');
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 4: Multi-Variable Time Series Chart
    // ══════════════════════════════════════════════════════════

    function initMvChartControls() {
        const allLayers = ['NDVI', 'NDWI', 'EVI', 'MNDWI', 'NDMI', 'LST', 'ET', 'Precipitation'];
        const container = els.mvChartControls;
        container.innerHTML = '';

        allLayers.forEach(name => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = name;
            cb.checked = state.mvSelectedLayers.includes(name);
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    state.mvSelectedLayers.push(name);
                } else {
                    state.mvSelectedLayers = state.mvSelectedLayers.filter(n => n !== name);
                }
                updateMvChart();
            });
            const colorDot = document.createElement('span');
            colorDot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${LAYER_COLORS[name] || '#999'};`;
            label.appendChild(cb);
            label.appendChild(colorDot);
            label.appendChild(document.createTextNode(' ' + name));
            container.appendChild(label);
        });
    }

    function initMvChart() {
        const ctx = $('#mv-chart').getContext('2d');
        state.mvChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { color: '#8899aa', boxWidth: 10, font: { size: 10 } } },
                    tooltip: { mode: 'index', intersect: false },
                    annotation: {
                        annotations: {
                            currentYear: {
                                type: 'line',
                                xMin: state.year,
                                xMax: state.year,
                                borderColor: 'rgba(248,113,113,0.7)',
                                borderWidth: 2,
                                borderDash: [4, 4],
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#8899aa', maxTicksLimit: 12 }, grid: { color: 'rgba(38,58,78,0.3)' } },
                    y: {
                        type: 'linear', position: 'left',
                        title: { display: true, text: 'Index Value', color: '#8899aa', font: { size: 10 } },
                        ticks: { color: '#8899aa' }, grid: { color: 'rgba(38,58,78,0.3)' }
                    },
                    y2: {
                        type: 'linear', position: 'right',
                        title: { display: true, text: 'Temp (\u00b0C) / Precip (mm)', color: '#8899aa', font: { size: 10 } },
                        ticks: { color: '#8899aa' }, grid: { display: false },
                    }
                }
            }
        });
    }

    function updateMvChart() {
        if (!state.mvChart || !state.allLayerStats.length) return;

        const yrs = years();
        const rightAxisLayers = ['LST', 'ET', 'Precipitation'];
        const datasets = [];

        state.mvSelectedLayers.forEach(layerName => {
            const data = yrs.map(yr => {
                const row = state.allStatsIndex[`${layerName}_${yr}`];
                return row ? row.mean : null;
            });
            datasets.push({
                label: layerName,
                data: data,
                borderColor: LAYER_COLORS[layerName] || '#999',
                backgroundColor: 'transparent',
                tension: 0.3,
                pointRadius: 1.5,
                pointHoverRadius: 5,
                borderWidth: 2,
                yAxisID: rightAxisLayers.includes(layerName) ? 'y2' : 'y',
                spanGaps: true,
            });
        });

        state.mvChart.data.labels = yrs;
        state.mvChart.data.datasets = datasets;

        // Update annotation for current year
        if (state.mvChart.options.plugins.annotation) {
            state.mvChart.options.plugins.annotation.annotations.currentYear.xMin = state.year;
            state.mvChart.options.plugins.annotation.annotations.currentYear.xMax = state.year;
        }

        state.mvChart.update();
    }

    function exportMvChartCSV() {
        const yrs = years();
        const headers = ['year', ...state.mvSelectedLayers];
        let csv = headers.join(',') + '\n';
        yrs.forEach(yr => {
            const row = [yr];
            state.mvSelectedLayers.forEach(name => {
                const s = state.allStatsIndex[`${name}_${yr}`];
                row.push(s ? s.mean : '');
            });
            csv += row.join(',') + '\n';
        });
        downloadFile('marjal_timeseries.csv', csv, 'text/csv');
    }

    function exportMvChartPNG() {
        if (!state.mvChart) return;
        const url = state.mvChart.toBase64Image();
        const a = document.createElement('a');
        a.href = url;
        a.download = 'marjal_timeseries.png';
        a.click();
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 5: Enhanced Click Inspector
    // ══════════════════════════════════════════════════════════

    function onMapClick(e) {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);
        const yr = state.year;
        const idx = state.index.toUpperCase();

        let html = `<div class="click-popup">`;
        html += `<div class="popup-title">${lat}\u00b0N, ${Math.abs(lng)}\u00b0W</div>`;

        // Current year values from all_layers_stats
        const current = state.allStatsIndex[`${idx}_${yr}`];
        const isTemp = idx === 'LST';
        const isPrecip = idx === 'Precipitation';
        const unit = isTemp ? '\u00b0C' : isPrecip ? ' mm' : '';
        const dec = isTemp || isPrecip ? 1 : 3;

        html += `<div><strong>Year ${yr} — ${idx}:</strong></div>`;
        if (current) {
            html += `<div class="popup-row"><span>Mean:</span><span>${current.mean.toFixed(dec)}${unit}</span></div>`;
            html += `<div class="popup-row"><span>Range:</span><span>${current.min.toFixed(dec)} – ${current.max.toFixed(dec)}${unit}</span></div>`;
        }

        // Show other active index too
        const otherIdx = idx === 'NDVI' ? 'NDWI' : 'NDVI';
        const other = state.allStatsIndex[`${otherIdx}_${yr}`];
        if (other) {
            html += `<div class="popup-row"><span>${otherIdx}:</span><span>${other.mean.toFixed(3)}</span></div>`;
        }

        // Long-term trend
        const first = state.allStatsIndex[`${idx}_${START_YEAR}`];
        if (current && first) {
            const diff = current.mean - first.mean;
            const pct = first.mean !== 0 ? ((diff / Math.abs(first.mean)) * 100) : 0;
            const arrow = diff >= 0 ? '\u2191' : '\u2193';
            const cls = diff >= 0 ? 'up' : 'down';
            html += `<div class="popup-section">`;
            html += `<div class="popup-section-title">40-Year Trend</div>`;
            if (isTemp || isPrecip) {
                html += `<div class="popup-trend ${cls}">${idx}: ${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(dec)}${unit}</div>`;
            } else {
                html += `<div class="popup-trend ${cls}">${idx}: ${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(3)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)</div>`;
            }
            html += `</div>`;
        }

        // Quality indicator for this year
        const q = state.qualityIndex[yr];
        if (q) {
            const level = getQualityLevel(q);
            html += `<div style="font-size:0.7rem;color:#8899aa;margin-top:4px;">Data quality: ${getQualityLabel(level)} (${q.scene_count} scenes)</div>`;
        }

        html += `</div>`;

        L.popup({ maxWidth: 280 })
            .setLatLng(e.latlng)
            .setContent(html)
            .openOn(map);
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 6: Timeline Event Annotations
    // ══════════════════════════════════════════════════════════

    function renderTimelineEvents() {
        const container = els.timelineEvents;
        container.innerHTML = '';
        const totalYears = END_YEAR - START_YEAR;

        TIMELINE_EVENTS.forEach(evt => {
            const pct = ((evt.year - START_YEAR) / totalYears) * 100;
            const marker = document.createElement('div');
            marker.className = 'event-marker';
            marker.style.left = `${pct}%`;
            marker.dataset.label = evt.label;

            marker.addEventListener('mouseenter', (e) => {
                const tt = els.timelineTooltip;
                tt.innerHTML = `<div class="tt-year">${evt.year}: ${evt.label}</div><div class="tt-detail">${evt.description}</div>`;
                tt.classList.remove('hidden');
                const rect = e.target.getBoundingClientRect();
                tt.style.left = `${rect.left - 40}px`;
                tt.style.top = `${rect.top - 60}px`;
            });
            marker.addEventListener('mouseleave', hideTooltip);
            marker.addEventListener('click', () => { state.year = evt.year; update(); });

            container.appendChild(marker);
        });
    }

    // ══════════════════════════════════════════════════════════
    // FEATURE 7: Export with Metadata
    // ══════════════════════════════════════════════════════════

    function downloadFile(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportViewPNG() {
        // Use leaflet's built-in canvas export via html2canvas fallback
        // Simple approach: capture the map container
        const mapEl = document.getElementById('map');
        if (typeof html2canvas !== 'undefined') {
            html2canvas(mapEl).then(canvas => {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = `marjal_${state.index}_${state.year}.png`;
                a.click();
            });
        } else {
            // Fallback: export the timeseries chart
            if (state.chart) {
                const url = state.chart.toBase64Image();
                const a = document.createElement('a');
                a.href = url;
                a.download = `marjal_chart_${state.index}_${state.year}.png`;
                a.click();
            }
        }
    }

    function exportStatsCSV() {
        const yrs = years();
        const idx = state.index;
        const data = state.stats[idx];
        if (!data.length) return;

        const headers = Object.keys(data[0]);
        let csv = `# Marjal dels Moros - ${idx.toUpperCase()} Statistics\n`;
        csv += `# Exported: ${new Date().toISOString()}\n`;
        csv += `# Years: ${START_YEAR}-${END_YEAR}\n`;
        csv += headers.join(',') + '\n';
        data.forEach(row => {
            csv += headers.map(h => row[h]).join(',') + '\n';
        });

        downloadFile(`marjal_${idx}_stats.csv`, csv, 'text/csv');
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

        $$('.jump-btn').forEach(b => b.classList.toggle('active', +b.dataset.year === state.year));

        // Update metadata panels if visible
        if (!els.statsPanel.classList.contains('hidden')) {
            updateStatsPanel();
        }
        if (!els.mvChartPanel.classList.contains('hidden')) {
            updateMvChart();
        }
    }

    // ── Animation ──────────────────────────────────────────────
    function play() {
        state.playing = true;
        els.playBtn.textContent = '\u23F8';
        state.animTimer = setInterval(() => {
            state.year = state.year >= END_YEAR ? START_YEAR : state.year + 1;
            update();
        }, state.speed);
    }

    function pause() {
        state.playing = false;
        els.playBtn.textContent = '\u25B6';
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

        els.btnNdvi.addEventListener('click', () => {
            state.index = 'ndvi'; setActiveToggle(); update();
        });
        els.btnNdwi.addEventListener('click', () => {
            state.index = 'ndwi'; setActiveToggle(); update();
        });

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

        // Info buttons
        $$('.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showLayerInfo(btn.dataset.layer);
            });
        });
        els.modalClose.addEventListener('click', closeModal);
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) closeModal();
        });

        // Stats panel toggle
        els.btnStatsToggle.addEventListener('click', () => {
            const showing = els.statsPanel.classList.toggle('hidden');
            els.btnStatsToggle.classList.toggle('active', !showing);
            if (!showing) updateStatsPanel();
        });
        els.statsPanelClose.addEventListener('click', () => {
            els.statsPanel.classList.add('hidden');
            els.btnStatsToggle.classList.remove('active');
        });

        // Multi-variable chart toggle
        els.btnChartToggle.addEventListener('click', () => {
            const showing = els.mvChartPanel.classList.toggle('hidden');
            els.btnChartToggle.classList.toggle('active', !showing);
            if (!showing) updateMvChart();
        });
        els.mvChartClose.addEventListener('click', () => {
            els.mvChartPanel.classList.add('hidden');
            els.btnChartToggle.classList.remove('active');
        });

        // MV chart export buttons
        $('#mv-export-csv').addEventListener('click', exportMvChartCSV);
        $('#mv-export-png').addEventListener('click', exportMvChartPNG);

        // Export menu
        els.btnExport.addEventListener('click', () => {
            els.exportMenu.classList.toggle('hidden');
        });
        $('#export-png').addEventListener('click', () => {
            exportViewPNG();
            els.exportMenu.classList.add('hidden');
        });
        $('#export-csv').addEventListener('click', () => {
            exportStatsCSV();
            els.exportMenu.classList.add('hidden');
        });
        // Close export menu on outside click
        document.addEventListener('click', (e) => {
            if (!els.btnExport.contains(e.target) && !els.exportMenu.contains(e.target)) {
                els.exportMenu.classList.add('hidden');
            }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { state.year = Math.min(END_YEAR, state.year + 1); update(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { state.year = Math.max(START_YEAR, state.year - 1); update(); }
            if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
            if (e.key === 'Escape') { closeModal(); els.exportMenu.classList.add('hidden'); }
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

        els.status.textContent = 'Loading metadata...';
        await loadMetadata();

        els.status.textContent = 'Preloading images...';
        await preloadImages();

        initMaps();
        initChart();

        // Initialize metadata features
        initMvChartControls();
        initMvChart();
        renderQualityDots();
        renderTimelineEvents();

        bindEvents();
        update();

        // Hide loading overlay
        els.overlay.classList.add('hidden');
        setTimeout(() => els.overlay.remove(), 600);

        setTimeout(() => map.invalidateSize(), 200);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
