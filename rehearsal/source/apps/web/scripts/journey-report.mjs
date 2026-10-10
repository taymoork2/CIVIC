#!/usr/bin/env node
// Builds the self-contained consolidated-journey report.
// Usage: node apps/web/scripts/journey-report.mjs [journeyDir] [auditDir]
//   journeyDir: folder with captures.json + captures/ (index.html is written there)
//   auditDir:   October 5 experience audit (README.md + screenshots/) for the BEFORE images
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const journeyDir = resolve(process.argv[2] ?? join(repo, "docs/audits/2026-10-05-consolidated-journey"));
const auditDir = resolve(process.argv[3] ?? join(repo, "docs/audits/2026-10-05-app-experience"));

const STAGES = ["Start", "Add clothes", "Plan and wash", "Dry and put away", "History and records", "Products and appliances", "Account and errors"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// JPEG intrinsic size from the first SOFn marker, so <img> reserves its box before decode.
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function image(path) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const type = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
  const size = type === "image/jpeg" ? jpegSize(buf) : null;
  return { src: `data:${type};base64,${buf.toString("base64")}`, size };
}

function imgTag(img, alt, attrs = "") {
  if (!img) return `<div class="missing">Screenshot missing</div>`;
  const dims = img.size ? ` width="${img.size.w}" height="${img.size.h}"` : "";
  return `<img src="${img.src}"${dims} alt="${esc(alt)}" loading="lazy" decoding="async"${attrs}>`;
}

// "Highest-priority findings" table rows: | E01 | P1 | **Title.** ... | [x](screenshots/NNN-*.jpg) ... |
function parseFindings(readme) {
  const section = readme.split(/^## Highest-priority findings\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section.split("\n").flatMap((line) => {
    const cells = line.split(" | ");
    const id = cells[0]?.replace(/^\|\s*/, "").trim();
    if (!/^E\d\d$/.test(id ?? "")) return [];
    const title = cells[2]?.match(/\*\*(.+?)\*\*/)?.[1]?.replace(/\.$/, "") ?? "";
    const shot = (cells[3] ?? cells.slice(3).join(" ")).match(/screenshots\/(\d{3}-[^)\s]+\.jpg)/)?.[1] ?? null;
    return [{ id, priority: cells[1].trim(), title, shot }];
  });
}

function git(args) {
  try { return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim(); } catch { return ""; }
}

const capturesPath = join(journeyDir, "captures.json");
if (!existsSync(capturesPath)) {
  console.error(`No manifest at ${capturesPath}`);
  process.exit(1);
}
const captures = JSON.parse(readFileSync(capturesPath, "utf8"));
if (!Array.isArray(captures)) throw new Error("captures.json must be an array");
const unknown = captures.filter((c) => !STAGES.includes(c.stage));
if (unknown.length) throw new Error(`Unknown stage on: ${unknown.map((c) => c.id).join(", ")}`);

const findings = parseFindings(readFileSync(join(auditDir, "README.md"), "utf8"));
if (findings.length !== 17) console.warn(`Expected 17 findings in audit README, parsed ${findings.length}`);

const head = git(["rev-parse", "HEAD"]) || "unknown";
// Only application inputs make the captures differ from the checkpoint; the report itself is untracked while built.
const dirty = git(["status", "--porcelain", "--", "apps/web/src", "apps/web/public", "convex", "packages"]) !== "";

const stages = STAGES.map((name) => ({ name, items: captures.filter((c) => c.stage === name) })).filter((s) => s.items.length);

const card = (c) => {
  const chips = (c.findings ?? []).map((f) => `<a class="chip" href="#finding-${esc(f)}">${esc(f)}</a>`).join("");
  return `<article class="card" id="state-${esc(c.id)}">
  <figure class="phone">${imgTag(image(join(journeyDir, c.screenshot ?? `captures/${c.id}.jpg`)), c.title)}</figure>
  <div class="body">
    <p class="eyebrow">${esc(c.id.slice(0, 2))} · <code>${esc(c.url)}</code>${c.changedOn ? ` · <span class="tag">${esc(c.changedOn)}</span>` : ""}${c.was ? ` · first <span class="tag">${esc(c.was)}</span>` : ""}</p>
    <h3>${esc(c.title)}</h3>
    <p>${esc(c.caption)}</p>
    ${chips ? `<p class="chips" aria-label="Findings shown fixed">${chips}</p>` : ""}
    ${c.text ? `<details><summary>Screen text</summary><pre>${esc(String(c.text).slice(0, 4000))}</pre></details>` : ""}
  </div>
</article>`;
};

const skippedPath = join(journeyDir, "skipped.json");
const allSkipped = existsSync(skippedPath) ? JSON.parse(readFileSync(skippedPath, "utf8")) : [];
const dayPrefix = "laundry day: ";
const skipped = allSkipped.filter((s) => !s.startsWith(dayPrefix));
const daySkipped = allSkipped.filter((s) => s.startsWith(dayPrefix)).map((s) => s.slice(dayPrefix.length));
const day = captures.filter((c) => (c.was ?? c.changedOn) === "October 6 (laundry day)");
const daySection = day.length ? `<section class="stage" id="laundry-day" aria-labelledby="h-day">
<h2 id="h-day">Laundry day</h2>
<p class="scope">The October 6 laundry-day work (one washer and one dryer at home, and a shared room), from the approved design <code>docs/plans/2026-10-06-dryer-sharing-design.md</code>. Each state is captured where a person meets it, in six new single-wearer households signed up in the app after the main walk. Set up through the API, as the laundry-day specs do: the machines, the detergent, the garments, the plans, and every wash, dryer start and queue move before a captured step. Every captured screen, and the taps between captures (Spread out, All today, Plan today, the dryer minutes, Hang or wait, All on low heat, the dryer start, the shared-room answers, None free, Wait), were walked in the app. For “Check now”, “Take out early” and the smell check the browser clock was moved ahead; the washes and dryer runs are real. The shared room has 12 washers and 20 dryers with no machine status, like the owner’s trial room. The trial notes that name where each estimate and default came from render only in the phone build, so they do not appear here.</p>
<ul class="changes">
${day.map((c) => `<li><a href="#state-${esc(c.id)}">${esc(c.title)}</a> <span class="where">${esc(c.stage)}</span></li>`).join("\n")}
</ul>
${daySkipped.length ? `<p class="scope">Not captured in this run, with the reason the walk recorded:</p>
<ul>
${daySkipped.map((s) => `<li>${esc(s)}</li>`).join("\n")}
</ul>` : ""}
</section>` : "";
const changed = captures.filter((c) => (c.was ?? c.changedOn) === "October 6");
const changedSection = changed.length ? `<section class="stage" id="october-6" aria-labelledby="h-oct6">
<h2 id="h-oct6">What changed on October 6</h2>
<p class="scope">States added or changed by the October 6 work, each captured where a person meets it in the walk. Trial notes (the marks for dose and care thinking that is still hand-fed) render only in the phone build, so they do not appear in these captures.</p>
<p class="scope">Screens are numbered in walk order. After the first load is put away, the walk starts a second wash for the wool and stain states, so those are numbered after History and Products even where they sit under Plan and wash or Dry and put away. That second wash was set up by API, as the stain-second-try test does: the pretreatment products, the stain flag on the two tees, the plan, the confirmed recipe and the session start. Every step from “Start preparation” on was walked in the app. “Synthetic enzyme spray” and “Synthetic oxygen soak” are test fixtures with made-up label facts, not real products.</p>
<ul class="changes">
${changed.map((c) => `<li><a href="#state-${esc(c.id)}">${esc(c.title)}</a> <span class="where">${esc(c.stage)}</span></li>`).join("\n")}
</ul>
${skipped.length ? `<p class="scope">Not captured in this run, with the reason the walk recorded:</p>
<ul>
${skipped.map((s) => `<li>${esc(s)}</li>`).join("\n")}
<li>Trial notes: shown only in the phone build (see above), so not captured here.</li>
</ul>` : ""}
</section>` : "";

const redesign = captures.filter((c) => c.changedOn === "October 7 (redesign)");
const redesignSection = redesign.length ? `<section class="stage" id="october-7" aria-labelledby="h-oct7">
<h2 id="h-oct7">What changed on October 7</h2>
<p class="scope">The October 7 redesign, as the app now draws it: one line icon set for garments (in place of the shaded hanger art and photos), compact rows (two or three answers in one row, four or more as one grouped list, settings as segments), Stain gone? as one row, What next? and the Care tab’s routine, advice and label instructions as grouped lists, the Plan the day card and the day strip (one row per load with a status chip), Take out early (one instruction, Change per piece) with its reminder and timer card, the washer and dryer pickers (number first, recent machines, Show all, None free replaces the picker), paid dryers shown as blocks and a price, dryer heat with its one-line reason, and pre-owned intake. Some of these states first appeared on October 5, October 6 or in the laundry-day work; they stay in those sections too and carry both tags. The “How long do your machines take?” card is gone, so its capture was removed.</p>
<p class="scope">New or changed captures are walked the same way as before: the main walk for intake, Care and the stain states, and five fresh single-wearer households for the laundry-day states, with machines, garments, plans and washes set up through the API. For the timer card, “Check now” and “Take out early” the browser clock was moved ahead; the dryer runs are real. The dryer picker, the paid dryer and the recent machines use a shared room (12 or 20 machines, no machine status) set up the same way. The dryer-heat captures use dryers whose Low temperature is not recorded. Trial notes render only in the phone build.</p>
<ul class="changes">
${redesign.map((c) => `<li><a href="#state-${esc(c.id)}">${esc(c.title)}</a> <span class="where">${esc(c.stage)}</span></li>`).join("\n")}
</ul>
</section>` : "";

const row = (f) => {
  const after = captures.filter((c) => (c.findings ?? []).includes(f.id));
  const before = f.shot ? image(join(auditDir, "screenshots", f.shot)) : null;
  const afterCell = after.length
    ? `<div class="thumbs">${after.map((c) => `<a href="#state-${esc(c.id)}" class="thumb">${imgTag(image(join(journeyDir, c.screenshot ?? `captures/${c.id}.jpg`)), c.title)}<span>${esc(c.title)}</span></a>`).join("")}</div>`
    : `<p class="none">Not captured in this run</p>`;
  return `<tr id="finding-${esc(f.id)}">
  <th scope="row">${esc(f.id)}<br><span class="prio">${esc(f.priority)}</span></th>
  <td>${esc(f.title)}</td>
  <td>${before ? `<figure class="thumb">${imgTag(before, `Before: ${f.title}`)}<span>${esc(f.shot)}</span></figure>` : `<p class="none">No audit screenshot</p>`}</td>
  <td>${afterCell}</td>
</tr>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consolidated journey</title>
<style>
:root{--bg:#f7f5ee;--ink:#20211e;--muted:#5d5f58;--primary:#164be0;--card:#fffdf8;--line:#e2dfd3;--chip:#e6ecfd;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#090d19;--ink:#edf0ff;--muted:#a9b0c8;--primary:#9db4ff;--card:#111729;--line:#232c47;--chip:#1b2547;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Source Sans 3","Source Sans Pro",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
main,header.top{max-width:1080px;margin:0 auto;padding:0 16px}
header.top{padding-top:40px;padding-bottom:8px}
h1{font-size:clamp(1.6rem,5vw,2.3rem);line-height:1.15;margin:0 0 8px}
h2{font-size:1.4rem;margin:40px 0 16px}
h3{font-size:1.15rem;margin:4px 0 8px}
a{color:var(--primary)}
:focus-visible{outline:3px solid var(--primary);outline-offset:3px;border-radius:6px}
.meta{color:var(--muted);margin:0 0 12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
.scope{max-width:70ch}
nav.stages{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);margin-top:16px}
nav.stages ul{list-style:none;margin:0 auto;padding:8px 16px;max-width:1080px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:thin}
nav.stages a{display:block;white-space:nowrap;padding:6px 12px;border-radius:999px;background:var(--chip);text-decoration:none;font-weight:600;font-size:.9rem}
section.stage{scroll-margin-top:64px}
.card{display:grid;grid-template-columns:minmax(0,393px) minmax(0,1fr);gap:24px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:16px;margin:0 0 16px;scroll-margin-top:64px}
@media (max-width:720px){.card{grid-template-columns:minmax(0,1fr)}}
.phone{margin:0}
.phone img{display:block;width:100%;max-width:393px;height:auto;border-radius:16px;border:1px solid var(--line)}
.eyebrow{color:var(--muted);font-size:.85rem;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;background:var(--chip);font-weight:700;font-size:.85rem;text-decoration:none}
details{margin-top:12px;border-top:1px solid var(--line);padding-top:8px}
summary{cursor:pointer;font-weight:600;color:var(--primary)}
pre{white-space:pre-wrap;font:inherit;font-size:.9rem;color:var(--muted);max-height:24rem;overflow:auto;margin:8px 0 0}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:24px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid var(--line)}
thead th{font-size:.85rem;color:var(--muted)}
.prio{font-weight:400;font-size:.8rem;color:var(--muted)}
.thumbs{display:flex;flex-wrap:wrap;gap:8px}
.thumb{display:inline-flex;flex-direction:column;gap:4px;width:120px;font-size:.8rem;text-decoration:none}
.thumb img{width:120px;height:auto;border-radius:10px;border:1px solid var(--line);display:block}
.none,.missing{color:var(--muted);font-style:italic;margin:0}
@media (max-width:640px){
  table,thead,tbody,tr,th,td{display:block}
  thead{display:none}
  tr{border-bottom:1px solid var(--line);padding:8px 0}
  th,td{border:0;padding:6px 12px}
}
.changes{padding-left:20px;columns:2 320px;column-gap:32px}
.changes li{margin:0 0 6px;break-inside:avoid}
.where{color:var(--muted);font-size:.85rem}
.tag{display:inline-block;padding:0 8px;border-radius:999px;background:var(--chip);color:var(--primary);font-weight:700}
footer{color:var(--muted);font-size:.85rem;padding:32px 16px 48px;max-width:1080px;margin:0 auto}
</style>
</head>
<body>
<header class="top">
  <h1>A Laundered Closet — consolidated journey</h1>
  <p class="meta">October 5, 2026 · updated October 7, 2026 · Source checkpoint <code>${esc(head)}</code>${dirty ? " plus uncommitted worktree changes" : ""} · ${captures.length} captured states</p>
  <p class="scope">This walk-through follows one synthetic, isolated account through the development app at phone size after the October 5 experience consolidation (findings E01–E17 and eight approved consolidations). It is not a phone or production acceptance run. The captures prove that these states rendered; they do not prove behavior on a real device, with real data, or over time.</p>
  <p>${redesign.length ? `<a href="#october-7">What changed on October 7</a> · ` : ""}${changed.length ? `<a href="#october-6">What changed on October 6</a> · ` : ""}${day.length ? `<a href="#laundry-day">Laundry day</a> · ` : ""}<a href="#before-after">Jump to before / after for E01–E17</a></p>
</header>
<nav class="stages" aria-label="Journey stages"><ul>
${redesign.length ? `<li><a href="#october-7">October 7</a></li>` : ""}
${changed.length ? `<li><a href="#october-6">October 6</a></li>` : ""}
${day.length ? `<li><a href="#laundry-day">Laundry day</a></li>` : ""}
${stages.map((s) => `<li><a href="#stage-${slug(s.name)}">${esc(s.name)}</a></li>`).join("\n")}
<li><a href="#before-after">Before / after</a></li>
</ul></nav>
<main>
${redesignSection}
${changedSection}
${daySection}
${stages.map((s) => `<section class="stage" id="stage-${slug(s.name)}" aria-labelledby="h-${slug(s.name)}">
<h2 id="h-${slug(s.name)}">${esc(s.name)}</h2>
${s.items.map(card).join("\n")}
</section>`).join("\n")}
<section class="stage" id="before-after" aria-labelledby="h-ba">
<h2 id="h-ba">Before / after</h2>
<p class="scope">BEFORE is the first screenshot linked by each finding in the October 5 audit. AFTER is every state in this run tagged with that finding.</p>
<div class="tablewrap"><table>
<thead><tr><th scope="col">ID</th><th scope="col">Finding</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
<tbody>
${findings.map(row).join("\n")}
</tbody></table></div>
</section>
</main>
<footer>Generated by <code>apps/web/scripts/journey-report.mjs</code> from <code>captures.json</code>. Self-contained; no network requests.</footer>
</body>
</html>
`;

const out = join(journeyDir, "index.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB, ${captures.length} states, ${findings.length} findings)`);
