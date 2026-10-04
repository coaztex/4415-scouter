import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { localStatus } from "./synthetic-event";

const status = localStatus();
const next = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "dev"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      // Never let a linked project's private .env.local keys drive this fixture session.
      TBA_AUTH_KEY: "",
      TBA_WEBHOOK_SECRET: "",
    },
  },
);
next.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
