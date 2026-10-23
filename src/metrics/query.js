// Consultas sobre as amostras guardadas, sem nada de gráfico: o resultado é uma grade de tempo com uma série por grupo.
//
//   metric  nome (para percentil, o nome do histograma, sem _bucket)
//   fn      rate (por segundo) · increase · avg · max · min · last · p50 · p90 · p95 · p99
//   range   janela até agora (ex.: 1h)       step  tamanho de cada ponto (ex.: 1m; padrão: range / 60)
//   by      label que separa as séries (ex.: service); sem ele, uma série "total"
//   where   { label: "valor" } ou { label: "~regex" }
const COUNTER_FNS = ['rate', 'increase'];
const GAUGE_FNS = ['avg', 'max', 'min', 'last'];
const PERCENTILES = { p50: 0.5, p90: 0.9, p95: 0.95, p99: 0.99 };
const UNITS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
const MAX_POINTS = 500;

function runQuery(store, params, now = Date.now()) {
    const query = normalize(params);
    const grid = timeGrid(now, query.rangeMs, query.stepMs);
    const name = query.percentile ? `${query.metric}_bucket` : query.metric;
    // Um passo a mais antes do começo: o primeiro ponto de um contador precisa do valor anterior
    const series = store.samples(name, grid[0] - 2 * query.stepMs, now).filter(item => matches(item.labels, query.where));

    const groups = groupBy(series, query.by);
    const result = [...groups.entries()].map(([group, members]) => ({ name: group, values: valuesOf(members, grid, query) }));

    return {
        metric: query.metric,
        fn: query.fn,
        by: query.by || null,
        step: query.stepMs / 1000,
        timestamps: grid,
        series: result.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
}

function normalize({ metric, fn = 'rate', range = '1h', step, by, where = {} }) {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric || '')) throw new QueryError('metric inválida');
    if (![...COUNTER_FNS, ...GAUGE_FNS, ...Object.keys(PERCENTILES)].includes(fn)) throw new QueryError(`fn inválida: ${fn}`);

    const rangeMs = duration(range);
    const stepMs = step ? duration(step) : Math.max(UNITS.s * 15, Math.round(rangeMs / 60));
    if (rangeMs / stepMs > MAX_POINTS) throw new QueryError(`no máximo ${MAX_POINTS} pontos: aumente o step`);

    return { metric, fn, rangeMs, stepMs, by, where, percentile: PERCENTILES[fn] };
}

function duration(text) {
    const match = String(text).match(/^(\d+)([smhd])$/);
    if (!match) throw new QueryError(`duração inválida: ${text} (use 30s, 5m, 1h, 7d)`);
    return Number(match[1]) * UNITS[match[2]];
}

// Fim de cada ponto, alinhado ao step (o último é o step que contém "agora")
function timeGrid(now, rangeMs, stepMs) {
    const last = Math.ceil(now / stepMs) * stepMs;
    const count = Math.round(rangeMs / stepMs);
    return Array.from({ length: count }, (_, i) => last - (count - 1 - i) * stepMs);
}

function matches(labels, where) {
    return Object.entries(where).every(([key, expected]) => {
        const value = labels[key] ?? '';
        return expected.startsWith('~') ? new RegExp(`^(?:${expected.slice(1)})$`).test(value) : value === expected;
    });
}

function groupBy(series, by) {
    const groups = new Map();
    for (const item of series) {
        const key = by ? item.labels[by] ?? '' : 'total';
        groups.set(key, [...(groups.get(key) || []), item]);
    }
    return groups;
}

function valuesOf(members, grid, query) {
    if (query.percentile) return percentileValues(members, grid, query);
    if (COUNTER_FNS.includes(query.fn)) return counterValues(members, grid, query);
    return gaugeValues(members, grid, query);
}

// Soma do aumento de cada série no ponto; reinício do contador (valor caiu) conta a partir de zero
function counterValues(members, grid, query) {
    const totals = grid.map(() => null);

    for (const member of members) {
        increases(member.points, grid, query.stepMs).forEach((value, i) => {
            if (value !== null) totals[i] = (totals[i] ?? 0) + value;
        });
    }

    const seconds = query.stepMs / 1000;
    return totals.map(value => (value === null ? null : round(query.fn === 'rate' ? value / seconds : value)));
}

// Aumento dentro de cada ponto, somando os passos entre amostras (contador que caiu = reinício, conta do zero).
// A base é o último valor do ponto anterior; sem ele (coleta começou no meio), a primeira amostra do ponto,
// como o increase() do Prometheus, que usa só as amostras de dentro da janela.
function increases(points, grid, stepMs) {
    return grid.map((end) => {
        const inside = points.filter(([ts]) => ts > end - stepMs && ts <= end);
        if (inside.length === 0) return null;

        let base = lastIn(points, end - 2 * stepMs, end - stepMs) ?? inside[0][1];
        let total = 0;
        for (const [, value] of inside) {
            total += value >= base ? value - base : value;
            base = value;
        }
        return total;
    });
}

function lastIn(points, from, to) {
    let found = null;
    for (const [ts, value] of points) {
        if (ts > from && ts <= to) found = value;
    }
    return found;
}

function gaugeValues(members, grid, query) {
    return grid.map((end) => {
        const values = members.flatMap(member => member.points.filter(([ts]) => ts > end - query.stepMs && ts <= end).map(([, v]) => v));
        if (values.length === 0) return null;
        if (query.fn === 'max') return round(Math.max(...values));
        if (query.fn === 'min') return round(Math.min(...values));
        if (query.fn === 'last') return round(lastPerMember(members, end, query.stepMs));
        return round(values.reduce((sum, v) => sum + v, 0) / values.length);
    });
}

// "last" de um grupo: a soma do último valor de cada série (ex.: conexões abertas de todas as instâncias)
function lastPerMember(members, end, stepMs) {
    return members.reduce((sum, member) => sum + (lastIn(member.points, end - stepMs, end) ?? 0), 0);
}

// Percentil de histograma, como o histogram_quantile do Prometheus: aumento de cada bucket "le" no ponto,
// e interpolação linear dentro do bucket onde cai a posição
function percentileValues(members, grid, query) {
    const byLe = new Map();
    for (const member of members) {
        const le = member.labels.le === '+Inf' ? Infinity : Number(member.labels.le);
        const values = increases(member.points, grid, query.stepMs);
        const current = byLe.get(le) || grid.map(() => null);
        byLe.set(le, current.map((value, i) => (values[i] === null ? value : (value ?? 0) + values[i])));
    }

    const buckets = [...byLe.entries()].sort(([a], [b]) => a - b);
    return grid.map((_, i) => quantile(query.percentile, buckets.map(([le, values]) => [le, values[i]])));
}

function quantile(q, buckets) {
    const known = buckets.filter(([, count]) => count !== null);
    const total = known.at(-1)?.[1];
    if (!total) return null;

    const rank = q * total;
    let previousLe = 0;
    let previousCount = 0;
    for (const [le, count] of known) {
        if (count >= rank) {
            if (le === Infinity) return round(previousLe);
            return round(previousLe + (le - previousLe) * ((rank - previousCount) / ((count - previousCount) || 1)));
        }
        previousLe = le;
        previousCount = count;
    }
    return round(previousLe);
}

function round(value) {
    return Math.round(value * 1e6) / 1e6;
}

class QueryError extends Error {}

module.exports = { runQuery, duration, QueryError };
