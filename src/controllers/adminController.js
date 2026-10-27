const db = require('../db'); 

// Obtener métricas para el Dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Conteo de usuarios por rol
    const [usuariosRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_usuarios,
        SUM(CASE WHEN LOWER(rol) = 'cliente' THEN 1 ELSE 0 END) AS total_clientes,
        SUM(CASE WHEN LOWER(rol) IN ('tecnico', 'trabajador') THEN 1 ELSE 0 END) AS total_tecnicos,
        SUM(CASE WHEN LOWER(rol) = 'admin' THEN 1 ELSE 0 END) AS total_admins
      FROM usuarios
    `);

    // 2. Conteo de solicitudes por estado
    const [solicitudesRows] = await db.query(`
      SELECT 
        COUNT(*) AS total_solicitudes,
        SUM(CASE WHEN LOWER(estado) = 'pendiente' THEN 1 ELSE 0 END) AS solicitudes_pendientes,
        SUM(CASE WHEN LOWER(estado) = 'en_proceso' THEN 1 ELSE 0 END) AS solicitudes_en_proceso,
        SUM(CASE WHEN LOWER(estado) = 'completada' THEN 1 ELSE 0 END) AS solicitudes_completadas,
        SUM(CASE WHEN LOWER(estado) = 'cancelada' THEN 1 ELSE 0 END) AS solicitudes_canceladas
      FROM solicitudes
    `);

    // 3. Conteo de categorías
    const [categoriasRows] = await db.query(`
      SELECT COUNT(*) AS total_categorias FROM categorias
    `);

    return res.status(200).json({
      success: true,
      data: {
        usuarios: usuariosRows[0] || {},
        solicitudes: solicitudesRows[0] || {},
        total_categorias: categoriasRows[0]?.total_categorias || 0
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
// Listar usuarios con buscador opcional
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
      query += ` AND LOWER(rol) = LOWER(?)`;
      params.push(rol);
    }

    query += ` ORDER BY creado_en DESC LIMIT 50`;

    const [usuarios] = await db.query(query, params);
    return res.status(200).json({ success: true, usuarios });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ success: false, message: 'Error en el servidor al cargar usuarios' });
  }
};

// Cambiar rol de un usuario (ascender a admin o cambiar entre cliente/técnico)
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

// Listar todas las solicitudes globales para moderación
exports.getSolicitudesAdmin = async (req, res) => {
  try {
    const query = `
      SELECT s.id, s.titulo, s.descripcion, s.estado, s.presupuesto_estimado, s.creado_en,
             u.nombre AS cliente_nombre, u.correo AS cliente_correo
      FROM solicitudes s
      JOIN usuarios u ON s.cliente_id = u.id
      ORDER BY s.creado_en DESC LIMIT 50
    `;
    const [solicitudes] = await db.query(query);
    return res.status(200).json({ success: true, solicitudes });
  } catch (error) {
    console.error('Error al obtener solicitudes admin:', error);
    return res.status(500).json({ success: false, message: 'Error al cargar solicitudes' });
  }
};

// Cancelar una solicitud sospechosa o fraudulenta
exports.cancelarSolicitudAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('UPDATE solicitudes SET estado = "cancelada" WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    }
    return res.status(200).json({ success: true, message: 'Solicitud cancelada por el administrador' });
  } catch (error) {
    console.error('Error al moderar solicitud:', error);
    return res.status(500).json({ success: false, message: 'Error al cancelar la solicitud' });
  }
};
