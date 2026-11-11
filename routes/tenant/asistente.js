const express = require('express');
const router = express.Router();
const { requireAsistente } = require('../../middleware/asistente');
const { crearLimitesAsistente } = require('../../middleware/asistenteLimites');
const AsistenteController = require('../../app/Http/Controllers/Tenant/AsistenteController');

const limites = crearLimitesAsistente();

// El control de acceso vive aquí, no en el montaje: el router no se puede montar sin él. Va ANTES de los
// límites para que quien no tiene acceso no pueda gastar la cuota del restaurante.
router.use(requireAsistente);

router.get('/estado', AsistenteController.estado);
// Audio crudo (no multipart): tope de 1 MB, de sobra para ~20 s de voz. El tipo lo valida el servicio.
const audioCrudo = express.raw({ type: () => true, limit: '1mb' });
router.post('/transcribir', limites.transcribir, audioCrudo, AsistenteController.transcribir);
router.post('/comando', limites.usuario, limites.tenant, AsistenteController.comando);
router.post('/confirmar', limites.confirmar, AsistenteController.confirmar);

module.exports = router;
