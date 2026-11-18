// opens the LIVE page (WebAssembly mode), starts a game and plays the first steps
const cdp = require('./cdp');
const url = process.argv[2] || 'https://siddhu2606.github.io/slugbound/';
(async () => {
  const p = await cdp.open(url + '?quality=low', { w: 960, h: 540, wait: 14000 });
  console.log('mode:', await p.eval("Engine.mode"), '| title text:', await p.eval("document.getElementById('titleFoot').textContent"));
  await p.shot('build/live_title.png');
  await p.eval("document.getElementById('btnNew').click()");
  await p.sleep(7000);
  console.log('zone:', await p.eval("__game.zone && __game.zone.name"), '| mode', await p.eval("__game.mode"));
  console.log('state ok:', await p.eval("(async()=>{const r=await Engine.call('/state'); return r.ok+' '+r.state.zoneName})()"));
  console.log('move:', await p.eval("(async()=>{const r=await Engine.call('/move',{dir:'right'}); return r.ok+' moved='+r.moved})()"));
  console.log('save:', await p.eval("(async()=>{const r=await Engine.call('/save'); const l=await Engine.call('/load'); return r.ok+' '+l.ok+' hasSave='+Engine.hasSave()})()"));
  await p.shot('build/live_game.png');
  console.log(p.logs.filter((l) => !/BJS/.test(l)).slice(0, 10).join('\n'));
  await p.close();
})();
