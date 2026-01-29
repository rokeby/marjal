#!/usr/bin/env python3
"""Extract geographic bounds from a GeoTIFF and write data/bounds.json.

Usage:
    python extract_bounds.py path/to/any_image.tif

This reads the raster extent and writes a bounds.json that the web app
will use to position images correctly on the Leaflet map.
"""
import json, sys
try:
    import rasterio
except ImportError:
    sys.exit("pip install rasterio")

if len(sys.argv) < 2:
    sys.exit("Usage: python extract_bounds.py <geotiff>")

with rasterio.open(sys.argv[1]) as src:
    b = src.bounds  # BoundingBox(left, bottom, right, top)
    # If CRS is not EPSG:4326, reproject bounds
    from rasterio.warp import transform_bounds
    west, south, east, north = transform_bounds(src.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)

bounds = {"south": south, "north": north, "west": west, "east": east}
with open("data/bounds.json", "w") as f:
    json.dump(bounds, f, indent=2)
print(f"Wrote data/bounds.json: {json.dumps(bounds, indent=2)}")
