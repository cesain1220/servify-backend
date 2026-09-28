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


// Obtener perfil del profesional / usuario por ID
exports.getUserProfile = async (req, res) => {
    // Datos directos para probar que la pantalla y la conexión funcionen
    res.json({
        id: 1,
        nombreCompleto: "Carlos Mendoza",
        oficio: "Electricista Certificado",
        anosExperiencia: 5,
        calificacionPromedio: 4.8,
        totalResenas: 12,
        biografia: "Especialista en instalaciones residenciales y comerciales. Reparación de cortocircuitos y mantenimiento general.",
        tarifaHora: 15.0
    });
};

