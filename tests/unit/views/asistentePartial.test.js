const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const VISTAS = path.join(__dirname, '../../../views/partials');

describe('vista del asistente', () => {
    it('el parcial trae el botón, el panel accesible y los scripts del panel', async () => {
        const html = await ejs.renderFile(path.join(VISTAS, '_asistente.ejs'), { assetV: 'test' });

        expect(html).toContain('id="asistente-fab"');
        expect(html).toContain('aria-label="Abrir el asistente"');
        expect(html).toContain('role="dialog"');
        expect(html).toContain('id="asistente-mensajes"');
        expect(html).toContain('/js/core/asistente-api.js?v=test');
        expect(html).toContain('/js/core/asistente.js?v=test');
        expect(html).toContain('/js/core/asistente-voz.js?v=test');
        // La voz es opcional: ambos botones nacen ocultos y solo el script los muestra si el navegador puede.
        expect(html).toMatch(/id="asistente-voz-entrada"[^>]*hidden/);
        expect(html).toMatch(/id="asistente-voz-salida"[^>]*hidden/);
    });

    it('el navbar solo incluye el parcial cuando el usuario tiene acceso (nav.can.asistente)', () => {
        const navbar = fs.readFileSync(path.join(VISTAS, 'navbar.ejs'), 'utf8');
        const guarda = /<% if \(nav\.can\.asistente\) \{ %>\s*<%- include\('_asistente'\) %>\s*<% \} %>/;

        expect(navbar).toMatch(guarda);
        expect(navbar.match(/_asistente/g)).toHaveLength(1);
    });
});
