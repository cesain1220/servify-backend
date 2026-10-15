const express = require('express');
const router = express.Router();
const {
    crearPostulacion, listarPostulacionesDeSolicitud, aceptarPostulacion,
    rechazarPostulacion, cancelarAcuerdo, obtenerMisPostulaciones
} = require('../controllers/postulacionesController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, crearPostulacion);
router.get('/mias', authMiddleware, obtenerMisPostulaciones);
router.get('/solicitud/:solicitudId', authMiddleware, listarPostulacionesDeSolicitud);
router.put('/:id/aceptar', authMiddleware, aceptarPostulacion);
router.put('/:id/rechazar', authMiddleware, rechazarPostulacion);
router.put('/:id/cancelar-acuerdo', authMiddleware, cancelarAcuerdo);

module.exports = router;