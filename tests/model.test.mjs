import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, DOWNTIME } from '../dist/catalog.mjs';
import { newState, newDay, totals, monthTotals, decimalHundredths, quantity, validDate, matchProduct, validateState, readState, persist, parseBackup, backupText, mergeBackup, csvText, STORAGE_KEY, BACKUP_KEY } from '../dist/model.mjs';

// Independent expected values transcribed from the supplied workbook extraction.
// These are audit fixtures only; production does not import historical work records.
const WORKBOOK_NORMS = {
  "rollo": 391,
  "polc": 26,
  "tukor": 40,
  "product_3143": 1481,
  "product_3243": 1638,
  "product_3343": 1638,
  "product_3443": 1638,
  "product_3543": 1638,
  "product_3474": 2148,
  "product_3574": 2148,
  "product_3674": 2148,
  "product_3774": 2148,
  "product_3874": 2174,
  "product_3974": 2174,
  "product_4074": 1998,
  "product_4174": 1998,
  "product_4274": 1998,
  "product_4374": 1998,
  "product_4474": 2024,
  "product_4574": 2024,
  "product_4443": 1481,
  "product_4543": 1638,
  "product_4643": 1638,
  "product_4743": 1638,
  "product_4843": 1638,
  "germersheim_upper": 1756,
  "product_4674": 1076,
  "product_4774": 1076,
  "product_4874": 1598,
  "product_4974": 1598,
  "product_5074": 1467,
  "product_5174": 1467,
  "product_5274": 1989,
  "product_5374": 1989,
  "product_4943": 1004,
  "product_5043": 1004,
  "product_5143": 1526,
  "product_5243": 1526,
  "germersheim_lower": 1399
};
const WORKBOOK_DAYS = [
  {
    "worker": "Teszt dolgozó A",
    "date": "2026-10-01",
    "workHours": 8,
    "upper": 16,
    "lower": 16,
    "accessory": 9,
    "normCentiMinutes": 50579,
    "downtimeCentiMinutes": 0,
    "creditedCentiMinutes": 50579,
    "brazilCount": 4,
    "counts": {
      "rollo": 3,
      "polc": 4,
      "tukor": 2,
      "product_3243": 7,
      "product_3474": 2,
      "product_3674": 3,
      "product_4074": 1,
      "product_4443": 1,
      "product_4643": 2,
      "product_4674": 9,
      "product_4874": 1,
      "product_5274": 3,
      "product_4943": 1,
      "product_5043": 2
    },
    "downtime": {}
  },
  {
    "worker": "Teszt dolgozó A",
    "date": "2026-10-02",
    "workHours": 16,
    "upper": 27,
    "lower": 27,
    "accessory": 18,
    "normCentiMinutes": 92134,
    "downtimeCentiMinutes": 3000,
    "creditedCentiMinutes": 95134,
    "brazilCount": 0,
    "counts": {
      "rollo": 9,
      "polc": 1,
      "tukor": 8,
      "product_3243": 5,
      "product_3443": 1,
      "product_3474": 3,
      "product_3674": 1,
      "product_4074": 13,
      "product_4174": 2,
      "product_4643": 2,
      "product_4674": 13,
      "product_4874": 1,
      "product_4974": 2,
      "product_5074": 4,
      "product_5274": 5,
      "product_5043": 2
    },
    "downtime": {
      "downtime_62": 3000
    }
  },
  {
    "worker": "Teszt dolgozó A",
    "date": "2026-10-05",
    "workHours": 16,
    "upper": 15,
    "lower": 15,
    "accessory": 17,
    "normCentiMinutes": 52241,
    "downtimeCentiMinutes": 48000,
    "creditedCentiMinutes": 100241,
    "brazilCount": 0,
    "counts": {
      "rollo": 7,
      "polc": 3,
      "tukor": 7,
      "product_3243": 5,
      "product_3474": 2,
      "product_3674": 2,
      "product_4074": 3,
      "product_4174": 1,
      "product_4274": 1,
      "product_4443": 1,
      "product_4674": 6,
      "product_4774": 1,
      "product_5074": 3,
      "product_5274": 4,
      "product_4943": 1
    },
    "downtime": {
      "downtime_65": 48000
    }
  },
  {
    "worker": "Teszt dolgozó B",
    "date": "2026-10-06",
    "workHours": 10,
    "upper": 14,
    "lower": 14,
    "accessory": 13,
    "normCentiMinutes": 46701,
    "downtimeCentiMinutes": 12000,
    "creditedCentiMinutes": 58701,
    "brazilCount": 0,
    "counts": {
      "rollo": 6,
      "polc": 4,
      "tukor": 3,
      "product_3243": 2,
      "product_3443": 2,
      "product_3574": 1,
      "product_3674": 1,
      "product_4074": 4,
      "product_4443": 3,
      "product_4643": 1,
      "product_4674": 3,
      "product_4974": 1,
      "product_5074": 3,
      "product_5274": 3,
      "product_4943": 3,
      "product_5043": 1
    },
    "downtime": {
      "downtime_65": 12000
    }
  }
];

function workbookDay(record) {
  return { ...newDay(record.date, record.worker), workCentiMinutes: record.workHours * 6000,
    counts: structuredClone(record.counts), downtime: structuredClone(record.downtime), brazilCount: record.brazilCount };
}
function fixtureState() {
  const state = newState();
  for (const fixture of WORKBOOK_DAYS) state.days[fixture.date] = workbookDay(fixture);
  return state;
}
function oneDayState() {
  const state = newState();
  state.days['2026-10-01'] = workbookDay(WORKBOOK_DAYS[0]);
  return state;
}
function memoryStorage(initial={}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,String(value)) };
}
function serializedBackup(state) { return JSON.stringify({app:'muszaknaplo',data:state}); }

// A small CSV parser lets us assert the emitted fields, including quoted newlines and delimiters.
function readCsv(raw) {
  const text = raw.replace(/^\uFEFF/,'');
  const rows=[];
  let fields=[], value='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {
      if(quoted && text[i+1]==='"') { value+='"';i++; }
      else quoted=!quoted;
    } else if(!quoted && c===';') { fields.push(value);value=''; }
    else if(!quoted && c==='\r' && text[i+1]==='\n') { fields.push(value);rows.push(fields);fields=[];value='';i++; }
    else value+=c;
  }
  assert.equal(quoted,false,'CSV ended inside a quoted field');
  fields.push(value);rows.push(fields);
  return rows;
}

test('all 39 product norms preserve source precision and distinct product positions', () => {
  assert.equal(PRODUCTS.length,39);
  assert.equal(new Set(PRODUCTS.map(p=>p.id)).size,39);
  assert.deepEqual(Object.fromEntries(PRODUCTS.map(p=>[p.id,p.normCentiMinutes])),WORKBOOK_NORMS);
  assert.deepEqual(['upper','lower','accessory'].map(position=>PRODUCTS.filter(p=>p.position===position).length),[23,13,3]);
  assert.equal(DOWNTIME.length,7);
  assert.ok(PRODUCTS.every(p=>Number.isSafeInteger(p.normCentiMinutes)));
});

for (const fixture of WORKBOOK_DAYS) {
  test(`source workbook ${fixture.worker}, ${fixture.date}: time, separate counts, gaps and ratio`, () => {
    const result=totals(workbookDay(fixture));
    for (const field of ['normCentiMinutes','downtimeCentiMinutes','creditedCentiMinutes','upper','lower','accessory','brazilCount']) assert.equal(result[field],fixture[field],field);
    assert.equal(result.workCentiMinutes,fixture.workHours*6000);
    assert.equal(result.totalPieces,fixture.upper+fixture.lower+fixture.accessory);
    assert.equal(result.normGapCentiMinutes,fixture.normCentiMinutes-fixture.workHours*6000);
    assert.equal(result.totalGapCentiMinutes,fixture.creditedCentiMinutes-fixture.workHours*6000);
    assert.equal(result.ratio,fixture.creditedCentiMinutes/(fixture.workHours*6000)*100);
  });
}

test('monthly totals weight by recorded hours, including the source 16-hour days without guessing a divisor', () => {
  const state=fixtureState();
  const total=monthTotals(state,'2026-10');
  assert.equal(total.days.length,4);
  assert.equal(total.normCentiMinutes,241655);
  assert.equal(total.downtimeCentiMinutes,63000);
  assert.equal(total.creditedCentiMinutes,304655);
  assert.equal(total.workCentiMinutes,50*6000);
  assert.deepEqual([total.upper,total.lower,total.accessory,total.brazilCount],[72,72,57,4]);
  assert.equal(total.ratio,304655/300000*100);
  const averageDailyRatio=WORKBOOK_DAYS.reduce((sum,r)=>sum+r.creditedCentiMinutes/(r.workHours*6000)*100,0)/4;
  assert.notEqual(total.ratio,averageDailyRatio);
  // Cross-check the first worker's separate workbook summary as well.
  delete state.days['2026-10-06'];
  const toth=monthTotals(state,'2026-10');
  assert.equal(toth.creditedCentiMinutes,245954);
  assert.equal(toth.workCentiMinutes,240000);
  assert.deepEqual([toth.upper,toth.lower,toth.accessory],[58,58,44]);
});

test('decimal entry and centiminute arithmetic remain exact', () => {
  assert.equal(decimalHundredths('0,26'),26);
  assert.equal(decimalHundredths('14.81'),1481);
  assert.equal(decimalHundredths(' 8,50 '),850);
  assert.equal(decimalHundredths(''),null);
  assert.equal(decimalHundredths('',{empty:0}),0);
  for (const bad of ['1.001','-1','1e2','NaN','Infinity','1,2,3']) assert.throws(()=>decimalHundredths(bad),bad);
  assert.equal(quantity('002'),2);
  assert.equal(quantity('0'),0);
  for(const bad of ['1.5','1,5','-1','100000','NaN','']) assert.throws(()=>quantity(bad),bad);
  const day=newDay('2026-10-11');
  day.counts={polc:99999,tukor:99999,product_3143:17};
  assert.equal(totals(day).normCentiMinutes,99999*26+99999*40+17*1481);
  // Historical norm snapshots, rather than today's catalog, determine historical totals.
  day.norms.product_3143=1500;
  assert.equal(totals(day).normCentiMinutes,99999*26+99999*40+17*1500);
});

test('absent work hours and explicit zero have different gaps and monthly completeness', () => {
  const day=newDay('2026-10-11');day.counts.polc=1;
  const missing=totals(day);
  assert.equal(missing.ratio,null);assert.equal(missing.normGapCentiMinutes,null);assert.equal(missing.totalGapCentiMinutes,null);
  const state=newState();state.days[day.date]=day;
  assert.equal(monthTotals(state,'2026-10').missingWorkDays,1);
  assert.equal(monthTotals(state,'2026-10').ratio,null);
  day.workCentiMinutes=0;
  const zero=totals(day);
  assert.equal(zero.ratio,null);assert.equal(zero.normGapCentiMinutes,26);assert.equal(zero.totalGapCentiMinutes,26);
  assert.equal(monthTotals(state,'2026-10').missingWorkDays,0);
  assert.equal(monthTotals(state,'2026-10').ratio,null);
  state.days['2026-10-01']=workbookDay(WORKBOOK_DAYS[0]);
  assert.equal(monthTotals(state,'2026-10').ratio,(50579+26)/48000*100);
  day.workCentiMinutes=null;
  assert.equal(monthTotals(state,'2026-10').ratio,null);
});

test('Excel written pieces remain upper-only; Brazil and Spoiler add no guessed production time', () => {
  const day=newDay('2026-10-11');
  day.counts={product_3143:2,product_4674:3,rollo:4};
  const base=totals(day);
  assert.deepEqual([base.upper,base.lower,base.accessory,base.totalPieces],[2,3,4,9]);
  day.brazilCount=99;day.spoiler='Spoiler: 7 db, norma még nem ismert';
  const marked=totals(day);
  assert.equal(marked.brazilCount,99);
  assert.equal(marked.normCentiMinutes,base.normCentiMinutes);
  assert.equal(marked.creditedCentiMinutes,base.creditedCentiMinutes);
  assert.equal(marked.totalPieces,9);
  day.downtime.downtime_67=1200;
  assert.equal(totals(day).creditedCentiMinutes,base.creditedCentiMinutes+1200,'explicit Brazil boxing minutes are credited separately');
});

test('disputed 7874 resolves only to the explicitly flagged stable 5174 product; GERM offers both norms', () => {
  for(const query of ['7874','7877','5174']) {
    const results=PRODUCTS.filter(p=>matchProduct(p,query));
    assert.equal(results.length,1,query);assert.equal(results[0].id,'product_5174');
    assert.equal(results[0].codeIssue,true);assert.equal(results[0].code,'5174');
    assert.equal(results[0].normCentiMinutes,1467);
  }
  const germ=PRODUCTS.filter(p=>matchProduct(p,'germ'));
  assert.deepEqual(germ.map(p=>[p.id,p.normCentiMinutes,p.position]),[
    ['germersheim_upper',1756,'upper'],['germersheim_lower',1399,'lower']
  ]);
  assert.ok(PRODUCTS.find(p=>p.id==='tukor'&&matchProduct(p,'tukor')));
});

test('CSV preserves decimal precision and safe text fields, including tab-prefixed formula payloads', () => {
  for(const payload of ['=1+1','+SUM(A1)','-1+2','@SUM(A1)','\t=HYPERLINK("https://example.com")','\r\n  =1+1']) {
    const day=workbookDay(WORKBOOK_DAYS[0]);day.name=payload;day.note=payload;day.spoiler=payload;
    const csv=csvText([day]);
    assert.ok(csv.startsWith('\uFEFF'),'Excel-readable UTF-8 BOM');
    const rows=readCsv(csv);
    assert.ok(rows.every(row=>row.length===11),'each emitted row retains 11 fields');
    assert.ok(rows.slice(1).every(row=>row[1]==="'"+payload));
    assert.equal(rows.find(row=>row[5]==='Megjegyzés')[4],"'"+payload);
    assert.equal(rows.find(row=>row[5]==='Spoiler')[4],"'"+payload);
    assert.equal(rows.find(row=>row[2]==='NAPI ÖSSZESEN')[8],'505,79');
  }
  const day=workbookDay(WORKBOOK_DAYS[0]);day.name='Teszt; "Név"\nnév';
  const rows=readCsv(csvText([day]));
  assert.ok(rows.slice(1).every(row=>row[1]===day.name));
  assert.ok(rows.every(row=>row.length===11));
  assert.equal(rows.find(row=>row[3]==='POLC')[7],'0,26');
  assert.equal(rows.find(row=>row[3]==='BRAZIL')[8],'');
});

test('backup round-trip preserves data and returns a detached copy', () => {
  const state=fixtureState();
  const recovered=parseBackup(backupText(state));
  assert.deepEqual(recovered,state);
  recovered.days['2026-10-01'].counts.polc=500;
  assert.equal(state.days['2026-10-01'].counts.polc,4);
  assert.throws(()=>parseBackup('not json'));
  assert.throws(()=>parseBackup('{"app":"different","data":{}}'));
  assert.throws(()=>parseBackup('{"app":"muszaknaplo","data":NaN}'));
});

test('backup rejects invalid dates, decimal counts, unknown IDs, truncated norms, and invalid time', () => {
  const mutations=[
    ['calendar date',s=>{const d=s.days['2026-10-01'];delete s.days[d.date];d.date='2026-02-30';s.days[d.date]=d;}],
    ['mismatched day key',s=>{s.days['2026-10-01'].date='2026-10-02';}],
    ['decimal quantity',s=>{s.days['2026-10-01'].counts.polc=1.5;}],
    ['unknown product',s=>{s.days['2026-10-01'].counts.missing=1;}],
    ['unknown norm',s=>{s.days['2026-10-01'].norms.missing=10;}],
    ['unknown downtime',s=>{s.days['2026-10-01'].downtime.missing=10;}],
    ['truncated norms',s=>{delete s.days['2026-10-01'].norms.product_3143;}],
    ['negative norm',s=>{s.days['2026-10-01'].norms.polc=-1;}],
    ['fractional centiminute',s=>{s.days['2026-10-01'].norms.polc=26.5;}],
    ['negative work',s=>{s.days['2026-10-01'].workCentiMinutes=-1;}],
    ['negative downtime',s=>{s.days['2026-10-01'].downtime.downtime_61=-1;}],
    ['negative Brazil count',s=>{s.days['2026-10-01'].brazilCount=-1;}]
  ];
  for(const [label,mutate] of mutations) {
    const state=oneDayState();mutate(state);
    assert.throws(()=>parseBackup(serializedBackup(state)),label);
  }
  for(const invalid of [NaN,Infinity,-Infinity]) {
    for(const target of ['count','norm','work','downtime']) {
      const s=oneDayState(),d=s.days['2026-10-01'];
      if(target==='count')d.counts.polc=invalid;
      if(target==='norm')d.norms.polc=invalid;
      if(target==='work')d.workCentiMinutes=invalid;
      if(target==='downtime')d.downtime.downtime_61=invalid;
      assert.throws(()=>validateState(s),`${target} ${invalid}`);
    }
  }
  assert.equal(validDate('2028-02-29'),true);
  for(const date of ['2026-02-29','2026-13-01','2026-10-00','2026-1-01','1999-12-31']) assert.equal(validDate(date),false,date);
});

test('backup rejects own prototype-pollution keys throughout the data tree', () => {
  for(const key of ['__proto__','constructor','prototype']) {
    for(const at of ['root','profile','day','counts','norms','downtime']) {
      const state=oneDayState(),day=state.days['2026-10-01'];
      const object=at==='root'?state:at==='profile'?state.profile:at==='day'?day:day[at];
      Object.defineProperty(object,key,{value:{polluted:true},enumerable:true,configurable:true});
      assert.throws(()=>parseBackup(serializedBackup(state)),`${at}.${key}`);
    }
  }
  assert.equal({}.polluted,undefined);
});

test('restore merging adds absent dates, preserves existing records by default, and explicitly replaces conflicts', () => {
  const current=oneDayState(),incoming=fixtureState();
  current.profile.name='Aktuális név';incoming.profile.name='Mentett név';
  current.days['2026-10-01'].counts.polc=777;
  current.favorites=['polc'];incoming.favorites=['polc','rollo'];
  current.days['2026-10-02']=newDay('2026-10-02');
  const before=structuredClone(current),sourceBefore=structuredClone(incoming);
  const merged=mergeBackup(current,incoming);
  assert.equal(merged.days['2026-10-01'].counts.polc,777);
  assert.deepEqual(merged.days['2026-10-02'],incoming.days['2026-10-02']);
  assert.deepEqual(merged.days['2026-10-06'],incoming.days['2026-10-06']);
  assert.equal(merged.profile.name,'Aktuális név');assert.deepEqual(merged.favorites,['polc','rollo']);
  assert.deepEqual(current,before);assert.deepEqual(incoming,sourceBefore);
  const replaced=mergeBackup(current,incoming,true);
  assert.deepEqual(replaced.days['2026-10-01'],incoming.days['2026-10-01']);
  assert.deepEqual(current,before);
});

test('storage failures propagate instead of claiming a successful save', () => {
  const current=oneDayState();
  const old=JSON.stringify(current);
  const storage=memoryStorage({[STORAGE_KEY]:old});
  const realSet=storage.setItem;
  storage.setItem=(key,value)=>{if(key===STORAGE_KEY)throw new Error('quota');realSet(key,value);};
  const next=fixtureState();
  assert.throws(()=>persist(storage,next),/quota/);
  assert.equal(storage.getItem(STORAGE_KEY),old,'previous primary survives a failed replacement');
  assert.equal(storage.getItem(BACKUP_KEY),old,'recovery copy remains usable');
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.throws(()=>persist(denied,next),/denied/);
  const result=readState(denied);
  assert.equal(result.writeAllowed,false);assert.ok(result.warning);assert.deepEqual(result.state.days,{});
});

test('recovery validates the previous copy and keeps unreadable existing data protected', () => {
  const good=oneDayState();
  const corrupt=oneDayState();delete corrupt.days['2026-10-01'].norms.polc;
  const storage=memoryStorage({[STORAGE_KEY]:JSON.stringify(corrupt),[BACKUP_KEY]:JSON.stringify(good)});
  const recovered=readState(storage);
  assert.equal(recovered.recovered,true);assert.equal(recovered.writeAllowed,true);
  assert.ok(recovered.warning);assert.deepEqual(recovered.state,good);
  // Saving recovered work must not overwrite the good previous copy with corrupt primary bytes.
  persist(storage,fixtureState());
  assert.deepEqual(JSON.parse(storage.getItem(BACKUP_KEY)),good);
  assert.deepEqual(readState(storage).state,fixtureState());
  const bothBad=memoryStorage({[STORAGE_KEY]:'broken-primary',[BACKUP_KEY]:JSON.stringify(corrupt)});
  const blocked=readState(bothBad);
  assert.equal(blocked.writeAllowed,false);assert.equal(blocked.raw,'broken-primary');
  assert.deepEqual(blocked.state.days,{});assert.ok(blocked.warning);
});
