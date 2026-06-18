(function() {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function normalize(v) {
        const mag = Math.sqrt(v.x * v.x + v.y * v.y);
        return mag > 0 ? { x: v.x / mag, y: v.y / mag } : { x: 0, y: 0 };
    }

    function nearestPointOnSegment(point, a, b) {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const ap = { x: point.x - a.x, y: point.y - a.y };
        const lengthSq = ab.x * ab.x + ab.y * ab.y;
        if (lengthSq === 0) return { point: a, t: 0, distance: distance(point, a) };

        const t = clamp((ap.x * ab.x + ap.y * ab.y) / lengthSq, 0, 1);
        const projected = {
            x: a.x + ab.x * t,
            y: a.y + ab.y * t
        };
        return { point: projected, t, distance: distance(point, projected) };
    }

    function routeMemoryDirection(memory, position, season, options) {
        const config = Object.assign({
            minPoints: 12,
            searchRadius: 160,
            lookAheadSegments: 6,
            maxSegmentLength: 220
        }, options || {});

        const sameSeason = memory.filter(entry => entry.season === season);
        if (sameSeason.length < config.minPoints) {
            return { x: 0, y: 0, strength: 0, distance: Infinity, points: sameSeason.length };
        }

        let best = null;
        for (let i = 0; i < sameSeason.length - 1; i++) {
            const a = sameSeason[i].pos;
            const b = sameSeason[i + 1].pos;
            if (distance(a, b) > config.maxSegmentLength) continue;

            const candidate = nearestPointOnSegment(position, a, b);
            if (!best || candidate.distance < best.distance) {
                best = Object.assign(candidate, { index: i });
            }
        }

        if (!best || best.distance > config.searchRadius) {
            return {
                x: 0,
                y: 0,
                strength: 0,
                distance: best ? best.distance : Infinity,
                points: sameSeason.length
            };
        }

        const targetIndex = Math.min(best.index + config.lookAheadSegments, sameSeason.length - 1);
        const target = sameSeason[targetIndex].pos;
        const direction = normalize({
            x: target.x - position.x,
            y: target.y - position.y
        });
        const strength = clamp(1 - best.distance / config.searchRadius, 0, 1);

        return {
            x: direction.x,
            y: direction.y,
            strength,
            distance: best.distance,
            points: sameSeason.length
        };
    }

    const _exports = { routeMemoryDirection };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationMemory = _exports;
})();
