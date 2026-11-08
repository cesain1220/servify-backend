const express = require('express');
const router = express.Router();
const { listarConversaciones,listarLlamadas, obtenerMensajes, marcarLeidos, eliminarConversacion } = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/llamadas', authMiddleware, listarLlamadas);
router.get('/conversaciones', authMiddleware, listarConversaciones);
router.get('/conversaciones/:id/mensajes', authMiddleware, obtenerMensajes);
router.put('/conversaciones/:id/leidos', authMiddleware, marcarLeidos);
router.delete('/conversaciones/:id', authMiddleware, eliminarConversacion);

const { obtenerTokenLlamada } = require('../controllers/llamadasController');
router.get('/conversaciones/:id/token-llamada', authMiddleware, (req, res) => {
    req.params.conversacionId = req.params.id;
    return obtenerTokenLlamada(req, res);
});

module.exports = router;