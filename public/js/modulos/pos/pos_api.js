// POS API — todas las llamadas HTTP del módulo POS

window.POS_API = {
    async getProductos() {
        const r = await fetch('/pos/productos');
        return r.ok ? r.json() : { productos: [], categorias: [] };
    },

    async getStats() {
        const r = await fetch('/pos/stats');
        return r.ok ? r.json() : { num_ordenes: 0, total_hoy: 0 };
    },

    async getBorradores() {
        const r = await fetch('/pos/borradores');
        return r.ok ? r.json() : [];
    },

    async saveBorrador(data) {
        const r = await fetch('/pos/borradores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || 'Error al guardar la orden');
        }
        return r.json();
    },

    async deleteBorrador(id) {
        const r = await fetch(`/pos/borradores/${id}`, { method: 'DELETE' });
        return r.ok;
    },

    async crearFactura(payload) {
        const r = await fetch('/api/facturas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error al generar la factura');
        return data;
    },

    async buscarCliente(q) {
        const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`);
        return r.ok ? r.json() : [];
    },

    async crearCliente(data) {
        const r = await fetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!r.ok) throw new Error('No se pudo crear el cliente');
        return r.json();
    },

    async getOrCreateConsumidorFinal() {
        const lista = await this.buscarCliente('consumidor final').catch(() => []);
        const cf = lista.find(c => c.nombre.toLowerCase() === 'consumidor final');
        if (cf) return cf;
        return this.crearCliente({ nombre: 'Consumidor final' }).catch(() => null);
    }
};
