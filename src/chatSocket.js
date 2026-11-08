const jwt = require('jsonwebtoken');
const db = require('./db');
const { obtenerConversacionDe } = require('./controllers/chatController');

const SELECT_MENSAJE = `SELECT id, conversacion_id, emisor_id, contenido, tipo, monto,
                            estado_oferta, leido, enviado_en
                        FROM mensajes WHERE id = ?`;

const formatoDuracion = (seg) =>
    `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;

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
        const yoId = socket.usuario.id;

        // Sala personal: sirve para avisar llamadas en cualquier pantalla
        socket.join(`user:${yoId}`);

        const otroDe = (conv) => (conv.cliente_id === yoId ? conv.tecnico_id : conv.cliente_id);

        // ---------- Entrar a la sala de una conversación ----------
        socket.on('unirse', async (conversacionId, ack) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                socket.join(`conv:${conversacionId}`);
                ack?.({ ok: true });
            } catch (e) {
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // ---------- Mensaje de texto ----------
        socket.on('enviar_mensaje', async ({ conversacionId, contenido } = {}, ack) => {
            try {
                const texto = (contenido || '').trim();
                if (!conversacionId || !texto) return ack?.({ ok: false, error: 'Mensaje vacío' });
                if (texto.length > 2000) return ack?.({ ok: false, error: 'Mensaje demasiado largo' });

                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                if (conv.activa !== 1) return ack?.({ ok: false, error: 'La conversación está cerrada' });

                const [r] = await db.query(
                    'INSERT INTO mensajes (conversacion_id, emisor_id, contenido) VALUES (?, ?, ?)',
                    [conversacionId, yoId, texto]
                );
                const [[mensaje]] = await db.query(SELECT_MENSAJE, [r.insertId]);

                io.to(`conv:${conversacionId}`).emit('mensaje_nuevo', mensaje);
                ack?.({ ok: true, mensaje });
            } catch (e) {
                console.error('Error al enviar mensaje:', e);
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // ---------- Enviar oferta económica ----------
        socket.on('enviar_oferta', async (data = {}, ack) => {
            try {
                const conversacionId = data.conversacion_id;
                const monto = Number(data.monto);

                if (!conversacionId || !(monto > 0) || monto > 1000000) {
                    socket.emit('error_operacion', { mensaje: 'Monto no válido' });
                    return ack?.({ ok: false, error: 'Monto no válido' });
                }

                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                if (conv.activa !== 1) return ack?.({ ok: false, error: 'La conversación está cerrada' });

                // Si ya hay un acuerdo cerrado, no se permiten más ofertas
                const [[yaAcordado]] = await db.query(
                    `SELECT id FROM mensajes
                     WHERE conversacion_id = ? AND tipo = 'oferta' AND estado_oferta = 'aceptada' LIMIT 1`,
                    [conversacionId]
                );
                if (yaAcordado) {
                    socket.emit('error_operacion', { mensaje: 'Ya llegaron a un acuerdo' });
                    return ack?.({ ok: false, error: 'Ya llegaron a un acuerdo' });
                }

                // Solo una oferta pendiente a la vez
                await db.query(
                    `UPDATE mensajes SET estado_oferta = 'cancelada'
                     WHERE conversacion_id = ? AND estado_oferta = 'pendiente'`,
                    [conversacionId]
                );

                const [r] = await db.query(
                    `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, monto, estado_oferta)
                     VALUES (?, ?, ?, 'oferta', ?, 'pendiente')`,
                    [conversacionId, yoId, `Propuesta de oferta: $${monto.toFixed(2)}`, monto]
                );
                const [[mensajeOferta]] = await db.query(SELECT_MENSAJE, [r.insertId]);

                io.to(`conv:${conversacionId}`).emit('mensaje_nuevo', mensajeOferta);
                ack?.({ ok: true });
            } catch (error) {
                console.error('Error al enviar oferta:', error);
                socket.emit('error_operacion', { mensaje: 'No se pudo enviar la oferta' });
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // ---------- Responder oferta (aceptar / rechazar) ----------
        socket.on('responder_oferta', async (data = {}, ack) => {
            let conn;
            try {
                const { mensaje_id, accion } = data;
                if (!mensaje_id || !['aceptar', 'rechazar'].includes(accion)) {
                    return ack?.({ ok: false, error: 'Datos no válidos' });
                }

                conn = await db.getConnection();
                await conn.beginTransaction();

                const [[oferta]] = await conn.query(
                    `SELECT id, conversacion_id, emisor_id, monto, estado_oferta
                     FROM mensajes WHERE id = ? AND tipo = 'oferta' FOR UPDATE`,
                    [mensaje_id]
                );
                if (!oferta) throw new Error('Oferta no encontrada');

                const [[conv]] = await conn.query(
                    `SELECT id, cliente_id, tecnico_id, solicitud_id, activa
                     FROM conversaciones
                     WHERE id = ? AND (cliente_id = ? OR tecnico_id = ?)`,
                    [oferta.conversacion_id, yoId, yoId]
                );
                if (!conv) throw new Error('Sin acceso');
                if (conv.activa !== 1) throw new Error('La conversación está cerrada');
                if (oferta.emisor_id === yoId) throw new Error('No puedes responder tu propia oferta');
                if (oferta.estado_oferta !== 'pendiente') throw new Error('La oferta ya no está disponible');

                let textoSistema;
                if (accion === 'aceptar') {
                    await conn.query(`UPDATE mensajes SET estado_oferta = 'aceptada' WHERE id = ?`, [oferta.id]);
                    await conn.query(
                        `UPDATE mensajes SET estado_oferta = 'cancelada'
                         WHERE conversacion_id = ? AND estado_oferta = 'pendiente'`,
                        [conv.id]
                    );
                    await conn.query(
                        `UPDATE solicitudes SET monto_final = ?, estado = 'en_proceso' WHERE id = ?`,
                        [oferta.monto, conv.solicitud_id]
                    );
                    await conn.query(
                        `UPDATE postulaciones SET monto_final = ? WHERE solicitud_id = ? AND tecnico_id = ?`,
                        [oferta.monto, conv.solicitud_id, conv.tecnico_id]
                    );
                    textoSistema = `Acuerdo cerrado por $${Number(oferta.monto).toFixed(2)}`;
                } else {
                    await conn.query(`UPDATE mensajes SET estado_oferta = 'rechazada' WHERE id = ?`, [oferta.id]);
                    textoSistema = 'Se rechazó la propuesta económica.';
                }

                const [sys] = await conn.query(
                    `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo)
                     VALUES (?, ?, ?, 'sistema')`,
                    [conv.id, yoId, textoSistema]
                );
                const [[mensajeSistema]] = await conn.query(SELECT_MENSAJE, [sys.insertId]);

                await conn.commit();

                const sala = `conv:${conv.id}`;
                io.to(sala).emit('oferta_actualizada', {
                    mensaje_id: oferta.id,
                    estado_oferta: accion === 'aceptar' ? 'aceptada' : 'rechazada',
                    ...(accion === 'aceptar' ? { monto_final: oferta.monto } : {})
                });
                io.to(sala).emit('mensaje_nuevo', mensajeSistema);
                ack?.({ ok: true });
            } catch (error) {
                if (conn) await conn.rollback();
                console.error('Error al responder oferta:', error.message);
                socket.emit('error_operacion', { mensaje: error.message });
                ack?.({ ok: false, error: error.message });
            } finally {
                if (conn) conn.release();
            }
        });

        // =====================================================
        // LLAMADAS con registro en el chat
        // =====================================================

        const registrarMensajeLlamada = async (conversacionId, emisorId, llamadaId, texto) => {
            const [r] = await db.query(
                `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, llamada_id)
                 VALUES (?, ?, ?, 'sistema', ?)`,
                [conversacionId, emisorId, texto, llamadaId]
            );
            const [[msg]] = await db.query(SELECT_MENSAJE, [r.insertId]);
            io.to(`conv:${conversacionId}`).emit('mensaje_nuevo', msg);
        };

        const cerrarLlamada = async (llamada, estadoFinal) => {
            const [res] = await db.query(
                `UPDATE llamadas
                 SET estado = ?, finalizada_en = NOW(),
                     duracion_seg = IF(contestada_en IS NULL, NULL, TIMESTAMPDIFF(SECOND, contestada_en, NOW()))
                 WHERE id = ? AND estado IN ('sonando','en_curso')`,
                [estadoFinal, llamada.id]
            );
            if (res.affectedRows === 0) return false;

            const [[l]] = await db.query('SELECT duracion_seg FROM llamadas WHERE id = ?', [llamada.id]);
            const tipo = llamada.es_video ? 'Videollamada' : 'Llamada de voz';
            const textos = {
                completada: `${tipo} · ${formatoDuracion(l.duracion_seg || 0)}`,
                rechazada: `${tipo} rechazada`,
                cancelada: `${tipo} cancelada`,
                perdida: `${tipo} perdida`
            };
            await registrarMensajeLlamada(llamada.conversacion_id, llamada.emisor_id, llamada.id, textos[estadoFinal]);
            return true;
        };

        const llamadaActiva = async (conversacionId) => {
            const [[l]] = await db.query(
                `SELECT * FROM llamadas
                 WHERE conversacion_id = ? AND estado IN ('sonando','en_curso')
                 ORDER BY id DESC LIMIT 1`,
                [conversacionId]
            );
            return l || null;
        };

        // A inicia la llamada
        socket.on('llamar', async ({ conversacionId, esVideo } = {}, ack) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return ack?.({ ok: false, error: 'Sin acceso' });
                if (conv.activa !== 1) return ack?.({ ok: false, error: 'Conversación cerrada' });

                const vieja = await llamadaActiva(conversacionId);
                if (vieja) await cerrarLlamada(vieja, 'perdida');

                const [r] = await db.query(
                    'INSERT INTO llamadas (conversacion_id, emisor_id, es_video) VALUES (?, ?, ?)',
                    [conversacionId, yoId, esVideo ? 1 : 0]
                );
                const [[yo]] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [yoId]);

                //  Generar el canal y el Token con 'agora-token'
                const canal = `chat_${conversacionId}`;
                const expira = Math.floor(Date.now() / 1000) + 7200; // 2 horas
                const token = RtcTokenBuilder.buildTokenWithUid(
                    process.env.AGORA_APP_ID,
                    process.env.AGORA_APP_CERTIFICATE,
                    canal,
                    0,
                    RtcRole.PUBLISHER,
                    expira
                );

                const datosLlamada = {
                    conversacionId,
                    esVideo: !!esVideo,
                    deId: yoId,
                    deName: yo?.nombre || 'Usuario',
                    llamadaId: r.insertId,
                    canal, //  lo mandamos al receptor
                    token  //  lo mandamos al receptor
                };

                // enviar al otro usuario la llamada entrante con el token
                io.to(`user:${otroDe(conv)}`).emit('llamada_entrante', datosLlamada);

               

                // Devolver el canal y el token al emisor en el ack
                ack?.({ ok: true, llamadaId: r.insertId, canal, token });
            } catch (e) {
                console.error('Error en llamar:', e);
                ack?.({ ok: false, error: 'Error interno' });
            }
        });

        // B acepta o rechaza
        socket.on('responder_llamada', async ({ conversacionId, aceptar } = {}) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return;
                const l = await llamadaActiva(conversacionId);
                if (!l || l.emisor_id === yoId || l.estado !== 'sonando') return;

                if (aceptar) {
                    await db.query(
                        `UPDATE llamadas SET estado = 'en_curso', contestada_en = NOW() WHERE id = ?`,
                        [l.id]
                    );
                } else {
                    await cerrarLlamada(l, 'rechazada');
                }
                io.to(`user:${otroDe(conv)}`).emit('llamada_respondida', {
                    conversacionId,
                    aceptada: !!aceptar
                });
            } catch (e) {
                console.error('Error en responder_llamada:', e);
            }
        });

        // A cuelga antes de que contesten
        socket.on('cancelar_llamada', async ({ conversacionId } = {}) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return;
                const l = await llamadaActiva(conversacionId);
                if (!l || l.estado !== 'sonando') return;
                await cerrarLlamada(l, 'cancelada');
                io.to(`user:${otroDe(conv)}`).emit('llamada_cancelada', { conversacionId });
            } catch (e) {
                console.error('Error en cancelar_llamada:', e);
            }
        });

        // Cualquiera cuelga durante la llamada
        socket.on('finalizar_llamada', async ({ conversacionId } = {}) => {
            try {
                const conv = await obtenerConversacionDe(conversacionId, yoId);
                if (!conv) return;
                const l = await llamadaActiva(conversacionId);
                if (!l || l.estado !== 'en_curso') return;
                await cerrarLlamada(l, 'completada');
            } catch (e) {
                console.error('Error en finalizar_llamada:', e);
            }
        });
    });
};