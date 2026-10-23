const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Uma série = nome + labels + fonte; as amostras só guardam (série, instante, valor). Assim as labels não se repetem
// a cada coleta, e o banco fica pequeno mesmo com centenas de séries a cada 15 s.
const SCHEMA = `
    CREATE TABLE IF NOT EXISTS series (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        labels TEXT NOT NULL,
        source TEXT NOT NULL,
        UNIQUE (name, labels, source)
    );
    CREATE TABLE IF NOT EXISTS samples (
        series_id INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        value REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS samples_series_ts ON samples (series_id, ts);
    CREATE INDEX IF NOT EXISTS samples_ts ON samples (ts);
    CREATE TABLE IF NOT EXISTS types (
        name TEXT PRIMARY KEY,
        type TEXT NOT NULL
    );
`;

function openStore(dataPath) {
    fs.mkdirSync(dataPath, { recursive: true });
    const file = path.join(dataPath, 'metrics.db');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);

    const statements = {
        findSeries: db.prepare('SELECT id FROM series WHERE name = ? AND labels = ? AND source = ?'),
        addSeries: db.prepare('INSERT INTO series (name, labels, source) VALUES (?, ?, ?)'),
        addSample: db.prepare('INSERT INTO samples (series_id, ts, value) VALUES (?, ?, ?)'),
        setType: db.prepare('INSERT INTO types (name, type) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET type = excluded.type'),
    };
    const seriesIds = new Map();

    return {
        file,
        save: (source, ts, parsed) => save(db, statements, seriesIds, source, ts, parsed),
        catalog: () => catalog(db),
        samples: (name, from, to) => samples(db, name, from, to),
        prune: (olderThan) => db.prepare('DELETE FROM samples WHERE ts < ?').run(olderThan).changes,
        oldest: () => db.prepare('SELECT MIN(ts) AS ts FROM samples').get().ts,
        close: () => db.close(),
    };
}

function save(db, statements, seriesIds, source, ts, { types, samples: list }) {
    db.exec('BEGIN');
    try {
        for (const [name, type] of Object.entries(types)) statements.setType.run(name, type);
        for (const sample of list) {
            statements.addSample.run(seriesId(statements, seriesIds, source, sample), ts, sample.value);
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

function seriesId(statements, seriesIds, source, { name, labels }) {
    const labelsText = JSON.stringify(sortKeys(labels));
    const key = `${source}\u0000${name}\u0000${labelsText}`;
    if (seriesIds.has(key)) return seriesIds.get(key);

    const found = statements.findSeries.get(name, labelsText, source);
    const id = found ? found.id : Number(statements.addSeries.run(name, labelsText, source).lastInsertRowid);
    seriesIds.set(key, id);
    return id;
}

// Para o catálogo e para comparar labels sempre na mesma ordem
function sortKeys(labels) {
    return Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
}

// Nomes com o tipo (do # TYPE; buckets/sum/count herdam do histograma) e os valores de cada label
function catalog(db) {
    const types = Object.fromEntries(db.prepare('SELECT name, type FROM types').all().map(row => [row.name, row.type]));
    const metrics = new Map();

    for (const row of db.prepare('SELECT name, labels, source FROM series').all()) {
        const metric = metrics.get(row.name) || { name: row.name, type: typeOf(row.name, types), sources: new Set(), labels: {} };
        metric.sources.add(row.source);
        for (const [key, value] of Object.entries(JSON.parse(row.labels))) {
            (metric.labels[key] ||= new Set()).add(value);
        }
        metrics.set(row.name, metric);
    }

    return [...metrics.values()].sort((a, b) => a.name.localeCompare(b.name)).map(metric => ({
        name: metric.name,
        type: metric.type,
        sources: [...metric.sources],
        labels: Object.fromEntries(Object.entries(metric.labels).map(([key, values]) => [key, [...values].sort()])),
    }));
}

function typeOf(name, types) {
    if (types[name]) return types[name];
    const base = name.replace(/_(bucket|sum|count)$/, '');
    return types[base] ? `${types[base]}${name.slice(base.length)}` : 'untyped';
}

// Amostras de uma métrica no intervalo, já com as labels de cada série
function samples(db, name, from, to) {
    const rows = db.prepare(`
        SELECT s.id, s.labels, s.source, x.ts, x.value
        FROM series s JOIN samples x ON x.series_id = s.id
        WHERE s.name = ? AND x.ts >= ? AND x.ts <= ?
        ORDER BY s.id, x.ts
    `).all(name, from, to);

    const series = new Map();
    for (const row of rows) {
        const item = series.get(row.id) || { labels: { ...JSON.parse(row.labels), source: row.source }, points: [] };
        item.points.push([row.ts, row.value]);
        series.set(row.id, item);
    }
    return [...series.values()];
}

module.exports = { openStore };
