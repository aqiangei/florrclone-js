'use strict';

// Match ashflor: 20 cloud presets. K+1..0 → 0..9, L+1..0 → 10..19.
const SLOT_COUNT = 20;
const NONE = SLOT_COUNT;

function emptySlots(n = 10) {
  return Array.from({ length: n }, () => null);
}

function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.type !== 'string' || !item.type) return null;
  if (!Number.isInteger(item.rarity) || item.rarity < 0) return null;
  return { type: item.type, rarity: item.rarity };
}

function cleanRow(row) {
  const out = emptySlots();
  if (!Array.isArray(row)) return out;
  for (let i = 0; i < out.length && i < row.length; i++) out[i] = cleanItem(row[i]);
  return out;
}

function normalizePresets(raw) {
  const out = Array.from({ length: SLOT_COUNT }, () => null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < SLOT_COUNT && i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    out[i] = { loadout: cleanRow(entry.loadout), reserve: cleanRow(entry.reserve) };
  }
  return out;
}

function ensurePresets(account) {
  account.loadoutPresets = normalizePresets(account.loadoutPresets);
  if (!Number.isInteger(account.activeLoadoutPreset) || account.activeLoadoutPreset < 0 || account.activeLoadoutPreset > SLOT_COUNT) {
    account.activeLoadoutPreset = NONE;
  }
  return account.loadoutPresets;
}

function copyCurrent(engine) {
  return {
    loadout: cleanRow(engine.save.loadout),
    reserve: cleanRow(engine.save.reserve),
  };
}

function slotLabel(slot) {
  const bank = slot < 10 ? 'K' : 'L';
  const digit = slot % 10;
  return bank + (digit === 9 ? '0' : String(digit + 1));
}

function savePreset(account, engine, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw Error('Invalid build slot');
  const presets = ensurePresets(account);
  presets[slot] = copyCurrent(engine);
  account.activeLoadoutPreset = slot;
  return presets[slot];
}

// K/L apply filled presets only. Empty slot is a no-op (does not bank/overwrite).
// Switching to a filled slot autosaves the active preset first.
function loadPreset(account, engine, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw Error('Invalid build slot');
  const presets = ensurePresets(account);
  const preset = presets[slot];
  if (!preset) {
    return { empty: true, banked: false, ok: false, label: slotLabel(slot) };
  }
  const active = account.activeLoadoutPreset;
  if (active >= 0 && active < SLOT_COUNT && active !== slot) {
    presets[active] = copyCurrent(engine);
  }
  const ok = engine.applyBuild(preset.loadout, preset.reserve);
  account.activeLoadoutPreset = slot;
  return { empty: false, banked: false, ok: !!ok, label: slotLabel(slot) };
}

module.exports = {
  SLOT_COUNT,
  NONE,
  normalizePresets,
  ensurePresets,
  savePreset,
  loadPreset,
  emptySlots,
  slotLabel,
};
