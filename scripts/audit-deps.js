// Manual pre-release step (like verify:release) - not wired into `dist`,
// since blocking every local dev build on a transitive-dependency CVE would
// be too disruptive. Run before publishing a release.
const { execSync } = require("child_process");

try {
  execSync("npm audit --omit=dev --audit-level=high", { stdio: "inherit" });
} catch (e) {
  console.error(
    "\nnpm audit fand High/Critical-Schwachstellen in Produktions-Abhaengigkeiten " +
    "— vor dem Release beheben oder bewusst dokumentieren.\n"
  );
  process.exit(1);
}
