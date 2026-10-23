const express = require('express');
const config = require('./config');
const { openStore } = require('./metrics/store');
const { startCollector } = require('./metrics/collector');
const { startRetention } = require('./metrics/retention');
const { runQuery, QueryError } = require('./metrics/query');
const { mockMetrics } = require('./metrics/mock');

function main() {
    const store = openStore(config.dataPath);
    const targets = config.mock ? [...config.targets, { name: 'mock', url: `http://127.0.0.1:${config.port}/mock/metrics` }] : config.targets;

    const collector = startCollector(store, targets, config.scrapeIntervalSeconds);
    startRetention(store, config);

    createApp(store, collector.status).listen(config.port, () => {
        console.log(`[justin-hammer] na porta ${config.port}, ${targets.length} alvo(s)`);
    });
}

function createApp(store, targetsStatus = () => ({})) {
    const app = express();

    app.get('/health', (req, res) => res.json({ status: 'OK' }));
    app.get('/about', (req, res) => res.json({ appName: 'justin-hammer', version: '2.0.0', role: 'coleta, guarda e consulta métricas' }));

    // Situação de cada alvo (última coleta, erro)
    app.get('/api/targets', (req, res) => res.json(targetsStatus()));

    // Catálogo: o que existe para consultar (nome, tipo e valores de cada label)
    app.get('/api/metrics', (req, res) => res.json(store.catalog()));

    // Uma série por grupo numa grade de tempo; where.<label>=valor (ou ~regex) filtra
    app.get('/api/series', (req, res) => {
        try {
            res.json(runQuery(store, { ...req.query, where: whereFrom(req.query) }));
        } catch (error) {
            if (!(error instanceof QueryError)) throw error;
            res.status(400).json({ message: error.message });
        }
    });

    if (config.mock) app.get('/mock/metrics', (req, res) => res.type('text/plain').send(mockMetrics()));
    return app;
}

// ?where.service=web@docker&where.code=~5.. → { service: 'web@docker', code: '~5..' }
function whereFrom(query) {
    return Object.fromEntries(Object.entries(query)
        .filter(([key]) => key.startsWith('where.'))
        .map(([key, value]) => [key.slice('where.'.length), String(value)]));
}

module.exports = { createApp };

if (require.main === module) main();
