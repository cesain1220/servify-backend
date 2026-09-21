const db = require('../db'); // Subimos un nivel para encontrar db.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registrarUsuario = async (req, res) => {
    const { nombre, correo, password, telefono, rol } = req.body;

    if (!nombre || !correo || !password) {
        return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
    }

    try {
        // 1. Verificar si el correo ya existe
        const [correoExistente] = await db.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
        if (correoExistente.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordEncriptada = await bcrypt.hash(password, salt);

        // 3. Insertar usuario en MySQL
        const rolAsignado = rol || 'cliente';
        const queryInsert = `
            INSERT INTO usuarios (nombre, correo, password, telefono, rol)
            VALUES (?, ?, ?, ?, ?)
        `;

        const [resultado] = await db.query(queryInsert, [
            nombre,
            correo,
            passwordEncriptada,
            telefono || null,
            rolAsignado
        ]);

        const nuevoId = resultado.insertId;

        // 4. Generar Token JWT
        const token = jwt.sign(
            { id: nuevoId, correo, rol: rolAsignado },
            process.env.JWT_SECRET || 'clave_secreta_servify',
            { expiresIn: '30d' }
        );

        // 5. Responder a la App Móvil
        return res.status(201).json({
            mensaje: 'Usuario registrado con éxito',
            token: token,
            usuario: {
                id: nuevoId,
                nombre,
                correo,
                telefono: telefono || null,
                rol: rolAsignado
            }
        });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
};

exports.iniciarSesion = async (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });
    }

    try {
        // busca usuario porjcorreo
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (usuarios.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const usuario = usuarios[0];

        // va a comparar contraseña con el hash de la base de datos
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // genera token JWT
        const token = jwt.sign(
            { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
            process.env.JWT_SECRET || 'clave_secreta_servify',
            { expiresIn: '30d' }
        );

        // limpia password antes de responder
        delete usuario.password;

        return res.status(200).json({
            success: true,
            message: 'Inicio de sesión exitoso',
            token: token,
            usuario: usuario
        });

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};