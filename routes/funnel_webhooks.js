const express = require('express');

const router = express.Router();

router.post('/test', (req, res, next) => res.json({}));

module.exports = router;
