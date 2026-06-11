require('./utils/patchExcelJS');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const packageJson = require('./package.json');
const { optionalAuth } = require('./middleware/auth');
const PlanService = require('./services/Admin/PlanService');
const navbarLocals = require('./middleware/navbarLocals');
const webRoutes = require('./routes/web');

const app = express();

// Confíe en el primer proxy (necesario para express-rate-limit detrás de proxies como Nginx o Cloudflare)
app.set('trust proxy', 1);

// Configuración de Vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Compresión gzip/brotli para todas las respuestas
app.use(compression());

// Middlewares Base
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const idempotency = require('./middleware/idempotency');
app.use(idempotency);

// Route specifically for sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'gatroflow.digital';
    const domain = `${protocol}://${host}`;

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${domain}/</loc>
        <lastmod>2026-05-04</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${domain}/auth/login</loc>
        <lastmod>2026-05-04</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
    </url>
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

// Seguridad: Rate Limit General
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Demasiadas peticiones desde esta IP, por favor intente más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// Middleware de Seguridad: Bloquear escaneos maliciosos (.env, .git, .php, etc)
app.use((req, res, next) => {
    const maliciousPatterns = [
        /^\/\.env/i,
        /^\/\.git/i,
        /\.php$/i,
        /\.jsp$/i,
        /\.asp$/i,
        /wp-admin/i,
        /wp-content/i,
        /wp-includes/i,
        /wlwmanifest\.xml/i,
        /vendor/i,
        /composer\.json/i,
        /package\.json/i,
        /\.bak$/i,
        /\.sql$/i
    ];

    const isMalicious = maliciousPatterns.some(pattern => pattern.test(req.path));

    if (isMalicious) {
        // Enviamos 403 y terminamos la petición sin pasar al log de 404
        return res.status(403).send('Forbidden: Access Denied');
    }
    next();
});

// Headers de seguridad y CORS estricto
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.tailwindcss.com",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
        "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://cdn.jsdelivr.net",
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    const allowedOrigin = process.env.APP_URL || process.env.FRONTEND_URL || '';
    if (allowedOrigin && req.headers.origin === allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, idempotency-key, Idempotency-Key');
    next();
});

// Middleware Condicional para Dropdown Navbar
app.use(optionalAuth);
app.use(async (req, res, next) => {
    try {
        res.locals.plans = req.user ? await PlanService.getAll() : [];
    } catch (_) {
        res.locals.plans = [];
    }
    next();
});
app.use(navbarLocals);

// Registrar versión global en vistas para cache-busting opcional
app.use((req, res, next) => {
    res.locals.version = packageJson.version || '1.0.0';
    next();
});

// Archivos estáticos con revalidación forzada mediante ETags
const staticOpts = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res, path) => {
        if (process.env.NODE_ENV === 'production') {
            // El navegador almacena en caché pero DEBE revalidar con el servidor (ETag) antes de usar el archivo.
            // Si el archivo cambió en producción (nuevo despliegue), se sirve el nuevo. Si no, devuelve 304 rápido.
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }
    }
};
app.use('/static', express.static(path.join(__dirname, 'public'), staticOpts));
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

// Favicon
const faviconPath = path.join(__dirname, 'public', 'logo.png');
app.get('/favicon.ico', (req, res) => {
    if (fs.existsSync(faviconPath)) {
        res.type('image/png').sendFile(faviconPath);
    } else {
        res.status(204).end();
    }
});

// Rutas de aplicación
app.use('/', webRoutes);

// Manejo de errores 404
app.use((req, res, next) => {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(404).json({ error: 'Ruta no encontrada' });
    } else {
        res.status(404).render('errors/404');
    }
});

// Sentry — captura errores antes del handler personalizado
if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    Sentry.setupExpressErrorHandler(app);
}

// Manejo de Errores Global (500)
app.use((err, req, res, next) => {
    const logger = require('./utils/logger');
    logger.error('Error en la aplicación', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(500).json({
            error: 'Error interno del servidor',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
        });
    } else {
        res.status(500).render('errors/internal', {
            error: {
                message: 'Error interno del servidor',
                stack: process.env.NODE_ENV === 'development' ? err.stack : ''
            }
        });
    }
});

module.exports = app;
