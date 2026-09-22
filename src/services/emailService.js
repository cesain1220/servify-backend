
const { BrevoClient } = require('@getbrevo/brevo');

// se configura el brevo con la api qeu esta en el .env
const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
});

// funcion que manda el correo
async function enviarCodigoRecuperacion(correoDestino, codigo) {
    // titulo del correo
    const subject = "Código de recuperación - Servify";

    // cuerpo del correo
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 450px; margin: auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
            <h2 style="color: #238668; text-align: center;">Servify</h2>
            <p>Hola,</p>
            <p>Has solicitado restablecer tu contraseña. Tu código de verificación es:</p>
            <div style="text-align: center; margin: 25px 0;">
                <span style="background-color: #E8F5F1; color: #238668; font-size: 28px; font-weight: bold; letter-spacing: 5px; padding: 10px 20px; border-radius: 6px;">
                    ${codigo}
                </span>
            </div>
            <p style="color: #64748B; font-size: 13px;">Este código vence en 15 minutos. Si no lo pediste, ignora este mensaje.</p>
        </div>
    `;

    // quien envia el correo, esta en el .env definido
    const sender = {
        name: "Soporte Servify",
        email: process.env.EMAIL_REMITENTE
    };

    // a quien se le va a mandar
    const to = [{ email: correoDestino }];

    //bBrevo hace el envío por internet
    return await brevo.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent,
        sender,
        to
    });
}

module.exports = { enviarCodigoRecuperacion };
