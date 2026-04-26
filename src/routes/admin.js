module.exports = function registeradmin(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

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
      `SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.is_active, b.name as branch_name, u.created_at
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

app.post('/api/categories', authMiddleware(['admin','super_admin']), async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Бүлгийн нэр оруулна уу' });

  try {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cat';
    const slug = baseSlug + '-' + Date.now().toString().slice(-6);
    const result = await pool.query(
      'INSERT INTO categories (name, slug) VALUES ($1,$2) RETURNING *',
      [name, slug]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') res.status(400).json({ error: 'Ийм бүлэг аль хэдийн байна' });
    else res.status(500).json({ error: err.message });
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
};
