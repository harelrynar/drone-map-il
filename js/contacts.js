/* =========================================================
 * 1.14 – השלמת פרטי קשר חסרים
 * Fills in contact details for zones / NOTAMs that publish none.
 *
 * רץ פעם אחת בדפדפן אחרי טעינת הנתונים (גם על הנוטאמים היומיים, בלי לשנות את ה-pipeline).
 * לכל אזור שאין לו p.contact נוצר p.contactAlt = [{ items, basis, src, ref }]:
 *   1. CTR/ATZ  → פרטי הקשר של שדה התעופה / המנחת עם אותו קוד (LLHZ CTR → שדה הרצליה).
 *   2. נוטאם    → מספר טלפון בנוסח; קוד שדה שמוזכר בנוסח (…WI LLHZ TRG AREA → הרצליה).
 *   3. מיקום    → ה-CTR/ATZ שמרכז האזור נמצא בתוכו (ב'-09 §7ד: אישור יחידת הנת"א).
 *   4. נוסח     → "משרד נוטאם"/"סגירה אווירית" → משרד נוטאם (א'-11); "שטח אש"/"גורם צבאי" → מתא"מ
 *                 לפי אזור (א'-17 §1א); "רצועת עזה" → סנכרון חה"א (א'-17 §4); "מנחת מגידו" וכו'.
 *   5. ברירת מחדל לפי סוג: P/R/D → בקשת חריגה לרת"א (א'-17 §5); אזור כטב"ם → טלפוני יחידות הנת"א
 *      (א'-07); נוטאם → משרד הנוטאם.
 * כל קבוצה מסומנת "מידע משלים" עם הסבר ומקור. מספרים מגיעים רק מ-data/contacts.json או מנתוני המפה.
 *
 * Contacts.enrich(features, dir, Geo) -> stats   ·   Contacts.cardHtml(p, o)   ·   Contacts.flat(p, L_)
 * ========================================================= */
(function (root) {
  "use strict";
  const TXT = {
    he: {
      ctrOf: "פרטי הקשר של {ad} – טיסת כטב\"ם בתחום ה-CTR/ATZ דורשת אישור יחידת הנת\"א או מפעיל המנחת (ב'-09 סעיף 7ד)",
      notamPhone: "מספר שמופיע בנוסח הנוטאם",
      notamAd: "הנוטאם מתייחס ל-{code} ({ad})",
      inside: "האזור נמצא בתוך {ctr} – טיסת כטב\"ם בתחומו דורשת אישור יחידת הנת\"א (ב'-09 סעיף 7ד)",
      notamOffice: "לפי הנוסח נדרשת בקשה לסגירה / למשרד נוטאם – הכתובות לפי א'-11",
      iaf7: "בקשה שדורשת אישור חה\"א מוגשת למשרד נוטאם, לפחות 7 ימי עבודה מראש (א'-11)",
      matam: "שטח אש / פעילות צבאית – תיאום מול המתא\"מ האזורי (א'-17 סעיף 1א, לפי מיקום האזור בקירוב)",
      gaza: "קרבה לגבול – בקשות לכטב\"ם וטיסן מאושרות ע\"י סנכרון חיל האוויר בלבד (א'-17 סעיף 4)",
      megiddo: "הנוסח מחייב תיאום עם מפעיל מנחת מגידו",
      bgTwr: "הנוסח מחייב תיאום עם מגדל נתב\"ג",
      reserve: "שמורת טבע – גם אישור טיסה מרשות הטבע והגנים",
      fpl: "הנוסח מפנה למודיעין טיס (א'-11)",
      caai: "אין גורם מתאם בפרסום – בקשה לטיסה החורגת מהמגבלה מופנית לרת\"א (א'-17 סעיף 5)",
      caaiFirst: "אזור אסור – בקשה לטיסה החורגת מהמגבלה מופנית לרת\"א (א'-17 סעיף 5); הגורמים שלמטה לא מחליפים אותה",
      milRel: "הפמ\"ת מפנה ל'גורם הצבאי הרלוונטי (פרק א'-11)'; הגורם הצבאי שמופיע בא'-11 הוא המתא\"מ – לפי מיקום האזור, בקירוב",
      uasAtc: "תחילת פעילות דורשת אישור יחידת הנת\"א הרלוונטית; הטלפונים בפמ\"ת א'-07 סעיף 10 (ב'-09)",
      notamPub: "בנוסח אין פרטי קשר – הנוטאם פורסם ע\"י משרד הנוטאם של רש\"ת",
      badge: "מידע משלים", src: "מקור",
      why: "לא מופיע בפרסום של האזור עצמו – הושלם לפי הכלל שמתואר. ודאו לפני הטיסה."
    },
    en: {
      ctrOf: "Contacts of {ad} – UAS flight in the CTR/ATZ needs approval of the ATS unit or the airstrip operator (B-09 §7d)",
      notamPhone: "Number found in the NOTAM text",
      notamAd: "The NOTAM refers to {code} ({ad})",
      inside: "The area lies inside {ctr} – UAS flight there needs ATS approval (B-09 §7d)",
      notamOffice: "The text requires a closure request / the NOTAM office – addresses per A-11",
      iaf7: "Requests needing IAF approval go to the NOTAM office, at least 7 working days ahead (A-11)",
      matam: "Firing area / military activity – coordinate with the regional training centre (A-17 §1a, by approximate location)",
      gaza: "Near the border – UAS requests are approved by IAF sync only (A-17 §4)",
      megiddo: "The text requires coordination with the Megiddo airstrip operator",
      bgTwr: "The text requires coordination with Ben Gurion tower",
      reserve: "Nature reserve – also a Nature and Parks Authority flight permit",
      fpl: "The text refers to the flight plans office (A-11)",
      caai: "No coordinating body is published – exception requests go to the CAAI (A-17 §5)",
      caaiFirst: "Prohibited area – exception requests go to the CAAI (A-17 §5); the bodies below do not replace it",
      milRel: "The AIP refers to 'the relevant military authority (A-11)'; the military body listed in A-11 is the regional training centre – by approximate location",
      uasAtc: "Starting activity needs approval of the relevant ATS unit; phones in AIP A-07 §10 (B-09)",
      notamPub: "No contact in the text – the NOTAM was published by the IAA NOTAM office",
      badge: "Supplementary", src: "Source",
      why: "Not in the zone's own publication – derived by the rule shown. Verify before flying."
    }
  };
  const PHONE_RE = /(?:\+972[-\s]?\d{1,2}|\b0\d{1,2})[-\s]?\d{3}[-\s]?\d{4}\b/g;
  const tx = (k, vars) => {
    const o = {};
    ["he", "en"].forEach(l => { let s = TXT[l][k]; Object.entries(vars || {}).forEach(([a, b]) => { s = s.split("{" + a + "}").join(typeof b === "object" ? b[l] || b.he : b); }); o[l] = s; });
    return o;
  };

  /* A-17 §1a regions: Beersheba and south / Beersheba–Hadera / Hadera and north (excl. Golan) / Golan */
  function matamKey(lat, lon) {
    if (lon > 35.62 && lat > 32.65) return "matamGolan";
    if (lat <= 31.26) return "matamSouth";
    if (lat <= 32.44) return "matamCentral";
    return "matamNorth";
  }
  function bboxArea(f) {
    const g = f.geometry; if (!g) return Infinity;
    if (g.type === "Point") { const r = (f.properties.radius_m || 0) / 111000; return 4 * r * r; }
    const pts = g.type === "Polygon" ? g.coordinates[0] : g.coordinates.flatMap(p => p[0]);
    let a = 180, b = -180, c = 90, d = -90;
    pts.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); });
    return (b - a) * (d - c);
  }

  function enrich(features, dir, Geo) {
    const stats = { total: 0, direct: 0, derived: 0, none: 0, rules: {} };
    if (!dir || !dir.units) return stats;
    const S = dir.sources || {};
    const srcOf = k => S[k] ? { name: S[k].name, url: S[k].url } : null;
    const byId = new Map(features.map(f => [f.properties.id, f]));
    const has = p => (p.contact && p.contact.length) || (p.contactAlt && p.contactAlt.length);
    const itemsOf = p => (p.contact && p.contact.length) ? p.contact : (p.contactAlt || []).flatMap(g => g.items);
    const unitGroup = (key, basis, rule) => {
      const u = dir.units[key]; if (!u) return null;
      return { rule, basis, ref: u.ref, src: srcOf(u.src), items: u.items.map(i => Object.assign({ label: u.name }, i)) };
    };
    const featGroup = (f2, basis, rule) => ({ rule, basis, src: f2.properties.source || null, items: itemsOf(f2.properties).map(i => Object.assign({}, i)) });
    const add = (p, g) => {
      if (!g || !g.items.length) return;
      p.contactAlt = p.contactAlt || [];
      const seen = new Set(p.contactAlt.flatMap(x => x.items.map(i => i.value)));
      if (g.items.every(i => seen.has(i.value))) return;
      p.contactAlt.push(g);
    };
    const adByCode = new Map();
    features.forEach(f => { const p = f.properties; if ((p.layer === "airfield" || p.layer === "heliport") && p.designator && !adByCode.has(p.designator)) adByCode.set(p.designator, f); });
    features.forEach(f => { delete f.properties.contactAlt; });

    // 1a. airfields without contacts – only what their own text points to
    features.forEach(f => {
      const p = f.properties; if (p.layer !== "airfield" || has(p)) return;
      if (/מודיעין טיס/.test((p.remarks && p.remarks.he) || "")) add(p, unitGroup("fpl", tx("fpl"), "text-fpl"));
    });
    // 1b. CTR / ATZ / CTA → the airfield with the same code
    features.forEach(f => {
      const p = f.properties; if (p.layer !== "ctr" || has(p) || !p.designator) return;
      const code = p.designator.split(/\s+/)[0];
      const ad = dir.ctrAlias && dir.ctrAlias[code] ? byId.get(dir.ctrAlias[code]) : adByCode.get(code);
      if (ad && has(ad.properties)) add(p, featGroup(ad, tx("ctrOf", { ad: ad.properties.name }), "ctr-airfield"));
    });
    // CTRs that now have a contact, smallest first (for rule 3)
    const ctrs = features.filter(f => f.properties.layer === "ctr" && has(f.properties) && f.geometry)
      .map(f => ({ f, a: bboxArea(f) })).sort((x, y) => x.a - y.a);

    features.forEach(f => {
      const p = f.properties;
      if (p.layer === "nature") return;
      if (p.contact && p.contact.length) return;
      if (p.layer === "airfield" || p.layer === "heliport" || p.layer === "ctr") { if (has(p)) return; }
      const isNotam = !!p.notam;
      const text = [p.name && p.name.he, p.remarks && p.remarks.he].filter(Boolean).join(" · ");
      // 2. NOTAM text: phone numbers, then aerodrome codes
      if (isNotam && p.notam.raw) {
        const ph = [...new Set((p.notam.raw.match(PHONE_RE) || []).map(s => s.replace(/\s+/g, "-")))];
        if (ph.length) add(p, { rule: "notam-phone", basis: tx("notamPhone"), src: p.source, items: ph.map(v => ({ type: "phone", value: v })) });
        const e = p.notam.raw.split(/\bE\)/)[1] || "";
        [...new Set(e.match(/\bLL[A-Z]{2}\b/g) || [])].filter(c => c !== "LLLL" && c !== "LLLB").forEach(code => {
          const ad = adByCode.get(code);
          if (ad && has(ad.properties)) add(p, featGroup(ad, tx("notamAd", { code, ad: ad.properties.name }), "notam-aerodrome"));
        });
      }
      // 3. inside a CTR/ATZ with contacts
      if (f.geometry && p.layer !== "ctr") {
        const c = Geo.featureCenter(f);
        const hit = ctrs.find(x => x.f !== f && Geo.contains(x.f, c[0], c[1]));
        if (hit) add(p, featGroup(hit.f, tx("inside", { ctr: hit.f.properties.name }), "inside-ctr"));
      }
      // 4. what the text says
      if (/משרד נוטאם|סגירה אווירית/.test(text)) add(p, unitGroup("notamOffice", tx("notamOffice"), "text-notam-office"));
      if (/לחה"א.*7 ימי עבודה/.test(text)) add(p, unitGroup("notamOffice", tx("iaf7"), "text-iaf7"));
      if (/שט(ח|חי) אש|הגורם הצבאי הרלוונטי/.test(text) && f.geometry) {
        const c = Geo.featureCenter(f), mil = /הגורם הצבאי הרלוונטי/.test(text);
        add(p, unitGroup(matamKey(c[0], c[1]), tx(mil ? "milRel" : "matam"), mil ? "text-military" : "text-matam"));
      }
      if (/רצועת עזה|מגבול (לבנון|סוריה|מצרים|ירדן)/.test(text)) add(p, unitGroup("iafSync", tx("gaza"), "text-border"));
      if (/מנחת מגידו/.test(text) && adByCode.get("LLMG")) add(p, featGroup(adByCode.get("LLMG"), tx("megiddo"), "text-megiddo"));
      if (/מגדל נתב"ג/.test(text)) add(p, unitGroup("atcBgTwr", tx("bgTwr"), "text-bg"));
      if (/מודיעין טיס/.test(text)) add(p, unitGroup("fpl", tx("fpl"), "text-fpl"));
      if (/שמורת (ה)?טבע/.test(text) && !isNotam) {
        const nat = features.find(x => x.properties.layer === "nature" && x.properties.contact && x.properties.contact.length);
        if (nat) add(p, { rule: "text-reserve", basis: tx("reserve"), src: nat.properties.source, items: nat.properties.contact.map(i => Object.assign({}, i)) });
      }
      // 5. defaults by type (only when nothing else was found)
      if (!(p.contactAlt && p.contactAlt.length)) {
        if (["prohibited", "restricted", "danger"].includes(p.layer)) add(p, unitGroup("caaiExceptions", tx("caai"), "default-caai"));
        else if (p.layer === "uas" || p.layer === "ctr") { if (dir.a07Link) add(p, { rule: "default-a07", basis: tx("uasAtc"), src: srcOf("A07"), ref: "א'-07 §10", items: [Object.assign({}, dir.a07Link)] }); }
        else if (isNotam) add(p, unitGroup("notamOffice", tx("notamPub"), "default-notam"));
      }
      // a tower or a reserve permit does not lift a prohibited zone – the exception request (A-17 §5) comes first,
      // unless the text named the approving body (military / IAF / NOTAM office)
      const named = (p.contactAlt || []).some(g => /^text-(matam|military|border|iaf7|notam-office)$/.test(g.rule));
      if (p.layer === "prohibited" && !named && !(p.contactAlt || []).some(g => g.rule === "default-caai")) {
        p.contactAlt = p.contactAlt || [];
        p.contactAlt.unshift(unitGroup("caaiExceptions", tx(p.contactAlt.length ? "caaiFirst" : "caai"), "default-caai"));
      }
    });

    features.forEach(f => {
      const p = f.properties; if (p.layer === "nature") return;
      stats.total++;
      if (p.contact && p.contact.length) stats.direct++;
      else if (p.contactAlt && p.contactAlt.length) { stats.derived++; p.contactAlt.forEach(g => { stats.rules[g.rule] = (stats.rules[g.rule] || 0) + 1; }); }
      else stats.none++;
    });
    return stats;
  }

  /** all derived items, each labelled (for "who do I call") */
  function flat(p) {
    return (p.contactAlt || []).flatMap(g => g.items.map(i => Object.assign({ basis: g.basis }, i)));
  }

  /** the contact row of a zone card. o: { lang, esc, L_, itemHtml } */
  function cardHtml(p, o) {
    const T_ = TXT[o.lang] || TXT.he;
    if (!(p.contactAlt && p.contactAlt.length)) return "";
    return `<div class="calt"><span class="calt-badge" title="${o.esc(T_.why)}">🔶 ${o.esc(T_.badge)}</span>` +
      p.contactAlt.map(g => {
        const src = g.src ? `<small class="calt-src">${o.esc(T_.src)}: ${g.src.url ? `<a href="${o.esc(g.src.url)}" target="_blank" rel="noopener">${o.esc(o.L_(g.src.name))}</a>` : o.esc(o.L_(g.src.name))}</small>` : "";
        return `<div class="calt-g"><div class="calt-basis">${o.esc(o.L_(g.basis))}</div><div class="calt-items">${g.items.map(o.itemHtml).join("<br>")}</div>${src}</div>`;
      }).join("") + `<p class="calt-why">${o.esc(T_.why)}</p></div>`;
  }

  root.Contacts = { enrich, flat, cardHtml, matamKey, TXT };
})(typeof window !== "undefined" ? window : globalThis);
