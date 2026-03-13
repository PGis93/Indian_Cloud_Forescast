import subprocess
import logging
import json
from pathlib import Path
from datetime import datetime, timedelta

# ---------------- LOGGING CONFIG ---------------- #

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ---------------- PATH CONFIG ---------------- #

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent

DOWNLOAD_SCRIPT = SCRIPTS_DIR / "01_downloading_data.py"
CONVERT_SCRIPT  = SCRIPTS_DIR / "02_convert_to_cog.py"

PROCESSED_FILE  = BASE_DIR / "data" / "processed_files.json"
MANIFEST_FILE   = BASE_DIR / "data" / "manifest.json"

# ---------------- RUN SCRIPT FUNCTION ---------------- #

def run_script(script_path):

    logging.info(f"Running {script_path.name}")

    try:
        subprocess.run(
            ["python", str(script_path)],
            check=True
        )
        logging.info(f"{script_path.name} completed successfully")

    except subprocess.CalledProcessError as e:
        logging.error(f"{script_path.name} failed")
        raise e

# ---------------- MANIFEST GENERATION ---------------- #

def generate_manifest():

    logging.info("Generating manifest.json")

    # Read processed files list saved by 02_convert_to_cog.py
    if not PROCESSED_FILE.exists():
        raise FileNotFoundError("processed_files.json not found — conversion may have failed")

    with open(PROCESSED_FILE, "r") as f:
        processed = json.load(f)

    # Cycle info
    cycle_date = (datetime.utcnow() - timedelta(days=1)).strftime("%Y%m%d")
    generated_at = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d %H:%M IST")

    manifest = {
        "cycle_date": cycle_date,
        "cycle_utc": "00z",
        "generated_at": generated_at,
        "total_files": len(processed),
        "files": processed
    }

    with open(MANIFEST_FILE, "w") as f:
        json.dump(manifest, f, indent=2)

    # Clean up temp processed list
    PROCESSED_FILE.unlink()

    logging.info(f"manifest.json created | {len(processed)} files | Cycle: {cycle_date} 00z")

# ---------------- MAIN PIPELINE ---------------- #

def main():

    start_time = datetime.now()
    logging.info("========= Cloud Cover Pipeline Started =========")

    # Step 1: Download fresh GFS MCDC data
    run_script(DOWNLOAD_SCRIPT)

    # Step 2: Convert GRIB2 to COG
    run_script(CONVERT_SCRIPT)

    # Step 3: Generate manifest.json
    generate_manifest()

    end_time = datetime.now()
    duration = end_time - start_time

    logging.info(f"========= Pipeline Finished in {duration} =========")


if __name__ == "__main__":
    main()
