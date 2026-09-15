const db = require('../db');
//GET /API/categories
const getCategories = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT * FROM categorias ORDER BY nombre ASC');
        res.json(categories);
    } catch (error) {
        console.error('Error al obtener las categorías:', error);
        res.status(500).json({ status: 'ERROR', error: error.message });
    }
};
module.exports = {
    getCategories
};