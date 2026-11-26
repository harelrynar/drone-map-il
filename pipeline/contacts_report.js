// 1.14 – דוח כיסוי פרטי קשר: מריץ את js/contacts.js על הנתונים ומדפיס מה הושלם ומה נשאר ריק.
// usage: node pipeline/contacts_report.js [--list]      (מתיקיית השורש של המאגר)
const fs = require("fs"), path = require("path");
global.window = global;
const R = p => path.join(__dirname, "..", p);
eval(fs.readFileSync(R("js/geo.js"), "utf8"));
eval(fs.readFileSync(R("js/contacts.js"), "utf8"));
const zones = JSON.parse(fs.readFileSync(R("data/zones.json"))).features;
const notams = JSON.parse(fs.readFileSync(R("data/notams.json"))).located.features;
const dir = JSON.parse(fs.readFileSync(R("data/contacts.json")));
const feats = zones.concat(notams);
const st = window.Contacts.enrich(feats, dir, window.Geo);
console.log(`אזורים (בלי שמורות): ${st.total} · עם פרטי קשר מהמקור: ${st.direct} · הושלמו: ${st.derived} · בלי כלום: ${st.none}`);
console.log("כללים:", JSON.stringify(st.rules));
if (process.argv.includes("--list")) {
  feats.forEach(f => {
    const p = f.properties;
    if (p.layer === "nature" || (p.contact && p.contact.length)) return;
    const g = p.contactAlt || [];
    console.log(`\n${p.layer} | ${p.designator || p.id} | ${p.name.he}`);
    if (!g.length) console.log("   — אין");
    g.forEach(x => console.log(`   [${x.rule}] ${x.basis.he}\n      ${x.items.map(i => (i.label ? (i.label.he || i.label) + ": " : "") + i.value).join(" · ")}`));
  });
}
