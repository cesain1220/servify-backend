const db = require('../db');

// GET: Obtener datos del perfil actual
exports.obtenerPerfil = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const [rows] = await db.query(
            'SELECT id, nombre, correo, telefono, direccion_texto, foto_url, rol FROM usuarios WHERE id = ?',
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


//esta parte de abajo ees para cuando un cliente ve el perfil   de un trabajador y lo puede contratar


exports.getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;

        // Consultamos la tabla usuarios
        const [rows] = await db.query(
            `SELECT 
        id,
        nombre AS nombreCompleto,
        calificacion_promedio AS calificacionPromedio,
        rol
       FROM usuarios 
       WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Profesional no encontrado' });
        }

        const usuario = rows[0];

        // Devolvemos el formato exacto que espera Android
        res.json({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: usuario.rol === 'trabajador' ? 'Técnico Especialista' : 'Profesional',
            anosExperiencia: 3, // Puedes ajustar este valor si tienes otra tabla o columna
            calificacionPromedio: Number(usuario.calificacionPromedio || 5.0),
            totalResenas: 0,
            biografia: 'Profesional registrado en la plataforma listo para atender servicios.',
            tarifaHora: 15.0
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor', error: error.message });
    }
};

