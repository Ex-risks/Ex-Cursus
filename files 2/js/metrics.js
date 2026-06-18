(function() {
    function parseDensityKey(key, cellSize) {
        const [x, y] = key.split(',').map(Number);
        return { x, y, cx: x * cellSize, cy: y * cellSize };
    }

    function summarizeDensity(densityMap, options) {
        const config = Object.assign({ cellSize: 20, corridorQuantile: 0.9 }, options || {});
        const cells = [];
        densityMap.forEach((count, key) => {
            if (count > 0) cells.push(Object.assign(parseDensityKey(key, config.cellSize), { key, count }));
        });

        if (cells.length === 0) {
            return {
                occupiedCells: 0,
                totalVisits: 0,
                maxCellVisits: 0,
                corridorCells: 0,
                corridorShare: 0,
                reuseIndex: 0,
                entropy: 0,
                centroid: null,
                bbox: null
            };
        }

        const totalVisits = cells.reduce((sum, cell) => sum + cell.count, 0);
        const maxCellVisits = Math.max(...cells.map(cell => cell.count));
        const sortedCounts = cells.map(cell => cell.count).sort((a, b) => a - b);
        const thresholdIndex = Math.max(0, Math.floor((sortedCounts.length - 1) * config.corridorQuantile));
        const corridorThreshold = sortedCounts[thresholdIndex];
        const corridorCells = cells.filter(cell => cell.count >= corridorThreshold);
        const corridorVisits = corridorCells.reduce((sum, cell) => sum + cell.count, 0);
        const entropy = -cells.reduce((sum, cell) => {
            const p = cell.count / totalVisits;
            return sum + p * Math.log2(p);
        }, 0);
        const centroid = cells.reduce((acc, cell) => {
            acc.x += cell.cx * cell.count;
            acc.y += cell.cy * cell.count;
            return acc;
        }, { x: 0, y: 0 });
        centroid.x /= totalVisits;
        centroid.y /= totalVisits;

        const bbox = {
            minX: Math.min(...cells.map(cell => cell.cx)),
            minY: Math.min(...cells.map(cell => cell.cy)),
            maxX: Math.max(...cells.map(cell => cell.cx)),
            maxY: Math.max(...cells.map(cell => cell.cy))
        };

        return {
            occupiedCells: cells.length,
            totalVisits,
            maxCellVisits,
            corridorCells: corridorCells.length,
            corridorShare: corridorVisits / totalVisits,
            reuseIndex: maxCellVisits / totalVisits,
            entropy,
            centroid,
            bbox
        };
    }

    function summarizePaths(paths) {
        if (!paths.length) {
            return {
                segmentCount: 0,
                retainedLength: 0,
                meanSegmentLength: 0,
                bbox: null
            };
        }

        let retainedLength = 0;
        const bbox = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };

        paths.forEach(path => {
            const dx = path.x2 - path.x1;
            const dy = path.y2 - path.y1;
            retainedLength += Math.sqrt(dx * dx + dy * dy);
            bbox.minX = Math.min(bbox.minX, path.x1, path.x2);
            bbox.minY = Math.min(bbox.minY, path.y1, path.y2);
            bbox.maxX = Math.max(bbox.maxX, path.x1, path.x2);
            bbox.maxY = Math.max(bbox.maxY, path.y1, path.y2);
        });

        return {
            segmentCount: paths.length,
            retainedLength,
            meanSegmentLength: retainedLength / paths.length,
            bbox
        };
    }

    function summarizePopulation(packs) {
        const wolves = packs.flatMap(pack => pack.wolves);
        const count = wolves.length;
        if (!count) {
            return {
                packCount: packs.length,
                wolfCount: 0,
                meanEnergy: 0,
                meanAge: 0
            };
        }

        return {
            packCount: packs.length,
            wolfCount: count,
            meanEnergy: wolves.reduce((sum, wolf) => sum + wolf.energy, 0) / count,
            meanAge: wolves.reduce((sum, wolf) => sum + wolf.age, 0) / count
        };
    }

    function summarizeDistribution(values) {
        if (!values || values.length === 0) {
            return { count: 0, mean: 0, std: 0, median: 0, min: 0, max: 0, histogram: [] };
        }
        const n = values.length;
        const sorted = values.slice().sort((a, b) => a - b);
        const mean = values.reduce((s, v) => s + v, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
        const std = Math.sqrt(variance);
        const median = n % 2 === 0
            ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
            : sorted[Math.floor(n / 2)];

        // 10-bin histogram
        const lo = sorted[0];
        const hi = sorted[n - 1];
        const bins = 10;
        const histogram = new Array(bins).fill(0);
        if (hi > lo) {
            const binWidth = (hi - lo) / bins;
            for (let i = 0; i < n; i++) {
                const idx = Math.min(bins - 1, Math.floor((values[i] - lo) / binWidth));
                histogram[idx]++;
            }
        } else {
            histogram[0] = n;
        }

        return { count: n, mean, std, median, min: sorted[0], max: sorted[n - 1], histogram };
    }

    function summarizeTurningAngles(angles) {
        const base = summarizeDistribution(angles);
        if (base.count === 0) return base;
        // Circular mean
        let sinSum = 0, cosSum = 0;
        for (let i = 0; i < angles.length; i++) {
            sinSum += Math.sin(angles[i]);
            cosSum += Math.cos(angles[i]);
        }
        base.circularMean = Math.atan2(sinSum / angles.length, cosSum / angles.length);
        base.meanResultantLength = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / angles.length;
        return base;
    }

    function summarizeMSD(msdSamples) {
        if (!msdSamples || msdSamples.length < 2) {
            return { sampleCount: msdSamples ? msdSamples.length : 0, slope: 0, samples: {} };
        }
        // Report MSD at specific steps
        const targets = [10, 50, 100, 200, 500];
        const samples = {};
        for (let i = 0; i < msdSamples.length; i++) {
            if (targets.indexOf(msdSamples[i].step) >= 0) {
                samples[msdSamples[i].step] = msdSamples[i].msd;
            }
        }
        // Log-log slope (linear regression on log(step) vs log(msd))
        const logData = msdSamples.filter(s => s.step > 0 && s.msd > 0);
        let slope = 0;
        if (logData.length >= 2) {
            const xs = logData.map(s => Math.log(s.step));
            const ys = logData.map(s => Math.log(s.msd));
            const n = xs.length;
            const xMean = xs.reduce((a, b) => a + b, 0) / n;
            const yMean = ys.reduce((a, b) => a + b, 0) / n;
            let num = 0, den = 0;
            for (let i = 0; i < n; i++) {
                num += (xs[i] - xMean) * (ys[i] - yMean);
                den += (xs[i] - xMean) * (xs[i] - xMean);
            }
            slope = den > 0 ? num / den : 0;
        }
        return { sampleCount: msdSamples.length, slope, samples };
    }

    function summarizePreyField(preyGrid, params) {
        if (!preyGrid || preyGrid.size === 0) {
            return { cellCount: 0, meanBiomass: 0, minBiomass: 0, maxBiomass: 0, depletedCells: 0, depletedFraction: 0 };
        }
        var K = (params && params.preyCarryingCapacity) || 1.0;
        var total = 0, min = Infinity, max = -Infinity, depleted = 0, count = 0;
        preyGrid.forEach(function(biomass) {
            total += biomass;
            if (biomass < min) min = biomass;
            if (biomass > max) max = biomass;
            if (biomass < K * 0.9) depleted++;
            count++;
        });
        return {
            cellCount: count,
            meanBiomass: count > 0 ? total / count : 0,
            minBiomass: min === Infinity ? 0 : min,
            maxBiomass: max === -Infinity ? 0 : max,
            depletedCells: depleted,
            depletedFraction: count > 0 ? depleted / count : 0
        };
    }

    function buildRunMetrics(state) {
        const density = summarizeDensity(state.densityMap, { cellSize: state.cellSize || 20 });
        const paths = summarizePaths(state.svgPaths || []);
        const population = summarizePopulation(state.packs || []);
        const events = Object.assign({ kill: 0, birth: 0, death: 0 }, state.events || {});
        const stepLengthDist = summarizeDistribution(state.stepLengths || []);
        const turningAngleDist = summarizeTurningAngles(state.turningAngles || []);
        const msd = summarizeMSD(state.msdSamples || []);
        const preyField = summarizePreyField(state.preyGrid, state.params);

        return {
            schemaVersion: 3,
            seed: state.seed,
            time: state.time,
            day: state.day,
            generation: state.generation,
            world: state.world,
            params: state.params,
            distanceKm: state.totalDistance,
            droppedPathSegments: state.droppedSvgPathCount || 0,
            population,
            events,
            density,
            paths,
            stepLengthDistribution: stepLengthDist,
            turningAngleDistribution: turningAngleDist,
            msd,
            preyField
        };
    }

    function flattenMetrics(metrics) {
        const flat = {
            seed: metrics.seed,
            time: metrics.time,
            day: metrics.day,
            generation: metrics.generation,
            wolfCount: metrics.population.wolfCount,
            packCount: metrics.population.packCount,
            meanEnergy: metrics.population.meanEnergy,
            meanAge: metrics.population.meanAge,
            distanceKm: metrics.distanceKm,
            kills: metrics.events.kill,
            births: metrics.events.birth,
            deaths: metrics.events.death,
            occupiedCells: metrics.density.occupiedCells,
            totalVisits: metrics.density.totalVisits,
            maxCellVisits: metrics.density.maxCellVisits,
            corridorCells: metrics.density.corridorCells,
            corridorShare: metrics.density.corridorShare,
            reuseIndex: metrics.density.reuseIndex,
            entropy: metrics.density.entropy,
            segmentCount: metrics.paths.segmentCount,
            retainedLength: metrics.paths.retainedLength,
            meanSegmentLength: metrics.paths.meanSegmentLength,
            droppedPathSegments: metrics.droppedPathSegments
        };
        // Step-length distribution
        if (metrics.stepLengthDistribution) {
            flat.stepLengthMean = metrics.stepLengthDistribution.mean;
            flat.stepLengthStd = metrics.stepLengthDistribution.std;
            flat.stepLengthMedian = metrics.stepLengthDistribution.median;
        }
        // Turning-angle distribution
        if (metrics.turningAngleDistribution) {
            flat.turningAngleMean = metrics.turningAngleDistribution.mean;
            flat.turningAngleStd = metrics.turningAngleDistribution.std;
            flat.turningAngleCircularMean = metrics.turningAngleDistribution.circularMean;
            flat.turningAngleMRL = metrics.turningAngleDistribution.meanResultantLength;
        }
        // MSD
        if (metrics.msd) {
            flat.msdSlope = metrics.msd.slope;
        }
        // Prey field
        if (metrics.preyField) {
            flat.preyMeanBiomass = metrics.preyField.meanBiomass;
            flat.preyDepletedFraction = metrics.preyField.depletedFraction;
        }
        return flat;
    }

    function toCsv(rows) {
        if (!rows.length) return '';
        const headers = Object.keys(rows[0]);
        const escape = value => {
            if (value === null || value === undefined) return '';
            const text = String(value);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        return [
            headers.join(','),
            ...rows.map(row => headers.map(header => escape(row[header])).join(','))
        ].join('\n');
    }

    /**
     * Kernel-density estimate of the density map.
     *
     * @param {Map<string,number>} densityMap  — "cx,cy" → visit count
     * @param {object} options
     *   cellSize  {number}  world-pixels per density cell (default 20)
     *   bandwidth {number}  Gaussian σ in cell units (default 2.5)
     * @returns {{ grid: Float32Array, cols: number, rows: number,
     *             cellSize: number, minCX: number, minCY: number }}
     */
    function computeKDE(densityMap, options) {
        var cellSize  = (options && options.cellSize)  || 20;
        var bandwidth = (options && options.bandwidth) || 2.5;

        if (!densityMap || densityMap.size === 0) {
            return { grid: new Float32Array(0), cols: 0, rows: 0,
                     cellSize: cellSize, minCX: 0, minCY: 0 };
        }

        var minCX = Infinity, minCY = Infinity;
        var maxCX = -Infinity, maxCY = -Infinity;

        densityMap.forEach(function(_count, key) {
            var parts = key.split(',');
            var cx = parseInt(parts[0], 10);
            var cy = parseInt(parts[1], 10);
            if (cx < minCX) minCX = cx;
            if (cy < minCY) minCY = cy;
            if (cx > maxCX) maxCX = cx;
            if (cy > maxCY) maxCY = cy;
        });

        // Pad grid by 3σ so the kernel doesn't get clipped at the edges
        var pad  = Math.ceil(bandwidth * 3);
        minCX -= pad;  minCY -= pad;
        maxCX += pad;  maxCY += pad;

        var cols = maxCX - minCX + 1;
        var rows = maxCY - minCY + 1;
        var grid = new Float32Array(cols * rows);

        var bw2    = bandwidth * bandwidth * 2;   // 2σ²
        var radius = Math.ceil(bandwidth * 3);

        densityMap.forEach(function(count, key) {
            var parts = key.split(',');
            var cx = parseInt(parts[0], 10);
            var cy = parseInt(parts[1], 10);

            for (var dy = -radius; dy <= radius; dy++) {
                for (var dx = -radius; dx <= radius; dx++) {
                    var gx = cx + dx - minCX;
                    var gy = cy + dy - minCY;
                    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
                    var dist2 = dx * dx + dy * dy;
                    grid[gy * cols + gx] += count * Math.exp(-dist2 / bw2);
                }
            }
        });

        return { grid: grid, cols: cols, rows: rows,
                 cellSize: cellSize, minCX: minCX, minCY: minCY };
    }

    /**
     * Marching-squares iso-contour segments at a given threshold.
     *
     * @param {object} kde  — result of computeKDE
     * @param {number} threshold
     * @returns {Array<[x1,y1,x2,y2]>}  line segments in world-pixel coordinates
     */
    function marchingSquaresSegments(kde, threshold) {
        var grid     = kde.grid,  cols = kde.cols, rows = kde.rows;
        var cellSize = kde.cellSize, minCX = kde.minCX, minCY = kde.minCY;
        var segments = [];

        if (cols < 2 || rows < 2) return segments;

        // Lookup table: case index (0-15) → list of [e1,e2] edge-pair connections.
        // Case bits: TL=8, TR=4, BR=2, BL=1.
        // Edges: 0=Top(TL↔TR), 1=Right(TR↔BR), 2=Bottom(BL↔BR), 3=Left(TL↔BL).
        var MS = [
            [],              // 0
            [[2,3]],         // 1  BL
            [[1,2]],         // 2  BR
            [[1,3]],         // 3  BR+BL
            [[0,1]],         // 4  TR
            [[0,3],[1,2]],   // 5  TR+BL   (saddle)
            [[0,2]],         // 6  TR+BR
            [[0,3]],         // 7  TR+BR+BL
            [[0,3]],         // 8  TL
            [[0,2]],         // 9  TL+BL
            [[0,1],[2,3]],   // 10 TL+BR   (saddle)
            [[0,1]],         // 11 TL+BR+BL
            [[1,3]],         // 12 TL+TR
            [[1,2]],         // 13 TL+TR+BL
            [[2,3]],         // 14 TL+TR+BR
            []               // 15
        ];

        function lerp(v0, v1, t) {
            var d = v1 - v0;
            if (Math.abs(d) < 1e-12) return 0.5;
            var f = (t - v0) / d;
            return f < 0 ? 0 : f > 1 ? 1 : f;
        }

        for (var row = 0; row < rows - 1; row++) {
            for (var col = 0; col < cols - 1; col++) {
                var tl = grid[row * cols + col];
                var tr = grid[row * cols + col + 1];
                var br = grid[(row + 1) * cols + col + 1];
                var bl = grid[(row + 1) * cols + col];

                var caseIdx = (tl > threshold ? 8 : 0) | (tr > threshold ? 4 : 0) |
                              (br > threshold ? 2 : 0) | (bl > threshold ? 1 : 0);

                var edges = MS[caseIdx];
                if (!edges.length) continue;

                // World-space coordinates of the four corners (in model-pixels)
                var wx0 = (col     + minCX) * cellSize, wy0 = (row     + minCY) * cellSize;
                var wx1 = (col + 1 + minCX) * cellSize, wy1 = wy0;
                var wx2 = wx1,                           wy2 = (row + 1 + minCY) * cellSize;
                var wx3 = wx0,                           wy3 = wy2;
                // TL=(wx0,wy0) TR=(wx1,wy1) BR=(wx2,wy2) BL=(wx3,wy3)

                // Precompute the four edge midpoints via linear interpolation
                var ep = [
                    [wx0 + lerp(tl, tr, threshold) * (wx1 - wx0), wy0],  // E0 top
                    [wx1, wy0 + lerp(tr, br, threshold) * (wy2 - wy0)],  // E1 right
                    [wx3 + lerp(bl, br, threshold) * (wx2 - wx3), wy3],  // E2 bottom
                    [wx0, wy0 + lerp(tl, bl, threshold) * (wy3 - wy0)]   // E3 left
                ];

                for (var s = 0; s < edges.length; s++) {
                    var p1 = ep[edges[s][0]];
                    var p2 = ep[edges[s][1]];
                    segments.push([p1[0], p1[1], p2[0], p2[1]]);
                }
            }
        }

        return segments;
    }

    const _exports = {
        buildRunMetrics,
        flattenMetrics,
        summarizeDensity,
        summarizePaths,
        summarizePopulation,
        summarizeDistribution,
        summarizeTurningAngles,
        summarizeMSD,
        summarizePreyField,
        computeKDE,
        marchingSquaresSegments,
        toCsv
    };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationMetrics = _exports;
})();
