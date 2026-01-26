const fs = require('fs').promises;
const path = require('path');

class MetricsDynamicGeneratorService {
    constructor() {
        this.template = null;
        this.baseCounters = {};
    }

    async loadTemplate() {
        if (this.template) {
            return;
        }
        const templatePath = path.join(__dirname, '../../example-metric-report/metrics.json');
        const templateContent = await fs.readFile(templatePath, 'utf8');
        this.template = JSON.parse(templateContent);
    }

    generate() {
        if (!this.template) {
            throw new Error('Metric template not loaded. Call loadTemplate() first.');
        }

        // Deep clone the template to avoid modifying the original
        const newMetrics = JSON.parse(JSON.stringify(this.template));

        // Recursive function to traverse and randomize metrics
        const randomize = (obj, parentKey = '') => {
            for (const key in obj) {
                const fullKey = parentKey ? `${parentKey}.${key}` : key;
                const value = obj[key];

                if (typeof value === 'object' && value !== null) {
                    randomize(value, fullKey);
                } else if (typeof value === 'number') {
                    // Check for counter keywords in the key
                    if (key.includes('total') || key.includes('count') || key.includes('time')) {
                        // Increment counters
                        this.baseCounters[fullKey] = (this.baseCounters[fullKey] || value) + Math.floor(Math.random() * 5);
                        obj[key] = this.baseCounters[fullKey];
                    } else {
                        // Fluctuate gauges
                        const fluctuation = (Math.random() - 0.5) * (value * 0.1); // Fluctuate by up to 10%
                        obj[key] = Math.max(0, value + fluctuation);
                    }
                }
            }
        };

        randomize(newMetrics);
        return newMetrics;
    }
}

// Export a single instance
module.exports = new MetricsDynamicGeneratorService();
