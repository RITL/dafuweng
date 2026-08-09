import { spawnSync } from "node:child_process";
import { access, copyFile, writeFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npmCommand, ["run", "build"], {
  cwd: projectRoot,
  env: { ...process.env, GITHUB_PAGES: "true" },
  stdio: "inherit",
});

if (build.status !== 0) process.exit(build.status ?? 1);

process.env.GITHUB_PAGES = "true";
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("pages", Date.now().toString());
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("https://ritl.github.io/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`Static render failed with HTTP ${response.status}`);
const html = await response.text();
if (!html.includes("/dafuweng/_next/static/")) {
  throw new Error("GitHub Pages asset prefix is missing from the rendered HTML");
}

const clientRoot = new URL("../dist/client/", import.meta.url);
await writeFile(new URL("index.html", clientRoot), html);
await copyFile(new URL("index.html", clientRoot), new URL("404.html", clientRoot));
await writeFile(new URL(".nojekyll", clientRoot), "");

const referencedFiles = [...html.matchAll(/(?:href|src)="\/dafuweng\/([^"?#]+)["?#]/g)]
  .map((match) => decodeURIComponent(match[1]));
await Promise.all([...new Set(referencedFiles)].map((file) => access(new URL(file, clientRoot))));
