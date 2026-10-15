const express = require('express');
const router = express.Router();
const {
    crearSolicitud, obtenerSolicitudes, obtenerMisSolicitudes, obtenerSolicitudPorId
} = require('../controllers/solicitudesController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, crearSolicitud);
router.get('/', authMiddleware, obtenerSolicitudes);
router.get('/mias', authMiddleware, obtenerMisSolicitudes);
router.get('/:id', authMiddleware, obtenerSolicitudPorId);

module.exports = router;