/* Network step of the existing wizard. No secrets in URLs, HTML, local storage or logs. */
window.MoboComInstallNetwork = function (ctx) {
  'use strict'
  var S = ctx.state, h = ctx.h, field = ctx.field, note = ctx.note, button = ctx.button
  var N = { domain: '', email: '', www: false, method: 'http', agreement: false, cloudflareToken: '', certificate: '', privateKey: '', certificateName: '', keyName: '', edit: false }
  var methods = [
    ['http', 'گواهی رایگان خودکار', 'Let’s Encrypt؛ دامنه باید به این سرور متصل و پورت ۸۰ باز باشد.'],
    ['cloudflare', 'اعتبارسنجی با DNS', 'با توکن محدود DNS کلادفلر؛ بدون خاموش‌کردن پراکسی.'],
    ['pem', 'گواهی آماده دارم', 'فایل PEM گواهی و کلید خصوصی خودتان را وارد کنید.']
  ]
  function bind(key, checkbox) { return function (e) { N[key] = checkbox ? e.target.checked : e.target.value } }
  function upload(key, max) {
    return h('input', { type: 'file', accept: '.pem,.crt,.cer,.key', 'data-install-upload': key, disabled: S.busy, onchange: function (e) {
      var file = e.target.files[0]
      N[key] = ''; N[key === 'certificate' ? 'certificateName' : 'keyName'] = ''
      if (!file) { ctx.render(); return }
      if (file.size > max) { S.error = 'فایل انتخاب‌شده بیش از حد بزرگ است'; ctx.render(); return }
      file.text().then(function (text) { N[key] = text; N[key === 'certificate' ? 'certificateName' : 'keyName'] = file.name; S.error = ''; ctx.render(); var control = document.querySelector('[data-install-upload="' + key + '"]'); if (control) control.focus() }).catch(function () { S.error = 'خواندن فایل انجام نشد'; ctx.render() })
    } })
  }
  function view() {
    var state = S.status.network || {}, tools = state.tools || {}, ready = state.ready && !N.edit
    if (!N.domain) N.domain = state.domain || ''
    if (!N.email) N.email = state.email || ''
    return [
      h('h1', { tabindex: '-1', id: 'title' }, 'دامنه و SSL'),
      h('p', { class: 'lead' }, 'دامنه و اتصال امن سایت را همین‌جا آماده کنید. این تنظیمات بعداً در پنل سرور قابل مدیریت‌اند.'),
      ready ? h('div', { class: 'network-result', role: 'status' }, h('b', null, 'دامنه و HTTPS آماده است'), h('code', { dir: 'ltr' }, state.siteUrl), h('p', null, 'اکنون مشخصات سایت و حساب مدیر را وارد کنید.')) : [
        note('warn', 'رکورد A دامنه را به IP عمومی سرور وصل کنید. اگر رکورد AAAA دارید، IPv6 آن نیز باید درست باشد.'),
        tools.ip ? h('p', { class: 'network-ip' }, 'نشانی گزارش‌شدهٔ سرور: ', h('code', { dir: 'ltr' }, String(tools.ip)), '؛ در شبکهٔ NAT از IP عمومی استفاده کنید.') : null,
        field('دامنهٔ سایت', h('input', { type: 'text', dir: 'ltr', value: N.domain, oninput: bind('domain'), autocomplete: 'off', placeholder: 'mobocom.net', maxlength: '253', disabled: S.busy })),
        h('label', { class: 'network-check' }, h('input', { type: 'checkbox', checked: N.www, onchange: bind('www', true), disabled: S.busy }), h('span', null, 'نشانی www هم فعال شود؛ رکورد DNS آن را نیز تنظیم کرده‌ام.')),
        h('fieldset', { class: 'network-methods', disabled: S.busy }, h('legend', null, 'روش تنظیم SSL'), methods.map(function (m) {
          return h('label', { class: 'network-method' + (N.method === m[0] ? ' selected' : '') }, h('input', { type: 'radio', name: 'tls-method', value: m[0], checked: N.method === m[0], onchange: function () { N.method = m[0]; S.error = ''; ctx.render(); document.querySelector('input[name="tls-method"]:checked').focus() } }), h('span', null, h('b', null, m[1]), h('small', null, m[2])))
        })),
        ['http', 'cloudflare'].indexOf(N.method) !== -1 ? [
          field('ایمیل گواهی SSL', h('input', { type: 'email', dir: 'ltr', value: N.email, oninput: bind('email'), autocomplete: 'email', disabled: S.busy }), 'برای ثبت گواهی در Let’s Encrypt؛ ایمیل مدیر را در مرحلهٔ حساب کاربری وارد می‌کنید.'),
          h('label', { class: 'network-check' }, h('input', { type: 'checkbox', checked: N.agreement, onchange: bind('agreement', true), disabled: S.busy }), h('span', null, 'با ', h('a', { href: 'https://letsencrypt.org/repository/', target: '_blank', rel: 'noopener noreferrer' }, 'شرایط صدور Let’s Encrypt'), ' موافقم.'))
        ] : null,
        N.method === 'cloudflare' ? [field('توکن محدود DNS کلادفلر', h('input', { type: 'password', dir: 'ltr', value: N.cloudflareToken, oninput: bind('cloudflareToken'), autocomplete: 'new-password', disabled: S.busy }), state.cloudflare ? 'توکن قبلی ذخیره شده؛ برای حفظ آن خالی بگذارید.' : 'فقط مجوز Zone:DNS:Edit برای دامنهٔ خودتان بدهید؛ توکن به‌صورت رمزگذاری‌شده ذخیره می‌شود.'), !tools.cloudflare ? note('warn', 'افزونهٔ DNS کلادفلر روی سرور شناسایی نشد؛ نصب اولیه را بررسی کنید.') : null] : null,
        N.method === 'pem' ? [field('فایل گواهی و زنجیرهٔ PEM', upload('certificate', 131072), N.certificateName || 'گواهی باید SAN دامنه را داشته باشد و منقضی نشده باشد.'), field('فایل کلید خصوصی PEM', upload('privateKey', 32768), N.keyName || 'کلید باید با گواهی منطبق و بدون رمز فایل باشد؛ کلید در خروجی نمایش داده نمی‌شود.')] : null,
        state.error ? note('bad', state.error) : null,
        h('div', { class: 'network-submit' }, button(S.busy ? 'در حال تنظیم اتصال امن…' : 'اعمال دامنه و SSL', apply, 'primary', S.busy || !tools.installed || (N.method === 'pem' && (!N.certificate || !N.privateKey)))),
        S.busy ? h('p', { class: 'note', role: 'status' }, S.waiting ? 'تنظیمات ذخیره شد؛ منتظر راه‌اندازی دوبارهٔ سرویس هستیم. این صفحه را باز نگه دارید.' : 'در حال بررسی دامنه و گواهی؛ ممکن است چند دقیقه زمان ببرد. رمزها و کد نصب در نشانی صفحه قرار نمی‌گیرند.') : null
      ],
      note('bad', S.error),
      h('div', { class: 'actions' }, button('قبلی', ctx.back, '', S.busy), ready ? button('ویرایش تنظیمات', function () { N.edit = true; ctx.render() }, '', S.busy) : button('بررسی وضعیت', function () { ctx.load() }, '', S.busy), h('div', { class: 'end' }, button('ادامه', ctx.next, 'primary', !ready || S.busy)))
    ]
  }
  function apply() {
    if (!N.domain.trim()) { S.error = 'دامنهٔ سایت را وارد کنید'; ctx.render(); return }
    if (['http', 'cloudflare'].indexOf(N.method) !== -1 && !N.agreement) { S.error = 'برای صدور خودکار، شرایط گواهی را تأیید کنید'; ctx.render(); return }
    S.busy = true; S.waiting = false; S.error = ''; ctx.render()
    var body = { op: 'network', domain: N.domain, www: N.www, method: N.method, email: N.email, acmeAgreement: N.agreement }
    if (N.method === 'cloudflare') body.cloudflareToken = N.cloudflareToken
    if (N.method === 'pem') { body.certificate = N.certificate; body.privateKey = N.privateKey }
    ctx.api('POST', body).then(function (r) {
      if (!r.ok) { S.busy = false; S.error = r.data.error || 'تنظیم دامنه انجام نشد'; ctx.render(); return }
      N.cloudflareToken = ''; N.privateKey = ''; N.certificate = ''; N.edit = false
      S.waiting = true; ctx.render(); waitForNetwork(r.data.url, 0)
    }).catch(function () { S.waiting = true; ctx.render(); waitForNetwork('', 0) })
  }
  function waitForNetwork(url, attempt) {
    if (attempt > 90) { S.busy = false; S.waiting = false; S.error = 'سرویس هنوز آماده نیست؛ وضعیت را بررسی کنید یا این صفحه را دوباره باز کنید. تنظیمات ذخیره‌شده باقی می‌ماند.'; ctx.render(); return }
    setTimeout(function () {
      ctx.api('GET').then(function (r) {
        if (r.ok && r.data.network && r.data.network.ready && (!url || r.data.network.siteUrl === url)) {
          S.status = r.data; S.form.siteUrl = r.data.network.siteUrl; S.busy = false; S.waiting = false; N.edit = false; N.cloudflareToken = ''; N.privateKey = ''; N.certificate = ''; ctx.render(true); return
        }
        waitForNetwork(url, attempt + 1)
      }).catch(function () { waitForNetwork(url, attempt + 1) })
    }, 2000)
  }
  return { view: view }
}
