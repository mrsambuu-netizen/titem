const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'titem_secret_2024';

// ── MIDDLEWARE ──
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── DATABASE ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// DB холболт шалгах
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database холболт алдаа:', err.message);
  } else {
    console.log('✅ PostgreSQL холбогдлоо');
    release();
    initDB();
  }
});

// ── МЭДЭЭЛЛИЙН САНГИЙН ХҮСНЭГТҮҮД ──
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(200),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role VARCHAR(30) NOT NULL,
        branch_id INTEGER REFERENCES branches(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        sku VARCHAR(50) UNIQUE NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        description TEXT,
        price INTEGER NOT NULL,
        wholesale_price INTEGER,
        discount_price INTEGER,
        images JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        color VARCHAR(50),
        size VARCHAR(20),
        barcode VARCHAR(100) UNIQUE,
        sku VARCHAR(100) UNIQUE
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER REFERENCES product_variants(id),
        branch_id INTEGER REFERENCES branches(id),
        quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 5,
        UNIQUE(variant_id, branch_id)
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        total_debt INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        branch_id INTEGER REFERENCES branches(id),
        cashier_id INTEGER REFERENCES users(id),
        customer_name VARCHAR(100),
        customer_phone VARCHAR(20),
        subtotal INTEGER NOT NULL,
        discount_amount INTEGER DEFAULT 0,
        total INTEGER NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        ebarimt BOOLEAN DEFAULT false,
        ebarimt_regno VARCHAR(20),
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES product_variants(id),
        product_name VARCHAR(200),
        color VARCHAR(50),
        size VARCHAR(20),
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        total_price INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER REFERENCES product_variants(id),
        from_branch_id INTEGER REFERENCES branches(id),
        to_branch_id INTEGER REFERENCES branches(id),
        quantity INTEGER NOT NULL,
        movement_type VARCHAR(30) NOT NULL,
        reference_id INTEGER,
        note TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cash_sessions (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER REFERENCES branches(id),
        cashier_id INTEGER REFERENCES users(id),
        opening_amount INTEGER NOT NULL,
        closing_amount INTEGER,
        cash_sales INTEGER DEFAULT 0,
        card_sales INTEGER DEFAULT 0,
        qpay_sales INTEGER DEFAULT 0,
        total_sales INTEGER DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'open',
        note TEXT,
        opened_at TIMESTAMP DEFAULT NOW(),
        closed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(100),
        loyalty_points INTEGER DEFAULT 0,
        total_purchases INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Хүснэгтүүд бэлэн боллоо');
    await seedData();
  } catch (err) {
    console.error('DB init алдаа:', err.message);
  }
}

// ── ЭХНИЙ ӨГӨГДӨЛ ──
async function seedData() {
  try {
    const branchCount = await pool.query('SELECT COUNT(*) FROM branches');
    if (parseInt(branchCount.rows[0].count) > 0) return;

    // Салбарууд
    await pool.query(`
      INSERT INTO branches (name, location) VALUES
        ('Агуулах', 'Төв агуулах'),
        ('Салбар 1', 'Сүхбаатар дүүрэг'),
        ('Салбар 2', 'Баянзүрх дүүрэг'),
        ('Салбар 3', 'Хан-Уул дүүрэг'),
        ('Салбар 4', 'Баянгол дүүрэг'),
        ('Салбар 5', 'Налайх')
    `);

    // Ангилал
    await pool.query(`
      INSERT INTO categories (name, slug) VALUES
        ('Малгай', 'hat'),
        ('Ороолт', 'scarf'),
        ('Бээлий', 'glove'),
        ('Faceshield', 'face'),
        ('Алчуур', 'neck')
    `);

    // Admin хэрэглэгч
    const adminHash = await bcrypt.hash('admin123', 10);
    const cashierHash = await bcrypt.hash('1234', 10);
    const warehouseHash = await bcrypt.hash('1234', 10);

    await pool.query(`
      INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES
        ('admin', $1, 'Супер Админ', 'super_admin', NULL),
        ('manager', $1, 'Менежер', 'admin', NULL),
        ('cashier01', $2, 'Б.Болд', 'cashier', 2),
        ('cashier02', $2, 'Н.Нарaa', 'cashier', 3),
        ('cashier03', $2, 'Д.Дорж', 'cashier', 4),
        ('cashier04', $2, 'С.Сарнай', 'cashier', 5),
        ('cashier05', $2, 'Г.Ганaa', 'cashier', 6),
        ('warehouse01', $3, 'Агуулахын ажилтан', 'warehouse', 1)
    `, [adminHash, cashierHash, warehouseHash]);

    // Бараа
    await pool.query(`
      INSERT INTO products (name, sku, category_id, price, wholesale_price, description) VALUES
        ('Классик Бүргэд', 'TIT-001', 1, 45000, 28000, 'Классик загварын snapback малгай'),
        ('Snapback малгай', 'TIT-002', 1, 42000, 25000, 'Тохируулагдах snapback'),
        ('Өвлийн малгай', 'TIT-003', 1, 38000, 22000, 'Дулаан өвлийн малгай'),
        ('Зусланы малгай', 'TIT-004', 1, 25000, 15000, 'Зусланы хөнгөн малгай'),
        ('Зимийн ороолт', 'TIT-005', 2, 30400, 18000, 'Өвлийн дулаан ороолт'),
        ('Флис ороолт', 'TIT-006', 2, 32000, 19000, 'Флис материалтай ороолт'),
        ('Утас бээлий', 'TIT-007', 3, 25000, 14000, 'Утасны дэлгэц хүлээн авдаг бээлий'),
        ('Арьсан бээлий', 'TIT-008', 3, 46750, 32000, 'Жинхэнэ арьсан бээлий'),
        ('Өвлийн хамгаалалт', 'TIT-009', 4, 18000, 10000, 'Царайны хамгаалалт'),
        ('Faceshield Pro', 'TIT-010', 4, 22000, 13000, 'Мэргэжлийн faceshield'),
        ('Хүзүүний алчуур', 'TIT-011', 5, 15000, 8000, 'Олон зориулалтын алчуур'),
        ('Buff ороолт', 'TIT-012', 5, 19000, 11000, 'Buff загварын ороолт')
    `);

    // Variant болон баркод
    const products = await pool.query('SELECT id, sku FROM products ORDER BY id');
    const colors = {
      'TIT-001': ['Хар','Бор','Хөх','Улаан'],
      'TIT-002': ['Хар','Цагаан','Улаан'],
      'TIT-003': ['Хар','Бор'],
      'TIT-004': ['Цагаан','Бор'],
      'TIT-005': ['Улаан','Хөх','Хар'],
      'TIT-006': ['Ногоон','Улаан','Хар'],
      'TIT-007': ['Хар','Цагаан','Улаан'],
      'TIT-008': ['Бор','Хар'],
      'TIT-009': ['Хар','Ногоон','Улаан'],
      'TIT-010': ['Хар','Цагаан'],
      'TIT-011': ['Хар','Хөх','Улаан','Ногоон'],
      'TIT-012': ['Хар','Цагаан']
    };
    const sizes = {
      'TIT-001': ['S','M','L','XL'],
      'TIT-002': ['M','L','XL'],
      'TIT-003': ['S','M','L'],
      'TIT-004': ['M','L'],
      'TIT-005': ['Нэг хэмжээ'],
      'TIT-006': ['Нэг хэмжээ'],
      'TIT-007': ['S','M','L'],
      'TIT-008': ['M','L','XL'],
      'TIT-009': ['Нэг хэмжээ'],
      'TIT-010': ['Нэг хэмжээ'],
      'TIT-011': ['Нэг хэмжээ'],
      'TIT-012': ['Нэг хэмжээ']
    };

    let barcodeNum = 1000;
    for (const prod of products.rows) {
      const prodColors = colors[prod.sku] || ['Хар'];
      const prodSizes = sizes[prod.sku] || ['M'];
      for (const color of prodColors) {
        for (const size of prodSizes) {
          barcodeNum++;
          const variantSku = `${prod.sku}-${color.substring(0,2).toUpperCase()}-${size}`;
          const barcode = `6900${String(barcodeNum).padStart(8,'0')}`;
          await pool.query(
            'INSERT INTO product_variants (product_id, color, size, barcode, sku) VALUES ($1,$2,$3,$4,$5)',
            [prod.id, color, size, barcode, variantSku]
          );
        }
      }
    }

    // Агуулахын үлдэгдэл
    const variants = await pool.query('SELECT id FROM product_variants');
    for (const v of variants.rows) {
      await pool.query(
        'INSERT INTO inventory (variant_id, branch_id, quantity, min_quantity) VALUES ($1, 1, $2, 5)',
        [v.id, Math.floor(Math.random() * 20) + 5]
      );
      for (let b = 2; b <= 6; b++) {
        await pool.query(
          'INSERT INTO inventory (variant_id, branch_id, quantity, min_quantity) VALUES ($1, $2, $3, 3)',
          [v.id, b, Math.floor(Math.random() * 10)]
        );
      }
    }

    // Нийлүүлэгч
    await pool.query(`
      INSERT INTO suppliers (name, phone, email, total_debt) VALUES
        ('Монгол Малгай ХХК', '99001122', 'info@mongol-malgai.mn', 2400000),
        ('АзиаТекстайл', '88001133', 'asia@textile.mn', 0),
        ('Өвлийн Тоноглол', '77001144', 'winter@gear.mn', 1200000)
    `);

    console.log('✅ Seed өгөгдөл оруулагдлаа');
  } catch (err) {
    console.error('Seed алдаа:', err.message);
  }
}

// ── AUTH MIDDLEWARE ──
function authMiddleware(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token байхгүй' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Эрх байхгүй' });
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Token хүчингүй' });
    }
  };
}

// ════════════════════════════
// API ROUTES
// ════════════════════════════

// ── НЭВТРЭХ ──
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT u.*, b.name as branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.username = $1 AND u.is_active = true',
      [username]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Нэвтрэх нэр буруу' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Нууц үг буруу' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id, branch_name: user.branch_name, full_name: user.full_name },
      JWT_SECRET, { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id, branch_name: user.branch_name, full_name: user.full_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БАРАА ──
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, limit = 100 } = req.query;
    
    let conditions = ["p.is_active = true"];
    let params = [];
    let idx = 1;
    
    if (category && category !== 'all') {
      conditions.push(`c.slug = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${idx++} OR p.sku ILIKE $${idx++})`);
      params.push(`%${search}%`, `%${search}%`);
      idx--;
    }
    
    const query = `
      SELECT p.id, p.name, p.sku, p.price, p.wholesale_price, p.discount_price,
        p.description, p.images, p.is_active, p.created_at,
        c.name as category_name,
        COALESCE(SUM(i.quantity), 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN inventory i ON i.variant_id = pv.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id, c.name
      ORDER BY p.name ASC
      LIMIT $${idx}
    `;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Products error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await pool.query(
      'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1',
      [req.params.id]
    );
    if (!product.rows.length) return res.status(404).json({ error: 'Бараа олдсонгүй' });
    const variants = await pool.query(
      `SELECT pv.*, COALESCE(SUM(i.quantity),0) as stock
       FROM product_variants pv
       LEFT JOIN inventory i ON i.variant_id = pv.id
       WHERE pv.product_id = $1 GROUP BY pv.id`,
      [req.params.id]
    );
    res.json({ ...product.rows[0], variants: variants.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authMiddleware(['super_admin','admin']), async (req, res) => {
  const { name, sku, category_id, price, wholesale_price, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, sku, category_id, price, wholesale_price, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, sku, category_id, price, wholesale_price, description]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БАРАА НЭМЭХ ──
app.post('/api/products', authMiddleware(['super_admin','admin']), async (req, res) => {
  const { name, sku, category_id, price, wholesale_price, discount_price, description, colors, sizes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Бараа үүсгэх
    const result = await client.query(
      'INSERT INTO products (name, sku, category_id, price, wholesale_price, discount_price, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, sku, category_id, price, wholesale_price||null, discount_price||null, description||'']
    );
    const product = result.rows[0];
    
    // Variant үүсгэх
    const colorList = colors || ['Хар'];
    const sizeList = sizes || ['M'];
    let barcodeNum = Date.now();
    
    for (const color of colorList) {
      for (const size of sizeList) {
        barcodeNum++;
        const variantSku = `${sku}-${color.substring(0,2).toUpperCase()}-${size}`;
        const barcode = `6900${String(barcodeNum).slice(-8)}`;
        await client.query(
          'INSERT INTO product_variants (product_id, color, size, barcode, sku) VALUES ($1,$2,$3,$4,$5)',
          [product.id, color, size, barcode, variantSku]
        );
      }
    }
    
    // Агуулахад inventory үүсгэх
    const variants = await client.query('SELECT id FROM product_variants WHERE product_id = $1', [product.id]);
    for (const v of variants.rows) {
      for (let b = 1; b <= 6; b++) {
        await client.query(
          'INSERT INTO inventory (variant_id, branch_id, quantity, min_quantity) VALUES ($1,$2,$3,$4)',
          [v.id, b, 0, 5]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, product });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── БАРАА ЗАСАХ ──
app.put('/api/products/:id', authMiddleware(['super_admin','admin']), async (req, res) => {
  const { name, price, wholesale_price, discount_price, description, is_active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name=$1, price=$2, wholesale_price=$3, discount_price=$4, description=$5, is_active=$6 WHERE id=$7 RETURNING *',
      [name, price, wholesale_price||null, discount_price||null, description||'', is_active!==false, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БАРАА УСТГАХ ──
app.delete('/api/products/:id', authMiddleware(['super_admin','admin']), async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ЗУРАГ UPLOAD (Base64) ──
app.post('/api/products/:id/images', authMiddleware(['super_admin','admin']), async (req, res) => {
  const { images } = req.body; // Base64 зургийн массив
  try {
    await pool.query('UPDATE products SET images = $1 WHERE id = $2', [JSON.stringify(images), req.params.id]);
    res.json({ success: true, count: images.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БАРКОДООР БАРАА ХАЙХ ──
app.get('/api/barcode/:barcode', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pv.*, p.name, p.price, p.wholesale_price, p.sku as product_sku,
        c.name as category_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE pv.barcode = $1`,
      [req.params.barcode]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Баркод олдсонгүй' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ЗАХИАЛГА ──
app.post('/api/orders', authMiddleware(['cashier','admin','super_admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id, items, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno, customer_name, customer_phone } = req.body;
    const orderNum = '#TIT-' + Date.now().toString().slice(-6);

    const order = await client.query(
      `INSERT INTO orders (order_number, branch_id, cashier_id, customer_name, customer_phone, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orderNum, branch_id || req.user.branch_id, req.user.id, customer_name, customer_phone, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, color, size, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.rows[0].id, item.variant_id, item.name, item.color, item.size, item.quantity, item.price, item.price * item.quantity]
      );
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1 WHERE variant_id = $2 AND branch_id = $3`,
        [item.quantity, item.variant_id, branch_id || req.user.branch_id]
      );
      await client.query(
        `INSERT INTO stock_movements (variant_id, from_branch_id, quantity, movement_type, reference_id, user_id)
         VALUES ($1,$2,$3,'sale',$4,$5)`,
        [item.variant_id, branch_id || req.user.branch_id, item.quantity, order.rows[0].id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, order: order.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/orders', authMiddleware(), async (req, res) => {
  try {
    const { branch_id, date, limit = 50 } = req.query;
    const branchFilter = req.user.role === 'cashier' ? req.user.branch_id : branch_id;
    let query = `
      SELECT o.*, b.name as branch_name, u.full_name as cashier_name
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE 1=1
      ${branchFilter ? 'AND o.branch_id = $1' : ''}
      ${date ? `AND DATE(o.created_at) = $${branchFilter ? 2 : 1}` : ''}
      ORDER BY o.created_at DESC LIMIT ${limit}
    `;
    const params = [];
    if (branchFilter) params.push(branchFilter);
    if (date) params.push(date);
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ҮЛДЭГДЭЛ ──
app.get('/api/inventory', authMiddleware(), async (req, res) => {
  try {
    const { branch_id } = req.query;
    const branchFilter = req.user.role === 'cashier' ? req.user.branch_id : branch_id;
    const result = await pool.query(
      `SELECT p.name, p.sku, pv.color, pv.size, pv.barcode,
        b.name as branch_name, i.quantity, i.min_quantity,
        CASE WHEN i.quantity = 0 THEN 'out'
             WHEN i.quantity < i.min_quantity THEN 'low'
             ELSE 'ok' END as status
       FROM inventory i
       JOIN product_variants pv ON i.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       JOIN branches b ON i.branch_id = b.id
       WHERE p.is_active = true
       ${branchFilter ? 'AND i.branch_id = $1' : ''}
       ORDER BY p.name, pv.color, pv.size`,
      branchFilter ? [branchFilter] : []
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── САЛБАРЫН ТАЙЛАН ──
app.get('/api/reports/daily', authMiddleware(['admin','super_admin','cashier']), async (req, res) => {
  try {
    const { date, branch_id } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];
    const branchFilter = req.user.role === 'cashier' ? req.user.branch_id : branch_id;

    const sales = await pool.query(
      `SELECT
        COUNT(*) as transaction_count,
        COALESCE(SUM(total),0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END),0) as card_total,
        COALESCE(SUM(CASE WHEN payment_method='qpay' THEN total ELSE 0 END),0) as qpay_total
       FROM orders
       WHERE DATE(created_at) = $1 AND status = 'completed'
       ${branchFilter ? 'AND branch_id = $2' : ''}`,
      branchFilter ? [reportDate, branchFilter] : [reportDate]
    );

    const topProducts = await pool.query(
      `SELECT oi.product_name, SUM(oi.quantity) as sold_qty, SUM(oi.total_price) as revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE DATE(o.created_at) = $1 AND o.status = 'completed'
       ${branchFilter ? 'AND o.branch_id = $2' : ''}
       GROUP BY oi.product_name ORDER BY sold_qty DESC LIMIT 10`,
      branchFilter ? [reportDate, branchFilter] : [reportDate]
    );

    res.json({ summary: sales.rows[0], top_products: topProducts.rows, date: reportDate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Бүх салбарын тайлан
app.get('/api/reports/branches', authMiddleware(['admin','super_admin']), async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT b.id, b.name, b.location,
        COUNT(o.id) as transaction_count,
        COALESCE(SUM(o.total),0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_method='cash' THEN o.total ELSE 0 END),0) as cash_total,
        COALESCE(SUM(CASE WHEN o.payment_method='card' THEN o.total ELSE 0 END),0) as card_total,
        COALESCE(SUM(CASE WHEN o.payment_method='qpay' THEN o.total ELSE 0 END),0) as qpay_total
       FROM branches b
       LEFT JOIN orders o ON o.branch_id = b.id AND DATE(o.created_at) = $1 AND o.status = 'completed'
       WHERE b.id > 1
       GROUP BY b.id, b.name, b.location ORDER BY total_revenue DESC`,
      [reportDate]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── КАСС ──
app.post('/api/cash/open', authMiddleware(['cashier','admin']), async (req, res) => {
  try {
    const { opening_amount, note } = req.body;
    const existing = await pool.query(
      'SELECT id FROM cash_sessions WHERE branch_id=$1 AND cashier_id=$2 AND status=$3',
      [req.user.branch_id, req.user.id, 'open']
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Касс аль хэдийн нээгдсэн байна' });
    const result = await pool.query(
      'INSERT INTO cash_sessions (branch_id, cashier_id, opening_amount, note) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.branch_id, req.user.id, opening_amount, note]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cash/close', authMiddleware(['cashier','admin']), async (req, res) => {
  try {
    const { closing_amount, note } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const salesData = await pool.query(
      `SELECT
        COALESCE(SUM(total),0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END),0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method='qpay' THEN total ELSE 0 END),0) as qpay_sales,
        COUNT(*) as transaction_count
       FROM orders WHERE branch_id=$1 AND cashier_id=$2 AND DATE(created_at)=$3 AND status='completed'`,
      [req.user.branch_id, req.user.id, today]
    );
    const sales = salesData.rows[0];
    const result = await pool.query(
      `UPDATE cash_sessions SET
        closing_amount=$1, cash_sales=$2, card_sales=$3, qpay_sales=$4,
        total_sales=$5, transaction_count=$6, status='closed', closed_at=NOW(), note=$7
       WHERE branch_id=$8 AND cashier_id=$9 AND status='open' RETURNING *`,
      [closing_amount, sales.cash_sales, sales.card_sales, sales.qpay_sales,
       sales.total_sales, sales.transaction_count, note, req.user.branch_id, req.user.id]
    );
    res.json({ session: result.rows[0], sales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── САЛБАРЫН ШИЛЖҮҮЛЭГ ──
app.post('/api/transfers', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items, from_branch_id, to_branch_id, note } = req.body;
    for (const item of items) {
      const stock = await client.query(
        'SELECT quantity FROM inventory WHERE variant_id=$1 AND branch_id=$2',
        [item.variant_id, from_branch_id]
      );
      if (!stock.rows.length || stock.rows[0].quantity < item.quantity) {
        throw new Error(`Үлдэгдэл хүрэлцэхгүй: variant ${item.variant_id}`);
      }
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1 WHERE variant_id=$2 AND branch_id=$3',
        [item.quantity, item.variant_id, from_branch_id]
      );
      await client.query(
        `INSERT INTO inventory (variant_id, branch_id, quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (variant_id, branch_id) DO UPDATE SET quantity = inventory.quantity + $3`,
        [item.variant_id, to_branch_id, item.quantity]
      );
      await client.query(
        `INSERT INTO stock_movements (variant_id, from_branch_id, to_branch_id, quantity, movement_type, note, user_id)
         VALUES ($1,$2,$3,$4,'transfer',$5,$6)`,
        [item.variant_id, from_branch_id, to_branch_id, item.quantity, note, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `${items.length} бараа шилжүүлэгдлээ` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── НИЙЛҮҮЛЭГЧ ──
app.get('/api/suppliers', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE is_active=true ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── НИЙЛҮҮЛЭГЧ НЭМЭХ ──
app.post('/api/suppliers', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { name, phone, email, address, total_debt } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO suppliers (name, phone, email, address, total_debt) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, phone||null, email||null, address||null, total_debt||0]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── НИЙЛҮҮЛЭГЧ ЗАСАХ ──
app.put('/api/suppliers/:id', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { name, phone, email, address, total_debt } = req.body;
  try {
    const result = await pool.query(
      'UPDATE suppliers SET name=$1, phone=$2, email=$3, address=$4, total_debt=$5 WHERE id=$6 RETURNING *',
      [name, phone||null, email||null, address||null, total_debt||0, req.params.id]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── НИЙЛҮҮЛЭГЧ УСТГАХ ──
app.delete('/api/suppliers/:id', authMiddleware(['admin','super_admin']), async (req, res) => {
  try {
    await pool.query('UPDATE suppliers SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── САНУУЛГА ──
app.get('/api/alerts', authMiddleware(['admin','super_admin']), async (req, res) => {
  try {
    const lowStock = await pool.query(
      `SELECT p.name, p.sku, pv.color, pv.size, b.name as branch_name, i.quantity, i.min_quantity
       FROM inventory i
       JOIN product_variants pv ON i.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       JOIN branches b ON i.branch_id = b.id
       WHERE i.quantity <= i.min_quantity AND p.is_active=true
       ORDER BY i.quantity ASC LIMIT 20`
    );
    res.json({ low_stock: lowStock.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ХЭРЭГЛЭГЧ ──
app.get('/api/users', authMiddleware(['super_admin','admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active, b.name as branch_name, u.created_at
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── АНГИЛАЛ ──
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── САЛБАРУУД ──
app.get('/api/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FAVICON ──
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧢</text></svg>');
});

// ── HTML ХУУДАС SERVE ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'titem.html')));
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'public', 'titem-shop.html')));
app.get('/pos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'titem-pos.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'titem-admin.html')));
app.get('/warehouse', (req, res) => res.sendFile(path.join(__dirname, 'public', 'titem-warehouse.html')));

// ── НУУЦ ҮГ RESET (зөвхөн нэг удаа ашиглана) ──
app.get('/api/reset-passwords', async (req, res) => {
  try {
    const adminHash = await bcrypt.hash('admin123', 10);
    const managerHash = await bcrypt.hash('manager123', 10);
    const cashierHash = await bcrypt.hash('1234', 10);

    const check = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES
          ('admin', $1, 'Супер Админ', 'super_admin', NULL),
          ('manager', $2, 'Менежер', 'admin', NULL),
          ('cashier01', $3, 'Б.Болд', 'cashier', 2),
          ('cashier02', $3, 'Н.Нарaa', 'cashier', 3),
          ('cashier03', $3, 'Д.Дорж', 'cashier', 4),
          ('cashier04', $3, 'С.Сарнай', 'cashier', 5),
          ('cashier05', $3, 'Г.Ганaa', 'cashier', 6),
          ('warehouse01', $3, 'Агуулахын ажилтан', 'warehouse', 1)
      `, [adminHash, managerHash, cashierHash]);
      res.json({ message: 'Хэрэглэгчид нэмэгдлээ', count: 8 });
    } else {
      await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [adminHash, 'admin']);
      await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [managerHash, 'manager']);
      await pool.query('UPDATE users SET password_hash = $1 WHERE role IN ($2,$3)', [cashierHash, 'cashier', 'warehouse']);
      const users = await pool.query('SELECT username, role FROM users ORDER BY id');
      res.json({ message: 'Нууц үг шинэчлэгдлээ', users: users.rows,
        credentials: {admin:'admin123', manager:'manager123', cashier:'1234', warehouse:'1234'} });
    }
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── SERVER START ──
app.listen(PORT, () => {
  console.log(`🚀 Титэм сервер ажиллаж байна: http://localhost:${PORT}`);
});

module.exports = app;
