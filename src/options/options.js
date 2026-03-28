const DEFAULT_DISTRACTING_DOMAINS = [
  'youtube.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'tiktok.com',
  'web.telegram.org'
];

const DEFAULT_ALLOWLIST_DOMAINS = [];

const allowlistTextarea = document.getElementById('allowlistTextarea');

function normalizeDomains(text) {
  return Array.from(
    new Set(
      text
        .split('\n')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function setStatus(text, kind = 'idle') {
  const saveStatus = document.getElementById('saveStatus');
  saveStatus.textContent = text;

  if (kind === 'success') {
    saveStatus.style.background = 'rgba(96, 205, 181, 0.18)';
    saveStatus.style.borderColor = 'rgba(126, 223, 201, 0.18)';
    saveStatus.style.color = '#dcfff6';
    return;
  }

  if (kind === 'error') {
    saveStatus.style.background = 'rgba(255, 120, 120, 0.14)';
    saveStatus.style.borderColor = 'rgba(255, 140, 140, 0.18)';
    saveStatus.style.color = '#ffe4e4';
    return;
  }

  saveStatus.style.background = 'rgba(255, 255, 255, 0.08)';
  saveStatus.style.borderColor = 'rgba(255, 255, 255, 0.10)';
  saveStatus.style.color = 'rgba(247, 251, 249, 0.92)';
}

async function loadSettings() {
  const domainsTextarea = document.getElementById('domainsTextarea');

  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  const distractingDomains = Array.isArray(settings.distractingDomains) && settings.distractingDomains.length
  ? settings.distractingDomains
  : DEFAULT_DISTRACTING_DOMAINS;

const allowlistDomains = Array.isArray(settings.allowlistDomains)
  ? settings.allowlistDomains
  : DEFAULT_ALLOWLIST_DOMAINS;

domainsTextarea.value = distractingDomains.join('\n');
allowlistTextarea.value = allowlistDomains.join('\n');
setStatus('Загружено', 'success');
}

async function saveSettings() {
  const domainsTextarea = document.getElementById('domainsTextarea');
  const allowlistTextarea = document.getElementById('allowlistTextarea');
  const saveBtn = document.getElementById('saveBtn');

  try {
    saveBtn.disabled = true;
    setStatus('Сохранение...', 'idle');

    const distractingDomains = normalizeDomains(domainsTextarea.value);
const allowlistDomains = normalizeDomains(allowlistTextarea.value);

if (!distractingDomains.length) {
  setStatus('Список не должен быть пустым', 'error');
  return;
}

await chrome.storage.local.set({
  settings: {
    distractingDomains,
    allowlistDomains
  }
});

domainsTextarea.value = distractingDomains.join('\n');
allowlistTextarea.value = allowlistDomains.join('\n');
setStatus('Сохранено', 'success');
  } catch (e) {
    console.error(e);
    setStatus('Ошибка сохранения', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

function resetDefaults() {
  const domainsTextarea = document.getElementById('domainsTextarea');
  const allowlistTextarea = document.getElementById('allowlistTextarea');

  domainsTextarea.value = DEFAULT_DISTRACTING_DOMAINS.join('\n');
  allowlistTextarea.value = DEFAULT_ALLOWLIST_DOMAINS.join('\n');

  setStatus('Значения по умолчанию восстановлены', 'idle');
}

document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('saveBtn');
  const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');

  saveBtn.addEventListener('click', saveSettings);
  resetDefaultsBtn.addEventListener('click', resetDefaults);

  await loadSettings();
});