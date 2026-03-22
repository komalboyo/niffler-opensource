import dotenv from "dotenv";
dotenv.config({ quiet: true } as any);

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { api } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.XBRAIN_PORT) || 3333;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../public")));
app.use(api);

app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/app.html"));
});

app.listen(PORT, () => {
  console.log(`Niffler running at http://localhost:${PORT}`);
});
