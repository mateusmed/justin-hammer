// Formato JSON antigo (estilo MicroProfile: { base: { "gc.total;name=PS Scavenge": 1531 } }), mantido para fontes
// que já falam assim. Vira o mesmo { name, labels, value } do Prometheus.
function parseJson(data) {
    const samples = [];

    for (const category of Object.values(data)) {
        for (const [key, value] of Object.entries(category)) {
            if (value !== null && typeof value === 'object') {
                for (const [subKey, subValue] of Object.entries(value)) addSample(samples, `${key}_${subKey}`, subValue);
            } else {
                addSample(samples, key, value);
            }
        }
    }

    return { types: {}, samples };
}

function addSample(samples, key, raw) {
    const value = Number(raw);
    if (Number.isNaN(value)) return;

    const [name, ...pairs] = key.split(';');
    const labels = Object.fromEntries(pairs.map((pair) => {
        const [label, ...rest] = pair.split('=');
        return [label, rest.join('=').replace(/"/g, '')];
    }));
    samples.push({ name: name.replace(/[^a-zA-Z0-9_:]/g, '_'), labels, value });
}

module.exports = { parseJson };
