/**
 * Comportamiento del shell del panel superadmin: colapso de secciones,
 * sidebar en mobile (offcanvas) y filtro del buscador de navegación.
 * No depende de datos del servidor — archivo estático puro (cumple CSP script-src).
 */

document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    const sections = Array.from(sidebar.querySelectorAll('.admin-nav-section.collapsible'));

    // ─── Colapsar / expandir secciones ─────────────────────────────────────
    sections.forEach(function (section) {
        const toggle = section.querySelector('.admin-nav-section-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            section.classList.toggle('collapsed');
        });
    });

    // ─── Auto-expandir la sección de la página activa ──────────────────────
    const activeLink = sidebar.querySelector('.admin-nav-link.active');
    if (activeLink) {
        const parentSection = activeLink.closest('.admin-nav-section');
        if (parentSection) {
            parentSection.classList.remove('collapsed');
        }
    }

    // ─── Toggle mobile (offcanvas) ──────────────────────────────────────────
    const toggleBtn = document.getElementById('adminSidebarToggle');
    const closeBtn = document.getElementById('adminSidebarClose');
    const backdrop = document.getElementById('adminSidebarBackdrop');

    function openSidebar() {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    }

    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // ─── Accesos rápidos: el superadmin elige cuáles se muestran (pin) ─────
    // Se guarda por navegador. Sin configuración previa se muestran todos.
    const PINS_KEY = 'gf_admin_quicklinks';
    const cards = Array.from(sidebar.querySelectorAll('.admin-quicklink-card'));
    const pinButtons = Array.from(sidebar.querySelectorAll('.admin-nav-item'));
    const emptyHint = sidebar.querySelector('.admin-quicklinks-empty');
    const allKeys = cards.map(function (c) { return c.dataset.key; });

    function loadPins() {
        try {
            const raw = JSON.parse(localStorage.getItem(PINS_KEY));
            if (Array.isArray(raw)) return raw;
        } catch (e) { /* sin storage: se usan todos */ }
        return allKeys.slice();
    }
    function savePins(pins) {
        try { localStorage.setItem(PINS_KEY, JSON.stringify(pins)); } catch (e) { /* ignorar */ }
    }
    function renderPins(pins) {
        cards.forEach(function (c) { c.style.display = pins.includes(c.dataset.key) ? '' : 'none'; });
        pinButtons.forEach(function (li) {
            const on = pins.includes(li.dataset.key);
            const btn = li.querySelector('.admin-nav-pin');
            btn.classList.toggle('pinned', on);
            btn.title = on ? 'Quitar de accesos rápidos' : 'Fijar en accesos rápidos';
            btn.querySelector('i').className = 'bi ' + (on ? 'bi-pin-angle-fill' : 'bi-pin-angle');
        });
        const any = cards.some(function (c) { return pins.includes(c.dataset.key); });
        if (emptyHint) emptyHint.hidden = any;
    }
    pinButtons.forEach(function (li) {
        li.querySelector('.admin-nav-pin').addEventListener('click', function () {
            const pins = loadPins();
            const i = pins.indexOf(li.dataset.key);
            if (i === -1) pins.push(li.dataset.key); else pins.splice(i, 1);
            savePins(pins);
            renderPins(pins);
        });
    });
    renderPins(loadPins());

    // ─── Buscador: filtra los ítems del menú en vivo ───────────────────────
    const searchInput = document.getElementById('adminNavSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const term = searchInput.value.trim().toLowerCase();
            sections.concat(
                Array.from(sidebar.querySelectorAll('.admin-nav-section:not(.collapsible)'))
            ).forEach(function (section) {
                let sectionHasMatch = false;
                section.querySelectorAll('.admin-nav-list > li').forEach(function (li) {
                    const text = li.textContent.trim().toLowerCase();
                    const matches = !term || text.includes(term);
                    li.style.display = matches ? '' : 'none';
                    if (matches) sectionHasMatch = true;
                });
                section.style.display = sectionHasMatch ? '' : 'none';
                if (term && sectionHasMatch) {
                    section.classList.remove('collapsed');
                }
            });
        });
    }
});
