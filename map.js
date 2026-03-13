// ============================================================
// CONFIG
// ============================================================

var MANIFEST_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/manifest.json";
var COG_BASE_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/cog/";
var ANIMATION_INTERVAL_MS = 1500;

// ============================================================
// MAP SETUP
// ============================================================

var map = L.map("map", {
    center: [20.5937, 78.9629],
    zoom: 5,
    zoomControl: true
});

var basemap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    opacity: 0.6
}).addTo(map);

// ============================================================
// STATE
// ============================================================

var files = [];
var currentIndex = 0;
var isPlaying = false;
var animationTimer = null;
var layerGroup = L.layerGroup().addTo(map);  // dedicated group for COG layers

// ============================================================
// UI ELEMENTS
// ============================================================

var playBtn = document.getElementById("play-btn");
var pauseBtn = document.getElementById("pause-btn");
var timestampEl = document.getElementById("timestamp");

// ============================================================
// CLOUD COVER STYLING
// ============================================================

function cloudColorScale(value) {
    if (!value || value === 0 || isNaN(value)) {
        return null;
    }
    var grey = Math.round(220 - (value / 100) * 140);
    return "rgba(" + grey + "," + grey + "," + grey + ",1)";
}

// ============================================================
// LOAD SINGLE COG FRAME
// ============================================================

function loadFrame(index) {
    var fileInfo = files[index];
    var url = COG_BASE_URL + fileInfo.filename;

    timestampEl.textContent = fileInfo.valid_time_ist;

    fetch(url)
        .then(function(response) { return response.arrayBuffer(); })
        .then(function(arrayBuffer) { return parseGeoraster(arrayBuffer); })
        .then(function(georaster) {

            // Clear ALL layers from the COG layer group
            layerGroup.clearLayers();

            // Add fresh layer to group
            var newLayer = new GeoRasterLayer({
                georaster: georaster,
                opacity: 1,
                pixelValuesToColorFn: function(values) {
                    return cloudColorScale(values[0]);
                },
                resolution: 256
            });

            layerGroup.addLayer(newLayer);
        })
        .catch(function(err) {
            console.error("Error loading frame " + index + ":", err);
        });
}

// ============================================================
// PLAYER CONTROLS
// ============================================================

function play() {
    if (isPlaying) return;
    isPlaying = true;
    playBtn.disabled = true;
    pauseBtn.disabled = false;

    animationTimer = setInterval(function() {
        currentIndex = (currentIndex + 1) % files.length;
        loadFrame(currentIndex);
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
// INITIALISE
// ============================================================

function init() {
    timestampEl.textContent = "Loading forecast data...";
    playBtn.disabled = true;
    pauseBtn.disabled = true;

    fetch(MANIFEST_URL)
        .then(function(response) { return response.json(); })
        .then(function(manifest) {
            files = manifest.files;

            if (!files || files.length === 0) {
                timestampEl.textContent = "No forecast data available";
                return;
            }

            // Load first frame then enable play
            loadFrame(0);
            playBtn.disabled = false;
        })
        .catch(function(err) {
            console.error("Failed to load manifest:", err);
            timestampEl.textContent = "Failed to load forecast data";
        });
}

init();
