// Refocus Service Worker (MV3)
// Базовый трекинг активной вкладки и сохранение сессий в chrome.storage.local

let currentTabId = null;
let currentDomain = null;
let sessionStart = null;

/**
 * Получить домен из URL
 */
function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch (e) {
    return null;
  }
}

/**
 * Проверить, можно ли отслеживать URL
 */
function isTrackableUrl(url) {
  if (!url || typeof url !== 'string') return false;

  return (
    url.startsWith('http://') ||
    url.startsWith('https://')
  );
}

/**
 * Получить ключ текущего дня в формате YYYY-MM-DD
 */
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Начать новую сессию
 */
function startSession(tabId, url) {
  if (!isTrackableUrl(url)) return;

  const domain = getDomain(url);

  if (!domain) return;

  currentTabId = tabId;
  currentDomain = domain;
  sessionStart = Date.now();

  console.log('[Refocus] Начало сессии:', domain);
}

/**
 * Сохранить завершённую сессию в storage
 */
async function saveSession(domain, startTime, endTime) {
  try {
    const durationMs = endTime - startTime;

    // слишком короткие сессии не сохраняем
    if (durationMs < 1000) {
      return;
    }

    const dayKey = getTodayKey();

    const result = await chrome.storage.local.get(['sessionLogs']);
    const sessionLogs = result.sessionLogs || {};

    if (!Array.isArray(sessionLogs[dayKey])) {
      sessionLogs[dayKey] = [];
    }

    sessionLogs[dayKey].push({
      domain,
      startTime,
      endTime,
      durationMs
    });

    await chrome.storage.local.set({ sessionLogs });

    console.log('[Refocus] Сессия сохранена:', {
      day: dayKey,
      domain,
      durationSec: Math.round(durationMs / 1000)
    });
  } catch (e) {
    console.log('[Refocus] Ошибка при сохранении сессии:', e);
  }
}

/**
 * Завершить текущую сессию
 */
async function endSession() {
  if (!currentDomain || !sessionStart) return;

  const endTime = Date.now();
  const duration = endTime - sessionStart;

  console.log('[Refocus] Конец сессии:', {
    domain: currentDomain,
    duration: Math.round(duration / 1000) + ' сек'
  });

  await saveSession(currentDomain, sessionStart, endTime);

  currentTabId = null;
  currentDomain = null;
  sessionStart = null;
}

/**
 * Обработать смену активной вкладки
 */
async function handleTabChange(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (!tab || !tab.url || !isTrackableUrl(tab.url)) {
      await endSession();
      return;
    }

    const newDomain = getDomain(tab.url);

    // Если домен тот же самый — ничего не делаем
    if (newDomain === currentDomain) return;

    // Завершаем предыдущую сессию
    await endSession();

    // Начинаем новую сессию
    startSession(tabId, tab.url);
  } catch (e) {
    console.log('[Refocus] Ошибка при смене вкладки:', e);
  }
}

/**
 * Когда пользователь переключает вкладку
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await handleTabChange(activeInfo.tabId);
});

/**
 * Когда вкладка обновляется, например после перехода по ссылке
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') {
    await handleTabChange(tabId);
  }
});

/**
 * Когда пользователь закрывает вкладку
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === currentTabId) {
    await endSession();
  }
});

/**
 * Когда пользователь переключается между окнами
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Пользователь ушёл из браузера
    await endSession();
    return;
  }

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      windowId: windowId
    });

    const tab = tabs[0];

    if (tab) {
      await handleTabChange(tab.id);
    }
  } catch (e) {
    console.log('[Refocus] Ошибка при смене окна:', e);
  }
});

/**
 * При установке расширения
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Refocus] Расширение установлено');
});

/**
 * При запуске браузера
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[Refocus] Браузер запущен');
});