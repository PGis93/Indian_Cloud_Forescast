import subprocess
import logging
import shutil
import json
from pathlib import Path
from datetime import datetime, timedelta

# ---------------- LOGGING ---------------- #

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ---------------- PROJECT ROOT ---------------- #

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------- INPUT & OUTPUT PATHS ---------------- #

INPUT_DIR  = BASE_DIR / "data" / "raw_grib"
TEMP_DIR   = BASE_DIR / "data" / "temp_warp"    # intermediate, not committed
OUTPUT_DIR = BASE_DIR / "data" / "cog"          # final COGs, committed to repo

# ---------------- CLEAN OLD FILES ---------------- #

if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

if OUTPUT_DIR.exists():
    for f in OUTPUT_DIR.glob("*.tif"):
        f.unlink()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------- CHECK INPUT ---------------- #

if not INPUT_DIR.exists() or not any(INPUT_DIR.iterdir()):
    raise FileNotFoundError(f"No GRIB files found in {INPUT_DIR}")

# ---------------- IST TIMESTAMP HELPER ---------------- #

CYCLE = "00"
DATE = (datetime.utcnow() - timedelta(days=1)).strftime("%Y%m%d")

def utc_forecast_to_ist(forecast_hour):
    base_utc = datetime.strptime(f"{DATE} {CYCLE}:00", "%Y%m%d %H:%M")
    valid_utc = base_utc + timedelta(hours=forecast_hour)
    valid_ist = valid_utc + timedelta(hours=5, minutes=30)
    return valid_ist.strftime("%Y-%m-%d %H:%M IST")

# ---------------- PROCESSING ---------------- #

processed = []

for grib_file in sorted(INPUT_DIR.iterdir()):

    if not grib_file.is_file():
        continue

    try:
        fhr_str = grib_file.name.split(".f")[-1]
        fhr_int = int(fhr_str)
    except ValueError:
        logging.warning(f"Skipping unrecognized file: {grib_file.name}")
        continue

    logging.info(f"Processing {grib_file.name}")

    warp_tif  = TEMP_DIR  / f"f{fhr_str}_warp.tif"
    final_cog = OUTPUT_DIR / f"f{fhr_str}.tif"

    # ---------------- STEP 1: REPROJECT ---------------- #
    # → reproject to EPSG:4326
    # → keep 0.25° resolution for global (manageable file size)
    # → bilinear still smooths within existing resolution
    subprocess.run([
        "gdalwarp",
        "-t_srs", "EPSG:4326",
        "-tr", "0.25", "0.25",          # 0.25° = original GFS resolution
        "-r", "bilinear",               # smooth interpolation
        "-overwrite",
        str(grib_file),
        str(warp_tif)
    ], check=True)

    # ---------------- STEP 2: CONVERT TO COG ---------------- #
    subprocess.run([
        "gdal_translate",
        "-of", "COG",
        "-co", "COMPRESS=DEFLATE",
        "-co", "OVERVIEW_RESAMPLING=AVERAGE",
        "-a_nodata", "0",
        str(warp_tif),
        str(final_cog)
    ], check=True)

    # ---------------- CLEAN TEMP ---------------- #
    warp_tif.unlink()

    ist_time = utc_forecast_to_ist(fhr_int)
    size_mb = round(final_cog.stat().st_size / (1024 * 1024), 2)
    logging.info(f"COG created: {final_cog.name} | {size_mb}MB | Valid: {ist_time}")

    processed.append({
        "filename": final_cog.name,
        "forecast_hour": fhr_int,
        "valid_time_ist": ist_time
    })

# ---------------- SUMMARY ---------------- #

logging.info(f"Conversion complete | {len(processed)} COG files created")

# ---------------- SAVE PROCESSED LIST ---------------- #

manifest_temp = BASE_DIR / "data" / "processed_files.json"
with open(manifest_temp, "w") as f:
    json.dump(processed, f, indent=2)

logging.info(f"Processed file list saved to {manifest_temp.name}")
