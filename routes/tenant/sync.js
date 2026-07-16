const express = require('express');
const router = express.Router();
const SyncController = require('../../app/Http/Controllers/Tenant/SyncController');

router.get('/pull', SyncController.pull);
router.post('/push', SyncController.push);

module.exports = router;
