// ============================================================
// CONFIG
// ============================================================

var MANIFEST_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/manifest.json";
var COG_BASE_URL = "https://pgis93.github.io/Indian_Cloud_Forescast/data/cog/";
var ANIMATION_INTERVAL_MS = 2000;

// ============================================================
// MAP
// ============================================================

var map = L.map("map", {
    center: [20.5937, 78.9629],
    zoom: 5,
    preferCanvas: true
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
var rasterLayer = null;

// ============================================================
// UI
// ============================================================

var playBtn = document.getElementById("play-btn");
var pauseBtn = document.getElementById("pause-btn");
var timestampEl = document.getElementById("timestamp");

// ============================================================
// COLOR SCALE
// ============================================================

function cloudColorScale(value) {

    if (!value || value === 0 || isNaN(value)) {
        return null;
    }

    var grey = Math.round(220 - (value / 100) * 140);

    return "rgba(" + grey + "," + grey + "," + grey + ",1)";
}

// ============================================================
// UPDATE RASTER
// ============================================================

function updateRaster(georaster, index) {

    if (!rasterLayer) {

        rasterLayer = new GeoRasterLayer({
            georaster: georaster,
            opacity: 1,
            resolution: 256,
            pixelValuesToColorFn: function(values) {
                return cloudColorScale(values[0]);
            }
        });

        rasterLayer.addTo(map);

    } else {

        rasterLayer.georaster = georaster;
        rasterLayer.redraw();
    }

    timestampEl.textContent = files[index].valid_time_ist;
}

// ============================================================
// SHOW FRAME
// ============================================================

function showFrame(index) {

    console.log("Frame:", index, files[index].filename);

    var georaster = georasterCache[index];

    if (georaster) {

        updateRaster(georaster, index);

    } else {

        var url = COG_BASE_URL + files[index].filename;

        fetch(url)
            .then(function(r){ return r.arrayBuffer(); })
            .then(function(buf){ return parseGeoraster(buf); })
            .then(function(gr){

                georasterCache[index] = gr;

                updateRaster(gr, index);

            })
            .catch(function(e){
                console.error("Frame load failed:", index, e);
            });
    }
}

// ============================================================
// PRELOAD
// ============================================================

function preloadAll() {

    for (var i = 1; i < files.length; i++) {

        (function(idx){

            var url = COG_BASE_URL + files[idx].filename;

            fetch(url)
                .then(function(r){ return r.arrayBuffer(); })
                .then(function(buf){ return parseGeoraster(buf); })
                .then(function(gr){

                    georasterCache[idx] = gr;

                });

        })(i);
    }
}

// ============================================================
// PLAYER
// ============================================================

function play(){

    if (isPlaying) return;

    isPlaying = true;

    playBtn.disabled = true;
    pauseBtn.disabled = false;

    animationTimer = setInterval(function(){

        currentIndex++;

        if (currentIndex >= files.length) {
            currentIndex = 0;
        }

        showFrame(currentIndex);

    }, ANIMATION_INTERVAL_MS);
}

function pause(){

    isPlaying = false;

    playBtn.disabled = false;
    pauseBtn.disabled = true;

    clearInterval(animationTimer);
}

// ============================================================
// EVENTS
// ============================================================

playBtn.addEventListener("click", play);
pauseBtn.addEventListener("click", pause);

// ============================================================
// INIT
// ============================================================

function init(){

    timestampEl.textContent = "Loading forecast...";

    playBtn.disabled = true;
    pauseBtn.disabled = true;

    fetch(MANIFEST_URL)

        .then(function(r){ return r.json(); })

        .then(function(manifest){

            files = manifest.files;

            if (!files || files.length === 0){

                timestampEl.textContent = "No forecast data";
                return;
            }

            var url = COG_BASE_URL + files[0].filename;

            fetch(url)
                .then(function(r){ return r.arrayBuffer(); })
                .then(function(buf){ return parseGeoraster(buf); })
                .then(function(gr){

                    georasterCache[0] = gr;

                    updateRaster(gr, 0);

                    playBtn.disabled = false;

                    preloadAll();
                });
        })
        .catch(function(e){

            console.error("Manifest load error:", e);

            timestampEl.textContent = "Forecast load failed";
        });
}

init();
