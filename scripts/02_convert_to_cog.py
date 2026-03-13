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

INPUT_DIR = BASE_DIR / "data" / "raw_grib"
TEMP_DIR = BASE_DIR / "data" / "geotiff"        # intermediate, not committed
OUTPUT_DIR = BASE_DIR / "data" / "cog"          # final COGs, committed to repo

# ---------------- CLEAN OLD FILES ---------------- #

# Clean intermediate temp folder
if TEMP_DIR.exists():
    shutil.rmtree(TEMP_DIR)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Clean old COG files — replaced fresh daily
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
    """Convert GFS forecast hour to IST datetime string."""
    base_utc = datetime.strptime(f"{DATE} {CYCLE}:00", "%Y%m%d %H:%M")
    valid_utc = base_utc + timedelta(hours=forecast_hour)
    valid_ist = valid_utc + timedelta(hours=5, minutes=30)
    return valid_ist.strftime("%Y-%m-%d %H:%M IST")

# ---------------- CONVERSION ---------------- #

processed = []

for grib_file in sorted(INPUT_DIR.iterdir()):

    if not grib_file.is_file():
        continue

    # Extract forecast hour from filename
    # e.g. gfs.t00z.pgrb2.0p25.f019 → 019 → 19
    try:
        fhr_str = grib_file.name.split(".f")[-1]
        fhr_int = int(fhr_str)
    except ValueError:
        logging.warning(f"Skipping unrecognised file: {grib_file.name}")
        continue

    logging.info(f"Processing {grib_file.name}")

    # Output filenames
    temp_tif = TEMP_DIR / f"f{fhr_str}.tif"
    final_cog = OUTPUT_DIR / f"f{fhr_str}.tif"

    # Step 1: GRIB2 → GeoTIFF (extract MCDC band)
    subprocess.run([
        "gdal_translate",
        "-of", "GTiff",
        str(grib_file),
        str(temp_tif)
    ], check=True)

    # Step 2: Convert to COG with compression
    # → DEFLATE compression keeps file size small
    # → PREDICTOR=2 removed (incompatible with 64-bit float GFS data)
    # → 0 values set as NoData (transparent on frontend)
    subprocess.run([
        "gdal_translate",
        "-of", "COG",
        "-co", "COMPRESS=DEFLATE",
        "-co", "OVERVIEW_RESAMPLING=AVERAGE",
        "-a_nodata", "0",
        str(temp_tif),
        str(final_cog)
    ], check=True)

    # Clean temp file
    temp_tif.unlink()

    ist_time = utc_forecast_to_ist(fhr_int)
    logging.info(f"COG created: {final_cog.name} | Valid: {ist_time}")

    processed.append({
        "filename": final_cog.name,
        "forecast_hour": fhr_int,
        "valid_time_ist": ist_time
    })

logging.info(f"Conversion complete | {len(processed)} COG files created")

# ---------------- SAVE PROCESSED LIST ---------------- #
# This list is passed to manifest generation in pipeline script

manifest_temp = BASE_DIR / "data" / "processed_files.json"
with open(manifest_temp, "w") as f:
    json.dump(processed, f, indent=2)

logging.info(f"Processed file list saved to {manifest_temp.name}")
