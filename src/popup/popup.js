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

let selectedPeriod = 'day';

function formatMinutes(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  return `${minutes} мин`;
}

function getDateKeysForPeriod(period) {
  const now = new Date();
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const keys = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    keys.push(date.toISOString().split('T')[0]);
  }

  return keys;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] || null;
}

function getDomain(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace('www.', '');
  } catch (e) {
    return '—';
  }
}

async function getDistractingDomains() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  if (
    Array.isArray(settings.distractingDomains) &&
    settings.distractingDomains.length
  ) {
    return settings.distractingDomains;
  }

  return DEFAULT_DISTRACTING_DOMAINS;
}

function isDistractingDomain(domain, distractingDomains) {
  return distractingDomains.some((item) => domain.includes(item));
}

function setStatus(text, kind = 'default') {
  const focusStatus = document.getElementById('focusStatus');
  focusStatus.textContent = text;
  focusStatus.className = 'popup__status';

  if (kind === 'focus') {
    focusStatus.classList.add('popup__status--focus');
  }

  if (kind === 'warning') {
    focusStatus.classList.add('popup__status--warning');
  }
}

async function loadFocusMode() {
  const focusModeToggle = document.getElementById('focusModeToggle');
  const focusModeText = document.getElementById('focusModeText');

  const result = await chrome.storage.local.get(['focusModeEnabled']);
  const enabled = !!result.focusModeEnabled;

  focusModeToggle.checked = enabled;
  focusModeText.textContent = enabled ? 'Включён' : 'Выключен';
}

async function saveFocusMode(enabled) {
  await chrome.storage.local.set({
    focusModeEnabled: enabled
  });

  const focusModeText = document.getElementById('focusModeText');
  focusModeText.textContent = enabled ? 'Включён' : 'Выключен';
}

function updatePeriodButtons() {
  const buttons = document.querySelectorAll('.popup__period-button');

  buttons.forEach((button) => {
    if (button.dataset.period === selectedPeriod) {
      button.classList.add('popup__period-button--active');
    } else {
      button.classList.remove('popup__period-button--active');
    }
  });
}

async function loadPopupData() {
  const currentDomainEl = document.getElementById('currentDomain');
  const currentDomainTimeEl = document.getElementById('currentDomainTime');
  const totalDistractingTimeEl = document.getElementById('totalDistractingTime');
  const interventionsCountEl = document.getElementById('interventionsCount');

  const activeTab = await getActiveTab();

  if (!activeTab || !activeTab.url) {
    currentDomainEl.textContent = 'Нет активной вкладки';
    currentDomainTimeEl.textContent = '0 мин';
    totalDistractingTimeEl.textContent = '0 мин';
    interventionsCountEl.textContent = '0';
    setStatus('Нет данных', 'default');
    return;
  }

  const domain = getDomain(activeTab.url);
  currentDomainEl.textContent = domain;

  const distractingDomains = await getDistractingDomains();

  if (isDistractingDomain(domain, distractingDomains)) {
    setStatus('На отвлекающем сайте', 'warning');
  } else {
    setStatus('В фокусе', 'focus');
  }

  const result = await chrome.storage.local.get(['domainStats', 'interventionStats']);
  const domainStats = result.domainStats || {};
  const interventionStats = result.interventionStats || {};
  const periodKeys = getDateKeysForPeriod(selectedPeriod);

  let currentDomainTimeMs = 0;
  let totalDistractingMs = 0;
  let interventionsCount = 0;

  periodKeys.forEach((key) => {
    const dayStats = domainStats?.[key] || {};

    currentDomainTimeMs += dayStats?.[domain]?.totalTimeMs || 0;
    interventionsCount += interventionStats?.[key] || 0;

    Object.entries(dayStats).forEach(([statsDomain, statsValue]) => {
      if (
        isDistractingDomain(statsDomain, distractingDomains) &&
        statsValue &&
        typeof statsValue.totalTimeMs === 'number'
      ) {
        totalDistractingMs += statsValue.totalTimeMs;
      }
    });
  });

  currentDomainTimeEl.textContent = formatMinutes(currentDomainTimeMs);
  totalDistractingTimeEl.textContent = formatMinutes(totalDistractingMs);
  interventionsCountEl.textContent = String(interventionsCount);
}

async function handleSnooze() {
  await chrome.runtime.sendMessage({
    type: 'REFOCUS_SNOOZE_5_MINUTES'
  });

  window.close();
}

function handleOpenOptions() {
  chrome.runtime.openOptionsPage();
}

document.addEventListener('DOMContentLoaded', async () => {
  const snooze5Btn = document.getElementById('snooze5Btn');
  const openOptionsBtn = document.getElementById('openOptionsBtn');
  const focusModeToggle = document.getElementById('focusModeToggle');
  const periodButtons = document.querySelectorAll('.popup__period-button');

  snooze5Btn.addEventListener('click', handleSnooze);
  openOptionsBtn.addEventListener('click', handleOpenOptions);

  focusModeToggle.addEventListener('change', async (event) => {
    await saveFocusMode(event.target.checked);
  });

  periodButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      selectedPeriod = button.dataset.period;
      updatePeriodButtons();
      await loadPopupData();
    });
  });

  updatePeriodButtons();
  await loadPopupData();
  await loadFocusMode();
});