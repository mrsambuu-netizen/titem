module.exports = function registerpages(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧢</text></svg>');
});

// ── HTML ХУУДАС SERVE ──
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'public', 'titem.html')));
app.get('/shop', (req, res) => res.sendFile(path.join(rootDir, 'public', 'titem-shop.html')));
app.get('/pos', (req, res) => res.sendFile(path.join(rootDir, 'public', 'titem-pos.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(rootDir, 'public', 'titem-admin.html')));
app.get('/warehouse', (req, res) => res.sendFile(path.join(rootDir, 'public', 'titem-warehouse.html')));

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
};
