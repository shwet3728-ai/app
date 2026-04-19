const API_BASE = `${window.location.origin}/api`;
const cart = new Map();
const mascotLines = [
  "Best brew, short wait.",
  "Fresh cup, clean mood.",
  "Picked a good one.",
  "Payment confirmed. Reception has it.",
];

const icons = {
  espresso: "☕",
  cold: "🥤",
  dessert: "🍨",
  bakery: "🥐",
};

const elements = {
  body: document.body,
  loadingScreen: document.getElementById("loading-screen"),
  loadingButton: document.getElementById("loading-button"),
  heroTitle: document.getElementById("hero-title"),
  heroCopy: document.getElementById("hero-copy"),
  announcementLine: document.getElementById("announcement-line"),
  storyLine: document.getElementById("story-line"),
  companion: document.getElementById("companion"),
  companionBubble: document.getElementById("companion-bubble"),
  menuSearch: document.getElementById("menu-search"),
  menuPrev: document.getElementById("menu-prev"),
  menuNext: document.getElementById("menu-next"),
  menuRow: document.getElementById("menu-row"),
  cartItems: document.getElementById("cart-items"),
  cartCount: document.getElementById("cart-count"),
  orderForm: document.getElementById("order-form"),
  customerName: document.getElementById("customer-name"),
  tableNumber: document.getElementById("table-number"),
  pickupSlot: document.getElementById("pickup-slot"),
  orderStatus: document.getElementById("order-status"),
  payButton: document.getElementById("pay-button"),
  paymentRecipient: document.getElementById("payment-recipient"),
  paymentRecipientUpi: document.getElementById("payment-recipient-upi"),
  orderStorage: document.getElementById("order-storage"),
  infoCopy: document.getElementById("info-copy"),
  infoPills: document.getElementById("info-pills"),
  galleryEyebrow: document.getElementById("gallery-eyebrow"),
  galleryTitle: document.getElementById("gallery-title"),
  galleryDescription: document.getElementById("gallery-description"),
  shopGallery: document.getElementById("shop-gallery"),
  galleryModal: document.getElementById("gallery-modal"),
  galleryModalTitle: document.getElementById("gallery-modal-title"),
  galleryModalGrid: document.getElementById("gallery-modal-grid"),
  closeGalleryModal: document.getElementById("close-gallery-modal"),
  menuImageEyebrow: document.getElementById("menu-image-eyebrow"),
  menuImageTitle: document.getElementById("menu-image-title"),
  menuImageDescription: document.getElementById("menu-image-description"),
  menuImage: document.getElementById("menu-image"),
  openMenuModal: document.getElementById("open-menu-modal"),
  menuModal: document.getElementById("menu-modal"),
  menuModalTitle: document.getElementById("menu-modal-title"),
  menuModalImage: document.getElementById("menu-modal-image"),
  closeMenuModal: document.getElementById("close-menu-modal"),
  contactCopy: document.getElementById("contact-copy"),
  contactList: document.getElementById("contact-list"),
  locationsCopy: document.getElementById("locations-copy"),
  locationsList: document.getElementById("locations-list"),
  faqCopy: document.getElementById("faq-copy"),
  faqList: document.getElementById("faq-list"),
  feedbackForm: document.getElementById("feedback-form"),
  feedbackRating: document.getElementById("feedback-rating"),
  feedbackMessage: document.getElementById("feedback-message"),
  feedbackStatus: document.getElementById("feedback-status"),
  homePanel: document.getElementById("home"),
  productsPanel: document.getElementById("products"),
  ordersPanel: document.getElementById("orders"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let shopData = null;
let siteContent = null;
let filteredItems = [];
let revealObserver = null;
let sectionObserver = null;
let galleryGroups = [];

const faqItems = [
  { question: "Can I order from my table?", answer: "Yes. Add your table number and send the order." },
  { question: "How fast is pickup?", answer: "Usually within the pickup time you select." },
  { question: "Can I pay online?", answer: "Yes. Razorpay checkout opens when payment is enabled." },
];

function hideLoader() {
  elements.loadingScreen.classList.add("hidden");
}

function bindLoader() {
  elements.loadingButton.addEventListener("click", hideLoader, { once: true });
  window.setTimeout(hideLoader, 2200);
}

function trackEyes(event) {
  document.querySelectorAll(".bean-eye span, .companion-eye span").forEach((pupil) => {
    const rect = pupil.parentElement.getBoundingClientRect();
    const dx = Math.max(-4, Math.min(4, (event.clientX - (rect.left + rect.width / 2)) / 14));
    const dy = Math.max(-4, Math.min(4, (event.clientY - (rect.top + rect.height / 2)) / 14));
    pupil.style.transform = `translate(${dx}px, ${dy}px)`;
  });
}

function setMascotLine(line) {
  elements.companionBubble.textContent = line;
}

function animateHeroTitle(text) {
  const words = text.split(" ");
  elements.heroTitle.innerHTML = words
    .map((word, index) => `<span class="hero-word" style="animation-delay:${index * 90}ms">${word}</span>`)
    .join(" ");
}

function refreshStoryLine() {
  const chips = [...elements.storyLine.querySelectorAll("span")];
  chips.forEach((chip) => {
    chip.style.animation = "none";
    void chip.offsetWidth;
    chip.style.animation = "";
  });
}

function createRipple(button, event) {
  const ripple = document.createElement("span");
  const rect = button.getBoundingClientRect();
  ripple.className = "ripple";
  ripple.style.width = "24px";
  ripple.style.height = "24px";
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;
  button.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 600);
}

function animateCartFly(sourceCard) {
  if (prefersReducedMotion || !sourceCard || !elements.cartCount) {
    return;
  }

  const visual = sourceCard.querySelector(".product-visual");
  const icon = visual?.querySelector("span")?.textContent || "☕";
  const sourceRect = (visual || sourceCard).getBoundingClientRect();
  const targetRect = elements.cartCount.getBoundingClientRect();
  const token = document.createElement("div");
  token.className = "cart-fly";
  token.textContent = icon;
  token.style.left = `${sourceRect.left + sourceRect.width / 2 - 21}px`;
  token.style.top = `${sourceRect.top + sourceRect.height / 2 - 21}px`;
  document.body.appendChild(token);

  requestAnimationFrame(() => {
    const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
    token.style.transform = `translate(${dx}px, ${dy}px) scale(0.35)`;
    token.style.opacity = "0.18";
  });

  window.setTimeout(() => token.remove(), 700);
}

function pulseCartItem(id) {
  if (!id) {
    return;
  }

  const pill = elements.cartItems.querySelector(`[data-id="${id}"]`);
  if (!pill) {
    return;
  }

  pill.classList.add("is-updated");
  window.setTimeout(() => pill.classList.remove("is-updated"), 700);
}

function setupRevealObserver() {
  if (revealObserver) {
    revealObserver.disconnect();
  }

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((node) => node.classList.add("is-visible"));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
  );

  document.querySelectorAll(".reveal:not(.is-visible)").forEach((node) => revealObserver.observe(node));
}

function setupSectionObserver() {
  if (sectionObserver) {
    sectionObserver.disconnect();
  }

  if (!("IntersectionObserver" in window)) {
    return;
  }

  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        elements.body.classList.remove("section-products", "section-order");
        if (entry.target.id === "products") {
          elements.body.classList.add("section-products");
        }
        if (entry.target.id === "orders") {
          elements.body.classList.add("section-order");
        }
      });
    },
    { threshold: 0.45 }
  );

  [elements.homePanel, elements.productsPanel, elements.ordersPanel].forEach((section) => {
    if (section) {
      sectionObserver.observe(section);
    }
  });
}

function applyParallax(event) {
  if (prefersReducedMotion) {
    return;
  }

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const offsetX = (event.clientX - centerX) / centerX;
  const offsetY = (event.clientY - centerY) / centerY;

  document.querySelectorAll("[data-parallax]").forEach((node) => {
    const depth = Number(node.dataset.parallax) || 10;
    const x = offsetX * depth;
    const y = offsetY * depth * 0.65;
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });
}

function resetParallax() {
  document.querySelectorAll("[data-parallax]").forEach((node) => {
    node.style.transform = "";
  });
}

async function verifyRazorpayPayment(orderId, paymentResponse) {
  const response = await fetch(`${API_BASE}/orders/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      razorpayOrderId: paymentResponse.razorpay_order_id,
      razorpayPaymentId: paymentResponse.razorpay_payment_id,
      razorpaySignature: paymentResponse.razorpay_signature,
    }),
  });
  return response.json();
}

async function markPaymentFailed(orderId) {
  const response = await fetch(`${API_BASE}/orders/${orderId}/payment-failed`, {
    method: "POST",
  });
  return response.json();
}

function applyPaymentStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");
  const message = params.get("message");

  if (!payment || !message) {
    return;
  }

  elements.orderStatus.textContent = message;
  if (payment === "success") {
    elements.orderForm.reset();
    setMascotLine(mascotLines[3]);
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

function renderHero(data) {
  animateHeroTitle("The best quality coffee for your best brew.");
  elements.heroCopy.textContent = "Walk in, order fast, and pay when ready.";
  elements.announcementLine.textContent = data.brand.announcement;
  refreshStoryLine();
}

function renderMenu(items) {
  elements.menuRow.innerHTML = items
    .map(
      (item, index) => `
        <article class="menu-card reveal is-visible" style="transition-delay:${Math.min(index * 60, 240)}ms">
          <div class="product-visual">
            ${
              item.imageUrl
                ? `<img src="${item.imageUrl}" alt="${item.name}" />`
                : `<span>${icons[item.category] || "☕"}</span>`
            }
          </div>
          <div>
            <strong class="price">₹${item.price.toFixed(0)}</strong>
            <h3>${item.name}</h3>
            <p class="meta">${item.description || item.accent}</p>
            <div class="card-actions">
              <span>${item.roast}</span>
              <button class="primary-button add-button" type="button" data-id="${item.id}">
                ${cart.has(item.id) ? "Add more" : "Add"}
              </button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  elements.menuRow.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      const card = button.closest(".menu-card");
      const next = (cart.get(button.dataset.id) || 0) + 1;
      createRipple(button, event);
      animateCartFly(card);
      cart.set(button.dataset.id, next);
      button.classList.add("is-added");
      button.textContent = "Added ✓";
      renderCart(button.dataset.id);
      setMascotLine(mascotLines[2]);

      window.setTimeout(() => {
        renderMenu(filteredItems);
      }, 420);
    });
  });
}

function renderBottomSections() {
  if (!siteContent || !shopData) {
    return;
  }

  elements.infoCopy.textContent = siteContent.info.body;
  elements.contactCopy.textContent = siteContent.contact.body;
  elements.locationsCopy.textContent = siteContent.locations.body;
  elements.faqCopy.textContent = siteContent.faq.body;

  elements.infoPills.innerHTML = shopData.metrics
    .map((metric) => `<div class="info-pill"><strong>${metric.value}</strong><span>${metric.label}</span></div>`)
    .join("");

  elements.contactList.innerHTML = siteContent.contactItems
    .map((item) => `<div class="detail-card"><strong>${item.label}</strong><span>${item.value}</span></div>`)
    .join("");

  elements.locationsList.innerHTML = siteContent.locationsList
    .map((item) => `<div class="detail-card"><strong>${item.name}</strong><span>${item.detail}</span></div>`)
    .join("");

  elements.faqList.innerHTML = faqItems
    .map((item) => `<div class="faq-item"><strong>${item.question}</strong><span>${item.answer}</span></div>`)
    .join("");

  renderGallery();
}

function renderGallery() {
  const gallery = siteContent.gallery || {};
  const menu = gallery.menu || {};
  const fallbackTitles = ["Counter view", "Signature serve", "Seating area", "Bean bar", "Interior mood"];

  galleryGroups = Array.from({ length: 5 }, (_, index) => {
    const item = Array.isArray(gallery.items) ? gallery.items[index] || {} : {};
    const legacy = Array.isArray(gallery.images) ? gallery.images[index] || {} : {};
    const title = item.title || legacy.caption || fallbackTitles[index];
    const imageUrls = Array.isArray(item.imageUrls)
      ? item.imageUrls.filter(Boolean)
      : legacy.imageUrl
        ? [legacy.imageUrl]
        : [];
    return {
      title,
      coverImageUrl: item.coverImageUrl || imageUrls[0] || legacy.imageUrl || "",
      imageUrls,
    };
  });

  elements.galleryEyebrow.textContent = gallery.eyebrow || "Inside the cafe";
  elements.galleryTitle.textContent = gallery.title || "Shop moments";
  elements.galleryDescription.textContent = gallery.description || "";
  elements.menuImageEyebrow.textContent = menu.eyebrow || "Menu image";
  elements.menuImageTitle.textContent = menu.title || "Wide horizontal menu preview";
  elements.menuImageDescription.textContent = menu.description || "";

  elements.shopGallery.innerHTML = galleryGroups
    .map(
      (item, index) => `
        <figure class="gallery-card">
          ${item.coverImageUrl ? `<img src="${item.coverImageUrl}" alt="${item.title || "Shop photo"}" />` : ""}
          <div class="gallery-card-copy">
            <figcaption>${item.title || `Gallery ${index + 1}`}</figcaption>
            <button class="ghost-button view-gallery-button" type="button" data-gallery-index="${index}">
              View ${item.imageUrls.length ? `(${item.imageUrls.length})` : ""}
            </button>
          </div>
        </figure>
      `
    )
    .join("");

  elements.shopGallery.querySelectorAll(".view-gallery-button").forEach((button) => {
    button.addEventListener("click", () => openGalleryModal(Number(button.dataset.galleryIndex)));
  });

  if (menu.imageUrl) {
    elements.menuImage.hidden = false;
    elements.menuImage.src = menu.imageUrl;
    elements.menuImage.alt = menu.title || "Menu preview";
  } else {
    elements.menuImage.hidden = true;
    elements.menuImage.removeAttribute("src");
  }
}

function openGalleryModal(index) {
  const group = galleryGroups[index];
  if (!group) {
    return;
  }

  elements.galleryModalTitle.textContent = group.title || "Gallery";
  elements.galleryModalGrid.innerHTML = group.imageUrls.length
    ? group.imageUrls.map((imageUrl, imageIndex) => `<img src="${imageUrl}" alt="${group.title || "Gallery"} image ${imageIndex + 1}" />`).join("")
    : `<p class="section-copy">No images added yet.</p>`;
  elements.galleryModal.classList.add("is-open");
  elements.galleryModal.setAttribute("aria-hidden", "false");
  elements.body.style.overflow = "hidden";
}

function closeGalleryModal() {
  elements.galleryModal.classList.remove("is-open");
  elements.galleryModal.setAttribute("aria-hidden", "true");
  elements.body.style.overflow = "";
}

function openMenuModal() {
  const menu = siteContent?.gallery?.menu || {};
  if (!menu.imageUrl) {
    return;
  }

  elements.menuModalTitle.textContent = menu.title || "Menu";
  elements.menuModalImage.src = menu.imageUrl;
  elements.menuModalImage.alt = menu.title || "Menu";
  elements.menuModal.classList.add("is-open");
  elements.menuModal.setAttribute("aria-hidden", "false");
  elements.body.style.overflow = "hidden";
}

function closeMenuModal() {
  elements.menuModal.classList.remove("is-open");
  elements.menuModal.setAttribute("aria-hidden", "true");
  elements.body.style.overflow = "";
}

function renderCart(highlightId = "") {
  const entries = [...cart.entries()].map(([id, quantity]) => {
    const item = shopData.menu.find((menuItem) => menuItem.id === id);
    return `
      <div class="cart-pill" data-id="${id}">
        <strong>${item.name}</strong>
        <span>${quantity}x</span>
        <div class="cart-pill-actions">
          <button class="cart-action" type="button" data-action="decrease" data-id="${id}">-</button>
          <button class="cart-action" type="button" data-action="increase" data-id="${id}">+</button>
          <button class="cart-action remove" type="button" data-action="remove" data-id="${id}">x</button>
        </div>
      </div>
    `;
  });

  const count = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  elements.cartCount.textContent = `${count} items`;
  elements.cartItems.innerHTML = entries.length ? entries.join("") : `<span class="cart-pill">Cart is empty</span>`;
  pulseCartItem(highlightId);

  elements.cartItems.querySelectorAll(".cart-action").forEach((button) => {
    button.addEventListener("click", () => {
      const { id, action } = button.dataset;
      const current = cart.get(id) || 0;

      if (action === "increase") {
        cart.set(id, current + 1);
      } else if (action === "decrease") {
        if (current <= 1) {
          cart.delete(id);
        } else {
          cart.set(id, current - 1);
        }
      } else if (action === "remove") {
        cart.delete(id);
      }

      renderCart(id);
      renderMenu(filteredItems);
    });
  });
}

function filterMenu() {
  const query = elements.menuSearch.value.trim().toLowerCase();
  filteredItems = shopData.menu.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.accent.toLowerCase().includes(query) ||
      (item.description || "").toLowerCase().includes(query)
  );
  renderMenu(filteredItems);
}

function scrollMenu(direction) {
  const amount = Math.min(elements.menuRow.clientWidth * 0.8, 420);
  elements.menuRow.scrollBy({ left: direction * amount, behavior: "smooth" });
}

async function submitOrder(event) {
  event.preventDefault();

  const items = [...cart.entries()].map(([id, quantity]) => ({ id, quantity }));
  if (!items.length) {
    elements.orderStatus.textContent = "Add items first.";
    return;
  }

  const customerName = elements.customerName.value.trim();
  const tableNumber = elements.tableNumber.value.trim();
  if (!customerName || !tableNumber) {
    elements.orderStatus.textContent = "Enter your name and table number.";
    return;
  }

  const endpoint = shopData.paymentEnabled ? "orders/checkout" : "orders";
  let response;
  let payload;

  try {
    response = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        tableNumber,
        pickupSlot: elements.pickupSlot.value,
        items,
      }),
    });
    payload = await response.json();
  } catch {
    elements.orderStatus.textContent = "Unable to reach checkout right now.";
    return;
  }

  if (!response.ok) {
    elements.orderStatus.textContent = payload.message || "Order failed.";
    return;
  }

  if (shopData.paymentEnabled) {
    if (!window.Razorpay || !payload.checkoutConfig) {
      elements.orderStatus.textContent = "Online payment is unavailable right now. Please try again.";
      return;
    }

    const checkout = new window.Razorpay({
      ...payload.checkoutConfig,
      modal: {
        ondismiss: async () => {
          const failed = await markPaymentFailed(payload.orderId);
          elements.orderStatus.textContent = failed.message || "Payment cancelled.";
        },
      },
    });

    checkout.on("payment.failed", async () => {
      const failed = await markPaymentFailed(payload.orderId);
      elements.orderStatus.textContent = failed.message || "Payment failed.";
    });

    try {
      checkout.open();
    } catch {
      elements.orderStatus.textContent = "Unable to open Razorpay checkout right now.";
    }
    return;
  }

  elements.orderStatus.textContent = `${payload.message} Reception has table ${payload.order.tableNumber}.`;
  cart.clear();
  elements.orderForm.reset();
  renderCart();
  renderMenu(filteredItems);
  setMascotLine(mascotLines[3]);
}

async function loadShop() {
  const response = await fetch(`${API_BASE}/shop`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error("Unable to load shop.");
  }

  shopData = payload;
  filteredItems = payload.menu.slice();
  document.title = payload.brand.name;
  renderHero(payload);
  renderMenu(filteredItems);
  renderCart();
  elements.pickupSlot.innerHTML = payload.pickupSlots.map((slot) => `<option value="${slot}">${slot}</option>`).join("");
  elements.paymentRecipient.textContent = payload.paymentRecipient;
  elements.paymentRecipientUpi.textContent = `${payload.paymentRecipientUpi} • ${payload.paymentRecipientPhone}`;
  elements.orderStorage.textContent = payload.orderStorageLabel;
  elements.payButton.textContent = payload.paymentEnabled ? "Pay & order" : "Place order";
}

async function loadSiteContent() {
  const response = await fetch(`${API_BASE}/site-content`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error("Unable to load sections.");
  }
  siteContent = payload;
  renderBottomSections();
}

async function submitFeedback(event) {
  event.preventDefault();

  const response = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: elements.customerName.value.trim() || "Guest",
      rating: Number(elements.feedbackRating.value),
      message: elements.feedbackMessage.value.trim(),
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    elements.feedbackStatus.textContent = payload.message || "Feedback failed.";
    return;
  }

  elements.feedbackStatus.textContent = payload.message;
  elements.feedbackForm.reset();
}

function bindEvents() {
  document.addEventListener("pointermove", (event) => {
    trackEyes(event);
    applyParallax(event);
  });

  window.addEventListener("mouseleave", resetParallax);
  window.addEventListener("blur", resetParallax);

  elements.companion.addEventListener("click", () => setMascotLine(mascotLines[1]));
  elements.menuSearch.addEventListener("input", filterMenu);
  elements.menuPrev.addEventListener("click", () => scrollMenu(-1));
  elements.menuNext.addEventListener("click", () => scrollMenu(1));
  elements.openMenuModal.addEventListener("click", openMenuModal);
  elements.menuImage.addEventListener("click", openMenuModal);
  elements.closeGalleryModal.addEventListener("click", closeGalleryModal);
  elements.closeMenuModal.addEventListener("click", closeMenuModal);
  document.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      if (node.dataset.closeModal === "gallery") {
        closeGalleryModal();
      } else {
        closeMenuModal();
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeGalleryModal();
      closeMenuModal();
    }
  });
  elements.orderForm.addEventListener("submit", (event) => {
    submitOrder(event).catch((error) => {
      elements.orderStatus.textContent = error.message;
    });
  });
  elements.feedbackForm.addEventListener("submit", (event) => {
    submitFeedback(event).catch((error) => {
      elements.feedbackStatus.textContent = error.message;
    });
  });
}

async function init() {
  bindLoader();
  bindEvents();
  setupRevealObserver();
  setupSectionObserver();
  await loadShop();
  await loadSiteContent();
  setMascotLine(mascotLines[0]);
  applyPaymentStatusFromUrl();
  setupRevealObserver();
}

init().catch((error) => {
  elements.orderStatus.textContent = error.message;
});
