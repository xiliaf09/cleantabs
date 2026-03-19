const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

function isSpecial(url) {
  return !url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("chrome-extension://");
}

async function getLastAccessed() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "getLastAccessed" }, resolve);
  });
}

async function analyze() {
  const [tabs, lastAccessed, [currentTab]] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    getLastAccessed(),
    chrome.tabs.query({ active: true, currentWindow: true })
  ]);

  const now = Date.now();
  const currentTabId = currentTab?.id;
  const urlSeen = new Map();
  const groups = new Map(); // domain -> [{tab, isDup, isInactive, isSameDomain, isCurrent}]

  // Première passe : compter les tabs par domaine
  const domainCount = new Map();
  for (const tab of tabs) {
    if (isSpecial(tab.url)) continue;
    const domain = getDomain(tab.url);
    if (!domain) continue;
    domainCount.set(domain, (domainCount.get(domain) || 0) + 1);
  }

  // Deuxième passe : annoter chaque tab
  for (const tab of tabs) {
    if (isSpecial(tab.url)) continue;
    const domain = getDomain(tab.url);
    if (!domain) continue;

    const normalUrl = tab.url.replace(/#$/, "").replace(/\/$/, "");
    const isDup = urlSeen.has(normalUrl);
    if (!isDup) urlSeen.set(normalUrl, tab.id);

    const lastSeen = lastAccessed[tab.id];
    const isInactive = !!(lastSeen && (now - lastSeen) > INACTIVITY_LIMIT_MS);
    const isCurrent = tab.id === currentTabId;
    // Même domaine = plusieurs onglets du même site (pas forcément même URL)
    const isSameDomain = domainCount.get(domain) > 1;

    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push({ tab, isDup, isInactive, isSameDomain, isCurrent, _lastSeen: lastSeen || 0 });
  }

  return { groups, total: tabs.filter(t => !isSpecial(t.url)).length };
}

function render(groups, total) {
  const list = document.getElementById("list");
  const stats = document.getElementById("stats");

  // Un groupe est pertinent si : doublon, inactif, ou plusieurs onglets du même domaine
  const relevant = [...groups.entries()].filter(([, items]) =>
    items.some(i => !i.isCurrent && (i.isDup || i.isInactive)) || items.length > 1
  ).sort((a, b) => b[1].length - a[1].length);

  let totalToClose = 0;
  for (const [, items] of relevant) {
    // Pour "tout nettoyer" : doublons + inactifs, mais pas les tabs de domaine unique sans autre raison
    totalToClose += items.filter(i => !i.isCurrent && (i.isDup || i.isInactive)).length;
  }

  stats.textContent = `${total} onglets · ${totalToClose} à nettoyer`;

  if (relevant.length === 0) {
    list.innerHTML = `<div class="empty"><div class="icon">✨</div>Tout est propre !<br>Aucun doublon ni onglet inactif.</div>`;
    return;
  }

  list.innerHTML = "";

  for (const [domain, items] of relevant) {
    const dupCount = items.filter(i => i.isDup && !i.isCurrent).length;
    const inactiveCount = items.filter(i => i.isInactive && !i.isDup && !i.isCurrent).length;
    const sameDomainCount = items.filter(i => !i.isCurrent).length;

    // IDs fermables automatiquement (doublons + inactifs)
    const autoCloseIds = items.filter(i => !i.isCurrent && (i.isDup || i.isInactive)).map(i => i.tab.id);
    // IDs fermables manuellement (tous sauf actif courant)
    const allCloseIds = items.filter(i => !i.isCurrent).map(i => i.tab.id);

    const group = document.createElement("div");
    group.className = "domain-group";

    const favicon = items.find(i => i.tab.favIconUrl)?.tab.favIconUrl || "";
    let badges = "";
    if (dupCount) badges += `<span class="badge dup">${dupCount} doublon${dupCount > 1 ? "s" : ""}</span>`;
    if (inactiveCount) badges += `<span class="badge inactive">${inactiveCount} inactif${inactiveCount > 1 ? "s" : ""}</span>`;
    if (!dupCount && !inactiveCount && sameDomainCount > 0) {
      badges += `<span class="badge">${items.length} onglets</span>`;
    }

    // Bouton fermer : si y'a des doublons/inactifs → ferme ceux-là ; sinon → ferme tous sauf le plus récent
    const closeIds = autoCloseIds.length > 0 ? autoCloseIds : allCloseIds.slice(1);

    group.innerHTML = `
      <div class="domain-header">
        <img class="favicon" src="${favicon}" onerror="this.style.display='none'">
        <span class="domain-name">${domain}</span>
        ${badges}
        <button class="btn-close-domain" data-ids="${closeIds.join(",")}">Fermer</button>
      </div>
      <div class="tab-list">
        ${items.map(({ tab, isDup, isInactive, isCurrent }, idx) => {
          const canClose = !isCurrent;
          const tag = isCurrent
            ? `<span class="tag active">actif</span>`
            : isDup
            ? `<span class="tag dup">doublon</span>`
            : isInactive
            ? `<span class="tag inactive">inactif</span>`
            : `<span class="tag" style="background:#1a1a26;color:#555570">ouvert</span>`;
          return `
            <div class="tab-item">
              <span class="tab-title" title="${tab.title}">${tab.title || tab.url}</span>
              ${tag}
              ${canClose ? `<button class="btn-close-tab" data-id="${tab.id}">×</button>` : ""}
            </div>`;
        }).join("")}
      </div>`;

    list.appendChild(group);
  }

  list.querySelectorAll(".btn-close-domain").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ids = btn.dataset.ids.split(",").map(Number).filter(Boolean);
      if (ids.length) await chrome.tabs.remove(ids);
      refresh();
    });
  });

  list.querySelectorAll(".btn-close-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      await chrome.tabs.remove(Number(btn.dataset.id));
      refresh();
    });
  });
}

async function refresh() {
  const { groups, total } = await analyze();
  render(groups, total);
}

document.getElementById("cleanAll").addEventListener("click", async () => {
  const { groups } = await analyze();
  const toClose = new Set();

  for (const [, items] of groups) {
    // Doublons exacts + inactifs → toujours fermés
    const autoClose = items.filter(i => !i.isCurrent && (i.isDup || i.isInactive));
    autoClose.forEach(i => toClose.add(i.tab.id));

    // Même domaine, plusieurs onglets → garde le plus récent, ferme les autres
    if (items.length > 1) {
      const closeable = items.filter(i => !i.isCurrent && !toClose.has(i.tab.id));
      // Trie par lastAccessed décroissant (le plus récent en premier)
      closeable.sort((a, b) => (b._lastSeen || 0) - (a._lastSeen || 0));
      closeable.slice(1).forEach(i => toClose.add(i.tab.id)); // ferme tout sauf le plus récent
    }
  }

  if (toClose.size) await chrome.tabs.remove([...toClose]);
  refresh();
});

refresh();

// ── JARVIS MODE ──────────────────────────────────────────────────────────────
const JARVIS_URL = "https://jarvis-hub-production.up.railway.app/";

document.getElementById("jarvisMode").addEventListener("click", async () => {
  const btn = document.getElementById("jarvisMode");
  btn.classList.add("killing");
  btn.textContent = "⚡ Killing...";

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const toClose = [];
  let jarvisTabId = null;

  for (const tab of tabs) {
    const url = tab.url || "";
    if (url.startsWith(JARVIS_URL) || url === JARVIS_URL.replace(/\/$/, "")) {
      jarvisTabId = tab.id; // garde le premier trouvé
    } else {
      toClose.push(tab.id);
    }
  }

  // Ferme tout sauf Jarvis
  if (toClose.length) await chrome.tabs.remove(toClose);

  // Si Jarvis est ouvert → le refresh et le focus
  if (jarvisTabId !== null) {
    await chrome.tabs.update(jarvisTabId, { active: true });
  } else {
    // Si Jarvis n'était pas ouvert → l'ouvre
    await chrome.tabs.create({ url: JARVIS_URL, active: true });
  }

  window.close(); // ferme le popup
});
