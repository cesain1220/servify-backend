const db = require('../db');

// GET: Obtener datos del perfil actual
exports.obtenerPerfil = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const [rows] = await db.query(
            `SELECT id, nombre, correo, telefono, foto_url, rol, direccion_texto, 
                    latitud, longitud, es_vip, calificacion_promedio, biografia, anos_experiencia 
             FROM usuarios WHERE id = ?`,
            [usuarioId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        return res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        return res.status(500).json({ mensaje: 'Error al consultar datos del perfil' });
    }
};

// PUT: Actualizar datos editables
exports.actualizarPerfil = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const { nombre, telefono, direccion_texto } = req.body;

        if (!nombre) {
            return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
        }

        await db.query(
            'UPDATE usuarios SET nombre = ?, telefono = ?, direccion_texto = ? WHERE id = ?',
            [nombre.trim(), telefono || null, direccion_texto || null, usuarioId]
        );

        return res.status(200).json({ mensaje: 'Perfil actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        return res.status(500).json({ mensaje: 'Error interno al guardar los cambios' });
    }
};

// OBTENER TODOS LOS PROFESIONALES (CON COORDENADAS)
exports.getProfesionales = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                u.id,
                u.nombre AS nombreCompleto,
                COALESCE(c.nombre, 'Técnico Especialista') AS oficio,
                u.calificacion_promedio AS calificacionPromedio,
                COALESCE(u.biografia, 'Sin descripción disponible.') AS biografia,
                COALESCE(u.anos_experiencia, 0) AS anosExperiencia,
                u.latitud,
                u.longitud,
                u.rol
            FROM usuarios u
            LEFT JOIN tecnico_categorias tc ON u.id = tc.usuario_id
            LEFT JOIN categorias c ON tc.categoria_id = c.id
            WHERE u.rol = 'tecnico' OR u.rol = 'profesional' OR u.rol = 'ambos'
            GROUP BY u.id`
        );

        const profesionales = rows.map(usuario => ({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: usuario.oficio,
            anosExperiencia: Number(usuario.anosExperiencia),
            calificacionPromedio: Number(usuario.calificacionPromedio || 5.0),
            totalResenas: 0,
            biografia: usuario.biografia,
            latitud: usuario.latitud !== null ? Number(usuario.latitud) : null,
            longitud: usuario.longitud !== null ? Number(usuario.longitud) : null
        }));

        return res.status(200).json(profesionales);
    } catch (error) {
        console.error('Error al listar profesionales:', error);
        return res.status(500).json({ mensaje: 'Error al obtener profesionales', error: error.message });
    }
};

// OBTENER DETALLE INDIVIDUAL (CON COORDENADAS)
exports.getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT 
                u.id,
                u.nombre AS nombreCompleto,
                COALESCE(c.nombre, 'Técnico Especialista') AS oficio,
                u.calificacion_promedio AS calificacionPromedio,
                COALESCE(u.biografia, 'Sin descripción disponible.') AS biografia,
                COALESCE(u.anos_experiencia, 0) AS anosExperiencia,
                u.latitud,
                u.longitud,
                u.rol
            FROM usuarios u
            LEFT JOIN tecnico_categorias tc ON u.id = tc.usuario_id
            LEFT JOIN categorias c ON tc.categoria_id = c.id
            WHERE u.id = ?
            GROUP BY u.id`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Profesional no encontrado' });
        }

        const usuario = rows[0];

        res.json({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: usuario.oficio,
            anosExperiencia: Number(usuario.anosExperiencia),
            calificacionPromedio: Number(usuario.calificacionPromedio || 5.0),
            totalResenas: 0,
            biografia: usuario.biografia,
            latitud: usuario.latitud !== null ? Number(usuario.latitud) : null,
            longitud: usuario.longitud !== null ? Number(usuario.longitud) : null
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor', error: error.message });
    }
};

// Cambiar estado VIP
exports.cambiarEstadoVip = async (req, res) => {
    try {
        const { id } = req.params;
        const { es_vip } = req.body;

        await db.query(
            'UPDATE usuarios SET es_vip = ? WHERE id = ?',
            [es_vip ? 1 : 0, id]
        );

        return res.status(200).json({
            mensaje: es_vip ? 'Plan PRO activado' : 'Plan PRO cancelado',
            es_vip: Boolean(es_vip)
        });
    } catch (error) {
        console.error('Error al actualizar estado VIP:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor' });
    } 
};