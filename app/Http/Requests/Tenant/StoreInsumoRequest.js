const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

class StoreInsumoRequest extends BaseRequest {
    /**
     * Define validation rules for creating/updating an insumo (ingredient)
     * @returns {Array} Array of express-validator rules
     */
    static rules() {
        return [
            body('codigo')
                .notEmpty()
                .withMessage('El código del insumo es obligatorio')
                .trim()
                .isLength({ max: 50 })
                .withMessage('El código no puede exceder los 50 caracteres'),

            body('nombre')
                .notEmpty()
                .withMessage('El nombre del insumo es obligatorio')
                .trim()
                .isLength({ max: 100 })
                .withMessage('El nombre no puede exceder los 100 caracteres'),

            body('unidad_compra')
                .optional()
                .trim()
                .isLength({ max: 20 })
                .withMessage('La unidad de compra es muy larga'),

            body('cantidad_compra')
                .optional()
                .isNumeric()
                .withMessage('La cantidad de compra debe ser numérica')
                .custom(value => {
                    if (parseFloat(value) <= 0) {
                        throw new Error('La cantidad de compra debe ser mayor a 0');
                    }
                    return true;
                }),

            body('precio_compra')
                .optional()
                .isNumeric()
                .withMessage('El precio de compra debe ser numérico')
                .custom(value => {
                    if (parseFloat(value) < 0) {
                        throw new Error('El precio de compra no puede ser negativo');
                    }
                    return true;
                }),

            body('stock_minimo').optional().isNumeric().withMessage('El stock mínimo debe ser numérico'),

            body('rendimiento_pct')
                .optional()
                .isNumeric()
                .withMessage('El rendimiento debe ser numérico')
                .custom(value => {
                    const n = parseFloat(value);
                    if (n <= 0 || n > 100) {
                        throw new Error('El rendimiento debe estar entre 1 y 100');
                    }
                    return true;
                })
        ];
    }
}

module.exports = StoreInsumoRequest;
