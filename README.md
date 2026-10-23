# Justin Hammer: serviço de métricas

![justin-hammer](00doc/images/justin-hammer.png)

Coleta métricas, guarda e responde consultas. É a parte "Prometheus" da mini-cloud; os dashboards ficam no
[ivan-vanko](https://github.com/mateusmed/ivan-vanko), que faz a parte "Grafana".

> Esta é a versão 2 (branch `feat/servico-metricas`). A versão original, com os gráficos configurados no
> `chart-parse-config.json`, continua na `main`.

O justin-hammer não sabe nada de gráfico: devolve números numa grade de tempo, e quem desenha decide tipo, cor e
título.

```
alvos (/metrics)  ──a cada 15 s──►  justin-hammer (SQLite)  ──/api/series──►  ivan-vanko (gráficos)
Traefik, apps...
```

## Formatos que ele lê

- **Prometheus** (texto, o padrão do mercado): é o que o Traefik, a `prom-client` do Node e muitos outros expõem.
  ```
  # TYPE traefik_service_requests_total counter
  traefik_service_requests_total{code="200",service="web@docker"} 42
  ```
- **JSON antigo** (`{ "base": { "gc.total;name=PS Scavenge": 1531 } }`), para fontes que já falavam assim.

## API

| Rota | O que faz |
|---|---|
| `GET /api/series` | consulta (abaixo) |
| `GET /api/metrics` | catálogo: cada métrica com tipo, fontes e os valores de cada label |
| `GET /api/targets` | situação de cada alvo (última coleta, erro) |
| `GET /health`, `GET /about` | saúde e versão |

### `GET /api/series`

| Parâmetro | Exemplo | O que faz |
|---|---|---|
| `metric` | `traefik_service_requests_total` | métrica (para percentil, o nome do histograma, sem `_bucket`) |
| `fn` | `rate` (padrão) | `rate` (por segundo) · `increase` (aumento no ponto) · `avg` · `max` · `min` · `last` · `p50` · `p90` · `p95` · `p99` |
| `range` | `1h` (padrão) | janela até agora: `30s`, `5m`, `1h`, `7d` |
| `step` | `1m` | tamanho de cada ponto (padrão: range / 60, mínimo 15 s; no máximo 500 pontos) |
| `by` | `service` | label que separa as séries; sem ele, uma série `total` |
| `where.<label>` | `where.code=~5..` | filtro: valor exato, ou regex com `~` |

```json
{
  "metric": "traefik_service_requests_total", "fn": "rate", "by": "service", "step": 60,
  "timestamps": [1761240000000, 1761240060000],
  "series": [{ "name": "ivan-vanko@docker", "values": [0.4, 0.55] }]
}
```

Ponto sem dado vem `null` (o gráfico mostra um buraco, e não zero). Contador que reinicia (app reiniciado) não vira
aumento negativo. O percentil segue o `histogram_quantile` do Prometheus.

Exemplos com o Traefik:
- requisições por segundo, por app: `?metric=traefik_service_requests_total&by=service`
- erros 5xx por app: `?metric=traefik_service_requests_total&by=service&where.code=~5..`
- latência p95 por app: `?metric=traefik_service_request_duration_seconds&fn=p95&by=service`

## Configuração (ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `SCRAPE_TARGETS` | vazio | alvos `nome=url,nome2=url2` (ex.: `traefik=http://ctn-traefik:8082/metrics`) |
| `SCRAPE_INTERVAL_SECONDS` | `15` | intervalo de coleta |
| `RETENTION_DAYS` | `15` | apaga amostras mais velhas que isso |
| `MAX_DB_SIZE_MB` | `200` | passou disso, apaga o dia mais antigo até caber |
| `DATA_PATH` | `./data` (Docker: `/data`) | onde fica o `metrics.db` |
| `MOCK_METRICS` | `false` | `true` liga `/mock/metrics` (números inventados) como alvo, para desenvolver sem tráfego |
| `PORT` | `3001` | porta |

Não há configuração gravável pela API: na versão 1, o `POST /api/config` sem login deixava apontar o coletor para
qualquer URL.

## Desenvolvimento

```bash
npm install
npm test                                # node --test
MOCK_METRICS=true npm start             # http://localhost:3001/api/series?metric=traefik_service_requests_total&by=service
```

Precisa de Node 22.13+ (usa o `node:sqlite`, sem dependência nativa para compilar).
