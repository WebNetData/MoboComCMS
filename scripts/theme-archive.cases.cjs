const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
test('theme templates: archive, search and not-found types with their own rules', () => {
  const t = source()('src/modules/site/domain/theme-templates.ts')
  for (const type of ['archive', 'search', 'not-found']) {
    assert(t.THEME_TEMPLATE_TYPES.includes(type))
    const id = t.newTemplateId(type)
    assert.match(id, t.TEMPLATE_PAGE_ID)
    assert.equal(t.templateTypeOf(id), type)
  }
  assert.equal(t.targetAllowed('archive', 'post-category:4'), true)
  assert.equal(t.targetAllowed('archive', 'posts'), false)
  assert.equal(t.targetAllowed('search', 'blog'), false)
  assert.equal(t.targetAllowed('not-found', 'all'), true)
  const posts = { route: 'archive', archiveOf: 'posts', archiveCategoryIds: [7, 3] }, products = { route: 'archive', archiveOf: 'products', archiveCategoryIds: [9] }
  assert.equal(t.targetScore('blog', posts), 3); assert.equal(t.targetScore('shop', posts), 0)
  assert.equal(t.targetScore('post-category:3', posts), 4, 'ancestor category matches')
  assert.equal(t.targetScore('product-category:9', posts), 0)
  assert.equal(t.targetScore('product-category:9', products), 4)
  assert.equal(t.conditionsScore([{ mode: 'include', target: 'all' }, { mode: 'exclude', target: 'post-category:7' }], posts), 0)
  assert.equal(t.targetScore('all', { route: 'search' }), 1); assert.equal(t.targetScore('home', { route: 'not-found' }), 0)
  assert.equal(t.targetScore('blog', { route: 'blog' }), 5, 'header/footer rules are unchanged')
})
