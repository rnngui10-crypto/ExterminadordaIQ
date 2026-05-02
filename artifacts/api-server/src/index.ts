import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function spawnBridge() {
  const bridgePath = path.resolve(__dirname, "../bridge.py");
  const bridgePort = "7777";

  logger.info({ bridgePath }, "Starting Python IQ Option bridge");

  const py = spawn("python3", [bridgePath], {
    env: { ...process.env, BRIDGE_PORT: bridgePort },
    stdio: ["ignore", "pipe", "pipe"],
  });

  py.stdout.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) logger.info({ bridge: line }, "Python bridge");
  });

  py.stderr.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line && !line.includes("DeprecationWarning") && !line.includes("WARNING")) {
      logger.warn({ bridge: line }, "Python bridge stderr");
    }
  });

  py.on("exit", (code) => {
    logger.warn({ code }, "Python bridge exited — restarting in 5s");
    setTimeout(spawnBridge, 5000);
  });

  py.on("error", (err) => {
    logger.error({ err: err.message }, "Python bridge error");
  });
}

spawnBridge();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
