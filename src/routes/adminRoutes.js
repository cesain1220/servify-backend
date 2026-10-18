const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const verificarToken = require('../middlewares/authMiddleware');

// Métricas generales
router.get('/dashboard', verificarToken, adminController.getDashboardStats);

// Gestión de usuarios
router.get('/usuarios', verificarToken, adminController.getUsuarios);
router.put('/usuarios/:id/rol', verificarToken, adminController.cambiarRolUsuario);

// Moderación de solicitudes
router.get('/solicitudes', verificarToken, adminController.getSolicitudesAdmin);
router.put('/solicitudes/:id/cancelar', verificarToken, adminController.cancelarSolicitudAdmin);

module.exports = router;