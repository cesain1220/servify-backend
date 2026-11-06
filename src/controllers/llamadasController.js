const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { obtenerConversacionDe } = require('./chatController');

exports.obtenerTokenLlamada = async (req, res) => {
    try {
        const conversacionId = parseInt(req.params.conversacionId);
        const conv = await obtenerConversacionDe(conversacionId, req.usuario.id);
        if (!conv) return res.status(404).json({ mensaje: 'Conversación no encontrada' });
        if (conv.activa !== 1) return res.status(409).json({ mensaje: 'Conversación cerrada' });

        const canal = `chat_${conversacionId}`;
        const expira = Math.floor(Date.now() / 1000) + 3600; // 1 hora

        const token = RtcTokenBuilder.buildTokenWithUid(
            process.env.AGORA_APP_ID,
            process.env.AGORA_APP_CERTIFICATE,
            canal,
            0,
            RtcRole.PUBLISHER,
            expira,
            expira
        );

        return res.json({ token, canal });
    } catch (error) {
        console.error('Error al generar token de Agora:', error);
        return res.status(500).json({ mensaje: 'Error al generar el token' });
    }
};