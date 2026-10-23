const { parsePrometheus } = require('./prometheus-parser');
const { parseJson } = require('./json-parser');

const TIMEOUT_MS = 5000;

// Lê cada alvo a cada intervalo e guarda; um alvo fora do ar não atrapalha os outros
function startCollector(store, targets, intervalSeconds, log = console) {
    const status = Object.fromEntries(targets.map(target => [target.name, { url: target.url, ok: null, lastError: null, lastScrape: null }]));
    let running = false;

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await Promise.all(targets.map(target => scrape(store, target, status[target.name], log)));
        } finally {
            running = false;
        }
    };

    tick();
    const timer = setInterval(tick, intervalSeconds * 1000);
    return { status: () => status, stop: () => clearInterval(timer), tick };
}

async function scrape(store, target, status, log) {
    try {
        const response = await fetch(target.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) throw new Error(`respondeu ${response.status}`);

        const parsed = parse(await response.text());
        store.save(target.name, Date.now(), parsed);
        Object.assign(status, { ok: true, lastError: null, lastScrape: new Date().toISOString(), samples: parsed.samples.length });
    } catch (error) {
        if (status.ok !== false) log.error(`[justin-hammer] alvo ${target.name} (${target.url}): ${error.message}`);
        Object.assign(status, { ok: false, lastError: error.message });
    }
}

// JSON antigo começa com "{"; o resto é texto Prometheus
function parse(text) {
    const trimmed = text.trimStart();
    return trimmed.startsWith('{') ? parseJson(JSON.parse(trimmed)) : parsePrometheus(text);
}

module.exports = { startCollector, parse };
