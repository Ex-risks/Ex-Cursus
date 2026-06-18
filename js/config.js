(function() {
    const _exports = {
        WORLD: Object.freeze({
            width: 1600,
            height: 1000,
            unit: 'model-pixel'
        }),
        TIME: Object.freeze({
            fixedStep: 1,
            baseStepsPerSecond: 60,
            maxFrameSeconds: 0.25
        })
    };
    if (typeof module !== 'undefined') module.exports = _exports;
    else window.WolfMigrationConfig = _exports;
})();
