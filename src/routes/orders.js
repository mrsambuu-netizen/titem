module.exports = function registerorders(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

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
};
