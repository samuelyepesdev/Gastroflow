const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

class StoreServicioRequest extends BaseRequest {
    static rules() {
        return [
            body('nombre')
                .notEmpty()
                .withMessage('El nombre del servicio es obligatorio')
                .trim()
                .isLength({ max: 100 })
                .withMessage('El nombre no puede exceder 100 caracteres'),

            body('descripcion')
                .optional({ checkFalsy: true })
                .trim()
                .isLength({ max: 500 })
                .withMessage('La descripción no puede exceder 500 caracteres'),

            body('precio')
                .notEmpty()
                .withMessage('El precio es obligatorio')
                .isNumeric()
                .withMessage('El precio debe ser un número')
                .custom(v => {
                    if (parseFloat(v) < 0) {
                        throw new Error('El precio no puede ser negativo');
                    }
                    return true;
                }),

            body('es_externo').optional().isBoolean().withMessage('Campo es_externo inválido'),

            body('activo').optional().isBoolean().withMessage('Campo activo inválido')
        ];
    }
}

module.exports = StoreServicioRequest;
