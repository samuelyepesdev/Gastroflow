const toggleBtn = document.getElementById('togglePwd');
const pwdInput = document.getElementById('password');
const toggleIcon = document.getElementById('togglePwdIcon');

toggleBtn.addEventListener('click', () => {
    const isHidden = pwdInput.type === 'password';
    pwdInput.type = isHidden ? 'text' : 'password';
    toggleIcon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
});

if (document.getElementById('mensajeTenant')) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
}

function showError(msg) {
    const box = document.getElementById('errorAlert');
    document.getElementById('errorMsg').textContent = msg;
    box.style.display = 'flex';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    document.getElementById('errorAlert').style.display = 'none';
}

function setLoading(loading) {
    const btn = document.getElementById('btnLogin');
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:1em;height:1em;border-width:2px;"></span> Verificando...';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Iniciar sesión';
    }
}

document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showError('Por favor completa todos los campos.');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al iniciar sesión');
        }

        if (data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }

        const rol = (data.user.rol || '').toString().toLowerCase();
        const isSuperadmin = rol === 'superadmin';

        Swal.fire({
            icon: 'success',
            title: `¡Hola, ${data.user.nombre_completo || data.user.username}!`,
            text: 'Acceso concedido. Redirigiendo...',
            timer: 1400,
            showConfirmButton: false
        }).then(() => {
            window.location.href = isSuperadmin ? '/admin/dashboard' : '/';
        });

    } catch (error) {
        showError(error.message);
        setLoading(false);
    }
});
