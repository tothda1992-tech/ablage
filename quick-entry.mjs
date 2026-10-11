// UI-only quick entry. The owning app keeps responsibility for validation and saving.
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => new Intl.NumberFormat('hu-HU', {minimumFractionDigits:2, maximumFractionDigits:2}).format(value / 100);
const positions = [['all','Összes típus'],['upper','Felső'],['lower','Alsó'],['accessory','Kiegészítők']];

export function addedCount(current, amount) {
  const text = String(amount).trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1 || Number(text) > 99999) throw new Error('1 és 99 999 közötti egész darabszámot adj meg.');
  if (!Number.isSafeInteger(current) || current < 0 || current + Number(text) > 99999) throw new Error('A napi darabszám legfeljebb 99 999 lehet.');
  return current + Number(text);
}
export function productLabel(product) {
  if (product.id === 'product_5174') return '5174 — új kód egyeztetendő';
  const old = (product.aliases || []).find(code => /^\d+$/.test(code) && code !== product.code);
  return product.code + (old ? ` (régi: ${old})` : '');
}

export function createQuickEntry(host, options) {
  const {products, getCount, getRate, isLocked, onAdd, memoryKey = 'individual'} = options;
  const key = 'muszaknaplo.quick-type.v1.' + memoryKey;
  let selected = '', category = 'all', active = false;
  try { const saved = localStorage.getItem(key); if (products.some(p => p.id === saved)) selected = saved; } catch { /* Optional UI preference, never a diary save. */ }
  host.innerHTML = `<form class="quick-entry" novalidate aria-label="Gyors termékrögzítés">
    <div class="qe-heading"><h3>Válaszd ki, írd fel, kész.</h3><p>Nincs keresgélés: típus → darabszám → hozzáadás.</p></div>
    <div class="qe-fields"><label class="qe-category">Csoport<select name="qeCategory" aria-label="Típuscsoport">${positions.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>
    <label class="qe-type">Típus<select name="qeProduct" aria-label="Típus" aria-describedby="qeHint"></select></label>
    <label class="qe-amount">Hozzáadandó darabok<span class="qe-stepper"><button type="button" data-qe-step="-1" aria-label="Hozzáadandó darabszám csökkentése">−</button><input name="qeAmount" value="1" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Hozzáadandó darabszám"><button type="button" data-qe-step="1" aria-label="Hozzáadandó darabszám növelése">+</button></span></label>
    <button type="submit" class="qe-add">Hozzáadás</button></div>
    <p id="qeHint" class="qe-hint"></p><p class="qe-result" role="status" aria-live="polite" hidden></p>
  </form>`;
  const form = host.querySelector('form'), select = form.elements.qeProduct, group = form.elements.qeCategory, amount = form.elements.qeAmount;
  const add = form.querySelector('.qe-add'), hint = form.querySelector('.qe-hint'), result = form.querySelector('.qe-result');
  function remember() { try { if (selected) localStorage.setItem(key, selected); } catch {} }
  function populate() {
    const available = products.filter(p => category === 'all' || p.position === category);
    const groups = [...new Set(available.map(p => p.group))].sort((a,b)=> {
      const order = {upper:0,lower:1,accessory:2};
      return order[available.find(p=>p.group===a).position] - order[available.find(p=>p.group===b).position];
    });
    select.innerHTML = '<option value="">Válassz típust…</option>' + groups.map(name => `<optgroup label="${escapeText(name)}">${available.filter(p=>p.group===name).map(p=>`<option value="${escapeText(p.id)}">${escapeText(productLabel(p))}</option>`).join('')}</optgroup>`).join('');
    select.value = available.some(p=>p.id===selected) ? selected : '';
    selected = select.value;
  }
  function refresh() {
    const locked = isLocked() || active;
    group.disabled = select.disabled = amount.disabled = locked;
    form.querySelectorAll('[data-qe-step]').forEach(b => { b.disabled = locked || (b.dataset.qeStep === '-1' && Number(amount.value) <= 1); });
    const product = products.find(p=>p.id===selected);
    add.disabled = locked || !product;
    if (!product) { hint.textContent = locked ? 'Ez a nap lezárt; újranyitás után rögzíthetsz.' : 'Válassz a listából. A kiválasztott típust megjegyzi az app.'; return; }
    const current = getCount(product.id), rate = getRate(product);
    if (!Number.isSafeInteger(rate) || rate < 0) { add.disabled=true; hint.textContent='A normaidő nem olvasható. Frissítsd az oldalt.'; return; }
    let preview = '';
    try { const next = addedCount(current, amount.value); preview = ` · +${next-current} db = ${fmt((next-current)*rate)} perc`; } catch {}
    hint.textContent = `${fmt(rate)} perc/db · Ma már: ${current} db${preview}` + (product.id==='product_5174' ? ' · Papír: 7874 / Excel: 7877.' : '');
  }
  group.addEventListener('change', () => { category=group.value; populate(); result.hidden=true; refresh(); });
  select.addEventListener('change', () => { selected=select.value; remember(); result.hidden=true; refresh(); });
  amount.addEventListener('input', () => { amount.setCustomValidity(''); result.hidden=true; refresh(); });
  form.addEventListener('click', event => {
    const button=event.target.closest('[data-qe-step]');
    if (!button || button.disabled) return;
    const n=Number(amount.value);
    amount.value=String(Math.min(99999,Math.max(1,(Number.isSafeInteger(n)?n:1)+Number(button.dataset.qeStep))));
    amount.setCustomValidity(''); result.hidden=true; refresh();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (active || isLocked()) return;
    const product=products.find(p=>p.id===selected);
    if (!product) { select.focus(); return; }
    try {
      const current=getCount(product.id), next=addedCount(current,amount.value), increment=next-current;
      active=true;
      onAdd(product.id,increment);
      if(getCount(product.id)!==next) throw new Error('A darabszámot nem sikerült hozzáadni. Ellenőrizd a rögzítést.');
      amount.value='1'; amount.setCustomValidity(''); remember();
      result.textContent=`${product.code}: +${increment} db. Napi összesen: ${next} db · ${fmt(next*getRate(product))} perc.`;
      result.classList.remove('qe-error'); result.hidden=false;
    } catch(error) {
      result.textContent=error.message; result.classList.add('qe-error'); result.hidden=false;
    } finally { active=false; refresh(); }
  });
  populate(); refresh();
  return {refresh};
}
