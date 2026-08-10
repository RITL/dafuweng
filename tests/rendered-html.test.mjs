import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("服务端正确输出家庭版环球大富翁首页", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>环球大富翁｜我们的家庭旅行局<\/title>/i);
  assert.match(html, /今晚，我们去/);
  assert.match(html, /抽取先手 · 开始旅程/);
  assert.match(html, /玩法说明/);
  assert.match(html, /电视直接打开，iPhone 遥控/);
  assert.match(html, /电视浏览器模式/);
  assert.match(html, /不投屏/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|Building your site/i);
});

test("iPhone 主屏幕安装与离线外壳资源完整", async () => {
  const [manifest, worker] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    access(new URL("../public/icons/icon-192.png", import.meta.url)),
    access(new URL("../public/icons/icon-512.png", import.meta.url)),
    access(new URL("../public/icons/apple-touch-icon.png", import.meta.url)),
  ]);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.short_name, "环球大富翁");
  assert.equal(parsed.icons.length, 2);
  assert.match(worker, /family-world-tour-v2/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\(APP_ROOT\)/);
});
