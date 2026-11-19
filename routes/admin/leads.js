const express = require('express');
const router = express.Router();
const LeadsController = require('../../app/Http/Controllers/Admin/LeadsController');

// Guard de superadmin aplicado en routes/web.js (requireSuperadmin)

router.get('/', LeadsController.index);
router.patch('/:id(\\d+)/contactado', LeadsController.setContactado);

module.exports = router;
