function verNotas(notas) {
    if (!notas || notas === 'null') {
        Swal.fire('Sin notas', 'No se registraron comentarios para este turno.', 'info');
        return;
    }
    Swal.fire({
        title: 'Notas del Turno',
        text: notas,
        icon: 'info',
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#6366f1'
    });
}
