const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

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

        const ext = path.extname(originalName) || '.jpg';
        const fileName = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`;

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
}

module.exports = new R2StorageService();
