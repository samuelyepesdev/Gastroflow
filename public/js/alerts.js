const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

function mostrarAlerta(mensaje, tipo = 'success') {
    Toast.fire({
        icon: tipo,
        title: mensaje,
        customClass: { popup: 'animate__animated animate__fadeInDown' }
    });
}

function confirmarAccion(titulo, mensaje) {
    return Swal.fire({
        title: titulo,
        text: mensaje,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'animate__animated animate__fadeInDown' }
    });
}

window.alert = function (mensaje) {
    mostrarAlerta(mensaje, 'warning');
};
