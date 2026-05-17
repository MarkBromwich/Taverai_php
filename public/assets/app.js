(function () {
  const app = window.TAVERI_APP || { publicBaseUrl: "", routePrefix: "/index.php", page: "login", isAuthenticated: false };
  const routePrefix = app.routePrefix || "/index.php";

  function pageUrl(path) {
    const trimmed = String(path || "").replace(/^\//, "");
    if (!trimmed) return routePrefix;

    const parts = trimmed.split("?");
    const basePath = parts[0];
    const queryString = parts[1] || "";
    const url = `${routePrefix}?path=${encodeURIComponent(basePath).replace(/%2F/g, "/")}`;
    return queryString ? `${url}&${queryString}` : url;
  }

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    ensureOnline("You are offline. Reconnect and try again.");
    const response = await fetch(pageUrl(path), {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(unsafe && app.csrfToken ? { "X-CSRF-Token": app.csrfToken } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      const message = data.error || data.message || "Request failed";
      const err = new Error(message);
      err.status = response.status;
      err.payload = data;
      throw err;
    }

    return data;
  }

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine;
  }

  function ensureOnline(message = "You are offline. Reconnect and try again.") {
    if (isOnline()) return;
    throw new Error(message);
  }

  function showAppNavigationPending() {
    document.body.classList.add("is-navigating");
  }

  const DATA_CACHE_PREFIX = "taverai:data:v1:";

  function userCacheScope(user = {}) {
    return String(user.id || user.email || user.username || "user").replace(/[^a-z0-9_.@-]/gi, "_");
  }

  function dataCacheKey(scope, name) {
    return `${DATA_CACHE_PREFIX}${scope}:${name}`;
  }

  function readLastUser() {
    try {
      const raw = localStorage.getItem(`${DATA_CACHE_PREFIX}last-user`);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeLastUser(user) {
    try {
      if (user) localStorage.setItem(`${DATA_CACHE_PREFIX}last-user`, JSON.stringify(user));
    } catch (error) {
      // Auth still works if browser storage is unavailable.
    }
  }

  function clearLastUser() {
    try {
      localStorage.removeItem(`${DATA_CACHE_PREFIX}last-user`);
    } catch (error) {
      // Nothing to clean up if browser storage is unavailable.
    }
  }

  function clearLocalDataCache(scope = "") {
    try {
      const scopedPrefix = scope ? `${DATA_CACHE_PREFIX}${scope}:` : DATA_CACHE_PREFIX;
      Object.keys(localStorage)
        .filter((key) => key.startsWith(scopedPrefix))
        .forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      // Clearing cache is best-effort.
    }
  }

  function readCachedData(scope, name) {
    try {
      const raw = localStorage.getItem(dataCacheKey(scope, name));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeCachedData(scope, name, data) {
    try {
      localStorage.setItem(dataCacheKey(scope, name), JSON.stringify({
        savedAt: new Date().toISOString(),
        data,
      }));
    } catch (error) {
      // If device storage is full or disabled, the app should keep working normally.
    }
  }

  function formatCacheTime(value) {
    if (!value) return "earlier";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "earlier";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function cacheStatus(id, anchor, state, savedAt = "") {
    if (!anchor) return;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("p");
      el.id = id;
      el.className = "cache-note";
      anchor.insertAdjacentElement("afterend", el);
    }

    const savedText = savedAt ? ` Last updated ${formatCacheTime(savedAt)}.` : "";
    const textByState = {
      cached: `Showing saved data while Taverai refreshes.${savedText}`,
      offline: `Offline. Showing saved data from this phone.${savedText}`,
      fresh: `Updated just now.`,
      stale: `Could not refresh. Showing saved data.${savedText}`,
      error: "Could not load fresh data.",
    };

    el.textContent = textByState[state] || "";
    el.classList.toggle("is-visible", Boolean(el.textContent));
    el.classList.toggle("is-offline", state === "offline" || state === "stale");
  }

  function setMessage(id, message, kind = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("is-error", "is-success");
    if (kind) {
      el.classList.add(kind === "error" ? "is-error" : "is-success");
    }
  }

  function initPwa() {
    const offlineBanner = document.getElementById("offline-banner");
    const installBanner = document.getElementById("install-banner");
    const installCopy = document.getElementById("install-banner-copy");
    const installButton = document.getElementById("install-app-button");
    const dismissButton = document.getElementById("install-dismiss-button");
    const installDismissedKey = `${DATA_CACHE_PREFIX}install-dismissed`;
    let deferredInstallPrompt = null;

    const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");

    const updateOnlineOnlyControls = () => {
      const offline = !navigator.onLine;
      document.querySelectorAll("[data-online-only]").forEach((control) => {
        control.disabled = offline;
        control.classList.toggle("is-disabled", offline);
        if (offline) {
          control.setAttribute("title", "Reconnect to use this action.");
        } else {
          control.removeAttribute("title");
        }
      });
    };

    const updateNetworkState = () => {
      document.body.classList.toggle("is-offline", !navigator.onLine);
      offlineBanner?.classList.toggle("is-visible", !navigator.onLine);
      updateOnlineOnlyControls();
    };

    const showInstallBanner = (mode = "browser") => {
      if (!installBanner || isStandalone() || localStorage.getItem(installDismissedKey) === "1") return;
      installBanner.classList.add("is-visible");
      const ios = mode === "ios";
      if (installCopy) {
        installCopy.textContent = ios
          ? "On iPhone, use Share, then Add to Home Screen."
          : "Add Taverai to your home screen for a faster app-like experience.";
      }
      installButton?.classList.toggle("is-hidden", ios);
    };

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      showInstallBanner("browser");
    });

    installButton?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      installBanner?.classList.remove("is-visible");
    });

    dismissButton?.addEventListener("click", () => {
      try {
        localStorage.setItem(installDismissedKey, "1");
      } catch (error) {
        // Dismissal is convenience only.
      }
      installBanner?.classList.remove("is-visible");
    });

    if (isIos() && !isStandalone()) {
      setTimeout(() => showInstallBanner("ios"), 900);
    }

    updateNetworkState();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    window.addEventListener("load", updateOnlineOnlyControls);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        const base = app.publicBaseUrl || "";
        const version = app.serviceWorkerVersion ? `?v=${encodeURIComponent(app.serviceWorkerVersion)}` : "";
        navigator.serviceWorker.register(`${base}/service-worker.js${version}`).catch(() => {});
      });
    }
  }

  function initAppNavigationPolish() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== "_self") return;

      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.href === window.location.href) return;

      showAppNavigationPending();
    });

    window.addEventListener("pageshow", () => {
      document.body.classList.remove("is-navigating");
    });
  }

  function markNetworkOnlyControls() {
    [
      "#entry-estimate-button",
      "#meal-photo-form button[type='submit']",
      "#avatar-upload-button",
      "#account-reset-link-button",
      "#account-export-json-button",
      "#account-export-csv-button",
      "#account-import-json-button",
      "#account-delete-button",
      "#logout-button",
      "#account-form button[type='submit']",
      "#account-connect-health",
      "#plans-save-goal",
      "#template-add-button",
      "#custom-plan-ai-button",
      "#custom-plan-form button[type='submit']",
      "#coach-form button[type='submit']",
      "#menu-compare-form button[type='submit']",
      "#meal-plan-form button[type='submit']",
      "#barcode-form button[type='submit']",
    ].forEach((selector) => {
      document.querySelectorAll(selector).forEach((control) => {
        control.setAttribute("data-online-only", "1");
      });
    });
  }

  function renderAvatar(el, user = {}) {
    if (!el) return;
    const avatarUrl = user.avatarUrl || user.avatar_url || "";
    const initial = (user.firstName || user.username || "T").slice(0, 1).toUpperCase();

    if (avatarUrl) {
      el.textContent = "";
      el.classList.add("has-image");
      el.style.backgroundImage = `url("${String(avatarUrl).replace(/"/g, "%22")}")`;
      return;
    }

    el.classList.remove("has-image");
    el.style.backgroundImage = "";
    el.textContent = initial;
  }

  function activateNav() {
    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      const navPage = app.page === "favorites" ? "menu" : app.page;
      if (link.getAttribute("data-nav-link") === navPage) {
        link.classList.add("is-active");
      }
      if (["login", "signup"].includes(app.page)) {
        if (["log", "menu", "plans", "coach", "account", "admin"].includes(link.getAttribute("data-nav-link"))) {
          link.classList.add("is-hidden");
        }
      } else if (["login", "signup", "forgot", "reset"].includes(link.getAttribute("data-nav-link"))) {
        link.classList.add("is-hidden");
      }
    });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function formatEntryTime(value) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function currentTimeValue() {
    const now = new Date();
    return [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":");
  }

  function getNumeric(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function pctOf(value, target) {
    const numericValue = Number(value);
    const numericTarget = Number(target);
    if (!Number.isFinite(numericValue) || !Number.isFinite(numericTarget) || numericTarget <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((numericValue / numericTarget) * 100)));
  }

  function setProgress(el, pct) {
    if (!el) return;
    const value = Math.max(0, Math.min(100, Number(pct) || 0));
    if (el.classList.contains("gauge-arc")) {
      el.style.setProperty("--gauge-pct", String(value));
      el.style.setProperty("--gauge-deg", `${value * 1.8}deg`);
      const needle = el.parentElement?.querySelector(".gauge-needle");
      if (needle) {
        needle.style.setProperty("--needle-deg", `${-90 + (value * 1.8)}deg`);
      }
      return;
    }
    el.style.width = `${value}%`;
  }

  function setProgressTone(el, tone) {
    if (!el) return;
    el.classList.remove("is-empty", "is-great", "is-good", "is-fair", "is-off");
    el.classList.add(`is-${tone}`);
    if (el.classList.contains("gauge-arc")) {
      const colorByTone = {
        great: "var(--gauge-green)",
        fair: "var(--gauge-yellow)",
        off: "var(--gauge-red)",
        empty: "rgba(255, 255, 255, 0.18)",
      };
      const color = colorByTone[tone] || colorByTone.empty;
      el.style.setProperty("--gauge-color", color);
      el.parentElement?.style.setProperty("--gauge-color", color);
    }
  }

  function macroShare(grams, caloriesPerGram, totalMacroCalories) {
    if (!totalMacroCalories || totalMacroCalories <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((Number(grams) || 0) * caloriesPerGram / totalMacroCalories) * 100)));
  }

  function scoreTone(score) {
    if (score == null || !Number.isFinite(Number(score))) return "empty";
    const value = Number(score);
    if (value >= 85) return "great";
    if (value >= 65) return "fair";
    return "off";
  }

  function calorieProgressTone(pct, hasGoal) {
    if (!hasGoal || !Number.isFinite(Number(pct))) return "empty";
    const value = Number(pct);
    if (value <= 65) return "great";
    if (value <= 85) return "fair";
    return "off";
  }

  function friendlyDateLabel(ymd) {
    if (!ymd) return "Today";
    const date = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(date.getTime())) return ymd;

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    if (ymd === todayKey) return "Today";
    if (ymd === yesterdayKey) return "Yesterday";

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function displayDateValue(ymd) {
    if (!ymd) return "";
    const date = new Date(`${ymd}T12:00:00`);
    return Number.isNaN(date.getTime()) ? ymd : date.toISOString().slice(0, 10);
  }

  async function requireAuth() {
    const cachedUser = readLastUser();
    try {
      const data = await api("/api/me", { method: "GET" });
      if (data.user) writeLastUser(data.user);
      return data.user || null;
    } catch (error) {
      if (!isOnline() && cachedUser) {
        return cachedUser;
      }
      if (error.status === 401) {
        window.location.href = pageUrl("login");
        return null;
      }
      throw error;
    }
  }

  function initLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("login-message", "");

      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        await api("/api/login", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("login-message", "Signed in. Redirecting...", "success");
        window.location.href = pageUrl("log");
      } catch (error) {
        setMessage("login-message", error.message, "error");
      }
    });
  }

  function initSignup() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("signup-message", "");

      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.password !== payload.confirmPassword) {
        setMessage("signup-message", "Passwords do not match.", "error");
        return;
      }

      delete payload.confirmPassword;

      try {
        await api("/api/signup", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("signup-message", "Account created. Redirecting...", "success");
        window.location.href = pageUrl("log");
      } catch (error) {
        setMessage("signup-message", error.message, "error");
      }
    });
  }

  function initForgot() {
    const form = document.getElementById("forgot-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("forgot-message", "");

      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await api("/api/password/request", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("forgot-message", result.message || "If that email exists, a reset link has been sent.", "success");

        const panel = document.getElementById("forgot-reset-link-panel");
        const text = document.getElementById("forgot-reset-link-text");
        if (result.resetLink && panel && text) {
          text.innerHTML = `<a href="${escapeHtml(result.resetLink)}">${escapeHtml(result.resetLink)}</a>`;
          panel.classList.remove("is-hidden");
        }
      } catch (error) {
        setMessage("forgot-message", error.message, "error");
      }
    });
  }

  function initReset() {
    const form = document.getElementById("reset-form");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token && form.token) {
      form.token.value = token;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("reset-message", "");

      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        await api("/api/password/reset", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("reset-message", "Password updated. Redirecting to login...", "success");
        setTimeout(() => {
          window.location.href = pageUrl("login");
        }, 700);
      } catch (error) {
        setMessage("reset-message", error.message, "error");
      }
    });
  }

  async function initLog() {
    const currentUser = await requireAuth();
    if (!currentUser) return;
    const cacheScope = userCacheScope(currentUser);

    const dateInput = document.getElementById("log-date");
    const form = document.getElementById("entry-form");
    const list = document.getElementById("entries-list");
    const mealPhotoForm = document.getElementById("meal-photo-form");
    const estimateButton = document.getElementById("entry-estimate-button");
    const mealPhotoInput = document.getElementById("meal-photo-file");
    const mealCameraButton = document.getElementById("meal-camera-button");
    const mealPhotoPreview = document.getElementById("meal-photo-preview");
    const mealPhotoPreviewImage = document.getElementById("meal-photo-preview-image");
    let mealPhotoPreviewUrl = "";

    if (!dateInput || !form || !list) return;

    dateInput.value = new Date().toISOString().slice(0, 10);

    async function loadSummary() {
      const cacheName = `log-summary:${dateInput.value}`;
      const cached = readCachedData(cacheScope, cacheName);
      const hero = document.getElementById("summary-hero-copy");
      if (cached) {
        renderLogSummary(cached.data);
        cacheStatus("log-summary-cache-note", hero, isOnline() ? "cached" : "offline", cached.savedAt);
      }

      try {
        const result = await api(`/api/entries/summary?date=${encodeURIComponent(dateInput.value)}`, { method: "GET" });
        renderLogSummary(result);
        writeCachedData(cacheScope, cacheName, result);
        cacheStatus("log-summary-cache-note", hero, "fresh");
      } catch (error) {
        if (cached) {
          cacheStatus("log-summary-cache-note", hero, isOnline() ? "stale" : "offline", cached.savedAt);
        } else if (hero) {
          hero.textContent = error.message;
          cacheStatus("log-summary-cache-note", hero, "error");
        }
      }
    }

    function renderLogSummary(result) {
      const user = result.user || {};
      const plan = result.plan || null;
      const selectedDay = result.selectedDay || { totals: {}, foods: [], reasons: [], entriesCount: 0 };
      const week = result.week || {};
      const month = result.month || {};
      const goal = result.calorieTarget != null
        ? Number(result.calorieTarget)
        : (user.dailyCalorieGoal != null ? Number(user.dailyCalorieGoal) : null);
      const calories = Number(selectedDay.totals?.calories || 0);
      const protein = Number(selectedDay.totals?.proteinG || 0);
      const carbs = Number(selectedDay.totals?.carbsG || 0);
      const fat = Number(selectedDay.totals?.fatG || 0);
      const score = selectedDay.score != null ? Number(selectedDay.score) : null;
      const tone = scoreTone(score);

      const greeting = document.getElementById("summary-greeting");
      const avatar = document.getElementById("summary-avatar");
      const heroCopy = document.getElementById("summary-hero-copy");
      const streak = document.getElementById("summary-streak");
      const activePlan = document.getElementById("summary-plan");
      const weekScore = document.getElementById("summary-week-score");
      const monthScore = document.getElementById("summary-month-score");
      const calTag = document.getElementById("summary-calories-tag");
      const calBar = document.getElementById("summary-calories-bar");
      const calCopy = document.getElementById("summary-calories-copy");
      const calHint = document.getElementById("summary-calories-hint");
      const calReasons = document.getElementById("summary-calories-reasons");
      const statCalories = document.getElementById("stat-calories");
      const complianceScore = document.getElementById("summary-compliance-score");
      const complianceBar = document.getElementById("summary-compliance-bar");
      const complianceCopy = document.getElementById("summary-compliance-copy");
      const complianceReasons = document.getElementById("summary-compliance-reasons");
      const dayLabel = document.getElementById("summary-day-label");
      const dateText = document.getElementById("summary-date-text");
      const dayEntries = document.getElementById("summary-day-entries");
      const dayProtein = document.getElementById("summary-day-protein");
      const dayCarbs = document.getElementById("summary-day-carbs");
      const dayFat = document.getElementById("summary-day-fat");
      const proteinBar = document.getElementById("summary-protein-bar");
      const carbsBar = document.getElementById("summary-carbs-bar");
      const fatBar = document.getElementById("summary-fat-bar");
      const macroTotal = document.getElementById("macro-balance-total");
      const macroProtein = document.getElementById("macro-balance-protein");
      const macroCarbs = document.getElementById("macro-balance-carbs");
      const macroFat = document.getElementById("macro-balance-fat");
      const macroProteinPct = document.getElementById("macro-balance-protein-pct");
      const macroCarbsPct = document.getElementById("macro-balance-carbs-pct");
      const macroFatPct = document.getElementById("macro-balance-fat-pct");
      const macroProteinBar = document.getElementById("macro-balance-protein-bar");
      const macroCarbsBar = document.getElementById("macro-balance-carbs-bar");
      const macroFatBar = document.getElementById("macro-balance-fat-bar");
      const macroCopy = document.getElementById("macro-balance-copy");
      const foods = document.getElementById("summary-foods");
      const foodEntryCount = document.getElementById("food-entry-count");
      const calendar = document.getElementById("summary-calendar");
      const unlockCard = document.getElementById("unlock-gauges-card");
      const unlockPlanItem = document.getElementById("unlock-plan-item");
      const unlockGoalItem = document.getElementById("unlock-goal-item");
      const unlockEntryItem = document.getElementById("unlock-entry-item");

      if (greeting) {
        const name = user.firstName || user.username || "there";
        greeting.textContent = selectedDay.entriesCount
          ? `Nice work, ${name}`
          : `Hey ${name}`;
      }
      if (avatar) {
        renderAvatar(avatar, user);
      }
      if (heroCopy) {
        heroCopy.textContent = selectedDay.entriesCount
          ? `You logged ${selectedDay.entriesCount} entr${selectedDay.entriesCount === 1 ? "y" : "ies"} for ${friendlyDateLabel(result.selectedDate)}. Keep the momentum going.`
          : `No entries yet for ${friendlyDateLabel(result.selectedDate)}. Log your first meal and the dashboard will score the day.`;
      }
      if (streak) streak.textContent = `${result.streakDays || 0} day${Number(result.streakDays || 0) === 1 ? "" : "s"}`;
      if (activePlan) activePlan.textContent = plan?.name || "No plan";
      if (weekScore) weekScore.textContent = week.avgScore != null ? `${week.avgScore}/100` : "—";
      if (monthScore) monthScore.textContent = month.avgScore != null ? `${month.avgScore}/100` : "—";

      if (unlockCard) {
        const hasPlan = !!plan;
        const hasGoal = goal != null && goal > 0;
        const hasEntry = Number(selectedDay.entriesCount || 0) > 0;

        unlockPlanItem?.classList.toggle("is-hidden", hasPlan);
        unlockGoalItem?.classList.toggle("is-hidden", hasGoal);
        unlockEntryItem?.classList.toggle("is-hidden", hasEntry);
        unlockCard.classList.toggle("is-hidden", hasPlan && hasGoal && hasEntry);
      }

      if (calTag) {
        calTag.textContent = goal ? `${calories} / ${goal} kcal` : `${calories} kcal`;
      }
      if (calBar) {
        const calorieTarget = goal && goal > 0 ? goal : 2000;
        const pct = pctOf(calories, calorieTarget);
        setProgress(calBar, pct);
        setProgressTone(calBar, calorieProgressTone(pct, goal && goal > 0));
      }
      if (calCopy) {
        if (goal && goal > 0) {
          const diff = goal - calories;
          calCopy.textContent = diff >= 0
            ? `${diff} calories left to reach your goal for the day.`
            : `${Math.abs(diff)} calories above your current daily goal.`;
        } else {
          calCopy.textContent = calories > 0
            ? "Set a daily calorie goal in Plans or You to make this target exact."
            : "Set a daily calorie goal in Plans or You to unlock target pacing here.";
        }
      }
      if (calHint) {
        if (!(goal && goal > 0)) {
          calHint.textContent = "Set a daily calorie goal to turn this into a pacing gauge.";
        } else if (calories <= 0) {
          calHint.textContent = "Log your first meal to start tracking calorie pacing.";
        } else {
          const pct = pctOf(calories, goal);
          if (pct <= 65) {
            calHint.textContent = "You have plenty of room left in today's calorie budget.";
          } else if (pct <= 85) {
            calHint.textContent = "You are getting close to today's calorie target.";
          } else if (pct <= 100) {
            calHint.textContent = "You are near the top of today's calorie target.";
          } else {
            calHint.textContent = "You are above today's calorie target.";
          }
        }
      }
      if (calReasons) {
        const reasons = [];
        if (goal && goal > 0) {
          const diff = goal - calories;
          if (calories > 0) {
            reasons.push(diff >= 0 ? `${diff} kcal remaining.` : `${Math.abs(diff)} kcal over target.`);
          }
          if (Number(selectedDay.entriesCount || 0) > 0) {
            reasons.push(`${selectedDay.entriesCount} logged meal${Number(selectedDay.entriesCount || 0) === 1 ? "" : "s"} counted.`);
          }
        }
        calReasons.innerHTML = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
      }
      if (statCalories) statCalories.textContent = Math.round(calories).toString();

      if (complianceScore) complianceScore.textContent = score != null ? `${score}/100` : "—";
      if (complianceBar) {
        setProgress(complianceBar, score != null ? pctOf(score, 100) : 0);
        setProgressTone(complianceBar, tone);
      }
      if (complianceCopy) {
        const planName = plan?.name || "your current approach";
        if (score == null) {
          complianceCopy.textContent = `Once macros are available, Taverai will score this day against ${planName}.`;
        } else if (tone === "great") {
          complianceCopy.textContent = `Today is lining up very well with ${planName}.`;
        } else if (tone === "fair") {
          complianceCopy.textContent = `Today is partly aligned with ${planName}, with a little room to tighten things up.`;
        } else {
          complianceCopy.textContent = `Today is drifting away from ${planName}. The notes below show what to correct next.`;
        }
      }
      if (complianceReasons) {
        const reasons = Array.isArray(selectedDay.reasons) && selectedDay.reasons.length
          ? selectedDay.reasons
          : [];
        complianceReasons.innerHTML = reasons.slice(0, 3).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
      }

      if (dayLabel) dayLabel.textContent = friendlyDateLabel(result.selectedDate);
      if (dateText) dateText.textContent = displayDateValue(result.selectedDate);
      if (dayEntries) dayEntries.textContent = String(selectedDay.entriesCount || 0);
      if (foodEntryCount) foodEntryCount.textContent = String(selectedDay.entriesCount || 0);
      if (dayProtein) dayProtein.textContent = `${Math.round(protein)}g`;
      if (dayCarbs) dayCarbs.textContent = `${Math.round(carbs)}g`;
      if (dayFat) dayFat.textContent = `${Math.round(fat)}g`;
      if (proteinBar) proteinBar.style.width = `${pctOf(protein, 120)}%`;
      if (carbsBar) carbsBar.style.width = `${pctOf(carbs, 250)}%`;
      if (fatBar) fatBar.style.width = `${pctOf(fat, 70)}%`;

      const proteinCalories = protein * 4;
      const carbsCalories = carbs * 4;
      const fatCalories = fat * 9;
      const macroCalories = proteinCalories + carbsCalories + fatCalories;
      const proteinPct = macroShare(protein, 4, macroCalories);
      const carbsPct = macroShare(carbs, 4, macroCalories);
      const fatPct = macroCalories > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

      if (macroTotal) {
        macroTotal.textContent = macroCalories > 0 ? `${Math.round(macroCalories)} macro kcal` : "No macros yet";
      }
      if (macroProtein) macroProtein.textContent = `${Math.round(protein)}g`;
      if (macroCarbs) macroCarbs.textContent = `${Math.round(carbs)}g`;
      if (macroFat) macroFat.textContent = `${Math.round(fat)}g`;
      if (macroProteinPct) macroProteinPct.textContent = `${proteinPct}%`;
      if (macroCarbsPct) macroCarbsPct.textContent = `${carbsPct}%`;
      if (macroFatPct) macroFatPct.textContent = `${fatPct}%`;
      if (macroProteinBar) macroProteinBar.style.width = `${proteinPct}%`;
      if (macroCarbsBar) macroCarbsBar.style.width = `${carbsPct}%`;
      if (macroFatBar) macroFatBar.style.width = `${fatPct}%`;
      if (macroCopy) {
        macroCopy.textContent = macroCalories > 0
          ? "Macro balance is based on protein and carbs at 4 kcal/g, and fat at 9 kcal/g."
          : "Add nutrition to see your macro balance.";
      }

      if (foods) {
        const foodItems = Array.isArray(selectedDay.foods) ? selectedDay.foods.filter(Boolean) : [];
        foods.innerHTML = foodItems.length
          ? foodItems.slice(0, 6).map((food) => `<span class="food-chip">${escapeHtml(food)}</span>`).join("")
          : '<span class="food-chip is-empty">No foods logged yet.</span>';
      }

      if (calendar) {
        const calendarPanel = calendar.closest(".calendar-panel");
        if (calendarPanel && getComputedStyle(calendarPanel).display === "none") {
          calendar.innerHTML = "";
          return;
        }

        const items = Array.isArray(result.calendar) ? result.calendar : [];
        calendar.innerHTML = items.map((day) => `
          <button
            type="button"
            class="calendar-cell is-${escapeHtml(day.level || 'empty')} ${day.date === result.selectedDate ? 'is-selected' : ''}"
            data-calendar-date="${escapeHtml(day.date)}"
            title="${escapeHtml(`${day.date} • ${day.entriesCount || 0} entries${day.score != null ? ` • ${day.score}/100` : ''}`)}"
          ></button>
        `).join("");

        calendar.querySelectorAll("[data-calendar-date]").forEach((button) => {
          button.addEventListener("click", async () => {
            dateInput.value = button.getAttribute("data-calendar-date");
            await Promise.all([loadSummary(), loadEntries()]);
          });
        });
      }
    }

    function renderEntries(result) {
        const entries = result.entries || [];

        const totals = entries.reduce((carry, entry) => {
          carry.calories += getNumeric(entry.calories);
          carry.protein += getNumeric(entry.proteinG);
          carry.carbs += getNumeric(entry.carbsG);
          carry.fat += getNumeric(entry.fatG);
          return carry;
        }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

        document.getElementById("stat-calories").textContent = Math.round(totals.calories).toString();
        document.getElementById("stat-protein").textContent = `${Math.round(totals.protein)}g`;
        document.getElementById("stat-carbs").textContent = `${Math.round(totals.carbs)}g`;
        document.getElementById("stat-fat").textContent = `${Math.round(totals.fat)}g`;

        if (!entries.length) {
          list.innerHTML = '<p class="empty-state">No entries yet for this day.</p>';
          return;
        }

        list.innerHTML = entries.map((entry) => {
          const entryImageUrl = entry.imageUrl || entry.parsed?.imageUrl || "";
          return `
          <article class="food-entry-row${entryImageUrl ? " has-photo" : " is-manual"}">
            <div class="food-entry-visual">
              ${entryImageUrl ? `
                <img
                  class="food-entry-thumb"
                  src="${escapeHtml(entryImageUrl)}"
                  alt="${escapeHtml(entry.text || "Uploaded meal")}"
                  loading="lazy"
                >
              ` : `
                <span class="food-entry-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>
                    <path d="M14 3v6h6"/>
                    <path d="M8 13h8"/>
                    <path d="M8 17h6"/>
                  </svg>
                </span>
              `}
            </div>
            <div class="food-entry-main">
              <h3>${escapeHtml(entry.text || "Entry")}</h3>
              <p>${escapeHtml([
                entry.calories != null ? `${Math.round(entry.calories)} cal` : null,
                entry.proteinG != null ? `${Math.round(entry.proteinG)}g protein` : null,
                entry.carbsG != null ? `${Math.round(entry.carbsG)}g carbs` : null,
                entry.fatG != null ? `${Math.round(entry.fatG)}g fat` : null,
              ].filter(Boolean).join(" · ") || "No macro data stored yet.")}</p>
              ${renderEntryScore(entry)}
            </div>
            <div class="food-entry-side">
              <span class="food-entry-time">${escapeHtml(formatEntryTime(entry.createdAt))}</span>
              <div class="feed-actions food-entry-actions">
                <button class="button button-soft" type="button" data-edit-entry="${escapeHtml(entry.id)}">Edit</button>
                <button class="button button-soft" type="button" data-delete-entry="${escapeHtml(entry.id)}">Delete</button>
              </div>
            </div>
          </article>
        `;
        }).join("");

        list.querySelectorAll("[data-delete-entry]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await api(`/api/entries?id=${encodeURIComponent(button.getAttribute("data-delete-entry"))}`, { method: "DELETE" });
              await Promise.all([loadEntries(), loadSummary()]);
            } catch (error) {
              setMessage("entry-message", error.message, "error");
            }
          });
        });

        list.querySelectorAll("[data-edit-entry]").forEach((button) => {
          button.addEventListener("click", async () => {
            const target = entries.find((item) => item.id === button.getAttribute("data-edit-entry"));
            if (!target) return;

            document.getElementById("entry-text").value = target.text || "";
            document.getElementById("entry-calories").value = target.calories ?? "";
            document.getElementById("entry-protein").value = target.proteinG ?? "";
            document.getElementById("entry-carbs").value = target.carbsG ?? "";
            document.getElementById("entry-fat").value = target.fatG ?? "";

            form.dataset.editingId = target.id;
            setMessage("entry-message", "Editing selected entry. Save to update it.", "success");
          });
        });
    }

    async function loadEntries() {
      const cacheName = `log-entries:${dateInput.value}`;
      const cached = readCachedData(cacheScope, cacheName);
      if (cached) {
        renderEntries(cached.data);
        cacheStatus("log-entries-cache-note", list, isOnline() ? "cached" : "offline", cached.savedAt);
      } else {
        list.innerHTML = '<p class="empty-state">Loading entries...</p>';
      }

      try {
        const result = await api(`/api/entries?date=${encodeURIComponent(dateInput.value)}`, { method: "GET" });
        renderEntries(result);
        writeCachedData(cacheScope, cacheName, result);
        cacheStatus("log-entries-cache-note", list, "fresh");
      } catch (error) {
        if (cached) {
          cacheStatus("log-entries-cache-note", list, isOnline() ? "stale" : "offline", cached.savedAt);
        } else {
          list.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
          cacheStatus("log-entries-cache-note", list, "error");
        }
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("entry-message", "");
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.date = dateInput.value;
      payload.time = currentTimeValue();

      ["calories", "proteinG", "carbsG", "fatG"].forEach((key) => {
        if (payload[key] === "") {
          delete payload[key];
        } else if (payload[key] != null) {
          payload[key] = Number(payload[key]);
        }
      });

      try {
        const editingId = form.dataset.editingId || "";
        if (editingId) {
          payload.id = editingId;
        }

        await api("/api/entries", {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
        form.reset();
        delete form.dataset.editingId;
        setMessage("entry-message", editingId ? "Entry updated." : "Entry saved.", "success");
        await Promise.all([loadEntries(), loadSummary()]);
      } catch (error) {
        setMessage("entry-message", error.message, "error");
      }
    });

    estimateButton?.addEventListener("click", async () => {
      const text = (document.getElementById("entry-text")?.value || "").trim();
      if (!text) {
        setMessage("entry-message", "Add a meal description first.", "error");
        return;
      }

      setMessage("entry-message", "Estimating nutrition from your text...", "success");

      try {
        const result = await api("/api/ai/parse", {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        const parsed = result.result || {};
        document.getElementById("entry-calories").value = parsed.calories != null ? Math.round(parsed.calories) : "";
        document.getElementById("entry-protein").value = parsed.proteinG != null ? parsed.proteinG : "";
        document.getElementById("entry-carbs").value = parsed.carbsG != null ? parsed.carbsG : "";
        document.getElementById("entry-fat").value = parsed.fatG != null ? parsed.fatG : "";
        setMessage("entry-message", "Nutrition estimate ready. Review it and save the entry.", "success");
      } catch (error) {
        setMessage("entry-message", error.message, "error");
      }
    });

    function clearMealPhotoPreview() {
      if (mealPhotoPreviewUrl) {
        URL.revokeObjectURL(mealPhotoPreviewUrl);
        mealPhotoPreviewUrl = "";
      }
      if (mealPhotoPreviewImage) {
        mealPhotoPreviewImage.removeAttribute("src");
      }
      mealPhotoPreview?.classList.add("is-hidden");
    }

    mealPhotoInput?.addEventListener("change", () => {
      clearMealPhotoPreview();

      const file = mealPhotoInput.files && mealPhotoInput.files[0] ? mealPhotoInput.files[0] : null;
      if (!file || !file.type.startsWith("image/")) {
        return;
      }

      mealPhotoPreviewUrl = URL.createObjectURL(file);
      if (mealPhotoPreviewImage) {
        mealPhotoPreviewImage.src = mealPhotoPreviewUrl;
      }
      mealPhotoPreview?.classList.remove("is-hidden");
    });

    mealPhotoInput?.addEventListener("click", () => {
      mealPhotoInput.removeAttribute("capture");
    });

    mealCameraButton?.addEventListener("click", () => {
      if (!mealPhotoInput) return;
      mealPhotoInput.setAttribute("capture", "environment");
      mealPhotoInput.click();
    });

    mealPhotoForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("photo-message", "");

      const fileInput = mealPhotoInput || document.getElementById("meal-photo-file");
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        setMessage("photo-message", "Choose an image first.", "error");
        return;
      }

      const data = new FormData();
      data.append("file", fileInput.files[0]);
      data.append("date", dateInput.value);
      data.append("time", currentTimeValue());

      try {
        ensureOnline("You are offline. Reconnect before uploading a meal photo.");
        const response = await fetch(pageUrl("api/meal-photo"), {
          method: "POST",
          credentials: "same-origin",
          headers: app.csrfToken ? { "X-CSRF-Token": app.csrfToken } : {},
          body: data,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "Upload failed");
        }

        mealPhotoForm.reset();
        clearMealPhotoPreview();
        const entry = result.entry || {};
        const hasNutrition = entry.calories != null || entry.proteinG != null || entry.carbsG != null || entry.fatG != null;
        setMessage(
          "photo-message",
          hasNutrition ? "Meal photo uploaded with nutrition estimate." : "Meal photo uploaded, but nutrition could not be estimated.",
          hasNutrition ? "success" : "error"
        );
        await Promise.all([loadEntries(), loadSummary()]);
      } catch (error) {
        setMessage("photo-message", error.message, "error");
      }
    });

    dateInput.addEventListener("change", loadEntries);
    dateInput.addEventListener("change", loadSummary);
    document.querySelector('[aria-label="Previous day"]')?.addEventListener("click", async () => {
      const date = new Date(`${dateInput.value}T12:00:00`);
      date.setDate(date.getDate() - 1);
      dateInput.value = date.toISOString().slice(0, 10);
      await Promise.all([loadEntries(), loadSummary()]);
    });
    document.querySelector('[aria-label="Next day"]')?.addEventListener("click", async () => {
      const date = new Date(`${dateInput.value}T12:00:00`);
      date.setDate(date.getDate() + 1);
      dateInput.value = date.toISOString().slice(0, 10);
      await Promise.all([loadEntries(), loadSummary()]);
    });
    await Promise.all([loadEntries(), loadSummary()]);
  }

  async function initPlans() {
    if (!(await requireAuth())) return;

    const templateSelect = document.getElementById("template-select");
    const plansList = document.getElementById("plans-list");
    const templateAddButton = document.getElementById("template-add-button");
    const customPlanForm = document.getElementById("custom-plan-form");
    const customPlanAiButton = document.getElementById("custom-plan-ai-button");
    const customPlanAiNote = document.getElementById("custom-plan-ai-note");
    const goalEnabled = document.getElementById("plans-goal-enabled");
    const goalRange = document.getElementById("plans-goal-range");
    const goalValue = document.getElementById("plans-goal-value");
    const goalSaveButton = document.getElementById("plans-save-goal");
    const customFields = customPlanForm ? {
      preset: customPlanForm.elements.preset,
      name: customPlanForm.elements.name,
      targetCalories: customPlanForm.elements.targetCalories,
      carbMin: customPlanForm.elements.carbMin,
      carbMax: customPlanForm.elements.carbMax,
      proteinMin: customPlanForm.elements.proteinMin,
      proteinMax: customPlanForm.elements.proteinMax,
      fatMin: customPlanForm.elements.fatMin,
      fatMax: customPlanForm.elements.fatMax,
      goals: customPlanForm.elements.goals,
    } : null;

    if (!templateSelect || !plansList) return;

    function renderGoal(value) {
      if (!goalRange || !goalValue || !goalEnabled) return;
      const hasGoal = value != null && value !== "";
      goalEnabled.checked = hasGoal;
      goalRange.disabled = !hasGoal;
      goalRange.value = hasGoal ? String(value) : "2000";
      goalValue.textContent = hasGoal ? `${goalRange.value} kcal` : "—";
    }

    function syncGoalLabel() {
      if (!goalRange || !goalValue || !goalEnabled) return;
      goalValue.textContent = goalEnabled.checked ? `${goalRange.value} kcal` : "—";
      goalRange.disabled = !goalEnabled.checked;
    }

    function applyPreset(preset) {
      if (!customPlanForm) return;
      if (preset === "muscle-gain") {
        customFields.name.value = "Muscle Gain Builder";
        customFields.carbMin.value = "35";
        customFields.carbMax.value = "45";
        customFields.proteinMin.value = "25";
        customFields.proteinMax.value = "35";
        customFields.fatMin.value = "20";
        customFields.fatMax.value = "30";
        return;
      }
      if (preset === "high-protein-cut") {
        customFields.name.value = "High Protein Cut";
        customFields.carbMin.value = "20";
        customFields.carbMax.value = "30";
        customFields.proteinMin.value = "35";
        customFields.proteinMax.value = "45";
        customFields.fatMin.value = "20";
        customFields.fatMax.value = "30";
        return;
      }
      customFields.name.value = "Balanced Custom";
      customFields.carbMin.value = "30";
      customFields.carbMax.value = "40";
      customFields.proteinMin.value = "25";
      customFields.proteinMax.value = "35";
      customFields.fatMin.value = "20";
      customFields.fatMax.value = "30";
    }

    async function loadTemplates() {
      const result = await api("/api/plan-templates", { method: "GET" });
      const templates = result.templates || [];
      if (!templates.length) {
        templateSelect.innerHTML = '<option value="">No templates available yet</option>';
        templateSelect.disabled = true;
        return;
      }

      templateSelect.disabled = false;
      templateSelect.innerHTML = templates.map((template) => `
        <option value="${escapeHtml(template.slug)}">${escapeHtml(template.name)}${template.category ? ` — ${escapeHtml(template.category)}` : ""}</option>
      `).join("");
    }

    async function loadPlans() {
      const result = await api("/api/plans", { method: "GET" });
      const plans = result.plans || [];
      if (!plans.length) {
        plansList.innerHTML = '<p class="empty-state">No saved plans yet.</p>';
        return;
      }

      plansList.innerHTML = plans.map((plan) => `
        <article class="feed-card">
          <div class="feed-card-header">
            <h3>${escapeHtml(plan.name)}</h3>
            <span class="tag">${escapeHtml(plan.type)}</span>
          </div>
          <div class="feed-card-footer">
            <span class="inline-note">Created ${escapeHtml(formatDateTime(plan.createdAt))}</span>
            <button class="button button-soft" type="button" data-delete-plan="${escapeHtml(plan.id)}">Delete</button>
          </div>
        </article>
      `).join("");

      plansList.querySelectorAll("[data-delete-plan]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await api(`/api/plans?id=${encodeURIComponent(button.getAttribute("data-delete-plan"))}`, { method: "DELETE" });
            await loadPlans();
          } catch (error) {
            setMessage("plan-message", error.message, "error");
          }
        });
      });
    }

    goalEnabled?.addEventListener("change", syncGoalLabel);
    goalRange?.addEventListener("input", syncGoalLabel);
    goalSaveButton?.addEventListener("click", async () => {
      try {
        const payload = {
          dailyCalorieGoal: goalEnabled?.checked ? Number(goalRange?.value || 0) : null,
        };
        await api("/api/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("plans-goal-message", "Daily goal saved.", "success");
      } catch (error) {
        setMessage("plans-goal-message", error.message, "error");
      }
    });

    templateAddButton?.addEventListener("click", async () => {
      const selected = templateSelect.value;
      if (!selected) {
        setMessage("plan-message", "Choose a template first.", "error");
        return;
      }

      try {
        await api("/api/plans", {
          method: "POST",
          body: JSON.stringify({ templateSlug: selected }),
        });
        setMessage("plan-message", "Template plan added.", "success");
        await loadPlans();
      } catch (error) {
        setMessage("plan-message", error.message, "error");
      }
    });

    customFields?.preset.addEventListener("change", (event) => {
      applyPreset(event.target.value);
    });

    customPlanAiButton?.addEventListener("click", async () => {
      if (!customFields) return;
      const goals = customFields.goals.value.trim();
      if (!goals) {
        setMessage("plan-message", "Describe your personal goals first.", "error");
        return;
      }

      setMessage("plan-message", "Building a custom plan suggestion...", "success");
      try {
        const result = await api("/api/plans/suggest", {
          method: "POST",
          body: JSON.stringify({
            goals,
            draft: {
              preset: customFields.preset.value,
              name: customFields.name.value.trim(),
              targetCalories: customFields.targetCalories ? Number(customFields.targetCalories.value || 0) : null,
              carbMin: Number(customFields.carbMin.value || 0),
              carbMax: Number(customFields.carbMax.value || 0),
              proteinMin: Number(customFields.proteinMin.value || 0),
              proteinMax: Number(customFields.proteinMax.value || 0),
              fatMin: Number(customFields.fatMin.value || 0),
              fatMax: Number(customFields.fatMax.value || 0),
            },
          }),
        });
        const suggestion = result.suggestion || {};
        customFields.preset.value = "balanced-custom";
        customFields.name.value = suggestion.name || "Custom Plan";
        customFields.targetCalories.value = suggestion.targetCalories || customFields.targetCalories.value;
        customFields.carbMin.value = suggestion.carbMin ?? customFields.carbMin.value;
        customFields.carbMax.value = suggestion.carbMax ?? customFields.carbMax.value;
        customFields.proteinMin.value = suggestion.proteinMin ?? customFields.proteinMin.value;
        customFields.proteinMax.value = suggestion.proteinMax ?? customFields.proteinMax.value;
        customFields.fatMin.value = suggestion.fatMin ?? customFields.fatMin.value;
        customFields.fatMax.value = suggestion.fatMax ?? customFields.fatMax.value;
        if (customPlanAiNote) {
          customPlanAiNote.textContent = suggestion.rationale || "AI suggestion applied. Review before adding.";
        }
        setMessage("plan-message", result.source === "ai" ? "AI suggestion applied. Review and add when ready." : "Suggestion applied. Review and add when ready.", "success");
      } catch (error) {
        setMessage("plan-message", error.message, "error");
      }
    });

    customPlanForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("plan-message", "");

      const carbMin = Number(customFields.carbMin.value) / 100;
      const carbMax = Number(customFields.carbMax.value) / 100;
      const proteinMin = Number(customFields.proteinMin.value) / 100;
      const proteinMax = Number(customFields.proteinMax.value) / 100;
      const fatMin = Number(customFields.fatMin.value) / 100;
      const fatMax = Number(customFields.fatMax.value) / 100;

      const config = {
        templateSlug: customFields.preset.value,
        targetCalories: customFields.targetCalories ? Number(customFields.targetCalories.value || 0) : null,
        personalGoals: customFields.goals.value.trim() || null,
        rationale: customPlanAiNote?.textContent || null,
        scoringProfile: {
          slug: customFields.preset.value,
          label: customFields.name.value.trim() || "Custom",
          carbs: { min: carbMin, max: carbMax },
          protein: { min: proteinMin, max: proteinMax },
          fat: { min: fatMin, max: fatMax },
          penaltyDivisor: 0.27,
        },
      };

      try {
        await api("/api/plans", {
          method: "POST",
          body: JSON.stringify({
            name: customFields.name.value.trim() || "Custom Plan",
            type: "CUSTOM",
            config,
          }),
        });
        setMessage("plan-message", "Custom scored plan added.", "success");
        await loadPlans();
      } catch (error) {
        setMessage("plan-message", error.message, "error");
      }
    });

    applyPreset(customFields?.preset?.value || "muscle-gain");

    try {
      const result = await api("/api/me", { method: "GET" });
      renderGoal(result.user?.dailyCalorieGoal ?? null);
    } catch (error) {
      renderGoal(null);
    }

    await Promise.all([loadTemplates(), loadPlans()]);
  }

  async function initAccount() {
    let currentUser = await requireAuth();
    if (!currentUser) return;

    const form = document.getElementById("account-form");
    const summary = document.getElementById("account-summary");
    const logoutButton = document.getElementById("logout-button");
    const avatarUploadButton = document.getElementById("avatar-upload-button");
    const exportJsonButton = document.getElementById("account-export-json-button");
    const exportCsvButton = document.getElementById("account-export-csv-button");
    const importJsonButton = document.getElementById("account-import-json-button");
    const importJsonFile = document.getElementById("account-import-json-file");
    const clearCacheButton = document.getElementById("account-clear-cache-button");
    const resetLinkButton = document.getElementById("account-reset-link-button");
    const healthConnectButton = document.getElementById("account-connect-health");
    const deleteButton = document.getElementById("account-delete-button");
    const displayName = document.getElementById("account-display-name");
    const emailLabel = document.getElementById("account-email-label");
    const avatarPreview = document.getElementById("account-avatar-preview");
    const goalEnabled = document.getElementById("account-goal-enabled");

    if (!form || !summary) return;

    function fillForm(nextUser) {
      currentUser = { ...currentUser, ...nextUser };
      form.firstName.value = nextUser.firstName || "";
      form.lastName.value = nextUser.lastName || "";
      form.username.value = nextUser.username || "";
      form.dailyCalorieGoal.value = nextUser.dailyCalorieGoal || "";
      form.theme.value = nextUser.theme || "dark";
      form.units.value = nextUser.units || "metric";
      form.healthAppProvider.value = nextUser.healthAppProvider || "";
      form.healthAppConnected.checked = !!nextUser.healthAppConnected;
      if (goalEnabled) {
        goalEnabled.checked = nextUser.dailyCalorieGoal != null && nextUser.dailyCalorieGoal !== "";
      }
      const name = nextUser.displayName || `${nextUser.firstName || ""} ${nextUser.lastName || ""}`.trim() || "Your profile";
      if (displayName) displayName.textContent = name;
      if (emailLabel) emailLabel.textContent = nextUser.username ? `@${nextUser.username}` : "@you";
      renderAvatar(avatarPreview, nextUser);
      renderSummary(nextUser);
    }

    function renderSummary(nextUser) {
      const calories = Number(nextUser.allTimeCalories || 0);
      const score = nextUser.avgPlanAlignment != null ? Number(nextUser.avgPlanAlignment) : null;
      const calorieText = `${Math.round(calories).toLocaleString()} kcal`;
      const scoreText = score != null && Number.isFinite(score) ? `${score}/100` : "—";
      const scoreClass = scoreTone(score);

      summary.innerHTML = `
        <dl class="account-overview-grid">
          <div><dt>Logged entries</dt><dd>${escapeHtml(nextUser.entryCount != null ? String(nextUser.entryCount) : "—")}</dd></div>
          <div><dt>Active plan</dt><dd>${escapeHtml(nextUser.activePlanName || (nextUser.planCount ? `${nextUser.planCount} active` : "No plan"))}</dd></div>
          <div><dt>Saved meals</dt><dd>${escapeHtml(nextUser.savedMealCount != null ? String(nextUser.savedMealCount) : "—")}</dd></div>
          <div><dt>Logged days</dt><dd>${escapeHtml(`${nextUser.loggedDays || 0} day${Number(nextUser.loggedDays || 0) === 1 ? "" : "s"}`)}</dd></div>
          <div class="account-overview-metric is-empty"><dt>Total calories</dt><dd>${escapeHtml(calorieText)}</dd></div>
          <div class="account-overview-metric is-${escapeHtml(scoreClass)}"><dt>Plan alignment</dt><dd>${escapeHtml(scoreText)}</dd></div>
        </dl>
      `;
    }

    fillForm(currentUser);

    async function refreshSummary() {
      try {
        const accountResult = await api("/api/account/summary", { method: "GET" });
        const counts = accountResult.summary || {};
        renderSummary({ ...currentUser, ...counts });
      } catch (error) {
        summary.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("account-message", "");

      const payload = {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        username: form.username.value.trim(),
        dailyCalorieGoal: goalEnabled && !goalEnabled.checked ? null : (form.dailyCalorieGoal.value === "" ? null : Number(form.dailyCalorieGoal.value)),
        theme: form.theme.value,
        units: form.units.value,
        healthAppProvider: form.healthAppProvider.value.trim(),
        healthAppConnected: form.healthAppConnected.checked,
      };

      try {
        const result = await api("/api/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        fillForm(result.user || payload);
        setMessage("account-message", "Account updated.", "success");
      } catch (error) {
        setMessage("account-message", error.message, "error");
      }
    });

    async function uploadAvatar(file) {
      if (!file) return;
      const data = new FormData();
      data.append("file", file);

      try {
        ensureOnline("You are offline. Reconnect before uploading a photo.");
        if (avatarUploadButton) avatarUploadButton.disabled = true;
        setMessage("account-message", "Uploading photo...", "success");
        const response = await fetch(pageUrl("api/account/avatar"), {
          method: "POST",
          credentials: "same-origin",
          headers: app.csrfToken ? { "X-CSRF-Token": app.csrfToken } : {},
          body: data,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "Avatar upload failed");
        }
        currentUser = { ...currentUser, avatarUrl: result.avatarUrl || currentUser.avatarUrl };
        renderAvatar(avatarPreview, currentUser);
        setMessage("account-message", "Avatar uploaded.", "success");
        await refreshSummary();
      } catch (error) {
        setMessage("account-message", error.message, "error");
      } finally {
        if (avatarUploadButton) avatarUploadButton.disabled = false;
      }
    }

    avatarUploadButton?.addEventListener("click", () => {
      const fileInput = document.getElementById("account-avatar-file");
      if (!fileInput) return;
      fileInput.value = "";
      fileInput.click();
    });

    document.getElementById("account-avatar-file")?.addEventListener("change", (event) => {
      const file = event.target?.files?.[0];
      uploadAvatar(file);
    });

    exportJsonButton?.addEventListener("click", () => {
      window.location.href = pageUrl("api/account/export");
    });

    exportCsvButton?.addEventListener("click", () => {
      window.location.href = pageUrl("api/account/export/food-log");
    });

    async function importAccountBackup(file) {
      if (!file) return;
      const confirmed = window.confirm("Importing this backup will replace your current plans, food entries, saved meals, and preferences. Continue?");
      if (!confirmed) return;

      const data = new FormData();
      data.append("file", file);

      try {
        ensureOnline("You are offline. Reconnect before importing a backup.");
        if (importJsonButton) importJsonButton.disabled = true;
        setMessage("account-message", "Importing backup...", "success");
        const response = await fetch(pageUrl("api/account/import"), {
          method: "POST",
          credentials: "same-origin",
          headers: app.csrfToken ? { "X-CSRF-Token": app.csrfToken } : {},
          body: data,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "Import failed");
        }
        const counts = result.counts || {};
        setMessage("account-message", `Import complete: ${counts.entries || 0} entries, ${counts.plans || 0} plans, ${counts.savedMeals || 0} saved meals.`, "success");
        const profile = await api("/api/me", { method: "GET" });
        fillForm(profile.user || currentUser);
        await refreshSummary();
      } catch (error) {
        setMessage("account-message", error.message, "error");
      } finally {
        if (importJsonButton) importJsonButton.disabled = false;
      }
    }

    importJsonButton?.addEventListener("click", () => {
      if (!importJsonFile) return;
      importJsonFile.value = "";
      importJsonFile.click();
    });

    importJsonFile?.addEventListener("change", (event) => {
      importAccountBackup(event.target?.files?.[0]);
    });

    clearCacheButton?.addEventListener("click", () => {
      clearLocalDataCache(userCacheScope(currentUser));
      setMessage("account-message", "Local cache cleared on this device.", "success");
    });

    resetLinkButton?.addEventListener("click", async () => {
      const email = form.username.value.trim();
      if (!email) {
        setMessage("account-message", "Add an email address first.", "error");
        return;
      }

      try {
        const result = await api("/api/password/request", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        let message = result.resetLink ? "Reset link ready." : (result.message || "If that email exists, a reset link has been sent.");
        if (result.resetLink) {
          const panel = document.getElementById("account-reset-link-panel");
          const text = document.getElementById("account-reset-link-text");
          if (panel && text) {
            text.innerHTML = `<a href="${escapeHtml(result.resetLink)}">${escapeHtml(result.resetLink)}</a>`;
            panel.classList.remove("is-hidden");
          }
        }
        setMessage("account-message", message, "success");
      } catch (error) {
        setMessage("account-message", error.message, "error");
      }
    });

    healthConnectButton?.addEventListener("click", () => {
      form.healthAppConnected.checked = !form.healthAppConnected.checked;
      form.healthAppProvider.value = form.healthAppConnected.checked ? "Phone health app" : "";
      setMessage("account-message", form.healthAppConnected.checked ? "Health app marked connected. Save settings to keep it." : "Health app marked disconnected. Save settings to keep it.", "success");
    });

    deleteButton?.addEventListener("click", async () => {
      const confirmed = window.confirm("This permanently deletes your account and all saved Taverai data. Continue?");
      if (!confirmed) return;

      try {
        await api("/api/account", { method: "DELETE" });
        clearLastUser();
        window.location.href = pageUrl("signup");
      } catch (error) {
        setMessage("account-message", error.message, "error");
      }
    });

    logoutButton?.addEventListener("click", async () => {
      try {
        await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
        clearLastUser();
        window.location.href = pageUrl("login");
      } catch (error) {
        setMessage("account-message", error.message, "error");
      }
    });

    await refreshSummary();
  }

  async function initCoach() {
    const currentUser = await requireAuth();
    if (!currentUser) return;
    const cacheScope = userCacheScope(currentUser);

    const form = document.getElementById("coach-form");
    const answer = document.getElementById("coach-answer");
    const rangeControls = document.getElementById("coach-range-controls");
    const breakdownDays = document.getElementById("coach-breakdown-days");
    let activeRange = "weekly";
    if (!form || !answer) return;

    async function loadCoachSummary() {
      const days = breakdownDays?.value || "3";
      const cacheName = `coach-summary:${activeRange}:${days}`;
      const insights = document.getElementById("coach-trend-insights");
      const cached = readCachedData(cacheScope, cacheName);
      if (cached) {
        renderCoachSummary(cached.data);
        cacheStatus("coach-cache-note", insights, isOnline() ? "cached" : "offline", cached.savedAt);
      }

      try {
        const result = await api(`/api/coach/summary?range=${encodeURIComponent(activeRange)}&breakdownDays=${encodeURIComponent(days)}`, { method: "GET" });
        renderCoachSummary(result);
        writeCachedData(cacheScope, cacheName, result);
        cacheStatus("coach-cache-note", insights, "fresh");
      } catch (error) {
        if (cached) {
          cacheStatus("coach-cache-note", insights, isOnline() ? "stale" : "offline", cached.savedAt);
        } else if (insights) {
          insights.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
          cacheStatus("coach-cache-note", insights, "error");
        }
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("coach-message", "");
      answer.innerHTML = '<p class="empty-state">Thinking...</p>';
      answer.classList.remove("is-hidden");

      const payload = {
        question: form.question.value.trim(),
        horizonDays: Number(form.horizonDays.value || 30),
      };

      try {
        const result = await api("/api/coach", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        answer.classList.remove("is-hidden");
        answer.textContent = result.answer || "No answer returned.";
        setMessage("coach-message", "Coach response ready.", "success");
      } catch (error) {
        answer.classList.remove("is-hidden");
        answer.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
        setMessage("coach-message", error.message, "error");
      }
    });

    rangeControls?.querySelectorAll("[data-coach-range]").forEach((button) => {
      button.addEventListener("click", async () => {
        activeRange = button.getAttribute("data-coach-range") || "weekly";
        rangeControls.querySelectorAll("[data-coach-range]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        await loadCoachSummary();
      });
    });

    breakdownDays?.addEventListener("change", loadCoachSummary);

    await loadCoachSummary();
  }

  function renderCoachSummary(result) {
    const series = Array.isArray(result.series) ? result.series : [];
    const calorieSummary = document.getElementById("coach-calorie-summary");
    const scoreSummary = document.getElementById("coach-score-summary");
    const insights = document.getElementById("coach-trend-insights");
    const macroInsights = document.getElementById("coach-macro-insights");
    const trendSource = document.getElementById("coach-trend-source");
    const macroSource = document.getElementById("coach-macro-source");
    const emptyTip = document.getElementById("coach-empty-tip");
    const hasEntries = series.some((day) => Number(day.entries || 0) > 0);

    if (calorieSummary) {
      calorieSummary.textContent = result.goal
        ? `${result.averages?.calories || 0} avg / ${result.goal} goal`
        : `${result.averages?.calories || 0} avg kcal`;
    }
    if (scoreSummary) scoreSummary.textContent = result.averages?.score != null ? `${result.averages.score}/100` : "—/100";
    if (insights) {
      const items = Array.isArray(result.insights) && result.insights.length
        ? result.insights
        : ["Keep logging meals to build a clearer trend."];
      insights.innerHTML = items.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    }
    if (macroInsights) {
      const items = Array.isArray(result.macroInsights) && result.macroInsights.length
        ? result.macroInsights
        : ["Log a few meals with macros to build better macro nutrient context."];
      macroInsights.innerHTML = items.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    }
    renderAiSourceBadge(trendSource, result.debug?.trendInsights);
    renderAiSourceBadge(macroSource, result.debug?.macroInsights);
    emptyTip?.classList.toggle("is-hidden", hasEntries);

    const calorieTones = series.map((day) => result.goal ? calorieProgressTone(pctOf(day.calories || 0, result.goal), true) : "empty");
    const scoreTones = series.map((day) => scoreTone(day.score));
    renderTrendChart("coach-calorie-chart", series.map((day) => day.calories || null), "calories", calorieTones);
    renderTrendChart("coach-score-chart", series.map((day) => day.score), "score", scoreTones);
    renderTrendLabels("coach-calorie-labels", series);
    renderTrendLabels("coach-score-labels", series);
    renderCoachBreakdown(result.breakdown || [], result.targets || {});
  }

  function renderAiSourceBadge(el, source) {
    if (!el) return;
    const value = ["ai", "fallback", "empty"].includes(source) ? source : "unknown";
    const labels = {
      ai: "AI live",
      fallback: "Fallback",
      empty: "No data",
      unknown: "Unknown",
    };
    el.textContent = labels[value];
    el.classList.remove("is-ai", "is-fallback", "is-empty", "is-unknown");
    el.classList.add(`is-${value}`);
  }

  function renderTrendChart(id, values, kind, tones = []) {
    const el = document.getElementById(id);
    if (!el) return;
    const clean = values.map((value) => Number.isFinite(Number(value)) ? Number(value) : null);
    const numeric = clean.filter((value) => value != null);
    if (!numeric.length) {
      el.innerHTML = '<p class="empty-state">No chart data yet.</p>';
      return;
    }

    const width = 320;
    const height = 160;
    const pad = 14;
    const max = kind === "score" ? 100 : Math.max(...numeric, 100);
    const min = 0;
    const step = clean.length > 1 ? (width - pad * 2) / (clean.length - 1) : 0;
    const points = clean.map((value, index) => {
      if (value == null) return null;
      const x = pad + (index * step);
      const y = height - pad - ((value - min) / Math.max(1, max - min)) * (height - pad * 2);
      return { x, y, value, tone: tones[index] || "empty" };
    });
    const line = points.filter(Boolean).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = line ? `${pad},${height - pad} ${line} ${width - pad},${height - pad}` : "";
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      if (!point || !previous) return "";
      return `<line class="trend-segment is-${escapeHtml(point.tone)}" x1="${previous.x.toFixed(1)}" y1="${previous.y.toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}"></line>`;
    }).join("");
    const circles = points.filter(Boolean).map((point) => `<circle class="trend-point is-${escapeHtml(point.tone)}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${escapeHtml(String(point.value))}</title></circle>`).join("");

    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(kind)} trend">
        <line class="trend-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
        ${area ? `<polygon class="trend-area" points="${area}"></polygon>` : ""}
        ${segments || (line ? `<polyline class="trend-segment is-empty" points="${line}"></polyline>` : "")}
        ${circles}
      </svg>
    `;
  }

  function renderTrendLabels(id, series) {
    const el = document.getElementById(id);
    if (!el) return;
    const step = series.length > 14 ? Math.ceil(series.length / 7) : 1;
    el.style.gridTemplateColumns = `repeat(${Math.ceil(series.length / step)}, minmax(0, 1fr))`;
    el.innerHTML = series.filter((_, index) => index % step === 0).map((day) => `<span>${escapeHtml(day.label || "")}</span>`).join("");
  }

  function breakdownLimitTone(value, target) {
    if (!target || !Number.isFinite(Number(value))) return "empty";
    return calorieProgressTone(pctOf(value, target), true);
  }

  function formatBreakdownValue(value, unit = "") {
    if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
    return `${Math.round(Number(value))}${unit}`;
  }

  function formatBreakdownTarget(target, unit = "") {
    if (!target || !Number.isFinite(Number(target))) return "—";
    return `${Math.round(Number(target))}${unit}`;
  }

  function breakdownMetricTile(day, targets, key, label, cssClass, unit = "") {
    const target = targets?.[key] || {};
    const actual = day?.[key];
    const limit = target.planMax || target.userSet || null;
    const tone = breakdownLimitTone(actual, limit);
    const userSet = target.userSet ? `Goal ${formatBreakdownTarget(target.userSet, unit)}` : "";
    const planMax = target.planMax
      ? `Plan max ${formatBreakdownTarget(target.planMax, unit)}`
      : (target.targetPct ? `Plan max ${formatBreakdownTarget(target.targetPct, "%")}` : "");
    const targetText = [userSet, planMax].filter((item, index, items) => item && items.indexOf(item) === index).join(" / ") || "Target —";

    return `<span class="legend ${cssClass} is-${tone}"><span class="metric-main">${escapeHtml(label)}: <strong>${escapeHtml(formatBreakdownValue(actual, unit))}</strong></span><em>${escapeHtml(targetText)}</em></span>`;
  }

  function renderCoachBreakdown(days, targets = {}) {
    const list = document.getElementById("coach-breakdown-list");
    if (!list) return;
    if (!Array.isArray(days) || !days.length) {
      list.innerHTML = '<p class="empty-state">No logged meals in this window yet.</p>';
      return;
    }

    list.innerHTML = days.map((day) => `
      <article class="breakdown-day">
        <strong>${escapeHtml(friendlyDateLabel(day.date))}</strong>
        <div class="breakdown-grid">
          ${breakdownMetricTile(day, targets, "calories", "Calories", "calorie", " kcal")}
          ${breakdownMetricTile(day, targets, "proteinG", "Protein", "protein", "g")}
          ${breakdownMetricTile(day, targets, "carbsG", "Carbs", "carbs", "g")}
          ${breakdownMetricTile(day, targets, "fatG", "Fat", "fat", "g")}
          <span class="legend fruit is-${breakdownLimitTone(day.fruit, targets.fruit?.planMax)}"><span class="metric-main">Fruit: <strong>${escapeHtml(day.fruit ?? 0)}</strong></span><em>Plan max ${escapeHtml(formatBreakdownTarget(targets.fruit?.planMax, " serv"))}</em></span>
          <span class="legend grain is-${breakdownLimitTone(day.grains, targets.grains?.planMax)}"><span class="metric-main">Grains: <strong>${escapeHtml(day.grains ?? 0)}</strong></span><em>Plan max ${escapeHtml(formatBreakdownTarget(targets.grains?.planMax, " serv"))}</em></span>
          <span class="legend veg is-${breakdownLimitTone(day.vegetables, targets.vegetables?.planMax)}"><span class="metric-main">Vegetables: <strong>${escapeHtml(day.vegetables ?? 0)}</strong></span><em>Plan max ${escapeHtml(formatBreakdownTarget(targets.vegetables?.planMax, " serv"))}</em></span>
          <span class="legend sugar is-${breakdownLimitTone(day.sugarG, targets.sugarG?.planMax)}"><span class="metric-main">Sugar: <strong>${escapeHtml(formatBreakdownValue(day.sugarG, "g"))}</strong></span><em>Plan max ${escapeHtml(formatBreakdownTarget(targets.sugarG?.planMax, "g"))}</em></span>
        </div>
        <p class="inline-note compact-note">${day.entries ? `${escapeHtml(day.entries)} logged meal${Number(day.entries) === 1 ? "" : "s"}` : "No logged meals"}</p>
      </article>
    `).join("");
  }

  function mealPlanIngredientList(ingredients) {
    if (!Array.isArray(ingredients) || !ingredients.length) {
      return '<p class="inline-note">No ingredients returned.</p>';
    }

    return `<ul>${ingredients.map((ingredient) => `
      <li>${escapeHtml(typeof ingredient === "string" ? ingredient : [ingredient.amount, ingredient.item].filter(Boolean).join(" "))}</li>
    `).join("")}</ul>`;
  }

  function mealPlanInstructionList(instructions) {
    if (!Array.isArray(instructions) || !instructions.length) {
      return '<p class="inline-note">No instructions returned.</p>';
    }

    return `<ol>${instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
  }

  async function initMenu() {
    const currentUser = await requireAuth();
    if (!currentUser) return;
    const cacheScope = userCacheScope(currentUser);

    const compareForm = document.getElementById("menu-compare-form");
    const compareResults = document.getElementById("menu-compare-results");
    const restaurantContextInput = document.getElementById("menu-context");
    const plannerForm = document.getElementById("meal-plan-form");
    const plannerResults = document.getElementById("meal-plan-results");
    const plannerStatus = document.getElementById("meal-plan-status");
    const barcodeForm = document.getElementById("barcode-form");
    const barcodeResults = document.getElementById("barcode-results");
    const barcodePhotoInput = document.getElementById("barcode-photo-file");
    const barcodeUploadButton = document.getElementById("barcode-upload-button");
    const barcodeCameraButton = document.getElementById("barcode-camera-button");
    const savedMealsSummary = document.getElementById("saved-meals-summary");
    const compareModeButtons = document.querySelectorAll("[data-compare-mode]");
    const compareTextFields = document.getElementById("compare-text-fields");
    const compareImageFields = document.getElementById("compare-image-fields");
    const optionAImageInput = document.getElementById("menu-option-a-image");
    const optionBImageInput = document.getElementById("menu-option-b-image");
    const optionAPreview = document.getElementById("menu-option-a-preview");
    const optionBPreview = document.getElementById("menu-option-b-preview");
    const optionAEmpty = document.getElementById("menu-option-a-empty");
    const optionBEmpty = document.getElementById("menu-option-b-empty");
    const optionAScanText = document.getElementById("menu-option-a-scan");
    const optionBScanText = document.getElementById("menu-option-b-scan");
    let compareMode = "text";
    let optionAScan = null;
    let optionBScan = null;
    const restaurantOptions = [
      "Applebee's", "Arby's", "Auntie Anne's", "Baskin-Robbins", "Blaze Pizza",
      "Buffalo Wild Wings", "Burger King", "Cava", "Chick-fil-A", "Chili's",
      "Chipotle", "Cinnabon", "Cold Stone Creamery", "Culver's", "Dairy Queen",
      "Del Taco", "Denny's", "Domino's", "Dunkin'", "El Pollo Loco",
      "Five Guys", "IHOP", "In-N-Out Burger", "Jersey Mike's", "Jimmy John's",
      "KFC", "Little Caesars", "McDonald's", "MOD Pizza", "Noodles & Company",
      "Olive Garden", "Outback Steakhouse", "Panda Express", "Panera Bread",
      "Papa Johns", "Peet's Coffee", "P.F. Chang's", "Pizza Hut", "Popeyes",
      "Qdoba", "Red Lobster", "Red Robin", "Shake Shack", "Smoothie King",
      "Sonic Drive-In", "Starbucks", "Subway", "Sweetgreen", "Taco Bell",
      "Texas Roadhouse", "The Cheesecake Factory", "Tropical Smoothie Cafe",
      "Wendy's", "Whataburger", "Wingstop", "Yard House",
    ];

    function renderPlannerStatus(plan, user) {
      if (!plannerStatus) return;
      const planName = plan?.name || "No active plan";
      const goal = user?.dailyCalorieGoal != null ? `${Math.round(Number(user.dailyCalorieGoal))} kcal` : "— kcal";
      plannerStatus.innerHTML = `Plan: <strong>${escapeHtml(planName)}</strong> &bull; Goal: <strong>${escapeHtml(goal)}</strong>`;
    }

    async function refreshPlannerStatus() {
      const cacheName = "menu-planner-status";
      const cached = readCachedData(cacheScope, cacheName);
      if (cached) {
        renderPlannerStatus(cached.data.plan, cached.data.user || currentUser);
        cacheStatus("menu-planner-cache-note", plannerStatus, isOnline() ? "cached" : "offline", cached.savedAt);
      } else {
        renderPlannerStatus(null, currentUser);
      }

      try {
        const result = await api("/api/plans", { method: "GET" });
        const plans = Array.isArray(result.plans) ? result.plans : [];
        const data = { plan: plans.length ? plans[plans.length - 1] : null, user: currentUser };
        renderPlannerStatus(data.plan, data.user);
        writeCachedData(cacheScope, cacheName, data);
        cacheStatus("menu-planner-cache-note", plannerStatus, "fresh");
      } catch (error) {
        if (cached) {
          cacheStatus("menu-planner-cache-note", plannerStatus, isOnline() ? "stale" : "offline", cached.savedAt);
        } else {
          renderPlannerStatus(null, currentUser);
          cacheStatus("menu-planner-cache-note", plannerStatus, "error");
        }
      }
    }

    function setCompareMode(nextMode) {
      compareMode = nextMode === "image" ? "image" : "text";
      compareTextFields?.classList.toggle("is-hidden", compareMode !== "text");
      compareImageFields?.classList.toggle("is-hidden", compareMode !== "image");
      compareModeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-compare-mode") === compareMode);
      });
    }

    async function scanMealImage(file) {
      ensureOnline("You are offline. Reconnect before scanning an image.");
      const data = new FormData();
      data.append("image", file);
      const response = await fetch(pageUrl("api/meal/scan"), {
        method: "POST",
        credentials: "same-origin",
        headers: app.csrfToken ? { "X-CSRF-Token": app.csrfToken } : {},
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Meal scan failed");
      }
      return result.result || null;
    }

    function bindImageInput(input, preview, emptyState, statusText, assignScan) {
      input?.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        assignScan(null);
        if (!file) {
          preview?.classList.add("is-hidden");
          emptyState?.classList.remove("is-hidden");
          if (statusText) statusText.textContent = "No scan yet.";
          return;
        }

        const objectUrl = URL.createObjectURL(file);
        if (preview) {
          preview.src = objectUrl;
          preview.classList.remove("is-hidden");
        }
        emptyState?.classList.add("is-hidden");
        if (statusText) statusText.textContent = "Scanning image...";

        try {
          const scan = await scanMealImage(file);
          assignScan(scan);
          if (statusText) {
            statusText.textContent = scan && scan.title
              ? `${scan.title}${scan.calories != null ? ` • ${Math.round(scan.calories)} cal` : ""}`
              : "Scan ready.";
          }
        } catch (error) {
          if (statusText) statusText.textContent = error.message;
          setMessage("menu-compare-message", error.message, "error");
        }
      });
    }

    bindImageInput(optionAImageInput, optionAPreview, optionAEmpty, optionAScanText, (scan) => { optionAScan = scan; });
    bindImageInput(optionBImageInput, optionBPreview, optionBEmpty, optionBScanText, (scan) => { optionBScan = scan; });
    compareModeButtons.forEach((button) => {
      button.addEventListener("click", () => setCompareMode(button.getAttribute("data-compare-mode")));
    });

    restaurantContextInput?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement) || event.inputType?.startsWith("delete")) return;

      const typed = input.value;
      if (typed.length < 2 || input.selectionStart !== typed.length || input.selectionEnd !== typed.length) return;

      const match = restaurantOptions.find((name) => name.toLowerCase().startsWith(typed.toLowerCase()));
      if (!match || match.toLowerCase() === typed.toLowerCase()) return;

      input.value = match;
      input.setSelectionRange(typed.length, match.length);
    });

    setCompareMode("text");
    await refreshPlannerStatus();

    async function loadSavedMeals() {
      if (!savedMealsSummary) return;
      const cacheName = "menu-saved-meals-summary";
      const cached = readCachedData(cacheScope, cacheName);
      if (cached) {
        const meals = Array.isArray(cached.data.meals) ? cached.data.meals : [];
        savedMealsSummary.textContent = meals.length
          ? `${meals.length} favorite meal${meals.length === 1 ? "" : "s"} saved.`
          : "No saved meals yet. Save any planned meal to build your archive.";
        cacheStatus("menu-saved-cache-note", savedMealsSummary, isOnline() ? "cached" : "offline", cached.savedAt);
      } else {
        savedMealsSummary.textContent = "Checking saved meals...";
      }

      try {
        const result = await api("/api/menu/favorites", { method: "GET" });
        const meals = result.meals || [];
        savedMealsSummary.textContent = meals.length
          ? `${meals.length} favorite meal${meals.length === 1 ? "" : "s"} saved.`
          : "No saved meals yet. Save any planned meal to build your archive.";
        writeCachedData(cacheScope, cacheName, { meals });
        cacheStatus("menu-saved-cache-note", savedMealsSummary, "fresh");
      } catch (error) {
        if (cached) {
          cacheStatus("menu-saved-cache-note", savedMealsSummary, isOnline() ? "stale" : "offline", cached.savedAt);
        } else {
          savedMealsSummary.textContent = error.message;
          cacheStatus("menu-saved-cache-note", savedMealsSummary, "error");
        }
      }
    }

    compareForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("menu-compare-message", "");
      compareResults.innerHTML = '<p class="empty-state">Comparing options...</p>';

      try {
        const context = compareForm.context.value.trim();
        let payload;

        if (compareMode === "image") {
          const scans = [];
          const labels = [];

          if (optionAImageInput?.files?.[0]) {
            optionAScan = optionAScan || await scanMealImage(optionAImageInput.files[0]);
            if (optionAScan) {
              scans.push(optionAScan);
              labels.push([context, optionAScan.title || "Meal A"].filter(Boolean).join(" — "));
            }
          }

          if (optionBImageInput?.files?.[0]) {
            optionBScan = optionBScan || await scanMealImage(optionBImageInput.files[0]);
            if (optionBScan) {
              scans.push(optionBScan);
              labels.push([context, optionBScan.title || "Meal B"].filter(Boolean).join(" — "));
            }
          }

          if (!scans.length) {
            throw new Error("Upload at least one image before analyzing.");
          }

          payload = {
            context,
            options: labels,
            providedNutrition: scans,
          };
        } else {
          payload = {
            context,
            options: [compareForm.optionA.value.trim(), compareForm.optionB.value.trim()].filter(Boolean),
          };
        }

        const result = await api("/api/menu/analyze", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const ranked = result.ranked || [];
        compareResults.innerHTML = ranked.map((option, index) => `
          <article class="feed-card">
            <div class="feed-card-header">
              <h3>${index === 0 ? "Best fit" : "Option"}: ${escapeHtml(option.name)}</h3>
              <span class="tag">${escapeHtml(String(option.fitScore))}/100</span>
            </div>
            <p>${escapeHtml([
              option.calories != null ? `${Math.round(option.calories)} cal` : null,
              option.proteinG != null ? `${Math.round(option.proteinG)}g protein` : null,
              option.carbsG != null ? `${Math.round(option.carbsG)}g carbs` : null,
              option.fatG != null ? `${Math.round(option.fatG)}g fat` : null,
            ].filter(Boolean).join(" • ") || "Estimated with limited nutrition detail.")}</p>
            <p>${escapeHtml((option.reasons || []).join(" • ") || option.summary || "")}</p>
            ${option.assumptions?.length ? `<p class="inline-note">Matched from "${escapeHtml(option.inputText || option.name)}"${option.restaurant ? ` at ${escapeHtml(option.restaurant)}` : ""}: ${escapeHtml(option.assumptions.join(" • "))}</p>` : ""}
            ${option.confidence != null ? `<p class="inline-note">Menu match confidence: ${escapeHtml(String(Math.round(Number(option.confidence) * 100)))}%</p>` : ""}
            <div class="feed-card-footer">
              <button class="button button-soft" type="button" data-log-option="${escapeHtml(option.name)}"
                data-calories="${escapeHtml(option.calories ?? "")}"
                data-protein="${escapeHtml(option.proteinG ?? "")}"
                data-carbs="${escapeHtml(option.carbsG ?? "")}"
                data-fat="${escapeHtml(option.fatG ?? "")}">Log option</button>
            </div>
          </article>
        `).join("");

        compareResults.querySelectorAll("[data-log-option]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await api("/api/entries", {
                method: "POST",
                body: JSON.stringify({
                  text: button.getAttribute("data-log-option"),
                  calories: button.getAttribute("data-calories") || null,
                  proteinG: button.getAttribute("data-protein") || null,
                  carbsG: button.getAttribute("data-carbs") || null,
                  fatG: button.getAttribute("data-fat") || null,
                }),
              });
              setMessage("menu-compare-message", "Option logged to your entries.", "success");
            } catch (error) {
              setMessage("menu-compare-message", error.message, "error");
            }
          });
        });
      } catch (error) {
        compareResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
        setMessage("menu-compare-message", error.message, "error");
      }
    });

    plannerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("meal-plan-message", "");
      plannerResults.innerHTML = '<p class="empty-state">Planning meals...</p>';

      const payload = {
        prompt: plannerForm.prompt.value.trim(),
        days: Number(plannerForm.days.value || 3),
        mealTypes: [plannerForm.mealTypes.value].filter(Boolean),
      };

      try {
        const result = await api("/api/menu/plan", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const allMeals = (result.days || []).flatMap((day) => (day.meals || []).map((meal) => ({ day, meal })));
        plannerResults.innerHTML = `
          <article class="meal-plan-document" id="meal-plan-document">
            <div class="meal-plan-toolbar no-print">
              <button class="button button-soft document-save-button" type="button" id="meal-plan-print">Print / Save PDF</button>
            </div>
            <header class="meal-plan-cover">
              <p class="document-kicker">Taverai Meal Plan</p>
              <h3>${escapeHtml(result.planName || "Meal Plan")}</h3>
              <p>${escapeHtml(result.summary || "A practical meal plan built around your selected diet and prompt.")}</p>
              <div class="document-meta">
                <span>${escapeHtml(String((result.days || []).length))} day${(result.days || []).length === 1 ? "" : "s"}</span>
                <span>${escapeHtml(payload.mealTypes.join(", "))}</span>
              </div>
            </header>
            <section class="meal-plan-brief">
              <h4>Meal Overview</h4>
              ${allMeals.map(({ day, meal }) => `
                <article class="meal-brief-row">
                  <strong>${escapeHtml(day.dayLabel)} · ${escapeHtml(meal.mealType || "Meal")}</strong>
                  <span>${escapeHtml(meal.title || "Untitled meal")}</span>
                  <em>${escapeHtml(meal.calories != null ? `${Math.round(meal.calories)} cal` : "Calories not estimated")}</em>
                </article>
              `).join("")}
            </section>
            <section class="recipe-section">
              <h4>Recipes</h4>
              ${allMeals.map(({ day, meal }) => `
                <article class="recipe-card">
                  <div class="recipe-heading">
                    <div>
                      <p class="document-kicker">${escapeHtml(day.dayLabel)} · ${escapeHtml(meal.mealType || "Meal")}</p>
                      <h5>${escapeHtml(meal.recipeTitle || meal.title || "Recipe")}</h5>
                    </div>
                    <span class="tag">${escapeHtml(meal.calories != null ? `${Math.round(meal.calories)} cal` : "No calories")}</span>
                  </div>
                  <p>${escapeHtml(meal.description || "")}</p>
                  <div class="recipe-facts">
                    <span>Serves ${escapeHtml(meal.servings != null ? String(Math.round(meal.servings)) : "1")}</span>
                    <span>Prep ${escapeHtml(meal.prepMinutes != null ? `${Math.round(meal.prepMinutes)} min` : "—")}</span>
                    <span>Cook ${escapeHtml(meal.cookMinutes != null ? `${Math.round(meal.cookMinutes)} min` : "—")}</span>
                  </div>
                  <div class="recipe-columns">
                    <div>
                      <h6>Ingredients</h6>
                      ${mealPlanIngredientList(meal.ingredients)}
                    </div>
                    <div>
                      <h6>Instructions</h6>
                      ${mealPlanInstructionList(meal.instructions)}
                    </div>
                  </div>
                  <div class="feed-actions no-print">
                    <button class="button button-soft document-save-button" type="button"
                      data-save-meal='${escapeHtml(JSON.stringify(meal))}'
                      data-save-title="${escapeHtml(meal.title)}"
                      data-save-type="${escapeHtml(meal.mealType)}"
                      data-save-description="${escapeHtml(meal.description || "")}"
                      data-save-calories="${escapeHtml(meal.calories ?? "")}">Save favorite</button>
                  </div>
                </article>
              `).join("")}
            </section>
          </article>
        `;

        document.getElementById("meal-plan-print")?.addEventListener("click", () => window.print());

        plannerResults.querySelectorAll("[data-save-meal]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              const recipe = JSON.parse(button.getAttribute("data-save-meal"));
              await api("/api/menu/favorites", {
                method: "POST",
                body: JSON.stringify({
                  title: button.getAttribute("data-save-title"),
                  mealType: button.getAttribute("data-save-type"),
                  description: button.getAttribute("data-save-description"),
                  calories: button.getAttribute("data-save-calories") || null,
                  recipe,
                }),
              });
              setMessage("meal-plan-message", "Meal saved to favorites.", "success");
              await loadSavedMeals();
            } catch (error) {
              setMessage("meal-plan-message", error.message, "error");
            }
          });
        });
      } catch (error) {
        plannerResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
        setMessage("meal-plan-message", error.message, "error");
      }
    });

    async function detectBarcodeFromFile(file) {
      if (!("BarcodeDetector" in window)) {
        throw new Error("Barcode photo scanning is not supported in this browser yet. Type the barcode number manually.");
      }
      const detector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
      });
      const image = await createImageBitmap(file);
      const results = await detector.detect(image);
      image.close?.();
      const code = results?.[0]?.rawValue || "";
      if (!code) {
        throw new Error("No barcode found in that image. Try a clearer, closer photo.");
      }
      return code;
    }

    barcodeUploadButton?.addEventListener("click", () => {
      barcodePhotoInput?.removeAttribute("capture");
      barcodePhotoInput?.click();
    });

    barcodeCameraButton?.addEventListener("click", () => {
      if (!barcodePhotoInput) return;
      barcodePhotoInput.setAttribute("capture", "environment");
      barcodePhotoInput.click();
    });

    barcodePhotoInput?.addEventListener("change", async () => {
      const file = barcodePhotoInput.files && barcodePhotoInput.files[0] ? barcodePhotoInput.files[0] : null;
      if (!file || !file.type.startsWith("image/")) return;
      setMessage("barcode-message", "Scanning barcode photo...", "success");
      try {
        const code = await detectBarcodeFromFile(file);
        if (barcodeForm?.barcode) {
          barcodeForm.barcode.value = code;
        }
        setMessage("barcode-message", `Barcode found: ${code}. Tap Look up product.`, "success");
      } catch (error) {
        setMessage("barcode-message", error.message, "error");
      }
    });

    barcodeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("barcode-message", "");
      barcodeResults.innerHTML = '<p class="empty-state">Looking up product...</p>';
      try {
        const result = await api("/api/nutrition/barcode", {
          method: "POST",
          body: JSON.stringify({ barcode: barcodeForm.barcode.value.trim() }),
        });
        const product = result.product || {};
        barcodeResults.innerHTML = `
          <article class="feed-card">
            <div class="feed-card-header">
              <h3>${escapeHtml(product.name || "Product")}</h3>
              <span class="tag">${escapeHtml(product.brand || "Open Food Facts")}</span>
            </div>
            <p>${escapeHtml([
              product.calories != null ? `${Math.round(product.calories)} cal` : null,
              product.proteinG != null ? `${Math.round(product.proteinG)}g protein` : null,
              product.carbsG != null ? `${Math.round(product.carbsG)}g carbs` : null,
              product.fatG != null ? `${Math.round(product.fatG)}g fat` : null,
              product.sugarG != null ? `${Math.round(product.sugarG)}g sugar` : null,
              product.fiberG != null ? `${Math.round(product.fiberG)}g fiber` : null,
              product.satFatG != null ? `${Math.round(product.satFatG)}g sat fat` : null,
            ].filter(Boolean).join(" • ") || "No nutrition values found.")}</p>
            ${product.servingSize ? `<p class="inline-note">Serving size: ${escapeHtml(product.servingSize)}</p>` : ""}
          </article>
        `;
      } catch (error) {
        barcodeResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
        setMessage("barcode-message", error.message, "error");
      }
    });

    await loadSavedMeals();
  }

  async function initFavorites() {
    if (!(await requireAuth())) return;

    const groupsEl = document.getElementById("favorite-meals-groups");
    const recipeView = document.getElementById("favorite-recipe-view");
    if (!groupsEl || !recipeView) return;

    const groupOrder = [
      { key: "breakfast", label: "Breakfast" },
      { key: "lunch", label: "Lunches" },
      { key: "snack", label: "Snacks" },
      { key: "dinner", label: "Dinners" },
    ];

    function mealGroupKey(meal) {
      const type = String(meal.mealType || meal.recipe?.mealType || "").toLowerCase();
      if (type.includes("breakfast")) return "breakfast";
      if (type.includes("lunch")) return "lunch";
      if (type.includes("snack")) return "snack";
      if (type.includes("dinner")) return "dinner";
      return "dinner";
    }

    function renderRecipeDocument(meal) {
      const recipe = meal.recipe || {};
      recipeView.innerHTML = `
        <article class="meal-plan-document favorite-recipe-document" id="meal-plan-document">
          <div class="meal-plan-toolbar no-print">
            <button class="button button-soft document-save-button" type="button" id="favorite-recipe-close">Back to favorites</button>
            <button class="button button-soft document-save-button" type="button" id="favorite-recipe-print">Print / Save PDF</button>
          </div>
          <header class="meal-plan-cover">
            <p class="document-kicker">Taverai Favorite Recipe</p>
            <h3>${escapeHtml(recipe.recipeTitle || meal.title || "Favorite meal")}</h3>
            <p>${escapeHtml(meal.description || recipe.description || "A saved meal from your planner.")}</p>
            <div class="document-meta">
              <span>${escapeHtml(meal.mealType || recipe.mealType || "Meal")}</span>
              <span>${escapeHtml(meal.calories != null ? `${Math.round(meal.calories)} cal` : "Calories not estimated")}</span>
              <span>Saved ${escapeHtml(formatDateTime(meal.createdAt))}</span>
            </div>
          </header>
          <section class="recipe-section">
            <article class="recipe-card">
              <div class="recipe-heading">
                <div>
                  <p class="document-kicker">${escapeHtml(meal.mealType || recipe.mealType || "Meal")}</p>
                  <h5>${escapeHtml(recipe.recipeTitle || recipe.title || meal.title || "Recipe")}</h5>
                </div>
                <span class="tag">${escapeHtml(meal.calories != null ? `${Math.round(meal.calories)} cal` : "No calories")}</span>
              </div>
              <p>${escapeHtml(recipe.description || meal.description || "")}</p>
              <div class="recipe-facts">
                <span>Serves ${escapeHtml(recipe.servings != null ? String(Math.round(recipe.servings)) : "1")}</span>
                <span>Prep ${escapeHtml(recipe.prepMinutes != null ? `${Math.round(recipe.prepMinutes)} min` : "—")}</span>
                <span>Cook ${escapeHtml(recipe.cookMinutes != null ? `${Math.round(recipe.cookMinutes)} min` : "—")}</span>
              </div>
              <div class="recipe-columns">
                <div>
                  <h6>Ingredients</h6>
                  ${mealPlanIngredientList(recipe.ingredients)}
                </div>
                <div>
                  <h6>Instructions</h6>
                  ${mealPlanInstructionList(recipe.instructions)}
                </div>
              </div>
            </article>
          </section>
        </article>
      `;

      document.getElementById("favorite-recipe-print")?.addEventListener("click", () => window.print());
      document.getElementById("favorite-recipe-close")?.addEventListener("click", () => {
        recipeView.innerHTML = "";
        groupsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      recipeView.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function loadFavorites() {
      groupsEl.innerHTML = '<p class="empty-state">Loading favorite meals...</p>';
      recipeView.innerHTML = "";

      try {
        const result = await api("/api/menu/favorites", { method: "GET" });
        const meals = Array.isArray(result.meals) ? result.meals : [];
        if (!meals.length) {
          groupsEl.innerHTML = '<p class="empty-state">No saved meals yet. Go back to Menu and save any planned meal to build your archive.</p>';
          return;
        }

        const grouped = Object.fromEntries(groupOrder.map((group) => [group.key, []]));
        meals.forEach((meal) => grouped[mealGroupKey(meal)].push(meal));

        groupsEl.innerHTML = groupOrder.map((group) => `
          <section class="favorite-meal-group">
            <div class="section-header">
              <h3>${escapeHtml(group.label)}</h3>
              <span class="tag">${escapeHtml(String(grouped[group.key].length))}</span>
            </div>
            <div class="feed-list">
              ${grouped[group.key].length ? grouped[group.key].map((meal) => `
                <article class="feed-card favorite-meal-card">
                  <div class="feed-card-header">
                    <div>
                      <h3>${escapeHtml(meal.title)}</h3>
                      <p class="inline-note">${escapeHtml(meal.description || "Saved from the meal planner.")}</p>
                    </div>
                    <span class="tag">${escapeHtml(meal.calories != null ? `${Math.round(meal.calories)} cal` : (meal.mealType || "Meal"))}</span>
                  </div>
                  <div class="feed-card-footer">
                    <span class="inline-note">${escapeHtml(formatDateTime(meal.createdAt))}</span>
                    <div class="button-row compact-actions">
                      <button class="button button-soft" type="button" data-view-favorite="${escapeHtml(meal.id)}">View recipe</button>
                      <button class="button button-soft" type="button" data-delete-favorite="${escapeHtml(meal.id)}">Delete</button>
                    </div>
                  </div>
                </article>
              `).join("") : '<p class="empty-state">No saved meals in this group yet.</p>'}
            </div>
          </section>
        `).join("");

        groupsEl.querySelectorAll("[data-view-favorite]").forEach((button) => {
          button.addEventListener("click", () => {
            const meal = meals.find((item) => item.id === button.getAttribute("data-view-favorite"));
            if (meal) renderRecipeDocument(meal);
          });
        });

        groupsEl.querySelectorAll("[data-delete-favorite]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await api(`/api/menu/favorites?id=${encodeURIComponent(button.getAttribute("data-delete-favorite"))}`, { method: "DELETE" });
              await loadFavorites();
            } catch (error) {
              groupsEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
            }
          });
        });
      } catch (error) {
        groupsEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      }
    }

    await loadFavorites();
  }

  async function initAdmin() {
    const totalsEl = document.getElementById("admin-totals");
    const activityEl = document.getElementById("admin-activity");
    const statusEl = document.getElementById("admin-system-status");
    const usersEl = document.getElementById("admin-users");
    const refreshButton = document.getElementById("admin-refresh-button");
    const userSearch = document.getElementById("admin-user-search");
    const errorsEl = document.getElementById("admin-errors");
    const mealAuditEl = document.getElementById("admin-meal-audit");
    const logRefreshButton = document.getElementById("admin-log-refresh-button");
    const auditRefreshButton = document.getElementById("admin-audit-refresh-button");
    const numberFormat = new Intl.NumberFormat();

    function metric(label, value, tone = "") {
      return `
        <div class="admin-metric ${tone ? `is-${tone}` : ""}">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value ?? "-")}</dd>
        </div>
      `;
    }

    function statusPill(label, ok) {
      return `
        <div class="admin-health-row">
          <span>${escapeHtml(label)}</span>
          <strong class="${ok ? "is-ok" : "is-warn"}">${ok ? "Ready" : "Needs attention"}</strong>
        </div>
      `;
    }

    async function loadAdmin() {
      try {
        setMessage("admin-message", "");
        const result = await api("/api/admin/summary", { method: "GET" });
        const totals = result.totals || {};
        const activity = result.activity || {};
        const system = result.system || {};

        if (totalsEl) {
          totalsEl.innerHTML = [
            metric("Users", numberFormat.format(totals.users || 0)),
            metric("Admins", numberFormat.format(totals.admins || 0)),
            metric("Food entries", numberFormat.format(totals.entries || 0)),
            metric("Plans", numberFormat.format(totals.plans || 0)),
            metric("Saved meals", numberFormat.format(totals.savedMeals || 0)),
            metric("Active subscriptions", numberFormat.format(totals.activeSubscriptions || 0), totals.activeSubscriptions ? "great" : ""),
          ].join("");
        }

        if (activityEl) {
          activityEl.innerHTML = [
            metric("Entries today", numberFormat.format(activity.entriesToday || 0)),
            metric("Entries in 7 days", numberFormat.format(activity.entries7Days || 0)),
            metric("New users in 7 days", numberFormat.format(activity.newUsers7Days || 0)),
            metric("Avg plan alignment", activity.avgPlanAlignment ? `${activity.avgPlanAlignment}/100` : "-"),
          ].join("");
        }

        if (statusEl) {
          statusEl.innerHTML = `
            <div class="admin-health-list">
              ${statusPill("OpenAI API", !!system.openaiConfigured)}
              ${statusPill("Uploads directory", !!system.uploadDirectoryWritable)}
              ${statusPill("App logs", !!system.appLogWritable)}
              <div class="admin-health-row"><span>PHP</span><strong>${escapeHtml(system.phpVersion || "-")}</strong></div>
            </div>
          `;
        }

        if (usersEl) {
          const users = Array.isArray(result.recentUsers) ? result.recentUsers : [];
          renderAdminUsers(users);
        }

        if (errorsEl && Array.isArray(result.recentErrors)) {
          renderAdminLogs(result.recentErrors);
        }
      } catch (error) {
        setMessage("admin-message", error.message, "error");
        if (totalsEl) totalsEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      }
    }

    function renderAdminUsers(users) {
      if (!usersEl) return;
      usersEl.innerHTML = users.length
        ? users.map((user) => `
            <tr>
              <td><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)}</span></td>
              <td><span class="tag">${escapeHtml(user.role || "user")}</span></td>
              <td>${escapeHtml(numberFormat.format(user.entryCount || 0))}</td>
              <td>${escapeHtml(numberFormat.format(user.planCount || 0))}</td>
              <td>${escapeHtml(numberFormat.format(user.savedMealCount || 0))}</td>
              <td>${escapeHtml(formatDateTime(user.createdAt))}</td>
              <td>
                <div class="admin-action-row">
                  <button class="button button-soft" type="button" data-admin-user-role="${escapeHtml(user.id)}" data-role="${escapeHtml(user.role === "admin" ? "user" : "admin")}">${user.role === "admin" ? "Make user" : "Make admin"}</button>
                  <button class="button button-soft" type="button" data-admin-reset="${escapeHtml(user.id)}">Reset</button>
                  <button class="button button-soft" type="button" data-admin-sub="${escapeHtml(user.id)}" data-status="${escapeHtml(user.paidStatus === "Paid" ? "inactive" : "active")}">${user.paidStatus === "Paid" ? "End sub" : "Activate sub"}</button>
                  <button class="button button-danger" type="button" data-admin-delete-user="${escapeHtml(user.id)}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("")
        : `<tr><td colspan="7">No users found.</td></tr>`;
    }

    function renderAdminLogs(logs) {
      if (!errorsEl) return;
      errorsEl.innerHTML = logs.length
        ? logs.map((log) => `
            <article class="admin-log-item">
              <div>
                <strong>${escapeHtml(log.message || "Log entry")}</strong>
                <span>${escapeHtml(formatDateTime(log.time))}</span>
              </div>
              <pre>${escapeHtml(JSON.stringify(log.context || {}, null, 2))}</pre>
            </article>
          `).join("")
        : `<p class="empty-state">No matching logs yet.</p>`;
    }

    function renderMealAudit(meals) {
      if (!mealAuditEl) return;
      mealAuditEl.innerHTML = meals.length
        ? meals.map((meal) => `
            <article class="admin-audit-item">
              ${meal.imageUrl ? `<img src="${escapeHtml(meal.imageUrl)}" alt="">` : `<div class="admin-audit-placeholder">No image</div>`}
              <div>
                <strong>${escapeHtml(meal.text || "Meal entry")}</strong>
                <span>${escapeHtml(meal.user || "Unknown user")} · ${escapeHtml(formatDateTime(meal.createdAt))}</span>
                <p>${meal.missingNutrition ? "Needs nutrition data" : `${meal.calories || 0} cal · ${meal.proteinG || 0}g protein · ${meal.carbsG || 0}g carbs · ${meal.fatG || 0}g fat`}</p>
              </div>
              <button class="button button-danger" type="button" data-admin-delete-meal="${escapeHtml(meal.id)}">Delete</button>
            </article>
          `).join("")
        : `<p class="empty-state">No uploaded or incomplete meals found.</p>`;
    }

    async function loadAdminLogs() {
      try {
        const result = await api("/api/admin/logs?term=error&limit=40", { method: "GET" });
        renderAdminLogs(Array.isArray(result.logs) ? result.logs : []);
      } catch (error) {
        if (errorsEl) errorsEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      }
    }

    async function loadMealAudit() {
      try {
        const result = await api("/api/admin/audit/meals", { method: "GET" });
        renderMealAudit(Array.isArray(result.meals) ? result.meals : []);
      } catch (error) {
        if (mealAuditEl) mealAuditEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      }
    }

    let searchTimer = null;
    userSearch?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(async () => {
        try {
          const q = userSearch.value.trim();
          const result = await api(`/api/admin/users?q=${encodeURIComponent(q)}`, { method: "GET" });
          renderAdminUsers(Array.isArray(result.users) ? result.users : []);
        } catch (error) {
          setMessage("admin-message", error.message, "error");
        }
      }, 250);
    });

    usersEl?.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      try {
        if (button.dataset.adminUserRole) {
          await api("/api/admin/users", {
            method: "PATCH",
            body: JSON.stringify({ id: button.dataset.adminUserRole, role: button.dataset.role }),
          });
          setMessage("admin-message", "User role updated.", "success");
        } else if (button.dataset.adminReset) {
          const result = await api("/api/admin/users/reset-link", {
            method: "POST",
            body: JSON.stringify({ id: button.dataset.adminReset }),
          });
          const panel = document.getElementById("admin-reset-link-panel");
          const text = document.getElementById("admin-reset-link-text");
          if (panel && text) {
            text.innerHTML = `<a href="${escapeHtml(result.resetLink || "")}">${escapeHtml(result.resetLink || "")}</a>`;
            panel.classList.remove("is-hidden");
          }
          setMessage("admin-message", `Reset link generated for ${result.email || "user"}.`, "success");
        } else if (button.dataset.adminSub) {
          await api("/api/admin/subscriptions", {
            method: "PATCH",
            body: JSON.stringify({
              userId: button.dataset.adminSub,
              status: button.dataset.status,
              productId: button.dataset.status === "active" ? "admin.manual" : "",
            }),
          });
          setMessage("admin-message", "Subscription status updated.", "success");
        } else if (button.dataset.adminDeleteUser) {
          const ok = window.confirm("Delete this user and all of their Taverai data?");
          if (!ok) return;
          await api(`/api/admin/users?id=${encodeURIComponent(button.dataset.adminDeleteUser)}`, { method: "DELETE" });
          setMessage("admin-message", "User deleted.", "success");
        } else {
          return;
        }

        const q = userSearch?.value?.trim() || "";
        const result = await api(`/api/admin/users?q=${encodeURIComponent(q)}`, { method: "GET" });
        renderAdminUsers(Array.isArray(result.users) ? result.users : []);
        await loadAdmin();
      } catch (error) {
        setMessage("admin-message", error.message, "error");
      }
    });

    mealAuditEl?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-admin-delete-meal]");
      if (!button) return;
      const ok = window.confirm("Delete this meal entry and any uploaded photo attached to it?");
      if (!ok) return;
      try {
        await api(`/api/admin/audit/meals?id=${encodeURIComponent(button.dataset.adminDeleteMeal)}`, { method: "DELETE" });
        setMessage("admin-message", "Meal entry deleted.", "success");
        await loadMealAudit();
        await loadAdmin();
      } catch (error) {
        setMessage("admin-message", error.message, "error");
      }
    });

    refreshButton?.addEventListener("click", loadAdmin);
    logRefreshButton?.addEventListener("click", loadAdminLogs);
    auditRefreshButton?.addEventListener("click", loadMealAudit);
    await loadAdmin();
    await loadAdminLogs();
    await loadMealAudit();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderEntryScore(entry) {
    const scores = Array.isArray(entry.scores) ? entry.scores : [];
    if (!scores.length) return "";

    const sorted = [...scores].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const top = sorted[0];
    if (!top || !top.plan) return "";

    return `<p><strong>Best match:</strong> ${escapeHtml(top.plan.name || top.plan.type || "Plan")} (${escapeHtml(String(top.score))}/100)</p>`;
  }

  markNetworkOnlyControls();
  initPwa();
  initAppNavigationPolish();
  activateNav();

  if (app.page === "login") initLogin();
  if (app.page === "signup") initSignup();
  if (app.page === "forgot") initForgot();
  if (app.page === "reset") initReset();
  if (app.page === "log") initLog();
  if (app.page === "menu") initMenu();
  if (app.page === "favorites") initFavorites();
  if (app.page === "plans") initPlans();
  if (app.page === "account") initAccount();
  if (app.page === "coach") initCoach();
  if (app.page === "admin") initAdmin();
})();
