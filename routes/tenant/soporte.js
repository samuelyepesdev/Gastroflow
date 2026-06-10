const express = require('express');
const router = express.Router();
const SoporteController = require('../../app/Http/Controllers/Tenant/SoporteController');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreSoporteRequest = require('../../app/Http/Requests/Tenant/StoreSoporteRequest');

router.get('/', SoporteController.index);
router.post('/enviar', BaseRequest.validate(StoreSoporteRequest), SoporteController.enviar);

module.exports = router;
