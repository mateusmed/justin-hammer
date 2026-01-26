# Justin Hammer - Metrics Simulator and Monitor


[readme-pt](00doc/readme-pt.md).

![justin-hammer](00doc/images/justin-hammer.png)

Justin Hammer is a Node.js application designed to simulate a real-time metrics endpoint, periodically collect this data, store it in a time-series database, and provide a flexible API to serve historical and aggregated data for visualization frontends.

It serves as a robust backend foundation for dynamic monitoring dashboards.

## Features

- **Dynamic Metrics Endpoint**: A `/metrics` endpoint that serves metrics in JSON with randomized values on each call to simulate a real application.
- **Configurable Collection Service**: A background service that collects data from the metrics endpoint at a configurable interval.
- **Multi-source Collection**: Collects metrics from multiple configurable HTTP sources, identifying each origin by a name.
- **Time-Series Storage**: Stores metric history in a local SQLite database, optimized for time-series queries.
- **Data Retention Policy**: Manages the size of the `metrics.db` database, automatically removing older data when a size limit is reached.
- **Data Normalization**: A normalization layer that transforms raw metric formats into a `(name, labels, value)` structure before saving.
- **Dynamic Chart API**: A single and powerful endpoint to retrieve chart data.
- **Dynamic Configuration API**: Allows reading and updating the application configuration (`chart-parse-config.json`) via API.
- **Time Range Filter**: Filters metrics by a dynamic time period (e.g., last 10 minutes, 2 hours, 7 days).
- **Data Aggregation**: Aggregates data points into time intervals (e.g., average value per minute) to ensure charts remain readable and performant even over long periods.

## Technologies Used

- **Node.js**: Execution environment.
- **Express.js**: Web server for API endpoints.
- **SQLite**: File-based database for time-series storage.

## Installation and Execution

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd justin-hammer
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the application:**
    ```bash
    npm start
    ```
    The server will start at `http://localhost:3001`. On the first run, it will create a `database/` directory with the `metrics.db` file.

    **Important:** If the `metrics.db` database schema is changed (for example, by adding new columns), you may need to delete the `database/metrics.db` file so that a new database with the updated schema is created on the next run.

## API Endpoints

### Endpoint Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/about` | Information about the application and version. |
| `GET` | `/metrics` | Simulated metrics endpoint (JSON). |
| `GET` | `/api/config` | Queries the current system configuration. |
| `POST` | `/api/config` | Updates the configuration (Hot-Reload). |
| `GET` | `/api/chart/:name` | Formatted data for charts and dashboards. |

### `GET /about`

Returns information about the application, version, and author.

**Example:**
`http://localhost:3001/about`

---

### `GET /api/config`

Returns the current content of the `src/config/chart-parse-config.json` configuration file.

**Example:**
`http://localhost:3001/api/config`

---

### `POST /api/config`

Updates the content of the `src/config/chart-parse-config.json` configuration file with the JSON sent in the request body.

**Hot-Reload:**

Thanks to the configuration management system, **all changes** sent to this endpoint are applied in real-time without needing to restart the server. This includes:
-   **Collection Settings:** `intervalSeconds`, `dataSource`, etc.
-   **Retention Settings:** `retentionSettings`.
-   **Chart Definitions:** Adding, removing, or modifying charts in the `charts` array.

**Example:**
`POST http://localhost:3001/api/config` with the new configuration JSON body.

---

### `GET /metrics`

Returns a complete JSON object of simulated application metrics. Values for gauges and counters are randomized on each request to simulate a real-time system.

**Example:**
`http://localhost:3001/metrics`

---

### `GET /api/chart/:nameChart`

This is the main endpoint for fetching chart data. It queries historical data from the database and formats it for visualization libraries.

**Route Parameters:**

-   `:nameChart` (string, required): The name of the chart to be returned, as defined in `src/config/chart-parse-config.json`.

**Query Parameters:**

-   `range` (string, optional, default: `1h`): The time period for the data query. The format is a number followed by a unit.
    -   Units: `m` (minutes), `h` (hours), `d` (days).
    -   Example: `?range=30m`

-   `aggregate` (string, optional): The time interval size for data aggregation. If omitted, raw data is returned. When provided, the average value for each interval is calculated.
    -   Units: `s` (seconds), `m` (minutes), `h` (hours).
    -   Example: `?aggregate=1m`

-   `namePod` (string, optional): Filters results to include only metrics from a specific data source (pod). The provided value is used to filter records by the `namePod` column in the database. The pod name is defined in the `dataSource` section of the configuration file.

**Usage Examples:**

1.  **Get raw data from the last 15 minutes:**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=15m
    ```

2.  **Get data from the last 24 hours, aggregated by the average of each 30-minute interval:**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1d&aggregate=30m
    ```

### How Chart Queries Work

The `GET /api/chart/:nameChart` endpoint is versatile and adapts to the type of data you want to visualize, mainly through the `temporal` parameter.

-   **Non-Temporal Charts (Default):**
    -   When the `temporal` parameter is **not provided** in the query (or is `false`), the application fetches the **last recorded value** for each data point defined in the chart configuration (`chart-parse-config.json`).
    -   The `fetchMetricValue` function is used for this purpose.
    -   The chart `labels` will be those statically defined in the configuration (`chart.labels`).
    -   **Example:** A pie chart showing the current status of requests (401, 404, 500).

-   **Temporal Charts (`temporal=true`):**
    -   When the `temporal` parameter is set to `true` in the query, the application fetches **time series** data, aggregating them into time "buckets".
    -   The `fetchTimeSeries` function is used.
    -   The chart `labels` will be dynamically generated based on the timestamps of the time buckets (e.g., "14:30:00 PM", "14:40:00 PM").
    -   If the chart configuration (`chart.datasets[].data`) defines multiple `labelFilters` for a single line (as in `cpu_load_comparison`), the results of each query are **consolidated by average** for each time bucket, resulting in a single time series for that line.
    -   **Example:** A line chart showing CPU load over time, with data points every 10 minutes.

**Detailed Query Parameters for `/api/chart/:nameChart`:**

In addition to the `range`, `aggregate`, and `namePod` parameters already mentioned, it is crucial to understand how `temporal` affects the query:

-   `temporal` (boolean, optional): If `true`, the query will return aggregated time series. If omitted or `false`, it will return the last value for each configured data point.

**Detailed Usage Examples:**

1.  **Non-Temporal Chart (Last Status):**
    ```
    http://localhost:3001/api/chart/count_response_by_status
    ```
    *Returns the last count value for each status (401, 404, 500).*

2.  **Temporal Chart (CPU Load Over Time):**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1h&aggregate=10m&temporal=true
    ```
    *Returns the average CPU load every 10 minutes over the last 1 hour, with time labels.*

3.  **Non-Temporal Chart (Sales by Category, Filtered by Region and Year):**
    ```
    http://localhost:3001/api/chart/name?region=North&year=2024
    ```
    *Returns total and online sales by category for the "North" region in the year "2024".*

4.  **Temporal Chart (CPU Load of a Specific Pod):**
    ```
    http://localhost:3001/api/chart/cpu_load_comparison?range=1h&aggregate=10m&temporal=true&namePod=my-pod-app-1
    ```
    *Returns the average CPU load every 10 minutes over the last 1 hour, only for the pod "my-pod-app-1".*

## Configuration

### Parameter Summary

| Category | Property | Type | Description |
| :--- | :--- | :--- | :--- |
| **Collection** | `intervalSeconds` | `number` | Metric collection frequency. |
| **Sources** | `dataSource.urls` | `array` | List of names and URLs of pods/services. |
| **Retention** | `maxDbSizeMB` | `number` | Size limit for the SQLite database. |
| **Cleanup** | `cleanupIntervalSeconds` | `number` | Frequency of database size check. |

The main configuration file is `src/config/chart-parse-config.json`.

-   `collectionSettings`: Defines the collection interval, data sources, and database retention policy.
    -   `intervalSeconds`: (number) The interval in seconds between metric collections.
    -   `dataSource`:
        -   `type`: (string) The type of data source (e.g., "http", "file").
        -   `urls`: (array of objects) List of hosts for collection. **This is where you connect to real metrics.**
            -   `name`: (string) Identifying name of the Pod/Service.
            -   `url`: (string) The endpoint that exposes the metrics.
            -   **Tip:** To use real data, replace `localhost:3001/metrics` with the IP/DNS of your production application.
            -   **Example:**
                ```json
                "urls": [
                  { "name": "my-pod-app-1", "url": "http://192.168.1.10:8080/metrics" },
                  { "name": "my-pod-app-2", "url": "http://192.168.1.11:8080/metrics" }
                ]
                ```
    -   `retentionSettings`: (object) Configures the `metrics.db` retention policy.
        -   `maxDbSizeMB`: (number) The maximum allowed size for the `metrics.db` file in Megabytes. If the size exceeds this value, cleanup will be triggered.
        -   `cleanupIntervalSeconds`: (number) The interval in seconds to check the database size and run the cleanup routine if necessary.
        -   **Cleanup Logic:** When `metrics.db` reaches or exceeds `maxDbSizeMB`, the oldest data is removed until the file size is reduced to 75% of `maxDbSizeMB`.

-   `charts`: An array that defines the structure and mapping of metrics for each available chart.

### Understanding Chart Configuration

The `charts` section is the heart of the visualization API. Each object in the array defines how a specific chart's data should be queried and formatted.

#### How Queries Work

Let's analyze an example of a pie chart that counts the total responses by HTTP status:

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

-   **`nameChart`**: The unique identifier used in the API URL (e.g., `/api/chart/count_response_by_status`).
-   **`chart.labels`**: Corresponds to the chart labels. The order here is important.
-   **`datasets`**: Defines a set of data for the chart.
-   **`metric`**: Specifies the name of the metric to be searched in the database (the `name` column in the `metrics` table). In this case, `proxy_responses_total`.
-   **`data`**: An array where each object defines a query to populate the chart. The order of the objects corresponds to the order of the `labels`.
    -   **First item (`data[0]`):** The application will search for the value of the `proxy_responses_total` metric where the labels column (a JSON) contains `"status": "401"`. The result will be the first value in the chart, corresponding to the "401" label.
    -   **Second item (`data[1]`):** It will do the same, but filtering by `"status": "404"`, and so on.

Essentially, for each item in the `data` array, a separate query is executed to find the corresponding value.

#### Dynamic Filters

A chart configuration can also include a `filters` array, allowing the API to filter data dynamically through query parameters in the URL.

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

## Important Notes and Tips

### 1. Temporal vs. Instantaneous

*   **`temporal=false` (Default):** Returns the **last known state** of the metric. Ideal for status gauges (e.g., "Is the system UP or DOWN?").

*   **`temporal=true`:** Returns a **historical series**. Useful for observing trends and behaviors over time.

### 2. From Simulation to Real (Production)

Justin Hammer comes pre-configured to read from its own `/metrics` (mock) endpoint. To connect to a host that returns **real metrics**:

1. Open `src/config/chart-parse-config.json`.

2. In the `dataSource.urls` array, change the `url` to the actual address of your pod or service.

3. The system will start collecting, normalizing, and storing real data automatically, without needing code changes.

### 3. Aggregation and Counters (RPS)

When using `temporal=true` with `aggregate`, the API calculates the **average** of the values in the interval. For *Counter* type metrics (which only increase), this average over a time interval effectively represents the **request rate** (or events) for that period.

### 4. Retention Transparency

The data cleanup service (`metrics-retention.service.js`) runs silently in the background but emits detailed logs to the console whenever a cleanup is triggered or when the database is compacted via `VACUUM`. This allows monitoring storage health without manual intervention.

### 5. Combined Queries

You can combine all filters to get granular views:

`GET /api/chart/cpu_usage?range=24h&aggregate=10m&temporal=true&namePod=app-server-01&method=POST`

*Here you would see the CPU load for the last 24 hours, grouped every 10 min, only for the specified pod and filtering for POST requests.*

---

## Additional Documentation

For a technical deep dive into how data is processed, see:
- [**Understanding Metrics in Justin Hammer**](00doc/understanding-metrics.md): Details on metric types (Gauge, Counter), RPS calculations, and aggregation logic.
