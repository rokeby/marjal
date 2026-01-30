/* ============================================================
   Marjal dels Moros – Satellite Time Series Visualisation
   Extended: 10 layer types, multi-overlay, blend modes,
   comparison, inspector, multi-variable charts, export
   ============================================================ */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const START_YEAR = 1984;
    const END_YEAR = 2024;
    const CENTER = [39.64, -0.34];
    const ZOOM = 13;
    const MAX_ACTIVE_LAYERS = 3;
    let IMAGE_BOUNDS = null;

    // ── Layer definitions ──────────────────────────────────────
    const LAYER_DEFS = {
        ndvi: {
            name: 'NDVI', fullName: 'Normalized Difference Vegetation Index',
            folder: 'ndvi', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: '-1 to 1',
            color: '#34d399',
            gradient: 'linear-gradient(to right,#8b4513,#f5deb3,#adff2f,#228b22,#006400)',
            labels: ['-1 Bare', '0', '1 Dense'],
            description: 'Measures vegetation greenness. Higher values indicate denser, healthier vegetation.',
        },
        ndwi: {
            name: 'NDWI', fullName: 'Normalized Difference Water Index',
            folder: 'ndwi', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: '-1 to 1',
            color: '#38bdf8',
            gradient: 'linear-gradient(to right,#8b4513,#f5deb3,#87ceeb,#1e90ff,#00008b)',
            labels: ['-1 Dry', '0', '1 Water'],
            description: 'Detects surface water. Higher values indicate open water bodies.',
        },
        evi: {
            name: 'EVI', fullName: 'Enhanced Vegetation Index',
            folder: 'evi', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: '0 to 0.8',
            color: '#22c55e',
            gradient: 'linear-gradient(to right,#8b4513,#fbbf24,#90ee90,#228b22)',
            labels: ['0 Bare', '0.4', '0.8 Dense'],
            description: 'Improved vegetation index with better sensitivity in high-biomass areas. Uses blue band to reduce atmospheric effects.',
        },
        mndwi: {
            name: 'MNDWI', fullName: 'Modified Normalized Difference Water Index',
            folder: 'mndwi', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: '-1 to 1',
            color: '#06b6d4',
            gradient: 'linear-gradient(to right,#8b4513,#fff,#87ceeb,#0000ff)',
            labels: ['-1 Dry', '0', '1 Water'],
            description: 'Better water detection than NDWI, especially in urban areas. Uses SWIR band for improved discrimination.',
        },
        ndmi: {
            name: 'NDMI', fullName: 'Normalized Difference Moisture Index',
            folder: 'ndmi', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: '-1 to 1',
            color: '#a78bfa',
            gradient: 'linear-gradient(to right,#dc2626,#fbbf24,#90ee90,#22c55e)',
            labels: ['-1 Dry', '0', '1 Moist'],
            description: 'Measures plant water stress. Lower values indicate drought stress, higher values indicate adequate moisture.',
        },
        lst: {
            name: 'LST', fullName: 'Land Surface Temperature',
            folder: 'lst', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8 Thermal', range: '10-45 C',
            color: '#f97316',
            gradient: 'linear-gradient(to right,#3b82f6,#06b6d4,#fbbf24,#f97316,#dc2626)',
            labels: ['10C', '25C', '45C'],
            description: 'Surface temperature derived from thermal infrared bands. Shows urban heat islands and water cooling effects.',
            unit: 'C',
        },
        true_color: {
            name: 'TrueColor', fullName: 'Natural Color RGB',
            folder: 'true_color', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: 'RGB',
            color: '#e0e8f0',
            gradient: 'linear-gradient(to right,#000,#888,#fff)',
            labels: ['Dark', '', 'Bright'],
            description: 'Natural color composite (Red-Green-Blue). Shows the landscape as the human eye would see it.',
            noStats: true,
        },
        false_color: {
            name: 'FalseColor', fullName: 'NIR False Color Composite',
            folder: 'false_color', startYear: 1984, endYear: 2024, resolution: '30m',
            source: 'Landsat 5/8', range: 'NIR-R-G',
            color: '#ef4444',
            gradient: 'linear-gradient(to right,#000,#ef4444,#ff0)',
            labels: ['Low', '', 'High NIR'],
            description: 'NIR-Red-Green composite. Vegetation appears bright red, water appears dark, bare soil appears tan/blue.',
            noStats: true,
        },
        precipitation: {
            name: 'Precipitation', fullName: 'Annual Rainfall',
            folder: 'precipitation', startYear: 1984, endYear: 2024, resolution: '5km',
            source: 'CHIRPS/ERA5', range: '200-800 mm',
            color: '#60a5fa',
            gradient: 'linear-gradient(to right,#dc2626,#fbbf24,#22c55e,#3b82f6)',
            labels: ['200mm', '500mm', '800mm'],
            description: 'Total annual precipitation. Shows rainfall patterns affecting wetland water levels.',
            unit: 'mm',
        },
        et: {
            name: 'ET', fullName: 'Evapotranspiration',
            folder: 'et', startYear: 2001, endYear: 2023, resolution: '500m',
            source: 'MODIS MOD16', range: '0-1200 mm/yr',
            color: '#14b8a6',
            gradient: 'linear-gradient(to right,#dc2626,#f97316,#fbbf24,#06b6d4,#3b82f6)',
            labels: ['0', '600', '1200 mm'],
            description: 'Total water lost through evaporation and plant transpiration. Higher values in vegetated wetland areas.',
            unit: 'mm/yr',
        },
    };

    const STATIC_LAYERS = {
        water_occurrence: {
            name: 'Water Occurrence', file: 'data/static/water_occurrence.png',
            gradient: 'linear-gradient(to right,#fff,#87ceeb,#3b82f6,#1e3a8a)',
            labels: ['0%', '50%', '100%'],
            description: 'Percentage of time water was detected (1984-2021). Based on JRC Global Surface Water dataset.',
        },
        water_seasonality: {
            name: 'Water Seasonality', file: 'data/static/water_seasonality.png',
            gradient: 'linear-gradient(to right,#dc2626,#f97316,#fbbf24,#06b6d4,#3b82f6)',
            labels: ['0 mo', '6 mo', '12 mo'],
            description: 'Number of months per year with water detected (1984-2021).',
        },
    };

    const ALL_LAYER_IDS = Object.keys(LAYER_DEFS);

    // ── State ──────────────────────────────────────────────────
    const state = {
        year: START_YEAR,
        playing: false,
        speed: 500,
        compareMode: false,
        compareYear: END_YEAR,
        inspectorMode: false,
        // Active layer stack (max 3): [{id, opacity, visible, blend}]
        activeLayers: [],
        // Image cache: layerId → year → Image
        imageCache: {},
        // Leaflet overlays: layerId → year → L.ImageOverlay
        overlays: {},
        overlays2: {},
        // Static overlays
        staticOverlays: {},
        staticOverlays2: {},
        // Stats: layerId → [{year, mean, ...}]
        stats: {},
        // Chart series toggles
        chartSeries: {},
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
        els.btnCompare = $('#btn-compare');
        els.btnInspector = $('#btn-inspector');
        els.comparePanel = $('#map-panel-2');
        els.compareSlider = $('#compare-slider');
        els.compareYearLabel = $('#compare-year-label');
        els.contentGrid = $('#content-grid');
        els.legend = $('#legend');
        els.extraStats = $('#extra-stats');
        els.activeLayers = $('#active-layers');
        els.addLayerSelect = $('#add-layer-select');
        els.layerCount = $('#layer-count');
        els.layerInfo = $('#layer-info');
        els.chartToggles = $('#chart-toggles');
    }

    // ── Helpers ────────────────────────────────────────────────
    function yearRange(startYear, endYear) {
        const a = [];
        for (let y = startYear; y <= endYear; y++) a.push(y);
        return a;
    }

    function allYears() { return yearRange(START_YEAR, END_YEAR); }

    function imgPath(layerId, year) {
        return `data/images/${LAYER_DEFS[layerId].folder}/${year}.png`;
    }

    function layerHasYear(layerId, year) {
        const def = LAYER_DEFS[layerId];
        return year >= def.startYear && year <= def.endYear;
    }

    // ── CSV parser ──────────────────────────────────────────────
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

    // ── Preload images for active layers ────────────────────────
    function preloadLayerImages(layerId) {
        return new Promise((resolve) => {
            if (state.imageCache[layerId]) { resolve(); return; }
            const def = LAYER_DEFS[layerId];
            const yrs = yearRange(def.startYear, def.endYear);
            state.imageCache[layerId] = {};
            let loaded = 0;
            const total = yrs.length;

            yrs.forEach(y => {
                const img = new Image();
                img.onload = () => { loaded++; if (loaded === total) resolve(); };
                img.onerror = () => { loaded++; if (loaded === total) resolve(); };
                img.src = imgPath(layerId, y);
                state.imageCache[layerId][y] = img;
            });
        });
    }

    function preloadInitialImages() {
        // Preload ndvi and ndwi at startup (the original layers)
        return new Promise((resolve) => {
            const layersToLoad = ['ndvi', 'ndwi'];
            let totalImages = 0;
            let loadedImages = 0;

            layersToLoad.forEach(id => {
                const def = LAYER_DEFS[id];
                totalImages += (def.endYear - def.startYear + 1);
            });

            els.loadCount.textContent = `0 / ${totalImages} images`;

            function tick() {
                loadedImages++;
                els.progress.style.width = `${(loadedImages / totalImages) * 100}%`;
                els.loadCount.textContent = `${loadedImages} / ${totalImages} images`;
                if (loadedImages === totalImages) resolve();
            }

            layersToLoad.forEach(id => {
                const def = LAYER_DEFS[id];
                state.imageCache[id] = {};
                yearRange(def.startYear, def.endYear).forEach(y => {
                    const img = new Image();
                    img.onload = tick;
                    img.onerror = tick;
                    img.src = imgPath(id, y);
                    state.imageCache[id][y] = img;
                });
            });
        });
    }

    // ── Load data (CSV + GeoJSON) ──────────────────────────────
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

        // Load boundary + existing stats
        const [boundaryText] = await Promise.all([
            fetch('data/boundary.geojson').then(r => r.text()),
        ]);
        state.boundary = JSON.parse(boundaryText);

        // Try loading explicit bounds, fall back to GeoJSON bbox
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

        // Load all available stats CSVs
        for (const id of ALL_LAYER_IDS) {
            try {
                const resp = await fetch(`data/${id}_stats.csv`);
                if (resp.ok) {
                    state.stats[id] = parseCSV(await resp.text());
                }
            } catch { /* no stats for this layer */ }
        }
    }

    // ── Map setup ──────────────────────────────────────────────
    let map, map2;

    function createOverlaysForLayer(layerId, targetMap, store) {
        if (!store[layerId]) store[layerId] = {};
        const def = LAYER_DEFS[layerId];
        yearRange(def.startYear, def.endYear).forEach(y => {
            if (store[layerId][y]) return;
            const overlay = L.imageOverlay(imgPath(layerId, y), IMAGE_BOUNDS, { opacity: 0, interactive: false });
            overlay.addTo(targetMap);
            store[layerId][y] = overlay;
        });
    }

    function removeOverlaysForLayer(layerId, store, targetMap) {
        if (!store[layerId]) return;
        Object.values(store[layerId]).forEach(o => targetMap.removeLayer(o));
        delete store[layerId];
    }

    function initMaps() {
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        const tileAttr = '&copy; OpenStreetMap &copy; CARTO';

        map = L.map('map', { zoomControl: true, minZoom: 11, maxZoom: 15 }).setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { attribution: tileAttr, maxZoom: 18 }).addTo(map);

        L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map);

        // Create overlays for initial layers (ndvi, ndwi)
        createOverlaysForLayer('ndvi', map, state.overlays);
        createOverlaysForLayer('ndwi', map, state.overlays);

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

        // Map click → inspector
        map.on('click', onMapClick);
    }

    function initCompareMap() {
        if (map2) return;
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        map2 = L.map('map2', { zoomControl: true, minZoom: 11, maxZoom: 15 }).setView(CENTER, ZOOM);
        L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map2);
        L.geoJSON(state.boundary, {
            style: { color: '#fbbf24', weight: 2, fillOpacity: 0.05, dashArray: '6 4' }
        }).addTo(map2);

        // Create overlays for all active layers on map2
        state.activeLayers.forEach(l => {
            createOverlaysForLayer(l.id, map2, state.overlays2);
        });

        map.on('move', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
        map.on('zoom', () => map2.setView(map.getCenter(), map.getZoom(), { animate: false }));
    }

    // ── Inspector (map click) ──────────────────────────────────
    function onMapClick(e) {
        if (!state.inspectorMode) {
            L.popup()
                .setLatLng(e.latlng)
                .setContent(`<b>${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</b>`)
                .openOn(map);
            return;
        }

        // Show all active layer info at click point
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);
        let html = `<div style="font-family:sans-serif;font-size:12px;">`;
        html += `<b>${lat}, ${lng}</b><br>Year: ${state.year}<br><hr style="margin:4px 0;">`;

        state.activeLayers.forEach(l => {
            const def = LAYER_DEFS[l.id];
            const hasData = layerHasYear(l.id, state.year);
            if (hasData && state.stats[l.id]) {
                const row = state.stats[l.id].find(r => r.year === state.year);
                if (row && row.mean !== undefined) {
                    const unit = def.unit || '';
                    html += `<span style="color:${def.color}"><b>${def.name}</b></span>: mean ${row.mean.toFixed(3)}${unit}<br>`;
                } else {
                    html += `<span style="color:${def.color}"><b>${def.name}</b></span>: visible<br>`;
                }
            } else {
                html += `<span style="color:${def.color}"><b>${def.name}</b></span>: no data<br>`;
            }
        });

        html += `</div>`;
        L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
    }

    // ── Layer management ───────────────────────────────────────
    function addLayer(layerId) {
        if (state.activeLayers.length >= MAX_ACTIVE_LAYERS) return;
        if (state.activeLayers.find(l => l.id === layerId)) return;

        state.activeLayers.push({
            id: layerId,
            opacity: 85,
            visible: true,
            blend: 'normal',
        });

        // Create overlays if not already
        if (!state.overlays[layerId]) {
            createOverlaysForLayer(layerId, map, state.overlays);
        }
        if (state.compareMode && map2 && !state.overlays2[layerId]) {
            createOverlaysForLayer(layerId, map2, state.overlays2);
        }

        // Preload images in background
        preloadLayerImages(layerId);

        renderLayerPanel();
        updateMapOverlays();
        updateLegend();
        updateAddLayerDropdown();
    }

    function removeLayer(layerId) {
        state.activeLayers = state.activeLayers.filter(l => l.id !== layerId);
        // Hide all overlays for this layer
        if (state.overlays[layerId]) {
            Object.values(state.overlays[layerId]).forEach(o => o.setOpacity(0));
        }
        if (state.overlays2[layerId]) {
            Object.values(state.overlays2[layerId]).forEach(o => o.setOpacity(0));
        }
        renderLayerPanel();
        updateMapOverlays();
        updateLegend();
        updateAddLayerDropdown();
    }

    function moveLayer(layerId, direction) {
        const idx = state.activeLayers.findIndex(l => l.id === layerId);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= state.activeLayers.length) return;
        const tmp = state.activeLayers[idx];
        state.activeLayers[idx] = state.activeLayers[newIdx];
        state.activeLayers[newIdx] = tmp;
        renderLayerPanel();
        updateMapOverlays();
    }

    // ── Render layer panel ─────────────────────────────────────
    function renderLayerPanel() {
        els.layerCount.textContent = `(${state.activeLayers.length}/${MAX_ACTIVE_LAYERS})`;

        let html = '';
        state.activeLayers.forEach((layer, i) => {
            const def = LAYER_DEFS[layer.id];
            const hasData = layerHasYear(layer.id, state.year);
            const noDataBadge = hasData ? '' : '<span class="no-data-badge">No data</span>';

            html += `<div class="layer-card" data-layer-id="${layer.id}">
                <div class="layer-card-header">
                    <span class="layer-card-name" onclick="window._showLayerInfo('${layer.id}')" style="color:${def.color}">${def.name}${noDataBadge}</span>
                    <div class="layer-card-actions">
                        ${i > 0 ? `<button onclick="window._moveLayer('${layer.id}',-1)" title="Move up">&#9650;</button>` : ''}
                        ${i < state.activeLayers.length - 1 ? `<button onclick="window._moveLayer('${layer.id}',1)" title="Move down">&#9660;</button>` : ''}
                        <button onclick="window._toggleVis('${layer.id}')" class="${layer.visible ? '' : 'visibility-off'}" title="Toggle visibility">${layer.visible ? '&#128065;' : '&#128065;'}</button>
                        <button onclick="window._removeLayer('${layer.id}')" title="Remove layer">&times;</button>
                    </div>
                </div>
                <div class="layer-card-controls">
                    <label>
                        <span>Opacity</span>
                        <input type="range" min="0" max="100" value="${layer.opacity}" oninput="window._setOpacity('${layer.id}',+this.value)" />
                        <span class="opacity-value">${layer.opacity}%</span>
                    </label>
                    <label>
                        <span>Blend</span>
                        <select onchange="window._setBlend('${layer.id}',this.value)">
                            <option value="normal" ${layer.blend === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="multiply" ${layer.blend === 'multiply' ? 'selected' : ''}>Multiply</option>
                            <option value="screen" ${layer.blend === 'screen' ? 'selected' : ''}>Screen</option>
                            <option value="overlay" ${layer.blend === 'overlay' ? 'selected' : ''}>Overlay</option>
                        </select>
                    </label>
                </div>
            </div>`;
        });

        els.activeLayers.innerHTML = html;
    }

    // Global callbacks for layer panel buttons
    window._removeLayer = removeLayer;
    window._moveLayer = moveLayer;
    window._toggleVis = function(layerId) {
        const l = state.activeLayers.find(x => x.id === layerId);
        if (l) { l.visible = !l.visible; renderLayerPanel(); updateMapOverlays(); }
    };
    window._setOpacity = function(layerId, val) {
        const l = state.activeLayers.find(x => x.id === layerId);
        if (l) { l.opacity = val; updateMapOverlays(); }
        // Update the displayed value
        const card = document.querySelector(`.layer-card[data-layer-id="${layerId}"]`);
        if (card) { const ov = card.querySelector('.opacity-value'); if (ov) ov.textContent = val + '%'; }
    };
    window._setBlend = function(layerId, val) {
        const l = state.activeLayers.find(x => x.id === layerId);
        if (l) { l.blend = val; updateMapOverlayBlend(); }
    };
    window._showLayerInfo = showLayerInfo;

    function updateAddLayerDropdown() {
        const activeIds = state.activeLayers.map(l => l.id);
        let html = '<option value="">+ Add Layer...</option>';
        ALL_LAYER_IDS.forEach(id => {
            if (!activeIds.includes(id)) {
                html += `<option value="${id}">${LAYER_DEFS[id].name} - ${LAYER_DEFS[id].fullName}</option>`;
            }
        });
        els.addLayerSelect.innerHTML = html;
        els.addLayerSelect.disabled = state.activeLayers.length >= MAX_ACTIVE_LAYERS;
    }

    // ── Show/hide overlays on map ──────────────────────────────
    function updateMapOverlays() {
        // Hide all overlays first
        ALL_LAYER_IDS.forEach(id => {
            if (state.overlays[id]) {
                Object.values(state.overlays[id]).forEach(o => o.setOpacity(0));
            }
        });

        // Show active layers (bottom to top)
        state.activeLayers.forEach(layer => {
            if (!layer.visible) return;
            const ovs = state.overlays[layer.id];
            if (!ovs) return;

            const def = LAYER_DEFS[layer.id];
            const hasData = layerHasYear(layer.id, state.year);

            if (hasData && ovs[state.year]) {
                ovs[state.year].setOpacity(layer.opacity / 100);
            }
        });

        updateMapOverlayBlend();

        // Compare map
        if (state.compareMode && map2) {
            ALL_LAYER_IDS.forEach(id => {
                if (state.overlays2[id]) {
                    Object.values(state.overlays2[id]).forEach(o => o.setOpacity(0));
                }
            });
            state.activeLayers.forEach(layer => {
                if (!layer.visible) return;
                const ovs = state.overlays2[layer.id];
                if (!ovs) return;
                if (layerHasYear(layer.id, state.compareYear) && ovs[state.compareYear]) {
                    ovs[state.compareYear].setOpacity(layer.opacity / 100);
                }
            });
        }
    }

    function updateMapOverlayBlend() {
        // Apply CSS mix-blend-mode to overlay elements
        state.activeLayers.forEach(layer => {
            const ovs = state.overlays[layer.id];
            if (!ovs) return;
            Object.values(ovs).forEach(o => {
                const el = o.getElement();
                if (el) el.style.mixBlendMode = layer.blend;
            });
            // Also for compare map
            const ovs2 = state.overlays2[layer.id];
            if (ovs2) {
                Object.values(ovs2).forEach(o => {
                    const el = o.getElement();
                    if (el) el.style.mixBlendMode = layer.blend;
                });
            }
        });
    }

    // ── Static layers ──────────────────────────────────────────
    function toggleStaticLayer(key, show) {
        if (show) {
            if (!state.staticOverlays[key]) {
                const def = STATIC_LAYERS[key];
                state.staticOverlays[key] = L.imageOverlay(def.file, IMAGE_BOUNDS, { opacity: 0.7, interactive: false });
                state.staticOverlays[key].addTo(map);
            } else {
                state.staticOverlays[key].setOpacity(0.7);
            }
        } else {
            if (state.staticOverlays[key]) {
                state.staticOverlays[key].setOpacity(0);
            }
        }
    }

    // ── Layer info ─────────────────────────────────────────────
    function showLayerInfo(layerId) {
        const def = LAYER_DEFS[layerId];
        const numYears = def.endYear - def.startYear + 1;
        els.layerInfo.innerHTML = `
            <h4>${def.name} - ${def.fullName}</h4>
            <div class="info-row"><strong>Resolution:</strong> ${def.resolution}</div>
            <div class="info-row"><strong>Source:</strong> ${def.source}</div>
            <div class="info-row"><strong>Years:</strong> ${def.startYear}-${def.endYear} (${numYears} years)</div>
            <div class="info-row"><strong>Range:</strong> ${def.range}</div>
            <div class="info-desc">${def.description}</div>
        `;
        els.layerInfo.classList.add('visible');
    }

    // ── Chart ──────────────────────────────────────────────────
    const CHART_COLORS = {
        ndvi: '#34d399', ndwi: '#38bdf8', evi: '#22c55e',
        mndwi: '#06b6d4', ndmi: '#a78bfa', lst: '#f97316',
        precipitation: '#60a5fa', et: '#14b8a6',
    };

    function initChart() {
        const ctx = $('#timeseries-chart').getContext('2d');
        state.chart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 150 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { color: '#8899aa', boxWidth: 12, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false },
                },
                scales: {
                    x: { ticks: { color: '#8899aa', maxTicksLimit: 10 }, grid: { color: 'rgba(38,58,78,0.5)' } },
                    y: {
                        position: 'left',
                        ticks: { color: '#8899aa' },
                        grid: { color: 'rgba(38,58,78,0.5)' },
                    },
                    y2: {
                        position: 'right',
                        ticks: { color: '#8899aa' },
                        grid: { drawOnChartArea: false },
                        display: false,
                    },
                }
            }
        });

        // Init chart toggles
        renderChartToggles();
    }

    function renderChartToggles() {
        // Show toggles for all layers that have stats
        const toggleIds = ALL_LAYER_IDS.filter(id => !LAYER_DEFS[id].noStats);
        let html = '';
        toggleIds.forEach(id => {
            const def = LAYER_DEFS[id];
            const active = state.chartSeries[id] ? 'active' : '';
            html += `<button class="chart-toggle-btn ${active}" data-chart-layer="${id}" style="${active ? 'color:' + def.color : ''}">
                <span class="chart-toggle-dot" style="background:${def.color}"></span>${def.name}
            </button>`;
        });
        els.chartToggles.innerHTML = html;

        // Bind events
        $$('.chart-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.chartLayer;
                state.chartSeries[id] = !state.chartSeries[id];
                renderChartToggles();
                updateChart();
            });
        });
    }

    function linearTrend(ys, vs) {
        const n = vs.length;
        if (n < 2) return vs.map(() => null);
        const sx = ys.reduce((a, b) => a + b, 0);
        const sy = vs.reduce((a, b) => a + (b || 0), 0);
        const sxy = ys.reduce((a, x, i) => a + x * (vs[i] || 0), 0);
        const sxx = ys.reduce((a, x) => a + x * x, 0);
        const denom = n * sxx - sx * sx;
        if (denom === 0) return vs;
        const m = (n * sxy - sx * sy) / denom;
        const b = (sy - m * sx) / n;
        return ys.map(x => m * x + b);
    }

    function updateChart() {
        const datasets = [];
        const labels = allYears();

        // Determine which layers need right axis (LST, Precipitation, ET use different scales)
        const rightAxisLayers = ['lst', 'precipitation', 'et'];
        let hasRight = false;

        // For each toggled chart series
        const activeChartIds = Object.keys(state.chartSeries).filter(id => state.chartSeries[id] && state.stats[id]);

        activeChartIds.forEach(id => {
            const def = LAYER_DEFS[id];
            const data = state.stats[id];
            const useRight = rightAxisLayers.includes(id);
            if (useRight) hasRight = true;

            const means = labels.map(y => {
                const row = data.find(d => d.year === y);
                return row ? row.mean : null;
            });

            datasets.push({
                label: def.name,
                data: means,
                borderColor: def.color,
                backgroundColor: def.color + '18',
                fill: false,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5,
                yAxisID: useRight ? 'y2' : 'y',
                spanGaps: true,
            });

            // Trend line
            const validYears = [], validMeans = [];
            labels.forEach((y, i) => { if (means[i] !== null) { validYears.push(y); validMeans.push(means[i]); } });
            const trendVals = linearTrend(validYears, validMeans);
            const trendData = labels.map(y => {
                const ti = validYears.indexOf(y);
                return ti >= 0 ? trendVals[ti] : null;
            });

            datasets.push({
                label: def.name + ' Trend',
                data: trendData,
                borderColor: def.color + '66',
                borderDash: [6, 4],
                pointRadius: 0,
                tension: 0,
                fill: false,
                yAxisID: useRight ? 'y2' : 'y',
                spanGaps: true,
            });
        });

        // Current year highlight
        if (activeChartIds.length > 0) {
            const highlightId = activeChartIds[0];
            const data = state.stats[highlightId];
            if (data) {
                const highlight = labels.map(y => {
                    if (y !== state.year) return null;
                    const row = data.find(d => d.year === y);
                    return row ? row.mean : null;
                });
                const useRight = rightAxisLayers.includes(highlightId);
                datasets.push({
                    label: 'Current Year',
                    data: highlight,
                    pointRadius: 8,
                    pointBackgroundColor: '#f87171',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    showLine: false,
                    yAxisID: useRight ? 'y2' : 'y',
                });
            }
        }

        state.chart.data.labels = labels;
        state.chart.data.datasets = datasets;
        state.chart.options.scales.y2.display = hasRight;
        state.chart.update();
    }

    // ── Stats cards ────────────────────────────────────────────
    function updateStats() {
        // Show stats for the first active layer that has stats
        const layer = state.activeLayers.find(l => state.stats[l.id]);
        if (!layer) {
            $('#stat-mean').textContent = '\u2014';
            $('#stat-median').textContent = '\u2014';
            $('#stat-range').textContent = '\u2014';
            $('#stat-std').textContent = '\u2014';
            els.extraStats.innerHTML = '';
            return;
        }

        const data = state.stats[layer.id];
        const row = data.find(d => d.year === state.year);
        if (!row) {
            $('#stat-mean').textContent = 'N/A';
            $('#stat-median').textContent = 'N/A';
            $('#stat-range').textContent = 'N/A';
            $('#stat-std').textContent = 'N/A';
            els.extraStats.innerHTML = `<em>${LAYER_DEFS[layer.id].name}: no data for ${state.year}</em>`;
            return;
        }

        const def = LAYER_DEFS[layer.id];
        const unit = def.unit ? ' ' + def.unit : '';
        const prec = def.unit ? 1 : 3;
        $('#stat-mean').textContent = row.mean.toFixed(prec) + unit;
        $('#stat-median').textContent = (row.median !== undefined ? row.median.toFixed(prec) : '\u2014') + unit;
        $('#stat-range').textContent = (row.min !== undefined ? `${row.min.toFixed(prec)} / ${row.max.toFixed(prec)}` : '\u2014') + unit;
        $('#stat-std').textContent = (row.std !== undefined ? row.std.toFixed(prec) : '\u2014') + unit;

        // Extra stats for NDWI
        let extra = `<strong>${def.name}</strong> stats for ${state.year}`;
        if (layer.id === 'ndwi' && row.water_area_ha !== undefined) {
            extra += ` | Water area: <strong>${row.water_area_ha.toFixed(0)} ha</strong> | Coverage: <strong>${row.wetland_coverage_pct.toFixed(1)}%</strong>`;
        }
        els.extraStats.innerHTML = extra;
    }

    // ── Legend ──────────────────────────────────────────────────
    function updateLegend() {
        if (state.activeLayers.length === 0) {
            els.legend.innerHTML = '<div class="legend-title">No layers active</div>';
            return;
        }

        let html = '';
        state.activeLayers.forEach(layer => {
            const def = LAYER_DEFS[layer.id];
            html += `<div class="legend-item">
                <div class="legend-title" style="color:${def.color}">${def.name}</div>
                <div class="legend-bar" style="background:${def.gradient}"></div>
                <div class="legend-labels">${def.labels.map(l => `<span>${l}</span>`).join('')}</div>
            </div>`;
        });

        // Static layers
        Object.keys(STATIC_LAYERS).forEach(key => {
            if (state.staticOverlays[key] && state.staticOverlays[key].options.opacity > 0) {
                const def = STATIC_LAYERS[key];
                html += `<div class="legend-item">
                    <div class="legend-title">${def.name}</div>
                    <div class="legend-bar" style="background:${def.gradient}"></div>
                    <div class="legend-labels">${def.labels.map(l => `<span>${l}</span>`).join('')}</div>
                </div>`;
            }
        });

        els.legend.innerHTML = html;
    }

    // ── URL hash ───────────────────────────────────────────────
    function readHash() {
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (params.has('year')) state.year = Math.max(START_YEAR, Math.min(END_YEAR, +params.get('year')));
        if (params.has('layers')) {
            const ids = params.get('layers').split(',').filter(id => LAYER_DEFS[id]);
            ids.forEach(id => {
                state.activeLayers.push({ id, opacity: 85, visible: true, blend: 'normal' });
            });
        }
    }

    function writeHash() {
        const layers = state.activeLayers.map(l => l.id).join(',');
        history.replaceState(null, '', `#year=${state.year}&layers=${layers}`);
    }

    // ── Master update ──────────────────────────────────────────
    function update() {
        els.yearLabel.textContent = state.year;
        els.slider.value = state.year;
        updateMapOverlays();
        updateChart();
        updateStats();
        updateLegend();
        writeHash();

        // Update no-data badges in layer cards
        state.activeLayers.forEach(l => {
            const card = document.querySelector(`.layer-card[data-layer-id="${l.id}"]`);
            if (card) {
                const nameEl = card.querySelector('.layer-card-name');
                const def = LAYER_DEFS[l.id];
                const hasData = layerHasYear(l.id, state.year);
                const badge = hasData ? '' : '<span class="no-data-badge">No data</span>';
                nameEl.innerHTML = `<span style="color:${def.color}">${def.name}</span>${badge}`;
            }
        });

        $$('.jump-btn').forEach(b => b.classList.toggle('active', +b.dataset.year === state.year));
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

    // ── Export ──────────────────────────────────────────────────
    function exportPNG() {
        // Use leaflet-image or simple canvas capture
        const mapEl = document.getElementById('map');
        // Use html2canvas-like approach with the map container
        // For now, export the chart as PNG
        const link = document.createElement('a');
        link.download = `marjal_chart_${state.year}.png`;
        link.href = state.chart.toBase64Image();
        link.click();
    }

    function exportCSV() {
        const activeChartIds = Object.keys(state.chartSeries).filter(id => state.chartSeries[id] && state.stats[id]);
        if (activeChartIds.length === 0) {
            alert('Toggle at least one layer in the chart to export.');
            return;
        }
        const years = allYears();
        let csv = 'year,' + activeChartIds.map(id => LAYER_DEFS[id].name + '_mean').join(',') + '\n';
        years.forEach(y => {
            const vals = activeChartIds.map(id => {
                const row = state.stats[id].find(r => r.year === y);
                return row ? row.mean : '';
            });
            csv += y + ',' + vals.join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.download = `marjal_timeseries_${activeChartIds.join('_')}.csv`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // ── Event wiring ───────────────────────────────────────────
    function bindEvents() {
        els.slider.addEventListener('input', () => { state.year = +els.slider.value; update(); });
        els.playBtn.addEventListener('click', () => state.playing ? pause() : play());
        els.speedSlider.addEventListener('input', () => {
            state.speed = +els.speedSlider.value;
            if (state.playing) { pause(); play(); }
        });

        $$('.jump-btn').forEach(b => b.addEventListener('click', () => {
            state.year = +b.dataset.year;
            update();
        }));

        // Add layer dropdown
        els.addLayerSelect.addEventListener('change', () => {
            const id = els.addLayerSelect.value;
            if (id) addLayer(id);
            els.addLayerSelect.value = '';
        });

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
            updateMapOverlays();
        });

        // Inspector toggle
        els.btnInspector.addEventListener('click', () => {
            state.inspectorMode = !state.inspectorMode;
            els.btnInspector.classList.toggle('active', state.inspectorMode);
        });

        // Static layer checkboxes
        $('#chk-water-occurrence').addEventListener('change', function() {
            toggleStaticLayer('water_occurrence', this.checked);
            updateLegend();
        });
        $('#chk-water-seasonality').addEventListener('change', function() {
            toggleStaticLayer('water_seasonality', this.checked);
            updateLegend();
        });

        // Export buttons
        $('#btn-export-png').addEventListener('click', exportPNG);
        $('#btn-export-csv').addEventListener('click', exportCSV);

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { state.year = Math.min(END_YEAR, state.year + 1); update(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { state.year = Math.max(START_YEAR, state.year - 1); update(); }
            if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
        });
    }

    // ── Boot ───────────────────────────────────────────────────
    async function init() {
        cacheDom();
        readHash();

        // Default to NDVI if no layers specified
        if (state.activeLayers.length === 0) {
            state.activeLayers.push({ id: 'ndvi', opacity: 85, visible: true, blend: 'normal' });
            state.chartSeries.ndvi = true;
        }
        // Enable chart series for all active layers
        state.activeLayers.forEach(l => { state.chartSeries[l.id] = true; });

        els.status.textContent = 'Loading data...';
        await loadData();

        els.status.textContent = 'Preloading images...';
        await preloadInitialImages();

        initMaps();

        // Create overlays for any non-default active layers
        state.activeLayers.forEach(l => {
            if (!state.overlays[l.id]) {
                createOverlaysForLayer(l.id, map, state.overlays);
            }
        });

        initChart();
        updateAddLayerDropdown();
        renderLayerPanel();
        bindEvents();
        update();

        // Hide loading overlay
        els.overlay.classList.add('hidden');
        setTimeout(() => els.overlay.remove(), 600);
        setTimeout(() => map.invalidateSize(), 200);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
