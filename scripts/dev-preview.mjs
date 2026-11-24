/**
 * A live-reloading preview on port 3002 that builds into its own folder
 * (.next-dev), so it can run next to the site started with `npm start`.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [next, "dev", "-p", "3002", "-H", "127.0.0.1"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-dev" },
});
child.on("exit", (code) => process.exit(code ?? 0));
