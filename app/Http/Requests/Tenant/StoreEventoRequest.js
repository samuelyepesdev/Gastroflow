const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

class StoreEventoRequest extends BaseRequest {
    static rules() {
        return [
            body('nombre')
                .notEmpty()
                .withMessage('El nombre del evento es obligatorio')
                .trim()
                .isLength({ max: 100 })
                .withMessage('El nombre no puede exceder 100 caracteres'),

            body('descripcion')
                .optional({ checkFalsy: true })
                .trim()
                .isLength({ max: 500 })
                .withMessage('La descripción no puede exceder 500 caracteres'),

            body('fecha_inicio')
                .notEmpty()
                .withMessage('La fecha de inicio es obligatoria')
                .isDate()
                .withMessage('Fecha de inicio inválida'),

            body('fecha_fin')
                .notEmpty()
                .withMessage('La fecha de fin es obligatoria')
                .isDate()
                .withMessage('Fecha de fin inválida'),

            body('presupuesto')
                .optional({ checkFalsy: true })
                .isNumeric()
                .withMessage('El presupuesto debe ser un número')
                .custom(v => {
                    if (parseFloat(v) < 0) {
                        throw new Error('El presupuesto no puede ser negativo');
                    }
                    return true;
                })
        ];
    }
}

module.exports = StoreEventoRequest;
