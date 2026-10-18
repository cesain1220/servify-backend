const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const db = require('./db');

// importamos las rutas
const postulacionesRoutes = require('./routes/postulacionesRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const solicitudesRoutes = require('./routes/solicitudesRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes'); // <-- Importado aquí arriba
const registrarChatSocket = require('./chatSocket');

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
app.use('/api/postulaciones', postulacionesRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes); // <-- Registrado aquí antes del servidor

// Servidor HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registrarChatSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});