// ============================================================
// CONFIG
// ============================================================

const MANIFEST_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/manifest.json";
const COG_BASE_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/cog/";
const ANIMATION_INTERVAL_MS = 1000;       // 1 second per frame

// ============================================================
// MAP SETUP — centered on India
// ============================================================

const map = L.map("map", {
    center: [20.5937, 78.9629],
    zoom: 5,
    zoomControl: true
});

// Basemap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    opacity: 0.6
}).addTo(map);

// ============================================================
// STATE
// ============================================================

let files = [];
let currentIndex = 0;
let isPlaying = false;
let animationTimer = null;
let currentLayer = null;
let isLoading = false;

// ============================================================
// UI ELEMENTS
// ============================================================

const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const timestampEl = document.getElementById("timestamp");

// ============================================================
// CLOUD COVER STYLING
// → 0 or nodata = fully transparent
// → 1-100 = solid grey (darker = more cloud)
// ============================================================

function cloudColorScale(value) {
    if (value === 0 || value === null || value === undefined || isNaN(value)) {
        return null;                        // fully transparent — no cloud
    }
    // Solid grey — darker for higher cloud cover
    // value 1  → light grey  rgb(220,220,220)
    // value 100 → dark grey  rgb(80,80,80)
    const grey = Math.round(220 - (value / 100) * 140);
    return `rgba(${grey}, ${grey}, ${grey}, 1)`;   // fully opaque
}

// ============================================================
// LOAD COG LAYER
// ============================================================

async function loadCOGLayer(index) {

    if (isLoading) return;
    isLoading = true;

    const fileInfo = files[index];
    const url = COG_BASE_URL + fileInfo.filename;

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);

        // Remove previous layer before adding new one
        if (currentLayer) {
            map.removeLayer(currentLayer);
            currentLayer = null;
        }

        // Add new COG layer
        currentLayer = new GeoRasterLayer({
            georaster: georaster,
            opacity: 1,
            pixelValuesToColorFn: values => cloudColorScale(values[0]),
            resolution: 256
        });

        currentLayer.addTo(map);

        // Update timestamp in controls bar only
        timestampEl.textContent = fileInfo.valid_time_ist;

    } catch (err) {
        console.error("Failed to load COG:", err);
        timestampEl.textContent = "Error loading frame";
    }

    isLoading = false;
}

// ============================================================
// PLAYER CONTROLS
// ============================================================

function play() {
    if (isPlaying) return;
    isPlaying = true;

    playBtn.disabled = true;
    pauseBtn.disabled = false;

    animationTimer = setInterval(async () => {
        currentIndex = (currentIndex + 1) % files.length;
        await loadCOGLayer(currentIndex);
    }, ANIMATION_INTERVAL_MS);
}

function pause() {
    if (!isPlaying) return;
    isPlaying = false;

    playBtn.disabled = false;
    pauseBtn.disabled = true;

    clearInterval(animationTimer);
    animationTimer = null;
}

playBtn.addEventListener("click", play);
pauseBtn.addEventListener("click", pause);

// ============================================================
// LOAD MANIFEST AND INITIALISE
// ============================================================

async function init() {

    timestampEl.textContent = "Loading forecast data...";

    try {
        const response = await fetch(MANIFEST_URL);
        const manifest = await response.json();

        files = manifest.files;

        if (!files || files.length === 0) {
            timestampEl.textContent = "No forecast data available";
            return;
        }

        // Load first frame
        await loadCOGLayer(0);

        playBtn.disabled = false;

    } catch (err) {
        console.error("Failed to load manifest:", err);
        timestampEl.textContent = "Failed to load forecast data";
    }
}

// Start app
init();
