/**
 * Bloqueo de migraciones entre procesos/instancias.
 *
 * `npm start` migra al arrancar. Con 2 instancias levantando a la vez (despliegue con réplicas, reinicio
 * simultáneo) ambas leían "migración pendiente" y la ejecutaban a la vez: sentencias duplicadas, DDL
 * cruzado o una migración a medias. GET_LOCK es un bloqueo nombrado del servidor MySQL/MariaDB: dura lo que
 * la CONEXIÓN que lo toma, así que se reserva una conexión dedicada mientras corre `fn`. La segunda
 * instancia espera hasta `timeoutSegundos`; cuando por fin entra, las migraciones ya están registradas en
 * schema_migrations y las salta todas.
 */

const NOMBRE_BLOQUEO = 'gastroflow_migrations';
const TIMEOUT_SEGUNDOS_POR_DEFECTO = 300;

/**
 * Ejecuta `fn` con el bloqueo tomado y lo libera siempre (incluso si `fn` lanza).
 * @param {{getConnection: Function}} db - pool mysql2/promise
 * @param {() => Promise<any>} fn
 * @param {{timeoutSegundos?: number, log?: Function}} [opciones]
 */
async function conBloqueoDeMigraciones(
    db,
    fn,
    { timeoutSegundos = TIMEOUT_SEGUNDOS_POR_DEFECTO, log = () => {} } = {}
) {
    const conexion = await db.getConnection();
    let tomado = false;
    try {
        log(`Esperando el bloqueo de migraciones (máx ${timeoutSegundos}s)...`);
        const [filas] = await conexion.query('SELECT GET_LOCK(?, ?) AS tomado', [NOMBRE_BLOQUEO, timeoutSegundos]);
        tomado = Number(filas?.[0]?.tomado) === 1;
        if (!tomado) {
            throw new Error(
                `No se pudo obtener el bloqueo de migraciones en ${timeoutSegundos}s: otra instancia sigue migrando.`
            );
        }
        log('Bloqueo de migraciones tomado');
        return await fn();
    } finally {
        if (tomado) {
            try {
                await conexion.query('SELECT RELEASE_LOCK(?)', [NOMBRE_BLOQUEO]);
            } catch (_) {
                // Si falla, el bloqueo se libera igual al cerrarse la conexión/proceso.
            }
        }
        conexion.release();
    }
}

module.exports = { conBloqueoDeMigraciones, NOMBRE_BLOQUEO, TIMEOUT_SEGUNDOS_POR_DEFECTO };
