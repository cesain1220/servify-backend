const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

// Todas las rutas de administración requieren token válido y rol admin
router.get('/stats', verifyToken, isAdmin, adminController.getDashboardStats);
router.get('/dashboard-bi', verifyToken, isAdmin, adminController.getDashboardBI);

// Gestión de usuarios, roles y suspensiones (ban)
router.get('/usuarios', verifyToken, isAdmin, adminController.getUsuarios);
router.put('/usuarios/:id/rol', verifyToken, isAdmin, adminController.cambiarRolUsuario);
router.put('/usuarios/:id/ban', verifyToken, isAdmin, adminController.toggleBanUsuario);

// Moderación de solicitudes / peticiones
router.get('/solicitudes', verifyToken, isAdmin, adminController.getSolicitudesAdmin);
router.put('/solicitudes/:id/cancelar', verifyToken, isAdmin, adminController.cancelarSolicitudAdmin);

module.exports = router;