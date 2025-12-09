// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Rotas Modularizadas
const visaoGeralRoutes = require("./routes/visaoGeralRoutes");
const setoresRoutes = require("./routes/setoresRoutes");
const usuariosRoutes = require("./routes/usuariosRoutes");
const solicitacoesRoutes = require("./routes/solicitacoesRoutes");
const avaliacoesRoutes = require("./routes/avaliacoesRoutes");

const {
  brToMySQL,
  getPeriodoDates,
  getStartDateFromPeriod,
  dateRangeForYear,
  withCache,
  formatDurationFromMinutes
} = require("./utils/helpers");

const app = express();

/* ================================
   MIDDLEWARES GLOBAIS
================================ */
app.use(express.json());
app.use(helmet());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
  })
);

/* ================================
   CORS (com fallback para dev)
================================ */
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash-lovat-alpha.vercel.app",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin(origin, callback) {
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) return callback(null, true);
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("CORS bloqueado: " + origin));
    },
    credentials: true,
  })
);

/* ================================
   HEALTHCHECK
================================ */
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "API funcionando 🚀",
    ambiente: process.env.NODE_ENV,
  });
});

/* ================================
   REGISTRO DAS ROTAS /api
================================ */
app.use("/api", visaoGeralRoutes);
app.use("/api", setoresRoutes);
app.use("/api", usuariosRoutes);
app.use("/api", solicitacoesRoutes);
app.use("/api", avaliacoesRoutes);

/* ================================
   404 – após TODAS as rotas
================================ */
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

/* ================================
   HANDLER GLOBAL DE ERRO
================================ */
app.use((err, req, res, next) => {
  console.error("Erro Interno:", err);
  res.status(500).json({ error: "Erro interno no servidor" });
});

/* ================================
   START SERVER
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
