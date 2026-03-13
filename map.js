// ============================================================
// CONFIG
// ============================================================

var MANIFEST_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/manifest.json";
var COG_BASE_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/cog/";
var ANIMATION_INTERVAL_MS = 2000;

// ============================================================
// MAP SETUP
// ============================================================

var map = L.map("map", {
    center: [20.5937, 78.9629],
    zoom: 5,
    zoomControl: true
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
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
var currentLayer = null;

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
// PRELOADED GEORASTERS CACHE
// ============================================================

var georasterCache = {};

function preloadAll() {
    // Preload all georasters in background
    for (var i = 0; i < files.length; i++) {
        (function(idx) {
            var url = COG_BASE_URL + files[idx].filename;
            fetch(url)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) {
                    georasterCache[idx] = gr;
                    console.log("Preloaded frame " + idx);
                })
                .catch(function(e) {
                    console.warn("Failed to preload frame " + idx);
                });
        })(i);
    }
}

// ============================================================
// SHOW FRAME FROM CACHE
// ============================================================

function showFrame(index) {
    var fileInfo = files[index];
    timestampEl.textContent = fileInfo.valid_time_ist;

    var georaster = georasterCache[index];

    if (!georaster) {
        console.warn("Frame " + index + " not cached yet — loading now");
        var url = COG_BASE_URL + fileInfo.filename;
        fetch(url)
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(buf) { return parseGeoraster(buf); })
            .then(function(gr) {
                georasterCache[index] = gr;
                renderFrame(index, gr);
            });
        return;
    }

    renderFrame(index, georaster);
}

function renderFrame(index, georaster) {
    // Remove old layer completely
    if (currentLayer) {
        map.removeLayer(currentLayer);
        currentLayer = null;
    }

    currentLayer = new GeoRasterLayer({
        georaster: georaster,
        opacity: 1,
        pixelValuesToColorFn: function(values) {
            return cloudColorScale(values[0]);
        },
        resolution: 256,
        updateWhenIdle: false,
        updateWhenZooming: false
    });

    currentLayer.addTo(map);
    console.log("Rendered frame " + index);
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
        showFrame(currentIndex);
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

            // Load first frame then preload rest in background
            var url = COG_BASE_URL + files[0].filename;
            fetch(url)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) {
                    georasterCache[0] = gr;
                    renderFrame(0, gr);
                    timestampEl.textContent = files[0].valid_time_ist;
                    playBtn.disabled = false;

                    // Preload remaining frames in background
                    preloadAll();
                });
        })
        .catch(function(err) {
            console.error("Failed to load manifest:", err);
            timestampEl.textContent = "Failed to load forecast data";
        });
}

init();
