/* ============================================================================
   matlab-sim.js: a small MATLAB-like sandbox for the Intro to MATLAB lessons.

   It covers the part of the language the lessons use: numbers, char and string
   text, arrays and matrices (column-major, 1-based), structs and struct arrays,
   1-by-n cell arrays, for / if / while, user function files, the Current Folder,
   the search path, and a handful of EEGLAB functions that act on simulated data.
   It is a teaching model, not MATLAB. Messages follow MATLAB's wording where the
   lessons depend on it.

   MatlabCore(opts) -> an interpreter with no DOM.
   MatlabSim.mount(el, opts) -> the desktop UI (Current Folder, Command Window,
   Workspace, optional Editor and Path panels, and a task checklist).
   ========================================================================== */
(function(root){
'use strict';

/* ---------------------------------------------------------------- values -- */
class MErr extends Error{ constructor(msg, id){ super(msg); this.mid = id || ''; } }
const err = (m, id) => { throw new MErr(m, id); };

const FILT = Symbol('filtered');   // hidden marker: this dataset went through pop_eegfiltnew
function mkNum(r, c, d, lg){ return {t:'num', r, c, d: d || new Float64Array(r*c), lg: !!lg}; }
function scalar(x){ const v = mkNum(1,1); v.d[0] = x; return v; }
function logical(x){ const v = mkNum(1,1,null,true); v.d[0] = x ? 1 : 0; return v; }
function rowVec(arr){ return mkNum(1, arr.length, Float64Array.from(arr)); }
function colVec(arr){ return mkNum(arr.length, 1, Float64Array.from(arr)); }
function empty(){ return mkNum(0,0); }
function mkChar(s){ return {t:'char', r: s.length ? 1 : 0, c: s.length, s}; }
function mkStr(s){ return {t:'str', r:1, c:1, s}; }
function mkCell(a, r, c){ return {t:'cell', r: r === undefined ? (a.length ? 1 : 0) : r, c: c === undefined ? a.length : c, a}; }
function mkStruct(a){ return {t:'struct', r: a.length ? 1 : 0, c: a.length, a}; }
function numelOf(v){ return v.t === 'str' ? 1 : v.r * v.c; }
function isScalarNum(v){ return v.t === 'num' && v.r === 1 && v.c === 1; }
function classOf(v){
  if(v.t === 'num') return v.lg ? 'logical' : 'double';
  return {char:'char', str:'string', cell:'cell', struct:'struct', fh:'function_handle'}[v.t];
}
function toNumber(v, what){
  if(v.t === 'num'){ if(v.r*v.c !== 1) err(`${what || 'Value'} must be a single number.`); return v.d[0]; }
  if(v.t === 'char' && v.c === 1) return v.s.charCodeAt(0);
  err(`${what || 'Value'} must be a number, not ${classOf(v)}.`);
}
function toText(v, what){
  if(v.t === 'char') return v.s;
  if(v.t === 'str') return v.s;
  err(`${what || 'Input'} must be text (a char vector in single quotes or a string in double quotes).`);
}
/* char to its character codes, the way MATLAB does arithmetic on text */
function asNum(v){
  if(v.t === 'num') return v;
  if(v.t === 'char'){ const o = mkNum(v.r, v.c); for(let i=0;i<v.c;i++) o.d[i] = v.s.charCodeAt(i); return o; }
  return null;
}
function copyVal(v){
  if(v.t === 'num') return mkNum(v.r, v.c, Float64Array.from(v.d), v.lg);
  if(v.t === 'cell') return mkCell(v.a.map(copyVal), v.r, v.c);
  if(v.t === 'struct'){ const o = mkStruct(v.a.map(rec => { const n = {}; for(const k in rec) n[k] = copyVal(rec[k]); if(rec[FILT]) n[FILT] = rec[FILT]; return n; })); o.r = v.r; o.c = v.c; return o; }
  return Object.assign({}, v);
}
function sizeStr(v){ return v.t === 'str' ? '1×1' : `${v.r}×${v.c}`; }
function bytesOf(v){
  if(v.t === 'num') return v.r*v.c*(v.lg ? 1 : 8);
  if(v.t === 'char') return 2*v.c;
  if(v.t === 'str') return 150 + 2*v.s.length;
  if(v.t === 'cell') return v.a.reduce((s,x) => s + 112 + bytesOf(x), 0);
  if(v.t === 'struct') return v.a.reduce((s,rec) => s + Object.keys(rec).reduce((t,k) => t + 112 + bytesOf(rec[k]), 0), 176);
  return 8;
}

/* ------------------------------------------------------------ formatting -- */
function fmtShort(x){
  if(Number.isNaN(x)) return 'NaN';
  if(x === Infinity) return 'Inf'; if(x === -Infinity) return '-Inf';
  if(Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
  const a = Math.abs(x);
  if(a !== 0 && (a >= 1e5 || a < 1e-3)){ const [m, e] = x.toExponential(4).split('e'); const ee = +e; return `${m}e${ee < 0 ? '-' : '+'}${String(Math.abs(ee)).padStart(2,'0')}`; }
  return x.toFixed(4);
}
function numRows(v, maxCols){
  const allInt = Array.prototype.every.call(v.d, x => Number.isInteger(x) || !Number.isFinite(x));
  const cells = []; let w = 0;
  const cols = Math.min(v.c, maxCols);
  for(let i=0;i<v.r;i++){ const row = []; for(let j=0;j<cols;j++){ const s = v.lg ? String(v.d[j*v.r+i]) : fmtShort(v.d[j*v.r+i]); row.push(s); w = Math.max(w, s.length); } cells.push(row); }
  const width = v.lg ? Math.max(3, w+2) : allInt ? Math.max(6, w+3) : Math.max(10, w+3);
  return cells.map(row => row.map(s => s.padStart(width)).join(''));
}
function inlineVal(v){       // one-line summary used in struct displays and the Workspace panel
  if(v.t === 'num'){
    if(v.r*v.c === 0) return '[]';
    if(v.r === 1 && v.c === 1) return v.lg ? (v.d[0] ? 'true' : 'false') : fmtShort(v.d[0]);
    if(v.r === 1 && v.c <= 8) return '[' + Array.from(v.d, x => v.lg ? String(x) : fmtShort(x)).join(' ') + ']';
    return `[${v.r}×${v.c} ${classOf(v)}]`;
  }
  if(v.t === 'char') return v.c <= 60 ? `'${v.s}'` : `[1×${v.c} char]`;
  if(v.t === 'str') return `"${v.s}"`;
  if(v.t === 'cell') return v.r*v.c === 0 ? '{}' : `{${v.r}×${v.c} cell}`;
  if(v.t === 'struct') return `[${v.r}×${v.c} struct]`;
  return '?';
}
function wsValue(v){
  if(v.t === 'cell' && v.c <= 3 && v.a.every(x => x.t === 'char' && x.c < 14)) return '{' + v.a.map(x => `'${x.s}'`).join(', ') + '}';
  if(v.t === 'struct' && v.r*v.c === 1) return `1×1 struct`;
  const s = inlineVal(v);
  return s.replace(/^\[(\d+×\d+ \w+)\]$/, '$1');
}
function cellElemStr(x){
  if(x.t === 'char') return `{'${x.s}'}`;
  if(x.t === 'str') return `{["${x.s}"]}`;
  if(x.t === 'num' && x.r*x.c === 1) return `{[${fmtShort(x.d[0])}]}`;
  return `{${sizeStr(x)} ${classOf(x)}}`;
}
function display(name, v){
  const head = name ? `${name} =` : '';
  const out = [];
  if(v.t === 'num'){
    if(v.r*v.c === 0){ out.push(head + (head ? '\n\n' : '') + '     []'); }
    else{
      const MAXC = 10;
      out.push(head);
      if(head) out.push('');
      if(v.lg){ out.push('  logical'); out.push(''); }
      if(v.c > MAXC){ out.push(`  Columns 1 through ${MAXC}`); out.push(''); }
      numRows(v, MAXC).forEach(r => out.push(r));
      if(v.c > MAXC){ out.push(''); out.push(`  (the sandbox stops here; ${v.r}×${v.c} ${classOf(v)} has ${v.c - MAXC} more columns)`); }
    }
  }else if(v.t === 'char'){
    if(v.c === 0) out.push(`${head}\n\n  0×0 empty char array`);
    else { out.push(head); if(head) out.push(''); out.push(`    '${v.s}'`); }
  }else if(v.t === 'str'){
    out.push(head ? `${name} = ` : ''); if(head) out.push(''); out.push(`    "${v.s}"`);
  }else if(v.t === 'cell'){
    if(v.r*v.c === 0) out.push(`${head}\n\n  0×0 empty cell array`);
    else {
      out.push(head); if(head) out.push(''); out.push(`  ${v.r}×${v.c} cell array`); out.push('');
      const cells = v.a.map(cellElemStr);
      if(v.c === 1 && v.r > 1){ const w = Math.max(...cells.map(x => x.length)); cells.forEach(x => out.push('    ' + x.replace(/}$/, '').padEnd(w-1) + '}')); }
      else if(cells.length <= 8) out.push('    ' + cells.join('    '));
      else { for(let k=0; k<cells.length; k+=8){ const e = Math.min(cells.length, k+8); out.push(`  Columns ${k+1} through ${e}`); out.push(''); out.push('    ' + cells.slice(k, e).join('    ')); if(e < cells.length) out.push(''); } }
    }
  }else if(v.t === 'struct'){
    out.push(head ? `${name} = ` : ''); if(head) out.push('');
    if(v.r*v.c === 1){
      out.push('  struct with fields:'); out.push('');
      const rec = v.a[0], keys = Object.keys(rec), w = Math.max(0, ...keys.map(k => k.length));
      keys.forEach(k => out.push('    ' + k.padStart(w) + ': ' + inlineVal(rec[k])));
    }else if(v.r*v.c === 0){ out.push('  0×0 empty struct array with no fields.'); }
    else{
      out.push(`  ${v.r}×${v.c} struct array with fields:`); out.push('');
      Object.keys(v.a[0] || {}).forEach(k => out.push('    ' + k));
    }
  }
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------- tokenizer -- */
const KEYWORDS = new Set(['for','end','if','elseif','else','while','break','continue','function','return']);
const VALUE_END = t => t && (t.t === 'num' || t.t === 'id' || t.t === 'char' || t.t === 'str' || (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}' || t.v === "'" || t.v === ".'")) || (t.t === 'kw' && t.v === 'end'));
function tokenize(src, cmdWords){
  const toks = []; let i = 0, line = 1;
  const stack = [];                        // open brackets, so spaces inside [ ] and { } separate elements
  const inList = () => stack.length && (stack[stack.length-1] === '[' || stack[stack.length-1] === '{');
  const atStmtStart = () => { if(stack.length) return false; const p = toks[toks.length-1]; return !p || p.t === 'nl' || (p.t === 'op' && (p.v === ';' || p.v === ',')); };
  const push = (t, v, extra) => { const tk = Object.assign({t, v, line}, extra); toks.push(tk); return tk; };
  while(i < src.length){
    const ch = src[i];
    if(ch === '.' && src.startsWith('...', i)){ while(i < src.length && src[i] !== '\n') i++; i++; line++; continue; }  // line continuation
    if(ch === ' ' || ch === '\t' || ch === '\r'){
      let j = i; while(j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      if(inList()){
        const prev = toks[toks.length-1], nx = src[j], nx2 = src[j+1];
        const startsValue = nx !== undefined && (/[A-Za-z0-9_.'"(\[{~@]/.test(nx) || ((nx === '-' || nx === '+') && nx2 !== ' ' && nx2 !== '\t'));
        const isOpNext = /[*\/\\^=<>&|,;\]\}]/.test(nx) || (nx === '.' && /[*\/\\^']/.test(nx2)) || (nx === "'" && false);
        if(VALUE_END(prev) && startsValue && !isOpNext) push('op', ',', {auto:true});
      }
      i = j; continue;
    }
    if(ch === '\n'){ if(!stack.length || stack[stack.length-1] === '[' || stack[stack.length-1] === '{'){ if(inList()){ push('op', ';', {auto:true}); } else push('nl', '\n'); } i++; line++; continue; }
    if(ch === '%'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    /* command syntax: clc, clear x, cd data, addpath eeglab2025.1, help mean ... */
    if(/[A-Za-z]/.test(ch) && atStmtStart()){
      const m = /^[A-Za-z]\w*/.exec(src.slice(i))[0];
      const after = src.slice(i + m.length);
      if(cmdWords && cmdWords(m)){
        const rest = /^[ \t]*/.exec(after)[0], nxt = after[rest.length];
        const nxt2 = after[rest.length+1];
        const isCmd = nxt === undefined || nxt === '\n' || nxt === ';' || nxt === ',' || nxt === '%' ||
          (rest.length > 0 && nxt !== '=' && nxt !== '(' && !(nxt2 === '=' && /[=<>~]/.test(nxt)));
        if(isCmd){
          let j = i + m.length, argsRaw = '';
          while(j < src.length && !/[\n;,%]/.test(src[j])) { argsRaw += src[j]; j++; }
          const args = []; const re = /'((?:[^']|'')*)'|"([^"]*)"|(\S+)/g; let mm;
          while((mm = re.exec(argsRaw))) args.push(mm[1] !== undefined ? mm[1].replace(/''/g,"'") : mm[2] !== undefined ? mm[2] : mm[3]);
          push('cmd', m, {args});
          i = j; continue;
        }
      }
    }
    if(/[A-Za-z]/.test(ch)){
      const m = /^[A-Za-z]\w*/.exec(src.slice(i))[0];
      push(KEYWORDS.has(m) ? 'kw' : 'id', m); i += m.length; continue;
    }
    if(/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i+1] || ''))){
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))[0];
      push('num', parseFloat(m)); i += m.length; continue;
    }
    if(ch === "'"){
      const prev = toks[toks.length-1];
      const prevAdj = i > 0 && !/\s/.test(src[i-1]);
      if(VALUE_END(prev) && (prevAdj || !inList())){ push('op', "'"); i++; continue; }
      let j = i+1, s = '';
      while(true){
        if(j >= src.length || src[j] === '\n') err('Character vector is not terminated properly.');
        if(src[j] === "'"){ if(src[j+1] === "'"){ s += "'"; j += 2; continue; } break; }
        s += src[j]; j++;
      }
      push('char', s); i = j+1; continue;
    }
    if(ch === '"'){
      let j = i+1, s = '';
      while(true){
        if(j >= src.length || src[j] === '\n') err('String is not terminated properly.');
        if(src[j] === '"'){ if(src[j+1] === '"'){ s += '"'; j += 2; continue; } break; }
        s += src[j]; j++;
      }
      push('str', s); i = j+1; continue;
    }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if(two === '.*' || two === './' || two === '.^' || two === ".'" || two === '==' || two === '~=' || two === '<=' || two === '>=' || two === '&&' || two === '||'){ push('op', two); i += 2; continue; }
    if(ch === '(' || ch === '[' || ch === '{'){ stack.push(ch); push('op', ch); i++; continue; }
    if(ch === ')' || ch === ']' || ch === '}'){
      const open = {')':'(', ']':'[', '}':'{'}[ch];
      if(stack[stack.length-1] !== open) err(`Invalid expression. When calling a function or indexing a variable, use parentheses. Otherwise, check for mismatched delimiters.`);
      stack.pop(); push('op', ch); i++; continue;
    }
    if('+-*/\\^=<>&|~!,;:.@'.includes(ch)){ push('op', ch === '!' ? '~' : ch); i++; continue; }
    err(`Invalid text character. Check for unsupported symbol, invisible character, or pasting of non-ASCII characters.`);
  }
  if(stack.length) err(`Invalid expression. Check for missing or extra characters, such as a missing closing ${ {'(':')','[':']','{':'}'}[stack[stack.length-1]] }.`);
  push('nl', '\n');
  return toks;
}

/* ---------------------------------------------------------------- parser -- */
function Parser(toks){ this.t = toks; this.i = 0; }
Parser.prototype = {
  peek(k){ return this.t[this.i + (k||0)]; },
  next(){ return this.t[this.i++]; },
  isOp(v, k){ const t = this.peek(k); return t && t.t === 'op' && t.v === v; },
  isKw(v){ const t = this.peek(); return t && t.t === 'kw' && t.v === v; },
  expectOp(v){ if(!this.isOp(v)) this.fail(); return this.next(); },
  fail(){
    const t = this.peek();
    if(!t || t.t === 'nl') err('Invalid expression. Check for missing or extra characters.');
    err(`Invalid expression. Check for missing multiplication operator, missing or unbalanced delimiters, or other syntax error.`);
  },
  skipSeps(){ while(this.peek() && (this.peek().t === 'nl' || this.isOp(';') || this.isOp(','))) this.next(); },
  program(){ const body = this.block([]); if(this.peek()){ const t = this.peek(); if(t.t === 'kw') err(`Illegal use of reserved keyword "${t.v}".`); this.fail(); } return body; },
  block(stops){
    const out = [];
    while(true){
      this.skipSeps();
      const t = this.peek();
      if(!t) break;
      if(t.t === 'kw' && stops.includes(t.v)) break;
      const st = this.statement();
      /* terminator decides echo */
      const nx = this.peek();
      st.silent = !!(nx && nx.t === 'op' && nx.v === ';');
      if(nx && !(nx.t === 'nl' || (nx.t === 'op' && (nx.v === ';' || nx.v === ','))) && !(nx.t === 'kw' && stops.includes(nx.v))){
        if(nx.t === 'kw' && nx.v === 'end') err('Illegal use of reserved keyword "end".');
        if(nx.t === 'op' && nx.v === '=') err("Incorrect use of '=' operator. To assign a value to a variable, use '='. To compare values for equality, use '=='. (A name cannot contain a hyphen or a space.)");
        this.fail();
      }
      if(nx && nx.t === 'op' && (nx.v === ';' || nx.v === ',')) this.next();
      out.push(st);
    }
    return out;
  },
  statement(){
    const t = this.peek(), line = t.line;
    if(t.t === 'cmd'){ this.next(); return {k:'cmd', name:t.v, args:t.args, line}; }
    if(t.t === 'kw'){
      if(t.v === 'for'){
        this.next();
        const paren = this.isOp('(');
        if(paren) this.next();
        const v = this.next(); if(!v || v.t !== 'id') err('Invalid use of "for": expected a loop variable name, as in for i = 1:10.');
        this.expectOp('=');
        const range = this.expr();
        if(paren) this.expectOp(')');
        const body = this.block(['end']);
        if(!this.isKw('end')) err('At least one END is missing: the statement may begin here.');
        this.next();
        return {k:'for', v:v.v, range, body, line};
      }
      if(t.v === 'while'){
        this.next(); const cond = this.expr(); const body = this.block(['end']);
        if(!this.isKw('end')) err('At least one END is missing: the statement may begin here.');
        this.next(); return {k:'while', cond, body, line};
      }
      if(t.v === 'if'){
        this.next(); const arms = []; let cond = this.expr(); let body = this.block(['elseif','else','end']); arms.push({cond, body});
        let other = null;
        while(this.isKw('elseif')){ this.next(); cond = this.expr(); body = this.block(['elseif','else','end']); arms.push({cond, body}); }
        if(this.isKw('else')){ this.next(); other = this.block(['end']); }
        if(!this.isKw('end')) err('At least one END is missing: the statement may begin here.');
        this.next(); return {k:'if', arms, other, line};
      }
      if(t.v === 'break' || t.v === 'continue' || t.v === 'return'){ this.next(); return {k:t.v, line}; }
      if(t.v === 'function') err('Function definitions go in their own file. Use the Editor to write a function and save it as a .m file.');
      err(`Illegal use of reserved keyword "${t.v}".`);
    }
    /* [a, b] = f(...) */
    if(this.isOp('[')){
      let j = this.i + 1, depth = 1;
      while(j < this.t.length && depth){ const k = this.t[j]; if(k.t === 'op' && (k.v === '[' || k.v === '(' || k.v === '{')) depth++; if(k.t === 'op' && (k.v === ']' || k.v === ')' || k.v === '}')) depth--; j++; }
      const after = this.t[j];
      if(after && after.t === 'op' && after.v === '='){
        this.next(); const targets = [];
        while(!this.isOp(']')){
          if(this.isOp(',')){ this.next(); continue; }
          if(this.isOp('~')){ this.next(); targets.push(null); continue; }
          targets.push(this.lvalue());
        }
        this.next(); this.expectOp('=');
        const rhs = this.expr();
        return {k:'massign', targets, rhs, line};
      }
    }
    /* x = ..., x(2) = ..., s.f = ... */
    if(t.t === 'id'){
      const save = this.i;
      try{
        const lv = this.lvalue();
        if(this.isOp('=') && !this.isOp('=',1)){ this.next(); const rhs = this.expr(); return {k:'assign', target:lv, rhs, line}; }
      }catch(e){ if(!(e instanceof MErr)) throw e; }
      this.i = save;
    }
    const e = this.expr();
    return {k:'expr', e, line};
  },
  lvalue(){
    const id = this.next(); if(!id || id.t !== 'id') this.fail();
    const chain = [];
    while(true){
      if(this.isOp('(')){ this.next(); chain.push({k:'paren', args:this.argList(')')}); continue; }
      if(this.isOp('{')){ this.next(); chain.push({k:'brace', args:this.argList('}')}); continue; }
      if(this.isOp('.') && this.peek(1) && this.peek(1).t === 'id'){ this.next(); chain.push({k:'field', name:this.next().v}); continue; }
      break;
    }
    return {name:id.v, chain};
  },
  argList(close){
    const args = [];
    if(this.isOp(close)){ this.next(); return args; }
    while(true){
      if(this.isOp(':') && (this.isOp(',',1) || this.isOp(close,1))){ this.next(); args.push({k:'colonAll'}); }
      else args.push(this.expr());
      if(this.isOp(',')){ this.next(); continue; }
      if(this.isOp(close)){ this.next(); break; }
      this.fail();
    }
    return args;
  },
  expr(){ return this.oror(); },
  oror(){ let a = this.andand(); while(this.isOp('||')){ this.next(); a = {k:'bin', op:'||', a, b:this.andand()}; } return a; },
  andand(){ let a = this.or(); while(this.isOp('&&')){ this.next(); a = {k:'bin', op:'&&', a, b:this.or()}; } return a; },
  or(){ let a = this.and(); while(this.isOp('|')){ this.next(); a = {k:'bin', op:'|', a, b:this.and()}; } return a; },
  and(){ let a = this.cmp(); while(this.isOp('&')){ this.next(); a = {k:'bin', op:'&', a, b:this.cmp()}; } return a; },
  cmp(){ let a = this.range(); while(['==','~=','<','>','<=','>='].some(o => this.isOp(o))){ const op = this.next().v; a = {k:'bin', op, a, b:this.range()}; } return a; },
  range(){
    let a = this.add();
    if(this.isOp(':')){ this.next(); const b = this.add(); if(this.isOp(':')){ this.next(); const c = this.add(); return {k:'range', a, step:b, b:c}; } return {k:'range', a, b}; }
    return a;
  },
  add(){ let a = this.mul(); while(this.isOp('+') || this.isOp('-')){ const op = this.next().v; a = {k:'bin', op, a, b:this.mul()}; } return a; },
  mul(){ let a = this.unary(); while(['*','/','.*','./','\\'].some(o => this.isOp(o))){ const op = this.next().v; a = {k:'bin', op, a, b:this.unary()}; } return a; },
  unary(){
    if(this.isOp('-')){ this.next(); return {k:'neg', a:this.unary()}; }
    if(this.isOp('+')){ this.next(); return this.unary(); }
    if(this.isOp('~')){ this.next(); return {k:'not', a:this.unary()}; }
    return this.power();
  },
  power(){
    let a = this.postfix();
    while(this.isOp('^') || this.isOp('.^')){ const op = this.next().v; let b; if(this.isOp('-')){ this.next(); b = {k:'neg', a:this.postfix()}; } else b = this.postfix(); a = {k:'bin', op, a, b}; }
    return a;
  },
  postfix(){
    let a = this.primary();
    while(true){
      if(this.isOp("'") || this.isOp(".'")){ this.next(); a = {k:'transpose', a}; continue; }
      break;
    }
    return a;
  },
  primary(){
    const t = this.next();
    if(!t) this.fail();
    if(t.t === 'num') return {k:'num', v:t.v};
    if(t.t === 'char') return {k:'char', v:t.v};
    if(t.t === 'str') return {k:'str', v:t.v};
    if(t.t === 'kw' && t.v === 'end') return {k:'endkw'};
    if(t.t === 'op' && t.v === '('){ const e = this.expr(); this.expectOp(')'); return {k:'group', e}; }
    if(t.t === 'op' && (t.v === '[' || t.v === '{')){
      const close = t.v === '[' ? ']' : '}', rows = [[]];
      while(!this.isOp(close)){
        if(this.isOp(',')){ this.next(); continue; }
        if(this.isOp(';')){ this.next(); rows.push([]); continue; }
        if(this.peek() && this.peek().t === 'nl'){ this.next(); rows.push([]); continue; }
        rows[rows.length-1].push(this.expr());
      }
      this.next();
      return {k: t.v === '[' ? 'matrix' : 'cellLit', rows: rows.filter((r, i) => r.length || i === 0)};
    }
    if(t.t === 'op' && t.v === '@'){ this.fail(); }
    if(t.t === 'id'){
      let node = {k:'id', name:t.v, chain:[]};
      while(true){
        if(this.isOp('(')){ this.next(); node.chain.push({k:'paren', args:this.argList(')')}); continue; }
        if(this.isOp('{')){ this.next(); node.chain.push({k:'brace', args:this.argList('}')}); continue; }
        if(this.isOp('.') && this.peek(1) && this.peek(1).t === 'id'){ this.next(); node.chain.push({k:'field', name:this.next().v}); continue; }
        break;
      }
      return node;
    }
    if(t.t === 'kw') err(`Illegal use of reserved keyword "${t.v}".`);
    this.i--; this.fail();
  }
};

/* --------------------------------------------------------------- helpers -- */
const EPS = 1e-10;
function broadcast(a, b, f, lg){
  if(a.r*a.c === 1){ const o = mkNum(b.r, b.c, null, lg); for(let i=0;i<o.d.length;i++) o.d[i] = f(a.d[0], b.d[i]); return o; }
  if(b.r*b.c === 1){ const o = mkNum(a.r, a.c, null, lg); for(let i=0;i<o.d.length;i++) o.d[i] = f(a.d[i], b.d[0]); return o; }
  if(a.r === b.r && a.c === b.c){ const o = mkNum(a.r, a.c, null, lg); for(let i=0;i<o.d.length;i++) o.d[i] = f(a.d[i], b.d[i]); return o; }
  err(`Arrays have incompatible sizes for this operation.`);
}
function colonRange(lo, step, hi){
  if(step === 0 || (step > 0 && lo > hi) || (step < 0 && lo < hi)) return mkNum(1, 0);
  const n = Math.floor((hi - lo)/step + EPS) + 1;
  if(n > 5e6) err('Requested array exceeds the size the sandbox allows.');
  const o = mkNum(1, n); for(let i=0;i<n;i++){ const x = lo + i*step; o.d[i] = Math.abs(x - Math.round(x)) < EPS*Math.max(1,Math.abs(x)) ? Math.round(x) : x; } return o;
}
function truthy(v){
  if(v.t === 'num'){ if(v.r*v.c === 0) return false; for(const x of v.d) if(!x) return false; return true; }
  if(v.t === 'char') return v.c > 0 && [...v.s].every(c => c.charCodeAt(0) !== 0);
  err(`Conditional expressions need a logical or numeric value, not ${classOf(v)}.`);
}
function transpose(v){
  if(v.t === 'num'){ const o = mkNum(v.c, v.r, null, v.lg); for(let i=0;i<v.r;i++) for(let j=0;j<v.c;j++) o.d[i*v.c + j] = v.d[j*v.r + i]; return o; }
  if(v.t === 'char'){ if(v.c <= 1) return v; err('The sandbox only keeps text as rows; transposing a char vector is not supported here.'); }
  if(v.t === 'str') return v;
  if(v.t === 'cell'){ return mkCell(v.a.slice(), v.c, v.r); }
  err(`Transpose is not supported for ${classOf(v)}.`);
}
/* index vector from an argument; `extent` is the size along that dimension (for ':' and logicals) */
function indexList(arg, extent){
  if(arg === ':' ) { const a = new Array(extent); for(let i=0;i<extent;i++) a[i] = i+1; return a; }
  if(arg.t === 'num' && arg.lg){ const a = []; for(let i=0;i<arg.d.length;i++) if(arg.d[i]){ if(i >= extent) err(`The logical indices contain a true value outside of the array bounds.`); a.push(i+1); } return a; }
  if(arg.t === 'char' && arg.s === ':'){ return indexList(':', extent); }
  if(arg.t !== 'num') err('Array indices must be positive integers or logical values.');
  const a = Array.from(arg.d);
  for(const x of a) if(!(x >= 1) || !Number.isInteger(x)) err(x === 0 ? 'Index in position 1 is invalid. Array indices must be positive integers or logical values.' : 'Array indices must be positive integers or logical values.');
  return a;
}
function sliceShape(src, arg, n){ // result shape for linear indexing
  if(arg === ':') return [n, 1];
  const isVecSrc = src.r === 1 || src.c === 1;
  if(isVecSrc && arg.r*arg.c !== 0 && (arg.r === 1 || arg.c === 1)) return src.r === 1 ? [1, n] : [n, 1];
  if(arg.lg) return src.r === 1 ? [1, n] : [n, 1];
  return [arg.r, arg.c];
}

/* EEG-style simulated data, deterministic per subject */
function makeRng(seed){ let s = seed >>> 0; return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; }; }
const CHANS = ['Fp1','Fp2','F7','F3','Fz','F4','F8','FC5','FC1','FC2','FC6','T7','C3','Cz','C4','T8','CP5','CP1','CP2','CP6','P7','P3','Pz','P4','P8','PO7','PO3','POz','PO4','PO8','O1','O2'];

/* ============================================================ MatlabCore == */
function MatlabCore(opts){
  opts = opts || {};
  const HOME = '/Users/student';
  const USERPATH = HOME + '/Documents/MATLAB';
  const EEGLAB_DIR = USERPATH + '/eeglab2025.1';
  const listeners = [];
  const S = {
    W: new Map(),              // base workspace
    cwd: opts.cwd || USERPATH,
    path: [USERPATH],          // user part of the search path (MATLAB's own toolboxes are implied)
    fs: null,
    hist: [],
    lastErr: null,
    eeglabStarted: false,
    ansCount: 0
  };

  /* ------------------------------------------------------ file system -- */
  function dir(){ return {type:'dir', kids:{}}; }
  function file(extra){ return Object.assign({type:'file', bytes: 1024}, extra || {}); }
  function buildFS(){
    const fs = dir();
    const mk = (p) => { let n = fs; for(const part of p.split('/').filter(Boolean)){ n.kids[part] = n.kids[part] || dir(); n = n.kids[part]; } return n; };
    mk(HOME + '/Desktop'); mk(HOME + '/Downloads');
    const um = mk(USERPATH);
    const eg = mk(EEGLAB_DIR);
    eg.kids['eeglab.m'] = file({fn:'eeglab', bytes: 98311});
    eg.kids['README.md'] = file({bytes: 4412});
    const fdirs = {'functions/popfunc':['pop_loadset','pop_saveset','pop_eegfiltnew','pop_select','pop_epoch','pop_reref','pop_rmbase'],
      'functions/adminfunc':['eeg_checkset','eeg_options'], 'functions/sigprocfunc':['eegfilt','runica'], 'functions/guifunc':['pop_chansel'],
      'functions/miscfunc':[], 'plugins/firfilt':['firfilt'], 'plugins/ERPLAB':['erplab'], 'sample_data':[]};
    for(const d in fdirs){ const n = mk(EEGLAB_DIR + '/' + d); fdirs[d].forEach(f => n.kids[f + '.m'] = file({fn:f, bytes: 8000})); }
    mk(EEGLAB_DIR + '/sample_data').kids['eeglab_data.set'] = file({eeg:{subj:0}, bytes: 1180000});
    const course = mk(USERPATH + '/psych390');
    const data = mk(USERPATH + '/psych390/data');
    ['sub-01','sub-02','sub-03'].forEach((s, k) => { data.kids[s + '.set'] = file({eeg:{subj:k+1}, bytes: 340512}); data.kids[s + '.fdt'] = file({bytes: 3840000}); });
    mk(USERPATH + '/psych390/scripts').kids['lab1_explore.m'] = file({bytes: 640, text: "% Lab 1: explore one dataset\nEEG = pop_loadset('filename', 'sub-01.set', 'filepath', 'data');\nsize(EEG.data)\n"});
    course.kids['notes.txt'] = file({bytes: 210});
    (opts.extraFiles || []).forEach(([p, f]) => { const parts = p.split('/'); const name = parts.pop(); mk(parts.join('/')).kids[name] = file(f); });
    return fs;
  }
  S.fs = buildFS();
  function norm(p){
    const parts = []; for(const x of p.split('/')){ if(!x || x === '.') continue; if(x === '..'){ parts.pop(); continue; } parts.push(x); }
    return '/' + parts.join('/');
  }
  function resolve(p){
    p = String(p).replace(/\\/g, '/');
    if(p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
    if(!p.startsWith('/')) p = S.cwd + '/' + p;
    return norm(p);
  }
  function node(abs){ let n = S.fs; for(const part of abs.split('/').filter(Boolean)){ if(!n || n.type !== 'dir' || !n.kids[part]) return null; n = n.kids[part]; } return n; }
  function baseName(p){ return p.split('/').filter(Boolean).pop() || '/'; }
  function short(abs){ return abs.startsWith(HOME) ? '~' + abs.slice(HOME.length) : abs; }
  function mtime(){ return new Date().toLocaleString('en-US', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}).replace(',', ''); }

  /* where a function file named `name` would be found: current folder first, then the path in order */
  function findFile(name){
    const cand = [S.cwd, ...S.path];
    for(const d of cand){ const n = node(d); if(n && n.type === 'dir' && n.kids[name + '.m']) return {dir:d, file:n.kids[name + '.m']}; }
    return null;
  }

  /* ------------------------------------------------------ output -- */
  let outFn = () => {};
  function print(s, cls){ outFn(s, cls || ''); }
  function emit(ev){ listeners.forEach(f => f(ev)); }

  /* ------------------------------------------------------ builtins -- */
  const B = {};
  const BUILTIN_HELP = {};
  const def = (names, fn, help) => { names.split(' ').forEach(n => { B[n] = fn; if(help) BUILTIN_HELP[n] = help; }); };

  const numArg = (v, name) => { const n = asNum(v); if(!n) err(`Invalid data type. First argument must be numeric or logical.`); return n; };
  const elem = f => (args) => { if(args.length !== 1) err('Incorrect number of input arguments.'); const x = numArg(args[0]); const o = mkNum(x.r, x.c); for(let i=0;i<o.d.length;i++) o.d[i] = f(x.d[i]); return [o]; };
  def('abs', elem(Math.abs)); def('sqrt', elem(Math.sqrt)); def('floor', elem(Math.floor)); def('ceil', elem(Math.ceil));
  def('exp', elem(Math.exp)); def('log', elem(Math.log)); def('sin', elem(Math.sin)); def('cos', elem(Math.cos));
  def('round', (a) => { const x = numArg(a[0]); const k = a[1] ? toNumber(a[1]) : 0; const p = Math.pow(10, k); const o = mkNum(x.r, x.c); for(let i=0;i<o.d.length;i++){ const v = x.d[i]*p; o.d[i] = Math.sign(v)*Math.round(Math.abs(v))/p; } return [o]; },
    'round(x) rounds to the nearest whole number. round(x, 2) keeps two decimals.');
  def('mod', (a) => [broadcast(numArg(a[0]), numArg(a[1]), (x,y) => y === 0 ? x : x - Math.floor(x/y)*y)], 'mod(a, b) is the remainder after dividing a by b.');
  def('rem', (a) => [broadcast(numArg(a[0]), numArg(a[1]), (x,y) => x - Math.trunc(x/y)*y)]);
  def('pi', () => [scalar(Math.PI)], 'pi is 3.14159...');
  def('true', () => [logical(1)]); def('false', () => [logical(0)]);
  def('NaN nan', () => [scalar(NaN)]); def('Inf inf', () => [scalar(Infinity)]);
  function reduceDim(a, fname, f, nargout){
    const x = numArg(a[0]);
    let dim = a[1] ? toNumber(a[1], 'Dimension') : (x.r !== 1 ? 1 : 2);
    if(x.r*x.c === 0) return [fname === 'sum' ? scalar(0) : empty()];
    if(dim === 1){ const o = mkNum(1, x.c), ix = mkNum(1, x.c); for(let j=0;j<x.c;j++){ const col = x.d.subarray(j*x.r, (j+1)*x.r); const [v, k] = f(col); o.d[j] = v; ix.d[j] = k+1; } return [o, ix]; }
    if(dim === 2){ const o = mkNum(x.r, 1), ix = mkNum(x.r, 1); const row = new Float64Array(x.c); for(let i=0;i<x.r;i++){ for(let j=0;j<x.c;j++) row[j] = x.d[j*x.r + i]; const [v, k] = f(row); o.d[i] = v; ix.d[i] = k+1; } return [o, ix]; }
    err('Dimension argument must be 1 or 2 in the sandbox.');
  }
  const R = {
    sum: c => [c.reduce((s,v) => s+v, 0), 0],
    mean: c => [c.reduce((s,v) => s+v, 0)/c.length, 0],
    max: c => { let b = -Infinity, k = 0; c.forEach((v,i) => { if(v > b){ b = v; k = i; } }); return [b, k]; },
    min: c => { let b = Infinity, k = 0; c.forEach((v,i) => { if(v < b){ b = v; k = i; } }); return [b, k]; },
    std: c => { const m = c.reduce((s,v) => s+v, 0)/c.length; return [Math.sqrt(c.reduce((s,v) => s+(v-m)**2, 0)/Math.max(1, c.length-1)), 0]; }
  };
  for(const k in R) def(k, (a, n) => {
    if(!a.length) err('Not enough input arguments.');
    if((k === 'max' || k === 'min') && a.length >= 2 && !(a[1].t === 'num' && a[1].r*a[1].c === 0)) return [broadcast(numArg(a[0]), numArg(a[1]), k === 'max' ? Math.max : Math.min)];
    const dimArg = (k === 'max' || k === 'min') ? a[2] : a[1];
    return reduceDim([a[0], dimArg], k, R[k], n);
  }, {sum:'sum(x) adds up the elements. sum(A, 2) adds across each row.', mean:'mean(x) is the average. mean(A, 2) averages across columns, one value per row; for EEG.data that is one mean per channel.', max:'m = max(x) is the largest value. [m, i] = max(x) also returns where it is.', min:'m = min(x) is the smallest value. [m, i] = min(x) also returns where it is.', std:'std(x) is the standard deviation.'}[k]);
  def('size', (a, n) => {
    if(!a.length) err('Not enough input arguments.');
    const v = a[0], r = v.t === 'str' ? 1 : v.r, c = v.t === 'str' ? 1 : v.c;
    if(a[1]){ const d = toNumber(a[1]); return [scalar(d === 1 ? r : d === 2 ? c : 1)]; }
    if(n >= 2) return [scalar(r), scalar(c)];
    return [rowVec([r, c])];
  }, 'size(x) returns [rows, columns]. size(x, 1) is the number of rows; size(x, 2) the number of columns.');
  def('numel', (a) => [scalar(numelOf(a[0]))], 'numel(x) is the total number of elements.');
  def('length', (a) => { const v = a[0]; const n = numelOf(v); return [scalar(n === 0 ? 0 : v.t === 'str' ? 1 : Math.max(v.r, v.c))]; }, 'length(x) is the size of the longest dimension.');
  def('isempty', (a) => [logical(numelOf(a[0]) === 0)], 'isempty(x) is true if x has no elements.');
  def('zeros ones', null);
  B.zeros = (a) => fill(a, 0); B.ones = (a) => fill(a, 1);
  BUILTIN_HELP.zeros = 'zeros(r, c) makes an r-by-c matrix of zeros. zeros(n) is n-by-n.'; BUILTIN_HELP.ones = 'ones(r, c) makes an r-by-c matrix of ones.';
  function fill(a, val){ const r = a.length ? toNumber(a[0]) : 1, c = a.length > 1 ? toNumber(a[1]) : r; if(r*c > 5e6) err('Requested array exceeds the size the sandbox allows.'); const o = mkNum(r, c); o.d.fill(val); return [o]; }
  let rs = makeRng(7);
  def('rand', (a) => { const [o] = fill(a, 0); for(let i=0;i<o.d.length;i++) o.d[i] = rs(); return [o]; }, 'rand(r, c) makes an r-by-c matrix of random numbers between 0 and 1.');
  def('randn', (a) => { const [o] = fill(a, 0); for(let i=0;i<o.d.length;i++) o.d[i] = Math.sqrt(-2*Math.log(rs()+1e-12))*Math.cos(2*Math.PI*rs()); return [o]; });
  def('linspace', (a) => { const lo = toNumber(a[0]), hi = toNumber(a[1]), n = a[2] ? toNumber(a[2]) : 100; const o = mkNum(1, n); for(let i=0;i<n;i++) o.d[i] = n === 1 ? hi : lo + (hi-lo)*i/(n-1); return [o]; }, 'linspace(a, b, n) makes n evenly spaced numbers from a to b.');
  def('find', (a) => { const x = numArg(a[0]); const idx = []; x.d.forEach((v,i) => { if(v) idx.push(i+1); }); return [x.r === 1 ? rowVec(idx) : colVec(idx)]; }, 'find(x) returns the positions of the nonzero (true) elements.');
  def('any', (a) => [logical(Array.prototype.some.call(numArg(a[0]).d, v => v !== 0))]);
  def('all', (a) => [logical(Array.prototype.every.call(numArg(a[0]).d, v => v !== 0))]);
  def('class', (a) => [mkChar(classOf(a[0]))], 'class(x) tells you what kind of value x holds: double, char, string, cell, struct, logical.');
  def('isnumeric', (a) => [logical(a[0].t === 'num' && !a[0].lg)]); def('ischar', (a) => [logical(a[0].t === 'char')]);
  def('isstring', (a) => [logical(a[0].t === 'str')]); def('iscell', (a) => [logical(a[0].t === 'cell')]);
  def('isstruct', (a) => [logical(a[0].t === 'struct')]); def('islogical', (a) => [logical(a[0].t === 'num' && a[0].lg)]);
  def('num2str', (a) => { const x = numArg(a[0]); if(x.r*x.c !== 1){ return [mkChar(Array.from(x.d, fmtNum2str).join('  '))]; } return [mkChar(fmtNum2str(x.d[0]))]; }, "num2str(5) turns the number 5 into the text '5'.");
  function fmtNum2str(x){ if(Number.isInteger(x)) return String(x); return String(+x.toPrecision(5)); }
  def('int2str', (a) => [mkChar(String(Math.round(toNumber(a[0]))))]);
  def('str2double', (a) => { const s = toText(a[0]).trim(); const v = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? parseFloat(s) : NaN; return [scalar(v)]; }, "str2double('7') turns the text '7' into the number 7.");
  def('string', (a) => { const v = a[0]; if(v.t === 'char') return [mkStr(v.s)]; if(v.t === 'str') return [v]; if(isScalarNum(v)) return [mkStr(fmtNum2str(v.d[0]))]; err('Conversion to string is supported here for text and single numbers.'); }, 'string(x) converts x to a string.');
  def('char', (a) => { const v = a[0]; if(v.t === 'str' || v.t === 'char') return [mkChar(v.s)]; if(v.t === 'num') return [mkChar(String.fromCharCode(...v.d))]; err('Cannot convert to char.'); }, 'char(x) converts x to a character vector.');
  def('upper', (a) => { const v = a[0]; return [v.t === 'str' ? mkStr(v.s.toUpperCase()) : mkChar(toText(v).toUpperCase())]; });
  def('lower', (a) => { const v = a[0]; return [v.t === 'str' ? mkStr(v.s.toLowerCase()) : mkChar(toText(v).toLowerCase())]; });
  def('strlength', (a) => [scalar(toText(a[0]).length)], 'strlength(s) is the number of characters in s.');
  def('strcmp', (a) => { if(a.length !== 2) err('Not enough input arguments.'); const t = v => (v.t === 'char' || v.t === 'str') ? v.s : null; const x = t(a[0]), y = t(a[1]); return [logical(x !== null && x === y)]; }, "strcmp(a, b) is true when two pieces of text are identical. Use it instead of == for char vectors.");
  def('strrep', (a) => { const v = a[0], s = toText(v).split(toText(a[1])).join(toText(a[2])); return [v.t === 'str' ? mkStr(s) : mkChar(s)]; }, "strrep(s, old, new) replaces every occurrence of old with new.");
  def('contains', (a) => [logical(toText(a[0]).includes(toText(a[1])))], 'contains(s, pattern) is true if pattern appears in s.');
  def('strcat', (a) => { if(a.some(v => v.t === 'str')) return [mkStr(a.map(v => toText(v)).join(''))]; return [mkChar(a.map(v => toText(v).replace(/\s+$/, '')).join(''))]; }, "strcat('sub-', '01') joins text end to end.");
  def('sprintf', (a) => [mkChar(sprintf(a))], "sprintf('sub-%02d.set', 3) builds text from a template: %d is a whole number, %02d pads it to two digits, %s is text, %.2f is a number with two decimals.");
  def('fprintf', (a) => { print(sprintf(a)); return []; }, "fprintf('Loaded %s\\n', name) prints formatted text to the Command Window. \\n starts a new line.");
  def('disp', (a) => { if(a.length !== 1) err('Incorrect number of input arguments.'); const v = a[0];
    if(v.t === 'char' || v.t === 'str') print(v.s + '\n'); else if(v.t === 'num' && v.r*v.c === 0) {} else print(display('', v).replace(/^\n+/, ''));
    return []; }, 'disp(x) shows the value of x without printing its name.');
  def('fieldnames', (a) => { const v = a[0]; if(v.t !== 'struct') err('Invalid input argument of type \'' + classOf(v) + '\'. Input must be a structure.'); const ks = Object.keys(v.a[0] || {}); return [mkCell(ks.map(mkChar), ks.length, 1)]; }, 'fieldnames(s) lists the field names of a struct.');
  def('isfield', (a) => [logical(a[0].t === 'struct' && (toText(a[1]) in (a[0].a[0] || {})))], "isfield(s, 'name') is true if s has a field called name.");
  def('struct', (a) => { const rec = {}; for(let i=0;i<a.length;i+=2) rec[toText(a[i])] = a[i+1] ? a[i+1] : empty(); return [mkStruct([rec])]; }, "struct('name', 'sub-01', 'age', 20) makes a struct with those fields.");
  def('cell', (a) => { const n = a.length ? toNumber(a[0]) : 0, m = a.length > 1 ? toNumber(a[1]) : n; return [mkCell(Array.from({length:n*m}, () => empty()), n, m)]; }, 'cell(1, n) makes an empty 1-by-n cell array.');
  def('numel', B.numel);
  def('tic', () => { S.tic = Date.now(); return []; }); def('toc', () => { print(`Elapsed time is ${((Date.now() - (S.tic || Date.now()))/1000).toFixed(6)} seconds.\n`); return []; });

  function sprintf(a){
    if(!a.length) err('Not enough input arguments.');
    const f = toText(a[0], 'Format');
    const vals = [];
    a.slice(1).forEach(v => { if(v.t === 'char' || v.t === 'str') vals.push(v.s); else if(v.t === 'num') vals.push(...v.d); else if(v.t === 'cell') err('Cell arrays are not a valid input to sprintf. Use braces, as in names{1}.'); else err(`Function is not defined for '${classOf(v)}' inputs.`); });
    let k = 0, out = '', guard = 0;
    const one = () => f.replace(/%%|%([-0+ ]*)(\d*)(?:\.(\d+))?([dfsgiec])/g, (m, flags, w, prec, c) => {
      if(m === '%%') return '%';
      const v = vals[k++];
      if(v === undefined) return '';
      let s;
      if(c === 's') s = typeof v === 'string' ? v : fmtNum2str(v);
      else if(typeof v === 'string'){ s = v; }
      else if(c === 'd' || c === 'i') s = Number.isInteger(v) ? String(v) : v.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
      else if(c === 'f') s = v.toFixed(prec === undefined ? 6 : +prec);
      else if(c === 'e') s = v.toExponential(prec === undefined ? 6 : +prec).replace(/e([+-])(\d)$/, 'e$10$2');
      else s = String(+v.toPrecision(prec === undefined ? 5 : +prec || 1));
      if(w){ const pad = flags.includes('0') && !flags.includes('-') && c !== 's' ? '0' : ' '; s = flags.includes('-') ? s.padEnd(+w) : (pad === '0' && s[0] === '-' ? '-' + s.slice(1).padStart(+w-1, '0') : s.padStart(+w, pad)); }
      return s;
    });
    out = one();
    while(k > 0 && k < vals.length && guard++ < 1000) out += one();   // MATLAB recycles the format for extra values
    return out.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  }

  /* ---- environment and file-system functions ---- */
  def('clc', () => { emit({k:'clc'}); return []; }, 'clc clears the Command Window. Your variables stay in the Workspace.');
  def('clear clearvars', (a) => {
    const names = a.map(v => toText(v));
    if(!names.length || names.includes('all') || names.includes('variables')){ S.W.clear(); }
    else names.forEach(n => {
      if(n.includes('*')){ const re = new RegExp('^' + n.replace(/\*/g, '.*') + '$'); [...S.W.keys()].forEach(k => { if(re.test(k)) S.W.delete(k); }); }
      else S.W.delete(n);
    });
    return [];
  }, 'clear removes every variable from the Workspace. clear x removes only x. It does not touch the Command Window; that is clc.');
  BUILTIN_HELP.clearvars = BUILTIN_HELP.clear;
  def('close', () => []); def('format', () => []);
  def('who', () => { const ks = [...S.W.keys()].sort(); if(ks.length) print('\nYour variables are:\n\n' + ks.join('  ') + '\n\n'); return []; }, 'who lists the names of the variables in the Workspace.');
  def('whos', () => {
    const ks = [...S.W.keys()].sort(); if(!ks.length) return [];
    const rows = ks.map(k => { const v = S.W.get(k); return [k, sizeStr(v).replace('×','x'), String(bytesOf(v)), classOf(v)]; });
    const w0 = Math.max(4, ...rows.map(r => r[0].length)) + 2;
    let s = '  ' + 'Name'.padEnd(w0) + 'Size'.padEnd(16) + 'Bytes'.padStart(9) + '  Class\n\n';
    rows.forEach(r => { s += '  ' + r[0].padEnd(w0) + r[1].padEnd(16) + r[2].padStart(9) + '  ' + r[3] + '\n'; });
    print(s + '\n'); return [];
  }, 'whos lists each variable with its size, memory use, and class.');
  def('pwd', (a, n) => { if(n >= 1) return [mkChar(S.cwd)]; return [mkChar(S.cwd)]; }, 'pwd prints the current folder, the folder MATLAB looks in first.');
  def('cd', (a, n) => {
    if(!a.length){ if(n >= 1) return [mkChar(S.cwd)]; print(S.cwd + '\n'); return []; }
    const target = toText(a[0]); const abs = resolve(target); const nd = node(abs);
    if(!nd || nd.type !== 'dir') err(`Cannot CD to ${target} (Name is nonexistent or not a directory).`);
    S.cwd = abs; emit({k:'fs'}); return [];
  }, 'cd folder changes the current folder. cd .. goes up one level. cd with nothing after it shows where you are.');
  function listing(abs){ const nd = node(abs); return Object.keys(nd.kids).sort((x,y) => x.toLowerCase() < y.toLowerCase() ? -1 : 1); }
  def('ls', (a) => {
    let abs = S.cwd, pat = null;
    if(a.length){ const t = toText(a[0]); if(t.includes('*')){ const p = t.split('/'); pat = p.pop(); abs = p.length ? resolve(p.join('/')) : S.cwd; } else abs = resolve(t); }
    const nd = node(abs); if(!nd) err(`ls: ${a.length ? toText(a[0]) : ''}: No such file or directory`);
    if(nd.type === 'file'){ print(baseName(abs) + '\n'); return []; }
    let items = listing(abs); if(pat){ const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'); items = items.filter(x => re.test(x)); }
    print('\n' + items.join('    ') + '\n\n'); return [];
  }, 'ls lists the files and folders in the current folder.');
  def('dir', (a, n) => {
    let abs = S.cwd, pat = null;
    if(a.length){ const t = toText(a[0]); if(t.includes('*')){ const p = t.split('/'); pat = p.pop(); abs = p.length ? resolve(p.join('/')) : S.cwd; } else abs = resolve(t); }
    const nd = node(abs);
    let items = nd && nd.type === 'dir' ? ['.', '..', ...listing(abs)] : [];
    if(pat){ const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'); items = listing(abs).filter(x => re.test(x)); }
    if(n >= 1){
      const recs = items.map(x => { const k = x === '.' || x === '..' ? {type:'dir'} : nd.kids[x]; return {name:mkChar(x), folder:mkChar(abs), date:mkChar(mtime()), bytes:scalar(k.type === 'dir' ? 0 : k.bytes), isdir:logical(k.type === 'dir')}; });
      const v = mkStruct(recs); if(recs.length){ v.r = recs.length; v.c = 1; } return [v];
    }
    if(!items.length){ print(`No matches for pattern '${a.length ? toText(a[0]) : ''}'.\n`); return []; }
    print('\n' + items.join('    ') + '\n\n'); return [];
  }, "dir lists a folder. files = dir('data/*.set') returns a struct array with one element per matching file.");
  def('fullfile', (a) => { const parts = a.map(v => toText(v)); return [mkChar(parts.join('/').replace(/\/+/g, '/'))]; }, "fullfile('data', 'sub-01.set') joins folder and file names with the right separator for your computer.");
  def('isfile', (a) => { const nd = node(resolve(toText(a[0]))); return [logical(!!nd && nd.type === 'file')]; }, "isfile('data/sub-01.set') is true if that file exists.");
  def('isfolder', (a) => { const nd = node(resolve(toText(a[0]))); return [logical(!!nd && nd.type === 'dir')]; }, "isfolder('data') is true if that folder exists.");
  def('exist', (a) => {
    const t = toText(a[0]);
    if(S.W.has(t)) return [scalar(1)];
    if(findFile(t)) return [scalar(2)];
    const nd = node(resolve(t)); if(nd) return [scalar(nd.type === 'dir' ? 7 : 2)];
    if(B[t]) return [scalar(5)];
    return [scalar(0)];
  }, 'exist(name) returns 1 for a variable, 2 for a file, 5 for a built-in function, 7 for a folder, 0 if nothing is found.');
  def('addpath', (a) => {
    if(!a.length) err('Not enough input arguments.');
    const dirs = a.map(v => toText(v)).filter(x => x !== '-end' && x !== '-begin');
    const atEnd = a.some(v => toText(v) === '-end');
    for(const d of dirs){
      const abs = resolve(d); const nd = node(abs);
      if(!nd || nd.type !== 'dir'){ print(`Warning: Name is nonexistent or not a directory: ${abs}\n`, 'warn'); continue; }
      S.path = S.path.filter(p => p !== abs); if(atEnd) S.path.push(abs); else S.path.unshift(abs);
    }
    emit({k:'path'}); return [];
  }, "addpath('folder') puts a folder on the search path, so MATLAB can find the functions saved in it from any current folder.");
  def('rmpath', (a) => { a.forEach(v => { const abs = resolve(toText(v)); if(!S.path.includes(abs)) print(`Warning: "${abs}" not found in path.\n`, 'warn'); S.path = S.path.filter(p => p !== abs); }); emit({k:'path'}); return []; }, 'rmpath(folder) takes a folder off the search path.');
  def('path', (a, n) => {
    const list = [...S.path, '/Applications/MATLAB/toolbox/matlab (and MATLAB\'s other toolbox folders)'];
    if(n >= 1) return [mkChar(list.join(':'))];
    print('\n\t\tMATLABPATH\n\n' + list.map(p => '\t' + p).join('\n') + '\n\n'); return [];
  }, 'path lists every folder on the search path, in the order MATLAB checks them.');
  def('savepath', () => { S.saved = S.path.slice(); print('The path was saved. MATLAB will start with these folders on the path next time.\n'); return []; }, 'savepath saves the current search path so it is still there the next time MATLAB starts.');
  def('pathtool', () => { print('(The Set Path window opens here in MATLAB. In the sandbox, use addpath and savepath.)\n', 'note'); return []; });
  def('userpath', () => [mkChar(USERPATH)]);
  def('which', (a, n) => {
    if(!a.length) err('Not enough input arguments.');
    const t = toText(a[0]);
    let msg;
    if(S.W.has(t)) msg = `${t} is a variable.`;
    else { const f = findFile(t); if(f) msg = `${f.dir}/${t}.m`; else if(B[t]) msg = `${t} is a MATLAB function (it lives in MATLAB's own toolbox folders)`; else msg = `'${t}' not found.`; }
    if(n >= 1) return [mkChar(msg)];
    print(msg + '\n'); return [];
  }, 'which name tells you which file MATLAB will run for name, or that it cannot find it.');
  def('help doc', (a) => {
    if(!a.length){ print('Type help followed by a function name, for example: help mean\n'); return []; }
    const t = toText(a[0]);
    const f = findFile(t);
    const fileHelp = f && f.file.text ? commentBlock(f.file.text) : '';
    if(fileHelp) print(' ' + fileHelp.replace(/\n/g, '\n ') + '\n');
    else if(f && EEGLAB_HELP[t]) print(' ' + EEGLAB_HELP[t] + '\n');
    else if(BUILTIN_HELP[t]) print(' ' + BUILTIN_HELP[t] + '\n');
    else if(EEGLAB_HELP[t]) print(`${t} not found.\n\nUse the Help browser search field to search the documentation, or type "help help" for help command options, such as help for methods.\n`);
    else print(`${t} not found.\n`);
    return [];
  }, 'help name prints a short description of a function.');
  function commentBlock(text){
    const lines = text.split('\n'); let i = 0;
    if(/^\s*function\b/.test(lines[0] || '')) i = 1;
    const out = []; while(i < lines.length && /^\s*%/.test(lines[i])){ out.push(lines[i].replace(/^\s*%\s?/, '')); i++; }
    return out.join('\n');
  }
  def('edit', (a) => { emit({k:'edit', name: a.length ? toText(a[0]) : ''}); return []; });
  def('type', (a) => { const t = toText(a[0]); const f = findFile(t.replace(/\.m$/, '')) || (node(resolve(t)) ? {file:node(resolve(t))} : null); if(!f || f.file.type !== 'file') err(`File '${t}' not found.`); print('\n' + (f.file.text || '(binary data file)') + '\n'); return []; }, 'type file.m prints the contents of a file.');

  /* ---- EEGLAB (simulated) ---- */
  const EEGLAB_HELP = {
    eeglab: "eeglab starts EEGLAB. [ALLEEG, EEG, CURRENTSET] = eeglab; also returns its main variables. It adds its own subfolders to the path.",
    pop_loadset: "EEG = pop_loadset('filename', 'sub-01.set', 'filepath', 'data'); loads a dataset saved in EEGLAB's .set format.",
    pop_saveset: "EEG = pop_saveset(EEG, 'filename', 'sub-01_filt.set', 'filepath', 'data'); saves a dataset.",
    pop_eegfiltnew: "EEG = pop_eegfiltnew(EEG, 'locutoff', 0.1, 'hicutoff', 30); filters the data with a FIR filter.",
    eeg_checkset: "EEG = eeg_checkset(EEG); checks the EEG structure for consistency.",
    pop_select: "EEG = pop_select(EEG, 'channel', 1:10); keeps only channels 1 to 10. 'nochannel' removes channels instead, and 'time', [0 30] keeps the first 30 seconds."
  };
  function makeEEG(subj, fname, fpath){
    const srate = 500, pnts = 30000, nb = 32;
    const rng = makeRng(1000 + subj*97);
    const data = mkNum(nb, pnts);
    for(let ch=0; ch<nb; ch++){
      let a = 0, b = 0; const amp = 6 + 4*rng(), ph = rng()*6.28, alpha = (ch >= 20 ? 1.6 : 0.6);
      for(let i=0; i<pnts; i++){
        const g1 = Math.sqrt(-2*Math.log(rng()+1e-12))*Math.cos(6.2832*rng());
        a = 0.97*a + 0.8*g1; b = 0.5*b + 0.9*g1;
        const t = i/srate;
        data.d[i*nb + ch] = Math.round((a*1.5 + b*2.5 + amp*alpha*Math.sin(6.2832*10*t + ph)*(0.6 + 0.4*Math.sin(6.2832*0.2*t)))*100)/100;
      }
    }
    const times = mkNum(1, pnts); for(let i=0;i<pnts;i++) times.d[i] = i*1000/srate;
    const chanlocs = mkStruct(CHANS.map(l => ({labels: mkChar(l), type: mkChar('EEG')})));
    const types = ['11','21','11','11','22','11','21','11','12','11'];
    const events = []; let lat = 1800;
    for(let k=0; k<60; k++){ events.push({type: mkChar(types[k % types.length]), latency: scalar(lat), duration: scalar(0)}); lat += 420 + Math.round(rng()*120); if(lat > pnts - 600) break; }
    return mkStruct([{
      setname: mkChar(fname.replace(/\.set$/, '')), filename: mkChar(fname), filepath: mkChar(fpath),
      subject: mkChar(subj ? 'sub-' + String(subj).padStart(2,'0') : ''),
      nbchan: scalar(nb), trials: scalar(1), pnts: scalar(pnts), srate: scalar(srate),
      xmin: scalar(0), xmax: scalar((pnts-1)/srate), times, data, chanlocs, event: mkStruct(events),
      ref: mkChar('common'), history: mkChar('')
    }]);
  }
  function nameValue(a, start){ const o = {}; for(let i=start;i<a.length-1;i+=2){ if(a[i].t !== 'char' && a[i].t !== 'str') err('Name-value arguments must be text, as in \'filename\', \'sub-01.set\'.'); o[a[i].s.toLowerCase()] = a[i+1]; } return o; }
  const EEGLAB_FN = {
    eeglab(a, n){
      const root = S.path.find(p => p === EEGLAB_DIR) || (S.cwd === EEGLAB_DIR ? EEGLAB_DIR : null);
      const add = ['functions','functions/popfunc','functions/adminfunc','functions/sigprocfunc','functions/guifunc','functions/miscfunc','plugins/firfilt','plugins/ERPLAB'].map(d => EEGLAB_DIR + '/' + d);
      if(!S.path.includes(EEGLAB_DIR)) S.path.unshift(EEGLAB_DIR);
      add.forEach(d => { if(!S.path.includes(d)) S.path.splice(S.path.indexOf(EEGLAB_DIR) + 1, 0, d); });
      if(!S.eeglabStarted) print('eeglab: adding its subfolders to the path (functions, plugins ...)\nEEGLAB version 2025.1 started. (Its window would open now; the sandbox does not draw it.)\n', 'note');
      else print('EEGLAB is already running.\n', 'note');
      S.eeglabStarted = true;
      const ALLEEG = empty(), EEG = empty(), CUR = scalar(0);
      if(n === 0){
        [['ALLEEG', ALLEEG], ['EEG', EEG], ['CURRENTSET', CUR], ['ALLCOM', mkCell([])], ['LASTCOM', mkChar('')], ['STUDY', empty()], ['CURRENTSTUDY', scalar(0)]].forEach(([k, v]) => { if(!S.W.has(k) || k !== 'EEG' || true) S.W.set(k, v); });
      }
      emit({k:'path'});
      return n === 0 ? [] : [ALLEEG, EEG, CUR, mkCell([])];
    },
    pop_loadset(a){
      if(!a.length) err("pop_loadset needs a file name, as in EEG = pop_loadset('filename', 'sub-01.set', 'filepath', 'data');");
      let fname, fpath = '';
      const first = toText(a[0]).toLowerCase();
      if(first === 'filename' || first === 'filepath'){ const nv = nameValue(a, 0); fname = nv.filename ? toText(nv.filename) : ''; fpath = nv.filepath ? toText(nv.filepath) : ''; }
      else { fname = toText(a[0]); fpath = a[1] ? toText(a[1]) : ''; }
      if(!fname) err("pop_loadset: no 'filename' was given.");
      const abs = resolve(fpath ? fpath + '/' + fname : fname);
      print(`pop_loadset(): loading file ${abs} ...\n`);
      const nd = node(abs);
      if(!nd || nd.type !== 'file') err(`Unable to find file or directory '${abs}'.\n(pop_loadset looks for the file in 'filepath', or in the current folder if no filepath is given. Check pwd and the spelling.)`, 'nofile');
      if(!nd.eeg) err(`${fname} is not an EEGLAB dataset.`);
      const dirAbs = abs.slice(0, abs.lastIndexOf('/'));
      const EEG = makeEEG(nd.eeg.subj, baseName(abs), dirAbs);
      if(nd.eeg.filtered){ EEG.a[0].setname = mkChar(nd.eeg.setname || EEG.a[0].setname.s); }
      return [EEG];
    },
    pop_eegfiltnew(a){
      if(!a.length || a[0].t !== 'struct' || !a[0].a[0] || !('data' in a[0].a[0])) err("The first input to pop_eegfiltnew must be an EEG dataset, as in EEG = pop_eegfiltnew(EEG, 'locutoff', 0.1, 'hicutoff', 30);");
      const EEG = copyVal(a[0]);
      let lo = null, hi = null;
      if(a.length >= 2 && (a[1].t === 'char' || a[1].t === 'str')){ const nv = nameValue(a, 1); lo = nv.locutoff ? toNumber(nv.locutoff) : null; hi = nv.hicutoff ? toNumber(nv.hicutoff) : null; }
      else { lo = a[1] && a[1].r*a[1].c ? toNumber(a[1]) : null; hi = a[2] && a[2].r*a[2].c ? toNumber(a[2]) : null; }
      const kind = lo && hi ? `bandpass ${lo} to ${hi} Hz` : lo ? `highpass above ${lo} Hz` : hi ? `lowpass below ${hi} Hz` : null;
      if(!kind) err("pop_eegfiltnew needs 'locutoff', 'hicutoff', or both.");
      print(`pop_eegfiltnew() - performing ${kind} filtering ...\n(sandbox: the numbers in EEG.data are left as they were)\n`);
      EEG.a[0][FILT] = (EEG.a[0][FILT] ? EEG.a[0][FILT] + '; ' : '') + kind;
      return [EEG];
    },
    pop_saveset(a){
      if(!a.length || a[0].t !== 'struct') err("The first input to pop_saveset must be an EEG dataset.");
      const nv = nameValue(a, 1); const fname = nv.filename ? toText(nv.filename) : null; const fpath = nv.filepath ? toText(nv.filepath) : '';
      if(!fname) err("pop_saveset needs a 'filename'.");
      const absDir = resolve(fpath || '.'); const nd = node(absDir);
      if(!nd || nd.type !== 'dir') err(`Unable to write file: the folder '${absDir}' does not exist.`);
      const base = fname.replace(/\.set$/, '');
      const rec = a[0].a[0];
      const subj = rec.subject && rec.subject.s ? parseInt(rec.subject.s.slice(4), 10) : 0;
      nd.kids[base + '.set'] = file({eeg:{subj, filtered: !!rec[FILT], setname: base}, bytes: 340512, fresh: true});
      nd.kids[base + '.fdt'] = file({bytes: 3840000, fresh: true});
      print(`Saving dataset...\n`);
      const EEG = copyVal(a[0]); EEG.a[0].filename = mkChar(base + '.set'); EEG.a[0].filepath = mkChar(absDir); EEG.a[0].setname = mkChar(base);
      emit({k:'fs'});
      return [EEG];
    },
    pop_select(a){
      if(!a.length || a[0].t !== 'struct' || !a[0].a[0] || !('data' in a[0].a[0])) err("The first input to pop_select must be an EEG dataset, as in EEG = pop_select(EEG, 'channel', 1:10);");
      const nv = nameValue(a, 1);
      const EEG = copyVal(a[0]); const rec = EEG.a[0];
      const labels = rec.chanlocs.a.map(c => c.labels.s);
      const pick = v => { if(v.t === 'cell') return v.a.map(x => { const i = labels.indexOf(toText(x)); if(i < 0) err(`pop_select: channel '${toText(x)}' not found.`); return i; }); const n = asNum(v); if(!n) err('Channels must be numbers or a cell array of labels.'); return Array.from(n.d, x => { if(x < 1 || x > labels.length || !Number.isInteger(x)) err(`pop_select: channel index ${x} is out of range (1 to ${labels.length}).`); return x-1; }); };
      let keep = labels.map((_, i) => i);
      if(nv.channel) keep = pick(nv.channel);
      if(nv.nochannel){ const drop = new Set(pick(nv.nochannel)); keep = keep.filter(i => !drop.has(i)); }
      let t0 = 0, t1 = rec.pnts.d[0] - 1;
      if(nv.time){ const tt = asNum(nv.time); t0 = Math.max(0, Math.round(tt.d[0]*rec.srate.d[0])); t1 = Math.min(rec.pnts.d[0]-1, Math.round(tt.d[1]*rec.srate.d[0]) - 1); }
      const np = t1 - t0 + 1, nb = keep.length, old = rec.data, or = old.r;
      const d = mkNum(nb, np); for(let j=0;j<np;j++) for(let k=0;k<nb;k++) d.d[j*nb + k] = old.d[(t0+j)*or + keep[k]];
      rec.data = d; rec.nbchan = scalar(nb); rec.pnts = scalar(np); rec.xmax = scalar((np-1)/rec.srate.d[0]);
      rec.chanlocs = mkStruct(keep.map(i => rec.chanlocs.a[i]));
      const times = mkNum(1, np); for(let i=0;i<np;i++) times.d[i] = i*1000/rec.srate.d[0]; rec.times = times;
      if(nv.time){ rec.event = mkStruct(rec.event.a.filter(e => e.latency.d[0]-1 >= t0 && e.latency.d[0]-1 <= t1).map(e => Object.assign({}, e, {latency: scalar(e.latency.d[0] - t0)}))); }
      return [EEG];
    },
    eeg_checkset(a){ return [a[0]]; },
    pop_epoch(){ err('pop_epoch is covered in the ERP pipeline pages; the sandbox does not simulate epoching.'); },
    pop_reref(){ err('pop_reref is covered in the ERP pipeline pages; the sandbox does not simulate re-referencing.'); },
    pop_rmbase(){ err('pop_rmbase is covered in the ERP pipeline pages; the sandbox does not simulate baseline removal.'); },
    pop_chansel(){ err('pop_chansel opens a window; it is not part of the sandbox.'); },
    eeg_options(){ return []; }, eegfilt(){ err('Use pop_eegfiltnew instead.'); }, runica(){ err('ICA is beyond this sandbox.'); },
    firfilt(){ return []; }, erplab(){ err('ERPLAB runs inside EEGLAB; see the ERP pipeline pages.'); }
  };

  /* ------------------------------------------------ user function files -- */
  function parseFunctionFile(text, fileName){
    const toks = tokenize(text, cmdWord);
    let i = 0; while(toks[i] && toks[i].t === 'nl') i++;
    if(!toks[i] || toks[i].t !== 'kw' || toks[i].v !== 'function') return {script:true};
    i++;
    let outs = [], name, ins = [];
    const rest = toks.slice(i);
    // forms: function out = name(a, b) | function [o1, o2] = name(a) | function name(a)
    let j = 0;
    const eqAt = rest.findIndex(t => t.t === 'op' && t.v === '=');
    const nlAt = rest.findIndex(t => t.t === 'nl');
    if(eqAt >= 0 && (nlAt < 0 || eqAt < nlAt)){
      rest.slice(0, eqAt).forEach(t => { if(t.t === 'id') outs.push(t.v); });
      j = eqAt + 1;
    }
    if(!rest[j] || rest[j].t !== 'id') err(`Invalid function definition in ${fileName}. The first line should look like: function out = name(in)`);
    name = rest[j].v; j++;
    if(rest[j] && rest[j].t === 'op' && rest[j].v === '('){ j++; while(rest[j] && !(rest[j].t === 'op' && rest[j].v === ')')){ if(rest[j].t === 'id') ins.push(rest[j].v); j++; } j++; }
    const bodyToks = rest.slice(j);
    const p = new Parser(bodyToks);
    const body = p.block(['end']);
    if(p.isKw('end')) p.next();
    const helpLines = text.split('\n').slice(1).filter(l => /^\s*%/.test(l));
    return {name, outs, ins, body, help: helpLines.map(l => l.replace(/^\s*%\s?/, '')).join('\n')};
  }
  function callUser(f, args, nargout, found){
    const def = parseFunctionFile(f.text, found.name + '.m');
    if(def.script){
      if(args.length) err(`Attempt to execute SCRIPT ${found.name} as a function.`);
      runProgram(f.text, S.W, {file: found.name}); return [];
    }
    if(def.name !== found.name) print(`Warning: the function name '${def.name}' does not match the file name '${found.name}.m'. MATLAB uses the file name.\n`, 'warn');
    if(args.length > def.ins.length) err('Too many input arguments.');
    const W = new Map();
    def.ins.forEach((n, k) => { if(args[k]) W.set(n, args[k]); });
    const frame = {W, isBase:false, endStack:[], steps:{n:0}, line:0, fn: found.name, nargin: args.length};
    execBlock(def.body, frame);
    const outs = [];
    for(let k=0; k<Math.max(1, nargout) && k<def.outs.length; k++){
      const n = def.outs[k];
      if(!W.has(n)){ if(k < nargout || (k === 0 && nargout === 0 && false)) err(`Output argument "${n}" (and possibly others) not assigned a value in the execution with "${found.name}" function.`); break; }
      outs.push(W.get(n));
    }
    return outs;
  }

  /* ------------------------------------------------------ evaluation -- */
  const COMMANDS = new Set(['clc','clear','clearvars','close','who','whos','pwd','cd','ls','dir','addpath','rmpath','path','which','help','doc','format','savepath','pathtool','eeglab','edit','type','tic','toc','userpath']);
  function cmdWord(w){ return COMMANDS.has(w) && !S.W.has(w); }

  /* resolve a name used as a function; returns {kind, fn} or null */
  function lookupFn(name){
    const f = findFile(name);
    if(f){
      if(f.file.fn && EEGLAB_FN[f.file.fn]) return {kind:'eeglab', fn:EEGLAB_FN[f.file.fn]};
      if(f.file.text !== undefined) return {kind:'user', file:f.file, name};
    }
    if(B[name]) return {kind:'builtin', fn:B[name]};
    return null;
  }
  function callFn(name, args, nargout){
    const f = lookupFn(name);
    if(!f){
      if(EEGLAB_FN[name]){
        err(`Unrecognized function or variable '${name}'.` + (name === 'eeglab' ? '' : ''), 'noeeglab:' + name);
      }
      err(`Unrecognized function or variable '${name}'.`, 'undef');
    }
    if(f.kind === 'user') return callUser(f.file, args, nargout, f);
    return f.fn(args, nargout) || [];
  }

  function evalArgs(args, frame, target, dimCount){
    return args.map((a, k) => {
      if(a.k === 'colonAll') return ':';
      frame.endStack.push({v: target, pos: k, n: dimCount});
      try{ return evalExpr(a, frame); } finally { frame.endStack.pop(); }
    });
  }
  function evalCallArgs(args, frame){
    const out = [];
    args.forEach(a => {
      if(a.k === 'colonAll'){ out.push(mkChar(':')); return; }
      if(a.k === 'id'){ const o = evalId(a, frame, 1); if(o.cs){ out.push(...o); return; } if(!o.length) err(`Error using ${a.name}\nToo many output arguments.`); out.push(o[0]); return; }
      frame.endStack.push({v:null}); try{ out.push(evalExpr(a, frame)); } finally { frame.endStack.pop(); }
    });
    return out;
  }
  function endValue(ctx){
    if(!ctx || !ctx.v) err("'end' is only valid inside an index, as in x(end).");
    const v = ctx.v;
    const r = v.t === 'str' ? 1 : v.r, c = v.t === 'str' ? 1 : v.c;
    if(ctx.n === 1) return r*c;
    return ctx.pos === 0 ? r : c;
  }

  function indexValue(v, args, isBrace){
    if(isBrace){
      if(v.t !== 'cell') err(`Brace indexing is not supported for variables of this type.`);
      const idx = linearSelect(v, args);
      if(idx.length !== 1) err('The sandbox returns one cell at a time with { }; use a loop for more.');
      return v.a[idx[0]];
    }
    if(v.t === 'str'){ const idx = linearSelect({r:1,c:1}, args); if(idx.length !== 1) err('Index exceeds the number of array elements. Index must not exceed 1.'); return v; }
    if(v.t === 'num' || v.t === 'char'){
      const src = v.t === 'char' ? asNum(v) : v;
      let out;
      if(args.length === 1){
        const n = src.r*src.c; const list = indexList(args[0], n);
        list.forEach(i => { if(i > n) err(`Index exceeds the number of array elements. Index must not exceed ${n}.`); });
        const [r, c] = sliceShape(src, args[0], list.length);
        out = mkNum(r, c, null, src.lg); list.forEach((i, k) => out.d[k] = src.d[i-1]);
      } else if(args.length === 2){
        const R = indexList(args[0], src.r), C = indexList(args[1], src.c);
        R.forEach(i => { if(i > src.r) err(`Index in position 1 exceeds array bounds. Index must not exceed ${src.r}.`); });
        C.forEach(j => { if(j > src.c) err(`Index in position 2 exceeds array bounds. Index must not exceed ${src.c}.`); });
        out = mkNum(R.length, C.length, null, src.lg);
        for(let jj=0; jj<C.length; jj++) for(let ii=0; ii<R.length; ii++) out.d[jj*R.length + ii] = src.d[(C[jj]-1)*src.r + (R[ii]-1)];
      } else err('The sandbox supports one or two indices, as in x(3) or A(2, 3).');
      if(v.t === 'char'){ if(out.r > 1 && out.c > 1) err('Char matrices are not supported here.'); return mkChar(String.fromCharCode(...out.d)); }
      return out;
    }
    if(v.t === 'cell'){ const idx = linearSelect(v, args); const o = mkCell(idx.map(i => v.a[i])); if(v.r > 1 && v.c === 1){ o.r = idx.length; o.c = 1; } return o; }
    if(v.t === 'struct'){ const idx = linearSelect(v, args); const o = mkStruct(idx.map(i => v.a[i])); if(v.r > 1 && v.c === 1 && idx.length > 1){ o.r = idx.length; o.c = 1; } return o; }
    err(`Indexing is not supported for ${classOf(v)}.`);
  }
  function linearSelect(v, args){
    const n = v.r*v.c;
    if(args.length === 1){ const list = indexList(args[0], n); list.forEach(i => { if(i > n) err(`Index exceeds the number of array elements. Index must not exceed ${n}.`); }); return list.map(i => i-1); }
    if(args.length === 2){ const R = indexList(args[0], v.r), C = indexList(args[1], v.c); const o = []; C.forEach(j => R.forEach(i => { if(i > v.r || j > v.c) err(`Index exceeds the number of array elements. Index must not exceed ${n}.`); o.push((j-1)*v.r + (i-1)); })); return o; }
    err('Only one or two indices are supported here.');
  }
  function getField(v, name){
    if(v.t !== 'struct') err(`Dot indexing is not supported for variables of this type.`);
    if(v.r*v.c !== 1){
      if(v.r*v.c === 0) err('Dot indexing into an empty struct array.');
      err(`Expected one output from a curly brace or dot indexing expression, but there were ${v.r*v.c} results. Index one element first, as in s(1).${name}.`);
    }
    if(!(name in v.a[0])) err(`Unrecognized field name "${name}".`);
    return v.a[0][name];
  }

  function lookupVar(frame, name){ return frame.W.get(name); }

  function evalId(node, frame, nargout){
    const name = node.name;
    let v = lookupVar(frame, name);
    let chain = node.chain;
    if(v === undefined){
      // function call: first paren group (if any) is its argument list
      let args = [], rest = chain;
      if(chain.length && chain[0].k === 'paren'){ args = evalCallArgs(chain[0].args, frame); rest = chain.slice(1); }
      else if(chain.length && chain[0].k === 'brace') err(`Unrecognized function or variable '${name}'.`, 'undef');
      else if(chain.length && chain[0].k === 'field') err(`Unrecognized function or variable '${name}'.`, 'undef');
      const outs = callFn(name, args, rest.length ? 1 : nargout);
      if(!rest.length) return outs;
      if(!outs.length) err(`Too many output arguments.`);
      v = outs[0]; chain = rest;
    }
    for(let si = 0; si < chain.length; si++){
      const step = chain[si];
      if(step.k === 'field' && v.t === 'struct' && v.r*v.c > 1 && si === chain.length - 1){
        if(!(step.name in v.a[0])) err(`Unrecognized field name "${step.name}".`);
        const list = v.a.map(rec => rec[step.name]); list.cs = true; return list;
      }
      if(step.k === 'field') v = getField(v, step.name);
      else if(step.k === 'paren'){ const dims = step.args.length; const a = evalArgs(step.args, frame, v, dims); v = indexValue(v, a, false); }
      else { const a = evalArgs(step.args, frame, v, step.args.length); v = indexValue(v, a, true); }
    }
    return [v];
  }

  function concat(rows, frame, cellMode){
    const vals = rows.map(r => [].concat(...r.map(e => { if(e.k === 'id'){ const o = evalId(e, frame, 1); if(o.cs) return o; if(!o.length) err(`Error using ${e.name}\nToo many output arguments.`); return [o[0]]; } return [evalExpr(e, frame)]; })));
    if(cellMode){
      const flat = []; let r = 0;
      vals.forEach(row => { if(row.length){ r++; row.forEach(v => flat.push(v)); } });
      if(r > 1) { const c = vals[0].length; if(vals.some(row => row.length && row.length !== c)) err('Dimensions of arrays being concatenated are not consistent.'); const o = mkCell([], r, c); for(let j=0;j<c;j++) for(let i=0;i<r;i++) o.a[j*r + i] = vals[i][j]; return o; }
      return mkCell(flat);
    }
    const all = [].concat(...vals);
    if(!all.length) return empty();
    if(all.some(v => v.t === 'str')){
      if(all.length === 1) return all[0];
      err('String arrays are not part of the sandbox. Join strings with +, as in "sub-" + "01".');
    }
    if(all.some(v => v.t === 'cell')){ const flat = []; all.forEach(v => { if(v.t === 'cell') flat.push(...v.a); else err('Cannot concatenate a cell array with a non-cell value. Put it in braces first.'); }); return mkCell(flat); }
    if(all.some(v => v.t === 'struct')){ const recs = []; all.forEach(v => { if(v.t !== 'struct') err('Cannot mix structs and other values in [ ].'); recs.push(...v.a); }); return mkStruct(recs); }
    const isChar = all.some(v => v.t === 'char');
    const numRowsV = vals.filter(row => row.length).map(row => {
      const parts = row.map(v => asNum(v)).filter(p => p.r*p.c > 0);
      if(!parts.length) return null;
      const r = parts[0].r;
      if(parts.some(p => p.r !== r)) err('Dimensions of arrays being concatenated are not consistent.');
      const c = parts.reduce((s,p) => s + p.c, 0);
      const o = mkNum(r, c, null, parts.every(p => p.lg)); let off = 0;
      parts.forEach(p => { o.d.set(p.d, off*r); off += p.c; });
      return o;
    }).filter(Boolean);
    if(!numRowsV.length) return isChar ? mkChar('') : empty();
    let res;
    if(numRowsV.length === 1) res = numRowsV[0];
    else {
      const c = numRowsV[0].c;
      if(numRowsV.some(p => p.c !== c)) err('Dimensions of arrays being concatenated are not consistent.');
      const r = numRowsV.reduce((s,p) => s + p.r, 0);
      res = mkNum(r, c); let off = 0;
      numRowsV.forEach(p => { for(let j=0;j<c;j++) for(let i=0;i<p.r;i++) res.d[j*r + off + i] = p.d[j*p.r + i]; off += p.r; });
    }
    if(isChar){ if(res.r > 1) err('Char matrices are not part of the sandbox; keep text on one row, or use a cell array: {\'sub-01\', \'sub-02\'}.'); return mkChar(String.fromCharCode(...res.d)); }
    return res;
  }

  function binop(op, a, b){
    if(op === '&&' || op === '||') err('internal');
    /* strings: + joins, == compares */
    if(a.t === 'str' || b.t === 'str'){
      const txt = v => v.t === 'str' || v.t === 'char' ? v.s : (isScalarNum(v) ? fmtNum2str(v.d[0]) : err(`Operator '${op}' is not supported for these operands.`));
      if(op === '+') return mkStr(txt(a) + txt(b));
      if(op === '==') return logical(txt(a) === txt(b));
      if(op === '~=') return logical(txt(a) !== txt(b));
      err(`Operator '${op}' is not supported for operands of type 'string'.`);
    }
    if(a.t === 'char' && b.t === 'char' && (op === '==' || op === '~=') && a.c !== b.c && a.c !== 1 && b.c !== 1)
      err(`Arrays have incompatible sizes for this operation. To compare two pieces of text, use strcmp(a, b).`);
    const x = asNum(a), y = asNum(b);
    if(!x || !y) err(`Operator '${op}' is not supported for operands of type '${classOf(a)}' and '${classOf(b)}'.`);
    const F = {
      '+':(p,q) => p+q, '-':(p,q) => p-q, '.*':(p,q) => p*q, './':(p,q) => p/q, '.^':(p,q) => Math.pow(p,q),
      '==':(p,q) => +(p === q), '~=':(p,q) => +(p !== q), '<':(p,q) => +(p < q), '>':(p,q) => +(p > q), '<=':(p,q) => +(p <= q), '>=':(p,q) => +(p >= q),
      '&':(p,q) => +(!!p && !!q), '|':(p,q) => +(!!p || !!q)
    };
    const lg = ['==','~=','<','>','<=','>=','&','|'].includes(op);
    if(F[op]){
      if(!(x.r*x.c === 1 || y.r*y.c === 1 || (x.r === y.r && x.c === y.c))) err(`Arrays have incompatible sizes for this operation.` + (op === '.*' || op === './' ? '' : ''));
      return broadcast(x, y, F[op], lg);
    }
    if(op === '*'){
      if(x.r*x.c === 1 || y.r*y.c === 1) return broadcast(x, y, (p,q) => p*q);
      if(x.c !== y.r) err('Incorrect dimensions for matrix multiplication. Check that the number of columns in the first matrix matches the number of rows in the second matrix. To multiply each element by the matching element, use .* instead.');
      const o = mkNum(x.r, y.c);
      for(let i=0;i<x.r;i++) for(let j=0;j<y.c;j++){ let s = 0; for(let k=0;k<x.c;k++) s += x.d[k*x.r + i]*y.d[j*y.r + k]; o.d[j*x.r + i] = s; }
      return o;
    }
    if(op === '/'){
      if(y.r*y.c === 1) return broadcast(x, y, (p,q) => p/q);
      err('Matrix division is not part of the sandbox. To divide element by element, use ./ instead.');
    }
    if(op === '\\') err('Left division is not part of the sandbox.');
    if(op === '^'){
      if(x.r*x.c === 1 && y.r*y.c === 1) return scalar(Math.pow(x.d[0], y.d[0]));
      err('Incorrect dimensions for raising a matrix to a power. Check that the matrix is square and the power is a scalar. To raise each element of a matrix to a power, use .^ instead.');
    }
    err(`Unsupported operator '${op}'.`);
  }

  function evalExpr(node, frame){
    switch(node.k){
      case 'num': return scalar(node.v);
      case 'char': return mkChar(node.v);
      case 'str': return mkStr(node.v);
      case 'group': return evalExpr(node.e, frame);
      case 'endkw': return scalar(endValue(frame.endStack[frame.endStack.length-1]));
      case 'id': {
        const outs = evalId(node, frame, 1);
        if(outs.cs && outs.length !== 1) err(`This gives ${outs.length} separate values (one per element), and only one fits here. Index one element first, as in s(1).field, or collect them all with braces: {s.field}.`);
        if(!outs.length) err(`Error using ${node.name}\nToo many output arguments.`);
        return outs[0];
      }
      case 'matrix': return concat(node.rows, frame, false);
      case 'cellLit': return concat(node.rows, frame, true);
      case 'range': {
        const a = evalExpr(node.a, frame), b = evalExpr(node.b, frame), st = node.step ? evalExpr(node.step, frame) : scalar(1);
        return colonRange(toNumber(a, 'Colon operands'), toNumber(st, 'Colon operands'), toNumber(b, 'Colon operands'));
      }
      case 'neg': { const a = evalExpr(node.a, frame); const x = asNum(a); if(!x){ if(a.t === 'str') err("Operator '-' is not supported for operands of type 'string'."); err('Unary minus needs a number.'); } const o = mkNum(x.r, x.c); for(let i=0;i<o.d.length;i++) o.d[i] = -x.d[i]; return o; }
      case 'not': { const a = asNum(evalExpr(node.a, frame)); if(!a) err('~ needs a logical or numeric value.'); const o = mkNum(a.r, a.c, null, true); for(let i=0;i<o.d.length;i++) o.d[i] = a.d[i] ? 0 : 1; return o; }
      case 'transpose': return transpose(evalExpr(node.a, frame));
      case 'bin': {
        if(node.op === '&&' || node.op === '||'){
          const a = evalExpr(node.a, frame);
          const ta = truthy(a);
          if(node.op === '&&' && !ta) return logical(0);
          if(node.op === '||' && ta) return logical(1);
          return logical(truthy(evalExpr(node.b, frame)));
        }
        return binop(node.op, evalExpr(node.a, frame), evalExpr(node.b, frame));
      }
    }
    err('Invalid expression.');
  }

  /* --- assignment into x, x(i), x(i,j), x{i}, s.f, and chains of these --- */
  function assignInto(base, chain, val, frame){
    if(!chain.length) return val;
    const [step, ...rest] = chain;
    if(step.k === 'field'){
      let s = base;
      if(s === undefined || (s.t === 'num' && s.r*s.c === 0)) s = mkStruct([{}]);
      if(s.t !== 'struct') err(`Unable to perform assignment because dot indexing is not supported for variables of this type.`);
      if(s.r*s.c !== 1) err(`Scalar structure required for this assignment. Index one element first, as in s(2).${step.name} = ...`);
      s = copyVal(s);
      s.a[0][step.name] = assignInto(s.a[0][step.name], rest, val, frame);
      return s;
    }
    if(step.k === 'brace'){
      let c = base === undefined || (base.t === 'num' && base.r*base.c === 0) ? mkCell([]) : base;
      if(c.t !== 'cell') err('Unable to perform assignment because brace indexing is not supported for variables of this type.');
      c = copyVal(c);
      const a = evalArgs(step.args, frame, c, step.args.length);
      const i = linearTarget(c, a);
      while(c.a.length < i) c.a.push(empty());
      c.a[i-1] = assignInto(c.a[i-1], rest, val, frame);
      if(c.r <= 1){ c.r = 1; c.c = Math.max(c.c, c.a.length); }
      return c;
    }
    /* paren */
    let cur = base;
    const a = evalArgs(step.args, frame, cur || empty(), step.args.length);
    if(rest.length){   // s(2).name = ... or c(2) = ...
      let s = cur === undefined || (cur.t === 'num' && cur.r*cur.c === 0) ? mkStruct([]) : cur;
      if(s.t !== 'struct') err('Only struct arrays can be assigned this way here, as in s(2).name = ...');
      s = copyVal(s);
      const i = linearTarget(s, a);
      const keys = Object.keys(s.a[0] || {});
      while(s.a.length < i){ const rec = {}; keys.forEach(k => rec[k] = empty()); s.a.push(rec); }
      const one = mkStruct([s.a[i-1]]);
      const updated = assignInto(one, rest, val, frame);
      s.a[i-1] = updated.a[0];
      const newKeys = Object.keys(updated.a[0]); s.a.forEach(r => newKeys.forEach(k => { if(!(k in r)) r[k] = empty(); }));
      if(s.r <= 1){ s.r = 1; s.c = s.a.length; } else s.r = s.a.length;
      return s;
    }
    if(cur === undefined) cur = val.t === 'char' ? mkChar('') : val.t === 'cell' ? mkCell([]) : val.t === 'struct' ? mkStruct([]) : empty();
    if(cur.t === 'cell'){
      if(val.t !== 'cell') err('Conversion to cell from ' + classOf(val) + ' is not possible. Use braces to put a value inside a cell: c{2} = ...');
      const c = copyVal(cur); const i = linearTarget(c, a); while(c.a.length < i) c.a.push(empty()); c.a[i-1] = val.a[0]; c.r = 1; c.c = c.a.length; return c;
    }
    if(cur.t === 'struct'){
      if(val.t !== 'struct') err('Conversion to struct from ' + classOf(val) + ' is not possible.');
      const s = copyVal(cur); const i = linearTarget(s, a); while(s.a.length < i) s.a.push({}); s.a[i-1] = val.a[0]; s.r = 1; s.c = s.a.length; return s;
    }
    if(cur.t === 'str') err('The sandbox keeps strings as single values; build a new one instead.');
    const isChar = cur.t === 'char';
    let x = asNum(cur); const v = asNum(val);
    if(!v) err(`Unable to perform assignment: ${classOf(val)} cannot go inside a ${classOf(cur)} array.`);
    if(a.length === 1){
      const list = indexList(a[0], x.r*x.c);
      if(v.r*v.c !== 1 && v.r*v.c !== list.length){ if(v.r*v.c === 0 && list.length){ return deleteElems(x, list, isChar); } err(`Unable to perform assignment because the left and right sides have a different number of elements.`); }
      const maxI = Math.max(0, ...list);
      if(maxI > x.r*x.c){
        if(x.r > 1 && x.c > 1) err(`Attempt to grow array along ambiguous dimension.`);
        const col = x.c === 1 && x.r > 1;
        const n = mkNum(col ? maxI : 1, col ? 1 : maxI); n.d.set(x.d); x = n;
      } else x = mkNum(x.r, x.c, Float64Array.from(x.d), x.lg && v.lg);
      list.forEach((i, k) => x.d[i-1] = v.r*v.c === 1 ? v.d[0] : v.d[k]);
    } else if(a.length === 2){
      const R = a[0] === ':' ? indexList(':', x.r) : indexList(a[0], x.r), C = a[1] === ':' ? indexList(':', x.c) : indexList(a[1], x.c);
      if(v.r*v.c === 0 && (a[0] === ':' || a[1] === ':')){
        if(a[0] === ':'){ const keep = []; for(let j=1;j<=x.c;j++) if(!C.includes(j)) keep.push(j); return indexValue(x, [':', rowVec(keep)], false); }
        const keep = []; for(let i=1;i<=x.r;i++) if(!R.includes(i)) keep.push(i); return indexValue(x, [rowVec(keep), ':'], false);
      }
      if(v.r*v.c !== 1 && v.r*v.c !== R.length*C.length) err(`Unable to perform assignment because the size of the left side is ${R.length}-by-${C.length} and the size of the right side is ${v.r}-by-${v.c}.`);
      const nr = Math.max(x.r, ...R), nc = Math.max(x.c, ...C);
      const n = mkNum(nr, nc); for(let j=0;j<x.c;j++) for(let i=0;i<x.r;i++) n.d[j*nr + i] = x.d[j*x.r + i];
      let k = 0; for(const j of C) for(const i of R){ n.d[(j-1)*nr + (i-1)] = v.r*v.c === 1 ? v.d[0] : v.d[k]; k++; }
      x = n;
    } else err('Only one or two indices are supported here.');
    if(isChar) return mkChar(String.fromCharCode(...x.d));
    return x;
  }
  function deleteElems(x, list, isChar){
    const drop = new Set(list); const keep = []; for(let i=0;i<x.d.length;i++) if(!drop.has(i+1)) keep.push(x.d[i]);
    const o = x.c === 1 && x.r > 1 ? colVec(keep) : rowVec(keep);
    return isChar ? mkChar(String.fromCharCode(...o.d)) : o;
  }
  function linearTarget(v, a){
    if(a.length === 1){ const l = indexList(a[0], v.r*v.c); if(l.length !== 1) err('The sandbox assigns one element at a time here.'); return l[0]; }
    if(a.length === 2){ const i = indexList(a[0], v.r)[0], j = indexList(a[1], v.c)[0]; if(v.r <= 1 && i === 1) return j; return (j-1)*Math.max(v.r,1) + i; }
    err('Only one or two indices are supported here.');
  }

  function showResult(name, v, frame){ if(frame.isBase) print(display(name, v) + '\n'); }

  class Flow { constructor(k){ this.k = k; } }

  function execBlock(stmts, frame){
    for(const st of stmts){
      frame.line = st.line;
      execStmt(st, frame);
    }
  }
  function execStmt(st, frame){
    if(++frame.steps.n > 200000) err('The sandbox stopped this code after 200,000 steps. Check for a loop that never ends.');
    switch(st.k){
      case 'cmd': {
        const args = st.args.map(mkChar);
        const nout = 0;
        if(frame.W.has(st.name)) { // a variable shadows the command word
          const v = frame.W.get(st.name); if(!st.silent) print(display(st.name, v) + '\n'); return; }
        const outs = callFn(st.name, args, nout);
        if(outs.length && !st.silent){ frame.W.set('ans', outs[0]); if(frame.isBase) print(display('ans', outs[0]) + '\n'); else frame.W.set('ans', outs[0]); }
        else if(outs.length) frame.W.set('ans', outs[0]);
        return;
      }
      case 'expr': {
        const e = st.e;
        if(e.k === 'id'){
          const isVar = frame.W.has(e.name);
          const outs = evalId(e, frame, 0);
          if(!outs.length) return;
          if(outs.cs){ outs.forEach(v => { frame.W.set('ans', v); if(!st.silent && frame.isBase) print(display('ans', v) + '\n'); }); return; }
          const v = outs[0];
          if(isVar && !e.chain.length){ if(!st.silent && frame.isBase) print(display(e.name, v) + '\n'); return; }
          frame.W.set('ans', v);
          if(!st.silent && frame.isBase) print(display('ans', v) + '\n');
          return;
        }
        const v = evalExpr(e, frame);
        frame.W.set('ans', v);
        if(!st.silent && frame.isBase) print(display('ans', v) + '\n');
        return;
      }
      case 'assign': {
        const t = st.target;
        let val;
        if(st.rhs.k === 'id'){
          const outs = evalId(st.rhs, frame, 1);
          if(!outs.length) err(`Error using ${st.rhs.name}\nToo many output arguments.`);
          val = outs[0];
          if(outs.cs && outs.length > 1 && frame.isBase) print(`(note: that expression gives ${outs.length} values, one per element; MATLAB keeps only the first. To keep them all, use braces: {...}.)\n`, 'note');
        }
        else val = evalExpr(st.rhs, frame);
        if(!t.chain.length && (B[t.name] || EEGLAB_FN[t.name]) && !frame.W.has(t.name) && frame.isBase) frame.warnShadow = t.name;
        const nv = assignInto(frame.W.get(t.name), t.chain, val, frame);
        frame.W.set(t.name, nv);
        if(!st.silent && frame.isBase) print(display(t.name, nv) + '\n');
        return;
      }
      case 'massign': {
        const rhs = st.rhs;
        if(rhs.k !== 'id') err('Multiple outputs need a function call on the right, as in [m, i] = max(x).');
        const nout = st.targets.length;
        let outs;
        if(frame.W.has(rhs.name)) err('Multiple outputs need a function call on the right, as in [m, i] = max(x).');
        const node = {k:'id', name:rhs.name, chain:rhs.chain};
        outs = evalId(node, frame, nout);
        if(outs.length < st.targets.filter(Boolean).length) err('Too many output arguments.');
        st.targets.forEach((t, k) => {
          if(!t) return;
          const nv = assignInto(frame.W.get(t.name), t.chain, outs[k], frame);
          frame.W.set(t.name, nv);
          if(!st.silent && frame.isBase) print(display(t.name, nv) + '\n');
        });
        return;
      }
      case 'for': {
        const r = evalExpr(st.range, frame);
        const cols = r.t === 'str' ? 1 : r.c;
        for(let j=0; j<cols && r.r*r.c > 0; j++){
          let v;
          if(r.t === 'num'){ if(r.r === 1) v = scalar(r.d[j]); else { v = mkNum(r.r, 1); for(let i=0;i<r.r;i++) v.d[i] = r.d[j*r.r + i]; } if(r.lg) v.lg = true; }
          else if(r.t === 'cell') v = mkCell([r.a[j]]);
          else if(r.t === 'struct') v = mkStruct([r.a[j]]);
          else if(r.t === 'char') v = mkChar(r.s[j]);
          else v = r;
          frame.W.set(st.v, v);
          try{ execBlock(st.body, frame); }
          catch(e){ if(e instanceof Flow){ if(e.k === 'break') break; if(e.k === 'continue') continue; } throw e; }
        }
        return;
      }
      case 'while': {
        while(truthy(evalExpr(st.cond, frame))){
          try{ execBlock(st.body, frame); }
          catch(e){ if(e instanceof Flow){ if(e.k === 'break') break; if(e.k === 'continue') continue; } throw e; }
        }
        return;
      }
      case 'if': {
        for(const arm of st.arms){ if(truthy(evalExpr(arm.cond, frame))){ execBlock(arm.body, frame); return; } }
        if(st.other) execBlock(st.other, frame);
        return;
      }
      case 'break': case 'continue': throw new Flow(st.k);
      case 'return': throw new Flow('return');
    }
  }

  function runProgram(src, W, info){
    const toks = tokenize(src, cmdWord);
    const p = new Parser(toks);
    const prog = p.program();
    const frame = {W, isBase: W === S.W, endStack: [], steps:{n:0}, line: 0, file: info && info.file};
    try{ execBlock(prog, frame); }
    catch(e){ if(e instanceof Flow){ if(e.k === 'return') return; err(`A ${e.k.toUpperCase()} statement appeared outside a loop.`); } if(e instanceof MErr && info && info.file && !e.inFile){ e.inFile = true; e.message += `\n\nError in ${info.file} (line ${frame.line})`; } throw e; }
    if(frame.warnShadow){ const n = frame.warnShadow; print(`(note: the variable ${n} now hides the function ${n}. Type clear ${n} to get the function back.)\n`, 'note'); }
  }

  /* --------------------------------------------------------- public -- */
  function run(src, opts2){
    opts2 = opts2 || {};
    S.lastErr = null;
    if(!opts2.noHistory && src.trim()) S.hist.push(src);
    try{ runProgram(src, S.W, opts2.file ? {file: opts2.file} : null); }
    catch(e){
      if(!(e instanceof MErr)){ console.error(e); e = new MErr('The sandbox hit an internal problem with that line. Try writing it another way.'); }
      S.lastErr = e;
      print(e.message.replace(/\n?$/, '\n'), 'err');
    }
    emit({k:'run', src, err:S.lastErr});
    return !S.lastErr;
  }
  function writeFile(absOrRel, text){
    const abs = resolve(absOrRel); const dirAbs = abs.slice(0, abs.lastIndexOf('/')); const nd = node(dirAbs);
    if(!nd || nd.type !== 'dir') err(`The folder ${dirAbs} does not exist.`);
    const name = baseName(abs);
    nd.kids[name] = file({text, bytes: text.length, fresh:true});
    emit({k:'fs'});
    return abs;
  }
  function readFile(p){ const n = node(resolve(p)); return n && n.type === 'file' ? n.text : null; }

  return {
    S, run, print: (s, c) => print(s, c), setOutput(f){ outFn = f; }, on(f){ listeners.push(f); },
    resolve, node, listing: (abs) => { const n = node(abs); return n && n.type === 'dir' ? Object.keys(n.kids).sort((x,y) => x.toLowerCase() < y.toLowerCase() ? -1 : 1).map(k => ({name:k, isdir: n.kids[k].type === 'dir', fresh: !!n.kids[k].fresh})) : []; },
    short, writeFile, readFile, sizeStr, classOf, wsValue, display,
    HOME, USERPATH, EEGLAB_DIR,
    setVar(n, v){ S.W.set(n, v); }, getVar(n){ return S.W.get(n); },
    mk: {scalar, rowVec, colVec, mkNum, mkChar, mkStr, mkCell, mkStruct, empty, logical},
    toJS(v){ if(!v) return undefined; if(v.t === 'num') return v.r*v.c === 1 ? v.d[0] : Array.from(v.d); if(v.t === 'char' || v.t === 'str') return v.s; return v; }
  };
}

/* ================================================================= UI === */
function h(tag, attrs, kids){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){ if(k === 'class') e.className = attrs[k]; else if(k === 'text') e.textContent = attrs[k]; else if(k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
  (kids || []).forEach(c => c && e.append(c));
  return e;
}

function mount(el, opts){
  opts = opts || {};
  const core = MatlabCore(opts);
  const panels = opts.panels || ['folder', 'command', 'workspace'];
  const ui = {};

  const wrap = h('div', {class:'ms-desk' + (panels.includes('editor') ? ' has-editor' : '') + (panels.includes('path') ? ' has-path' : '')});
  el.append(wrap);

  /* Current Folder */
  ui.folder = h('div', {class:'ms-p ms-folder'});
  ui.addr = h('div', {class:'ms-addr', title:'Current folder'});
  ui.flist = h('ul', {class:'ms-flist', 'aria-label':'Files and folders in the current folder. Double-click a folder to open it.'});
  ui.folder.append(h('h4', {text:'Current Folder'}), ui.addr, ui.flist);

  /* Command Window */
  ui.cmd = h('div', {class:'ms-p ms-cmd'});
  ui.cw = h('pre', {class:'ms-cw', 'aria-live':'polite', tabindex:'0'});
  ui.cin = h('input', {class:'ms-cin', type:'text', autocomplete:'off', autocapitalize:'off', spellcheck:'false', 'aria-label':'Command Window input. Type a command and press Enter.'});
  const prompt = h('label', {class:'ms-prompt', text:'>>'});
  ui.cmd.append(h('h4', {text:'Command Window'}), ui.cw, h('div', {class:'ms-inrow'}, [prompt, ui.cin]));
  ui.cmd.addEventListener('click', e => { if(!window.getSelection().toString() && e.target !== ui.cin) ui.cin.focus(); });

  /* Workspace */
  ui.ws = h('div', {class:'ms-p ms-ws'});
  ui.wsb = h('tbody');
  ui.wsEmpty = h('div', {class:'ms-empty', text:'(empty)'});
  ui.ws.append(h('h4', {text:'Workspace'}), h('div', {class:'ms-wswrap'}, [h('table', {}, [h('thead', {}, [h('tr', {}, ['Name','Value','Size','Class'].map(t => h('th', {text:t})))]), ui.wsb]), ui.wsEmpty]));

  /* Editor (optional) */
  if(panels.includes('editor')){
    ui.ed = h('div', {class:'ms-p ms-ed'});
    ui.edName = h('span', {class:'ms-edname'});
    ui.ta = h('textarea', {class:'ms-ta', spellcheck:'false', autocapitalize:'off', autocomplete:'off', 'aria-label':'Editor'});
    ui.gutter = h('pre', {class:'ms-gut', 'aria-hidden':'true'});
    const runB = h('button', {class:'ms-btn', type:'button', text:'Run', onclick: () => runEditor()});
    const saveB = h('button', {class:'ms-btn ghost', type:'button', text:'Save', onclick: () => saveEditor()});
    ui.edMsg = h('span', {class:'ms-edmsg'});
    ui.ed.append(h('h4', {}, [document.createTextNode('Editor: '), ui.edName]), h('div', {class:'ms-edbox'}, [ui.gutter, ui.ta]), h('div', {class:'ms-edbar'}, [runB, saveB, ui.edMsg]));
    ui.ta.addEventListener('input', () => { gutter(); ui.edMsg.textContent = 'unsaved changes'; });
    ui.ta.addEventListener('scroll', () => { ui.gutter.scrollTop = ui.ta.scrollTop; });
    ui.ta.addEventListener('keydown', e => { if(e.key === 'Tab'){ e.preventDefault(); const s = ui.ta.selectionStart; ui.ta.setRangeText('    ', s, ui.ta.selectionEnd, 'end'); gutter(); } });
  }

  /* Path (optional) */
  if(panels.includes('path')){
    ui.pathP = h('div', {class:'ms-p ms-path'});
    ui.plist = h('ol', {class:'ms-plist'});
    ui.pathP.append(h('h4', {text:'Search path (in order)'}), ui.plist);
  }

  const left = h('div', {class:'ms-col ms-left'}, [ui.folder, ui.pathP, ui.ws]);
  const mid = h('div', {class:'ms-col ms-mid'}, [ui.ed, ui.cmd]);
  wrap.append(left, mid);

  /* output */
  const lines = [];
  function out(s, cls){
    if(!s) return;
    const span = h('span', {class: cls ? 'ms-' + cls : ''}); span.textContent = s;
    ui.cw.append(span);
    while(ui.cw.childNodes.length > 400) ui.cw.removeChild(ui.cw.firstChild);
    ui.cw.scrollTop = ui.cw.scrollHeight;
  }
  core.setOutput(out);

  function renderFolder(){
    ui.addr.textContent = core.short(core.S.cwd);
    ui.addr.title = core.S.cwd;
    ui.flist.innerHTML = '';
    if(core.S.cwd !== '/'){
      const up = h('li', {class:'ms-dir ms-up', tabindex:'0', title:'Up one level (cd ..)'}); up.textContent = '..';
      const go = () => runCmd('cd ..');
      up.addEventListener('dblclick', go); up.addEventListener('keydown', e => { if(e.key === 'Enter') go(); });
      ui.flist.append(up);
    }
    core.listing(core.S.cwd).forEach(f => {
      const li = h('li', {class: (f.isdir ? 'ms-dir' : 'ms-file') + (f.fresh ? ' ms-fresh' : '') + (/\.m$/.test(f.name) ? ' ms-mfile' : ''), tabindex:'0'});
      li.textContent = f.name;
      if(f.isdir){ li.title = 'Double-click to open (cd ' + f.name + ')'; const go = () => runCmd('cd ' + (f.name.includes(' ') ? `'${f.name}'` : f.name)); li.addEventListener('dblclick', go); li.addEventListener('keydown', e => { if(e.key === 'Enter') go(); }); }
      else if(/\.m$/.test(f.name) && ui.ta){ li.title = 'Double-click to open in the Editor'; const op = () => openInEditor(core.S.cwd + '/' + f.name); li.addEventListener('dblclick', op); li.addEventListener('keydown', e => { if(e.key === 'Enter') op(); }); }
      ui.flist.append(li);
    });
  }
  function renderWS(){
    ui.wsb.innerHTML = '';
    const names = [...core.S.W.keys()].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
    ui.wsEmpty.style.display = names.length ? 'none' : 'block';
    names.forEach(n => {
      const v = core.S.W.get(n);
      const tr = h('tr', {}, [h('td', {class:'n', text:n}), h('td', {text:core.wsValue(v), title:core.wsValue(v)}), h('td', {text:core.sizeStr(v)}), h('td', {text:core.classOf(v)})]);
      if(lastChanged.has(n)) tr.classList.add('ms-flash');
      ui.wsb.append(tr);
    });
    lastChanged.clear();
  }
  function renderPath(){
    if(!ui.plist) return;
    ui.plist.innerHTML = '';
    const cwdLi = h('li', {class:'ms-cwdp'}); cwdLi.textContent = core.short(core.S.cwd) + '  (current folder, checked first)';
    ui.plist.append(cwdLi);
    core.S.path.forEach(p => { const li = h('li'); li.textContent = core.short(p); if(p.includes('eeglab')) li.classList.add('ms-eeg'); ui.plist.append(li); });
    ui.plist.append(h('li', {class:'ms-builtin', text:"MATLAB's own toolbox folders"}));
  }
  let snapshot = new Map();
  const lastChanged = new Set();
  function diffWS(){
    const now = new Map(); core.S.W.forEach((v, k) => now.set(k, v));
    now.forEach((v, k) => { if(snapshot.get(k) !== v) lastChanged.add(k); });
    snapshot = now;
  }
  core.on(ev => {
    if(ev.k === 'clc'){ ui.cw.textContent = ''; }
    if(ev.k === 'fs') renderFolder();
    if(ev.k === 'path') renderPath();
    if(ev.k === 'edit' && ui.ta){ const nm = ev.name || 'untitled'; openInEditor(core.resolve(/\.m$/.test(nm) ? nm : nm + '.m'), true); }
  });

  /* command history */
  let hi = -1, draft = '';
  function runCmd(src, silentEcho){
    if(!silentEcho) out('>> ' + src + '\n', 'in');
    core.run(src);
    hi = -1;
    after(src);
  }
  function after(src){
    diffWS(); renderWS(); renderFolder(); renderPath(); checkTasks(src);
    if(opts.onRun) opts.onRun(src, core);
  }
  ui.cin.addEventListener('keydown', e => {
    const H = core.S.hist;
    if(e.key === 'Enter'){ e.preventDefault(); const v = ui.cin.value; ui.cin.value = ''; if(!v.trim()){ out('>> \n', 'in'); return; } runCmd(v); }
    else if(e.key === 'ArrowUp'){ if(!H.length) return; e.preventDefault(); if(hi === -1){ draft = ui.cin.value; hi = H.length; } hi = Math.max(0, hi-1); ui.cin.value = H[hi]; setTimeout(() => ui.cin.setSelectionRange(ui.cin.value.length, ui.cin.value.length)); }
    else if(e.key === 'ArrowDown'){ if(hi === -1) return; e.preventDefault(); hi++; if(hi >= H.length){ hi = -1; ui.cin.value = draft; } else ui.cin.value = H[hi]; }
    else if(e.key === 'l' && e.ctrlKey){ e.preventDefault(); ui.cw.textContent = ''; }
  });

  /* editor */
  let edPath = null;
  function gutter(){ if(!ui.ta) return; const n = ui.ta.value.split('\n').length; ui.gutter.textContent = Array.from({length:n}, (_, i) => i+1).join('\n'); }
  function openInEditor(abs, create){
    let text = core.readFile(abs);
    if(text === null || text === undefined){ if(!create){ out(`Cannot open ${abs}\n`, 'err'); return; } text = ''; }
    edPath = abs; ui.edName.textContent = abs.split('/').pop(); ui.ta.value = text; gutter(); ui.edMsg.textContent = '';
  }
  function saveEditor(){
    if(!edPath) return;
    try{ core.writeFile(edPath, ui.ta.value); ui.edMsg.textContent = 'saved to ' + core.short(edPath.slice(0, edPath.lastIndexOf('/'))); renderFolder(); after('%save ' + edPath); }
    catch(e){ ui.edMsg.textContent = e.message; }
  }
  function runEditor(){
    if(!edPath) return;
    const name = edPath.split('/').pop().replace(/\.m$/, '');
    saveEditor();
    const text = ui.ta.value;
    if(/^\s*function\b/.test(text.replace(/^(\s*%.*\n)*/, ''))){
      out(`>> ${name}\n`, 'in');
      out(`(${name}.m is a function file. Call it from the Command Window with its inputs, for example ${name}(...).)\n`, 'note');
      after('%runfn ' + name); return;
    }
    const dirAbs = edPath.slice(0, edPath.lastIndexOf('/'));
    const onPath = dirAbs === core.S.cwd || core.S.path.includes(dirAbs);
    if(!onPath){ out(`>> ${name}\n`, 'in'); out(`${name}.m is not in the current folder or on the path. In MATLAB, the Run button would offer to change folder; here, cd to ${core.short(dirAbs)} first.\n`, 'err'); after('%run ' + name); return; }
    out(`>> ${name}\n`, 'in');
    core.run(text, {file: name, noHistory:true});
    after('%run ' + name);
  }
  if(ui.ta && opts.editorFile){
    const abs = core.resolve(opts.editorFile.path);
    core.writeFile(abs, opts.editorFile.text);
    if(opts.editorFile.fresh === false){ const n = core.node(abs); if(n) n.fresh = false; }
    openInEditor(abs);
  }

  /* tasks */
  let tasksEl = null, taskItems = [];
  if(opts.tasks && opts.tasks.length && opts.tasksEl){
    tasksEl = opts.tasksEl;
    tasksEl.innerHTML = '';
    const ol = h('ol', {class:'ms-tasks'});
    taskItems = opts.tasks.map((t, k) => {
      const li = h('li', {class:'ms-task'});
      const box = h('span', {class:'ms-check', 'aria-hidden':'true'});
      const txt = h('span', {class:'ms-ttext'}); txt.innerHTML = t.text;
      li.append(box, txt);
      if(t.hint){ const hb = h('button', {class:'ms-hint', type:'button', text:'show me'}); hb.addEventListener('click', () => { ui.cin.value = t.hint; ui.cin.focus(); }); li.append(hb); }
      ol.append(li);
      return {t, li, done:false};
    });
    const count = h('p', {class:'ms-count'});
    tasksEl.append(ol, count);
    taskItems.count = count;
    updateCount();
  }
  function updateCount(){ if(taskItems.count){ const d = taskItems.filter(x => x.done).length; taskItems.count.textContent = d === taskItems.length ? `All ${d} done.` : `${d} of ${taskItems.length} done`; } }
  function checkTasks(src){
    if(!taskItems.length) return;
    const ctx = {src: (src || '').trim(), err: core.S.lastErr, core, W: core.S.W, cwd: core.S.cwd, path: core.S.path, v: n => core.toJS(core.S.W.get(n)), has: n => core.S.W.has(n), raw: n => core.S.W.get(n)};
    taskItems.forEach(it => {
      if(it.done) return;
      let ok = false; try{ ok = !!it.t.check(ctx); }catch(e){ ok = false; }
      if(ok){ it.done = true; it.li.classList.add('done'); }
    });
    updateCount();
  }

  renderFolder(); renderWS(); renderPath();
  if(opts.greeting !== false) out((opts.greeting || 'This is a practice copy of MATLAB. It knows a small part of the language. Type a command after >> and press Enter.') + '\n\n', 'note');
  if(opts.setup){ core.setOutput(() => {}); opts.setup.forEach(line => core.run(line, {noHistory:true})); core.setOutput(out); }
  if(opts.setup) { snapshot = new Map(core.S.W); renderWS(); renderFolder(); renderPath(); }
  if(opts.startCwd) { core.S.cwd = core.resolve(opts.startCwd); renderFolder(); renderPath(); }

  const api = {
    core, run: (src) => { runCmd(src); ui.cin.focus({preventScroll:true}); },
    type: (src) => { ui.cin.value = src; ui.cin.focus(); },
    reset(){ el.innerHTML = ''; return mount(el, opts); },
    out
  };
  return api;
}

const MatlabSim = {mount, MatlabCore};
if(typeof module !== 'undefined' && module.exports) module.exports = MatlabSim;
else root.MatlabSim = MatlabSim;
})(typeof window !== 'undefined' ? window : globalThis);
