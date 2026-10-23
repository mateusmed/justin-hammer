const fs = require('fs');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Apaga o que passou de retentionDays; se o banco ainda passar do limite de tamanho, vai apagando o dia mais antigo
function startRetention(store, { retentionDays, maxDbSizeMb }, log = console) {
    const run = () => {
        const removed = store.prune(Date.now() - retentionDays * DAY) + trimToSize(store, maxDbSizeMb);
        if (removed > 0) log.log(`[justin-hammer] retenção: ${removed} amostras apagadas`);
    };

    run();
    const timer = setInterval(run, HOUR);
    return { stop: () => clearInterval(timer), run };
}

function trimToSize(store, maxDbSizeMb) {
    let removed = 0;
    while (sizeMb(store.file) > maxDbSizeMb) {
        const oldest = store.oldest();
        if (oldest === null) break;
        const count = store.prune(oldest + DAY);
        if (count === 0) break;
        removed += count;
    }
    return removed;
}

function sizeMb(file) {
    return fs.existsSync(file) ? fs.statSync(file).size / 1024 / 1024 : 0;
}

module.exports = { startRetention };
