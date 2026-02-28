import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config ---
const PORT = process.env.PORT || 3000;

// --- Express Setup ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// --- Routes ---
app.use(apiRouter);

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n[SERVER] Zomato MCP Chat Server running at http://localhost:${PORT}`);
  console.log(`[MCP] Will connect via mcp-remote to: https://mcp-server.zomato.com/mcp`);
  console.log(`[AUTH] Browser will auto-open for Zomato OAuth when you click Connect.`);
  console.log(`\nOpen http://localhost:${PORT} in your browser to start chatting!\n`);
});
