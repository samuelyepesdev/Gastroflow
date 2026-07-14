/**
 * Helper compartido para encolar un job pesado (PDF con puppeteer) y esperar el
 * resultado sin bloquear el request: hace polling a /admin/jobs/:id y redirige a
 * /admin/jobs/:id/download cuando el worker (config/bootstrap.js, cada 15s) termina.
 */
function pollJobAndDownload(createJobUrl, options) {
    options = options || {};
    var onError = options.onError || function (msg) { window.alert(msg); };
    var onStart = options.onStart || function () {};
    var onDone = options.onDone || function () {};

    onStart();

    fetch(createJobUrl)
        .then(function (r) {
            return r.json().then(function (data) {
                return { ok: r.ok, data: data };
            });
        })
        .then(function (res) {
            if (!res.ok || !res.data.jobId) {
                throw new Error((res.data && res.data.error) || 'No se pudo iniciar la generación.');
            }
            poll(res.data.jobId);
        })
        .catch(function (err) {
            onDone();
            onError(err.message || 'Error al generar el archivo.');
        });

    function poll(jobId) {
        fetch('/admin/jobs/' + jobId)
            .then(function (r) { return r.json(); })
            .then(function (job) {
                if (job.estado === 'completado') {
                    onDone();
                    window.location.href = '/admin/jobs/' + jobId + '/download';
                } else if (job.estado === 'error') {
                    onDone();
                    onError(job.error || 'Error al generar el archivo.');
                } else {
                    setTimeout(function () { poll(jobId); }, 2000);
                }
            })
            .catch(function () {
                setTimeout(function () { poll(jobId); }, 3000);
            });
    }
}
