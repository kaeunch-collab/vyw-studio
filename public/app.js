// ========== slot definitions ==========
const SLOTS_COMMON = [
  { key: 'outerwear', label: '아우터' },
  { key: 'socks', label: '양말' },
  { key: 'shoes', label: '신발' },
  { key: 'bag', label: '가방' },
  { key: 'hair_accessory', label: '헤어 액세서리' },
  { key: 'jewelry', label: '주얼리', multi: true },
  { key: 'hairstyle', label: '헤어스타일' },
];

const SLOTS_DRESS = [{ key: 'dress', label: '드레스' }, ...SLOTS_COMMON];
const SLOTS_TOPBOTTOM = [
  { key: 'top', label: '상의' },
  { key: 'bottom', label: '하의' },
  ...SLOTS_COMMON,
];

// ========== state ==========
const state = {
  config: null,
  outfitMode: 'dress',
  itemSelections: {},        // { key: 'value' | 'auto' | 'custom' }
  itemCustoms: {},           // { key: '직접 입력' }
  jewelrySelections: [],     // ['크롬 이어커프', ...] or ['auto']
  jewelryCustom: '',
  lastPrompts: [],
};

// ========== dom refs ==========
const $ = (id) => document.getElementById(id);
const el = {
  form: $('form'),
  fragment: $('fragmentKey'),
  customMoodWrap: $('customMoodWrap'),
  customMood: $('customMood'),
  genreOptions: $('genreOptions'),
  colorMain: $('colorMain'),
  colorMainDot: $('colorMainDot'),
  colorMainCustom: $('colorMainCustom'),
  colorMainHint: $('colorMainHint'),
  colorSub: $('colorSub'),
  colorSubDot: $('colorSubDot'),
  colorSubCustom: $('colorSubCustom'),
  colorSubHint: $('colorSubHint'),
  outfitMode: $('outfitMode'),
  slots: $('slots'),
  extraDetails: $('extraDetails'),
  detailFocusWrap: $('detailFocusWrap'),
  detailFocus: $('detailFocus'),
  generate: $('generate'),
  status: $('status'),
  results: $('results'),
  errors: $('errors'),
  promptDebug: $('promptDebug'),
  promptList: $('promptList'),
  gallery: $('gallery'),
  galleryEmpty: $('galleryEmpty'),
};

// ========== init ==========
async function init() {
  const res = await fetch('/api/config');
  state.config = await res.json();

  renderFragments();
  renderGenres();
  renderColorSelect(el.colorMain);
  renderColorSelect(el.colorSub);
  applyFragmentDefaults();
  syncColorDot(el.colorMain, el.colorMainDot, el.colorMainCustom);
  syncColorDot(el.colorSub, el.colorSubDot, el.colorSubCustom);
  updateColorHints();
  renderSlots();
  loadGallery();

  bindEvents();
}

function renderFragments() {
  const frags = state.config.fragments;
  const opts = [];
  for (const [key, f] of Object.entries(frags)) {
    opts.push(`<option value="${key}">${f.name} · ${f.korean}</option>`);
  }
  opts.push(`<option value="custom">커스텀 · custom mood</option>`);
  el.fragment.innerHTML = opts.join('');
  el.fragment.value = Object.keys(frags)[0];
  updateFragmentUI();
}

function updateFragmentUI() {
  const v = el.fragment.value;
  el.customMoodWrap.hidden = v !== 'custom';
  renderGenres();
  applyFragmentDefaults();
  syncColorDot(el.colorMain, el.colorMainDot, el.colorMainCustom);
  syncColorDot(el.colorSub, el.colorSubDot, el.colorSubCustom);
  updateColorHints();
}

function applyFragmentDefaults() {
  const fragKey = el.fragment.value;
  const frag = state.config.fragments[fragKey];
  const def = frag?.default_colors;
  if (!def) return;
  if (state.config.colors[def.main]) {
    el.colorMain.value = def.main;
    el.colorMainCustom.hidden = true;
  }
  if (state.config.colors[def.sub]) {
    el.colorSub.value = def.sub;
    el.colorSubCustom.hidden = true;
  }
}

function updateColorHints() {
  const fragKey = el.fragment.value;
  const def = state.config.fragments[fragKey]?.default_colors;
  el.colorMainHint.hidden = !def || el.colorMain.value !== def.main;
  el.colorSubHint.hidden = !def || el.colorSub.value !== def.sub;
}

function renderGenres() {
  const fragKey = el.fragment.value;
  const allowed =
    fragKey === 'custom'
      ? Object.keys(state.config.genres)
      : (state.config.fragments[fragKey]?.allowed_genres || Object.keys(state.config.genres));

  const prev = el.genreOptions.querySelector('input:checked')?.value;
  el.genreOptions.innerHTML = allowed
    .map(
      (k) => `
      <label class="radio">
        <input type="radio" name="genre" value="${k}">
        <span>${state.config.genres[k].name}</span>
      </label>`
    )
    .join('');
  const first = el.genreOptions.querySelector('input');
  if (first) {
    const toSet = allowed.includes(prev) ? prev : first.value;
    el.genreOptions.querySelector(`input[value="${toSet}"]`).checked = true;
  }
}

function renderColorSelect(select) {
  const opts = [`<option value="auto">AI가 알아서 · auto</option>`];
  const groups = state.config.color_groups || [];
  if (groups.length) {
    for (const group of groups) {
      opts.push(`<optgroup label="${escapeAttr(group.label)}">`);
      for (const k of group.keys) {
        const c = state.config.colors[k];
        if (!c) continue;
        opts.push(`<option value="${escapeAttr(k)}">${escapeHtml(c.name)}</option>`);
      }
      opts.push(`</optgroup>`);
    }
  } else {
    for (const [key, c] of Object.entries(state.config.colors)) {
      opts.push(`<option value="${escapeAttr(key)}">${escapeHtml(c.name)}</option>`);
    }
  }
  opts.push(`<option value="custom">직접 입력…</option>`);
  select.innerHTML = opts.join('');
}

function syncColorDot(select, dot, customInput) {
  const v = select.value;
  if (v === 'custom') {
    customInput.hidden = false;
    dot.style.background = 'transparent';
    dot.style.borderStyle = 'dashed';
  } else if (v === 'auto') {
    customInput.hidden = true;
    dot.style.background =
      'conic-gradient(from 0deg, #EAC6D5, #9B8FB0, #C1C1CD, #5D5573, #F3ECEE, #EAC6D5)';
    dot.style.borderStyle = 'solid';
  } else {
    customInput.hidden = true;
    const c = state.config.colors[v];
    dot.style.background = c?.hex || 'transparent';
    dot.style.borderStyle = 'solid';
  }
}

function renderSlots() {
  const slots = state.outfitMode === 'dress' ? SLOTS_DRESS : SLOTS_TOPBOTTOM;
  el.slots.innerHTML = '';
  for (const slot of slots) {
    if (slot.multi) {
      el.slots.appendChild(renderMultiSlot(slot));
    } else {
      el.slots.appendChild(renderSingleSlot(slot));
    }
  }
}

function renderSingleSlot(slot) {
  const wrap = document.createElement('div');
  wrap.className = 'slot';
  const saved = state.itemSelections[slot.key] ?? 'auto';
  const savedCustom = state.itemCustoms[slot.key] ?? '';

  const opts = [`<option value="auto">AI가 알아서</option>`];
  for (const item of state.config.items[slot.key]) {
    opts.push(`<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`);
  }
  opts.push(`<option value="__custom">직접 입력…</option>`);

  wrap.innerHTML = `
    <div class="slot-label">${slot.label}</div>
    <select class="input select" data-slot="${slot.key}">${opts.join('')}</select>
    <input type="text" class="input sub-input" data-slot-custom="${slot.key}" placeholder="직접 입력" hidden>
  `;
  const select = wrap.querySelector('select');
  const custom = wrap.querySelector('input[type=text]');
  select.value = saved === 'custom' ? '__custom' : saved;
  if (saved === 'custom') {
    custom.hidden = false;
    custom.value = savedCustom;
  }
  select.addEventListener('change', () => {
    if (select.value === '__custom') {
      state.itemSelections[slot.key] = 'custom';
      custom.hidden = false;
      custom.focus();
    } else {
      state.itemSelections[slot.key] = select.value;
      custom.hidden = true;
    }
  });
  custom.addEventListener('input', () => {
    state.itemCustoms[slot.key] = custom.value;
  });
  return wrap;
}

function renderMultiSlot(slot) {
  const wrap = document.createElement('div');
  wrap.className = 'slot slot-multi';
  const options = state.config.items[slot.key];
  const selected = state.jewelrySelections;

  const chips = [];
  chips.push(chipMarkup('auto', 'AI가 알아서', selected.includes('auto')));
  for (const opt of options) {
    chips.push(chipMarkup(opt, opt, selected.includes(opt)));
  }

  wrap.innerHTML = `
    <div class="slot-label">${slot.label} <span class="slot-hint">다중 선택</span></div>
    <div class="chip-group">${chips.join('')}</div>
    <input type="text" class="input sub-input" id="jewelryCustom" placeholder="직접 입력 (쉼표로 구분)">
  `;

  wrap.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      const idx = state.jewelrySelections.indexOf(v);
      if (idx >= 0) {
        state.jewelrySelections.splice(idx, 1);
        chip.classList.remove('on');
      } else {
        if (v === 'auto') state.jewelrySelections.length = 0;
        else state.jewelrySelections = state.jewelrySelections.filter((x) => x !== 'auto');
        state.jewelrySelections.push(v);
        chip.classList.add('on');
        if (v === 'auto') {
          wrap.querySelectorAll('.chip').forEach((c) => {
            if (c.dataset.value !== 'auto') c.classList.remove('on');
          });
        } else {
          wrap.querySelector('.chip[data-value="auto"]').classList.remove('on');
        }
      }
    });
  });

  const custom = wrap.querySelector('#jewelryCustom');
  custom.value = state.jewelryCustom;
  custom.addEventListener('input', () => {
    state.jewelryCustom = custom.value;
  });
  return wrap;
}

function chipMarkup(value, label, on) {
  return `<button type="button" class="chip ${on ? 'on' : ''}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ========== events ==========
function bindEvents() {
  el.fragment.addEventListener('change', updateFragmentUI);

  el.colorMain.addEventListener('change', () => {
    syncColorDot(el.colorMain, el.colorMainDot, el.colorMainCustom);
    updateColorHints();
  });
  el.colorSub.addEventListener('change', () => {
    syncColorDot(el.colorSub, el.colorSubDot, el.colorSubCustom);
    updateColorHints();
  });

  el.outfitMode.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('on')) return;
      el.outfitMode.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      state.outfitMode = btn.dataset.mode;
      renderSlots();
      updateDetailFocusLabel();
    });
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
  });

  el.form.querySelectorAll('input[name=outputs]').forEach((cb) => {
    cb.addEventListener('change', updateDetailFocusVisibility);
  });
  updateDetailFocusVisibility();
}

function updateDetailFocusVisibility() {
  const detailChecked = !!el.form.querySelector('input[name=outputs][value=detail]:checked');
  el.detailFocusWrap.hidden = !detailChecked;
}

function updateDetailFocusLabel() {
  const opt = el.detailFocus?.querySelector('option[value="main_detail"]');
  if (!opt) return;
  opt.textContent =
    state.outfitMode === 'dress'
      ? '드레스 디테일 (소매, 밑단 등)'
      : '상·하의 디테일 (소매, 밑단 등)';
}

// ========== generate ==========
function buildPayload() {
  const fragmentKey = el.fragment.value;
  const customMood = el.customMood.value.trim();
  const genreKey = el.genreOptions.querySelector('input:checked')?.value;

  const resolveColorVal = (select, customInput) => {
    const v = select.value;
    if (v === 'custom') {
      const txt = customInput.value.trim();
      return txt ? `custom:${txt}` : 'auto';
    }
    return v;
  };
  const colorMain = resolveColorVal(el.colorMain, el.colorMainCustom);
  const colorSub = resolveColorVal(el.colorSub, el.colorSubCustom);

  const items = {};
  const activeKeys =
    state.outfitMode === 'dress'
      ? SLOTS_DRESS.map((s) => s.key)
      : SLOTS_TOPBOTTOM.map((s) => s.key);
  for (const key of activeKeys) {
    if (key === 'jewelry') continue;
    const sel = state.itemSelections[key] ?? 'auto';
    if (sel === 'custom') {
      const txt = (state.itemCustoms[key] || '').trim();
      items[key] = txt ? `custom:${txt}` : 'auto';
    } else {
      items[key] = sel;
    }
  }
  const jewelry = [...state.jewelrySelections];
  const jc = state.jewelryCustom.trim();
  if (jc) {
    jc.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => jewelry.push(`custom:${s}`));
  }
  items.jewelry = jewelry;

  const outputs = [...el.form.querySelectorAll('input[name=outputs]:checked')].map((c) => c.value);
  const extraDetails = el.extraDetails.value.trim();
  const detailFocus = el.detailFocus?.value || 'main_detail';

  return {
    fragmentKey,
    customMood,
    genreKey,
    colorMain,
    colorSub,
    outfitMode: state.outfitMode,
    items,
    outputs,
    extraDetails,
    detailFocus,
  };
}

const DELAY_BETWEEN_MS = 5000;
const RETRY_DELAY_MS = 10000;
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate() {
  const payload = buildPayload();
  if (!payload.genreKey) {
    setStatus('장르를 선택해줘', 'error');
    return;
  }
  if (!payload.outputs.length) {
    setStatus('아웃풋을 하나 이상 선택해줘', 'error');
    return;
  }

  el.generate.disabled = true;
  el.results.innerHTML = '';
  el.errors.innerHTML = '';
  el.promptDebug.hidden = true;
  el.promptList.innerHTML = '';

  try {
    setStatus('프롬프트 구성 중…', 'loading');
    const planRes = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const planData = await planRes.json();
    if (!planRes.ok) throw new Error(planData.error || 'plan failed');

    const plan = planData.plan || [];
    const results = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const label = step.label || outputLabel(step.type);
      const progress = `${i + 1}/${plan.length}`;

      const outcome = await renderWithRetry(step, label, progress);
      if (outcome.ok) {
        const item = { status: 'ok', type: step.type, label, prompt: step.prompt, ...outcome };
        results.push(item);
        appendResult(item);
      } else {
        const item = { status: 'err', type: step.type, label, prompt: step.prompt, error: outcome.error };
        results.push(item);
        appendError(item);
      }

      if (i < plan.length - 1) {
        await countdown(DELAY_BETWEEN_MS, (s) =>
          setStatus(`다음 이미지 대기 · ${s}s`, 'loading')
        );
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const err = results.filter((r) => r.status === 'err').length;
    if (err === 0) setStatus(`완료 · ${ok}/${plan.length}`, 'done');
    else if (ok === 0) setStatus(`실패 · ${err}/${plan.length}`, 'error');
    else setStatus(`완료 · ${ok}/${plan.length} (실패 ${err})`, 'done');

    renderPromptDebug(results);
    loadGallery();
  } catch (err) {
    setStatus(`error · ${err.message || 'unknown'}`, 'error');
  } finally {
    el.generate.disabled = false;
  }
}

async function renderWithRetry(step, label, progress) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tag =
      attempt === 1
        ? `generating · ${label} ${progress}`
        : `재시도 중 · ${label} ${progress} · attempt ${attempt}/${MAX_ATTEMPTS}`;
    setStatus(tag, 'loading');
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(step),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) return { ok: true, ...data };
      if (attempt >= MAX_ATTEMPTS) {
        return { ok: false, error: data.error || `HTTP ${res.status}` };
      }
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) {
        return { ok: false, error: err.message || 'network error' };
      }
    }
    await countdown(RETRY_DELAY_MS, (s) =>
      setStatus(`재시도 대기 · ${label} ${progress} · ${s}s`, 'loading')
    );
  }
  return { ok: false, error: 'max retries exceeded' };
}

async function countdown(totalMs, onTick) {
  const steps = Math.ceil(totalMs / 1000);
  for (let s = steps; s > 0; s--) {
    onTick(s);
    await sleep(1000);
  }
}

function appendResult(item) {
  const fig = document.createElement('figure');
  fig.className = 'result-card';
  fig.innerHTML = `
    <div class="result-label">${escapeHtml(item.label || outputLabel(item.type))}</div>
    <img src="${item.url}" alt="${escapeAttr(item.filename)}" />
    <figcaption class="caption">${escapeHtml(item.filename)}</figcaption>
  `;
  el.results.appendChild(fig);
}

function appendError(item) {
  const div = document.createElement('div');
  div.className = 'error-card';
  div.textContent = `× ${item.label || outputLabel(item.type)} · ${item.error}`;
  el.errors.appendChild(div);
}

function renderPromptDebug(items) {
  if (!items.length) {
    el.promptDebug.hidden = true;
    return;
  }
  el.promptDebug.hidden = false;
  el.promptList.innerHTML = items
    .map(
      (p) => `
      <div class="prompt-item">
        <div class="prompt-type">${escapeHtml(p.label || outputLabel(p.type))}${p.status === 'err' ? ' · failed' : ''}</div>
        <pre class="prompt-text">${escapeHtml(p.prompt || '')}</pre>
      </div>`
    )
    .join('');
}

function outputLabel(type) {
  return { flatlay: '플랫레이', detail: '디테일', individual: '개별 아이템' }[type] || type;
}

function setStatus(msg, kind) {
  el.status.textContent = msg;
  el.status.className = `status ${kind || ''}`;
}

// ========== gallery ==========
async function loadGallery() {
  try {
    const res = await fetch('/api/images');
    const items = await res.json();
    el.gallery.innerHTML = '';
    if (!items.length) {
      el.galleryEmpty.hidden = false;
      return;
    }
    el.galleryEmpty.hidden = true;
    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.title = item.filename;
      div.innerHTML = `<img src="${item.url}" alt="${escapeAttr(item.filename)}" loading="lazy">`;
      div.addEventListener('click', () => window.open(item.url, '_blank'));
      el.gallery.appendChild(div);
    }
  } catch (err) {
    console.error('gallery load failed', err);
  }
}

init();
