module.exports = function registerreturns(app, deps) {
  const { pool, authMiddleware, optionalAuth, bcrypt, jwt, JWT_SECRET, path, rootDir } = deps;

app.post('/api/returns', authMiddleware(['warehouse','admin','super_admin','cashier']), async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      return_type,
      source_branch_id,
      supplier_id,
      partner_id,
      order_id,
      customer_name,
      customer_phone,
      reason,
      note,
      items
    } = req.body;

    if (!return_type || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Буцаалтын төрөл болон барааны мэдээлэл дутуу байна' });
    }

    const allowedTypes = ['customer', 'branch', 'supplier', 'partner'];
    if (!allowedTypes.includes(return_type)) {
      return res.status(400).json({ error: 'Буцаалтын төрөл буруу байна' });
    }

    await client.query('BEGIN');

    const returnNumber = '#RET-' + Date.now().toString().slice(-8);

    const ret = await client.query(`
      INSERT INTO returns
      (return_number, return_type, source_branch_id, supplier_id, partner_id, order_id,
       customer_name, customer_phone, reason, note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      returnNumber,
      return_type,
      source_branch_id || null,
      supplier_id || null,
      partner_id || null,
      order_id || null,
      customer_name || null,
      customer_phone || null,
      reason || null,
      note || null,
      req.user.id
    ]);

    const returnId = ret.rows[0].id;

    for (const item of items) {
      const variantId = parseInt(item.variant_id);
      const qty = parseInt(item.quantity);
      const condition = item.condition || 'good';
      const resell = item.resell !== false;
      const action = item.action || (resell ? 'restock' : 'damaged');

      if (!variantId || !qty || qty <= 0) {
        throw new Error('Буцаах барааны variant_id эсвэл quantity буруу байна');
      }

      await client.query(`
        INSERT INTO return_items
        (return_id, variant_id, quantity, condition, resell, action)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [returnId, variantId, qty, condition, resell, action]);

      // 1) Хэрэглэгчийн буцаалт: тухайн салбарын үлдэгдэл нэмэгдэнэ.
      if (return_type === 'customer') {
        const targetBranch = parseInt(source_branch_id || req.user.branch_id || 1);
        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,$2,$3)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, targetBranch, qty]);
        }

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,'customer_return',$4,$5,$6)
        `, [
          variantId,
          action === 'restock' ? targetBranch : null,
          qty,
          returnId,
          `Хэрэглэгчийн буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }

      // 2) Салбараас буцаалт: салбарын үлдэгдэл хасагдаж, агуулах нэмэгдэнэ.
      if (return_type === 'branch') {
        const fromBranch = parseInt(source_branch_id);
        if (!fromBranch) throw new Error('Салбараас буцаалт хийхэд source_branch_id хэрэгтэй');

        const stock = await client.query(
          'SELECT quantity FROM inventory WHERE variant_id=$1 AND branch_id=$2',
          [variantId, fromBranch]
        );
        const branchQty = parseInt(stock.rows[0]?.quantity || 0);
        if (branchQty < qty) throw new Error(`Салбарын үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(
          'UPDATE inventory SET quantity = quantity - $1 WHERE variant_id=$2 AND branch_id=$3',
          [qty, variantId, fromBranch]
        );

        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,1,$2)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, qty]);
        }

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,$4,'branch_return',$5,$6,$7)
        `, [
          variantId,
          fromBranch,
          action === 'restock' ? 1 : null,
          qty,
          returnId,
          `Салбараас агуулах руу буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }

      // 3) Нийлүүлэгчид буцаалт: агуулахын үлдэгдэл хасагдана.
      if (return_type === 'supplier') {
        const stock = await client.query(
          'SELECT quantity FROM inventory WHERE variant_id=$1 AND branch_id=1',
          [variantId]
        );
        const warehouseQty = parseInt(stock.rows[0]?.quantity || 0);
        if (warehouseQty < qty) throw new Error(`Агуулахын үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(
          'UPDATE inventory SET quantity = quantity - $1 WHERE variant_id=$2 AND branch_id=1',
          [qty, variantId]
        );

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,1,$2,'supplier_return',$3,$4,$5)
        `, [
          variantId,
          qty,
          returnId,
          `Нийлүүлэгчид буцаалт: supplier_id=${supplier_id || '—'} | ${reason || '—'}`,
          req.user.id
        ]);
      }

      // 4) Гэрээт борлуулагчаас буцаалт: partner - / агуулах +
      if (return_type === 'partner') {
        if (!partner_id) throw new Error('Гэрээт борлуулагчаас буцаалт хийхэд partner_id хэрэгтэй');

        const inv = await client.query(
          `SELECT on_hand_qty FROM partner_inventory
           WHERE partner_id=$1 AND variant_id=$2`,
          [partner_id, variantId]
        );

        const onHand = parseInt(inv.rows[0]?.on_hand_qty || 0);
        if (onHand < qty) throw new Error(`Гэрээт борлуулагч дээрх үлдэгдэл хүрэлцэхгүй: variant ${variantId}`);

        await client.query(`
          UPDATE partner_inventory
          SET
            returned_qty = returned_qty + $1,
            on_hand_qty = on_hand_qty - $1,
            updated_at = NOW()
          WHERE partner_id=$2 AND variant_id=$3
        `, [qty, partner_id, variantId]);

        if (action === 'restock') {
          await client.query(`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES ($1,1,$2)
            ON CONFLICT (variant_id, branch_id)
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
          `, [variantId, qty]);
        }

        await client.query(`
          INSERT INTO partner_transactions
          (type, partner_id, variant_id, quantity, amount, note, created_by)
          VALUES ('PARTNER_RETURN', $1, $2, $3, 0, $4, $5)
        `, [
          partner_id,
          variantId,
          qty,
          note || 'Ерөнхий буцаалтын API-аар гэрээт борлуулагчаас буцаалт',
          req.user.id
        ]);

        await client.query(`
          INSERT INTO stock_movements
          (variant_id, from_branch_id, to_branch_id, quantity, movement_type, reference_id, note, user_id)
          VALUES ($1,$2,$3,$4,'partner_return',$5,$6,$7)
        `, [
          variantId,
          partner_id,
          action === 'restock' ? 1 : null,
          qty,
          returnId,
          `Гэрээт борлуулагчаас буцаалт: ${reason || '—'} | ${action}`,
          req.user.id
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, return: ret.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── БУЦААЛТЫН ТҮҮХ ──
app.get('/api/returns', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        u.full_name AS created_by_name,
        b.name AS source_branch_name,
        s.name AS supplier_name,
        pb.name AS partner_name,
        COALESCE(SUM(ri.quantity),0) AS total_quantity,
        COUNT(ri.id) AS item_count
      FROM returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN branches b ON r.source_branch_id = b.id
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN branches pb ON r.partner_id = pb.id
      GROUP BY r.id, u.full_name, b.name, s.name, pb.name
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── БУЦААЛТЫН ДЭЛГЭРЭНГҮЙ ──
app.get('/api/returns/:id', authMiddleware(['warehouse','admin','super_admin']), async (req, res) => {
  try {
    const ret = await pool.query('SELECT * FROM returns WHERE id=$1', [req.params.id]);
    if(!ret.rows.length) return res.status(404).json({ error: 'Буцаалт олдсонгүй' });

    const items = await pool.query(`
      SELECT 
        ri.*,
        p.name AS product_name,
        p.sku AS product_sku,
        pv.color,
        pv.size,
        pv.barcode,
        pv.sku AS variant_sku
      FROM return_items ri
      JOIN product_variants pv ON ri.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE ri.return_id=$1
    `, [req.params.id]);

    res.json({ ...ret.rows[0], items: items.rows });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});


// ── ГЭРЭЭТ БОРЛУУЛАГЧИЙН ҮЛДЭГДЭЛ ──
};
