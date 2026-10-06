const db = require('../db');
const fs = require('fs');
const path = require('path');

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

// OBTENER TODOS LOS PROFESIONALES (CONSULTA DIRECTA A LA TABLA USUARIOS)
exports.getProfesionales = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                id,
                nombre AS nombreCompleto,
                COALESCE(biografia, 'Sin descripción disponible.') AS biografia,
                COALESCE(anos_experiencia, 0) AS anosExperiencia,
                COALESCE(calificacion_promedio, 5.0) AS calificacionPromedio,
                latitud,
                longitud,
                rol
             FROM usuarios 
             WHERE LOWER(rol) IN ('tecnico', 'profesional', 'ambos')`
        );

        const profesionales = rows.map(usuario => ({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: 'Técnico Especialista',
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

// OBTENER DETALLE INDIVIDUAL
exports.getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT 
                id,
                nombre AS nombreCompleto,
                COALESCE(biografia, 'Sin descripción disponible.') AS biografia,
                COALESCE(anos_experiencia, 0) AS anosExperiencia,
                COALESCE(calificacion_promedio, 5.0) AS calificacionPromedio,
                latitud,
                longitud,
                rol
             FROM usuarios 
             WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ mensaje: 'Profesional no encontrado' });
        }

        const usuario = rows[0];

        return res.json({
            id: Number(usuario.id),
            nombreCompleto: usuario.nombreCompleto || 'Sin nombre',
            oficio: 'Técnico Especialista',
            anosExperiencia: Number(usuario.anosExperiencia),
            calificacionPromedio: Number(usuario.calificacionPromedio),
            totalResenas: 0,
            biografia: usuario.biografia,
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

        // Ruta pública accesible (ej: /uploads/foto-123456.jpg)
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

        // 1. Verificar que la foto exista y pertenezca al técnico autenticado
        const [filas] = await db.query(
            'SELECT id, foto_url FROM portafolio_tecnico WHERE id = ? AND id_tecnico = ?',
            [fotoId, usuarioId]
        );

        if (filas.length === 0) {
            return res.status(404).json({ mensaje: 'Foto no encontrada o no tienes permiso para eliminarla' });
        }

        const rutaRelativa = filas[0].foto_url;

        // 2. Eliminar de la base de datos MySQL
        await db.query(
            'DELETE FROM portafolio_tecnico WHERE id = ? AND id_tecnico = ?',
            [fotoId, usuarioId]
        );

        // 3. Borrar el archivo físico del disco
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

        // 1. Obtener la información básica para validar el rol y la foto de perfil
        const [usuario] = await db.query(
            'SELECT rol, foto_url FROM usuarios WHERE id = ?',
            [usuarioId]
        );

        if (usuario.length === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const { rol, foto_url } = usuario[0];

        // 2. Si es técnico, buscar y borrar los archivos del portafolio
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
                // Si la tabla portafolio_tecnico aún no ha sido creada hoy, no detiene el proceso de borrado
                console.log('Aviso: Omisión del borrado físico del portafolio (la tabla aún no existe):', errorDb.message);
            }
        }

        // 3. Borrar la foto de perfil personal si tiene una distinta a la predeterminada
        if (foto_url && !foto_url.includes('default') && !foto_url.startsWith('http')) {
            const rutaFotoPerfil = path.join(__dirname, '../..', foto_url);
            if (fs.existsSync(rutaFotoPerfil)) {
                fs.unlinkSync(rutaFotoPerfil);
            }
        }

        // 4. Eliminar registros del portafolio de la base de datos
        try {
            await db.query('DELETE FROM portafolio_tecnico WHERE id_tecnico = ?', [usuarioId]);
        } catch (errCascade) {
            console.log('Tabla de portafolio sin registros o inexistente al purgar.');
        }

        // 5. Borrar el registro del usuario final de la base de datos
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