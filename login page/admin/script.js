const API_BASE = `${window.location.origin}/api`;

const elements = {
  signoutButton: document.getElementById("signout-button"),
  summaryGrid: document.getElementById("summary-grid"),
  orderSearch: document.getElementById("order-search"),
  resetOrdersButton: document.getElementById("reset-orders-button"),
  ordersBody: document.getElementById("orders-body"),
  ordersEmpty: document.getElementById("orders-empty"),
  pendingOrdersList: document.getElementById("pending-orders-list"),
  pendingOrdersEmpty: document.getElementById("pending-orders-empty"),
  feedbackList: document.getElementById("feedback-list"),
  feedbackEmpty: document.getElementById("feedback-empty"),
  customersBody: document.getElementById("customers-body"),
  customersEmpty: document.getElementById("customers-empty"),
  transactionsBody: document.getElementById("transactions-body"),
  transactionsEmpty: document.getElementById("transactions-empty"),
  productSearch: document.getElementById("product-search"),
  productList: document.getElementById("product-list"),
  productsEmpty: document.getElementById("products-empty"),
  productForm: document.getElementById("product-form"),
  productId: document.getElementById("product-id"),
  productName: document.getElementById("product-name"),
  productCategory: document.getElementById("product-category"),
  productPrice: document.getElementById("product-price"),
  productRoast: document.getElementById("product-roast"),
  productAccent: document.getElementById("product-accent"),
  productDescription: document.getElementById("product-description"),
  productImageUrl: document.getElementById("product-image-url"),
  productImagePreview: document.getElementById("product-image-preview"),
  productImagePlaceholder: document.getElementById("product-image-placeholder"),
  productActive: document.getElementById("product-active"),
  resetProductButton: document.getElementById("reset-product-button"),
  deleteProductButton: document.getElementById("delete-product-button"),
  productStatus: document.getElementById("product-status"),
  siteContentForm: document.getElementById("site-content-form"),
  infoBodyInput: document.getElementById("info-body-input"),
  contactBodyInput: document.getElementById("contact-body-input"),
  locationsBodyInput: document.getElementById("locations-body-input"),
  faqBodyInput: document.getElementById("faq-body-input"),
  galleryEyebrowInput: document.getElementById("gallery-eyebrow-input"),
  galleryTitleInput: document.getElementById("gallery-title-input"),
  galleryDescriptionInput: document.getElementById("gallery-description-input"),
  menuEyebrowInput: document.getElementById("menu-eyebrow-input"),
  menuTitleInput: document.getElementById("menu-title-input"),
  menuDescriptionInput: document.getElementById("menu-description-input"),
  menuImageUrlInput: document.getElementById("menu-image-url-input"),
  siteContentStatus: document.getElementById("site-content-status"),
  contentPreviewGrid: document.getElementById("content-preview-grid"),
  applyMenuImageButton: document.getElementById("apply-menu-image-button"),
};

for (let index = 1; index <= 5; index += 1) {
  elements[`galleryItem${index}Title`] = document.getElementById(`gallery-item-${index}-title`);
  elements[`galleryItem${index}CoverUrl`] = document.getElementById(`gallery-item-${index}-cover-url`);
  elements[`galleryItem${index}ImageUrls`] = document.getElementById(`gallery-item-${index}-image-urls`);
  elements[`applyGalleryImage${index}Button`] = document.getElementById(`apply-gallery-image-${index}-button`);
}

for (let index = 1; index <= 3; index += 1) {
  elements[`contactItem${index}Label`] = document.getElementById(`contact-item-${index}-label`);
  elements[`contactItem${index}Value`] = document.getElementById(`contact-item-${index}-value`);
}

for (let index = 1; index <= 2; index += 1) {
  elements[`locationItem${index}Name`] = document.getElementById(`location-item-${index}-name`);
  elements[`locationItem${index}Detail`] = document.getElementById(`location-item-${index}-detail`);
}

let adminData = {
  summary: {},
  orders: [],
  transactions: [],
  products: [],
  feedback: [],
  customers: [],
  siteContent: null,
};
let bootstrapIntervalId = null;
let isSiteContentDirty = false;

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(0)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatItems(items) {
  return items.map((item) => `${item.name} x${item.quantity}`).join(", ");
}

function productMatchesSearch(product) {
  const query = elements.productSearch.value.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [product.name, product.category, product.roast, product.accent, product.description]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function orderMatchesSearch(order) {
  const query = elements.orderSearch.value.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return [order.customerName, order.userEmail, order.tableNumber, formatItems(order.items)]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function setImagePreview(url) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) {
    elements.productImagePreview.hidden = true;
    elements.productImagePreview.removeAttribute("src");
    elements.productImagePlaceholder.hidden = false;
    return;
  }

  elements.productImagePreview.src = safeUrl;
  elements.productImagePreview.hidden = false;
  elements.productImagePlaceholder.hidden = true;
}

function resetProductForm() {
  elements.productForm.reset();
  elements.productId.value = "";
  elements.productActive.checked = true;
  elements.productStatus.textContent = "";
  elements.deleteProductButton.hidden = true;
  setImagePreview("");
}

function hydrateProductForm(product) {
  elements.productId.value = product.id;
  elements.productName.value = product.name;
  elements.productCategory.value = product.category;
  elements.productPrice.value = String(product.price);
  elements.productRoast.value = product.roast;
  elements.productAccent.value = product.accent;
  elements.productDescription.value = product.description || "";
  elements.productImageUrl.value = product.imageUrl || "";
  elements.productActive.checked = product.isActive;
  elements.productStatus.textContent = `Editing ${product.name}`;
  elements.deleteProductButton.hidden = false;
  setImagePreview(product.imageUrl);
}

function renderSummary() {
  const cards = [
    { label: "Total orders", value: adminData.summary.totalOrders || 0, tone: "neutral" },
    { label: "Pending orders", value: adminData.summary.pendingOrders || 0, tone: "warn" },
    { label: "Paid orders", value: adminData.summary.paidOrders || 0, tone: "success" },
    { label: "Revenue", value: formatCurrency(adminData.summary.totalRevenue || 0), tone: "accent" },
    { label: "Live products", value: adminData.summary.liveProducts || 0, tone: "neutral" },
    { label: "Hidden products", value: adminData.summary.hiddenProducts || 0, tone: "danger" },
  ];

  elements.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${card.tone}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderOrders() {
  const rows = adminData.orders.filter(orderMatchesSearch);
  if (!rows.length) {
    elements.ordersBody.innerHTML = "";
    elements.ordersEmpty.hidden = false;
    return;
  }

  elements.ordersEmpty.hidden = true;
  elements.ordersBody.innerHTML = rows
    .map(
      (order) => `
        <tr>
          <td>${new Date(order.createdAt).toLocaleString()}</td>
          <td>
            <strong>${escapeHtml(order.customerName)}</strong><br />
            <span>${escapeHtml(order.userEmail)}</span>
          </td>
          <td>${escapeHtml(order.tableNumber)}</td>
          <td>${escapeHtml(formatItems(order.items))}</td>
          <td>${formatCurrency(order.totalAmount)}</td>
          <td><span class="pill ${order.paymentStatus === "paid" ? "success" : order.paymentStatus === "failed" ? "danger" : "warn"}">${escapeHtml(order.paymentStatus)}</span></td>
          <td>
            <select class="status-select" data-order-id="${order.id}">
              ${["placed", "paid", "payment_failed", "brewing", "ready", "served", "cancelled"]
                .map(
                  (status) =>
                    `<option value="${status}" ${status === order.orderStatus ? "selected" : ""} ${
                      order.paymentStatus !== "paid" && ["brewing", "ready", "served"].includes(status) ? "disabled" : ""
                    }>${status}</option>`
                )
                .join("")}
            </select>
          </td>
        </tr>
      `
    )
    .join("");

  elements.ordersBody.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const response = await fetch(`${API_BASE}/admin/orders/${select.dataset.orderId}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: select.value }),
      });
      const payload = await response.json();
      if (!response.ok) {
        elements.productStatus.textContent = payload.message || "Unable to update order status.";
        return;
      }
      await loadAdminData();
    });
  });
}

function renderPendingOrders() {
  const pendingOrders = adminData.orders.filter((order) => ["placed", "paid", "brewing"].includes(order.orderStatus));
  if (!pendingOrders.length) {
    elements.pendingOrdersList.innerHTML = "";
    elements.pendingOrdersEmpty.hidden = false;
    return;
  }

  elements.pendingOrdersEmpty.hidden = true;
  elements.pendingOrdersList.innerHTML = pendingOrders
    .map(
      (order) => `
        <article class="queue-item">
          <div class="queue-top">
            <strong>${escapeHtml(order.customerName)}</strong>
            <span class="pill ${order.paymentStatus === "paid" ? "success" : "warn"}">${escapeHtml(order.orderStatus)}</span>
          </div>
          <span>${escapeHtml(order.userEmail)}</span>
          <span>Table ${escapeHtml(order.tableNumber)} • ${formatCurrency(order.totalAmount)}</span>
          <span>${escapeHtml(formatItems(order.items))}</span>
        </article>
      `
    )
    .join("");
}

function renderFeedback() {
  if (!adminData.feedback.length) {
    elements.feedbackList.innerHTML = "";
    elements.feedbackEmpty.hidden = false;
    return;
  }

  elements.feedbackEmpty.hidden = true;
  elements.feedbackList.innerHTML = adminData.feedback
    .map(
      (entry) => `
        <article class="feedback-item">
          <div class="queue-top">
            <strong>${escapeHtml(entry.customerName)}</strong>
            <span class="rating">${"★".repeat(entry.rating)}</span>
          </div>
          <span>${escapeHtml(entry.message)}</span>
          <span>${new Date(entry.createdAt).toLocaleString()}</span>
        </article>
      `
    )
    .join("");
}

function renderCustomers() {
  if (!adminData.customers.length) {
    elements.customersBody.innerHTML = "";
    elements.customersEmpty.hidden = false;
    return;
  }

  elements.customersEmpty.hidden = true;
  elements.customersBody.innerHTML = adminData.customers
    .map(
      (customer) => `
        <tr>
          <td>${escapeHtml(customer.name)}</td>
          <td>${escapeHtml(customer.email)}</td>
          <td>${escapeHtml(customer.phone || "-")}</td>
          <td>${escapeHtml(customer.provider)}</td>
          <td>${escapeHtml(customer.role)}</td>
          <td>${new Date(customer.createdAt).toLocaleString()}</td>
        </tr>
      `
    )
    .join("");
}

function renderTransactions() {
  if (!adminData.transactions.length) {
    elements.transactionsBody.innerHTML = "";
    elements.transactionsEmpty.hidden = false;
    return;
  }

  elements.transactionsEmpty.hidden = true;
  elements.transactionsBody.innerHTML = adminData.transactions
    .map(
      (transaction) => `
        <tr>
          <td>${new Date(transaction.createdAt).toLocaleString()}</td>
          <td>
            <strong>${escapeHtml(transaction.customerName)}</strong><br />
            <span>${escapeHtml(transaction.userEmail)}</span>
          </td>
          <td>${formatCurrency(transaction.amount)}</td>
          <td><span class="pill ${transaction.paymentStatus === "paid" ? "success" : transaction.paymentStatus === "failed" ? "danger" : "warn"}">${escapeHtml(transaction.paymentStatus)}</span></td>
          <td>${escapeHtml(transaction.orderStatus)}</td>
          <td class="reference-cell">${escapeHtml(transaction.paymentReference)}<br /><span>${escapeHtml(transaction.gatewayOrderId)}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderProducts() {
  const products = adminData.products.filter(productMatchesSearch);
  if (!products.length) {
    elements.productList.innerHTML = "";
    elements.productsEmpty.hidden = false;
    return;
  }

  elements.productsEmpty.hidden = true;
  elements.productList.innerHTML = products
    .map(
      (product) => `
        <article class="product-item" data-product-id="${product.id}">
          <div class="product-item-media">
            ${
              product.imageUrl
                ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />`
                : `<div class="product-image-fallback">${escapeHtml(product.name.slice(0, 1).toUpperCase())}</div>`
            }
          </div>
          <div class="product-item-body">
            <div class="product-item-header">
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.category)} • ${formatCurrency(product.price)}</span>
              </div>
              <span class="pill ${product.isActive ? "success" : "inactive"}">${product.isActive ? "live" : "hidden"}</span>
            </div>
            <p>${escapeHtml(product.description || product.accent)}</p>
            <div class="product-meta">
              <span>${escapeHtml(product.roast)}</span>
              <span>${escapeHtml(product.accent)}</span>
            </div>
            <div class="product-item-actions">
              <span>Updated ${new Date(product.updatedAt).toLocaleString()}</span>
              <button class="mini-button edit-product-button" type="button" data-product-id="${product.id}">Edit</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  elements.productList.querySelectorAll(".edit-product-button").forEach((button) => {
    button.addEventListener("click", () => {
      const product = adminData.products.find((item) => item.id === button.dataset.productId);
      if (product) {
        hydrateProductForm(product);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}

function hydrateSiteContentForm() {
  if (isSiteContentDirty) {
    return;
  }

  const content = adminData.siteContent || {};
  const gallery = content.gallery || {};
  const menu = gallery.menu || {};
  const items = Array.isArray(gallery.items)
    ? gallery.items
    : Array.from({ length: 5 }, (_, index) => ({
        title: gallery.images?.[index]?.caption || "",
        coverImageUrl: gallery.images?.[index]?.imageUrl || "",
        imageUrls: gallery.images?.[index]?.imageUrl ? [gallery.images[index].imageUrl] : [],
      }));
  const contactItems = Array.isArray(content.contactItems) ? content.contactItems : [];
  const locationsList = Array.isArray(content.locationsList) ? content.locationsList : [];

  elements.infoBodyInput.value = content.info?.body || "";
  elements.contactBodyInput.value = content.contact?.body || "";
  elements.locationsBodyInput.value = content.locations?.body || "";
  elements.faqBodyInput.value = content.faq?.body || "";
  elements.galleryEyebrowInput.value = gallery.eyebrow || "";
  elements.galleryTitleInput.value = gallery.title || "";
  elements.galleryDescriptionInput.value = gallery.description || "";
  elements.menuEyebrowInput.value = menu.eyebrow || "";
  elements.menuTitleInput.value = menu.title || "";
  elements.menuDescriptionInput.value = menu.description || "";
  elements.menuImageUrlInput.value = menu.imageUrl || "";

  for (let index = 1; index <= 5; index += 1) {
    const item = items[index - 1] || {};
    elements[`galleryItem${index}Title`].value = item.title || "";
    elements[`galleryItem${index}CoverUrl`].value = item.coverImageUrl || "";
    elements[`galleryItem${index}ImageUrls`].value = Array.isArray(item.imageUrls) ? item.imageUrls.join("\n") : "";
  }

  for (let index = 1; index <= 3; index += 1) {
    const item = contactItems[index - 1] || {};
    elements[`contactItem${index}Label`].value = item.label || "";
    elements[`contactItem${index}Value`].value = item.value || "";
  }

  for (let index = 1; index <= 2; index += 1) {
    const item = locationsList[index - 1] || {};
    elements[`locationItem${index}Name`].value = item.name || "";
    elements[`locationItem${index}Detail`].value = item.detail || "";
  }
}

function renderContentPreview() {
  const content = adminData.siteContent || {};
  const gallery = content.gallery || {};
  const items = Array.isArray(gallery.items)
    ? gallery.items
    : Array.from({ length: 5 }, (_, index) => ({
        title: gallery.images?.[index]?.caption || `Gallery ${index + 1}`,
        coverImageUrl: gallery.images?.[index]?.imageUrl || "",
        imageUrls: gallery.images?.[index]?.imageUrl ? [gallery.images[index].imageUrl] : [],
      }));
  const menu = gallery.menu || {};

  const cards = items
    .map(
      (item, index) => `
        <article class="content-preview-card">
          <div class="content-preview-media">
            ${item.coverImageUrl ? `<img src="${escapeHtml(item.coverImageUrl)}" alt="${escapeHtml(item.title || `Gallery ${index + 1}`)}" />` : `<div class="product-image-fallback">${index + 1}</div>`}
          </div>
          <strong>${escapeHtml(item.title || `Gallery ${index + 1}`)}</strong>
          <span>${escapeHtml(item.imageUrls?.length ? `${item.imageUrls.length} image links` : "No image links set")}</span>
        </article>
      `
    )
    .join("");

  const menuCard = `
    <article class="content-preview-card wide">
      <div class="content-preview-media wide">
        ${menu.imageUrl ? `<img src="${escapeHtml(menu.imageUrl)}" alt="${escapeHtml(menu.title || "Menu image")}" />` : `<div class="product-image-fallback">Menu</div>`}
      </div>
      <strong>${escapeHtml(menu.title || "Menu image")}</strong>
      <span>${escapeHtml(menu.imageUrl || "No menu image URL set")}</span>
    </article>
  `;

  elements.contentPreviewGrid.innerHTML = cards + menuCard;
}

async function loadAdminData() {
  const response = await fetch(`${API_BASE}/admin/bootstrap`, { credentials: "same-origin" });
  if (!response.ok) {
    window.location.href = "/";
    return;
  }

  adminData = await response.json();
  renderSummary();
  renderOrders();
  renderPendingOrders();
  renderFeedback();
  renderCustomers();
  renderTransactions();
  renderProducts();
  hydrateSiteContentForm();
  renderContentPreview();
}

function startLiveRefresh() {
  if (bootstrapIntervalId) {
    window.clearInterval(bootstrapIntervalId);
  }

  bootstrapIntervalId = window.setInterval(() => {
    if (document.hidden) {
      return;
    }
    loadAdminData().catch(() => {
      // Keep current UI if one refresh fails.
    });
  }, 2000);
}

async function saveProduct(event) {
  event.preventDefault();

  const payload = {
    id: elements.productId.value.trim(),
    name: elements.productName.value.trim(),
    category: elements.productCategory.value.trim(),
    price: Number(elements.productPrice.value),
    roast: elements.productRoast.value.trim(),
    accent: elements.productAccent.value.trim(),
    description: elements.productDescription.value.trim(),
    imageUrl: elements.productImageUrl.value.trim(),
    isActive: elements.productActive.checked,
  };

  const editingId = elements.productId.value.trim();
  const endpoint = editingId ? `${API_BASE}/admin/products/${editingId}` : `${API_BASE}/admin/products`;
  const method = editingId ? "PATCH" : "POST";

  const response = await fetch(endpoint, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    elements.productStatus.textContent = result.message || "Unable to save product.";
    return;
  }

  elements.productStatus.textContent = result.message;
  resetProductForm();
  await loadAdminData();
}

async function deleteCurrentProduct() {
  const editingId = elements.productId.value.trim();
  if (!editingId) {
    elements.productStatus.textContent = "Choose a product to delete.";
    return;
  }

  const response = await fetch(`${API_BASE}/admin/products/${editingId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const result = await response.json();

  if (!response.ok) {
    elements.productStatus.textContent = result.message || "Unable to delete product.";
    return;
  }

  elements.productStatus.textContent = result.message;
  resetProductForm();
  await loadAdminData();
}

async function resetAllOrders() {
  const confirmed = window.confirm("Delete all order data for every user? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  elements.productStatus.textContent = "Resetting all orders...";
  const response = await fetch(`${API_BASE}/admin/orders`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const result = await response.json();

  if (!response.ok) {
    elements.productStatus.textContent = result.message || "Unable to reset orders.";
    return;
  }

  elements.productStatus.textContent = result.message;
  await loadAdminData();
}

async function saveSiteContent(event) {
  event?.preventDefault?.();

  const payload = {
    info: {
      body: elements.infoBodyInput.value.trim(),
    },
    contact: {
      body: elements.contactBodyInput.value.trim(),
    },
    locations: {
      body: elements.locationsBodyInput.value.trim(),
    },
    faq: {
      body: elements.faqBodyInput.value.trim(),
    },
    contactItems: Array.from({ length: 3 }, (_, index) => ({
      label: elements[`contactItem${index + 1}Label`].value.trim(),
      value: elements[`contactItem${index + 1}Value`].value.trim(),
    })),
    locationsList: Array.from({ length: 2 }, (_, index) => ({
      name: elements[`locationItem${index + 1}Name`].value.trim(),
      detail: elements[`locationItem${index + 1}Detail`].value.trim(),
    })),
    gallery: {
      eyebrow: elements.galleryEyebrowInput.value.trim(),
      title: elements.galleryTitleInput.value.trim(),
      description: elements.galleryDescriptionInput.value.trim(),
      items: Array.from({ length: 5 }, (_, index) => ({
        title: elements[`galleryItem${index + 1}Title`].value.trim(),
        coverImageUrl: elements[`galleryItem${index + 1}CoverUrl`].value.trim(),
        imageUrls: elements[`galleryItem${index + 1}ImageUrls`].value
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 10),
      })),
      menu: {
        eyebrow: elements.menuEyebrowInput.value.trim(),
        title: elements.menuTitleInput.value.trim(),
        description: elements.menuDescriptionInput.value.trim(),
        imageUrl: elements.menuImageUrlInput.value.trim(),
      },
    },
  };

  const response = await fetch(`${API_BASE}/admin/site-content`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    elements.siteContentStatus.textContent = result.message || "Unable to save website content.";
    return;
  }

  isSiteContentDirty = false;
  elements.siteContentStatus.textContent = result.message;
  await loadAdminData();
}

async function applySiteContentSection(message) {
  await saveSiteContent();
  elements.siteContentStatus.textContent = message;
}

function bindEvents() {
  elements.productForm.addEventListener("submit", (event) => {
    saveProduct(event).catch((error) => {
      elements.productStatus.textContent = error.message;
    });
  });

  elements.resetProductButton.addEventListener("click", resetProductForm);
  elements.deleteProductButton.addEventListener("click", () => {
    deleteCurrentProduct().catch((error) => {
      elements.productStatus.textContent = error.message;
    });
  });
  elements.productImageUrl.addEventListener("input", () => setImagePreview(elements.productImageUrl.value));
  elements.productSearch.addEventListener("input", renderProducts);
  elements.orderSearch.addEventListener("input", renderOrders);
  elements.resetOrdersButton.addEventListener("click", () => {
    resetAllOrders().catch((error) => {
      elements.productStatus.textContent = error.message;
    });
  });
  elements.siteContentForm.addEventListener("submit", (event) => {
    saveSiteContent(event).catch((error) => {
      elements.siteContentStatus.textContent = error.message;
    });
  });
  elements.siteContentForm.querySelectorAll("input, textarea, select").forEach((field) => {
    field.addEventListener("input", () => {
      isSiteContentDirty = true;
    });
  });
  elements.applyMenuImageButton.addEventListener("click", () => {
    applySiteContentSection("Menu image applied.").catch((error) => {
      elements.siteContentStatus.textContent = error.message;
    });
  });

  for (let index = 1; index <= 5; index += 1) {
    elements[`applyGalleryImage${index}Button`].addEventListener("click", () => {
      applySiteContentSection(`Image ${index} applied.`).catch((error) => {
        elements.siteContentStatus.textContent = error.message;
      });
    });
  }

  elements.signoutButton.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/auth/signout`, {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.href = "/";
    }
  });
}

bindEvents();
resetProductForm();
loadAdminData();
startLiveRefresh();
