const path = require('path');

// En despliegue normal, storage/job_results vive junto al código y es
// escribible. En el prototipo de escritorio (Electron) el código corre
// empaquetado dentro de app.asar, que es de solo lectura, así que
// electron/main.js exporta STORAGE_DIR apuntando a userData antes de
// arrancar server.js.
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const JOB_RESULTS_DIR = path.join(STORAGE_DIR, 'job_results');

module.exports = { STORAGE_DIR, JOB_RESULTS_DIR };
