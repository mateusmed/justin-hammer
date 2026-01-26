
const fs = require('fs').promises;
const path = require('path');
const { initializeDatabase } = require('../database.service.js');
const normalizer = require('./metrics-normalizer.service.js');
const fetch = require('node-fetch').default;

const CONFIG_PATH = path.resolve('src/config/chart-parse-config.json');

class MetricsCollectorService {
    constructor() {
        this.intervalId = null;
        this.isCollecting = false;
        this.db = null; // To hold the database instance
    }

    async start() {
        try {
            // Wait for the database to be ready first
            this.db = await initializeDatabase();

            const {intervalSeconds, dataSource, retentionSettings} = await this.getCollectionSettings();

            if (!intervalSeconds || !dataSource) {
                console.error('[MetricsCollectorService] Invalid configuration for metrics collection.');
                return;
            }

            const collect = async () => {
                if (this.isCollecting) {
                    console.warn('[MetricsCollectorService] Skipping collection run as a previous one is still in progress.');
                    return;
                }
                this.isCollecting = true;
                try {
                    await this.collectAndStore(dataSource);
                } catch (error) {
                    console.error('[MetricsCollectorService] Error during collection:', error);
                } finally {
                    this.isCollecting = false;
                }
            };

            // Collect immediately on start
            await collect();

            // Then collect on schedule
            this.intervalId = setInterval(collect, intervalSeconds * 1000);
            console.log(`[MetricsCollectorService] Started. Collecting metrics from ${dataSource.type} every ${intervalSeconds} seconds.`);

            

        } catch (error) {
            console.error('[MetricsCollectorService] Failed to start:', error);
        }
    }

    async getCollectionSettings() {
        const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configContent);
        const {intervalSeconds, dataSource} = config.collectionSettings;
        return {intervalSeconds, dataSource};
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('[MetricsCollectorService] Stopped.');
        }
        if (this.db) {
            this.db.close();
            console.log('[MetricsCollectorService] Database connection closed.');
        }
        
    }

    async collectAndStore(dataSource) {
        if (!this.db) {
            console.error('[MetricsCollectorService] Database not initialized. Cannot store metrics.');
            return;
        }

        let allNormalizedMetricsWithPodName = [];
        try {
            if (dataSource.type === 'http') {
                const sources = Array.isArray(dataSource.urls) ? dataSource.urls : [{ name: 'default', url: dataSource.url }];

                const fetchPromises = sources.map(async (source) => {
                    try {
                        const response = await fetch(source.url, {
                            headers: {
                                'Accept': 'application/json'
                            }
                        });
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status} from ${source.url}`);
                        }
                        const metrics = await response.json();
                        return { name: source.name, metrics: metrics };
                    } catch (error) {
                        console.error(`[MetricsCollectorService] Failed to fetch metrics from ${source.url}: ${error.message}`);
                        return null;
                    }
                });

                const results = await Promise.all(fetchPromises);

                results.forEach(sourceResult => {
                    if (sourceResult && sourceResult.metrics) {
                        const normalized = normalizer.normalize(sourceResult.metrics);
                        const metricsWithPodName = normalized.map(metric => ({
                            ...metric,
                            namePod: sourceResult.name
                        }));
                        allNormalizedMetricsWithPodName.push(...metricsWithPodName);
                    }
                });

            } else if (dataSource.type === 'file') {
                const metricsPath = path.resolve(dataSource.path);
                const metricsContent = await fs.readFile(metricsPath, 'utf-8');
                const metrics = JSON.parse(metricsContent);
                const normalized = normalizer.normalize(metrics);
                allNormalizedMetricsWithPodName.push(...normalized.map(metric => ({ ...metric, namePod: 'file-source' }))); // Default name for file source
            } else {
                throw new Error(`Unsupported data source type: ${dataSource.type}`);
            }
        } catch (error) {
            console.error(`[MetricsCollectorService] Failed to fetch metrics from source: ${error.message}`);
            return; // Stop execution if source fails
        }

        const timestamp = Date.now();

        const records = allNormalizedMetricsWithPodName.map(metric => {
            const numValue = Number(metric.value);
            return [
                timestamp,
                metric.name,
                JSON.stringify(metric.labels),
                isNaN(numValue) ? 0 : numValue,
                metric.namePod // Add namePod here
            ];
        });

        if (records.length === 0) {
            console.log('[MetricsCollectorService] No metric records to store.');
            return;
        }

        const stmt = this.db.prepare('INSERT INTO metrics (timestamp, name, labels, value, namePod) VALUES (?, ?, ?, ?, ?)');

        this.db.serialize(() => {
            this.db.run('BEGIN TRANSACTION');
            records.forEach(record => {
                stmt.run(record);
            });
            this.db.run('COMMIT');
        });

        stmt.finalize();
        console.log(`[MetricsCollectorService] Stored ${records.length} metric records at ${new Date(timestamp).toISOString()}`);
    }

    // New method to update configuration dynamically
    async updateConfig(newConfig) {
        const { intervalSeconds, dataSource } = newConfig;

        // Clear existing interval
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('[MetricsCollectorService] Collection interval cleared for update.');
        }

        // Set up new interval with updated settings
        const collect = async () => {
            if (this.isCollecting) {
                console.warn('[MetricsCollectorService] Skipping collection run as a previous one is still in progress.');
                return;
            }
            this.isCollecting = true;
            try {
                await this.collectAndStore(dataSource);
            } catch (error) {
                console.error('[MetricsCollectorService] Error during collection (updated config):', error);
            } finally {
                this.isCollecting = false;
            }
        };

        // Collect immediately with new config
        await collect();

        // Then collect on schedule with new config
        this.intervalId = setInterval(collect, intervalSeconds * 1000);
        console.log(`[MetricsCollectorService] Updated. Collecting metrics from ${dataSource.type} every ${intervalSeconds} seconds.`);
        console.log(`[MetricsCollectorService] New collection interval set to ${intervalSeconds} seconds.`);
    }
}

module.exports = { metricsCollectorService: new MetricsCollectorService() };
