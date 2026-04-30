const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, initDB, ensureWebsiteProductColumns } = require('./src/db');
const createAuth = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'titem_secret_2024';
const rootDir = __dirname;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(rootDir, 'public')));

const { authMiddleware, optionalAuth } = createAuth(JWT_SECRET);
const deps = { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir, ensureWebsiteProductColumns };

require('./src/routes/auth')(app, deps);
require('./src/routes/products')(app, deps);
require('./src/routes/orders')(app, deps);
require('./src/routes/operations')(app, deps);
require('./src/routes/returns')(app, deps);
require('./src/routes/partners')(app, deps);
require('./src/routes/admin')(app, deps);
require('./src/routes/pages')(app, deps);

async function startServer() {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected');
    client.release();
    await initDB();
    app.listen(PORT, () => {
      console.log('TITEM ERP server running on port ' + PORT);
    });
  } catch (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;

