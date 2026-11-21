// NOTAM list from the new IAA site, read in the owner's Chrome (Claude in Chrome, javascript_tool).
// Since 21.11.2026 brin.iaa.gov.il/aeroinfo/AeroInfo.aspx?msgType=Notam redirects to aeroinfo.iaa.gov.il/MainPage.
// Open the OLD url (opening aeroinfo.iaa.gov.il directly shows a block page), click "Notams", then run this.
// It sets Hours ahead = 99 (the site's maximum – larger values are blocked), unchecks "Non Active" (those are
// only expired NOTAMs), clicks the page's own Search button ONCE and keeps the GetNotams response.
// Set window.__NJ_EXPECT = 'YYYY-MM-DD' first when "Valid from" was changed in the date picker (search 2);
// the script then checks that the request really used that date. Typing into the date field does NOT work –
// pick the day by clicking it in the calendar.
// Result: window.__nj = {done, err, total, body, items:[{messageType, notamID, locationIndicator, messageText, createdDate}]}
window.__nj = {done: false, err: null, total: 0, items: []};
(async () => { try {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = t => [...document.querySelectorAll('button,input[type=button],input[type=submit]')]
    .find(x => (x.innerText || x.value || '').trim() === t);
  if (!/\/Notams/i.test(location.pathname)) {
    const b = btn('Notams'); if (!b) throw new Error('no Notams button (page: ' + location.href + ')');
    b.click(); await sleep(5000);
  }
  const ha = [...document.querySelectorAll('input[type=text]')][2];   // [calFrom, Location, Hours ahead]
  if (!ha) throw new Error('Hours ahead field not found');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(ha, '99');
  ha.dispatchEvent(new Event('input', {bubbles: true})); ha.dispatchEvent(new Event('change', {bubbles: true}));
  const na = document.getElementById('checkboxNonActive'); if (na && na.checked) na.click();
  for (const r of ['checkboxNorth', 'checkboxCenter', 'checkboxSouth']) { const c = document.getElementById(r); if (c && !c.checked) c.click(); }
  let body = null, text = null;
  const of = window.fetch;
  window.fetch = async function (u, o) {
    const r = await of.apply(this, arguments);
    try { if (String(u && u.url || u).includes('GetNotams')) { body = o && o.body; text = await r.clone().text(); } } catch (e) {}
    return r;
  };
  await sleep(500);
  const s = btn('Search'); if (!s) throw new Error('no Search button');
  s.click();
  for (let i = 0; i < 30 && text === null; i++) await sleep(1000);
  window.fetch = of;
  if (text === null) throw new Error('no GetNotams response');
  if (/Block ID|Not Supported|Radware/i.test(text.slice(0, 5000))) throw new Error('WAF block page');
  const q = JSON.parse(body || '{}');
  if (String(q.hoursAhead) !== '99' || q.nonActive !== false) throw new Error('filters not applied: ' + body);
  if (window.__NJ_EXPECT && !String(q.fromDate).startsWith(window.__NJ_EXPECT)) throw new Error('date not applied: ' + q.fromDate);
  const a = JSON.parse(text).map(x => ({messageType: x.messageType, notamID: x.notamID, locationIndicator: x.locationIndicator,
                                       messageText: x.messageText, createdDate: x.createdDate}));
  Object.assign(window.__nj, {items: a, total: a.length, body, done: true});
} catch (e) { window.__nj.err = String(e); window.__nj.done = true; } })();
'started'

// EXPORT (javascript_tool output is cut at ~1,000 characters and base64 is refused, so copy via the page text):
// 1. run:  const m=document.querySelector('main')||document.body, p=document.createElement('pre');
//          p.textContent='NJSTART'+JSON.stringify(__nj.items)+'NJEND\n'+'filler line to force file output\n'.repeat(900);
//          m.innerHTML=''; m.appendChild(p); p.textContent.length
// 2. call get_page_text on the tab – the result is saved to a file (the filler makes it big enough);
//    take the JSON between NJSTART and NJEND with Python (json.load(file)[0]['text']).
