const jwt = require('jsonwebtoken');
const db = require('./db');
const { obtenerConversacionDe } = require('./controllers/chatController');

module.exports = (io) => {
    // Autenticación al conectar
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('Token no proporcionado'));
            socket.usuario = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_servify');
            next();
        } catch (e) {
            next(new Error('Token inválido'));
        }
    });

    io.on('connection', (socket) => {
        // Entrar a la sala de una conversación
        socket.on('unirse', async (conversacionId, ack) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, socket.usuario.id);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                socket.join(`conv:${conversacionId}`);
                ack?.({ ok: true });
            } catch (e) {
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // Enviar mensaje de texto normal
        socket.on('enviar_mensaje', async ({ conversacionId, contenido } = {}, ack) => {
            try {
                const texto = (contenido || '').trim();
                if (!conversacionId || !texto) return ack?.({ ok: false, error: 'Mensaje vacío' });
                if (texto.length > 2000) return ack?.({ ok: false, error: 'Mensaje demasiado largo' });

                const conv = await obtenerConversacionDe(conversacionId, socket.usuario.id);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                if (conv.activa !== 1) return ack?.({ ok: false, error: 'La conversación está cerrada' });

                const [r] = await db.query(
                    'INSERT INTO mensajes (conversacion_id, emisor_id, contenido) VALUES (?, ?, ?)',
                    [conversacionId, socket.usuario.id, texto]
                );
                const [[mensaje]] = await db.query(
                    `SELECT id, conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta, leido, enviado_en
                     FROM mensajes WHERE id = ?`,
                    [r.insertId]
                );

                io.to(`conv:${conversacionId}`).emit('mensaje_nuevo', mensaje);
                ack?.({ ok: true, mensaje });
            } catch (e) {
                console.error('Error al enviar mensaje:', e);
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // 1. Enviar una nueva oferta económica
        // Enviar una nueva oferta económica
        socket.on('enviar_oferta', async (data) => {
            try {
                const { conversacion_id, monto } = data;
                const emisor_id = socket.usuario.id;

                console.log(`[BACKEND] Recibida oferta de $${monto} para conv:${conversacion_id} por usuario ${emisor_id}`);

                // 1. Cancelar oferta anterior pendiente
                await db.query(
                    `UPDATE mensajes SET estado_oferta = 'cancelada' WHERE conversacion_id = ? AND estado_oferta = 'pendiente'`,
                    [conversacion_id]
                );

                // 2. Insertar la oferta
                const [result] = await db.query(
                    `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta) VALUES (?, ?, ?, 'oferta', ?, 'pendiente')`,
                    [conversacion_id, emisor_id, `Propuesta de oferta: $${monto}`, monto]
                );

                const mensajeId = result.insertId;

                // 3. Consultar el mensaje completo recién creado
                const [[mensajeOferta]] = await db.query(
                    `SELECT id, conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta, leido, enviado_en
             FROM mensajes WHERE id = ?`,
                    [mensajeId]
                );

                console.log(`[BACKEND] Oferta guardada con ID ${mensajeId}, emitiendo a la sala conv:${conversacion_id}`);

                // 4. Reeddddnviar a TODOS en la sala usando exactamente 'mensaje_nuevo'
                io.to(`conv:${conversacion_id}`).emit('mensaje_nuevo', mensajeOferta);

            } catch (error) {
                console.error('Error al enviar oferta:', error);
                // Opcional: Avisar al socket que lo mandó exactamente qué falló
                socket.emit('error_operacion', { mensaje: error.message });
            } 
        });

        // 2. Responder a una oferta (Aceptar o Rechazar)
        socket.on('responder_oferta', async (data) => {
            try {
                const { mensaje_id, conversacion_id, accion } = data; // accion: 'aceptar' o 'rechazar'
                const usuario_id = socket.usuario.id;

                if (accion === 'aceptar') {
                    // Obtener el monto de la oferta
                    const [[oferta]] = await db.query(`SELECT monto, conversacion_id FROM mensajes WHERE id = ?`, [mensaje_id]);
                    if (!oferta) return;

                    // Marcar esta oferta como aceptada
                    await db.query(`UPDATE mensajes SET estado_oferta = 'aceptada' WHERE id = ?`, [mensaje_id]);

                    // Cancelar otras ofertas pendientes
                    await db.query(`UPDATE mensajes SET estado_oferta = 'cancelada' WHERE conversacion_id = ? AND estado_oferta = 'pendiente'`, [conversacion_id]);

                    // Obtener la solicitud_id asociada a la conversación para actualizar el monto_final
                    const [[conv]] = await db.query(`SELECT solicitud_id, cliente_id, tecnico_id FROM conversaciones WHERE id = ?`, [conversacion_id]);

                    if (conv) {
                        await db.query(`UPDATE solicitudes SET monto_final = ?, estado = 'en_proceso' WHERE id = ?`, [oferta.monto, conv.solicitud_id]);
                        await db.query(`UPDATE postulaciones SET monto_final = ? WHERE solicitud_id = ? AND tecnico_id = ?`, [oferta.monto, conv.solicitud_id, conv.tecnico_id]);
                    }

                    // Crear mensaje de sistema informando el cierre del acuerdo
                    const [sysRes] = await db.query(
                        `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo) VALUES (?, ?, ?, 'sistema')`,
                        [conversacion_id, usuario_id, `¡Acuerdo cerrado por $${oferta.monto}!`]
                    );

                    const [[mensajeSistema]] = await db.query(
                        `SELECT id, conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta, leido, enviado_en
                         FROM mensajes WHERE id = ?`,
                        [sysRes.insertId]
                    );

                    io.to(`conv:${conversacion_id}`).emit('oferta_actualizada', {
                        mensaje_id,
                        estado_oferta: 'aceptada',
                        monto_final: oferta.monto
                    });

                    io.to(`conv:${conversacion_id}`).emit('mensaje_nuevo', mensajeSistema);

                } else if (accion === 'rechazar') {
                    await db.query(`UPDATE mensajes SET estado_oferta = 'rechazada' WHERE id = ?`, [mensaje_id]);

                    const [sysRes] = await db.query(
                        `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo) VALUES (?, ?, ?, 'sistema')`,
                        [conversacion_id, usuario_id, `Se rechazó la propuesta económica.`]
                    );

                    const [[mensajeSistema]] = await db.query(
                        `SELECT id, conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta, leido, enviado_en
                         FROM mensajes WHERE id = ?`,
                        [sysRes.insertId]
                    );

                    io.to(`conv:${conversacion_id}`).emit('oferta_actualizada', {
                        mensaje_id,
                        estado_oferta: 'rechazada'
                    });

                    io.to(`conv:${conversacion_id}`).emit('mensaje_nuevo', mensajeSistema);
                }
            } catch (error) {
                console.error('Error al responder oferta:', error);
            }
        });
    });
};