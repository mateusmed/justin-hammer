// Formato de texto do Prometheus (o que o Traefik expõe em /metrics):
//   # TYPE traefik_service_requests_total counter
//   traefik_service_requests_total{code="200",method="GET",service="web@docker"} 42
const SAMPLE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(\S+)/;

function parsePrometheus(text) {
    const types = {};
    const samples = [];

    for (const line of text.split('\n')) {
        if (line.startsWith('# TYPE ')) {
            const [, , name, type] = line.split(/\s+/);
            types[name] = type;
            continue;
        }
        if (!line || line.startsWith('#')) continue;

        const sample = parseSample(line);
        if (sample) samples.push(sample);
    }

    return { types, samples };
}

function parseSample(line) {
    const match = line.match(SAMPLE);
    if (!match) return null;

    const value = parseValue(match[4]);
    if (value === null) return null;
    return { name: match[1], labels: parseLabels(match[3] || ''), value };
}

// Valores de label podem ter vírgula, aspas e barra escapadas (\" \\ \n)
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseLabels(text) {
    const labels = {};
    for (const [, key, raw] of text.matchAll(LABEL)) {
        labels[key] = raw.replace(/\\(.)/g, (_, char) => (char === 'n' ? '\n' : char));
    }
    return labels;
}

// +Inf vale para os buckets "le"; NaN não guardamos
function parseValue(text) {
    if (text === '+Inf') return Infinity;
    if (text === '-Inf') return -Infinity;
    const value = Number(text);
    return Number.isNaN(value) ? null : value;
}

module.exports = { parsePrometheus };
