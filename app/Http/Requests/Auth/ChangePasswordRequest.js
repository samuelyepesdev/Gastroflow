const { body } = require('express-validator');
const BaseRequest = require('../BaseRequest');

class ChangePasswordRequest extends BaseRequest {
    /**
     * Define validation rules for changing password
     * @returns {Array} Array of express-validator rules
     */
    static rules() {
        return [
            body('currentPassword').notEmpty().withMessage('La contraseña actual es requerida'),

            body('newPassword')
                .notEmpty()
                .withMessage('La nueva contraseña es requerida')
                .isLength({ min: 8 })
                .withMessage('La nueva contraseña debe tener al menos 8 caracteres')
                .matches(/[A-Z]/)
                .withMessage('La nueva contraseña debe contener al menos una letra mayúscula')
                .matches(/[0-9]/)
                .withMessage('La nueva contraseña debe contener al menos un número'),

            body('newPasswordConfirm')
                .notEmpty()
                .withMessage('Debe confirmar la nueva contraseña')
                .custom((value, { req }) => {
                    if (value !== req.body.newPassword) {
                        throw new Error('La confirmación no coincide con la nueva contraseña');
                    }
                    return true;
                })
        ];
    }
}

module.exports = ChangePasswordRequest;
