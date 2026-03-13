import requests
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------- CONFIG ---------------- #

BASE_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"

# Project root relative to scripts folder
BASE_DIR = Path(__file__).resolve().parent.parent

# Temporary folder for raw GRIB files (not committed to repo)
OUTPUT_DIR = BASE_DIR / "data" / "raw_grib"

# Clean previous raw GRIB files before fresh download
if OUTPUT_DIR.exists():
    shutil.rmtree(OUTPUT_DIR)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Yesterday's date for 00z cycle (IST midnight alignment)
DATE = (datetime.utcnow() - timedelta(days=1)).strftime("%Y%m%d")
CYCLE = "00"

# Forecast hours aligned to IST midnight (UTC+5:30)
# f019 = 19:00 UTC = 00:30 IST (Day 1 start)
FORECAST_HOURS = [
    19, 20, 21, 22, 23, 24,               # Day 1 — every 1 hour
    25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36,
    37, 38, 39, 40, 41, 42,
    45, 48, 51, 54, 57, 60,               # Day 2-3 — every 3 hours
    63, 66, 72, 78, 84, 90,               # Day 4-5 — every 6 hours
    102, 114, 126, 138                    # Beyond Day 5
]

# India bounding box
PARAMS_TEMPLATE = {
    "dir": f"/gfs.{DATE}/{CYCLE}/atmos",
    "var_MCDC": "on",                     # Middle Cloud Cover
    "subregion": "",
    "toplat": "40",
    "leftlon": "60",
    "rightlon": "100",
    "bottomlat": "5"
}

MAX_THREADS = 6

# ---------------- LOGGING ---------------- #

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ---------------- SESSION WITH RETRIES ---------------- #

session = requests.Session()

retry = Retry(
    total=5,
    backoff_factor=2,
    status_forcelist=[500, 502, 503, 504]
)

adapter = HTTPAdapter(max_retries=retry)
session.mount("http://", adapter)
session.mount("https://", adapter)

# ---------------- DOWNLOAD FUNCTION ---------------- #

def download_file(forecast_hour):

    fhr = f"{forecast_hour:03d}"
    filename = f"gfs.t{CYCLE}z.pgrb2.0p25.f{fhr}"
    filepath = OUTPUT_DIR / filename

    p = PARAMS_TEMPLATE.copy()
    p["file"] = filename

    try:
        logging.info(f"Downloading {filename}")

        r = session.get(BASE_URL, params=p, stream=True, timeout=120)

        if r.status_code != 200:
            logging.error(f"Failed {filename} - HTTP {r.status_code}")
            return

        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)

        logging.info(f"Downloaded {filename}")

    except Exception as e:
        logging.error(f"Error downloading {filename}: {e}")

# ---------------- MAIN ---------------- #

def main():
    logging.info(f"Starting MCDC download | GFS Date: {DATE} | Cycle: {CYCLE}z")
    logging.info(f"Total forecast hours to download: {len(FORECAST_HOURS)}")

    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        executor.map(download_file, FORECAST_HOURS)

    logging.info("All MCDC downloads complete")


if __name__ == "__main__":
    main()
