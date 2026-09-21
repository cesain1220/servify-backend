const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//definifimos la ruta para registrar usuario
router.post('/register', authController.registrarUsuario);


//ruta para inicio de sesioin
router.post('/login', authController.iniciarSesion);
module.exports = router;