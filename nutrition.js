/* Health Ledger · Daily nutrition tab
   Food diary, macros, sodium, water, 500-food search, nutrition labels, barcodes, supplements.
   Uses the Ledger's own Supabase login (SB, S.uid) and Claude key (claudeCall). Data lives in:
   food_entries, water_log, food_products, supplements, nutrition_plan (see supabase/4-nutrition.sql). */
(() => {
"use strict";
const root = document.getElementById("v-nutrition");
if (!root) return;

/* ---------- constants ---------- */
const DEFAULT_PLAN = { name: "", calculated: "2026-10-05", goal: "Lose fat, build muscle", startKg: 92.2, goalKg: 70.8, heightCm: 176, age: 29, sex: "male",
  activity: 1.55, activityLabel: "Moderately active (×1.55)", pace: "Steady",
  kcal: 2400, protein: 110, proteinCapG: 120, carbs: 310, fat: 80, waterL: 3.0, sodiumMg: 2000,
  bmr: 1881, tdee: 2916, deficit: 516, kgPerWeek: 0.47, weeks: 46, kidney: true };
const MEALS = [
  { id: "breakfast", name: "Breakfast" }, { id: "lunch", name: "Lunch" }, { id: "dinner", name: "Dinner" },
  { id: "snacks", name: "Snacks" }, { id: "supplements", name: "Supplements", hidden: true }];
const GLASS = 250, WINDOW = 120;
const UNITS = ["capsule","tablet","softgel","scoop","sachet","gummy","g","ml","drop"];
const ZX_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";

/* ---------- small helpers (own names, so nothing in the Ledger is shadowed) ---------- */
const q = s => root.querySelector(s), qa = s => root.querySelectorAll(s);
const e2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const parseD = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return isoOf(d); };
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], DOWL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDay = s => { const d = parseD(s); return `${DOWL[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const r0 = n => Math.round(Number(n) || 0), r1 = n => Math.round((Number(n) || 0) * 10) / 10;
const nf = n => r0(n).toLocaleString("en-IN");
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mealByClock = () => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snacks"; };
const normQ = t => String(t).toLowerCase().replace(/['’`.]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const normCode = c => String(c || "").replace(/\D/g, "");
const eanValid = c => { if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false; const d = c.split("").map(Number), chk = d.pop(); let sum = 0; d.reverse().forEach((x, i) => sum += x * (i % 2 === 0 ? 3 : 1)); return (10 - sum % 10) % 10 === chk; };
const repairCode = c => { c = normCode(c); if (eanValid(c)) return c; if (c.length === 12) for (const d of "8901234567") if (eanValid(d + c)) return d + c; return c; };
const ICON = {
  ok: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  border: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5v4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="9.2" r="1" fill="currentColor"/></svg>',
  out: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'};
const chipH = (st, txt) => `<span class="chip ${st}">${ICON[st] || ""}${e2(txt)}</span>`;
const CAM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const IMG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>';
const fileBtn = (label, id, primary, capture) => `<label class="btn${primary ? " primary" : ""} nu-file">${capture ? CAM : IMG}${label}<input type="file" accept="image/*" ${capture ? 'capture="environment"' : ""} data-file="${id}" hidden></label>`;

/* ---------- state ---------- */
const N = { day: today(), today: today(), entries: [], water: [], products: {}, supps: {}, plan: { ...DEFAULT_PLAN }, planSaved: false,
  loadedFrom: null, loaded: false, loading: false, sub: "food", meal: mealByClock(), photo: null, pending: null, ctrl: null };
const NU = window.NUT = {};

/* ---------- styles (scoped to the nutrition tab; Ledger tokens reused) ---------- */
const css = document.createElement("style");
css.textContent = `
#nuFood,#nuSupp{display:flex;flex-direction:column;gap:18px}
#v-nutrition .grid.g2{align-items:start}
#v-nutrition{--protein:var(--accent);--carbs:#2A7A6B;--fat:#B7791F;--water:#2F7FB5;--sodium:#6B7A86}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) #v-nutrition{--carbs:#5FC2AE;--fat:#E4AA42;--water:#6CB8E6;--sodium:#9AA8B2}}
:root[data-theme="dark"] #v-nutrition{--carbs:#5FC2AE;--fat:#E4AA42;--water:#6CB8E6;--sodium:#9AA8B2}
.nu-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.nu-day{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
.nu-day h2{font-size:1.3rem}
.nu-date{position:relative;color:var(--muted);font-size:.88rem;border-bottom:1px dashed var(--muted);cursor:pointer}
.nu-date input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}
.nu-past{background:var(--warn-bg);color:var(--ink);border-radius:10px;padding:10px 14px;font-size:.86rem;display:flex;justify-content:space-between;gap:10px;align-items:center}
.nu-ring{position:relative;width:180px;height:180px}
.nu-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.nu-ring circle.p{transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)}
.nu-ring .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.nu-ring .big{font-family:var(--f-display);font-size:2.9rem;font-weight:700;line-height:1;letter-spacing:-.03em}
.nu-ring .of{font-family:var(--f-mono);font-size:.72rem;color:var(--muted);margin-top:4px;text-transform:uppercase}
.nu-ring .band{font-weight:700;font-size:.86rem;margin-top:3px}
.nu-tile .bar i{transition:width .6s}
.nu-tile .k{display:flex;justify-content:space-between;align-items:center;gap:6px}
.nu-tile .v small{font-family:var(--f-mono);font-size:.72rem;color:var(--muted);font-weight:400}
.nu-chips{display:flex;gap:6px;flex-wrap:wrap}
.nu-search{position:relative;margin-top:12px}
.nu-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted)}
.nu-search input{width:100%;padding:9px 12px 9px 36px!important;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
.nu-res{border:1px solid var(--line);border-radius:10px;margin-top:6px;overflow:hidden}
.nu-res button{all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px 10px;width:100%;padding:9px 12px;border-top:1px solid var(--line)}
.nu-res button:first-child{border-top:0}
.nu-res button:hover,.nu-res button:focus-visible{background:var(--surface-2)}
.nu-res .n{font-weight:600;font-size:.9rem}
.nu-res .s{font-size:.76rem;color:var(--muted);grid-column:1/2}
.nu-res .k{grid-row:1/3;grid-column:2;font-family:var(--f-mono);font-size:.88rem;align-self:center}
.nu-res .more{font-size:.8rem;color:var(--muted);padding:8px 12px;border-top:1px solid var(--line)}
.nu-c textarea{width:100%;min-height:64px;font-family:var(--f-body);font-size:.92rem;margin-top:8px}
.nu-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.nu-grow{flex:1}
.nu-file{cursor:pointer}
.nu-status{font-size:.84rem;color:var(--muted);margin-top:8px}
.nu-status:empty{display:none}
.nu-status.err{color:var(--bad)}
.nu-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:10px}
.nu-form label{font-size:.76rem;color:var(--muted);font-weight:600;display:flex;flex-direction:column;gap:4px}
.nu-form .full{grid-column:1/-1}
.nu-form input,.nu-form select,.nu-form textarea,.nu-field{width:100%;min-width:0}
#v-nutrition input:not([type=checkbox]):not([type=file]),#v-nutrition select,#v-nutrition textarea,.sheet .nu-form input:not([type=checkbox]),.sheet .nu-form select,.sheet .nu-form textarea,.sheet .nu-field{border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:var(--surface);font-size:16px;color:var(--ink)}
.nu-sec{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin:14px 0 6px}
.nu-meal+.nu-meal{border-top:1px solid var(--line);margin-top:6px;padding-top:10px}
.nu-meal-h{display:flex;justify-content:space-between;align-items:baseline}
.nu-item{display:grid;grid-template-columns:minmax(0,1fr) auto 30px;gap:2px 10px;align-items:center;padding:8px 0;border-top:1px solid var(--grid)}
.nu-meal-h+.nu-item{border-top:0}
.nu-item .n{font-weight:600;font-size:.9rem;overflow-wrap:anywhere}
.nu-item .s{grid-column:1/2;font-size:.74rem;color:var(--muted);font-family:var(--f-mono);display:flex;gap:8px;flex-wrap:wrap}
.nu-item .s span{font-family:var(--f-body)}
.nu-item .v{font-family:var(--f-mono);font-size:.9rem;grid-row:1/3;grid-column:2}
.nu-x{border:0;background:none;color:var(--muted);padding:4px 7px;border-radius:6px}
.nu-acts{grid-row:1/3;grid-column:3;display:flex;gap:2px}
.nu-item{grid-template-columns:minmax(0,1fr) auto auto!important}
.nu-item .n{cursor:pointer}
.nu-x:hover{color:var(--bad);background:var(--bad-bg)}
.nu-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.nu-mis{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 22px}
.nu-mi{all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;padding:8px 0;border-top:1px solid var(--grid)}
.nu-mi:hover .n,.nu-mi:focus-visible .n{color:var(--accent)}
.nu-mi .n{font-weight:600;font-size:.88rem}
.nu-mi .v{font-family:var(--f-mono);font-size:.84rem;text-align:right}
.nu-mi .v small{color:var(--muted);font-size:.72rem}
.nu-mi .bar{grid-column:1/-1;height:5px;border-radius:9px;background:var(--line);overflow:hidden;display:block}
.nu-mi .bar i{display:block;height:100%;border-radius:9px}
.nu-mi .s{grid-column:1/-1;font-size:.74rem;color:var(--muted)}
.nu-kid{display:inline-block;font-size:.62rem;font-weight:700;color:var(--info);background:var(--info-bg);border-radius:4px;padding:0 4px;vertical-align:1px}
.nu-meter{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.nu-meter:first-child{border-top:0;padding-top:0}
.nu-meter .mid{flex:1;min-width:0}
.nu-meter .top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}
.nu-meter .top b{font-family:var(--f-mono);font-size:1.05rem}
.nu-meter .top span{font-size:.8rem;color:var(--muted)}
.nu-meter .bar{margin-top:7px}
.nu-sq{width:36px;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--surface);font-size:1.1rem;font-weight:600;display:grid;place-items:center;line-height:1}
.nu-sq.plus{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.nu-sq:disabled{opacity:.4;cursor:default}
.nu-chart svg{display:block;width:100%;height:auto}
.nu-chart text{font-family:var(--f-mono);font-size:10.5px;fill:var(--muted)}
.nu-chart .sel{fill:var(--ink);font-weight:600}
.nu-per{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:10px 0;text-align:center}
.nu-per div{background:var(--surface-2);border-radius:8px;padding:7px 2px}
.nu-per b{display:block;font-family:var(--f-mono);font-size:.92rem}
.nu-per span{font-size:.66rem;color:var(--muted)}
.nu-calc{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:12px 0 2px;font-family:var(--f-mono);font-size:.8rem;color:var(--ink-2)}
.nu-calc b{font-family:var(--f-display);font-size:1.5rem;color:var(--ink)}
.nu-pv{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:2px 10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.nu-pv .n{font-weight:600;font-size:.9rem}.nu-pv .s{font-size:.76rem;color:var(--muted)}
.nu-pv input{width:74px;text-align:right;font-family:var(--f-mono)}
.nu-pv .mm{grid-column:1/-1;font-family:var(--f-mono);font-size:.74rem;color:var(--ink-2);display:flex;gap:10px;flex-wrap:wrap}
.nu-scan{position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:4/3}
.nu-scan video{width:100%;height:100%;object-fit:cover;display:block}
.nu-scan .fr{position:absolute;inset:26% 9%;border:2px solid rgba(255,255,255,.9);border-radius:10px;box-shadow:0 0 0 999px rgba(0,0,0,.3)}
.nu-scan .fr::after{content:"";position:absolute;left:6%;right:6%;top:50%;height:2px;background:#F2806F;animation:nuSweep 1.6s ease-in-out infinite alternate}
@keyframes nuSweep{from{top:12%}to{top:88%}}
.nu-dose{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 10px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
.nu-dose:first-child{border-top:0;padding-top:0}
.nu-dose .n{font-weight:600}.nu-dose .s{font-size:.78rem;color:var(--muted)}
.nu-dose .ctl{grid-row:1/3;grid-column:2;display:flex;gap:8px;align-items:center}
.nu-pips{display:flex;gap:4px}.nu-pips i{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--accent)}.nu-pips i.on{background:var(--accent)}
.nu-kv{display:grid;grid-template-columns:1fr auto;font-size:.9rem}
.nu-kv div{padding:8px 0;border-bottom:1px solid var(--line)}
.nu-kv div:nth-child(even){text-align:right;font-family:var(--f-mono);font-weight:600}
.nu-kv div:nth-last-child(-n+2){border-bottom:0}
.nu-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:9px 14px;border-radius:9px;font-size:.85rem;font-weight:600;z-index:80;max-width:92vw}
@media (prefers-reduced-motion:reduce){#v-nutrition *{transition:none!important;animation:none!important}}
`;
document.head.appendChild(css);

function toast(msg){ document.querySelectorAll(".nu-toast").forEach(x => x.remove()); const t = document.createElement("div"); t.className = "nu-toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function sheet(html){
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" style="width:min(600px,100%)">${html}</div>`;
  bg.addEventListener("click", ev => { if (ev.target === bg) close(); });
  const close = () => { bg.dispatchEvent(new Event("nuclose")); bg.remove(); };
  bg.close = close; document.body.appendChild(bg);
  bg.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  return bg;
}
const closeBtn = `<button class="btn" data-close aria-label="Close" style="padding:6px 10px">✕</button>`;

/* ---------- skeleton ---------- */
root.innerHTML = `
  <div class="card nu-bar">
    <div class="nu-day"><h2 id="nuTitle">Today</h2>
      <label class="nu-date" title="Pick a date"><span id="nuDate">—</span> ▾<input type="date" id="nuPick" aria-label="Pick a date to view or log"></label></div>
    <div class="row">
      <button class="pill-btn" id="nuPrev">‹ Prev</button><button class="pill-btn" id="nuToday">Today</button><button class="pill-btn" id="nuNext">Next ›</button>
      <span style="width:6px"></span>
      <button class="pill-btn" data-sub="food" aria-pressed="true">Food</button><button class="pill-btn" data-sub="supp" aria-pressed="false">Supplements</button>
      <button class="pill-btn" id="nuPlanBtn">My plan</button>
    </div>
  </div>
  <div class="nu-past" id="nuPast" hidden><span id="nuPastTxt"></span><button class="btn" id="nuBack">Back to today</button></div>
  <div class="notice" id="nuNotice" hidden></div>

  <div id="nuFood">
    <div class="card"><div class="hero">
      <div class="nu-ring" id="nuRing"></div>
      <div class="hero-r">
        <div><div class="eyebrow">Calories</div><h2 id="nuHead" style="font-size:1.5rem;margin-top:2px">—</h2></div>
        <div class="subs" id="nuMacros"></div>
        <div class="hero-meta" id="nuMeta"></div>
      </div>
    </div></div>

    <div class="grid g2">
      <div class="card nu-c">
        <div class="card-h"><h2>Log food</h2><span class="hint" id="nuLogHint"></span></div>
        <div class="nu-chips" id="nuMeals"></div>
        <div class="nu-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
          <input id="nuSearch" type="search" autocomplete="off" placeholder="Search 500 foods: dosa, biryani, Big Mac…" aria-label="Search the food database"></div>
        <div class="nu-res" id="nuRes" hidden></div>
        <div class="nu-row"><button class="btn primary" id="nuPack" style="flex:1">${CAM}Packaged food: label / barcode</button></div>
        <div class="nu-sec">Or describe it, and Claude estimates</div>
        <textarea id="nuText" rows="2" placeholder="e.g. 2 rotis, dal, paneer bhurji"></textarea>
        <div class="nu-row" id="nuThumb" hidden><img id="nuThumbImg" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover"><span class="small muted">Meal photo attached</span><button class="btn" id="nuThumbX">Remove</button></div>
        <div class="nu-row">${fileBtn("Meal photo", "meal", false, true)}${fileBtn("Upload", "mealUp", false, false)}<span class="nu-grow"></span><button class="btn" id="nuStop" hidden>Stop</button><button class="btn primary" id="nuEst">Estimate</button></div>
        <div class="nu-status" id="nuAiSt" aria-live="polite"></div>
        <div id="nuPreview"></div>
        <div class="nu-row"><button class="btn" id="nuManT" style="border:0;padding:4px 0;color:var(--accent)">+ Add manually</button></div>
        <form class="nu-form" id="nuMan" hidden>
          <label class="full">Food<input id="nuMName" required placeholder="e.g. Skyr Greek yogurt"></label>
          <div class="full row"><span class="small muted">Values are</span><button type="button" class="pill-btn" data-mb="100" aria-pressed="true">Per 100 g (from the label)</button><button type="button" class="pill-btn" data-mb="tot" aria-pressed="false">Total for what I ate</button></div>
          <label class="full" id="nuMAmtL">Amount you ate (g or ml)<input id="nuMAmt" type="number" min="0" step="any" inputmode="decimal" value="100"></label>
          <label><span class="nuMU">Calories / 100 g</span><input id="nuMK" type="number" min="0" step="any" inputmode="decimal"></label>
          <label><span class="nuMU">Protein g / 100 g</span><input id="nuMP" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label>
          <label><span class="nuMU">Carbs g / 100 g</span><input id="nuMC" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label>
          <label><span class="nuMU">Fat g / 100 g</span><input id="nuMF" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label>
          <label class="full"><span class="nuMU">Sodium mg / 100 g</span> (optional)<input id="nuMNa" type="number" min="0" step="any" inputmode="decimal"></label>
          <div class="full nu-calc" style="margin:2px 0"><span id="nuMSum"></span><span><b id="nuMTot">0</b> kcal</span></div>
          <div class="full small" id="nuMWarn" style="color:var(--warn)" hidden>Protein, carbs and fat are all 0. Fill them in if the label has them, so your protein total stays right.</div>
          <div class="full row" style="justify-content:flex-end"><button class="btn" type="button" id="nuManX">Cancel</button><button class="btn primary" type="submit">Add</button></div>
        </form>
      </div>
      <div class="card"><div class="card-h"><h2>Diary</h2><span class="hint" id="nuDiaryHint"></span></div><div id="nuDiary"></div></div>
    </div>

    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>Water &amp; sodium</h2></div>
        <div class="nu-meter">
          <div class="mid"><div class="top"><span><b id="nuWV">0.00</b> / <span id="nuWT">3.0</span> L</span><span id="nuWG"></span></div><div class="bar"><i id="nuWF" style="background:var(--water)"></i></div></div>
          <button class="nu-sq" id="nuWM" aria-label="Remove a glass (250 ml)">−</button><button class="nu-sq plus" id="nuWP" aria-label="Add a glass (250 ml)">+</button>
        </div>
        <div class="nu-meter">
          <div class="mid"><div class="top"><span><b id="nuNaV">0</b> / <span id="nuNaT">2,000</span> mg sodium</span><span id="nuNaL"></span></div><div class="bar"><i id="nuNaF"></i></div><div class="small muted" id="nuNaNote"></div></div>
        </div>
      </div>
      <div class="card"><div class="card-h"><h2>Last 7 days</h2><span class="hint" id="nuHistHint"></span></div><div class="nu-chart" id="nuChart"></div>
        <div class="row small muted" style="margin-top:6px"><span><i class="nu-dot" style="background:var(--accent)"></i> Within goal</span><span><i class="nu-dot" style="background:var(--bad)"></i> Over</span><span>- - Goal</span></div></div>
    </div>
    <div class="card"><div class="card-h"><div><h2>Micronutrients</h2><div class="small muted" id="nuMiHint"></div></div>
      <div class="row"><button class="pill-btn" data-miv="day" aria-pressed="true">Day</button><button class="pill-btn" data-miv="week" aria-pressed="false">7-day average</button></div></div>
      <div id="nuMicro"></div></div>
  </div>

  <div id="nuSupp" hidden>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>Doses</h2><span class="hint" id="nuDoseHint"></span></div><div id="nuDoses"></div></div>
      <div class="card"><div class="card-h"><h2>From supplements</h2><span class="hint" id="nuSTHint"></span></div><div id="nuSTot"></div></div>
    </div>
    <div class="card"><div class="card-h"><h2>My supplements</h2><span class="hint" id="nuLibHint"></span></div>
      <div class="row"><button class="btn primary" id="nuSFind">Find a brand</button><button class="btn" id="nuSScan">${CAM}Scan box / label</button><button class="btn" id="nuSMan">Manual</button></div>
      <div id="nuLib" style="margin-top:8px"></div></div>
  </div>
  <p class="small muted" style="text-align:center;margin:4px 0 0">Nutrition values are estimates. General guidance, not medical advice; check targets with your doctor.</p>`;

/* ---------- data: Supabase ---------- */
const sb = () => (typeof SB !== "undefined" ? SB : null);
const signedIn = () => !!(sb() && typeof S !== "undefined" && S.uid);
const rowToEntry = r => ({ id: r.id, date: r.day, meal: r.meal, name: r.name, serving: r.serving, kcal: +r.kcal, p: +r.protein_g, c: +r.carbs_g, f: +r.fat_g,
  na: r.sodium_mg == null ? null : +r.sodium_mg, barcode: r.barcode, suppId: r.supplement_id, units: r.units == null ? null : +r.units, micros: r.micros || [], src: r.source, at: r.created_at });
async function fetchRange(from, to){
  const db = sb();
  const [e, w] = await Promise.all([
    db.from("food_entries").select("*").gte("day", from).lte("day", to).order("created_at").range(0, 4999),
    db.from("water_log").select("id,day,ml,created_at").gte("day", from).lte("day", to).range(0, 4999)]);
  if (e.error) throw e.error; if (w.error) throw w.error;
  return { entries: e.data.map(rowToEntry), water: w.data.map(x => ({ id: x.id, date: x.day, ml: +x.ml })) };
}
NU.load = async function(){
  if (!signedIn() || N.loading) return; N.loading = true;
  try {
    const db = sb(); N.today = today();
    const from = addDays(N.today, -WINDOW);
    const [rng, pr, sp, pl] = await Promise.all([
      fetchRange(from, N.today),
      db.from("food_products").select("code,doc,used_at"),
      db.from("supplements").select("id,doc,active"),
      db.from("nutrition_plan").select("plan").maybeSingle()]);
    if (pr.error || sp.error) throw (pr.error || sp.error);
    if (pl.error && !/nutrition_plan/.test(pl.error.message || "")) throw pl.error;
    const older = N.entries.filter(x => x.date < from), olderW = N.water.filter(x => x.date < from);
    N.entries = older.concat(rng.entries); N.water = olderW.concat(rng.water); N.loadedFrom = N.loadedFrom && N.loadedFrom < from ? N.loadedFrom : from;
    N.products = {}; for (const x of pr.data) N.products[x.code] = { ...x.doc, code: x.code, usedAt: x.used_at };
    N.supps = {}; for (const x of sp.data) N.supps[x.id] = { ...x.doc, id: x.id, active: x.active };
    N.plan = { ...DEFAULT_PLAN, ...(pl.data?.plan || {}) }; N.planSaved = !!pl.data;
    N.loaded = true; showNotice("");
  } catch (err) {
    const m = String(err?.message || err?.code || err);
    showNotice(/relation .* does not exist|food_entries|schema cache/i.test(m)
      ? "The nutrition tables aren't in your database yet. In Supabase → SQL Editor, run <b>supabase/4-nutrition.sql</b>, then tap refresh."
      : "Couldn't load your nutrition data: " + e2(m));
  } finally { N.loading = false; NU.render(); }
};
NU.reset = function(){ N.entries = []; N.water = []; N.products = {}; N.supps = {}; N.plan = { ...DEFAULT_PLAN }; N.loaded = false; N.loadedFrom = null; NU.render(); };
async function ensureLoaded(d){
  if (!signedIn() || !N.loadedFrom || d >= N.loadedFrom) return;
  const from = addDays(d, -30), to = addDays(N.loadedFrom, -1);
  try { const r = await fetchRange(from, to); N.entries = r.entries.concat(N.entries); N.water = r.water.concat(N.water); N.loadedFrom = from; NU.render(); } catch {}
}
function showNotice(html){ const n = q("#nuNotice"); n.innerHTML = html; n.hidden = !html; }
function requireLogin(){ if (signedIn()) return true; toast("Sign in first."); return false; }

async function addEntries(list){
  if (!requireLogin()) throw new Error("signed out");
  const now = Date.now();
  const rows = list.map((x, i) => ({
    id: uid("e") + i, user_id: S.uid, day: x.date || N.day, meal: x.meal || N.meal, name: String(x.name || "Food").slice(0, 160), serving: String(x.serving || "").slice(0, 120),
    kcal: r0(x.kcal), protein_g: r1(x.p), carbs_g: r1(x.c), fat_g: r1(x.f), sodium_mg: x.na == null || x.na === "" ? null : r0(x.na),
    barcode: x.barcode || null, supplement_id: x.suppId || null, units: x.units == null ? null : +x.units, micros: x.micros?.length ? x.micros : null,
    source: x.src || "manual", created_at: new Date(now + i).toISOString() }));
  const { error } = await sb().from("food_entries").insert(rows);
  if (error) { toast("Couldn't save: " + error.message); throw error; }
  N.entries.push(...rows.map(rowToEntry)); NU.render();
  const fresh = N.entries.filter(e => rows.some(r => r.id === e.id) && e.meal !== "supplements" && !(e.micros || []).length);
  if (fresh.length && S.settings?.anthropic_key) setTimeout(() => estimateMicros(fresh, false), 50);
  return rows.map(rowToEntry);
}
async function updateEntry(id, patch){
  const row = { name: patch.name, serving: patch.serving, kcal: r0(patch.kcal), protein_g: r1(patch.p), carbs_g: r1(patch.c), fat_g: r1(patch.f), sodium_mg: patch.na == null || patch.na === "" ? null : r0(patch.na), meal: patch.meal, day: patch.date };
  const was = N.entries.find(x => x.id === id);
  if (was?.micros?.length && was.kcal > 0 && r0(patch.kcal) !== r0(was.kcal)) { const k = patch.kcal / was.kcal; row.micros = patch.micros = was.micros.map(m => ({ ...m, amt: Math.round(m.amt * k * 1000) / 1000 })); }
  const { error } = await sb().from("food_entries").update(row).eq("id", id);
  if (error) { toast("Couldn't save: " + error.message); throw error; }
  const i = N.entries.findIndex(x => x.id === id); if (i >= 0) N.entries[i] = { ...N.entries[i], ...patch }; NU.render();
}
function openEditEntry(x){
  if (!x) return;
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Edit entry</h2>${closeBtn}</div>
    <form class="nu-form" id="eeF">
      <label class="full">Food<input name="name" required value="${e2(x.name)}"></label>
      <label class="full">Serving<input name="serving" value="${e2(x.serving || "")}"></label>
      <label>Calories<input name="kcal" type="number" min="0" step="any" inputmode="decimal" value="${x.kcal}"></label>
      <label>Protein g<input name="p" type="number" min="0" step="any" inputmode="decimal" value="${x.p}"></label>
      <label>Carbs g<input name="c" type="number" min="0" step="any" inputmode="decimal" value="${x.c}"></label>
      <label>Fat g<input name="f" type="number" min="0" step="any" inputmode="decimal" value="${x.f}"></label>
      <label>Sodium mg<input name="na" type="number" min="0" step="any" inputmode="decimal" value="${x.na ?? ""}"></label>
      <label>Meal<select name="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === x.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>
      <label>Date<input name="date" type="date" max="${N.today}" value="${x.date}"></label>
      <label>Scale everything ×<input name="scale" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 1.5"></label>
      <div class="full small muted">Scale multiplies calories, macros and sodium, e.g. ×1.5 if you had 150 g instead of 100 g.</div>
      <div class="full row" style="justify-content:space-between"><button type="button" class="btn" id="eeDel" style="color:var(--bad)">Delete</button><button class="btn primary" type="submit">Save</button></div>
    </form>`);
  const fm = bg.querySelector("#eeF");
  fm.elements.scale.oninput = () => { const k = +fm.elements.scale.value; if (!(k > 0)) return;
    for (const n of ["kcal", "p", "c", "f", "na"]) { const base = n === "na" ? x.na : x[n]; if (base != null && base !== "") fm.elements[n].value = n === "kcal" || n === "na" ? r0(base * k) : r1(base * k); } };
  fm.onsubmit = async ev => { ev.preventDefault(); const f = new FormData(fm);
    const patch = { name: String(f.get("name")).trim(), serving: String(f.get("serving") || ""), kcal: +f.get("kcal") || 0, p: +f.get("p") || 0, c: +f.get("c") || 0, f: +f.get("f") || 0, na: f.get("na") === "" ? null : +f.get("na"), meal: f.get("meal"), date: f.get("date") || x.date };
    try { await updateEntry(x.id, patch); toast("Saved"); bg.close(); } catch {} };
  bg.querySelector("#eeDel").onclick = async () => { await removeEntry(x.id); toast(`Removed ${x.name}`); bg.close(); };
}
async function removeEntry(id){
  const { error } = await sb().from("food_entries").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message); return; }
  N.entries = N.entries.filter(x => x.id !== id); NU.render();
}
async function addWater(delta){
  if (!requireLogin()) return;
  const row = { id: uid("w"), user_id: S.uid, day: N.day, ml: delta };
  N.water.push({ id: row.id, date: row.day, ml: delta }); NU.render();
  const { error } = await sb().from("water_log").insert(row);
  if (error) { N.water = N.water.filter(x => x.id !== row.id); NU.render(); toast("Water didn't save: " + error.message); }
}
async function saveProduct(p){
  const { code, usedAt, ...doc } = p;
  N.products[code] = { ...p };
  const { error } = await sb().from("food_products").upsert({ user_id: S.uid, code, doc, used_at: usedAt || null, updated_at: new Date().toISOString() }, { onConflict: "user_id,code" });
  if (error) toast("Product not saved: " + error.message);
}
async function saveSupp(sp){
  const id = sp.id || uid("s"); const { id: _i, ...doc } = sp; const n = suppNorm(sp);
  doc.perDose = n.dose; doc.micros = n.doseMicros; doc.doseLabel = uLabel(n.takeQty, n.unit);
  const { error } = await sb().from("supplements").upsert({ id, user_id: S.uid, doc, active: sp.active !== false, updated_at: new Date().toISOString() });
  if (error) { toast("Couldn't save: " + error.message); throw error; }
  N.supps[id] = { ...doc, id, active: sp.active !== false }; NU.render(); return N.supps[id];
}
async function deleteSupp(id){
  const { error } = await sb().from("supplements").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message); return; }
  delete N.supps[id]; NU.render();
}
async function savePlan(p){
  N.plan = { ...N.plan, ...p };
  const { error } = await sb().from("nutrition_plan").upsert({ user_id: S.uid, plan: N.plan, updated_at: new Date().toISOString() });
  if (error) { toast("Plan not saved: " + error.message); throw error; }
  N.planSaved = true; NU.render();
}

/* ---------- links to the rest of the Ledger ---------- */
const act = d => (typeof S !== "undefined" && S.activity ? S.activity[d] : null) || null;
function latestWeight(){
  let best = null;
  try {
    for (const [d, v] of Object.entries(S.activity || {})) if (v && v.w) if (!best || d > best.date) best = { date: d, kg: v.w, src: "Apple Health" };
    for (const r of S.reports || []) if (r.type === "body") { const w = (r.params || []).find(p => p.key === "weight"); if (w && typeof w.value === "number" && (!best || r.date > best.date)) best = { date: r.date, kg: w.value, src: "body scan" }; }
  } catch {}
  return best;
}
// Latest out-of-range markers from your blood tests, so estimates flag the foods that matter for you
function healthContext(){
  try {
    const latest = {};
    for (const r of (S.reports || []).filter(r => r.type === "blood").sort((a, b) => a.date < b.date ? -1 : 1))
      for (const p of r.params || []) latest[p.key] = p;
    const flags = [];
    const hi = k => { const p = latest[k]; const v = typeof p?.value === "number" ? p.value : parseFloat(p?.value); return p && p.high != null && v > p.high ? v : null; };
    if (hi("uric")) flags.push(`uric acid high (${hi("uric")}): flag high-purine foods (organ meat, red meat, some seafood, alcohol, sugary drinks)`);
    if (hi("tg")) flags.push(`triglycerides high (${hi("tg")}): flag sugar, sweets, refined carbs and alcohol`);
    if (hi("alt") || hi("ggt")) flags.push("liver enzymes raised: flag alcohol and fried or very sugary foods");
    const a1 = latest.hba1c && parseFloat(latest.hba1c.value); if (a1 >= 5.7) flags.push(`HbA1c ${a1}: flag high-sugar items`);
    if (N.plan.kidney) flags.push(`one underdeveloped kidney: keep sodium under ${N.plan.sodiumMg || 2000} mg/day and protein moderate`);
    return flags.length ? "Health notes for this person: " + flags.join("; ") + ". If an item is relevant, mention it briefly in \"note\"." : "";
  } catch { return ""; }
}

/* ---------- totals ---------- */
const dayItems = d => N.entries.filter(x => x.date === d).sort((a, b) => String(a.at).localeCompare(String(b.at)));
function totals(d){ const t = { kcal: 0, p: 0, c: 0, f: 0, na: 0, naMissing: 0 }; for (const x of dayItems(d)) { t.kcal += x.kcal || 0; t.p += x.p || 0; t.c += x.c || 0; t.f += x.f || 0; if (x.na == null) t.naMissing++; else t.na += x.na; } return t; }
const waterOn = d => Math.max(0, N.water.reduce((a, x) => a + (x.date === d ? x.ml : 0), 0));

/* ---------- render ---------- */
NU.render = function(){
  if (root.hidden && N.rendered) return; N.rendered = true;
  N.today = today();
  const P = N.plan, d = N.day, t = totals(d), isT = d === N.today;
  const diff = Math.round((parseD(d) - parseD(N.today)) / 864e5);
  q("#nuTitle").textContent = isT ? "Today" : diff === -1 ? "Yesterday" : DOWL[parseD(d).getDay()];
  q("#nuDate").textContent = fmtDay(d); q("#nuPick").max = N.today; q("#nuPick").value = d;
  q("#nuNext").disabled = d >= N.today; q("#nuToday").setAttribute("aria-pressed", String(isT));
  q("#nuPast").hidden = isT; q("#nuPastTxt").textContent = `Viewing ${fmtDay(d)}. Anything you log or take goes to this date.`;
  qa("[data-sub]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sub === N.sub)));
  q("#nuFood").hidden = N.sub !== "food"; q("#nuSupp").hidden = N.sub !== "supp";
  // ring
  const R = 78, C = 2 * Math.PI * R, fr = P.kcal ? t.kcal / P.kcal : 0, over = t.kcal > P.kcal, left = P.kcal - t.kcal;
  const col = over ? "var(--bad)" : "var(--accent)";
  q("#nuRing").innerHTML = `<svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--line)" stroke-width="14"/>
    <circle class="p" cx="90" cy="90" r="${R}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.min(1, fr))).toFixed(1)}" opacity="${t.kcal ? 1 : 0}"/></svg>
    <div class="c"><div class="big num">${nf(t.kcal)}</div><div class="of">of ${nf(P.kcal)} kcal</div><div class="band" style="color:${over ? "var(--bad)" : "var(--ok)"}">${over ? `${nf(-left)} over` : `${nf(left)} left`}</div></div>`;
  q("#nuHead").textContent = !t.kcal ? (isT ? "Nothing logged yet today" : "Nothing logged on this day") : over ? `${nf(-left)} kcal over your goal` : `${nf(left)} kcal left`;
  // macro tiles
  const M = [["Protein", "p", P.protein, "var(--protein)"], ["Carbs", "c", P.carbs, "var(--carbs)"], ["Fat", "f", P.fat, "var(--fat)"]];
  q("#nuMacros").innerHTML = M.map(([n, k, tg, c]) => {
    const v = t[k], frac = tg ? v / tg : 0;
    const cap = k === "p" && P.proteinCapG ? P.proteinCapG : null;
    const st = cap && v > cap ? ["out", `Over ${cap} g cap`] : frac > 1.1 ? ["border", "Over"] : frac >= .9 ? ["ok", "On target"] : null;
    return `<div class="sub-s nu-tile"><div class="k"><span><i class="nu-dot" style="background:${c}"></i> ${n}</span>${st ? chipH(st[0], st[1]) : ""}</div>
      <div class="v">${r0(v)}<small> / ${tg} g</small></div><div class="bar"><i style="width:${Math.min(100, frac * 100)}%;background:${c}"></i></div>
      <div class="w">${v <= tg ? `${r0(tg - v)} g left` : `${r0(v - tg)} g over`}</div></div>`;
  }).join("");
  const a = act(d), lw = latestWeight();
  q("#nuMeta").innerHTML = [`Sodium <b class="num">${nf(t.na)}</b> / ${nf(P.sodiumMg)} mg`, `Water <b class="num">${(waterOn(d) / 1000).toFixed(2)}</b> / ${(+P.waterL).toFixed(1)} L`,
    a && a.k ? `Burned (Apple Health) <b class="num">${nf(a.k)}</b> active kcal` : "", a && a.s ? `<b class="num">${nf(a.s)}</b> steps` : "",
    lw ? `Weight <b class="num">${r1(lw.kg)}</b> kg (${e2(lw.src)})` : ""].filter(Boolean).join(" · ");
  // meals, hints
  q("#nuMeals").innerHTML = MEALS.filter(m => !m.hidden).map(m => `<button class="pill-btn" data-meal="${m.id}" aria-pressed="${N.meal === m.id}">${m.name}</button>`).join("");
  q("#nuLogHint").textContent = isT ? `Adds to ${MEALS.find(m => m.id === N.meal).name}` : `Adds to ${fmtDay(d).split(",")[0]}`;
  // water & sodium
  const ml = waterOn(d), wt = (P.waterL || 3) * 1000;
  q("#nuWV").textContent = (ml / 1000).toFixed(2); q("#nuWT").textContent = (+P.waterL || 3).toFixed(1);
  q("#nuWG").textContent = `${Math.round(ml / GLASS)} glass${Math.round(ml / GLASS) === 1 ? "" : "es"}`; q("#nuWF").style.width = Math.min(100, ml / wt * 100) + "%"; q("#nuWM").disabled = ml < GLASS;
  const naT = P.sodiumMg || 2000, naF = t.na / naT;
  q("#nuNaV").textContent = nf(t.na); q("#nuNaT").textContent = nf(naT);
  q("#nuNaF").style.width = Math.min(100, naF * 100) + "%"; q("#nuNaF").style.background = naF > 1 ? "var(--bad)" : naF > .8 ? "var(--warn)" : "var(--sodium)";
  q("#nuNaL").innerHTML = naF > 1 ? chipH("out", `${nf(t.na - naT)} mg over`) : naF > .8 ? chipH("border", `${nf(naT - t.na)} mg left`) : `${nf(naT - t.na)} mg left`;
  q("#nuNaNote").textContent = t.naMissing ? `${t.naMissing} item${t.naMissing > 1 ? "s" : ""} without sodium data` : "";
  renderChart(); renderDiary(); renderSupp(); renderMicros();
};

function renderChart(){
  const P = N.plan, end = N.day, days = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(end, -i); days.push({ d, v: totals(d).kcal, has: dayItems(d).length > 0 }); }
  const el = q("#nuChart"), W = Math.max(300, el.clientWidth || 520), H = 180, m = { l: 34, r: 8, t: 12, b: 24 };
  const mx = Math.max(P.kcal * 1.2, ...days.map(x => x.v)) || 1, Y = v => m.t + (1 - v / mx) * (H - m.t - m.b), bw = (W - m.l - m.r) / 7;
  let g = ""; const step = mx > 4000 ? 2000 : 1000;
  for (let v = 0; v <= mx; v += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v ? v / 1000 + "k" : 0}</text>`;
  days.forEach((x, i) => {
    const cx = m.l + i * bw + bw / 2, w = Math.min(34, bw - 12), h = Math.max(x.has ? 3 : 0, (H - m.b) - Y(x.v)), sel = x.d === N.day;
    g += x.has ? `<rect x="${cx - w / 2}" y="${H - m.b - h}" width="${w}" height="${h}" rx="4" fill="${x.v > P.kcal ? "var(--bad)" : "var(--accent)"}" opacity="${sel ? 1 : .55}"><title>${fmtDay(x.d)}: ${nf(x.v)} kcal</title></rect>`
      : `<rect x="${cx - w / 2}" y="${H - m.b - 2}" width="${w}" height="2" fill="var(--line)"/>`;
    g += `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="${sel ? "sel" : ""}">${DOW[parseD(x.d).getDay()]}</text>`;
  });
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(P.kcal)}" y2="${Y(P.kcal)}" stroke="var(--ink-2)" stroke-dasharray="4 4"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories for the 7 days ending ${fmtDay(end)}">${g}</svg>`;
  const lg = days.filter(x => x.has); q("#nuHistHint").textContent = lg.length ? `Avg ${nf(lg.reduce((a, x) => a + x.v, 0) / lg.length)} kcal on ${lg.length} logged day${lg.length > 1 ? "s" : ""}` : "No days logged yet";
}

function renderDiary(){
  const items = dayItems(N.day);
  q("#nuDiaryHint").textContent = items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "";
  q("#nuDiary").innerHTML = MEALS.map(m => {
    const list = items.filter(x => (x.meal || "snacks") === m.id);
    if (m.hidden && !list.length) return "";
    const kc = list.reduce((a, x) => a + (x.kcal || 0), 0);
    return `<div class="nu-meal"><div class="nu-meal-h"><h3>${m.name}</h3><span class="mono small">${list.length ? nf(kc) + " kcal" : ""}</span></div>
      ${list.length ? list.map(x => `<div class="nu-item"><div class="n">${e2(x.name)}</div>
        <div class="s">${x.serving ? `<span>${e2(x.serving)}</span>` : ""}<i>P ${r1(x.p)}</i><i>C ${r1(x.c)}</i><i>F ${r1(x.f)}</i>${x.na != null ? `<i>Na ${nf(x.na)}</i>` : ""}</div>
        <div class="v">${nf(x.kcal)}</div><span class="nu-acts"><button class="nu-x" data-edit-e="${e2(x.id)}" aria-label="Edit ${e2(x.name)}" title="Edit">✎</button><button class="nu-x" data-del="${e2(x.id)}" aria-label="Delete ${e2(x.name)}" title="Delete">✕</button></span></div>`).join("")
      : `<div class="small muted" style="padding:2px 0 6px">Nothing logged</div>`}</div>`;
  }).join("");
}

/* ---------- events: navigation, meals, water, diary ---------- */
function goDay(d){ N.day = d > N.today ? N.today : d; ensureLoaded(N.day); NU.render(); }
q("#nuPrev").onclick = () => goDay(addDays(N.day, -1));
q("#nuNext").onclick = () => goDay(addDays(N.day, 1));
q("#nuToday").onclick = q("#nuBack").onclick = () => goDay(N.today);
q("#nuPick").onchange = ev => { if (/^\d{4}-\d{2}-\d{2}$/.test(ev.target.value)) goDay(ev.target.value); };
qa("[data-sub]").forEach(b => b.onclick = () => { N.sub = b.dataset.sub; try { localStorage.setItem("hl-nu-sub", N.sub); } catch {} NU.render(); });
try { const s = localStorage.getItem("hl-nu-sub"); if (s === "supp" || s === "food") N.sub = s; } catch {}
q("#nuMeals").onclick = ev => { const b = ev.target.closest("[data-meal]"); if (b) { N.meal = b.dataset.meal; NU.render(); } };
q("#nuWP").onclick = () => addWater(GLASS);
q("#nuWM").onclick = () => { if (waterOn(N.day) >= GLASS) addWater(-GLASS); };
q("#nuDiary").onclick = async ev => {
  const ed = ev.target.closest("[data-edit-e]") || (ev.target.closest(".nu-item .n") && ev.target.closest(".nu-item").querySelector("[data-edit-e]"));
  if (ed) { openEditEntry(N.entries.find(x => x.id === ed.dataset.editE)); return; }
  const b = ev.target.closest("[data-del]"); if (!b) return; const it = N.entries.find(x => x.id === b.dataset.del); b.disabled = true; await removeEntry(b.dataset.del); if (it) toast(`Removed ${it.name}`); };
q("#nuPlanBtn").onclick = openPlan;
let rsz; window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (!root.hidden) renderChart(); }, 150); });
setInterval(() => { const t = today(); if (t !== N.today) { const was = N.day === N.today; N.today = t; if (was) N.day = t; NU.render(); } }, 60000);

/* ---------- file inputs: camera and upload go to the same handler ---------- */
const fileHandlers = {};
document.addEventListener("change", ev => {
  const inp = ev.target.closest?.("input[data-file]"); if (!inp || !inp.files?.length) return;
  const f = inp.files[0], key = inp.dataset.file.replace(/Up$/, ""); inp.value = "";
  fileHandlers[key]?.(f);
});

/* ---------- Claude helpers (your key, via the Ledger's claudeCall) ---------- */
async function loadImg(file){
  const img = new Image(); img.src = URL.createObjectURL(file);
  try { await img.decode(); } catch { throw { message: "This photo format couldn't be opened. Try again, or set iPhone Settings → Camera → Formats → Most Compatible." }; }
  return img;
}
function cropCanvas(img, box, maxSide, rotate){
  const sx = img.naturalWidth * box[0], sy = img.naturalHeight * box[1], sw = img.naturalWidth * box[2], sh = img.naturalHeight * box[3];
  const k = Math.min(1, maxSide / Math.max(sw, sh)), w = Math.round(sw * k), h = Math.round(sh * k);
  const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
  if (rotate) { cv.width = h; cv.height = w; ctx.translate(h / 2, w / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h); }
  else { cv.width = w; cv.height = h; ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); }
  return cv;
}
async function jpegB64(file, max = 1600){ const img = await loadImg(file); return cropCanvas(img, [0, 0, 1, 1], max, false).toDataURL("image/jpeg", .88).split(",")[1]; }
async function askJSON(prompt, file, maxTokens = 1500){
  if (typeof claudeCall !== "function") throw { message: "Claude isn't available in this version of the Ledger." };
  const content = [];
  if (file) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await jpegB64(file, 1600) } });
  content.push({ type: "text", text: prompt });
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs = attempt ? [...content.slice(0, -1), { type: "text", text: prompt + "\n\nIMPORTANT: reply with one compact, valid JSON object only. No explanation, no markdown, no comments, no trailing commas." }] : content;
    const r = await claudeCall(msgs, { maxTokens: Math.max(maxTokens, 3000) * (attempt ? 2 : 1) });
    lastText = r.text || "";
    const out = jsonLoose(lastText);
    if (out) return out;
  }
  console.warn("Unreadable Claude reply:", lastText.slice(0, 500));
  throw { message: "Claude's reply couldn't be read. Try again, or split the description into two shorter ones." };
}
// tolerant JSON reader: code fences, text around the object, smart quotes, trailing commas, // comments
function jsonLoose(t){
  const tries = [];
  const f = String(t || "").match(/```(?:json)?\s*([\s\S]*?)```/); if (f) tries.push(f[1]);
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  tries.push(t);
  for (const x of tries) {
    for (const y of [x, x.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\/\/[^\n"]*$/gm, "").replace(/,\s*([}\]])/g, "$1")]) {
      try { return JSON.parse(y); } catch {}
    }
  }
  return null;
}
const errMsg = (err, fb) => err?.code === "no_key" ? `Add your Claude API key in <a href="#settings">Settings</a> to use this.` : e2(err?.message || fb);
function setSt(el, html, bad){ el.className = "nu-status" + (bad ? " err" : ""); el.innerHTML = html || ""; }

/* ---------- food database search ---------- */
const CATS = window.NU_FOOD_CATS || {};
const FD = (window.NU_FOODS || []).map(([name, local, cat, sub, chain, servDesc, servG, kcal, p, c, f, na], i) =>
  ({ i, name, local, cat, sub, chain, servDesc, servG, kcal, p, c, f, na, hay: normQ([name, local, sub, chain, CATS[cat] || ""].join(" ")) }));
function searchFoods(s){
  const nq = normQ(s), t = nq.split(" ").filter(Boolean); if (!t.length) return [];
  return FD.filter(x => t.every(w => x.hay.includes(w))).map(x => { const nn = normQ(x.name); return { x, s: (nn.startsWith(t[0]) ? 0 : 1) + (nn.includes(nq) ? 0 : 1) + x.name.length / 200 }; }).sort((a, b) => a.s - b.s).map(r => r.x);
}
let sT; q("#nuSearch").oninput = () => { clearTimeout(sT); sT = setTimeout(renderRes, 120); };
function renderRes(){
  const v = q("#nuSearch").value, box = q("#nuRes"), res = searchFoods(v);
  if (!v.trim()) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = res.length ? res.slice(0, 8).map(x => `<button type="button" data-fd="${x.i}"><span class="n">${e2(x.name)}${x.local && x.local !== x.name ? ` <span class="s">${e2(x.local)}</span>` : ""}</span>
    <span class="s">${e2([x.chain || x.sub, x.servDesc].filter(Boolean).join(" · "))}</span><span class="k">${nf(x.kcal)} kcal</span></button>`).join("") + (res.length > 8 ? `<div class="more">${res.length - 8} more. Keep typing to narrow down.</div>` : "")
    : `<div class="more">Not in the database. Describe it below and Claude will estimate it, or use Packaged food for a label.</div>`;
}
q("#nuRes").onclick = ev => { const b = ev.target.closest("[data-fd]"); if (b) openFood(FD[+b.dataset.fd]); };
function amountUI(prefix, quick){ return `<div class="nu-form" style="margin-top:4px"><label>Servings<input class="nu-field" id="${prefix}S" type="number" min="0" step="any" inputmode="decimal"></label><label id="${prefix}GL">Grams<input class="nu-field" id="${prefix}G" type="number" min="0" step="any" inputmode="decimal"></label></div>
  <div class="nu-chips" id="${prefix}Q" style="margin-top:8px">${quick}</div><div class="nu-calc"><span id="${prefix}M"></span><span><b id="${prefix}K">0</b> kcal</span></div><div class="small muted" id="${prefix}B"></div>`; }
const per5 = (v, unit) => `<div class="nu-per"><div><b>${nf(v.kcal)}</b><span>kcal</span></div><div><b style="color:var(--protein)">${r1(v.p)}</b><span>protein</span></div><div><b style="color:var(--carbs)">${r1(v.c)}</b><span>carbs</span></div><div><b style="color:var(--fat)">${r1(v.f)}</b><span>fat</span></div><div><b>${v.na == null ? "–" : nf(v.na)}</b><span>Na mg</span></div></div>`;
function openFood(x){
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>${e2(x.name)}</h2>${closeBtn}</div>
    <div class="small muted">${e2([x.local, x.chain || x.sub, CATS[x.cat]].filter(Boolean).join(" · "))} · 1 serving = ${e2(x.servDesc || "1 serving")}${x.servG ? ` (${r1(x.servG)} g)` : ""}</div>
    ${per5(x)}${amountUI("fd", [.5, 1, 1.5, 2, 3].map(k => `<button class="pill-btn" data-k="${k}">${k === .5 ? "½" : k === 1.5 ? "1½" : k}×</button>`).join(""))}
    <div class="row" style="justify-content:space-between"><span class="small muted">From the NutriScan food database</span><button class="btn primary" id="fdAdd">Add to ${MEALS.find(m => m.id === N.meal).name}</button></div>`);
  const S_ = bg.querySelector("#fdS"), G_ = bg.querySelector("#fdG"); S_.value = 1; G_.value = r1(x.servG); if (!x.servG) bg.querySelector("#fdGL").hidden = true;
  const calc = () => { const k = Math.max(0, +S_.value || 0), v = { kcal: r0(x.kcal * k), p: r1(x.p * k), c: r1(x.c * k), f: r1(x.f * k), na: r0(x.na * k) };
    bg.querySelector("#fdK").textContent = nf(v.kcal); bg.querySelector("#fdM").textContent = `P ${v.p} · C ${v.c} · F ${v.f} · Na ${nf(v.na)} mg`;
    bg.querySelectorAll("#fdQ [data-k]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.k === k))); return { k, v }; };
  S_.oninput = () => { if (x.servG) G_.value = r1((+S_.value || 0) * x.servG); calc(); };
  G_.oninput = () => { if (x.servG) S_.value = Math.round((+G_.value || 0) / x.servG * 100) / 100; calc(); };
  bg.querySelector("#fdQ").onclick = ev => { const b = ev.target.closest("[data-k]"); if (b) { S_.value = b.dataset.k; S_.oninput(); } };
  calc();
  bg.querySelector("#fdAdd").onclick = async ev => { const { k, v } = calc(); if (!k) return; ev.target.disabled = true;
    try { await addEntries([{ name: x.chain ? `${x.name} · ${x.chain}` : x.name, serving: `${+k.toFixed(2)} × ${x.servDesc || "serving"}${x.servG ? ` (${r1(x.servG * k)} g)` : ""}`, ...v, src: "database" }]);
      toast(`Added ${x.name} · ${nf(v.kcal)} kcal`); bg.close(); q("#nuSearch").value = ""; renderRes(); } catch { ev.target.disabled = false; } };
}

/* ---------- describe / meal photo → Claude estimate ---------- */
fileHandlers.meal = f => { N.photo = f; q("#nuThumbImg").src = URL.createObjectURL(f); q("#nuThumb").hidden = false; };
q("#nuThumbX").onclick = () => { N.photo = null; q("#nuThumb").hidden = true; };
q("#nuEst").onclick = async () => {
  const text = q("#nuText").value.trim(), st = q("#nuAiSt");
  if (!text && !N.photo) { setSt(st, "Describe what you ate, or attach a meal photo.", true); return; }
  q("#nuEst").disabled = true; setSt(st, "Estimating… (a few seconds)"); q("#nuPreview").innerHTML = "";
  try {
    const out = await askJSON(`You are a precise nutrition estimator for a food diary in India (Bengaluru). ${N.photo ? "The photo shows the meal; identify each food and estimate the visible portion." : ""}
What they ate: """${text || "(see photo)"}"""
Rules: split into items; one best number per item, never a range. Use standard references (IFCT 2017 for Indian foods, USDA FoodData Central, brand labels for branded or restaurant items). Assume Indian home portions unless stated (1 roti ≈ 30–35 g atta, 1 katori dal ≈ 150 ml, 1 cup cooked rice ≈ 150 g) and include typical oil or ghee. kcal ≈ 4p + 4c + 9f. Estimate sodium in mg ("na") including salt, pickles, papad and sauces.
${healthContext()}
Reply with ONLY JSON: {"items":[{"name":"","serving":"","kcal":0,"p":0,"c":0,"f":0,"na":0}],"note":"one short line or empty"}`, N.photo);
    const items = (out.items || []).filter(x => x && x.name).map(x => ({ name: x.name, serving: x.serving || "", kcal: r0(x.kcal), p: r1(x.p), c: r1(x.c), f: r1(x.f), na: x.na == null ? null : r0(x.na) }));
    if (!items.length) throw { message: "No food items recognised. Try describing it." };
    N.pending = { items, note: out.note || "", src: N.photo ? "photo" : "ai" }; setSt(st, ""); renderPreview();
  } catch (err) { setSt(st, errMsg(err, "Couldn't estimate that. Try again or add it manually."), true); }
  finally { q("#nuEst").disabled = false; }
};
function renderPreview(){
  const p = N.pending, box = q("#nuPreview"); if (!p) { box.innerHTML = ""; return; }
  const tot = p.items.reduce((a, x) => a + x.kcal, 0);
  box.innerHTML = p.items.map((x, i) => `<div class="nu-pv"><div class="n">${e2(x.name)}</div><input type="number" class="nu-field" min="0" step="any" value="${x.kcal}" data-i="${i}" aria-label="Calories for ${e2(x.name)}"><button class="nu-x" data-rm="${i}" aria-label="Drop ${e2(x.name)}">✕</button>
    <div class="s">${e2(x.serving)}</div><div class="mm"><span>P ${x.p}</span><span>C ${x.c}</span><span>F ${x.f}</span>${x.na != null ? `<span>Na ${nf(x.na)} mg</span>` : ""}</div></div>`).join("")
    + (p.note ? `<div class="small muted" style="margin-top:6px">${e2(p.note)}</div>` : "")
    + `<div class="row" style="justify-content:space-between;margin-top:10px"><b class="mono">${nf(tot)} kcal → ${MEALS.find(m => m.id === N.meal).name}</b><span class="row"><button class="btn" id="pvX">Discard</button><button class="btn primary" id="pvAdd">Add to diary</button></span></div>`;
}
q("#nuPreview").addEventListener("input", ev => {
  const i = ev.target.dataset.i; if (i == null) return; const it = N.pending.items[i], nk = Math.max(0, +ev.target.value || 0);
  if (it.kcal > 0) { const k = nk / it.kcal; it.p = r1(it.p * k); it.c = r1(it.c * k); it.f = r1(it.f * k); if (it.na != null) it.na = r0(it.na * k); }
  it.kcal = nk; ev.target.closest(".nu-pv").querySelector(".mm").innerHTML = `<span>P ${it.p}</span><span>C ${it.c}</span><span>F ${it.f}</span>${it.na != null ? `<span>Na ${nf(it.na)} mg</span>` : ""}`;
});
q("#nuPreview").addEventListener("click", async ev => {
  const rm = ev.target.closest("[data-rm]"); if (rm) { N.pending.items.splice(+rm.dataset.rm, 1); if (!N.pending.items.length) N.pending = null; renderPreview(); return; }
  if (ev.target.id === "pvX") { N.pending = null; renderPreview(); return; }
  if (ev.target.id === "pvAdd") { ev.target.disabled = true;
    try { const add = await addEntries(N.pending.items.map(x => ({ ...x, src: N.pending.src }))); toast(`Added ${add.length} item${add.length > 1 ? "s" : ""} · ${nf(add.reduce((a, x) => a + x.kcal, 0))} kcal`);
      N.pending = null; renderPreview(); q("#nuText").value = ""; q("#nuThumbX").click(); } catch { ev.target.disabled = false; } }
});
q("#nuManT").onclick = () => { q("#nuMan").hidden = !q("#nuMan").hidden; };
q("#nuManX").onclick = () => { q("#nuMan").reset(); q("#nuMan").hidden = true; };
let manBasis = "100";
function manVals(){
  const amt = +q("#nuMAmt").value || 0, k = manBasis === "100" ? amt / 100 : 1, raw = id => +q(id).value || 0;
  let kcal = raw("#nuMK"); const p = raw("#nuMP"), c = raw("#nuMC"), f = raw("#nuMF"); if (!kcal) kcal = p * 4 + c * 4 + f * 9;
  const naS = q("#nuMNa").value.trim();
  return { amt, k, v: { kcal: r0(kcal * k), p: r1(p * k), c: r1(c * k), f: r1(f * k), na: naS === "" ? null : r0(+naS * k) }, empty: !p && !c && !f && kcal > 0 };
}
function manCalc(){
  const { amt, v, empty } = manVals();
  q("#nuMTot").textContent = nf(v.kcal);
  q("#nuMSum").textContent = `${manBasis === "100" ? `${r1(amt)} g → ` : ""}P ${v.p} · C ${v.c} · F ${v.f}${v.na != null ? ` · Na ${nf(v.na)} mg` : ""}`;
  q("#nuMWarn").hidden = !empty;
}
function setManBasis(m){ manBasis = m; qa("[data-mb]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mb === m))); q("#nuMAmtL").hidden = m !== "100";
  qa(".nuMU").forEach(el => el.textContent = el.textContent.replace(/ \/ 100 g$/, "") + (m === "100" ? " / 100 g" : "")); manCalc(); }
qa("[data-mb]").forEach(b => b.onclick = () => setManBasis(b.dataset.mb));
q("#nuMan").addEventListener("input", manCalc);
q("#nuMan").onsubmit = async ev => {
  ev.preventDefault(); const name = q("#nuMName").value.trim(); if (!name) return;
  const { amt, v } = manVals(); if (manBasis === "100" && !amt) { toast("Enter how much you ate."); return; }
  try { await addEntries([{ name, serving: manBasis === "100" ? `${r1(amt)} g` : "", ...v, src: "manual" }]); toast(`Added ${name} · ${nf(v.kcal)} kcal`); q("#nuMan").reset(); q("#nuMAmt").value = 100; manCalc(); q("#nuMan").hidden = true; } catch {}
};
manCalc();

/* ---------- packaged food: label (any pack) or barcode (Open Food Facts + your library) ---------- */
let zxP = null;
const loadZX = () => window.ZXing ? Promise.resolve(window.ZXing) : (zxP ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = ZX_URL; s.onload = () => window.ZXing ? res(window.ZXing) : rej(); s.onerror = () => { zxP = null; rej(); }; document.head.appendChild(s); }));
function zxReader(ZX){ const h = new Map(); h.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODE_128]); h.set(ZX.DecodeHintType.TRY_HARDER, true); return new ZX.BrowserMultiFormatReader(h); }
const nativeDet = async () => { try { if (!("BarcodeDetector" in window)) return null; const f = await BarcodeDetector.getSupportedFormats(); return f.includes("ean_13") ? new BarcodeDetector({ formats: f.filter(x => ["ean_13","ean_8","upc_a","upc_e","code_128"].includes(x)) }) : null; } catch { return null; } };
async function decodeFile(file, onStage){
  const img = await loadImg(file), det = await nativeDet();
  if (det) { try { const r = await det.detect(img); if (r[0]?.rawValue) return repairCode(r[0].rawValue); } catch {} }
  let ZX = null; try { ZX = await loadZX(); } catch {}
  if (ZX) { const rd = zxReader(ZX);
    for (const [b, s, rot] of [[[0,0,1,1],1400,false],[[.15,.25,.7,.5],1200,false],[[0,.3,1,.4],1400,false],[[0,0,1,1],900,false],[[.25,.35,.5,.3],900,false],[[0,0,1,1],1400,true],[[0,0,1,.5],1200,false],[[0,.5,1,.5],1200,false]]) {
      try { const r = await rd.decodeFromImageUrl(cropCanvas(img, b, s, rot).toDataURL("image/jpeg", .92)); if (r?.getText()) return repairCode(r.getText()); } catch {} } }
  onStage?.("Reading the printed digits with Claude…");
  try { const out = await askJSON(`The photo shows a product barcode. Read the number printed under the bars. Reply with ONLY JSON: {"code":"","readable":true}`, file, 200);
    const c = repairCode(out?.code); if (out?.readable !== false && eanValid(c)) return c; } catch (err) { if (err?.code === "no_key") throw err; }
  return null;
}
async function lookupOFF(code){
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,serving_quantity,product_quantity,product_quantity_unit,nutriments`, { signal: ctrl.signal });
    if (!r.ok) return null; const j = await r.json(), p = j?.product, n = p?.nutriments || {};
    let kcal = n["energy-kcal_100g"]; if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184;
    if (j.status !== 1 || kcal == null) return null;
    const na = n["sodium_100g"] != null ? n["sodium_100g"] * 1000 : n["salt_100g"] != null ? n["salt_100g"] * 400 : null;
    return { code, name: p.product_name_en || p.product_name || "Packaged food", brand: (p.brands || "").split(",")[0].trim(), servingG: +p.serving_quantity || null, packG: +p.product_quantity || null,
      basis: /ml|l/i.test(p.product_quantity_unit || "") ? "ml" : "g", per100: { kcal: r0(kcal), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g), na: na == null ? null : r0(na) }, src: "openfoodfacts" };
  } catch { return null; } finally { clearTimeout(t); }
}
const LABEL_PROMPT = code => `This photo shows a packaged food${code ? ` (barcode ${code})` : ""}, ideally its "Nutritional Information" panel (Indian FSSAI labels give per 100 g / 100 ml, sometimes per serving) and maybe the net quantity.
Read the panel exactly. Return values per 100 g (per 100 ml for liquids, then "basis":"ml"). If only per-serving values are printed, convert using the serving size. Sodium in mg (salt × 400 = sodium mg per g of salt). Energy in kcal (kJ ÷ 4.184).
servingG = label serving size in g/ml or null; packG = net quantity of the whole pack or null. Name and brand from the pack if visible.
Reply with ONLY JSON: {"name":"","brand":"","basis":"g","servingG":null,"packG":null,"per100":{"kcal":0,"p":0,"c":0,"f":0,"na":0},"readable":true,"note":""}
If the panel isn't readable, "readable":false and why in "note".`;

let scan = null;
function stopCam(){ if (!scan) return; clearTimeout(scan.timer); try { scan.reader?.reset(); } catch {} scan.stream?.getTracks().forEach(t => t.stop()); scan.stream = null; const v = scan.bg?.querySelector("#pkView"); if (v) v.hidden = true; }
q("#nuPack").onclick = openPack;
function openPack(){
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Packaged food</h2>${closeBtn}</div>
    <div class="small muted">Adds to ${MEALS.find(m => m.id === N.meal).name} · ${N.day === N.today ? "today" : fmtDay(N.day)}</div>
    <div class="nu-sec" style="margin-top:6px">1 · Nutrition label (works for any pack)</div>
    <div class="row">${fileBtn("Take photo of label", "lbl", true, true)}${fileBtn("Upload", "lblUp", false, false)}</div>
    <div class="small muted">Capture the "Nutritional Information" table. Claude reads per-100 g values, serving and pack size; then you enter how much you had.</div>
    <div class="nu-sec">2 · Barcode (Open Food Facts + products you've saved)</div>
    <div class="nu-scan" id="pkView" hidden><video playsinline muted></video><div class="fr"></div></div>
    <div class="row"><button class="btn" id="pkLive">${CAM}Scan live</button>${fileBtn("Photo of barcode", "bc", false, true)}${fileBtn("Upload", "bcUp", false, false)}</div>
    <div class="row"><input class="nu-field" id="pkCode" inputmode="numeric" autocomplete="off" placeholder="Or type the barcode number" style="flex:1"><button class="btn" id="pkGo">Look up</button></div>
    <div class="small muted">Many barcodes only carry price or stock codes. If a product isn't found, read its label once and it's saved for next time.</div>
    <div class="nu-status" id="pkSt" aria-live="polite"></div>
    <div id="pkRes"></div><div id="pkRecent"></div>`);
  scan = { bg, code: null }; bg.addEventListener("nuclose", () => { stopCam(); scan = null; });
  const st = (m, bad) => setSt(bg.querySelector("#pkSt"), m, bad);
  scan.st = st;
  fileHandlers.lbl = f => { scan && (scan.code = null); bg.querySelector("#pkRes").innerHTML = ""; readLabel(f, ""); };
  fileHandlers.bc = async f => { st("Reading barcode…"); try { const c = await decodeFile(f, m => st(m)); if (c) gotCode(c); else st("Couldn't read a barcode in that photo. Move closer so the bars and digits fill the frame, or type the number.", true); } catch (err) { st(errMsg(err, "Couldn't read that photo."), true); } };
  const go = () => { const c = repairCode(bg.querySelector("#pkCode").value); if (!/^\d{8,14}$/.test(c)) { st("Barcodes are 8 to 14 digits.", true); return; } gotCode(c); };
  bg.querySelector("#pkGo").onclick = go; bg.querySelector("#pkCode").onkeydown = ev => { if (ev.key === "Enter") go(); };
  bg.querySelector("#pkLive").onclick = async () => {
    const box = bg.querySelector("#pkView"), video = box.querySelector("video"); st("Opening camera…");
    try {
      scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      video.srcObject = scan.stream; await video.play(); box.hidden = false; st("Point at the barcode");
      const det = await nativeDet();
      if (det) { const loop = async () => { if (!scan?.stream) return; try { const r = await det.detect(video); if (r[0]?.rawValue) return gotCode(repairCode(r[0].rawValue)); } catch {} scan.timer = setTimeout(loop, 200); }; loop(); }
      else { const ZX = await loadZX(); scan.reader = zxReader(ZX); scan.reader.decodeFromVideoElementContinuously(video, res => { if (res && scan?.stream) gotCode(repairCode(res.getText())); }); }
    } catch { stopCam(); st("Couldn't open the live camera. Allow camera access for this site in Safari, or use “Photo of barcode”.", true); }
  };
  const list = Object.values(N.products).sort((a, b) => String(b.usedAt || "").localeCompare(String(a.usedAt || ""))).slice(0, 10);
  bg.querySelector("#pkRecent").innerHTML = list.length ? `<div class="nu-sec">Your products</div><div class="nu-chips">${list.map(p => `<button class="pill-btn" data-code="${e2(p.code)}">${e2(p.name)}</button>`).join("")}</div>` : "";
  bg.querySelector("#pkRecent").onclick = ev => { const b = ev.target.closest("[data-code]"); if (b) { scan.code = null; showProduct(N.products[b.dataset.code]); } };
}
async function gotCode(code){
  if (!scan || scan.code === code) return; stopCam(); scan.code = code;
  const bg = scan.bg; bg.querySelector("#pkCode").value = code;
  if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
  const known = N.products[code];
  if (known) { scan.st(""); return showProduct(known); }
  scan.st(`Looking up ${code} on Open Food Facts…`);
  const off = await lookupOFF(code); if (!scan || scan.code !== code) return;
  if (off) { await saveProduct(off); scan.st("Found on Open Food Facts. Check the values against the pack."); return showProduct(off); }
  scan.st(""); showUnknown(code);
}
async function readLabel(file, code){
  const st = scan?.st || (() => {}); st("Reading the label… (a few seconds)");
  try {
    const out = await askJSON(LABEL_PROMPT(code), file);
    if (!out || out.readable === false || !out.per100) { st(e2(out?.note || "Couldn't read the label. Try a sharper, closer photo of the nutrition panel."), true); return; }
    const P1 = out.per100;
    const prod = { code: code || uid("L"), name: out.name || "Packaged food", brand: out.brand || "", basis: out.basis === "ml" ? "ml" : "g", servingG: +out.servingG || null, packG: +out.packG || null,
      src: "label-photo", noBarcode: !code, per100: { kcal: r0(P1.kcal), p: r1(P1.p), c: r1(P1.c), f: r1(P1.f), na: P1.na == null ? null : r0(P1.na) } };
    await saveProduct(prod); st(e2(out.note || "")); showProduct(prod);
  } catch (err) { st(errMsg(err, "Couldn't read the label. Try again, or enter the values by hand."), true); }
}
function showUnknown(code, pre){
  const box = scan.bg.querySelector("#pkRes"), x = pre || {}, p = x.per100 || {};
  box.innerHTML = `<div class="card" style="margin-top:4px"><h3>${pre ? "Edit label values" : "Barcode read ✓, now add the values"}</h3>
    <div class="small muted">${pre ? e2(x.name) : `${e2(code)} isn't on Open Food Facts or in your library. Add it once and every later scan fills in instantly.`}</div>
    <div class="row">${fileBtn("Photograph the nutrition table", "lblc", true, true)}${fileBtn("Upload", "lblcUp", false, false)}</div>
    <div class="row"><input class="nu-field" id="pkName" placeholder="Or type product name + size, e.g. Parle-G 250 g" style="flex:1"><button class="btn" id="pkNameGo">Fill in</button></div>
    <button class="btn" id="pkHandT" style="border:0;padding:4px 0;color:var(--accent);margin-top:6px">${pre ? "Edit the values" : "Enter label values by hand"}</button>
    <form class="nu-form" id="pkHand" ${pre ? "" : "hidden"}>
      <label class="full">Product name<input name="name" required value="${e2(x.name || "")}"></label>
      <label>Label is per 100…<select name="basis"><option value="g">g</option><option value="ml" ${x.basis === "ml" ? "selected" : ""}>ml</option></select></label>
      <label>Serving size<input name="servingG" type="number" min="0" step="any" value="${x.servingG ?? ""}"></label>
      <label>Pack size<input name="packG" type="number" min="0" step="any" value="${x.packG ?? ""}"></label>
      <label>kcal / 100<input name="kcal" type="number" min="0" step="any" required value="${p.kcal ?? ""}"></label>
      <label>Protein / 100<input name="p" type="number" min="0" step="any" value="${p.p ?? 0}"></label>
      <label>Carbs / 100<input name="c" type="number" min="0" step="any" value="${p.c ?? 0}"></label>
      <label>Fat / 100<input name="f" type="number" min="0" step="any" value="${p.f ?? 0}"></label>
      <label>Sodium mg / 100<input name="na" type="number" min="0" step="any" value="${p.na ?? ""}"></label>
      <div class="full row" style="justify-content:flex-end"><button class="btn primary" type="submit">Save product</button></div>
    </form></div>`;
  fileHandlers.lblc = f => readLabel(f, x.noBarcode ? "" : code);
  box.querySelector("#pkHandT").onclick = () => { const fm = box.querySelector("#pkHand"); fm.hidden = !fm.hidden; };
  const nameGo = async () => { const v = box.querySelector("#pkName").value.trim(); if (!v) return; scan.st("Looking it up… (a few seconds)");
    try { const out = await askJSON(`Give the nutrition label of this packaged food sold in India: """${v}"""${code ? ` (barcode ${code})` : ""}. Use the brand's published values as you know them; pick the closest variant and name it. Values per 100 g (or 100 ml, then "basis":"ml"), sodium in mg, servingG/packG if known else null. If you don't recognise it, "found":false with a reason in "note"; otherwise say in "note" which variant you used.
Reply with ONLY JSON: {"name":"","brand":"","basis":"g","servingG":null,"packG":null,"per100":{"kcal":0,"p":0,"c":0,"f":0,"na":0},"found":true,"note":""}`);
      if (!out || out.found === false || !out.per100) { scan.st(e2(out?.note || "Not recognised. Try the full name, or photograph the table."), true); return; }
      const P1 = out.per100, prod = { code: code || uid("L"), name: out.name || v, brand: out.brand || "", basis: out.basis === "ml" ? "ml" : "g", servingG: +out.servingG || null, packG: +out.packG || null, src: "name-lookup", noBarcode: !code,
        per100: { kcal: r0(P1.kcal), p: r1(P1.p), c: r1(P1.c), f: r1(P1.f), na: P1.na == null ? null : r0(P1.na) } };
      await saveProduct(prod); scan.st(e2((out.note ? out.note + " " : "") + "Check against the pack.")); showProduct(prod);
    } catch (err) { scan.st(errMsg(err, "Lookup failed."), true); } };
  box.querySelector("#pkNameGo").onclick = nameGo;
  box.querySelector("#pkHand").onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target);
    const prod = { ...x, code, name: String(f.get("name")).trim(), basis: f.get("basis") === "ml" ? "ml" : "g", servingG: +f.get("servingG") || null, packG: +f.get("packG") || null, src: pre ? (x.src || "manual") : "manual",
      per100: { kcal: +f.get("kcal") || 0, p: +f.get("p") || 0, c: +f.get("c") || 0, f: +f.get("f") || 0, na: f.get("na") === "" ? null : +f.get("na") } };
    await saveProduct(prod); showProduct(prod); };
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}
function showProduct(prod){
  if (!scan) return; const box = scan.bg.querySelector("#pkRes"), x = prod.per100 || {}, u = prod.basis === "ml" ? "ml" : "g";
  const hasS = prod.servingG > 0, hasP = prod.packG > 0, defG = hasS ? prod.servingG : hasP && prod.packG <= 100 ? prod.packG : 100;
  const quick = [25, 50, 100, 150, 200].filter(g => !hasP || g < prod.packG).map(g => `<button class="pill-btn" data-g="${g}">${g} ${u}</button>`).join("")
    + (hasP ? [[.25, "¼"], [.5, "½"], [1, "Whole"]].map(([k, l]) => `<button class="pill-btn" data-g="${r1(prod.packG * k)}">${l} pack</button>`).join("") : "");
  box.innerHTML = `<div class="card" style="margin-top:4px"><h3>${e2(prod.name)}</h3>
    <div class="small muted">${e2([prod.brand, prod.noBarcode ? "From label" : `Barcode ${prod.code}`, { openfoodfacts: "Open Food Facts", "label-photo": "Read from label", "name-lookup": "From brand info, check the pack", manual: "Entered by hand" }[prod.src] || ""].filter(Boolean).join(" · "))}</div>
    <div class="small muted" style="margin-top:8px">Label · per 100 ${u}${hasS ? ` · serving ${r1(prod.servingG)} ${u}` : ""}${hasP ? ` · pack ${r1(prod.packG)} ${u}` : ""}</div>
    ${per5(x)}<div class="nu-sec" style="margin-top:4px">How much did you have?</div>${amountUI("pa", quick)}
    <div class="row" style="justify-content:space-between"><button class="btn" id="paEdit">Edit values</button><button class="btn primary" id="paAdd">Add to ${MEALS.find(m => m.id === N.meal).name}</button></div></div>`;
  const S_ = box.querySelector("#paS"), G_ = box.querySelector("#paG"); box.querySelector("#paGL").firstChild.textContent = `Quantity (${u})`;
  G_.value = r1(defG); if (hasS) S_.value = 1; else { S_.disabled = true; S_.placeholder = "No serving size"; }
  const calc = () => { const g = +G_.value || 0, k = g / 100, v = { kcal: r0(x.kcal * k), p: r1(x.p * k), c: r1(x.c * k), f: r1(x.f * k), na: x.na == null ? null : r0(x.na * k) };
    box.querySelector("#paK").textContent = nf(v.kcal); box.querySelector("#paM").textContent = `P ${v.p} · C ${v.c} · F ${v.f}${v.na != null ? ` · Na ${nf(v.na)} mg` : ""}`;
    box.querySelector("#paB").textContent = `${r1(g)} ${u} ÷ 100 ${u} = ${+k.toFixed(3)} × the label values${hasP && g ? ` · ${Math.round(g / prod.packG * 100)}% of the pack` : ""}`;
    box.querySelectorAll("#paQ [data-g]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.g === r1(g)))); return { g, v }; };
  const syncS = () => { if (hasS) S_.value = Math.round((+G_.value || 0) / prod.servingG * 100) / 100; };
  S_.oninput = () => { G_.value = r1((+S_.value || 0) * prod.servingG); calc(); }; G_.oninput = () => { syncS(); calc(); };
  box.querySelector("#paQ").onclick = ev => { const b = ev.target.closest("[data-g]"); if (b) { G_.value = b.dataset.g; syncS(); calc(); } };
  calc();
  box.querySelector("#paEdit").onclick = () => showUnknown(prod.code, prod);
  box.querySelector("#paAdd").onclick = async ev => { const { g, v } = calc(); if (!g) return; ev.target.disabled = true;
    try { await addEntries([{ name: prod.brand && !prod.name.toLowerCase().includes(prod.brand.toLowerCase()) ? `${prod.name} · ${prod.brand}` : prod.name,
        serving: hasS && +S_.value ? `${r1(g)} ${u} (${+S_.value} serving${+S_.value === 1 ? "" : "s"})` : `${r1(g)} ${u}`, ...v, barcode: prod.noBarcode ? null : prod.code, src: prod.noBarcode ? "label" : "barcode" }]);
      saveProduct({ ...prod, usedAt: new Date().toISOString() }); toast(`Added ${prod.name} · ${nf(v.kcal)} kcal`); scan.bg.close(); } catch { ev.target.disabled = false; } };
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- supplements ---------- */
const uLabel = (n, unit) => { n = +(+n).toFixed(2); unit = unit || "dose"; return ["g", "ml"].includes(unit) ? `${n} ${unit}` : `${n} ${unit}${n === 1 ? "" : "s"}`; };
const parseMicros = t => String(t || "").split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(.+?)[\s:=-]+(\d+(?:\.\d+)?)\s*([a-zA-Zµμ%]+)?\s*$/); return m ? { n: m[1].trim(), amt: +m[2], unit: (m[3] || "").replace("μ", "µ") } : null; }).filter(Boolean);
const microsText = a => (a || []).map(x => `${x.n}: ${+(+x.amt).toFixed(3)} ${x.unit || ""}`.trim()).join("\n");
const scaleM = (o, k) => ({ kcal: r0((+o?.kcal || 0) * k), p: r1((+o?.p || 0) * k), c: r1((+o?.c || 0) * k), f: r1((+o?.f || 0) * k), na: r0((+o?.na || 0) * k) });
const scaleMi = (a, k) => (a || []).map(m => ({ n: m.n, amt: +((+m.amt || 0) * k).toFixed(3), unit: m.unit || "" }));
function suppNorm(x){ const sq = +x.servingQty > 0 ? +x.servingQty : 1, tq = +x.takeQty > 0 ? +x.takeQty : sq, ps = x.perServing || x.perDose || {}, ms = x.microsServing || x.micros || [], k = x.perServing ? tq / sq : 1;
  return { ...x, unit: x.unit || "dose", servingQty: sq, takeQty: tq, perServing: ps, microsServing: ms, k, dose: scaleM(ps, k), doseMicros: scaleMi(ms, k) }; }
function packLeft(x){ const n = suppNorm(x); if (!(+x.packUnits > 0)) return null; const start = x.packStart || "0000-00-00";
  const used = N.entries.filter(e => e.suppId === x.id && e.date >= start).reduce((a, e) => a + (+e.units || n.takeQty), 0);
  const left = Math.max(0, +x.packUnits - used); return { left: +left.toFixed(2), days: Math.floor(left / (n.takeQty * Math.max(1, +x.dosesPerDay || 1))), total: +x.packUnits }; }
const takenOn = (id, d) => N.entries.filter(e => e.suppId === id && e.date === d).sort((a, b) => String(a.at).localeCompare(String(b.at)));
const suppList = () => Object.values(N.supps).sort((a, b) => (b.active !== false) - (a.active !== false) || String(a.name).localeCompare(String(b.name)));
const packLine = pl => pl ? (pl.days < 7 ? chipH("out", `${pl.left} of ${pl.total} left · restock`) : `<span class="small muted">${pl.left} of ${pl.total} left · ~${pl.days} days</span>`) : "";
function renderSupp(){
  const d = N.day, act_ = suppList().filter(x => x.active !== false);
  q("#nuDoseHint").textContent = d === N.today ? "Today" : fmtDay(d);
  q("#nuDoses").innerHTML = act_.length ? act_.map(x0 => { const x = suppNorm(x0), n = takenOn(x.id, d).length, per = Math.max(1, +x.dosesPerDay || 1), pd = x.dose;
    return `<div class="nu-dose"><div class="n">${e2(x.name)}</div><div class="s">${e2(uLabel(x.takeQty, x.unit))} per dose · ${nf(pd.kcal)} kcal · P ${pd.p} · C ${pd.c} · F ${pd.f}${x.timing ? ` · ${e2(x.timing)}` : ""} ${x0.packUnits ? "<br>" + packLine(packLeft(x0)) : ""}</div>
      <div class="ctl"><span class="nu-pips" aria-label="${n} of ${per} doses taken">${Array.from({ length: Math.max(per, n) }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>
      <button class="nu-sq" data-undo="${e2(x.id)}" ${n ? "" : "disabled"} aria-label="Undo a dose">−</button><button class="nu-sq plus" data-take="${e2(x.id)}" aria-label="Take a dose">+</button></div></div>`; }).join("")
    : `<div class="empty">No supplements yet. Add the ones you take below and they appear here as a daily checklist.</div>`;
  const ents = N.entries.filter(e => e.date === d && e.meal === "supplements"), t = { kcal: 0, p: 0, c: 0, f: 0, na: 0 }, mi = {};
  for (const e of ents) { t.kcal += e.kcal || 0; t.p += e.p || 0; t.c += e.c || 0; t.f += e.f || 0; t.na += e.na || 0; for (const m of e.micros || []) { const k = m.n.toLowerCase() + "|" + m.unit; (mi[k] ||= { n: m.n, unit: m.unit, amt: 0 }).amt += +m.amt || 0; } }
  q("#nuSTHint").textContent = ents.length ? `${ents.length} dose${ents.length > 1 ? "s" : ""}` : "";
  q("#nuSTot").innerHTML = ents.length ? `<div class="nu-kv"><div>Calories</div><div>${nf(t.kcal)} kcal</div><div>Protein</div><div>${r1(t.p)} g</div><div>Carbs</div><div>${r1(t.c)} g</div><div>Fat</div><div>${r1(t.f)} g</div>${t.na ? `<div>Sodium</div><div>${nf(t.na)} mg</div>` : ""}
    ${Object.values(mi).map(m => `<div>${e2(m.n)}</div><div>${+m.amt.toFixed(2)} ${e2(m.unit)}</div>`).join("")}</div><p class="small muted">Already included in the day's calorie and macro totals.</p>` : `<div class="empty">Nothing taken on this day.</div>`;
  const all = suppList(); q("#nuLibHint").textContent = all.length ? `${all.length} saved` : "";
  q("#nuLib").innerHTML = all.map(x0 => { const x = suppNorm(x0); return `<div class="lrow" style="${x.active === false ? "opacity:.55" : ""}"><div class="n">${e2(x.name)}${x.brand ? ` <span class="muted small">· ${e2(x.brand)}</span>` : ""}</div><button class="btn" data-edit="${e2(x.id)}">Edit</button>
    <div class="d">${x0.perServing ? `Label serving ${e2(uLabel(x.servingQty, x.unit))} · you take ${e2(uLabel(x.takeQty, x.unit))}` : ""} · ${Math.max(1, +x.dosesPerDay || 1)}×/day${x.active === false ? " · paused" : ""} ${x0.packUnits ? " · " + packLine(packLeft(x0)) : ""} ${x.kidneyNote ? "<br>" + chipH("border", x.kidneyNote) : ""}</div></div>`; }).join("");
}
q("#nuDoses").onclick = async ev => {
  const tk = ev.target.closest("[data-take]"), un = ev.target.closest("[data-undo]");
  if (tk) { const x = suppNorm(N.supps[tk.dataset.take]); tk.disabled = true;
    try { await addEntries([{ meal: "supplements", name: x.name, serving: uLabel(x.takeQty, x.unit), ...x.dose, suppId: x.id, units: x.takeQty, micros: x.doseMicros, src: "supplement" }]); toast(`${x.name} taken`); } catch {} finally { tk.disabled = false; } }
  if (un) { const l = takenOn(un.dataset.undo, N.day), last = l[l.length - 1]; if (last) { await removeEntry(last.id); toast("Dose removed"); } }
};
q("#nuLib").onclick = ev => { const b = ev.target.closest("[data-edit]"); if (b) openSupp("manual", N.supps[b.dataset.edit]); };
q("#nuSFind").onclick = () => openSupp("search"); q("#nuSScan").onclick = () => openSupp("scan"); q("#nuSMan").onclick = () => openSupp("manual");
const SUPP_JSON = `{"name":"","brand":"","unit":"capsule","servingQty":2,"packUnits":60,"perServing":{"kcal":0,"p":0,"c":0,"f":0,"na":0},"micros":[{"n":"Vitamin D3","amt":1000,"unit":"IU"}],"kidneyNote":"","note":"","found":true}`;
const SUPP_RULES = `Rules: unit = one countable piece (${UNITS.join(", ")}); powders by scoop → "scoop". servingQty = units in ONE label serving. packUnits = units in the whole pack (or servings per container × servingQty; net weight ÷ scoop grams), 0 if unknown. perServing = per ONE label serving: kcal, p, c, f in g, na in mg. micros = every vitamin/mineral/active per serving with amount and unit (IU, mg, µg, g), incl. creatine, caffeine, EPA/DHA; not macros. kidneyNote: the person has ONE underdeveloped kidney (normal eGFR, protein cap ~120 g/day): for creatine, protein powders, vitamin D > 2,000 IU/serving, vitamin C ≥ 500 mg, potassium/magnesium/phosphorus, herbal blends or NSAIDs give ONE short neutral line like "Creatine: check with your nephrologist", else "".`;
function openSupp(mode, ex0){
  const ex = ex0 ? suppNorm(ex0) : null;
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>${ex ? "Edit supplement" : "Add supplement"}</h2>${closeBtn}</div>
    ${ex ? "" : `<div class="row" id="spModes"><button class="pill-btn" data-m="search">Find a brand</button><button class="pill-btn" data-m="scan">Scan box / label</button><button class="pill-btn" data-m="manual">Manual</button></div>`}
    <div id="spSearch" hidden><div class="row"><input class="nu-field" id="spQ" placeholder="e.g. MuscleBlaze Biozyme Whey, Carbamide Forte D3" style="flex:1"><button class="btn primary" id="spFind">Find</button></div><div class="small muted">Uses the brand's published label as Claude knows it; check it against your box.</div></div>
    <div id="spScan" hidden><div class="row">${fileBtn("Supplement Facts panel", "spl", true, true)}${fileBtn("Upload", "splUp", false, false)}</div><div class="row">${fileBtn("Box barcode", "spb", false, true)}${fileBtn("Upload", "spbUp", false, false)}</div></div>
    <div class="nu-status" id="spSt"></div>
    <form class="nu-form" id="spForm" ${mode === "manual" || ex ? "" : "hidden"}>
      <label class="full">Name<input name="name" required></label><label>Brand<input name="brand"></label>
      <label>Unit<select name="unit">${UNITS.map(u => `<option>${u}</option>`).join("")}</select></label>
      <div class="full nu-sec">Pack &amp; label serving</div>
      <label>Units in the pack<input name="packUnits" type="number" min="0" step="any"></label><label>Label serving size (units)<input name="servingQty" type="number" min="0.01" step="any" value="1"></label>
      <div class="full nu-sec">Label values per serving</div>
      <label>kcal<input name="kcal" type="number" min="0" step="any" value="0"></label><label>Protein g<input name="p" type="number" min="0" step="any" value="0"></label>
      <label>Carbs g<input name="c" type="number" min="0" step="any" value="0"></label><label>Fat g<input name="f" type="number" min="0" step="any" value="0"></label>
      <label>Sodium mg<input name="na" type="number" min="0" step="any" value="0"></label><label>Barcode<input name="barcode" inputmode="numeric"></label>
      <label class="full">Vitamins, minerals &amp; actives per serving (one per line)<textarea name="micros" rows="4" placeholder="Vitamin D3: 1000 IU&#10;Vitamin B12: 500 µg"></textarea></label>
      <div class="full nu-sec">How you take it</div>
      <label>Serving taken per dose (units)<input name="takeQty" type="number" min="0.01" step="any" value="1"></label><label>Doses per day<input name="dosesPerDay" type="number" min="1" step="1" value="1"></label>
      <label>When<input name="timing" placeholder="e.g. after breakfast"></label><label>Pack started on<input name="packStart" type="date"></label>
      <div class="full card" id="spCalc" style="padding:12px"></div>
      <input type="hidden" name="kidneyNote"><input type="hidden" name="src" value="manual">
      <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="active" checked style="width:auto"> Taking it now (show in daily doses)</label>
      <div class="full row" style="justify-content:space-between">${ex ? `<button type="button" class="btn danger" id="spDel">Delete</button>` : "<span></span>"}<button class="btn primary" type="submit">Save supplement</button></div>
    </form>`);
  const st = (m, bad) => setSt(bg.querySelector("#spSt"), m, bad), fm = bg.querySelector("#spForm"), F = fm.elements;
  const read = () => { const f = new FormData(fm); return { name: String(f.get("name") || "").trim(), brand: String(f.get("brand") || "").trim(), unit: f.get("unit") || "capsule", packUnits: +f.get("packUnits") || 0,
    servingQty: Math.max(.01, +f.get("servingQty") || 1), takeQty: Math.max(.01, +f.get("takeQty") || 1), perServing: { kcal: +f.get("kcal") || 0, p: +f.get("p") || 0, c: +f.get("c") || 0, f: +f.get("f") || 0, na: +f.get("na") || 0 },
    microsServing: parseMicros(f.get("micros")), dosesPerDay: Math.max(1, +f.get("dosesPerDay") || 1), timing: String(f.get("timing") || "").trim(), packStart: f.get("packStart") || N.today,
    barcode: normCode(f.get("barcode")), kidneyNote: String(f.get("kidneyNote") || ""), src: String(f.get("src") || "manual"), active: !!f.get("active") }; };
  const calc = () => { const v = read(), n = suppNorm(v), d = n.dose;
    bg.querySelector("#spCalc").innerHTML = `<div class="eyebrow">Each dose</div><div class="small">${e2(uLabel(n.takeQty, v.unit))} = ${+n.k.toFixed(3)} × label serving of ${e2(uLabel(n.servingQty, v.unit))}</div>${per5(d)}
      ${n.doseMicros.length ? `<div class="small">${n.doseMicros.map(m => `${e2(m.n)} <b>${+m.amt.toFixed(2)} ${e2(m.unit)}</b>`).join(" · ")}</div>` : ""}
      ${v.packUnits ? `<div class="small muted" style="margin-top:6px">Pack of ${e2(uLabel(v.packUnits, v.unit))} = ${+(v.packUnits / n.takeQty).toFixed(1)} doses · lasts ~${Math.floor(v.packUnits / (n.takeQty * v.dosesPerDay))} days</div>` : ""}`; };
  const fill = sp => { const n = suppNorm(sp), ps = n.perServing || {};
    const vals = { name: sp.name, brand: sp.brand, unit: UNITS.includes(n.unit) ? n.unit : "capsule", packUnits: sp.packUnits || "", servingQty: n.servingQty, takeQty: sp.takeQty || n.servingQty,
      kcal: ps.kcal ?? 0, p: ps.p ?? 0, c: ps.c ?? 0, f: ps.f ?? 0, na: ps.na ?? 0, barcode: sp.barcode, micros: microsText(n.microsServing), dosesPerDay: sp.dosesPerDay || 1, timing: sp.timing, packStart: sp.packStart || N.today, kidneyNote: sp.kidneyNote, src: sp.src || "manual" };
    for (const [k, v] of Object.entries(vals)) if (F[k]) F[k].value = v ?? ""; F.active.checked = sp.active !== false; fm.hidden = false; calc(); };
  fm.addEventListener("input", calc); fm.addEventListener("change", calc);
  const setMode = m => { bg.querySelector("#spSearch").hidden = m !== "search"; bg.querySelector("#spScan").hidden = m !== "scan"; if (m === "manual") fm.hidden = false; bg.querySelectorAll("#spModes [data-m]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m))); st(""); };
  if (ex) fill(ex0); else { F.packStart.value = N.today; calc(); setMode(mode); }
  bg.querySelector("#spModes")?.addEventListener("click", ev => { const b = ev.target.closest("[data-m]"); if (b) setMode(b.dataset.m); });
  const fromAI = (out, extra) => fill({ ...out, perServing: out.perServing || {}, microsServing: out.micros || [], takeQty: out.servingQty || 1, active: true, ...extra });
  bg.querySelector("#spFind").onclick = async () => { const v = bg.querySelector("#spQ").value.trim(); if (!v) return; st("Looking it up… (a few seconds)");
    try { const out = await askJSON(`Give the label for this dietary supplement sold in India: """${v}""". Use the brand's published Supplement Facts as you know them; pick the most common variant and pack and name it. If you don't recognise it, "found":false with a reason in "note"; otherwise say in "note" which variant you used.\n${SUPP_RULES}\nReply with ONLY JSON: ${SUPP_JSON}`);
      if (!out || out.found === false) { st(e2(out?.note || "Not found. Try the full brand and product name, or scan the label."), true); return; }
      fromAI(out, { src: "search" }); st(e2((out.note ? out.note + " " : "") + "Check against your box, set how much you take, then save.")); } catch (err) { st(errMsg(err, "Lookup failed."), true); } };
  const readL = async (file, code) => { st("Reading the label… (a few seconds)");
    try { const out = await askJSON(`This photo shows a dietary supplement's packaging${code ? ` (barcode ${code})` : ""}, ideally its Supplement Facts panel and pack size. Read it exactly. If unreadable, "found":false with why in "note".\n${SUPP_RULES}\nReply with ONLY JSON: ${SUPP_JSON}`, file);
      if (!out || out.found === false) { st(e2(out?.note || "Couldn't read that label. Try a closer, sharper photo."), true); return; }
      fromAI(out, { barcode: code || F.barcode.value, src: "label-photo" }); st(e2((out.note ? out.note + " " : "") + "Check the values, set how much you take, then save.")); } catch (err) { st(errMsg(err, "Couldn't read the label."), true); } };
  fileHandlers.spl = f => readL(f, F.barcode.value);
  fileHandlers.spb = async f => { st("Reading barcode…"); let code = null; try { code = await decodeFile(f, m => st(m)); } catch (err) { st(errMsg(err, "Couldn't read that photo."), true); return; }
    if (!code) { st("Couldn't read a barcode. Photograph the Supplement Facts panel instead.", true); return; }
    F.barcode.value = code; const mine = Object.values(N.supps).find(x => x.barcode === code);
    if (mine) { fill(mine); st("Already in your list. Update the pack or dose if needed."); return; }
    st(`Barcode ${code}. Looking it up…`); const off = await lookupOFF(code);
    if (off) { const g = off.servingG || 100; fill({ name: off.name, brand: off.brand, unit: "g", servingQty: g, takeQty: g, perServing: scaleM(off.per100, g / 100), packUnits: off.packG || 0, barcode: code, src: "openfoodfacts" }); st("Found on Open Food Facts. Vitamins aren't listed there; add them from the label."); return; }
    st("New barcode. Now photograph the Supplement Facts panel and it fills in."); fm.hidden = false; };
  bg.querySelector("#spDel")?.addEventListener("click", async () => { await deleteSupp(ex0.id); toast("Supplement deleted"); bg.close(); });
  fm.onsubmit = async ev => { ev.preventDefault(); const v = read(); if (!v.name) return; try { await saveSupp({ ...v, id: ex0?.id }); toast(`${v.name} saved`); bg.close(); } catch {} };
}

/* ---------- plan: targets, kidney-aware, recalculated from your latest weight ---------- */
function planFrom(kg, base){
  const p = base, bmr = 10 * kg + 6.25 * (p.heightCm || 176) - 5 * (p.age || 29) + (p.sex === "female" ? -161 : 5), tdee = bmr * (p.activity || 1.55);
  const kcal = Math.round((tdee - 500) / 50) * 50, deficit = tdee - kcal, protein = Math.round(kg * 1.2), cap = Math.round(kg * 1.3), fat = Math.round(kcal * .3 / 9), carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  const kgWk = deficit * 7 / 7700, weeks = p.goalKg && kg > p.goalKg ? Math.round((kg - p.goalKg) / kgWk) : null;
  return { startKg: r1(kg), bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, deficit: Math.round(deficit), protein, proteinCapG: cap, fat, carbs, kgPerWeek: r1(kgWk * 100) / 100, weeks, calculated: N.today };
}
function openPlan(){
  const P = N.plan, lw = latestWeight(), next = lw && Math.abs(lw.kg - P.startKg) >= 1 ? planFrom(lw.kg, P) : null;
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>My plan</h2>${closeBtn}</div>
    <div class="small muted">Calculated ${e2(P.calculated)} · ${e2(P.goal)}${N.planSaved ? "" : " · default (not yet saved to your account)"}</div>
    <div class="nu-kv">
      <div>BMR (Mifflin-St Jeor)</div><div>${nf(P.bmr)} kcal</div><div>TDEE (${e2(P.activityLabel || "×" + P.activity)})</div><div>${nf(P.tdee)} kcal</div>
      <div>Daily calories</div><div style="color:var(--accent)">${nf(P.kcal)} kcal</div><div>Protein (cap ${P.proteinCapG} g)</div><div>${P.protein} g</div>
      <div>Carbs</div><div>${P.carbs} g</div><div>Fat</div><div>${P.fat} g</div><div>Sodium (max)</div><div>${nf(P.sodiumMg)} mg</div><div>Water</div><div>${(+P.waterL).toFixed(1)} L</div>
      <div>Weight</div><div>${P.startKg} → ${P.goalKg} kg</div><div>Pace</div><div>~${P.kgPerWeek} kg/week${P.weeks ? ` · ~${P.weeks} weeks` : ""}</div></div>
    ${next ? `<div class="notice">Your latest weight is <b>${r1(lw.kg)} kg</b> (${e2(lw.src)}, ${e2(lw.date)}). Recalculated plan: <b>${nf(next.kcal)} kcal</b> · protein ${next.protein} g (cap ${next.proteinCapG}) · carbs ${next.carbs} g · fat ${next.fat} g.
      <div class="row" style="margin-top:8px"><button class="btn primary" id="plUse">Use the new plan</button></div></div>` : ""}
    ${P.kidney ? `<p class="small">Kidney-aware: protein is set at about 1.2 g/kg, under the 1.3 g/kg level KDIGO advises people at risk of kidney disease not to exceed, and sodium is capped at ${nf(P.sodiumMg)} mg. Confirm targets with your nephrologist.</p>` : ""}
    <p class="small muted">Method: Mifflin-St Jeor BMR × activity multiplier; ~500 kcal daily deficit; ~7,700 kcal per kg; fat ~30% of calories; carbs fill the rest. General guidance, not medical advice.</p>
    <button class="btn" id="plEditT">Adjust targets</button>
    <form class="nu-form" id="plForm" hidden>
      <label>Calories<input name="kcal" type="number" min="1000" step="any" value="${P.kcal}"></label><label>Water (L)<input name="waterL" type="number" min="1" step="any" value="${P.waterL}"></label>
      <label>Protein g<input name="protein" type="number" min="0" step="any" value="${P.protein}"></label><label>Protein cap g<input name="proteinCapG" type="number" min="0" step="any" value="${P.proteinCapG}"></label>
      <label>Carbs g<input name="carbs" type="number" min="0" step="any" value="${P.carbs}"></label><label>Fat g<input name="fat" type="number" min="0" step="any" value="${P.fat}"></label>
      <label>Sodium max mg<input name="sodiumMg" type="number" min="500" step="any" value="${P.sodiumMg}"></label><label>Goal weight kg<input name="goalKg" type="number" min="30" step="any" value="${P.goalKg}"></label>
      <div class="full row" style="justify-content:space-between"><span class="small muted" id="plChk"></span><button class="btn primary" type="submit">Save targets</button></div>
    </form>`);
  const fm = bg.querySelector("#plForm"), chk = () => { const f = new FormData(fm); bg.querySelector("#plChk").textContent = `Macros = ${nf(f.get("protein") * 4 + f.get("carbs") * 4 + f.get("fat") * 9)} kcal`; };
  bg.querySelector("#plEditT").onclick = () => { fm.hidden = !fm.hidden; chk(); }; fm.oninput = chk;
  fm.onsubmit = async ev => { ev.preventDefault(); const f = new FormData(fm), o = {}; for (const k of ["kcal", "waterL", "protein", "proteinCapG", "carbs", "fat", "sodiumMg", "goalKg"]) o[k] = +f.get(k);
    try { await savePlan(o); toast("Targets saved"); bg.close(); } catch {} };
  bg.querySelector("#plUse")?.addEventListener("click", async () => { try { await savePlan(next); toast("Plan updated from your latest weight"); bg.close(); } catch {} });
}

/* ---------- micronutrients: targets, totals (food estimates + supplement labels), card + details ---------- */
// Targets: ICMR-NIN 2020 RDAs (adult man, moderate activity) where published; otherwise NIH / National Academies DRIs (men 19–30).
// "ul" = tolerable upper intake (National Academies); "ulSupp" = that limit applies to supplements/fortified only; "cap" = a softer personal limit for one underdeveloped kidney.
const MI = [
  // vitamins
  { k: "vitA", n: "Vitamin A", u: "µg", t: 1000, ul: 3000, g: "Vitamins", re: /vitamin a\b|retinol|beta.?carotene/, iu: .3,
    why: "Vision, skin, immunity.", src: "Carrots, sweet potato, spinach, pumpkin, mango, milk, curd.", note: "The upper limit is for preformed vitamin A (supplements, liver); carotenes from vegetables are safe." },
  { k: "vitD", n: "Vitamin D", u: "µg", t: 15, ul: 100, g: "Vitamins", re: /vitamin d|cholecalciferol|ergocalciferol|\bd3\b/, iu: 1 / 40,
    why: "Calcium absorption, bones, muscles, immunity, testosterone.", src: "Sunlight (15–20 min midday), fortified milk, mushrooms in sun, egg yolk; usually needs a supplement.",
    note: "Target 15 µg = 600 IU (ICMR). With your low levels a doctor-guided supplement is normal; doses above 2,000 IU a day should be agreed with your nephrologist because of the single kidney." },
  { k: "vitE", n: "Vitamin E", u: "mg", t: 15, ul: 1000, ulSupp: 1, g: "Vitamins", re: /vitamin e\b|tocopherol/, iu: .67, why: "Antioxidant; protects cells.", src: "Almonds, sunflower seeds, peanuts, vegetable oils, spinach." },
  { k: "vitK", n: "Vitamin K", u: "µg", t: 120, g: "Vitamins", re: /vitamin k|phylloquinone|menaquinone|mk-?7/, why: "Blood clotting, bone health.", src: "Spinach, methi, broccoli, cabbage, soybeans." },
  { k: "vitC", n: "Vitamin C", u: "mg", t: 80, ul: 2000, cap: 1000, g: "Vitamins", re: /vitamin c|ascorbic/, why: "Immunity, collagen; improves iron absorption from plant foods.", src: "Amla, guava, citrus, capsicum, tomato, sprouts.",
    note: "Kidney: keep supplements under 500 mg a day; high doses raise oxalate and kidney-stone risk." },
  { k: "b1", n: "Thiamine (B1)", u: "mg", t: 1.8, g: "Vitamins", re: /thiamin|vitamin b1\b|\bb1\b/, why: "Turns carbs into energy; nerves.", src: "Whole grains, dal, peanuts, sunflower seeds." },
  { k: "b2", n: "Riboflavin (B2)", u: "mg", t: 2.5, g: "Vitamins", re: /riboflavin|vitamin b2\b|\bb2\b/, why: "Energy metabolism; eyes and skin.", src: "Milk, curd, paneer, eggs, almonds, mushrooms." },
  { k: "b3", n: "Niacin (B3)", u: "mg", t: 18, ul: 35, ulSupp: 1, g: "Vitamins", re: /niacin|nicotin|vitamin b3\b|\bb3\b/, why: "Energy metabolism; skin and nerves.", src: "Peanuts, whole grains, mushrooms, green peas.", note: "The limit is for supplements; food niacin is safe." },
  { k: "b5", n: "Pantothenic acid (B5)", u: "mg", t: 5, g: "Vitamins", re: /pantothen|vitamin b5\b|\bb5\b/, why: "Energy and hormone production.", src: "Mushrooms, avocado, milk, sweet potato, whole grains." },
  { k: "b6", n: "Vitamin B6", u: "mg", t: 2.4, ul: 100, g: "Vitamins", re: /pyridox|vitamin b6\b|\bb6\b/, why: "Protein metabolism, mood, red blood cells; lowers homocysteine.", src: "Chickpeas, banana, potato, peanuts, soy." },
  { k: "b7", n: "Biotin (B7)", u: "µg", t: 30, g: "Vitamins", re: /biotin|vitamin b7|vitamin h\b/, why: "Fat and carb metabolism; hair and nails.", src: "Eggs, peanuts, almonds, sweet potato." },
  { k: "b9", n: "Folate (B9)", u: "µg", t: 400, ul: 1000, ulSupp: 1, g: "Vitamins", re: /folate|folic|vitamin b9|methylfolate/, folic: 1.7,
    why: "DNA and red blood cells; with B12 it clears homocysteine.", src: "Dal, rajma, chana, spinach, methi, broccoli, oranges.",
    note: "ICMR sets 300 µg; 400 µg is used here because your homocysteine was high. The limit applies to folic acid from supplements." },
  { k: "b12", n: "Vitamin B12", u: "µg", t: 2.4, g: "Vitamins", re: /b12|cobalamin/, why: "Nerves, red blood cells, energy; with folate it clears homocysteine.", src: "Milk, curd, paneer, eggs, fortified foods. Plant foods have almost none, so vegetarians often need a supplement.",
    note: "Daily need is small, but with low blood B12 your doctor may prescribe much more for a while. Very high doses are considered safe." },
  { k: "choline", n: "Choline", u: "mg", t: 550, ul: 3500, g: "Vitamins", re: /choline/, why: "Liver fat processing, brain and muscle.", src: "Eggs, soybeans, paneer, peanuts, broccoli." },
  // minerals
  { k: "ca", n: "Calcium", u: "mg", t: 1000, ul: 2500, cap: 2000, g: "Minerals", re: /calcium/, why: "Bones, muscles, nerves.", src: "Milk, curd, paneer, ragi, sesame, tofu, green leafy vegetables.",
    note: "Kidney: get most of it from food; high-dose calcium supplements can raise kidney-stone risk." },
  { k: "p", n: "Phosphorus", u: "mg", t: 1000, ul: 4000, cap: 1400, g: "Minerals", re: /phosph/, why: "Bones, energy (ATP).", src: "Dal, dairy, nuts, whole grains.",
    note: "Kidney: no need to restrict with normal kidney function, but avoid phosphate additives (colas, processed cheese, packaged meats) and phosphorus supplements." },
  { k: "mg", n: "Magnesium", u: "mg", t: 440, ul: 350, ulSupp: 1, g: "Minerals", re: /magnes/, why: "Muscle and nerve function, sleep, blood sugar.", src: "Pumpkin seeds, almonds, cashews, dark leafy greens, whole grains, dal.",
    note: "The 350 mg limit is for supplements only. Kidney: check magnesium supplements with your doctor (the kidneys clear excess magnesium)." },
  { k: "k", n: "Potassium", u: "mg", t: 3400, g: "Minerals", re: /potassium/, why: "Blood pressure, heart rhythm, muscles.", src: "Banana, coconut water, potatoes, dal, curd, tomatoes, spinach.",
    note: "Kidney: food potassium is helpful while kidney function is normal. Avoid potassium supplements and salt substitutes (KCl) unless your doctor agrees." },
  { k: "fe", n: "Iron", u: "mg", t: 19, ul: 45, g: "Minerals", re: /\biron\b|ferrous|ferric/, why: "Carries oxygen in blood; energy.", src: "Dal, rajma, chana, spinach, jaggery, dates, fortified cereals. Pair with vitamin C; avoid tea with meals." },
  { k: "zn", n: "Zinc", u: "mg", t: 17, ul: 40, g: "Minerals", re: /zinc/, why: "Immunity, wound healing, testosterone.", src: "Pumpkin seeds, chickpeas, cashews, paneer, whole grains." },
  { k: "cu", n: "Copper", u: "mg", t: .9, ul: 10, g: "Minerals", re: /copper/, why: "Iron use, nerves, connective tissue.", src: "Cashews, sesame, chickpeas, whole grains." },
  { k: "mn", n: "Manganese", u: "mg", t: 2.3, ul: 11, g: "Minerals", re: /manganese/, why: "Bone formation, metabolism.", src: "Whole grains, nuts, tea, leafy greens." },
  { k: "se", n: "Selenium", u: "µg", t: 55, ul: 400, g: "Minerals", re: /selenium/, why: "Thyroid, antioxidant, sperm health.", src: "Brazil nuts (1–2 is plenty), sunflower seeds, whole grains, eggs, mushrooms." },
  { k: "i", n: "Iodine", u: "µg", t: 150, ul: 1100, g: "Minerals", re: /iodine|iodide/, why: "Thyroid hormones.", src: "Iodised salt, milk, curd." },
  { k: "cl", n: "Chloride", u: "mg", t: 2300, ul: 3600, g: "Minerals", re: /chlorid/, why: "Fluid balance and stomach acid; comes mostly with salt (sodium chloride).", src: "Table salt, pickles, papad, packaged snacks; tracks closely with your sodium.", note: "If chloride is high, your salt intake is high: the sodium limit is the one to watch." },
  { k: "cr", n: "Chromium", u: "µg", t: 35, g: "Minerals", re: /chromium/, why: "Insulin action.", src: "Broccoli, whole grains, potatoes." },
  { k: "mo", n: "Molybdenum", u: "µg", t: 45, ul: 2000, g: "Minerals", re: /molybden/, why: "Enzyme function (including uric acid breakdown).", src: "Dal, beans, whole grains, nuts." },
  // other
  { k: "fibre", n: "Fibre", u: "g", t: 30, g: "Other", re: /fib(re|er)/, why: "Gut health, cholesterol, blood sugar, fullness.", src: "Dal, rajma, chana, whole grains, oats, fruit, vegetables, seeds." },
  { k: "omega3", n: "Omega-3 (ALA/EPA/DHA)", u: "mg", t: 1600, g: "Other", re: /omega.?3|\bepa\b|\bdha\b|fish oil|\bala\b|linolenic/, why: "Heart, triglycerides, brain.", src: "Flaxseed, chia, walnuts, mustard/soybean oil; algae oil for EPA/DHA.", note: "Target 1.6 g ALA (plant omega-3) for men; EPA/DHA from supplements counts too." },
  { k: "satfat", n: "Saturated fat", u: "g", lim: 18, g: "Limits", re: /saturated/, why: "Raises LDL cholesterol.", src: "Ghee, butter, cream, cheese, coconut oil, fried and bakery foods.", note: "Kept under ~7% of calories because of your LDL." },
  { k: "sugar", n: "Added sugar", u: "g", lim: 25, g: "Limits", re: /added sugar|^sugars?$/, why: "Raises triglycerides, liver fat and uric acid.", src: "Sweets, sugar in tea/coffee, juices, soft drinks, biscuits.", note: "Fructose (sugary drinks, juice) also raises uric acid." },
  { k: "chol", n: "Cholesterol", u: "mg", lim: 300, g: "Limits", re: /cholesterol/, why: "Dietary cholesterol matters less than saturated fat, but keep moderate.", src: "Egg yolk, ghee, butter, cheese." },
  { k: "caffeine", n: "Caffeine", u: "mg", lim: 400, g: "Limits", re: /caffeine/, why: "Up to 400 mg/day is fine for most adults; late caffeine hurts sleep.", src: "Coffee (~80–100 mg/cup), tea (~40 mg), energy drinks, pre-workouts." }
];
const MIK = Object.fromEntries(MI.map(x => [x.k, x]));
const MASS = { g: 1e6, mg: 1e3, "µg": 1, ug: 1, mcg: 1 };
function microKey(name){ const s = String(name || "").toLowerCase(); for (const m of MI) if (m.re.test(s)) return m; return null; }
// amount in the catalogue unit, or null if the unit can't be converted
function microAmt(m, name, amt, unit){
  const u = String(unit || "").toLowerCase().replace("μ", "µ").replace(/\s+/g, ""); let v = +amt; if (!isFinite(v)) return null;
  if (u === "iu") return m.iu ? toUnit(v * m.iu, m.k === "vitA" || m.k === "vitD" ? "µg" : "mg", m.u) : null;
  const base = u.replace(/dfe|rae$/, "");
  if (!(base in MASS)) return null;
  let out = toUnit(v, base, m.u);
  if (m.folic && /folic/i.test(name) && !/dfe/.test(u)) out *= m.folic;
  return out;
}
function toUnit(v, from, to){ const f = MASS[from === "ug" || from === "mcg" ? "µg" : from], t = MASS[to]; return f && t ? v * f / t : null; }
const fmtMi = (v, u) => v >= 100 ? nf(v) : v >= 10 ? r1(v) : (Math.round(v * 100) / 100);

function microTotals(days){
  const tot = {}, foodOnly = {}, supp = {}, by = {}; let items = 0, est = 0;
  for (const d of days) for (const e of dayItems(d)) {
    const isSupp = e.meal === "supplements"; if (!isSupp) { items++; if ((e.micros || []).length) est++; }
    for (const x of e.micros || []) {
      const m = MIK[x.n] || microKey(x.n); if (!m) continue;
      const v = microAmt(m, x.n, x.amt, x.unit ?? m.u); if (v == null || v <= 0) continue;
      tot[m.k] = (tot[m.k] || 0) + v; (isSupp ? supp : foodOnly)[m.k] = ((isSupp ? supp : foodOnly)[m.k] || 0) + v;
      ((by[m.k] ||= {})[e.name] = (by[m.k][e.name] || 0) + v);
    }
  }
  const n = Math.max(1, days.length); for (const o of [tot, foodOnly, supp]) for (const k in o) o[k] /= n;
  for (const k in by) for (const nm in by[k]) by[k][nm] /= n;
  return { tot, foodOnly, supp, by, items, est };
}
function microStatus(m, r){
  const v = r.tot[m.k] || 0;
  if (m.lim != null) { const f = v / m.lim; return f > 1 ? ["out", "Over limit", f] : f > .8 ? ["border", "Near limit", f] : ["ok", "Under limit", f]; }
  const scoped = m.ulSupp ? (r.supp[m.k] || 0) : v;
  if (m.ul && scoped > m.ul) return ["out", m.ulSupp ? "Supplements above safe limit" : "Above safe limit", v / m.t];
  if (m.cap && v > m.cap) return ["border", "Above your kidney-aware limit", v / m.t];
  const f = v / m.t; return f >= .9 ? ["ok", "Met", f] : f >= .5 ? ["border", "Getting there", f] : ["low", "Low", f];
}
function labNote(m){
  try {
    if (typeof D === "undefined" || !D?.latest) return "";
    const L = k => { const e = D.latest[k]; const v = e && typeof numVal === "function" ? numVal(e.p.value) : null; return v == null ? null : { v, date: e.date, unit: e.p.unit || "" }; };
    const s = (k, txt) => { const x = L(k); return x ? txt(x) : ""; };
    if (m.k === "vitD") return s("vitd", x => `Your last vitamin D test: ${x.v} ${x.unit} (${fmtDay(x.date).split(", ")[1] || x.date}). Below 20 ng/mL is deficient, 20–30 insufficient.`);
    if (m.k === "b12") return s("b12", x => `Your last B12 test: ${x.v} ${x.unit}. Below 200 pg/mL is low; follow your doctor's dose.`);
    if (m.k === "b9" || m.k === "b6") return s("homocys", x => `Your homocysteine: ${x.v} ${x.unit} (healthy below 15). B12, folate and B6 help bring it down.`);
    if (m.k === "fe") return s("ferritin", x => `Your last ferritin: ${x.v} ${x.unit} (iron stores; below 30 is low).`);
    if (m.k === "k" || m.k === "p" || m.k === "mg") return s("egfr", x => `Your eGFR: ${x.v} (normal kidney filtering), so food sources are fine.`);
  } catch {}
  return "";
}

N.miView = N.miView || "day";
function renderMicros(){
  const box = q("#nuMicro"); if (!box) return;
  const days = N.miView === "week" ? Array.from({ length: 7 }, (_, i) => addDays(N.day, -i)).filter(d => dayItems(d).length) : [N.day];
  const r = microTotals(days.length ? days : [N.day]);
  qa("[data-miv]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.miv === N.miView)));
  const missing = dayItems(N.day).filter(e => e.meal !== "supplements" && !(e.micros || []).length);
  q("#nuMiHint").innerHTML = N.miView === "week" ? `Average of ${days.length} logged day${days.length === 1 ? "" : "s"}` : r.items ? `${r.est} of ${r.items} food items estimated · supplements from labels` : "";
  const groups = ["Vitamins", "Minerals", "Other", "Limits"];
  const row = m => { const [st, lbl, f] = microStatus(m, r), v = r.tot[m.k] || 0, goal = m.lim ?? m.t;
    const col = st === "out" ? "var(--bad)" : st === "border" ? "var(--warn)" : st === "low" ? "var(--warn)" : "var(--ok)";
    const sp = r.supp[m.k] ? ` · ${fmtMi(r.supp[m.k])} from supplements` : "";
    return `<button class="nu-mi" data-mi="${m.k}"><span class="n">${e2(m.n)}${m.cap || /Kidney/.test(m.note || "") ? ' <span class="nu-kid" title="Kidney note">K</span>' : ""}</span>
      <span class="v num">${fmtMi(v)} <small>/ ${m.lim != null ? "≤" : ""}${fmtMi(goal)} ${m.u}</small></span>
      <span class="bar"><i style="width:${Math.min(100, f * 100)}%;background:${col}"></i></span>
      <span class="s">${st === "low" ? `<span style="color:var(--warn)">${lbl}</span>` : st === "ok" ? `<span style="color:var(--ok)">${lbl}</span>` : chipH(st, lbl)}${sp}</span></button>`; };
  box.innerHTML = (missing.length && N.miView === "day" ? `<div class="notice" style="margin-bottom:10px" id="nuMiMiss">${micState.busy ? "Estimating micronutrients for your food…" : `${missing.length} food item${missing.length > 1 ? "s" : ""} not estimated yet. <button class="btn" id="nuMiEst" style="margin-left:6px">Estimate now</button>`}${micState.err ? `<div class="small" style="color:var(--bad);margin-top:4px">${micState.err}</div>` : ""}</div>` : "")
    + groups.map(g => `<div class="nu-sec">${g === "Limits" ? "Keep under" : g}</div><div class="nu-mis">${MI.filter(m => m.g === g).map(row).join("")}</div>`).join("")
    + `<div class="row" style="justify-content:space-between;margin-top:10px"><span class="small muted">Food values are estimates from Indian (IFCT) and USDA food tables. K = kidney note. Tap a nutrient for details.</span><button class="btn" id="nuMiBack">Estimate past days</button></div>`;
  const b = q("#nuMiEst"); if (b) b.onclick = () => estimateMicros(missing, true);
  q("#nuMiBack").onclick = () => { const all = N.entries.filter(e => e.meal !== "supplements" && !(e.micros || []).length); if (!all.length) { toast("Every logged food already has micronutrients."); return; } estimateMicros(all, true); };
  // estimate today's items automatically once per day view
  if (missing.length && N.miView === "day" && !micState.busy && !micState.tried.has(N.day) && N.loaded && typeof S !== "undefined" && S.settings?.anthropic_key) { micState.tried.add(N.day); estimateMicros(missing, false); }
}
const micState = { busy: false, tried: new Set(), err: "" };
async function estimateMicros(list, manual){
  if (micState.busy || !list.length) return; micState.busy = true; micState.err = ""; renderMicros();
  const keys = MI.map(m => `${m.k} (${m.u})`).join(", ");
  let done = 0;
  try {
    for (let i = 0; i < list.length; i += 12) {
      const chunk = list.slice(i, i + 12);
      const items = chunk.map((e, j) => `i${j}: ${e.name}${e.serving ? ` — ${e.serving}` : ""} (${r0(e.kcal)} kcal, P ${r1(e.p)} g, C ${r1(e.c)} g, F ${r1(e.f)} g)`).join("\n");
      const out = await askJSON(`Estimate the micronutrients in each food item exactly as eaten (the stated portion, cooked, Indian home recipe unless clear otherwise). Use IFCT 2017 (Indian Food Composition Tables) for Indian foods and USDA FoodData Central otherwise; allow for typical cooking losses and the oil/ghee implied by the fat grams.
Items:
${items}
Return amounts for these keys in these units: ${keys}. vitA as µg RAE, b9 as µg DFE, omega3 = total ALA+EPA+DHA in mg, sugar = added sugar only. Use 0 when negligible. One best number each, no ranges.
Reply with ONLY JSON: {"items":{"i0":{"vitA":0,"vitD":0}}}`, null, 900 * chunk.length + 400);
      const res = out?.items || {};
      for (let j = 0; j < chunk.length; j++) {
        const o = res["i" + j]; if (!o || typeof o !== "object") continue;
        const micros = MI.map(m => ({ n: m.k, amt: Math.max(0, +o[m.k] || 0), unit: m.u, est: 1 })).filter(x => x.amt > 0);
        if (!micros.length) continue;
        const e = chunk[j]; const { error } = await sb().from("food_entries").update({ micros }).eq("id", e.id);
        if (error) throw error;
        const loc = N.entries.find(x => x.id === e.id); if (loc) loc.micros = micros; done++;
      }
      renderMicros();
    }
    if (manual) toast(`Micronutrients estimated for ${done} item${done === 1 ? "" : "s"}`);
  } catch (err) { micState.err = errMsg(err, "Couldn't estimate micronutrients."); }
  finally { micState.busy = false; renderMicros(); }
}
function openMicro(k){
  const m = MIK[k]; if (!m) return;
  const days = N.miView === "week" ? Array.from({ length: 7 }, (_, i) => addDays(N.day, -i)).filter(d => dayItems(d).length) : [N.day];
  const r = microTotals(days.length ? days : [N.day]); const [st, lbl] = microStatus(m, r), v = r.tot[m.k] || 0;
  const contrib = Object.entries(r.by[m.k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const ln = labNote(m);
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>${e2(m.n)}</h2>${closeBtn}</div>
    <div class="row" style="gap:8px;margin:4px 0 10px"><b class="mono" style="font-size:1.3rem">${fmtMi(v)} ${m.u}</b>${chipH(st === "low" ? "border" : st, lbl)}<span class="small muted">${N.miView === "week" ? "7-day average" : fmtDay(N.day)}</span></div>
    <div class="nu-kv">
      ${m.lim != null ? `<div>Keep under</div><div>${fmtMi(m.lim)} ${m.u} / day</div>` : `<div>Your daily target</div><div>${fmtMi(m.t)} ${m.u}</div>`}
      ${m.ul ? `<div>Safe upper limit${m.ulSupp ? " (supplements)" : ""}</div><div>${fmtMi(m.ul)} ${m.u}</div>` : ""}
      ${m.cap ? `<div>Your kidney-aware limit</div><div>${fmtMi(m.cap)} ${m.u}</div>` : ""}
      ${r.foodOnly[m.k] ? `<div>From food</div><div>${fmtMi(r.foodOnly[m.k])} ${m.u}</div>` : ""}
      ${r.supp[m.k] ? `<div>From supplements</div><div>${fmtMi(r.supp[m.k])} ${m.u}</div>` : ""}
    </div>
    <p style="margin:10px 0 4px"><b>What it does:</b> ${e2(m.why)}</p>
    <p style="margin:4px 0"><b>Good vegetarian sources:</b> ${e2(m.src)}</p>
    ${m.note ? `<p style="margin:4px 0">${e2(m.note)}</p>` : ""}
    ${ln ? `<div class="notice" style="margin-top:8px">${e2(ln)}</div>` : ""}
    ${contrib.length ? `<div class="nu-sec">Where it came from</div><div class="nu-kv">${contrib.map(([nm, x]) => `<div>${e2(nm)}</div><div>${fmtMi(x)} ${m.u}</div>`).join("")}</div>` : ""}
    <p class="small muted" style="margin-top:10px">Targets: ICMR-NIN 2020 RDA for Indian men where available, otherwise US National Academies DRIs; upper limits from the National Academies. General guidance, not medical advice; follow your doctor's prescription for supplements.</p>`);
  return bg;
}

q("#nuMicro").addEventListener("click", ev => { const b = ev.target.closest("[data-mi]"); if (b) openMicro(b.dataset.mi); });
qa("[data-miv]").forEach(b => b.onclick = () => { N.miView = b.dataset.miv; renderMicros(); });

NU.render();
})();
