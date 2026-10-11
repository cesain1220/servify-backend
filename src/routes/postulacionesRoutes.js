const express = require('express');
const router = express.Router();
const { crearPostulacion } = require('../controllers/postulacionesController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, crearPostulacion);

module.exports = router;