const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const {
  DB_PATH,
  createFeedback,
  createOrder,
  createProduct,
  createUser,
  deleteAllOrders,
  deleteProduct,
  findOrderById,
  findProductById,
  getSiteContent,
  findUserByEmail,
  findUserByProvider,
  listUsers,
  listAllOrders,
  listFeedback,
  listOrdersByUser,
  listProducts,
  upsertAdminUser,
  updateOAuthUser,
  updateOrderPayment,
  updateOrderStatus,
  updateProduct,
  updateSiteContent,
} = require("./database");

const app = express();
const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const ADMIN_DIR = path.join(ROOT_DIR, "admin");
const PORT = Number(process.env.PORT || 3000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_COOKIE = "auth_token";
const OAUTH_STATE_COOKIE = "oauth_state";
const AUTH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "shwet5053@gmail.com");
const ADMIN_PHONE = normalizePhone(process.env.ADMIN_PHONE || "9431505374");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "1234567890");
const adminOtpStore = new Map();

const PAYMENT_RECIPIENT = normalizeText(process.env.PAYMENT_RECIPIENT || "Shwets Coffee Shop", 120);
const ORDER_STORAGE_LABEL = normalizeText(
  process.env.ORDER_STORAGE_LABEL || `SQLite orders sheet (${path.relative(ROOT_DIR, DB_PATH)})`,
  160
);
const PAYMENT_RECIPIENT_PHONE = normalizeText(process.env.PAYMENT_RECIPIENT_PHONE || "9431505374", 30);
const PAYMENT_RECIPIENT_UPI = normalizeText(process.env.PAYMENT_RECIPIENT_UPI || "9431505374-2@axl", 120);

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

const PROVIDER_CONFIG = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`,
    scope: "openid email profile",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/auth/facebook/callback`,
    scope: "email,public_profile",
    authUrl: "https://www.facebook.com/v23.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v23.0/oauth/access_token",
    userUrl: "https://graph.facebook.com/me?fields=id,name,email",
  },
};

app.use(cors({ origin: APP_URL }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
        frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        connectSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Too many requests from this IP, please try again after 15 minutes", isRateLimited: true },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many authentication attempts from this IP, please try again after 15 minutes", isRateLimited: true },
});

app.use("/api/", apiLimiter);

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const [key, ...rest] = part.split("=");
      cookies[key] = decodeURIComponent(rest.join("="));
      return cookies;
    }, {});
}

function setCookie(res, name, value, maxAgeMs) {
  const expiresAt = new Date(Date.now() + maxAgeMs).toUTCString();
  const secureFlag = process.env.NODE_ENV === "production" ? "Secure; " : "";
  res.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Strict; ${secureFlag}Expires=${expiresAt}; Max-Age=${Math.floor(
      maxAgeMs / 1000
    )}`
  );
}

function clearCookie(res, name) {
  res.append("Set-Cookie", `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function normalizeText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, 254).toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").slice(-15);
}

function buildCoffeeRedirect(params = {}) {
  const url = new URL("/coffee", APP_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function finalizeRazorpayPayment(order, razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const expectedOrderId = order.razorpayOrderId || "";
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${expectedOrderId}|${razorpayPaymentId}`).digest("hex");

  if (
    !expectedOrderId ||
    !razorpayOrderId ||
    razorpayOrderId !== expectedOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    expected !== razorpaySignature
  ) {
    updateOrderPayment(order.id, "failed", null, razorpayOrderId || expectedOrderId, razorpayPaymentId);
    updateOrderStatus(order.id, "payment_failed");
    return { ok: false, message: "Payment verification failed." };
  }

  updateOrderPayment(order.id, "paid", null, razorpayOrderId, razorpayPaymentId);
  const paidOrder = updateOrderStatus(order.id, "paid");
  return {
    ok: true,
    message: `Payment received. Reception has table ${paidOrder.tableNumber}.`,
    order: paidOrder,
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userRoleForEmail(email) {
  return normalizeEmail(email) === ADMIN_EMAIL ? "admin" : "customer";
}

function createToken(user) {
  const userId = user.id || user.sub;
  return jwt.sign(
    { sub: userId, email: user.email, name: user.name, provider: user.provider, role: user.role },
    JWT_SECRET,
    { expiresIn: Math.floor(AUTH_SESSION_MAX_AGE_MS / 1000) }
  );
}

function persistAuthSession(res, user) {
  setCookie(res, AUTH_COOKIE, createToken(user), AUTH_SESSION_MAX_AGE_MS);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    provider: user.provider,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function authTokenFromRequest(req) {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : "";
  return bearer || cookies[AUTH_COOKIE] || "";
}

function requireAuth(req, res, next) {
  const token = authTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    persistAuthSession(res, req.auth);
    return next();
  } catch {
    clearCookie(res, AUTH_COOKIE);
    return res.status(401).json({ message: "Session is invalid or expired." });
  }
}

function requirePageAuth(req, res, next) {
  const token = authTokenFromRequest(req);
  if (!token) {
    return res.redirect("/admin-login");
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    persistAuthSession(res, req.auth);
    return next();
  } catch {
    clearCookie(res, AUTH_COOKIE);
    return res.redirect("/admin-login");
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth.role !== "admin") {
      return res.status(403).json({ message: "Admin access required." });
    }
    return next();
  });
}

function requireAdminPage(req, res, next) {
  requirePageAuth(req, res, () => {
    if (req.auth.role !== "admin") {
      return res.redirect("/admin-login");
    }
    return next();
  });
}

function configuredProvider(provider) {
  const config = PROVIDER_CONFIG[provider];
  return Boolean(config?.clientId && config?.clientSecret && config?.redirectUri);
}

function createState(provider) {
  return Buffer.from(
    JSON.stringify({ provider, nonce: crypto.randomBytes(16).toString("hex"), issuedAt: Date.now() }),
    "utf8"
  ).toString("base64url");
}

function validateState(req, provider, incomingState) {
  const storedState = parseCookies(req)[OAUTH_STATE_COOKIE];
  if (!storedState || !incomingState || storedState !== incomingState) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(storedState, "base64url").toString("utf8"));
    return decoded.provider === provider && Date.now() - decoded.issuedAt < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

async function exchangeCodeForToken(provider, code) {
  const config = PROVIDER_CONFIG[provider];
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  if (provider === "google") {
    params.set("grant_type", "authorization_code");
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    return response.json();
  }

  const response = await fetch(`${config.tokenUrl}?${params.toString()}`);
  return response.json();
}

async function fetchProviderProfile(provider, accessToken) {
  const config = PROVIDER_CONFIG[provider];
  const response = await fetch(config.userUrl, {
    headers: provider === "google" ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  return response.json();
}

async function findOrCreateOAuthUser(provider, profile) {
  const providerId = String(profile.sub || profile.id || "");
  const email = normalizeEmail(profile.email || `${providerId}@${provider}.local`);
  const name = normalizeText(profile.name || "Coffee Guest", 80);
  const role = userRoleForEmail(email);

  const existingProvider = findUserByProvider(provider, providerId);
  if (existingProvider) {
    return updateOAuthUser(existingProvider.id, name, email, role);
  }

  const existingEmail = findUserByEmail(email);
  if (existingEmail) {
    return updateOAuthUser(existingEmail.id, name, email, role);
  }

  return createUser({
    id: crypto.randomUUID(),
    name,
    email,
    phone: null,
    passwordHash: null,
    provider,
    providerId,
    role,
    createdAt: new Date().toISOString(),
  });
}

function syncAdminUser() {
  return upsertAdminUser({
    id: crypto.randomUUID(),
    name: "Admin",
    email: ADMIN_EMAIL,
    phone: ADMIN_PHONE,
    passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    provider: "admin-credentials",
    providerId: ADMIN_PHONE,
    role: "admin",
    createdAt: new Date().toISOString(),
  });
}

syncAdminUser();

function guestIdentityFromRequest(req) {
  const requestedName = normalizeText(req.body.customerName, 80);
  const requestedEmail = normalizeEmail(req.body.userEmail);
  const authName = req.auth?.name;
  const authEmail = req.auth?.email;

  return {
    customerName: requestedName || normalizeText(authName, 80) || "Guest",
    userEmail: requestedEmail || normalizeEmail(authEmail) || "guest@local",
  };
}

function parseOrderInput(req) {
  const { customerName, userEmail } = guestIdentityFromRequest(req);
  return {
    customerName,
    userEmail,
    pickupSlot: normalizeText(req.body.pickupSlot, 40),
    tableNumber: normalizeText(req.body.tableNumber, 20),
    items: Array.isArray(req.body.items) ? req.body.items.slice(0, 25) : [],
  };
}

function normalizeProductInput(body, existing = {}) {
  return {
    name: normalizeText(body.name ?? existing.name, 80),
    category: normalizeText(body.category ?? existing.category, 40) || "espresso",
    price: Number(body.price ?? existing.price ?? 0),
    roast: normalizeText(body.roast ?? existing.roast, 80),
    accent: normalizeText(body.accent ?? existing.accent, 160),
    description: normalizeText(body.description ?? existing.description, 240),
    imageUrl: normalizeText(body.imageUrl ?? existing.imageUrl, 500),
    isActive:
      typeof body.isActive === "boolean" ? body.isActive : body.isActive === "false" ? false : body.isActive === "true" ? true : existing.isActive ?? true,
  };
}

function normalizeSiteContentInput(body, existing = getSiteContent()) {
  const input = body && typeof body === "object" ? body : {};
  const current = existing && typeof existing === "object" ? existing : {};
  const currentGallery = current.gallery || {};
  const currentMenu = currentGallery.menu || {};
  const incomingGallery = input.gallery || {};
  const incomingMenu = incomingGallery.menu || {};
  const fallbackTitles = ["Counter view", "Signature serve", "Seating area", "Bean bar", "Interior mood"];

  const currentGalleryItems = Array.from({ length: 5 }, (_, index) => {
    const item = Array.isArray(currentGallery.items) ? currentGallery.items[index] || {} : {};
    const legacy = Array.isArray(currentGallery.images) ? currentGallery.images[index] || {} : {};
    return {
      title: item.title || legacy.caption || fallbackTitles[index],
      coverImageUrl: item.coverImageUrl || legacy.imageUrl || "",
      imageUrls: Array.isArray(item.imageUrls)
        ? item.imageUrls
        : legacy.imageUrl
          ? [legacy.imageUrl]
          : [],
    };
  });

  const galleryItems = Array.from({ length: 5 }, (_, index) => {
    const previous = currentGalleryItems[index] || {};
    const next = Array.isArray(incomingGallery.items) ? incomingGallery.items[index] || {} : {};
    const nextImageUrls = Array.isArray(next.imageUrls) ? next.imageUrls : previous.imageUrls || [];
    return {
      title: normalizeText(next.title ?? previous.title, 80) || fallbackTitles[index],
      coverImageUrl: normalizeText(next.coverImageUrl ?? previous.coverImageUrl, 500),
      imageUrls: Array.from({ length: 10 }, (_, imageIndex) =>
        normalizeText(nextImageUrls[imageIndex] ?? previous.imageUrls?.[imageIndex], 500)
      ).filter(Boolean),
    };
  });

  return {
    info: {
      body: normalizeText(input.info?.body ?? current.info?.body, 240),
    },
    contact: {
      body: normalizeText(input.contact?.body ?? current.contact?.body, 240),
    },
    locations: {
      body: normalizeText(input.locations?.body ?? current.locations?.body, 240),
    },
    faq: {
      body: normalizeText(input.faq?.body ?? current.faq?.body, 240),
    },
    contactItems: Array.from({ length: 3 }, (_, index) => {
      const previous = Array.isArray(current.contactItems) ? current.contactItems[index] || {} : {};
      const next = Array.isArray(input.contactItems) ? input.contactItems[index] || {} : {};
      return {
        label: normalizeText(next.label ?? previous.label, 40),
        value: normalizeText(next.value ?? previous.value, 120),
      };
    }),
    locationsList: Array.from({ length: 2 }, (_, index) => {
      const previous = Array.isArray(current.locationsList) ? current.locationsList[index] || {} : {};
      const next = Array.isArray(input.locationsList) ? input.locationsList[index] || {} : {};
      return {
        name: normalizeText(next.name ?? previous.name, 40),
        detail: normalizeText(next.detail ?? previous.detail, 120),
      };
    }),
    gallery: {
      eyebrow: normalizeText(incomingGallery.eyebrow ?? currentGallery.eyebrow, 40),
      title: normalizeText(incomingGallery.title ?? currentGallery.title, 80),
      description: normalizeText(incomingGallery.description ?? currentGallery.description, 180),
      items: galleryItems,
      menu: {
        eyebrow: normalizeText(incomingMenu.eyebrow ?? currentMenu.eyebrow, 40),
        title: normalizeText(incomingMenu.title ?? currentMenu.title, 80),
        description: normalizeText(incomingMenu.description ?? currentMenu.description, 220),
        imageUrl: normalizeText(incomingMenu.imageUrl ?? currentMenu.imageUrl, 500),
      },
    },
  };
}

function summarizeAdminMetrics(orders, products, feedback) {
  const paidOrders = orders.filter((order) => order.paymentStatus === "paid");
  const pendingOrders = orders.filter((order) => ["placed", "paid", "brewing"].includes(order.orderStatus));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return {
    totalOrders: orders.length,
    pendingOrders: pendingOrders.length,
    paidOrders: paidOrders.length,
    totalRevenue: Number(revenue.toFixed(2)),
    liveProducts: products.filter((product) => product.isActive).length,
    hiddenProducts: products.filter((product) => !product.isActive).length,
    feedbackCount: feedback.length,
  };
}

function listTransactions(orders) {
  return orders
    .filter((order) => order.paymentStatus)
    .map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      customerName: order.customerName,
      userEmail: order.userEmail,
      amount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      gatewayOrderId: order.razorpayOrderId || order.stripeSessionId || "offline",
      paymentReference: order.razorpayPaymentId || "not_captured",
      tableNumber: order.tableNumber,
    }))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function summarizeMetrics() {
  const products = listProducts(false);
  return [
    { label: "Live menu items", value: String(products.length).padStart(2, "0") },
    { label: "Average pickup time", value: "08 min" },
    { label: "Orders today", value: String(listAllOrders().length).padStart(2, "0") },
  ];
}

app.use("/frontend", express.static(FRONTEND_DIR));
app.use("/admin-assets", express.static(ADMIN_DIR));
app.use("/uploads", express.static(path.join(__dirname, "data", "uploads")));

app.get("/", (_req, res) => {
  return res.redirect("/coffee");
});

app.get("/coffee", (_req, res) => {
  return res.sendFile(path.join(FRONTEND_DIR, "coffee.html"));
});

app.get("/admin-login", (_req, res) => {
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/admin", requireAdminPage, (_req, res) => {
  return res.sendFile(path.join(ADMIN_DIR, "index.html"));
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = findUserByEmail(normalizeEmail(req.auth.email));
  return res.json({ user: sanitizeUser(user) });
});

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  const name = normalizeText(req.body.name, 80);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const role = userRoleForEmail(email);

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const user = createUser({
    id: crypto.randomUUID(),
    name,
    email,
    phone: null,
    passwordHash: await bcrypt.hash(password, 10),
    provider: "email",
    providerId: null,
    role,
    createdAt: new Date().toISOString(),
  });

  persistAuthSession(res, user);
  return res.status(201).json({ message: "Account created successfully.", user: sanitizeUser(user) });
});

app.post("/api/auth/signin", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const user = findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  persistAuthSession(res, user);
  return res.json({ message: "Signed in successfully.", user: sanitizeUser(user) });
});

app.post("/api/admin/signin", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");

  if (!email || !phone || !password) {
    return res.status(400).json({ message: "Email, phone number, and password are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const user = findUserByEmail(email);
  if (!user || user.role !== "admin" || user.phone !== phone || !user.passwordHash) {
    return res.status(401).json({ message: "Invalid admin credentials." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid admin credentials." });
  }

  persistAuthSession(res, user);
  return res.json({ message: "Admin signed in successfully.", user: sanitizeUser(user) });
});

app.post("/api/admin/request-otp", authLimiter, (req, res) => {
  const phone = normalizePhone(req.body.phone);

  if (!phone || phone !== ADMIN_PHONE) {
    return res.status(401).json({ message: "Admin phone number is not authorized." });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  adminOtpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  console.log(`Admin OTP for ${phone}: ${otp}`);

  return res.json({
    message: "OTP sent to admin phone.",
    devOtp: process.env.NODE_ENV === "production" ? undefined : otp,
  });
});

app.post("/api/admin/verify-otp", (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = normalizeText(req.body.otp, 6);
  const record = adminOtpStore.get(phone);

  if (!phone || phone !== ADMIN_PHONE) {
    return res.status(401).json({ message: "Admin phone number is not authorized." });
  }

  if (!record || record.expiresAt < Date.now() || record.otp !== otp) {
    return res.status(401).json({ message: "Invalid or expired OTP." });
  }

  adminOtpStore.delete(phone);
  const user = syncAdminUser();
  persistAuthSession(res, user);
  return res.json({ message: "Admin signed in successfully with OTP.", user: sanitizeUser(user) });
});

app.post("/api/auth/signout", (_req, res) => {
  clearCookie(res, AUTH_COOKIE);
  return res.json({ message: "Signed out." });
});

app.get("/auth/:provider", (req, res) => {
  const provider = normalizeText(req.params.provider, 20).toLowerCase();
  const config = PROVIDER_CONFIG[provider];

  if (!["google", "facebook"].includes(provider)) {
    return res.status(404).send("Provider not supported.");
  }
  if (!configuredProvider(provider)) {
    return res.status(501).send("Social login is not configured.");
  }

  const state = createState(provider);
  setCookie(res, OAUTH_STATE_COOKIE, state, 10 * 60 * 1000);

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scope);
  authUrl.searchParams.set("state", state);

  if (provider === "google") {
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "consent");
  }

  return res.redirect(authUrl.toString());
});

app.get("/auth/:provider/callback", async (req, res) => {
  const provider = normalizeText(req.params.provider, 20).toLowerCase();
  const code = normalizeText(req.query.code, 2000);
  const state = normalizeText(req.query.state, 1000);
  const error = normalizeText(req.query.error, 200);

  if (error) {
    clearCookie(res, OAUTH_STATE_COOKIE);
    return res.redirect(`/?error=${encodeURIComponent(`${provider} login was canceled.`)}`);
  }
  if (!validateState(req, provider, state)) {
    clearCookie(res, OAUTH_STATE_COOKIE);
    return res.redirect("/?error=Invalid OAuth state. Try again.");
  }
  if (!code) {
    clearCookie(res, OAUTH_STATE_COOKIE);
    return res.redirect("/?error=Authorization code was not returned.");
  }

  try {
    const tokenPayload = await exchangeCodeForToken(provider, code);
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      throw new Error("OAuth login failed.");
    }

    const profile = await fetchProviderProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(provider, profile);
    clearCookie(res, OAUTH_STATE_COOKIE);
    persistAuthSession(res, user);
    return res.redirect(user.role === "admin" ? "/admin" : "/coffee");
  } catch {
    clearCookie(res, OAUTH_STATE_COOKIE);
    return res.redirect("/?error=OAuth login failed.");
  }
});

app.get("/api/shop", (_req, res) => {
  return res.json({
    brand: {
      name: "Shwets Coffee Shop",
      announcement: "Fresh coffee. Fast table service.",
    },
    menu: listProducts(false),
    metrics: summarizeMetrics(),
    pickupSlots: ["10 min", "15 min", "25 min", "40 min"],
    paymentEnabled: Boolean(razorpay),
    paymentGateway: razorpay ? "razorpay" : "offline",
    paymentRecipient: PAYMENT_RECIPIENT,
    paymentRecipientPhone: PAYMENT_RECIPIENT_PHONE,
    paymentRecipientUpi: PAYMENT_RECIPIENT_UPI,
    orderStorageLabel: ORDER_STORAGE_LABEL,
  });
});

app.get("/api/site-content", (_req, res) => {
  return res.json(getSiteContent());
});

app.post("/api/feedback", (req, res) => {
  const { customerName, userEmail } = guestIdentityFromRequest(req);
  const rating = Math.max(1, Math.min(5, Number(req.body.rating || 0)));
  const message = normalizeText(req.body.message, 240);

  if (!rating || !message) {
    return res.status(400).json({ message: "Rating and feedback message are required." });
  }

  const feedback = createFeedback({
    id: crypto.randomUUID(),
    userEmail,
    customerName,
    rating,
    message,
    createdAt: new Date().toISOString(),
  });

  return res.status(201).json({ message: "Feedback saved.", feedback });
});

app.post("/api/orders/checkout", async (req, res) => {
  if (!razorpay) {
    return res.status(501).json({ message: "Payment is not configured yet." });
  }

  const { customerName, userEmail, pickupSlot, tableNumber, items } = parseOrderInput(req);
  if (!customerName || !pickupSlot || !tableNumber || items.length === 0) {
    return res.status(400).json({ message: "Name, table number, pickup slot, and items are required." });
  }

  const productIndex = new Map(listProducts(false).map((item) => [item.id, item]));
  const normalizedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const product = productIndex.get(String(item.id || ""));
    const quantity = Number(item.quantity || 0);

    if (!product || quantity < 1) {
      return res.status(400).json({ message: "Order contains an invalid item." });
    }

    const lineTotal = Number((product.price * quantity).toFixed(2));
    totalAmount += lineTotal;
    normalizedItems.push({
      id: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      lineTotal,
    });
  }

  const order = createOrder({
    id: crypto.randomUUID(),
    userEmail,
    customerName,
    tableNumber,
    itemsJson: JSON.stringify(normalizedItems),
    totalAmount: Number(totalAmount.toFixed(2)),
    pickupSlot,
    paymentStatus: "pending",
    stripeSessionId: null,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    orderStatus: "placed",
    createdAt: new Date().toISOString(),
  });

  let gatewayOrder;
  try {
    gatewayOrder = await razorpay.orders.create({
      amount: Math.round(order.totalAmount * 100),
      currency: "INR",
      receipt: order.id.slice(0, 40),
      notes: {
        appOrderId: order.id,
        customerName,
        tableNumber,
        pickupSlot,
      },
    });
  } catch (error) {
    updateOrderPayment(order.id, "failed", null, null, null);
    updateOrderStatus(order.id, "payment_failed");
    return res.status(502).json({
      message: "Unable to start Razorpay checkout right now.",
      detail: error?.error?.description || error?.message || "Gateway order creation failed.",
    });
  }

  updateOrderPayment(order.id, "pending", null, gatewayOrder.id, null);

  return res.status(201).json({
    message: "Checkout started.",
    orderId: order.id,
    checkoutConfig: {
      key: process.env.RAZORPAY_KEY_ID,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      name: "Shwets Coffee Shop",
      description: `Table ${tableNumber} • ${pickupSlot}`,
      order_id: gatewayOrder.id,
      callback_url: `${APP_URL}/api/orders/razorpay/callback?orderId=${encodeURIComponent(order.id)}`,
      redirect: true,
      prefill: { name: customerName, email: userEmail },
      notes: { tableNumber, pickupSlot },
      theme: { color: "#d7bf97" },
    },
  });
});

app.post("/api/orders/verify-payment", (req, res) => {
  if (!razorpay) {
    return res.status(501).json({ message: "Payment is not configured yet." });
  }

  const orderId = normalizeText(req.body.orderId, 80);
  const razorpayOrderId = normalizeText(req.body.razorpayOrderId, 80);
  const razorpayPaymentId = normalizeText(req.body.razorpayPaymentId, 80);
  const razorpaySignature = normalizeText(req.body.razorpaySignature, 160);
  const order = findOrderById(orderId);

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const result = finalizeRazorpayPayment(order, razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!result.ok) {
    return res.status(400).json({ message: result.message });
  }

  return res.json({ message: result.message, order: result.order });
});

app.post("/api/orders/razorpay/callback", (req, res) => {
  const orderId = normalizeText(req.query.orderId, 80);
  const razorpayOrderId = normalizeText(req.body.razorpay_order_id, 80);
  const razorpayPaymentId = normalizeText(req.body.razorpay_payment_id, 80);
  const razorpaySignature = normalizeText(req.body.razorpay_signature, 160);
  const order = findOrderById(orderId);

  if (!order) {
    return res.redirect(303, buildCoffeeRedirect({ payment: "failed", message: "Order not found." }));
  }

  const result = finalizeRazorpayPayment(order, razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!result.ok) {
    return res.redirect(
      303,
      buildCoffeeRedirect({ payment: "failed", orderId: order.id, message: result.message })
    );
  }

  return res.redirect(
    303,
    buildCoffeeRedirect({ payment: "success", orderId: order.id, message: result.message })
  );
});

app.post("/api/orders/:id/payment-failed", (req, res) => {
  const orderId = normalizeText(req.params.id, 80);
  const order = findOrderById(orderId);

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  updateOrderPayment(orderId, "failed", null, order.razorpayOrderId, order.razorpayPaymentId);
  const failedOrder = updateOrderStatus(orderId, "payment_failed");
  return res.json({ message: "Payment was not completed.", order: failedOrder });
});

app.post("/api/orders", (req, res) => {
  const { customerName, userEmail, pickupSlot, tableNumber, items } = parseOrderInput(req);
  if (!customerName || !pickupSlot || !tableNumber || items.length === 0) {
    return res.status(400).json({ message: "Name, table number, pickup slot, and items are required." });
  }

  const productIndex = new Map(listProducts(false).map((item) => [item.id, item]));
  const normalizedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const product = productIndex.get(String(item.id || ""));
    const quantity = Number(item.quantity || 0);

    if (!product || quantity < 1) {
      return res.status(400).json({ message: "Order contains an invalid item." });
    }

    const lineTotal = Number((product.price * quantity).toFixed(2));
    totalAmount += lineTotal;
    normalizedItems.push({
      id: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      lineTotal,
    });
  }

  const order = createOrder({
    id: crypto.randomUUID(),
    userEmail,
    customerName,
    tableNumber,
    itemsJson: JSON.stringify(normalizedItems),
    totalAmount: Number(totalAmount.toFixed(2)),
    pickupSlot,
    paymentStatus: "paid",
    stripeSessionId: null,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    orderStatus: "paid",
    createdAt: new Date().toISOString(),
  });

  return res.status(201).json({ message: `Order confirmed for ${pickupSlot}.`, order });
});

app.get("/api/admin/bootstrap", requireAdmin, (_req, res) => {
  const orders = listAllOrders();
  const products = listProducts(true);
  const feedback = listFeedback();
  const customers = listUsers();
  return res.json({
    summary: summarizeAdminMetrics(orders, products, feedback),
    transactions: listTransactions(orders),
    orders,
    products,
    feedback,
    customers,
    siteContent: getSiteContent(),
    adminEmail: ADMIN_EMAIL,
  });
});

app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  return res.json({ orders: listAllOrders() });
});

app.patch("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  const orderId = normalizeText(req.params.id, 80);
  const orderStatus = normalizeText(req.body.orderStatus, 30).toLowerCase();
  const allowedStatuses = new Set([
    "placed",
    "paid",
    "brewing",
    "ready",
    "served",
    "cancelled",
    "payment_failed",
  ]);

  if (!allowedStatuses.has(orderStatus)) {
    return res.status(400).json({ message: "Invalid order status." });
  }

  const existing = findOrderById(orderId);
  if (!existing) {
    return res.status(404).json({ message: "Order not found." });
  }

  if (existing.paymentStatus !== "paid" && ["brewing", "ready", "served"].includes(orderStatus)) {
    return res.status(400).json({ message: "Unpaid orders cannot be confirmed or prepared." });
  }

  const order = updateOrderStatus(orderId, orderStatus);
  return res.json({ message: "Order status updated.", order });
});

app.delete("/api/admin/orders", requireAdmin, (_req, res) => {
  const deletedCount = deleteAllOrders();
  return res.json({ message: `Deleted ${deletedCount} order${deletedCount === 1 ? "" : "s"}.` });
});

app.get("/api/admin/products", requireAdmin, (_req, res) => {
  return res.json({ products: listProducts(true) });
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const product = normalizeProductInput(req.body);
  if (!product.name || !product.roast || !product.accent || !product.description || !product.category || Number.isNaN(product.price)) {
    return res.status(400).json({ message: "Complete all product fields." });
  }

  const id = normalizeText(req.body.id, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || crypto.randomUUID();

  if (findProductById(id)) {
    return res.status(409).json({ message: "Product id already exists." });
  }

  const now = new Date().toISOString();
  const created = createProduct({
    id,
    ...product,
    createdAt: now,
    updatedAt: now,
  });
  return res.status(201).json({ message: "Product added.", product: created });
});

app.patch("/api/admin/products/:id", requireAdmin, (req, res) => {
  const id = normalizeText(req.params.id, 60);
  const existing = findProductById(id);
  if (!existing) {
    return res.status(404).json({ message: "Product not found." });
  }

  const product = normalizeProductInput(req.body, existing);
  if (!product.name || !product.roast || !product.accent || !product.description || !product.category || Number.isNaN(product.price)) {
    return res.status(400).json({ message: "Complete all product fields." });
  }

  const updated = updateProduct(id, {
    ...product,
    updatedAt: new Date().toISOString(),
  });
  return res.json({ message: "Product updated.", product: updated });
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const id = normalizeText(req.params.id, 60);
  const existing = findProductById(id);
  if (!existing) {
    return res.status(404).json({ message: "Product not found." });
  }

  deleteProduct(id);
  return res.json({ message: "Product deleted." });
});

app.get("/api/admin/feedback", requireAdmin, (_req, res) => {
  return res.json({ feedback: listFeedback() });
});

app.patch("/api/admin/site-content", requireAdmin, (req, res) => {
  const normalized = normalizeSiteContentInput(req.body);
  const updated = updateSiteContent(normalized);
  return res.json({ message: "Site content updated.", siteContent: updated });
});

app.use((_req, res) => {
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Auth app listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`App URL: ${APP_URL}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Admin phone: ${ADMIN_PHONE}`);
});
