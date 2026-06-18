(function() {
    const ELEVATION_FREQ = 0.002;
    const PREY_FREQ = 0.003;
    const PREY_DRIFT = 0.0001;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function sampleEnvironment({ x, y, time, season, params, world, preyGrid, terrainGrid, trailMap }) {
        const elevation =
            Math.sin(x * ELEVATION_FREQ) *
            Math.cos(y * ELEVATION_FREQ) *
            params.elevationInfluence;
        const temp = -20 + (params.tempRange * (1 - y / world.height));
        const snowDepth = season === 'WINTER' ? params.snowImpact : 0;

        // Terrain cost-of-transport (Stage D) or analytic elevation fallback
        var terrainCost = 1.0;
        var downhillForce;

        if (terrainGrid && terrainGrid.size > 0 && params.terrainWeight > 0) {
            var tCellSize = params.terrainCellSize || 20;
            var tcx = Math.floor(x / tCellSize);
            var tcy = Math.floor(y / tCellSize);
            var tKey = tcx + ',' + tcy;

            terrainCost = terrainGrid.get(tKey);
            if (terrainCost === undefined) terrainCost = 1.0;

            // 2D cost gradient via central finite differences
            var cRight = terrainGrid.get((tcx + 1) + ',' + tcy);
            if (cRight === undefined) cRight = terrainCost;
            var cLeft = terrainGrid.get((tcx - 1) + ',' + tcy);
            if (cLeft === undefined) cLeft = terrainCost;
            var cUp = terrainGrid.get(tcx + ',' + (tcy - 1));
            if (cUp === undefined) cUp = terrainCost;
            var cDown = terrainGrid.get(tcx + ',' + (tcy + 1));
            if (cDown === undefined) cDown = terrainCost;

            var gradScale = 1.0 / (2 * tCellSize);
            var costGradX = (cRight - cLeft) * gradScale;
            var costGradY = (cDown - cUp) * gradScale;

            // Negative gradient: steer toward LOW cost
            downhillForce = {
                x: -costGradX * params.terrainWeight * 10,
                y: -costGradY * params.terrainWeight * 10
            };
        } else {
            // Analytic elevation fallback (pre-Stage D)
            var elevationGradient = {
                x: Math.cos(x * ELEVATION_FREQ) *
                    Math.cos(y * ELEVATION_FREQ) *
                    ELEVATION_FREQ *
                    params.elevationInfluence,
                y: -Math.sin(x * ELEVATION_FREQ) *
                    Math.sin(y * ELEVATION_FREQ) *
                    ELEVATION_FREQ *
                    params.elevationInfluence
            };
            downhillForce = {
                x: -elevationGradient.x * 10,
                y: -elevationGradient.y * 10
            };
        }

        // Prey density from dynamic grid (Stage C) or analytic fallback
        var preyDensity;
        var preyGradient;

        if (preyGrid && preyGrid.size > 0) {
            var cellSize = params.preyCellSize || 20;
            var cx = Math.floor(x / cellSize);
            var cy = Math.floor(y / cellSize);
            var key = cx + ',' + cy;

            var localPrey = preyGrid.get(key);
            if (localPrey === undefined) localPrey = params.preyCarryingCapacity || 1.0;

            preyDensity = localPrey * params.preyVariation;

            // 2D gradient via central finite differences
            var pRight = preyGrid.get((cx + 1) + ',' + cy);
            if (pRight === undefined) pRight = localPrey;
            var pLeft = preyGrid.get((cx - 1) + ',' + cy);
            if (pLeft === undefined) pLeft = localPrey;
            var pUp = preyGrid.get(cx + ',' + (cy - 1));
            if (pUp === undefined) pUp = localPrey;
            var pDown = preyGrid.get(cx + ',' + (cy + 1));
            if (pDown === undefined) pDown = localPrey;

            var gradScale2 = params.preyVariation / (2 * cellSize);
            preyGradient = {
                x: (pRight - pLeft) * gradScale2,
                y: (pDown - pUp) * gradScale2
            };
        } else {
            // Analytic fallback (pre-Stage C compatibility)
            var preyPhase = x * PREY_FREQ + time * PREY_DRIFT;
            preyDensity = (Math.sin(preyPhase) + 1) * 0.5 * params.preyVariation;
            preyGradient = {
                x: Math.cos(preyPhase) * 0.5 * PREY_FREQ * params.preyVariation,
                y: 0
            };
        }

        const coldStress = clamp((0 - temp) / 40, 0, 1);
        const highGround = Math.max(0, elevation);

        // Stigmergy: trail reduces local movement cost (Stage F)
        // Log scaling so response grows monotonically without saturation
        var trailFactor = 1.0;
        if (trailMap && trailMap.size > 0 && params.stigmergyEnabled) {
            var trailCellSize = params.trailCellSize || 20;
            var trailKey = Math.floor(x / trailCellSize) + ',' + Math.floor(y / trailCellSize);
            var trailStrength = trailMap.get(trailKey) || 0;
            // Saturates: max 40% cost reduction (floor at 0.6× base cost)
            var trailReduction = Math.log(1 + trailStrength) / Math.log(1 + 500) * params.stigmergyStrength * 0.4;
            trailFactor = Math.max(0.6, 1.0 - trailReduction);
        }

        // Terrain cost multiplies base resistance (Stage D); trail reduces it (Stage F)
        const resistance = (1 + snowDepth * 0.5 + highGround * 0.3 + coldStress * 0.2) * terrainCost * trailFactor;
        const speedModifier = clamp(
            (1 - snowDepth * 0.3 - highGround * 0.2 - coldStress * 0.1) / (terrainCost * trailFactor),
            0.2, 1.2
        );
        const energyCost = resistance;

        return {
            elevation,
            temp,
            preyDensity,
            snowDepth,
            coldStress,
            resistance,
            downhillForce,
            preyGradient,
            speedModifier,
            energyCost
        };
    }

    /**
     * Load terrain from raw grayscale image data into a cost grid.
     * Convention: dark pixels (0) = low cost (preferred), bright (255) = high cost.
     * imageData: Uint8Array or array of grayscale values (0-255), row-major.
     * imgWidth, imgHeight: pixel dimensions of the source image.
     * cellSize: world-space size per grid cell.
     * world: { width, height } world dimensions.
     * Returns: Map<cellKey, costValue> where cost ∈ [0.1, 1.0].
     */
    function loadTerrainFromImageData(imageData, imgWidth, imgHeight, cellSize, world) {
        var terrain = new Map();
        var cols = Math.ceil(world.width / cellSize);
        var rows = Math.ceil(world.height / cellSize);
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                // Map grid cell to image pixel
                var imgX = Math.floor((c * cellSize / world.width) * imgWidth);
                var imgY = Math.floor((r * cellSize / world.height) * imgHeight);
                imgX = Math.min(imgX, imgWidth - 1);
                imgY = Math.min(imgY, imgHeight - 1);
                var pixelVal = imageData[imgY * imgWidth + imgX];
                // Map 0-255 to cost 0.1-1.0 (dark = low cost)
                var cost = 0.1 + (pixelVal / 255) * 0.9;
                terrain.set(c + ',' + r, cost);
            }
        }
        return terrain;
    }

    const _exports = { sampleEnvironment, loadTerrainFromImageData };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationEnvironment = _exports;
})();
