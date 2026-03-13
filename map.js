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
var georasterCache = {};
var currentLayer = null;

// ============================================================
// UI
// ============================================================

var playBtn = document.getElementById("play-btn");
var pauseBtn = document.getElementById("pause-btn");
var timestampEl = document.getElementById("timestamp");

// ============================================================
// CLOUD COLOR SCALE — with smooth edge blending
// ============================================================

function cloudColorScale(value) {
    if (value === null || value === undefined || isNaN(value) || value <= 0) {
        return null;
    }

    // Smooth edge — low cloud values get lower opacity
    // value 1-10  → very faint (smooth transition from transparent)
    // value 10-100 → solid grey scale
    var opacity;
    if (value < 10) {
        opacity = value / 10 * 0.6;       // fade in smoothly at edges
    } else {
        opacity = 0.6 + (value / 100) * 0.4;  // 0.6 to 1.0 for solid cloud
    }

    var grey = Math.round(220 - (value / 100) * 140);
    return "rgba(" + grey + "," + grey + "," + grey + "," + opacity.toFixed(2) + ")";
}

// ============================================================
// RENDER FRAME — always remove and recreate layer
// ============================================================

function renderFrame(index, georaster) {

    // Always remove old layer first
    if (currentLayer !== null) {
        map.removeLayer(currentLayer);
        currentLayer = null;
    }

    // Create fresh layer every time
    currentLayer = new GeoRasterLayer({
        georaster: georaster,
        opacity: 1,
        resolution: 128,                   // lower = smoother appearance
        pixelValuesToColorFn: function(values) {
            return cloudColorScale(values[0]);
        }
    });

    // Add to map
    map.addLayer(currentLayer);

    // Update timestamp
    timestampEl.textContent = files[index].valid_time_ist;

    console.log("Rendered frame " + index + ": " + files[index].filename);
}

// ============================================================
// SHOW FRAME — from cache or fetch
// ============================================================

function showFrame(index) {
    var georaster = georasterCache[index];

    if (georaster) {
        renderFrame(index, georaster);
    } else {
        var url = COG_BASE_URL + files[index].filename;
        fetch(url)
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(buf) { return parseGeoraster(buf); })
            .then(function(gr) {
                georasterCache[index] = gr;
                renderFrame(index, gr);
            })
            .catch(function(e) {
                console.error("Frame load failed:", index, e);
            });
    }
}

// ============================================================
// PRELOAD ALL FRAMES IN BACKGROUND
// ============================================================

function preloadAll() {
    for (var i = 1; i < files.length; i++) {
        (function(idx) {
            var url = COG_BASE_URL + files[idx].filename;
            fetch(url)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) {
                    georasterCache[idx] = gr;
                })
                .catch(function(e) {
                    console.warn("Preload failed frame " + idx);
                });
        })(i);
    }
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
    timestampEl.textContent = "Loading forecast...";
    playBtn.disabled = true;
    pauseBtn.disabled = true;

    fetch(MANIFEST_URL)
        .then(function(r) { return r.json(); })
        .then(function(manifest) {
            files = manifest.files;

            if (!files || files.length === 0) {
                timestampEl.textContent = "No forecast data";
                return;
            }

            // Load and render first frame
            var url = COG_BASE_URL + files[0].filename;
            fetch(url)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) {
                    georasterCache[0] = gr;
                    renderFrame(0, gr);
                    playBtn.disabled = false;

                    // Preload rest in background
                    preloadAll();
                });
        })
        .catch(function(e) {
            console.error("Manifest load error:", e);
            timestampEl.textContent = "Forecast load failed";
        });
}

init();
