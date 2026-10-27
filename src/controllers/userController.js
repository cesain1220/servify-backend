const db = require('../db');
const fs = require('fs');
const path = require('path');

// GET: Obtener datos del perfil actual (con su oficio si es técnico)
exports.obtenerPerfil = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const [rows] = await db.query(
            `SELECT 
                u.id, 
                u.nombre, 
                u.correo, 
                u.telefono, 
                u.foto_url, 
                u.rol, 
                u.direccion_texto, 
                u.latitud, 
                u.longitud, 
                u.es_vip, 
                u.calificacion_promedio, 
                u.biografia, 
                u.anos_experiencia,
                COALESCE(c.nombre, 'Técnico Especialista') AS especialidad,
                COALESCE(c.nombre, 'Técnico Especialista') AS oficio,
                c.id AS categoria_id
             FROM usuarios u
             LEFT JOIN tecnico_categorias tc ON u.id = tc.usuario_id
             LEFT JOIN categorias c ON tc.categoria_id = c.id
             WHERE u.id = ?
             LIMIT 1`,
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
        const { nombre, telefono, direccion_texto, biografia, anos_experiencia } = req.body;

        if (!nombre) {
            return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
        }
        if (biografia && biografia.length > 500) {
            return res.status(400).json({ mensaje: 'La descripción no puede pasar de 500 caracteres' });
        }
        if (anos_experiencia != null && (anos_experiencia < 0 || anos_experiencia > 60)) {
            return res.status(400).json({ mensaje: 'Años de experiencia no válidos' });
        }

        await db.query(
            `UPDATE usuarios
             SET nombre = ?, telefono = ?, direccion_texto = ?,
                 biografia = COALESCE(?, biografia),
                 anos_experiencia = COALESCE(?, anos_experiencia)
             WHERE id = ?`,
            [nombre.trim(), telefono || null, direccion_texto || null,
            biografia != null ? biografia.trim() : null,
            anos_experiencia ?? null, usuarioId]
        );

        return res.status(200).json({ mensaje: 'Perfil actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        return res.status(500).json({ mensaje: 'Error interno al guardar los cambios' });
    }
};

// OBTENER TODOS LOS PROFESIONALES (CONSULTA DINÁMICA CON CATEGORÍA)
exports.getProfesionales = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                u.id,
                u.nombre AS nombreCompleto,
                COALESCE(u.biografia, 'Sin descripción disponible.') AS biografia,
                COALESCE(u.anos_experiencia, 0) AS anosExperiencia,
                COALESCE(u.calificacion_promedio, 5.0) AS calificacionPromedio,
                u.latitud,
                u.longitud,
                u.rol,
                COALESCE(c.nombre, 'Técnico Especialista') AS oficio,
                COALESCE(c.nombre, 'Técnico Especialista') AS especialidad,
                c.id AS categoriaId
             FROM usuarios u
             LEFT JOIN tecnico_categorias tc ON u.id = tc.usuario_id
             LEFT JOIN categorias c ON tc.categoria_id = c.id
             WHERE LOWER(u.rol) IN ('tecnico', 'profesional', 'ambos')`
        );

        const profesionales = rows.map(usuario => ({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: usuario.oficio,
            especialidad: usuario.especialidad,
            categoriaId: usuario.categoriaId ? Number(usuario.categoriaId) : null,
            anosExperiencia: Number(usuario.anosExperiencia),
            calificacionPromedio: Number(usuario.calificacionPromedio),
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

// OBTENER DETALLE INDIVIDUAL (PANTALLA DE PERFIL DEL TÉCNICO)
exports.getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT 
                u.id,
                u.nombre AS nombreCompleto,
                u.biografia,
                COALESCE(u.anos_experiencia, 0) AS anosExperiencia,
                COALESCE(u.calificacion_promedio, 0) AS calificacionPromedio,
                u.es_vip AS esVip,
                u.latitud,
                u.longitud,
                u.rol,
                COALESCE(c.nombre, 'Técnico Especialista') AS oficio,
                COALESCE(c.nombre, 'Técnico Especialista') AS especialidad,
                c.id AS categoriaId
             FROM usuarios u
             LEFT JOIN tecnico_categorias tc ON u.id = tc.usuario_id
             LEFT JOIN categorias c ON tc.categoria_id = c.id
             WHERE u.id = ?
             LIMIT 1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Profesional no encontrado' });
        }
        const usuario = rows[0];

        // Todas las especialidades del técnico (chips)
        const [esp] = await db.query(
            `SELECT c.nombre FROM tecnico_categorias tc
             JOIN categorias c ON c.id = tc.categoria_id
             WHERE tc.usuario_id = ?`,
            [id]
        );

        // Trabajos completados
        const [[{ completados }]] = await db.query(
            `SELECT COUNT(*) AS completados
             FROM postulaciones p
             JOIN solicitudes s ON s.id = p.solicitud_id
             WHERE p.tecnico_id = ? AND p.estado = 'aceptada' AND s.estado = 'completado'`,
            [id]
        );

        // Reseñas: si la tabla tiene otras columnas, no rompe el perfil
        let totalResenas = 0;
        let promedio = Number(usuario.calificacionPromedio);
        try {
            const [[r]] = await db.query(
                'SELECT COUNT(*) AS total, AVG(calificacion) AS promedio FROM resenas WHERE destinatario_id = ?',
                [id]
            );
            totalResenas = Number(r.total);
            if (totalResenas > 0) promedio = Number(r.promedio);
        } catch (e) {
            console.log('Aviso: no se pudo leer reseñas:', e.message);
        }

        let resenas = [];
        try {
            const [rows2] = await db.query(
                `SELECT r.id, r.calificacion, r.comentario, r.creado_en, u.nombre AS autorNombre
                 FROM resenas r
                 JOIN usuarios u ON u.id = r.autor_id
                 WHERE r.destinatario_id = ?
                 ORDER BY r.creado_en DESC
                 LIMIT 3`,
                [id]
            );
            resenas = rows2.map(x => ({
                id: x.id,
                calificacion: x.calificacion,
                comentario: x.comentario,
                autorNombre: x.autorNombre,
                creadoEn: x.creado_en
            }));
        } catch (e) {
            console.log('Aviso: no se pudieron leer las reseñas:', e.message);
        }


        return res.json({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: usuario.oficio,
            especialidad: usuario.especialidad,
            categoriaId: usuario.categoriaId ? Number(usuario.categoriaId) : null,
            anosExperiencia: Number(usuario.anosExperiencia),
            calificacionPromedio: promedio,
            totalResenas,
            resenas,
            biografia: usuario.biografia,
            esVip: Number(usuario.esVip) || 0,
            trabajosCompletados: Number(completados),
            especialidades: esp.map(e => e.nombre),
            latitud: usuario.latitud !== null ? Number(usuario.latitud) : null,
            longitud: usuario.longitud !== null ? Number(usuario.longitud) : null
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        return res.status(500).json({ mensaje: 'Error interno del servidor', error: error.message });
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

// ========================================================
// 2. PORTAFOLIO DE TRABAJOS (EXCLUSIVO TÉCNICOS)
// ========================================================

// GET: Obtener todas las fotos del portafolio del técnico
exports.obtenerPortafolio = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const [fotos] = await db.query(
            'SELECT id, foto_url, fecha_subida FROM portafolio_tecnico WHERE id_tecnico = ? ORDER BY fecha_subida DESC',
            [usuarioId]
        );
        return res.status(200).json(fotos);
    } catch (error) {
        console.error('Error al obtener portafolio:', error);
        return res.status(500).json({ mensaje: 'Error al consultar portafolio' });
    }
};

// POST: Subir una nueva foto al portafolio
exports.subirFotoPortafolio = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        if (!req.file) {
            return res.status(400).json({ mensaje: 'No se envió ninguna imagen' });
        }

        const fotoUrl = `/uploads/${req.file.filename}`;

        const [resultado] = await db.query(
            'INSERT INTO portafolio_tecnico (id_tecnico, foto_url) VALUES (?, ?)',
            [usuarioId, fotoUrl]
        );

        return res.status(201).json({
            mensaje: 'Foto agregada exitosamente',
            foto: {
                id: resultado.insertId,
                foto_url: fotoUrl
            }
        });
    } catch (error) {
        console.error('Error al subir foto:', error);
        return res.status(500).json({ mensaje: 'Error al guardar la foto en el portafolio' });
    }
};

// DELETE: Eliminar una foto específica del portafolio
exports.eliminarFotoPortafolio = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const { fotoId } = req.params;

        const [filas] = await db.query(
            'SELECT id, foto_url FROM portafolio_tecnico WHERE id = ? AND id_tecnico = ?',
            [fotoId, usuarioId]
        );

        if (filas.length === 0) {
            return res.status(404).json({ mensaje: 'Foto no encontrada o no tienes permiso para eliminarla' });
        }

        const rutaRelativa = filas[0].foto_url;

        await db.query(
            'DELETE FROM portafolio_tecnico WHERE id = ? AND id_tecnico = ?',
            [fotoId, usuarioId]
        );

        const rutaFisica = path.join(__dirname, '../..', rutaRelativa);
        if (fs.existsSync(rutaFisica)) {
            fs.unlinkSync(rutaFisica);
        }

        return res.status(200).json({ mensaje: 'Foto eliminada con éxito' });
    } catch (error) {
        console.error('Error al eliminar foto:', error);
        return res.status(500).json({ mensaje: 'Error al eliminar la foto' });
    }
};

// ========================================================
// 3. ELIMINAR CUENTA (CLIENTE Y TÉCNICO) - Requerido Google Play
// ========================================================

// DELETE: Eliminar cuenta por completo y todos sus datos/archivos asociados
exports.eliminarCuenta = async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        const [usuario] = await db.query(
            'SELECT rol, foto_url FROM usuarios WHERE id = ?',
            [usuarioId]
        );

        if (usuario.length === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const { rol, foto_url } = usuario[0];

        if (rol === 'tecnico' || rol === 'prestador') {
            try {
                const [fotosPortafolio] = await db.query(
                    'SELECT foto_url FROM portafolio_tecnico WHERE id_tecnico = ?',
                    [usuarioId]
                );

                fotosPortafolio.forEach(foto => {
                    const rutaFoto = path.join(__dirname, '../..', foto.foto_url);
                    if (fs.existsSync(rutaFoto)) {
                        fs.unlinkSync(rutaFoto);
                    }
                });
            } catch (errorDb) {
                console.log('Aviso: Omisión del borrado físico del portafolio (la tabla aún no existe):', errorDb.message);
            }
        }

        if (foto_url && !foto_url.includes('default') && !foto_url.startsWith('http')) {
            const rutaFotoPerfil = path.join(__dirname, '../..', foto_url);
            if (fs.existsSync(rutaFotoPerfil)) {
                fs.unlinkSync(rutaFotoPerfil);
            }
        }

        try {
            await db.query('DELETE FROM portafolio_tecnico WHERE id_tecnico = ?', [usuarioId]);
        } catch (errCascade) {
            console.log('Tabla de portafolio sin registros o inexistente al purgar.');
        }

        const [resultado] = await db.query('DELETE FROM usuarios WHERE id = ?', [usuarioId]);

        if (resultado.affectedRows === 0) {
            return res.status(400).json({ mensaje: 'No se pudo eliminar el usuario' });
        }

        console.log(`Usuario con ID ${usuarioId} (${rol}) eliminado de forma permanente.`);

        return res.status(200).json({
            mensaje: 'Tu cuenta, historial y todos tus archivos han sido eliminados de forma permanente de Servify.'
        });

    } catch (error) {
        console.error('Error al eliminar cuenta:', error);
        return res.status(500).json({ mensaje: 'Error interno al procesar la eliminación de la cuenta' });
    }
};