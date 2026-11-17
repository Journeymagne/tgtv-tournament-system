const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {cityItems}=require('../../public/calendar');

test('city suggestions keep Latin aliases and cities already used by events',()=>{
 const items=cityItems([{name:'Москва',search:'Moscow'},{name:'Королев',search:'Korolev'}],['Москва','Ереван','Королёв']);
 assert.equal(items.filter(c=>c.value==='Москва').length,1);
 assert.match(items.find(c=>c.value==='Москва').search,/Moscow/);
 assert.ok(items.find(c=>c.value==='Ереван'));
 assert.equal(items.filter(c=>/корол[её]в/i.test(c.label)).length,1);
});

test('bundled city dictionary includes its pinned source and redistribution license',()=>{
 const root=path.join(__dirname,'../../public/cities');
 const cities=JSON.parse(fs.readFileSync(path.join(root,'cities.json'),'utf8'));
 const source=JSON.parse(fs.readFileSync(path.join(root,'cities-source.json'),'utf8'));
 assert.ok(cities.length>1000);
 assert.ok(cities.some(c=>c.name==='Москва'&&c.search==='Moscow'));
 assert.match(source.sourceSha256,/^[a-f\d]{64}$/);
 assert.match(fs.readFileSync(path.join(root,'russian-cities-LICENSE.txt'),'utf8'),/Apache License/);
});
