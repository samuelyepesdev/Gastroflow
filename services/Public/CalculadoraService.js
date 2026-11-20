/**
 * CalculadoraService - Calculadora pública "¿cuánto pierdes al mes?".
 *
 * Es el gancho de la landing: el dueño ingresa sus cifras y deja su contacto para ver el resultado.
 * El cálculo vive SOLO aquí (el navegador no lo duplica) para que una sola fuente defina las cifras.
 * Las proporciones de recuperación son una estimación orientativa y se muestran como tal.
 */
const CalculadoraRepository = require('../../repositories/Public/CalculadoraRepository');
const { normalizarTelefono } = require('../Tenant/ReservaService');
const { ValidationError } = require('../../utils/errors');

const SEMANAS_POR_MES = 4.33;
// Parte de cada pérdida que un restaurante suele recuperar con recordatorios y control de inventario.
const RECUPERA_NO_SHOW = 0.4;
const RECUPERA_MERMA = 0.3;

const CAMPOS = {
    reservas_semana: { min: 0, max: 5000, mensaje: 'Las reservas por semana deben estar entre 0 y 5.000' },
    personas_reserva: { min: 1, max: 30, mensaje: 'Las personas por reserva deben estar entre 1 y 30' },
    ticket_persona: { min: 1000, max: 2000000, mensaje: 'El gasto por persona debe estar entre $ 1.000 y $ 2.000.000' },
    no_show_pct: { min: 0, max: 80, mensaje: 'El porcentaje de reservas que no llegan debe estar entre 0 y 80' },
    ventas_mes: { min: 0, max: 20000000000, mensaje: 'Las ventas del mes deben estar entre 0 y 20.000.000.000' },
    merma_pct: { min: 0, max: 40, mensaje: 'El porcentaje de merma debe estar entre 0 y 40' }
};

function numeroEnRango(valor, { min, max, mensaje }) {
    // Solo enteros sin separadores: "45.000" sería 45, así que el navegador envía dígitos puros y aquí se rechaza lo demás.
    const texto = String(valor ?? '').trim();
    const n = /^\d+$/.test(texto) ? Number(texto) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new ValidationError(mensaje, 'CALCULADORA_ENTRADA_INVALIDA');
    }
    return n;
}

function validarEntradas(body = {}) {
    const entradas = {};
    for (const [campo, regla] of Object.entries(CAMPOS)) {
        entradas[campo] = numeroEnRango(body[campo], regla);
    }
    return entradas;
}

/** Cálculo puro: pesos colombianos redondeados, sin tocar la base de datos. */
function calcular(entradas) {
    const noShow = Math.round(
        entradas.reservas_semana * SEMANAS_POR_MES * entradas.personas_reserva * entradas.ticket_persona * (entradas.no_show_pct / 100)
    );
    const merma = Math.round(entradas.ventas_mes * (entradas.merma_pct / 100));
    const perdidaMes = noShow + merma;
    const recuperableMes = Math.round(noShow * RECUPERA_NO_SHOW + merma * RECUPERA_MERMA);
    return {
        no_show_mes: noShow,
        merma_mes: merma,
        perdida_mes: perdidaMes,
        perdida_anio: perdidaMes * 12,
        recuperable_mes: recuperableMes,
        recuperable_anio: recuperableMes * 12
    };
}

function validarContacto(body = {}) {
    const restaurante = String(body.restaurante ?? '').trim();
    if (restaurante.length < 2 || restaurante.length > 80) {
        throw new ValidationError('Escribe el nombre de tu restaurante', 'CALCULADORA_RESTAURANTE_INVALIDO');
    }
    const telefono = normalizarTelefono(body.telefono);
    if (!telefono) {
        throw new ValidationError('Escribe un celular colombiano válido de 10 dígitos', 'CALCULADORA_TELEFONO_INVALIDO');
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw new ValidationError('El correo no es válido', 'CALCULADORA_EMAIL_INVALIDO');
    }
    if (body.consentimiento !== true && body.consentimiento !== '1') {
        throw new ValidationError('Debes autorizar el uso de tus datos para ver el resultado', 'CALCULADORA_SIN_CONSENTIMIENTO');
    }
    return { restaurante, telefono, email: email || null };
}

class CalculadoraService {
    /** Valida, calcula, guarda el prospecto y devuelve el resultado. Nada se guarda si algo es inválido. */
    static async calcularYRegistrar(body, ip) {
        const entradas = validarEntradas(body);
        const contacto = validarContacto(body);
        const resultado = calcular(entradas);

        await CalculadoraRepository.crear({
            ...contacto,
            entradas,
            perdida_mes: resultado.perdida_mes,
            recuperable_mes: resultado.recuperable_mes,
            consentimiento_at: new Date(),
            consentimiento_ip: String(ip || '').slice(0, 45) || null
        });
        return resultado;
    }

    static async listar() {
        return CalculadoraRepository.listar();
    }

    static async marcarContactado(id, contactado) {
        return CalculadoraRepository.setContactado(id, contactado);
    }
}

module.exports = CalculadoraService;
module.exports.calcular = calcular;
module.exports.validarEntradas = validarEntradas;
module.exports.validarContacto = validarContacto;
module.exports.RECUPERA_NO_SHOW = RECUPERA_NO_SHOW;
module.exports.RECUPERA_MERMA = RECUPERA_MERMA;
