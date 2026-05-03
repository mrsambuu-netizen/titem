module.exports = function registerproducts(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

app.get('/api/products', async (req, res) => {
  try {
    const { category, search, branch_id, limit = 100 } = req.query;
    const conditions = ["p.is_active = true"];
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return '$' + params.length;
    };

    if (category && category !== 'all') {
      conditions.push(`c.slug = ${addParam(category)}`);
    }
    if (search) {
      const q1 = addParam(`%${search}%`);
      const q2 = addParam(`%${search}%`);
      conditions.push(`(p.name ILIKE ${q1} OR p.sku ILIKE ${q2})`);
    }

    const branchId = parseInt(branch_id);
    const inventoryJoin = branchId > 0
      ? `LEFT JOIN inventory i ON i.variant_id = pv.id AND i.branch_id = ${addParam(branchId)}`
      : 'LEFT JOIN inventory i ON i.variant_id = pv.id';
    const safeLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const limitParam = addParam(safeLimit);

    const query = `
      SELECT p.id, p.name, p.sku, p.price, p.wholesale_price, p.discount_price,
        p.description, p.images, p.is_active, p.created_at,
        c.name as category_name,
        COALESCE(SUM(i.quantity), 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      ${inventoryJoin}
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id, c.name
      ORDER BY p.name ASC
      LIMIT ${limitParam}
    `;

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
    if (!product.rows.length) return res.status(404).json({ error: 'Product not found' });

    const branchId = parseInt(req.query.branch_id);
    const variantParams = branchId > 0 ? [req.params.id, branchId] : [req.params.id];
    const inventoryJoin = branchId > 0
      ? 'LEFT JOIN inventory i ON i.variant_id = pv.id AND i.branch_id = $2'
      : 'LEFT JOIN inventory i ON i.variant_id = pv.id';

    const variants = await pool.query(
      `SELECT pv.*,
              COALESCE(SUM(i.quantity),0) as stock,
              COALESCE(SUM(CASE WHEN i.branch_id = 1 THEN i.quantity ELSE 0 END),0) as warehouse_stock
       FROM product_variants pv
       ${inventoryJoin}
       WHERE pv.product_id = $1 GROUP BY pv.id`,
      variantParams
    );
    res.json({ ...product.rows[0], variants: variants.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function generateProductSku(client) {
  const result = await client.query(
    "SELECT sku FROM products WHERE sku ~ '^TIT-[0-9]+$' ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC LIMIT 1"
  );
  const lastNum = result.rows[0]?.sku ? parseInt(result.rows[0].sku.replace('TIT-', '')) : 0;
  return `TIT-${String(lastNum + 1).padStart(4, '0')}`;
}

// ── БАРАА НЭМЭХ ──
app.post('/api/products', authMiddleware(['super_admin','admin']), async (req, res) => {
  let { name, sku, category_id, price, wholesale_price, discount_price, description, colors, sizes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    sku = (sku || '').trim();
    if (!sku) sku = await generateProductSku(client);
    
    // Бараа үүсгэх
    const result = await client.query(
      'INSERT INTO products (name, sku, category_id, price, wholesale_price, discount_price, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, sku, category_id, price, wholesale_price||null, discount_price||null, description||'']
    );
    const product = result.rows[0];
    
    // Variant үүсгэх
    const colorList = (colors && colors.length) ? colors : ['Нэг өнгө'];
    const sizeList = (sizes && sizes.length) ? sizes : ['Нэг хэмжээ'];
    const createdVariants = [];
    
    for (const color of colorList) {
      for (const size of sizeList) {
        const variantSku = `${sku}-${color.substring(0,2).toUpperCase()}-${size}`;
        const barcode = await makeUniqueBarcode(client);
        const variant = await client.query(
          'INSERT INTO product_variants (product_id, color, size, barcode, sku) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [product.id, color, size, barcode, variantSku]
        );
        createdVariants.push(variant.rows[0]);
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
    res.json({ success: true, product, variants: createdVariants });
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
    const { items, supplier_id, invoice, note, branch_id } = req.body;
    const receiveBranchId = parseInt(branch_id || 1);
    
    for (const item of items) {
      // Агуулахын inventory-г нэмэх (branch_id = 1)
      await client.query(`
        INSERT INTO inventory (variant_id, branch_id, quantity, min_quantity)
        VALUES ($1, $3, $2, 5)
        ON CONFLICT (variant_id, branch_id) 
        DO UPDATE SET quantity = inventory.quantity + $2
      `, [item.variant_id, item.quantity, receiveBranchId]);
      
      // Stock movement бүртгэх
      await client.query(`
        INSERT INTO stock_movements 
          (variant_id, to_branch_id, quantity, movement_type, note, user_id)
        VALUES ($1, $5, $2, 'receive', $3, $4)
      `, [item.variant_id, item.quantity, 
          `Receive: ${invoice||'-'} | ${note||'-'}`, 
          req.user.id, receiveBranchId]);
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: `${items.length} item received` });
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
    const product = await client.query('SELECT sku FROM products WHERE id=$1', [req.params.id]);
    const sku = product.rows[0]?.sku;
    const added = [];
    for(const color of colorList){
      for(const size of sizeList){
        const variantSku = `${sku}-${color.substring(0,2).toUpperCase()}-${size}`;
        const barcode = await makeUniqueBarcode(client);
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

function ean13CheckDigit(first12) {
  const sum = first12.split('').reduce((total, digit, index) => {
    const n = parseInt(digit, 10);
    return total + n * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (sum % 10)) % 10);
}

function makeBarcode() {
  const base = ('690' + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 10))).slice(0, 12);
  return base + ean13CheckDigit(base);
}

async function makeUniqueBarcode(client) {
  for (let i = 0; i < 20; i++) {
    const barcode = makeBarcode();
    const exists = await client.query('SELECT id FROM product_variants WHERE barcode=$1', [barcode]);
    if (!exists.rows.length) return barcode;
  }
  throw new Error('Давхцахгүй баркод үүсгэж чадсангүй');
}

app.post('/api/barcodes/generate', authMiddleware(['admin','super_admin']), async (req, res) => {
  const { variant_ids } = req.body;
  if (!Array.isArray(variant_ids) || !variant_ids.length) {
    return res.status(400).json({ error: 'Variant сонгоно уу' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = [];

    for (const id of variant_ids) {
      const variantId = parseInt(id);
      if (!variantId) continue;
      const barcode = await makeUniqueBarcode(client);
      const result = await client.query(
        `UPDATE product_variants
         SET barcode=$1
         WHERE id=$2
         RETURNING id, product_id, color, size, barcode, sku`,
        [barcode, variantId]
      );
      if (result.rows[0]) updated.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ success: true, updated });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── БАРКОДООР БАРАА ХАЙХ ──
app.get('/api/barcode/:barcode', async (req, res) => {
  try {
    const branchId = parseInt(req.query.branch_id);
    const params = branchId > 0 ? [req.params.barcode, branchId] : [req.params.barcode];
    const inventoryJoin = branchId > 0
      ? 'LEFT JOIN inventory i ON i.variant_id = pv.id AND i.branch_id = $2'
      : 'LEFT JOIN inventory i ON i.variant_id = pv.id';

    const result = await pool.query(
      `SELECT pv.*, p.name, p.price, p.wholesale_price, p.sku as product_sku,
        c.name as category_name, COALESCE(SUM(i.quantity),0) as stock
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       ${inventoryJoin}
       WHERE pv.barcode = $1
       GROUP BY pv.id, p.id, c.name`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Barcode not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ЗАХИАЛГА ──
};
