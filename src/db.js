const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const rawDatabaseUrl = process.env.DATABASE_URL || '';
const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=(require|prefer|verify-ca)(&|$)/i, (match, _mode, tail) => {
  if (match.startsWith('?') && tail === '&') return '?';
  if (match.startsWith('?')) return '';
  return tail === '&' ? '&' : '';
});
const needsSsl = process.env.NODE_ENV === 'production' || /sslmode=require/i.test(rawDatabaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false
});

async function ensureWebsiteProductColumns() {
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS website_visible BOOLEAN DEFAULT true;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS website_featured BOOLEAN DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS website_sort_order INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS website_description TEXT;
  `);
}

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
      CREATE TABLE IF NOT EXISTS website_settings (
        key VARCHAR(80) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT NOW()
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


    // Website product display settings
    await ensureWebsiteProductColumns();

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

    console.log('Database tables ready');
    await seedData();
  } catch (err) {
    console.error('DB init error:', err.message);
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
    await pool.query(`
      INSERT INTO website_settings (key, value) VALUES
        ('homepage', '{"hero_title":"\u0422\u0438\u0442\u044d\u043c","hero_subtitle":"\u0427\u0430\u043d\u0430\u0440\u0442\u0430\u0439 \u043c\u0430\u043b\u0433\u0430\u0439, \u043e\u0440\u043e\u043e\u043b\u0442, \u0431\u044d\u044d\u043b\u0438\u0439","hero_button":"\u0414\u044d\u043b\u0433\u04af\u04af\u0440 \u04af\u0437\u044d\u0445","banner_image":"","footer_text":"\u041c\u043e\u043d\u0433\u043e\u043b\u044b\u043d \u043c\u0430\u043b\u0433\u0430\u0439, \u0430\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b\u043d \u0434\u044d\u043b\u0433\u04af\u04af\u0440.","footer_phone":"+976 9900-0000","footer_email":"info@hat.mn","facebook":"","instagram":""}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('Seed data inserted');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

module.exports = { pool, initDB, ensureWebsiteProductColumns };


