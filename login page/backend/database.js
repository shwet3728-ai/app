const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "auth.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

const DEFAULT_PRODUCTS = [
  {
    id: "velvet-latte",
    name: "Velvet Latte",
    category: "espresso",
    price: 220,
    roast: "Brazil + Ethiopia",
    accent: "Silky cocoa and caramel",
    description: "Soft espresso and milk with a smooth cocoa finish.",
    imageUrl: "",
  },
  {
    id: "cloud-cappuccino",
    name: "Cloud Cappuccino",
    category: "espresso",
    price: 190,
    roast: "Colombia",
    accent: "Soft foam and brown sugar",
    description: "Balanced cappuccino with dense foam and caramel notes.",
    imageUrl: "",
  },
  {
    id: "cedar-cold-brew",
    name: "Cedar Cold Brew",
    category: "cold",
    price: 240,
    roast: "Kenya",
    accent: "Cold, clean, citrus snap",
    description: "Slow-steeped cold brew with a bright finish.",
    imageUrl: "",
  },
  {
    id: "honey-oat-shaker",
    name: "Honey Oat Shaker",
    category: "cold",
    price: 260,
    roast: "House blend",
    accent: "Oat silk and honey finish",
    description: "Shaken oat coffee with natural honey sweetness.",
    imageUrl: "",
  },
  {
    id: "cardamom-bun",
    name: "Cardamom Bun",
    category: "bakery",
    price: 120,
    roast: "Bakery",
    accent: "Warm spice swirl",
    description: "Fresh baked bun with cardamom spice and butter glaze.",
    imageUrl: "",
  },
  {
    id: "saffron-affogato",
    name: "Saffron Affogato",
    category: "dessert",
    price: 280,
    roast: "Single origin",
    accent: "Creamy, bright, slow finish",
    description: "Vanilla ice cream under hot espresso with saffron aroma.",
    imageUrl: "",
  },
];

const DEFAULT_SITE_CONTENT = {
  info: {
    body: "",
  },
  contact: {
    body: "",
  },
  locations: {
    body: "",
  },
  faq: {
    body: "",
  },
  contactItems: [
    { label: "", value: "" },
    { label: "", value: "" },
    { label: "", value: "" },
  ],
  locationsList: [
    { name: "", detail: "" },
    { name: "", detail: "" },
  ],
  gallery: {
    eyebrow: "",
    title: "",
    description: "",
    items: [
      {
        title: "Counter view",
        coverImageUrl: "",
        imageUrls: Array(10).fill(""),
      },
      {
        title: "Signature serve",
        coverImageUrl: "",
        imageUrls: Array(10).fill(""),
      },
      {
        title: "Seating area",
        coverImageUrl: "",
        imageUrls: Array(10).fill(""),
      },
      {
        title: "Bean bar",
        coverImageUrl: "",
        imageUrls: Array(10).fill(""),
      },
      {
        title: "Interior mood",
        coverImageUrl: "",
        imageUrls: Array(10).fill(""),
      },
    ],
    menu: {
      eyebrow: "",
      title: "",
      description: "",
      imageUrl: "",
    },
  },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT,
    provider TEXT NOT NULL,
    provider_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    table_number TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total_amount REAL NOT NULL,
    pickup_slot TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    stripe_session_id TEXT,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    roast TEXT NOT NULL,
    accent TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_content (
    id TEXT PRIMARY KEY,
    content_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'customer'");
ensureColumn("users", "phone", "TEXT");
ensureColumn("orders", "order_status", "TEXT NOT NULL DEFAULT 'placed'");
ensureColumn("products", "description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "image_url", "TEXT NOT NULL DEFAULT ''");

function seedProducts() {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM products").get();
  if (countRow.count > 0) {
    return;
  }

  const insert = db.prepare(
    `INSERT INTO products (id, name, category, price, roast, accent, description, image_url, is_active, created_at, updated_at)
     VALUES (@id, @name, @category, @price, @roast, @accent, @description, @imageUrl, 1, @createdAt, @updatedAt)`
  );

  const now = new Date().toISOString();
  const insertMany = db.transaction((products) => {
    for (const product of products) {
      insert.run({ ...product, createdAt: now, updatedAt: now });
    }
  });
  insertMany(DEFAULT_PRODUCTS);
}

seedProducts();

function seedSiteContent() {
  const existing = db.prepare("SELECT id FROM site_content WHERE id = ?").get("main");
  if (existing) {
    return;
  }

  db.prepare(
    `INSERT INTO site_content (id, content_json, updated_at)
     VALUES (?, ?, ?)`
  ).run("main", JSON.stringify(DEFAULT_SITE_CONTENT), new Date().toISOString());
}

seedSiteContent();

function mapUser(row) {
  return row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        passwordHash: row.password_hash,
        provider: row.provider,
        providerId: row.provider_id,
        role: row.role,
        createdAt: row.created_at,
      }
    : null;
}

function listUsers() {
  return db
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all()
    .map(mapUser);
}

function mapOrder(row) {
  return row
    ? {
        id: row.id,
        userEmail: row.user_email,
        customerName: row.customer_name,
        tableNumber: row.table_number,
        items: JSON.parse(row.items_json),
        totalAmount: row.total_amount,
        pickupSlot: row.pickup_slot,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        stripeSessionId: row.stripe_session_id,
        razorpayOrderId: row.razorpay_order_id,
        razorpayPaymentId: row.razorpay_payment_id,
        createdAt: row.created_at,
      }
    : null;
}

function mapProduct(row) {
  return row
    ? {
        id: row.id,
        name: row.name,
        category: row.category,
        price: row.price,
        roast: row.roast,
        accent: row.accent,
        description: row.description,
        imageUrl: row.image_url,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

function mapFeedback(row) {
  return row
    ? {
        id: row.id,
        userEmail: row.user_email,
        customerName: row.customer_name,
        rating: row.rating,
        message: row.message,
        createdAt: row.created_at,
      }
    : null;
}

function createUser(user) {
  db.prepare(
    `INSERT INTO users (id, name, email, phone, password_hash, provider, provider_id, role, created_at)
     VALUES (@id, @name, @email, @phone, @passwordHash, @provider, @providerId, @role, @createdAt)`
  ).run(user);
  return findUserByEmail(user.email);
}

function upsertAdminUser(user) {
  db.prepare(
    `INSERT INTO users (id, name, email, phone, password_hash, provider, provider_id, role, created_at)
     VALUES (@id, @name, @email, @phone, @passwordHash, @provider, @providerId, @role, @createdAt)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       password_hash = excluded.password_hash,
       provider = excluded.provider,
       provider_id = excluded.provider_id,
       role = excluded.role`
  ).run(user);
  return findUserByEmail(user.email);
}

function findUserByEmail(email) {
  return mapUser(db.prepare("SELECT * FROM users WHERE email = ?").get(email));
}

function findUserByProvider(provider, providerId) {
  return mapUser(
    db.prepare("SELECT * FROM users WHERE provider = ? AND provider_id = ?").get(provider, providerId)
  );
}

function updateOAuthUser(id, name, email, role) {
  db.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?").run(name, email, role, id);
  return findUserByEmail(email);
}

function listProducts(includeInactive = false) {
  const query = includeInactive
    ? "SELECT * FROM products ORDER BY created_at DESC"
    : "SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC";
  return db.prepare(query).all().map(mapProduct);
}

function findProductById(id) {
  return mapProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
}

function createProduct(product) {
  db.prepare(
    `INSERT INTO products (id, name, category, price, roast, accent, description, image_url, is_active, created_at, updated_at)
     VALUES (@id, @name, @category, @price, @roast, @accent, @description, @imageUrl, @isActive, @createdAt, @updatedAt)`
  ).run({
    ...product,
    isActive: product.isActive ? 1 : 0,
  });
  return findProductById(product.id);
}

function updateProduct(id, updates) {
  db.prepare(
    `UPDATE products
     SET name = @name,
         category = @category,
         price = @price,
         roast = @roast,
         accent = @accent,
         description = @description,
         image_url = @imageUrl,
         is_active = @isActive,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    ...updates,
    id,
    isActive: updates.isActive ? 1 : 0,
  });
  return findProductById(id);
}

function createFeedback(entry) {
  db.prepare(
    `INSERT INTO feedback (id, user_email, customer_name, rating, message, created_at)
     VALUES (@id, @userEmail, @customerName, @rating, @message, @createdAt)`
  ).run(entry);
  return findFeedbackById(entry.id);
}

function findFeedbackById(id) {
  return mapFeedback(db.prepare("SELECT * FROM feedback WHERE id = ?").get(id));
}

function listFeedback() {
  return db.prepare("SELECT * FROM feedback ORDER BY created_at DESC").all().map(mapFeedback);
}

function createOrder(order) {
  db.prepare(
    `INSERT INTO orders (
      id, user_email, customer_name, table_number, items_json, total_amount,
      pickup_slot, payment_status, stripe_session_id, razorpay_order_id,
      razorpay_payment_id, order_status, created_at
    ) VALUES (
      @id, @userEmail, @customerName, @tableNumber, @itemsJson, @totalAmount,
      @pickupSlot, @paymentStatus, @stripeSessionId, @razorpayOrderId,
      @razorpayPaymentId, @orderStatus, @createdAt
    )`
  ).run(order);
  return findOrderById(order.id);
}

function findOrderById(id) {
  return mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id));
}

function updateOrderPayment(
  id,
  paymentStatus,
  stripeSessionId = null,
  razorpayOrderId = null,
  razorpayPaymentId = null
) {
  db.prepare(
    `UPDATE orders
     SET payment_status = ?,
         stripe_session_id = ?,
         razorpay_order_id = ?,
         razorpay_payment_id = ?
     WHERE id = ?`
  ).run(paymentStatus, stripeSessionId, razorpayOrderId, razorpayPaymentId, id);
  return findOrderById(id);
}

function updateOrderStatus(id, orderStatus) {
  db.prepare("UPDATE orders SET order_status = ? WHERE id = ?").run(orderStatus, id);
  return findOrderById(id);
}

function deleteProduct(id) {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

function listOrdersByUser(email) {
  return db
    .prepare("SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC")
    .all(email)
    .map(mapOrder);
}

function listAllOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all().map(mapOrder);
}

function listPaidOrders() {
  return db
    .prepare("SELECT * FROM orders WHERE payment_status = 'paid' ORDER BY created_at DESC")
    .all()
    .map(mapOrder);
}

function deleteAllOrders() {
  const result = db.prepare("DELETE FROM orders").run();
  return result.changes;
}

function getSiteContent() {
  const row = db.prepare("SELECT * FROM site_content WHERE id = ?").get("main");
  if (!row) {
    return DEFAULT_SITE_CONTENT;
  }

  try {
    return JSON.parse(row.content_json);
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}

function updateSiteContent(content) {
  db.prepare(
    `INSERT INTO site_content (id, content_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content_json = excluded.content_json,
       updated_at = excluded.updated_at`
  ).run("main", JSON.stringify(content), new Date().toISOString());
  return getSiteContent();
}

module.exports = {
  DB_PATH,
  createFeedback,
  createOrder,
  createProduct,
  createUser,
  findOrderById,
  findProductById,
  findUserByEmail,
  findUserByProvider,
  listUsers,
  listAllOrders,
  listFeedback,
  listOrdersByUser,
  listPaidOrders,
  listProducts,
  upsertAdminUser,
  deleteAllOrders,
  deleteProduct,
  getSiteContent,
  updateOAuthUser,
  updateOrderPayment,
  updateOrderStatus,
  updateProduct,
  updateSiteContent,
};
