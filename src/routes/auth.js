module.exports = function registerauth(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

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
};
