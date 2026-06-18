(function() {
    function hashSeed(seedText) {
        let hash = 2166136261;
        const text = String(seedText || 'wolf-migration');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function createRng(seedText) {
        let state = hashSeed(seedText) || 1;
        
        return {
            seed: String(seedText || 'wolf-migration'),
            random() {
                state |= 0;
                state = (state + 0x6D2B79F5) | 0;
                let t = Math.imul(state ^ (state >>> 15), 1 | state);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            },
            getState() {
                return state >>> 0;
            }
        };
    }

    const _exports = { hashSeed, createRng };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationRng = _exports;
})();
