/**
 * TrueMargin Asistan — popup.js
 *
 * Self-contained vanilla JS (no build step, no Node imports).
 * Implements the same math as lib/calc/safe-price.ts and lib/calc/net-profit.ts
 * but as a closed-form, inline implementation for the extension.
 *
 * v1: kendi ürün analizi. Rakip verileri veya canlı API çağrısı yok.
 */

"use strict";

// ── Math helpers ──────────────────────────────────────────────────────────────

/**
 * Compute net profit for a given sale price.
 *
 * netProfit = price
 *             - cogs
 *             - shipping
 *             - price * commissionRate/100
 *             - price * commissionRate/100 * vatRate/100   (VAT on commission)
 *
 * @param {number} price          - Sale price in TRY
 * @param {number} cogs           - Cost of goods sold in TRY
 * @param {number} shipping       - Shipping cost in TRY
 * @param {number} commissionRate - Commission rate in % (e.g. 15 for 15%)
 * @param {number} vatRate        - VAT rate in % (e.g. 20 for 20%)
 * @returns {number} Net profit in TRY
 */
function computeNetProfit(price, cogs, shipping, commissionRate, vatRate) {
  const commissionAmount = price * (commissionRate / 100);
  const vatOnCommission  = commissionAmount * (vatRate / 100);
  const totalFees = commissionAmount + vatOnCommission + shipping;
  return price - cogs - totalFees;
}

/**
 * Compute the floor (break-even) price — the minimum sale price at which
 * net profit = 0.
 *
 * Derivation:
 *   price = cogs + shipping + price * c + price * c * v
 *   price * (1 - c - c*v) = cogs + shipping
 *   price = (cogs + shipping) / (1 - c*(1 + v))
 *
 * where c = commissionRate/100, v = vatRate/100.
 *
 * @param {number} cogs           - Cost of goods sold in TRY
 * @param {number} shipping       - Shipping cost in TRY
 * @param {number} commissionRate - Commission rate in %
 * @param {number} vatRate        - VAT rate in %
 * @returns {number} Break-even price in TRY (or Infinity if denominator ≤ 0)
 */
function computeFloorPrice(cogs, shipping, commissionRate, vatRate) {
  const c = commissionRate / 100;
  const v = vatRate / 100;
  const denominator = 1 - c * (1 + v);
  if (denominator <= 0) return Infinity;
  return (cogs + shipping) / denominator;
}

/**
 * Compute the target sale price that achieves a desired margin %.
 *
 * netProfit = price * (marginRate)
 *   price - cogs - shipping - price*c - price*c*v = price * m
 *   price * (1 - c - c*v - m) = cogs + shipping
 *   price = (cogs + shipping) / (1 - c*(1+v) - m)
 *
 * @param {number} cogs           - Cost of goods sold in TRY
 * @param {number} shipping       - Shipping cost in TRY
 * @param {number} commissionRate - Commission rate in %
 * @param {number} vatRate        - VAT rate in %
 * @param {number} targetMarginPct - Desired net margin in % (e.g. 15)
 * @returns {number} Target price in TRY (or Infinity if not achievable)
 */
function computeTargetPrice(cogs, shipping, commissionRate, vatRate, targetMarginPct) {
  const c = commissionRate / 100;
  const v = vatRate / 100;
  const m = targetMarginPct / 100;
  const denominator = 1 - c * (1 + v) - m;
  if (denominator <= 0) return Infinity;
  return (cogs + shipping) / denominator;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatTRY(amount) {
  if (!isFinite(amount)) return "—";
  return "₺" + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatPct(value) {
  if (!isFinite(value)) return "—";
  return value.toFixed(1) + "%";
}

// ── DOM logic ─────────────────────────────────────────────────────────────────

function getNumber(id, fallback) {
  const val = parseFloat(document.getElementById(id).value);
  return isNaN(val) ? (fallback !== undefined ? fallback : 0) : val;
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.add("visible");
  document.getElementById("resultBox").classList.remove("visible");
}

function hideError() {
  document.getElementById("errorMsg").classList.remove("visible");
}

function setResult(id, value, className) {
  const el = document.getElementById(id);
  el.textContent = value;
  el.className = "result-value " + (className || "neutral");
}

var STORAGE_KEYS = ["cogs", "shipping", "commissionRate", "vatRate", "targetMargin", "salePrice"];

function persistInputs() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  var payload = {};
  STORAGE_KEYS.forEach(function (id) {
    payload[id] = document.getElementById(id).value;
  });
  chrome.storage.local.set(payload);
}

function restoreInputs() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(STORAGE_KEYS, function (stored) {
    STORAGE_KEYS.forEach(function (id) {
      if (stored[id] != null && stored[id] !== "") {
        document.getElementById(id).value = stored[id];
      }
    });
  });
}

function applyDetectedPrice(price) {
  if (!isFinite(price) || price <= 0) return;
  var el = document.getElementById("salePrice");
  if (!el.value) el.value = String(price);
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "OWN_LISTING_PRICE" && typeof msg.price === "number") {
      applyDetectedPrice(msg.price);
    }
  });
}

if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0] || !tabs[0].id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "REQUEST_OWN_PRICE" }, function (response) {
      if (chrome.runtime.lastError) return;
      if (response && typeof response.price === "number") applyDetectedPrice(response.price);
    });
  });
}

restoreInputs();

document.getElementById("computeBtn").addEventListener("click", function () {
  hideError();
  persistInputs();

  const cogs           = getNumber("cogs");
  const shipping       = getNumber("shipping");
  const commissionRate = getNumber("commissionRate", 15);
  const vatRate        = getNumber("vatRate", 20);
  const targetMarginPct = getNumber("targetMargin", 15);
  const salePrice      = getNumber("salePrice");

  // Basic validation
  if (cogs < 0 || shipping < 0) {
    showError("Maliyet ve kargo değerleri 0 veya daha büyük olmalıdır.");
    return;
  }
  if (commissionRate < 0 || commissionRate >= 100) {
    showError("Komisyon oranı 0–100 arasında olmalıdır.");
    return;
  }
  if (vatRate < 0 || vatRate > 100) {
    showError("KDV oranı 0–100 arasında olmalıdır.");
    return;
  }

  const floorPrice  = computeFloorPrice(cogs, shipping, commissionRate, vatRate);
  const targetPrice = computeTargetPrice(cogs, shipping, commissionRate, vatRate, targetMarginPct);

  if (!isFinite(floorPrice)) {
    showError("Komisyon + KDV kombinasyonu geçersiz — taban fiyat hesaplanamıyor.");
    return;
  }

  // Prefer the user's current listing price; fall back to the target price.
  const priceForProfit = salePrice > 0 ? salePrice : (isFinite(targetPrice) ? targetPrice : 0);
  const netProfit = priceForProfit > 0
    ? computeNetProfit(priceForProfit, cogs, shipping, commissionRate, vatRate)
    : 0;
  const marginPct = priceForProfit > 0 ? (netProfit / priceForProfit) * 100 : 0;

  setResult("floorPrice",  formatTRY(floorPrice),  "neutral");
  setResult("targetPrice", isFinite(targetPrice) ? formatTRY(targetPrice) : "—", "neutral");
  setResult(
    "netProfit",
    priceForProfit > 0 ? formatTRY(netProfit) : "—",
    netProfit >= 0 ? "profit" : "loss"
  );
  setResult(
    "marginPct",
    priceForProfit > 0 ? formatPct(marginPct) : "—",
    marginPct >= 10 ? "profit" : marginPct >= 0 ? "neutral" : "loss"
  );

  document.getElementById("resultBox").classList.add("visible");
});
