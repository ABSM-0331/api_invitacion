import express, { json } from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { nanoid } from "nanoid";
import cors from "cors";
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());

const bd = await open({
    filename: "./database.db",
    driver: sqlite3.Database,
});

await bd.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        familia TEXT,
        num_invitados TEXT,
        invitados_confirmados TEXT,
        num_mesa TEXT,
        confirmacion TEXT,
        codigo TEXT
    )
`);

app.post("/registro", async (req, res) => {
    const { familia, num_invitados, num_mesa } = req.body;
    const codigo = nanoid(10);
    await bd.run(
        "INSERT INTO usuarios (familia, num_invitados, invitados_confirmados, num_mesa, confirmacion, codigo) VALUES (?, ?, ?, ?, ?, ?)",
        [familia, num_invitados, "0", num_mesa, "pendiente", codigo]
    );
    res.json({ message: "Registro exitoso" });
});

app.get("/invitados", async (req, res) => {
    const invitados = await bd.all(
        "SELECT id, familia, num_invitados FROM usuarios"
    );
    res.json(invitados);
});
app.post("/confirmacion", async (req, res) => {
    const { id, confirmacion, invitados_confirmados } = req.body;
    await bd.run(
        "UPDATE usuarios SET confirmacion = ?, invitados_confirmados = ? WHERE id = ?",
        [confirmacion, invitados_confirmados, id]
    );
    res.json({ message: "Confirmación actualizada" });
});

app.get("/lista-completa", async (req, res) => {
    const listaCompleta = await bd.all("SELECT * FROM usuarios");
    res.json(listaCompleta);
});

app.get("/codigo/:id", async (req, res) => {
    const { id } = req.params;
    const codigo = await bd.get("SELECT codigo FROM usuarios WHERE id = ?", [
        id,
    ]);
    res.json(codigo);
});
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
