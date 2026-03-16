/*  ================================================================
    Google Earth Engine – Seasonal NDVI & NDWI export
    Marjal dels Moros, Valencia, Spain
    ================================================================

    Paste this script into https://code.earthengine.google.com/

    Exports three seasonal composites per year (Feb / May / Aug)
    as RGB-visualised GeoTIFFs to Google Drive, named:
        Marjal_NDVI_RGB_YYYY_MM.tif
        Marjal_NDWI_RGB_YYYY_MM.tif
        Marjal_SAT_RGB_YYYY_MM.tif   (true-colour satellite)

    Seasonal months chosen for this Mediterranean wetland:
        02 (Feb) – peak water / winter flooding
        05 (May) – peak vegetation (spring green-up)
        08 (Aug) – summer drought minimum
    ================================================================ */

// ── Study area ──────────────────────────────────────────────────
var geometry = ee.Geometry.Rectangle([-0.4158, 39.5100, -0.1838, 39.6900]);
Map.centerObject(geometry, 13);

// ── Parameters ──────────────────────────────────────────────────
var START_YEAR = 1984;
var END_YEAR   = 2024;
var MONTHS     = [2, 5, 8];          // Feb, May, Aug
var MONTH_NAMES = {2: '02', 5: '05', 8: '08'};
var SCALE      = 30;                 // metres per pixel
var DRIVE_FOLDER = 'marjal_seasonal'; // Google Drive export folder

// ── Cloud masking ───────────────────────────────────────────────

// Landsat 4/5/7 (Collection 2, Level 2)
function maskL457(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0)   // cloud shadow
        .and(qa.bitwiseAnd(1 << 4).eq(0)); // cloud
  return image.updateMask(mask)
    .select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'],
            ['blue','green','red','nir','swir1','swir2'])
    .multiply(0.0000275).add(-0.2)
    .copyProperties(image, ['system:time_start']);
}

// Landsat 8/9 (Collection 2, Level 2)
function maskL89(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0)
        .and(qa.bitwiseAnd(1 << 4).eq(0));
  return image.updateMask(mask)
    .select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'],
            ['blue','green','red','nir','swir1','swir2'])
    .multiply(0.0000275).add(-0.2)
    .copyProperties(image, ['system:time_start']);
}

// Sentinel-2 (Level 2A)
function maskS2(image) {
  var scl = image.select('SCL');
  // Keep vegetation (4), bare soil (5), water (6), unclassified (7)
  var mask = scl.gte(4).and(scl.lte(7));
  return image.updateMask(mask)
    .select(['B2','B3','B4','B8','B11','B12'],
            ['blue','green','red','nir','swir1','swir2'])
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

// ── Index computation ───────────────────────────────────────────
function addIndices(image) {
  var ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI');
  var ndwi = image.normalizedDifference(['green', 'nir']).rename('NDWI');
  return image.addBands(ndvi).addBands(ndwi);
}

// ── NDVI / NDWI colour palettes ─────────────────────────────────
var ndviVis = {min: -0.2, max: 0.8, palette: [
  '8b4513','d2b48c','f5deb3','adff2f','32cd32','228b22','006400'
]};
var ndwiVis = {min: -0.3, max: 0.5, palette: [
  '8b4513','d2b48c','f5deb3','87ceeb','4682b4','1e90ff','00008b'
]};
var satVis = {bands: ['red','green','blue'], min: 0, max: 0.3};

// ── Build collection for a given year + month window ────────────
function getComposite(year, month) {
  // Use a 6-week window centred on the target month
  var start = ee.Date.fromYMD(year, month, 1);
  var end   = start.advance(1, 'month');
  // Widen window to ±3 weeks for better coverage
  var windowStart = start.advance(-21, 'day');
  var windowEnd   = end.advance(21, 'day');

  var col;
  if (year <= 2012) {
    // Landsat 5 (1984-2012) + Landsat 7 (1999-2012)
    var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    col = l5.merge(l7);
  } else if (year <= 2014) {
    // Landsat 7 + 8 transition period
    var l7b = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL457);
    var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterBounds(geometry).filterDate(windowStart, windowEnd).map(maskL89);
    col = l7b.merge(l8);
  } else {
    // Sentinel-2 (2015+) – much better temporal resolution
    col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(geometry).filterDate(windowStart, windowEnd)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map(maskS2);
  }

  var composite = col.median().clip(geometry);
  return addIndices(composite);
}

// ── Export loop ──────────────────────────────────────────────────
var tasks = [];

for (var year = START_YEAR; year <= END_YEAR; year++) {
  for (var mi = 0; mi < MONTHS.length; mi++) {
    var month = MONTHS[mi];
    var mm = MONTH_NAMES[month];
    var label = year + '_' + mm;

    var composite = getComposite(year, month);

    // NDVI RGB
    var ndviRGB = composite.select('NDVI').visualize(ndviVis);
    Export.image.toDrive({
      image: ndviRGB,
      description: 'Marjal_NDVI_RGB_' + label,
      folder: DRIVE_FOLDER,
      fileNamePrefix: 'Marjal_NDVI_RGB_' + label,
      region: geometry,
      scale: SCALE,
      crs: 'EPSG:4326',
      maxPixels: 1e9
    });

    // NDWI RGB
    var ndwiRGB = composite.select('NDWI').visualize(ndwiVis);
    Export.image.toDrive({
      image: ndwiRGB,
      description: 'Marjal_NDWI_RGB_' + label,
      folder: DRIVE_FOLDER,
      fileNamePrefix: 'Marjal_NDWI_RGB_' + label,
      region: geometry,
      scale: SCALE,
      crs: 'EPSG:4326',
      maxPixels: 1e9
    });

    // True-colour satellite RGB
    var satRGB = composite.visualize(satVis);
    Export.image.toDrive({
      image: satRGB,
      description: 'Marjal_SAT_RGB_' + label,
      folder: DRIVE_FOLDER,
      fileNamePrefix: 'Marjal_SAT_RGB_' + label,
      region: geometry,
      scale: SCALE,
      crs: 'EPSG:4326',
      maxPixels: 1e9
    });
  }
}

// ── Preview: show most recent composites on map ─────────────────
var preview = getComposite(2024, 5);
Map.addLayer(preview.select('NDVI'), ndviVis, 'NDVI May 2024');
Map.addLayer(preview.select('NDWI'), ndwiVis, 'NDWI May 2024', false);
Map.addLayer(preview, satVis, 'True Colour May 2024', false);
Map.addLayer(geometry, {color: 'yellow'}, 'Study Area');

print('──────────────────────────────────────────────');
print('Seasonal exports queued: ' + (END_YEAR - START_YEAR + 1) * MONTHS.length * 3 + ' tasks');
print('Folder: ' + DRIVE_FOLDER);
print('Go to Tasks tab → Run All');
print('──────────────────────────────────────────────');
