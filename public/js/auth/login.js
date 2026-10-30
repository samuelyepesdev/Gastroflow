const toggleBtn = document.getElementById('togglePwd');
const pwdInput = document.getElementById('password');
const toggleIcon = document.getElementById('togglePwdIcon');

toggleBtn.addEventListener('click', () => {
    const isHidden = pwdInput.type === 'password';
    pwdInput.type = isHidden ? 'text' : 'password';
    toggleIcon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
});

// Tokens que versiones anteriores guardaban en localStorage: se borran siempre.
localStorage.removeItem('auth_token');
localStorage.removeItem('user');

// Nueva sesión: los anuncios "cada vez que inicien sesión" deben poder volver a salir.
try {
    sessionStorage.removeItem('gf_anuncios_vistos');
} catch (e) {
    /* sin sessionStorage: no pasa nada */
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
    GF.cargando(document.getElementById('btnLogin'), loading, 'Verificando...');
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
        const data = await GF.api('/auth/login', {
            method: 'POST',
            body: { username, password }
        }, 'Error al iniciar sesión');

        // La sesión va en la cookie httpOnly que pone el servidor. El token ya no
        // se guarda en localStorage: nada lo lee y ahí quedaba expuesto a cualquier
        // script inyectado (XSS). Al cargar esta página se limpian los que quedaron.
        const rol = (data.user.rol || '').toString().toLowerCase();
        const isSuperadmin = rol === 'superadmin';

        mostrarBienvenida(
            data.user.nombre_completo || data.user.username,
            isSuperadmin ? '/admin/dashboard' : '/'
        );

    } catch (error) {
        showError(error.message);
        setLoading(false);
    }
});

// Pantalla de bienvenida con la animación de marca. Redirige al terminar de armarse el logo
// (~2 s), con clic para saltarla y sin video si el usuario pidió menos movimiento.
function mostrarBienvenida(nombre, destino) {
    const capa = document.getElementById('bienvenida');
    const video = document.getElementById('bienvenidaVideo');
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ido = false;
    const ir = () => {
        if (ido) return;
        ido = true;
        window.location.href = destino;
    };

    if (!capa) {
        ir();
        return;
    }
    document.getElementById('bienvenidaSaludo').textContent = `¡Hola, ${nombre}!`;
    capa.hidden = false;
    capa.addEventListener('click', ir);
    if (!reducido && video) {
        video.play().catch(() => {});
    }
    setTimeout(ir, reducido ? 900 : 2600);
}
