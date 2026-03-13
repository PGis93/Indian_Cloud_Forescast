// ============================================================
// CONFIG
// ============================================================

const MANIFEST_URL = "../data/manifest.json";
const COG_BASE_URL = "../data/cog/";
const ANIMATION_INTERVAL_MS = 1000;       // 1 second per frame

// ============================================================
// MAP SETUP — centered on India
// ============================================================

const map = L.map("map", {
    center: [20.5937, 78.9629],           // India center
    zoom: 5,
    zoomControl: true
});

// Basemap — dark OpenStreetMap style
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    opacity: 0.4                          // dimmed so cloud layer is clear
}).addTo(map);

// ============================================================
// STATE
// ============================================================

let files = [];                           // list of COG files from manifest
let currentIndex = 0;                     // current frame index
let isPlaying = false;                    // play/pause state
let animationTimer = null;               // setInterval reference
let currentLayer = null;                  // current COG layer on map
let isLoading = false;                    // prevent double loads

// ============================================================
// UI ELEMENTS
// ============================================================

const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const timestampEl = document.getElementById("timestamp");

// Show loading message
function showLoading(msg) {
    let el = document.getElementById("loading");
    if (!el) {
        el = document.createElement("div");
        el.id = "loading";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
}

// Hide loading message
function hideLoading() {
    const el = document.getElementById("loading");
    if (el) el.style.display = "none";
}

// ============================================================
// CLOUD COVER STYLING
// → 0 = transparent (no cloud)
// → 1-100 = grey scale (light to dark grey)
// ============================================================

function cloudColorScale(value) {

    // No cloud or nodata → fully transparent
    if (value === 0 || value === null || isNaN(value)) {
        return null;
    }

    // Scale grey: light grey for low cloud, dark grey for full cloud
    // value 1-100 → opacity 0.2 to 0.85
    const opacity = 0.2 + (value / 100) * 0.65;
    const grey = Math.round(180 - (value / 100) * 80);   // 180 → 100

    return `rgba(${grey}, ${grey}, ${grey}, ${opacity})`;
}

// ============================================================
// LOAD COG LAYER
// ============================================================

async function loadCOGLayer(index) {

    if (isLoading) return;
    isLoading = true;

    const fileInfo = files[index];
    const url = COG_BASE_URL + fileInfo.filename;

    showLoading("Loading " + fileInfo.valid_time_ist + " ...");

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);

        // Remove previous layer
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

        // Update timestamp display
        timestampEl.textContent = fileInfo.valid_time_ist;

        hideLoading();

    } catch (err) {
        console.error("Failed to load COG:", err);
        timestampEl.textContent = "Error loading frame";
        hideLoading();
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

    showLoading("Fetching forecast data...");

    try {
        const response = await fetch(MANIFEST_URL);
        const manifest = await response.json();

        files = manifest.files;

        if (!files || files.length === 0) {
            timestampEl.textContent = "No forecast data available";
            hideLoading();
            return;
        }

        // Load first frame
        await loadCOGLayer(0);

        playBtn.disabled = false;

    } catch (err) {
        console.error("Failed to load manifest:", err);
        timestampEl.textContent = "Failed to load forecast data";
        hideLoading();
    }
}

// Start app
init();
