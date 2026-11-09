const express = require('express');
const multer = require('multer');
const router = express.Router();
const userController = require('../controllers/userController');
const verificarToken = require('../middlewares/authMiddleware');

// Las fotos se reciben en memoria y se mandan a Cloudinary
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Solo se permiten imágenes'));
    }
});

const recibirFoto = (req, res, next) => {
    upload.single('foto')(req, res, (err) => {
        if (err) return res.status(400).json({ mensaje: err.message });
        next();
    });
};

// Perfil propio
router.get('/perfil', verificarToken, userController.obtenerPerfil);
router.put('/perfil', verificarToken, userController.actualizarPerfil);
router.delete('/perfil/eliminar', verificarToken, userController.eliminarCuenta);

// Membresías / Suscripciones (DEBE IR ANTES DE /:id)
router.post('/membresia/suscribir', verificarToken, userController.suscribirsePlan);
router.post('/membresia/cancelar', verificarToken, userController.cancelarPlan);

// Lista de profesionales
router.get('/profesionales', userController.getProfesionales);

// Portafolio (ANTES de '/:id')
router.get('/portafolio', verificarToken, userController.obtenerPortafolio);
router.post('/portafolio', verificarToken, recibirFoto, userController.subirFotoPortafolio);
router.delete('/portafolio/:fotoId', verificarToken, userController.eliminarFotoPortafolio);

// Reseñas del usuario (ANTES de '/:id')
router.get('/resenas', verificarToken, userController.obtenerResenasUsuario);

// Detalle individual
router.get('/:id', userController.getUserProfile);

// Estado VIP manual
router.put('/:id/vip', verificarToken, userController.cambiarEstadoVip);

module.exports = router;