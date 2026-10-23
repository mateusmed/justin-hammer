const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parsePrometheus } = require('../src/metrics/prometheus-parser');
const { parseJson } = require('../src/metrics/json-parser');
const { parse } = require('../src/metrics/collector');
const { openStore } = require('../src/metrics/store');
const { runQuery, QueryError } = require('../src/metrics/query');

const STEP = 60 * 1000;
const NOW = 100 * STEP;

function tempStore() {
    return openStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jh-')));
}

// Uma coleta a cada 15 s nos últimos 10 min, com o valor que fn(ts) devolver para cada série
function fill(store, series, valueAt) {
    for (let ts = NOW - 10 * STEP; ts <= NOW; ts += 15000) {
        store.save('traefik', ts, { types: { requests_total: 'counter' }, samples: series.map(labels => ({ name: 'requests_total', labels, value: valueAt(ts, labels) })) });
    }
}

test('parser Prometheus: tipos, labels com vírgula e aspas escapadas, +Inf, comentários', () => {
    const { types, samples } = parsePrometheus([
        '# HELP x ajuda',
        '# TYPE x counter',
        'x{a="1,2",b="q\\"z"} 5',
        'x 3',
        'y_bucket{le="+Inf"} 7',
        'z NaN',
        ''
    ].join('\n'));
    assert.deepEqual(types, { x: 'counter' });
    assert.deepEqual(samples, [
        { name: 'x', labels: { a: '1,2', b: 'q"z' }, value: 5 },
        { name: 'x', labels: {}, value: 3 },
        { name: 'y_bucket', labels: { le: '+Inf' }, value: 7 }
    ]);
});

test('parser JSON antigo (base/vendor) vira o mesmo formato', () => {
    const { samples } = parseJson({ base: { 'gc.total;name=PS Scavenge': 1531, 'cpu.load': 0.5 } });
    assert.deepEqual(samples, [
        { name: 'gc_total', labels: { name: 'PS Scavenge' }, value: 1531 },
        { name: 'cpu_load', labels: {}, value: 0.5 }
    ]);
    assert.equal(parse('{"base":{"a":1}}').samples[0].name, 'a');
    assert.equal(parse('a 1\n').samples[0].value, 1);
});

test('rate: aumento por segundo, somado no grupo; by separa as séries', () => {
    const store = tempStore();
    // web: +1 por segundo; api: +2 por segundo (cada uma com dois códigos, metade em cada)
    const series = [
        { service: 'web', code: '200' }, { service: 'web', code: '500' },
        { service: 'api', code: '200' }, { service: 'api', code: '500' }
    ];
    fill(store, series, (ts, labels) => (ts / 1000) * (labels.service === 'web' ? 0.5 : 1));

    const total = runQuery(store, { metric: 'requests_total', range: '5m', step: '1m' }, NOW);
    assert.equal(total.timestamps.length, 5);
    assert.deepEqual(total.series.map(s => s.name), ['total']);
    assert.deepEqual(total.series[0].values, [3, 3, 3, 3, 3]);

    const byService = runQuery(store, { metric: 'requests_total', range: '5m', step: '1m', by: 'service' }, NOW);
    assert.deepEqual(byService.series.map(s => [s.name, s.values[0]]), [['api', 2], ['web', 1]]);
});

test('where filtra por valor exato e por regex (~)', () => {
    const store = tempStore();
    fill(store, [{ code: '200' }, { code: '502' }, { code: '503' }], ts => ts / 1000);

    const errors = runQuery(store, { metric: 'requests_total', range: '3m', step: '1m', where: { code: '~5..' } }, NOW);
    assert.deepEqual(errors.series[0].values, [2, 2, 2]);

    const ok = runQuery(store, { metric: 'requests_total', fn: 'increase', range: '3m', step: '1m', where: { code: '200' } }, NOW);
    assert.deepEqual(ok.series[0].values, [60, 60, 60]);
});

test('contador reiniciado (app reiniciou) não vira aumento negativo', () => {
    const store = tempStore();
    const restart = NOW - 3 * STEP;
    fill(store, [{}], ts => (ts < restart ? 1000 + ts / 1000 : (ts - restart) / 1000));

    const { values } = runQuery(store, { metric: 'requests_total', fn: 'increase', range: '5m', step: '1m' }, NOW).series[0];
    assert.ok(values.every(value => value === null || value >= 0), JSON.stringify(values));
});

test('sem dados no ponto: null (o gráfico mostra um buraco, e não zero)', () => {
    const store = tempStore();
    fill(store, [{}], ts => ts / 1000);

    const { values } = runQuery(store, { metric: 'requests_total', range: '20m', step: '1m' }, NOW).series[0];
    assert.equal(values[0], null);
    assert.equal(values.at(-1), 1);
});

test('gauge: avg, max e last', () => {
    const store = tempStore();
    // pod a: 20, 10, 20, 10 no último minuto (termina em 10); pod b: sempre 5
    const values = [20, 10, 20, 10];
    values.forEach((value, i) => {
        const ts = NOW - STEP + (i + 1) * 15000;
        store.save('app', ts, { types: { memory: 'gauge' }, samples: [{ name: 'memory', labels: { pod: 'a' }, value }, { name: 'memory', labels: { pod: 'b' }, value: 5 }] });
    });
    const query = fn => runQuery(store, { metric: 'memory', fn, range: '1m', step: '1m', by: 'pod' }, NOW).series;
    assert.deepEqual(query('max').map(s => s.values[0]), [20, 5]);
    assert.deepEqual(query('last').map(s => s.values[0]), [10, 5]);
    assert.deepEqual(query('avg').map(s => s.values[0]), [15, 5]);
});

test('percentil de histograma (p50/p95), interpolando dentro do bucket', () => {
    const store = tempStore();
    // A cada coleta: 50 requisições até 0.1 s, mais 40 até 0.5 s, mais 10 até 1 s
    const bucket = { 0.1: 50, 0.5: 90, 1: 100, '+Inf': 100 };
    for (let ts = NOW - 3 * STEP; ts <= NOW; ts += 15000) {
        const round = (ts - (NOW - 3 * STEP)) / 15000;
        store.save('traefik', ts, {
            types: { latency: 'histogram' },
            samples: Object.entries(bucket).map(([le, count]) => ({ name: 'latency_bucket', labels: { le, service: 'web' }, value: count * round }))
        });
    }

    const p50 = runQuery(store, { metric: 'latency', fn: 'p50', range: '1m', step: '1m' }, NOW).series[0].values[0];
    const p95 = runQuery(store, { metric: 'latency', fn: 'p95', range: '1m', step: '1m' }, NOW).series[0].values[0];
    assert.equal(p50, 0.1);
    assert.equal(p95, 0.75);
});

test('catálogo: nomes, tipos (bucket herda do histograma), fontes e valores das labels', () => {
    const store = tempStore();
    store.save('traefik', NOW, parsePrometheus([
        '# TYPE requests_total counter',
        'requests_total{service="web",code="200"} 1',
        'requests_total{service="api",code="200"} 1',
        '# TYPE latency histogram',
        'latency_bucket{le="0.1"} 1'
    ].join('\n')));

    const catalog = store.catalog();
    assert.deepEqual(catalog.map(m => [m.name, m.type]), [['latency_bucket', 'histogram_bucket'], ['requests_total', 'counter']]);
    assert.deepEqual(catalog[1].labels, { code: ['200'], service: ['api', 'web'] });
    assert.deepEqual(catalog[1].sources, ['traefik']);
});

test('consultas inválidas viram QueryError (400 na API)', () => {
    const store = tempStore();
    for (const params of [
        { metric: 'x; DROP TABLE series' },
        { metric: 'x', fn: 'soma' },
        { metric: 'x', range: '1 hora' },
        { metric: 'x', range: '30d', step: '1m' }
    ]) {
        assert.throws(() => runQuery(store, params, NOW), QueryError, JSON.stringify(params));
    }
});
