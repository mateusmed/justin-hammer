# Justin Hammer - Simulador e Monitor de Métricas

![justin-hammer](00doc/images/justin-hammer.png)

Justin Hammer é uma aplicação Node.js projetada para simular um endpoint de métricas em tempo real, fazer a coleta periódica desses dados, armazená-los em um banco de dados de série temporal e fornecer uma API flexível para servir dados históricos e agregados para frontends de visualização.

Ele serve como uma base de backend robusta para dashboards de monitoramento dinâmico.

## Funcionalidades

- **Endpoint de Métricas Dinâmicas**: Um endpoint `/metrics` que serve métricas em JSON com valores aleatórios a cada chamada para simular uma aplicação real.
- **Serviço de Coleta Configurável**: Um serviço que roda em background e coleta os dados do endpoint de métricas em um intervalo configurável.
- **Coleta de Múltiplas Fontes**: Coleta métricas de diversas fontes HTTP configuráveis, identificando cada origem por um nome.
- **Armazenamento de Série Temporal**: Armazena o histórico de métricas em um banco de dados local SQLite, otimizado para consultas de série temporal.
- **Política de Retenção de Dados**: Gerencia o tamanho do banco de dados `metrics.db`, removendo automaticamente os dados mais antigos quando um limite de tamanho é atingido.
- **Normalização de Dados**: Uma camada de normalização que transforma os formatos brutos das métricas em uma estrutura `(nome, labels, valor)` antes de salvar.
- **API de Gráficos Dinâmica**: Um único e poderoso endpoint para obter dados para gráficos.
- **API de Configuração Dinâmica**: Permite ler e atualizar a configuração da aplicação (`chart-parse-config.json`) via API.
- **Filtro por Período de Tempo**: Filtra as métricas por um período de tempo dinâmico (ex: últimos 10 minutos, 2 horas, 7 dias).
- **Agregação de Dados**: Agrega pontos de dados em intervalos de tempo (ex: valor médio por minuto) para garantir que os gráficos fiquem legíveis e performáticos, mesmo em longos períodos.

## Tecnologias Utilizadas

- **Node.js**: Ambiente de execução.
- **Express.js**: Servidor web para os endpoints da API.
- **SQLite**: Banco de dados baseado em arquivo para o armazenamento de série temporal.

## Instalação e Execução

1.  **Clone o repositório:**
    ```bash
    git clone <url-do-seu-repositorio>
    cd justin-hammer
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    npm install node-fetch # Nova dependência
    ```

3.  **Execute a aplicação:**
    ```bash
    npm start
    ```
    O servidor será iniciado em `http://localhost:3001`. Na primeira vez que for executado, ele criará um diretório `database/` com o arquivo `metrics.db`.

    **Importante:** Se o esquema do banco de dados `metrics.db` for alterado (por exemplo, ao adicionar novas colunas), pode ser necessário deletar o arquivo `database/metrics.db` para que um novo banco de dados com o esquema atualizado seja criado na próxima execução.

## Endpoints da API

### Resumo dos Endpoints

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/about` | Informações sobre a aplicação e versão. |
| `GET` | `/metrics` | Endpoint de métricas simuladas (JSON). |
| `GET` | `/api/config` | Consulta a configuração atual do sistema. |
| `POST` | `/api/config` | Atualiza a configuração (Hot-Reload). |
| `GET` | `/api/chart/:name` | Dados formatados para gráficos e dashboards. |

### `GET /about`

Retorna informações sobre a aplicação, versão e autor.

**Exemplo:**
`http://localhost:3001/about`

---

### `GET /api/config`

Retorna o conteúdo atual do arquivo de configuração `src/config/chart-parse-config.json`.

**Exemplo:**
`http://localhost:3001/api/config`

---

### `POST /api/config`

Atualiza o conteúdo do arquivo de configuração `src/config/chart-parse-config.json` com o JSON enviado no corpo da requisição.

**Hot-Reload (Recarregamento Automático):**

Graças ao sistema de gerenciamento de configuração, **todas as alterações** enviadas para este endpoint são aplicadas em tempo real, sem a necessidade de reiniciar o servidor. Isso inclui:
-   **Configurações de Coleta:** `intervalSeconds`, `dataSource`, etc.
-   **Configurações de Retenção:** `retentionSettings`.
-   **Definições de Gráficos:** Adicionar, remover ou modificar gráficos no array `charts`.

**Exemplo:**
`POST http://localhost:3001/api/config` com o corpo JSON da nova configuração.

---

### `GET /metrics`

Retorna um objeto JSON completo de métricas de aplicação simuladas. Os valores para medidores e contadores são randomizados a cada requisição para simular um sistema em tempo real.

**Exemplo:**
`http://localhost:3001/metrics`

---

### `GET /api/chart/:nameChart`

Este é o endpoint principal para buscar dados de gráficos. Ele consulta os dados históricos do banco de dados e os formata para bibliotecas de visualização.

**Parâmetros de Rota:**

-   `:nameChart` (string, obrigatório): O nome do gráfico a ser retornado, conforme definido em `src/config/parse-metrics.json`.

**Parâmetros de Query:**

-   `range` (string, opcional, padrão: `1h`): O período de tempo para a consulta de dados. O formato é um número seguido por uma unidade.
    -   Unidades: `m` (minutos), `h` (horas), `d` (dias).
    -   Exemplo: `?range=30m`

-   `aggregate` (string, opcional): O tamanho do intervalo de tempo para a agregação de dados. Se omitido, os dados brutos são retornados. Quando fornecido, o valor médio para cada intervalo é calculado.
    -   Unidades: `s` (segundos), `m` (minutos), `h` (horas).
    -   Exemplo: `?aggregate=1m`

-   `namePod` (string, opcional): Filtra os resultados para incluir apenas métricas de uma fonte de dados (pod) específica. O valor fornecido é usado para filtrar os registros pela coluna `namePod` no banco de dados. O nome do pod é definido na seção `dataSource` do arquivo de configuração.

**Exemplos de Uso:**

1.  **Obter dados brutos dos últimos 15 minutos:**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=15m
    ```

2.  **Obter dados das últimas 24 horas, agregados pela média de cada intervalo de 30 minutos:**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1d&aggregate=30m
    ```

### Como as Consultas de Gráficos Funcionam

O endpoint `GET /api/chart/:nameChart` é versátil e se adapta ao tipo de dados que você deseja visualizar, principalmente através do parâmetro `temporal`.

-   **Gráficos Não Temporais (Padrão):**
    -   Quando o parâmetro `temporal` **não é fornecido** na query (ou é `false`), a aplicação busca o **último valor registrado** para cada ponto de dado definido na configuração do gráfico (`chart-parse-config.json`).
    -   A função `fetchMetricValue` é utilizada para essa finalidade.
    -   Os `labels` do gráfico serão os definidos estaticamente na configuração (`chart.labels`).
    -   **Exemplo:** Um gráfico de pizza que mostra o status atual de requisições (401, 404, 500).

-   **Gráficos Temporais (`temporal=true`):**
    -   Quando o parâmetro `temporal` é definido como `true` na query, a aplicação busca **séries temporais** de dados, agregando-os em "baldes" de tempo.
    -   A função `fetchTimeSeries` é utilizada.
    -   Os `labels` do gráfico serão gerados dinamicamente com base nos timestamps dos baldes de tempo (ex: "14:30:00 PM", "14:40:00 PM").
    -   Se a configuração do gráfico (`chart.datasets[].data`) define múltiplos `labelFilters` para uma única linha (como no `cpu_load_comparison`), os resultados de cada query são **consolidados por média** para cada balde de tempo, resultando em uma única série temporal para aquela linha.
    -   **Exemplo:** Um gráfico de linha que mostra a carga da CPU ao longo do tempo, com pontos de dados a cada 10 minutos.

**Parâmetros de Query Detalhados para `/api/chart/:nameChart`:**

Além dos parâmetros `range`, `aggregate` e `namePod` já mencionados, é crucial entender como o `temporal` afeta a consulta:

-   `temporal` (booleano, opcional): Se `true`, a consulta retornará séries temporais agregadas. Se omitido ou `false`, retornará o último valor para cada ponto de dado configurado.

**Exemplos de Uso Detalhados:**

1.  **Gráfico Não Temporal (Último Status):**
    ```
    http://localhost:3001/api/chart/count_response_by_status
    ```
    *Retorna o último valor de contagem para cada status (401, 404, 500).*

2.  **Gráfico Temporal (Carga da CPU ao Longo do Tempo):**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1h&aggregate=10m&temporal=true
    ```
    *Retorna a carga média da CPU a cada 10 minutos nas últimas 1 hora, com labels de tempo.*

3.  **Gráfico Não Temporal (Vendas por Categoria, Filtrado por Região e Ano):**
    ```
    http://localhost:3001/api/chart/name?region=North&year=2024
    ```
    *Retorna as vendas totais e online por categoria para a região "North" no ano "2024".*

4.  **Gráfico Temporal (Carga da CPU de um Pod Específico):**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1h&aggregate=10m&temporal=true&namePod=meu-pod-app-1
    ```
    *Retorna a carga média da CPU a cada 10 minutos nas últimas 1 hora, apenas para o pod "meu-pod-app-1".*

## Configuração

### Resumo de Parâmetros

| Categoria | Propriedade | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| **Coleta** | `intervalSeconds` | `number` | Frequência de coleta das métricas. |
| **Fontes** | `dataSource.urls` | `array` | Lista de nomes e URLs dos pods/serviços. |
| **Retenção** | `maxDbSizeMB` | `number` | Limite de tamanho do banco SQLite. |
| **Limpeza** | `cleanupIntervalSeconds` | `number` | Frequência de verificação do tamanho do banco. |

O principal arquivo de configuração é o `src/config/chart-parse-config.json`.

-   `collectionSettings`: Define o intervalo de coleta, as fontes de dados e a política de retenção do banco de dados.
    -   `intervalSeconds`: (número) O intervalo em segundos entre as coletas de métricas.
    -   `dataSource`:
        -   `type`: (string) O tipo da fonte de dados (ex: "http", "file").
        -   `urls`: (array de objetos) Lista de hosts para coleta. **Aqui é onde você conecta a métricas reais.**
            -   `name`: (string) Nome identificador do Pod/Serviço.
            -   `url`: (string) O endpoint que expõe as métricas.
            -   **Dica:** Para usar dados reais, substitua o `localhost:3001/metrics` pelo IP/DNS da sua aplicação produtiva.
            -   **Exemplo:**
                ```json
                "urls": [
                  { "name": "meu-pod-app-1", "url": "http://192.168.1.10:8080/metrics" },
                  { "name": "meu-pod-app-2", "url": "http://192.168.1.11:8080/metrics" }
                ]
                ```
    -   `retentionSettings`: (objeto) Configura a política de retenção do banco de dados `metrics.db`.
        -   `maxDbSizeMB`: (número) O tamanho máximo permitido para o arquivo `metrics.db` em Megabytes. Se o tamanho exceder este valor, a limpeza será acionada.
        -   `cleanupIntervalSeconds`: (número) O intervalo em segundos para verificar o tamanho do banco de dados e executar a rotina de limpeza, se necessário.
        -   **Lógica de Limpeza:** Quando o `metrics.db` atinge ou excede `maxDbSizeMB`, os dados mais antigos são removidos até que o tamanho do arquivo seja reduzido para 75% de `maxDbSizeMB`.

-   `charts`: Um array que define a estrutura e o mapeamento de métricas para cada gráfico disponível.

### Entendendo a Configuração de Gráficos

A seção `charts` é o coração da API de visualização. Cada objeto no array define como os dados de um gráfico específico devem ser consultados e formatados.

#### Como as Consultas Funcionam

Vamos analisar um exemplo de um gráfico de pizza (`pie`) que conta o total de respostas por status HTTP:

```json
{
  "nameChart": "count_response_by_status",
  "chart": {
    "type": "pie",
    "labels": ["401", "404", "500"],
    "datasets": [{
      "metric": "proxy_responses_total",
      "label": "Responses by Status",
      "data": [
        { "labelFilter": { "status": "401" } },
        { "labelFilter": { "status": "404" } },
        { "labelFilter": { "status": "500" } }
      ]
    }]
  }
}
```

-   **`nameChart`**: É o identificador único usado na URL da API (ex: `/api/chart/count_response_by_status`).
-   **`chart.labels`**: Corresponde aos rótulos do gráfico. A ordem aqui é importante.
-   **`datasets`**: Define um conjunto de dados para o gráfico.
-   **`metric`**: Especifica o nome da métrica a ser buscada no banco de dados (a coluna `name` na tabela `metrics`). Neste caso, `proxy_responses_total`.
-   **`data`**: É um array onde cada objeto define uma consulta para popular o gráfico. A ordem dos objetos corresponde à ordem dos `labels`.
    -   **Primeiro item (`data[0]`):** A aplicação buscará o valor da métrica `proxy_responses_total` onde a coluna de labels (um JSON) contém `"status": "401"`. O resultado será o primeiro valor no gráfico, correspondente ao `label` "401".
    -   **Segundo item (`data[1]`):** Fará o mesmo, mas filtrando por `"status": "404"`, e assim por diante.

Essencialmente, para cada item no array `data`, uma consulta separada é executada para encontrar o valor correspondente.

#### Filtros Dinâmicos

A configuração de um gráfico também pode incluir um array de `filters`, permitindo que a API filtre os dados dinamicamente através de query parameters na URL.

```json
"filters": [
  {
    "type": "selectItem",
    "label": "Method",
    "key": "method",
    "options": ["All", "POST", "GET"],
    "selected": "All"
  }
]
```

## Observações Importantes e Dicas



### 1. Temporal vs. Instantâneo

*   **`temporal=false` (Padrão):** Retorna o **último estado conhecido** da métrica. É ideal para medidores de status (ex: "Sistema está UP ou DOWN?").

*   **`temporal=true`:** Retorna uma **série histórica**. Útil para observar tendências e comportamentos ao longo do tempo.



### 2. De Simulação para Real (Produção)



O Justin Hammer vem pré-configurado para ler do próprio endpoint `/metrics` (mock). Para conectar em um host que retorna **métricas reais**:



1. Acesse `src/config/chart-parse-config.json`.



2. No array `dataSource.urls`, altere o `url` para o endereço real do seu pod ou serviço.



3. O sistema passará a coletar, normalizar e armazenar os dados reais automaticamente, sem necessidade de alterar o código.







### 3. Agregação e Contadores (RPS)

Ao usar `temporal=true` com `aggregate`, a API calcula a **média** dos valores no intervalo. Para métricas do tipo *Counter* (que apenas crescem), essa média em um intervalo de tempo representa efetivamente a **taxa de requisições** (ou eventos) por aquele período.



### 4. Transparência na Retenção

O serviço de limpeza de dados (`metrics-retention.service.js`) é executado silenciosamente em background, mas emite logs detalhados no console sempre que uma limpeza é disparada ou quando o banco é compactado via `VACUUM`. Isso permite monitorar a saúde do armazenamento sem intervenção manual.



### 5. Queries Combinadas

Você pode combinar todos os filtros para obter visões granulares:

`GET /api/chart/cpu_usage?range=24h&aggregate=10m&temporal=true&namePod=app-server-01&method=POST`

*Aqui você veria a carga de CPU das últimas 24h, agrupada a cada 10 min, apenas para o pod especificado e filtrando requisições POST.*

---

## Documentação Adicional

Para um aprofundamento técnico sobre como os dados são processados, consulte:
- [**Entendendo as Métricas no Justin Hammer**](00doc/ENTENDENDO_METRICAS.md): Detalhes sobre tipos de métricas (Gauge, Counter), cálculos de RPS e lógica de agregação.
