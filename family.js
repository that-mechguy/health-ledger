/* Health Ledger · family accounts you can view (read-only).
   The admin creates a login for each family member (Settings → Family), and gets a "Viewing" switcher in the header.
   Uses the Ledger's globals: S, SB, $, esc, renderAll, loadAll, VID/VIEWING (window.HL_VID / HL_VIEWING).
   Tables: family_links (supabase/15-family.sql). Edge Function: family-admin. */
(function(){
"use strict";
const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FA = { links: [], viewers: [], missing: false, uid: null, made: null };
const RELS = ["Mother", "Father", "Spouse", "Sibling", "Son", "Daughter", "Grandparent", "Other"];
const shortLogin = l => String(l || "").replace(/@family\.local$/, "");
const site = () => location.origin + location.pathname;
const genPw = () => { const a = "abcdefghjkmnpqrstuvwxyz", d = "23456789"; const r = s => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return r(a).toUpperCase() + Array.from({ length: 5 }, () => r(a)).join("") + Array.from({ length: 4 }, () => r(d)).join(""); };
function toast(msg){ document.querySelectorAll(".fa-toast").forEach(x => x.remove()); const t = document.createElement("div"); t.className = "fa-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3600); }

/* ---------- styles ---------- */
const css = document.createElement("style");
css.textContent = `
.fm-sel{font:inherit;font-size:13px;padding:5px 8px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);max-width:170px}
.fm-bar{position:sticky;top:0;z-index:30;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 16px;
  background:var(--accent,#2f6fed);color:#fff;font-size:14px;text-align:center}
.fm-bar b{font-weight:650}.fm-bar button{font:inherit;font-size:13px;padding:4px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.7);background:transparent;color:#fff;cursor:pointer}
.fm-list{display:grid;gap:8px;margin-bottom:12px}
.fm-item{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line);border-radius:12px}
.fm-item .who{flex:1 1 180px;min-width:0}.fm-item .who b{display:block}
.fm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end}
.fm-form label{display:grid;gap:4px;font-size:13px;color:var(--muted)}
.fm-form input,.fm-form select{min-width:0;width:100%;box-sizing:border-box;font:inherit;color:var(--ink);padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface)}
.fm-made{margin-top:12px;padding:12px;border-radius:12px;border:1px dashed var(--line);white-space:pre-wrap;font:13px/1.5 var(--f-mono,ui-monospace,monospace)}
body.viewing .fm-hide-viewing{display:none!important}`;
document.head.appendChild(css);

/* ---------- data ---------- */
async function load(){
  if (typeof S === "undefined" || !S.uid || !SB) return;
  const { data, error } = await SB.from("family_links").select("owner,member,name,relation,login,created_at").order("created_at");
  FA.missing = !!error && /relation|schema cache|does not exist/i.test(error.message || "");
  const rows = data || [];
  FA.links = rows.filter(x => x.owner === S.uid);
  FA.viewers = rows.filter(x => x.member === S.uid);
  FA.uid = S.uid;
}
function reset(){ FA.links = []; FA.viewers = []; FA.uid = null; FA.made = null; document.body.classList.remove("viewing"); $("#fmBar")?.remove(); $("#fmSel")?.remove(); }

/* ---------- switch whose dashboard is shown ---------- */
async function viewAs(uid){
  const me = !uid || uid === S.uid, link = FA.links.find(x => x.member === uid);
  if (!me && !link) return;
  S.vid = me ? null : uid; S.vname = me ? "" : link.name;
  window.NUT?.reset?.(); window.HLP?.reset?.();
  S.reports = []; S.activity = {}; S.loadedR = S.loadedA = false;
  document.body.classList.toggle("viewing", !me);
  renderBar(); renderSwitcher();
  try { renderAll(); } catch {}
  await loadAll();
  window.HLP?.renderSettingsCards?.(); renderCard();
  window.scrollTo({ top: 0 });
}
function renderSwitcher(){
  const host = document.querySelector(".brand-r"); if (!host) return;
  let sel = $("#fmSel");
  if (!FA.links.length) { sel?.remove(); return; }
  if (!sel) { sel = document.createElement("select"); sel.id = "fmSel"; sel.className = "fm-sel"; sel.setAttribute("aria-label", "Whose dashboard"); host.insertBefore(sel, host.firstChild);
    sel.onchange = () => viewAs(sel.value === "me" ? null : sel.value); }
  sel.innerHTML = `<option value="me">Me</option>` + FA.links.map(x => `<option value="${h(x.member)}">${h(x.name)}${x.relation ? ` (${h(x.relation)})` : ""}</option>`).join("");
  sel.value = S.vid || "me";
}
function renderBar(){
  let bar = $("#fmBar");
  if (!window.HL_VIEWING?.()) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "fmBar"; bar.className = "fm-bar"; document.body.insertBefore(bar, document.body.firstChild); }
  bar.innerHTML = `<span>Viewing <b>${h(S.vname)}</b>'s dashboard · read-only</span><button type="button" id="fmBack">Back to mine</button>`;
  bar.querySelector("#fmBack").onclick = () => viewAs(null);
}

/* ---------- Settings → Family ---------- */
function renderCard(){
  const box = $("#familyCard"); if (!box) return;
  const admin = window.HLP?.isAdmin?.();
  if (!admin) {   // a family member: say plainly who can see their data
    if (!FA.viewers.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="card-h"><h2>Who can see your dashboard</h2></div>
      <p class="small" style="margin:0">The family member who created your account can <b>view</b> your food, medicines, reports and activity. They can't change anything or see your Claude key.</p>`;
    return;
  }
  box.hidden = false;
  if (FA.missing) { box.innerHTML = `<div class="card-h"><h2>Family</h2></div><div class="notice">Run <b>15-family.sql</b> in Supabase first, and deploy the <b>family-admin</b> Edge Function (see the setup steps).</div>`; return; }
  const viewing = window.HL_VIEWING?.();
  box.innerHTML = `<div class="card-h"><h2>Family</h2><span class="hint">${FA.links.length} linked</span></div>
    <p class="small muted" style="margin:0 0 10px">Create a login for each family member. They sign in on their own phone with the username and password you give them. You can switch to their dashboard from the menu at the top (read-only). Friends who signed up themselves stay private.</p>
    <div class="fm-list">${FA.links.map(x => `<div class="fm-item" data-m="${h(x.member)}">
        <div class="who"><b>${h(x.name)}${x.relation ? ` <span class="fa-tag">${h(x.relation)}</span>` : ""}</b><span class="small muted">Sign-in: ${h(shortLogin(x.login))}</span></div>
        <button class="btn" data-act="view">${S.vid === x.member ? "Viewing" : "View"}</button>
        <button class="btn fm-hide-viewing" data-act="pw">New password</button>
        <button class="btn fm-hide-viewing" data-act="rm">Remove</button>
        <div class="fm-pw" hidden style="flex-basis:100%"></div></div>`).join("") || `<div class="empty">No family accounts yet.</div>`}</div>
    ${viewing ? `<p class="small muted">Switch back to your own dashboard to add or change family accounts.</p>` : `
    <form class="fm-form" id="fmForm" autocomplete="off">
      <label>Name<input name="name" required placeholder="e.g. Mummy"></label>
      <label>Relation<select name="relation">${RELS.map(r => `<option>${r}</option>`).join("")}</select></label>
      <label>Username or email<input name="login" required placeholder="e.g. mummy" autocapitalize="none" spellcheck="false"></label>
      <label>Password<input name="password" required minlength="8" value="${genPw()}"></label>
      <button class="btn primary" type="submit" id="fmAdd">Create account</button>
    </form>
    <div class="small" id="fmMsg" style="margin-top:8px"></div>
    ${FA.made ? `<div class="fm-made" id="fmMade">${h(FA.made)}</div><div class="row" style="margin-top:8px;gap:8px"><button class="btn" id="fmCopy">Copy login details</button>${navigator.share ? `<button class="btn" id="fmShare">Share</button>` : ""}</div>` : ""}`}`;

  box.querySelectorAll(".fm-item").forEach(it => {
    const m = it.dataset.m, x = FA.links.find(l => l.member === m);
    it.querySelector('[data-act="view"]').onclick = () => viewAs(S.vid === m ? null : m);
    const rm = it.querySelector('[data-act="rm"]');
    rm.onclick = async () => {
      if (rm.dataset.sure !== "1") { rm.dataset.sure = "1"; rm.textContent = "Tap again to remove"; setTimeout(() => { rm.dataset.sure = ""; rm.textContent = "Remove"; }, 4000); return; }
      const { error } = await SB.from("family_links").delete().eq("owner", S.uid).eq("member", m);
      if (error) return toast("Couldn't remove: " + error.message);
      toast(`${x.name} removed. Their account still works; you just can't view it any more.`);
      await load(); renderSwitcher(); renderCard();
    };
    it.querySelector('[data-act="pw"]').onclick = () => {
      const box2 = it.querySelector(".fm-pw"); box2.hidden = !box2.hidden; if (box2.hidden) return;
      box2.innerHTML = `<form class="fm-form"><label>New password for ${h(x.name)}<input name="pw" minlength="8" required value="${genPw()}"></label><button class="btn primary" type="submit">Set password</button></form><div class="small fm-pwmsg"></div>`;
      box2.querySelector("form").onsubmit = async e => {
        e.preventDefault(); const pw = new FormData(e.target).get("pw"), msg = box2.querySelector(".fm-pwmsg");
        msg.textContent = "Saving…";
        const r = await call({ action: "reset", member: m, password: pw });
        if (!r.ok) { msg.style.color = "var(--bad)"; msg.textContent = r.message; return; }
        msg.style.color = ""; msg.textContent = `Done. ${x.name}'s new password: ${pw}`;
      };
    };
  });
  const f = box.querySelector("#fmForm");
  if (f) f.onsubmit = async e => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f)), msg = box.querySelector("#fmMsg"), b = box.querySelector("#fmAdd");
    v.name = String(v.name).trim(); v.login = String(v.login).trim().toLowerCase();
    if (!v.login.includes("@") && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(v.login)) { msg.style.color = "var(--bad)"; msg.textContent = "Username: 3–30 letters or numbers, no spaces (dots and dashes are fine)."; return; }
    b.disabled = true; msg.style.color = ""; msg.textContent = "Creating…";
    const r = await call({ action: "create", ...v });
    b.disabled = false;
    if (!r.ok) { msg.style.color = "var(--bad)"; msg.textContent = r.message; return; }
    FA.made = `Health Ledger: ${site()}\nSign-in: ${shortLogin(r.login)}\nPassword: ${v.password}\n\nOpen the link, tap Sign in, then add your age, height, weight and any health conditions.`;
    await load(); renderSwitcher(); renderCard(); toast(`${v.name}'s account is ready`);
  };
  box.querySelector("#fmCopy")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(FA.made); toast("Copied"); } catch { toast("Select the text and copy it"); } });
  box.querySelector("#fmShare")?.addEventListener("click", () => navigator.share({ text: FA.made }).catch(() => {}));
}
async function call(body){
  try {
    const { data, error } = await SB.functions.invoke("family-admin", { body });
    if (error) { let m = error.message; try { const j = await error.context?.json?.(); if (j?.message) m = j.message; } catch {} return { ok: false, message: /Failed to send|not found|404/i.test(m) ? "The family-admin Edge Function isn't set up yet (see the setup steps)." : m }; }
    return data || { ok: false, message: "No answer from the server." };
  } catch (e) { return { ok: false, message: String(e?.message || e) }; }
}

/* ---------- wiring ---------- */
async function refresh(){
  if (typeof S === "undefined" || !S.uid) return;
  if (FA.uid !== S.uid) await load().catch(() => {});
  renderSwitcher(); renderBar(); renderCard();
}
window.addEventListener("hl:loaded", () => setTimeout(refresh, 50));
setTimeout(() => { if (typeof S !== "undefined" && S.uid && S.loadedR) refresh(); }, 0);
window.HLF = { load, reset, viewAs, links: () => FA.links };
})();
