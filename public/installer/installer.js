/* MoboComCMS web installer: a step-by-step wizard. No dependencies; all text is inserted as text (never as HTML). */
(function () {
  'use strict'
  var root = document.getElementById('app')
  var API = '/api/install'
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d] }) }

  var S = {
    status: null, step: 'welcome', busy: false, error: '', notice: '', log: '', waiting: false, warnings: [],
    token: '', showPassword: false,
    form: { host: '', port: '5432', database: '', user: '', password: '', ssl: 'prefer', siteName: '', tagline: '', siteUrl: '', adminName: '', adminEmail: '', adminPassword: '', adminPassword2: '' },
    modules: null, dbTested: false
  }
  try { S.token = sessionStorage.getItem('installToken') || '' } catch (e) { /* private mode */ }

  // ------------------------------------------------------------------ helpers
  function h(tag, attrs) {
    var el = document.createElement(tag)
    var i
    for (var k in (attrs || {})) {
      var v = attrs[k]
      if (v === false || v == null) continue
      if (k === 'class') el.className = v
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
      else if (k === 'value') el.value = v
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v
      else el.setAttribute(k, v === true ? '' : v)
    }
    for (i = 2; i < arguments.length; i++) append(el, arguments[i])
    return el
  }
  function append(el, child) {
    if (child == null || child === false) return
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c) }); return }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child)
  }

  function api(method, body) {
    var headers = { 'Content-Type': 'application/json' }
    if (S.token) headers['x-install-token'] = S.token
    return fetch(API, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (data) { return { ok: r.ok, status: r.status, data: data } })
    })
  }

  function stepsFor(mode) {
    var list = [{ id: 'welcome', label: 'شروع' }]
    if (mode === 'needs-database') list.push({ id: 'database', label: 'پایگاه داده' })
    if (mode === 'needs-schema') list.push({ id: 'schema', label: 'ساخت جدول‌ها' })
    list.push({ id: 'site', label: 'سایت' }, { id: 'admin', label: 'مدیر' }, { id: 'features', label: 'امکانات' }, { id: 'review', label: 'نصب' })
    return list
  }

  function load() {
    return api('GET').then(function (r) {
      if (r.status === 404) { location.replace('/'); return }
      if (r.status === 401 && r.data.tokenRequired) { S.status = { tokenRequired: true }; render(); return }
      if (!r.ok) { S.error = r.data.error || 'وضعیت نصب خوانده نشد'; render(); return }
      S.status = r.data
      if (!S.form.siteUrl) S.form.siteUrl = r.data.origin || location.origin
      if (!S.form.siteName) S.form.siteName = ''
      if (r.data.modules && !S.modules) { S.modules = {}; r.data.modules.forEach(function (m) { S.modules[m.id] = m.defaultEnabled }) }
      render()
    }).catch(function () { S.error = 'ارتباط با سرور برقرار نشد'; render() })
  }

  function go(step) { S.step = step; S.error = ''; S.notice = ''; render(true) }
  function next() {
    var list = stepsFor(S.status.mode)
    var i = list.findIndex(function (s) { return s.id === S.step })
    go(list[Math.min(list.length - 1, i + 1)].id)
  }
  function back() {
    var list = stepsFor(S.status.mode)
    var i = list.findIndex(function (s) { return s.id === S.step })
    if (i > 0) go(list[i - 1].id)
  }
  function bind(key) { return function (e) { S.form[key] = e.target.value; if (key === 'adminPassword') updateMeter() } }

  // ------------------------------------------------------------------ pieces
  var uid = 0
  // A visible label tied to its control by id (and the hint by aria-describedby), so screen readers announce them correctly.
  function field(label, control, hint) {
    var id = 'f' + (++uid)
    var target = /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName) ? control : control.querySelector('input,select,textarea')
    if (target) { target.id = id; if (hint) target.setAttribute('aria-describedby', id + '-h') }
    return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { id: id + '-h' }, hint) : null)
  }
  function note(kind, text) { return text ? h('p', { class: 'note ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, text) : null }
  function button(label, onclick, kind, disabled) { return h('button', { type: 'button', class: kind || '', onclick: onclick, disabled: disabled }, label) }

  function strength(pw) {
    var score = 0
    if (pw.length >= 10) score++
    if (pw.length >= 14) score++
    if (/[A-Za-z؀-ۿ]/.test(pw) && /\d/.test(pw)) score++
    if (/[^A-Za-z0-9؀-ۿ]/.test(pw)) score++
    return score
  }
  function updateMeter() {
    var bar = document.getElementById('meter')
    if (!bar) return
    var s = strength(S.form.adminPassword)
    bar.style.width = (s * 25) + '%'
    bar.style.background = s <= 1 ? 'var(--bad)' : s === 2 ? 'var(--warn)' : 'var(--ok)'
  }

  function stepper() {
    var list = stepsFor(S.status.mode)
    var at = list.findIndex(function (s) { return s.id === S.step })
    return h('ol', { class: 'steps', 'aria-label': 'مراحل نصب' }, list.map(function (s, i) {
      return h('li', { class: i === at ? 'is-current' : i < at ? 'is-done' : '', 'aria-current': i === at ? 'step' : false }, h('i', null, i < at ? '✓' : fa(i + 1)), h('span', null, s.label))
    }))
  }

  // ------------------------------------------------------------------ steps
  function welcome() {
    var checks = S.status.checks || []
    var blocked = checks.some(function (c) { return c.status === 'fail' })
    var marks = { ok: '✓', warn: '!', fail: '✕' }
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'به نصب‌کنندهٔ موبوکام خوش آمدید'),
      h('p', { class: 'lead' }, 'در چند مرحله سایت را راه‌اندازی می‌کنیم: پایگاه داده، مشخصات سایت، حساب مدیر و امکانات. همه‌چیز از همین صفحه انجام می‌شود.'),
      h('ul', { class: 'checks' }, checks.map(function (c) {
        return h('li', { class: c.status }, h('span', { class: 'mark', 'aria-hidden': 'true' }, marks[c.status]), h('b', null, c.label, h('span', { class: 'sr-only' }, c.status === 'ok' ? ' — سالم' : c.status === 'warn' ? ' — هشدار' : ' — مشکل')), h('small', null, c.detail))
      })),
      blocked ? note('bad', 'موارد قرمز را رفع کنید و صفحه را دوباره باز کنید.') : null,
      h('div', { class: 'actions' }, button('بررسی دوباره', function () { load() }), h('div', { class: 'end' }, button('شروع نصب', next, 'primary', blocked)))
    ]
  }

  function database() {
    var f = S.form
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'اتصال به پایگاه داده'),
      h('p', { class: 'lead' }, 'مشخصات یک پایگاه داده PostgreSQL خالی را وارد کنید. رمز شما فقط روی همین سرور و در یک فایل محافظت‌شده ذخیره می‌شود.'),
      h('div', { class: 'grid2' },
        field('نشانی سرور', h('input', { type: 'text', dir: 'ltr', value: f.host, oninput: bind('host'), placeholder: 'postgres یا 127.0.0.1', autocomplete: 'off' })),
        field('درگاه (Port)', h('input', { type: 'number', dir: 'ltr', value: f.port, oninput: bind('port'), min: '1', max: '65535' })),
        field('نام پایگاه داده', h('input', { type: 'text', dir: 'ltr', value: f.database, oninput: bind('database'), autocomplete: 'off' })),
        field('نام کاربری', h('input', { type: 'text', dir: 'ltr', value: f.user, oninput: bind('user'), autocomplete: 'off' })),
        field('گذرواژه', h('input', { type: 'password', dir: 'ltr', value: f.password, oninput: bind('password'), autocomplete: 'new-password' })),
        field('اتصال امن (SSL)', h('select', { onchange: bind('ssl') },
          h('option', { value: 'prefer', selected: f.ssl === 'prefer' }, 'خودکار'), h('option', { value: 'require', selected: f.ssl === 'require' }, 'الزامی'), h('option', { value: 'disable', selected: f.ssl === 'disable' }, 'خاموش')))
      ),
      field('نشانی عمومی سایت', h('input', { type: 'url', dir: 'ltr', value: f.siteUrl, oninput: bind('siteUrl'), placeholder: 'https://example.com' }), 'همان نشانی که کاربران در مرورگر می‌زنند؛ در سرور واقعی باید با https باشد.'),
      note('info', 'کلیدهای امنیتی (نشست کاربران، پنل‌ها و کارهای پس‌زمینه) به‌صورت تصادفی و خودکار ساخته می‌شوند.'),
      S.dbTested ? note('ok', 'اتصال موفق بود.') : null,
      note('bad', S.error),
      S.waiting ? h('div', { class: 'note info', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' ', S.notice || 'سرویس دوباره راه‌اندازی می‌شود…') : null,
      h('div', { class: 'actions' }, button('قبلی', back, '', S.busy || S.waiting),
        h('div', { class: 'end' }, button('آزمایش اتصال', dbTest, '', S.busy || S.waiting), button('ذخیره و راه‌اندازی مجدد', dbSave, 'primary', S.busy || S.waiting || !S.dbTested)))
    ]
  }

  function dbBody() { var f = S.form; return { host: f.host, port: f.port, database: f.database, user: f.user, password: f.password, ssl: f.ssl, siteUrl: f.siteUrl } }
  function dbTest() {
    S.busy = true; S.error = ''; S.dbTested = false; render()
    api('POST', Object.assign({ op: 'database.test' }, dbBody())).then(function (r) {
      S.busy = false
      if (r.ok) S.dbTested = true; else S.error = r.data.error || 'اتصال برقرار نشد'
      render()
    })
  }
  function dbSave() {
    S.busy = true; S.error = ''; render()
    api('POST', Object.assign({ op: 'database.save' }, dbBody())).then(function (r) {
      S.busy = false
      if (!r.ok) { S.error = r.data.error || 'ذخیره نشد'; render(); return }
      if (r.data.restart === 'manual') {
        S.notice = 'تنظیمات ذخیره شد. سرویس را دستی دوباره راه‌اندازی کنید؛ صفحه خودکار ادامه می‌دهد.'
        S.waiting = true; render(); waitForRestart(true); return
      }
      S.notice = 'تنظیمات ذخیره شد؛ سرویس در حال راه‌اندازی مجدد است. چند لحظه صبر کنید…'
      S.waiting = true; render(); waitForRestart(false)
    })
  }
  function waitForRestart(manual) {
    var started = Date.now(), wentDown = manual
    ;(function poll() {
      fetch(API, { headers: S.token ? { 'x-install-token': S.token } : {}, cache: 'no-store' }).then(function (r) { return r.json().then(function (d) { return { r: r, d: d } }) }).then(function (x) {
        if (x.r.status === 404) { location.replace('/'); return }
        // The old process may still answer for a second or two; wait until it has gone down and a new one answers with a new state.
        if (x.r.ok && x.d.mode !== 'needs-database' && wentDown) { S.waiting = false; S.dbTested = false; S.status = x.d; S.step = 'welcome'; if (x.d.modules && !S.modules) { S.modules = {}; x.d.modules.forEach(function (m) { S.modules[m.id] = m.defaultEnabled }) } render(true); return }
        again()
      }).catch(function () { wentDown = true; again() })
      function again() {
        if (Date.now() - started > 240000) { S.waiting = false; S.error = 'سرویس در زمان انتظار بالا نیامد. اگر با Docker یا systemd اجرا نمی‌شود، آن را دستی راه‌اندازی کنید و این صفحه را دوباره باز کنید.'; render(); return }
        setTimeout(poll, 2000)
      }
    })()
  }

  function schema() {
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'ساخت جدول‌های پایگاه داده'),
      h('p', { class: 'lead' }, 'پایگاه داده متصل است اما هنوز جدولی ندارد. با یک کلیک ساخته می‌شوند (چند دقیقه طول می‌کشد).'),
      S.log ? h('pre', { class: 'log' }, S.log) : null,
      note('bad', S.error),
      h('div', { class: 'actions' }, button('قبلی', back, '', S.busy),
        h('div', { class: 'end' }, button(S.busy ? 'در حال ساخت…' : 'ساخت جدول‌ها', runSchema, 'primary', S.busy)))
    ]
  }
  function runSchema() {
    S.busy = true; S.error = ''; render()
    api('POST', { op: 'schema' }).then(function (r) {
      S.busy = false
      if (!r.ok) { S.error = r.data.error || 'ساخت جدول‌ها ناموفق بود'; render(); return }
      S.log = r.data.log || ''
      return load().then(function () { S.step = 'site'; render(true) })
    })
  }

  function site() {
    var f = S.form
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'مشخصات سایت'),
      h('p', { class: 'lead' }, 'این‌ها را بعداً هم از پنل مدیریت می‌توانید تغییر دهید.'),
      field('نام سایت', h('input', { type: 'text', value: f.siteName, oninput: bind('siteName'), maxlength: '80', autocomplete: 'off', placeholder: 'مثلاً موبوکام' })),
      field('شعار (اختیاری)', h('input', { type: 'text', value: f.tagline, oninput: bind('tagline'), maxlength: '160' })),
      field('نشانی عمومی سایت', h('input', { type: 'url', dir: 'ltr', value: f.siteUrl, oninput: bind('siteUrl'), placeholder: 'https://example.com' }), 'برای لینک‌ها، نقشهٔ سایت و پیام‌ها استفاده می‌شود.'),
      note('bad', S.error),
      h('div', { class: 'actions' }, button('قبلی', back), h('div', { class: 'end' }, button('ادامه', function () {
        if (!S.form.siteName.trim()) { S.error = 'نام سایت را وارد کنید'; render(); return }
        next()
      }, 'primary')))
    ]
  }

  function admin() {
    var f = S.form
    var pwType = S.showPassword ? 'text' : 'password'
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'حساب مدیر'),
      h('p', { class: 'lead' }, 'با این حساب وارد پنل مدیریت می‌شوید. گذرواژه را جای امنی نگه دارید.'),
      h('div', { class: 'grid2' },
        field('نام', h('input', { type: 'text', value: f.adminName, oninput: bind('adminName'), autocomplete: 'name' })),
        field('ایمیل', h('input', { type: 'email', dir: 'ltr', value: f.adminEmail, oninput: bind('adminEmail'), autocomplete: 'email' }))),
      field('گذرواژه', h('div', { class: 'row' }, h('input', { type: pwType, dir: 'ltr', value: f.adminPassword, oninput: bind('adminPassword'), autocomplete: 'new-password' }), button(S.showPassword ? 'پنهان' : 'نمایش', function () { S.showPassword = !S.showPassword; render() })),
        'دست‌کم ۱۰ نویسه، شامل حرف و عدد.'),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { id: 'meter' })),
      h('div', { style: 'height:14px' }),
      field('تکرار گذرواژه', h('input', { type: pwType, dir: 'ltr', value: f.adminPassword2, oninput: bind('adminPassword2'), autocomplete: 'new-password' })),
      note('bad', S.error),
      h('div', { class: 'actions' }, button('قبلی', back), h('div', { class: 'end' }, button('ادامه', function () {
        var e = adminProblem()
        if (e) { S.error = e; render(); return }
        next()
      }, 'primary')))
    ]
  }
  function adminProblem() {
    var f = S.form
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.adminEmail.trim())) return 'ایمیل معتبر وارد کنید'
    if (f.adminPassword.length < 10) return 'گذرواژه دست‌کم ۱۰ نویسه باشد'
    if (!/[A-Za-z؀-ۿ]/.test(f.adminPassword) || !/\d/.test(f.adminPassword)) return 'گذرواژه هم حرف و هم عدد داشته باشد'
    var lower = f.adminPassword.toLowerCase()
    var common = ['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwerty', 'abc123', 'letmein', 'admin', 'welcome', 'iloveyou', '11111111', '00000000']
    if (common.some(function (w) { return lower.indexOf(w) !== -1 })) return 'این گذرواژه بیش از حد رایج است'
    var local = f.adminEmail.split('@')[0].toLowerCase()
    if (local.length >= 4 && lower.indexOf(local) !== -1) return 'گذرواژه نباید شامل بخشی از ایمیل باشد'
    if (f.adminPassword !== f.adminPassword2) return 'تکرار گذرواژه یکسان نیست'
    return ''
  }

  function features() {
    var list = (S.status.modules || [])
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'امکانات سایت'),
      h('p', { class: 'lead' }, 'بخش‌هایی را که می‌خواهید فعال باشند انتخاب کنید. هر وقت خواستید از «افزونه‌ها» در پنل مدیریت تغییرشان دهید.'),
      h('div', { class: 'features' }, list.map(function (m) {
        return h('label', { class: 'feature' }, h('input', { type: 'checkbox', checked: !!S.modules[m.id], onchange: function (e) { S.modules[m.id] = e.target.checked } }), h('span', null, h('b', null, m.name), h('small', null, m.description || '')))
      })),
      h('div', { class: 'actions' }, button('قبلی', back), h('div', { class: 'end' }, button('ادامه', next, 'primary')))
    ]
  }

  function review() {
    var f = S.form
    var on = (S.status.modules || []).filter(function (m) { return S.modules[m.id] }).length
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'مرور و نصب'),
      h('p', { class: 'lead' }, 'اگر همه‌چیز درست است، نصب را بزنید.'),
      h('dl', { class: 'summary' },
        h('dt', null, 'نام سایت'), h('dd', null, f.siteName),
        h('dt', null, 'نشانی سایت'), h('dd', { dir: 'ltr' }, f.siteUrl || '—'),
        h('dt', null, 'مدیر'), h('dd', { dir: 'ltr' }, f.adminEmail),
        h('dt', null, 'امکانات'), h('dd', null, fa(on) + ' بخش فعال')),
      note('bad', S.error),
      h('div', { class: 'actions' }, button('قبلی', back, '', S.busy), h('div', { class: 'end' }, button(S.busy ? 'در حال نصب…' : 'نصب سایت', install, 'primary', S.busy)))
    ]
  }
  function install() {
    S.busy = true; S.error = ''; render()
    var f = S.form
    api('POST', { op: 'site', siteName: f.siteName, tagline: f.tagline, siteUrl: f.siteUrl, adminName: f.adminName, adminEmail: f.adminEmail, adminPassword: f.adminPassword, modules: S.modules }).then(function (r) {
      S.busy = false
      if (!r.ok) { S.error = r.data.error || 'نصب ناموفق بود'; render(); return }
      S.warnings = r.data.warnings || []; S.loginUrl = r.data.loginUrl || '/login'
      S.form.adminPassword = ''; S.form.adminPassword2 = ''
      S.step = 'done'; render(true)
    })
  }

  function done() {
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'نصب کامل شد 🎉'),
      h('p', { class: 'lead' }, 'سایت شما آماده است. با حساب مدیر وارد شوید.'),
      S.warnings.length ? note('warn', 'چند امکان تغییر نکرد: ' + S.warnings.join('؛ ')) : null,
      h('p', null, 'قدم‌های پیشنهادی بعدی:'),
      h('ul', null,
        h('li', null, 'ارسال ایمیل و پیامک را در «تنظیمات» فعال کنید.'),
        h('li', null, 'درگاه پرداخت و روش‌های ارسال را تنظیم کنید.'),
        h('li', null, 'پشتیبان‌گیری خودکار را روشن کنید.'),
        h('li', null, 'قالب و رنگ‌های سایت را از «ظاهر» انتخاب کنید.')),
      h('div', { class: 'actions' }, h('span'), h('div', { class: 'end' }, h('a', { class: 'btn primary', href: S.loginUrl || '/login', style: 'background:var(--accent);color:#fff;border-color:var(--accent)' }, 'ورود به پنل مدیریت')))
    ]
  }

  function tokenStep() {
    var input = h('input', { type: 'password', dir: 'ltr', autocomplete: 'off' })
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'کد نصب'),
      h('p', { class: 'lead' }, 'کد خصوصی نصب را از خروجی اولین راه‌اندازی سرور یا مقدار INSTALL_TOKEN بردارید. این کد را در اختیار دیگران نگذارید؛ پس از ساخت مدیر، نصب بسته می‌شود.'),
      field('کد نصب', input),
      note('bad', S.error),
      h('div', { class: 'actions' }, h('span'), h('div', { class: 'end' }, button('ادامه', function () {
        S.token = input.value.trim()
        try { sessionStorage.setItem('installToken', S.token) } catch (e) { /* ignore */ }
        S.error = ''
        api('GET').then(function (r) { if (r.ok) { S.status = r.data; S.form.siteUrl = r.data.origin || location.origin; if (r.data.modules && !S.modules) { S.modules = {}; r.data.modules.forEach(function (m) { S.modules[m.id] = m.defaultEnabled }) } render(true) } else { S.error = 'کد نصب درست نیست'; render() } })
      }, 'primary')))
    ]
  }

  // ------------------------------------------------------------------ render
  var VIEWS = { welcome: welcome, database: database, schema: schema, site: site, admin: admin, features: features, review: review, done: done }
  function render(focus) {
    root.textContent = ''
    var body
    if (!S.status) body = [h('p', { class: 'lead', role: 'status' }, S.error || 'در حال بررسی…'), note('bad', S.error && !S.status ? '' : '')]
    else if (S.status.tokenRequired && !S.status.mode) body = tokenStep()
    else {
      var list = stepsFor(S.status.mode)
      if (S.step !== 'done' && !list.some(function (s) { return s.id === S.step })) S.step = 'welcome'
      body = [S.step === 'done' ? null : stepper(), h('section', { class: 'card', 'aria-labelledby': 'title' }, VIEWS[S.step]())]
    }
    root.appendChild(h('div', { class: 'brand' }, h('b', { 'aria-hidden': 'true' }, 'م'), h('span', null, 'نصب موبوکام', h('small', null, 'MoboComCMS Installer'))))
    append(root, body)
    updateMeter()
    if (focus) { var t = document.getElementById('title'); if (t) t.focus() }
  }

  load()
})()
