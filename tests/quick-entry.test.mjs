import test from 'node:test';
import assert from 'node:assert/strict';
import {addedCount,productLabel} from '../dist/quick-entry.mjs';
import {PRODUCTS} from '../dist/catalog.mjs';

test('addition accumulates integer pieces and does not replace them',()=>{
  assert.equal(addedCount(3,'2'),5);
  assert.equal(addedCount(0,'001'),1);
  assert.equal(addedCount(99998,1),99999);
});
test('invalid amounts and overflow are rejected before saving',()=>{
  for(const amount of ['','0','-1','1.5','1,5','abc','1e3','100000',NaN,Infinity])assert.throws(()=>addedCount(3,amount));
  assert.throws(()=>addedCount(99999,1));
  assert.throws(()=>addedCount(-1,1));
  assert.throws(()=>addedCount(1.5,1));
});
test('all 39 catalog entries are available, including both GERM types',()=>{
  assert.equal(PRODUCTS.length,39);
  assert.equal(new Set(PRODUCTS.map(p=>p.id)).size,39);
  const germ=PRODUCTS.filter(p=>p.id.startsWith('germersheim'));
  assert.deepEqual(germ.map(productLabel),['GERM felső','GERM alsó']);
});
test('old lower code and disputed stable code remain explicit',()=>{
  assert.equal(productLabel(PRODUCTS.find(p=>p.id==='product_4674')),'7374 (régi: 4674)');
  assert.equal(productLabel(PRODUCTS.find(p=>p.id==='product_5174')),'5174 — új kód egyeztetendő');
});
