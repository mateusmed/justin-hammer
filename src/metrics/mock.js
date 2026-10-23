// Modo de desenvolvimento (MOCK_METRICS=true): números inventados no formato Prometheus, com contadores que só
// crescem, um gauge e um histograma, para testar os dashboards sem tráfego de verdade
const SERVICES = ['site@docker', 'api@docker', 'painel@docker'];
const BUCKETS = [0.05, 0.1, 0.3, 1.2, 5];
const counters = new Map();

function mockMetrics() {
    const lines = [
        '# TYPE traefik_service_requests_total counter',
        ...SERVICES.flatMap(service => ['200', '404', '500'].map(code =>
            `traefik_service_requests_total{code="${code}",method="GET",service="${service}"} ${grow(`${service}${code}`, code === '200' ? 40 : 3)}`)),
        '# TYPE process_resident_memory_bytes gauge',
        `process_resident_memory_bytes ${Math.round(80e6 + Math.random() * 20e6)}`,
        '# TYPE traefik_service_request_duration_seconds histogram',
        ...SERVICES.flatMap(service => histogram(service)),
    ];
    return `${lines.join('\n')}\n`;
}

// Cada bucket "le" conta tudo o que ficou abaixo dele (cumulativo), como no Prometheus
function histogram(service) {
    let cumulative = 0;
    const lines = BUCKETS.map((le, i) => {
        cumulative += grow(`${service}-b${i}`, 10 - i * 2);
        return `traefik_service_request_duration_seconds_bucket{le="${le}",service="${service}"} ${cumulative}`;
    });
    cumulative += grow(`${service}-inf`, 1);
    return [...lines, `traefik_service_request_duration_seconds_bucket{le="+Inf",service="${service}"} ${cumulative}`];
}

function grow(key, max) {
    const value = (counters.get(key) || 0) + Math.floor(Math.random() * max);
    counters.set(key, value);
    return value;
}

module.exports = { mockMetrics };
