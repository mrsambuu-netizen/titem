module.exports = function registerauth(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

app.post('/api/auth/login', async (req, res) => {
  const { username, password, branch_id } = req.body;
  try {
    const result = await pool.query(
      'SELECT u.*, b.name as branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.username = $1 AND u.is_active = true',
      [username]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Username is incorrect' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

    let sessionBranchId = user.branch_id;
    let sessionBranchName = user.branch_name;
    const requestedBranchId = Number.parseInt(branch_id, 10);
    if (Number.isInteger(requestedBranchId) && requestedBranchId > 0) {
      const branchResult = await pool.query(
        "SELECT id, name FROM branches WHERE id = $1 AND COALESCE(is_active, true) = true AND COALESCE(branch_type, 'own_branch') <> 'partner'",
        [requestedBranchId]
      );
      if (branchResult.rows.length) {
        sessionBranchId = branchResult.rows[0].id;
        sessionBranchName = branchResult.rows[0].name;
      }
    }

    const tokenUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      branch_id: sessionBranchId,
      branch_name: sessionBranchName,
      full_name: user.full_name
    };
    const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: tokenUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
};
