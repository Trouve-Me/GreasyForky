// ==UserScript==
// @name:fr         Knowunity - Télécharger PDF depuis les cartes
// @name         Knowunity - PDF Downloader from cards
// @namespace    knowunity.pdf.downloader
// @version      1.2
// @description:fr  Ajoute un tag "PDF" fonctionnel sur chaque carte de résultat pour télécharger le document
// @description  Adds a functional “PDF” tag to each results card so the document can be downloaded
// @author       TrouveMe
// @include      /^https:\/\/knowunity\.[^/]+\/.*$/
// @grant        none
// @license MIT
// ==/UserScript==

(function () {
  'use strict';

  const CARD_SELECTOR = '.rounded-r20.bg-surface-card';
  const TAG_MARKER_CLASS = 'kn-dl-tag';
  const PROCESSED_ATTR = 'data-kn-dl-processed';
  const PAGE_IMG_PROCESSED = 'data-kn-dl-page-img-processed';
  const DOWNLOAD_BTN_PROCESSED = 'data-kn-dl-btn-processed';
  const DOWNLOAD_BTN_CLASS = 'kn-dl-download-btn';

  const STYLE = `
    .${TAG_MARKER_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, #5335BF, #7A5CFF);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
      max-width: 100%;
      cursor: pointer;
      opacity: 0.92;
      user-select: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
      border: 1px solid rgba(255,255,255,0.15);
      box-sizing: border-box;
    }
    .${TAG_MARKER_CLASS}:hover {
      opacity: 1;
      transform: translateY(-1px);
    }
    .${TAG_MARKER_CLASS} svg {
      width: 11px;
      height: 11px;
      flex-shrink: 0;
    }
    .kn-dl-global-badge {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      background: rgba(0,0,0,0.75);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      opacity: 0.8;
      pointer-events: none;
    }
    .kn-dl-page-img-clickable {
      cursor: pointer;
      transition: filter 0.2s ease, transform 0.2s ease;
    }
    .kn-dl-page-img-clickable:hover {
      filter: brightness(1.05);
      transform: scale(1.005);
    }
    .${DOWNLOAD_BTN_CLASS} {
      background: linear-gradient(135deg, #5335BF, #7A5CFF) !important;
      position: relative;
      overflow: hidden;
      transition: all 0.2s ease !important;
    }
/*    .${DOWNLOAD_BTN_CLASS}::before {
      content: '📄';
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
      opacity: 0.9;
    }
    */
    .${DOWNLOAD_BTN_CLASS}:hover {
      background: linear-gradient(135deg, #6345CF, #8A6CFF) !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(83, 53, 191, 0.4) !important;
    }
    .${DOWNLOAD_BTN_CLASS}:active {
      transform: translateY(0);
    }
  `;

  function injectStyle() {
    if (document.getElementById('kn-dl-style')) return;
    const style = document.createElement('style');
    style.id = 'kn-dl-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function decodeUrl(url) {
    let decoded = url;
    for (let i = 0; i < 5; i++) {
      try {
        const temp = decodeURIComponent(decoded);
        if (temp === decoded) break;
        decoded = temp;
      } catch (e) {
        break;
      }
    }
    return decoded;
  }

  function extractDocId(url) {
    try {
      const decoded = decodeUrl(url);
      // Capturer l'UUID complet avec les tirets
      const match = decoded.match(/content-eu-central-1\.knowunity\.com\/CONTENT\/([A-Za-z0-9-]+)/i);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function extractVerifyToken(url) {
    try {
      const decoded = decodeUrl(url);
      const match = decoded.match(/verify=([A-Za-z0-9\-_%=]+)/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function buildPdfUrl(docId, verifyToken) {
    let url = `https://content-eu-central-1.knowunity.com/CONTENT/${docId}.pdf`;
    if (verifyToken) {
      url += `?verify=${verifyToken}`;
    }
    return url;
  }

  function findPreviewUrl(card) {
    const img = card.querySelector('img');
    if (!img) return null;

    const src = img.src || img.getAttribute('data-src') || '';

    if (src.includes('knowunity.fr/_next/image') || src.includes('knowunity.com/_next/image')) {
      return src;
    }

    return null;
  }

  function findPdfUrlOnPage() {
    // Méthode 1: Chercher dans __NEXT_DATA__
    try {
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        const data = JSON.parse(nextData.textContent);
        const html = JSON.stringify(data);
        const match = html.match(/content-eu-central-1\.knowunity\.com\/CONTENT\/([A-Za-z0-9]+)(?:\.pdf|_PREVIEW|_image_page_)/i);
        if (match) {
          const docId = match[1];
          const verifyMatch = html.match(new RegExp(`${docId}[^"]*verify=([A-Za-z0-9\\-_%=]+)`, 'i'));
          const verifyToken = verifyMatch ? verifyMatch[1] : null;
          console.log('[Knowunity DL] ✓ PDF trouvé dans __NEXT_DATA__:', docId);
          return buildPdfUrl(docId, verifyToken);
        }
      }
    } catch (e) {}

    // Méthode 2: Chercher des images _PREVIEW ou _image_page_
    const allImages = Array.from(document.querySelectorAll('img'));
    for (const img of allImages) {
      const src = img.src || img.getAttribute('data-src') || '';
      const decoded = decodeUrl(src);

      if ((decoded.includes('_PREVIEW') || decoded.includes('_image_page_')) &&
          decoded.includes('content-eu-central-1.knowunity.com')) {
        const docId = extractDocId(decoded);
        const verifyToken = extractVerifyToken(decoded);
        if (docId) {
          console.log('[Knowunity DL] ✓ PDF trouvé depuis image:', docId);
          return buildPdfUrl(docId, verifyToken);
        }
      }
    }

    // Méthode 3: Scanner le HTML
    try {
      const html = document.documentElement.outerHTML;
      const pdfMatch = html.match(/content-eu-central-1\.knowunity\.com\/CONTENT\/([A-Za-z0-9]+)\.pdf[^"'\s]*/i);
      if (pdfMatch) {
        const fullUrl = pdfMatch[0];
        const docId = pdfMatch[1];
        const verifyToken = extractVerifyToken(fullUrl);
        return buildPdfUrl(docId, verifyToken);
      }
    } catch (e) {}

    // Méthode 4: Fallback avec n'importe quelle image CDN
    for (const img of allImages) {
      const src = img.src || img.getAttribute('data-src') || '';
      const decoded = decodeUrl(src);
      if (decoded.includes('content-eu-central-1.knowunity.com/CONTENT/') &&
          (decoded.includes('.webp') || decoded.includes('.jpg') || decoded.includes('.png'))) {
        const docId = extractDocId(decoded);
        const verifyToken = extractVerifyToken(decoded);
        if (docId) {
          return buildPdfUrl(docId, verifyToken);
        }
      }
    }

    return null;
  }

  function makeTag(docId, pdfUrl) {
    const tag = document.createElement('span');
    tag.className = TAG_MARKER_CLASS;
    tag.title = 'Télécharger le PDF';
    tag.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v12"></path>
        <path d="M7 10l5 5 5-5"></path>
        <path d="M5 21h14"></path>
      </svg>
      <span>PDF</span>
    `;

    tag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (pdfUrl) {
        window.open(pdfUrl, '_blank');
      } else {
        alert('Impossible de récupérer l\'URL du PDF pour ce document.');
      }
    });

    return tag;
  }

  function findTagRow(card) {
    return card.querySelector('.flex.gap-1\\.5.overflow-x-auto.scrollbar-hide');
  }

  function decorateCard(card) {
    if (card.hasAttribute(PROCESSED_ATTR)) return;
    card.setAttribute(PROCESSED_ATTR, 'true');

    const previewUrl = findPreviewUrl(card);
    const docId = previewUrl ? extractDocId(previewUrl) : null;
    const verifyToken = previewUrl ? extractVerifyToken(previewUrl) : null;
    const pdfUrl = docId ? buildPdfUrl(docId, verifyToken) : null;

    const tagRow = findTagRow(card);
    const tag = makeTag(docId, pdfUrl);

    if (tagRow) {
      tagRow.insertBefore(tag, tagRow.firstChild);
    } else {
      const imageWrap = card.querySelector('.relative.aspect-\\[3\\/2\\]');
      if (imageWrap) {
        tag.style.position = 'absolute';
        tag.style.bottom = '8px';
        tag.style.right = '8px';
        tag.style.zIndex = '2';
        imageWrap.appendChild(tag);
      }
    }
  }

  // Décorer les images cliquables (pages de document ET previews)
  function decoratePageImages() {
    // Images de page dans la modal: _image_page_1.webp
    const pageImages = document.querySelectorAll('img[src*="_image_page_"][src*="content-eu-central-1.knowunity.com"]');

    // Images preview via _next/image: ..._next/image?url=..._PREVIEW_MEDIUM.webp
    const previewImages = document.querySelectorAll('img[src*="_next/image"][src*="_PREVIEW"]');

    // Combiner les deux listes
    const allClickableImages = [...pageImages, ...previewImages];

    allClickableImages.forEach((img) => {
      if (img.hasAttribute(PAGE_IMG_PROCESSED)) return;
      img.setAttribute(PAGE_IMG_PROCESSED, 'true');

      const src = img.src;
      const docId = extractDocId(src);
      const verifyToken = extractVerifyToken(src);
      const pdfUrl = docId ? buildPdfUrl(docId, verifyToken) : null;

      if (!pdfUrl) return;

      img.classList.add('kn-dl-page-img-clickable');
      img.title = 'Cliquer pour ouvrir le PDF complet';

      const clickHandler = (e) => {
        if (e.type === 'contextmenu') return;
        e.preventDefault();
        e.stopPropagation();
        console.log('[Knowunity DL] Ouverture du PDF depuis image:', pdfUrl);
        window.open(pdfUrl, '_blank');
      };

      img.addEventListener('click', clickHandler);

      // Ajouter aussi sur le parent div pour faciliter le clic
      const parentDiv = img.closest('div.h-full') || img.closest('div[class*="flex"]');
      if (parentDiv && !parentDiv.hasAttribute(PAGE_IMG_PROCESSED)) {
        parentDiv.setAttribute(PAGE_IMG_PROCESSED, 'true');
        parentDiv.style.cursor = 'pointer';
        parentDiv.addEventListener('click', clickHandler);
      }

      console.log('[Knowunity DL] ✓ Image cliquable:', docId, src.substring(0, 80));
    });
  }

  // Méthode 1: Décorer le bouton dans la modal (méthode fiable avec navigation DOM)
  function decorateModalDownloadButton() {
    const modal = document.querySelector('div.fixed.inset-0.z-50');
    if (!modal) return false;

    const header = modal.firstElementChild;
    if (!header) return false;

    const rightButtons = header.lastElementChild;
    if (!rightButtons) return false;

    const button = rightButtons.querySelector('button:has(path[d^="M21 15V16.2"])');
    if (!button) return false;

    if (button.classList.contains(DOWNLOAD_BTN_CLASS)) return true;

    button.classList.add(DOWNLOAD_BTN_CLASS);

    const pdfUrl = findPdfUrlOnPage();
    if (!pdfUrl) {
      console.warn('[Knowunity DL] Impossible de trouver l\'URL du PDF pour le bouton modal');
      return false;
    }

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Knowunity DL] Ouverture du PDF depuis bouton modal:', pdfUrl);
      window.open(pdfUrl, '_blank');
    });

    console.log('[Knowunity DL] ✓ Bouton Télécharger (modal) configuré:', pdfUrl);
    return true;
  }

  // Méthode 2: Décorer les boutons "Télécharger" partout sur la page (méthode générique)
  function decorateGenericDownloadButtons() {
    const buttons = Array.from(document.querySelectorAll('button'));

    for (const btn of buttons) {
      const hasText = btn.textContent && btn.textContent.includes('Télécharger');
      const hasSvg = btn.querySelector('svg');
      const isProcessed = btn.classList.contains(DOWNLOAD_BTN_CLASS) ||
                          btn.hasAttribute(DOWNLOAD_BTN_PROCESSED);

      if (!hasText || !hasSvg || isProcessed) continue;

      btn.setAttribute(DOWNLOAD_BTN_PROCESSED, 'true');
      btn.classList.add(DOWNLOAD_BTN_CLASS);

      const pdfUrl = findPdfUrlOnPage();
      if (!pdfUrl) continue;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Knowunity DL] Ouverture du PDF depuis bouton générique:', pdfUrl);
        window.open(pdfUrl, '_blank');
      });

      console.log('[Knowunity DL] ✓ Bouton Télécharger (générique) configuré:', pdfUrl);
    }
  }

  // Décorer tous les boutons Télécharger
  function decorateDownloadButtons() {
    decorateModalDownloadButton();
    decorateGenericDownloadButtons();
  }

  // Vérifier et décorer tout ce qui est présent sur la page
  function decorateAll() {
    document.querySelectorAll(CARD_SELECTOR).forEach(decorateCard);
    decoratePageImages();
    decorateDownloadButtons();
  }

  function injectGlobalBadge() {
    if (document.querySelector('.kn-dl-global-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'kn-dl-global-badge';
    badge.textContent = 'PDF Downloader actif';
    document.body.appendChild(badge);
  }

  function init() {
    injectStyle();
    injectGlobalBadge();
    decorateAll();

    const observer = new MutationObserver(() => {
      decorateAll();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
