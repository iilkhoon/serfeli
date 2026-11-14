import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build or start.");

// dev: localhost:5173. start: the production server on HOST:PORT (default 127.0.0.1:3000), which
// nginx proxies to in production.
const portArgs = {
  dev: ["--port", "5173"],
  build: [],
  start: ["--port", process.env.PORT || "3000", "--hostname", process.env.HOST || "127.0.0.1"],
}[command];

// Import in this process so the server keeps this PID and receives its signals.
const cli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command, ...portArgs, ...args];
await import(cli.href);
