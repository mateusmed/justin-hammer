const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        appName: "justin-hammer",
        version: "1.0.0",
        author: {
            name: "Your Name",
            socialMedia: {
                github: "https://github.com/mateusmed",
                linkedin: "https://www.linkedin.com/in/mateus-med"
            }
        }
    });
});

module.exports = router;
