// Records the README demo (docs/assets/demo.gif) by driving the local page in headless Chrome:
// type a report and search, click a result through to the issue on GitHub, then run a sample search.
//
//   npm install --no-save puppeteer-core@24     # not a project dependency
//   npm start                                   # in another terminal, with Elasticsearch running
//   node scripts/record_demo.mjs
//
// Needs Google Chrome (set CHROME_PATH if it is not in the default macOS location), ffmpeg, and internet access
// (the clicked result opens the real issue page on github.com).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const GIF = process.argv[2] ?? "docs/assets/demo.gif";
const TMP = mkdtempSync(join(tmpdir(), "demo-"));
const segment = (n) => join(TMP, `part${n}.webm`);
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
async function addCursor(p, x = 640, y = 360) {
  await p.evaluate((x, y) => {
    const c = document.createElement("div");
    Object.assign(c.style, {
      position: "fixed", left: "0", top: "0", width: "18px", height: "18px", marginLeft: "-9px", marginTop: "-9px",
      borderRadius: "50%", background: "rgba(9,105,218,.35)", border: "2px solid rgba(9,105,218,.9)",
      pointerEvents: "none", zIndex: "2147483647", transition: "transform .08s", transform: `translate(${x}px,${y}px)`,
    });
    document.body.appendChild(c);
    document.addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; });
    document.addEventListener("mousedown", () => { c.style.background = "rgba(9,105,218,.7)"; });
    document.addEventListener("mouseup", () => { c.style.background = "rgba(9,105,218,.35)"; });
  }, x, y);
  await p.mouse.move(x, y);
}
await addCursor(page);


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

// Part 1: type a report by hand, search, point at the top results, click the first one.
let recorder = await page.screencast({ path: segment(1) });
await sleep(1200);
await click("#title");
await page.keyboard.type("Cannot type @ with AltGr on a German keyboard", { delay: 45 });
await sleep(300);
await click("#body");
await page.keyboard.type("AltGr+Q does nothing in the terminal.", { delay: 35 });
await sleep(400);
await click("#submit");
await page.waitForSelector("#results li");
await sleep(1600);
await moveTo("#results li:nth-child(3) .title", 14);
await sleep(700);
await moveTo("#results li:nth-child(1) .title", 14);
await sleep(900);
const popupOpened = new Promise((resolve) => page.once("popup", resolve));
await click("#results li:nth-child(1) .title");
const issue = await popupOpened;
await sleep(250);
await recorder.stop();

// Part 2: the issue opens on GitHub in a new tab; scroll through it.
await issue.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await issue.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await issue.bringToFront();
await issue.waitForSelector("main", { timeout: 30000 });
await sleep(800);
await addCursor(issue, 640, 300);
recorder = await issue.screencast({ path: segment(2) });
await sleep(1500);
for (let i = 0; i < 12; i++) { await issue.mouse.wheel({ deltaY: 45 }); await sleep(60); }
await sleep(1600);
await recorder.stop();
await issue.close();

// Part 3: back in the app, run one of the sample reports.
await page.bringToFront();
recorder = await page.screencast({ path: segment(3) });
await sleep(600);
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

// Join the three parts; 12 fps, 960 px wide, 96-colour palette keeps the GIF near 1 MB.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", segment(1), "-i", segment(2), "-i", segment(3), "-filter_complex",
  "[0:v][1:v][2:v]concat=n=3:v=1:a=0,fps=12,scale=960:-1:flags=lanczos,split[a][b];" +
  "[a]palettegen=max_colors=96:stats_mode=diff[p];" +
  "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", GIF]);
rmSync(TMP, { recursive: true, force: true });
console.log("wrote", GIF);
