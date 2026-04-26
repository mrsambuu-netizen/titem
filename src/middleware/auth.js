const jwt = require('jsonwebtoken');

module.exports = function createAuth(JWT_SECRET) {
// ── AUTH MIDDLEWARE ──
function authMiddleware(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token байхгүй' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Эрх байхгүй' });
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Token хүчингүй' });
    }
  };
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token хүчингүй' });
  }
  next();
}
  return { authMiddleware, optionalAuth };
};
