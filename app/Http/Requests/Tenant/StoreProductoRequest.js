const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

class StoreProductoRequest extends BaseRequest {
    /**
     * Define validation rules for creating/updating a product
     * @returns {Array} Array of express-validator rules
     */
    static rules() {
        return [
            body('codigo')
                .notEmpty().withMessage('El código del producto es obligatorio')
                .trim()
                .isLength({ max: 50 }).withMessage('El código no puede exceder los 50 caracteres'),

            body('nombre')
                .notEmpty().withMessage('El nombre del producto es obligatorio')
                .trim()
                .isLength({ max: 100 }).withMessage('El nombre no puede exceder los 100 caracteres'),

            body('precio_unidad')
                .notEmpty().withMessage('El precio de unidad es obligatorio')
                .isNumeric().withMessage('El precio debe ser un valor numérico')
                .custom(value => {
                    if (parseFloat(value) < 0) {
                        throw new Error('El precio no puede ser negativo');
                    }
                    return true;
                }),

            body('categoria_id')
                .notEmpty().withMessage('La categoría es obligatoria')
                .isInt().withMessage('Categoría inválida'),

            body('descripcion')
                .optional({ checkFalsy: true })
                .isString().withMessage('La descripción debe ser un texto')
                .isLength({ max: 1000 }).withMessage('La descripción no puede exceder los 1000 caracteres')
        ];
    }
}

module.exports = StoreProductoRequest;
