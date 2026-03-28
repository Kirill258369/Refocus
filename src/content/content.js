// Refocus Content Script
// Показывает UI-вмешательства поверх страницы и отправляет действия обратно в worker

const REFOCUS_BANNER_ID = 'refocus-banner';
const REFOCUS_OVERLAY_ID = 'refocus-overlay';

let isActionInProgress = false;

/**
 * Найти текущий баннер
 */
function getBanner() {
  return document.getElementById(REFOCUS_BANNER_ID);
}

/**
 * Найти overlay
 */
function getOverlay() {
  return document.getElementById(REFOCUS_OVERLAY_ID);
}

/**
 * Есть ли уже баннер на странице
 */
function hasBanner() {
  return !!getBanner();
}

/**
 * Удалить overlay
 */
function removeOverlay() {
  const existing = getOverlay();
  if (existing) {
    existing.remove();
  }
}

/**
 * Создать overlay
 */
function showOverlay(level = 1) {
  removeOverlay();

  if (level < 3) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = REFOCUS_OVERLAY_ID;

  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483646';
  overlay.style.pointerEvents = 'none';
  overlay.style.background = 'rgba(5, 10, 10, 0.22)';
  overlay.style.backdropFilter = 'blur(2px)';
  overlay.style.webkitBackdropFilter = 'blur(2px)';
  overlay.style.transition = 'opacity 0.18s ease';

  document.documentElement.appendChild(overlay);
}

/**
 * Удалить баннер
 */
function removeBanner() {
  const existing = getBanner();
  if (existing) {
    existing.remove();
  }

  removeOverlay();
  isActionInProgress = false;
}

/**
 * Переключить состояние кнопок
 */
function setButtonsDisabled(disabled) {
  const banner = getBanner();
  if (!banner) return;

  const buttons = banner.querySelectorAll('.refocus-banner__button');

  buttons.forEach((button) => {
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));

    if (disabled) {
      button.classList.add('refocus-banner__button--disabled');
    } else {
      button.classList.remove('refocus-banner__button--disabled');
    }
  });
}

/**
 * Универсальная отправка события в worker
 */
async function sendActionToWorker(type) {
  if (isActionInProgress) {
    return { success: false, reason: 'action_in_progress' };
  }

  try {
    isActionInProgress = true;
    setButtonsDisabled(true);

    const response = await chrome.runtime.sendMessage({ type });

    return response || { success: false };
  } catch (e) {
    console.log('[Refocus] Ошибка отправки действия в worker:', e);
    return { success: false, error: e?.message || 'unknown_error' };
  } finally {
    isActionInProgress = false;
    setButtonsDisabled(false);
  }
}

/**
 * Создать кнопку
 */
function createButton(text, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = `refocus-banner__button ${className}`.trim();

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    await onClick();
  });

  return button;
}

/**
 * Применить визуальный уровень баннера
 */
function applyBannerLevel(banner, level) {
  banner.dataset.level = String(level || 1);

  if (level >= 2) {
    banner.style.transform = 'translateY(0)';
  }

  if (level >= 3) {
    banner.style.boxShadow = '0 18px 42px rgba(0,0,0,0.22)';
  }
}

/**
 * Показать баннер
 */
function showBanner({
  title = 'Похоже, ты отвлёкся',
  message = 'Хочешь вернуться к задаче?',
  level = 1
} = {}) {
  removeBanner();
  showOverlay(level);

  const banner = document.createElement('div');
  banner.id = REFOCUS_BANNER_ID;
  banner.className = 'refocus-banner';

  const content = document.createElement('div');
  content.className = 'refocus-banner__content';

  const titleEl = document.createElement('div');
  titleEl.className = 'refocus-banner__title';
  titleEl.textContent = title;

  const messageEl = document.createElement('div');
  messageEl.className = 'refocus-banner__message';
  messageEl.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'refocus-banner__actions';

  const snoozeButton = createButton(
    'Ещё 5 минут',
    async () => {
      const result = await sendActionToWorker('REFOCUS_SNOOZE_5_MINUTES');

      if (result?.success) {
        removeBanner();
      }
    },
    'refocus-banner__button--secondary'
  );

  const backButton = createButton(
    'Вернуться к задаче',
    async () => {
      const result = await sendActionToWorker('REFOCUS_RETURN_TO_TASK');

      if (result?.success) {
        removeBanner();
      }
    },
    'refocus-banner__button--primary'
  );

  const closeButton = createButton(
    'Закрыть',
    async () => {
      removeBanner();
      await sendActionToWorker('REFOCUS_HIDE_BANNER');
    },
    'refocus-banner__button--ghost'
  );

  actions.appendChild(snoozeButton);
  actions.appendChild(backButton);
  actions.appendChild(closeButton);

  content.appendChild(titleEl);
  content.appendChild(messageEl);
  content.appendChild(actions);
  banner.appendChild(content);

  applyBannerLevel(banner, level);
  document.documentElement.appendChild(banner);
}

/**
 * Скрыть баннер по внешней команде
 */
function hideBanner() {
  removeBanner();
}

/**
 * Обработка входящих сообщений от worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'SHOW_REFOCUS_BANNER') {
    showBanner({
      title: message.payload?.title,
      message: message.payload?.message,
      level: message.payload?.level || 1
    });

    sendResponse({ success: true });
    return;
  }

  if (message.type === 'HIDE_REFOCUS_BANNER') {
    hideBanner();
    sendResponse({ success: true });
    return;
  }
});

console.log('[Refocus] content.js подключён');