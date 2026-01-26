const express = require('express');
const server = express();
const port = 3001;

// Controllers
const justinHammerController = require('./controllers/justin-hammer-controller');
const healthCheckController = require('./controllers/healthCheck-controller');
const mockMetricGeneratorController = require('./controllers/mock-metric-generator-controller');
const configController = require('./controllers/config-controller');
const aboutController = require('./controllers/about-controller');

// Services
const { metricsCollectorService } = require('./services/metrics/metrics-collector.service.js');
const dynamicMetricsGeneratorService = require('./services/metrics/metrics-dynamic-generator.service.js');
const { metricsRetentionService } = require('./services/metrics/metrics-retention.service.js');
const { configManagerService } = require('./services/config-manager.service.js');

// Middleware for CORS
server.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Middleware to parse JSON request bodies
server.use(express.json());



// Registrando todos os controllers
server.use('/api', justinHammerController); // Rotas: /api/chart/*
server.use('/metrics', mockMetricGeneratorController); // Rota: /metrics
server.use('/health', healthCheckController); // Rotas: /health/ e /health/status
server.use('/api/config', configController);
server.use('/about', aboutController);

const startServer = async () => {
    try {
        // Load the metrics template before anything else
        await dynamicMetricsGeneratorService.loadTemplate();

        // Wait for the collector and database to be ready
        await metricsCollectorService.start();
        await metricsRetentionService.start();
        await configManagerService.startWatching();

        // Now, start the web server
        server.listen(port, () => {
            console.log(`Example app listening at http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Failed to start the application:', error);
        process.exit(1);
    }
};

startServer();
