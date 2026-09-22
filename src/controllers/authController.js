const db = require('../db'); // Subimos un nivel para encontrar db.js
const { enviarCodigoRecuperacion } = require('../services/emailService');
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
        // Busca usuario por correo
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (usuarios.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const usuario = usuarios[0];

        // Comparar contraseña con el hash de la base de datos
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // Genera token JWT
        const token = jwt.sign(
            { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
            process.env.JWT_SECRET || 'clave_secreta_servify',
            { expiresIn: '30d' }
        );

        // Limpia password antes de responder
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

// Solicitar código de recuperación de contraseña 
exports.solicitarRecuperacion = async (req, res) => {
    try {
        const { correo } = req.body;

        if (!correo) {
            return res.status(400).json({ mensaje: "El correo es obligatorio." });
        }

        // Verifica que el usuario exista
        const [usuarios] = await db.query(
            "SELECT id FROM usuarios WHERE correo = ?",
            [correo.trim()]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ mensaje: "No existe una cuenta registrada con ese correo." });
        }

        // Generar código aleatorio de 6 dígitos
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        // Guarda el código en la base de datos y deja codigo_expiracion en NULL
        await db.query(
            "UPDATE usuarios SET codigo_recuperacion = ?, codigo_expiracion = NULL WHERE correo = ?",
            [codigo, correo.trim()]
        );

        // Envía el correo con Brevo
        await enviarCodigoRecuperacion(correo.trim(), codigo);

        return res.status(200).json({
            mensaje: "Código de recuperación enviado con éxito a tu correo."
        });

    } catch (error) {
        console.error("Error al solicitar recuperación:", error);
        return res.status(500).json({
            mensaje: "Ocurrió un error al enviar el código de recuperación."
        });
    }
};

// Validar código OTP antes de avanzar al paso de contraseñas
exports.verificarCodigoOtp = async (req, res) => {
    try {
        const { correo, codigo } = req.body;

        if (!correo || !codigo) {
            return res.status(400).json({ mensaje: "El correo y el código son obligatorios." });
        }

        const [usuarios] = await db.query(
            "SELECT id, codigo_recuperacion FROM usuarios WHERE correo = ?",
            [correo.trim()]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ mensaje: "Usuario no encontrado." });
        }

        const usuario = usuarios[0];

        // Validar únicamente si el código coincide
        if (!usuario.codigo_recuperacion || usuario.codigo_recuperacion !== codigo.trim()) {
            return res.status(400).json({ mensaje: "El código ingresado es incorrecto." });
        }

        return res.status(200).json({ mensaje: "Código verificado exitosamente." });

    } catch (error) {
        console.error("Error al verificar código OTP:", error);
        return res.status(500).json({ mensaje: "Error interno al verificar el código." });
    }
};

// Restablecer contraseña con el código recibido
exports.restablecerPassword = async (req, res) => {
    try {
        const { correo, codigo, nuevaPassword } = req.body;

        if (!correo || !codigo || !nuevaPassword) {
            return res.status(400).json({
                mensaje: "El correo, el código y la nueva contraseña son obligatorios."
            });
        }

        // Buscar usuario por correo
        const [usuarios] = await db.query(
            "SELECT id, codigo_recuperacion FROM usuarios WHERE correo = ?",
            [correo.trim()]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ mensaje: "Usuario no encontrado." });
        }

        const usuario = usuarios[0];

        // Verificar código
        if (!usuario.codigo_recuperacion || usuario.codigo_recuperacion !== codigo.trim()) {
            return res.status(400).json({ mensaje: "El código ingresado es incorrecto." });
        }

        // Encriptar nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordEncriptada = await bcrypt.hash(nuevaPassword, salt);

        // Actualizar contraseña y limpiar el código
        await db.query(
            `UPDATE usuarios 
             SET password = ?, codigo_recuperacion = NULL, codigo_expiracion = NULL 
             WHERE id = ?`,
            [passwordEncriptada, usuario.id]
        );

        return res.status(200).json({
            mensaje: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión."
        });

    } catch (error) {
        console.error("Error al restablecer contraseña:", error);
        return res.status(500).json({
            mensaje: "Ocurrió un error al intentar cambiar la contraseña."
        });
    }
};