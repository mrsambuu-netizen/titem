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

// â”€â”€ ÐœÐ­Ð”Ð­Ð­Ð›Ð›Ð˜Ð™Ð Ð¡ÐÐÐ“Ð˜Ð™Ð Ð¥Ò®Ð¡ÐÐ­Ð“Ð¢Ò®Ò®Ð” â”€â”€
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


    // â”€â”€ Ð¡ÐÐ›Ð‘ÐÐ  / Ð“Ð­Ð Ð­Ð­Ð¢ Ð‘ÐžÐ Ð›Ð£Ð£Ð›ÐÐ“Ð§ ÐÐ­ÐœÐ­Ð›Ð¢ Ð¢ÐÐ›Ð‘ÐÐ Ð£Ð£Ð” â”€â”€
    await pool.query(`
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS branch_type VARCHAR(30) DEFAULT 'own_branch';
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_name VARCHAR(100);
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS commission_percent NUMERIC DEFAULT 0;
      ALTER TABLE branches ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(200);
    `);

    // â”€â”€ Ð“Ð­Ð Ð­Ð­Ð¢ Ð‘ÐžÐ Ð›Ð£Ð£Ð›ÐÐ“Ð§Ð˜Ð™Ð Ò®Ð›Ð”Ð­Ð“Ð”Ð­Ð› / Ð¥Ó¨Ð”Ó¨Ð›Ð“Ó¨Ó¨Ð â”€â”€
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

// â”€â”€ Ð­Ð¥ÐÐ˜Ð™ Ó¨Ð“Ó¨Ð“Ð”Ó¨Ð› â”€â”€
async function seedData() {
  try {
    const branchCount = await pool.query('SELECT COUNT(*) FROM branches');
    if (parseInt(branchCount.rows[0].count) > 0) return;

    // Ð¡Ð°Ð»Ð±Ð°Ñ€ÑƒÑƒÐ´
    await pool.query(`
      INSERT INTO branches (name, location, branch_type) VALUES
        ('ÐÐ³ÑƒÑƒÐ»Ð°Ñ…', 'Ð¢Ó©Ð² Ð°Ð³ÑƒÑƒÐ»Ð°Ñ…', 'own_branch'),
        ('Ð¡Ð°Ð»Ð±Ð°Ñ€ 1', 'Ð¡Ò¯Ñ…Ð±Ð°Ð°Ñ‚Ð°Ñ€ Ð´Ò¯Ò¯Ñ€ÑÐ³', 'own_branch'),
        ('Ð¡Ð°Ð»Ð±Ð°Ñ€ 2', 'Ð‘Ð°ÑÐ½Ð·Ò¯Ñ€Ñ… Ð´Ò¯Ò¯Ñ€ÑÐ³', 'own_branch'),
        ('Ð¡Ð°Ð»Ð±Ð°Ñ€ 3', 'Ð¥Ð°Ð½-Ð£ÑƒÐ» Ð´Ò¯Ò¯Ñ€ÑÐ³', 'own_branch'),
        ('Ð¡Ð°Ð»Ð±Ð°Ñ€ 4', 'Ð‘Ð°ÑÐ½Ð³Ð¾Ð» Ð´Ò¯Ò¯Ñ€ÑÐ³', 'own_branch'),
        ('Ð¡Ð°Ð»Ð±Ð°Ñ€ 5', 'ÐÐ°Ð»Ð°Ð¹Ñ…', 'own_branch')
    `);

    // ÐÐ½Ð³Ð¸Ð»Ð°Ð»
    await pool.query(`
      INSERT INTO categories (name, slug) VALUES
        ('ÐœÐ°Ð»Ð³Ð°Ð¹', 'hat'),
        ('ÐžÑ€Ð¾Ð¾Ð»Ñ‚', 'scarf'),
        ('Ð‘ÑÑÐ»Ð¸Ð¹', 'glove'),
        ('Faceshield', 'face'),
        ('ÐÐ»Ñ‡ÑƒÑƒÑ€', 'neck')
    `);

    // Admin Ñ…ÑÑ€ÑÐ³Ð»ÑÐ³Ñ‡
    const adminHash = await bcrypt.hash('admin123', 10);
    const cashierHash = await bcrypt.hash('1234', 10);
    const warehouseHash = await bcrypt.hash('1234', 10);

    await pool.query(`
      INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES
        ('admin', $1, 'Ð¡ÑƒÐ¿ÐµÑ€ ÐÐ´Ð¼Ð¸Ð½', 'super_admin', NULL),
        ('manager', $1, 'ÐœÐµÐ½ÐµÐ¶ÐµÑ€', 'admin', NULL),
        ('cashier01', $2, 'Ð‘.Ð‘Ð¾Ð»Ð´', 'cashier', 2),
        ('cashier02', $2, 'Ð.ÐÐ°Ñ€aa', 'cashier', 3),
        ('cashier03', $2, 'Ð”.Ð”Ð¾Ñ€Ð¶', 'cashier', 4),
        ('cashier04', $2, 'Ð¡.Ð¡Ð°Ñ€Ð½Ð°Ð¹', 'cashier', 5),
        ('cashier05', $2, 'Ð“.Ð“Ð°Ð½aa', 'cashier', 6),
        ('warehouse01', $3, 'ÐÐ³ÑƒÑƒÐ»Ð°Ñ…Ñ‹Ð½ Ð°Ð¶Ð¸Ð»Ñ‚Ð°Ð½', 'warehouse', 1)
    `, [adminHash, cashierHash, warehouseHash]);

    // Ð‘Ð°Ñ€Ð°Ð°
    await pool.query(`
      INSERT INTO products (name, sku, category_id, price, wholesale_price, description) VALUES
        ('ÐšÐ»Ð°ÑÑÐ¸Ðº Ð‘Ò¯Ñ€Ð³ÑÐ´', 'TIT-001', 1, 45000, 28000, 'ÐšÐ»Ð°ÑÑÐ¸Ðº Ð·Ð°Ð³Ð²Ð°Ñ€Ñ‹Ð½ snapback Ð¼Ð°Ð»Ð³Ð°Ð¹'),
        ('Snapback Ð¼Ð°Ð»Ð³Ð°Ð¹', 'TIT-002', 1, 42000, 25000, 'Ð¢Ð¾Ñ…Ð¸Ñ€ÑƒÑƒÐ»Ð°Ð³Ð´Ð°Ñ… snapback'),
        ('Ó¨Ð²Ð»Ð¸Ð¹Ð½ Ð¼Ð°Ð»Ð³Ð°Ð¹', 'TIT-003', 1, 38000, 22000, 'Ð”ÑƒÐ»Ð°Ð°Ð½ Ó©Ð²Ð»Ð¸Ð¹Ð½ Ð¼Ð°Ð»Ð³Ð°Ð¹'),
        ('Ð—ÑƒÑÐ»Ð°Ð½Ñ‹ Ð¼Ð°Ð»Ð³Ð°Ð¹', 'TIT-004', 1, 25000, 15000, 'Ð—ÑƒÑÐ»Ð°Ð½Ñ‹ Ñ…Ó©Ð½Ð³Ó©Ð½ Ð¼Ð°Ð»Ð³Ð°Ð¹'),
        ('Ð—Ð¸Ð¼Ð¸Ð¹Ð½ Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚', 'TIT-005', 2, 30400, 18000, 'Ó¨Ð²Ð»Ð¸Ð¹Ð½ Ð´ÑƒÐ»Ð°Ð°Ð½ Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚'),
        ('Ð¤Ð»Ð¸Ñ Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚', 'TIT-006', 2, 32000, 19000, 'Ð¤Ð»Ð¸Ñ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‚Ð°Ð¹ Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚'),
        ('Ð£Ñ‚Ð°Ñ Ð±ÑÑÐ»Ð¸Ð¹', 'TIT-007', 3, 25000, 14000, 'Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑÐ»Ð³ÑÑ† Ñ…Ò¯Ð»ÑÑÐ½ Ð°Ð²Ð´Ð°Ð³ Ð±ÑÑÐ»Ð¸Ð¹'),
        ('ÐÑ€ÑŒÑÐ°Ð½ Ð±ÑÑÐ»Ð¸Ð¹', 'TIT-008', 3, 46750, 32000, 'Ð–Ð¸Ð½Ñ…ÑÐ½Ñ Ð°Ñ€ÑŒÑÐ°Ð½ Ð±ÑÑÐ»Ð¸Ð¹'),
        ('Ó¨Ð²Ð»Ð¸Ð¹Ð½ Ñ…Ð°Ð¼Ð³Ð°Ð°Ð»Ð°Ð»Ñ‚', 'TIT-009', 4, 18000, 10000, 'Ð¦Ð°Ñ€Ð°Ð¹Ð½Ñ‹ Ñ…Ð°Ð¼Ð³Ð°Ð°Ð»Ð°Ð»Ñ‚'),
        ('Faceshield Pro', 'TIT-010', 4, 22000, 13000, 'ÐœÑÑ€Ð³ÑÐ¶Ð»Ð¸Ð¹Ð½ faceshield'),
        ('Ð¥Ò¯Ð·Ò¯Ò¯Ð½Ð¸Ð¹ Ð°Ð»Ñ‡ÑƒÑƒÑ€', 'TIT-011', 5, 15000, 8000, 'ÐžÐ»Ð¾Ð½ Ð·Ð¾Ñ€Ð¸ÑƒÐ»Ð°Ð»Ñ‚Ñ‹Ð½ Ð°Ð»Ñ‡ÑƒÑƒÑ€'),
        ('Buff Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚', 'TIT-012', 5, 19000, 11000, 'Buff Ð·Ð°Ð³Ð²Ð°Ñ€Ñ‹Ð½ Ð¾Ñ€Ð¾Ð¾Ð»Ñ‚')
    `);

    // Variant Ð±Ð¾Ð»Ð¾Ð½ Ð±Ð°Ñ€ÐºÐ¾Ð´
    const products = await pool.query('SELECT id, sku FROM products ORDER BY id');
    const colors = {
      'TIT-001': ['Ð¥Ð°Ñ€','Ð‘Ð¾Ñ€','Ð¥Ó©Ñ…','Ð£Ð»Ð°Ð°Ð½'],
      'TIT-002': ['Ð¥Ð°Ñ€','Ð¦Ð°Ð³Ð°Ð°Ð½','Ð£Ð»Ð°Ð°Ð½'],
      'TIT-003': ['Ð¥Ð°Ñ€','Ð‘Ð¾Ñ€'],
      'TIT-004': ['Ð¦Ð°Ð³Ð°Ð°Ð½','Ð‘Ð¾Ñ€'],
      'TIT-005': ['Ð£Ð»Ð°Ð°Ð½','Ð¥Ó©Ñ…','Ð¥Ð°Ñ€'],
      'TIT-006': ['ÐÐ¾Ð³Ð¾Ð¾Ð½','Ð£Ð»Ð°Ð°Ð½','Ð¥Ð°Ñ€'],
      'TIT-007': ['Ð¥Ð°Ñ€','Ð¦Ð°Ð³Ð°Ð°Ð½','Ð£Ð»Ð°Ð°Ð½'],
      'TIT-008': ['Ð‘Ð¾Ñ€','Ð¥Ð°Ñ€'],
      'TIT-009': ['Ð¥Ð°Ñ€','ÐÐ¾Ð³Ð¾Ð¾Ð½','Ð£Ð»Ð°Ð°Ð½'],
      'TIT-010': ['Ð¥Ð°Ñ€','Ð¦Ð°Ð³Ð°Ð°Ð½'],
      'TIT-011': ['Ð¥Ð°Ñ€','Ð¥Ó©Ñ…','Ð£Ð»Ð°Ð°Ð½','ÐÐ¾Ð³Ð¾Ð¾Ð½'],
      'TIT-012': ['Ð¥Ð°Ñ€','Ð¦Ð°Ð³Ð°Ð°Ð½']
    };
    const sizes = {
      'TIT-001': ['S','M','L','XL'],
      'TIT-002': ['M','L','XL'],
      'TIT-003': ['S','M','L'],
      'TIT-004': ['M','L'],
      'TIT-005': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ'],
      'TIT-006': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ'],
      'TIT-007': ['S','M','L'],
      'TIT-008': ['M','L','XL'],
      'TIT-009': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ'],
      'TIT-010': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ'],
      'TIT-011': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ'],
      'TIT-012': ['ÐÑÐ³ Ñ…ÑÐ¼Ð¶ÑÑ']
    };

    let barcodeNum = 1000;
    for (const prod of products.rows) {
      const prodColors = colors[prod.sku] || ['Ð¥Ð°Ñ€'];
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

    // ÐÐ³ÑƒÑƒÐ»Ð°Ñ…Ñ‹Ð½ Ò¯Ð»Ð´ÑÐ³Ð´ÑÐ»
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

    // ÐÐ¸Ð¹Ð»Ò¯Ò¯Ð»ÑÐ³Ñ‡
    await pool.query(`
      INSERT INTO suppliers (name, phone, email, total_debt) VALUES
        ('ÐœÐ¾Ð½Ð³Ð¾Ð» ÐœÐ°Ð»Ð³Ð°Ð¹ Ð¥Ð¥Ðš', '99001122', 'info@mongol-malgai.mn', 2400000),
        ('ÐÐ·Ð¸Ð°Ð¢ÐµÐºÑÑ‚Ð°Ð¹Ð»', '88001133', 'asia@textile.mn', 0),
        ('Ó¨Ð²Ð»Ð¸Ð¹Ð½ Ð¢Ð¾Ð½Ð¾Ð³Ð»Ð¾Ð»', '77001144', 'winter@gear.mn', 1200000)
    `);

    console.log('Seed data inserted');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

module.exports = { pool, initDB };


