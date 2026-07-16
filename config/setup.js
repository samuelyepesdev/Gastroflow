const fs = require('fs');
const path = require('path');
const { JOB_RESULTS_DIR } = require('./storage-paths');

const createRequiredDirectories = () => {
    const directories = [
        path.join(__dirname, '..', 'public'),
        path.join(__dirname, '..', 'public', 'uploads'),
        path.join(__dirname, '..', 'public', 'css'),
        path.join(__dirname, '..', 'public', 'js'),
        // Fuera de public/: resultados de job_queue (PDFs con datos sensibles) que solo
        // se sirven vía ruta autenticada, nunca por el static file server.
        JOB_RESULTS_DIR
    ];

    directories.forEach(dir => {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Directorio creado: ${dir}`);
            }
        } catch (err) {
            // En el prototipo de escritorio, public/ vive dentro de app.asar (solo lectura);
            // no hay nada que escribir ahí (multer usa memoryStorage), así que un fallo acá
            // no debe tumbar el arranque del servidor.
            console.warn(`No se pudo crear ${dir}: ${err.message}`);
        }
    });
};

module.exports = { createRequiredDirectories };
