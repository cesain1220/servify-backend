const express = require('express');
const router = express.Router();
const solicitudesController = require('../controllers/solicitudesController');
const authMiddleware = require('../middlewares/authMiddleware');

// Crear nueva solicitud
//router.post('/', authMiddleware.verificarToken, solicitudesController.crearSolicitud);

module.exports = router;