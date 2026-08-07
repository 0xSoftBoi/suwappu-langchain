import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tempRoot = await mkdtemp(path.join(root, ".tmp-package-"));

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", tempRoot],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const [packed] = JSON.parse(packOutput);
  if (!packed?.filename || !Array.isArray(packed.files)) {
    throw new Error("npm pack did not return the expected manifest");
  }

  const paths = new Set(packed.files.map((file) => file.path));
  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "README.md",
    "docs/BUILD_A_LANGCHAIN_PRODUCT.md",
    "docs/OPERATIONS.md",
    "LICENSE",
  ]) {
    if (!paths.has(required)) throw new Error(`npm package is missing ${required}`);
  }
  if ([...paths].some((file) => file.startsWith("src/") || file.startsWith("tests/"))) {
    throw new Error("npm package unexpectedly contains source/test files");
  }

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (packageJson.main !== "./dist/index.js" || packageJson.types !== "./dist/index.d.ts") {
    throw new Error("package entrypoints must resolve to compiled dist artifacts");
  }

  const consumerDir = await mkdtemp(path.join(tempRoot, "consumer-"));
  await writeFile(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "suwappu-langchain-consumer", private: true, type: "module" }),
  );

  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      path.join(tempRoot, packed.filename),
      "@langchain/core@^1.2.5",
      "langchain@^1.5.5",
    ],
    { cwd: consumerDir, stdio: "inherit" },
  );

  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import { SuwappuToolkit } from "@suwappu/langchain-suwappu";',
        'if (typeof SuwappuToolkit !== "function") throw new Error("package import failed");',
        'const names = new SuwappuToolkit({ apiKey: "suwappu_sk_test" }).getTools().map((tool) => tool.name);',
        'if (names.length !== 9 || names.includes("suwappu_execute_swap")) throw new Error("unsafe packaged tool surface");',
      ].join("\n"),
    ],
    { cwd: consumerDir, stdio: "inherit" },
  );

  console.log(`Verified ${packed.filename}: compiled entrypoints and clean Node consumer import`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
