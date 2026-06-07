// Crée une archive zip de dist/ prête à être publiée sur le Chrome Web Store.
import { readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const outFile = path.join(root, "loyverse-receipts-exporter.zip");
const run = promisify(execFile);

try {
  await stat(dist);
} catch {
  console.error("dist/ introuvable. Lancez d'abord `npm run build`.");
  process.exit(1);
}

const entries = await readdir(dist);
if (entries.length === 0) {
  console.error("dist/ est vide.");
  process.exit(1);
}

// Utilise la commande système `zip` (présente sur la plupart des environnements).
try {
  await run("zip", ["-r", "-q", outFile, "."], { cwd: dist });
  console.log(`Archive créée : ${path.relative(root, outFile)}`);
} catch (err) {
  console.error(
    "Échec de la création du zip. Assurez-vous que la commande `zip` est installée.",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
