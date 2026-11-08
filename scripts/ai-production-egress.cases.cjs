const {test}=require('node:test'),assert=require('node:assert/strict'),source=require('./connected-source-loader.cjs'),{build}=require('../deploy/ubuntu/xray-config.cjs');
test('Qwen and DeepSeek share the existing AI egress purpose with narrowly matching trusted root routing',()=>{
  const egress=source()('src/modules/social/domain/egress.ts');for(const host of['dashscope-intl.aliyuncs.com','api.deepseek.com'])assert.equal(egress.purposeOfHost(host),'ai');assert.notEqual(egress.purposeOfHost('unrelated.aliyuncs.com'),'ai');assert.notEqual(egress.purposeOfHost('api.deepseek.com.evil.example'),'ai');
  const config=build({version:2,profiles:[{tag:'p1',outbound:{protocol:'socks',settings:{servers:[{address:'proxy.example',port:1080}]}}}],routes:{ai:'p1'}});
  const rules=JSON.stringify(config.routing.rules);assert(rules.includes('full:dashscope-intl.aliyuncs.com'));assert(rules.includes('full:api.deepseek.com'));assert(!rules.includes('domain:aliyuncs.com'));assert(config.routing.rules.some(r=>r.outboundTag==='drop'));
});
