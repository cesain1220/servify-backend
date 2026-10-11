const db = require('../db');

const crearSolicitud = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        const { categoria_id, titulo, descripcion, presupuesto, latitud, longitud, direccion_texto } = req.body;

        console.log('DEBUG:', { cliente_id, categoria_id, titulo, descripcion, presupuesto, usuario: req.usuario });

        if (!titulo || !descripcion || !categoria_id) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
        }

        await db.query(
            `INSERT INTO solicitudes 
            (cliente_id, categoria_id, titulo, descripcion, presupuesto_estimado, latitud, longitud, direccion_texto, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
            [
                cliente_id,
                categoria_id,
                titulo,
                descripcion,
                presupuesto || null,
                latitud ?? 0,
                longitud ?? 0,
                direccion_texto || ''
            ]
        );

        return res.status(200).json({ mensaje: 'Solicitud creada con éxito' });
    } catch (error) {
        console.error('Error al crear solicitud:', error);
        return res.status(500).json({
            mensaje: 'Error interno al crear solicitud',
            detalle: error.sqlMessage || error.message,
            codigo: error.code
        });
    }
};

module.exports = {
    crearSolicitud
};