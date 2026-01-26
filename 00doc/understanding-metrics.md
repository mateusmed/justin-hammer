# UNDERSTANDING METRICS IN JUSTIN HAMMER

This document deepens the understanding of how metrics are structured, collected, and queried in the Justin Hammer project, drawing a parallel with industry-standard metric types.

## Calculating Requests Per Second (RPS)

Requests Per Second (RPS) is a fundamental metric for measuring system throughput. In Justin Hammer, it is **entirely possible** to calculate RPS using existing metrics.

**How it works:**

1.  **Counter Metrics:** RPS is derived from "counter" type metrics. A counter is a numerical value that only increases over time, recording the total number of occurrences of an event (e.g., total requests processed).
    *   In Justin Hammer's `metrics.json`, metrics like `proxy_requests_total`, `proxy_requests_cloud_total`, and `count` fields within duration objects (e.g., `proxy_destiny_request_duration.count`) are examples of counters. They are incremented with each request or event.

2.  **Rate Calculation:** To get RPS, we calculate the rate of change of this counter over a time interval. The basic formula is:
    `RPS = (Counter_Value_T2 - Counter_Value_T1) / (Time_T2 - Time_T1)`

3.  **In Justin Hammer:** The `fetchTimeSeries` function with the `aggregate` parameter already performs this calculation for you efficiently.
    *   When querying a counter metric (e.g., `proxy_requests_total`) with `temporal=true` and an `aggregate` (e.g., `1m` for 1 minute), the system queries the database.
    *   The internal SQL query uses aggregation functions (like `AVG(value)`) over the time "buckets" defined by the `aggregate`. For a counter that only grows, the average of values within a bucket represents the average increment rate of that counter in that period.

**Query Example for RPS:**

To get the average RPS every minute in the last hour for cloud requests:

```
http://localhost:3001/api/chart/requests_by_cloud?range=1h&aggregate=1m&temporal=true
```

*(Assuming `requests_by_cloud` uses `proxy_requests_cloud_total` as the main metric and that `proxy_requests_cloud_total` is a counter.)*

## Metric Types and How Justin Hammer Handles Them

In the monitoring world, metrics are classified into types to indicate their behavior and how they should be interpreted. Justin Hammer, through its `metrics.json` and collection/query functions, handles these types practically.

### 1. Gauge

*   **Concept:** Represents a single numerical value that can go up and down freely. It reflects the "current state" of something.
    *   **Examples:** CPU usage (%), free memory (MB), number of online users, temperature.
*   **In Justin Hammer (`metrics.json`):**
    *   Metrics like `cpu.systemLoadAverage`, `memory.usedHeap`, `thread.count` are treated as Gauges. Their values can fluctuate up or down.
*   **Querying in Justin Hammer:**
    *   **Non-Temporal (`temporal=false`):** `fetchMetricValue` returns the last recorded value of the Gauge.
    *   **Temporal (`temporal=true`):** `fetchTimeSeries` returns the time series of the Gauge, usually with the average of values within each time bucket.

### 2. Counter

*   **Concept:** Represents a numerical value that can only increase (or be reset to zero, but never decrease). It measures the "accumulated total" of something.
    *   **Examples:** Total requests processed, total errors, total bytes sent.
*   **In Justin Hammer (`metrics.json`):**
    *   Metrics ending in `_total` (e.g., `proxy_requests_total`, `proxy_responses_total`) or `count` fields within duration objects (e.g., `proxy_destiny_request_duration.count`) are treated as Counters.
*   **Querying in Justin Hammer:**
    *   **Non-Temporal (`temporal=false`):** `fetchMetricValue` returns the last accumulated total value of the Counter.
    *   **Temporal (`temporal=true`):** `fetchTimeSeries` is ideal for calculating the **rate of change** of the Counter over time (like RPS), returning the average increment per bucket.

### 3. Histograms and Summaries (for Distributions)

*   **Concept:** Used to measure distributions of values (e.g., request latencies). They usually expose multiple values:
    *   **`_sum`:** Sum of all observations.
    *   **`_count`:** Total number of observations (a counter).
    *   **`_bucket`:** Counters for each bucket of a histogram, showing how many observations fell within a certain range.
    *   **Percentiles (p50, p95, p99, etc.):** Values below which a certain percentage of observations fell.
*   **In Justin Hammer (`metrics.json`):**
    *   Objects like `proxy_destiny_request_duration` and `proxy_request_duration` represent these distributions. They contain fields like `mean`, `max`, `p50`, `count`, `oneMinRate`, etc.
*   **Querying in Justin Hammer:**
    *   You can query any of these sub-fields as an individual metric. For example, `proxy_destiny_request_duration.p95` would be a Gauge (the current 95th percentile), and `proxy_destiny_request_duration.count` would be a Counter (the total observations).
    *   Rates (`oneMinRate`, `fiveMinRate`) are pre-calculated values that can be queried as Gauges.

---

## Points to Improve / Clarify

**Terminology `temporal=false` / `temporal=true`:**
It is consistent, but it might be good to reinforce that `temporal=false` doesn't mean there are no timestamps, just that you get the last recorded value without creating historical series. It can cause confusion if someone expects `temporal=false` to return something "instantaneous" versus cumulative (Counters vs Gauges).

**Random values in `/metrics`:**
It is explained that they are simulated, but it might be good to reinforce that this is for testing only and that real metrics would need to be extracted from production applications.

**Aggregation of multiple `labelFilters`:**
It's clear that it's done by average, but it's worth mentioning that this might not be idempotent for Counters, as averaging incremental counters can yield unexpected results if one doesn't understand the "rate" concept.

**DB Cleanup Policy:**
Explains that it removes old data up to 75% of the limit, but doesn't say if there's an alert or log when it happens. It can be useful for debugging.

**Complex Query Examples:**
They are clear, but could explicitly mention how to combine `temporal=true` with aggregation and label filtering to reinforce the idea of consolidated time series.
