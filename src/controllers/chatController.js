const db = require('../db');

// Verifica que el usuario pertenezca a la conversación
const obtenerConversacionDe = async (conversacionId, usuarioId) => {
    const [rows] = await db.query(
        `SELECT id, cliente_id, tecnico_id, solicitud_id, activa
         FROM conversaciones
         WHERE id = ? AND (cliente_id = ? OR tecnico_id = ?)`,
        [conversacionId, usuarioId, usuarioId]
    );
    return rows[0] || null;
};

// Lista mis conversaciones con último mensaje y no leídos
const listarConversaciones = async (req, res) => {
    try {
        const yo = req.usuario.id;
        const [rows] = await db.query(
            `SELECT c.id, c.solicitud_id, c.activa,
                    s.titulo AS solicitud_titulo,
                    IF(c.cliente_id = ?, c.tecnico_id, c.cliente_id) AS otro_id,
                    u.nombre AS otro_nombre,
                    (SELECT m.contenido FROM mensajes m
                      WHERE m.conversacion_id = c.id ORDER BY m.enviado_en DESC, m.id DESC LIMIT 1) AS ultimo_mensaje,
                    (SELECT m.enviado_en FROM mensajes m
                      WHERE m.conversacion_id = c.id ORDER BY m.enviado_en DESC, m.id DESC LIMIT 1) AS ultimo_mensaje_en,
                    (SELECT COUNT(*) FROM mensajes m
                      WHERE m.conversacion_id = c.id AND m.emisor_id <> ? AND m.leido = 0) AS no_leidos
             FROM conversaciones c
             JOIN solicitudes s ON s.id = c.solicitud_id
             JOIN usuarios u ON u.id = IF(c.cliente_id = ?, c.tecnico_id, c.cliente_id)
             WHERE c.cliente_id = ? OR c.tecnico_id = ?
             ORDER BY COALESCE(ultimo_mensaje_en, c.creado_en) DESC`,
            [yo, yo, yo, yo, yo]
        );
        return res.json(rows);
    } catch (error) {
        console.error('Error al listar conversaciones:', error);
        return res.status(500).json({ mensaje: 'Error interno al listar conversaciones' });
    }
};

// Historial de una conversación. ?despues_de=ID trae solo los mensajes nuevos (para reconectar)
const obtenerMensajes = async (req, res) => {
    try {
        const { id } = req.params;
        const conv = await obtenerConversacionDe(id, req.usuario.id);
        if (!conv) return res.status(404).json({ mensaje: 'Conversación no encontrada' });

        const despuesDe = parseInt(req.query.despues_de) || 0;
        const [mensajes] = await db.query(
            `SELECT id, conversacion_id, emisor_id, contenido, leido, enviado_en
             FROM mensajes
             WHERE conversacion_id = ? AND id > ?
             ORDER BY id ASC
             LIMIT 200`,
            [id, despuesDe]
        );
        return res.json({ activa: conv.activa === 1, mensajes });
    } catch (error) {
        console.error('Error al obtener mensajes:', error);
        return res.status(500).json({ mensaje: 'Error interno al obtener mensajes' });
    }
};

// Marca como leídos los mensajes del otro
const marcarLeidos = async (req, res) => {
    try {
        const { id } = req.params;
        const conv = await obtenerConversacionDe(id, req.usuario.id);
        if (!conv) return res.status(404).json({ mensaje: 'Conversación no encontrada' });

        await db.query(
            'UPDATE mensajes SET leido = 1 WHERE conversacion_id = ? AND emisor_id <> ? AND leido = 0',
            [id, req.usuario.id]
        );
        return res.json({ mensaje: 'Mensajes marcados como leídos' });
    } catch (error) {
        console.error('Error al marcar leídos:', error);
        return res.status(500).json({ mensaje: 'Error interno al marcar leídos' });
    }
};

module.exports = { obtenerConversacionDe, listarConversaciones, obtenerMensajes, marcarLeidos };