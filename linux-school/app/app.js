/* self-upgrade: движок платформы. Курсы читаются из courses/<id>/*.json (или из window.COURSE_INLINE). */
(function () {
  'use strict';

  /* ---------- утилиты ---------- */
  const el = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dayKey = (t) => { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const DAY = 86400000;
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };

  /* ---------- хранилище ---------- */
  const KEY = 'linux-school-v1';
  let mem = null;
  const fresh = () => ({ v: 1, items: {}, topics: {}, exams: {}, notes: {}, log: [], days: [], daily: null, last: null, theme: 'auto' });
  function load() {
    try { const r = localStorage.getItem(KEY); if (r) { const o = JSON.parse(r); if (o && o.v === 1) return Object.assign(fresh(), o); } } catch (e) { /* без хранилища */ }
    return mem || fresh();
  }
  let S = load();
  function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ничего */ } }
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
  }

  /* ---------- курс ---------- */
  let C = null, ALL = [], IDX = {}, TOPICS = {};
  const SESS = new Set(['choice', 'flip', 'assemble', 'output', 'case', 'explain', 'tour']);
  const DAILY = new Set(['choice', 'flip', 'assemble', 'output']);
  const EXAM = new Set(['choice', 'assemble', 'output']);

  async function loadCourse() {
    if (window.COURSE_INLINE) return window.COURSE_INLINE;
    const base = 'courses/linux/';
    const idx = await (await fetch(base + 'course.json')).json();
    idx.platform = await fetch('courses/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const parts = await Promise.all(idx.layers.map((l) => fetch(base + l.file).then((r) => r.json())));
    idx.layers.forEach((l, i) => { l.topics = parts[i].topics; });
    const opt = (f) => fetch(base + f).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const [rc, cm, sc] = await Promise.all([opt('recipes.json'), opt('commands.json'), opt('scripts.json')]);
    idx.recipes = rc.recipes || {}; idx.commands = cm.commands || []; idx.scripts = sc.scripts || [];
    idx.extracts = (await opt('extracts.json')).extracts || [];
    idx.sapr = await fetch('courses/sapr/tests.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return idx;
  }
  function index() {
    ALL = []; IDX = {}; TOPICS = {};
    C.layers.forEach((l) => l.topics.forEach((t) => {
      t.layer = l.n; TOPICS[t.id] = t;
      t.items.forEach((it) => { const r = { it, topic: t, layer: l }; ALL.push(r); IDX[it.id] = r; });
    }));
  }

  /* ---------- повторение (коробки Лейтнера) ---------- */
  const INTERVAL = [0, 1, 3, 7, 16];
  function record(id, ok) {
    const r = S.items[id] || (S.items[id] = { box: 0, due: 0, seen: 0, wrong: 0 });
    r.seen++; r.at = Date.now();
    if (ok) r.box = Math.min(5, r.box ? r.box + 1 : 2); else { r.box = 1; r.wrong++; }
    r.due = Date.now() + INTERVAL[r.box - 1] * DAY;
    S.log.push([Date.now(), id, ok ? 1 : 0]);
    if (S.log.length > 3000) S.log = S.log.slice(-3000);
    const k = dayKey(); if (!S.days.includes(k)) S.days.push(k);
    save(); syncSoon();
  }
  function setLearned(id) { S.items[id] = { box: 5, due: Date.now() + 16 * DAY, seen: 1, wrong: 0, at: Date.now() }; const k = dayKey(); if (!S.days.includes(k)) S.days.push(k); save(); }
  const learned = (id) => !!S.items[id] && S.items[id].box >= 4;
  function topicStat(t) { const n = t.items.length; const l = t.items.filter((i) => learned(i.id)).length; return { n, l, pct: n ? Math.round(l * 100 / n) : 0 }; }
  function layerStat(l) { let n = 0, k = 0; l.topics.forEach((t) => { const s = topicStat(t); n += s.n; k += s.l; }); return { n, l: k, pct: n ? Math.round(k * 100 / n) : 0 }; }
  const heatClass = (p) => (p >= 67 ? 'a3' : p >= 34 ? 'a2' : p > 0 ? 'a1' : '');
  function streak() {
    const set = new Set(S.days); let d = Date.now(); if (!set.has(dayKey(d))) d -= DAY;
    let n = 0; while (set.has(dayKey(d))) { n++; d -= DAY; } return n;
  }
  function dueCount() { const now = Date.now(); return ALL.filter((r) => DAILY.has(r.it.type) && S.items[r.it.id] && S.items[r.it.id].due <= now).length; }
  function mistakes() { return ALL.filter((r) => SESS.has(r.it.type) && r.it.type !== 'tour' && r.it.type !== 'explain' && S.items[r.it.id] && S.items[r.it.id].wrong > 0 && S.items[r.it.id].box < 4); }
  function passedLayers() { return C.layers.filter((l) => S.exams[l.n] && S.exams[l.n].best >= 80).length; }
  function rank() { const p = passedLayers(); return p >= 6 ? 'Системщик' : p >= 3 ? 'Наладчик' : p >= 1 ? 'Практик' : 'Новичок'; }

  function pickDaily(n) {
    const now = Date.now();
    const pool = ALL.filter((r) => DAILY.has(r.it.type));
    const due = pool.filter((r) => S.items[r.it.id] && S.items[r.it.id].due <= now).sort((a, b) => S.items[a.it.id].due - S.items[b.it.id].due);
    let pick = due.slice(0, n);
    if (pick.length < n) {
      const visited = pool.filter((r) => !S.items[r.it.id] && S.topics[r.topic.id]);
      const any = pool.filter((r) => !S.items[r.it.id]);
      pick = pick.concat((visited.length ? visited : any).slice(0, n - pick.length));
    }
    if (pick.length < n) pick = pick.concat(shuffle(pool.filter((r) => !pick.includes(r))).slice(0, n - pick.length));
    return pick.map((r) => r.it);
  }

  /* ---------- общие кусочки интерфейса ---------- */
  const app = () => document.getElementById('app');
  function srcChips(ids) {
    return el('div', { class: 'srcs' }, (ids || []).map((id) => { const s = C.sources[id]; return s ? el('a', { href: s.url, target: '_blank', rel: 'noopener', title: s.lic }, s.title) : null; }));
  }
  function meter(p, cls) { return el('div', { class: 'meter ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, p)) + '%' })); }

  /* ---------- виды заданий ---------- */
  function nextRow(host, ok, finish, label) {
    const b = el('button', { class: 'btn pri', type: 'button', onclick: () => finish(ok) }, label || 'Дальше');
    host.append(el('div', { class: 'row' }, b)); b.focus({ preventScroll: true });
  }
  function choiceUI(host, cfg, o, onResult, whyEl) {
    const order = shuffle(cfg.opts.map((_, i) => i));
    const box = el('div', { class: 'opts' }), fb = el('div', { class: 'fb', 'aria-live': 'polite' });
    let done = false;
    order.forEach((i) => {
      const b = el('button', { class: 'btn', type: 'button' }, cfg.opts[i]);
      b.onclick = () => {
        if (done) return; done = true;
        const ok = i === cfg.a;
        [...box.children].forEach((x, j) => { x.disabled = true; if (order[j] === cfg.a) x.classList.add('good'); });
        if (!ok) b.classList.add('badc');
        fb.className = 'fb ' + (ok ? 'ok' : 'bad');
        fb.textContent = (ok ? 'Верно. ' : 'Не совсем. ') + (o.exam ? '' : cfg.why || '');
        onResult(ok);
      };
      box.append(b);
    });
    host.append(box, fb);
  }
  function rChoice(it, host, o, finish) { host.append(el('div', { class: 'qtext' }, it.q)); choiceUI(host, it, o, (ok) => nextRow(host, ok, finish)); }
  function rOutput(it, host, o, finish) { host.append(el('div', { class: 'qtext' }, it.q), el('pre', { class: 'out' }, it.out)); choiceUI(host, it, o, (ok) => nextRow(host, ok, finish)); }
  function rFlip(it, host, o, finish) {
    const card = el('button', { class: 'flipcard', type: 'button' });
    let shown = false;
    const draw = () => { card.innerHTML = ''; if (!shown) card.append(el('div', {}, el('div', { class: 'cmd' }, it.cmd), el('span', { class: 'hint' }, 'вспомните смысл и нажмите, чтобы проверить'))); else card.append(el('div', {}, it.mean)); };
    const grade = el('div', { class: 'row' }, el('button', { class: 'btn good', type: 'button', onclick: () => finish(true) }, 'Знаю'), el('button', { class: 'btn badc', type: 'button', onclick: () => finish(false) }, 'Не помню'));
    grade.hidden = true;
    card.onclick = () => { shown = !shown; draw(); grade.hidden = !shown; };
    draw(); host.append(card, grade);
  }
  function rAssemble(it, host, o, finish) {
    host.append(el('div', { class: 'qtext' }, it.q));
    let line = []; let done = false;
    const lineEl = el('div', { class: 'cmdline', 'aria-live': 'polite' }), pool = el('div', { class: 'chips' }), fb = el('div', { class: 'fb' });
    const toks = shuffle(it.tokens.map((t, i) => ({ t, i })));
    const draw = () => {
      lineEl.textContent = line.map((x) => x.t).join(' ');
      [...pool.children].forEach((b, k) => { b.disabled = done || line.some((x) => x.i === toks[k].i); });
    };
    toks.forEach((x) => pool.append(el('button', { class: 'btn', type: 'button', onclick: () => { if (done) return; line.push(x); draw(); } }, x.t)));
    const check = el('button', { class: 'btn pri', type: 'button', onclick: () => {
      if (done || !line.length) return; done = true;
      const ok = line.map((x) => x.t).join(' ') === it.answer.join(' ');
      fb.className = 'fb ' + (ok ? 'ok' : 'bad');
      fb.textContent = ok ? 'Верно. ' + (o.exam ? '' : it.why) : 'Не совсем. Правильно: ' + it.answer.join(' ') + '. ' + (o.exam ? '' : it.why);
      draw(); controls.hidden = true; nextRow(host, ok, finish);
    } }, 'Проверить');
    const back = el('button', { class: 'btn', type: 'button', onclick: () => { if (!done) { line.pop(); draw(); } } }, 'Убрать последнее');
    const reset = el('button', { class: 'btn', type: 'button', onclick: () => { if (!done) { line = []; draw(); } } }, 'Сначала');
    const controls = el('div', { class: 'row' }, check, back, reset);
    host.append(lineEl, pool, controls, fb); draw();
  }
  function rCase(it, host, o, finish) {
    let k = 0, errors = 0;
    host.append(el('div', { class: 'ctag' }, 'Разбор случая' + (it.real ? ' из практики' : '')), el('h2', {}, it.title));
    const area = el('div', { class: 'runner' }); host.append(area);
    const step = () => {
      area.innerHTML = '';
      if (k >= it.steps.length) { area.append(el('div', { class: 'note' }, el('b', {}, 'Вывод'), el('div', {}, it.moral))); nextRow(area, errors === 0, finish); return; }
      const s = it.steps[k];
      area.append(el('div', { class: 'eyebrow' }, 'Шаг ' + (k + 1) + ' из ' + it.steps.length), el('div', { class: 'note' }, s.sit), el('div', { class: 'qtext' }, s.q));
      choiceUI(area, s, o, (ok) => { if (!ok) errors++; const b = el('button', { class: 'btn pri', type: 'button', onclick: () => { k++; step(); } }, k + 1 >= it.steps.length ? 'К выводу' : 'Дальше'); area.append(el('div', { class: 'row' }, b)); });
    };
    step();
  }
  function rExplain(it, host, o, finish) {
    host.append(el('div', { class: 'ctag' }, 'Объясни своими словами'), el('div', { class: 'qtext' }, it.q));
    const ta = el('textarea', { class: 'own', placeholder: 'Напишите своими словами, затем сверьтесь с опорными мыслями', id: 'own-' + it.id });
    const pts = el('div', { class: 'sum' }); pts.hidden = true;
    const checks = it.points.map((p) => { const c = el('input', { type: 'checkbox' }); pts.append(el('label', { class: 'check' }, c, el('span', {}, p))); return c; });
    const fin = el('div', { class: 'row' }, el('button', { class: 'btn pri', type: 'button', onclick: () => finish(checks.every((c) => c.checked)) }, 'Готово'));
    fin.hidden = true;
    const show = el('button', { class: 'btn', type: 'button', onclick: () => { pts.hidden = false; fin.hidden = false; show.hidden = true; } }, 'Показать опорные мысли');
    host.append(ta, show, el('div', { class: 'small muted' }, 'Отметьте мысли, которые вы назвали сами. Если отмечены все, тема засчитывается.'), pts, fin);
  }
  function rTour(it, host, o, finish) {
    host.append(el('div', { class: 'ctag' }, 'Экскурсия'), el('h2', {}, it.title), el('div', { class: 'small muted' }, 'Выполните команды на своём компьютере с ALT (или в учебном терминале) и сверьте с описанием. Отметьте, когда посмотрели.'));
    const list = el('div', { class: 'sum' }); const checks = [];
    it.items.forEach((x) => { const c = el('input', { type: 'checkbox' }); checks.push(c); list.append(el('label', { class: 'check' }, c, el('span', {}, el('b', { class: 'mono' }, x.p), ' — ', x.d, el('br'), el('code', {}, x.cmd)))); });
    const b = el('button', { class: 'btn pri', type: 'button', onclick: () => { if (checks.every((c) => c.checked)) finish(true); else b.textContent = 'Отметьте все пункты'; } }, 'Готово');
    host.append(list, el('div', { class: 'row' }, b));
  }
  const RENDER = { choice: rChoice, output: rOutput, flip: rFlip, assemble: rAssemble, case: rCase, explain: rExplain, tour: rTour };

  /* ---------- сессия заданий ---------- */
  function runSession(host, queue, cfg) {
    let i = 0, ok = 0; const wrong = [];
    function step() {
      host.innerHTML = '';
      if (i >= queue.length) return end();
      const it = queue[i];
      host.append(el('div', { class: 'sess' }, el('span', {}, cfg.title), el('span', {}, (i + 1) + ' / ' + queue.length)), meter(i * 100 / queue.length));
      const box = el('div', { class: 'runner' }); host.append(box);
      RENDER[it.type](it, box, cfg, (res) => { record(it.id, res); if (res) ok++; else wrong.push(it); i++; step(); });
      window.scrollTo(0, 0);
    }
    function end() {
      const pct = queue.length ? Math.round(ok * 100 / queue.length) : 0;
      const sum = el('div', { class: 'sect' }, el('h2', {}, cfg.exam ? 'Итог экзамена' : 'Итог'), el('div', { class: 'stat' }, el('div', {}, el('b', {}, ok + ' из ' + queue.length), el('span', {}, 'верно')), el('div', {}, el('b', {}, pct + '%'), el('span', {}, 'точность'))));
      if (cfg.exam) {
        const prev = S.exams[cfg.layer] || { best: 0 }; S.exams[cfg.layer] = { best: Math.max(prev.best, pct), at: Date.now() }; save();
        sum.append(el('div', { class: 'note' }, pct >= 80 ? 'Экзамен сдан. Слой отмечен на главной.' : 'Нужно 80% и выше. Повторите темы, где были ошибки, и попробуйте снова.'));
      }
      if (cfg.onFinish) cfg.onFinish(pct);
      if (wrong.length) {
        const w = el('div', { class: 'sum' }, el('h3', {}, 'Ошибки'));
        wrong.forEach((it) => w.append(el('div', { class: 'card' }, el('div', {}, it.q || it.cmd || it.title), el('div', { class: 'small muted', html: md(answerText(it)) }))));
        sum.append(w);
      }
      const row = el('div', { class: 'row' });
      if (wrong.length) row.append(el('button', { class: 'btn pri', type: 'button', onclick: () => { i = 0; ok = 0; queue = wrong.splice(0); cfg = Object.assign({}, cfg, { exam: false, title: 'Ошибки' }); step(); } }, 'Повторить ошибки'));
      row.append(el('a', { class: 'btn', href: cfg.back || '#' }, cfg.backLabel || 'На главную'));
      sum.append(row); host.append(sum);
    }
    step();
  }
  function answerText(it) {
    if (it.type === 'choice' || it.type === 'output') return 'Правильно: ' + it.opts[it.a] + '. ' + it.why;
    if (it.type === 'assemble') return 'Правильно: `' + it.answer.join(' ') + '`. ' + it.why;
    if (it.type === 'flip') return '`' + it.cmd + '` — ' + it.mean;
    return it.moral || '';
  }

  /* ---------- экраны ---------- */
  const secOf = (a) => (a === 'home' || a === 'daily' ? 'home' : ['mistakes', 'settings', 'me', 'import'].includes(a) ? 'me' : ['cheats', 'cmds', 'sources', 'lib', 'src', 'scripts', 'script', 'recipes'].includes(a) ? 'lib' : a === 'search' ? 'search' : 'courses');
  function libTabs(active) {
    const t = [['sources', '#lib', 'Источники'], ['cheats', '#cheats', 'Шпаргалки'], ['cmds', '#cmds', 'Команды'], ['scripts', '#scripts', 'Скрипты'], ['recipes', '#recipes', 'Рецепты']];
    const cur = active === 'src' || active === 'lib' ? 'sources' : active === 'script' ? 'scripts' : active;
    return el('div', { class: 'seg', role: 'tablist' }, t.map(([k, h, n]) => el('a', { href: h, class: k === cur ? 'on' : '', role: 'tab' }, n)));
  }
  function layout(active, ...kids) {
    const sec = secOf(active);
    const tabs = [['home', '#', 'Главная', '⌂'], ['courses', '#courses', 'Курсы', '▤'], ['lib', '#lib', 'Библиотека', '❐'], ['me', '#me', 'Я' + (mistakes().length ? ' · ' + mistakes().length : ''), '◔']];
    const root = app(); root.innerHTML = '';
    if (sec === 'lib') kids = [libTabs(active)].concat(kids);
    root.append(el('div', { class: 'top' },
      el('a', { class: 'brand', href: '#' }, '~/self-upgrade', el('span', { class: 'cur', 'aria-hidden': 'true' })),
      el('span', { class: 'sp' }),
      el('a', { class: 'iconbtn', href: '#search', 'aria-label': 'Поиск' }, '⌕')),
      el('main', { class: 'page' }, kids),
      el('nav', { class: 'tabs', 'aria-label': 'Разделы' }, tabs.map(([k, h, n, i]) => el('a', { href: h, class: k === sec ? 'on' : '' }, el('i', { 'aria-hidden': 'true' }, i), n))));
    window.scrollTo(0, 0); requestAnimationFrame(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
  }

  function greeting() { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; }
  function allTopics() { const a = []; C.layers.forEach((l) => l.topics.forEach((t) => a.push(t))); return a; }
  function nextTopic() {
    const all = allTopics();
    const last = S.last && TOPICS[S.last];
    if (last && topicStat(last).pct < 100) return last;
    return all.find((t) => topicStat(t).pct < 100) || all[0];
  }
  function courseTile(c, big) {
    const act = c.status === 'active';
    if (act && c.kind === 'tests') {
      const Q = allQ(), l = Q.filter((q) => learned(q.id)).length, pct = Q.length ? Math.round(l * 100 / Q.length) : 0;
      return el('a', { class: 'card link tile', href: '#tests' }, el('div', { class: 'row' }, el('b', { class: 'mono' }, c.title), el('span', { class: 'sp' }), el('span', { class: 'pill ok' }, 'тесты')),
        el('span', { class: 'small muted' }, c.blurb), meter(pct), el('span', { class: 'small muted' }, 'Выучено вопросов ' + l + ' из ' + Q.length));
    }
    const st = act ? (() => { const n = ALL.length, l = ALL.filter((r) => learned(r.it.id)).length; return { n, l, pct: n ? Math.round(l * 100 / n) : 0 }; })() : null;
    const kids = [el('div', { class: 'row' }, el('b', { class: 'mono' }, c.title), el('span', { class: 'sp' }), el('span', { class: 'pill' + (act ? ' ok' : '') }, act ? 'идёт' : 'скоро'))];
    if (big || act) kids.push(el('span', { class: 'small muted' }, c.blurb));
    if (act) kids.push(meter(st.pct), el('span', { class: 'small muted' }, 'Выучено ' + st.l + ' из ' + st.n));
    return act ? el('a', { class: 'card link tile', href: '#course-' + c.id }, kids) : el('div', { class: 'card tile off' }, kids);
  }

  function viewHome() {
    const due = dueCount(), dn = S.daily && S.daily.date === dayKey();
    const nt = nextTopic(), ts = topicStat(nt), nl = C.layers.find((l) => l.n === nt.layer);
    const wk = el('div', { class: 'wk' }); const ds = new Set(S.days);
    const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    for (let k = 6; k >= 0; k--) { const t = Date.now() - k * DAY; wk.append(el('div', { class: 'wd' }, el('span', {}, names[new Date(t).getDay()]), el('b', { class: (ds.has(dayKey(t)) ? 'a' : '') + (k === 0 ? ' now' : '') }))); }
    const w7 = S.log.filter((x) => x[0] > Date.now() - 7 * DAY);
    layout('home',
      el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, greeting()), el('h1', {}, 'Продолжим'),
        el('p', { class: 'lead' }, streak() ? 'Серия: ' + streak() + ' ' + plural(streak(), 'день', 'дня', 'дней') + ' подряд.' : 'Один короткий подход сегодня запускает серию.')),
      el('a', { class: 'card link hot', href: '#topic-' + nt.id }, el('div', { class: 'eyebrow' }, 'продолжить · ' + nl.id), el('h2', {}, nt.title), meter(ts.pct), el('div', { class: 'row' }, el('span', { class: 'btn pri' }, ts.pct ? 'Продолжить ›' : 'Начать ›'), el('span', { class: 'small muted' }, '~' + nt.min + ' мин'))),
      el('a', { class: 'card link', href: '#daily' }, el('div', { class: 'row' }, el('b', { class: 'mono' }, dn ? 'Пятёрка пройдена' : 'Пятёрка на сегодня'), el('span', { class: 'sp' }), el('span', { class: 'pill' + (due ? ' warn' : '') }, due ? 'повторить ' + due : 'новое')), el('div', { class: 'small muted' }, due ? 'Карточки, которые пора повторить, ждут.' : 'Повторять пока нечего, возьмём новое.'), wk),
      el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'мои курсы'), el('div', { class: 'grid g2' }, (C.platform ? C.platform.courses : [{ id: 'linux', title: 'Linux', blurb: '', status: 'active' }]).map((c) => courseTile(c, false)))),
      el('div', { class: 'small muted' }, w7.length ? 'За неделю ответов: ' + w7.length + ', верных ' + Math.round(w7.filter((x) => x[2]).length * 100 / w7.length) + '%.' : 'За неделю пока нет ответов.'));
  }

  function viewCourses() {
    layout('courses', el('div', { class: 'sect' }, el('h1', {}, 'Курсы'), el('p', { class: 'lead' }, 'Каждый курс устроен одинаково: слои, в слоях темы, в темах конспект, практика, рецепты и источники.')),
      el('div', { class: 'grid' }, (C.platform ? C.platform.courses : []).map((c) => courseTile(c, true))));
  }

  function viewCourse(id, openN) {
    const cur = nextTopic();
    const wantOpen = openN ? +openN : cur.layer;
    const box = el('div', { class: 'sect' });
    C.layers.forEach((l) => {
      const s = layerStat(l), e = S.exams[l.n], done = e && e.best >= 80;
      const d = el('details', { class: 'card layer' + (l.n === wantOpen ? ' cur' : '') });
      if (l.n === wantOpen) d.open = true;
      d.append(el('summary', {}, el('span', { class: 'n' }, l.id), el('div', { class: 't' }, el('b', {}, l.title), el('span', { class: 'small muted' }, l.blurb), meter(s.pct)), el('span', { class: 'pill' + (done ? ' ok' : '') }, done ? 'сдан' : s.pct + '%')));
      const list = el('div', { class: 'tlist' });
      l.topics.forEach((t) => {
        const ts = topicStat(t), isCur = t.id === cur.id;
        list.append(el('a', { class: 'trow' + (isCur ? ' cur' : ''), href: '#topic-' + t.id }, el('span', { class: 'dot ' + (ts.pct >= 100 ? 'd' : isCur ? 'c' : S.topics[t.id] ? 's' : '') }, ts.pct >= 100 ? '✓' : isCur ? '▶' : ''), el('span', { class: 'tt' }, t.title), el('span', { class: 'small muted' }, '~' + t.min + ' мин')));
      });
      d.append(list, el('div', { class: 'row' }, el('a', { class: 'btn' + (done ? '' : ' pri'), href: '#exam-' + l.n }, 'Экзамен слоя'), e ? el('span', { class: 'small muted' }, 'лучший результат ' + e.best + '%') : null));
      box.append(d);
    });
    (C.upcoming || []).forEach((l) => box.append(el('div', { class: 'card layer off' }, el('div', { class: 'row' }, el('span', { class: 'n' }, l.id), el('div', { class: 't' }, el('b', {}, l.title), el('span', { class: 'small muted' }, l.blurb)), el('span', { class: 'pill' }, 'скоро')))));
    const st = layerStat({ topics: allTopics() });
    layout('courses', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', C.title),
      el('div', { class: 'sect' }, el('h1', {}, C.title), el('p', { class: 'lead' }, 'Слои идут от основ к системе. Открыт слой, где вы сейчас.'), meter(st.pct), el('div', { class: 'small muted' }, 'Выучено: ' + st.l + ' из ' + st.n + ' · Звание: ' + rank())),
      box);
  }
  function viewLayer(n) { const l = C.layers.find((x) => x.n === +n); return l ? viewCourse('linux', l.n) : viewHome(); }

  let TAB = 'read';
  function viewTopic(id) {
    const t = TOPICS[id]; if (!t) return viewHome();
    if (!S.topics[id]) S.topics[id] = { seen: Date.now() };
    S.last = id; save();
    const l = C.layers.find((x) => x.n === t.layer);
    const rs = (t.recipes || []).map((rid) => (C.recipes || {})[rid]).filter(Boolean);
    const xs = (C.extracts || []).filter((e) => e.topics.indexOf(id) >= 0);
    const labs = t.items.filter((i) => i.type === 'lab'), rest = t.items.filter((i) => i.type !== 'lab');
    const st = topicStat(t);
    const body = el('div', { class: 'tabbody' });
    const seg = el('div', { class: 'seg', role: 'tablist' });
    const defs = [['read', 'Читать'], ['practice', 'Практика'], ['alt', 'Альта' + (rs.length ? ' ' + rs.length : '')], ['src', 'Источники' + (xs.length ? ' ' + xs.length : '')]];

    const readTab = () => {
      const k = [el('div', { class: 'read' }, t.read.map((p) => el('p', { html: md(p) })))];
      (t.blocks || []).forEach((b) => k.push(blockUI(b)));
      k.push(el('div', { class: 'row' }, el('button', { class: 'btn pri', type: 'button', onclick: () => show('practice') }, 'К практике ›')));
      return k;
    };
    const practiceTab = () => {
      const row = el('div', { class: 'row' }, el('a', { class: 'btn pri', href: '#practice-' + id }, 'Практика (' + rest.length + ')'));
      labs.forEach((lb) => row.append(el('a', { class: 'btn' + (learned(lb.id) ? ' good' : ''), href: '#lab-' + lb.id }, '> ' + lb.title + (learned(lb.id) ? ' ✓' : ''))));
      const ta = el('textarea', { class: 'own', id: 'note-' + id, placeholder: 'Заметка к теме: что сломалось у вас, какая команда помогла' }); ta.value = S.notes[id] || '';
      let tm; ta.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { S.notes[id] = ta.value; save(); }, 300); };
      return [el('div', { class: 'sect' }, meter(st.pct), el('div', { class: 'small muted' }, 'Выучено: ' + st.l + ' из ' + st.n), row), el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'заметки'), ta)];
    };
    const altTab = () => {
      const k = [];
      if (t.alt) k.push(el('div', { class: 'note alt' }, el('div', { class: 'row' }, el('b', {}, 'В Альте'), el('span', { class: 'pill ' + (t.alt.verified ? 'ok' : 'warn') }, t.alt.verified ? 'из практики' : 'не проверено на ПК')), el('div', { html: md(t.alt.text) })));
      if (rs.length) k.push(el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'рецепты помощника · ' + rs.length), el('p', { class: 'small muted' }, 'Команды с # выполняются от администратора. Рецепты ещё не проверены на живых компьютерах, поэтому сначала читайте и понимайте каждый шаг.'), ...rs.map(recipeUI)));
      if (!k.length) k.push(el('p', { class: 'muted' }, 'Для этой темы пока нет рецептов Альты.'));
      return k;
    };
    const srcTab = () => {
      const k = [];
      if (xs.length) { k.push(el('div', { class: 'eyebrow' }, 'главное из источников')); xs.forEach((e) => k.push(extractCard(e, true))); }
      else k.push(el('p', { class: 'muted' }, 'Выписок по этой теме пока нет. Пришлите материал, и я добавлю.'));
      k.push(el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'все источники темы'), srcChips(t.src)));
      return k;
    };
    const make = { read: readTab, practice: practiceTab, alt: altTab, src: srcTab };
    function show(name) {
      TAB = name;
      [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.k === name));
      body.innerHTML = ''; body.append(...make[name]());
    }
    defs.forEach(([k, n]) => { const b = el('button', { class: 'tabbtn', type: 'button', role: 'tab', onclick: () => show(k) }, n); b.dataset.k = k; seg.append(b); });
    layout('', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#layer-' + l.n }, l.id), ' / ', t.id),
      el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'тема · ~' + t.min + ' мин'), el('h1', {}, t.title)), seg, body);
    show('read');
  }

  const XKIND = { fact: null, diff: ['отличие от ALT', 'warn'], tip: ['совет', 'ok'] };
  function extractCard(e, showSrc) {
    const s = C.sources[e.src] || { title: e.src };
    const kd = XKIND[e.kind];
    return el('div', { class: 'card xcard' },
      el('div', { class: 'row' }, el('a', { class: 'small', href: '#src-' + e.src }, s.title.replace(/^The /, '').split(',')[0]), el('span', { class: 'pill' }, e.loc), kd ? el('span', { class: 'pill ' + kd[1] }, kd[0]) : null),
      el('div', {}, e.text),
      showSrc ? null : el('div', { class: 'row' }, e.topics.map((id) => TOPICS[id] ? el('a', { class: 'pill', href: '#topic-' + id }, id) : null)));
  }

  function viewMe() {
    const boxes = [0, 0, 0, 0, 0, 0]; ALL.forEach((r) => { const s = S.items[r.it.id]; boxes[s ? s.box : 0]++; });
    const total = ALL.length, pass = passedLayers();
    const max = Math.max(1, ...boxes);
    const bars = el('div', { class: 'bars' });
    [['Новые', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5]].forEach(([n, i]) => bars.append(el('div', { class: i >= 4 ? 'hi' : '' }, el('span', { class: 'cnt' }, boxes[i]), el('b', { style: 'height:' + Math.max(4, Math.round(boxes[i] * 100 / max)) + '%' }), el('span', { class: 'lab' }, n))));
    const heat = el('div', { class: 'heat' });
    C.layers.forEach((l) => heat.append(el('div', { class: 'heatrow' }, el('b', {}, l.id), el('div', { class: 'cells' }, l.topics.map((t) => el('a', { class: 'cell ' + heatClass(topicStat(t).pct), href: '#topic-' + t.id, title: t.title + ': ' + topicStat(t).pct + '%', 'aria-label': t.title + ' ' + topicStat(t).pct + '%' }))))));
    const steps = el('div', { class: 'steps', 'aria-hidden': 'true' });
    C.layers.forEach((l) => { const e = S.exams[l.n]; steps.append(el('i', { class: e && e.best >= 80 ? 'd' : 'c' })); });
    const wk = S.log.filter((x) => x[0] > Date.now() - 7 * DAY), wkOk = wk.filter((x) => x[2]).length;
    const per = {}; wk.forEach((x) => { const r = IDX[x[1]]; if (!r) return; const p = per[r.topic.id] || (per[r.topic.id] = [0, 0]); p[0]++; p[1] += x[2]; });
    const weak = Object.entries(per).filter(([, v]) => v[0] >= 3).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0])[0];
    const cfg = syncCfg();
    const m = mistakes().length, due = dueCount();
    layout('me', el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'звание: ' + rank()), el('h1', {}, 'Я')),
      el('div', { class: 'row' }, el('a', { class: 'btn pri', href: '#daily' }, 'Повторить' + (due ? ' ' + due : '')), el('a', { class: 'btn', href: '#mistakes' }, 'Ошибки · ' + m)),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'коробки повторения'), bars, el('div', { class: 'small muted' }, 'Верный ответ двигает карточку вправо, ошибка возвращает в коробку 1. «Выучено» это коробки 4 и 5. Всего карточек: ' + total + '.')),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'уровни'), steps, el('div', { class: 'small muted' }, 'Сдано экзаменов: ' + pass + ' из ' + C.layers.length + '.')),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'карта тем'), heat, el('div', { class: 'small muted' }, 'Чем ярче клетка, тем лучше усвоена тема.')),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'неделя'), el('div', { class: 'stat' }, el('div', {}, el('b', {}, wk.length), el('span', {}, 'ответов')), el('div', {}, el('b', {}, wk.length ? Math.round(wkOk * 100 / wk.length) + '%' : '—'), el('span', {}, 'точность')), el('div', {}, el('b', {}, ALL.filter((r) => learned(r.it.id)).length), el('span', {}, 'выучено'))), el('div', { class: 'small muted' }, weak ? 'Слабее всего за неделю: «' + TOPICS[weak[0]].title + '».' : 'Когда наберётся три ответа по теме, здесь появится слабое место.')),
      el('a', { class: 'card link', href: '#settings' }, el('div', { class: 'row' }, el('b', { class: 'mono' }, 'Синхронизация и настройки'), el('span', { class: 'sp' }), el('span', { class: 'pill' + (cfg.code ? ' ok' : '') }, cfg.code ? 'сервер подключён' : 'не подключена'))));
  }

  function recipeUI(r) {
    const d = el('details', { class: 'card recipe' }, el('summary', {}, r.title, r.verified ? '' : el('span', { class: 'pill warn', style: 'margin-left:8px' }, 'не проверен на ПК')));
    const ol = el('ol', { class: 'rsteps' });
    r.steps.forEach((x) => ol.append(el('li', {}, el('div', {}, el('span', { class: 'pr' }, x.root ? '# ' : '$ '), el('code', {}, x.cmd)), x.why ? el('div', { class: 'small muted' }, x.why) : null)));
    d.append(ol);
    if (r.check) d.append(el('div', { class: 'small' }, el('b', {}, 'Проверка: '), r.check));
    if (r.notes) d.append(el('div', { class: 'small muted', style: 'margin-top:6px' }, r.notes));
    if (r.source) d.append(el('div', { class: 'small muted', style: 'margin-top:6px' }, 'Источник: ' + r.source));
    return d;
  }

  const KIND = { read: ['только читает', 'ok'], change: ['меняет данные', 'warn'], root: ['нужен root', 'warn'], danger: ['опасная', 'bad'] };
  function cmdLearned() { return Object.keys(S.items).filter((k) => k.indexOf('cmd-') === 0 && S.items[k].box >= 4).length; }
  function cmdQueue(cat, n) {
    const all = (C.commands || []).filter((c) => c.what && c.what.length < 90);
    const pool = cat ? all.filter((c) => c.cat === cat) : all;
    const now = Date.now();
    const seen = (c) => S.items['cmd-' + c.name];
    const due = pool.filter((c) => seen(c) && seen(c).due <= now);
    const fresh = shuffle(pool.filter((c) => !seen(c)));
    const rest = shuffle(pool.filter((c) => seen(c) && seen(c).due > now));
    return due.concat(fresh, rest).slice(0, n).map((c) => {
      const same = shuffle(all.filter((x) => x.name !== c.name && x.what !== c.what && x.cat === c.cat));
      const other = shuffle(all.filter((x) => x.name !== c.name && x.what !== c.what && x.cat !== c.cat));
      const wrong = same.concat(other).slice(0, 3).map((x) => x.what);
      return { id: 'cmd-' + c.name, type: 'choice', q: 'Что делает `' + c.name + '`?', opts: [c.what].concat(wrong), a: 0, why: '`' + c.name + '` ' + c.what + (c.why ? ': ' + c.why : '') + '.' };
    });
  }
  function viewCmds(arg) {
    const cmds = C.commands || [];
    if (arg === 'train' || arg.indexOf('train~') === 0) {
      const cat = arg.indexOf('~') > 0 ? decodeURIComponent(arg.slice(arg.indexOf('~') + 1)) : '';
      layout('cmds', el('div', { class: 'crumbs' }, el('a', { href: '#cmds' }, 'команды'), ' / тренировка'), el('div', { id: 'sess' }));
      return runSession(document.getElementById('sess'), cmdQueue(cat, 10), { title: 'Команды' + (cat ? ' · ' + cat : ''), back: '#cmds', backLabel: 'К справочнику' });
    }
    const cats = [...new Set(cmds.map((c) => c.cat))].sort((a, b) => cmds.filter((c) => c.cat === b).length - cmds.filter((c) => c.cat === a).length);
    let cat = '', q = '';
    const inp = el('input', { class: 'searchbox', type: 'search', placeholder: 'Название команды или слово', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const chips = el('div', { class: 'chips' }), list = el('div', { class: 'cmdlist' }), cnt = el('div', { class: 'small muted' }), tr = el('a', { class: 'btn pri', href: '#cmds-train' }, 'Тренировка');
    const draw = () => {
      [...chips.children].forEach((c) => c.classList.toggle('on', c.dataset.cat === cat));
      const w = q.toLowerCase();
      const rows = cmds.filter((c) => (!cat || c.cat === cat) && (!w || (c.name + ' ' + c.what + ' ' + (c.why || '')).toLowerCase().includes(w)));
      tr.setAttribute('href', cat ? '#cmds-train~' + encodeURIComponent(cat) : '#cmds-train');
      cnt.textContent = 'Показано: ' + rows.length + ' из ' + cmds.length;
      list.innerHTML = '';
      rows.slice(0, 80).forEach((c) => { const k = KIND[c.kind] || [c.kind, '']; list.append(el('div', { class: 'card cmdrow' }, el('div', { class: 'row' }, el('code', {}, c.name), el('span', { class: 'pill ' + k[1] }, k[0]), el('span', { class: 'pill' }, c.cat)), el('div', {}, c.what), c.why ? el('div', { class: 'small muted' }, c.why) : null)); });
      if (rows.length > 80) list.append(el('p', { class: 'small muted' }, 'Показаны первые 80. Уточните поиск или выберите категорию.'));
    };
    [['', 'Все']].concat(cats.map((x) => [x, x])).forEach(([v, t]) => { const b = el('button', { class: 'chip', type: 'button', onclick: () => { cat = v; draw(); } }, t); b.dataset.cat = v; chips.append(b); });
    inp.oninput = () => { q = inp.value.trim(); draw(); };
    draw();
    layout('cmds', el('div', { class: 'sect' }, el('h1', {}, 'Справочник команд'), el('p', { class: 'lead' }, 'Словарь помощника Альты: что делает команда и зачем она нужна. Выучено команд: ' + cmdLearned() + ' из ' + cmds.length + '.')), el('div', { class: 'row' }, tr), inp, chips, cnt, list);
  }

  function blockUI(b) {
    if (b.t === 'scheme') {
      let k = 0; const box = el('div', { class: 'stepsbox' }), cap = el('div', { class: 'caption', 'aria-live': 'polite' });
      const draw = () => { [...box.children].forEach((x, i) => { x.className = 'st' + (i === k ? ' on' : i < k ? ' past' : ''); }); cap.textContent = b.steps[k].d; };
      b.steps.forEach((s) => box.append(el('div', { class: 'st' }, s.h)));
      const prev = el('button', { class: 'btn', type: 'button', onclick: () => { if (k > 0) { k--; draw(); } } }, '‹ Назад');
      const next = el('button', { class: 'btn pri', type: 'button', onclick: () => { k = k < b.steps.length - 1 ? k + 1 : 0; draw(); } }, 'Дальше ›');
      draw(); return el('div', { class: 'card scheme' }, el('div', { class: 'eyebrow' }, 'схема'), el('b', {}, b.title), box, cap, el('div', { class: 'row' }, prev, next));
    }
    if (b.t === 'tree' || b.t === 'parts') {
      const items = b.t === 'tree' ? b.nodes.map((n) => [n.p, n.d]) : b.parts.map((n) => [n.t, n.d]);
      const cap = el('div', { class: 'caption', 'aria-live': 'polite' }), chips = el('div', { class: 'chips' });
      const sel = (i) => { [...chips.children].forEach((c, j) => c.classList.toggle('on', i === j)); cap.textContent = items[i][1]; };
      items.forEach((n, i) => chips.append(el('button', { class: 'chip', type: 'button', onclick: () => sel(i) }, n[0])));
      sel(0);
      return el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, b.t === 'tree' ? 'каталоги' : 'разбор команды'), b.t === 'parts' ? el('div', { class: 'cmdline' }, b.cmd) : el('b', {}, b.title), chips, cap);
    }
    return el('div');
  }

  function viewPractice(id) {
    const t = TOPICS[id]; if (!t) return viewHome();
    layout('', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#topic-' + id }, t.id), ' / практика'), el('div', { id: 'sess' }));
    runSession(document.getElementById('sess'), t.items.filter((i) => i.type !== 'lab'), { title: t.title, back: '#topic-' + id, backLabel: 'К теме' });
  }
  function viewDaily() {
    layout('daily', el('div', { id: 'sess' }));
    runSession(document.getElementById('sess'), pickDaily(5), { title: 'Пятёрка', onFinish: () => { S.daily = { date: dayKey() }; save(); } });
  }
  function viewMistakes() {
    const m = mistakes().slice(0, 10).map((r) => r.it);
    if (!m.length) { layout('mistakes', el('div', { class: 'sect' }, el('h1', {}, 'Тетрадь ошибок'), el('p', { class: 'lead' }, 'Пока пусто. Сюда попадают задания, на которых вы ошиблись, и остаются, пока не окажутся в коробке 4.'))); return; }
    layout('mistakes', el('div', { id: 'sess' }));
    runSession(document.getElementById('sess'), shuffle(m), { title: 'Тетрадь ошибок' });
  }
  function viewExam(n) {
    const l = C.layers.find((x) => x.n === +n); if (!l) return viewHome();
    const q = shuffle(ALL.filter((r) => r.layer.n === l.n && EXAM.has(r.it.type)).map((r) => r.it)).slice(0, 12);
    layout('', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#layer-' + l.n }, l.id), ' / экзамен'), el('div', { id: 'sess' }));
    runSession(document.getElementById('sess'), q, { title: 'Экзамен ' + l.id, exam: true, layer: l.n, back: '#layer-' + l.n, backLabel: 'К слою' });
  }

  function viewLab(id) {
    const r = IDX[id]; if (!r || r.it.type !== 'lab') return viewHome();
    const it = r.it, sb = Sandbox.create(); const done = it.tasks.map(() => false); let finished = false;
    const taskEls = it.tasks.map((t, i) => el('li', {}, el('span', { class: 'm' }, String(i + 1)), el('span', {}, t.text)));
    const term = el('div', { class: 'term', role: 'log', 'aria-live': 'polite' });
    const input = el('input', { type: 'text', id: 'lab-in', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Команда' });
    const prompt = el('span', { class: 'pr' }); const form = el('form', {}, prompt, input);
    const msg = el('div', { class: 'fb', 'aria-live': 'polite' });
    const hist = []; let hp = 0;
    const setPrompt = () => { prompt.textContent = sb.prompt(); };
    const out = (text, cls) => { if (text) term.insertBefore(el('div', { class: 'ln ' + (cls || '') }, text.replace(/\n$/, '')), form); term.scrollTop = term.scrollHeight; };
    const paint = () => taskEls.forEach((e, i) => { e.className = done[i] ? 'done' : ''; e.firstChild.textContent = done[i] ? '✓' : String(i + 1); });
    function check(line, res) {
      const norm = line.trim().replace(/\s+/g, ' ');
      for (let i = 0; i < it.tasks.length; i++) {
        if (done[i]) continue; const t = it.tasks[i]; let pass = false;
        const prevDone = done.slice(0, i).every(Boolean);
        if (t.re) pass = res.ok && new RegExp(t.re).test(norm);
        else if (!prevDone) pass = false; /* задания по состоянию засчитываются по порядку */
        else if (t.cwd) pass = sb.cwd() === t.cwd;
        else if (t.exists) pass = sb.exists(t.exists);
        else if (t.mode) pass = sb.mode(t.mode[0]) === t.mode[1];
        if (pass) done[i] = true;
      }
      paint();
      if (!finished && done.every(Boolean)) { finished = true; setLearned(id); msg.className = 'fb ok'; msg.textContent = 'Лаборатория пройдена.'; msg.after(el('div', { class: 'row' }, el('a', { class: 'btn pri', href: '#topic-' + r.topic.id }, 'К теме'))); }
    }
    form.onsubmit = (ev) => {
      ev.preventDefault(); const line = input.value; input.value = '';
      out(sb.prompt() + line, 'pr'); if (!line.trim()) return;
      hist.push(line); hp = hist.length;
      const res = sb.exec(line);
      if (res.clear) { [...term.querySelectorAll('.ln')].forEach((x) => x.remove()); } else out(res.out, res.ok ? '' : 'er');
      setPrompt(); check(line, res);
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'ArrowUp' && hist.length) { hp = Math.max(0, hp - 1); input.value = hist[hp]; ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { hp = Math.min(hist.length, hp + 1); input.value = hist[hp] || ''; ev.preventDefault(); }
    };
    term.onclick = () => input.focus();
    const hint = el('button', { class: 'btn', type: 'button', onclick: () => { const k = done.findIndex((d) => !d); msg.className = 'fb'; msg.textContent = k < 0 ? 'Все задания выполнены.' : 'Подсказка к заданию ' + (k + 1) + ': ' + it.tasks[k].hint; } }, 'Подсказка');
    term.append(form); setPrompt(); paint();
    layout('', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#topic-' + r.topic.id }, r.topic.id), ' / лаборатория'),
      el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'лаборатория'), el('h1', {}, it.title), el('p', { class: 'lead' }, it.intro)),
      el('ul', { class: 'tasks' }, taskEls), term, el('div', { class: 'row' }, hint, el('span', { class: 'small muted' }, 'Задания по порядку. Учебная система упрощена, вывод отличается от настоящего.')), msg);
  }

  function viewCheats(n) {
    const layerN = n ? +n : 1;
    const row = el('div', { class: 'row' }, C.layers.map((l) => el('a', { class: 'btn' + (l.n === layerN ? ' on' : ''), href: '#cheats-' + l.n }, l.id + ' ' + l.title)));
    const rows = [];
    ALL.filter((r) => r.layer.n === layerN && r.it.type === 'flip').forEach((r) => rows.push([r.it.cmd, r.it.mean, r.topic.title]));
    const tbl = el('div', { class: 'tbl' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Команда'), el('th', {}, 'Что делает'), el('th', {}, 'Тема'))), el('tbody', {}, rows.map((x) => el('tr', {}, el('td', {}, el('code', {}, x[0])), el('td', {}, x[1]), el('td', { class: 'muted' }, x[2]))))));
    const text = rows.map((x) => x[0] + ' — ' + x[1]).join('\n'); const fb = el('span', { class: 'small muted' });
    const copy = el('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); fb.textContent = 'Скопировано'; } catch (e) { fb.textContent = 'Не удалось скопировать'; } } }, 'Скопировать список');
    layout('cheats', el('div', { class: 'sect' }, el('h1', {}, 'Шпаргалки'), el('p', { class: 'lead' }, 'Собираются из карточек курса и всегда актуальны.')), row, tbl, el('div', { class: 'row' }, copy, fb));
  }

  function viewSearch() {
    const inp = el('input', { class: 'searchbox', type: 'search', id: 'q', placeholder: 'Команда, слово или тема', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const res = el('div', { class: 'sect' });
    const strip = (s) => String(s).toLowerCase();
    const docs = ALL.map((r) => ({ r, text: strip([r.it.q, r.it.cmd, r.it.mean, r.it.why, r.it.title, (r.it.opts || []).join(' ')].filter(Boolean).join(' ')) }));
    const tdocs = Object.values(TOPICS).map((t) => ({ t, text: strip(t.title + ' ' + t.read.join(' ')) }));
    inp.oninput = () => {
      const q = strip(inp.value.trim()); res.innerHTML = ''; if (q.length < 2) return; let cm = 0;
      const th = tdocs.filter((d) => d.text.includes(q)).slice(0, 8);
      const ch = docs.filter((d) => d.r.it.type === 'flip' && d.text.includes(q)).slice(0, 8);
      th.forEach((d) => { const i = d.text.indexOf(q); res.append(el('a', { class: 'card link', href: '#topic-' + d.t.id }, el('b', {}, d.t.title), el('span', { class: 'small muted' }, '…' + d.t.read.join(' ').slice(Math.max(0, i - 40), i + 100) + '…'))); });
      ch.forEach((d) => res.append(el('a', { class: 'card link', href: '#topic-' + d.r.topic.id }, el('code', {}, d.r.it.cmd), el('span', { class: 'small muted' }, d.r.it.mean))));
      (C.commands || []).filter((c) => (c.name + ' ' + c.what + ' ' + (c.why || '')).toLowerCase().includes(q)).slice(0, 8).forEach((c) => { cm++; res.append(el('a', { class: 'card link', href: '#cmds' }, el('code', {}, c.name), el('span', { class: 'small muted' }, c.what + ' · справочник'))); });
      if (!th.length && !ch.length && !cm) res.append(el('p', { class: 'muted' }, 'Ничего не найдено.'));
    };
    layout('search', el('div', { class: 'sect' }, el('h1', {}, 'Поиск'), inp), res);
  }

  function srcStatus(s) { return s.provided ? ['материал получен', 'ok'] : s.seen ? ['найдено поиском', ''] : ['ссылка не проверена', 'warn']; }
  function viewSources() {
    const xs = C.extracts || [];
    const cnt = {}; xs.forEach((e) => { cnt[e.src] = (cnt[e.src] || 0) + 1; });
    const uses = {}; const addU = (s, id) => { const a = uses[s] || (uses[s] = []); if (a.indexOf(id) < 0) a.push(id); };
    Object.values(TOPICS).forEach((t) => (t.src || []).forEach((s) => addU(s, t.id))); xs.forEach((e) => e.topics.forEach((id) => addU(e.src, id)));
    const ent = Object.entries(C.sources);
    const got = ent.filter(([, s]) => s.provided).length, need = ent.filter(([, s]) => s.needs_file).length;
    const list = el('div', { class: 'grid' });
    ent.sort((a, b) => (cnt[b[0]] || 0) - (cnt[a[0]] || 0) || (b[1].provided ? 1 : 0) - (a[1].provided ? 1 : 0)).forEach(([id, s]) => {
      const st = srcStatus(s);
      list.append(el('a', { class: 'card link', href: '#src-' + id }, el('div', { class: 'row' }, el('b', {}, s.title), el('span', { class: 'sp' }), el('span', { class: 'pill ' + st[1] }, st[0])),
        el('span', { class: 'small muted' }, s.role), el('span', { class: 'small muted' }, (cnt[id] ? cnt[id] + ' ' + plural(cnt[id], 'выписка', 'выписки', 'выписок') : 'выписок пока нет') + ' · тем: ' + (uses[id] || []).length + (s.needs_file ? ' · нужны ещё страницы' : ''))));
    });
    layout('sources', el('div', { class: 'sect' }, el('h1', {}, 'Библиотека'), el('p', { class: 'lead' }, 'Здесь лежит всё, откуда взяты знания. Откройте источник, чтобы прочитать выписки: ссылки открывать не нужно. Получено материалов: ' + got + (need ? ', ещё нужны страницы: ' + need : '') + '.')), list,
      el('div', { class: 'note' }, el('b', {}, 'Как пополняется библиотека. '), 'Вы присылаете файл или страницу, я делаю выписки своими словами и привязываю к темам. Чужие тексты целиком не копируются.'));
  }
  function viewSource(id) {
    const s = C.sources[id]; if (!s) return viewSources();
    const xs = (C.extracts || []).filter((e) => e.src === id);
    const st = srcStatus(s);
    const q = el('input', { class: 'searchbox', type: 'search', placeholder: 'Поиск по выпискам', autocomplete: 'off', spellcheck: 'false' });
    const list = el('div', { class: 'grid' });
    const draw = () => { const w = q.value.trim().toLowerCase(); list.innerHTML = ''; const rows = xs.filter((e) => !w || (e.loc + ' ' + e.text).toLowerCase().includes(w)); rows.forEach((e) => list.append(extractCard(e, false))); if (!rows.length) list.append(el('p', { class: 'muted' }, xs.length ? 'Ничего не найдено.' : 'Выписок пока нет. Пришлите материал, и я добавлю.')); };
    q.oninput = draw; draw();
    layout('src', el('div', { class: 'crumbs' }, el('a', { href: '#lib' }, 'библиотека'), ' / ', id),
      el('div', { class: 'sect' }, el('h1', {}, s.title), el('div', { class: 'row' }, el('span', { class: 'pill ' + st[1] }, st[0]), s.needs_file ? el('span', { class: 'pill warn' }, 'нужны ещё страницы') : null), el('p', { class: 'lead' }, s.role)),
      s.provided ? el('div', { class: 'note' }, el('b', {}, 'Что получено. '), s.provided) : null,
      s.note ? el('div', { class: 'note' }, el('b', {}, 'Как читать. '), s.note) : null,
      el('div', { class: 'small muted' }, 'Лицензия: ' + s.lic), s.url ? el('div', {}, el('a', { class: 'btn', href: s.url, target: '_blank', rel: 'noopener' }, 'Открыть оригинал ↗')) : null,
      el('div', { class: 'eyebrow' }, 'выписки · ' + xs.length), xs.length ? q : null, list);
  }

  /* ---------- синхронизация ---------- */
  const CFG = 'self-upgrade-sync-v1';
  function syncCfg() { try { const r = localStorage.getItem(CFG); return r ? JSON.parse(r) : {}; } catch (e) { return {}; } }
  function setSyncCfg(o) { try { localStorage.setItem(CFG, JSON.stringify(o)); } catch (e) { /* без хранилища */ } }
  const WORDS = 'лиса мост рыба ветер камень река сосна облако ключ лампа башня берег поле огонь песок луна звезда гора лес озеро тропа парус якорь маяк карта компас дверь окно стол книга перо чернила мел доска шарик мяч ёлка снег дождь гром туман роса трава цветок яблоко груша слива вишня мёд хлеб соль чай кофе молоко сыр орех гриб ёж волк заяц медведь белка сова ворон орёл голубь утка гусь кот пёс конь корова овца коза тигр лев слон жираф зебра краб кит дельфин тюлень пингвин пчела жук бабочка муравей паук улитка лягушка ящерица змея черепаха дракон гном эльф рыцарь замок мельница кузница колодец плот лодка поезд вагон мотор колесо рельс сад парк мостик ручей холм овраг пещера остров залив вулкан пустыня оазис тундра степь'.split(' ');
  function newCode() { const a = new Uint32Array(5); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, (n) => WORDS[n % WORDS.length]).join('-'); }
  async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join(''); }
  function mergeState(a, b) {
    const out = Object.assign(fresh(), a);
    const ids = new Set(Object.keys(a.items || {}).concat(Object.keys(b.items || {}))); out.items = {};
    ids.forEach((id) => { const x = (a.items || {})[id], y = (b.items || {})[id]; if (!x || !y) { out.items[id] = x || y; return; } const kx = x.at || 0, ky = y.at || 0; out.items[id] = kx !== ky ? (kx > ky ? x : y) : (x.seen >= y.seen ? x : y); });
    out.topics = Object.assign({}, b.topics || {}, a.topics || {});
    Object.keys(b.topics || {}).forEach((k) => { if (a.topics && a.topics[k] && b.topics[k].seen < a.topics[k].seen) out.topics[k] = b.topics[k]; });
    out.exams = Object.assign({}, b.exams || {}); Object.keys(a.exams || {}).forEach((k) => { const y = (b.exams || {})[k]; out.exams[k] = !y || a.exams[k].best >= y.best ? a.exams[k] : y; });
    out.notes = {}; new Set(Object.keys(a.notes || {}).concat(Object.keys(b.notes || {}))).forEach((k) => { const x = (a.notes || {})[k] || '', y = (b.notes || {})[k] || ''; out.notes[k] = !x ? y : !y || x === y || x.includes(y) ? x : y.includes(x) ? y : x + '\n— с другого устройства —\n' + y; });
    const seen = new Set(), lg = []; (a.log || []).concat(b.log || []).forEach((r) => { const k = r[0] + '|' + r[1]; if (!seen.has(k)) { seen.add(k); lg.push(r); } });
    out.log = lg.sort((p, q) => p[0] - q[0]).slice(-3000);
    out.days = Array.from(new Set((a.days || []).concat(b.days || []))).sort();
    out.daily = (a.daily && b.daily) ? (a.daily.date >= b.daily.date ? a.daily : b.daily) : (a.daily || b.daily || null);
    out.last = a.last || b.last || null;
    return out;
  }
  let syncing = false;
  async function syncNow() {
    const c = syncCfg(); if (!c.url || !c.code || syncing) return { ok: false, msg: 'Синхронизация не настроена' };
    syncing = true;
    try {
      const id = await sha(c.code), u = c.url.replace(/\/+$/, '') + '/s/' + id;
      let remote = null; const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) remote = await r.json(); else if (r.status !== 404) throw new Error('сервер ответил ' + r.status);
      if (remote && remote.v === 1) { S = mergeState(S, remote); save(); }
      const w = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(S) });
      if (!w.ok) throw new Error('запись не удалась: ' + w.status);
      setSyncCfg(Object.assign(c, { last: Date.now() }));
      return { ok: true, msg: 'Синхронизировано ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) };
    } catch (e) { return { ok: false, msg: 'Не удалось: ' + (e && e.message || e) }; } finally { syncing = false; }
  }
  let syncTimer; const syncSoon = () => { if (!syncCfg().code) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 1500); };
  const b64u = (u8) => { let s = ''; u8.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  async function pack() {
    const o = { v: 1, items: S.items, topics: S.topics, exams: S.exams, notes: S.notes, days: S.days.slice(-120), daily: S.daily, last: S.last };
    const raw = new TextEncoder().encode(JSON.stringify(o));
    if (window.CompressionStream) { const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(raw); w.close(); return 'z' + b64u(new Uint8Array(await new Response(cs.readable).arrayBuffer())); }
    return 'r' + b64u(raw);
  }
  async function unpack(s) {
    const mode = s[0]; let u8 = unb64u(s.slice(1));
    if (mode === 'z') { const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(u8); w.close(); u8 = new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
    return JSON.parse(new TextDecoder().decode(u8));
  }

  function viewImport(arg) {
    const box = el('div', { class: 'sect' }, el('p', { class: 'muted' }, 'Читаю копию…'));
    layout('import', el('div', { class: 'sect' }, el('h1', {}, 'Копия прогресса')), box);
    unpack(arg).then((o) => {
      if (!o || o.v !== 1 || !o.items) throw new Error('формат');
      const n = Object.keys(o.items).length, mine = Object.keys(S.items).length;
      box.innerHTML = '';
      box.append(el('div', { class: 'card' }, el('div', {}, 'В копии карточек: ' + n + '. На этом устройстве: ' + mine + '.'), el('div', { class: 'small muted' }, 'Прогресс объединится: по каждой карточке останется более свежий результат, ничего не потеряется.')),
        el('div', { class: 'row' }, el('button', { class: 'btn pri', type: 'button', onclick: () => { S = mergeState(S, o); save(); location.hash = '#me'; } }, 'Объединить'), el('a', { class: 'btn', href: '#settings' }, 'Отмена')));
    }).catch(() => { box.innerHTML = ''; box.append(el('p', { class: 'muted' }, 'Не удалось прочитать ссылку. Скопируйте её целиком и откройте ещё раз.'), el('a', { class: 'btn', href: '#settings' }, 'К настройкам')); });
  }

  function viewSettings() {
    const th = el('div', { class: 'row' }, [['auto', 'Как в системе'], ['dark', 'Тёмная'], ['light', 'Светлая']].map(([v, t]) => el('button', { class: 'btn' + (S.theme === v ? ' on' : ''), type: 'button', onclick: () => { S.theme = v; save(); applyTheme(); viewSettings(); } }, t)));
    const fb = el('div', { class: 'fb', 'aria-live': 'polite' });
    const say = (m, ok) => { fb.className = 'fb ' + (ok ? 'ok' : 'bad'); fb.textContent = m; };
    const copy = async (txt, okm) => { try { await navigator.clipboard.writeText(txt); say(okm, true); } catch (e) { say('Не удалось скопировать, выделите текст вручную', false); } };

    /* ссылка */
    const linkTa = el('textarea', { class: 'own', id: 'lnk', readonly: true, rows: 3, placeholder: 'Здесь появится ссылка' });
    const mk = el('button', { class: 'btn pri', type: 'button', onclick: async () => { try { linkTa.value = location.origin + location.pathname + '#sync-' + await pack(); say('Ссылка готова. Скопируйте и отправьте себе.', true); } catch (e) { say('Не удалось собрать ссылку', false); } } }, 'Создать ссылку');
    const cpl = el('button', { class: 'btn', type: 'button', onclick: () => { if (linkTa.value) copy(linkTa.value, 'Ссылка скопирована'); else say('Сначала создайте ссылку', false); } }, 'Скопировать');
    const shr = navigator.share ? el('button', { class: 'btn', type: 'button', onclick: () => { if (linkTa.value) navigator.share({ title: 'self-upgrade', url: linkTa.value }).catch(() => {}); else say('Сначала создайте ссылку', false); } }, 'Отправить…') : null;

    /* сервер */
    const c = syncCfg();
    const urlI = el('input', { class: 'searchbox', id: 'surl', type: 'url', placeholder: 'https://1-2-3-4.sslip.io', value: c.url || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const codeI = el('input', { class: 'searchbox', id: 'scode', type: 'text', placeholder: 'код из пяти слов', value: c.code || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const gen = el('button', { class: 'btn', type: 'button', onclick: () => { codeI.value = newCode(); say('Код создан. Запишите его: он нужен на втором устройстве.', true); } }, 'Новый код');
    const on = el('button', { class: 'btn pri', type: 'button', onclick: async () => { const u = urlI.value.trim(), k = codeI.value.trim().toLowerCase().replace(/\s+/g, '-'); if (!/^https:\/\//.test(u) || k.split('-').length < 4) { say('Нужен адрес с https:// и код из слов', false); return; } setSyncCfg({ url: u, code: k }); say('Синхронизирую…', true); const r = await syncNow(); say(r.msg, r.ok); st.textContent = r.ok ? 'подключено' : 'ошибка'; } }, 'Подключить и синхронизировать');
    const now = el('button', { class: 'btn', type: 'button', onclick: async () => { say('Синхронизирую…', true); const r = await syncNow(); say(r.msg, r.ok); } }, 'Синхронизировать сейчас');
    const off = el('button', { class: 'btn', type: 'button', onclick: () => { setSyncCfg({}); viewSettings(); } }, 'Отключить');
    const st = el('span', { class: 'pill' + (c.code ? ' ok' : '') }, c.code ? 'подключено' : 'не подключено');

    /* файл и текст */
    const data = () => JSON.stringify(S);
    const dl = el('button', { class: 'btn', type: 'button', onclick: () => { try { const a = el('a', { href: URL.createObjectURL(new Blob([data()], { type: 'application/json' })), download: 'self-upgrade-progress.json' }); document.body.append(a); a.click(); a.remove(); say('Файл сохранён', true); } catch (e) { say('Не удалось сохранить файл, используйте копирование', false); } } }, 'Сохранить файлом');
    const cp = el('button', { class: 'btn', type: 'button', onclick: () => copy(data(), 'Скопировано. Вставьте в заметки как резервную копию.') }, 'Скопировать текстом');
    const ta = el('textarea', { class: 'own', id: 'imp', placeholder: 'Вставьте сюда ранее сохранённую копию' });
    const file = el('input', { type: 'file', accept: 'application/json,.json', id: 'impf', onchange: () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = String(r.result); }; r.readAsText(f); } });
    const imp = el('button', { class: 'btn', type: 'button', onclick: () => { try { const o = JSON.parse(ta.value); if (!o || o.v !== 1 || !o.items) throw 0; S = mergeState(S, o); save(); applyTheme(); say('Прогресс объединён с копией', true); } catch (e) { say('Это не похоже на копию прогресса', false); } } }, 'Объединить с копией');
    const ask = el('button', { class: 'btn badc', type: 'button', onclick: () => { ask.hidden = true; sure.hidden = false; } }, 'Стереть весь прогресс');
    const sure = el('div', { class: 'row' }, el('span', { class: 'small' }, 'Точно стереть? Это нельзя отменить.'), el('button', { class: 'btn badc', type: 'button', onclick: () => { S = fresh(); save(); applyTheme(); viewSettings(); } }, 'Да, стереть'), el('button', { class: 'btn', type: 'button', onclick: () => { sure.hidden = true; ask.hidden = false; } }, 'Отмена'));
    sure.hidden = true;
    layout('settings', el('div', { class: 'crumbs' }, el('a', { href: '#me' }, 'я'), ' / настройки'), el('div', { class: 'sect' }, el('h1', {}, 'Синхронизация и настройки')),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'способ 1 · ссылка себе'), el('p', { class: 'small muted' }, 'Создайте ссылку, отправьте себе в Telegram или заметки, откройте на другом устройстве. Прогресс объединится.'), el('div', { class: 'row' }, mk, cpl, shr), linkTa),
      el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'eyebrow' }, 'способ 2 · свой сервер'), el('span', { class: 'sp' }), st), el('p', { class: 'small muted' }, 'Один раз вводите адрес сервера и код. Дальше прогресс сам сливается при открытии и после занятий.'), urlI, codeI, el('div', { class: 'row' }, gen, on), el('div', { class: 'row' }, now, c.code ? off : null)),
      fb,
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'тема'), th),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'копия файлом или текстом'), el('div', { class: 'row' }, dl, cp), ta, file, el('div', { class: 'row' }, imp)),
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'сброс'), ask, sure));
  }



  /* ---------- курс из тестов (САПР) ---------- */
  const allQ = () => (C.sapr ? C.sapr.tests.flatMap((t) => t.questions.map((q) => Object.assign({ t: t.id }, q))) : []);
  const tImg = (q) => (/^data:/.test(q.img) ? q.img : 'courses/sapr/' + q.img);
  const TYPE_NAME = { one: 'один ответ', multi: 'несколько ответов', text: 'ввести ответ', order: 'расставить по порядку', match: 'установить соответствие' };
  const normT = (x) => String(x).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const gradeOf = (pct) => (pct >= (C.sapr.pass_pct || 90) ? '5' : '');
  function answerUI(q) {
    if (q.type === 'one' || q.type === 'multi') return el('ul', { class: 'qopts' }, q.opts.map((o, i) => el('li', { class: q.ok.includes(i) ? 'okopt' : 'noopt' }, el('span', { class: 'mk' }, q.ok.includes(i) ? '✔' : '○'), o)));
    if (q.type === 'text') return el('div', { class: 'okopt' }, el('span', { class: 'mk' }, '✔'), q.answer);
    if (q.type === 'order') return el('ol', { class: 'qopts' }, q.order.map((o) => el('li', { class: 'okopt' }, o)));
    return el('ul', { class: 'qopts' }, q.pairs.map((p) => el('li', { class: 'okopt' }, el('b', {}, p[0]), ' → ', p[1])));
  }
  function qHead(q, extra) {
    return [el('div', { class: 'row' }, el('span', { class: 'pill' }, (q.t || '') + (q.t ? ' · ' : '') + '№ ' + q.n), el('span', { class: 'pill' }, TYPE_NAME[q.type]), extra || null),
      el('div', { class: 'qtext' }, q.q), q.img ? el('img', { class: 'qimg', src: tImg(q), alt: q.alt || 'Рисунок к вопросу', loading: 'lazy' }) : null];
  }
  function viewTests() {
    const S0 = C.sapr; if (!S0) return layout('courses', el('p', {}, 'Курс не загружен.'));
    const Q = allQ(), errs = Q.filter((q) => S.items[q.id] && S.items[q.id].wrong > 0 && S.items[q.id].box < 4);
    const card = (t) => {
      const l = t.questions.filter((q) => learned(q.id)).length, e = S.exams['sapr-' + t.id], pic = t.questions.filter((q) => q.img).length;
      return el('div', { class: 'card tcard' }, el('b', {}, t.title),
        el('div', { class: 'row' }, el('span', { class: 'pill' }, t.questions.length + ' ' + plural(t.questions.length, 'вопрос', 'вопроса', 'вопросов')), pic ? el('span', { class: 'pill' }, pic + ' с рисунком') : null,
          e ? el('span', { class: 'pill ' + (e.best >= S0.pass_pct ? 'ok' : 'warn') }, 'лучший ' + e.best + '%' + (e.best >= S0.pass_pct ? ' · «5»' : '')) : el('span', { class: 'pill' }, 'не сдавался')),
        meter(Math.round(l * 100 / t.questions.length)), el('span', { class: 'small muted' }, 'Выучено ' + l + ' из ' + t.questions.length),
        el('div', { class: 'row' }, el('a', { class: 'btn', href: '#tstudy-' + t.id }, 'Изучить ответы'), el('a', { class: 'btn pri', href: '#trun-' + t.id }, 'Пройти тест')));
    };
    layout('tests', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ' + S0.title),
      el('div', { class: 'sect' }, el('h1', {}, S0.title), el('p', { class: 'lead' }, 'Тесты по лекциям 3–6. Сначала изучите правильные ответы, затем пройдите тест. Оценка «5» ставится от ' + S0.pass_pct + '%. Частично верный выбор засчитывается частично.')),
      el('div', { class: 'cmdlist' }, S0.tests.map(card)),
      el('div', { class: 'card tcard' }, el('b', {}, 'Всё вместе'), el('span', { class: 'small muted' }, 'Вопросы из всех четырёх тестов вперемешку.'),
        el('div', { class: 'row' }, el('a', { class: 'btn pri', href: '#trun-mix' }, 'Случайные 20'), errs.length ? el('a', { class: 'btn', href: '#trun-err' }, 'Работа над ошибками · ' + errs.length) : el('span', { class: 'small muted' }, 'Ошибок пока нет'))));
  }
  function viewTestStudy(id) {
    const t = C.sapr && C.sapr.tests.find((x) => x.id === id);
    if (!t) return layout('tests', el('p', {}, 'Такого теста нет.'), el('a', { class: 'btn', href: '#tests' }, 'К тестам'));
    const list = el('div', { class: 'cmdlist' }), cnt = el('div', { class: 'small muted' });
    const hideBtn = el('button', { class: 'btn', type: 'button' }, 'Скрыть ответы (проверить себя)');
    const inp = el('input', { class: 'searchbox', type: 'search', placeholder: 'Поиск по вопросам', autocomplete: 'off', spellcheck: 'false' });
    const draw = () => {
      const w = inp.value.trim().toLowerCase(); list.innerHTML = '';
      const rows = t.questions.filter((q) => !w || (q.q + ' ' + (q.opts || []).join(' ') + ' ' + (q.answer || '') + ' ' + (q.order || []).join(' ') + ' ' + (q.pairs || []).join(' ')).toLowerCase().includes(w));
      cnt.textContent = 'Показано: ' + rows.length + ' из ' + t.questions.length + ' · выучено ' + t.questions.filter((q) => learned(q.id)).length;
      rows.forEach((q) => {
        const know = el('button', { class: 'btn', type: 'button' });
        const paint = () => { know.textContent = learned(q.id) ? '✓ Знаю' : 'Отметить «знаю»'; know.classList.toggle('on', learned(q.id)); };
        know.onclick = () => { if (learned(q.id)) { delete S.items[q.id]; save(); syncSoon(); } else setLearned(q.id); paint(); cnt.textContent = 'Показано: ' + rows.length + ' из ' + t.questions.length + ' · выучено ' + t.questions.filter((z) => learned(z.id)).length; };
        paint();
        const card = el('div', { class: 'card qcard' }, ...qHead(q), el('div', { class: 'ans' }, answerUI(q)),
          el('div', { class: 'row' }, el('button', { class: 'btn showb', type: 'button', onclick: (e) => { card.classList.toggle('open'); e.target.textContent = card.classList.contains('open') ? 'Скрыть ответ' : 'Показать ответ'; } }, 'Показать ответ'), know));
        list.append(card);
      });
    };
    hideBtn.onclick = () => { const h = list.classList.toggle('hide'); hideBtn.textContent = h ? 'Показать все ответы' : 'Скрыть ответы (проверить себя)'; };
    inp.oninput = draw; draw();
    layout('tests', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#tests' }, C.sapr.title), ' / изучение'),
      el('div', { class: 'sect' }, el('h1', {}, t.title), el('p', { class: 'lead' }, 'Правильные ответы отмечены ✔. Прочитайте их, отметьте выученное и переходите к тесту.'), ...(t.notes || []).map((n) => el('p', { class: 'small muted' }, n))),
      el('div', { class: 'row' }, hideBtn, el('a', { class: 'btn pri', href: '#trun-' + t.id }, 'Пройти тест')), inp, cnt, list);
  }
  function viewTestRun(spec) {
    const sp = C.sapr; if (!sp) return;
    let pool, title, key = null;
    if (spec === 'mix') { pool = shuffle(allQ()).slice(0, 20); title = 'Случайные 20'; }
    else if (spec === 'err') { pool = shuffle(allQ().filter((q) => S.items[q.id] && S.items[q.id].wrong > 0 && S.items[q.id].box < 4)).slice(0, 20); title = 'Работа над ошибками'; }
    else { const t = sp.tests.find((x) => x.id === spec); if (!t) return layout('tests', el('p', {}, 'Такого теста нет.')); pool = shuffle(t.questions.map((q) => Object.assign({ t: t.id }, q))); title = t.title; key = 'sapr-' + t.id; }
    if (!pool.length) return layout('tests', el('p', {}, 'Вопросов для этого режима нет.'), el('a', { class: 'btn', href: '#tests' }, 'К тестам'));
    const host = el('div', { id: 'sess' });
    layout('tests', el('div', { class: 'crumbs' }, el('a', { href: '#courses' }, 'курсы'), ' / ', el('a', { href: '#tests' }, sp.title), ' / тест'), host);
    let i = 0; const res = [];
    const step = () => {
      if (i >= pool.length) return done();
      const q = pool[i]; host.innerHTML = '';
      const get = {}; let body;
      if (q.type === 'one' || q.type === 'multi') {
        const ord = shuffle(q.opts.map((o, k) => k)), on = new Set();
        body = el('div', { class: 'qpick' }, ord.map((k) => { const b = el('button', { type: 'button', class: 'opt', 'aria-pressed': 'false' }, q.opts[k]); b.onclick = () => { if (q.type === 'one') { on.clear(); [...body.children].forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); } if (on.has(k)) on.delete(k); else on.add(k); b.classList.toggle('on', on.has(k)); b.setAttribute('aria-pressed', String(on.has(k))); }; return b; }));
        get.val = () => { const hit = [...on].filter((k) => q.ok.includes(k)).length, miss = on.size - hit; return q.type === 'one' ? (on.size === 1 && q.ok.includes([...on][0]) ? 1 : 0) : Math.max(0, (hit - miss) / q.ok.length); };
      } else if (q.type === 'text') {
        const inp = el('input', { class: 'searchbox', type: 'text', placeholder: 'Ваш ответ', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }); body = inp;
        get.val = () => (normT(inp.value) === normT(q.answer) ? 1 : 0);
      } else if (q.type === 'order') {
        const picked = [], pool2 = shuffle(q.order.slice()), box = el('ol', { class: 'qopts picked' }), src = el('div', { class: 'qpick' });
        const draw = () => { box.innerHTML = ''; picked.forEach((t, k) => box.append(el('li', {}, el('button', { type: 'button', class: 'opt on', onclick: () => { picked.splice(k, 1); draw(); } }, t)))); src.innerHTML = ''; pool2.filter((t) => !picked.includes(t)).forEach((t) => src.append(el('button', { type: 'button', class: 'opt', onclick: () => { picked.push(t); draw(); } }, t))); };
        draw(); body = el('div', {}, el('div', { class: 'small muted' }, 'Нажимайте пункты по порядку. Нажатие на выбранный пункт убирает его.'), box, src);
        get.val = () => { let ok = 0; q.order.forEach((t, k) => { if (picked[k] === t) ok++; }); return ok / q.order.length; };
      } else {
        const rights = shuffle(q.pairs.map((p) => p[1])), sels = [];
        body = el('div', { class: 'qmatch' }, q.pairs.map((p) => { const s = el('select', { class: 'searchbox' }, el('option', { value: '' }, 'выберите…'), rights.map((r) => el('option', { value: r }, r))); sels.push(s); return el('label', { class: 'mrow' }, el('b', {}, p[0]), s); }));
        get.val = () => sels.filter((s, k) => s.value === q.pairs[k][1]).length / q.pairs.length;
      }
      const fb = el('div', { class: 'qfb', 'aria-live': 'polite' }), check = el('button', { class: 'btn pri', type: 'button' }, 'Проверить');
      check.onclick = () => {
        const f = get.val(), ok = f === 1; res.push({ q, f }); record(q.id, ok);
        [...host.querySelectorAll('button.opt,input,select')].forEach((x) => { x.disabled = true; });
        fb.className = 'qfb ' + (ok ? 'good' : 'bad');
        fb.append(el('b', {}, ok ? 'Верно.' : f > 0 ? 'Частично верно: ' + Math.round(f * 100) + '%.' : 'Неверно.'), el('div', { class: 'small muted' }, 'Правильный ответ:'), answerUI(q));
        check.remove(); host.append(el('button', { class: 'btn pri', type: 'button', onclick: () => { i++; step(); } }, i + 1 >= pool.length ? 'Результат' : 'Дальше ›'));
      };
      host.append(el('div', { class: 'row' }, el('span', { class: 'small muted' }, title + ' · ' + (i + 1) + ' из ' + pool.length)), meter(Math.round(i * 100 / pool.length)),
        el('div', { class: 'card qcard' }, ...qHead(q), body), fb, check);
      window.scrollTo(0, 0);
    };
    const done = () => {
      const pct = Math.round(res.reduce((a, r) => a + r.f, 0) * 100 / res.length), wrong = res.filter((r) => r.f < 1);
      if (key) { const prev = S.exams[key] || { best: 0 }; S.exams[key] = { best: Math.max(prev.best, pct), at: Date.now() }; save(); syncSoon(); }
      const g = key ? gradeOf(pct) : '';
      host.innerHTML = '';
      host.append(el('div', { class: 'card tcard' }, el('div', { class: 'eyebrow' }, 'результат'), el('h1', {}, pct + '%' + (g ? ' · «' + g + '»' : '')),
        el('p', {}, 'Верно полностью: ' + (res.length - wrong.length) + ' из ' + res.length + (key ? (g ? '. Порог «5» пройден.' : '. До «5» нужно ' + sp.pass_pct + '%.') : '.')), meter(pct),
        el('div', { class: 'row' }, el('a', { class: 'btn pri', href: '#trun-' + spec, onclick: () => setTimeout(route, 0) }, 'Ещё раз'), el('a', { class: 'btn', href: '#tests' }, 'К тестам'), key ? el('a', { class: 'btn', href: '#tstudy-' + spec }, 'Изучить ответы') : null)),
        wrong.length ? el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'разбор ошибок · ' + wrong.length), el('div', { class: 'cmdlist' }, wrong.map((r) => el('div', { class: 'card qcard' }, ...qHead(r.q), el('div', { class: 'small muted' }, 'Правильный ответ:'), answerUI(r.q))))) : el('p', { class: 'lead' }, 'Без ошибок. Отличный результат.'));
      window.scrollTo(0, 0);
    };
    step();
  }

  /* ---------- скрипты и рецепты с разбором ---------- */
  function viewScripts() {
    const L = C.scripts || [];
    layout('scripts', el('div', { class: 'sect' }, el('h1', {}, 'Скрипты'), el('p', { class: 'lead' }, 'Настоящие скрипты Альты, разобранные по блокам: что делает каждый кусок и зачем он так написан. После блока можно проверить себя.')),
      el('div', { class: 'cmdlist' }, L.map((x) => el('a', { class: 'card link', href: '#script-' + x.id },
        el('div', { class: 'row' }, el('b', {}, x.title)),
        el('div', { class: 'row' }, el('span', { class: 'pill' }, x.level), el('span', { class: 'pill ' + (x.mode.indexOf('только читает') === 0 ? 'ok' : 'warn') }, x.mode), el('span', { class: 'pill' }, x.blocks.length + ' ' + plural(x.blocks.length, 'блок', 'блока', 'блоков'))),
        el('span', { class: 'small muted' }, x.intro)))),
      el('p', { class: 'small muted' }, 'Код скриптов взят из проекта «Альта» (GPL-3.0); пояснения написаны для этого курса. Скрипты, которые меняют систему, не запускайте на рабочем компьютере, пока не поняли каждый блок.'));
  }
  function scriptQuiz(q, sid, n) {
    const done = el('div', { class: 'small', 'aria-live': 'polite' }), box = el('div', { class: 'card quizb' }, el('div', { class: 'eyebrow' }, 'проверь себя'), el('div', {}, el('b', {}, ...mdNodes(q.q))));
    const row = el('div', { class: 'chips' });
    const order = shuffle(q.opts.map((t, i) => [t, i]));
    order.forEach(([t, i]) => {
      const b = el('button', { class: 'chip', type: 'button' }); b.innerHTML = md(t);
      b.onclick = () => {
        [...row.children].forEach((x) => { x.disabled = true; });
        const ok = i === q.a; b.classList.add(ok ? 'ok' : 'bad');
        if (!ok) [...row.children].forEach((x, j) => { if (order[j][1] === q.a) x.classList.add('ok'); });
        done.innerHTML = '<b>' + (ok ? 'Верно. ' : 'Не совсем. ') + '</b>' + md(q.why);
      };
      row.append(b);
    });
    box.append(row, done); return box;
  }
  const mdNodes = (s) => { const d = el('span'); d.innerHTML = md(s); return [...d.childNodes]; };
  function viewScript(id) {
    const x = (C.scripts || []).find((z) => z.id === id);
    if (!x) return layout('scripts', el('p', {}, 'Такого скрипта нет.'), el('a', { class: 'btn', href: '#scripts' }, 'К списку скриптов'));
    const blocks = x.blocks.map((b, n) => {
      const pre = el('pre', { class: 'out' }); pre.textContent = b.code;
      const topics = (b.topics || []).filter((t) => TOPICS[t]).map((t) => el('a', { class: 'pill', href: '#topic-' + t }, TOPICS[t].title));
      const kids = [el('div', { class: 'eyebrow' }, 'блок ' + (n + 1) + ' из ' + x.blocks.length), pre,
        el('div', { class: 'sect' }, el('b', {}, 'Что делает'), el('p', { html: md(b.what) })),
        el('div', { class: 'sect' }, el('b', {}, 'Зачем так'), el('p', { html: md(b.why) }))];
      if (topics.length) kids.push(el('div', { class: 'row' }, el('span', { class: 'small muted' }, 'Повторить:'), ...topics));
      if (b.quiz) kids.push(scriptQuiz(b.quiz, x.id, n));
      return el('div', { class: 'card scrblock' }, ...kids);
    });
    const usage = el('pre', { class: 'out' }); usage.textContent = '$ ' + x.usage;
    layout('script', el('div', { class: 'crumbs' }, el('a', { href: '#scripts' }, 'скрипты'), ' / ' + x.id),
      el('div', { class: 'sect' }, el('h1', {}, x.title), el('div', { class: 'row' }, el('span', { class: 'pill' }, x.level), el('span', { class: 'pill ' + (x.mode.indexOf('только читает') === 0 ? 'ok' : 'warn') }, x.mode)), el('p', { class: 'lead', html: md(x.intro) })),
      el('div', { class: 'sect' }, el('div', { class: 'eyebrow' }, 'как запускают'), usage),
      ...blocks,
      el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'что унести с собой'), el('ul', {}, x.recap.map((r) => el('li', {}, r)))),
      el('p', { class: 'small muted' }, 'Источник: ' + x.source));
  }
  function viewRecipes() {
    const R = Object.values(C.recipes || {});
    const inp = el('input', { class: 'searchbox', type: 'search', placeholder: 'Название или команда', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const list = el('div', { class: 'cmdlist' }), cnt = el('div', { class: 'small muted' });
    const draw = () => {
      const w = inp.value.trim().toLowerCase();
      const rows = R.filter((r) => !w || (r.title + ' ' + r.steps.map((x) => x.cmd + ' ' + (x.why || '')).join(' ')).toLowerCase().includes(w));
      cnt.textContent = 'Показано: ' + rows.length + ' из ' + R.length;
      list.innerHTML = ''; rows.forEach((r) => list.append(recipeUI(r)));
    };
    inp.oninput = draw; draw();
    layout('recipes', el('div', { class: 'sect' }, el('h1', {}, 'Рецепты'), el('p', { class: 'lead' }, 'Готовые последовательности команд помощника Альты. У каждого шага есть пояснение, зачем он нужен. Команды с # выполняются от администратора. Рецепты ещё не проверены на живых компьютерах.')), inp, cnt, list);
  }

  /* ---------- маршрутизация ---------- */
  function route() {
    const h = location.hash.replace(/^#/, ''); const i = h.indexOf('-'); const name = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
    try {
      switch (name) {
        case 'courses': return viewCourses();
        case 'course': return viewCourse(arg);
        case 'me': return viewMe();
        case 'lib': return viewSources();
        case 'src': return viewSource(arg);
        case 'sync': return viewImport(arg);
        case 'layer': return viewLayer(arg);
        case 'topic': return viewTopic(arg);
        case 'practice': return viewPractice(arg);
        case 'lab': return viewLab(arg);
        case 'exam': return viewExam(arg);
        case 'daily': return viewDaily();
        case 'mistakes': return viewMistakes();
        case 'cmds': return viewCmds(arg);
        case 'tests': return viewTests();
        case 'tstudy': return viewTestStudy(arg);
        case 'trun': return viewTestRun(arg);
        case 'scripts': return viewScripts();
        case 'script': return viewScript(arg);
        case 'recipes': return viewRecipes();
        case 'cheats': return viewCheats(arg);
        case 'search': return viewSearch();
        case 'sources': return viewSources();
        case 'settings': return viewSettings();
        default: return viewHome();
      }
    } catch (e) {
      app().innerHTML = ''; app().append(el('div', { class: 'page' }, el('h1', {}, 'Что-то пошло не так'), el('p', { class: 'muted' }, String(e && e.message || e)), el('a', { class: 'btn', href: '#' }, 'На главную')));
      if (window.console) console.error(e);
    }
  }

  async function boot() {
    applyTheme();
    try { C = await loadCourse(); index(); } catch (e) { app().textContent = 'Не удалось загрузить курс: ' + e.message; return; }
    window.addEventListener('hashchange', route);
    route();
    if (syncCfg().code) { syncNow().then(() => { if (!location.hash || location.hash === '#' || location.hash === '#me') route(); }); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(); }); }
    try { if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* без офлайна */ }
  }
  boot();
})();
