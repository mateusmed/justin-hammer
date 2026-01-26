
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    // Este endpoint conflitará com outros se todos forem montados na raiz '/'.
    // Sugiro depois montá-lo em um caminho como '/health'.
    res.send('Health check: OK');
});

router.get('/status', (req, res) => {
    res.json({ status: 'OK' });
});



module.exports = router;