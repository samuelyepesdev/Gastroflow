// POS QZ — puente con QZ Tray (https://qz.io) para impresión térmica ESC/POS
// y apertura del cajón físico de dinero, sin pasar por el diálogo de impresión
// del navegador. Requiere que QZ Tray esté instalado y corriendo en la PC del
// restaurante; si no está disponible, todos los métodos fallan en silencio
// (best-effort) y el flujo normal del POS sigue funcionando igual.
//
// No usa certificado firmado (modo gratuito de QZ Tray): la primera conexión
// de cada sesión de navegador muestra un popup "Allow" en la PC del negocio.

// Comando ESC/POS estándar "ESC p m t1 t2" para pulso de apertura de cajón
// (pin 2, on=25*2ms, off=250*2ms). Override por tenant vía cajon_comando_hex.
const QZ_CAJON_HEX_DEFAULT = '1b700019fa';

window.POS_QZ = {
    _config: null,
    _connecting: null,

    async init() {
        try {
            const r = await fetch('/configuracion/impresoras');
            this._config = r.ok ? await r.json() : null;
        } catch {
            this._config = null;
        }

        if (this._config?.qz_habilitado && typeof qz !== 'undefined') {
            // Conecta ya al abrir el POS, para que el popup de "Allow" (si aplica)
            // no interrumpa el momento del cobro.
            this.connect().catch(() => {});
        }
    },

    async connect() {
        if (typeof qz === 'undefined') return false;
        if (qz.websocket.isActive()) return true;
        if (this._connecting) return this._connecting;

        this._connecting = qz.websocket.connect({ retries: 2, delay: 1 })
            .then(() => true)
            .catch(err => {
                console.warn('QZ Tray no disponible:', err.message || err);
                return false;
            })
            .finally(() => { this._connecting = null; });

        return this._connecting;
    },

    async _resolverImpresora() {
        const nombre = this._config?.impresora_nombre;
        return nombre ? qz.printers.find(nombre) : qz.printers.getDefault();
    },

    _cajonData() {
        const hex = this._config?.cajon_comando_hex || QZ_CAJON_HEX_DEFAULT;
        return { type: 'raw', format: 'hex', data: hex.replace(/\s+/g, '') };
    },

    // Construye el contenido ESC/POS del recibo a partir del payload de
    // GET /facturas/:id/imprimir-json (ver FacturasController.imprimirJson)
    _buildReceiptData(payload) {
        const { factura, detalles, config } = payload;
        const cols = Number(config?.ancho_papel) >= 80 ? 48 : 32;
        const linea = '-'.repeat(cols);
        const money = n => '$ ' + Number(n || 0).toLocaleString('es-CO');
        const data = [];

        const raw = hex => data.push({ type: 'raw', format: 'hex', data: hex });
        const text = (str, opts = {}) => {
            if (opts.center) raw('1b6101');
            if (opts.bold) raw('1b4501');
            data.push({ type: 'raw', format: 'plain', data: str + '\n' });
            if (opts.bold) raw('1b4500');
            if (opts.center) raw('1b6100');
        };

        raw('1b40'); // init

        text(config?.nombre_negocio || 'Negocio', { center: true, bold: true });
        if (config?.nit) text(`NIT: ${config.nit}`, { center: true });
        if (config?.direccion) text(config.direccion, { center: true });
        if (config?.telefono) text(`Tel: ${config.telefono}`, { center: true });
        text(linea);

        text(`Factura #${factura.numero ?? factura.id}`);
        text(String(factura.fecha || ''));
        text(`Cliente: ${factura.cliente_nombre || 'Consumidor final'}`);
        text(linea);

        (detalles || []).forEach(item => {
            text(`${item.cantidad} x ${item.producto_nombre}`.slice(0, cols));
            const sub = item.subtotal !== undefined ? money(item.subtotal) : '';
            if (sub) text(sub.padStart(cols));
            if (item.descuento_valor != null && Number(item.descuento_valor) > 0) {
                text(`  Desc: -${money(item.descuento_valor)}`.slice(0, cols));
            } else if (item.descuento_porcentaje != null && Number(item.descuento_porcentaje) > 0) {
                text(`  Desc: -${Number(item.descuento_porcentaje)}%`.slice(0, cols));
            }
            (item.modificadores || []).forEach(mod => {
                text(`  + ${mod.opcion_nombre}`.slice(0, cols));
            });
        });
        text(linea);

        if (factura.subtotal !== undefined) text(`Subtotal:`.padEnd(cols - 12) + money(factura.subtotal).padStart(12));
        if (factura.total_impuestos) text(`Impuestos:`.padEnd(cols - 12) + money(factura.total_impuestos).padStart(12));
        if (factura.propina) text(`Propina:`.padEnd(cols - 12) + money(factura.propina).padStart(12));
        text(`TOTAL:`.padEnd(cols - 12) + money(factura.total).padStart(12), { bold: true });

        if (factura.efectivo_recibido != null && Number(factura.efectivo_recibido) > Number(factura.total)) {
            text(`Recibido:`.padEnd(cols - 12) + money(factura.efectivo_recibido).padStart(12));
            text(`Cambio:`.padEnd(cols - 12) + money(Number(factura.efectivo_recibido) - Number(factura.total)).padStart(12));
        }

        if (factura.forma_pago === 'mixto') {
            text(`Efectivo: ${money(factura.monto_efectivo)}`);
            text(`Transferencia: ${money(factura.monto_transferencia)}`);
        } else {
            text(`Pago: ${factura.forma_pago || ''}`);
        }

        text(linea);
        if (config?.pie_pagina) text(config.pie_pagina, { center: true });

        raw('1d5642 00'.replace(' ', '')); // corte de papel

        return data;
    },

    async imprimirRecibo(facturaId) {
        if (!this._config?.qz_habilitado || !this._config?.imprimir_auto) return;
        if (typeof qz === 'undefined') return;

        const ok = await this.connect();
        if (!ok) return;

        try {
            const r = await fetch(`/facturas/${facturaId}/imprimir-json`);
            if (!r.ok) return;
            const payload = await r.json();

            const printer = await this._resolverImpresora();
            const cfg = qz.configs.create(printer, { encoding: 'CP858' });
            const data = this._buildReceiptData(payload);

            if (this._config.abrir_cajon_auto) data.push(this._cajonData());

            await qz.print(cfg, data);
        } catch (err) {
            console.warn('QZ: no se pudo imprimir el recibo', err);
        }
    },

    async abrirCajon() {
        if (typeof qz === 'undefined') {
            Swal?.fire('QZ Tray no disponible', 'Instala/abre QZ Tray en esta PC para usar el cajón.', 'warning');
            return;
        }
        const ok = await this.connect();
        if (!ok) {
            Swal?.fire('QZ Tray no disponible', 'No se pudo conectar con QZ Tray en esta PC.', 'warning');
            return;
        }
        try {
            const printer = await this._resolverImpresora();
            const cfg = qz.configs.create(printer);
            await qz.print(cfg, [this._cajonData()]);
        } catch (err) {
            console.warn('QZ: no se pudo abrir el cajón', err);
            Swal?.fire('Error', 'No se pudo abrir el cajón. Revisa la impresora/cajón conectados.', 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => POS_QZ.init());
