    const jwt = require('jsonwebtoken');

    module.exports = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer TOKEN

        if (!token) {
            return res.status(401).json({ mensaje: 'Acceso denegado: Token no proporcionado' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_servify');
            req.usuario = decoded; // Extrae { id, correo, rol }
            next();
        } catch (error) {
            return res.status(403).json({ mensaje: 'Token inválido o expirado' });
        }
    };