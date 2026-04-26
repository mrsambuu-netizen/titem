module.exports = function registeroperations(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

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
};
