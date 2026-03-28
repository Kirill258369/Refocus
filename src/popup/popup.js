function formatMinutes(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  return `${minutes} мин`;
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

async function loadPopupData() {
  const currentDomainEl = document.getElementById('currentDomain');
  const currentDomainTimeEl = document.getElementById('currentDomainTime');

  const activeTab = await getActiveTab();

  if (!activeTab || !activeTab.url) {
    currentDomainEl.textContent = 'Нет активной вкладки';
    currentDomainTimeEl.textContent = '0 мин';
    return;
  }

  const domain = getDomain(activeTab.url);
  currentDomainEl.textContent = domain;

  const result = await chrome.storage.local.get(['domainStats']);
  const domainStats = result.domainStats || {};
  const todayKey = new Date().toISOString().split('T')[0];

  const totalTimeMs =
    domainStats?.[todayKey]?.[domain]?.totalTimeMs || 0;

  currentDomainTimeEl.textContent = formatMinutes(totalTimeMs);
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

  snooze5Btn.addEventListener('click', handleSnooze);
  openOptionsBtn.addEventListener('click', handleOpenOptions);

  await loadPopupData();
});