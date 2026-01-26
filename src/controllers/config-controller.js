const express = require('express');
const router = express.Router();
const { configManagerService } = require('../services/config-manager.service.js');

// GET /api/config - Read the current configuration
router.get('/', (req, res) => {
    try {
        const config = configManagerService.getConfig();
        res.json(config);
    } catch (error) {
        console.error('[ConfigController] Error reading configuration:', error);
        res.status(500).json({ message: 'Failed to read configuration.' });
    }
});

// POST /api/config - Update the configuration
router.post('/', async (req, res) => {
    try {
        const newConfig = req.body;
        // Basic validation: ensure it's a valid JSON object
        if (typeof newConfig !== 'object' || newConfig === null) {
            return res.status(400).json({ message: 'Invalid configuration format. Expected a JSON object.' });
        }

        await configManagerService.updateConfigFile(newConfig);

        res.status(200).json({ message: 'Configuration updated successfully.', config: newConfig });

    } catch (error) {
        console.error('[ConfigController] Error updating configuration:', error);
        res.status(500).json({ message: 'Failed to update configuration.' });
    }
});

module.exports = router;