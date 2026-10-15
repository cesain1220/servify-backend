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

        // Enviar mensaje: se guarda en MySQL y se reenvía a la sala
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
                    `SELECT id, conversacion_id, emisor_id, contenido, leido, enviado_en
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
    });
};