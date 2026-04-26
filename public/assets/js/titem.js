// ── API CONFIG ──
const API = '';

// ── STATE ──
const CAT_NAMES={hat:'Малгай',scarf:'Ороолт',glove:'Бээлий',face:'Faceshield',neck:'Алчуур'};
const CAT_SLUG={'Малгай':'hat','Ороолт':'scarf','Бээлий':'glove','Faceshield':'face','Алчуур':'neck'};
const CAT_EMOJI={hat:'🧢',scarf:'🧣',glove:'🧤',face:'😷',neck:'🧦'};
const PAGE_SIZE=9;
let ALL_PRODUCTS=[];
let cart=JSON.parse(localStorage.getItem('titem_cart')||'[]');
let currentCat='all';
let currentPage=1;
let searchQuery='';

// ── API FETCH ──
async function fetchProducts(){
  try {
    showLoading(true);
    const res=await fetch(`${API}/api/products?limit=100`);
    if(!res.ok) throw new Error('API алдаа');
    const data=await res.json();
    ALL_PRODUCTS=data.map(p=>{
      const catSlug=CAT_SLUG[p.category_name]||'hat';
      return {
        id:p.id,
        name:p.name,
        cat:catSlug,
        emoji:CAT_EMOJI[catSlug]||'🧢',
        price:p.price,
        oldPrice:p.discount_price||null,
        stock:parseInt(p.total_stock)||0,
        images:p.images||[]
      };
    });
    renderProducts();
  } catch(err){
    console.error('Бараа татах алдаа:',err);
    showError();
  } finally {
    showLoading(false);
  }
}

function showLoading(show){
  if(show) document.getElementById('product-grid').innerHTML=`
    <div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)">
      <div style="font-size:32px;margin-bottom:12px;display:inline-block;animation:spin 1s linear infinite">⟳</div>
      <div style="font-size:13px">Бараа ачааллаж байна...</div>
    </div>`;
}

function showError(){
  document.getElementById('product-grid').innerHTML=`
    <div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)">
      <div style="font-size:40px;margin-bottom:12px">😕</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">Бараа татахад алдаа гарлаа</div>
      <button onclick="fetchProducts()" style="background:var(--black);color:var(--white);border:none;padding:10px 24px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;font-family:var(--font-body)">Дахин оролдох</button>
    </div>`;
}

// ── RENDER ──
function getFiltered(){
  let list=[...ALL_PRODUCTS];
  if(currentCat==='new') list=list.filter(p=>p.stock>0).slice(0,12);
  else if(currentCat!=='all') list=list.filter(p=>p.cat===currentCat);
  if(searchQuery) list=list.filter(p=>p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  return list;
}

function renderProducts(){
  const filtered=getFiltered();
  const totalPages=Math.ceil(filtered.length/PAGE_SIZE)||1;
  currentPage=Math.min(currentPage,totalPages);
  const page=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const grid=document.getElementById('product-grid');
  if(!page.length){
    grid.innerHTML=`<div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)"><div style="font-size:40px;margin-bottom:12px">🔍</div><div>Бараа олдсонгүй</div></div>`;
    document.getElementById('pagination').innerHTML='';
    return;
  }
  grid.innerHTML=page.map(p=>`
    <div class="product-card">
      <div class="p-img">
        <div class="p-img-emoji">${p.emoji}</div>
        ${p.stock<=0?'<div class="p-badge" style="background:#e74c3c">Дууссан</div>':p.stock<=5?`<div class="p-badge" style="background:#e67e22">${p.stock} үлдсэн</div>`:''}
        ${p.stock>0?`<button class="p-add" onclick="addCart(${p.id})">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Сагсанд нэмэх
        </button>`:''}
      </div>
      <div class="p-info">
        <div class="p-cat">${CAT_NAMES[p.cat]||''}</div>
        <div class="p-name">${p.name}</div>
        <div class="p-bottom">
          <div class="p-price">
            ${p.oldPrice?`<span class="p-price-old">&#8366;${p.oldPrice.toLocaleString()}</span>`:''}
            &#8366;${p.price.toLocaleString()}
          </div>
          <div style="font-size:11px;color:var(--gray)">${p.stock>0?p.stock+' ширхэг':'—'}</div>
        </div>
      </div>
    </div>`).join('');
  renderPagination(totalPages);
}

function renderPagination(total){
  const pg=document.getElementById('pagination');
  if(total<=1){pg.innerHTML='';return;}
  let html=`<button class="pg-btn arrow" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}>&#8249;</button>`;
  for(let i=1;i<=total;i++){
    html+=`<button class="pg-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
  }
  html+=`<button class="pg-btn arrow" onclick="changePage(${currentPage+1})" ${currentPage===total?'disabled':''}>&#8250;</button>`;
  pg.innerHTML=html;
}

function changePage(p){
  const total=Math.ceil(getFiltered().length/PAGE_SIZE)||1;
  if(p<1||p>total)return;
  currentPage=p;
  renderProducts();
  document.getElementById('products').scrollIntoView({behavior:'smooth',block:'start'});
}

function filterCat(cat,btn){
  currentCat=cat;currentPage=1;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderProducts();
}

let searchTimer;
function handleSearch(q){
  searchQuery=q;currentPage=1;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(renderProducts,300);
}

// ── SLIDER ──
let slideIdx=0;
const TOTAL_SLIDES=3;
function goSlide(i){
  slideIdx=i;
  document.getElementById('slides').style.transform=`translateX(-${i*100}%)`;
  document.querySelectorAll('.slider-dot').forEach((d,j)=>d.classList.toggle('active',j===i));
}
function nextSlide(){goSlide((slideIdx+1)%TOTAL_SLIDES)}
function prevSlide(){goSlide((slideIdx-1+TOTAL_SLIDES)%TOTAL_SLIDES)}
setInterval(nextSlide,5000);

// ── CART ──
function saveCart(){localStorage.setItem('titem_cart',JSON.stringify(cart));}

function addCart(id){
  const p=ALL_PRODUCTS.find(pr=>pr.id===id);
  if(!p||p.stock<=0)return;
  const ex=cart.find(c=>c.id===id);
  if(ex){if(ex.qty>=p.stock){showToast('Үлдэгдэл хүрэлцэхгүй');return;}ex.qty++;}
  else cart.push({id:p.id,name:p.name,emoji:p.emoji,cat:p.cat,price:p.price,qty:1,stock:p.stock});
  saveCart();updateCartUI();
  showToast('"'+p.name+'" сагсанд нэмэгдлээ');
}
function removeCart(id){cart=cart.filter(c=>c.id!==id);saveCart();updateCartUI();}
function changeQty(id,d){
  const item=cart.find(c=>c.id===id);
  if(!item)return;
  item.qty=Math.max(1,Math.min(item.stock||99,item.qty+d));
  saveCart();updateCartUI();
}
function updateCartUI(){
  const total=cart.reduce((s,i)=>s+i.qty,0);
  const sum=cart.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('cart-badge').textContent=total;
  document.getElementById('cart-sub').textContent='&#8366;'+sum.toLocaleString();
  document.getElementById('cart-total').textContent='&#8366;'+sum.toLocaleString();
  const body=document.getElementById('cart-body');
  if(!cart.length){body.innerHTML='<div class="cart-empty"><div class="cart-empty-emoji">🛒</div><div>Сагс хоосон байна</div></div>';return;}
  body.innerHTML=cart.map(item=>`
    <div class="cart-item-row">
      <div class="ci-thumb">${item.emoji}</div>
      <div class="ci-details">
        <div class="ci-name">${item.name}</div>
        <div class="ci-meta">${CAT_NAMES[item.cat]||''}</div>
        <div class="ci-price-qty">
          <div class="ci-price">&#8366;${(item.price*item.qty).toLocaleString()}</div>
          <div class="ci-qty-ctrl">
            <button onclick="changeQty(${item.id},-1)">&#8722;</button>
            <span>${item.qty}</span>
            <button onclick="changeQty(${item.id},1)">+</button>
          </div>
        </div>
      </div>
      <button class="ci-remove" onclick="removeCart(${item.id})">&#215;</button>
    </div>`).join('');
}
function openCart(){document.getElementById('cart-overlay').classList.add('open');document.getElementById('cart-drawer').classList.add('open');}
function closeCart(){document.getElementById('cart-overlay').classList.remove('open');document.getElementById('cart-drawer').classList.remove('open');}

function showToast(msg){
  document.getElementById('toast-msg').textContent=msg;
  const t=document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2800);
}

const s=document.createElement('style');
s.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(s);

// ── INIT ──
fetchProducts();
updateCartUI();
