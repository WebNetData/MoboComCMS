// Execute the actual seed owner up to its identity boundary using real namespaced roles.
// Never run the rest of bootstrap against a caller's database or touch default roles.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {PrismaClient,Prisma}=require(process.env.MOBOCOM_TEST_CLIENT||'@prisma/client'),prisma=new PrismaClient();
const prefix=`seed-role-${require('crypto').randomUUID()}-`,stop=new Error('FIXTURE_IDENTITY_BOUNDARY');
const definitions=JSON.parse(fs.readFileSync('prisma/system-roles.json','utf8'));
const roleNames=new Set(definitions.map(role=>role.name));
const fixture={
 $executeRaw:sql=>{
  assert.match(sql.strings.join(''),/INSERT INTO "Role"/,'only role inserts are allowed in this fixture');
  assert.equal(sql.values.filter(value=>roleNames.has(value)).length,1,'namespace exactly the declared role name');
  return prisma.$executeRaw(Prisma.sql(sql.strings,...sql.values.map(value=>roleNames.has(value)?prefix+value:value)));
 },
 role:{
  upsert:args=>prisma.role.upsert({...args,where:{name:prefix+args.where.name},create:{...args.create,name:prefix+args.create.name}}),
  findUnique:args=>prisma.role.findUnique({...args,where:{name:prefix+args.where.name}}),
 },
 user:{findUnique:async()=>{throw stop}},
};
const source=fs.readFileSync('prisma/seed.cjs','utf8');
assert.match(source,/\nmain\(\)\s*\n\s*\.catch/);
const mod={exports:{}};
new Function('require','module','exports',source.replace(/\nmain\(\)[\s\S]*$/,'\nmodule.exports = { main }\n'))(name=>name==='@prisma/client'?{Prisma,PrismaClient:class{constructor(){return fixture}}}:name==='./system-roles.json'?definitions:require(name),mod,mod.exports);
const seedRoles=()=>assert.rejects(mod.exports.main(),error=>error===stop,'stop before identities/pages/settings/demo data');
async function main(){
 const concurrent=await Promise.allSettled(Array.from({length:12},()=>seedRoles()));
 assert.equal(concurrent.filter(result=>result.status==='rejected').length,0,'concurrent fresh bootstraps must reach the identity boundary without duplicate-role failures');
 assert.equal(await prisma.role.count({where:{name:{startsWith:prefix}}}),definitions.length,'fresh declared roles are created');
 for(const definition of definitions){
  const row=await prisma.role.findUniqueOrThrow({where:{name:prefix+definition.name}});
  assert.equal(row.permissions,definition.permissions);assert.equal(row.nameFa,definition.nameFa||'');assert.equal(row.isSystem,definition.isSystem||false);
  assert.ok(row.createdAt instanceof Date&&row.updatedAt instanceof Date);
 }
 const first=definitions.find(role=>!role.isSystem);
 assert.ok(first,'requires an editable declared role');
 await prisma.role.update({where:{name:prefix+first.name},data:{permissions:'dashboard.view,music.manage'}});
 const before=await prisma.role.findMany({where:{name:{startsWith:prefix}},orderBy:{name:'asc'}});
 await seedRoles();
 assert.deepEqual(await prisma.role.findMany({where:{name:{startsWith:prefix}},orderBy:{name:'asc'}}),before,'repeated bootstrap must preserve existing permission decisions and role history');
 const last=definitions.at(-1);
 await prisma.role.delete({where:{name:prefix+last.name}});await seedRoles();
 const recreated=await prisma.role.findUniqueOrThrow({where:{name:prefix+last.name}});
 assert.equal(recreated.permissions,last.permissions,'missing declared roles still initialize with canonical defaults');
 assert.equal((await prisma.role.findUniqueOrThrow({where:{name:prefix+first.name}})).permissions,'dashboard.view,music.manage');
 console.log('Seed role safety: actual bootstrap role owner preserves edited permissions/rows on replay and creates missing defaults; all fixture rows cleaned, no identity or demo writes');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{try{await prisma.role.deleteMany({where:{name:{startsWith:prefix}}});}finally{await prisma.$disconnect();}});
