export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SKS Dashboard</title>
  <style>
    :root {
      --bg:#0d1117; --card:#161b22; --line:#30363d; --text:#e6edf3; --muted:#8b949e;
      --run:#3fb950; --fail:#f85149; --queue:#8b949e; --verify:#58a6ff; --warn:#d29922;
    }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    header { display:grid; grid-template-columns: 1fr auto; gap:16px; align-items:center; padding:18px 22px; border-bottom:1px solid var(--line); background:#0b1016; position:sticky; top:0; z-index:2; }
    h1 { margin:0; font-size:16px; font-weight:700; letter-spacing:0; }
    .meta { color:var(--muted); margin-top:4px; display:flex; gap:12px; flex-wrap:wrap; }
    .badge { display:inline-flex; align-items:center; min-height:28px; padding:0 10px; border:1px solid var(--line); background:var(--card); color:var(--muted); }
    .badge.pass { color:var(--run); border-color:rgba(63,185,80,.55); }
    .badge.fail { color:var(--fail); border-color:rgba(248,81,73,.55); }
    main { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:18px; padding:18px; }
    .strip { display:grid; grid-template-columns:repeat(6,minmax(92px,1fr)); gap:10px; margin-bottom:14px; }
    .metric { border:1px solid var(--line); background:var(--card); padding:10px; min-height:64px; }
    .metric b { display:block; font-size:20px; color:var(--text); }
    .metric span { color:var(--muted); font-size:12px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
    .slot { border:1px solid var(--line); border-left:4px solid var(--queue); background:var(--card); min-height:136px; padding:12px; overflow:hidden; }
    .slot.running { border-left-color:var(--run); }
    .slot.verifying { border-left-color:var(--verify); }
    .slot.completed { border-left-color:var(--run); opacity:.86; }
    .slot.failed { border-left-color:var(--fail); }
    .slot h2 { margin:0 0 8px; font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .row { display:flex; justify-content:space-between; gap:8px; color:var(--muted); font-size:12px; min-width:0; }
    .model { color:var(--verify); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:110px; }
    .task { margin-top:10px; min-height:38px; color:var(--text); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .bar { height:6px; background:#0b1016; border:1px solid var(--line); margin-top:12px; overflow:hidden; }
    .bar i { display:block; height:100%; width:0; background:var(--verify); transition:width .25s ease; }
    aside { display:grid; gap:14px; align-content:start; }
    section { border-top:1px solid var(--line); padding-top:12px; }
    section h2 { margin:0 0 10px; font-size:13px; }
    .feed, .gates { display:grid; gap:8px; }
    .event, .gate { background:var(--card); border:1px solid var(--line); padding:9px; color:var(--muted); min-height:34px; overflow-wrap:anywhere; }
    .gate.pass { color:var(--run); }
    .gate.fail { color:var(--fail); }
    .pulse { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--run); margin-right:7px; animation:pulse 1.6s infinite; }
    @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
    @media (max-width: 900px) { main { grid-template-columns:1fr; } .strip { grid-template-columns:repeat(2,minmax(0,1fr)); } header { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1><span class="pulse"></span><span id="mission">SKS mission</span></h1>
      <div class="meta"><span id="route">route</span><span id="elapsed">00:00</span><span id="updated">waiting</span></div>
    </div>
    <div id="gateBadge" class="badge">● proof pending</div>
  </header>
  <main>
    <div>
      <div class="strip" id="strip"></div>
      <div class="grid" id="slots"></div>
    </div>
    <aside>
      <section><h2>Events</h2><div class="feed" id="events"></div></section>
      <section><h2>Gates</h2><div class="gates" id="gates"></div></section>
    </aside>
  </main>
  <script>
    const state = { started: Date.now() };
    function render(payload) {
      const data = payload && payload.snapshot ? payload : { snapshot: payload };
      const snapshot = data.snapshot || {};
      const gates = data.gates || [];
      const events = data.events || [];
      const slots = Object.values(snapshot.slots || {});
      document.getElementById('mission').textContent = snapshot.mission_id || data.mission_id || 'latest';
      document.getElementById('route').textContent = data.route || snapshot.route || 'SKS';
      document.getElementById('elapsed').textContent = elapsed(state.started);
      document.getElementById('updated').textContent = snapshot.updated_at || data.ts || 'waiting';
      const blocked = gates.some(g => g.ok === false);
      const passed = gates.length > 0 && gates.every(g => g.ok !== false);
      const badge = document.getElementById('gateBadge');
      badge.className = 'badge ' + (blocked ? 'fail' : passed ? 'pass' : '');
      badge.textContent = blocked ? '✖ blocked' : passed ? '✔ gate passed' : '● proof pending';
      const counts = snapshot.counts || {};
      const spawned = slots.length;
      document.getElementById('strip').innerHTML = [
        ['run', counts.running || 0], ['verify', counts.verifying || 0], ['queue', counts.queued || 0],
        ['done', counts.completed || 0], ['fail', counts.failed || 0], ['spawned', spawned]
      ].map(([k,v]) => '<div class="metric"><b>'+v+'</b><span>'+k+'</span></div>').join('');
      document.getElementById('slots').innerHTML = slots.map(slot => {
        const status = String(slot.status || 'queued');
        const progress = slot.progress && slot.progress.total ? Math.max(0, Math.min(100, Math.round(slot.progress.done / slot.progress.total * 100))) : (status === 'completed' ? 100 : 0);
        return '<article class="slot '+status+'"><h2>'+esc(slot.slot_id || slot.worker_id || 'slot')+'</h2>'
          + '<div class="row"><span>'+esc(slot.role || 'worker')+'</span><span class="model">'+esc(slot.model || slot.provider || slot.backend || slot.service_tier || '')+'</span></div>'
          + '<div class="row"><span>'+esc(status)+'</span><span>'+esc(slot.latest_event_type || '')+'</span></div>'
          + '<div class="task">'+esc(slot.task_title || slot.current_file || slot.log_tail || '')+'</div>'
          + '<div class="bar"><i style="width:'+progress+'%"></i></div></article>';
      }).join('') || '<div class="event">No live slots yet.</div>';
      document.getElementById('events').innerHTML = events.slice(-30).reverse().map(e => '<div class="event">'+esc((e.ts || '')+' '+(e.type || e.event_type || e.event || 'event'))+'</div>').join('') || '<div class="event">No events yet.</div>';
      document.getElementById('gates').innerHTML = gates.map(g => '<div class="gate '+(g.ok===false?'fail':'pass')+'">'+esc((g.ok===false?'✖ ':'✔ ')+(g.id || g.file || 'gate')+(g.missing&&g.missing.length?' missing '+g.missing.join(', '):''))+'</div>').join('') || '<div class="gate">No gate snapshot yet.</div>';
    }
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function elapsed(ms) { const s = Math.max(0, Math.floor((Date.now()-ms)/1000)); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
    fetch('/api/state').then(r => r.json()).then(render).catch(()=>{});
    const source = new EventSource('/events' + location.search);
    source.onmessage = (event) => render(JSON.parse(event.data));
    setInterval(() => { document.getElementById('elapsed').textContent = elapsed(state.started); }, 1000);
  </script>
</body>
</html>`;
