// UI only: upper, lower and accessory entry use the existing app's save path.
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => new Intl.NumberFormat('hu-HU', {minimumFractionDigits:2, maximumFractionDigits:2}).format(value / 100);
const positions = [
  {id:'upper', title:'Felső', type:'Felső típusa', add:'Felső hozzáadása'},
  {id:'lower', title:'Alsó', type:'Alsó típusa', add:'Alsó hozzáadása'},
  {id:'accessory', title:'Kiegészítők', type:'Kiegészítő típusa', add:'Kiegészítő hozzáadása'}
];
let nextInstance = 0;

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
export function productsForPosition(products, position) {
  if (!positions.some(p => p.id === position)) return [];
  return products.filter(p => p.position === position);
}

export function createQuickEntry(host, options) {
  const {products, getCount, getRate, isLocked, onAdd, memoryKey = 'individual'} = options;
  const instance = ++nextInstance;
  const prefix = 'muszaknaplo.quick-type.v2.' + memoryKey + '.';
  let legacy = '', active = false;
  try { legacy = localStorage.getItem('muszaknaplo.quick-type.v1.' + memoryKey) || ''; } catch { /* Optional UI preference only. */ }
  const panels = positions.filter(p => productsForPosition(products, p.id).length);
  host.innerHTML = `<section class="quick-entry" aria-label="Gyors termékrögzítés">
    <div class="qe-heading"><h2>Felső és alsó külön</h2><p>A megfelelő részben válassz típust, majd add hozzá a darabokat.</p></div>
    <div class="qe-panels">${panels.map(p => `<form class="qe-panel" data-qe-position="${p.id}" novalidate aria-label="${p.title} rögzítése">
      <div class="qe-panel-heading"><h3>${p.title}</h3><span class="qe-panel-total">Ma: 0 db</span></div>
      <div class="qe-fields"><label class="qe-type">${p.type}<select name="qeProduct" aria-label="${p.type}" aria-describedby="qeHint-${instance}-${p.id}"></select></label>
      <label class="qe-amount">Darabszám<span class="qe-stepper"><button type="button" data-qe-step="-1" aria-label="${p.title}: darabszám csökkentése">−</button><input name="qeAmount" value="1" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="${p.title}: hozzáadandó darabszám"><button type="button" data-qe-step="1" aria-label="${p.title}: darabszám növelése">+</button></span></label>
      <button type="submit" class="qe-add">${p.add}</button></div>
      <p id="qeHint-${instance}-${p.id}" class="qe-hint"></p><p class="qe-result" role="status" aria-live="polite" hidden></p>
    </form>`).join('')}</div>
  </section>`;
  const controllers = [];
  function refresh() { controllers.forEach(controller => controller.refresh()); }
  for (const panel of panels) {
    const available = productsForPosition(products, panel.id);
    const form = host.querySelector(`[data-qe-position="${panel.id}"]`);
    const select = form.elements.qeProduct, amount = form.elements.qeAmount;
    const add = form.querySelector('.qe-add'), hint = form.querySelector('.qe-hint');
    const result = form.querySelector('.qe-result'), total = form.querySelector('.qe-panel-total');
    let selected = '';
    try {
      const saved = localStorage.getItem(prefix + panel.id);
      const candidate = saved || legacy;
      if (available.some(p => p.id === candidate)) selected = candidate;
    } catch { /* A blocked preference store must never block recording. */ }
    const groups = [...new Set(available.map(p => p.group))];
    select.innerHTML = '<option value="">Válassz típust…</option>' + groups.map(name => `<optgroup label="${escapeText(name)}">${available.filter(p=>p.group===name).map(p=>`<option value="${escapeText(p.id)}">${escapeText(productLabel(p))}</option>`).join('')}</optgroup>`).join('');
    select.value = selected;
    function remember() { try { if (selected) localStorage.setItem(prefix + panel.id, selected); } catch {} }
    function clearResult() { result.hidden = true; result.classList.remove('qe-error'); }
    function refreshPanel() {
      const locked = isLocked() || active;
      select.disabled = amount.disabled = locked;
      form.querySelectorAll('[data-qe-step]').forEach(b => { b.disabled = locked || (b.dataset.qeStep === '-1' && Number(amount.value) <= 1) || (b.dataset.qeStep === '1' && Number(amount.value) >= 99999); });
      add.disabled = true;
      try {
        total.textContent = `Ma: ${available.reduce((sum,p)=>sum+getCount(p.id),0)} db`;
        const product = available.find(p=>p.id===selected);
        if (locked) { hint.textContent = active ? 'Hozzáadás…' : 'Ez a nap lezárt vagy beküldött; újranyitás után rögzíthetsz.'; return; }
        if (!product) { hint.textContent = 'Válassz típust. Ebben a részben külön megmarad a választásod.'; return; }
        const current = getCount(product.id), rate = getRate(product);
        if (!Number.isSafeInteger(rate) || rate < 0) { hint.textContent = 'A normaidő nem olvasható. Frissítsd az oldalt.'; return; }
        add.disabled = false;
        let preview = '';
        try { const next = addedCount(current, amount.value); preview = ` · +${next-current} db = ${fmt((next-current)*rate)} perc`; } catch {}
        hint.textContent = `${fmt(rate)} perc/db · Ma: ${current} db${preview}` + (product.id==='product_5174' ? ' · Papír: 7874 / Excel: 7877.' : '');
      } catch (error) { hint.textContent = error.message; add.disabled = true; }
    }
    select.addEventListener('change', () => { selected=select.value; remember(); clearResult(); refreshPanel(); });
    amount.addEventListener('input', () => { amount.setCustomValidity(''); clearResult(); refreshPanel(); });
    form.addEventListener('click', event => {
      const button=event.target.closest('[data-qe-step]');
      if (!button || button.disabled || active || isLocked()) return;
      const n=Number(amount.value);
      amount.value=String(Math.min(99999,Math.max(1,(Number.isSafeInteger(n)?n:1)+Number(button.dataset.qeStep))));
      amount.setCustomValidity(''); clearResult(); refreshPanel();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (active || isLocked()) return;
      // Restrict submission as well as the visible list to this panel's position.
      const product=available.find(p=>p.id===selected);
      if (!product) { select.focus(); return; }
      try {
        const rate=getRate(product);
        if (!Number.isSafeInteger(rate) || rate < 0) throw new Error('A normaidő nem olvasható. Frissítsd az oldalt.');
        const current=getCount(product.id), next=addedCount(current,amount.value), increment=next-current;
        active=true;
        onAdd(product.id,increment);
        if(getCount(product.id)!==next) throw new Error('A darabszámot nem sikerült hozzáadni. Ellenőrizd a rögzítést.');
        amount.value='1'; amount.setCustomValidity(''); remember();
        result.textContent=`${product.code}: +${increment} db. Napi összesen: ${next} db · ${fmt(next*rate)} perc.`;
        result.classList.remove('qe-error'); result.hidden=false;
      } catch(error) {
        result.textContent=error.message; result.classList.add('qe-error'); result.hidden=false;
      } finally { active=false; refresh(); }
    });
    controllers.push({refresh:refreshPanel});
  }
  refresh();
  return {refresh};
}
