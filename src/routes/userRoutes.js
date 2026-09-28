const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verificarToken = require('../middlewares/authMiddleware');

router.get('/perfil', verificarToken, userController.obtenerPerfil);
router.put('/perfil', verificarToken, userController.actualizarPerfil);

router.get('/:id', userController.getUserProfile);

module.exports = router;