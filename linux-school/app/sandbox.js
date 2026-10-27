/* Учебный терминал: имитация небольшой системы ALT. Настоящая система не затрагивается.
   Вывод упрощён и не совпадает с настоящим побайтно. */
(function (g) {
  'use strict';

  const D = (k, m, o) => ({ t: 'd', k: k || {}, m: m || '755', o: o || 'root' });
  const F = (c, m, o) => ({ t: 'f', c: c == null ? '' : c, m: m || '644', o: o || 'root' });
  const U = 'student', HOME = '/home/student';

  const PKG = {
    kate: { ver: '25.04.1-alt1', sum: 'Расширенный текстовый редактор KDE', dep: ['kf6-ktexteditor', 'libqt6-core'], files: ['/usr/bin/kate'], inst: true },
    okular: { ver: '25.04.1-alt1', sum: 'Просмотр документов PDF и других', dep: ['kf6-kparts', 'libqt6-core'], files: ['/usr/bin/okular'], inst: false },
    nano: { ver: '8.2-alt1', sum: 'Небольшой текстовый редактор', dep: ['libncurses'], files: ['/usr/bin/nano'], inst: true },
    python3: { ver: '3.12.7-alt1', sum: 'Интерпретатор Python', dep: ['libpython3'], files: ['/usr/bin/python3'], inst: true },
    coreutils: { ver: '9.5-alt1', sum: 'Основные утилиты GNU: ls, cat, cp, mv', dep: [], files: ['/usr/bin/ls', '/usr/bin/cat', '/usr/bin/cp', '/usr/bin/mv'], inst: true },
    bash: { ver: '5.2.37-alt1', sum: 'Оболочка bash', dep: [], files: ['/usr/bin/bash'], inst: true },
    veyon: { ver: '4.11.0-alt3', sum: 'Мониторинг и управление классом', dep: ['libqt6-httpserver'], files: ['/usr/bin/veyon-cli'], inst: false, trap: true },
  };

  function mkfs() {
    const log = 'ok: служба cups запущена\nerror: нет связи с репозиторием\nok: диск проверен\nerror: пакет не найден\nok: обновления загружены\n';
    return D({
      bin: D({}), boot: D({ 'vmlinuz': F('', '644') }), dev: D({ sda: F(''), tty1: F('') }),
      etc: D({
        hostname: F('alt-lab\n'),
        'os-release': F('NAME="ALT Education"\nVERSION="11.2"\nID=altlinux\n'),
        passwd: F('root:x:0:0:root:/root:/bin/bash\nadmin:x:1000:1000:Администратор:/home/admin:/bin/bash\nstudent:x:1001:1001:Учебный:/home/student:/bin/bash\n'),
        group: F('root:x:0:\nwheel:x:10:admin\nstudent:x:1001:\n'),
        fstab: F('UUID=1111-aaaa / ext4 defaults 1 1\nUUID=2222-bbbb /boot ext4 defaults 1 2\n'),
        hosts: F('127.0.0.1 localhost\n'),
        'resolv.conf': F('nameserver 192.168.10.1\n'),
        'login.defs': F('UID_MIN 1000\nUID_MAX 60000\n'),
        apt: D({ 'sources.list': F('# см. sources.list.d\n'), 'sources.list.d': D({ 'alt.list': F('rpm [p11] http://ftp.altlinux.org/pub/distributions/ALTLinux p11/branch/x86_64 classic\n') }) }),
        skel: D({ '.bashrc': F('# bashrc\n'), Desktop: D({}) }),
        ssh: D({ sshd_config: F('PermitRootLogin no\n') }),
      }),
      home: D({
        student: D({
          Documents: D({}, '755', U), Desktop: D({}, '755', U),
          'notes.txt': F('Мои заметки по Linux\n', '644', U),
          'log.txt': F(log, '644', U),
          '.bashrc': F('# bashrc\n', '644', U),
        }, '755', U),
        admin: D({}, '755', 'admin'),
      }),
      opt: D({}), proc: D({
        cpuinfo: F('processor\t: 0\nmodel name\t: Intel(R) Core(TM) учебный\ncpu MHz\t\t: 2400.000\ncpu cores\t: 2\n'),
        meminfo: F('MemTotal:        1984312 kB\nMemFree:          812344 kB\nMemAvailable:    1204112 kB\nBuffers:           60344 kB\nCached:           512998 kB\n'),
        version: F('Linux version 6.12.0-un-def-alt1 (учебная имитация)\n'),
        uptime: F('12345.67 23456.78\n'),
        modules: F('nouveau 2457600 0 - Live 0x0000000000000000\nkvm 1257472 0 - Live 0x0000000000000000\nsnd_hda_intel 61440 2 - Live 0x0000000000000000\n'),
      }),
      root: D({}, '700', 'root'),
      sys: D({ class: D({ net: D({ lo: F(''), eth0: F('') }) }) }),
      tmp: D({}, '777'),
      usr: D({ bin: D({ ls: F('', '755'), cat: F('', '755'), cp: F('', '755'), mv: F('', '755'), bash: F('', '755'), nano: F('', '755'), kate: F('', '755'), python3: F('', '755') }), share: D({}) }),
      var: D({ log: D({ messages: F('Oct 27 12:00 kernel: учебная запись\nOct 27 12:01 cups: ошибка запуска\n') }) }),
    }, '755');
  }

  const MAN = {
    ls: 'ls — показать содержимое каталога. Флаги: -l подробно, -a со скрытыми.',
    cd: 'cd — перейти в каталог. cd без аргумента ведёт домой, cd - в предыдущий.',
    cat: 'cat — вывести содержимое файла.',
    grep: 'grep — оставить строки с заданным текстом.',
    chmod: 'chmod — изменить права: chmod +x файл, chmod 644 файл.',
    mkdir: 'mkdir — создать каталог (-p создаёт всю цепочку).',
    rpm: 'rpm — запросы к базе установленных пакетов: -qa, -qf, -ql, -qi.',
    'apt-get': 'apt-get — управление пакетами. -s показывает план без изменений.',
    'apt-cache': 'apt-cache — поиск (search) и сведения (show) о пакетах репозитория.',
  };

  function modeStr(n) {
    const m = n.m.padStart(3, '0');
    const f = (d) => ((+d & 4) ? 'r' : '-') + ((+d & 2) ? 'w' : '-') + ((+d & 1) ? 'x' : '-');
    return (n.t === 'd' ? 'd' : '-') + f(m[0]) + f(m[1]) + f(m[2]);
  }

  function tokenize(s) {
    const out = []; let cur = '', q = null, has = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; else cur += c; }
      else if (c === '"' || c === "'") { q = c; has = true; }
      else if (/\s/.test(c)) { if (cur || has) { out.push(cur); cur = ''; has = false; } }
      else cur += c;
    }
    if (cur || has) out.push(cur);
    return out;
  }

  function splitTop(s, ch) {
    const parts = []; let cur = '', q = null;
    for (const c of s) {
      if (q) { if (c === q) q = null; cur += c; }
      else if (c === '"' || c === "'") { q = c; cur += c; }
      else if (c === ch) { parts.push(cur); cur = ''; }
      else cur += c;
    }
    parts.push(cur);
    return parts;
  }

  function create() {
    const root = mkfs();
    let cwd = HOME, oldpwd = HOME;
    const hist = [];

    const norm = (p) => {
      if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
      if (!p.startsWith('/')) p = cwd + '/' + p;
      const out = [];
      for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
      return '/' + out.join('/');
    };
    const get = (p) => {
      let n = root;
      for (const s of norm(p).split('/').filter(Boolean)) { if (n.t !== 'd' || !(s in n.k)) return null; n = n.k[s]; }
      return n;
    };
    const parentOf = (p) => { const a = norm(p).split('/').filter(Boolean); const name = a.pop(); return { dir: get('/' + a.join('/')), name }; };
    const canRead = (n, p) => !(norm(p) === '/root');

    const glob = (arg) => {
      if (!/[*?]/.test(arg)) return [arg];
      const a = norm(arg).split('/'); const base = a.pop(); const dir = get(a.join('/') || '/');
      if (!dir || dir.t !== 'd') return [arg];
      const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const hit = Object.keys(dir.k).filter((k) => re.test(k) && !k.startsWith('.')).sort();
      return hit.length ? hit.map((k) => (a.join('/') || '') + '/' + k) : [arg];
    };

    const err = (s) => ({ out: s + '\n', ok: false });
    const ok = (s) => ({ out: s || '', ok: true });
    const nofile = (cmd, p) => err(`${cmd}: ${p}: Нет такого файла или каталога`);

    function cmdLs(a, input) {
      let fl = '', paths = [];
      for (const x of a) { if (x.startsWith('-')) fl += x.slice(1); else paths.push(x); }
      if (!paths.length) paths = ['.'];
      const long = fl.includes('l'), all = fl.includes('a');
      const lines = []; let okAll = true;
      for (const raw of paths.flatMap(glob)) {
        const n = get(raw);
        if (!n) { lines.push(`ls: невозможно получить доступ к '${raw}': Нет такого файла или каталога`); okAll = false; continue; }
        if (n.t === 'd' && !canRead(n, raw)) { lines.push(`ls: невозможно открыть каталог '${raw}': Отказано в доступе`); okAll = false; continue; }
        if (paths.length > 1 && n.t === 'd') lines.push(raw + ':');
        const names = n.t === 'd' ? Object.keys(n.k).filter((k) => all || !k.startsWith('.')).sort() : [raw];
        if (n.t === 'd' && all) names.unshift('.', '..');
        const row = (name) => {
          const c = n.t === 'd' ? (n.k[name] || n) : n;
          if (!long) return name;
          const size = c.t === 'd' ? 4096 : c.c.length;
          const own = c.o === 'student' ? 'student' : c.o;
          return `${modeStr(c)} 1 ${own.padEnd(8)} ${own.padEnd(8)} ${String(size).padStart(5)} окт 27 12:00 ${name}`;
        };
        if (long) lines.push(...names.map(row)); else if (names.length) lines.push(names.join('  '));
      }
      return { out: lines.join('\n') + (lines.length ? '\n' : ''), ok: okAll };
    }

    function readFile(cmd, p) {
      const n = get(p);
      if (!n) return { e: `${cmd}: ${p}: Нет такого файла или каталога` };
      if (n.t === 'd') return { e: `${cmd}: ${p}: Это каталог` };
      if (norm(p).startsWith('/etc/shadow')) return { e: `${cmd}: ${p}: Отказано в доступе` };
      return { c: n.c };
    }

    function pkgOwner(path) { for (const k in PKG) if (PKG[k].files.includes(path)) return k; return null; }
    const pv = (k) => `${k}-${PKG[k].ver}`;

    function aptSim(args) {
      const sim = args.includes('-s') || args.includes('--simulate') || args.includes('--dry-run');
      const rest = args.filter((x) => !x.startsWith('-'));
      const act = rest[0], name = rest[1];
      if (act === 'update') return sim ? ok('Получено: списки пакетов обновлены (имитация).\n') : err('E: Для обновления списков нужны права администратора. В учебном терминале используйте -s.');
      if (!sim) return err('E: Невозможно заблокировать каталог /var/lib/apt/lists/ (вы не root). В учебном терминале реальная установка отключена: используйте флаг -s.');
      const head = 'Чтение списков пакетов... Завершено\nПостроение дерева зависимостей... Завершено\n';
      if (act === 'upgrade') return err('В ALT не принято частичное обновление через apt-get upgrade: оно может сломать систему. Используйте apt-get dist-upgrade (в учебном терминале с флагом -s).');
      if (act === 'dist-upgrade') {
        return ok(head + 'Следующие пакеты будут ОБНОВЛЕНЫ:\n  kate okular libqt6-core kf6-kparts ... (120)\nСледующие пакеты будут УДАЛЕНЫ:\n  libprocesscore10\n120 будет обновлено, 0 новых установлено, 1 пакетов будет удалено.\n(имитация, ничего не изменено)\n');
      }
      if (act === 'install' || act === 'remove') {
        const p = PKG[name];
        if (!name) return err('E: Не указан пакет.');
        if (!p) return err(`E: Не удалось найти пакет ${name}`);
        if (act === 'remove') return ok(head + `Следующие пакеты будут УДАЛЕНЫ:\n  ${name}\n0 будет обновлено, 0 новых, 1 пакетов будет удалено.\n(имитация, ничего не изменено)\n`);
        if (p.inst) return ok(head + `Пакет ${name} уже установлен (${p.ver}). Нечего делать.\n`);
        if (p.trap) return ok(head + 'Следующие пакеты будут УДАЛЕНЫ:\n  kde-small kwin plasma-desktop okular kolourpaint altcenter ... (66)\nСледующие НОВЫЕ пакеты будут установлены:\n  libqt6-httpserver veyon\nБудет обновлено 120, новых 2, удалено 66.\n(имитация, ничего не изменено)\nВнимание: удаляется рабочий стол!\n');
        return ok(head + `Следующие НОВЫЕ пакеты будут установлены:\n  ${[...p.dep, name].join(' ')}\n0 будет обновлено, ${p.dep.length + 1} новых установлено, 0 пакетов будет удалено.\n(имитация, ничего не изменено)\n`);
      }
      return err('E: Неизвестное действие. Попробуйте: update, install, remove, dist-upgrade.');
    }

    function rpmCmd(a, input) {
      const fl = a.find((x) => x.startsWith('-')) || '';
      const args = a.filter((x) => !x.startsWith('-'));
      if (fl.includes('a')) return ok(Object.keys(PKG).filter((k) => PKG[k].inst).map(pv).join('\n') + '\n');
      if (fl.includes('f')) {
        const p = args[0] ? norm(args[0]) : ''; const o = pkgOwner(p);
        return o ? ok(pv(o) + '\n') : err(`файл ${args[0]} не принадлежит ни одному пакету`);
      }
      const name = args[0];
      if (!name) return err('rpm: не указан пакет');
      const p = PKG[name];
      if (!p || !p.inst) return err(`пакет ${name} не установлен`);
      if (fl.includes('l')) return ok(p.files.join('\n') + '\n');
      if (fl.includes('i')) return ok(`Name: ${name}\nVersion: ${p.ver}\nSummary: ${p.sum}\n`);
      return ok(pv(name) + '\n');
    }

    function apt_cache(a) {
      const act = a[0], name = a[1];
      if (act === 'show') {
        const p = PKG[name]; if (!p) return err(`E: Не удалось найти пакет ${name}`);
        return ok(`Package: ${name}\nVersion: ${p.ver}\nDepends: ${p.dep.join(', ') || '(нет)'}\nDescription: ${p.sum}\n`);
      }
      if (act === 'search') {
        const w = (name || '').toLowerCase(); const hit = Object.keys(PKG).filter((k) => k.includes(w) || PKG[k].sum.toLowerCase().includes(w));
        return ok(hit.map((k) => `${k} - ${PKG[k].sum}`).join('\n') + (hit.length ? '\n' : ''));
      }
      return err('Использование: apt-cache search слово | show пакет');
    }


    let procs = [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.3, cmd: '/usr/lib/systemd/systemd' },
      { pid: 655, user: 'root', cpu: 0.0, mem: 0.5, cmd: '/usr/sbin/cupsd -l' },
      { pid: 701, user: 'root', cpu: 0.0, mem: 0.2, cmd: '/usr/sbin/sshd' },
      { pid: 1100, user: 'student', cpu: 1.2, mem: 4.8, cmd: 'plasmashell' },
      { pid: 1234, user: 'student', cpu: 98.7, mem: 12.4, cmd: 'firefox' },
      { pid: 1301, user: 'student', cpu: 0.4, mem: 2.1, cmd: 'kate' },
    ];
    const JOURNAL = [
      'окт 27 12:00:01 alt-lab kernel: учебная запись: загрузка завершена',
      'окт 27 12:02:10 alt-lab systemd[1]: Starting cups.service - CUPS Scheduler...',
      'окт 27 12:02:11 alt-lab cupsd[812]: Unable to open listen socket for address [v1.::1]:631 - Address already in use.',
      'окт 27 12:02:11 alt-lab systemd[1]: cups.service: Main process exited, code=exited, status=1/FAILURE',
      'окт 27 12:02:11 alt-lab systemd[1]: cups.service: Failed with result \'exit-code\'.',
      'окт 27 12:03:40 alt-lab NetworkManager[540]: <info> учебная запись: сеть подключена',
    ];
    function psAux(a) {
      let rows = procs.slice();
      const so = a.find((x) => x.startsWith('--sort='));
      if (so) {
        const k = so.slice(7); const desc = k[0] === '-'; const f = k.replace(/^[-+]/, '').replace('%', '');
        rows.sort((x, y) => (desc ? y[f] - x[f] : x[f] - y[f]));
      }
      const head = 'USER       PID %CPU %MEM COMMAND\n';
      return head + rows.map((r) => `${r.user.padEnd(8)} ${String(r.pid).padStart(5)} ${r.cpu.toFixed(1).padStart(4)} ${r.mem.toFixed(1).padStart(4)} ${r.cmd}`).join('\n') + '\n';
    }
    function killCmd(a) {
      const nine = a.includes('-9') || a.includes('-KILL');
      const pids = a.filter((x) => /^\d+$/.test(x)).map(Number);
      if (!pids.length) return err('kill: укажите PID. Номер берут из ps aux или pgrep');
      let out = '';
      for (const pid of pids) {
        const i = procs.findIndex((r) => r.pid === pid);
        if (i < 0) { out += `kill: (${pid}) - нет такого процесса\n`; continue; }
        if (procs[i].user !== U) { out += `kill: (${pid}) - Операция не позволена (процесс чужой, системные службы вручную не закрывают)\n`; continue; }
        procs.splice(i, 1);
      }
      return out ? { out, ok: false } : ok('');
    }

    function runCmd(argv, input) {
      const cmd = argv[0], a = argv.slice(1);
      switch (cmd) {
        case 'pwd': return ok(cwd + '\n');
        case 'ls': return cmdLs(a, input);
        case 'cd': {
          let t = a[0] == null ? HOME : (a[0] === '-' ? oldpwd : a[0]);
          const n = get(t);
          if (!n) return err(`bash: cd: ${t}: Нет такого файла или каталога`);
          if (n.t !== 'd') return err(`bash: cd: ${t}: Это не каталог`);
          if (norm(t) === '/root') return err(`bash: cd: ${t}: Отказано в доступе`);
          oldpwd = cwd; cwd = norm(t); return ok('');
        }
        case 'cat': {
          if (!a.length && input != null) return ok(input);
          let res = '', good = true;
          for (const p of a.flatMap(glob)) { const r = readFile('cat', p); if (r.e) { res += r.e + '\n'; good = false; } else res += r.c; }
          return { out: res, ok: good };
        }
        case 'head': case 'tail': {
          let n = 10, file = null;
          for (let i = 0; i < a.length; i++) { if (a[i] === '-n') n = +a[++i]; else if (/^-\d+$/.test(a[i])) n = -a[i]; else if (a[i] === '-f') continue; else file = a[i]; }
          let text = input;
          if (file) { const r = readFile(cmd, file); if (r.e) return err(r.e); text = r.c; }
          const l = (text || '').split('\n'); if (l[l.length - 1] === '') l.pop();
          return ok((cmd === 'head' ? l.slice(0, n) : l.slice(-n)).join('\n') + '\n');
        }
        case 'wc': {
          const file = a.find((x) => !x.startsWith('-')); let text = input;
          if (file) { const r = readFile('wc', file); if (r.e) return err(r.e); text = r.c; }
          const n = (text || '').split('\n').filter((x, i, arr) => !(i === arr.length - 1 && x === '')).length;
          return ok(n + '\n');
        }
        case 'grep': {
          const fl = a.filter((x) => x.startsWith('-')).join(''); const rest = a.filter((x) => !x.startsWith('-'));
          const pat = rest[0]; if (pat == null) return err('Использование: grep [-iv] текст [файл]');
          let text = input;
          if (rest[1]) { const r = readFile('grep', rest[1]); if (r.e) return err(r.e); text = r.c; }
          const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), fl.includes('i') ? 'i' : '');
          const hit = (text || '').split('\n').filter((x) => x !== '' && (re.test(x) !== fl.includes('v')));
          return { out: hit.join('\n') + (hit.length ? '\n' : ''), ok: hit.length > 0 };
        }
        case 'echo': return ok(a.join(' ') + '\n');
        case 'mkdir': {
          const p = a.includes('-p'); let good = true, res = '';
          for (const x of a.filter((y) => y !== '-p')) {
            if (p) { let n = root; for (const s of norm(x).split('/').filter(Boolean)) { if (!n.k[s]) n.k[s] = D({}, '755', U); n = n.k[s]; } continue; }
            const { dir, name } = parentOf(x);
            if (!dir || dir.t !== 'd') { res += `mkdir: невозможно создать каталог «${x}»: Нет такого файла или каталога\n`; good = false; }
            else if (dir.k[name]) { res += `mkdir: невозможно создать каталог «${x}»: Файл существует\n`; good = false; }
            else dir.k[name] = D({}, '755', U);
          }
          return { out: res, ok: good };
        }
        case 'touch': {
          let good = true, res = '';
          for (const x of a.flatMap(glob)) {
            const { dir, name } = parentOf(x);
            if (!dir || dir.t !== 'd') { res += `touch: невозможно выполнить touch для «${x}»: Нет такого файла или каталога\n`; good = false; }
            else if (!dir.k[name]) dir.k[name] = F('', '644', U);
          }
          return { out: res, ok: good };
        }
        case 'rm': {
          const r = a.some((x) => /^-\w*[rR]/.test(x)), force = a.some((x) => /^-\w*f/.test(x));
          let good = true, res = '';
          for (const x of a.filter((y) => !y.startsWith('-')).flatMap(glob)) {
            const n = get(x);
            if (!n) { if (!force) { res += `rm: невозможно удалить «${x}»: Нет такого файла или каталога\n`; good = false; } continue; }
            if (norm(x).split('/').length <= 2 || ['/etc', '/usr', '/proc', '/home'].includes(norm(x))) { res += `rm: «${x}»: учебный терминал не удаляет системные каталоги\n`; good = false; continue; }
            if (n.t === 'd' && !r) { res += `rm: невозможно удалить «${x}»: это каталог (нужен -r)\n`; good = false; continue; }
            const { dir, name } = parentOf(x); delete dir.k[name];
          }
          return { out: res, ok: good };
        }
        case 'cp': case 'mv': {
          const args = a.filter((x) => !x.startsWith('-')).flatMap(glob); const rec = a.some((x) => /^-\w*[rR]/.test(x));
          if (args.length < 2) return err(`${cmd}: пропущен операнд`);
          const dst = args.pop(); let good = true, res = '';
          for (const s of args) {
            const n = get(s);
            if (!n) { res += `${cmd}: невозможно получить доступ к «${s}»: Нет такого файла или каталога\n`; good = false; continue; }
            if (n.t === 'd' && cmd === 'cp' && !rec) { res += `cp: -r не указан; пропускается каталог «${s}»\n`; good = false; continue; }
            const dn = get(dst); let dir, name;
            if (dn && dn.t === 'd') { dir = dn; name = s.split('/').filter(Boolean).pop(); } else { ({ dir, name } = parentOf(dst)); }
            if (!dir) { res += `${cmd}: невозможно создать «${dst}»: Нет такого файла или каталога\n`; good = false; continue; }
            dir.k[name] = JSON.parse(JSON.stringify(n));
            if (cmd === 'mv') { const po = parentOf(s); delete po.dir.k[po.name]; }
          }
          return { out: res, ok: good };
        }
        case 'chmod': {
          const mode = a[0], files = a.slice(1);
          if (!mode || !files.length) return err('chmod: пропущен операнд');
          let good = true, res = '';
          for (const f of files) {
            const n = get(f); if (!n) { res += `chmod: невозможно получить доступ к «${f}»: Нет такого файла или каталога\n`; good = false; continue; }
            if (/^[0-7]{3}$/.test(mode)) n.m = mode;
            else {
              const m = /^([ugoa]*)([+\-=])([rwx]+)$/.exec(mode);
              if (!m) { res += `chmod: неверный режим: «${mode}»\n`; good = false; continue; }
              const who = m[1] || 'a'; const bits = (m[3].includes('r') ? 4 : 0) + (m[3].includes('w') ? 2 : 0) + (m[3].includes('x') ? 1 : 0);
              const d = n.m.padStart(3, '0').split('').map(Number);
              ['u', 'g', 'o'].forEach((w, i) => {
                if (who.includes('a') || who.includes(w)) { if (m[2] === '+') d[i] |= bits; else if (m[2] === '-') d[i] &= ~bits; else d[i] = bits; }
              });
              n.m = d.join('');
            }
          }
          return { out: res, ok: good };
        }
        case 'find': {
          const path = a[0] && !a[0].startsWith('-') ? a[0] : '.'; const ni = a.indexOf('-name');
          const pat = ni >= 0 ? a[ni + 1] : null;
          const re = pat ? new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
          const start = get(path); if (!start) return nofile('find', path);
          const res = [];
          const walk = (n, p) => { if (!re || re.test(p.split('/').pop())) res.push(p); if (n.t === 'd') for (const k of Object.keys(n.k).sort()) walk(n.k[k], (p === '/' ? '' : p) + '/' + k); };
          walk(start, path === '.' ? '.' : norm(path));
          return ok(res.join('\n') + '\n');
        }
        case 'df': return ok('Файловая система  Размер  Занято  Дост  Использовано  Смонтировано\n/dev/sda1            49G     21G    26G         45%  /\n/dev/sda2           512M    120M   392M         24%  /boot\n');
        case 'du': return ok('4,0K\t' + (a.find((x) => !x.startsWith('-')) || '.') + '\n');
        case 'whoami': return ok(U + '\n');
        case 'id': return ok('uid=1001(student) gid=1001(student) группы=1001(student)\n');
        case 'hostname': return ok('alt-lab\n');
        case 'uname': return ok(a.includes('-r') ? '6.12.0-un-def-alt1\n' : (a.includes('-a') ? 'Linux alt-lab 6.12.0-un-def-alt1 x86_64\n' : 'Linux\n'));
        case 'lsmod': return ok('Module                  Size  Used by\nnouveau              2457600  0\nkvm                  1257472  0\nsnd_hda_intel          61440  2\n');
        case 'which': return a[0] && pkgOwner('/usr/bin/' + a[0]) ? ok('/usr/bin/' + a[0] + '\n') : err('');
        case 'man': return MAN[a[0]] ? ok(MAN[a[0]] + '\n(в настоящей системе откроется листалка, выход — q)\n') : err(`Нет справочной страницы для ${a[0] || ''}`);
        case 'apt-get': return aptSim(a);
        case 'apt-cache': return apt_cache(a);
        case 'rpm': return rpmCmd(a, input);
        case 'systemctl': {
          const f = a.filter((x) => x !== '--no-pager');
          if (f[0] === '--failed') return ok('  UNIT         LOAD   ACTIVE SUB    DESCRIPTION\n● cups.service loaded failed failed CUPS Scheduler\n\n1 loaded units listed.\n');
          if (f[0] === 'is-active') { const s = f[1] || ''; return s.startsWith('cups') ? { out: 'failed\n', ok: false } : ok('active\n'); }
          if (f[0] === 'status') {
            const s = f[1] || '';
            if (s.startsWith('cups')) return ok('● cups.service - CUPS Scheduler\n     Loaded: loaded (/usr/lib/systemd/system/cups.service; enabled)\n     Active: failed (Result: exit-code) since Tue 12:03\n    Process: 812 ExecStart=/usr/sbin/cupsd (code=exited, status=1/FAILURE)\n');
            return ok(`● ${s}.service\n     Active: active (running)\n`);
          }
          return err('systemctl: в учебном терминале доступны status, is-active и --failed (перезапуск и отключение требуют прав администратора)');
        }
        case 'ps': return ok(psAux(a));
        case 'pgrep': {
          const w = (a.find((x) => !x.startsWith('-')) || '').toLowerCase();
          const hit = procs.filter((r) => w && r.cmd.toLowerCase().includes(w));
          return hit.length ? ok(hit.map((r) => r.pid).join('\n') + '\n') : { out: '', ok: false };
        }
        case 'kill': return killCmd(a);
        case 'top': return ok('top - 12:10:00 up 3:25, 1 user, load average: 1,02, 0,80, 0,55\n' + psAux(['--sort=-cpu']) + '(в настоящей системе список обновляется, выход — q)\n');
        case 'free': return ok('              всего       занято     свободно\nПамять:       3,8Gi       2,1Gi       0,9Gi\nПодкачка:     2,0Gi       0,1Gi       1,9Gi\n');
        case 'uptime': return ok(' 12:10:00 up 3:25, 1 user, load average: 1,02, 0,80, 0,55\n');
        case 'journalctl': {
          const f = a.filter((x) => x !== '--no-pager');
          let rows = JOURNAL.slice();
          const ui = f.indexOf('-u'); if (ui >= 0) { const u = f[ui + 1] || ''; rows = rows.filter((x) => x.includes(u.replace('.service', ''))); }
          const pi = f.indexOf('-p'); if (pi >= 0 && f[pi + 1] === 'err') rows = rows.filter((x) => /Unable|FAILURE|Failed/.test(x));
          return ok(rows.join('\n') + (rows.length ? '\n' : '-- Нет записей --\n'));
        }
        case 'systemd-analyze': return a[0] === 'blame' ? ok('12.1s NetworkManager-wait-online.service\n 3.4s cups.service\n 1.2s sddm.service\n 0.8s sshd.service\n') : err('systemd-analyze: в учебном терминале доступна только blame');
        case 'ss': return ok('Netid State  Local Address:Port  Process\ntcp   LISTEN 0.0.0.0:22       users:(("sshd",pid=701))\ntcp   LISTEN 127.0.0.1:631    users:(("cupsd",pid=655))\n');
        case 'shutdown': case 'reboot': case 'poweroff': return err(`${cmd}: нужны права администратора. В учебном терминале это не выполняется`);
        case 'update-kernel': return a.includes('-l') ? ok('Доступные ядра (имитация):\n  kernel-image-6.12  6.12.0-alt1  (текущее)\n  kernel-image-6.13  6.13.0-alt1\n') : err('update-kernel: нужны права администратора. В учебном терминале доступен только флаг -l.');
        case 'su': case 'sudo': return err(`${cmd}: в учебном терминале права администратора не нужны`);
        case 'clear': return { out: '', ok: true, clear: true };
        case 'history': return ok(hist.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n') + '\n');
        case 'help': return ok('Доступно: pwd ls cd cat head tail wc grep echo mkdir touch rm cp mv chmod find df du whoami id hostname uname lsmod which man apt-get(-s) apt-cache rpm systemctl(status,is-active,--failed) ps pgrep kill top free uptime journalctl systemd-analyze ss update-kernel(-l) clear history\n');
        default: return err(`bash: ${cmd}: команда не найдена (в учебном терминале доступна часть команд, введите help)`);
      }
    }

    function stage(text, input) {
      let line = text.trim(); let redir = null;
      const m = /^(.*?)\s*(>>?)\s*(\S+)\s*$/.exec(line);
      if (m && !/['"][^'"]*>[^'"]*['"]/.test(line)) { line = m[1]; redir = { append: m[2] === '>>', path: m[3] }; }
      const argv = tokenize(line);
      if (!argv.length) return ok('');
      const r = runCmd(argv, input);
      if (redir) {
        const { dir, name } = parentOf(redir.path);
        if (!dir || dir.t !== 'd') return err(`bash: ${redir.path}: Нет такого файла или каталога`);
        const ex = dir.k[name];
        if (ex && ex.t === 'd') return err(`bash: ${redir.path}: Это каталог`);
        if (ex) ex.c = redir.append ? ex.c + r.out : r.out; else dir.k[name] = F(r.out, '644', U);
        return { out: '', ok: r.ok };
      }
      return r;
    }

    return {
      cwd: () => cwd,
      prompt: () => `[${U}@alt-lab ${cwd === HOME ? '~' : cwd.split('/').pop() || '/'}]$ `,
      exists: (p) => !!get(p),
      mode: (p) => { const n = get(p); return n ? n.m : null; },
      history: () => hist.slice(),
      exec(line) {
        line = line.trim();
        if (!line) return { out: '', ok: true };
        hist.push(line);
        let input = null, res = { out: '', ok: true };
        for (const s of splitTop(line, '|')) { res = stage(s, input); input = res.out; }
        return res;
      },
    };
  }

  g.Sandbox = { create };
})(typeof window !== 'undefined' ? window : globalThis);
