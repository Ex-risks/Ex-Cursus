(function() {
    // Import dependencies when running under Node
    var sampleEnvironment, routeMemoryDirection, WORLD, TIME, createRng;
    if (typeof module !== 'undefined') {
        sampleEnvironment = require('./environment.js').sampleEnvironment;
        routeMemoryDirection = require('./memory.js').routeMemoryDirection;
        var config = require('./config.js');
        WORLD = config.WORLD;
        TIME = config.TIME;
        createRng = require('./rng.js').createRng;
    } else {
        sampleEnvironment = window.WolfMigrationEnvironment.sampleEnvironment;
        routeMemoryDirection = window.WolfMigrationMemory.routeMemoryDirection;
        WORLD = window.WolfMigrationConfig.WORLD;
        TIME = window.WolfMigrationConfig.TIME;
        createRng = window.WolfMigrationRng.createRng;
    }

    var seasons = ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'];

    // ── Vec2 ────────────────────────────────────────────────

    class Vec2 {
        constructor(x, y) {
            this.x = x || 0;
            this.y = y || 0;
        }

        static randomUnit(rng) {
            var angle = rng.random() * Math.PI * 2;
            return new Vec2(Math.cos(angle), Math.sin(angle));
        }

        static fromAngle(angle) {
            return new Vec2(Math.cos(angle), Math.sin(angle));
        }

        add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
        sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
        mult(n) { return new Vec2(this.x * n, this.y * n); }
        div(n) { return new Vec2(this.x / n, this.y / n); }

        mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
        normalize() {
            var m = this.mag();
            return m > 0 ? this.div(m) : new Vec2(0, 0);
        }

        limit(max) {
            var m = this.mag();
            return m > max ? this.normalize().mult(max) : new Vec2(this.x, this.y);
        }

        dist(v) { return this.sub(v).mag(); }
        heading() { return Math.atan2(this.y, this.x); }
        copy() { return new Vec2(this.x, this.y); }
    }

    // ── Wolf ────────────────────────────────────────────────

    // Wrapped-Cauchy random turn: concentrated near 0, heavier tails than Gaussian.
    // rho ∈ (0,1) controls concentration; rho→1 is nearly straight, rho→0 is uniform.
    function wrappedCauchyTurn(rng, rho) {
        var u = rng.random();
        // Inverse CDF: maps U~Uniform(0,1) to wrapped Cauchy centered at 0
        var ratio = (1 - rho) / (1 + rho);
        return 2 * Math.atan(ratio * Math.tan(Math.PI * (u - 0.5)));
    }

    class Wolf {
        constructor(x, y, pack, memberIndex, rng) {
            this.pos = new Vec2(x, y);
            this.heading = rng.random() * Math.PI * 2;  // correlated walk heading
            this.speed = 0.5;
            this.vel = Vec2.fromAngle(this.heading).mult(this.speed);
            this.pack = pack;
            this.energy = 100;
            this.age = 0;
            this.memory = [];
            this.trail = [];
            this.lastPos = this.pos.copy();
            this.id = rng.random();
            this.memberIndex = memberIndex || 0;
            // Dispersal state (Stage H)
            this.dispersing     = false;
            this.dispersalTimer = 0;
        }

        update(state, params) {
            // Environmental sensing
            var env = this.senseEnvironment(state, params);

            // Compute desired heading adjustment from external forces
            var packForce = this.packBehavior(params);
            var migrationDir = this.migrationDirection(state, params);
            var preyForce = this.trackPrey(env);
            // Terrain: use analytic fallback in steering sum, or zero if grid active
            // (grid-based terrain handled as direct heading adjustment below)
            var useTerrainGrid = params.terrainWeight > 0 && state.terrainGrid && state.terrainGrid.size > 0;
            var terrainForce = useTerrainGrid
                ? new Vec2(0, 0)
                : new Vec2(env.downhillForce.x, env.downhillForce.y);

            // Scent avoidance: compute repulsion vector from foreign pack scent
            var scentForce = new Vec2(0, 0);
            if (params.scentAvoidanceStrength > 0 && params.scentMarkingStrength > 0) {
                var cellSize = params.scentCellSize;
                var cx = Math.floor(this.pos.x / cellSize);
                var cy = Math.floor(this.pos.y / cellSize);
                var myPackIdx = this.pack.index;
                // Sample a 5×5 neighborhood
                for (var dx = -2; dx <= 2; dx++) {
                    for (var dy = -2; dy <= 2; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        var nk = (cx + dx) + ',' + (cy + dy);
                        var cellScent = state.scentMap.get(nk);
                        if (!cellScent) continue;
                        // Sum foreign scent in this cell
                        var foreignScent = 0;
                        cellScent.forEach(function(val, packIdx) {
                            if (packIdx !== myPackIdx) foreignScent += val;
                        });
                        if (foreignScent > 0) {
                            // Direction from that cell to this wolf (repulsion)
                            var cellCenterX = (cx + dx + 0.5) * cellSize;
                            var cellCenterY = (cy + dy + 0.5) * cellSize;
                            var awayX = this.pos.x - cellCenterX;
                            var awayY = this.pos.y - cellCenterY;
                            var awayDist = Math.sqrt(awayX * awayX + awayY * awayY);
                            if (awayDist > 0.01) {
                                var weight = foreignScent / (1 + awayDist * 0.05);
                                scentForce = scentForce.add(new Vec2(
                                    (awayX / awayDist) * weight,
                                    (awayY / awayDist) * weight
                                ));
                            }
                        }
                    }
                }
            }

            // Sum non-scent steering forces
            var steer = packForce.add(migrationDir).add(preyForce).add(terrainForce);

            // Convert steering force to a heading adjustment
            var steerMag = steer.mag();
            if (steerMag > 0.001) {
                var desiredHeading = Math.atan2(steer.y, steer.x);
                var headingDiff = desiredHeading - this.heading;
                while (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
                while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
                var turnRate = Math.min(0.15, steerMag * 0.05);
                this.heading += headingDiff * turnRate;
            }

            // Correlated random perturbation (wrapped Cauchy, concentrated near 0)
            this.heading += wrappedCauchyTurn(state.rng, 0.85);

            // Scent avoidance: direct heading adjustment (bypasses turn rate cap)
            // Uses log scaling so response grows monotonically without saturating
            var scentMag = scentForce.mag();
            if (scentMag > 0.01) {
                var scentHeading = Math.atan2(scentForce.y, scentForce.x);
                var scentDiff = scentHeading - this.heading;
                while (scentDiff > Math.PI) scentDiff -= 2 * Math.PI;
                while (scentDiff < -Math.PI) scentDiff += 2 * Math.PI;
                var scentTurn = Math.log(1 + scentMag) * params.scentAvoidanceStrength * 0.02;
                this.heading += scentDiff * Math.min(0.4, scentTurn);
            }

            // Terrain cost-of-transport: direct heading adjustment (Stage D)
            // Same architecture as scent — bypasses turn rate cap for monotonic response
            if (useTerrainGrid) {
                var tf = env.downhillForce;
                var tfMag = Math.sqrt(tf.x * tf.x + tf.y * tf.y);
                if (tfMag > 0.001) {
                    var terrainHeading = Math.atan2(tf.y, tf.x);
                    var terrainDiff = terrainHeading - this.heading;
                    while (terrainDiff > Math.PI) terrainDiff -= 2 * Math.PI;
                    while (terrainDiff < -Math.PI) terrainDiff += 2 * Math.PI;
                    var terrainTurn = Math.log(1 + tfMag) * params.terrainWeight * 0.1;
                    this.heading += terrainDiff * Math.min(0.5, terrainTurn);
                }
            }

            // Den tether: pull toward pack den during spring (Stage E)
            // Direct heading adjustment — bypasses turn rate cap for reliable clustering
            if (params.denningEnabled) {
                var wolfSeason = this.getCurrentSeason(state, params);
                if (wolfSeason === 'SPRING') {
                    var denDir = this.pack.den.sub(this.pos);
                    var denDist = denDir.mag();
                    if (denDist > 10) {
                        var denHeading = Math.atan2(denDir.y, denDir.x);
                        var denDiff = denHeading - this.heading;
                        while (denDiff > Math.PI) denDiff -= 2 * Math.PI;
                        while (denDiff < -Math.PI) denDiff += 2 * Math.PI;
                        this.heading += denDiff * Math.min(0.5, params.denTetherStrength * 0.15);
                    }
                }
            }

            // Normalize heading to [0, 2π)
            this.heading = ((this.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

            // Set velocity from heading + speed modulated by environment
            this.speed = params.maxSpeed * env.speedModifier;
            this.vel = Vec2.fromAngle(this.heading).mult(this.speed);
            this.lastPos = this.pos.copy();
            this.pos = this.pos.add(this.vel.mult(TIME.fixedStep));

            // Reflecting boundaries — no toroidal wrapping
            var reflected = false;
            if (this.pos.x < 0) {
                this.pos.x = -this.pos.x;
                this.vel = new Vec2(Math.abs(this.vel.x), this.vel.y);
                reflected = true;
            }
            if (this.pos.x > WORLD.width) {
                this.pos.x = 2 * WORLD.width - this.pos.x;
                this.vel = new Vec2(-Math.abs(this.vel.x), this.vel.y);
                reflected = true;
            }
            if (this.pos.y < 0) {
                this.pos.y = -this.pos.y;
                this.vel = new Vec2(this.vel.x, Math.abs(this.vel.y));
                reflected = true;
            }
            if (this.pos.y > WORLD.height) {
                this.pos.y = 2 * WORLD.height - this.pos.y;
                this.vel = new Vec2(this.vel.x, -Math.abs(this.vel.y));
                reflected = true;
            }
            // Sync heading with reflected velocity so the walk stays correlated
            if (reflected) {
                this.heading = this.vel.heading();
            }

            // Record step-length and turning-angle for distributions
            var stepLen = this.pos.dist(this.lastPos);
            state.stepLengths.push(stepLen);
            var newHeading = this.vel.heading();
            if (this._prevHeading !== undefined) {
                var dTheta = newHeading - this._prevHeading;
                // Wrap to [-pi, pi]
                while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
                while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
                state.turningAngles.push(dTheta);
            }
            this._prevHeading = newHeading;

            // MSD tracking
            if (!state.msdOrigins.has(this.id)) {
                state.msdOrigins.set(this.id, this.pos.copy());
            }

            // Update trail
            this.trail.push(this.pos.copy());
            if (this.trail.length > 50) this.trail.shift();

            // Energy and hunting
            this.energy -= 0.1 * env.energyCost;
            if (this.energy < 30 && state.rng.random() < params.huntSuccess * env.preyDensity) {
                this.energy = Math.min(100, this.energy + 40);
                this.markEvent('kill', state);

                // Deplete prey in this cell (Stage C)
                var preyCellKey = Math.floor(this.pos.x / params.preyCellSize) + ',' +
                                  Math.floor(this.pos.y / params.preyCellSize);
                var currentPrey = state.preyGrid.get(preyCellKey);
                if (currentPrey !== undefined) {
                    state.preyGrid.set(preyCellKey, Math.max(0, currentPrey - params.preyKillAmount));
                }
            }

            // Death
            if (this.energy <= 0) {
                this.markEvent('death', state);
                return false;
            }

            // Memory
            this.memory.push({
                pos: this.pos.copy(),
                season: this.getCurrentSeason(state, params),
                energy: this.energy,
                time: state.time
            });
            if (this.memory.length > params.memoryLength) {
                this.memory.shift();
            }

            // Age
            this.age++;

            // Update distance
            var dist = this.vel.mag() * params.kmPerPixel * TIME.fixedStep;
            state.totalDistance += dist;

            return true;
        }

        recordStep(state, params) {
            if (this.trail.length < 2) return;

            // Update density map; capture visit count for corridor/dispersal classification
            var key = Math.floor(this.pos.x / 20) + ',' + Math.floor(this.pos.y / 20);
            state.densityMap.set(key, (state.densityMap.get(key) || 0) + 1);
            var reuseCount = state.densityMap.get(key);

            // Spring-only density map for den peak detection (Stage E)
            if (this.getCurrentSeason(state, params) === 'SPRING') {
                state.springDensityMap.set(key, (state.springDensityMap.get(key) || 0) + 1);
            }

            // Trail reinforcement: deposit on trail map (Stage F)
            if (params.stigmergyEnabled) {
                var tKey = Math.floor(this.pos.x / params.trailCellSize) + ',' +
                           Math.floor(this.pos.y / params.trailCellSize);
                state.trailMap.set(tKey, (state.trailMap.get(tKey) || 0) + 1);
            }

            // Deposit scent for this wolf's pack
            if (params.scentMarkingStrength > 0) {
                var scentKey = Math.floor(this.pos.x / params.scentCellSize) + ',' +
                               Math.floor(this.pos.y / params.scentCellSize);
                var cellScent = state.scentMap.get(scentKey);
                if (!cellScent) {
                    cellScent = new Map();
                    state.scentMap.set(scentKey, cellScent);
                }
                var current = cellScent.get(this.pack.index) || 0;
                cellScent.set(this.pack.index, current + params.scentMarkingStrength);
            }

            // Record path segment (no rendering)
            var path = {
                x1: this.lastPos.x,
                y1: this.lastPos.y,
                x2: this.pos.x,
                y2: this.pos.y,
                packIndex: this.pack.index,
                memberIndex: this.memberIndex,
                energy: this.energy,
                season: this.getCurrentSeason(state, params),
                time: state.time,
                reuseCount: reuseCount
            };
            storeSvgPath(state, path);
        }

        senseEnvironment(state, params) {
            return sampleEnvironment({
                x: this.pos.x,
                y: this.pos.y,
                time: state.time,
                season: this.getCurrentSeason(state, params),
                params: params,
                world: WORLD,
                preyGrid: state.preyGrid,
                terrainGrid: state.terrainGrid,
                trailMap: state.trailMap
            });
        }

        packBehavior(params) {
            var separation = new Vec2(0, 0);
            var cohesion = new Vec2(0, 0);
            var alignment = new Vec2(0, 0);
            var count = 0;

            for (var i = 0; i < this.pack.wolves.length; i++) {
                var other = this.pack.wolves[i];
                if (other === this) continue;

                var d = this.pos.dist(other.pos);

                if (d < 20) {
                    var diff = this.pos.sub(other.pos).normalize().div(d + 0.01);
                    separation = separation.add(diff);
                }

                if (d < 50) {
                    cohesion = cohesion.add(other.pos);
                    alignment = alignment.add(other.vel);
                    count++;
                }
            }

            if (count > 0) {
                cohesion = cohesion.div(count).sub(this.pos).normalize().mult(params.cohesionForce);
                alignment = alignment.div(count).normalize().mult(0.5);
            }

            separation = separation.normalize().mult(params.separationForce);

            return separation.add(cohesion).add(alignment);
        }

        migrationDirection(state, params) {
            var season = this.getCurrentSeason(state, params);
            var direction = new Vec2(0, 0);

            switch(season) {
                case 'WINTER':
                    direction = new Vec2(0, 1);
                    break;
                case 'SPRING':
                    direction = new Vec2(0.7, -0.7);
                    break;
                case 'SUMMER':
                    direction = new Vec2(0, -1);
                    break;
                case 'AUTUMN':
                    direction = new Vec2(-0.7, 0.7);
                    break;
            }

            // Memory influence
            var routeMemory = routeMemoryDirection(this.memory, this.pos, season, {
                searchRadius: 160,
                lookAheadSegments: 6
            });
            if (routeMemory.strength > 0) {
                var memoryDirection = new Vec2(routeMemory.x, routeMemory.y);
                var memoryWeight = 0.3 * routeMemory.strength;
                direction = direction
                    .normalize()
                    .mult(1 - memoryWeight)
                    .add(memoryDirection.mult(memoryWeight));
            }

            // No white-noise wander — randomness comes from the correlated walk perturbation
            return direction.mult(0.5);
        }

        trackPrey(env) {
            var hunger = 1 - this.energy / 100;
            var preyGradient = new Vec2(env.preyGradient.x, env.preyGradient.y);
            return preyGradient.normalize().mult(hunger * 0.5);
        }

        markEvent(type, state) {
            state.eventCounts[type] = (state.eventCounts[type] || 0) + 1;
            state.markers.push({
                pos: this.pos.copy(),
                type: type,
                time: state.time,
                alpha: 1
            });
        }

        getCurrentSeason(state, params) {
            var seasonIndex = Math.floor((state.time / params.seasonLength) % 4);
            return seasons[seasonIndex];
        }
    }

    // ── Pack ────────────────────────────────────────────────

    class Pack {
        constructor(x, y, size, index, state, params) {
            this.wolves = [];
            this.center = new Vec2(x, y);
            this.lastCenter = this.center.copy();
            this.id = state.rng.random();
            this.index = index;
            // Fixed den site — established at pack formation (Stage E)
            this.den = new Vec2(x, y);
            // Breeding: once per year in spring (Stage E)
            this.lastBreedYear = -1;

            for (var i = 0; i < size; i++) {
                var angle = (i / size) * Math.PI * 2;
                var radius = 20 + state.rng.random() * 30;
                var wolf = new Wolf(
                    x + Math.cos(angle) * radius,
                    y + Math.sin(angle) * radius,
                    this,
                    i,
                    state.rng
                );
                this.wolves.push(wolf);
            }
        }

        update(state, params) {
            var newWolves = [];
            var previousCenter = this.center.copy();

            for (var i = 0; i < this.wolves.length; i++) {
                this.wolves[i].update(state, params);
            }

            // Spring breeding at den — once per year, only if denning enabled (Stage E)
            if (params.denningEnabled && this.wolves.length > 0) {
                var seasonIdx = Math.floor((state.time / params.seasonLength) % 4);
                var season = seasons[seasonIdx];
                var year = Math.floor(state.time / (params.seasonLength * 4));
                if (season === 'SPRING' && this.lastBreedYear < year) {
                    this.lastBreedYear = year;
                    for (var p = 0; p < params.pupCount; p++) {
                        var pup = new Wolf(
                            this.den.x + state.rng.random() * 20 - 10,
                            this.den.y + state.rng.random() * 20 - 10,
                            this, this.wolves.length, state.rng
                        );
                        pup.energy = 50;
                        this.wolves.push(pup);
                        state.eventCounts.birth = (state.eventCounts.birth || 0) + 1;
                        state.markers.push({ pos: this.den.copy(), type: 'birth', time: state.time, alpha: 1 });
                    }
                }
            }

            // Remove dead wolves
            this.wolves = this.wolves.filter(function(w) { return w.energy > 0; });

            // Update pack center
            if (this.wolves.length > 0) {
                this.center = this.wolves.reduce(function(acc, w) { return acc.add(w.pos); }, new Vec2(0, 0))
                    .div(this.wolves.length);
            }

            // Pack splitting
            if (this.wolves.length > 10 && state.rng.random() < 0.001) {
                this.split(state, params);
            }

            // Dispersal — age-triggered lone wolves leave the pack (Stage H)
            this.checkDispersals(state, params);
        }

        checkDispersals(state, params) {
            if (!params.dispersalRate || params.dispersalRate <= 0) return;
            var toDisperse = [];
            for (var i = 0; i < this.wolves.length; i++) {
                var wolf = this.wolves[i];
                if (!wolf.dispersing &&
                    wolf.age >= (params.dispersalAgeMin || 3200) &&
                    state.rng.random() < params.dispersalRate) {
                    toDisperse.push(i);
                }
            }
            // Splice in reverse order to preserve indices
            for (var j = toDisperse.length - 1; j >= 0; j--) {
                var wolf = this.wolves.splice(toDisperse[j], 1)[0];
                wolf.dispersing     = true;
                wolf.dispersalTimer = 0;
                wolf._dispersalPackIdx = this.index;
                state.disperserEvents.push({
                    packIdx: this.index,
                    time:    state.time,
                    wolfId:  wolf.id,
                    pos:     wolf.pos.copy()
                });
                state.dispersers.push(wolf);
            }
        }

        recordStep(state, params) {
            // Record individual wolf steps
            for (var i = 0; i < this.wolves.length; i++) {
                this.wolves[i].recordStep(state, params);
            }

            // Record pack-center path
            if (this.wolves.length > 0) {
                var centerJump = this.lastCenter.dist(this.center);
                if (centerJump > 0 && centerJump < Math.min(WORLD.width, WORLD.height) * 0.35) {
                    var path = {
                        x1: this.lastCenter.x,
                        y1: this.lastCenter.y,
                        x2: this.center.x,
                        y2: this.center.y,
                        packIndex: this.index,
                        memberIndex: 0,
                        type: 'pack-center',
                        season: seasons[Math.floor((state.time / params.seasonLength) % 4)],
                        time: state.time
                    };
                    storeSvgPath(state, path);
                }
                this.lastCenter = this.center.copy();
            }
        }

        split(state, params) {
            var newPack = new Pack(this.center.x, this.center.y, 0, state.packs.length, state, params);
            var halfSize = Math.floor(this.wolves.length / 2);

            for (var i = 0; i < halfSize; i++) {
                var wolf = this.wolves.pop();
                wolf.pack = newPack;
                wolf.memberIndex = newPack.wolves.length;
                newPack.wolves.push(wolf);
            }

            state.packs.push(newPack);
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    var MAX_SVG_PATHS = 100000;

    function storeSvgPath(state, path) {
        state.svgPaths.push(path);
        if (state.svgPaths.length > MAX_SVG_PATHS) {
            var excess = state.svgPaths.length - MAX_SVG_PATHS;
            state.svgPaths.splice(0, excess);
            state.droppedSvgPathCount += excess;
        }
    }

    // ── Stage H: Disperser movement and recording ────────────

    function updateDisperser(wolf, state, params) {
        // Standalone movement update for a lone disperser.
        // No pack forces, no den tether; reduced scent avoidance; speed boost.
        var env = sampleEnvironment({
            x: wolf.pos.x, y: wolf.pos.y,
            time: state.time,
            season: seasons[Math.floor((state.time / params.seasonLength) % 4)],
            params: params, world: WORLD,
            preyGrid: state.preyGrid,
            terrainGrid: state.terrainGrid,
            trailMap: state.trailMap
        });

        // Prey gradient (dispersers still hunt)
        var preyF = new Vec2(env.preyGradient ? env.preyGradient.x : 0,
                             env.preyGradient ? env.preyGradient.y : 0);
        var hunger = 1 - wolf.energy / 100;
        preyF = preyF.mult(hunger * 0.6);

        // Terrain gradient (dispersers follow low-cost corridors)
        var useTerrainGrid = params.terrainWeight > 0 && state.terrainGrid && state.terrainGrid.size > 0;
        var terrainF = useTerrainGrid
            ? new Vec2(0, 0)
            : new Vec2(env.downhillForce.x, env.downhillForce.y);

        var steer = preyF.add(terrainF);
        var steerMag = steer.mag();
        if (steerMag > 0.001) {
            var desiredHeading = Math.atan2(steer.y, steer.x);
            var headingDiff = desiredHeading - wolf.heading;
            while (headingDiff > Math.PI)  headingDiff -= 2 * Math.PI;
            while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
            wolf.heading += headingDiff * Math.min(0.15, steerMag * 0.05);
        }

        // Correlated random walk (same ρ as pack wolves)
        wolf.heading += wrappedCauchyTurn(state.rng, 0.85);

        // Scent avoidance: treat ALL scent as foreign (myPackIdx = -9999),
        // then scale turn by dispersalScentTolerance so dispersers can cross territories
        var scentForce = new Vec2(0, 0);
        if (params.scentAvoidanceStrength > 0) {
            var cellSize = params.scentCellSize;
            var cx = Math.floor(wolf.pos.x / cellSize);
            var cy = Math.floor(wolf.pos.y / cellSize);
            for (var sdx = -2; sdx <= 2; sdx++) {
                for (var sdy = -2; sdy <= 2; sdy++) {
                    if (sdx === 0 && sdy === 0) continue;
                    var nk = (cx + sdx) + ',' + (cy + sdy);
                    var cellScent = state.scentMap.get(nk);
                    if (!cellScent) continue;
                    var totalCellScent = 0;
                    cellScent.forEach(function(v) { totalCellScent += v; });
                    if (totalCellScent > 0) {
                        var cellCX = (cx + sdx + 0.5) * cellSize;
                        var cellCY = (cy + sdy + 0.5) * cellSize;
                        var awayX = wolf.pos.x - cellCX;
                        var awayY = wolf.pos.y - cellCY;
                        var awayDist = Math.sqrt(awayX * awayX + awayY * awayY);
                        if (awayDist > 0.01) {
                            var weight = totalCellScent / (1 + awayDist * 0.05);
                            scentForce = scentForce.add(new Vec2(
                                (awayX / awayDist) * weight,
                                (awayY / awayDist) * weight
                            ));
                        }
                    }
                }
            }
        }
        var scentMag = scentForce.mag();
        if (scentMag > 0.01) {
            var scentHeading = Math.atan2(scentForce.y, scentForce.x);
            var scentDiff = scentHeading - wolf.heading;
            while (scentDiff > Math.PI)  scentDiff -= 2 * Math.PI;
            while (scentDiff < -Math.PI) scentDiff += 2 * Math.PI;
            var scentTurn = Math.log(1 + scentMag) * params.scentAvoidanceStrength * 0.02;
            // Tolerance < 1 means dispersers cross territories more readily
            wolf.heading += scentDiff * Math.min(0.4, scentTurn) * (params.dispersalScentTolerance || 0.4);
        }

        // Terrain grid direct heading adjustment
        if (useTerrainGrid) {
            var tf = env.downhillForce;
            var tfMag = Math.sqrt(tf.x * tf.x + tf.y * tf.y);
            if (tfMag > 0.001) {
                var terrainHeading = Math.atan2(tf.y, tf.x);
                var terrainDiff = terrainHeading - wolf.heading;
                while (terrainDiff > Math.PI)  terrainDiff -= 2 * Math.PI;
                while (terrainDiff < -Math.PI) terrainDiff += 2 * Math.PI;
                wolf.heading += terrainDiff * Math.min(0.5, Math.log(1 + tfMag) * params.terrainWeight * 0.1);
            }
        }

        wolf.heading = ((wolf.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        // Speed boost: dispersers travel further per step
        wolf.speed = params.maxSpeed * (params.dispersalSpeedBoost || 1.4) * env.speedModifier;
        wolf.vel   = Vec2.fromAngle(wolf.heading).mult(wolf.speed);
        wolf.lastPos = wolf.pos.copy();
        wolf.pos     = wolf.pos.add(wolf.vel.mult(TIME.fixedStep));

        // Reflecting boundaries
        var reflected = false;
        if (wolf.pos.x < 0)              { wolf.pos.x = -wolf.pos.x;                      wolf.vel = new Vec2( Math.abs(wolf.vel.x),  wolf.vel.y); reflected = true; }
        if (wolf.pos.x > WORLD.width)    { wolf.pos.x = 2 * WORLD.width - wolf.pos.x;     wolf.vel = new Vec2(-Math.abs(wolf.vel.x),  wolf.vel.y); reflected = true; }
        if (wolf.pos.y < 0)              { wolf.pos.y = -wolf.pos.y;                       wolf.vel = new Vec2( wolf.vel.x,  Math.abs(wolf.vel.y)); reflected = true; }
        if (wolf.pos.y > WORLD.height)   { wolf.pos.y = 2 * WORLD.height - wolf.pos.y;    wolf.vel = new Vec2( wolf.vel.x, -Math.abs(wolf.vel.y)); reflected = true; }
        if (reflected) wolf.heading = wolf.vel.heading();

        // Step length for distribution tracking
        state.stepLengths.push(wolf.pos.dist(wolf.lastPos));

        // Trail deposit (stigmergy)
        if (params.stigmergyEnabled) {
            var tKey = Math.floor(wolf.pos.x / params.trailCellSize) + ',' +
                       Math.floor(wolf.pos.y / params.trailCellSize);
            state.trailMap.set(tKey, (state.trailMap.get(tKey) || 0) + 1);
        }

        // Energy and hunting (same as pack wolves)
        wolf.energy -= 0.1 * env.energyCost;
        if (wolf.energy < 30 && state.rng.random() < params.huntSuccess * env.preyDensity) {
            wolf.energy = Math.min(100, wolf.energy + 40);
            var preyCellKey = Math.floor(wolf.pos.x / params.preyCellSize) + ',' +
                              Math.floor(wolf.pos.y / params.preyCellSize);
            var currentPrey = state.preyGrid.get(preyCellKey);
            if (currentPrey !== undefined) {
                state.preyGrid.set(preyCellKey, Math.max(0, currentPrey - params.preyKillAmount));
            }
        }

        // Age + memory
        wolf.memory.push({ pos: wolf.pos.copy(), season: seasons[Math.floor((state.time / params.seasonLength) % 4)], energy: wolf.energy, time: state.time });
        if (wolf.memory.length > params.memoryLength) wolf.memory.shift();
        wolf.age++;
    }

    function recordDisperserStep(wolf, state, params) {
        // Density map — dispersers contribute to KDE
        var dKey = Math.floor(wolf.pos.x / 20) + ',' + Math.floor(wolf.pos.y / 20);
        state.densityMap.set(dKey, (state.densityMap.get(dKey) || 0) + 1);
        var reuseCount = state.densityMap.get(dKey);

        // Spring density
        if (seasons[Math.floor((state.time / params.seasonLength) % 4)] === 'SPRING') {
            state.springDensityMap.set(dKey, (state.springDensityMap.get(dKey) || 0) + 1);
        }

        // Path segment with type 'disperser'
        var path = {
            x1: wolf.lastPos.x, y1: wolf.lastPos.y,
            x2: wolf.pos.x,     y2: wolf.pos.y,
            packIndex:   wolf._dispersalPackIdx || 0,
            memberIndex: -1,        // sentinel: disperser
            type:        'disperser',
            time:        state.time,
            reuseCount:  reuseCount,
            energy:      wolf.energy
        };
        storeSvgPath(state, path);
    }

    // ── Simulation orchestration ────────────────────────────

    function initializeState(seed, params) {
        var rng = createRng(seed);
        var state = {
            rng: rng,
            seed: seed,
            time: 0,
            day: 1,
            generation: 1,
            totalDistance: 0,
            packs: [],
            markers: [],
            eventCounts: { kill: 0, birth: 0, death: 0 },
            densityMap: new Map(),
            svgPaths: [],
            droppedSvgPathCount: 0,
            // Distribution tracking
            stepLengths: [],
            turningAngles: [],
            // MSD tracking: per-wolf origin positions, keyed by wolf.id
            msdOrigins: new Map(),
            msdSamples: [],  // array of { step, msd }
            // Scent map: Map<cellKey, Map<packIndex, scentStrength>>
            scentMap: new Map(),
            // Prey grid: Map<cellKey, biomass> (Stage C)
            preyGrid: new Map(),
            // Prey/wolf time series for cross-correlation (Stage C)
            preyTimeSeries: [],
            // Terrain cost-of-transport grid (Stage D)
            terrainGrid: params.terrainGrid || new Map(),
            // Spring-only density map for den-peak detection (Stage E)
            springDensityMap: new Map(),
            // Trail reinforcement map (Stage F)
            trailMap: new Map(),
            // Lone dispersers and event log (Stage H)
            dispersers:      [],
            disperserEvents: []
        };

        // Initialize prey grid to carrying capacity
        var preyCols = Math.ceil(WORLD.width / params.preyCellSize);
        var preyRows = Math.ceil(WORLD.height / params.preyCellSize);
        for (var pr = 0; pr < preyRows; pr++) {
            for (var pc = 0; pc < preyCols; pc++) {
                state.preyGrid.set(pc + ',' + pr, params.preyCarryingCapacity);
            }
        }

        for (var i = 0; i < params.packCount; i++) {
            var pack = new Pack(
                rng.random() * WORLD.width,
                rng.random() * WORLD.height * 0.3,
                params.packSize,
                i,
                state,
                params
            );
            state.packs.push(pack);
        }

        return state;
    }

    function stepSimulation(state, params) {
        state.time += TIME.fixedStep;
        state.day = Math.floor(state.time / 24) + 1;
        state.generation = Math.floor(state.time / (params.seasonLength * 4)) + 1;

        // Update packs
        for (var i = 0; i < state.packs.length; i++) {
            state.packs[i].update(state, params);
        }

        // Remove empty packs
        state.packs = state.packs.filter(function(p) { return p.wolves.length > 0; });

        // Record steps (density, paths — separated from rendering)
        for (var j = 0; j < state.packs.length; j++) {
            state.packs[j].recordStep(state, params);
        }

        // Stage H — update lone dispersers, check for pack founding
        if (state.dispersers && state.dispersers.length > 0) {
            var toRemove = [];
            for (var di = 0; di < state.dispersers.length; di++) {
                var disp = state.dispersers[di];
                updateDisperser(disp, state, params);
                recordDisperserStep(disp, state, params);
                disp.dispersalTimer++;

                if (disp.energy > 0 && disp.dispersalTimer >= (params.dispersalFoundingSteps || 600)) {
                    // Check total scent in 3×3 neighbourhood
                    var fcx = Math.floor(disp.pos.x / params.scentCellSize);
                    var fcy = Math.floor(disp.pos.y / params.scentCellSize);
                    var totalScent = 0;
                    for (var fi = -1; fi <= 1; fi++) {
                        for (var fj = -1; fj <= 1; fj++) {
                            var fcell = state.scentMap.get((fcx + fi) + ',' + (fcy + fj));
                            if (fcell) fcell.forEach(function(v) { totalScent += v; });
                        }
                    }
                    if (totalScent < (params.dispersalFoundingThreshold || 2.0)) {
                        addPackAt(state, params, disp.pos.x, disp.pos.y);
                        toRemove.push(di);
                        continue;
                    }
                }
                if (disp.energy <= 0) toRemove.push(di);
            }
            // Splice high-to-low to preserve indices
            for (var ri = toRemove.length - 1; ri >= 0; ri--) {
                state.dispersers.splice(toRemove[ri], 1);
            }
        }

        // MSD sampling at regular intervals
        if (state.time % 10 === 0) {
            var allWolves = [];
            for (var k = 0; k < state.packs.length; k++) {
                for (var w = 0; w < state.packs[k].wolves.length; w++) {
                    allWolves.push(state.packs[k].wolves[w]);
                }
            }
            if (allWolves.length > 0) {
                var sumSqDisp = 0;
                var counted = 0;
                for (var m = 0; m < allWolves.length; m++) {
                    var origin = state.msdOrigins.get(allWolves[m].id);
                    if (origin) {
                        var dx = allWolves[m].pos.x - origin.x;
                        var dy = allWolves[m].pos.y - origin.y;
                        sumSqDisp += dx * dx + dy * dy;
                        counted++;
                    }
                }
                if (counted > 0) {
                    state.msdSamples.push({ step: state.time, msd: sumSqDisp / counted });
                }

                // Prey/wolf time series (Stage C)
                var totalPrey = 0;
                var preyCount = 0;
                state.preyGrid.forEach(function(biomass) {
                    totalPrey += biomass;
                    preyCount++;
                });
                var totalWolfEnergy = 0;
                for (var we = 0; we < allWolves.length; we++) {
                    totalWolfEnergy += allWolves[we].energy;
                }
                state.preyTimeSeries.push({
                    time: state.time,
                    meanPrey: preyCount > 0 ? totalPrey / preyCount : 0,
                    meanWolfEnergy: allWolves.length > 0 ? totalWolfEnergy / allWolves.length : 0,
                    wolfCount: allWolves.length
                });
            }
        }

        // Prey logistic regrowth (Stage C)
        if (params.preyRegrowthRate > 0) {
            var K = params.preyCarryingCapacity;
            var r = params.preyRegrowthRate;
            var immigration = 0.001 * K;
            state.preyGrid.forEach(function(biomass, key) {
                if (biomass < K) {
                    var growth = r * biomass * (1 - biomass / K);
                    state.preyGrid.set(key, Math.min(K, biomass + growth + immigration));
                }
            });
        }

        // Decay scent field
        if (params.scentDecayRate > 0) {
            var retainFactor = 1 - params.scentDecayRate;
            var scentKeysToDelete = [];
            state.scentMap.forEach(function(cellScent, cellKey) {
                var packKeysToDelete = [];
                cellScent.forEach(function(val, packIdx) {
                    var newVal = val * retainFactor;
                    if (newVal < 0.01) {
                        packKeysToDelete.push(packIdx);
                    } else {
                        cellScent.set(packIdx, newVal);
                    }
                });
                for (var d = 0; d < packKeysToDelete.length; d++) {
                    cellScent.delete(packKeysToDelete[d]);
                }
                if (cellScent.size === 0) {
                    scentKeysToDelete.push(cellKey);
                }
            });
            for (var d = 0; d < scentKeysToDelete.length; d++) {
                state.scentMap.delete(scentKeysToDelete[d]);
            }
        }

        // Decay trail map (Stage F)
        if (params.stigmergyEnabled && params.trailDecayRate > 0) {
            var trailRetain = 1 - params.trailDecayRate;
            var trailKeysToDelete = [];
            state.trailMap.forEach(function(val, tKey) {
                var newVal = val * trailRetain;
                if (newVal < 0.1) {
                    trailKeysToDelete.push(tKey);
                } else {
                    state.trailMap.set(tKey, newVal);
                }
            });
            for (var td = 0; td < trailKeysToDelete.length; td++) {
                state.trailMap.delete(trailKeysToDelete[td]);
            }
        }

        // Update markers (decay alpha)
        state.markers = state.markers.filter(function(marker) {
            marker.alpha *= 0.995;
            return marker.alpha > 0.1;
        });
    }

    function defaultParams() {
        return {
            // Temporal
            timeScale: 1.0,
            fadeRate: 0,
            memoryLength: 2000,
            seasonLength: 800,
            ensembleRuns: 5,
            experimentSteps: 800,

            // Visual (kept for compatibility, ignored headless)
            lineWeight: 0.8,
            lineOpacity: 0.75,
            lineType: 'solid',
            lineColor: '#1a1a1a',
            bgColor: '#ffffff',

            // Icons
            killMarker: 'cross',
            birthMarker: 'circle',
            deathMarker: 'x',
            markerSize: 5,
            markerOpacity: 0.5,

            // Wolf
            packCount: 3,
            packSize: 6,
            maxSpeed: 2.5,
            wanderStrength: 0.8,
            cohesionForce: 0.8,
            separationForce: 1.5,
            huntSuccess: 0.3,

            // Environment
            elevationInfluence: 0.5,
            tempRange: 65,
            preyVariation: 0.7,
            snowImpact: 0.5,

            // Display
            showGrid: false,
            showMarkers: false,
            showDensity: false,
            showTemporal: true,
            showCompass: false,
            showScale: true,
            showTerritories: false,

            // Scale
            kmPerPixel: 0.5,
            gridSizeKm: 50,

            // Scent / territoriality
            scentMarkingStrength: 1.0,   // amount deposited per step
            scentDecayRate: 0.01,        // fraction lost per step (0 = permanent, 1 = instant)
            scentAvoidanceStrength: 2.0, // steering weight away from foreign scent
            scentCellSize: 20,           // grid resolution for scent map

            // Prey grid (Stage C)
            preyCarryingCapacity: 1.0,   // K: max biomass per cell
            preyRegrowthRate: 0.05,      // r: logistic regrowth rate per step
            preyKillAmount: 0.3,         // biomass removed per successful kill
            preyCellSize: 20,            // grid resolution for prey field

            // Terrain / cost-of-transport (Stage D)
            terrainWeight: 0.0,          // 0 = no terrain steering (backward compat)
            terrainCellSize: 20,         // grid resolution for cost surface

            // Den + breeding-pair reproduction (Stage E)
            denningEnabled: true,        // false = no denning, no reproduction
            pupCount: 3,                 // pups born per litter
            denTetherStrength: 1.5,      // pull toward den during spring

            // Stigmergy — trail reinforcement (Stage F)
            stigmergyEnabled: false,     // false = no trail effect (backward compat)
            stigmergyStrength: 1.0,      // how much trails reduce local cost
            trailDecayRate: 0.002,       // fraction of trail strength lost per step
            trailCellSize: 20,           // grid resolution for trail map

            // Dispersal — natal dispersal and pack founding (Stage H)
            dispersalAgeMin:            3200,  // steps before wolf becomes dispersal-eligible (~1 year)
            dispersalRate:              0.0003,// per-step probability once eligible
            dispersalSpeedBoost:        1.4,   // dispersers travel faster than pack wolves
            dispersalScentTolerance:    0.4,   // fraction of normal scent avoidance (can cross territories)
            dispersalFoundingSteps:     600,   // steps disperser must survive before founding a pack
            dispersalFoundingThreshold: 2.0    // max total-scent in 3×3 neighbourhood for founding
        };
    }

    // ── P8: Direct-manipulation mutation API ─────────────────

    // Add a new pack at world coordinates (x, y).
    function addPackAt(state, params, x, y) {
        var idx  = state.packs.length;
        var pack = new Pack(x, y, params.packSize || 6, idx, state, params);
        state.packs.push(pack);
        return pack;
    }

    // Increase prey density within radius around (x, y) by amount,
    // capped at preyCarryingCapacity.
    function brushPrey(state, params, x, y, radius, amount) {
        var cellSize = params.preyCellSize || 20;
        var cellR    = Math.ceil(radius / cellSize);
        var cx0      = Math.floor(x / cellSize);
        var cy0      = Math.floor(y / cellSize);
        var cap      = params.preyCarryingCapacity || 1.0;
        for (var cx = cx0 - cellR; cx <= cx0 + cellR; cx++) {
            for (var cy = cy0 - cellR; cy <= cy0 + cellR; cy++) {
                var dx = (cx - cx0) * cellSize;
                var dy = (cy - cy0) * cellSize;
                if (dx * dx + dy * dy > radius * radius) continue;
                var key = cx + ',' + cy;
                var cur = state.preyGrid.has(key) ? state.preyGrid.get(key) : cap;
                state.preyGrid.set(key, Math.min(cap, cur + amount));
            }
        }
    }

    // Move the den of pack at packIdx to (x, y).
    function setDen(state, packIdx, x, y) {
        if (packIdx < 0 || packIdx >= state.packs.length) return;
        state.packs[packIdx].den = new Vec2(x, y);
    }

    // Add a terrain modifier (delta > 0 = barrier, delta < 0 = channel) in a
    // radius around (x, y) by clamping cells in state.terrainGrid to [0.01, 1.0].
    function addTerrainModifier(state, params, x, y, radius, delta) {
        var cellSize = params.preyCellSize || 20;
        var cellR    = Math.ceil(radius / cellSize);
        var cx0      = Math.floor(x / cellSize);
        var cy0      = Math.floor(y / cellSize);
        for (var cx = cx0 - cellR; cx <= cx0 + cellR; cx++) {
            for (var cy = cy0 - cellR; cy <= cy0 + cellR; cy++) {
                var dx = (cx - cx0) * cellSize;
                var dy = (cy - cy0) * cellSize;
                if (dx * dx + dy * dy > radius * radius) continue;
                var key = cx + ',' + cy;
                var cur = state.terrainGrid.has(key) ? state.terrainGrid.get(key) : 0.5;
                state.terrainGrid.set(key, Math.max(0.01, Math.min(1.0, cur + delta)));
            }
        }
    }

    // ── Exports ──────────────────────────────────────────────

    var _exports = {
        Vec2: Vec2,
        Wolf: Wolf,
        Pack: Pack,
        initializeState: initializeState,
        stepSimulation: stepSimulation,
        defaultParams: defaultParams,
        seasons: seasons,
        addPackAt: addPackAt,
        brushPrey: brushPrey,
        setDen: setDen,
        addTerrainModifier: addTerrainModifier
    };

    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationSim = _exports;
})();
