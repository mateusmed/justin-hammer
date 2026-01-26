const fs = require('fs').promises;
const path = require('path');
const { metricsCollectorService } = require('./metrics/metrics-collector.service.js');
const { metricsRetentionService } = require('./metrics/metrics-retention.service.js');

const CONFIG_PATH = path.resolve('src/config/chart-parse-config.json');

class ConfigManagerService {
    constructor() {
        this.currentConfig = null;
        this.watcher = null;
    }

    async loadConfig() {
        try {
            const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
            this.currentConfig = JSON.parse(configContent);
            console.log('[ConfigManagerService] Configuration loaded.');
            return this.currentConfig;
        } catch (error) {
            console.error('[ConfigManagerService] Error loading configuration:', error);
            throw error;
        }
    }

    async applyConfig(config) {
        // Apply to collector service
        const { intervalSeconds, dataSource } = config.collectionSettings;
        await metricsCollectorService.updateConfig({ intervalSeconds, dataSource });

        // Apply to retention service
        const { retentionSettings } = config.collectionSettings;
        await metricsRetentionService.updateConfig({ retentionSettings });

        console.log('[ConfigManagerService] Configuration applied to services.');
    }

    async startWatching() {
        // Initial load and apply
        const initialConfig = await this.loadConfig();
        await this.applyConfig(initialConfig);

        // Watch for file changes
        // Using fs.watch for simplicity, but chokidar is more robust for production
        this.watcher = fs.watch(CONFIG_PATH, async (eventType, filename) => {
            if (eventType === 'change') {
                console.log(`[ConfigManagerService] Config file changed. Reloading...`);
                try {
                    const newConfig = await this.loadConfig();
                    await this.applyConfig(newConfig);
                    console.log('[ConfigManagerService] Config reloaded and applied successfully.');
                } catch (error) {
                    console.error('[ConfigManagerService] Error reloading config:', error);
                }
            }
        });
        console.log(`[ConfigManagerService] Watching config file: ${CONFIG_PATH}`);
    }

    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            console.log('[ConfigManagerService] Config file watcher stopped.');
        }
    }

    // Method to be called by config-controller after writing the file
    async reloadConfig() {
        console.log('[ConfigManagerService] Manual reload triggered.');
        try {
            const newConfig = await this.loadConfig();
            await this.applyConfig(newConfig);
            console.log('[ConfigManagerService] Manual reload applied successfully.');
        } catch (error) {
            console.error('[ConfigManagerService] Error during manual reload:', error);
        }
    }

    // Method to get the current configuration
    getConfig() {
        return this.currentConfig;
    }

    // Method to update the config file and trigger reload
    async updateConfigFile(newConfig) {
        try {
            // Basic validation: ensure it's a valid JSON object
            if (typeof newConfig !== 'object' || newConfig === null) {
                throw new Error('Invalid configuration format. Expected a JSON object.');
            }

            // Write the new config to the file
            await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
            console.log('[ConfigManagerService] Configuration file updated successfully.');

            // Trigger hot reload (this will be handled by the file watcher)
            // If fs.watch doesn't trigger reliably on write, we can call reloadConfig() here.
            // For now, rely on fs.watch. If issues arise, uncomment the line below.
            await this.reloadConfig();

        } catch (error) {
            console.error('[ConfigManagerService] Error updating config file:', error);
            throw error;
        }
    }
}

module.exports = { configManagerService: new ConfigManagerService() };
