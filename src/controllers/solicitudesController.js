const db = require('../db');

const crearSolicitud = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        const { categoria_id, titulo, descripcion, presupuesto, latitud, longitud, direccion_texto } = req.body;

        if (!titulo || !descripcion || !categoria_id) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }

        await db.query(
            `INSERT INTO solicitudes 
            (cliente_id, categoria_id, titulo, descripcion, presupuesto_estimado, latitud, longitud, direccion_texto, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
            [cliente_id, categoria_id, titulo, descripcion, presupuesto || null,
                latitud ?? 0, longitud ?? 0, direccion_texto || '']
        );

        return res.status(200).json({ mensaje: 'Solicitud creada con éxito' });
    } catch (error) {
        console.error('Error al crear solicitud:', error);
        return res.status(500).json({ mensaje: 'Error interno al crear solicitud' });
    }
};

const obtenerSolicitudes = async (req, res) => {
    try {
        let lat = parseFloat(req.query.lat);
        let lng = parseFloat(req.query.lng);

        // Si la app no manda ubicación, usamos la guardada del técnico en la BD
        if (isNaN(lat) || isNaN(lng)) {
            const [[tecnico]] = await db.query(
                'SELECT latitud, longitud FROM usuarios WHERE id = ?',
                [req.usuario.id]
            );
            lat = parseFloat(tecnico?.latitud);
            lng = parseFloat(tecnico?.longitud);
        }

        const tieneUbicacion = !isNaN(lat) && !isNaN(lng);

        const distanciaSql = tieneUbicacion
            ? `(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.latitud)) *
                COS(RADIANS(s.longitud) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(s.latitud)))))`
            : `NULL`;
        const params = tieneUbicacion ? [lat, lng, lat] : [];

        const [rows] = await db.query(
            `SELECT s.id, s.cliente_id, u.nombre AS cliente_nombre,
                    c.nombre AS categoria_nombre, s.titulo, s.descripcion,
                    s.presupuesto_estimado, s.creado_en,
                    ${distanciaSql} AS distancia_km
             FROM solicitudes s
             JOIN usuarios u ON u.id = s.cliente_id
             JOIN categorias c ON c.id = s.categoria_id
             WHERE s.estado = 'PENDIENTE'
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

module.exports = { crearSolicitud, obtenerSolicitudes };