// ── API ──
const API = '';

async function apiPost(url, data) {
  const res = await fetch(API + url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── State ──
let cart = JSON.parse(localStorage.getItem('titem_cart') || '[]');
let promoApplied = false;
let qty = 1;
let selectedColor = 'Хар';
let selectedSize = 'S';

// ── Page navigation ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const pills = document.querySelectorAll('.nav-pill');
  const map = {product:0, cart:1, order:2};
  if (map[id] !== undefined) pills[map[id]]?.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'cart') renderCart();
  if (id === 'order') renderOrderSummary();
}

// ── Product page ──
function setImg(el, emoji) {
  document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('main-img').textContent = emoji;
}
function setColor(el, name, emoji) {
  document.querySelectorAll('.color-opt').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  selectedColor = name;
  document.getElementById('color-name').textContent = name;
  document.getElementById('main-img').textContent = emoji;
}
function setSize(el) {
  if (el.classList.contains('out')) return;
  document.querySelectorAll('.size-opt:not(.out)').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  selectedSize = el.textContent;
}
function changeQty(d) {
  qty = Math.max(1, Math.min(10, qty + d));
  document.getElementById('qty-num').textContent = qty;
}
function toggleWish(btn) {
  btn.classList.toggle('active');
  showToast(btn.classList.contains('active') ? '❤️ Хүслийн жагсаалтад нэмэгдлээ' : 'Хүслийн жагсаалтаас хасагдлаа');
}

// ── Cart ──
function addToCart() {
  const item = {
    id: Date.now(),
    name: 'Классик Бүргэд Snapback',
    cat: 'Малгай',
    color: selectedColor,
    size: selectedSize,
    price: 45000,
    qty: qty,
    emoji: document.getElementById('main-img').textContent
  };
  const existing = cart.find(c => c.color === item.color && c.size === item.size);
  if (existing) {
    existing.qty = Math.min(10, existing.qty + qty);
    showToast('Сагсанд нэмэгдлээ (' + existing.qty + ' ширхэг)');
  } else {
    cart.push(item);
    showToast('"' + item.name + '" сагсанд нэмэгдлээ');
  }
  updateCartCount();
}

function updateCartCount() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cart-count').textContent = total;
}

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const empty = document.getElementById('cart-empty');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = cart.length > 0 ? 5000 : 0;
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + delivery - discount;

  document.getElementById('cart-item-count').textContent = cart.length + ' бараа';
  document.getElementById('sum-subtotal').textContent = '₮' + subtotal.toLocaleString();
  document.getElementById('sum-delivery').textContent = delivery > 0 ? '₮' + delivery.toLocaleString() : 'Үнэгүй';
  document.getElementById('sum-discount').textContent = '−₮' + discount.toLocaleString();
  document.getElementById('sum-total').textContent = '₮' + total.toLocaleString();

  if (cart.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const itemsHtml = cart.map(item => `
    <div class="cart-item" id="ci-${item.id}">
      <div class="cart-item-img">${item.emoji}</div>
      <div class="cart-item-info">
        <div class="cart-item-cat">${item.cat}</div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-variant">
          <span>Өнгө: ${item.color}</span>
          <span>Хэмжээ: ${item.size}</span>
        </div>
      </div>
      <div class="cart-item-right">
        <div class="cart-item-price">₮${(item.price * item.qty).toLocaleString()}</div>
        <div class="cart-qty">
          <button onclick="cartQty(${item.id},-1)">−</button>
          <span>${item.qty}</span>
          <button onclick="cartQty(${item.id},1)">+</button>
        </div>
        <button class="cart-remove" onclick="removeCart(${item.id})">Хасах</button>
      </div>
    </div>
  `).join('');

  list.innerHTML = itemsHtml + (empty.outerHTML);
}

function cartQty(id, d) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty = Math.max(1, Math.min(10, item.qty + d));
  updateCartCount();
  renderCart();
}
function removeCart(id) {
  cart = cart.filter(c => c.id !== id);
  updateCartCount();
  renderCart();
  showToast('Сагснаас хасагдлаа');
}
function applyPromo() {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  const msg = document.getElementById('promo-msg');
  if (code === 'TITEM10') {
    promoApplied = true;
    msg.style.display = 'block';
    msg.style.color = 'var(--green)';
    msg.textContent = '✓ 10% хямдрал амжилттай хэрэглэгдлээ';
    renderCart();
  } else if (code === '') {
    msg.style.display = 'block';
    msg.style.color = 'var(--red)';
    msg.textContent = 'Код оруулна уу';
  } else {
    promoApplied = false;
    msg.style.display = 'block';
    msg.style.color = 'var(--red)';
    msg.textContent = '✗ Код буруу байна';
  }
}

// ── Order ──
function renderOrderSummary() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + 5000 - discount;

  document.getElementById('mini-subtotal').textContent = '₮' + subtotal.toLocaleString();
  document.getElementById('mini-discount').textContent = '−₮' + discount.toLocaleString();
  document.getElementById('mini-total').textContent = '₮' + total.toLocaleString();
  document.getElementById('qr-amount').textContent = '₮' + total.toLocaleString();

  const items = cart.map(i => `
    <div class="mini-item">
      <div class="mini-img">${i.emoji}</div>
      <div class="mini-info">
        <div class="mini-name">${i.name}</div>
        <div class="mini-variant">${i.color} · ${i.size} · ${i.qty}ш</div>
      </div>
      <div class="mini-price">₮${(i.price * i.qty).toLocaleString()}</div>
    </div>
  `).join('');
  document.getElementById('mini-items').innerHTML = items;
}

function setPayment(el) {
  document.querySelectorAll('.payment-opt').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const name = el.querySelector('.payment-name').textContent;
  document.getElementById('qpay-section').style.display = name === 'QPay' ? 'block' : 'none';
}

function toggleEbarimt(el) {
  document.getElementById('ebarimt-form').style.display = el.checked ? 'block' : 'none';
}

async function placeOrder() {
  if (!cart.length) { showToast('Сагс хоосон байна'); return; }

  // Хэрэглэгчийн мэдээлэл
  const lastName = document.querySelector('input[placeholder="Дорж"]')?.value || '';
  const firstName = document.querySelector('input[placeholder="Болд"]')?.value || '';
  const phone = document.querySelector('input[placeholder="9900 0000"]')?.value || '';
  const ebarimt = document.getElementById('ebarimt-check')?.checked || false;
  const ebarimtRegno = document.querySelector('input[placeholder="АА00000000"]')?.value || '';

  // Төлбөрийн арга
  const activePayment = document.querySelector('.payment-opt.active .payment-name')?.textContent || 'QPay';
  const payMap = {'QPay': 'qpay', 'Карт': 'card', 'Бэлэн': 'cash'};
  const payMethod = payMap[activePayment] || 'qpay';

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const delivery = 5000;
  const total = subtotal + delivery - discount;

  const btn = document.querySelector('.btn-place-order');
  if (btn) { btn.disabled = true; btn.textContent = 'Боловсруулж байна...'; }

  try {
    const orderData = {
      branch_id: 2, // Салбар 1 — онлайн захиалга
      customer_name: (lastName + ' ' + firstName).trim() || 'Онлайн хэрэглэгч',
      customer_phone: phone,
      items: cart.map(i => ({
        variant_id: i.variantId || null,
        name: i.name,
        color: i.color || '—',
        size: i.size || '—',
        quantity: i.qty,
        price: i.price
      })),
      subtotal,
      discount_amount: discount,
      total,
      payment_method: payMethod,
      ebarimt,
      ebarimt_regno: ebarimtRegno,
      note: 'Онлайн захиалга · Хүргэлт: ₮' + delivery.toLocaleString()
    };

    const result = await apiPost('/api/orders', orderData);
    const orderNum = result.order?.order_number || '#TIT-' + Date.now().toString().slice(-6);
    const now = new Date();
    const dateStr = now.getFullYear() + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

    document.getElementById('order-num').textContent = orderNum;
    document.getElementById('sc-num').textContent = orderNum;
    document.getElementById('sc-date').textContent = dateStr;
    document.getElementById('sc-total').textContent = '₮' + total.toLocaleString();
    document.getElementById('sc-payment') && (document.getElementById('sc-payment').textContent = activePayment);

    // Сагс цэвэрлэх
    localStorage.removeItem('titem_cart');
    showPage('success');

  } catch(e) {
    console.error('Захиалга:', e);
    showToast('Захиалга бүртгэхэд алдаа гарлаа. Дахин оролдоно уу.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Захиалга батлах'; }
  }
}

function resetCart() {
  cart = [];
  promoApplied = false;
  qty = 1;
  localStorage.removeItem('titem_cart');
  updateCartCount();
}

// ── Toast ──
function showToast(msg) {
  document.getElementById('toast-msg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('show'), 2800);
}

// Init
document.getElementById('sc-date').textContent = new Date().toLocaleDateString('mn-MN');
