# Wolf Migration ODD-style model specification

This document describes the current synthetic browser model. It is not a calibration report and does not claim empirical realism for wolf migration.

## Purpose

Wolf Migration is an experimental cartographic agent model for studying how repeated individual movement can accumulate into visible corridor-like spatial structure. Its primary output is a drawing of tracks, supported by enough model structure to make repeated runs reproducible and inspectable.

## Entities, state variables, and scales

**World.** A fixed 1600 x 1000 model-pixel toroidal world. `kmPerPixel` is a display/export scale label, not a calibrated spatial unit.

**Wolf.** Each wolf has position, velocity, acceleration, energy, age, pack membership, short visible trail, and bounded personal memory. Memory entries store position, season, energy, and simulation time.

**Pack.** Each pack contains wolves and a current centre computed from member positions.

**Environment.** The environment is analytic rather than raster-based. It provides elevation, temperature, prey density, snow depth, cold stress, resistance, downhill force, and prey gradient at a position.

**Time.** The model advances in fixed simulation steps. Rendering uses `requestAnimationFrame`, but elapsed real time is accumulated into fixed model steps.

## Process overview and scheduling

At each fixed model step:

1. Each wolf samples its local environment.
2. Each wolf computes pack, migration-memory, prey, and downhill forces.
3. Velocity is updated, speed-limited by local environmental resistance, and integrated into position.
4. Positions wrap at world edges; wrapped steps are not drawn as cross-world line segments.
5. Energy is reduced by environmental cost.
6. Hungry wolves may hunt according to local prey density and the hunt-success parameter.
7. Death, birth, and pack splitting are evaluated.
8. Personal memory, density counts, visible tracks, and export path segments are updated.

## Design concepts

**Emergence.** Corridor-like drawings emerge from repeated local movement and memory reuse, not from a precomputed corridor map.

**Sensing.** Wolves sense only local analytic fields and packmates within the pack-behavior radius.

**Memory.** Memory is personal and seasonal. A wolf searches its own same-season remembered route for the nearest segment, then steers toward a point several segments ahead. This is route reuse, not attraction to the centroid of remembered positions.

**Stochasticity.** Randomness is deterministic for a given seed using a small local pseudorandom generator.

**Observation.** The primary observations are tracks, event markers, density overlay, SVG export, PNG export, JSON metrics export, CSV metrics export, and summary UI values.

## Initialization

The seed initializes the pseudorandom sequence. Packs are placed within the upper 30 percent of the fixed model world. Wolves are arranged around each pack centre with seeded random radii and seeded random initial headings.

## Input data

The model has no empirical input data. All environmental fields are synthetic analytic functions.

## Submodels

### Pack behavior

Nearby packmates repel at short range, cohere at longer range, and contribute velocity alignment.

### Migration and memory

The seasonal bearing is south in winter, northeast in spring, north in summer, and southwest in autumn. If the animal has enough same-season memory and is close enough to a remembered route segment, the bearing is blended with a route-following memory vector.

### Environment

Elevation:

```text
elevation(x, y) = sin(0.002x) * cos(0.002y) * elevationInfluence
```

The downhill force uses the analytic gradient:

```text
delevation/dx = 0.002 * cos(0.002x) * cos(0.002y) * elevationInfluence
delevation/dy = -0.002 * sin(0.002x) * sin(0.002y) * elevationInfluence
```

Prey:

```text
prey(x, t) = 0.5 * (sin(0.003x + 0.0001t) + 1) * preyVariation
```

Its gradient acts only in the x direction, matching the scalar field.

Temperature:

```text
temperature(y) = -20 + tempRange * (1 - y / worldHeight)
```

Cold stress is a mild synthetic cost term when temperature is below zero.

### Demography

Energy decreases by local environmental cost. Hungry wolves can recover energy through a prey-density-weighted hunting draw. High-energy older wolves may reproduce. Empty packs are removed.

## Known limitations

The model is synthetic and not calibrated to wolf telemetry, prey data, land cover, snow, or terrain. Coordinates are model units rather than projected geography. Memory is personal and seasonal but not yet social. Density is observational and does not yet feed back into movement. Exports are useful artifacts, not a complete experiment archive.

## Metrics and experiment products

The JSON and CSV metrics exports describe the current run using:

- population count, pack count, mean energy, and mean age;
- cumulative kill, birth, and death counts;
- occupied density cells, total visits, maximum cell reuse, top-decile corridor cells, corridor-share of visits, reuse index, and entropy;
- retained path segment count, retained path length, mean segment length, and dropped segment count.

The ensemble export repeats the same parameter set over a generated seed series and reports per-run metrics plus aggregate summaries. This is designed for small reproducible comparisons inside the static browser app; it is not yet a high-throughput batch engine or a formal statistical test.
