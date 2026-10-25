import { execFileSync } from "node:child_process";
import path from "node:path";

/** Re-seed the e2e database before the run so every test starts from the same synthetic data. */
export default function seed() {
  const db = process.env.E2E_DATABASE_URL ?? "postgresql+psycopg://postgres@127.0.0.1:5433/aurelis_e2e";
  execFileSync("uv", ["run", "python", "scripts/seed_e2e.py"], {
    cwd: path.resolve(import.meta.dirname, "../../../api"),
    env: { ...process.env, AURELIS_DATABASE_URL: db },
    stdio: "inherit",
  });
}
