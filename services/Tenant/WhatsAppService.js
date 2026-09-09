const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('../../config/database');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// Flags de Chromium para bajar RAM. Este navegador vive horas (no es de un solo
// uso como el de los PDF), así que NO se usa `--single-process` -- da cierres
// inesperados con whatsapp-web.js. `--disable-dev-shm-usage` es lo más
// importante en contenedores chicos: sin él, /dev/shm (64 MB) se llena y
// Chromium empuja a swap o muere por OOM.
const WA_CHROMIUM_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-zygote',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=site-per-process',
    '--renderer-process-limit=1',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--mute-audio',
    '--no-first-run',
    '--js-flags=--max-old-space-size=256'
];

class WhatsAppService {
    constructor() {
        this.clients = new Map(); // client_id -> WhatsApp Client
        this.qrCodes = new Map(); // tenant_id -> QR Base64
        this.initializing = new Set(); // tenant_id -> boolean
        this.events = new EventEmitter();
        // Hub global de SSE: cada pantalla conectada (cocina, mesas, POS, dashboard) de
        // cualquier tenant engancha un listener 'orderCreated' aquí (ver NotificationController).
        // Con varios tenants y pantallas abiertas a la vez se supera fácil el límite por
        // defecto de Node (10) sin que sea una fuga real -- se sube para evitar el warning.
        this.events.setMaxListeners(100);
    }

    /**
     * Inicializa un cliente para un tenant específico
     */
    async initializeClient(tenantId, phoneNumber = null) {
        if (this.clients.has(tenantId) || this.initializing.has(tenantId)) {
            console.log(`[WhatsApp] Init omitido para Tenant ${tenantId} (Ya en proceso o conectado)`);
            return;
        }
        this.initializing.add(tenantId);

        console.log(
            `[WhatsApp] Inicializando cliente para Tenant ${tenantId} ${phoneNumber ? '(Con código)' : '(Con QR)'}`
        );

        // Actualizar estado inmediatamente a esperando_qr
        await db.query(
            'UPDATE whatsapp_configs SET estado = ?, last_qr = NULL, last_pairing_code = NULL WHERE tenant_id = ?',
            ['esperando_qr', tenantId]
        );

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: `tenant_${tenantId}`,
                dataPath: path.join(__dirname, '../../.wwebjs_auth')
            }),
            puppeteer: {
                headless: true,
                args: WA_CHROMIUM_ARGS
            }
        });

        let codeSent = false;
        client.on('qr', async qr => {
            console.log(`[WhatsApp] QR recibido para Tenant ${tenantId}`);
            const qrBase64 = await qrcode.toDataURL(qr);
            this.qrCodes.set(tenantId, qrBase64);

            await db.query('UPDATE whatsapp_configs SET estado = ?, last_qr = ? WHERE tenant_id = ?', [
                'esperando_qr',
                qrBase64,
                tenantId
            ]);

            // Si el usuario pidió código de emparejamiento, lo solicitamos una sola vez cuando el QR esté listo
            if (phoneNumber && !codeSent) {
                codeSent = true;
                const num = phoneNumber.replace(/\D/g, '');

                // Aumentamos el retraso a 15 segundos para dar tiempo a que Puppeteer inyecte los scripts necesarios
                setTimeout(async () => {
                    try {
                        console.log(`[WhatsApp] Solicitando Pairing Code para ${num} (Intento 1)...`);
                        const code = await client.requestPairingCode(num);
                        console.log(`[WhatsApp] Pairing Code para ${tenantId}: ${code}`);
                        await db.query('UPDATE whatsapp_configs SET last_pairing_code = ? WHERE tenant_id = ?', [
                            code,
                            tenantId
                        ]);
                    } catch (err) {
                        console.error('[WhatsApp] Error en Intento 1 de Pairing Code:', err.message);
                        // Reintento rápido después de 5 segundos si falló por carga
                        setTimeout(async () => {
                            try {
                                console.log(`[WhatsApp] Reintentando Pairing Code para ${num}...`);
                                const code = await client.requestPairingCode(num);
                                await db.query(
                                    'UPDATE whatsapp_configs SET last_pairing_code = ? WHERE tenant_id = ?',
                                    [code, tenantId]
                                );
                            } catch (err2) {
                                console.error('[WhatsApp] Error definitivo en Pairing Code:', err2.message);
                                // No bloqueamos codeSent para que el usuario pueda intentar de nuevo si refresca
                                codeSent = false;
                            }
                        }, 5000);
                    }
                }, 15000);
            }
        });

        client.on('ready', async () => {
            console.log(`[WhatsApp] Cliente listo para Tenant ${tenantId}`);
            this.qrCodes.delete(tenantId);
            this.clients.set(tenantId, client);
            this.initializing.delete(tenantId);

            await db.query(
                'UPDATE whatsapp_configs SET estado = ?, last_qr = NULL, last_pairing_code = NULL WHERE tenant_id = ?',
                ['conectado', tenantId]
            );
        });

        client.on('disconnected', async reason => {
            console.log(`[WhatsApp] Cliente desconectado para Tenant ${tenantId}: ${reason}`);
            this.clients.delete(tenantId);
            await db.query(
                'UPDATE whatsapp_configs SET estado = ?, last_qr = NULL, last_pairing_code = NULL WHERE tenant_id = ?',
                ['desconectado', tenantId]
            );
        });

        client.on('message', async msg => {
            try {
                await this.handleIncomingMessage(tenantId, msg);
            } catch (error) {
                console.error(`[WhatsApp] Error procesando mensaje para Tenant ${tenantId}:`, error);
            }
        });

        try {
            await client.initialize();
        } catch (error) {
            console.error(`[WhatsApp] Error inicializando cliente para Tenant ${tenantId}:`, error);
            this.initializing.delete(tenantId);

            await db.query(
                'UPDATE whatsapp_configs SET estado = ?, last_qr = NULL, last_pairing_code = NULL WHERE tenant_id = ?',
                ['desconectado', tenantId]
            );
        }
    }

    /**
     * Lógica del Bot
     */
    async handleIncomingMessage(tenantId, msg) {
        const from = msg.from; // Teléfono del cliente

        // 1. FILTROS DE SEGURIDAD (Ignorar basura, estados, grupos y bots)
        if (from.includes('@broadcast') || from.includes('@lid') || from.endsWith('@g.us')) {
            return; // Silencio total para estados, listas de difusión y grupos
        }

        const rawBody = msg.body || '';
        const body = rawBody
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
            .replace(/\.$/, '');

        if (!body || body.length === 0) {
            return; // No responder a mensajes vacíos (stickers, señales internas, etc)
        }

        // Solo logueamos si pasó los filtros iniciales
        console.log(`[WhatsApp] Mensaje RECIBIDO de ${from} (Tenant ${tenantId}): "${msg.body}"`);

        // 1. Obtener Configuración y Conversación
        const [configRows] = await db.query(
            'SELECT mensaje_bienvenida, mensaje_transferencia FROM whatsapp_configs WHERE tenant_id = ?',
            [tenantId]
        );
        const config = configRows[0];
        const welcomeMsg = config?.mensaje_bienvenida || '¡Hola! 👋 Bienvenido.\nEscribe *MENU* para empezar.';
        const transferMsg =
            config?.mensaje_transferencia ||
            '📲 *Datos de Transferencia:*\n- Valor a transferir: *${total}*\n\n*Por favor envía el comprobante por este medio.*';

        const [convRows] = await db.query(
            'SELECT * FROM whatsapp_conversations WHERE tenant_id = ? AND customer_phone = ?',
            [tenantId, from]
        );

        let conversation = convRows[0];
        if (!conversation) {
            await db.query(
                'INSERT INTO whatsapp_conversations (tenant_id, customer_phone, current_state) VALUES (?, ?, ?)',
                [tenantId, from, 'welcome']
            );
            conversation = { current_state: 'welcome' };
        }

        // 2. Comandos globales (Reset / Cancel)
        if (body === 'menu' || body === 'hola' || body === 'inicio') {
            // Conversación nueva: el saludo del cliente ("hola") no debe robarle el
            // mensaje de bienvenida al atajo global de "ir directo al catálogo".
            if (conversation.current_state === 'welcome') {
                await msg.reply(welcomeMsg);
            }
            await this.updateConversationState(tenantId, from, 'selecting_category');
            await this.sendCategories(tenantId, msg);
            return;
        }

        if (body === 'cancelar') {
            // 1. Limpiar estado de conversación actual (carrito pendiente)
            await db.query(
                'UPDATE whatsapp_conversations SET current_state = "welcome", pending_order_data = NULL WHERE tenant_id = ? AND customer_phone = ?',
                [tenantId, from]
            );

            // 2. Intentar buscar un pedido ACTIVO que se haya hecho recientemente desde este número
            // Buscamos por la mesa virtual asociada a este número
            const tableNumber = `WA-${from.substring(from.length - 4)}`;
            const [activeOrders] = await db.query(
                `SELECT p.id, p.mesa_id, p.estado 
                 FROM pedidos p 
                 JOIN mesas m ON p.mesa_id = m.id 
                 WHERE p.tenant_id = ? AND m.numero = ? AND p.estado NOT IN ('cerrado', 'cancelado')
                 ORDER BY p.created_at DESC LIMIT 1`,
                [tenantId, tableNumber]
            );

            if (activeOrders.length > 0) {
                const pedido = activeOrders[0];

                // Cancelar el pedido y sus items
                await db.query('UPDATE pedidos SET estado = "cancelado" WHERE id = ?', [pedido.id]);
                await db.query('UPDATE pedido_items SET estado = "cancelado" WHERE pedido_id = ?', [pedido.id]);

                // Liberar la mesa virtual
                await db.query('UPDATE mesas SET estado = "libre", descripcion = NULL WHERE id = ?', [pedido.mesa_id]);

                console.log(`[WhatsApp] PEDIDO #${pedido.id} CANCELADO por el cliente ${from}`);

                // Notificar a cocina/mesas vía SSE para que desaparezca de las pantallas
                this.events.emit('orderCreated', {
                    tenantId,
                    pedidoId: pedido.id,
                    mesaId: pedido.mesa_id,
                    action: 'cancelled'
                });

                await msg.reply(
                    'Tu pedido activo ha sido cancelado. Si ya estaba en preparación, el personal ha sido notificado. 👋'
                );
            } else {
                await msg.reply('Pedido (carrito) cancelado. Escribe *HOLA* para empezar de nuevo.');
            }
            return;
        }

        // 3. Manejar estados
        switch (conversation.current_state) {
            case 'welcome':
                await msg.reply(welcomeMsg);
                await this.updateConversationState(tenantId, from, 'selecting_category');
                break;

            case 'selecting_category': {
                const [cats] = await db.query('SELECT id, nombre FROM categorias WHERE tenant_id = ? AND activa = 1', [
                    tenantId
                ]);

                const catIdx = parseInt(body) - 1;

                if (!isNaN(catIdx) && catIdx >= 0 && catIdx < cats.length) {
                    const selectedCat = cats[catIdx];

                    // Guardar categoría elegida en pending_order_data temporalmente
                    let cartData = conversation.pending_order_data || {};
                    if (typeof cartData === 'string') {
                        cartData = JSON.parse(cartData);
                    }
                    cartData.selected_category_id = selectedCat.id;

                    await db.query(
                        'UPDATE whatsapp_conversations SET current_state = "browsing_menu", pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                        [JSON.stringify(cartData), tenantId, from]
                    );

                    await this.sendProductsByCategory(tenantId, msg, selectedCat.id, selectedCat.nombre);
                } else {
                    await msg.reply('Por favor, elige un número de categoría válido.');
                    await this.sendCategories(tenantId, msg);
                }
                break;
            }

            case 'browsing_menu': {
                let cartData = conversation.pending_order_data;
                if (typeof cartData === 'string') {
                    cartData = JSON.parse(cartData);
                }
                const categoryId = cartData.selected_category_id;

                const [prods] = await db.query(
                    'SELECT id, nombre, precio_unidad FROM productos WHERE tenant_id = ? AND categoria_id = ? AND activo = 1 AND precio_unidad > 0',
                    [tenantId, categoryId]
                );

                if (!isNaN(body)) {
                    const pIdx = parseInt(body) - 1;
                    if (pIdx >= 0 && pIdx < prods.length) {
                        const selectedP = prods[pIdx];
                        if (!cartData.cart) {
                            cartData.cart = [];
                        }

                        cartData.cart.push({
                            id: selectedP.id,
                            nombre: selectedP.nombre,
                            precio: selectedP.precio_unidad,
                            cantidad: 1
                        });

                        await db.query(
                            'UPDATE whatsapp_conversations SET pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                            [JSON.stringify(cartData), tenantId, from]
                        );

                        let resMsg = `✅ *${selectedP.nombre}* añadido.\n\n`;
                        resMsg += '*Tu pedido:*\n';
                        cartData.cart.forEach((item, i) => (resMsg += `${i + 1}. ${item.nombre}\n`));
                        resMsg +=
                            '\nEscribe otro número para añadir más, "QUITAR [n]" para eliminar uno, *MENU* para otras categorías, o *PEDIR* para finalizar.';
                        await msg.reply(resMsg);
                    } else {
                        await msg.reply('Número de producto no válido.');
                    }
                } else if (body.startsWith('quitar ')) {
                    const removeIdx = parseInt(body.replace('quitar ', '')) - 1;
                    if (!isNaN(removeIdx) && cartData.cart && cartData.cart[removeIdx]) {
                        const removed = cartData.cart.splice(removeIdx, 1)[0];
                        await db.query(
                            'UPDATE whatsapp_conversations SET pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                            [JSON.stringify(cartData), tenantId, from]
                        );

                        let resMsg = `❌ *${removed.nombre}* eliminado del carrito.\n\n`;
                        if (cartData.cart.length > 0) {
                            resMsg += '*Tu pedido actual:*\n';
                            cartData.cart.forEach((item, i) => (resMsg += `${i + 1}. ${item.nombre}\n`));
                            resMsg +=
                                '\nEscribe otro número para añadir, "QUITAR [n]" para eliminar, o *PEDIR* para finalizar.';
                        } else {
                            resMsg += 'Tu carrito está vacío ahora. Elige algo del menú.';
                        }
                        await msg.reply(resMsg);
                    } else {
                        await msg.reply('Número de item no válido para quitar. Ejemplo: "QUITAR 1"');
                    }
                } else if (body === 'pedir') {
                    if (!cartData.cart || cartData.cart.length === 0) {
                        await msg.reply('Tu carrito está vacío. Elige algo del menú primero.');
                        return;
                    }
                    await msg.reply('¿Cómo prefieres tu pedido?\n\n1. 🛵 *Domicilio*\n2. 🥡 *Para recoger / En local*');
                    await this.updateConversationState(tenantId, from, 'selecting_order_type');
                } else {
                    await msg.reply(
                        'Opción no válida. Escribe el número del producto, "QUITAR [n]" para eliminar uno, o *PEDIR* para terminar.'
                    );
                }
                break;
            }

            case 'selecting_order_type': {
                let cData = conversation.pending_order_data;
                if (typeof cData === 'string') {
                    cData = JSON.parse(cData);
                }

                if (body === '1' || body.includes('domicilio')) {
                    cData.order_type = 'Domicilio';
                    await db.query(
                        'UPDATE whatsapp_conversations SET current_state = "ordering", pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                        [JSON.stringify(cData), tenantId, from]
                    );
                    await msg.reply(
                        '¡Perfecto! 🛵\n\nPor favor envíanos tu *Nombre* y *Dirección* para el envío (ejemplo: juan - siempre viva.'
                    );
                } else if (body === '2' || body.includes('recoger') || body.includes('local')) {
                    cData.order_type = 'Pickup / Local';
                    await db.query(
                        'UPDATE whatsapp_conversations SET current_state = "ordering", pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                        [JSON.stringify(cData), tenantId, from]
                    );
                    await msg.reply('¡Entendido! 🥡\n\nPor favor envíanos tu *Nombre* para tener listo tu pedido.');
                } else {
                    await msg.reply('Por favor elige una opción:\n1. Domicilio\n2. Para recoger');
                }
                break;
            }

            case 'ordering': {
                let orderData = conversation.pending_order_data;
                if (typeof orderData === 'string') {
                    orderData = JSON.parse(orderData);
                }

                // Guardar info del cliente (Nombre/Dirección)
                orderData.customer_info = msg.body;

                await db.query(
                    'UPDATE whatsapp_conversations SET current_state = "selecting_payment_method", pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                    [JSON.stringify(orderData), tenantId, from]
                );

                await msg.reply(
                    '¿Cómo deseas realizar el pago?\n\n1. 💵 *Efectivo*\n2. 📲 *Transferencia*\n3. 💳 *Datáfono*'
                );
                break;
            }

            case 'selecting_payment_method': {
                let pData = conversation.pending_order_data;
                if (typeof pData === 'string') {
                    pData = JSON.parse(pData);
                }

                if (body === '1' || body.includes('efectivo')) {
                    pData.payment_method = 'Efectivo';
                } else if (body === '2' || body.includes('transferencia')) {
                    pData.payment_method = 'Transferencia';
                } else if (body === '3' || body.includes('datafono')) {
                    pData.payment_method = 'Datafono';
                } else {
                    await msg.reply('Por favor elige una opción de pago válida (1, 2 o 3).');
                    return;
                }

                await db.query(
                    'UPDATE whatsapp_conversations SET current_state = "confirming", pending_order_data = ? WHERE tenant_id = ? AND customer_phone = ?',
                    [JSON.stringify(pData), tenantId, from]
                );

                let confirmMsg = `📝 *Resumen de tu pedido:*\n\n`;
                const total = pData.cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
                pData.cart.forEach(item => {
                    confirmMsg += `- ${item.nombre} x${item.cantidad} ($${Number(item.precio * item.cantidad).toLocaleString('es-CO')})\n`;
                });
                confirmMsg += `\n*Total:* $${Number(total).toLocaleString('es-CO')}`;
                confirmMsg += `\n*Tipo:* ${pData.order_type}`;
                confirmMsg += `\n*Pago:* ${pData.payment_method}`;

                if (pData.payment_method === 'Transferencia') {
                    confirmMsg += `\n\n⚠️ *Nota:* Al confirmar, te enviaremos los datos para la transferencia.`;
                }

                confirmMsg += `\n\n¿Confirmas tu pedido? Escribe *SI* para finalizar o *NO* para cancelar.`;
                await msg.reply(confirmMsg);
                break;
            }

            case 'confirming': {
                if (body === 'si' || body === 'si') {
                    // 'sí' ya está normalizado a 'si'

                    try {
                        let cDataFinal = conversation.pending_order_data;
                        if (typeof cDataFinal === 'string') {
                            cDataFinal = JSON.parse(cDataFinal);
                        }

                        await this.finalizeOrder(tenantId, from, cDataFinal.customer_info, conversation);

                        let finalMsg = '¡Pedido recibido! 🎉\n\nEstamos procesando tu orden. ';
                        if (cDataFinal.payment_method === 'Transferencia') {
                            const totalStr = Number(
                                cDataFinal.cart.reduce((sum, i) => sum + i.precio * i.cantidad, 0)
                            ).toLocaleString('es-CO');
                            // Reemplazar ${total} en el mensaje configurado si existe
                            const customTransferMsg = transferMsg.replace('${total}', '$' + totalStr);
                            finalMsg += '\n\n' + customTransferMsg;
                        } else {
                            finalMsg += '\n\nEn un momento te confirmaremos. ¡Gracias!';
                        }

                        await msg.reply(finalMsg);
                        await this.updateConversationState(tenantId, from, 'completed');
                    } catch (error) {
                        console.error('[WhatsApp] Error al finalizar pedido:', error);
                        await msg.reply('Error al procesar. Por favor intenta de nuevo.');
                    }
                } else if (body === 'no') {
                    await msg.reply('Pedido cancelado. Escribe *MENU* cuando gustes volver a pedir. 👋');
                    await this.updateConversationState(tenantId, from, 'welcome');
                } else {
                    await msg.reply('Por favor responde *SI* para confirmar o *NO* para cancelar.');
                }
                break;
            }

            default:
                await msg.reply(welcomeMsg);
                await this.updateConversationState(tenantId, from, 'selecting_category');
        }
    }

    async sendCategories(tenantId, msg) {
        const [cats] = await db.query('SELECT nombre FROM categorias WHERE tenant_id = ? AND activa = 1', [tenantId]);

        let catMsg = '🍽️ *¿Qué te gustaría pedir hoy?*\n\nElige una categoría:\n';
        cats.forEach((c, i) => {
            catMsg += `${i + 1}. ${c.nombre}\n`;
        });
        await msg.reply(catMsg);
    }

    async sendProductsByCategory(tenantId, msg, categoryId, categoryName) {
        const [prods] = await db.query(
            'SELECT nombre, precio_unidad FROM productos WHERE tenant_id = ? AND categoria_id = ? AND activo = 1 AND precio_unidad > 0 LIMIT 20',
            [tenantId, categoryId]
        );

        if (prods.length === 0) {
            await msg.reply(`Lo sentimos, no hay productos disponibles en *${categoryName}* en este momento.`);
            await this.sendCategories(tenantId, msg);
            await this.updateConversationState(tenantId, msg.from, 'selecting_category');
            return;
        }

        let menuMsg = `📖 *Menú de ${categoryName}:*\n\n`;
        prods.forEach((p, i) => {
            menuMsg += `${i + 1}. *${p.nombre}* - $${Number(p.precio_unidad).toLocaleString('es-CO')}\n`;
        });
        menuMsg += '\nEscribe el *número* para añadirlo al carrito.';
        await msg.reply(menuMsg);
    }

    async updateConversationState(tenantId, from, state) {
        await db.query(
            'UPDATE whatsapp_conversations SET current_state = ? WHERE tenant_id = ? AND customer_phone = ?',
            [state, tenantId, from]
        );
    }

    getClient(tenantId) {
        return this.clients.get(tenantId);
    }

    getQR(tenantId) {
        return this.qrCodes.get(tenantId);
    }
    async destroyClient(tenantId) {
        this.initializing.delete(tenantId);
        const client = this.clients.get(tenantId);
        if (client) {
            try {
                await client.logout();
                await client.destroy();
                console.log(`[WhatsApp] Cliente destruido para Tenant ${tenantId}`);
            } catch (error) {
                console.error(`[WhatsApp] Error al destruir cliente para Tenant ${tenantId}:`, error);
            }
            this.clients.delete(tenantId);
        }
        this.qrCodes.delete(tenantId);

        // Actualizar DB
        await db.query('UPDATE whatsapp_configs SET estado = ?, last_qr = NULL WHERE tenant_id = ?', [
            'desconectado',
            tenantId
        ]);
    }

    /**
     * Finaliza el pedido creando los registros en la BD del POS
     */
    async finalizeOrder(tenantId, phone, customerInfo, conversation) {
        let cartData = conversation.pending_order_data;
        if (typeof cartData === 'string') {
            cartData = JSON.parse(cartData);
        }

        if (!cartData || !cartData.cart || cartData.cart.length === 0) {
            throw new Error('Carrito vacío');
        }

        // 1. Buscar o crear mesa virtual para este pedido
        const tableNumber = `WA-${phone.substring(phone.length - 4)}`;

        // Intentar extraer solo el nombre para la descripción de la mesa
        let nombreMostrable = customerInfo.split(/[-–—]/)[0].trim();
        if (nombreMostrable.length > 25) {
            nombreMostrable = nombreMostrable.substring(0, 22) + '...';
        }

        const [mesaRows] = await db.query(
            'SELECT id FROM mesas WHERE tenant_id = ? AND numero = ? AND tipo = "virtual"',
            [tenantId, tableNumber]
        );

        let mesaId;
        if (mesaRows.length > 0) {
            mesaId = mesaRows[0].id;
            await db.query('UPDATE mesas SET estado = "ocupada", descripcion = ? WHERE id = ?', [
                nombreMostrable,
                mesaId
            ]);
        } else {
            const [result] = await db.query(
                'INSERT INTO mesas (tenant_id, numero, descripcion, tipo, estado) VALUES (?, ?, ?, ?, ?)',
                [tenantId, tableNumber, nombreMostrable, 'virtual', 'ocupada']
            );
            mesaId = result.insertId;
        }

        // 2. Calcular total
        const total = cartData.cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

        // 3. Crear el pedido principal
        const orderType = cartData.order_type || 'WhatsApp';
        const paymentMethod = cartData.payment_method || 'Efectivo';
        const [orderResult] = await db.query(
            'INSERT INTO pedidos (tenant_id, mesa_id, estado, canal, metodo_pago, total, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                tenantId,
                mesaId,
                'abierto',
                'whatsapp',
                paymentMethod,
                total,
                `[${orderType}][${paymentMethod}] ${customerInfo}\nTel: ${phone}`
            ]
        );
        const pedidoId = orderResult.insertId;

        // 4. Insertar los items del pedido
        for (const item of cartData.cart) {
            await db.query(
                'INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, unidad_medida) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    tenantId,
                    pedidoId,
                    item.id,
                    item.cantidad,
                    item.precio,
                    item.precio * item.cantidad,
                    'pendiente',
                    'UND'
                ]
            );
        }

        // 5. Limpiar datos temporales de la conversación
        await db.query(
            'UPDATE whatsapp_conversations SET pending_order_data = NULL WHERE tenant_id = ? AND customer_phone = ?',
            [tenantId, phone]
        );

        console.log(`[WhatsApp] SE CREÓ PEDIDO #${pedidoId} en Mesa ${mesaId} para Tenant ${tenantId}`);

        // Emitir evento para notificaciones en tiempo real
        this.events.emit('orderCreated', { tenantId, pedidoId, mesaId });
    }

    /**
     * Formatea un número para WhatsApp (específico para Colombia si tiene 10 dígitos)
     */
    formatPhone(phone) {
        if (!phone) {
            return null;
        }
        let cleaned = phone.replace(/\D/g, '');
        // Si tiene 10 dígitos y no empieza por 57, asumimos que es Colombia
        if (cleaned.length === 10 && !cleaned.startsWith('57')) {
            cleaned = '57' + cleaned;
        }
        return cleaned.includes('@c.us') ? cleaned : `${cleaned}@c.us`;
    }

    /**
     * Envía un mensaje de texto simple.
     */
    async sendMessage(tenantId, to, text) {
        const client = this.getClient(tenantId);
        if (!client) {
            console.error(`[WhatsApp] No hay cliente para Tenant ${tenantId}`);
            return false;
        }
        try {
            const formattedTo = this.formatPhone(to);
            await client.sendMessage(formattedTo, text);
            return true;
        } catch (error) {
            console.error(`[WhatsApp] Error enviando mensaje a ${to}:`, error.message);
            return false;
        }
    }

    /**
     * Envía un archivo/media.
     */
    async sendMediaMessage(tenantId, to, buffer, filename, caption = '') {
        const client = this.getClient(tenantId);
        if (!client) {
            console.error(`[WhatsApp] No hay cliente para Tenant ${tenantId}`);
            return false;
        }

        try {
            const formattedTo = this.formatPhone(to);
            const media = new MessageMedia('application/pdf', buffer.toString('base64'), filename);

            await client.sendMessage(formattedTo, media, { caption });
            return true;
        } catch (error) {
            console.error(`[WhatsApp] Error enviando media a ${to}:`, error.message);
            return false;
        }
    }
}

// Singleton para usar en toda la app
module.exports = new WhatsAppService();
