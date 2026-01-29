# Marjal dels Moros — 40 Years of Environmental Change

Interactive web visualization of NDVI (vegetation) and NDWI (water) satellite imagery time series for the Marjal dels Moros wetland near Valencia, Spain (1984–2024).

## Quick Start

1. Serve the project directory with any static HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

2. Open `http://localhost:8000` in your browser.

> **Note:** Opening `index.html` directly (`file://`) will not work due to browser CORS restrictions on fetch requests.

## Features

- **Interactive map** with Leaflet.js showing satellite imagery overlays
- **Year slider** (1984–2024) with all images preloaded for instant switching
- **Play/Pause animation** with adjustable speed
- **NDVI/NDWI toggle** to switch between vegetation and water indices
- **Time series chart** (Chart.js) with trend line and current-year highlight
- **Statistics cards** showing mean, median, min/max, std dev per year
- **Quick jump buttons** for key years
- **Side-by-side comparison mode** for comparing two years
- **Keyboard controls**: arrow keys to change year, spacebar to play/pause
- **Permalink support** via URL hash (`#year=2000&index=ndvi`)
- **Mini-map** showing study area location in Spain

## Converting GeoTIFF Files to PNG

If you have the original GeoTIFF files (`Marjal_NDVI_RGB_YYYY.tif` / `Marjal_NDWI_RGB_YYYY.tif`), convert them to PNG using the included script:

```bash
pip install rasterio numpy Pillow
python convert_geotiffs.py --input-dir /path/to/geotiffs --output-dir data/images
```

See `convert_geotiffs.py --help` for options.

## File Structure

```
├── index.html              Main page
├── style.css               Styles
├── script.js               Application logic
├── convert_geotiffs.py     GeoTIFF → PNG conversion script
├── data/
│   ├── boundary.geojson    Study area boundary
│   ├── ndvi_stats.csv      NDVI time series statistics
│   ├── ndwi_stats.csv      NDWI time series statistics
│   └── images/
│       ├── ndvi/           NDVI images (1984.png – 2024.png)
│       └── ndwi/           NDWI images (1984.png – 2024.png)
└── README.md
```

## Deployment

### GitHub Pages

1. Push to a GitHub repository
2. Go to Settings → Pages → Source: main branch, root directory
3. The site will be available at `https://<user>.github.io/<repo>/`

### Netlify

1. Drag and drop the project folder onto [app.netlify.com/drop](https://app.netlify.com/drop)

## Data Source

Landsat / Sentinel-2 satellite imagery processed for the BC3 (Basque Centre for Climate Change) climate research case study.
