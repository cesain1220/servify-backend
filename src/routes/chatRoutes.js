const express = require('express');
const router = express.Router();
const { listarConversaciones, obtenerMensajes, marcarLeidos } = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/conversaciones', authMiddleware, listarConversaciones);
router.get('/conversaciones/:id/mensajes', authMiddleware, obtenerMensajes);
router.put('/conversaciones/:id/leidos', authMiddleware, marcarLeidos);

module.exports = router;