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


// OBTENER TODOS LOS PROFESIONALES/TÉCNICOS PARA EL HOME
exports.getProfesionales = async (req, res) => {
    try {
        // Filtramos para traer solo a los usuarios que sean técnicos/profesionales
        const [rows] = await db.query(
            `SELECT 
                id,
                nombre AS nombreCompleto,
                calificacion_promedio AS calificacionPromedio,
                rol
            FROM usuarios 
            WHERE rol = 'tecnico' OR rol = 'profesional'`
        );

        // Mapeamos al formato exacto que espera ProfesionalPerfil en Android
        const profesionales = rows.map(usuario => ({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: 'Técnico Especialista',
            anosExperiencia: 3,
            calificacionPromedio: Number(usuario.calificacionPromedio || 5.0),
            totalResenas: 0,
            biografia: 'Profesional registrado en la plataforma listo para atender servicios.',
            tarifaHora: 15.0
        }));

        return res.status(200).json(profesionales);
    } catch (error) {
        console.error('Error al listar profesionales:', error);
        return res.status(500).json({ mensaje: 'Error al obtener profesionales', error: error.message });
    }
};

// OBTENER EL PERFIL INDIVIDUAL (DetalleTecnico)
exports.getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;

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

        res.json({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: 'Profesional', // Corregido: texto en vez de booleano
            anosExperiencia: 3,
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