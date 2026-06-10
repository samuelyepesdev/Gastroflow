(function () {
    var form = document.getElementById('formCambiarPassword');
    var newP = document.getElementById('newPassword');
    var confirmP = document.getElementById('newPasswordConfirm');
    var msgNoCoincide = document.getElementById('msgNoCoincide');

    function checkMatch() {
        if (confirmP.value && newP.value !== confirmP.value) {
            msgNoCoincide.classList.remove('d-none');
            return false;
        }
        msgNoCoincide.classList.add('d-none');
        return true;
    }
    newP.addEventListener('input', checkMatch);
    confirmP.addEventListener('input', checkMatch);

    form.addEventListener('submit', function (e) {
        if (newP.value.length < 6) {
            e.preventDefault();
            if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'La nueva contraseña debe tener al menos 6 caracteres.' });
            return;
        }
        if (newP.value !== confirmP.value) {
            e.preventDefault();
            msgNoCoincide.classList.remove('d-none');
            if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'Las contraseñas no coinciden.' });
            return;
        }
    });
})();
