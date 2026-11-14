const { conBloqueoDeMigraciones, NOMBRE_BLOQUEO } = require('../../../scripts/lib/migrationLock');

function crearDb(resultadoLock = 1) {
    const conexion = {
        query: jest.fn(async sql => (/GET_LOCK/.test(sql) ? [[{ tomado: resultadoLock }]] : [[{}]])),
        release: jest.fn()
    };
    return { db: { getConnection: jest.fn().mockResolvedValue(conexion) }, conexion };
}

describe('conBloqueoDeMigraciones', () => {
    test('toma el bloqueo, ejecuta, lo libera y devuelve el resultado', async () => {
        const { db, conexion } = crearDb(1);
        const fn = jest.fn().mockResolvedValue('listo');
        await expect(conBloqueoDeMigraciones(db, fn, { timeoutSegundos: 30 })).resolves.toBe('listo');

        expect(conexion.query).toHaveBeenNthCalledWith(1, 'SELECT GET_LOCK(?, ?) AS tomado', [NOMBRE_BLOQUEO, 30]);
        expect(conexion.query).toHaveBeenNthCalledWith(2, 'SELECT RELEASE_LOCK(?)', [NOMBRE_BLOQUEO]);
        expect(conexion.release).toHaveBeenCalledTimes(1);
        // el bloqueo se toma ANTES de migrar
        expect(conexion.query.mock.invocationCallOrder[0]).toBeLessThan(fn.mock.invocationCallOrder[0]);
    });

    test('si no consigue el bloqueo a tiempo falla SIN migrar y sin intentar liberarlo', async () => {
        const { db, conexion } = crearDb(0);
        const fn = jest.fn();
        await expect(conBloqueoDeMigraciones(db, fn, { timeoutSegundos: 5 })).rejects.toThrow(
            /otra instancia sigue migrando/
        );
        expect(fn).not.toHaveBeenCalled();
        expect(conexion.query.mock.calls.some(([sql]) => /RELEASE_LOCK/.test(sql))).toBe(false);
        expect(conexion.release).toHaveBeenCalledTimes(1);
    });

    test('si la migración falla libera el bloqueo y propaga el error', async () => {
        const { db, conexion } = crearDb(1);
        await expect(
            conBloqueoDeMigraciones(db, async () => {
                throw new Error('sql roto');
            })
        ).rejects.toThrow('sql roto');
        expect(conexion.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [NOMBRE_BLOQUEO]);
        expect(conexion.release).toHaveBeenCalledTimes(1);
    });

    test('un fallo al liberar no oculta el resultado ni deja la conexión sin devolver', async () => {
        const { db, conexion } = crearDb(1);
        conexion.query.mockImplementation(async sql => {
            if (/RELEASE_LOCK/.test(sql)) {
                throw new Error('conexión perdida');
            }
            return [[{ tomado: 1 }]];
        });
        await expect(conBloqueoDeMigraciones(db, async () => 'ok')).resolves.toBe('ok');
        expect(conexion.release).toHaveBeenCalledTimes(1);
    });
});
