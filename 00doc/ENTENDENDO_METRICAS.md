# ENTENDENDO AS MÉTRICAS NO JUSTIN HAMMER

Este documento aprofunda o entendimento sobre como as métricas são estruturadas, coletadas e consultadas no projeto Justin Hammer, fazendo um paralelo com os tipos de métricas padrão de mercado.

## Calculando Requisições por Segundo (RPS)

Requisições por Segundo (RPS) é uma métrica fundamental para medir a vazão de um sistema. No Justin Hammer, é **totalmente possível** calcular o RPS utilizando as métricas existentes.

**Como funciona:**

1.  **Métricas de Contador (Counter):** O RPS é derivado de métricas do tipo "contador". Um contador é um valor numérico que só aumenta ao longo do tempo, registrando o número total de ocorrências de um evento (ex: total de requisições processadas).
    *   No `metrics.json` do Justin Hammer, métricas como `proxy_requests_total`, `proxy_requests_cloud_total` e os campos `count` dentro de objetos de duração (ex: `proxy_destiny_request_duration.count`) são exemplos de contadores. Eles são incrementados a cada requisição ou evento.

2.  **Cálculo da Taxa:** Para obter o RPS, calculamos a taxa de mudança desse contador ao longo de um intervalo de tempo. A fórmula básica é:
    `RPS = (Valor_Contador_T2 - Valor_Contador_T1) / (Tempo_T2 - Tempo_T1)`

3.  **No Justin Hammer:** A função `fetchTimeSeries` com o parâmetro `aggregate` já realiza esse cálculo para você de forma eficiente.
    *   Ao consultar uma métrica de contador (ex: `proxy_requests_total`) com `temporal=true` e um `aggregate` (ex: `1m` para 1 minuto), o sistema consulta o banco de dados.
    *   A query SQL interna utiliza funções de agregação (como `AVG(value)`) sobre os "baldes" de tempo definidos pelo `aggregate`. Para um contador que só cresce, a média dos valores dentro de um balde representa a taxa média de incremento daquele contador naquele período.

**Exemplo de Consulta para RPS:**

Para obter o RPS médio a cada minuto na última hora para requisições de nuvem:

```
http://localhost:3001/api/chart/requests_by_cloud?range=1h&aggregate=1m&temporal=true
```

*(Assumindo que `requests_by_cloud` usa `proxy_requests_cloud_total` como métrica principal e que `proxy_requests_cloud_total` é um contador.)*

## Tipos de Métricas e Como o Justin Hammer as Trata

No mundo do monitoramento, as métricas são classificadas em tipos para indicar seu comportamento e como devem ser interpretadas. O Justin Hammer, através de seu `metrics.json` e das funções de coleta/consulta, lida com esses tipos de forma prática.

### 1. Gauge (Medidor)

*   **Conceito:** Representa um valor numérico único que pode subir e descer livremente. Ele reflete o "estado atual" de algo.
    *   **Exemplos:** Uso de CPU (%), memória livre (MB), número de usuários online, temperatura.
*   **No Justin Hammer (`metrics.json`):**
    *   Métricas como `cpu.systemLoadAverage`, `memory.usedHeap`, `thread.count` são tratadas como Gauges. Seus valores podem flutuar para cima ou para baixo.
*   **Consulta no Justin Hammer:**
    *   **Não Temporal (`temporal=false`):** `fetchMetricValue` retorna o último valor registrado do Gauge.
    *   **Temporal (`temporal=true`):** `fetchTimeSeries` retorna a série temporal do Gauge, geralmente com a média dos valores dentro de cada balde de tempo.

### 2. Counter (Contador)

*   **Conceito:** Representa um valor numérico que só pode aumentar (ou ser resetado para zero, mas nunca diminuir). Ele mede o "total acumulado" de algo.
    *   **Exemplos:** Total de requisições processadas, total de erros, total de bytes enviados.
*   **No Justin Hammer (`metrics.json`):**
    *   Métricas que terminam em `_total` (ex: `proxy_requests_total`, `proxy_responses_total`) ou campos `count` dentro de objetos de duração (ex: `proxy_destiny_request_duration.count`) são tratadas como Contadores.
*   **Consulta no Justin Hammer:**
    *   **Não Temporal (`temporal=false`):** `fetchMetricValue` retorna o último valor total acumulado do Contador.
    *   **Temporal (`temporal=true`):** `fetchTimeSeries` é ideal para calcular a **taxa de mudança** do Contador ao longo do tempo (como o RPS), retornando a média de incremento por balde.

### 3. Histogramas e Sumários (para Distribuições)

*   **Conceito:** Usados para medir distribuições de valores (ex: latências de requisição). Eles geralmente expõem múltiplos valores:
    *   **`_sum`:** Soma de todas as observações.
    *   **`_count`:** Número total de observações (um contador).
    *   **`_bucket`:** Contadores para cada balde de um histograma, mostrando quantas observações caíram em um determinado intervalo.
    *   **Percentis (p50, p95, p99, etc.):** Valores abaixo dos quais uma certa porcentagem das observações caíram.
*   **No Justin Hammer (`metrics.json`):**
    *   Objetos como `proxy_destiny_request_duration` e `proxy_request_duration` representam essas distribuições. Eles contêm campos como `mean`, `max`, `p50`, `count`, `oneMinRate`, etc.
*   **Consulta no Justin Hammer:**
    *   Você pode consultar qualquer um desses sub-campos como uma métrica individual. Por exemplo, `proxy_destiny_request_duration.p95` seria um Gauge (o percentil 95 atual), e `proxy_destiny_request_duration.count` seria um Contador (o total de observações).
    *   As taxas (`oneMinRate`, `fiveMinRate`) são valores pré-calculados que podem ser consultados como Gauges.




---

Pontos a melhorar / esclarecer

Terminologia temporal=false / temporal=true:

Está coerente, mas talvez seja bom reforçar que temporal=false não significa que não há timestamps, apenas que você pega o último valor registrado, sem criar séries históricas.

Pode gerar confusão se alguém esperar que temporal=false retorne algo “instantâneo” versus acumulativo (Counters vs Gauges).

Valores aleatórios no /metrics:

Está explicado que são simulados, mas talvez seja bom reforçar que isso é apenas para teste e que métricas reais precisariam ser extraídas de aplicações de produção.

Agregação de múltiplos labelFilters:

Está claro que é feito por média, mas talvez valha mencionar que isso pode não ser idempotente para Counters, já que a média de contadores incrementais pode gerar resultados inesperados se alguém não entender o conceito de “rate”.

Política de limpeza do banco:

Explica que remove dados antigos até 75% do limite, mas não fala se há alerta ou log quando isso acontece. Pode ser útil para debugging.

Exemplos de query mais complexas:

Estão claros, mas poderia mencionar explicitamente como combinar temporal=true com agregação e filtragem de label, para reforçar a ideia de séries temporais consolidadas.