const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('node:crypto');
const { exigirMimeReal } = require('../../utils/validadorArchivos');
const db = require('../../config/database');

// Tablas/columnas que guardan URLs de archivos de R2. Antes de borrar un archivo hay que comprobar que
// ninguna lo siga usando (p. ej. un combo migrado comparte la imagen de su producto).
const COLUMNAS_CON_URL_R2 = [
    ['productos', 'imagen_url'],
    ['combos', 'imagen_url'],
    ['tenants', 'logo_url'],
    ['configuracion_impresion', 'logo_url'],
    ['bonos', 'imagen_url'],
    ['fidelizacion_programas', 'logo_url'],
    ['brochure_paginas', 'url']
];

// Solo se limpian carpetas cuyo ciclo de vida está cubierto por la comprobación de arriba.
const CARPETAS_LIMPIABLES = ['productos/', 'logos/', 'bonos/'];

class R2StorageService {
    constructor() {
        this.accountId = process.env.R2_ACCOUNT_ID;
        this.accessKeyId = process.env.R2_ACCESS_KEY_ID;
        this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        this.bucketName = process.env.R2_BUCKET_NAME;
        this.publicUrl = process.env.R2_PUBLIC_URL;

        if (this.accountId && this.accessKeyId && this.secretAccessKey) {
            this.s3Client = new S3Client({
                region: 'auto',
                endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: this.accessKeyId,
                    secretAccessKey: this.secretAccessKey
                }
            });
        }
    }

    /**
     * Upload file to Cloudflare R2
     * @param {Buffer} fileBuffer - File content in buffer
     * @param {string} originalName - Original file name
     * @param {string} mimeType - File mime type
     * @param {string} folder - Carpeta/prefijo destino dentro del bucket (ej. 'productos', 'logos')
     * @returns {Promise<string|null>} - Returns public URL of uploaded file
     */
    async uploadFile(fileBuffer, originalName, mimeType, folder = 'productos') {
        if (!this.s3Client) {
            throw new Error('Las credenciales de Cloudflare R2 no están configuradas correctamente.');
        }

        // Tipo y extensión salen del contenido real: ni originalName ni mimeType (del cliente) se usan.
        const tipo = exigirMimeReal(fileBuffer);
        mimeType = tipo.mime;
        const fileName = `${folder}/${Date.now()}-${crypto.randomUUID()}${tipo.ext}`;

        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
                Body: fileBuffer,
                ContentType: mimeType
            });

            await this.s3Client.send(command);

            const basePublicUrl = this.publicUrl.endsWith('/') ? this.publicUrl : this.publicUrl + '/';
            return `${basePublicUrl}${fileName}`;
        } catch (error) {
            console.error('Error al subir archivo a R2:', error);
            throw new Error('No se pudo subir la imagen al servidor de almacenamiento', { cause: error });
        }
    }

    /**
     * Borra un archivo SOLO si ya nadie lo referencia. Llamar DESPUÉS de guardar en la BD el valor nuevo
     * (la fila que lo reemplazó ya no apunta al archivo viejo). Nunca lanza: es limpieza best-effort y no
     * debe tumbar el guardado; si algo falla, el archivo queda (el costo es un huérfano, no un dato perdido).
     * No borra archivos que no estén en este bucket ni fuera de las carpetas limpiables, y si la
     * comprobación de referencias falla, NO borra.
     * @returns {Promise<boolean>} true si se borró
     */
    async eliminarSiHuerfano(url) {
        try {
            if (!this.s3Client || !this.publicUrl || !url || typeof url !== 'string') {
                return false;
            }
            const base = this.publicUrl.endsWith('/') ? this.publicUrl : this.publicUrl + '/';
            if (!url.startsWith(base)) {
                return false;
            }
            const clave = url.slice(base.length);
            if (!CARPETAS_LIMPIABLES.some(c => clave.startsWith(c)) || clave.includes('..')) {
                return false;
            }
            for (const [tabla, columna] of COLUMNAS_CON_URL_R2) {
                const [filas] = await db.query(`SELECT 1 FROM ${tabla} WHERE ${columna} = ? LIMIT 1`, [url]);
                if (filas.length > 0) {
                    return false;
                }
            }
            await this.deleteFile(url);
            return true;
        } catch (error) {
            console.error('No se pudo limpiar un archivo huérfano de R2:', error.message);
            return false;
        }
    }

    /**
     * Borra un archivo a partir de su URL pública. Ignora URLs que no son de este bucket.
     */
    async deleteFile(url) {
        if (!this.s3Client || !this.publicUrl || !url) {
            return;
        }
        const base = this.publicUrl.endsWith('/') ? this.publicUrl : this.publicUrl + '/';
        if (!url.startsWith(base)) {
            return;
        }
        await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: url.slice(base.length) }));
    }
}

module.exports = new R2StorageService();
