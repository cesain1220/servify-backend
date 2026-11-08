const db = require('../db');
const crypto = require('crypto');

const SQL_DISTANCIA = `(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.latitud)) *
    COS(RADIANS(s.longitud) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(s.latitud)))))`;

const crearSolicitud = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        const { categoria_id, titulo, descripcion, presupuesto, latitud, longitud, direccion_texto } = req.body;

        if (!titulo || !descripcion || !categoria_id) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }
        if (latitud == null || longitud == null) {
            return res.status(400).json({ mensaje: 'Falta la ubicación' });
        }

        const [resultado] = await db.query(
            `INSERT INTO solicitudes
            (cliente_id, categoria_id, titulo, descripcion, presupuesto_estimado, latitud, longitud, direccion_texto, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
            [cliente_id, categoria_id, titulo, descripcion, presupuesto || null,
                latitud, longitud, direccion_texto || null]
        );

        console.log('[crearSolicitud v2] insertId:', resultado.insertId);

        return res.status(200).json({ mensaje: 'Solicitud creada con éxito', id: resultado.insertId });
    } catch (error) {
        console.error('Error al crear solicitud:', error);
        return res.status(500).json({
            mensaje: 'Error interno al crear solicitud',
            detalle: error.sqlMessage || error.message
        });
    }
};

const obtenerSolicitudes = async (req, res) => {
    try {
        let lat = parseFloat(req.query.lat);
        let lng = parseFloat(req.query.lng);

        if (isNaN(lat) || isNaN(lng)) {
            const [[tecnico]] = await db.query(
                'SELECT latitud, longitud FROM usuarios WHERE id = ?',
                [req.usuario.id]
            );
            lat = parseFloat(tecnico?.latitud);
            lng = parseFloat(tecnico?.longitud);
        }

        const tieneUbicacion = !isNaN(lat) && !isNaN(lng);
        const params = tieneUbicacion ? [lat, lng, lat, req.usuario.id] : [req.usuario.id];

        const [rows] = await db.query(
            `SELECT s.id, s.cliente_id, u.nombre AS cliente_nombre,
                    c.nombre AS categoria_nombre, s.titulo, s.descripcion,
                    s.presupuesto_estimado, s.creado_en,
                    s.latitud, s.longitud,
                    ${tieneUbicacion ? SQL_DISTANCIA : 'NULL'} AS distancia_km
             FROM solicitudes s
             JOIN usuarios u ON u.id = s.cliente_id
             JOIN categorias c ON c.id = s.categoria_id
             WHERE s.estado = 'pendiente'
               AND NOT EXISTS (
                   SELECT 1 FROM postulaciones p
                   WHERE p.solicitud_id = s.id AND p.tecnico_id = ?
               )
             ORDER BY ${tieneUbicacion ? 'distancia_km ASC' : 's.id DESC'}`,
            params
        );

        return res.json(rows);
    } catch (error) {
        console.error('Error al listar solicitudes:', error);
        return res.status(500).json({
            mensaje: 'Error interno al listar solicitudes',
            detalle: error.sqlMessage || error.message
        });
    }
};

const obtenerMisSolicitudes = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;

        // Unificamos solicitudes públicas y contrataciones directas del cliente
        const [rows] = await db.query(
            `SELECT 
                s.id, 
                s.titulo, 
                s.descripcion, 
                s.presupuesto_estimado, 
                s.estado, 
                s.creado_en,
                c.nombre AS categoria_nombre,
                (SELECT COUNT(*) FROM postulaciones p
                  WHERE p.solicitud_id = s.id AND p.estado IN ('pendiente','aceptada')) AS total_propuestas
             FROM solicitudes s
             JOIN categorias c ON c.id = s.categoria_id
             WHERE s.cliente_id = ?

             UNION ALL

             SELECT 
                cd.id,
                CONCAT('Contratación Directa: ', c.nombre) AS titulo,
                cd.descripcion,
                cd.monto_acordado AS presupuesto_estimado,
                cd.estado,
                cd.creado_en,
                c.nombre AS categoria_nombre,
                0 AS total_propuestas
             FROM contrataciones_directas cd
             JOIN categorias c ON c.id = cd.categoria_id
             WHERE cd.cliente_id = ?

             ORDER BY creado_en DESC`,
            [cliente_id, cliente_id]
        );

        return res.json(rows);
    } catch (error) {
        console.error('Error al listar mis solicitudes:', error);
        return res.status(500).json({
            mensaje: 'Error interno al listar tus solicitudes',
            detalle: error.sqlMessage || error.message
        });
    }
};

const obtenerSolicitudPorId = async (req, res) => {
    try {
        const { id } = req.params;

        const [[yo]] = await db.query(
            'SELECT latitud, longitud FROM usuarios WHERE id = ?',
            [req.usuario.id]
        );
        const lat = parseFloat(yo?.latitud);
        const lng = parseFloat(yo?.longitud);
        const tieneUbicacion = !isNaN(lat) && !isNaN(lng);
        const params = tieneUbicacion ? [lat, lng, lat, id] : [id];

        const [rows] = await db.query(
            `SELECT s.id, s.cliente_id, u.nombre AS cliente_nombre,
                    u.creado_en AS cliente_creado_en,
                    (SELECT COALESCE(AVG(calificacion), 0) FROM resenas WHERE destinatario_id = u.id) AS cliente_calificacion,
                    (SELECT COUNT(*) FROM resenas WHERE destinatario_id = u.id) AS cliente_total_resenas,
                    c.nombre AS categoria_nombre, s.titulo, s.descripcion,
                    s.presupuesto_estimado, s.direccion_texto, s.estado, s.creado_en,
                    s.latitud, s.longitud,
                    ${tieneUbicacion ? SQL_DISTANCIA : 'NULL'} AS distancia_km
             FROM solicitudes s
             JOIN usuarios u ON u.id = s.cliente_id
             JOIN categorias c ON c.id = s.categoria_id
             WHERE s.id = ?`,
            params
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
        }

        const [fotos] = await db.query(
            'SELECT foto_url FROM fotos_solicitud WHERE solicitud_id = ?', [id]
        );
        const [post] = await db.query(
            'SELECT id FROM postulaciones WHERE solicitud_id = ? AND tecnico_id = ?',
            [id, req.usuario.id]
        );

        return res.json({
            ...rows[0],
            fotos: fotos.map(f => f.foto_url),
            ya_postulado: post.length > 0
        });
    } catch (error) {
        console.error('Error al obtener solicitud:', error);
        return res.status(500).json({
            mensaje: 'Error interno al obtener solicitud',
            detalle: error.sqlMessage || error.message
        });
    }
};

// ==========================================
// MÉTODOS: CONTRATACIÓN DIRECTA
// ==========================================

const crearContratacionDirecta = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        const { tecnico_id, categoria_id, descripcion, monto_acordado } = req.body;

        if (!tecnico_id || !categoria_id || !descripcion) {
            return res.status(400).json({ mensaje: 'Faltan campos obligatorios (tecnico_id, categoria_id, descripcion)' });
        }

        const [resultado] = await db.query(
            `INSERT INTO contrataciones_directas 
            (cliente_id, tecnico_id, categoria_id, descripcion, monto_acordado, estado)
            VALUES (?, ?, ?, ?, ?, 'pendiente')`,
            [cliente_id, tecnico_id, categoria_id, descripcion, monto_acordado || null]
        );

        return res.status(201).json({
            ok: true,
            mensaje: 'Contratación directa enviada con éxito',
            id: resultado.insertId
        });
    } catch (error) {
        console.error('Error al crear contratación directa:', error);
        return res.status(500).json({
            mensaje: 'Error interno al crear contratación directa',
            detalle: error.sqlMessage || error.message
        });
    }
};

const obtenerContratacionesTecnico = async (req, res) => {
    try {
        const tecnico_id = req.usuario.id;

        const [rows] = await db.query(
            `SELECT 
                cd.id,
                cd.cliente_id,
                cd.tecnico_id,
                cd.categoria_id,
                cd.descripcion,
                cd.monto_acordado,
                cd.estado,
                cd.creado_en,
                u.nombre AS cliente_nombre,
                u.foto_url AS cliente_foto,
                u.telefono AS cliente_telefono,
                c.nombre AS categoria_nombre
             FROM contrataciones_directas cd
             JOIN usuarios u ON cd.cliente_id = u.id
             JOIN categorias c ON cd.categoria_id = c.id
             WHERE cd.tecnico_id = ?
             ORDER BY cd.creado_en DESC`,
            [tecnico_id]
        );

        return res.json(rows);
    } catch (error) {
        console.error('Error al obtener contrataciones directas:', error);
        return res.status(500).json({
            mensaje: 'Error interno al obtener contrataciones directas',
            detalle: error.sqlMessage || error.message
        });
    }
};

const responderContratacion = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body; // 'aceptado' o 'rechazado'

        if (!['aceptado', 'rechazado'].includes(estado)) {
            return res.status(400).json({ mensaje: 'Estado no válido (debe ser aceptado o rechazado)' });
        }

        const [resultado] = await db.query(
            `UPDATE contrataciones_directas SET estado = ? WHERE id = ?`,
            [estado, id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Contratación directa no encontrada' });
        }

        return res.json({ ok: true, mensaje: `Contratación ${estado} con éxito` });
    } catch (error) {
        console.error('Error al responder contratación directa:', error);
        return res.status(500).json({
            mensaje: 'Error interno al responder contratación',
            detalle: error.sqlMessage || error.message
        });
    }
};

// ==========================================
// NUEVOS MÉTODOS: CIERRE DE SERVICIO, QR Y RESEÑAS
// ==========================================

const iniciarCierre = async (req, res) => {
    const { id } = req.params;
    const { metodo_pago, tecnico_id } = req.body;

    if (!metodo_pago || !['efectivo', 'tarjeta'].includes(metodo_pago)) {
        return res.status(400).json({ ok: false, mensaje: 'Método de pago inválido (debe ser efectivo o tarjeta)' });
    }

    try {
        const qrToken = `SERVIFY-SOL-${id}-${crypto.randomBytes(8).toString('hex')}`;
        const estadoPago = (metodo_pago === 'tarjeta') ? 'pagado' : 'pendiente';

        await db.query(
            `UPDATE solicitudes 
             SET estado = 'esperando_pago', 
                 tecnico_id = COALESCE(tecnico_id, ?), 
                 metodo_pago = ?, 
                 estado_pago = ?, 
                 codigo_qr_token = ? 
             WHERE id = ?`,
            [tecnico_id || null, metodo_pago, estadoPago, qrToken, id]
        );

        return res.json({
            ok: true,
            mensaje: 'Cierre iniciado exitosamente',
            qr_token: qrToken,
            metodo_pago,
            estado_pago: estadoPago
        });
    } catch (error) {
        console.error('Error al iniciar cierre:', error);
        return res.status(500).json({ ok: false, error: 'Error al iniciar cierre de servicio' });
    }
};

const validarQr = async (req, res) => {
    const { qr_token, tecnico_id } = req.body;

    if (!qr_token) {
        return res.status(400).json({ ok: false, mensaje: 'Código QR no proporcionado' });
    }

    try {
        const [rows] = await db.query(
            `SELECT * FROM solicitudes WHERE codigo_qr_token = ? AND estado = 'esperando_pago'`,
            [qr_token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Código QR inválido o expirado' });
        }

        const solicitud = rows[0];

        await db.query(
            `UPDATE solicitudes SET estado = 'completado', estado_pago = 'pagado' WHERE id = ?`,
            [solicitud.id]
        );

        return res.json({
            ok: true,
            mensaje: '¡Trabajo completado exitosamente!',
            solicitud_id: solicitud.id,
            cliente_id: solicitud.cliente_id,
            tecnico_id: solicitud.tecnico_id || tecnico_id
        });
    } catch (error) {
        console.error('Error al validar QR:', error);
        return res.status(500).json({ ok: false, error: 'Error al validar código QR' });
    }
};

const crearResena = async (req, res) => {
    const { autor_id, destinatario_id, solicitud_id, contratacion_directa_id, calificacion, comentario } = req.body;

    if (!autor_id || !destinatario_id || !calificacion) {
        return res.status(400).json({ ok: false, mensaje: 'autor_id, destinatario_id y calificacion son obligatorios' });
    }

    try {
        await db.query(
            `INSERT INTO resenas (autor_id, destinatario_id, solicitud_id, contratacion_directa_id, calificacion, comentario)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [autor_id, destinatario_id, solicitud_id || null, contratacion_directa_id || null, calificacion, comentario || '']
        );

        await db.query(
            `UPDATE usuarios 
             SET calificacion_promedio = (SELECT COALESCE(AVG(calificacion), 0.00) FROM resenas WHERE destinatario_id = ?)
             WHERE id = ?`,
            [destinatario_id, destinatario_id]
        );

        return res.json({ ok: true, mensaje: 'Reseña registrada con éxito' });
    } catch (error) {
        console.error('Error al crear reseña:', error);
        return res.status(500).json({ ok: false, error: 'Error al registrar reseña' });
    }
};

module.exports = {
    crearSolicitud,
    obtenerSolicitudes,
    obtenerMisSolicitudes,
    obtenerSolicitudPorId,
    crearContratacionDirecta,
    obtenerContratacionesTecnico,
    responderContratacion,
    iniciarCierre,
    validarQr,
    crearResena
};