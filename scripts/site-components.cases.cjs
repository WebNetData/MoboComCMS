const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
test('components: definitions are bounded and values are always escaped and typed', () => {
  const c = source()('src/modules/site/domain/components.ts')
  const lib = c.normalizeLibrary({ components: [
    { id: 'cc-card0001', name: 'Card', fields: [{ key: 'title', label: 'T', type: 'text', default: 'Hi' }, { key: 'title', type: 'text' }, { key: 'bad key' }, { key: 'tone', type: 'select', options: 'a\nb' }, { key: 'color', type: 'color', default: 'red;}' }, { key: 'link', type: 'url' }, { key: 'body', type: 'textarea' }, { key: 'show', type: 'toggle' }],
      html: '<h3>{{field.title}}</h3>{{#field.show}}<em>on</em>{{/field.show}}<a href="{{field.link}}">x</a><p>{{field.body}}</p><i>{{site.brand}}</i>{{field.missing}}', css: 'selector { color: {{x}} } selector h3 { margin: 0 }' },
    { id: 'cc-card0001', name: 'dup' }, { id: 'nope' },
  ] })
  assert.equal(lib.components.length, 1)
  const def = lib.components[0]
  assert.deepEqual(def.fields.map(f => f.key), ['title', 'tone', 'color', 'link', 'body', 'show'])
  assert.equal(def.fields.find(f => f.key === 'tone').default, 'a')
  assert.equal(def.fields.find(f => f.key === 'color').default, '')
  const values = c.componentValues(def, JSON.stringify({ title: '<script>x</script>', link: 'javascript:alert(1)', body: 'a\nb', show: true, tone: 'z', color: 'var(--primary)' }))
  assert.equal(values.tone, 'a'); assert.equal(values.link, ''); assert.equal(values.show, '1'); assert.equal(values.color, 'var(--primary)')
  const html = c.renderComponentHtml(def, values, { brand: 'B&B', locale: 'fa' })
  assert(!html.includes('<script>')); assert(html.includes('&lt;script&gt;'))
  assert(html.includes('<em>on</em>')); assert(html.includes('<p>a<br>b</p>')); assert(html.includes('<i>B&amp;B</i>')); assert(html.includes('href=""'))
  assert(!c.renderComponentHtml(def, { ...values, show: '' }, { brand: '', locale: 'fa' }).includes('<em>'))
  assert.equal(c.componentValues(def, 'not json').title, 'Hi')
  assert.equal(c.componentCss(def), '.cc-card0001 { color: {{x}} } .cc-card0001 h3 { margin: 0 }')
  assert.equal(c.componentCss({ ...def, css: '</style><script>x</script> selector { color: red' }), '')
  assert(!c.componentCss({ ...def, css: '</style> selector { background: url(javascript:x) }' }).includes('<'))
  assert.equal(c.componentScript({ ...def, js: '' }, 'i'), '')
  assert.match(c.componentScript({ ...def, js: 'root.dataset.ok = 1' }, 'cc-card0001-w"1'), /data-cc-instance="cc-card0001-w1"/)
  assert.match(c.newComponentId(), c.COMPONENT_ID)
})
test('components: AI component target asks for fields and keeps them', () => {
  const a = source()('src/modules/ai/domain/code-assist.ts')
  const req = a.parseCodeRequest({ target: 'component', instruction: 'کارت قیمت', scope: 'mc-x-ab12cd34' })
  assert.match(a.codePrompt(req, 'B').user, /\{\{field\.key\}\}/)
  const out = a.parseCodeResult(JSON.stringify({ html: '<b>{{field.t}}</b>', css: 'selector{}', js: '', fields: [{ key: 't' }] }))
  assert.equal(out.fields.length, 1)
  assert.deepEqual(a.scanCode({ html: '<b>x</b>', css: 'selector { color: red }', js: 'root.x = 1' }, 'mc-x-ab12cd34'), [])
})
