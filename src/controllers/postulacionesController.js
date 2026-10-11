const db = require('../db');

const crearPostulacion = async (req, res) => {
    try {
        const tecnico_id = req.usuario.id;
        const { solicitud_id, monto_propuesto, tiempo_estimado, mensaje } = req.body;

        if (!solicitud_id || !monto_propuesto || Number(monto_propuesto) <= 0) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }

        // Evitar que el mismo técnico se postule dos veces
        const [existe] = await db.query(
            'SELECT id FROM postulaciones WHERE solicitud_id = ? AND tecnico_id = ?',
            [solicitud_id, tecnico_id]
        );
        if (existe.length > 0) {
            return res.status(409).json({ mensaje: 'Ya te postulaste a esta solicitud' });
        }

        // No hay columna para el tiempo estimado, lo unimos al mensaje
        const mensajeFinal = `Tiempo estimado: ${tiempo_estimado || 'No indicado'}\n${mensaje || ''}`.trim();

        await db.query(
            `INSERT INTO postulaciones (solicitud_id, tecnico_id, monto_propuesto, mensaje, estado)
             VALUES (?, ?, ?, ?, 'pendiente')`,
            [solicitud_id, tecnico_id, monto_propuesto, mensajeFinal]
        );

        return res.status(200).json({ mensaje: 'Postulación enviada con éxito' });
    } catch (error) {
        console.error('Error al crear postulación:', error);
        return res.status(500).json({
            mensaje: 'Error interno al crear postulación',
            detalle: error.sqlMessage || error.message
        });
    }
};

module.exports = { crearPostulacion };