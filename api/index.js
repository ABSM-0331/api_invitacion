import express from "express";
import { nanoid } from "nanoid";
import cors from "cors";
import admin from "firebase-admin";

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_KEY)),
});
const bd = admin.firestore();
const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/guardartoken", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token || typeof token !== "string") {
            return res.status(400).json({
                message: "Token inválido",
            });
        }

        // Evitar duplicados
        const existing = await bd
            .collection("tokens")
            .where("token", "==", token)
            .limit(1)
            .get();

        if (!existing.empty) {
            return res.status(200).json({
                message: "Token ya registrado",
            });
        }

        await bd.collection("tokens").add({
            token,
        });

        return res.status(200).json({
            message: "Token guardado correctamente",
        });
    } catch (error) {
        console.error("❌ Error guardando token:", error);
        return res.status(500).json({
            message: "Error al guardar el token",
        });
    }
});

// app.post("/api/send", async (req, res) => {
//     const { title, body, deviceID } = req.body;
//     const message = {
//         notification: {
//             title,
//             body,
//         },
//         token: deviceID,
//         android: {
//             priority: "high",
//             notification: {
//                 channel_id: "high_importance_channel",
//             },
//         },
//         apns: {
//             headers: {
//                 "apns-priority": "10",
//             },
//             payload: {
//                 aps: {
//                     alert: {
//                         title,
//                         body,
//                     },
//                     sound: "default",
//                 },
//             },
//         },
//     };

//     try {
//         await admin.messaging().send(message);
//         console.log("Notification sent successfully");
//         res.status(200).send("Notification sent successfully");
//     } catch (error) {
//         console.log("Error sending notification: ", error);
//         res.status(500).send("Error sending notification");
//     }
// });

app.post("/api/registro", async (req, res) => {
    try {
        const { familia, num_invitados, num_mesa } = req.body;

        if (!familia || !num_invitados || !num_mesa) {
            return res.status(400).json({
                message: "Todos los campos son obligatorios",
            });
        }

        const codigo = nanoid(10);

        await bd.collection("usuarios").add({
            familia,
            num_invitados: Number(num_invitados),
            invitados_confirmados: 0,
            num_mesa,
            confirmacion: "pendiente",
            codigo,
            hora: null,
        });

        res.json({
            message: "Registro exitoso",
            codigo,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error al registrar",
            error: error.message,
        });
    }
});

app.get("/api/invitados", async (req, res) => {
    try {
        const snapshot = await bd
            .collection("usuarios")
            .select("codigo", "familia", "num_invitados", "num_mesa")
            .get();

        const data = snapshot.docs.map((doc) => doc.data());

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/confirmacion", async (req, res) => {
    try {
        const { codigo, confirmacion, invitados_confirmados } = req.body;

        if (
            !codigo ||
            confirmacion === undefined ||
            invitados_confirmados === undefined
        ) {
            return res.status(400).json({
                message: "Datos incompletos",
            });
        }

        // 1️⃣ Buscar usuario por código
        const userSnapshot = await bd
            .collection("usuarios")
            .where("codigo", "==", codigo)
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            return res.status(404).json({
                message: "Registro no encontrado",
            });
        }

        const userDoc = userSnapshot.docs[0];
        const userRef = userDoc.ref;
        const userData = userDoc.data();

        // 2️⃣ Actualizar confirmación
        await userRef.update({
            confirmacion,
            invitados_confirmados: Number(invitados_confirmados),
        });

        // 3️⃣ Enviar notificación si se confirmó (asistirá o no asistirá)
        if (confirmacion === "Asistirá" || confirmacion === "no asistirá") {
            // 🔹 Obtener tokens válidos
            console.log("🔔 Preparando notificaciones...");
            const tokensSnapshot = await bd.collection("tokens").get();

            const tokens = tokensSnapshot.docs
                .map((doc) => doc.data()?.token)
                .filter(
                    (token) => typeof token === "string" && token.length > 10
                );

            console.log("📱 Tokens válidos:", tokens);

            if (tokens.length > 0) {
                const notificationTitle =
                    confirmacion === "Asistirá"
                        ? "¡Confirmación registrada!"
                        : "Confirmación recibida";
                const notificationBody =
                    confirmacion === "Asistirá"
                        ? `${userData.familia} ha confirmado su asistencia`
                        : `${userData.familia} ha indicado que no asistirá`;

                const message = {
                    tokens, // 👈 CLAVE (multicast)
                    notification: {
                        title: notificationTitle,
                        body: notificationBody,
                    },
                    android: {
                        priority: "high",
                        notification: {
                            channelId: "high_importance_channel",
                        },
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: "default",
                            },
                        },
                    },
                };

                const response = await admin
                    .messaging()
                    .sendEachForMulticast(message);

                console.log(
                    "✅ Notificaciones enviadas:",
                    response.successCount
                );
                console.log("❌ Fallidas:", response.failureCount);

                // 🔥 Limpieza automática de tokens inválidos
                response.responses.forEach(async (resp, index) => {
                    if (!resp.success) {
                        const failedToken = tokens[index];
                        console.log(
                            "🧹 Token inválido eliminado:",
                            failedToken
                        );

                        const invalidTokenDocs = await bd
                            .collection("tokens")
                            .where("token", "==", failedToken)
                            .get();

                        invalidTokenDocs.forEach((doc) => doc.ref.delete());
                    }
                });
            }
        }

        return res.json({
            message: "Confirmación actualizada correctamente",
        });
    } catch (error) {
        console.error("❌ Error en /api/confirmacion:", error);
        return res.status(500).json({
            message: "Error al actualizar confirmación",
            error: error.message,
        });
    }
});

app.put("/api/actualizar-invitado/:codigo", async (req, res) => {
    try {
        const { codigo } = req.params;
        const { num_invitados, num_mesa } = req.body;
        const snapshot = await bd
            .collection("usuarios")
            .where("codigo", "==", codigo)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return res.status(404).json({
                message: "Registro no encontrado",
            });
        }
        const docRef = snapshot.docs[0].ref;
        await docRef.update({
            num_invitados: Number(num_invitados),
            num_mesa: Number(num_mesa),
        });
        res.json({
            message: "Invitado actualizado",
        });
    } catch (error) {}
});
app.delete("/api/eliminar-invitado/:codigo", async (req, res) => {
    try {
        const { codigo } = req.params;
        const snapshot = await bd
            .collection("usuarios")
            .where("codigo", "==", codigo)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return res.status(404).json({
                message: "Registro no encontrado",
            });
        }
        const docRef = snapshot.docs[0].ref;
        await docRef.delete();
        res.json({
            message: "Invitado eliminado",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error al eliminar invitado",
            error: error.message,
        });
    }
});
app.get("/api/lista-completa", async (req, res) => {
    try {
        const invitados = await bd.collection("usuarios").get();
        res.json(invitados.docs.map((doc) => doc.data()));
    } catch (error) {
        console.error("Error fetching invitados:", error);
    }
});
app.get("/api/estadisticas", async (req, res) => {
    try {
        const totalSnapshot = await bd.collection("usuarios").count().get();
        const validadosSnapshot = await bd
            .collection("usuarios")
            .where("hora", "!=", null)
            .count()
            .get();

        res.json({
            totalInvitados: totalSnapshot.data().count,
            totalValidado: validadosSnapshot.data().count,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});
app.get("/api/escaneados", async (req, res) => {
    try {
        const snapshot = await bd
            .collection("usuarios")
            .where("hora", "!=", null)
            .get();
        const data = snapshot.docs.map((doc) => doc.data());
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener escaneados" });
    }
});
app.put("/api/escanear/:codigo", async (req, res) => {
    try {
        const { codigo } = req.params;

        const snapshot = await bd
            .collection("usuarios")
            .where("codigo", "==", codigo)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                message: "Código no válido",
            });
        }

        const doc = snapshot.docs[0];
        const docRef = doc.ref;

        // ⏰ Formatear hora AM/PM
        const ahora = new Date();
        const horaFormateada = ahora.toLocaleString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });

        await docRef.update({
            hora: horaFormateada, // string tipo "03:45 PM"
        });

        res.json({
            message: "Código válido",
            invitado: {
                ...doc.data(),
                hora: horaFormateada,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error al validar código",
            error: error.message,
        });
    }
});

export default app;
