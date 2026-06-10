const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

const TIPOS_VALIDOS = ['bug', 'mejora', 'duda', 'urgente'];

class StoreSoporteRequest extends BaseRequest {
    static rules() {
        return [
            body('tipo')
                .notEmpty()
                .withMessage('El tipo de solicitud es obligatorio')
                .isIn(TIPOS_VALIDOS)
                .withMessage('Tipo de solicitud no válido'),

            body('descripcion')
                .notEmpty()
                .withMessage('La descripción es obligatoria')
                .trim()
                .isLength({ min: 10, max: 2000 })
                .withMessage('La descripción debe tener entre 10 y 2000 caracteres')
        ];
    }
}

module.exports = StoreSoporteRequest;
