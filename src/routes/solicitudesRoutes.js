const express = require('express');
const router = express.Router();
const { crearSolicitud, obtenerSolicitudes } = require('../controllers/solicitudesController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, crearSolicitud);
router.get('/', authMiddleware, obtenerSolicitudes);

module.exports = router;