import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, 'images');
const CONFIG_PATH = path.join(__dirname, 'config', 'concepts.json');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}
let CONFIG = loadConfig();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMAGES_DIR));

app.get('/api/config', (_req, res) => {
  CONFIG = loadConfig();
  res.json(CONFIG);
});

// ---------- prompt composition ----------

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function resolveColor(key) {
  if (!key || key === 'auto') {
    const brandGroup = CONFIG.color_groups?.find((g) => g.label.includes('VYW')) || CONFIG.color_groups?.[0];
    const candidateKeys = brandGroup?.keys?.length ? brandGroup.keys : Object.keys(CONFIG.colors);
    return CONFIG.colors[pick(candidateKeys)];
  }
  if (typeof key === 'string' && key.startsWith('custom:')) {
    return { name: key.slice(7), hex: null };
  }
  return CONFIG.colors[key] || { name: key, hex: null };
}

function resolveItem(type, value) {
  if (!value || value === 'auto') {
    const pool = CONFIG.items[type].filter((v) => v !== '없음');
    return pick(pool.length ? pool : CONFIG.items[type]);
  }
  if (typeof value === 'string' && value.startsWith('custom:')) return value.slice(7);
  return value;
}

function toEn(koItem) {
  if (!koItem) return koItem;
  return CONFIG.items_translation?.[koItem] || koItem;
}

function resolveSelection(form) {
  const {
    fragmentKey,
    customMood,
    genreKey,
    colorMain,
    colorSub,
    outfitMode,
    items = {},
    extraDetails,
    outputs,
    detailFocus,
  } = form;

  let conceptName, conceptMoodEn;
  if (fragmentKey === 'custom') {
    conceptName = 'Custom';
    conceptMoodEn = (customMood || '').trim() || 'muted atmosphere, washed-out film tone, Japanese vintage editorial';
  } else {
    const frag = CONFIG.fragments[fragmentKey];
    if (!frag) throw new Error(`unknown fragment: ${fragmentKey}`);
    conceptName = frag.name;
    conceptMoodEn = frag.mood_prompt_en;
  }

  const genre = CONFIG.genres[genreKey];
  if (!genre) throw new Error(`unknown genre: ${genreKey}`);

  const mainColor = resolveColor(colorMain);
  const subColor = resolveColor(colorSub);

  const resolved = {};
  if (outfitMode === 'dress') {
    resolved.dress = resolveItem('dress', items.dress);
  } else {
    resolved.top = resolveItem('top', items.top);
    resolved.bottom = resolveItem('bottom', items.bottom);
  }
  for (const slot of ['outerwear', 'socks', 'shoes', 'bag', 'hair_accessory', 'hairstyle']) {
    resolved[slot] = resolveItem(slot, items[slot]);
  }

  const jewelryInput = Array.isArray(items.jewelry) ? items.jewelry : [];
  if (jewelryInput.length === 0 || jewelryInput.every((v) => v === 'auto')) {
    const jpool = CONFIG.items.jewelry.filter((v) => v !== '없음');
    resolved.jewelry = [pick(jpool.length ? jpool : CONFIG.items.jewelry)];
  } else {
    resolved.jewelry = jewelryInput.flatMap((v) => {
      if (v === 'auto') return [pick(CONFIG.items.jewelry)];
      if (typeof v === 'string' && v.startsWith('custom:')) return [v.slice(7)];
      return [v];
    });
  }

  return {
    conceptName,
    conceptMoodEn,
    genre,
    mainColor,
    subColor,
    items: resolved,
    outfitMode,
    extraDetails: (extraDetails || '').trim(),
    outputs: Array.isArray(outputs) && outputs.length ? outputs : ['flatlay'],
    detailFocus: detailFocus || 'main_detail',
  };
}

function itemsList(r) {
  const parts = [];
  if (r.outfitMode === 'dress') parts.push(`a ${toEn(r.items.dress)}`);
  else {
    parts.push(`a ${toEn(r.items.top)} as top`);
    parts.push(`a ${toEn(r.items.bottom)} as bottom`);
  }
  if (r.items.outerwear && r.items.outerwear !== '없음') {
    parts.push(`a ${toEn(r.items.outerwear)} outerwear`);
  }
  parts.push(`${toEn(r.items.socks)}`);
  parts.push(`${toEn(r.items.shoes)}`);
  if (r.items.bag) parts.push(`a ${toEn(r.items.bag)}`);
  if (r.items.hair_accessory && r.items.hair_accessory !== '없음') {
    parts.push(`a ${toEn(r.items.hair_accessory)}`);
  }
  const jw = r.items.jewelry.filter((j) => j && j !== '없음').map(toEn);
  if (jw.length) parts.push(jw.join(' and '));
  return parts.join(', ');
}

function colorStr(c) {
  return c.hex ? `${c.name} ${c.hex}` : c.name;
}

// ---------- output-specific prompt builders ----------

const WHITE_BG = `PURE WHITE BACKGROUND, solid #FFFFFF, RGB 255 255 255, seamless white studio paper, absolutely no cream, no ivory, no beige, no tan, no off-white, no yellow tint, no warm tones in background, background is pure bright white only`;

function buildFlatlayPrompt(r) {
  const itemStr = itemsList(r);
  const palette = `Garment colors: ${colorStr(r.mainColor)} and ${colorStr(r.subColor)}.`;
  const style = `Style: ${r.genre.prompt_en}.`;
  const extra = r.extraDetails ? ` ${r.extraDetails}.` : '';
  return `${WHITE_BG}. Flat lay photography on this white backdrop, top-down bird's eye view, showing MULTIPLE SEPARATE GARMENT PIECES arranged neatly side by side, each piece fully visible as a distinct recognizable object, not overlapping. The outfit includes ${itemStr}. ${palette} ${style} Japanese vintage subculture fashion brand outfit, ornate garment construction with layered trims, lace, ribbons, puff sleeves and signature genre details, not plain everyday clothing. Every listed item must be clearly drawn as a separate piece in the frame. No props, no plants, no vegetation, no decorative surfaces. Soft minimal shadows, fashion catalogue flat lay layout, sharp focus, high detail, well-composed editorial.${extra}`;
}

const DETAIL_FOCUSES = {
  main_detail: {
    labelDress: '드레스 디테일',
    labelTopBottom: '상·하의 디테일',
    subject(r) {
      if (r.outfitMode === 'dress') {
        return `a ${toEn(r.items.dress)}, focusing on the sleeves, hem, neckline, ribbon and trim details`;
      }
      return `a ${toEn(r.items.top)} and ${toEn(r.items.bottom)}, focusing on sleeves, hem, waistline and trim details`;
    },
  },
  shoes_detail: {
    label: '신발 디테일',
    subject: (r) => `a pair of ${toEn(r.items.shoes)}`,
  },
  bag_detail: {
    label: '가방 디테일',
    subject: (r) => (r.items.bag ? `a ${toEn(r.items.bag)}` : 'a fashion handbag'),
  },
  jewelry_detail: {
    label: '주얼리 디테일',
    subject: (r) => {
      const jw = r.items.jewelry.filter((j) => j && j !== '없음').map(toEn);
      return jw.length ? `${jw.join(' and ')}` : 'delicate jewelry pieces';
    },
  },
  fabric_texture: {
    label: '섬유 텍스처',
    subject: () => 'the fabric and textile texture of the garment, showing weave, lace, embroidery, stitching and material surface',
  },
};

function detailLabel(r, focus) {
  const d = DETAIL_FOCUSES[focus];
  if (!d) return '디테일';
  if (d.label) return d.label;
  return r.outfitMode === 'dress' ? d.labelDress : d.labelTopBottom;
}

function buildDetailPrompt(r, focus) {
  const d = DETAIL_FOCUSES[focus] || DETAIL_FOCUSES.main_detail;
  const subject = d.subject(r);
  const extra = r.extraDetails ? ` ${r.extraDetails}.` : '';
  return `${WHITE_BG}. Close-up product photography of ${subject} on this white backdrop, styled in the aesthetic of ${r.genre.prompt_en}. Japanese vintage subculture fashion brand detail, ornate trim and construction, not plain everyday clothing. Soft studio lighting, sharp focus, fabric texture visible, high detail, fashion catalogue style, no model, no hands, no body parts visible.${extra}`;
}

function enumerateItems(r) {
  const list = [];
  if (r.outfitMode === 'dress') {
    list.push({ key: 'dress', label: '드레스', name: toEn(r.items.dress) });
  } else {
    list.push({ key: 'top', label: '상의', name: toEn(r.items.top) });
    list.push({ key: 'bottom', label: '하의', name: toEn(r.items.bottom) });
  }
  if (r.items.outerwear && r.items.outerwear !== '없음') {
    list.push({ key: 'outerwear', label: '아우터', name: toEn(r.items.outerwear) });
  }
  list.push({ key: 'socks', label: '양말', name: toEn(r.items.socks) });
  list.push({ key: 'shoes', label: '신발', name: toEn(r.items.shoes) });
  if (r.items.bag) list.push({ key: 'bag', label: '가방', name: toEn(r.items.bag) });
  if (r.items.hair_accessory && r.items.hair_accessory !== '없음') {
    list.push({ key: 'hair_accessory', label: '헤어 액세서리', name: toEn(r.items.hair_accessory) });
  }
  for (const j of r.items.jewelry.filter((x) => x && x !== '없음')) {
    list.push({ key: 'jewelry', label: `주얼리 · ${j}`, name: toEn(j) });
  }
  return list;
}

function buildIndividualPrompt(r, item) {
  const tones = `tones of ${colorStr(r.mainColor)} and ${colorStr(r.subColor)}`;
  const extra = r.extraDetails ? ` ${r.extraDetails}.` : '';
  return `${WHITE_BG}. Professional e-commerce product photograph of one single item isolated on this white backdrop: a ${item.name}, in ${tones}, in the aesthetic of ${r.genre.prompt_en}. The item is shown with its full shape clearly readable as a catalog product shot, the garment laid flat or displayed upright so its complete silhouette and every construction detail is visible. Japanese vintage subculture fashion brand piece, ornate trim and signature genre detail. Soft minimal shadows, sharp focus, high detail, no model, no face, no hands, no body, only the single piece of clothing or accessory centered in the frame.${extra}`;
}

// ---------- plan expansion ----------

function buildPlan(r) {
  const plan = [];
  for (const type of r.outputs) {
    if (type === 'flatlay') {
      plan.push({ type, label: '플랫레이', prompt: buildFlatlayPrompt(r) });
    } else if (type === 'detail') {
      plan.push({
        type,
        label: detailLabel(r, r.detailFocus),
        prompt: buildDetailPrompt(r, r.detailFocus),
      });
    } else if (type === 'individual') {
      for (const item of enumerateItems(r)) {
        plan.push({
          type,
          label: item.label,
          prompt: buildIndividualPrompt(r, item),
        });
      }
    }
  }
  return plan;
}

// ---------- pollinations ----------

async function generateOne(prompt, type) {
  const params = new URLSearchParams({
    width: '1536',
    height: '1536',
    nologo: 'true',
    nofeed: 'true',
    model: 'flux',
    seed: String(Math.floor(Math.random() * 1_000_000_000)),
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`pollinations ${resp.status} ${resp.statusText}${text ? ' — ' + text.slice(0, 140) : ''}`);
  }
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    const text = await resp.text().catch(() => '');
    throw new Error(`unexpected content-type ${contentType}${text ? ' — ' + text.slice(0, 140) : ''}`);
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(await resp.arrayBuffer());

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const filename = `vyw-${type}-${timestamp}.${ext}`;
  const filePath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return { url: `/images/${filename}`, filename };
}

// ---------- endpoints ----------

app.post('/api/plan', (req, res) => {
  try {
    CONFIG = loadConfig();
    const form = req.body;
    if (!form || typeof form !== 'object') {
      return res.status(400).json({ error: 'invalid form data' });
    }
    const resolved = resolveSelection(form);
    const plan = buildPlan(resolved);
    res.json({ resolved, plan });
  } catch (err) {
    console.error('[plan] error:', err);
    res.status(400).json({ error: err?.message || 'plan failed' });
  }
});

app.post('/api/render', async (req, res) => {
  try {
    const { type, prompt } = req.body || {};
    if (!type || typeof prompt !== 'string' || !prompt) {
      return res.status(400).json({ error: 'type and prompt required' });
    }
    const out = await generateOne(prompt, type);
    res.json({ type, prompt, ...out });
  } catch (err) {
    console.error('[render] error:', err);
    res.status(502).json({ error: err?.message || 'render failed' });
  }
});

app.get('/api/images', (_req, res) => {
  try {
    const files = fs
      .readdirSync(IMAGES_DIR)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => ({
        filename: f,
        url: `/images/${f}`,
        mtime: fs.statSync(path.join(IMAGES_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'failed to list images' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  VYW · Wardrobe v0.3 · garment generator`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  backend · pollinations.ai / flux\n`);
});
