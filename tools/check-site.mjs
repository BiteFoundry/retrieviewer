// Local-only visual/function QA. Uses an already installed Chrome; never downloads
// a browser, touches a user browser profile, or visits signed-in external sites.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const url = process.argv[2];
if (!url || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url))
  throw Error("Pass the owned loopback preview URL");
const out = fileURLToPath(new URL("../.impeccable/review/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage(),
  errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => requests.push(r.url()));
const checks = [];
try {
  await page.goto(url);
  await page
    .locator("#puppy")
    .filter({ hasText: /[\u2801-\u28ff]/u })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    requests.some((u) => u.includes(".bin.gz")),
    false,
  );
  checks.push("art archives lazy until Play");
  for (const [width, lang, name] of [
    [1440, "en", "desktop"],
    [390, "ko", "mobile"],
    [1440, "ko", "desktop-ko"],
    [390, "en", "mobile-en"],
    [1280, "en", "desktop-1280"],
  ]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .getByRole("button", {
        name: lang === "en" ? "EN" : "한국어",
        exact: true,
      })
      .click();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.locator("html").getAttribute("lang"), lang);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "overflow at " + width + "/" + lang,
    );
    await page.screenshot({ path: out + name + ".png", fullPage: true });
    checks.push(width + "/" + lang + " screenshot and no overflow");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page
    .locator(".hero")
    .screenshot({
      path: out + "hero.png",
    });
  await page.locator(".copy").first().click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "npm install -g @bitefoundry/retrieviewer@latest",
  );
  checks.push("copy exact install command");
  await page
    .getByText("Don't have Node.js / npm yet?", { exact: true })
    .click();
  assert.equal(
    await page
      .getByText("sudo dnf module install nodejs:22", { exact: true })
      .isVisible(),
    true,
  );
  checks.push("prerequisite disclosure");
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "Play here", exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector(".dog-stage").dataset.frames) > 2,
    {},
    { timeout: 30000 },
  );
  assert.equal(requests.filter((u) => u.includes(".bin.gz")).length, 9);
  checks.push("same current Q5 core loads nine archives including tiny tug keys");
  assert.equal(await page.locator("#play").isVisible(), false);
  checks.push("Play trigger hides after successful load");
  await page.getByRole("button", { name: "Play tug", exact: true }).click();
  assert.match(await page.locator("#demo-status").textContent(), /Tug of war started/);
  await page.waitForFunction(() => !document.querySelector('#ball').disabled, {}, {timeout: 15000});
  checks.push("tug reaches actual browser engine, completes and unlocks ball");
  await page.getByRole("button", { name: "Toss a ball", exact: true }).click();
  assert.match(await page.locator("#demo-status").textContent(), /Ball tossed/);
  checks.push("ball reaches actual engine");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const frame = await page.locator(".dog-stage").getAttribute("data-frames");
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".dog-stage").getAttribute("data-frames"),
    frame,
  );
  checks.push("pause freezes frame loop");
  await page.getByRole("button", { name: "한국어", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "다시 놀기", exact: true })
      .isVisible(),
    true,
  );
  checks.push("language switch keeps paused state");
  assert.deepEqual(errors, []);
  checks.push("no uncaught browser exceptions");
  const failure = await context.newPage();
  await failure.route("**/runtime/retrieviewer.mjs", (r) => r.abort());
  await failure.goto(url + "?lang=en");
  await failure.getByRole("button", { name: "Play here", exact: true }).click();
  await failure
    .getByRole("button", { name: "Try loading again", exact: true })
    .waitFor();
  assert.match(
    await failure.locator("#demo-status").textContent(),
    /Could not load/,
  );
  checks.push("failed download shows recoverable retry");
  await failure.close();
  const result = {
    passed: true,
    checks,
    scope: "isolated local browser UI, not desktop adapter certification",
    screenshots: out,
  };
  await writeFile(out + "site-qa.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
