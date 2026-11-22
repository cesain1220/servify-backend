const db = require('../db');

// Error con código HTTP para cortar la ejecución limpiamente
const fallo = (status, mensaje) => {
    const e = new Error(mensaje);
    e.status = status;
    return e;
};

// Funciona tanto si db es un pool como si es una sola conexión
const abrirConexion = async () => (db.getConnection ? await db.getConnection() : db);

const responderError = (res, error, texto) => {
    if (error.status) return res.status(error.status).json({ mensaje: error.message });
    console.error(texto, error);
    return res.status(500).json({
        mensaje: texto,
        detalle: error.sqlMessage || error.message
    });
};

// ---------- TÉCNICO: postularse ----------
const crearPostulacion = async (req, res) => {
    try {
        const tecnico_id = req.usuario.id;
        const { solicitud_id, tiempo_estimado, mensaje } = req.body;
        const aceptaPresupuesto = req.body.acepta_presupuesto === true;
        let monto = Number(req.body.monto_propuesto);

        if (!solicitud_id) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }

        const [sol] = await db.query(
            'SELECT estado, presupuesto_estimado FROM solicitudes WHERE id = ?', [solicitud_id]
        );
        if (sol.length === 0) return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
        if (sol[0].estado !== 'pendiente') {
            return res.status(409).json({ mensaje: 'Esta solicitud ya no está disponible' });
        }

        // Si concuerda con el precio, el monto es SIEMPRE el del cliente (no el que mande la app)
        if (aceptaPresupuesto) {
            const presupuesto = Number(sol[0].presupuesto_estimado);
            if (!(presupuesto > 0)) {
                return res.status(400).json({ mensaje: 'El cliente no indicó un presupuesto' });
            }
            monto = presupuesto;
        }
        if (!(monto > 0)) return res.status(400).json({ mensaje: 'Monto no válido' });

        const [existe] = await db.query(
            'SELECT id FROM postulaciones WHERE solicitud_id = ? AND tecnico_id = ?',
            [solicitud_id, tecnico_id]
        );
        if (existe.length > 0) {
            return res.status(409).json({ mensaje: 'Ya te postulaste a esta solicitud' });
        }

        const texto = (mensaje || '').trim() ||
            (aceptaPresupuesto ? 'Estoy de acuerdo con el presupuesto indicado.' : '');
        const mensajeFinal = `Tiempo estimado: ${tiempo_estimado || 'No indicado'}\n${texto}`.trim();

        await db.query(
            `INSERT INTO postulaciones (solicitud_id, tecnico_id, monto_propuesto, mensaje, estado, acepta_presupuesto)
             VALUES (?, ?, ?, ?, 'pendiente', ?)`,
            [solicitud_id, tecnico_id, monto, mensajeFinal, aceptaPresupuesto ? 1 : 0]
        );

        return res.status(200).json({ mensaje: 'Postulación enviada con éxito' });
    } catch (error) {
        return responderError(res, error, 'Error interno al crear postulación');
    }
};

// ---------- CLIENTE: ver propuestas de su solicitud ----------
const listarPostulacionesDeSolicitud = async (req, res) => {
    try {
        const { solicitudId } = req.params;

        const [sol] = await db.query(
            'SELECT cliente_id FROM solicitudes WHERE id = ?', [solicitudId]
        );
        if (sol.length === 0) throw fallo(404, 'Solicitud no encontrada');
        if (sol[0].cliente_id !== req.usuario.id) throw fallo(403, 'No es tu solicitud');

        const [rows] = await db.query(
            `SELECT p.id, p.solicitud_id, p.tecnico_id,
                    u.nombre AS tecnico_nombre,
                    u.foto_url AS tecnico_foto,
                    p.acepta_presupuesto,
                    u.calificacion_promedio AS tecnico_calificacion,
                    p.monto_propuesto, p.mensaje, p.estado, p.creado_en,
                    s.presupuesto_estimado,
                    c.id AS conversacion_id
             FROM postulaciones p
             JOIN solicitudes s ON s.id = p.solicitud_id
             JOIN usuarios u ON u.id = p.tecnico_id
             LEFT JOIN conversaciones c
                    ON c.solicitud_id = p.solicitud_id
                   AND c.tecnico_id = p.tecnico_id
             WHERE p.solicitud_id = ? AND p.estado <> 'rechazada'
             ORDER BY FIELD(p.estado, 'aceptada', 'pendiente'), p.creado_en DESC`,
            [solicitudId]
        );

        return res.json(rows);
    } catch (error) {
        return responderError(res, error, 'Error interno al listar postulaciones');
    }
};

// ---------- CLIENTE: aceptar (abre el chat) ----------
const aceptarPostulacion = async (req, res) => {
    const conn = await abrirConexion();
    try {
        const { id } = req.params;
        await conn.beginTransaction();

        const [[post]] = await conn.query(
            `SELECT id, solicitud_id, tecnico_id, estado, monto_propuesto, acepta_presupuesto
             FROM postulaciones WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (!post) throw fallo(404, 'Postulación no encontrada');

        const [[sol]] = await conn.query(
            'SELECT id, cliente_id, estado FROM solicitudes WHERE id = ? FOR UPDATE',
            [post.solicitud_id]
        );
        if (sol.cliente_id !== req.usuario.id) throw fallo(403, 'No es tu solicitud');
        if (sol.estado !== 'pendiente') throw fallo(409, 'La solicitud ya tiene un acuerdo en proceso');
        if (post.estado !== 'pendiente') throw fallo(409, 'Esta propuesta ya no está disponible');

        await conn.query("UPDATE postulaciones SET estado = 'aceptada' WHERE id = ?", [post.id]);

        await conn.query(
            "UPDATE solicitudes SET estado = 'en_proceso', tecnico_id = ? WHERE id = ?",
            [post.tecnico_id, sol.id]
        );

        // Crea el chat; si ya existía (caso raro), lo reactiva
        await conn.query(
            `INSERT INTO conversaciones (cliente_id, tecnico_id, solicitud_id, activa)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE activa = 1`,
            [sol.cliente_id, post.tecnico_id, sol.id]
        );
        const [[conv]] = await conn.query(
            'SELECT id FROM conversaciones WHERE solicitud_id = ? AND tecnico_id = ?',
            [sol.id, post.tecnico_id]
        );
        if (post.acepta_presupuesto === 1) {
            await conn.query('UPDATE postulaciones SET monto_final = ? WHERE id = ?', [post.monto_propuesto, post.id]);
            await conn.query('UPDATE solicitudes SET monto_final = ? WHERE id = ?', [post.monto_propuesto, sol.id]);
            await conn.query(
                `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo)
                 VALUES (?, ?, ?, 'sistema')`,
                [conv.id, sol.cliente_id, `Acuerdo cerrado por $${Number(post.monto_propuesto).toFixed(2)}`]
            );
        }

        await conn.commit();
        return res.json({ mensaje: 'Propuesta aceptada', conversacion_id: conv.id });
    } catch (error) {
        await conn.rollback();
        return responderError(res, error, 'Error interno al aceptar la propuesta');
    } finally {
        if (conn.release) conn.release();
    }
};

// ---------- CLIENTE: rechazar una propuesta pendiente ----------
const rechazarPostulacion = async (req, res) => {
    try {
        const { id } = req.params;

        const [[post]] = await db.query(
            `SELECT p.id, p.estado, s.cliente_id
             FROM postulaciones p JOIN solicitudes s ON s.id = p.solicitud_id
             WHERE p.id = ?`,
            [id]
        );
        if (!post) throw fallo(404, 'Postulación no encontrada');
        if (post.cliente_id !== req.usuario.id) throw fallo(403, 'No es tu solicitud');
        if (post.estado !== 'pendiente') throw fallo(409, 'Solo se pueden rechazar propuestas pendientes');

        await db.query("UPDATE postulaciones SET estado = 'rechazada' WHERE id = ?", [id]);
        return res.json({ mensaje: 'Propuesta rechazada' });
    } catch (error) {
        return responderError(res, error, 'Error interno al rechazar la propuesta');
    }
};

// ---------- CLIENTE: cancelar el acuerdo (no se pusieron de acuerdo) ----------
const cancelarAcuerdo = async (req, res) => {
    const conn = await abrirConexion();
    try {
        const { id } = req.params;
        await conn.beginTransaction();

        const [[post]] = await conn.query(
            'SELECT id, solicitud_id, tecnico_id, estado FROM postulaciones WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!post) throw fallo(404, 'Postulación no encontrada');

        const [[sol]] = await conn.query(
            'SELECT id, cliente_id FROM solicitudes WHERE id = ? FOR UPDATE',
            [post.solicitud_id]
        );
        if (sol.cliente_id !== req.usuario.id) throw fallo(403, 'No es tu solicitud');
        if (post.estado !== 'aceptada') throw fallo(409, 'No hay un acuerdo activo con este técnico');

        await conn.query(
            "UPDATE postulaciones SET estado = 'rechazada', monto_final = NULL WHERE id = ?",
            [post.id]
        );
        await conn.query(
            "UPDATE solicitudes SET estado = 'pendiente', tecnico_id = NULL, monto_final = NULL WHERE id = ?",
            [sol.id]
        );

        // Borra la conversación de la base de datos
        await conn.query(
            'DELETE FROM conversaciones WHERE solicitud_id = ? AND tecnico_id = ?',
            [sol.id, post.tecnico_id]
        );

        await conn.commit();
        return res.json({ mensaje: 'Acuerdo cancelado y chat eliminado con éxito' });
    } catch (error) {
        await conn.rollback();
        return responderError(res, error, 'Error interno al cancelar el acuerdo');
    } finally {
        if (conn.release) conn.release();
    }
};

// ---------- TÉCNICO: mis postulaciones ----------
const obtenerMisPostulaciones = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.id, p.solicitud_id, s.titulo, c.nombre AS categoria_nombre,
                    p.monto_propuesto, p.estado, s.estado AS estado_solicitud,
                    p.acepta_presupuesto, p.creado_en,
                    conv.id AS conversacion_id
             FROM postulaciones p
             JOIN solicitudes s ON s.id = p.solicitud_id
             JOIN categorias c ON c.id = s.categoria_id
             LEFT JOIN conversaciones conv
                    ON conv.solicitud_id = p.solicitud_id
                   AND conv.tecnico_id = p.tecnico_id
             WHERE p.tecnico_id = ?
             ORDER BY p.creado_en DESC`,
            [req.usuario.id]
        );
        return res.json(rows);
    } catch (error) {
        return responderError(res, error, 'Error interno al listar tus postulaciones');
    }
};

// ---------- TÉCNICO: agenda de visitas y entregas ----------
const obtenerAgendaTecnico = async (req, res) => {
    try {
        const tecnicoId = req.usuario.id;

        const [rows] = await db.query(
            `SELECT 
                s.id AS solicitud_id,
                s.titulo,
                s.descripcion,
                s.direccion_texto,
                s.latitud,
                s.longitud,
                s.estado AS estado_solicitud,
                COALESCE(s.monto_final, p.monto_propuesto) AS monto,
                u.id AS cliente_id,
                u.nombre AS cliente_nombre,
                u.foto_url AS cliente_foto,
                c.nombre AS categoria_nombre,
                conv.id AS conversacion_id,
                p.mensaje AS mensaje_postulacion,
                SUBSTRING_INDEX(SUBSTRING_INDEX(p.mensaje, 'Visita: ', -1), ' |', 1) AS fecha_visita,
                SUBSTRING_INDEX(SUBSTRING_INDEX(p.mensaje, 'Entrega: ', -1), '\n', 1) AS fecha_entrega
             FROM solicitudes s
             JOIN postulaciones p 
                  ON p.solicitud_id = s.id AND p.tecnico_id = s.tecnico_id
             JOIN usuarios u ON u.id = s.cliente_id
             JOIN categorias c ON c.id = s.categoria_id
             LEFT JOIN conversaciones conv 
                  ON conv.solicitud_id = s.id AND conv.tecnico_id = s.tecnico_id
             WHERE s.tecnico_id = ?
               AND p.estado = 'aceptada'
               AND s.estado IN ('en_proceso', 'pendiente', 'completada')
             ORDER BY fecha_visita ASC, s.creado_en DESC`,
            [tecnicoId]
        );

        const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
        const agenda = rows.map(item => ({
            ...item,
            fecha_visita: regexFecha.test((item.fecha_visita || '').trim()) ? item.fecha_visita.trim() : null,
            fecha_entrega: regexFecha.test((item.fecha_entrega || '').trim()) ? item.fecha_entrega.trim() : null
        }));

        return res.json(agenda);
    } catch (error) {
        return responderError(res, error, 'Error interno al obtener la agenda del técnico');
    }
};

// ---------- TÉCNICO: retirar una propuesta pendiente ----------
const retirarPostulacion = async (req, res) => {
    try {
        const [[post]] = await db.query(
            'SELECT id, tecnico_id, estado FROM postulaciones WHERE id = ?', [req.params.id]
        );
        if (!post) throw fallo(404, 'Postulación no encontrada');
        if (post.tecnico_id !== req.usuario.id) throw fallo(403, 'No es tu postulación');
        if (post.estado !== 'pendiente') {
            throw fallo(409, 'Solo puedes cancelar propuestas pendientes. Si ya fue aceptada, cancela el acuerdo desde el chat');
        }
        await db.query('DELETE FROM postulaciones WHERE id = ?', [post.id]);
        return res.json({ mensaje: 'Propuesta cancelada' });
    } catch (error) {
        return responderError(res, error, 'Error interno al cancelar la propuesta');
    }
};

module.exports = {
    crearPostulacion,
    listarPostulacionesDeSolicitud,
    aceptarPostulacion,
    retirarPostulacion,
    rechazarPostulacion,
    cancelarAcuerdo,
    obtenerMisPostulaciones,
    obtenerAgendaTecnico
};