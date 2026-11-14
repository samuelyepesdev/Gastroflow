/** Escapa texto no confiable antes de interpolarlo en HTML (correos, vistas armadas a mano). */
const REEMPLAZOS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(valor) {
    return String(valor === null || valor === undefined ? '' : valor).replace(/[&<>"']/g, c => REEMPLAZOS[c]);
}

module.exports = { escapeHtml };
