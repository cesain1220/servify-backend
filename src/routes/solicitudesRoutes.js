const express = require('express');
const router = express.Router();
const { crearSolicitud } = require('../controllers/solicitudesController');
const authMiddleware = require('../middlewares/authMiddleware');

// Crear nueva solicitud
router.post('/', authMiddleware, crearSolicitud);

module.exports = router;