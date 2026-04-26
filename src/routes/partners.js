module.exports = function registerpartners(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

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
};
