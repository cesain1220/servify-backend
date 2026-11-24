const db = require('../db');

// 1. Obtener métricas reales para el Dashboard móvil
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

// 1B. Endpoint consolidado en vivo para el Dashboard Ejecutivo BI Web
exports.getDashboardBI = async (req, res) => {
  try {
    // A. Usuarios por rol y estado VIP
    const [[usuariosStats]] = await db.query(`
      SELECT 
        COUNT(*) AS total_usuarios,
        SUM(CASE WHEN LOWER(rol) = 'cliente' THEN 1 ELSE 0 END) AS total_clientes,
        SUM(CASE WHEN LOWER(rol) IN ('tecnico', 'trabajador', 'profesional', 'ambos') THEN 1 ELSE 0 END) AS total_tecnicos,
        SUM(CASE WHEN LOWER(rol) = 'admin' THEN 1 ELSE 0 END) AS total_admins,
        SUM(CASE WHEN LOWER(rol) IN ('tecnico', 'trabajador', 'profesional', 'ambos') AND es_vip = 1 THEN 1 ELSE 0 END) AS tecnicos_vip
      FROM usuarios
    `);

    // B. Ingresos reales desde suscripciones_vip (y fallback a pagos_servicios si aplica)
    let ingresosTotales = 0;
    let ingresosVip = 0;
    let ingresosEstandar = 0;
    let serieMensual = [];

    try {
      const [[revTotals]] = await db.query(`
        SELECT 
          COALESCE(SUM(monto), 0) AS total,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo_plan, 'vip')) LIKE '%vip%' OR LOWER(COALESCE(tipo_plan, '')) LIKE '%pro%' OR monto >= 6 THEN monto ELSE 0 END), 0) AS vip,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo_plan, '')) LIKE '%estandar%' OR LOWER(COALESCE(tipo_plan, '')) LIKE '%semanal%' OR monto < 6 THEN monto ELSE 0 END), 0) AS estandar
        FROM suscripciones_vip
        WHERE UPPER(COALESCE(estado, 'ACTIVA')) IN ('ACTIVA', 'COMPLETADA', 'PAGADO')
      `);
      ingresosTotales = Number(revTotals?.total || 0);
      ingresosVip = Number(revTotals?.vip || 0);
      ingresosEstandar = Number(revTotals?.estandar || 0);

      const [mensualRows] = await db.query(`
        SELECT 
          DATE_FORMAT(COALESCE(fecha_inicio, NOW()), '%Y-%m') AS ym,
          DATE_FORMAT(COALESCE(fecha_inicio, NOW()), '%b %Y') AS etiqueta,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo_plan, 'vip')) LIKE '%vip%' OR LOWER(COALESCE(tipo_plan, '')) LIKE '%pro%' OR monto >= 6 THEN monto ELSE 0 END), 0) AS vip,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo_plan, '')) LIKE '%estandar%' OR LOWER(COALESCE(tipo_plan, '')) LIKE '%semanal%' OR monto < 6 THEN monto ELSE 0 END), 0) AS estandar
        FROM suscripciones_vip
        GROUP BY ym, etiqueta
        ORDER BY ym ASC
        LIMIT 6
      `);
      serieMensual = mensualRows.map(r => ({
        ym: r.ym,
        etiqueta: r.etiqueta,
        vip: Number(r.vip || 0),
        estandar: Number(r.estandar || 0)
      }));
    } catch (subErr) {
      console.log('Aviso suscripciones_vip:', subErr.message);
    }

    // C. Solicitudes globales
    const [[solStats]] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN LOWER(estado) IN ('pendiente', 'directa') THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN LOWER(estado) IN ('en_proceso', 'aceptada', 'aceptado', 'esperando_pago', 'pendiente_pago', 'en_cierre') THEN 1 ELSE 0 END) AS en_proceso,
        SUM(CASE WHEN LOWER(estado) IN ('completada', 'completado') THEN 1 ELSE 0 END) AS completadas,
        SUM(CASE WHEN LOWER(estado) IN ('cancelada', 'cancelado', 'rechazada', 'rechazado') THEN 1 ELSE 0 END) AS canceladas
      FROM solicitudes
    `);

    // D. Demanda por categoría + Ticket promedio (para el gráfico de dona)
    const [categoriasDemanda] = await db.query(`
      SELECT 
        c.id,
        c.nombre,
        COUNT(s.id) AS total_solicitudes,
        ROUND(COALESCE(AVG(NULLIF(s.presupuesto_estimado, 0)), 0), 2) AS ticket_promedio
      FROM categorias c
      LEFT JOIN solicitudes s ON s.categoria_id = c.id
      GROUP BY c.id, c.nombre
      ORDER BY total_solicitudes DESC, c.nombre ASC
    `);

    // E. Calidad y reputación (Últimas reseñas reales)
    let resenasRecientes = [];
    let promedioGlobalRating = 5.0;
    let totalResenasBajas = 0;

    try {
      const [[ratingStats]] = await db.query(`
        SELECT 
          COALESCE(ROUND(AVG(calificacion), 1), 5.0) AS promedio,
          SUM(CASE WHEN calificacion <= 2 THEN 1 ELSE 0 END) AS bajas
        FROM resenas
      `);
      promedioGlobalRating = Number(ratingStats?.promedio || 5.0);
      totalResenasBajas = Number(ratingStats?.bajas || 0);

      const [resenasRows] = await db.query(`
        SELECT 
          r.id,
          r.solicitud_id,
          r.calificacion,
          r.comentario,
          r.creado_en,
          autor.nombre AS cliente_nombre,
          dest.nombre AS tecnico_nombre,
          s.estado AS solicitud_estado
        FROM resenas r
        JOIN usuarios autor ON r.autor_id = autor.id
        JOIN usuarios dest ON r.destinatario_id = dest.id
        LEFT JOIN solicitudes s ON r.solicitud_id = s.id
        ORDER BY r.creado_en DESC
        LIMIT 8
      `);

      resenasRecientes = resenasRows.map(r => ({
        id: Number(r.id),
        solicitud_id: r.solicitud_id ? Number(r.solicitud_id) : null,
        calificacion: Number(r.calificacion || 5),
        comentario: r.comentario || 'Sin comentario escrito.',
        cliente_nombre: r.cliente_nombre || 'Cliente',
        tecnico_nombre: r.tecnico_nombre || 'Técnico',
        solicitud_estado: r.solicitud_estado || 'completado',
        creado_en: r.creado_en
      }));
    } catch (revErr) {
      console.log('Aviso resenas BI:', revErr.message);
    }

    // F. Directorio operativo de técnicos reales
    const [tecnicosRows] = await db.query(`
      SELECT 
        u.id,
        u.nombre,
        u.es_vip,
        u.tipo_plan,
        COALESCE(u.calificacion_promedio, 5.0) AS calificacion_promedio,
        DATE_FORMAT(u.creado_en, '%Y-%m') AS ym_registro,
        COALESCE(c.nombre, 'General') AS categoria,
        (
          SELECT COUNT(*) 
          FROM postulaciones p 
          WHERE p.tecnico_id = u.id AND LOWER(p.estado) = 'aceptada'
        ) AS trabajos,
        (
          SELECT COUNT(*) 
          FROM solicitudes s2 
          JOIN postulaciones p2 ON p2.solicitud_id = s2.id
          WHERE p2.tecnico_id = u.id AND LOWER(p2.estado) = 'aceptada' AND LOWER(s2.estado) = 'en_proceso'
        ) AS activos
      FROM usuarios u
      LEFT JOIN tecnico_categorias tc ON tc.usuario_id = u.id
      LEFT JOIN categorias c ON c.id = tc.categoria_id
      WHERE LOWER(u.rol) IN ('tecnico', 'trabajador', 'profesional', 'ambos')
      GROUP BY u.id, u.nombre, u.es_vip, u.tipo_plan, u.calificacion_promedio, u.creado_en, c.nombre
      ORDER BY u.es_vip DESC, calificacion_promedio DESC
    `);

    const tecnicos = tecnicosRows.map(t => {
      const esVip = Number(t.es_vip) === 1;
      const planTexto = t.tipo_plan || (esVip ? 'VIP' : 'Estándar');
      const esSemanal = planTexto.toLowerCase().includes('semanal');
      const monto = esSemanal ? 3.99 : (esVip ? 6.99 : 3.99);

      return {
        id: Number(t.id),
        nombre: t.nombre || 'Sin nombre',
        categoria: t.categoria || 'General',
        plan: esVip ? (esSemanal ? 'Semanal' : 'VIP') : 'Estándar',
        es_vip: esVip,
        monto,
        solicitudes: Number(t.trabajos || 0),
        rating: Number(t.calificacion_promedio || 5.0),
        estado: Number(t.activos || 0) > 0 ? 'En proceso' : 'Disponible',
        ym: t.ym_registro || ''
      };
    });

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      kpis: {
        ingresos_totales: ingresosTotales,
        ingresos_vip: ingresosVip,
        ingresos_estandar: ingresosEstandar,
        total_usuarios: Number(usuariosStats?.total_usuarios || 0),
        total_clientes: Number(usuariosStats?.total_clientes || 0),
        total_tecnicos: Number(usuariosStats?.total_tecnicos || 0),
        total_admins: Number(usuariosStats?.total_admins || 0),
        tecnicos_vip: Number(usuariosStats?.tecnicos_vip || 0),
        total_solicitudes: Number(solStats?.total || 0),
        solicitudes_pendientes: Number(solStats?.pendientes || 0),
        solicitudes_en_proceso: Number(solStats?.en_proceso || 0),
        solicitudes_completadas: Number(solStats?.completadas || 0),
        solicitudes_canceladas: Number(solStats?.canceladas || 0),
        promedio_rating: promedioGlobalRating,
        resenas_bajas: totalResenasBajas
      },
      serie_mensual: serieMensual,
      categorias_demanda: categoriasDemanda.map(c => ({
        id: Number(c.id),
        nombre: c.nombre,
        total_solicitudes: Number(c.total_solicitudes || 0),
        ticket_promedio: Number(c.ticket_promedio || 0)
      })),
      resenas_recientes: resenasRecientes,
      tecnicos
    });
  } catch (error) {
    console.error('Error en getDashboardBI:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consolidar datos del Dashboard BI',
      detalle: error.message
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

// 5. Dar de baja o auditar una solicitud especificando el motivo al usuario
exports.cancelarSolicitudAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const razon = (motivo && motivo.trim()) ? motivo.trim() : 'Incumplimiento de normas de la comunidad';

    const [[solicitud]] = await db.query(
      'SELECT id, titulo, cliente_id, descripcion FROM solicitudes WHERE id = ?',
      [id]
    );

    if (!solicitud) {
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    }

    const nuevaDescripcion = `${solicitud.descripcion || ''}\n\n[Dada de baja por Administración — Motivo: ${razon}]`.trim();

    try {
      await db.query(
        'UPDATE solicitudes SET estado = ?, descripcion = ? WHERE id = ?',
        ['cancelado', nuevaDescripcion, id]
      );
    } catch (enumErr) {
      await db.query(
        'UPDATE solicitudes SET estado = ?, descripcion = ? WHERE id = ?',
        ['cancelada', nuevaDescripcion, id]
      );
    }

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
      mensaje: 'Solicitud dada de baja y usuario notificado',
      message: 'Solicitud dada de baja y usuario notificado'
    });
  } catch (error) {
    console.error('Error al moderar solicitud:', error);
    return res.status(500).json({
      success: false,
      mensaje: `Error al dar de baja: ${error.message}`,
      message: `Error al dar de baja: ${error.message}`
    });
  }
};