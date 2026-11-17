// Records the README demo (docs/assets/demo.gif) by driving the local page in headless Chrome.
//
//   npm install --no-save puppeteer-core@24     # not a project dependency
//   npm start                                   # in another terminal, with Elasticsearch running
//   node scripts/record_demo.mjs
//
// Needs Google Chrome (set CHROME_PATH if it is not in the default macOS location) and ffmpeg.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const GIF = process.argv[2] ?? "docs/assets/demo.gif";
const TMP = mkdtempSync(join(tmpdir(), "demo-"));
const OUT = join(TMP, "demo.webm");
const URL = process.env.DEMO_URL ?? "http://127.0.0.1:3187/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.goto(URL, { waitUntil: "networkidle0" });

// Visible pointer, since headless recordings do not draw the system cursor.
await page.evaluate(() => {
  const c = document.createElement("div");
  c.id = "__cursor";
  Object.assign(c.style, {
    position: "fixed", left: "0", top: "0", width: "18px", height: "18px", marginLeft: "-9px", marginTop: "-9px",
    borderRadius: "50%", background: "rgba(9,105,218,.35)", border: "2px solid rgba(9,105,218,.9)",
    pointerEvents: "none", zIndex: "99999", transition: "transform .08s", transform: "translate(640px,360px)",
  });
  document.body.appendChild(c);
  document.addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; });
  document.addEventListener("mousedown", () => { c.style.background = "rgba(9,105,218,.7)"; });
  document.addEventListener("mouseup", () => { c.style.background = "rgba(9,105,218,.35)"; });
});
await page.mouse.move(640, 360);

async function moveTo(selector, steps = 18) {
  const el = await page.$(selector);
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  return el;
}
async function click(selector) {
  await moveTo(selector);
  await sleep(150);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
}

const recorder = await page.screencast({ path: OUT });
await sleep(1200);

// 1. Type a report by hand.
await click("#title");
await page.keyboard.type("Cannot type @ with AltGr on a German keyboard", { delay: 45 });
await sleep(300);
await click("#body");
await page.keyboard.type("AltGr+Q does nothing in the terminal.", { delay: 35 });
await sleep(400);
await click("#submit");
await page.waitForSelector("#results li");
await sleep(1600);

// 2. Point at the top results.
await moveTo("#results li:nth-child(1) .title");
await sleep(900);
await moveTo("#results li:nth-child(3) .title", 10);
await sleep(1100);

// 3. Clear, load a sample, search.
await click("#clear");
await sleep(700);
await click("#examples li:nth-child(3) button");
await sleep(800);
await click("#submit");
await page.waitForSelector("#results li");
await sleep(1400);
await moveTo("#results li:nth-child(2) .title");
await sleep(2200);

await recorder.stop();
await browser.close();

// 12 fps, 960 px wide, 96-colour palette: about 1 MB for 20 seconds.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", OUT, "-vf",
  "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];" +
  "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", GIF]);
rmSync(TMP, { recursive: true, force: true });
console.log("wrote", GIF);
