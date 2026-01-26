const express = require('express');
const router = express.Router();


const dynamicMetricsGeneratorService = require('../services/metrics/metrics-dynamic-generator.service.js');
const chartService = require('../services/chart.service.js');
const { configManagerService } = require('../services/config-manager.service.js');




router.get('/chart/:nameChart', async (req, res) => {

    const { nameChart } = req.params;
    const chartConfigList = configManagerService.getConfig();
    const chartConfigItem = chartConfigList.charts.find(c => c.nameChart === nameChart);

    if (!chartConfigItem) {
        return res.status(404).json({ message: `Chart config for name '${nameChart}' not found.` });
    }

    // Input validation for temporal queries
    if (req.query.temporal === 'true') {
        if (!req.query.range || !req.query.aggregate) {
            return res.status(400).json({
                message: 'For temporal queries (temporal=true), both "range" and "aggregate" query parameters are required.'
            });
        }
    }

    try {

        const chartConfigItemCopy = JSON.parse(JSON.stringify(chartConfigItem));
        // Chama o serviço e aguarda o resultado
        const finalChart = await chartService.buildChart(req.params, req.query, chartConfigItemCopy);

        // Envia o resultado como resposta JSON
        res.json(finalChart);

    } catch (error) {
        console.error(`[Error fetching chart ${nameChart}]:`, error);
        res.status(500).json({ message: 'Failed to fetch chart data.' });
    }
});

module.exports = router;