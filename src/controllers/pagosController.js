const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = require('../db');

// Helper: Obtener o crear Customer en Stripe
async function obtenerOCrearStripeCustomer(usuarioId) {
    const [rows] = await db.query(
        'SELECT id, nombre, correo, stripe_customer_id FROM usuarios WHERE id = ?',
        [usuarioId]
    );
    if (!rows.length) throw new Error('Usuario no encontrado');
    const user = rows[0];

    if (user.stripe_customer_id) return user.stripe_customer_id;

    const customer = await stripe.customers.create({
        email: user.correo,
        name: user.nombre,
        metadata: { usuario_id: String(user.id) }
    });

    await db.query('UPDATE usuarios SET stripe_customer_id = ? WHERE id = ?', [
        customer.id,
        user.id
    ]);

    return customer.id;
}

// 1. Crear intención de pago con tarjeta (Protegido con authMiddleware)
const crearPaymentSheet = async (req, res) => {
    try {
        const usuario_id = req.usuario.id; // Extraído directo de tu authMiddleware
        const {
            tipo = 'servicio', // 'servicio' | 'vip'
            monto,             // Monto en dólares, ej: 25.00
            solicitud_id = null,
            contratacion_directa_id = null,
            tecnico_id = null
        } = req.body;

        if (!monto || Number(monto) <= 0) {
            return res.status(400).json({ ok: false, mensaje: 'El monto debe ser mayor a 0' });
        }

        const customerId = await obtenerOCrearStripeCustomer(usuario_id);

        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: '2024-06-20' }
        );

        const montoCentavos = Math.round(Number(monto) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: montoCentavos,
            currency: 'usd',
            customer: customerId,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                tipo,
                usuario_id: String(usuario_id),
                tecnico_id: tecnico_id ? String(tecnico_id) : '',
                solicitud_id: solicitud_id ? String(solicitud_id) : '',
                contratacion_directa_id: contratacion_directa_id ? String(contratacion_directa_id) : ''
            }
        });

        // Registrar intención en pagos_servicios si es pago de servicio
        if (tipo === 'servicio' && tecnico_id) {
            const montoNum = Number(monto);
            const comision = Number((montoNum * 0.10).toFixed(2)); // 10% comisión
            const netoTecnico = Number((montoNum - comision).toFixed(2));

            await db.query(
                `INSERT INTO pagos_servicios 
                (cliente_id, tecnico_id, solicitud_id, contratacion_directa_id, stripe_payment_intent_id, monto_total, comision_plataforma, monto_tecnico, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
                [usuario_id, tecnico_id, solicitud_id, contratacion_directa_id, paymentIntent.id, montoNum, comision, netoTecnico]
            );
        }

        return res.json({
            ok: true,
            paymentIntent: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            ephemeralKey: ephemeralKey.secret,
            customer: customerId,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (error) {
        console.error('Error en crearPaymentSheet:', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'Error al iniciar pago con Stripe',
            detalle: error.message
        });
    }
};

// 2. Webhook oficial de Stripe (Público, verificado por firma criptográfica)
const stripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Error firma Webhook Stripe:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        const { tipo, usuario_id, tecnico_id, solicitud_id, contratacion_directa_id } = pi.metadata;
        const montoDolares = (pi.amount_received / 100).toFixed(2);

        try {
            if (tipo === 'vip') {
                await db.query(
                    `INSERT INTO suscripciones_vip (usuario_id, monto, transaccion_id, fecha_fin, estado)
                     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), 'activa')`,
                    [usuario_id, montoDolares, pi.id]
                );
                await db.query('UPDATE usuarios SET es_vip = 1 WHERE id = ?', [usuario_id]);
            } else if (tipo === 'servicio') {
                await db.query(
                    `UPDATE pagos_servicios SET estado = 'completado' WHERE stripe_payment_intent_id = ?`,
                    [pi.id]
                );

                // Sincroniza con tu flujo de cierre en solicitudes
                if (solicitud_id) {
                    await db.query(
                        `UPDATE solicitudes 
                         SET metodo_pago = 'tarjeta', estado_pago = 'pagado', monto_final = ? 
                         WHERE id = ?`,
                        [montoDolares, solicitud_id]
                    );
                }

                if (contratacion_directa_id) {
                    await db.query(
                        `UPDATE contrataciones_directas 
                         SET estado = 'completado', monto_acordado = ? 
                         WHERE id = ?`,
                        [montoDolares, contratacion_directa_id]
                    );
                }

                // Notificación en tiempo real por Socket.IO
                const io = req.app.get('io');
                if (io && tecnico_id) {
                    io.emit('pago_confirmado', {
                        solicitud_id: solicitud_id ? Number(solicitud_id) : null,
                        contratacion_directa_id: contratacion_directa_id ? Number(contratacion_directa_id) : null,
                        tecnico_id: Number(tecnico_id),
                        cliente_id: Number(usuario_id),
                        monto: montoDolares,
                        mensaje: `¡Pago con tarjeta de $${montoDolares} confirmado!`
                    });
                }
            }
        } catch (dbError) {
            console.error('Error actualizando BD tras webhook Stripe:', dbError);
        }
    }

    if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        await db.query(
            `UPDATE pagos_servicios SET estado = 'fallido' WHERE stripe_payment_intent_id = ?`,
            [pi.id]
        );
    }

    return res.json({ received: true });
};

module.exports = {
    crearPaymentSheet,
    stripeWebhook
};