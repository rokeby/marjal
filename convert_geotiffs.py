#!/usr/bin/env python3
"""Convert Marjal dels Moros GeoTIFF RGB files to web-friendly PNG.

Usage:
    python convert_geotiffs.py --input-dir /path/to/tifs --output-dir data/images

Expects files named:
    Marjal_NDVI_RGB_YYYY.tif
    Marjal_NDWI_RGB_YYYY.tif
"""

import argparse
import os
import re
import sys

import numpy as np

try:
    import rasterio
except ImportError:
    sys.exit("Install rasterio: pip install rasterio")

from PIL import Image


def convert_tif_to_png(tif_path, png_path, target_size=512):
    """Read a 3-band GeoTIFF and save as PNG."""
    with rasterio.open(tif_path) as src:
        # Read RGB bands (1, 2, 3)
        bands = src.read([1, 2, 3])  # shape: (3, H, W)

    # Stack to (H, W, 3)
    rgb = np.moveaxis(bands, 0, -1)

    # Handle nodata / NaN → black
    rgb = np.nan_to_num(rgb, nan=0.0)

    # Normalize to 0-255 if float
    if rgb.dtype in (np.float32, np.float64):
        vmin, vmax = np.percentile(rgb[rgb > 0], [2, 98]) if (rgb > 0).any() else (0, 1)
        rgb = np.clip((rgb - vmin) / (vmax - vmin + 1e-10) * 255, 0, 255)

    rgb = rgb.astype(np.uint8)

    img = Image.fromarray(rgb)
    if target_size:
        img = img.resize((target_size, target_size), Image.LANCZOS)
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    img.save(png_path, 'PNG', optimize=True)
    print(f"  {os.path.basename(tif_path)} → {png_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert GeoTIFFs to PNG")
    parser.add_argument("--input-dir", required=True, help="Directory containing GeoTIFF files")
    parser.add_argument("--output-dir", default="data/images", help="Output directory")
    parser.add_argument("--size", type=int, default=512, help="Output image size (px)")
    args = parser.parse_args()

    pattern = re.compile(r"Marjal_(NDVI|NDWI)_RGB_(\d{4})\.tif$", re.IGNORECASE)
    found = 0

    for fname in sorted(os.listdir(args.input_dir)):
        m = pattern.match(fname)
        if not m:
            continue
        idx = m.group(1).lower()
        year = m.group(2)
        tif_path = os.path.join(args.input_dir, fname)
        png_path = os.path.join(args.output_dir, idx, f"{year}.png")
        convert_tif_to_png(tif_path, png_path, args.size)
        found += 1

    if found == 0:
        print(f"No matching GeoTIFF files found in {args.input_dir}")
        print("Expected pattern: Marjal_NDVI_RGB_YYYY.tif / Marjal_NDWI_RGB_YYYY.tif")
    else:
        print(f"\nConverted {found} files.")


if __name__ == "__main__":
    main()
