const db = require('../db');

exports.crearSolicitud = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        //se recibe la solitud con los datos
        const { categoria_id, titulo, descripcion, presupuesto_estimado } = req.body;

        if (!titulo || !descripcion || !categoria_id) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }

        // lo agregamos a la  bd
        await db.query(
            `INSERT INTO solicitudes 
            (cliente_id, categoria_id, titulo, descripcion, presupuesto_estimado, estado) 
            VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
            [cliente_id, categoria_id, titulo, descripcion, presupuesto_estimado || null]
        );

        return res.status(200).json({ mensaje: 'Solicitud creada con éxito' });
    } catch (error) {
        console.error('Error al crear solicitud:', error);
        return res.status(500).json({ mensaje: 'Error interno al crear solicitud' });
    }
};