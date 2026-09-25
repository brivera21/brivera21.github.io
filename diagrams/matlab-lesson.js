/* Wires an Intro to MATLAB lesson page to the sandbox in matlab-sim.js.
   The page defines window.LESSON = {panels, setup, startCwd, editorFile, tasks}. */
(function(){
  const L = window.LESSON || {};
  const host = document.getElementById('sim');
  if(!host || !window.MatlabSim) return;

  const frame = document.createElement('div'); frame.className = 'simframe';
  const bar = document.createElement('div'); bar.className = 'simbar';
  bar.innerHTML = '<span><b>Practice MATLAB</b> · a small copy of the MATLAB desktop</span>';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Start over';
  bar.append(reset);
  const box = document.createElement('div');
  frame.append(bar, box); host.append(frame);

  let sim;
  function start(){
    box.innerHTML = '';
    sim = window.MatlabSim.mount(box, {
      panels: L.panels, setup: L.setup, startCwd: L.startCwd, editorFile: L.editorFile,
      tasks: L.tasks, tasksEl: document.getElementById('tasks'), greeting: L.greeting
    });
    window.__sim = sim;
  }
  start();
  reset.addEventListener('click', start);

  /* every <pre class="try"> becomes lines with a Run button; <pre class="try block"> runs as one unit */
  const narrow = () => matchMedia('(max-width:1060px)').matches;
  function runIt(src){
    if(narrow()) host.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    sim.run(src);
  }
  document.querySelectorAll('pre.try').forEach(pre => {
    const raw = pre.textContent.replace(/^\n+|\s+$/g, '');
    const wrap = document.createElement('div'); wrap.className = 'try';
    const units = pre.classList.contains('block') ? [raw] : raw.split('\n');
    units.forEach(u => {
      const row = document.createElement('div'); row.className = 'tl';
      const m = pre.classList.contains('block') ? null : /^(.*?)\s{2,}#\s*(.+)$/.exec(u);   // "code  # note" puts a note under the line
      const code = document.createElement('code'); code.textContent = m ? m[1] : u;
      if(m){ const n = document.createElement('span'); n.className = 'note'; n.textContent = m[2]; code.append(n); }
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Run';
      btn.setAttribute('aria-label', 'Run ' + (m ? m[1] : u).split('\n')[0] + ' in the practice window');
      btn.addEventListener('click', () => runIt(m ? m[1] : u));
      row.append(code, btn); wrap.append(row);
    });
    pre.replaceWith(wrap);
  });
})();
