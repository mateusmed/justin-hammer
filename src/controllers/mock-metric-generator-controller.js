const express = require('express');
const router = express.Router();
const dynamicMetricsGeneratorService = require("../services/metrics/metrics-dynamic-generator.service");

router.get('/', (req, res) => {
    try {
        const dynamicMetrics = dynamicMetricsGeneratorService.generate();
        res.json(dynamicMetrics);
    } catch (error) {
        console.error('[Error generating dynamic metrics]:', error);
        res.status(500).json({ message: 'Failed to generate dynamic metrics.' });
    }
});

module.exports = router;