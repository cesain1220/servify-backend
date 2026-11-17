const express = require('express');
const router = express.Router();
const { crearPaymentSheet } = require('../controllers/pagosController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/crear-payment-sheet', authMiddleware, crearPaymentSheet);

module.exports = router;