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
            .select("codigo", "familia", "num_invitados")
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

        // Buscar documento por código
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
            confirmacion,
            invitados_confirmados: Number(invitados_confirmados),
        });

        res.json({
            message: "Confirmación actualizada",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error al actualizar confirmación",
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

export default app;
