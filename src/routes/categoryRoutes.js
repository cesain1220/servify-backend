const express = require('express');
const router = express.Router();
const { getCategories } = require('../controllers/categoryController');

// Ruta relativa que responderá en /api/categories
router.get('/', getCategories);

module.exports = router;