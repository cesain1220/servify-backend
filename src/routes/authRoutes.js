const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//definifimos la ruta para registrar usuario
router.post('/register', authController.registrarUsuario);


//ruta para inicio de sesioin
router.post('/login', authController.iniciarSesion);


//ruta para solicitar codigo de reestablecer de contra
router.post('/solicitar-recuperacion', authController.solicitarRecuperacion)

//ruta para verificar codigo y cambiar la contra

router.post('/cambiar-password', authController.restablecerPassword)

module.exports = router;
