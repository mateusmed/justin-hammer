const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/server');
const { openStore } = require('../src/metrics/store');

let server;
let base;

before(async () => {
    const store = openStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jh-api-')));
    const now = Date.now();
    for (let i = 8; i >= 0; i--) {
        store.save('traefik', now - i * 15000, {
            types: { requests_total: 'counter' },
            samples: [{ name: 'requests_total', labels: { service: 'web@docker' }, value: 100 - i * 15 }]
        });
    }
    server = createApp(store, () => ({ traefik: { ok: true } })).listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /api/series devolve a grade de tempo e as séries', async () => {
    const response = await fetch(`${base}/api/series?metric=requests_total&range=2m&step=1m&by=service&where.service=web@docker`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.timestamps.length, 2);
    assert.deepEqual(data.series.map(s => s.name), ['web@docker']);
    assert.equal(data.step, 60);
});

test('consulta inválida: 400 com a mensagem', async () => {
    const response = await fetch(`${base}/api/series?metric=requests_total&fn=soma`);
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /fn inválida/);
});

test('GET /api/metrics (catálogo) e /api/targets (situação dos alvos)', async () => {
    const catalog = await (await fetch(`${base}/api/metrics`)).json();
    assert.equal(catalog[0].name, 'requests_total');
    assert.deepEqual(await (await fetch(`${base}/api/targets`)).json(), { traefik: { ok: true } });
});

test('a configuração não é mais gravável pela API (POST /api/config saiu)', async () => {
    const response = await fetch(`${base}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404);
});
