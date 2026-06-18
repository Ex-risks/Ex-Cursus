(function() {
    function buildSeedSeries(baseSeed, count) {
        return Array.from({ length: count }, (_, index) => `${baseSeed}-rep-${String(index + 1).padStart(3, '0')}`);
    }

    function aggregateRows(rows) {
        if (!rows.length) return {};
        const numericKeys = Object.keys(rows[0]).filter(key => rows.every(row => typeof row[key] === 'number' && Number.isFinite(row[key])));
        const summary = { runs: rows.length };

        numericKeys.forEach(key => {
            const values = rows.map(row => row[key]);
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
            summary[`${key}Mean`] = mean;
            summary[`${key}Sd`] = Math.sqrt(variance);
            summary[`${key}Min`] = Math.min(...values);
            summary[`${key}Max`] = Math.max(...values);
        });

        return summary;
    }

    const _exports = { buildSeedSeries, aggregateRows };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationExperiments = _exports;
})();
