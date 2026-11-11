const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '../../..');
const leer = ruta => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

describe('vista de administración del asistente', () => {
    it('carga SweetAlert2 (los avisos de GF lo necesitan) y el script del módulo', () => {
        const vista = leer('views/admin/asistente/index.ejs');

        expect(vista).toContain('sweetalert2');
        expect(vista).toContain('/js/admin/asistente.js');
        expect(vista).toContain("currentAdminPage: 'asistente'");
    });

    it('el script escapa todo texto de la BD antes de ponerlo en HTML', () => {
        const js = leer('public/js/admin/asistente.js');

        expect(js).toContain('GF.escapeHtml');
        // Restaurante, asistente y usuario: cada uno pasa por esc().
        ['r.nombre', 'r.nombreAsistente', 'u.nombre', 'u.rol'].forEach(campo => {
            expect(js).toContain('esc(' + campo + ')');
        });
    });
});
