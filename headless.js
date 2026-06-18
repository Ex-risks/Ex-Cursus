#!/usr/bin/env node
'use strict';

var sim = require('./js/simulation.js');
var metrics = require('./js/metrics.js');
var config = require('./js/config.js');

// Parse CLI args
var args = process.argv.slice(2);
var seed = 'wolf-migration-001';
var steps = 800;

for (var i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) {
        seed = args[i + 1];
        i++;
    } else if (args[i] === '--steps' && args[i + 1]) {
        steps = parseInt(args[i + 1], 10);
        i++;
    }
}

var params = sim.defaultParams();
var state = sim.initializeState(seed, params);

for (var step = 0; step < steps; step++) {
    sim.stepSimulation(state, params);
}

var runMetrics = metrics.buildRunMetrics({
    seed: seed,
    time: state.time,
    day: state.day,
    generation: state.generation,
    world: config.WORLD,
    params: JSON.parse(JSON.stringify(params)),
    totalDistance: state.totalDistance,
    packs: state.packs,
    events: state.eventCounts,
    densityMap: state.densityMap,
    svgPaths: state.svgPaths,
    droppedSvgPathCount: state.droppedSvgPathCount,
    cellSize: 20,
    stepLengths: state.stepLengths,
    turningAngles: state.turningAngles,
    msdSamples: state.msdSamples,
    preyGrid: state.preyGrid,
    preyTimeSeries: state.preyTimeSeries
});

process.stdout.write(JSON.stringify(runMetrics, null, 2) + '\n');
