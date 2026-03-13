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

// ============================================================
// UI
// ============================================================

var playBtn = document.getElementById("play-btn");
var pauseBtn = document.getElementById("pause-btn");
var timestampEl = document.getElementById("timestamp");

// ============================================================
// CUSTOM CANVAS LAYER
// draws georaster directly onto canvas every frame
// ============================================================

var CanvasRasterLayer = L.Layer.extend({

    initialize: function() {
        this._georaster = null;
    },

    onAdd: function(map) {
        this._map = map;
        this._canvas = L.DomUtil.create("canvas", "raster-canvas");
        var pane = map.getPane("overlayPane");
        pane.appendChild(this._canvas);

        this._canvas.style.position = "absolute";
        this._canvas.style.pointerEvents = "none";
        this._canvas.style.imageRendering = "auto";

        map.on("moveend zoomend resize", this._redraw, this);
        return this;
    },

    onRemove: function(map) {
        map.off("moveend zoomend resize", this._redraw, this);
        L.DomUtil.remove(this._canvas);
    },

    setGeoRaster: function(georaster) {
        this._georaster = georaster;
        this._redraw();
    },

    _redraw: function() {
        if (!this._georaster || !this._map) return;

        var georaster = this._georaster;
        var map = this._map;
        var canvas = this._canvas;
        var ctx = canvas.getContext("2d");

        // Get map bounds and size
        var bounds = map.getBounds();
        var size = map.getSize();

        canvas.width = size.x;
        canvas.height = size.y;
        canvas.style.width = size.x + "px";
        canvas.style.height = size.y + "px";

        // Position canvas at top-left of map
        var topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
        L.DomUtil.setPosition(canvas, topLeft);

        // Georaster metadata
        var west = georaster.xmin;
        var east = georaster.xmax;
        var north = georaster.ymax;
        var south = georaster.ymin;
        var cols = georaster.width;
        var rows = georaster.height;
        var data = georaster.values[0];

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw each pixel
        var cellW = (east - west) / cols;
        var cellH = (north - south) / rows;

        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {

                var val = data[row][col];
                if (!val || val <= 0 || isNaN(val)) continue;

                // Pixel lat/lon
                var lat = north - (row + 0.5) * cellH;
                var lon = west + (col + 0.5) * cellW;

                // Convert to pixel coordinates
                var point = map.latLngToContainerPoint([lat, lon]);

                // Pixel size on screen
                var nw = map.latLngToContainerPoint([lat + cellH / 2, lon - cellW / 2]);
                var se = map.latLngToContainerPoint([lat - cellH / 2, lon + cellW / 2]);
                var pw = Math.max(1, se.x - nw.x + 1);
                var ph = Math.max(1, se.y - nw.y + 1);

                // Color
                var grey = Math.round(220 - (val / 100) * 140);
                var opacity;
                if (val < 10) {
                    opacity = val / 10 * 0.6;
                } else {
                    opacity = 0.6 + (val / 100) * 0.4;
                }

                ctx.fillStyle = "rgba(" + grey + "," + grey + "," + grey + "," + opacity.toFixed(2) + ")";
                ctx.fillRect(nw.x, nw.y, pw, ph);
            }
        }

        console.log("Canvas redrawn for frame " + currentIndex);
    }
});

var canvasLayer = new CanvasRasterLayer();
canvasLayer.addTo(map);

// ============================================================
// SHOW FRAME
// ============================================================

function showFrame(index) {
    var georaster = georasterCache[index];
    timestampEl.textContent = files[index].valid_time_ist;

    if (georaster) {
        canvasLayer.setGeoRaster(georaster);
    } else {
        var url = COG_BASE_URL + files[index].filename;
        fetch(url)
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(buf) { return parseGeoraster(buf); })
            .then(function(gr) {
                georasterCache[index] = gr;
                canvasLayer.setGeoRaster(gr);
            })
            .catch(function(e) {
                console.error("Frame load failed:", index, e);
            });
    }
}

// ============================================================
// PRELOAD
// ============================================================

function preloadAll() {
    for (var i = 1; i < files.length; i++) {
        (function(idx) {
            fetch(COG_BASE_URL + files[idx].filename)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) { georasterCache[idx] = gr; })
                .catch(function() {});
        })(i);
    }
}

// ============================================================
// PLAYER
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
}

playBtn.addEventListener("click", play);
pauseBtn.addEventListener("click", pause);

// ============================================================
// INIT
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
            fetch(COG_BASE_URL + files[0].filename)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(buf) { return parseGeoraster(buf); })
                .then(function(gr) {
                    georasterCache[0] = gr;
                    showFrame(0);
                    playBtn.disabled = false;
                    preloadAll();
                });
        })
        .catch(function(e) {
            timestampEl.textContent = "Forecast load failed";
        });
}

init();
