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

      CREATE TABLE IF NOT EXISTS returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(50) UNIQUE NOT NULL,
        return_type VARCHAR(30) NOT NULL,
        source_branch_id INTEGER REFERENCES branches(id),
        supplier_id INTEGER REFERENCES suppliers(id),
        partner_id INTEGER REFERENCES branches(id),
        order_id INTEGER REFERENCES orders(id),
        customer_name VARCHAR(100),
        customer_phone VARCHAR(30),
        reason TEXT,
        note TEXT,
        status VARCHAR(30) DEFAULT 'completed',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS return_items (
        id SERIAL PRIMARY KEY,
        return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES product_variants(id),
        quantity INTEGER NOT NULL,
        condition VARCHAR(30) DEFAULT 'good',
        resell BOOLEAN DEFAULT true,
        action VARCHAR(30) DEFAULT 'restock'
      );
    `);


    // ── САЛБАР / ГЭРЭЭТ БОРЛУУЛАГЧ НЭМЭЛТ ТАЛБАРУУД ──
    await pool.query(`
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS branch_type VARCHAR(30) DEFAULT 'own_branch';
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_name VARCHAR(100);
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS commission_percent NUMERIC DEFAULT 0;
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(200);
    `);

    // ── ГЭРЭЭТ БОРЛУУЛАГЧИЙН ҮЛДЭГДЭЛ / ХӨДӨЛГӨӨН ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_inventory (
        id SERIAL PRIMARY KEY,
        partner_id INTEGER REFERENCES branches(id),
        variant_id INTEGER REFERENCES product_variants(id),
        given_qty INTEGER DEFAULT 0,
        sold_qty INTEGER DEFAULT 0,
        returned_qty INTEGER DEFAULT 0,
        on_hand_qty INTEGER DEFAULT 0,
        receivable_amount INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(partner_id, variant_id)
      );

      CREATE TABLE IF NOT EXISTS partner_transactions (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        partner_id INTEGER REFERENCES branches(id),
        variant_id INTEGER REFERENCES product_variants(id),
        quantity INTEGER NOT NULL,
        amount INTEGER DEFAULT 0,
        note TEXT,
        created_by INTEGER REFERENCES users(id),
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
      INSERT INTO branches (name, location, branch_type) VALUES
        ('Агуулах', 'Төв агуулах', 'own_branch'),
        ('Салбар 1', 'Сүхбаатар дүүрэг', 'own_branch'),
        ('Салбар 2', 'Баянзүрх дүүрэг', 'own_branch'),
        ('Салбар 3', 'Хан-Уул дүүрэг', 'own_branch'),
        ('Салбар 4', 'Баянгол дүүрэг', 'own_branch'),
        ('Салбар 5', 'Налайх', 'own_branch')
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

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token хүчингүй' });
  }
  next();
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
    const colorList = (colors && colors.length) ? colors : ['Нэг өнгө'];
    const sizeList = (sizes && sizes.length) ? sizes : ['Нэг хэмжээ'];
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

// ── БАРАА ОРЛОГО (Нийлүүлэгчээс агуулахад нэмэх) ──
app.post('/api/receive', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items, supplier_id, invoice, note } = req.body;
    
    for (const item of items) {
      // Агуулахын inventory-г нэмэх (branch_id = 1)
      await client.query(`
        INSERT INTO inventory (variant_id, branch_id, quantity, min_quantity)
        VALUES ($1, 1, $2, 5)
        ON CONFLICT (variant_id, branch_id) 
        DO UPDATE SET quantity = inventory.quantity + $2
      `, [item.variant_id, item.quantity]);
      
      // Stock movement бүртгэх
      await client.query(`
        INSERT INTO stock_movements 
          (variant_id, to_branch_id, quantity, movement_type, note, user_id)
        VALUES ($1, 1, $2, 'receive', $3, $4)
      `, [item.variant_id, item.quantity, 
          `Орлого: ${invoice||'—'} | ${note||'—'}`, 
          req.user.id]);
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: `${items.length} төрлийн бараа орлогодлоо` });
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── VARIANT НЭМЭХ ──
app.post('/api/products/:id/variants', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { colors, sizes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const colorList = (colors && colors.length) ? colors : ['Нэг өнгө'];
    const sizeList = (sizes && sizes.length) ? sizes : ['Нэг хэмжээ'];
    let barcodeNum = Date.now();
    const product = await client.query('SELECT sku FROM products WHERE id=$1', [req.params.id]);
    const sku = product.rows[0]?.sku;
    const added = [];
    for(const color of colorList){
      for(const size of sizeList){
        barcodeNum++;
        const variantSku = `${sku}-${color.substring(0,2).toUpperCase()}-${size}`;
        const barcode = `6900${String(barcodeNum).slice(-8)}`;
        try{
          const v = await client.query(
            'INSERT INTO product_variants (product_id,color,size,barcode,sku) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [req.params.id, color, size, barcode, variantSku]
          );
          added.push(v.rows[0]);
          // Inventory үүсгэх
          for(let b=1;b<=6;b++){
            await client.query(
              'INSERT INTO inventory (variant_id,branch_id,quantity,min_quantity) VALUES ($1,$2,0,5) ON CONFLICT DO NOTHING',
              [v.rows[0].id, b]
            );
          }
        }catch(e){ /* давхар variant алгасах */ }
      }
    }
    await client.query('COMMIT');
    res.json({success:true, added:added.length});
  }catch(err){
    await client.query('ROLLBACK');
    res.status(500).json({error:err.message});
  }finally{
    client.release();
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
app.post('/api/orders', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { branch_id, items, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno, customer_name, customer_phone } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Захиалгын бараа дутуу байна' });
    }
    if (req.user && !['cashier','admin','super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Эрх байхгүй' });
    }
    await client.query('BEGIN');
    const orderNum = '#TIT-' + Date.now().toString().slice(-6);
    const orderBranchId = branch_id || req.user?.branch_id || 2;
    const cashierId = req.user?.id || null;

    const order = await client.query(
      `INSERT INTO orders (order_number, branch_id, cashier_id, customer_name, customer_phone, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orderNum, orderBranchId, cashierId, customer_name, customer_phone, subtotal, discount_amount, total, payment_method, ebarimt, ebarimt_regno]
    );

    for (const item of items) {
      const variantId = item.variant_id ? parseInt(item.variant_id) : null;
      const quantity = parseInt(item.quantity) || 0;
      const price = parseInt(item.price) || 0;
      if (quantity <= 0) throw new Error('Захиалгын тоо буруу байна');
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, color, size, quantity, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.rows[0].id, variantId, item.name, item.color, item.size, quantity, price, price * quantity]
      );
      if (variantId) {
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1 WHERE variant_id = $2 AND branch_id = $3`,
          [quantity, variantId, orderBranchId]
        );
        await client.query(
          `INSERT INTO stock_movements (variant_id, from_branch_id, quantity, movement_type, reference_id, user_id)
           VALUES ($1,$2,$3,'sale',$4,$5)`,
          [variantId, orderBranchId, quantity, order.rows[0].id, cashierId]
        );
      }
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
    const { branch_id, date, order_number, limit = 50 } = req.query;
    const branchFilter = req.user.role === 'cashier' ? req.user.branch_id : branch_id;
    const conditions = ['1=1'];
    const params = [];

    if (branchFilter) {
      params.push(branchFilter);
      conditions.push(`o.branch_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`DATE(o.created_at) = $${params.length}`);
    }
    if (order_number) {
      params.push(order_number);
      conditions.push(`o.order_number = $${params.length}`);
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    let query = `
      SELECT o.*, b.name as branch_name, u.full_name as cashier_name
        , COALESCE(
          json_agg(
            json_build_object(
              'variant_id', oi.variant_id,
              'name', oi.product_name,
              'color', oi.color,
              'size', oi.size,
              'quantity', oi.quantity,
              'price', oi.unit_price
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) as items
      FROM orders o
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN users u ON o.cashier_id = u.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY o.id, b.name, u.full_name
      ORDER BY o.created_at DESC LIMIT ${safeLimit}
    `;
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
        c.name as category_name,
        CASE WHEN i.quantity = 0 THEN 'out'
             WHEN i.quantity < i.min_quantity THEN 'low'
             ELSE 'ok' END as status
       FROM inventory i
       JOIN product_variants pv ON i.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       JOIN branches b ON i.branch_id = b.id
       LEFT JOIN categories c ON p.category_id = c.id
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
      `SELECT b.id, b.name, b.location, b.branch_type, b.phone, b.manager_name,
        b.commission_percent, b.payment_terms, b.is_active,
        COUNT(o.id) as transaction_count,
        COALESCE(SUM(o.total),0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_method='cash' THEN o.total ELSE 0 END),0) as cash_total,
        COALESCE(SUM(CASE WHEN o.payment_method='card' THEN o.total ELSE 0 END),0) as card_total,
        COALESCE(SUM(CASE WHEN o.payment_method='qpay' THEN o.total ELSE 0 END),0) as qpay_total
       FROM branches b
       LEFT JOIN orders o ON o.branch_id = b.id AND DATE(o.created_at) = $1 AND o.status = 'completed'
       WHERE b.id > 1
       GROUP BY b.id, b.name, b.location, b.branch_type, b.phone, b.manager_name, b.commission_percent, b.payment_terms, b.is_active
       ORDER BY total_revenue DESC`, 
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



// ── БУЦААЛТЫН ЕРӨНХИЙ API ──
// return_type:
//   customer        → хэрэглэгчээс буцаалт, тухайн салбарын үлдэгдэл нэмэгдэнэ
//   branch          → салбараас агуулах руу буцаалт, салбар - / агуулах +
//   supplier        → нийлүүлэгчид буцаалт, агуулах -
//   partner         → гэрээт борлуулагчаас буцаалт, partner - / агуулах +  (энэ нь /api/partners/return-тэй адил логик)
// item.action:
//   restock         → дахин зарах боломжтой, inventory нэмнэ
//   damaged         → гэмтэлтэй, inventory нэмэхгүй, зөвхөн түүх бүртгэнэ
app.post('/api/returns', authMiddleware(['warehouse','admin','super_admin','cashier']), async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      return_type,
      source_branch_id,
      supplier_id,
      partner_id,
      order_id,
      customer_name,
      customer_phone,
      reason,
      note,
      items
    } = req.body;

    if (!return_type || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Буцаалтын төрөл болон барааны мэдээлэл дутуу байна' });
    }

    const allowedTypes = ['customer', 'branch', 'supplier', 'partner'];
    if (!allowedTypes.includes(return_type)) {
      return res.status(400).json({ error: 'Буцаалтын төрөл буруу байна' });
    }

    await client.query('BEGIN');

    const returnNumber = '#RET-' + Date.now().toString().slice(-8);

    const ret = await client.query(`
      INSERT INTO returns
      (return_number, return_type, source_branch_id, supplier_id, partner_id, order_id,
       customer_name, customer_phone, reason, note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      returnNumber,
      return_type,
      source_branch_id || null,
      supplier_id || null,
      partner_id || null,
      order_id || null,
      customer_name || null,
      customer_phone || null,
      reason || null,
      note || null,
      req.user.id
    ]);

    const returnId = ret.rows[0].id;

    for (const item of items) {
      const variantId = parseInt(item.variant_id);
      const qty = parseInt(item.quantity);
      const condition = item.condition || 'good';
      const resell = item.resell !== false;
      const action = item.action || (resell ? 'restock' : 'damaged');

      if (!variantId || !qty || qty <= 0) {
        throw new Error('Буцаах барааны variant_id эсвэл quantity буруу байна');
      }

      await client.query(`
        INSERT INTO return_items
        (return_id, variant_id, quantity, condition, resell, action)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [returnId, variantId, qty, condition, resell, action]);

      // 1) Хэрэглэгчийн буцаалт: тухайн салбарын үлдэгдэл нэмэгдэнэ.
      if (return_type === 'customer') {
        const targetBranch = parseInt(source_branch_id || req.user.branch_id || 1);
        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,$2,$3)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, targetBranch, qty]);
        }

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,'customer_return',$4,$5,$6)
        `, [
          variantId,
          action === 'restock' ? targetBranch : null,
          qty,
          returnId,
          `Хэрэглэгчийн буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }

      // 2) Салбараас буцаалт: салбарын үлдэгдэл хасагдаж, агуулах нэмэгдэнэ.
      if (return_type === 'branch') {
        const fromBranch = parseInt(source_branch_id);
        if (!fromBranch) throw new Error('Салбараас буцаалт хийхэд source_branch_id хэрэгтэй');

        const stock = await client.query(
          'SELECT quantity FROM inventory WHERE variant_id=$1 AND branch_id=$2',
          [variantId, fromBranch]
        );
        const branchQty = parseInt(stock.rows[0]?.quantity || 0);
        if (branchQty < qty) throw new Error(`Салбарын үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(
          'UPDATE inventory SET quantity = quantity - $1 WHERE variant_id=$2 AND branch_id=$3',
          [qty, variantId, fromBranch]
        );

        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,1,$2)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, qty]);
        }

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,$4,'branch_return',$5,$6,$7)
        `, [
          variantId,
          fromBranch,
          action === 'restock' ? 1 : null,
          qty,
          returnId,
          `Салбараас агуулах руу буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }

      // 3) Нийлүүлэгчид буцаалт: агуулахын үлдэгдэл хасагдана.
      if (return_type === 'supplier') {
        const stock = await client.query(
          'SELECT quantity FROM inventory WHERE variant_id=$1 AND branch_id=1',
          [variantId]
        );
        const warehouseQty = parseInt(stock.rows[0]?.quantity || 0);
        if (warehouseQty < qty) throw new Error(`Агуулахын үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(
          'UPDATE inventory SET quantity = quantity - $1 WHERE variant_id=$2 AND branch_id=1',
          [qty, variantId]
        );

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,1,$2,'supplier_return',$3,$4,$5)
        `, [
          variantId,
          qty,
          returnId,
          `Нийлүүлэгчид буцаалт: supplier_id=${supplier_id || '—'} | ${reason || '—'}`,
          req.user.id
        ]);
      }

      // 4) Гэрээт борлуулагчаас буцаалт: partner - / агуулах +
      if (return_type === 'partner') {
        if (!partner_id) throw new Error('Гэрээт борлуулагчаас буцаалт хийхэд partner_id хэрэгтэй');

        const inv = await client.query(
          `SELECT on_hand_qty FROM partner_inventory
           WHERE partner_id=$1 AND variant_id=$2`,
          [partner_id, variantId]
        );

        const onHand = parseInt(inv.rows[0]?.on_hand_qty || 0);
        if (onHand < qty) throw new Error(`Гэрээт борлуулагч дээрх үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(`
          UPDATE partner_inventory
          SET
            returned_qty = returned_qty + $1,
            on_hand_qty = on_hand_qty - $1,
            updated_at = NOW()
          WHERE partner_id=$2 AND variant_id=$3
        `, [qty, partner_id, variantId]);

        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,1,$2)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, qty]);
        }

        await client.query(`
          INSERT INTO partner_transactions
          (type, partner_id, variant_id, quantity, amount, note, created_by)
          VALUES ('PARTNER_RETURN', $1, $2, $3, 0, $4, $5)
        `, [
          partner_id,
          variantId,
          qty,
          note || 'Ерөнхий буцаалтын API-аар гэрээт борлуулагчаас буцаалт',
          req.user.id
        ]);

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,$4,'partner_return',$5,$6,$7)
        `, [
          variantId,
          partner_id,
          action === 'restock' ? 1 : null,
          qty,
          returnId,
          `Гэрээт борлуулагчаас буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, return: ret.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── БУЦААЛТЫН ТҮҮХ ──
app.get('/api/returns', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        u.full_name AS created_by_name,
        b.name AS source_branch_name,
        s.name AS supplier_name,
        pb.name AS partner_name,
        COALESCE(SUM(ri.quantity),0) AS total_quantity,
        COUNT(ri.id) AS item_count
      FROM returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN branches b ON r.source_branch_id = b.id
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN branches pb ON r.partner_id = pb.id
      GROUP BY r.id, u.full_name, b.name, s.name, pb.name
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БУЦААЛТЫН ДЭЛГЭРЭНГҮЙ ──
app.get('/api/returns/:id', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  try {
    const ret = await pool.query('SELECT * FROM returns WHERE id=$1', [req.params.id]);
    if(!ret.rows.length) return res.status(404).json({ error: 'Буцаалт олдсонгүй' });

    const items = await pool.query(`
      SELECT 
        ri.*,
        p.name AS product_name,
        p.sku AS product_sku,
        pv.color,
        pv.size,
        pv.barcode,
        pv.sku AS variant_sku
      FROM return_items ri
      JOIN product_variants pv ON ri.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE ri.return_id=$1
    `, [req.params.id]);

    res.json({ ...ret.rows[0], items: items.rows });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ГЭРЭЭТ БОРЛУУЛАГЧИЙН ҮЛДЭГДЭЛ ──
app.get('/api/partners/inventory', authMiddleware(['admin','super_admin','warehouse']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pi.*,
        b.name AS partner_name,
        b.commission_percent,
        p.name AS product_name,
        p.price,
        pv.sku,
        pv.barcode,
        pv.color,
        pv.size
      FROM partner_inventory pi
      JOIN branches b ON pi.partner_id = b.id
      JOIN product_variants pv ON pi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE b.branch_type = 'partner'
      ORDER BY pi.updated_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ГЭРЭЭТ БОРЛУУЛАГЧИЙН ХӨДӨЛГӨӨНИЙ ТҮҮХ ──
app.get('/api/partners/transactions', authMiddleware(['admin','super_admin','warehouse']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pt.*,
        b.name AS partner_name,
        p.name AS product_name,
        pv.sku,
        pv.barcode,
        pv.color,
        pv.size,
        u.full_name AS created_by_name
      FROM partner_transactions pt
      JOIN branches b ON pt.partner_id = b.id
      JOIN product_variants pv ON pt.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN users u ON pt.created_by = u.id
      ORDER BY pt.created_at DESC
      LIMIT 200
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── АГУУЛАХААС ГЭРЭЭТ БОРЛУУЛАГЧИД БАРАА ӨГӨХ ──
app.post('/api/partners/transfer', authMiddleware(['admin','super_admin','warehouse']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { partner_id, variant_id, quantity, note } = req.body;
    const qty = parseInt(quantity);

    if (!partner_id || !variant_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Мэдээлэл дутуу байна' });
    }

    await client.query('BEGIN');

    const partner = await client.query(
      `SELECT id FROM branches WHERE id=$1 AND branch_type='partner' AND is_active=true`,
      [partner_id]
    );

    if (!partner.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Гэрээт борлуулагч олдсонгүй' });
    }

    const stock = await client.query(
      `SELECT quantity FROM inventory WHERE branch_id = 1 AND variant_id = $1`,
      [variant_id]
    );

    const warehouseQty = parseInt(stock.rows[0]?.quantity || 0);

    if (warehouseQty < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Агуулахын үлдэгдэл хүрэлцэхгүй байна' });
    }

    await client.query(
      `UPDATE inventory 
       SET quantity = quantity - $1 
       WHERE branch_id = 1 AND variant_id = $2`,
      [qty, variant_id]
    );

    await client.query(`
      INSERT INTO partner_inventory 
      (partner_id, variant_id, given_qty, on_hand_qty, updated_at)
      VALUES ($1, $2, $3, $3, NOW())
      ON CONFLICT (partner_id, variant_id)
      DO UPDATE SET
        given_qty = partner_inventory.given_qty + EXCLUDED.given_qty,
        on_hand_qty = partner_inventory.on_hand_qty + EXCLUDED.on_hand_qty,
        updated_at = NOW()
    `, [partner_id, variant_id, qty]);

    await client.query(`
      INSERT INTO partner_transactions 
      (type, partner_id, variant_id, quantity, amount, note, created_by)
      VALUES ('TRANSFER_TO_PARTNER', $1, $2, $3, 0, $4, $5)
    `, [partner_id, variant_id, qty, note || 'Гэрээт борлуулагчид бараа өгсөн', req.user.id]);

    await client.query(`
      INSERT INTO stock_movements (variant_id, from_branch_id, quantity, movement_type, note, user_id)
      VALUES ($1, 1, $2, 'partner_transfer', $3, $4)
    `, [variant_id, qty, note || 'Гэрээт борлуулагчид бараа өгсөн', req.user.id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Гэрээт борлуулагчид бараа өглөө' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── ГЭРЭЭТ БОРЛУУЛАГЧИЙН ЗАРСАН ТООЦОО ──
app.post('/api/partners/sale', authMiddleware(['admin','super_admin','warehouse']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { partner_id, variant_id, quantity, note } = req.body;
    const qty = parseInt(quantity);

    if (!partner_id || !variant_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Мэдээлэл дутуу байна' });
    }

    await client.query('BEGIN');

    const inv = await client.query(
      `SELECT on_hand_qty FROM partner_inventory 
       WHERE partner_id = $1 AND variant_id = $2`,
      [partner_id, variant_id]
    );

    const onHand = parseInt(inv.rows[0]?.on_hand_qty || 0);

    if (onHand < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Гэрээт борлуулагч дээрх үлдэгдэл хүрэлцэхгүй байна' });
    }

    const product = await client.query(`
      SELECT p.price 
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = $1
    `, [variant_id]);

    const price = parseInt(product.rows[0]?.price || 0);
    const amount = price * qty;

    await client.query(`
      UPDATE partner_inventory
      SET 
        sold_qty = sold_qty + $1,
        on_hand_qty = on_hand_qty - $1,
        receivable_amount = receivable_amount + $2,
        updated_at = NOW()
      WHERE partner_id = $3 AND variant_id = $4
    `, [qty, amount, partner_id, variant_id]);

    await client.query(`
      INSERT INTO partner_transactions
      (type, partner_id, variant_id, quantity, amount, note, created_by)
      VALUES ('PARTNER_SALE', $1, $2, $3, $4, $5, $6)
    `, [partner_id, variant_id, qty, amount, note || 'Гэрээт борлуулагчийн зарсан тооцоо', req.user.id]);

    await client.query('COMMIT');

    res.json({ success: true, amount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── ГЭРЭЭТ БОРЛУУЛАГЧААС БУЦААЛТ АВАХ ──
app.post('/api/partners/return', authMiddleware(['admin','super_admin','warehouse']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { partner_id, variant_id, quantity, note } = req.body;
    const qty = parseInt(quantity);

    if (!partner_id || !variant_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Мэдээлэл дутуу байна' });
    }

    await client.query('BEGIN');

    const inv = await client.query(
      `SELECT on_hand_qty FROM partner_inventory 
       WHERE partner_id = $1 AND variant_id = $2`,
      [partner_id, variant_id]
    );

    const onHand = parseInt(inv.rows[0]?.on_hand_qty || 0);

    if (onHand < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Буцаах тоо үлдэгдлээс их байна' });
    }

    await client.query(`
      UPDATE partner_inventory
      SET 
        returned_qty = returned_qty + $1,
        on_hand_qty = on_hand_qty - $1,
        updated_at = NOW()
      WHERE partner_id = $2 AND variant_id = $3
    `, [qty, partner_id, variant_id]);

    await client.query(`
      INSERT INTO inventory (variant_id, branch_id, quantity)
      VALUES ($1, 1, $2)
      ON CONFLICT (variant_id, branch_id)
      DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
    `, [variant_id, qty]);

    await client.query(`
      INSERT INTO partner_transactions
      (type, partner_id, variant_id, quantity, amount, note, created_by)
      VALUES ('PARTNER_RETURN', $1, $2, $3, 0, $4, $5)
    `, [partner_id, variant_id, qty, note || 'Гэрээт борлуулагчаас буцаалт', req.user.id]);

    await client.query(`
      INSERT INTO stock_movements (variant_id, to_branch_id, quantity, movement_type, note, user_id)
      VALUES ($1, 1, $2, 'partner_return', $3, $4)
    `, [variant_id, qty, note || 'Гэрээт борлуулагчаас буцаалт', req.user.id]);

    await client.query('COMMIT');

    res.json({ success: true });
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

// ── САЛБАР / ГЭРЭЭТ БОРЛУУЛАГЧ НЭМЭХ ──
app.post('/api/branches', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { name, location, branch_type, phone, manager_name, commission_percent, payment_terms, is_active } = req.body;
  try {
    const safeType = branch_type === 'partner' ? 'partner' : 'own_branch';
    const result = await pool.query(
      `INSERT INTO branches 
       (name, location, branch_type, phone, manager_name, commission_percent, payment_terms, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        name,
        location || null,
        safeType,
        phone || null,
        manager_name || null,
        commission_percent || 0,
        payment_terms || null,
        is_active !== false
      ]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── САЛБАР / ГЭРЭЭТ БОРЛУУЛАГЧ ЗАСАХ ──
app.put('/api/branches/:id', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { name, location, branch_type, phone, manager_name, commission_percent, payment_terms, is_active } = req.body;
  try {
    const safeType = branch_type === 'partner' ? 'partner' : 'own_branch';
    const result = await pool.query(
      `UPDATE branches SET 
        name=$1,
        location=$2,
        branch_type=$3,
        phone=$4,
        manager_name=$5,
        commission_percent=$6,
        payment_terms=$7,
        is_active=$8
       WHERE id=$9 RETURNING *`,
      [
        name,
        location || null,
        safeType,
        phone || null,
        manager_name || null,
        commission_percent || 0,
        payment_terms || null,
        is_active !== false,
        req.params.id
      ]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── ХЭРЭГЛЭГЧ НЭМЭХ ──
app.post('/api/users', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { username, password, full_name, role, branch_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, full_name, role, branch_id',
      [username, hash, full_name||null, role, branch_id||null]
    );
    res.json(result.rows[0]);
  } catch(err) {
    if(err.code==='23505') res.status(400).json({ error: 'Нэвтрэх нэр аль хэдийн бүртгэлтэй байна' });
    else res.status(500).json({ error: err.message });
  }
});

// ── ХЭРЭГЛЭГЧ ЗАСАХ ──
app.put('/api/users/:id', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { full_name, role, branch_id, is_active, password } = req.body;
  try {
    let query, params;
    if(password) {
      const hash = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET full_name=$1, role=$2, branch_id=$3, is_active=$4, password_hash=$5 WHERE id=$6 RETURNING id, username, full_name, role, branch_id, is_active';
      params = [full_name||null, role, branch_id||null, is_active!==false, hash, req.params.id];
    } else {
      query = 'UPDATE users SET full_name=$1, role=$2, branch_id=$3, is_active=$4 WHERE id=$5 RETURNING id, username, full_name, role, branch_id, is_active';
      params = [full_name||null, role, branch_id||null, is_active!==false, req.params.id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
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

// ── НУУЦ ҮГ RESET ──
app.get('/api/reset-passwords', async (req, res) => {
  try {
    // Railway Variables-аас нууц үг авах
    const adminPw = process.env.ADMIN_PASSWORD || 'admin123';
    const managerPw = process.env.MANAGER_PASSWORD || 'manager123';
    const cashierPw = process.env.CASHIER_PASSWORD || '1234';

    const adminHash = await bcrypt.hash(adminPw, 10);
    const managerHash = await bcrypt.hash(managerPw, 10);
    const cashierHash = await bcrypt.hash(cashierPw, 10);

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
      res.json({ 
        message: 'Нууц үг шинэчлэгдлээ', 
        users: users.rows,
        credentials: {
          admin: adminPw,
          manager: managerPw,
          cashier: cashierPw,
          warehouse: cashierPw
        }
      });
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
