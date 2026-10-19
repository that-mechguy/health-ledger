/* Health Ledger · profiles, conditions, medicines and the admin's People list (friends sign up themselves).
   Loaded before nutrition.js. Uses the Ledger's globals: S, SB, D, $, esc, go.
   Tables: user_profile, medications, med_log, people_list, ai_usage (see supabase/14-people-profiles-meds.sql). */
(function(){
"use strict";

/* ---------- helpers ---------- */
const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ld = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addD = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return ld(d); };
const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowHM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const hm = t => { const [a, b] = String(t).split(":").map(Number); return (a || 0) * 60 + (b || 0); };
const t12 = t => { const m = hm(t), H = Math.floor(m / 60), M = m % 60; return `${(H % 12) || 12}:${String(M).padStart(2, "0")} ${H < 12 ? "AM" : "PM"}`; };
const sb = () => SB;
function toast(msg){ document.querySelectorAll(".fa-toast").forEach(x => x.remove()); const t = document.createElement("div"); t.className = "fa-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
function sheet(html, wide){
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" style="width:min(${wide ? 720 : 600}px,100%)">${html}</div>`;
  bg.addEventListener("click", ev => { if (ev.target === bg) close(); });
  const close = () => { bg.remove(); };
  bg.close = close; document.body.appendChild(bg);
  bg.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  return bg;
}
const closeBtn = `<button class="btn" data-close aria-label="Close" style="padding:6px 10px">✕</button>`;

/* ---------- styles ---------- */
const css = document.createElement("style");
css.textContent = `
.fa-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink,#111);color:var(--bg,#fff);padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.2)}
.fa-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.fa-form label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;color:var(--muted);font-weight:600}
.fa-form .full{grid-column:1/-1}
.fa-form input,.fa-form select,.fa-form textarea{font:inherit;font-size:.95rem;color:var(--ink);background:var(--fill,#f2f2f7);border:1px solid transparent;border-radius:10px;padding:9px 11px;min-width:0}
.fa-form input:focus,.fa-form select:focus,.fa-form textarea:focus{outline:none;border-color:var(--accent)}
.fa-sec{grid-column:1/-1;margin:10px 0 0;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.fa-chips{display:flex;flex-wrap:wrap;gap:8px}
.fa-chips label{flex-direction:row;align-items:center;gap:6px;background:var(--fill,#f2f2f7);border-radius:99px;padding:7px 12px;color:var(--ink);font-weight:500;font-size:.85rem;cursor:pointer}
.fa-chips input{margin:0;accent-color:var(--accent)}
.fa-chips label:has(input:checked){background:var(--accent);color:#fff}
.fa-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:.92rem}.fa-kv>div:nth-child(odd){color:var(--muted)}
.fa-tag{display:inline-block;font-size:.75rem;font-weight:600;border-radius:99px;padding:3px 9px;margin:2px 4px 2px 0;background:var(--fill,#f2f2f7);color:var(--ink-2)}
.fa-tag.lab{background:rgba(10,132,255,.13);color:#0a6cff}
.fa-slot{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.fa-slot:first-child{border-top:0}
.fa-slot .t{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:.92rem}
.fa-slot .n{font-weight:600}.fa-slot .d{font-size:.8rem;color:var(--muted)}
.fa-slot.done{opacity:.6}
.fa-st{font-size:.75rem;font-weight:700;border-radius:99px;padding:3px 9px;white-space:nowrap}
.fa-st.taken{background:var(--ok-bg,#e7f6ec);color:var(--ok,#1a7f37)}.fa-st.skipped{background:var(--fill);color:var(--muted)}
.fa-st.missed,.fa-st.overdue{background:var(--bad-bg,#fde8e8);color:var(--bad,#d70015)}.fa-st.due{background:var(--warn-bg,#fff4e0);color:var(--warn,#b25000)}
.fa-acts{display:flex;gap:6px;align-items:center}
.fa-med{padding:12px 0;border-top:1px solid var(--line)}.fa-med:first-child{border-top:0}
.fa-med .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.fa-dots{display:flex;gap:4px;margin-top:6px}.fa-dots i{width:14px;height:14px;border-radius:4px;background:var(--fill)}
.fa-dots i.ok{background:var(--ok,#34c759)}.fa-dots i.part{background:#ffcc00}.fa-dots i.miss{background:var(--bad,#ff3b30)}.fa-dots i.none{background:transparent;border:1px dashed var(--line)}
.fa-big{font-family:var(--f-display,inherit);font-size:2rem;font-weight:700;line-height:1}
.fa-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.fa-people td,.fa-people th{padding:8px 6px;text-align:left;font-size:.88rem;border-top:1px solid var(--line)}
@media (max-width:560px){.fa-people th:nth-child(3),.fa-people td:nth-child(3){display:none}.fa-form{grid-template-columns:1fr}.fa-slot{grid-template-columns:70px 1fr}.fa-slot .fa-acts{grid-column:1/-1;justify-content:flex-end}}
`;
document.head.appendChild(css);

/* ---------- conditions ---------- */
const CONDITIONS = [
  { k: "t2d", n: "Type 2 diabetes", g: "Metabolic" }, { k: "t1d", n: "Type 1 diabetes", g: "Metabolic" }, { k: "prediabetes", n: "Prediabetes / insulin resistance", g: "Metabolic" },
  { k: "chol", n: "High cholesterol", g: "Heart" }, { k: "htn", n: "High blood pressure (hypertension)", g: "Heart" }, { k: "heart", n: "Heart disease", g: "Heart" },
  { k: "single_kidney", n: "One kidney / underdeveloped kidney", g: "Kidney" }, { k: "ckd", n: "Chronic kidney disease", g: "Kidney" }, { k: "stones", n: "Kidney stones", g: "Kidney" },
  { k: "gout", n: "Gout / high uric acid", g: "Other" }, { k: "nafld", n: "Fatty liver", g: "Other" }, { k: "hypo", n: "Hypothyroidism", g: "Other" }, { k: "hyper", n: "Hyperthyroidism", g: "Other" },
  { k: "pcos", n: "PCOS", g: "Women" }, { k: "pregnant", n: "Pregnant", g: "Women" }, { k: "breastfeeding", n: "Breastfeeding", g: "Women" },
  { k: "anaemia", n: "Anaemia", g: "Other" }, { k: "ibs", n: "IBS / gut issues", g: "Other" }
];
const CN = Object.fromEntries(CONDITIONS.map(c => [c.k, c.n]));
const ACTIVITY = [[1.2, "Mostly sitting (desk job, little exercise)"], [1.375, "Light (walks, exercise 1–3×/week)"], [1.55, "Moderate (exercise 3–5×/week)"], [1.725, "Very active (hard exercise 6–7×/week)"], [1.9, "Athlete / physical job"]];
const DIETS = [["veg", "Vegetarian"], ["egg", "Eggetarian"], ["nonveg", "Non-vegetarian"], ["vegan", "Vegan"], ["jain", "Jain"]];
const GOALS = [["lose", "Lose fat"], ["maintain", "Maintain weight"], ["gain", "Gain muscle / weight"]];

/* ---------- state ---------- */
const F = { profile: null, profileLoaded: false, meds: [], log: [], admin: false, people: null, usage: null, cap: null, onboardShown: false };

/* ---------- lab flags (from the person's own reports) ---------- */
function latestLab(k){ try { const e = D?.latest?.[k]; if (!e) return null; const v = typeof numVal === "function" ? numVal(e.p.value) : parseFloat(e.p.value); return v == null || isNaN(v) ? null : { v, p: e.p, date: e.date }; } catch { return null; } }
function labFlags(){
  const f = new Map(), hi = k => { const x = latestLab(k); return x && x.p.high != null && x.v > x.p.high ? x : null; }, lo = k => { const x = latestLab(k); return x && x.p.low != null && x.v < x.p.low ? x : null; };
  if (hi("ldl")) f.set("chol", "LDL " + hi("ldl").v);
  const a1 = latestLab("hba1c"); if (a1 && a1.v >= 6.5) f.set("t2d", "HbA1c " + a1.v); else if (a1 && a1.v >= 5.7) f.set("prediabetes", "HbA1c " + a1.v);
  if (hi("uric")) f.set("gout", "uric acid " + hi("uric").v);
  if (hi("tg")) f.set("tg", "triglycerides " + hi("tg").v);
  if (hi("homocys")) f.set("hcy", "homocysteine " + hi("homocys").v);
  if (lo("vitd")) f.set("lowD", "vitamin D " + lo("vitd").v);
  if (lo("b12")) f.set("lowB12", "B12 " + lo("b12").v);
  if (lo("hb")) f.set("anaemia", "haemoglobin " + lo("hb").v);
  const eg = latestLab("egfr"); if (eg && eg.v < 60) f.set("ckd", "eGFR " + eg.v);
  if (hi("alt") || hi("ggt")) f.set("liver", "liver enzymes raised");
  return f;
}
const LABN = { chol: "High LDL", t2d: "Diabetes range HbA1c", prediabetes: "Prediabetes range HbA1c", gout: "High uric acid", tg: "High triglycerides", hcy: "High homocysteine", lowD: "Low vitamin D", lowB12: "Low B12", anaemia: "Low haemoglobin", ckd: "Low eGFR", liver: "Liver enzymes raised" };

/* ---------- public profile API (used by nutrition.js, index.html prompts) ---------- */
function age(){ const p = F.profile; if (p?.dob) { const b = new Date(p.dob + "T00:00:00"), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; } return p?.age ? +p.age : null; }
function flags(){ const s = new Set(F.profile?.conditions || []); for (const k of labFlags().keys()) s.add(k); return s; }
function activeMeds(){ const d = ld(); return F.meds.filter(m => m.active !== false && (!m.end || m.end >= d)); }
function medLine(m){ return `${m.name}${m.strength ? " " + m.strength : ""}${m.freq === "asneeded" ? " as needed" : ` ${(m.times || []).length}×/day`}${m.condition ? ` (for ${m.condition})` : ""}`; }
function who(){ if (!F.profile) return ""; const p = F.profile, a = age(); const sx = p.sex === "female" ? "woman" : p.sex === "male" ? "man" : "adult"; return `${a ? a + "-year-old " : ""}${p.diet ? (DIETS.find(d => d[0] === p.diet)?.[1] || "").toLowerCase() + " " : ""}${sx}`.trim(); }
function personLine(){
  const p = F.profile; if (!p) return "";
  const conds = (p.conditions || []).map(k => CN[k]).filter(Boolean);
  if (p.otherConditions) conds.push(p.otherConditions);
  const labs = [...labFlags().values()];
  const meds = activeMeds().map(medLine);
  return [`Person: ${who()}${p.heightCm ? `, ${p.heightCm} cm` : ""}${p.weightKg ? `, ${p.weightKg} kg` : ""}${p.activity ? `, ${(ACTIVITY.find(x => x[0] === +p.activity)?.[1] || "").split(" (")[0].toLowerCase()} activity` : ""}; goal: ${(GOALS.find(g => g[0] === p.goal)?.[1] || "not set").toLowerCase()}.`,
    conds.length ? `Conditions: ${conds.join(", ")}.` : "No known conditions.",
    labs.length ? `From recent lab reports: ${labs.join(", ")}.` : "",
    meds.length ? `Medicines: ${meds.join("; ")}.` : "",
    p.allergies ? `Allergies/intolerances: ${p.allergies}.` : "",
    p.notes ? `Notes: ${p.notes}.` : ""].filter(Boolean).join(" ");
}
window.HLP = { profile: () => F.profile, age, flags, labFlags, who, personLine, meds: activeMeds, CONDITIONS, ACTIVITY, isAdmin: () => F.admin, load, reset, openProfile, renderSettingsCards, renderMeds };

/* ---------- load ---------- */
async function load(){
  if (!S?.uid) return;
  const from = addD(ld(), -60);
  const [pr, md, lg, ad] = await Promise.all([
    sb().from("user_profile").select("doc").maybeSingle(),
    sb().from("medications").select("id,doc,active"),
    sb().from("med_log").select("id,med_id,day,slot,status,qty,at").gte("day", from),
    sb().from("app_admins").select("user_id").maybeSingle()
  ]);
  F.missing = [pr, md, lg].some(r => r.error && /relation|schema cache|does not exist/i.test(r.error.message || ""));
  F.profile = pr.data?.doc && Object.keys(pr.data.doc).length ? pr.data.doc : null; F.profileLoaded = !pr.error;
  F.meds = (md.data || []).map(x => ({ ...x.doc, id: x.id, active: x.active }));
  F.log = lg.data || [];
  F.admin = !!ad.data; F.uid = S.uid;
}
function reset(){ F.profile = null; F.profileLoaded = false; F.meds = []; F.log = []; F.admin = false; F.uid = null; F.onboardShown = false; }
async function afterLoad(){
  if (F.uid !== S?.uid) { await load().catch(() => {}); renderSettingsCards(); window.NUT?.render?.(); }
  if (F.missing || !F.profileLoaded || F.profile || F.onboardShown) return;
  try { if (sessionStorage.getItem("hl-onboard-later")) return; } catch {}
  F.onboardShown = true;
  for (let i = 0; i < 40 && !window.NUT?.isLoaded?.(); i++) await new Promise(r => setTimeout(r, 150));   // so the form can be prefilled from an existing plan
  if (!F.profile) openProfile(true);
}
window.addEventListener("hl:loaded", afterLoad);
setTimeout(() => { if (typeof S !== "undefined" && S.uid && S.loadedR) afterLoad(); }, 0);   // data may have loaded before this script

/* ---------- profile sheet (first sign-in and Settings → Edit) ---------- */
function openProfile(first){
  const plan = window.NUT?.plan?.() || {};
  const p = F.profile || { name: S.meta?.name || "", sex: plan.sex, heightCm: plan.heightCm, weightKg: plan.startKg, goalKg: plan.goalKg, activity: plan.activity, goal: "lose", age: plan.age, conditions: plan.kidney ? ["single_kidney"] : [] };
  const lf = labFlags();
  const condBox = g => CONDITIONS.filter(c => c.g === g).map(c => `<label><input type="checkbox" name="cond" value="${c.k}" ${(p.conditions || []).includes(c.k) ? "checked" : ""}>${h(c.n)}</label>`).join("");
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>${first ? "Welcome! Set up your profile" : "Profile &amp; health"}</h2>${closeBtn}</div>
    <p class="small muted" style="margin:4px 0 10px">${first ? "Takes a minute. Your calorie, macro and vitamin/mineral targets are worked out from this, and AI estimates take your conditions into account. Only you can see it." : "Changing this recalculates your targets. Only you can see it."}</p>
    <form class="fa-form" id="faP">
      <div class="fa-sec">About you</div>
      <label>Name<input name="name" value="${h(p.name || "")}" autocomplete="name" placeholder="What should we call you?"></label>
      <label>Sex (for targets)<select name="sex" required><option value="">Choose…</option><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option></select></label>
      <label>Date of birth<input name="dob" type="date" max="${ld()}" value="${h(p.dob || "")}"></label>
      <label>…or age<input name="age" type="number" min="12" max="110" inputmode="numeric" value="${h(p.dob ? "" : p.age || "")}"></label>
      <div class="fa-sec">Body &amp; goal</div>
      <label>Height (cm)<input name="heightCm" type="number" min="100" max="230" step="any" inputmode="decimal" required value="${h(p.heightCm || "")}"></label>
      <label>Weight (kg)<input name="weightKg" type="number" min="25" max="300" step="any" inputmode="decimal" required value="${h(p.weightKg || "")}"></label>
      <label>Goal<select name="goal">${GOALS.map(([k, n]) => `<option value="${k}" ${p.goal === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Goal weight (kg, optional)<input name="goalKg" type="number" min="25" max="300" step="any" inputmode="decimal" value="${h(p.goalKg || "")}"></label>
      <label class="full">Activity<select name="activity">${ACTIVITY.map(([k, n]) => `<option value="${k}" ${+p.activity === k || (!p.activity && k === 1.375) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="full">Diet<select name="diet">${DIETS.map(([k, n]) => `<option value="${k}" ${p.diet === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="fa-sec">Health conditions</div>
      ${["Metabolic", "Heart", "Kidney", "Other", "Women"].map(g => `<div class="full"><div class="small muted" style="margin-bottom:6px">${g}</div><div class="fa-chips">${condBox(g)}</div></div>`).join("")}
      <label class="full">Other conditions<input name="otherConditions" value="${h(p.otherConditions || "")}" placeholder="e.g. asthma, migraine"></label>
      <label class="full">Allergies or intolerances<input name="allergies" value="${h(p.allergies || "")}" placeholder="e.g. peanuts, lactose"></label>
      <label class="full">Anything else Claude should know<textarea name="notes" rows="2" placeholder="e.g. gym 3×/week, night shifts">${h(p.notes || "")}</textarea></label>
      ${lf.size ? `<div class="full small">Also picked up from your lab reports: ${[...lf.keys()].map(k => `<span class="fa-tag lab">${h(LABN[k] || k)}</span>`).join("")}</div>` : ""}
      <div class="full fa-row" style="justify-content:space-between;margin-top:6px">${first ? `<button type="button" class="btn" id="faLater">Later</button>` : "<span></span>"}<button class="btn primary" type="submit">Save profile</button></div>
      <div class="full small muted">Targets use ICMR-NIN 2020 and US National Academies values adjusted for your sex, age and conditions. General guidance, not medical advice.</div>
    </form>
    <div id="faPlan"></div>`, true);
  bg.querySelector("#faLater")?.addEventListener("click", () => { try { sessionStorage.setItem("hl-onboard-later", "1"); } catch {} bg.close(); });
  const fm = bg.querySelector("#faP");
  fm.onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(fm), num = k => f.get(k) === "" ? null : +f.get(k);
    const doc = { name: String(f.get("name") || "").trim(), sex: f.get("sex"), dob: f.get("dob") || "", age: f.get("dob") ? null : num("age"),
      heightCm: num("heightCm"), weightKg: num("weightKg"), goal: f.get("goal"), goalKg: num("goalKg"), activity: +f.get("activity"), diet: f.get("diet"),
      conditions: f.getAll("cond"), otherConditions: String(f.get("otherConditions") || "").trim(), allergies: String(f.get("allergies") || "").trim(), notes: String(f.get("notes") || "").trim() };
    if (!doc.dob && !doc.age) { toast("Add your date of birth or age."); return; }
    const btn = fm.querySelector("[type=submit]"); btn.disabled = true;
    const { error } = await sb().from("user_profile").upsert({ user_id: S.uid, doc, updated_at: new Date().toISOString() });
    btn.disabled = false;
    if (error) { toast("Couldn't save: " + error.message); return; }
    F.profile = doc; renderSettingsCards(); window.NUT?.render?.();
    // offer the recalculated targets
    const nx = window.NUT?.planFromProfile?.(), cur = window.NUT?.plan?.(), saved = window.NUT?.planSaved?.();
    if (!nx) { toast("Profile saved"); bg.close(); return; }
    if (!saved) { await window.NUT.savePlan(nx).catch(() => {}); toast("Profile saved · targets set"); bg.close(); return; }
    fm.hidden = true;
    bg.querySelector("#faPlan").innerHTML = `<div class="notice"><b>Profile saved.</b> Targets from your profile:<div class="fa-kv" style="margin:8px 0">
      <div>Calories</div><div><b>${nx.kcal.toLocaleString("en-IN")} kcal</b> (now ${(+cur.kcal).toLocaleString("en-IN")})</div><div>Protein</div><div>${nx.protein} g (now ${cur.protein})</div>
      <div>Carbs</div><div>${nx.carbs} g (now ${cur.carbs})</div><div>Fat</div><div>${nx.fat} g (now ${cur.fat})</div><div>Sodium max</div><div>${nx.sodiumMg.toLocaleString("en-IN")} mg (now ${(+cur.sodiumMg).toLocaleString("en-IN")})</div></div>
      <div class="fa-row"><button class="btn primary" id="faUse">Use these targets</button><button class="btn" data-close>Keep my current targets</button></div></div>`;
    bg.querySelectorAll("[data-close]").forEach(b => b.onclick = bg.close);
    bg.querySelector("#faUse").onclick = async () => { await window.NUT.savePlan(nx).catch(() => {}); toast("Targets updated"); bg.close(); };
  };
}

/* ---------- Settings cards: profile summary + people (admin) ---------- */
function renderSettingsCards(){
  const box = document.getElementById("profileCard"); if (!box) return;
  if (F.missing) { box.innerHTML = `<div class="card-h"><h2>Profile &amp; health</h2></div><div class="notice">Run <b>14-people-profiles-meds.sql</b> in Supabase first (see the setup steps).</div>`; return; }
  const p = F.profile, lf = labFlags(), a = age();
  box.innerHTML = `<div class="card-h"><h2>Profile &amp; health</h2><button class="btn" id="faEditP">${p ? "Edit" : "Set up"}</button></div>
    ${p ? `<div class="fa-kv"><div>Name</div><div>${h(p.name || "—")}</div><div>About</div><div>${h(who())}${p.heightCm ? ` · ${p.heightCm} cm` : ""}${p.weightKg ? ` · ${p.weightKg} kg` : ""}</div>
      <div>Goal</div><div>${h(GOALS.find(g => g[0] === p.goal)?.[1] || "—")}${p.goalKg ? ` → ${p.goalKg} kg` : ""}</div>
      <div>Conditions</div><div>${(p.conditions || []).map(k => `<span class="fa-tag">${h(CN[k])}</span>`).join("") || "None"}${p.otherConditions ? `<span class="fa-tag">${h(p.otherConditions)}</span>` : ""}${[...lf.keys()].map(k => `<span class="fa-tag lab" title="From your lab reports">${h(LABN[k] || k)}</span>`).join("")}</div>
      ${p.allergies ? `<div>Allergies</div><div>${h(p.allergies)}</div>` : ""}
      <div>Medicines</div><div>${activeMeds().length ? activeMeds().map(m => h(m.name)).join(", ") : "None"} · <a href="#" id="faGoMeds">Manage</a></div></div>
      <p class="small muted" style="margin-top:8px">Blue tags come from your lab reports automatically. Your targets and every AI estimate use this profile.</p>`
      : `<div class="empty">Add your height, weight, goal and any conditions so your targets are worked out for you${a ? "" : ""}.</div>`}`;
  box.querySelector("#faEditP").onclick = () => openProfile(!p);
  box.querySelector("#faGoMeds")?.addEventListener("click", e => { e.preventDefault(); go("meds"); });
  renderPeople();
}

async function renderPeople(){
  const box = document.getElementById("peopleCard"); if (!box) return;
  if (!F.admin) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="card-h"><h2>People</h2></div><div class="empty">Loading…</div>`;
  const [pl] = await Promise.all([sb().from("people_list").select("*").order("joined_at", { ascending: false }), window.aiStatusFresh?.()]);
  const us = await sb().from("ai_usage").select("user_id,calls").eq("day", new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  if (pl.error) { box.innerHTML = `<div class="card-h"><h2>People</h2></div><div class="notice">Run <b>14-people-profiles-meds.sql</b> in Supabase first. (${h(pl.error.message)})</div>`; return; }
  const use = Object.fromEntries((us.data || []).map(x => [x.user_id, x.calls])), cap = S.ai?.cap ?? 5, link = location.origin + location.pathname + "?signup";
  const dt = x => x ? new Date(x).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
  box.innerHTML = `<div class="card-h"><h2>People</h2><span class="hint">${(pl.data || []).length} account${(pl.data || []).length === 1 ? "" : "s"}</span></div>
    <div class="notice" style="margin-bottom:10px">Share this link with friends. It opens the <b>Create account</b> screen; they add their name, email and password, then their age, body and health details.
      <div class="fa-row" style="margin-top:8px"><input readonly value="${h(link)}" style="flex:1 1 240px;font:inherit;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn primary" id="faCopy">Copy link</button>${navigator.share ? `<button class="btn" id="faShare">Share</button>` : ""}</div></div>
    <div style="overflow-x:auto"><table class="fa-people" style="width:100%;border-collapse:collapse"><thead><tr><th>Person</th><th>Joined</th><th>Last sign-in</th><th>Profile</th><th>AI today</th></tr></thead><tbody>
      ${(pl.data || []).map(x => `<tr><td><b>${h(x.profile_name || "—")}</b>${x.user_id === S.uid ? ' <span class="fa-tag">you</span>' : ""}<br><span class="small muted">${h(x.email)}</span></td>
        <td>${dt(x.joined_at)}</td><td>${dt(x.last_sign_in_at)}</td>
        <td>${x.has_profile ? `<span class="fa-st taken">Set up</span>` : `<span class="fa-st due">Not yet</span>`}</td>
        <td class="mono">${x.user_id === S.uid || !cap ? `${use[x.user_id] || 0}` : `${use[x.user_id] || 0} / ${cap}`}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="fa-row" style="margin-top:12px"><label class="small" style="font-weight:600" for="faCap">AI for friends on your Claude key</label>
      <select id="faCap" style="font:inherit;padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)">${[[0, "Off: they use their own key"], [3, "3 per day"], [5, "5 per day"], [10, "10 per day"], [20, "20 per day"], [30, "30 per day"]].map(([v, t]) => `<option value="${v}" ${+cap === v ? "selected" : ""}>${t}</option>`).join("")}${[0, 3, 5, 10, 20, 30].includes(+cap) ? "" : `<option selected value="${cap}">${cap} per day</option>`}</select>
      <span class="small muted" id="faCapMsg">${cap ? `≈ ₹${cap} per friend on a heavy day` : "costs you nothing"}</span></div>
    <p class="small muted" style="margin-top:10px">Each person only ever sees their own data; you see just this list (no health data). You're never limited. When AI is off for friends, everything else stays free for them; they can paste their own Claude key in Settings to turn AI on. To remove someone, delete them in Supabase → Authentication → Users.
    ${S.ai && !S.ai.ready ? `<br><span style="color:var(--bad)">The shared key isn't set up yet: add ANTHROPIC_API_KEY to the claude-proxy Edge Function.</span>` : ""}</p>`;
  box.querySelector("#faCap").onchange = async ev => {
    const n = +ev.target.value, { data, error } = await sb().rpc("hl_set_ai_cap", { n });
    if (error) { toast("Couldn't change: " + error.message); return; }
    if (S.ai) S.ai.cap = data ?? n; toast(n ? `Friends get ${n} AI actions a day` : "AI is off for friends unless they add their own key"); renderPeople();
  };
  box.querySelector("#faCopy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { box.querySelector("input[readonly]").select(); } };
  box.querySelector("#faShare")?.addEventListener("click", () => navigator.share({ title: "Health Ledger", text: "Track your health, food and medicines here:", url: link }).catch(() => {}));
}

/* ================= Medicines ================= */
const FORMS = ["tablet", "capsule", "syrup (ml)", "injection", "inhaler (puffs)", "drops", "cream / gel", "sachet", "insulin (units)"];
const FOOD = [["", "Any time"], ["before", "Before food"], ["with", "With food"], ["after", "After food"], ["empty", "Empty stomach"], ["bed", "At bedtime"]];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = iso => new Date(iso + "T00:00:00").getDay();
function slotsOn(m, d){
  if (m.active === false || m.freq === "asneeded") return [];
  if (m.start && d < m.start) return []; if (m.end && d > m.end) return [];
  if (m.freq === "weekly" && !(m.dows || []).includes(dow(d))) return [];
  if (m.freq === "alternate" && m.start && Math.round((new Date(d) - new Date(m.start)) / 864e5) % 2) return [];
  return (m.times || []).slice().sort();
}
const logFor = (id, d, slot) => F.log.find(x => x.med_id === id && x.day === d && x.slot === slot);
function slotState(m, d, slot){
  const l = logFor(m.id, d, slot); if (l) return l.status;
  const today = ld(); if (d < today) return "missed";
  if (d > today) return "upcoming";
  const late = nowHM() - hm(slot); return late > 60 ? "overdue" : late >= -30 ? "due" : "upcoming";
}
function adherence(m, days){
  const today = ld(); let due = 0, took = 0;
  for (let i = 0; i < days; i++) { const d = addD(today, -i);
    for (const s of slotsOn(m, d)) { if (d === today && hm(s) > nowHM()) continue; due++; if (logFor(m.id, d, s)?.status === "taken") took++; } }
  return due ? { pct: Math.round(took / due * 100), due, took } : null;
}
function perDayUnits(m){
  if (m.freq === "asneeded") { const d30 = addD(ld(), -30); const t = F.log.filter(x => x.med_id === m.id && x.status === "taken" && x.day > d30).reduce((s, x) => s + (+x.qty || 0), 0); return t / 30 || 0; }
  const n = (m.times || []).length * (+m.qty || 1); return m.freq === "weekly" ? n * (m.dows || []).length / 7 : m.freq === "alternate" ? n / 2 : n;
}
function stock(m){
  if (!(+m.packUnits > 0)) return null;
  const used = F.log.filter(x => x.med_id === m.id && x.status === "taken" && x.day >= (m.packStart || "0000")).reduce((s, x) => s + (+x.qty || 0), 0);
  const left = Math.max(0, +m.packUnits - used), pd = perDayUnits(m), days = pd > 0 ? Math.floor(left / pd) : null;
  return { left, days, low: left <= 0 || (days != null && days <= (+m.refillAt || 7)) };
}
const unitWord = (m, n) => { const u = (m.form || "tablet").split(" ")[0].replace(/[()]/g, ""); const w = /syrup/.test(m.form) ? "ml" : /inhaler/.test(m.form) ? "puff" : /insulin/.test(m.form) ? "unit" : u; return `${+(+n).toFixed(2)} ${w}${+n === 1 || w === "ml" ? "" : "s"}`; };

function renderMeds(){
  const v = document.getElementById("v-meds"); if (!v || v.hidden) return;
  if (!S?.uid) { v.innerHTML = `<div class="card"><div class="empty">Sign in to see your medicines.</div></div>`; return; }
  if (F.missing) { v.innerHTML = `<div class="card"><div class="notice">Run <b>14-people-profiles-meds.sql</b> in Supabase first (see the setup steps), then tap refresh.</div></div>`; return; }
  const today = ld(), meds = F.meds.filter(m => m.active !== false), slots = [];
  for (const m of meds) for (const s of slotsOn(m, today)) slots.push({ m, s, st: slotState(m, today, s) });
  slots.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : 0);
  const done = slots.filter(x => x.st === "taken").length, prn = meds.filter(m => m.freq === "asneeded");
  const lows = F.meds.filter(m => m.active !== false).map(m => ({ m, k: stock(m) })).filter(x => x.k?.low);
  const a7 = meds.map(m => adherence(m, 7)).filter(Boolean), tot7 = a7.reduce((s, x) => s + x.due, 0), ok7 = a7.reduce((s, x) => s + x.took, 0);
  const slotRow = ({ m, s, st }) => `<div class="fa-slot ${st === "taken" || st === "skipped" ? "done" : ""}"><div class="t">${t12(s)}</div>
      <div><div class="n">${h(m.name)}${m.strength ? ` <span class="muted" style="font-weight:500">${h(m.strength)}</span>` : ""}</div><div class="d">${h(unitWord(m, m.qty || 1))}${m.food ? " · " + h(FOOD.find(f => f[0] === m.food)?.[1] || "") : ""}${m.condition ? " · for " + h(m.condition) : ""}</div></div>
      <div class="fa-acts">${st === "taken" || st === "skipped" ? `<span class="fa-st ${st}">${st === "taken" ? "✓ Taken" : "Skipped"}</span><button class="btn" data-undo="${m.id}|${s}" title="Undo">↺</button>`
        : `${st === "overdue" || st === "due" ? `<span class="fa-st ${st}">${st === "overdue" ? "Overdue" : "Due"}</span>` : ""}<button class="btn" data-skip="${m.id}|${s}">Skip</button><button class="btn primary" data-take="${m.id}|${s}">Take</button>`}</div></div>`;
  v.innerHTML = `
    <div class="card"><div class="card-h"><h2>Today</h2><span class="hint">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</span></div>
      ${slots.length || prn.length ? `<div class="fa-row" style="gap:24px;margin-bottom:8px"><div><div class="fa-big">${done}<span class="muted" style="font-size:1rem"> / ${slots.length}</span></div><div class="small muted">doses taken today</div></div>
        ${tot7 ? `<div><div class="fa-big">${Math.round(ok7 / tot7 * 100)}%</div><div class="small muted">taken on time, last 7 days</div></div>` : ""}</div>
        ${lows.length ? `<div class="notice" style="margin:8px 0">${lows.map(({ m, k }) => `<b>${h(m.name)}</b>: ${k.left <= 0 ? "pack finished" : `${h(unitWord(m, k.left))} left (~${k.days} day${k.days === 1 ? "" : "s"})`}`).join(" · ")}. Time to restock.</div>` : ""}
        <div>${slots.map(slotRow).join("")}</div>
        ${prn.length ? `<div class="fa-sec" style="margin-top:12px">As needed</div>${prn.map(m => { const n = F.log.filter(x => x.med_id === m.id && x.day === today && x.status === "taken").length; return `<div class="fa-slot"><div class="t">—</div><div><div class="n">${h(m.name)} ${h(m.strength || "")}</div><div class="d">${n ? `Taken ${n}× today` : "Not taken today"}${m.condition ? " · for " + h(m.condition) : ""}</div></div><div class="fa-acts"><button class="btn primary" data-prn="${m.id}">Took a dose</button></div></div>`; }).join("")}` : ""}`
        : `<div class="empty">No medicines yet. Add the ones you take and they appear here as a daily checklist with reminders of what's due.</div>`}
    </div>
    <div class="card"><div class="card-h"><h2>My medicines</h2><button class="btn primary" id="faAddMed">+ Add medicine</button></div>
      <div>${F.meds.length ? F.meds.slice().sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name)).map(m => {
        const k = stock(m), a30 = adherence(m, 30), dots = Array.from({ length: 7 }, (_, i) => { const d = addD(today, i - 6), ss = slotsOn(m, d).filter(s => !(d === today && hm(s) > nowHM())); if (!ss.length) return `<i class="none" title="${d}"></i>`; const t = ss.filter(s => logFor(m.id, d, s)?.status === "taken").length; return `<i class="${t === ss.length ? "ok" : t ? "part" : d === today ? "" : "miss"}" title="${d}: ${t}/${ss.length}"></i>`; }).join("");
        return `<div class="fa-med" style="${m.active === false ? "opacity:.55" : ""}"><div class="top"><div><b>${h(m.name)}</b>${m.strength ? ` ${h(m.strength)}` : ""}${m.active === false ? ' <span class="fa-tag">paused</span>' : ""}${m.generic && m.generic.toLowerCase() !== m.name.toLowerCase() ? ` <span class="small muted">(${h(m.generic)})</span>` : ""}
          ${(m.cautions || []).length ? `<div class="small" style="color:var(--warn,#b25000);margin-top:2px">⚠ ${(m.cautions || []).map(h).join(" · ")}</div>` : ""}
          <div class="small muted">${m.freq === "asneeded" ? "As needed" : `${h(unitWord(m, m.qty || 1))} at ${(m.times || []).map(t12).join(", ")}${m.freq === "weekly" ? " on " + (m.dows || []).map(i => DOWS[i]).join(", ") : m.freq === "alternate" ? " every other day" : " daily"}`}${m.food ? " · " + h(FOOD.find(f => f[0] === m.food)?.[1] || "") : ""}${m.condition ? " · for " + h(m.condition) : ""}${m.doctor ? " · Dr " + h(m.doctor) : ""}</div>
          ${k ? `<div class="small" style="margin-top:4px;color:${k.low ? "var(--bad)" : "var(--muted)"}">${k.left <= 0 ? "Pack finished" : `${h(unitWord(m, k.left))} left${k.days != null ? ` · ~${k.days} days` : ""}`}${k.low ? " · restock soon" : ""}</div>` : ""}
          ${m.freq !== "asneeded" ? `<div class="fa-dots" aria-label="Last 7 days">${dots}</div>${a30 ? `<div class="small muted" style="margin-top:4px">${a30.pct}% of doses taken in the last 30 days</div>` : ""}` : ""}</div>
          <div class="fa-acts">${k ? `<button class="btn" data-restock="${m.id}">Restock</button>` : ""}<button class="btn" data-editmed="${m.id}">Edit</button></div></div></div>`; }).join("") : `<div class="empty">Nothing added yet.</div>`}</div>
      <p class="small muted" style="margin-top:10px">For tracking only. Always follow your doctor's prescription; don't change or stop a medicine without asking them.</p></div>`;
  v.querySelector("#faAddMed").onclick = () => openMed();
  v.onclick = async ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.editmed) return openMed(F.meds.find(m => m.id === b.dataset.editmed));
    if (b.dataset.restock) return openRestock(F.meds.find(m => m.id === b.dataset.restock));
    const [id, slot] = String(b.dataset.take || b.dataset.skip || b.dataset.undo || "").split("|");
    if (b.dataset.take || b.dataset.skip) { b.disabled = true; await logDose(id, slot, b.dataset.take ? "taken" : "skipped"); }
    if (b.dataset.undo) { const l = logFor(id, today, slot); if (l) await unlog(l.id); }
    if (b.dataset.prn) { b.disabled = true; await logDose(b.dataset.prn, "prn-" + Date.now().toString(36), "taken"); }
  };
}
async function logDose(id, slot, status){
  const m = F.meds.find(x => x.id === id), row = { id: nid("l"), user_id: S.uid, med_id: id, day: ld(), slot, status, qty: +m?.qty || 1 };
  const { error } = await sb().from("med_log").insert(row);
  if (error) { toast("Couldn't save: " + error.message); renderMeds(); return; }
  F.log.push({ ...row, at: new Date().toISOString() }); renderMeds();
  if (status === "taken") { const k = stock(m); if (k?.low) toast(`${m.name}: ${k.left <= 0 ? "pack finished" : `about ${k.days} days left`}, time to restock`); }
}
async function unlog(lid){ const { error } = await sb().from("med_log").delete().eq("id", lid); if (error) { toast(error.message); return; } F.log = F.log.filter(x => x.id !== lid); renderMeds(); }
async function saveMed(m){
  const { id, active, ...doc } = m;
  const { error } = await sb().from("medications").upsert({ id, user_id: S.uid, doc, active: active !== false, updated_at: new Date().toISOString() });
  if (error) { toast("Couldn't save: " + error.message); throw error; }
  const i = F.meds.findIndex(x => x.id === id); if (i >= 0) F.meds[i] = m; else F.meds.push(m);
  renderMeds(); renderSettingsCards();
}
const NEW_MED = () => ({ id: nid("m"), name: "", strength: "", form: "tablet", qty: 1, freq: "daily", times: ["09:00"], food: "", start: ld(), packStart: ld(), refillAt: 7, active: true });
function openMed(m0){ if (m0) return openMedForm(m0); openMedAdd(); }

/* ---- add a medicine: scan the strip/box, scan a prescription, type it, or fill the form ---- */
const MED_RULES = () => `Reply with ONLY JSON: {"meds":[{"name":"brand or common name as printed","generic":"active ingredient(s) with strengths, e.g. Metformin 500 mg","strength":"e.g. 500 mg","form":"one of: ${FORMS.join(" | ")}","qty":1,"freq":"daily | alternate | weekly | asneeded","times":["HH:MM"],"dows":[],"food":"before | with | after | empty | bed | (empty string)","condition":"what it is usually prescribed for, short","durationDays":null,"packUnits":null,"about":"one plain sentence: what it does","cautions":["short, specific cautions for THIS person (their conditions, other medicines and supplements, labs); empty if none"]}],"unclear":"anything you could not read, else empty"}
Rules: Indian prescription shorthand: 1-0-1 = morning and night; 1-1-1 or TDS = three times; BD = twice; OD = once; HS = at bedtime; SOS/PRN = as needed (freq "asneeded", times []); AC = before food; PC = after food; "x 5 days" → durationDays 5. Default times: morning 09:00 (empty stomach / before food 08:30), afternoon 14:00, night 21:00, bedtime 22:00; thyroxine-type medicines 06:30 on an empty stomach. packUnits = number of tablets/capsules in the strip or box shown (e.g. "10 tablets" strip), else null. If no dose schedule is visible, use the usual adult schedule for that medicine but say so in "unclear". Never invent a medicine that isn't shown or described.
Person: ${personLine() || "adult, no details given"}. Other supplements/medicines already in their list: ${activeMeds().map(medLine).join("; ") || "none"}.`;
function imgB64(file, max = 1600){
  return new Promise((res, rej) => { const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .85).split(",")[1]); };
    im.onerror = () => rej(new Error("Couldn't open that image.")); im.src = url; });
}
async function askMeds(kind, file, text){
  const intro = kind === "rx" ? "This photo is a doctor's prescription (it may be handwritten). List every medicine on it with its dose schedule."
    : kind === "pack" ? "This photo shows a medicine strip, bottle or box. Read the medicine on it (brand, active ingredient, strength, form, how many units in the pack)."
    : `The person describes medicine(s) they take: """${text}"""`;
  const content = [];
  if (file) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imgB64(file) } });
  content.push({ type: "text", text: intro + "\n" + MED_RULES() });
  const { text: out } = await claudeCall(content, { maxTokens: 2500 });
  const j = parseJSONLoose(out); if (!j || !Array.isArray(j.meds)) throw new Error("Couldn't read that. Try a clearer, closer photo, or type it.");
  return { meds: j.meds.filter(x => x && x.name), unclear: j.unclear || "" };
}
function medFromAI(x){
  const m = NEW_MED(), fm = FORMS.find(f => f.startsWith(String(x.form || "").toLowerCase().split(" ")[0])) || "tablet";
  const times = (Array.isArray(x.times) ? x.times : []).map(t => String(t).slice(0, 5)).filter(t => /^\d\d:\d\d$/.test(t));
  const freq = ["daily", "alternate", "weekly", "asneeded"].includes(x.freq) ? x.freq : "daily";
  return { ...m, name: String(x.name).trim(), strength: String(x.strength || "").trim(), generic: String(x.generic || "").trim(), form: fm, qty: +x.qty > 0 ? +x.qty : 1, freq,
    times: freq === "asneeded" ? [] : (times.length ? [...new Set(times)].sort() : ["09:00"]), dows: (x.dows || []).map(Number).filter(n => n >= 0 && n <= 6),
    food: FOOD.some(f => f[0] === x.food) ? x.food : "", condition: String(x.condition || "").trim(), about: String(x.about || "").trim(),
    cautions: (Array.isArray(x.cautions) ? x.cautions : []).map(String).filter(Boolean).slice(0, 4),
    end: +x.durationDays > 0 ? addD(ld(), Math.round(+x.durationDays) - 1) : "", packUnits: +x.packUnits > 0 ? +x.packUnits : null };
}
function openMedAdd(){
  const ai = typeof hasAI === "function" ? hasAI() : true;
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Add medicine</h2>${closeBtn}</div>
    <div class="fa-row" style="gap:8px;margin:6px 0 12px" role="tablist" id="faMode">
      <button class="pill-btn" data-mode="pack" aria-pressed="true">Scan strip / box</button><button class="pill-btn" data-mode="rx" aria-pressed="false">Scan prescription</button>
      <button class="pill-btn" data-mode="text" aria-pressed="false">Type it</button><button class="pill-btn" data-mode="manual" aria-pressed="false">Manual</button></div>
    <div id="faModeBody"></div><div class="small" id="faAiSt" style="margin-top:10px"></div><div id="faAiOut"></div>`);
  const body = bg.querySelector("#faModeBody"), st = bg.querySelector("#faAiSt"), outBox = bg.querySelector("#faAiOut");
  const say = (t, bad) => { st.innerHTML = t; st.style.color = bad ? "var(--bad)" : ""; };
  const noAI = `<div class="notice">Reading photos needs AI. ${S.settings?.anthropic_key ? "" : "Add your own Claude API key in Settings → Your own Claude key, or "}use <b>Manual</b>.</div>`;
  const filePick = (id, label, capture) => `<label class="btn ${capture ? "primary" : ""}" style="cursor:pointer">${label}<input type="file" accept="image/*" ${capture ? 'capture="environment"' : ""} id="${id}" hidden></label>`;
  const run = async (kind, file, text) => {
    say(kind === "rx" ? "Reading the prescription… (10–20 seconds)" : "Reading… (a few seconds)"); outBox.innerHTML = "";
    try { const r = await askMeds(kind, file, text); if (!r.meds.length) { say("No medicine found. Try a closer photo with the name visible, or type it.", true); return; } say(""); showFound(r); }
    catch (e) { say(h(e.message || e) + " You can also use <b>Manual</b>.", true); }
  };
  const showFound = ({ meds, unclear }) => {
    const list = meds.map(medFromAI), dup = m => F.meds.some(x => x.active !== false && x.name.toLowerCase() === m.name.toLowerCase());
    if (list.length === 1 && !unclear) { bg.close(); openMedForm(list[0], true); return; }
    outBox.innerHTML = `${unclear ? `<div class="notice" style="margin-bottom:8px">Check: ${h(unclear)}</div>` : ""}
      <div class="small muted" style="margin-bottom:6px">Found ${list.length} medicine${list.length > 1 ? "s" : ""}. Untick any you don't take, check the times, then add.</div>
      ${list.map((m, i) => `<div class="fa-med"><div class="top"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-pick="${i}" ${dup(m) ? "" : "checked"} style="margin-top:4px">
        <div><b>${h(m.name)}</b> ${h(m.strength)}${dup(m) ? ' <span class="fa-tag">already in your list</span>' : ""}${m.generic && m.generic.toLowerCase() !== m.name.toLowerCase() ? ` <span class="small muted">(${h(m.generic)})</span>` : ""}
        <div class="small muted">${m.freq === "asneeded" ? "As needed" : `${h(unitWord(m, m.qty))} at ${m.times.map(t12).join(", ")}`}${m.food ? " · " + h(FOOD.find(f => f[0] === m.food)?.[1] || "") : ""}${m.end ? ` · until ${h(m.end)}` : ""}${m.condition ? " · for " + h(m.condition) : ""}</div>
        ${m.cautions.length ? `<div class="small" style="color:var(--warn,#b25000);margin-top:3px">⚠ ${m.cautions.map(h).join(" · ")}</div>` : ""}</div></label>
        <button class="btn" data-edit-found="${i}">Edit</button></div></div>`).join("")}
      <div class="fa-row" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" id="faAddAll">Add selected</button></div>`;
    outBox.querySelectorAll("[data-edit-found]").forEach(b => b.onclick = () => { bg.close(); openMedForm(list[+b.dataset.editFound], true); });
    outBox.querySelector("#faAddAll").onclick = async ev => { ev.target.disabled = true;
      const pick = list.filter((_, i) => outBox.querySelector(`[data-pick="${i}"]`).checked);
      try { for (const m of pick) await saveMed(m); toast(`Added ${pick.length} medicine${pick.length === 1 ? "" : "s"}`); bg.close(); } catch { ev.target.disabled = false; } };
  };
  const show = mode => {
    bg.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode))); say(""); outBox.innerHTML = "";
    if (mode === "manual") { bg.close(); openMedForm(NEW_MED(), true); return; }
    if (!ai) { body.innerHTML = noAI; return; }
    if (mode === "text") {
      body.innerHTML = `<div class="fa-form"><label class="full">Describe it<textarea id="faTxt" rows="3" placeholder="e.g. Metformin 500 1-0-1 after food; Telma 40 once in the morning; Dolo 650 SOS"></textarea></label>
        <div class="full fa-row" style="justify-content:flex-end"><button class="btn primary" id="faTxtGo">Read it</button></div></div>`;
      body.querySelector("#faTxtGo").onclick = () => { const t = body.querySelector("#faTxt").value.trim(); if (!t) { say("Type the medicine name and how you take it.", true); return; } run("text", null, t); };
      return;
    }
    body.innerHTML = `<p class="small muted" style="margin:0 0 10px">${mode === "rx" ? "Photograph the whole prescription in good light. Handwritten is fine; you'll check everything before it's saved." : "Photograph the side of the strip or box that shows the medicine name and strength (e.g. “Metformin Hydrochloride Tablets IP 500 mg”)."}</p>
      <div class="fa-row">${filePick("faCam", "📷 Take photo", true)}${filePick("faUp", "Upload photo", false)}</div>`;
    body.querySelectorAll("input[type=file]").forEach(inp => inp.onchange = () => { const f = inp.files?.[0]; if (f) run(mode, f); inp.value = ""; });
  };
  bg.querySelector("#faMode").onclick = e => { const b = e.target.closest("[data-mode]"); if (b) show(b.dataset.mode); };
  show("pack");
}

function openMedForm(m0, fresh){
  const m = m0 || NEW_MED(); const isNew = fresh || !m0;
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>${isNew ? "Add medicine" : "Edit medicine"}</h2>${closeBtn}</div>
    ${m.generic || m.about ? `<p class="small" style="margin:0 0 6px">${m.generic ? `<b>${h(m.generic)}</b>. ` : ""}${h(m.about || "")}</p>` : ""}
    ${(m.cautions || []).length ? `<div class="notice" style="margin-bottom:10px">⚠ ${(m.cautions || []).map(h).join("<br>⚠ ")}</div>` : ""}
    ${isNew && m.name ? `<p class="small muted" style="margin:0 0 8px">Read by AI: check the strength, times and pack size against your prescription before saving.</p>` : ""}
    <form class="fa-form" id="faM">
      <label class="full">Medicine name<input name="name" required value="${h(m.name)}" placeholder="e.g. Metformin, Telmisartan, Thyronorm"></label>
      <label>Strength<input name="strength" value="${h(m.strength || "")}" placeholder="e.g. 500 mg"></label>
      <label>Form<select name="form">${FORMS.map(f => `<option ${m.form === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>
      <label>Per dose (how many)<input name="qty" type="number" min="0" step="any" inputmode="decimal" value="${h(m.qty ?? 1)}"></label>
      <label>How often<select name="freq"><option value="daily" ${m.freq === "daily" ? "selected" : ""}>Every day</option><option value="alternate" ${m.freq === "alternate" ? "selected" : ""}>Every other day</option><option value="weekly" ${m.freq === "weekly" ? "selected" : ""}>Some days of the week</option><option value="asneeded" ${m.freq === "asneeded" ? "selected" : ""}>Only when needed</option></select></label>
      <div class="full" id="faTimesW"><div class="small muted" style="font-weight:600;margin-bottom:6px">Times</div><div class="fa-row" id="faTimes">${(m.times || []).map(t => `<span class="fa-row" style="gap:4px"><input type="time" name="time" value="${h(t)}" required style="width:auto"><button type="button" class="btn" data-rmt aria-label="Remove time">✕</button></span>`).join("")}<button type="button" class="btn" id="faAddT">+ Time</button></div></div>
      <div class="full" id="faDowsW" ${m.freq === "weekly" ? "" : "hidden"}><div class="fa-chips">${DOWS.map((d, i) => `<label><input type="checkbox" name="dow" value="${i}" ${(m.dows || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div></div>
      <label>Take it<select name="food">${FOOD.map(([k, n]) => `<option value="${k}" ${m.food === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>For (condition)<input name="condition" value="${h(m.condition || "")}" list="faCondL" placeholder="e.g. Diabetes"><datalist id="faCondL">${CONDITIONS.map(c => `<option value="${h(c.n)}">`).join("")}</datalist></label>
      <label>Prescribed by<input name="doctor" value="${h(m.doctor || "")}" placeholder="Doctor's name"></label>
      <label>Started<input name="start" type="date" value="${h(m.start || "")}"></label>
      <label>Until (optional)<input name="end" type="date" value="${h(m.end || "")}"></label>
      <div class="fa-sec">Stock</div>
      <label>Units in the current pack<input name="packUnits" type="number" min="0" step="any" inputmode="decimal" value="${h(m.packUnits || "")}" placeholder="e.g. 30"></label>
      <label>Remind me to restock when<select name="refillAt">${[3, 5, 7, 10, 14].map(n => `<option value="${n}" ${+m.refillAt === n ? "selected" : ""}>${n} days left</option>`).join("")}</select></label>
      <label class="full">Notes<input name="notes" value="${h(m.notes || "")}" placeholder="e.g. check sugar before taking"></label>
      <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="active" ${m.active !== false ? "checked" : ""} style="width:auto"> Currently taking</label>
      <div class="full fa-row" style="justify-content:space-between">${!isNew ? `<button type="button" class="btn" id="faDelM" style="color:var(--bad)">Delete</button>` : "<span></span>"}<button class="btn primary" type="submit">Save</button></div>
    </form>`);
  const fm = bg.querySelector("#faM"), tw = bg.querySelector("#faTimes");
  const sync = () => { const fq = fm.elements.freq.value; bg.querySelector("#faTimesW").hidden = fq === "asneeded"; bg.querySelector("#faDowsW").hidden = fq !== "weekly"; fm.querySelectorAll("input[name=time]").forEach(i => i.required = fq !== "asneeded"); };
  fm.elements.freq.onchange = sync; sync();
  bg.querySelector("#faAddT").onclick = () => { const s = document.createElement("span"); s.className = "fa-row"; s.style.gap = "4px"; s.innerHTML = `<input type="time" name="time" value="21:00" required style="width:auto"><button type="button" class="btn" data-rmt aria-label="Remove time">✕</button>`; tw.insertBefore(s, bg.querySelector("#faAddT")); };
  tw.onclick = e => { const r = e.target.closest("[data-rmt]"); if (r && tw.querySelectorAll("input[name=time]").length > 1) r.parentElement.remove(); };
  fm.onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(fm);
    const pu = f.get("packUnits") === "" ? null : +f.get("packUnits");
    const nm = { ...m, name: String(f.get("name")).trim(), strength: String(f.get("strength") || "").trim(), form: f.get("form"), qty: +f.get("qty") || 1, freq: f.get("freq"),
      times: [...new Set(f.getAll("time").filter(Boolean))].sort(), dows: f.getAll("dow").map(Number), food: f.get("food"), condition: String(f.get("condition") || "").trim(),
      doctor: String(f.get("doctor") || "").trim(), start: f.get("start") || ld(), end: f.get("end") || "", refillAt: +f.get("refillAt") || 7, notes: String(f.get("notes") || "").trim(), active: !!f.get("active") };
    if (pu !== (+m.packUnits || null)) { nm.packUnits = pu; nm.packStart = ld(); }
    if (nm.freq === "weekly" && !nm.dows.length) { toast("Pick at least one day."); return; }
    try { await saveMed(nm); toast(`${nm.name} saved`); bg.close(); } catch {}
  };
  bg.querySelector("#faDelM")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${m.name} and its history?`)) return;
    const { error } = await sb().from("medications").delete().eq("id", m.id); if (error) { toast(error.message); return; }
    await sb().from("med_log").delete().eq("med_id", m.id);
    F.meds = F.meds.filter(x => x.id !== m.id); F.log = F.log.filter(x => x.med_id !== m.id); bg.close(); renderMeds(); renderSettingsCards();
  });
}
function openRestock(m){
  const k = stock(m) || { left: 0 };
  const bg = sheet(`<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Restock ${h(m.name)}</h2>${closeBtn}</div>
    <p>Left now: <b>${h(unitWord(m, k.left))}</b></p>
    <form class="fa-form" id="faR"><label>Units in the new pack<input name="n" type="number" min="1" step="any" inputmode="decimal" required placeholder="e.g. 30"></label>
      <label style="justify-content:flex-end"><button class="btn primary" type="submit" style="height:40px">Add to stock</button></label></form>`);
  bg.querySelector("#faR").onsubmit = async ev => {
    ev.preventDefault(); const n = +new FormData(ev.target).get("n"); if (!(n > 0)) return;
    const takenToday = F.log.filter(x => x.med_id === m.id && x.status === "taken" && x.day === ld()).reduce((s, x) => s + (+x.qty || 0), 0);
    try { await saveMed({ ...m, packUnits: k.left + n + takenToday, packStart: ld() }); toast("Stock updated"); bg.close(); } catch {}
  };
}
// re-check what's due every minute while the tab is open
setInterval(() => { const v = document.getElementById("v-meds"); if (v && !v.hidden) renderMeds(); }, 60000);
})();
