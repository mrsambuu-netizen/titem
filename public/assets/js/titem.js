// API CONFIG
const API = window.API_BASE || 'https://hat.mn';
const t = (s) => s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// STATE
const CAT_NAMES={hat:t('\\u041c\\u0430\\u043b\\u0433\\u0430\\u0439'),scarf:t('\\u041e\\u0440\\u043e\\u043e\\u043b\\u0442'),glove:t('\\u0411\\u044d\\u044d\\u043b\\u0438\\u0439'),face:'Faceshield',neck:t('\\u0410\\u043b\\u0447\\u0443\\u0443\\u0440')};
const CAT_EMOJI={hat:t('\\u{1f9e2}'),scarf:t('\\u{1f9e3}'),glove:t('\\u{1f9e4}'),face:t('\\u{1f637}'),neck:t('\\u{1f9e6}')};
const PAGE_SIZE=9;
let ALL_PRODUCTS=[];
let WEBSITE_SETTINGS={};
let cart=JSON.parse(localStorage.getItem('titem_cart')||'[]');
let currentCat='all';
let currentPage=1;
let searchQuery='';

function money(value){return t('\\u20ae')+Number(value||0).toLocaleString();}
function productImage(images){return Array.isArray(images)&&images.length?images[0]:'';}
function safeText(value){return String(value == null ? '' : value).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function categorySlug(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('faceshield')) return 'face';
  if(n.includes(t('\\u043e\\u0440\\u043e\\u043e\\u043b'))) return 'scarf';
  if(n.includes(t('\\u0431\\u044d\\u044d\\u043b'))) return 'glove';
  if(n.includes(t('\\u0430\\u043b\\u0447'))) return 'neck';
  return 'hat';
}

async function fetchJson(url){
  const res=await fetch(url);
  if(!res.ok) throw new Error(t('API \\u0430\\u043b\\u0434\\u0430\\u0430'));
  return res.json();
}

async function fetchWebsiteSettings(){
  try{
    WEBSITE_SETTINGS=await fetchJson(`${API}/api/website/settings`);
    applyWebsiteSettings();
  }catch(err){
    console.warn(t('Website \\u0442\\u043e\\u0445\\u0438\\u0440\\u0433\\u043e\\u043e \\u0442\\u0430\\u0442\\u0430\\u0445\\u0430\\u0434 \\u0430\\u043b\\u0434\\u0430\\u0430:'),err);
  }
}

function applyWebsiteSettings(){
  const s=WEBSITE_SETTINGS||{};
  const firstSlide=document.querySelector('.slide-1');
  const title=document.querySelector('.slide-1 .slide-title');
  const desc=document.querySelector('.slide-1 .slide-desc');
  const button=document.querySelector('.slide-1 .btn-primary');
  const footer=document.querySelector('.footer-desc');
  if(title && s.hero_title) title.innerHTML=safeText(s.hero_title).replace(/\n/g,'<br>');
  if(desc && s.hero_subtitle) desc.textContent=s.hero_subtitle;
  if(button && s.hero_button) button.textContent=s.hero_button;
  if(footer && s.footer_text) footer.textContent=s.footer_text;
  const phoneLink=[...document.querySelectorAll('.footer-col a')].find(a=>a.textContent.includes('+976')||a.href.startsWith('tel:'));
  if(phoneLink && s.footer_phone){phoneLink.textContent=s.footer_phone; phoneLink.href='tel:'+s.footer_phone.replace(/\s/g,'');}
  const emailLink=[...document.querySelectorAll('.footer-col a')].find(a=>a.href.startsWith('mailto:'));
  if(emailLink && s.footer_email){emailLink.textContent=s.footer_email; emailLink.href='mailto:'+s.footer_email;}
  const socials=document.querySelectorAll('.footer-social a');
  if(s.facebook && socials[0]) socials[0].href=s.facebook;
  if(s.instagram && socials[1]) socials[1].href=s.instagram;
  if(firstSlide && s.banner_image){
    const imgBox=firstSlide.querySelector('.slide-img');
    if(imgBox) imgBox.innerHTML=`<img class="hero-banner-img" src="${safeText(s.banner_image)}" alt="Banner"><div class="slide-badge">${t('\\u041e\\u043d\\u0446\\u043b\\u043e\\u0445')}</div>`;
  }
}

// API FETCH
async function fetchProducts(){
  try {
    showLoading(true);
    let data;
    try{ data=await fetchJson(`${API}/api/website/products?limit=100`); }
    catch(e){ data=await fetchJson(`${API}/api/products?limit=100`); }
    ALL_PRODUCTS=data.map(p=>{
      const catSlug=categorySlug(p.category_name);
      const images=Array.isArray(p.images)?p.images:[];
      return {
        id:p.id,
        name:p.name,
        cat:catSlug,
        emoji:CAT_EMOJI[catSlug]||CAT_EMOJI.hat,
        price:Number(p.discount_price||p.price||0),
        oldPrice:p.discount_price?Number(p.price||0):null,
        stock:parseInt(p.total_stock)||0,
        images,
        image:productImage(images),
        description:p.website_description||p.description||'',
        featured:!!p.website_featured
      };
    });
    renderProducts();
  } catch(err){
    console.error(t('\\u0411\\u0430\\u0440\\u0430\\u0430 \\u0442\\u0430\\u0442\\u0430\\u0445 \\u0430\\u043b\\u0434\\u0430\\u0430:'),err);
    showError();
  } finally {
    showLoading(false);
  }
}

function showLoading(show){
  if(show) document.getElementById('product-grid').innerHTML=`
    <div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)">
      <div style="font-size:32px;margin-bottom:12px;display:inline-block;animation:spin 1s linear infinite">&#10227;</div>
      <div style="font-size:13px">${t('\\u0411\\u0430\\u0440\\u0430\\u0430 \\u0430\\u0447\\u0430\\u0430\\u043b\\u043b\\u0430\\u0436 \\u0431\\u0430\\u0439\\u043d\\u0430...')}</div>
    </div>`;
}

function showError(){
  document.getElementById('product-grid').innerHTML=`
    <div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)">
      <div style="font-size:40px;margin-bottom:12px">!</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">${t('\\u0411\\u0430\\u0440\\u0430\\u0430 \\u0442\\u0430\\u0442\\u0430\\u0445\\u0430\\u0434 \\u0430\\u043b\\u0434\\u0430\\u0430 \\u0433\\u0430\\u0440\\u043b\\u0430\\u0430')}</div>
      <button onclick="fetchProducts()" style="background:var(--black);color:var(--white);border:none;padding:10px 24px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;font-family:var(--font-body)">${t('\\u0414\\u0430\\u0445\\u0438\\u043d \\u043e\\u0440\\u043e\\u043b\\u0434\\u043e\\u0445')}</button>
    </div>`;
}

function getFiltered(){
  let list=[...ALL_PRODUCTS];
  if(currentCat==='new') list=list.filter(p=>p.featured||p.stock>0).slice(0,12);
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
    grid.innerHTML=`<div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--gray)"><div style="font-size:40px;margin-bottom:12px">?</div><div>${t('\\u0411\\u0430\\u0440\\u0430\\u0430 \\u043e\\u043b\\u0434\\u0441\\u043e\\u043d\\u0433\\u04af\\u0439')}</div></div>`;
    document.getElementById('pagination').innerHTML='';
    return;
  }
  grid.innerHTML=page.map(p=>`
    <div class="product-card">
      <div class="p-img">
        ${p.image?`<img src="${safeText(p.image)}" alt="${safeText(p.name)}">`:`<div class="p-img-emoji">${p.emoji}</div>`}
        ${p.featured?`<div class="p-badge">${t('\\u041e\\u043d\\u0446\\u043b\\u043e\\u0445')}</div>`:''}
        ${p.stock<=0?`<div class="p-badge" style="background:#e74c3c">${t('\\u0414\\u0443\\u0443\\u0441\\u0441\\u0430\\u043d')}</div>`:p.stock<=5?`<div class="p-badge" style="background:#e67e22">${p.stock} ${t('\\u04af\\u043b\\u0434\\u0441\\u044d\\u043d')}</div>`:''}
        ${p.stock>0?`<button class="p-add" onclick="addCart(${p.id})">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          ${t('\\u0421\\u0430\\u0433\\u0441\\u0430\\u043d\\u0434 \\u043d\\u044d\\u043c\\u044d\\u0445')}
        </button>`:''}
      </div>
      <div class="p-info">
        <div class="p-cat">${CAT_NAMES[p.cat]||''}</div>
        <div class="p-name">${safeText(p.name)}</div>
        <div class="p-bottom">
          <div class="p-price">
            ${p.oldPrice?`<span class="p-price-old">${money(p.oldPrice)}</span>`:''}
            ${money(p.price)}
          </div>
          <div style="font-size:11px;color:var(--gray)">${p.stock>0?p.stock+' '+t('\\u0448\\u0438\\u0440\\u0445\\u044d\\u0433'):'-'}</div>
        </div>
      </div>
    </div>`).join('');
  renderPagination(totalPages);
}

function renderPagination(total){
  const pg=document.getElementById('pagination');
  if(total<=1){pg.innerHTML='';return;}
  let html=`<button class="pg-btn arrow" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}>&#8249;</button>`;
  for(let i=1;i<=total;i++) html+=`<button class="pg-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
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
function handleSearch(q){searchQuery=q;currentPage=1;clearTimeout(searchTimer);searchTimer=setTimeout(renderProducts,300);}

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

function saveCart(){localStorage.setItem('titem_cart',JSON.stringify(cart));}
function addCart(id){
  const p=ALL_PRODUCTS.find(pr=>pr.id===id);
  if(!p||p.stock<=0)return;
  const ex=cart.find(c=>c.id===id);
  if(ex){if(ex.qty>=p.stock){showToast(t('\\u04ae\\u043b\\u0434\\u044d\\u0433\\u0434\\u044d\\u043b \\u0445\\u04af\\u0440\\u044d\\u043b\\u0446\\u044d\\u0445\\u0433\\u04af\\u0439'));return;}ex.qty++;}
  else cart.push({id:p.id,name:p.name,emoji:p.emoji,image:p.image,cat:p.cat,price:p.price,qty:1,stock:p.stock});
  saveCart();updateCartUI();showToast('"'+p.name+'" '+t('\\u0441\\u0430\\u0433\\u0441\\u0430\\u043d\\u0434 \\u043d\\u044d\\u043c\\u044d\\u0433\\u0434\\u043b\\u044d\\u044d'));
}
function removeCart(id){cart=cart.filter(c=>c.id!==id);saveCart();updateCartUI();}
function changeQty(id,d){const item=cart.find(c=>c.id===id);if(!item)return;item.qty=Math.max(1,Math.min(item.stock||99,item.qty+d));saveCart();updateCartUI();}
function updateCartUI(){
  const total=cart.reduce((s,i)=>s+i.qty,0);
  const sum=cart.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('cart-badge').textContent=total;
  document.getElementById('cart-sub').textContent=money(sum);
  document.getElementById('cart-total').textContent=money(sum);
  const body=document.getElementById('cart-body');
  if(!cart.length){body.innerHTML=`<div class="cart-empty"><div class="cart-empty-emoji">${t('\\u{1f6d2}')}</div><div>${t('\\u0421\\u0430\\u0433\\u0441 \\u0445\\u043e\\u043e\\u0441\\u043e\\u043d \\u0431\\u0430\\u0439\\u043d\\u0430')}</div></div>`;return;}
  body.innerHTML=cart.map(item=>`
    <div class="cart-item-row">
      <div class="ci-thumb">${item.image?`<img src="${safeText(item.image)}" alt="${safeText(item.name)}">`:item.emoji}</div>
      <div class="ci-details">
        <div class="ci-name">${safeText(item.name)}</div>
        <div class="ci-meta">${CAT_NAMES[item.cat]||''}</div>
        <div class="ci-price-qty"><div class="ci-price">${money(item.price*item.qty)}</div><div class="ci-qty-ctrl"><button onclick="changeQty(${item.id},-1)">&#8722;</button><span>${item.qty}</span><button onclick="changeQty(${item.id},1)">+</button></div></div>
      </div>
      <button class="ci-remove" onclick="removeCart(${item.id})">&#215;</button>
    </div>`).join('');
}
function openCart(){document.getElementById('cart-overlay').classList.add('open');document.getElementById('cart-drawer').classList.add('open');}
function closeCart(){document.getElementById('cart-overlay').classList.remove('open');document.getElementById('cart-drawer').classList.remove('open');}
function showToast(msg){const el=document.getElementById('toast');document.getElementById('toast-msg').textContent=msg;el.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>el.classList.remove('show'),2800);}
const spinStyle=document.createElement('style');spinStyle.textContent='@keyframes spin{to{transform:rotate(360deg)}}';document.head.appendChild(spinStyle);
fetchWebsiteSettings();fetchProducts();updateCartUI();
