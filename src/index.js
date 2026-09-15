const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

//importamos las rutas jejejej
const categoryRoutes = require('./routes/categoryRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoint de prueba de salud / conexión
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS resultado');
    res.json({ 
      status: 'OK', 
      mensaje: 'Servidor y conexión a Aiven MySQL funcionando correctamente', 
      test: rows[0].resultado 
    });
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Usamos las rutas
app.use('/api/categories', categoryRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});