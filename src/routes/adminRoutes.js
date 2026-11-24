const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middlewares/authMiddleware');

// Middleware para verificar que el usuario autenticado tenga rol 'admin'
const isAdmin = (req, res, next) => {
  if (!req.usuario || String(req.usuario.rol).toLowerCase() !== 'admin') {
    return res.status(403).json({
      success: false,
      mensaje: 'Acceso denegado: Se requieren permisos de administrador',
      message: 'Acceso denegado: Se requieren permisos de administrador'
    });
  }
  next();
};

// Todas las rutas de administración requieren token válido y rol admin
router.get('/stats', authMiddleware, isAdmin, adminController.getDashboardStats);
router.get('/dashboard-bi', authMiddleware, isAdmin, adminController.getDashboardBI);

// Gestión de usuarios, roles y suspensiones (ban)
router.get('/usuarios', authMiddleware, isAdmin, adminController.getUsuarios);
router.put('/usuarios/:id/rol', authMiddleware, isAdmin, adminController.cambiarRolUsuario);
router.put('/usuarios/:id/ban', authMiddleware, isAdmin, adminController.toggleBanUsuario);

// Moderación de solicitudes / peticiones
router.get('/solicitudes', authMiddleware, isAdmin, adminController.getSolicitudesAdmin);
router.put('/solicitudes/:id/cancelar', authMiddleware, isAdmin, adminController.cancelarSolicitudAdmin);

module.exports = router;