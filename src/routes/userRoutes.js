const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verificarToken = require('../middlewares/authMiddleware');

router.get('/perfil', verificarToken, userController.obtenerPerfil);
router.put('/perfil', verificarToken, userController.actualizarPerfil);

// ruta para la lista de profesionales
router.get('/profesionales', userController.getProfesionales);

// ruta para el detalle individual
router.get('/:id', userController.getUserProfile);
//ruta para cambiar estado de vip
router.put('/:id/vip', userController.cambiarEstadoVip);

module.exports = router;