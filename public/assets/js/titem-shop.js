// API
const API = window.API_BASE || 'https://hat.mn';

async function apiGet(url) {
  const res = await fetch(API + url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(url, data) {
  const res = await fetch(API + url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let cart = JSON.parse(localStorage.getItem('titem_cart') || '[]');
let promoApplied = false;
let qty = 1;
let PRODUCTS = [];
let currentProduct = null;
let selectedColor = '';
let selectedSize = '';
let selectedVariant = null;

const money = n => '₮' + Number(n || 0).toLocaleString();
const byId = id => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  byId('page-' + id)?.classList.add('active');
  const pills = document.querySelectorAll('.nav-pill');
  const map = {product: 0, cart: 1, order: 2};
  if (map[id] !== undefined) pills[map[id]]?.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'cart') renderCart();
  if (id === 'order') renderOrderSummary();
}

async function loadShopProduct() {
  try {
    const list = await apiGet('/api/products?limit=20');
    PRODUCTS = list || [];
    if (!PRODUCTS.length) return showToast('No products found');
    const first = PRODUCTS.find(p => parseInt(p.total_stock || 0) > 0) || PRODUCTS[0];
    const detail = await apiGet('/api/products/' + first.id).catch(() => first);
    currentProduct = {...first, ...detail, variants: detail.variants || []};
    renderProductDetail(currentProduct);
  } catch (e) {
    console.error('Shop products error:', e);
    showToast('Product API error');
  }
}

function renderProductDetail(p) {
  const title = document.querySelector('.product-title');
  if (title) title.textContent = p.name || 'Product';
  const cat = document.querySelector('.product-category');
  if (cat) cat.textContent = p.category_name || 'Product';
  if (byId('current-price')) byId('current-price').textContent = money(p.price);
  const old = document.querySelector('.price-old');
  if (old) old.textContent = p.discount_price ? money(p.discount_price) : '';

  const variants = p.variants || [];
  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
  selectedColor = colors[0] || '';
  selectedSize = sizes[0] || '';
  selectedVariant = pickVariant();

  const colorWrap = document.querySelector('.color-options');
  if (colorWrap) {
    colorWrap.innerHTML = colors.length ? colors.map((c, i) =>
      '<button type="button" class="color-opt '+(i===0?'active':'')+'" data-color="'+esc(c)+'" title="'+esc(c)+'" style="background:'+colorHex(c)+'"></button>'
    ).join('') : '<div style="font-size:12px;color:var(--gray)">No colors</div>';
    colorWrap.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => setColorValue(btn, btn.dataset.color)));
  }

  const sizeWrap = document.querySelector('.size-options');
  if (sizeWrap) {
    sizeWrap.innerHTML = sizes.length ? sizes.map((s, i) =>
      '<button type="button" class="size-opt '+(i===0?'active':'')+'" data-size="'+esc(s)+'">'+esc(s)+'</button>'
    ).join('') : '<button type="button" class="size-opt active" data-size="">One size</button>';
    sizeWrap.querySelectorAll('[data-size]').forEach(btn => btn.addEventListener('click', () => setSizeValue(btn, btn.dataset.size)));
  }

  updateSelectedMeta();
}

function colorHex(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('хар')) return '#0a0a0a';
  if (n.includes('бор')) return '#8B4513';
  if (n.includes('хөх')) return '#1a3a5c';
  if (n.includes('ногоон')) return '#2c5f2e';
  if (n.includes('улаан')) return '#c0392b';
  if (n.includes('цагаан')) return '#f4f4f4';
  return '#999';
}

function pickVariant() {
  const variants = currentProduct?.variants || [];
  return variants.find(v => (!selectedColor || v.color === selectedColor) && (!selectedSize || v.size === selectedSize)) || variants[0] || null;
}

function updateSelectedMeta() {
  selectedVariant = pickVariant();
  if (byId('color-name')) byId('color-name').textContent = selectedColor || '-';
  const stock = parseInt(selectedVariant?.stock ?? currentProduct?.total_stock ?? 0);
  const stockEl = document.querySelector('.stock-ok');
  if (stockEl) textSet(stockEl, stock > 0 ? 'In stock (' + stock + ')' : 'Out of stock');
  document.querySelectorAll('.meta-row').forEach(row => {
    const key = row.querySelector('.meta-key')?.textContent || '';
    if (key.includes('SKU')) textSet(row.querySelector('.meta-val'), selectedVariant?.sku || currentProduct?.sku || '-');
  });
}

function textSet(el, value) { if (el) el.textContent = value; }
function setImg(el, emoji) { document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active')); el?.classList.add('active'); textSet(byId('main-img'), emoji); }
function setColor(el, name, emoji) { setColorValue(el, name); if (emoji) textSet(byId('main-img'), emoji); }
function setColorValue(el, name) { document.querySelectorAll('.color-opt').forEach(c => c.classList.remove('active')); el?.classList.add('active'); selectedColor = name || ''; updateSelectedMeta(); }
function setSize(el) { setSizeValue(el, el?.textContent || ''); }
function setSizeValue(el, size) { if (el?.classList.contains('out')) return; document.querySelectorAll('.size-opt:not(.out)').forEach(s => s.classList.remove('active')); el?.classList.add('active'); selectedSize = size || ''; updateSelectedMeta(); }
function changeQty(d) { const stock = parseInt(selectedVariant?.stock ?? currentProduct?.total_stock ?? 10); qty = Math.max(1, Math.min(Math.max(stock, 1), qty + d)); textSet(byId('qty-num'), qty); }
function toggleWish(btn) { btn.classList.toggle('active'); showToast(btn.classList.contains('active') ? 'Added to wishlist' : 'Removed from wishlist'); }

function saveCart() { localStorage.setItem('titem_cart', JSON.stringify(cart)); }
function addToCart() {
  if (!currentProduct) return showToast('Product is not loaded');
  const stock = parseInt(selectedVariant?.stock ?? currentProduct.total_stock ?? 0);
  if (stock <= 0) return showToast('Not enough stock');
  const key = selectedVariant?.id || currentProduct.id;
  const existing = cart.find(c => String(c.key) === String(key));
  if (existing) existing.qty = Math.min(stock, existing.qty + qty);
  else cart.push({key, id: currentProduct.id, variantId: selectedVariant?.id || null, name: currentProduct.name, cat: currentProduct.category_name || 'Product', color: selectedColor || selectedVariant?.color || '-', size: selectedSize || selectedVariant?.size || '-', price: parseInt(currentProduct.price || 0), qty, stock, emoji: byId('main-img')?.textContent || '🧢'});
  saveCart();
  updateCartCount();
  showToast('Added to cart');
}

function updateCartCount() { textSet(byId('cart-count'), cart.reduce((s, i) => s + i.qty, 0)); }
function renderCart() {
  const list = byId('cart-items-list');
  const empty = byId('cart-empty');
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = cart.length ? 5000 : 0;
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + delivery - discount;
  textSet(byId('cart-item-count'), cart.length + ' items');
  textSet(byId('sum-subtotal'), money(subtotal));
  textSet(byId('sum-delivery'), delivery ? money(delivery) : 'Free');
  textSet(byId('sum-discount'), '-' + money(discount));
  textSet(byId('sum-total'), money(total));
  if (!list || !empty) return;
  if (!cart.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = cart.map(item => '<div class="cart-item" id="ci-'+item.key+'"><div class="cart-item-img">'+item.emoji+'</div><div class="cart-item-info"><div class="cart-item-cat">'+esc(item.cat)+'</div><div class="cart-item-name">'+esc(item.name)+'</div><div class="cart-item-variant"><span>Color: '+esc(item.color)+'</span><span>Size: '+esc(item.size)+'</span></div></div><div class="cart-item-right"><div class="cart-item-price">'+money(item.price*item.qty)+'</div><div class="cart-qty"><button onclick="cartQty(\''+item.key+'\',-1)">-</button><span>'+item.qty+'</span><button onclick="cartQty(\''+item.key+'\',1)">+</button></div><button class="cart-remove" onclick="removeCart(\''+item.key+'\')">Remove</button></div></div>').join('') + empty.outerHTML;
}
function cartQty(key, d) { const item = cart.find(c => String(c.key) === String(key)); if (!item) return; item.qty = Math.max(1, Math.min(item.stock || 99, item.qty + d)); saveCart(); updateCartCount(); renderCart(); }
function removeCart(key) { cart = cart.filter(c => String(c.key) !== String(key)); saveCart(); updateCartCount(); renderCart(); showToast('Removed'); }
function applyPromo() { const code = byId('promo-input')?.value.trim().toUpperCase(); const msg = byId('promo-msg'); promoApplied = code === 'TITEM10'; if (msg) { msg.style.display = 'block'; msg.style.color = promoApplied ? 'var(--green)' : 'var(--red)'; msg.textContent = promoApplied ? 'Promo applied' : (code ? 'Invalid code' : 'Enter promo code'); } renderCart(); }

function renderOrderSummary() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const delivery = cart.length ? 5000 : 0;
  const total = subtotal + delivery - discount;
  textSet(byId('mini-subtotal'), money(subtotal));
  textSet(byId('mini-discount'), '-' + money(discount));
  textSet(byId('mini-total'), money(total));
  textSet(byId('qr-amount'), money(total));
  if (byId('mini-items')) byId('mini-items').innerHTML = cart.map(i => '<div class="mini-item"><div class="mini-img">'+i.emoji+'</div><div class="mini-info"><div class="mini-name">'+esc(i.name)+'</div><div class="mini-variant">'+esc(i.color)+' - '+esc(i.size)+' - '+i.qty+'</div></div><div class="mini-price">'+money(i.price*i.qty)+'</div></div>').join('');
}
function setPayment(el) { document.querySelectorAll('.payment-opt').forEach(p => p.classList.remove('active')); el.classList.add('active'); const name = el.querySelector('.payment-name')?.textContent; if (byId('qpay-section')) byId('qpay-section').style.display = name === 'QPay' ? 'block' : 'none'; }
function toggleEbarimt(el) { if (byId('ebarimt-form')) byId('ebarimt-form').style.display = el.checked ? 'block' : 'none'; }

async function placeOrder() {
  if (!cart.length) return showToast('Cart is empty');
  const inputs = document.querySelectorAll('.form-input');
  const lastName = inputs[0]?.value || '';
  const firstName = inputs[1]?.value || '';
  const phone = inputs[2]?.value || '';
  const ebarimt = byId('ebarimt-check')?.checked || false;
  const activePayment = document.querySelector('.payment-opt.active .payment-name')?.textContent || 'QPay';
  const payMap = {'QPay':'qpay','Card':'card','Cash':'cash','Карт':'card','Бэлэн':'cash'};
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const delivery = 5000;
  const total = subtotal + delivery - discount;
  const btn = document.querySelector('.btn-place-order');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
  try {
    const result = await apiPost('/api/orders', {branch_id: 2, customer_name: (lastName + ' ' + firstName).trim() || 'Online customer', customer_phone: phone, items: cart.map(i => ({variant_id:i.variantId, name:i.name, color:i.color, size:i.size, quantity:i.qty, price:i.price})), subtotal, discount_amount: discount, total, payment_method: payMap[activePayment] || 'qpay', ebarimt, note: 'Online order - delivery: ' + money(delivery)});
    const orderNum = result.order?.order_number || '#TIT-' + Date.now().toString().slice(-6);
    textSet(byId('order-num'), orderNum);
    textSet(byId('sc-num'), orderNum);
    textSet(byId('sc-date'), new Date().toLocaleString('mn-MN'));
    textSet(byId('sc-total'), money(total));
    localStorage.removeItem('titem_cart');
    cart = [];
    updateCartCount();
    showPage('success');
  } catch(e) {
    console.error('Order error:', e);
    showToast('Order failed');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Place order'; }
  }
}
function resetCart() { cart=[]; promoApplied=false; qty=1; localStorage.removeItem('titem_cart'); updateCartCount(); }
function showToast(msg) { textSet(byId('toast-msg'), msg); const t=byId('toast'); if (!t) return; t.classList.add('show'); clearTimeout(window._tt); window._tt=setTimeout(()=>t.classList.remove('show'),2800); }

textSet(byId('sc-date'), new Date().toLocaleDateString('mn-MN'));
loadShopProduct();
updateCartCount();
