/* =========================================================
 * "למי מתקשרים?" (1.8) – תהליך תיאום קצר לנקודה שנבדקה.
 * "Who do I call?" – a short coordination flow for the checked point.
 *
 * אוסף את גורמי התיאום של כל האזורים שהנקודה נמצאת בהם (ושל מנחתים קרובים), מאחד כפילויות,
 * ומציג אותם כצעדים עם חיוג בלחיצה, דוא"ל וקישור לטופס. בנוסף מכין נוסח קצר להעתקה.
 *
 * מקור הפרטים: רק מה שכבר קיים בנתוני המפה (פמ"ת א'-17, א'-07, ב'-09, פרקי המנחתים), ובנוטאם –
 * מספרי טלפון שמופיעים בנוסח הנוטאם עצמו (מסומנים ככאלה). המודול לא מוסיף מספרים משלו.
 *
 * WhoCall.build(zones, near, ctx) -> { steps, count }
 * WhoCall.buttonHtml / panelHtml / briefText
 * ========================================================= */
(function () {
  "use strict";
  const TXT = {
    he: {
      button: "למי מתקשרים?", title: "למי מתקשרים – לפי הסדר",
      none: "בנקודה הזו לא נמצא אזור שדורש תיאום לפי נתוני המפה.",
      forZones: "עבור", andMore: "ועוד {n}", nearby: "קרוב ({d} ק\"מ)",
      call: "חייגו", mail: "דוא\"ל", form: "טופס / אתר", freq: "תדר",
      noContact: "בפרסומים לא מופיע טלפון לתיאום האזור הזה. בדקו במקור:",
      fromNotam: "מספר שמופיע בנוסח הנוטאם",
      notamNoContact: "בנוסח הנוטאם אין פרטי קשר. מקור הנוטאם:",
      scheduled: "האזור אינו פעיל כרגע לפי הנתונים – ודאו לפני הטיסה",
      ask: {
        ctr: "אישור מיחידת הנת\"א או ממפעיל המנחת לפני הטיסה",
        airfield: "תיאום עם מפעיל השדה או המנחת",
        heliport: "תיאום עם מפעיל מנחת המסוקים",
        uasProhibited: "אישור בכתב מהגורם האחראי על האזור",
        prohibited: "אישור מהגורם האחראי על האזור",
        restricted: "תיאום ואישור מהגורם האחראי על האזור",
        danger: "תיאום עם הגורם שמפעיל את האזור",
        uas: "תיאום הפעילות באזור הטיסה",
        nature: "אישור טיסה מרשות הטבע והגנים",
        notam: "בירור מול הגורם שפרסם את הסגירה",
        notamApprox: "בירור מול הגורם שפרסם את הסגירה"
      },
      details: "מה כתוב בפרסום",
      briefTitle: "מה להכין לשיחה", briefCopy: "העתק נוסח", briefShare: "שתף", copied: "הנוסח הועתק",
      brief: ["שלום, מבקש/ת לתאם טיסת כטב\"ם.", "מיקום: {coords}{near}", "אזורים: {zones}", "גובה מתוכנן: {alt}{ground}",
        "מועד: ________ עד ________", "שם המפעיל: ________ · טלפון: ________", "סוג הכלי ומשקל: ________"],
      nearCity: " (ליד {c})", altSel: "עד {a} מ' מעל הקרקע", altNone: "________ מ' מעל הקרקע",
      ground: " · גובה הקרקע כ-{g} מ' מעל פני הים",
      fine: "הפרטים נלקחו מהפמ\"ת ומהנוטאם כפי שהם מופיעים במפה. ייתכן שמספר השתנה – אם אין מענה, בדקו בפרסום המקורי."
    },
    en: {
      button: "Who do I call?", title: "Who to call – in order",
      none: "No zone requiring coordination was found at this point in the map data.",
      forZones: "For", andMore: "and {n} more", nearby: "nearby ({d} km)",
      call: "Call", mail: "Email", form: "Form / site", freq: "Frequency",
      noContact: "No coordination phone is published for this zone. Check the source:",
      fromNotam: "number found in the NOTAM text",
      notamNoContact: "The NOTAM text has no contact details. NOTAM source:",
      scheduled: "The zone is not active right now according to the data – verify before flying",
      ask: {
        ctr: "Approval from the ATC unit or the airstrip operator before flying",
        airfield: "Coordinate with the airport / airstrip operator",
        heliport: "Coordinate with the heliport operator",
        uasProhibited: "Written approval from the responsible body",
        prohibited: "Approval from the body responsible for the area",
        restricted: "Coordination and approval from the responsible body",
        danger: "Coordinate with the body operating the area",
        uas: "Coordinate the activity in the UAS flight area",
        nature: "Flight permit from the Nature and Parks Authority",
        notam: "Check with the body that published the closure",
        notamApprox: "Check with the body that published the closure"
      },
      details: "What the publication says",
      briefTitle: "What to have ready", briefCopy: "Copy text", briefShare: "Share", copied: "Text copied",
      brief: ["Hello, I would like to coordinate a UAS flight.", "Location: {coords}{near}", "Zones: {zones}", "Planned height: {alt}{ground}",
        "Time: ________ to ________", "Operator: ________ · phone: ________", "Aircraft type and weight: ________"],
      nearCity: " (near {c})", altSel: "up to {a} m above ground", altNone: "________ m above ground",
      ground: " · ground elevation about {g} m AMSL",
      fine: "Details are taken from the AIP and NOTAM as shown on the map. Numbers may change – if there is no answer, check the original publication."
    }
  };
  const t = (lang, k) => (TXT[lang] || TXT.he)[k] ?? TXT.he[k] ?? k;
  const PHONE_RE = /(?:\+972[-\s]?\d{1,2}|\b0\d{1,2})[-\s]?\d{3}[-\s]?\d{4}\b/g;

  /** zones: features at the point; near: [{f, d}] airfields close by; ctx: { layerKey, timeStatus, severity, L_ } */
  function build(zones, near, ctx) {
    const steps = [], byKey = new Map();
    function add(f, extra) {
      const p = f.properties, k = ctx.layerKey(f), sev = ctx.severity(k);
      const st = ctx.timeStatus(f);
      if (st === "inactive") return;
      let contacts = (p.contact || []).slice(), fromNotam = false;
      if (!contacts.length && p.notam && p.notam.raw) {
        const found = [...new Set((p.notam.raw.match(PHONE_RE) || []).map(s => s.replace(/\s+/g, "-")))];
        contacts = found.map(v => ({ type: "phone", value: v }));
        fromNotam = contacts.length > 0;
      }
      if (!contacts.length && sev < 2) return;
      // zones that share exactly the same contacts (e.g. many reserves -> one INPA form) become one step
      const key = contacts.length ? k + "|" + contacts.map(c => c.type + ":" + c.value).join("|") : "none|" + p.id;
      let s = byKey.get(key);
      if (!s) {
        s = { layer: k, sev, contacts, fromNotam, zones: [], remarks: p.remarks, source: p.source, isNotam: k === "notam" || k === "notamApprox", scheduled: st === "scheduled", near: extra && extra.d };
        byKey.set(key, s); steps.push(s);
      }
      s.zones.push(p);
      if (st !== "scheduled") s.scheduled = false;
    }
    zones.forEach(f => add(f));
    (near || []).forEach(x => { if (!zones.includes(x.f)) add(x.f, { d: x.d }); });
    // the airfield and its CTR/ATZ usually publish the same tower – keep the first
    const seen = new Set(), out = [];
    steps.sort((a, b) => (a.near != null) - (b.near != null) || b.sev - a.sev || (b.contacts.length > 0) - (a.contacts.length > 0));
    steps.forEach(s => {
      const sig = s.contacts.filter(c => c.type === "phone").map(c => c.value).sort().join(",");
      if (sig && seen.has(sig)) { const first = out.find(o => o.sig === sig); s.zones.forEach(z => first.zones.push(z)); return; }
      s.sig = sig; if (sig) seen.add(sig); out.push(s);
    });
    return { steps: out, count: out.length };
  }

  function buttonHtml(res, o) {
    if (!res.count) return "";
    return `<button class="btn wide wc-btn" type="button" data-act="wc" aria-expanded="${!!o.open}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1z"/></svg>
        <span>${o.esc(t(o.lang, "button"))}</span><b class="wc-n">${res.count}</b><i class="wx-caret">${o.open ? "▴" : "▾"}</i></button>
      <div id="wcBox" class="wc" ${o.open ? "" : "hidden"}>${o.open ? panelHtml(res, o) : ""}</div>`;
  }

  function contactBtn(c, o, fromNotam) {
    const L = o.lang, lab = c.label ? o.L_(c.label) : "";
    const v = o.esc(c.value);
    const sub = fromNotam ? `<small>${o.esc(t(L, "fromNotam"))}</small>` : (lab ? `<small>${o.esc(lab)}</small>` : "");
    if (c.type === "phone") return `<a class="wc-act wc-tel" dir="rtl" href="tel:${v.replace(/[^\d+]/g, "")}" data-wc="dial"><span>📞 ${o.esc(t(L, "call"))}</span><b class="mono" dir="ltr">${v}</b>${sub}</a>`;
    if (c.type === "email") return `<a class="wc-act" href="mailto:${v}" data-wc="mail"><span>✉ ${o.esc(t(L, "mail"))}</span><b class="mono" dir="ltr">${v}</b>${sub}</a>`;
    if (c.type === "url") return `<a class="wc-act" href="${v}" target="_blank" rel="noopener" data-wc="form"><span>🔗 ${o.esc(t(L, "form"))}</span>${sub}</a>`;
    return `<div class="wc-act wc-freq"><span>${o.esc(t(L, "freq"))}</span><b class="mono" dir="ltr">${v}</b>${sub}</div>`;
  }

  function panelHtml(res, o) {
    const L = o.lang;
    if (!res.count) return `<p class="muted">${o.esc(t(L, "none"))}</p>`;
    const steps = res.steps.map((s, i) => {
      const names = s.zones.slice(0, 3).map(z => o.esc(z.designator || o.L_(z.name))).join(", ") +
        (s.zones.length > 3 ? " " + o.esc(t(L, "andMore").replace("{n}", s.zones.length - 3)) : "");
      const lc = o.layers[s.layer] || {};
      const ask = (TXT[L] || TXT.he).ask[s.layer] || TXT.he.ask[s.layer] || "";
      let body;
      if (s.contacts.length) {
        const order = { phone: 0, url: 1, email: 2, freq: 3 };
        body = `<div class="wc-acts">${s.contacts.slice().sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9)).map(c => contactBtn(c, o, s.fromNotam)).join("")}</div>`;
      } else {
        const src = s.source && s.source.url ? `<a href="${o.esc(s.source.url)}" target="_blank" rel="noopener">${o.esc(o.L_(s.source.name))}</a>` : o.esc(o.L_(s.source && s.source.name));
        body = `<p class="wc-nocontact">${o.esc(t(L, s.isNotam ? "notamNoContact" : "noContact"))} ${src}</p>`;
      }
      const rem = s.remarks && o.L_(s.remarks) ? `<details class="wc-more"><summary>${o.esc(t(L, "details"))}</summary><p>${o.esc(o.L_(s.remarks))}</p></details>` : "";
      return `<li class="wc-step" style="--zc:${lc.color || "#888"}">
          <div class="wc-head"><b class="wc-i">${i + 1}</b><div><div class="wc-ask">${o.esc(ask)}</div>
            <div class="wc-for">${o.esc(t(L, "forZones"))}: <span>${names}</span>${s.near != null ? ` · ${o.esc(t(L, "nearby").replace("{d}", (s.near / 1000).toFixed(1)))}` : ""}</div>
            ${s.scheduled ? `<div class="wc-sched">${o.esc(t(L, "scheduled"))}</div>` : ""}</div></div>
          ${body}${rem}</li>`;
    }).join("");
    const share = typeof navigator !== "undefined" && navigator.share ? `<button class="btn" type="button" data-act="wcShare">↗ ${o.esc(t(L, "briefShare"))}</button>` : "";
    return `<h3 class="wc-title">${o.esc(t(L, "title"))}</h3><ol class="wc-steps">${steps}</ol>
      <div class="wc-brief"><b>${o.esc(t(L, "briefTitle"))}</b><pre id="wcBrief">${o.esc(o.brief)}</pre>
        <div class="wc-brief-acts"><button class="btn" type="button" data-act="wcCopy">⧉ ${o.esc(t(L, "briefCopy"))}</button>${share}</div></div>
      <p class="fine">${o.esc(t(L, "fine"))}</p>`;
  }

  /** x: { coords, city, zones:[names], altM, groundM } */
  function briefText(x, lang) {
    const T_ = TXT[lang] || TXT.he;
    return T_.brief.map(line => line
      .replace("{coords}", x.coords)
      .replace("{near}", x.city ? T_.nearCity.replace("{c}", x.city) : "")
      .replace("{zones}", x.zones.length ? x.zones.join(", ") : "—")
      .replace("{alt}", x.altM != null ? T_.altSel.replace("{a}", x.altM) : T_.altNone)
      .replace("{ground}", x.groundM != null ? T_.ground.replace("{g}", Math.round(x.groundM)) : "")).join("\n");
  }

  window.WhoCall = { build, buttonHtml, panelHtml, briefText, t };
})();
