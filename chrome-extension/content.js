/**
 * TrueMargin Asistan — content.js
 *
 * v1: kendi ürün analizi. v2'de rakip analizi eklenecek.
 *
 * Çalıştığı sayfalar (manifest.json'daki content_scripts eşleşmeleri):
 *   - https://partner.trendyol.com/*
 *   - https://partner.hepsiburada.com/*
 *   - https://so.n11.com/*
 *
 * KAPSAM (v1):
 *   - Sayfa yüklendiğinde sağ üst köşeye yüzen bir buton ekler
 *   - Partner panelinden SATICININ KENDİ satış fiyatını okur
 *   - Rakip kazıma yok, canlı API çağrısı yok
 *
 * v2 PLANI:
 *   - Ürün detay sayfalarında rakip fiyatlarını analiz et
 *   - Kendi ürün sayfasında gerçek marj göster
 *   - Talep sinyali için arama sıralamasını oku
 */

"use strict";

(function () {
  // Prevent double-injection (e.g. SPA navigation)
  if (window.__truemarginContentLoaded) return;
  window.__truemarginContentLoaded = true;

  // ── Create floating button ─────────────────────────────────────────────────

  var btn = document.createElement("button");
  btn.id = "truemargin-floating-btn";
  btn.textContent = "TM";
  btn.title = "TrueMargin Asistan — Kâr analizi";

  Object.assign(btn.style, {
    position:       "fixed",
    top:            "80px",
    right:          "16px",
    zIndex:         "999999",
    width:          "40px",
    height:         "40px",
    borderRadius:   "50%",
    background:     "#12181B",
    color:          "#F7F6F2",
    border:         "none",
    fontSize:       "10px",
    fontWeight:     "700",
    fontFamily:     "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    letterSpacing:  "0.05em",
    cursor:         "pointer",
    boxShadow:      "0 2px 8px rgba(0,0,0,0.25)",
    transition:     "opacity 0.2s, transform 0.2s",
    opacity:        "0.85",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  });

  btn.addEventListener("mouseenter", function () {
    btn.style.opacity   = "1";
    btn.style.transform = "scale(1.08)";
  });
  btn.addEventListener("mouseleave", function () {
    btn.style.opacity   = "0.85";
    btn.style.transform = "scale(1)";
  });

  /**
   * Read the seller's OWN listing price from the partner panel.
   * Only partner.* domains (manifest matches). No competitor pages, no live API.
   */
  function extractOwnListingPrice() {
    var selectors = [
      'input[name*="salePrice" i]',
      'input[name*="listPrice" i]',
      'input[name*="satisFiyat" i]',
      'input[id*="salePrice" i]',
      'input[id*="listPrice" i]',
      '[data-testid*="sale-price" i]',
      '[data-testid*="list-price" i]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var raw = (el.value || el.textContent || "").replace(/\./g, "").replace(",", ".").match(/[\d.]+/);
      if (raw) {
        var n = parseFloat(raw[0]);
        if (isFinite(n) && n > 0) return n;
      }
    }
    return null;
  }

  btn.addEventListener("click", function () {
    var price = extractOwnListingPrice();
    if (price != null && typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "OWN_LISTING_PRICE", price: price });
    }
    console.log("[TrueMargin] Analiz için uzantı popup'ını açın." + (price != null ? " Algılanan fiyat: ₺" + price : ""));
  });

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (msg && msg.type === "REQUEST_OWN_PRICE") {
        sendResponse({ price: extractOwnListingPrice() });
      }
    });
  }

  // ── Mount on page load ────────────────────────────────────────────────────

  function mountButton() {
    if (!document.getElementById("truemargin-floating-btn")) {
      document.body.appendChild(btn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton);
  } else {
    mountButton();
  }
})();
