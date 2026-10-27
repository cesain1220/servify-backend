const db = require('../db');
const cloudinary = require('../cloudinary');

const MAX_FOTOS = 5;

const subirBuffer = (buffer) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        {
            folder: 'servify/solicitudes',
            resource_type: 'image',
            transformation: [
                { width: 1280, height: 1280, crop: 'limit' },
                { quality: 'auto', fetch_format: 'auto' }
            ]
        },
        (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
});

const subirFotosSolicitud = async (req, res) => {
    try {
        const { id } = req.params;
        const archivos = req.files || [];

        if (archivos.length === 0) {
            return res.status(400).json({ mensaje: 'No se recibieron fotos' });
        }

        const [sol] = await db.query('SELECT cliente_id FROM solicitudes WHERE id = ?', [id]);
        if (sol.length === 0) return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
        if (sol[0].cliente_id !== req.usuario.id) {
            return res.status(403).json({ mensaje: 'No es tu solicitud' });
        }

        const [[{ total }]] = await db.query(
            'SELECT COUNT(*) AS total FROM fotos_solicitud WHERE solicitud_id = ?', [id]
        );
        if (total + archivos.length > MAX_FOTOS) {
            return res.status(409).json({ mensaje: `Máximo ${MAX_FOTOS} fotos por solicitud` });
        }

        const resultados = await Promise.all(archivos.map(f => subirBuffer(f.buffer)));
        const filas = resultados.map(r => [Number(id), r.secure_url]);

        await db.query('INSERT INTO fotos_solicitud (solicitud_id, foto_url) VALUES ?', [filas]);

        return res.json({ mensaje: 'Fotos subidas con éxito' });
    } catch (error) {
        console.error('Error al subir fotos:', error);
        return res.status(500).json({
            mensaje: 'Error interno al subir las fotos',
            detalle: error.sqlMessage || error.message
        });
    }
};

module.exports = { subirFotosSolicitud };