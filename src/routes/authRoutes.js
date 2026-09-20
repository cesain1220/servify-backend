const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//definifimos la ruta para registrar usuario
router.post('/register', authController.registrarUsuario);

module.exports = router;