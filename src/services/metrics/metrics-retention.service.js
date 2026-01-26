const fs = require('fs').promises;
const path = require('path');
const { getDbFileSize, deleteOldestMetrics } = require('../database.service.js');

const CONFIG_PATH = path.resolve('src/config/chart-parse-config.json');

class MetricsRetentionService {
    constructor() {
        this.cleanupIntervalId = null;
    }

    async start() {
        try {
            const { retentionSettings } = await this.getRetentionSettings();

            if (retentionSettings && retentionSettings.maxDbSizeMB && retentionSettings.cleanupIntervalSeconds) {
                // Perform initial cleanup on start
                await deleteOldestMetrics(retentionSettings.maxDbSizeMB);

                this.cleanupIntervalId = setInterval(async () => {
                    try {
                        await deleteOldestMetrics(retentionSettings.maxDbSizeMB);
                    } catch (error) {
                        console.error('[MetricsRetentionService] Error during scheduled cleanup:', error);
                    }
                }, retentionSettings.cleanupIntervalSeconds * 1000);
                console.log(`[MetricsRetentionService] Scheduled database cleanup every ${retentionSettings.cleanupIntervalSeconds} seconds.`);
            } else {
                console.log('[MetricsRetentionService] Retention settings not configured. Database cleanup will not be scheduled.');
            }
        } catch (error) {
            console.error('[MetricsRetentionService] Failed to start cleanup service:', error);
        }
    }

    async getRetentionSettings() {
        const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configContent);
        return { retentionSettings: config.collectionSettings.retentionSettings };
    }

    stop() {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            console.log('[MetricsRetentionService] Database cleanup stopped.');
        }
    }

    // New method to update configuration dynamically
    async updateConfig(newConfig) {
        const { retentionSettings } = newConfig;

        // Clear existing interval
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            console.log('[MetricsRetentionService] Cleanup interval cleared for update.');
        }

        // Set up new interval with updated settings
        if (retentionSettings && retentionSettings.maxDbSizeMB && retentionSettings.cleanupIntervalSeconds) {
            // Perform initial cleanup on update
            await deleteOldestMetrics(retentionSettings.maxDbSizeMB);

            this.cleanupIntervalId = setInterval(async () => {
                try {
                    await deleteOldestMetrics(retentionSettings.maxDbSizeMB);
                } catch (error) {
                    console.error('[MetricsRetentionService] Error during scheduled cleanup (updated config):', error);
                }
            }, retentionSettings.cleanupIntervalSeconds * 1000);
            console.log(`[MetricsRetentionService] Updated. Scheduled database cleanup every ${retentionSettings.cleanupIntervalSeconds} seconds.`);
            console.log(`[MetricsRetentionService] New cleanup interval set to ${retentionSettings.cleanupIntervalSeconds} seconds.`);
        } else {
            console.log('[MetricsRetentionService] Retention settings not configured in updated config. Database cleanup will not be scheduled.');
        }
    }
} 

module.exports = { metricsRetentionService: new MetricsRetentionService() };
