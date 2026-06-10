document.addEventListener('DOMContentLoaded', function () {
    const canvases = document.querySelectorAll('.qr-canvas');
    canvases.forEach(canvas => {
        const url = canvas.getAttribute('data-url');
        if (url) {
            new QRious({
                element: canvas,
                value: url,
                size: 300,
                level: 'H',
                background: 'white',
                foreground: 'black'
            });
        }
    });
});
