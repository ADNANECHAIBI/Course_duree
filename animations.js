/* ════════════════════════════════════════════════════════════════════════
   APD 2026 — COMPORTEMENTS COMPLÉMENTAIRES  (animations.js)
   ----------------------------------------------------------------------
   Règles d'or de ce fichier :
     1. Aucune fonction/variable de index.html n'est lue, ni redéfinie
        (switchTab, WIZARD_TABS, rand, runAppAnimations, enterApp... ne
        sont jamais touchés). Ce script observe le DOM de l'extérieur.
     2. Tout est purement ADDITIF : si ce fichier est retiré, l'application
        continue de fonctionner à l'identique (aucune logique métier ici).
     3. prefers-reduced-motion est respecté : si activé, on n'attache
        même pas les écouteurs d'animation.
   Chargement recommandé : <script src="animations.js" defer></script>
   placé dans <head> (defer = exécution après le parsing complet du DOM,
   donc après tous les scripts inline de index.html qui définissent déjà
   switchTab() etc. — aucun risque d'ordre d'exécution).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Garde-fou anti double-inclusion (si le script est chargé deux fois).
  if (window.__apd2AnimationsLoaded) return;
  window.__apd2AnimationsLoaded = true;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) return; // Rien à faire : le CSS garantit déjà un affichage statique propre.

  /* ────────────────────────────────────────────────────────────────────
     1. RIPPLE TACTILE — feedback de clic sur les boutons et onglets.
        Délégation d'événements : un seul écouteur global, fonctionne
        même pour des boutons ajoutés dynamiquement plus tard (ex: lignes
        de tableau générées par addStudentRow()).
     ──────────────────────────────────────────────────────────────────── */
  var RIPPLE_SELECTOR = '.btn, .tab-btn, .wizard-edge-btn, .theme-toggle-btn';

  function spawnRipple(target, clientX, clientY) {
    if (target.disabled) return;

    var layer = target.querySelector(':scope > .apd2-ripple-layer');
    if (!layer) {
      layer = document.createElement('span');
      layer.className = 'apd2-ripple-layer';
      target.insertBefore(layer, target.firstChild);
    }

    var rect = target.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.4;
    var x = clientX - rect.left - size / 2;
    var y = clientY - rect.top - size / 2;

    var ripple = document.createElement('span');
    ripple.className = 'apd2-ripple';
    ripple.style.width = size + 'px';
    ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    layer.appendChild(ripple);

    // Nettoyage après l'animation (550ms définie dans animations.css),
    // avec un filet de sécurité au cas où 'animationend' ne se déclenche pas.
    var cleanup = function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); };
    ripple.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 700);
  }

  document.addEventListener('pointerdown', function (e) {
    var target = e.target.closest ? e.target.closest(RIPPLE_SELECTOR) : null;
    if (!target) return;
    var x = (typeof e.clientX === 'number' && (e.clientX || e.clientY)) ? e.clientX : null;
    var y = (typeof e.clientY === 'number' && (e.clientX || e.clientY)) ? e.clientY : null;
    if (x === null) { // Fallback (ex: activation clavier) : centre du bouton.
      var r = target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    }
    spawnRipple(target, x, y);
  }, { passive: true });

  /* ────────────────────────────────────────────────────────────────────
     2. RÉVÉLATION EN CASCADE DES ONGLETS
        À chaque fois qu'un .tab-content reçoit la classe "active" (donc
        à chaque switchTab() existant — on ne le réécrit pas, on REAGIT
        à son effet de bord via MutationObserver), ses enfants directs
        apparaissent en cascade. L'onglet déjà actif au chargement initial
        de la page n'est jamais concerné ici (aucune mutation ne se
        produit pour lui) : c'est runAppAnimations(), déjà présent dans
        index.html, qui gère ce premier affichage.
     ──────────────────────────────────────────────────────────────────── */
  function staggerReveal(tabContentEl) {
    var children = tabContentEl.children;
    if (!children || !children.length) return;

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      child.classList.add('apd2-stagger-item');
      // Les conteneurs de graphiques Chart.js ne reçoivent qu'un fondu
      // d'opacité (jamais de transform) pour exclure toute interférence
      // avec les calculs de dimension du canvas.
      if (child.querySelector && child.querySelector('canvas')) {
        child.classList.add('apd2-no-transform');
      }
    }

    // Double rAF : on s'assure que l'état initial (opacity:0) est bien
    // peint avant d'ajouter la classe qui déclenche la transition CSS.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < children.length; i++) {
          (function (el, idx) {
            setTimeout(function () {
              el.classList.add('apd2-in');
            }, idx * 45);
          })(children[i], i);
        }
      });
    });
  }

  function resetStagger(tabContentEl) {
    var children = tabContentEl.children;
    for (var i = 0; i < children.length; i++) {
      children[i].classList.remove('apd2-stagger-item', 'apd2-in', 'apd2-no-transform');
    }
  }

  function observeTabContent(el) {
    var wasActive = el.classList.contains('active');
    var observer = new MutationObserver(function () {
      var isActive = el.classList.contains('active');
      if (isActive && !wasActive) {
        staggerReveal(el);
      } else if (!isActive && wasActive) {
        resetStagger(el); // Prêt pour une nouvelle révélation au prochain passage.
      }
      wasActive = isActive;
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return observer;
  }

  function initTabObservers() {
    var tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(function (el) { observeTabContent(el); });
  }

  /* ────────────────────────────────────────────────────────────────────
     Initialisation — on attend que le DOM (et les scripts inline de
     index.html) soient prêts. defer garantit déjà cet ordre, mais on
     reste défensif si ce fichier est chargé différemment.
     ──────────────────────────────────────────────────────────────────── */
  function init() {
    initTabObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
