const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
    crearSolicitud, obtenerSolicitudes, obtenerMisSolicitudes, obtenerSolicitudPorId
} = require('../controllers/solicitudesController');
const { subirFotosSolicitud } = require('../controllers/fotosController');
const authMiddleware = require('../middlewares/authMiddleware');

// Las fotos se reciben en memoria y se mandan directo a Cloudinary
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Solo se permiten imágenes'));
    }
});

const recibirFotos = (req, res, next) => {
    upload.array('fotos', 5)(req, res, (err) => {
        if (err) return res.status(400).json({ mensaje: err.message });
        next();
    });
};

router.post('/', authMiddleware, crearSolicitud);
router.get('/', authMiddleware, obtenerSolicitudes);
router.get('/mias', authMiddleware, obtenerMisSolicitudes);
router.post('/:id/fotos', authMiddleware, recibirFotos, subirFotosSolicitud);
router.get('/:id', authMiddleware, obtenerSolicitudPorId);

module.exports = router;