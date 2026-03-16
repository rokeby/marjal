/*  ================================================================
    Google Earth Engine – Seasonal NDVI & NDWI statistics
    Marjal dels Moros, Valencia, Spain
    ================================================================

    Paste this into https://code.earthengine.google.com/

    Computes per-season zonal statistics (mean, median, std, min, max,
    p25, p75) for NDVI and NDWI, then exports two CSV files:
        ndvi_stats.csv
        ndwi_stats.csv

    Matching the seasonal months used in the image export script:
        02 (Feb) – peak water / winter flooding
        05 (May) – peak vegetation (spring green-up)
        08 (Aug) – summer drought minimum
    ================================================================ */

// ── Study area ──────────────────────────────────────────────────
var geometry = ee.Geometry.Rectangle([-0.4158, 39.5100, -0.1838, 39.6900]);

// ── Parameters ──────────────────────────────────────────────────
var START_YEAR = 1984;
var END_YEAR   = 2024;
var MONTHS     = [2, 5, 8];
var SCALE      = 30;
var DRIVE_FOLDER = 'marjal_seasonal';

// Total wetland area in hectares (for water-coverage calculation)
var TOTAL_AREA_HA = 724;

// ── Cloud masking (same as export script) ───────────────────────
function maskL457(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
  return image.updateMask(mask)
    .select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'],
            ['blue','green','red','nir','swir1','swir2'])
    .multiply(0.0000275).add(-0.2)
    .copyProperties(image, ['system:time_start']);
}

function maskL89(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
  return image.updateMask(mask)
    .select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'],
            ['blue','green','red','nir','swir1','swir2'])
    .multiply(0.0000275).add(-0.2)
    .copyProperties(image, ['system:time_start']);
}

function maskS2(image) {
  var scl = image.select('SCL');
  var mask = scl.gte(4).and(scl.lte(7));
  return image.updateMask(mask)
    .select(['B2','B3','B4','B8','B11','B12'],
            ['blue','green','red','nir','swir1','swir2'])
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

function addIndices(image) {
  var ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI');
  var ndwi = image.normalizedDifference(['green', 'nir']).rename('NDWI');
  return image.addBands(ndvi).addBands(ndwi);
}

// ── Build composite ─────────────────────────────────────────────
function getComposite(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end   = start.advance(1, 'month');
  var windowStart = start.advance(-21, 'day');
  var windowEnd   = end.advance(21, 'day');

  var col;
  if (year <= 2012) {
    var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    col = l5.merge(l7);
  } else if (year <= 2014) {
    var l7b = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL89);
    col = l7b.merge(l8);
  } else {
    col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(geometry).filterDate(windowStart, windowEnd)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map(maskS2);
  }

  return addIndices(col.median().clip(geometry));
}

// ── Compute stats for one band over the study area ──────────────
function bandStats(composite, bandName, year, month) {
  var band = composite.select(bandName);

  var stats = band.reduceRegion({
    reducer: ee.Reducer.mean()
      .combine(ee.Reducer.median(), '', true)
      .combine(ee.Reducer.stdDev(), '', true)
      .combine(ee.Reducer.min(), '', true)
      .combine(ee.Reducer.max(), '', true)
      .combine(ee.Reducer.percentile([25, 75]), '', true),
    geometry: geometry,
    scale: SCALE,
    maxPixels: 1e9
  });

  return ee.Feature(null, stats.combine(ee.Dictionary({
    'year': year,
    'month': (month < 10 ? '0' : '') + month
  })));
}

// ── Compute water area for NDWI ─────────────────────────────────
function waterStats(composite, year, month) {
  var ndwi = composite.select('NDWI');
  var waterMask = ndwi.gt(0);  // water where NDWI > 0
  var waterArea = waterMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: SCALE,
    maxPixels: 1e9
  });
  var waterHa = ee.Number(waterArea.get('NDWI')).divide(10000);
  var pct = waterHa.divide(TOTAL_AREA_HA).multiply(100);

  return ee.Dictionary({
    'water_area_ha': waterHa,
    'wetland_coverage_pct': pct
  });
}

// ── Collect all stats ───────────────────────────────────────────
var ndviFeatures = [];
var ndwiFeatures = [];

for (var year = START_YEAR; year <= END_YEAR; year++) {
  for (var mi = 0; mi < MONTHS.length; mi++) {
    var month = MONTHS[mi];
    var composite = getComposite(year, month);

    // NDVI stats
    ndviFeatures.push(bandStats(composite, 'NDVI', year, month));

    // NDWI stats + water area
    var ndwiFeat = bandStats(composite, 'NDWI', year, month);
    var water = waterStats(composite, year, month);
    ndwiFeatures.push(ee.Feature(null, ndwiFeat.toDictionary().combine(water)));
  }
}

var ndviFC = ee.FeatureCollection(ndviFeatures);
var ndwiFC = ee.FeatureCollection(ndwiFeatures);

// ── Export CSVs ─────────────────────────────────────────────────
Export.table.toDrive({
  collection: ndviFC,
  description: 'ndvi_stats_seasonal',
  folder: DRIVE_FOLDER,
  fileNamePrefix: 'ndvi_stats',
  fileFormat: 'CSV',
  selectors: ['year','month','NDVI_mean','NDVI_median','NDVI_min','NDVI_max',
              'NDVI_stdDev','NDVI_p25','NDVI_p75']
});

Export.table.toDrive({
  collection: ndwiFC,
  description: 'ndwi_stats_seasonal',
  folder: DRIVE_FOLDER,
  fileNamePrefix: 'ndwi_stats',
  fileFormat: 'CSV',
  selectors: ['year','month','NDWI_mean','NDWI_median','NDWI_min','NDWI_max',
              'NDWI_stdDev','NDWI_p25','NDWI_p75','water_area_ha','wetland_coverage_pct']
});

print('Stats export tasks queued. Go to Tasks tab → Run All.');
print('NDVI: ' + ndviFeatures.length + ' rows');
print('NDWI: ' + ndwiFeatures.length + ' rows');
