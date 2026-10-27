const db = require('../db');

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

        return res.status(200).json({
            mensaje: 'Solicitud creada v2',
            id: resultado.insertId
        });
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
        const [rows] = await db.query(
            `SELECT s.id, s.titulo, s.descripcion, s.presupuesto_estimado, s.estado, s.creado_en,
                    c.nombre AS categoria_nombre,
                    (SELECT COUNT(*) FROM postulaciones p
                      WHERE p.solicitud_id = s.id AND p.estado IN ('pendiente','aceptada')) AS total_propuestas
             FROM solicitudes s
             JOIN categorias c ON c.id = s.categoria_id
             WHERE s.cliente_id = ?
             ORDER BY s.creado_en DESC`,
            [req.usuario.id]
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
                    u.calificacion_promedio AS cliente_calificacion,
                    c.nombre AS categoria_nombre, s.titulo, s.descripcion,
                    s.presupuesto_estimado, s.direccion_texto, s.estado, s.creado_en,
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

module.exports = { crearSolicitud, obtenerSolicitudes, obtenerMisSolicitudes, obtenerSolicitudPorId };