export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  for (let i = 0; i < 8; i++) {
    await g.sleep(1000);
    const info = await g.ev(() => ({ cine: !!document.querySelector('#cine'), cineText: document.querySelector('#cine')?.innerText?.slice(0, 80), fade: window.__obi.G.fade, mode: window.__obi.G.mode, dlg: !!document.querySelector('#dialogue') }));
    g.log(JSON.stringify(info));
  }
  await g.shot('dbg1');
}
