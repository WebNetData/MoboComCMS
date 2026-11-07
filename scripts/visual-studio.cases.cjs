const { test } = require('node:test'), assert = require('node:assert/strict'), React = require('react')
const load = require('./connected-source-loader.cjs')()
const builder = load('src/modules/site/domain/builder.ts'), themes = load('src/modules/site/domain/theme-templates.ts'), ai = load('src/modules/site/domain/builder-design.ts')
function doc(type = 'heading') { const d = builder.emptyDoc(), s = builder.createSection(1); s.columns[0].widgets.push(builder.createWidget(type)); d.sections.push(s); return d }
test('studio dynamic bindings and account parts accept closed values only', () => {
  for (const [type, field, value] of [['dynamic-value', 'field', 'secret'], ['dashboard-part', 'part', 'other-user']]) {
    const d = doc(type); d.sections[0].columns[0].widgets[0].props[field] = value
    assert.notEqual(builder.parseBuilderDoc(d).sections[0].columns[0].widgets[0].props[field], value)
  }
  assert.equal(builder.parseBuilderDoc(doc('surface-content')).sections[0].columns[0].widgets[0].type, 'surface-content')
})
test('specific content rules outrank categories; exclusions win; account rules cannot target another user', () => {
  const rules = [{mode:'include',target:'posts'}, {mode:'include',target:'post-id:7'}]
  assert.equal(themes.conditionsScore(rules, {route:'post',postId:7}),7)
  assert.equal(themes.conditionsScore([...rules,{mode:'exclude',target:'post-category:2'}], {route:'post',postId:7,postCategoryIds:[2]}),0)
  assert.equal(themes.targetScore('product-id:7',{route:'post',postId:7}),0)
  assert.equal(themes.targetScore('entry:7',{route:'surface',surface:'movie',entryId:7}),6)
  assert.throws(()=>themes.validateTemplateMeta({id:themes.newTemplateId('surface'),surface:'account',name:'test',conditions:[{mode:'include',target:'entry:7'}]}))
  const archived=themes.validateTemplateMeta({id:themes.newTemplateId('single-post'),name:'old'})
  assert.equal(themes.validateTemplateMeta({generation:1,name:'edited'},archived).generation,undefined,'editing an archived row cannot silently opt in')
})
test('AI designs stay proposals in canonical visual schema without code or arbitrary widgets', () => {
  const d=doc('dynamic-value'); assert.equal(ai.designResponse('```json\n'+JSON.stringify(d)+'\n```').sections.length,1)
  const code=doc(); code.code.js='alert(1)'; assert.throws(()=>ai.proposedDesign(code))
  const unknown=doc(); unknown.sections[0].columns[0].widgets[0].type='run-shell'; assert.throws(()=>ai.proposedDesign(unknown))
  assert.throws(()=>ai.proposedDesign({...doc(),sections:Array(9).fill(doc().sections[0])}))
  assert.equal(ai.designStillCurrent(JSON.stringify(d),d),true); assert.equal(ai.designStillCurrent(JSON.stringify(d),doc()),false)
})
test('dashboard composition only collects owner-marked nodes, never interprets model props as data', () => {
  const {collectDashboardParts}=load('src/app/dashboard/design-parts.tsx')
  const mine=React.createElement('div',{'data-dashboard-part':'profile'},'current member')
  const privateNode=React.createElement('div',{'data-dashboard-part':'other-user'},'ignored')
  const nodes=React.createElement('main',null,mine,privateNode),parts=collectDashboardParts(nodes)
  assert.equal(parts.profile,mine); assert.equal(parts['other-user'],undefined); assert.equal(parts.all,nodes)
})
