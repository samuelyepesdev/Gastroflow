function previewImage(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            const plc = document.getElementById('previewLogoPlaceholder');
            if (plc) plc.classList.add('d-none');
            const img = document.getElementById('previewLogo');
            img.src = e.target.result;
            img.classList.remove('d-none');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function setTemplate(nav, text, pri, sec, cPri, cSec, mLibre, mOcupada) {
    mLibre = mLibre || '#22c55e';
    mOcupada = mOcupada || '#f59e0b';
    document.getElementById('colorNavbar').value = nav;
    document.getElementById('colorNavbarText').value = text;
    document.getElementById('colorPrimary').value = pri;
    document.getElementById('colorSecondary').value = sec;
    document.getElementById('colorCardPrimary').value = cPri;
    document.getElementById('colorCardSecondary').value = cSec;
    document.getElementById('colorMesaLibre').value = mLibre;
    document.getElementById('colorMesaOcupada').value = mOcupada;
}

document.getElementById('perfilForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const btn = document.getElementById('btnGuardar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
    btn.disabled = true;

    const fd = new FormData();
    fd.append('nombre', document.getElementById('nombre').value);
    fd.append('direccion', document.getElementById('direccion').value);
    fd.append('telefono', document.getElementById('telefono').value);
    fd.append('email', document.getElementById('email').value);
    fd.append('colores', JSON.stringify({
        navbar: document.getElementById('colorNavbar').value,
        navbarText: document.getElementById('colorNavbarText').value,
        primary: document.getElementById('colorPrimary').value,
        secondary: document.getElementById('colorSecondary').value,
        cardPrimary: document.getElementById('colorCardPrimary').value,
        cardSecondary: document.getElementById('colorCardSecondary').value,
        mesaLibre: document.getElementById('colorMesaLibre').value,
        mesaOcupada: document.getElementById('colorMesaOcupada').value
    }));
    const logoInput = document.getElementById('logo');
    if (logoInput && logoInput.files.length > 0) {
        fd.append('logo', logoInput.files[0]);
    }

    try {
        const response = await fetch('/perfil/actualizar', {
            method: 'POST',
            body: fd
        });

        const result = await response.json();

        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Actualizado!',
                text: result.message,
                timer: 2500,
                showConfirmButton: false
            }).then(() => {
                window.location.reload();
            });
        } else {
            throw new Error(result.message || 'Error al guardar');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

async function testReport() {
    const btn = event ? event.currentTarget : document.querySelector('button[onclick="testReport()"]');
    const originalHtml = btn.innerHTML;

    const mes = document.getElementById('reportMonth').value;
    const anio = document.getElementById('reportYear').value;

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando...';
    btn.disabled = true;

    try {
        const response = await fetch('/perfil/test-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mes, anio })
        });
        const result = await response.json();

        if (result.success) {
            if (result.pdfBase64) {
                const blob = b64toBlob(result.pdfBase64, 'application/pdf');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.fileName || 'Reporte_Mensual.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            Swal.fire({
                icon: 'success',
                title: '¡Enviado!',
                text: result.message
            });
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Atención',
                text: result.message
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'No se pudo enviar',
            text: error.message
        });
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function b64toBlob(b64Data, contentType, sliceSize) {
    contentType = contentType || '';
    sliceSize = sliceSize || 512;
    const cleanB64 = b64Data.replace(/\s/g, '');
    const byteCharacters = atob(cleanB64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
}
