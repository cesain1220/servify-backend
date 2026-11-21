const db = require('../db');

// 1. Obtener métricas reales para el Dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const [usuariosRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_usuarios,
        SUM(CASE WHEN LOWER(rol) = 'cliente' THEN 1 ELSE 0 END) AS total_clientes,
        SUM(CASE WHEN LOWER(rol) IN ('tecnico', 'trabajador', 'profesional', 'ambos') THEN 1 ELSE 0 END) AS total_tecnicos,
        SUM(CASE WHEN LOWER(rol) = 'admin' THEN 1 ELSE 0 END) AS total_admins
      FROM usuarios
    `);

    const [solicitudesRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_solicitudes,
        SUM(CASE WHEN LOWER(estado) = 'pendiente' THEN 1 ELSE 0 END) AS solicitudes_pendientes,
        SUM(CASE WHEN LOWER(estado) IN ('en_proceso', 'aceptada', 'esperando_pago') THEN 1 ELSE 0 END) AS solicitudes_en_proceso,
        SUM(CASE WHEN LOWER(estado) IN ('completada', 'completado') THEN 1 ELSE 0 END) AS solicitudes_completadas,
        SUM(CASE WHEN LOWER(estado) IN ('cancelada', 'cancelado') THEN 1 ELSE 0 END) AS solicitudes_canceladas
      FROM solicitudes
    `);

    const [categoriasRows] = await db.query(`
      SELECT COUNT(*) AS total_categorias FROM categorias
    `);

    return res.status(200).json({
      success: true,
      data: {
        usuarios: {
          total_usuarios: Number(usuariosRows[0]?.total_usuarios || 0),
          total_clientes: Number(usuariosRows[0]?.total_clientes || 0),
          total_tecnicos: Number(usuariosRows[0]?.total_tecnicos || 0),
          total_admins: Number(usuariosRows[0]?.total_admins || 0)
        },
        solicitudes: {
          total_solicitudes: Number(solicitudesRows[0]?.total_solicitudes || 0),
          solicitudes_pendientes: Number(solicitudesRows[0]?.solicitudes_pendientes || 0),
          solicitudes_en_proceso: Number(solicitudesRows[0]?.solicitudes_en_proceso || 0),
          solicitudes_completadas: Number(solicitudesRows[0]?.solicitudes_completadas || 0),
          solicitudes_canceladas: Number(solicitudesRows[0]?.solicitudes_canceladas || 0)
        },
        total_categorias: Number(categoriasRows[0]?.total_categorias || 0)
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en el servidor al cargar métricas'
    });
  }
};

// 2. Listar usuarios con buscador y filtro de rol
exports.getUsuarios = async (req, res) => {
  try {
    const { busqueda = '', rol = '' } = req.query;
    let query = `
      SELECT id, nombre, correo, telefono, rol, creado_en
      FROM usuarios
      WHERE 1=1
    `;
    const params = [];

    if (busqueda.trim()) {
      query += ` AND (nombre LIKE ? OR correo LIKE ?)`;
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    if (rol.trim()) {
      if (rol.toLowerCase() === 'tecnico') {
        query += ` AND LOWER(rol) IN ('tecnico', 'trabajador', 'profesional', 'ambos')`;
      } else {
        query += ` AND LOWER(rol) = LOWER(?)`;
        params.push(rol);
      }
    }

    query += ` ORDER BY creado_en DESC LIMIT 100`;

    const [usuarios] = await db.query(query, params);
    return res.status(200).json({ success: true, usuarios });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ success: false, message: 'Error en el servidor al cargar usuarios' });
  }
};

// 3. Cambiar rol de un usuario
exports.cambiarRolUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevoRol } = req.body;

    const rolesValidos = ['cliente', 'tecnico', 'trabajador', 'admin'];
    if (!nuevoRol || !rolesValidos.includes(nuevoRol.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Rol inválido' });
    }

    const [result] = await db.query('UPDATE usuarios SET rol = ? WHERE id = ?', [nuevoRol.toLowerCase(), id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    return res.status(200).json({ success: true, message: `Rol actualizado a ${nuevoRol} correctamente` });
  } catch (error) {
    console.error('Error al cambiar rol:', error);
    return res.status(500).json({ success: false, message: 'Error al cambiar rol del usuario' });
  }
};

// 4. Listar solicitudes globales con categoría y filtro opcional
exports.getSolicitudesAdmin = async (req, res) => {
  try {
    const { categoria = '' } = req.query;
    let query = `
      SELECT s.id, s.titulo, s.descripcion, s.estado, s.presupuesto_estimado, s.creado_en,
             s.cliente_id, u.nombre AS cliente_nombre, u.correo AS cliente_correo,
             c.id AS categoria_id, COALESCE(c.nombre, 'General') AS categoria_nombre
      FROM solicitudes s
      JOIN usuarios u ON s.cliente_id = u.id
      LEFT JOIN categorias c ON s.categoria_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (categoria.trim()) {
      query += ` AND LOWER(c.nombre) = LOWER(?)`;
      params.push(categoria.trim());
    }

    query += ` ORDER BY s.creado_en DESC LIMIT 100`;

    const [solicitudes] = await db.query(query, params);
    return res.status(200).json({ success: true, solicitudes });
  } catch (error) {
    console.error('Error al obtener solicitudes admin:', error);
    return res.status(500).json({ success: false, message: 'Error al cargar solicitudes' });
  }
};

// 5. Dar de baja una solicitud especificando el motivo al usuario
exports.cancelarSolicitudAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const razon = (motivo && motivo.trim()) ? motivo.trim() : 'Incumplimiento de normas de la comunidad';

    // Buscamos la solicitud y el dueño antes de actualizar
    const [[solicitud]] = await db.query(
      'SELECT id, titulo, cliente_id, descripcion FROM solicitudes WHERE id = ?',
      [id]
    );

    if (!solicitud) {
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    }

    const nuevaDescripcion = `${solicitud.descripcion || ''}\n\n[Dada de baja por Administración — Motivo: ${razon}]`.trim();

    await db.query(
      'UPDATE solicitudes SET estado = "cancelada", descripcion = ? WHERE id = ?',
      [nuevaDescripcion, id]
    );

    // Intentamos guardar notificación al usuario (si existe la tabla notificaciones)
    try {
      await db.query(
        `INSERT INTO notificaciones (usuario_id, titulo, mensaje, leida, creado_en)
         VALUES (?, ?, ?, 0, NOW())`,
        [
          solicitud.cliente_id,
          'Solicitud dada de baja',
          `Tu publicación "${solicitud.titulo}" fue dada de baja por un administrador. Motivo: ${razon}`
        ]
      );
    } catch (notifErr) {
      console.log('Aviso: notificación no insertada en tabla (motivo ya guardado en solicitud):', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Solicitud dada de baja y usuario notificado'
    });
  } catch (error) {
    console.error('Error al moderar solicitud:', error);
    return res.status(500).json({ success: false, message: 'Error al dar de baja la solicitud' });
  }
};