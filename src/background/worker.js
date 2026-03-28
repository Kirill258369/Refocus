// Refocus Service Worker (MV3)
// Трекинг сессий + анализ отвлечения + показ баннера + возврат на рабочую вкладку

let currentTabId = null;
let currentDomain = null;
let sessionStart = null;

let snoozeUntil = 0;
let lastBannerShownAt = 0;

let lastWorkTabId = null;
let lastWorkWindowId = null;
let lastWorkDomain = null;
let lastWorkUpdatedAt = 0;

const BANNER_COOLDOWN_MS = 30 * 1000;

const DISTRACTING_DOMAINS = [
  'youtube.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'tiktok.com',
  'web.telegram.org'
];

/**
 * Проверка: домен относится к отвлекающим сайтам
 */
function isDistractingDomain(domain) {
  return DISTRACTING_DOMAINS.some((item) => domain.includes(item));
}

/**
 * Получить домен из URL
 */
function getDomain(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace('www.', '');
  } catch (e) {
    return null;
  }
}

/**
 * Проверить, можно ли отслеживать URL
 */
function isTrackableUrl(url) {
  return typeof url === 'string' &&
    (url.startsWith('http://') || url.startsWith('https://'));
}

/**
 * Ключ текущего дня
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Запомнить рабочую вкладку
 */
function rememberWorkTab(tab) {
  if (!tab || !tab.id || !tab.windowId || !tab.url) return;
  if (!isTrackableUrl(tab.url)) return;

  const domain = getDomain(tab.url);
  if (!domain) return;
  if (isDistractingDomain(domain)) return;

  lastWorkTabId = tab.id;
  lastWorkWindowId = tab.windowId;
  lastWorkDomain = domain;
  lastWorkUpdatedAt = Date.now();

  console.log('[Refocus] Запомнил рабочую вкладку:', {
    tabId: lastWorkTabId,
    windowId: lastWorkWindowId,
    domain: lastWorkDomain
  });
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
 * Анализ поведения по домену
 */
function analyzeDomain(dayStats, domain) {
  if (!dayStats || typeof dayStats !== 'object') return null;
  if (!dayStats[domain] || typeof dayStats[domain] !== 'object') return null;

  const stats = dayStats[domain];
  const totalMinutes = stats.totalTimeMs / 60000;
  const visits = stats.visits;

  let level = 0;
  const distracting = isDistractingDomain(domain);

  if (distracting) {
    // Тестовые пороги для MVP-проверки
    if (totalMinutes > 0.05) level += 1;
    if (totalMinutes > 0.1) level += 1;
    if (visits > 1) level += 1;

    // Усиление через повторные возвраты — только для отвлекающих сайтов
    if (visits >= 5 && level < 2) {
      level = 2;
    }

    if (visits >= 10 && level < 3) {
      level = 3;
    }
  }

  return {
    domain,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    visits,
    level,
    distracting
  };
}

/**
 * Сформировать текст баннера по уровню отвлечения
 */
function buildBannerPayload(analysis) {
  let title = 'Похоже, ты отвлёкся';
  let message = `Ты уже провёл здесь ${analysis.totalMinutes} мин. Хочешь вернуться к задаче?`;

  if (analysis.level === 1) {
    title = 'Немного отвлёкся?';
    message = `Ты уже несколько минут на ${analysis.domain}. Хочешь вернуться к задаче?`;
  }

  if (analysis.level === 2) {
    title = 'Ты уже завис здесь';
    message = `Похоже, ты несколько раз возвращался на ${analysis.domain}. Вернёмся к работе?`;
  }

  if (analysis.level >= 3) {
    title = 'Похоже, ты залип';
    message = `Ты уже провёл здесь ${analysis.totalMinutes} мин. Давай мягко вернёмся к задаче.`;
  }

  return { title, message };
}

/**
 * Отправить баннер в активную вкладку
 */
async function sendRefocusBanner(analysis, targetTabId) {
  try {
    if (!targetTabId) {
      console.log('[Refocus] Нет targetTabId для показа баннера');
      return false;
    }

    const payload = buildBannerPayload(analysis);

    console.log('[Refocus] Отправка баннера в вкладку отвлечения:', targetTabId);

    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: 'SHOW_REFOCUS_BANNER',
      payload
    });

    console.log('[Refocus] Ответ от content.js:', response);
    return true;
  } catch (e) {
    console.log('[Refocus] Ошибка отправки баннера:', e);
    return false;
  }
}

/**
 * Сохранить сессию и обновить статистику
 */
async function saveSession(domain, startTime, endTime, sourceTabId) {
  try {
    const durationMs = endTime - startTime;

    if (durationMs < 1000) {
      return;
    }

    const dayKey = getTodayKey();
    const result = await chrome.storage.local.get(['sessionLogs', 'domainStats']);

    const sessionLogs =
      result.sessionLogs && typeof result.sessionLogs === 'object'
        ? result.sessionLogs
        : {};

    const domainStats =
      result.domainStats && typeof result.domainStats === 'object'
        ? result.domainStats
        : {};

    if (!Array.isArray(sessionLogs[dayKey])) {
      sessionLogs[dayKey] = [];
    }

    sessionLogs[dayKey].push({
      domain,
      startTime,
      endTime,
      durationMs
    });

    if (
      !domainStats[dayKey] ||
      typeof domainStats[dayKey] !== 'object' ||
      Array.isArray(domainStats[dayKey])
    ) {
      domainStats[dayKey] = {};
    }

    if (
      !domainStats[dayKey][domain] ||
      typeof domainStats[dayKey][domain] !== 'object'
    ) {
      domainStats[dayKey][domain] = {
        totalTimeMs: 0,
        visits: 0
      };
    }

    domainStats[dayKey][domain].totalTimeMs += durationMs;
    domainStats[dayKey][domain].visits += 1;

    await chrome.storage.local.set({
      sessionLogs,
      domainStats
    });

    const analysis = analyzeDomain(domainStats[dayKey], domain);

    if (!analysis) {
      return;
    }

    console.log('[Refocus] Анализ:', analysis);

    if (!analysis.distracting || analysis.level <= 0) {
      return;
    }

    const now = Date.now();

    if (now < snoozeUntil) {
      console.log('[Refocus] Snooze активен — баннер не показываем');
      return;
    }

    if (now - lastBannerShownAt < BANNER_COOLDOWN_MS) {
      console.log('[Refocus] Cooldown баннера активен — повторно не показываем');
      return;
    }

    const shown = await sendRefocusBanner(analysis, sourceTabId);

    if (shown) {
      lastBannerShownAt = now;
    }
  } catch (e) {
    console.log('[Refocus] Ошибка в saveSession:', e);
  }
}

/**
 * Завершить текущую сессию
 */
async function endSession() {
  if (!currentDomain || !sessionStart) {
    return;
  }

  const endTime = Date.now();
  const sourceTabId = currentTabId;

  console.log('[Refocus] Конец сессии:', currentDomain);

  await saveSession(currentDomain, sessionStart, endTime, sourceTabId);

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

    if (newDomain === currentDomain) {
      return;
    }

    // Запоминаем рабочую вкладку до ухода в отвлекающий сайт
    if (!isDistractingDomain(newDomain)) {
      rememberWorkTab(tab);
    }

    await endSession();
    startSession(tabId, tab.url);
  } catch (e) {
    console.log('[Refocus] Ошибка вкладки:', e);
  }
}

/**
 * Вернуться на последнюю рабочую вкладку
 */
async function returnToLastWorkTab(senderTabId = null) {
  try {
    if (!lastWorkTabId || !lastWorkWindowId) {
      console.log('[Refocus] Нет сохранённой рабочей вкладки для возврата');
      return false;
    }

    // Сначала проверяем, что рабочая вкладка вообще существует
    const workTab = await chrome.tabs.get(lastWorkTabId);

    if (!workTab || !workTab.id || !workTab.windowId) {
      console.log('[Refocus] Рабочая вкладка не найдена');
      return false;
    }

    // Если баннер открыт в текущей вкладке, можно попросить её скрыть баннер
    if (senderTabId) {
      try {
        await chrome.tabs.sendMessage(senderTabId, {
          type: 'HIDE_REFOCUS_BANNER'
        });
      } catch (e) {
        console.log('[Refocus] Не удалось скрыть баннер перед возвратом:', e);
      }
    }

    // Фокусируем окно и активируем рабочую вкладку
    await chrome.windows.update(workTab.windowId, { focused: true });
    await chrome.tabs.update(workTab.id, { active: true });

    console.log('[Refocus] Возврат на рабочую вкладку:', {
      tabId: workTab.id,
      windowId: workTab.windowId,
      domain: lastWorkDomain,
      updatedAt: lastWorkUpdatedAt
    });

    return true;
  } catch (e) {
    console.log('[Refocus] Не удалось вернуться на рабочую вкладку:', e);

    lastWorkTabId = null;
    lastWorkWindowId = null;
    lastWorkDomain = null;
    lastWorkUpdatedAt = 0;

    return false;
  }
}

/**
 * События вкладок и окон
 */
chrome.tabs.onActivated.addListener(async (info) => {
  await handleTabChange(info.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') {
    await handleTabChange(tabId);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === currentTabId) {
    await endSession();
  }

  if (tabId === lastWorkTabId) {
    lastWorkTabId = null;
    lastWorkWindowId = null;
    lastWorkDomain = null;
    lastWorkUpdatedAt = 0;

    console.log('[Refocus] Рабочая вкладка была закрыта, сбрасываю ссылку');
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await endSession();
    return;
  }

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      windowId
    });

    const activeTab = tabs[0];

    if (activeTab && activeTab.id) {
      await handleTabChange(activeTab.id);
    }
  } catch (e) {
    console.log('[Refocus] Ошибка окна:', e);
  }
});

/**
 * События расширения
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Refocus] Установлено');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Refocus] Запущено');
});

/**
 * Обработка действий из баннера
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'REFOCUS_SNOOZE_5_MINUTES') {
    snoozeUntil = Date.now() + 5 * 60 * 1000;

    console.log('[Refocus] Snooze на 5 минут до:', new Date(snoozeUntil));

    sendResponse({ success: true });
    return;
  }

  if (message.type === 'REFOCUS_RETURN_TO_TASK') {
  const senderTabId = sender?.tab?.id || null;

  returnToLastWorkTab(senderTabId)
    .then((success) => {
      console.log('[Refocus] Пользователь решил вернуться к задаче');
      sendResponse({ success });
    })
    .catch((e) => {
      console.log('[Refocus] Ошибка возврата к задаче:', e);
      sendResponse({ success: false });
    });

  return true;
}

  if (message.type === 'REFOCUS_HIDE_BANNER') {
    sendResponse({ success: true });
  }
});