class MetricsNormalizerService {
    normalize(metricsData) {
        const metrics = [];

        for (const category in metricsData) {
            for (const key in metricsData[category]) {
                const value = metricsData[category][key];

                if (typeof value === 'object') {
                    for (const subKey in value) {
                        const subValue = value[subKey];
                        const [name, ...labels] = subKey.split(';');
                        const labelsObject = this.extractLabels(labels);
                        metrics.push({
                            name: `${key}_${name}`,
                            labels: labelsObject,
                            value: subValue,
                        });
                    }
                } else {
                    const [name, ...labels] = key.split(';');
                    const labelsObject = this.extractLabels(labels);
                    metrics.push({
                        name,
                        labels: labelsObject,
                        value,
                    });
                }
            }
        }

        return metrics;
    }

    extractLabels(labels) {
        const labelsObject = {};
        labels.forEach(label => {
            const [key, ...values] = label.split('=');
            labelsObject[key] = values.length > 0 ? values.join('=').replace(/"/g, '') : true;
        });
        return labelsObject;
    }
}

module.exports = new MetricsNormalizerService();