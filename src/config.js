const path = require('path');

// Tudo vem do ambiente; nada de configuração gravada pela API (o POST /api/config antigo deixava apontar o coletor
// para qualquer URL sem login)
module.exports = {
    port: Number(process.env.PORT) || 3001,
    dataPath: process.env.DATA_PATH || path.join(__dirname, '..', 'data'),
    // "nome=url,nome2=url2": cada alvo é lido no formato Prometheus (texto) ou no JSON antigo (base/vendor)
    targets: parseTargets(process.env.SCRAPE_TARGETS || ''),
    scrapeIntervalSeconds: Number(process.env.SCRAPE_INTERVAL_SECONDS) || 15,
    retentionDays: Number(process.env.RETENTION_DAYS) || 15,
    maxDbSizeMb: Number(process.env.MAX_DB_SIZE_MB) || 200,
    // Modo de desenvolvimento: /mock/metrics inventa números e entra como alvo "mock"
    mock: process.env.MOCK_METRICS === 'true',
};

function parseTargets(text) {
    return text.split(',').map(item => item.trim()).filter(Boolean).map((item) => {
        const [name, ...url] = item.split('=');
        return { name: name.trim(), url: url.join('=').trim() };
    });
}
