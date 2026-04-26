// ── API CONFIG ──
const API='';
let TOKEN=localStorage.getItem('pos_token')||'';
let currentUser='',currentBranch=1,currentBranchName='';
let PRODUCTS=[],BRANCHES_LIST=[];
let cart=[],discountPct=0,payMethod='cash';
let todaySales=[],selectedProduct=null,selectedColor='',selectedSize='';
let currentCat='all',searchQuery='',cashOpenAmount=0;
let cashSessionId=null;

// ── API HELPERS ──
async function apiGet(url){
  const res=await fetch(API+url,{headers:TOKEN?{Authorization:'Bearer '+TOKEN}:{}});
  if(!res.ok)throw new Error(await res.text());
  return res.json();
}
async function apiPost(url,data){
  const res=await fetch(API+url,{method:'POST',headers:{'Content-Type':'application/json',...(TOKEN?{Authorization:'Bearer '+TOKEN}:{})},body:JSON.stringify(data)});
  if(!res.ok)throw new Error(await res.text());
  return res.json();
}

// ── НЭВТРЭХ ──
function togglePw(){const p=document.getElementById('password');p.type=p.type==='password'?'text':'password'}

async function doLogin(){
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value;
  const branchEl=document.getElementById('branch-select');
  const err=document.getElementById('login-error');
  err.style.display='none';
  try {
    const data=await apiPost('/api/auth/login',{username,password});
    TOKEN=data.token;
    localStorage.setItem('pos_token',TOKEN);
    currentUser=data.user.full_name||data.user.username;
    await loadBranches();
    if(data.user.branch_id && [...branchEl.options].some(o=>parseInt(o.value)===parseInt(data.user.branch_id))){
      branchEl.value=String(data.user.branch_id);
    }
    currentBranch=parseInt(branchEl.value)||data.user.branch_id||1;
    currentBranchName=branchEl.options[branchEl.selectedIndex]?.text||'Салбар';
    document.getElementById('pos-branch-name').textContent=currentBranchName;
    document.getElementById('pos-cashier').textContent=currentUser;
    showPage('pos');
    startClock();
    await loadProducts();
    openCashOpen();
  } catch(e){
    err.style.display='block';
    err.textContent='Нэвтрэх нэр эсвэл нууц үг буруу байна';
  }
}

async function loadBranches(){
  try{
    const res=await fetch('/api/branches',{headers:TOKEN?{Authorization:'Bearer '+TOKEN}:{}});
    if(!res.ok)throw new Error(await res.text());
    BRANCHES_LIST=await res.json();
    const sel=document.getElementById('branch-select');
    const prev=sel.value;
    const branches=BRANCHES_LIST.filter(b=>String(b.type||'own_branch')!=='partner');
    sel.innerHTML=(branches.length?branches:BRANCHES_LIST).map(b=>`<option value="${b.id}">🏪 ${b.name}${b.location?' — '+b.location:''}</option>`).join('');
    if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
  }catch(e){console.error('Салбар татах алдаа:',e)}
}

function doLogout(){
  if(confirm('Системээс гарах уу?')){
    cart=[];discountPct=0;todaySales=[];
    TOKEN='';localStorage.removeItem('pos_token');
    showPage('login');
  }
}

function startClock(){
  function tick(){
    const n=new Date();
    document.getElementById('pos-clock').textContent=
      String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0');
  }
  tick();setInterval(tick,1000);
}

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
}

// ── БАРАА ──
const CAT_EMOJI={Малгай:'🧢',Ороолт:'🧣',Бээлий:'🧤',Faceshield:'😷',Алчуур:'🧦'};
const CAT_MAP={all:'all',hat:'Малгай',scarf:'Ороолт',glove:'Бээлий',face:'Faceshield',neck:'Алчуур'};
function getCartQtyForVariant(variantId,key){return cart.filter(i=>variantId?i.variantId===variantId:i.key===key).reduce((sum,i)=>sum+i.qty,0)}

async function loadProducts(){
  try{
    const grid=document.getElementById('product-grid-pos');
    grid.innerHTML='<div style="grid-column:1/-1;padding:40px;text-align:center;color:#888">Бараа ачааллаж байна...</div>';
    const data=await apiGet('/api/products?limit=100');
    PRODUCTS=data.map(p=>({
      id:p.id,
      name:p.name,
      sku:p.sku,
      cat:p.category_name||'',
      emoji:CAT_EMOJI[p.category_name]||'📦',
      price:p.price,
      stock:parseInt(p.total_stock)||0,
      colors:[],sizes:[],variants:[]
    }));
    // Variant татах
    for(const p of PRODUCTS){
      try{
        const detail=await apiGet('/api/products/'+p.id);
        p.colors=[...new Set((detail.variants||[]).map(v=>v.color).filter(Boolean))];
        p.sizes=[...new Set((detail.variants||[]).map(v=>v.size).filter(Boolean))];
        p.variants=detail.variants||[];
      }catch(e){}
    }
    renderProducts();
  }catch(e){
    document.getElementById('product-grid-pos').innerHTML='<div style="grid-column:1/-1;padding:40px;text-align:center;color:red">Бараа татахад алдаа гарлаа</div>';
    showToast('Бараа татах алдаа: '+e.message,'error');
  }
}

function colorHex(n){
  return({Хар:'#0a0a0a',Цагаан:'#f0f0f0',Улаан:'#c0392b',Хөх:'#1a3a5c',Ногоон:'#2c5f2e',Бор:'#8B4513',Ягаан:'#d4537e'})[n]||'#888';
}

function renderProducts(){
  const grid=document.getElementById('product-grid-pos');
  const filtered=PRODUCTS.filter(p=>{
    const selectedCat=CAT_MAP[currentCat]||currentCat;
    const cm=selectedCat==='all'||p.cat===selectedCat;
    const q=searchQuery.toLowerCase();
    const sm=!q||p.name.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q);
    return cm&&sm;
  });
  grid.innerHTML=filtered.map(p=>{
    const sb=p.stock===0?'<span class="pos-stock-badge badge-out">Дуссан</span>':
      p.stock<=5?`<span class="pos-stock-badge badge-low">${p.stock} үлдсэн</span>`:
      `<span class="pos-stock-badge badge-ok">${p.stock}</span>`;
    return`<div class="pos-product-card${p.stock===0?' out-of-stock':''}" onclick="selectProduct(${p.id})">
      <div class="pos-product-img">${p.emoji}${sb}</div>
      <div class="pos-product-info">
        <div class="pos-product-name">${p.name}</div>
        <div class="pos-product-sku">${p.sku}</div>
        <div class="pos-product-bottom">
          <div class="pos-product-price">₮${p.price.toLocaleString()}</div>
          <div class="pos-product-colors">${p.colors.slice(0,4).map(c=>`<div class="pos-color-dot" style="background:${colorHex(c)}"></div>`).join('')}</div>
        </div>
      </div></div>`;
  }).join('')||'<div style="grid-column:1/-1;padding:40px;text-align:center;color:#888">Бараа олдсонгүй</div>';
}

function filterCat(el,cat){
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');currentCat=cat;renderProducts();
}
function filterProducts(q){searchQuery=q;renderProducts();}

async function handleBarcode(e){
  if(e.key!=='Enter')return;
  const barcode=e.target.value.trim();
  try{
    const v=await apiGet('/api/barcode/'+encodeURIComponent(barcode));
    const prod=PRODUCTS.find(p=>p.id===v.product_id);
    if(prod){
      const key=v.id+'-'+v.color+'-'+v.size;
      const variantStock=parseInt(v.stock ?? prod.stock ?? 0);
      const already=getCartQtyForVariant(v.id,key);
      if(already+1>variantStock){showToast('Үлдэгдэл хүрэлцэхгүй байна','error');e.target.value='';return;}
      const ex=cart.find(c=>c.key===key);
      if(ex)ex.qty++;
      else cart.push({
        key,
        id:prod.id,variantId:v.id,
        name:prod.name,emoji:prod.emoji,
        color:v.color,size:v.size,
        price:prod.price,qty:1,stock:variantStock
      });
      renderCart();
      showToast(prod.name+' ('+v.color+', '+v.size+') нэмэгдлээ','success');
    }
  }catch(e){showToast('Баркод олдсонгүй','error');}
  e.target.value='';
}

function scanBarcode(){
  const sku=prompt('Баркод оруулах:');
  if(!sku)return;
  const found=PRODUCTS.find(p=>p.sku.toLowerCase()===sku.toLowerCase().trim());
  if(found)selectProduct(found.id);
  else showToast('Баркод олдсонгүй','error');
}

function selectProduct(id){
  const p=PRODUCTS.find(pr=>pr.id===id);
  if(!p||p.stock===0){showToast('Бараа дууссан байна','error');return;}
  selectedProduct=p;
  selectedColor=p.colors[0]||'';
  selectedSize=p.sizes[0]||'';
  document.getElementById('var-product-name').textContent=p.name+' — ₮'+p.price.toLocaleString();
  document.getElementById('var-colors').innerHTML=p.colors.map(c=>`
    <div onclick="varSelectColor(this,'${c}')" data-color="${c}"
      style="padding:6px 14px;border:1.5px solid ${c===selectedColor?'var(--black)':'var(--gray-light)'};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px">
      <div style="width:12px;height:12px;border-radius:50%;background:${colorHex(c)};border:1px solid rgba(0,0,0,.1)"></div>${c}
    </div>`).join('');
  document.getElementById('var-sizes').innerHTML=p.sizes.map(s=>`
    <div onclick="varSelectSize(this,'${s}')" data-size="${s}"
      style="padding:6px 16px;border:1.5px solid ${s===selectedSize?'var(--black)':'var(--gray-light)'};border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">
      ${s}</div>`).join('');
  openModal('modal-variant');
}

function varSelectColor(el,color){
  selectedColor=color;
  document.querySelectorAll('#var-colors div').forEach(d=>d.style.borderColor='var(--gray-light)');
  el.style.borderColor='var(--black)';
}
function varSelectSize(el,size){
  selectedSize=size;
  document.querySelectorAll('#var-sizes div').forEach(d=>d.style.borderColor='var(--gray-light)');
  el.style.borderColor='var(--black)';
}

function addVariantToCart(){
  if(!selectedProduct)return;
  const variant=selectedProduct.variants.find(v=>v.color===selectedColor&&v.size===selectedSize);
  const key=selectedProduct.id+'-'+selectedColor+'-'+selectedSize;
  const variantStock=parseInt(variant?.stock ?? selectedProduct.stock ?? 0);
  const already=getCartQtyForVariant(variant?.id,key);
  if(already+1>variantStock){
    showToast('Үлдэгдэл хүрэлцэхгүй байна. Боломжтой: '+Math.max(variantStock-already,0),'error');
    return;
  }
  const ex=cart.find(c=>c.key===key);
  if(ex)ex.qty++;
  else cart.push({
    key,id:selectedProduct.id,
    variantId:variant?.id||null,
    name:selectedProduct.name,emoji:selectedProduct.emoji,
    color:selectedColor,size:selectedSize,
    price:selectedProduct.price,qty:1,stock:variantStock
  });
  closeModal('modal-variant');
  renderCart();
  showToast(selectedProduct.name+' ('+selectedColor+', '+selectedSize+') нэмэгдлээ','success');
}

// ── CART ──
function renderCart(){
  const subtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const discAmt=Math.round(subtotal*discountPct/100);
  const total=subtotal-discAmt;
  document.getElementById('pos-cart-count').textContent=cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('pos-subtotal').textContent='₮'+subtotal.toLocaleString();
  document.getElementById('pos-discount').textContent='−₮'+discAmt.toLocaleString();
  document.getElementById('pos-total').textContent='₮'+total.toLocaleString();
  const btn=document.getElementById('btn-charge');
  btn.disabled=cart.length===0;
  btn.innerHTML=cart.length>0
    ?`<svg viewBox="0 0 24 24" style="width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round"><polyline points="20 6 9 17 4 12"/></svg> ₮${total.toLocaleString()} авах`
    :'<svg viewBox="0 0 24 24" style="width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round"><polyline points="20 6 9 17 4 12"/></svg> Төлбөр авах';
  const items=document.getElementById('pos-cart-items');
  if(!cart.length){
    items.innerHTML='<div class="pos-cart-empty"><div class="pos-cart-empty-icon">🛒</div><span>Бараа нэмнэ үү</span></div>';
    return;
  }
  items.innerHTML=cart.map(item=>`
    <div class="pos-cart-item">
      <div class="pos-cart-item-emoji">${item.emoji}</div>
      <div class="pos-cart-item-info">
        <div class="pos-cart-item-name">${item.name}</div>
        <div class="pos-cart-item-variant">${item.color} · ${item.size}</div>
      </div>
      <div class="pos-cart-item-right">
        <div class="pos-cart-item-price">₮${(item.price*item.qty).toLocaleString()}</div>
        <div class="pos-item-qty">
          <button onclick="cartQty('${item.key}',-1)">−</button>
          <span>${item.qty}</span>
          <button onclick="cartQty('${item.key}',1)">+</button>
        </div>
        <button class="pos-item-remove" onclick="removeItem('${item.key}')">×</button>
      </div>
    </div>`).join('');
}

function cartQty(key,d){const i=cart.find(c=>c.key===key);if(i){const next=Math.max(1,i.qty+d);if(d>0&&next>(i.stock||999999)){showToast('Үлдэгдэл хүрэлцэхгүй байна','error');return;}i.qty=next;renderCart();}}
function removeItem(key){cart=cart.filter(c=>c.key!==key);renderCart();}
function clearCart(){if(cart.length&&confirm('Захиалгыг цэвэрлэх үү?')){cart=[];discountPct=0;renderCart();}}

const MAX_DISCOUNT = 15; // Хамгийн ихдээ 15%

function applyDiscount(){
  const v=parseFloat(document.getElementById('discount-input').value);
  const msg=document.getElementById('discount-msg');
  if(isNaN(v)||v<0){msg.style.display='block';msg.style.color='var(--red)';msg.textContent='0-с дээш тоо оруулна уу';return;}
  if(v>MAX_DISCOUNT){
    msg.style.display='block';msg.style.color='var(--red)';
    msg.textContent='⚠️ Хамгийн ихдээ '+MAX_DISCOUNT+'% хямдрал зөвшөөрөгдөнө';
    document.getElementById('discount-input').value=MAX_DISCOUNT;
    discountPct=MAX_DISCOUNT;
  } else {
    discountPct=v;msg.style.display='block';msg.style.color='var(--green)';
    msg.textContent='✓ '+v+'% хямдрал хэрэглэгдлээ';
  }
  renderCart();
}

function setPayMethod(el,method){
  document.querySelectorAll('.pay-method').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');payMethod=method;
}

// ── БОРЛУУЛАЛТ — API ── 
async function processPayment(){
  if(!cart.length)return;
  const subtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const discAmt=Math.round(subtotal*discountPct/100);
  const total=subtotal-discAmt;
  try{
    const orderData={
      branch_id:currentBranch,
      items:cart.map(i=>({
        variant_id:i.variantId,
        name:i.name,color:i.color,size:i.size,
        quantity:i.qty,price:i.price
      })),
      subtotal,discount_amount:discAmt,total,
      payment_method:payMethod
    };
    const result=await apiPost('/api/orders',orderData);
    const sale={
      id:result.order.order_number,
      orderDbId:result.order.id,
      time:new Date().toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'}),
      items:[...cart],subtotal,discAmt,total,payMethod,
      branch:currentBranchName,cashier:currentUser
    };
    todaySales.push(sale);
    const wantReceipt=document.getElementById('receipt-toggle').checked;
    if(wantReceipt)showReceipt(sale);
    else{newSale();showToast('Борлуулалт амжилттай бүртгэгдлээ','success');}
    loadProducts();
  }catch(e){
    showToast('Борлуулалт бүртгэхэд алдаа: '+e.message,'error');
  }
}

function showReceipt(sale){
  const now=new Date();
  const ds=now.getFullYear()+'/'+(now.getMonth()+1).toString().padStart(2,'0')+'/'+now.getDate().toString().padStart(2,'0');
  document.getElementById('receipt-info').innerHTML=`${sale.branch}<br>${ds} ${sale.time}<br>${sale.id}<br>Худалдагч: ${sale.cashier}`;
  document.getElementById('receipt-items').innerHTML=sale.items.map(i=>`
    <div class="receipt-item-row"><span>${i.name} (${i.color}, ${i.size}) ×${i.qty}</span><span>₮${(i.price*i.qty).toLocaleString()}</span></div>`).join('');
  const pn={cash:'Бэлэн',card:'Карт',qpay:'QPay'}[sale.payMethod];
  document.getElementById('receipt-totals').innerHTML=`
    <div class="receipt-total-row"><span>Дүн</span><span>₮${sale.subtotal.toLocaleString()}</span></div>
    ${sale.discAmt>0?`<div class="receipt-total-row"><span>Хямдрал</span><span style="color:var(--red)">−₮${sale.discAmt.toLocaleString()}</span></div>`:''}
    <div class="receipt-total-row grand"><span>Нийт</span><span>₮${sale.total.toLocaleString()}</span></div>
    <div class="receipt-total-row" style="margin-top:8px"><span>Төлбөр</span><span>${pn}</span></div>`;
  openModal('modal-receipt');
}

function newSale(){
  cart=[];discountPct=0;
  document.getElementById('discount-input').value='';
  document.getElementById('discount-msg').style.display='none';
  renderCart();closeModal('modal-receipt');
  showToast('Шинэ захиалга бэлэн','success');
}

// ── КАСС ──
function openCashOpen(){
  const now=new Date();
  document.getElementById('cash-open-date').textContent=now.toLocaleDateString('mn-MN')+' · '+currentBranchName;
  // API-г энд дуудахгүй. Касс нээх товч дарахад л /api/cash/open дуудна.
  openModal('modal-cash-open');
}

async function confirmCashOpen(){
  cashOpenAmount=parseFloat(document.getElementById('cash-open-amount').value)||0;
  try{
    const result=await apiPost('/api/cash/open',{opening_amount:cashOpenAmount,branch_id:currentBranch});
    cashSessionId=result.id;
    showToast('Касс нээгдлээ — ₮'+cashOpenAmount.toLocaleString(),'success');
  }catch(e){
    // Аль хэдийн нээгдсэн бол асуудалгүй
    showToast('Касс бэлэн — ₮'+cashOpenAmount.toLocaleString(),'success');
  }
  closeModal('modal-cash-open');
}

function openCashClose(){
  const cashS=todaySales.filter(s=>s.payMethod==='cash').reduce((s,sale)=>s+sale.total,0);
  const digS=todaySales.filter(s=>s.payMethod!=='cash').reduce((s,sale)=>s+sale.total,0);
  const totS=todaySales.reduce((s,sale)=>s+sale.total,0);
  document.getElementById('cc-sales').textContent='₮'+totS.toLocaleString();
  document.getElementById('cc-count').textContent=todaySales.length;
  document.getElementById('cc-cash').textContent='₮'+(cashS+cashOpenAmount).toLocaleString();
  document.getElementById('cc-digital').textContent='₮'+digS.toLocaleString();
  openModal('modal-cash-close');
}

function calcDiff(){
  const counted=parseFloat(document.getElementById('cc-counted').value)||0;
  const cashS=todaySales.filter(s=>s.payMethod==='cash').reduce((s,sale)=>s+sale.total,0);
  const diff=counted-(cashOpenAmount+cashS);
  const row=document.getElementById('cc-diff-row');
  row.style.display='block';
  const el=document.getElementById('cc-diff');
  el.textContent=(diff>=0?'+':'')+'₮'+Math.abs(diff).toLocaleString();
  el.style.color=diff===0?'var(--green)':diff>0?'var(--amber)':'var(--red)';
}

async function confirmCashClose(){
  const closing=parseFloat(document.getElementById('cc-counted').value)||0;
  try{await apiPost('/api/cash/close',{closing_amount:closing,branch_id:currentBranch});}catch(e){}
  closeModal('modal-cash-close');
  showToast('Касс амжилттай хаагдлаа','success');
  setTimeout(()=>{if(confirm('Системээс гарах уу?'))doLogout();},1000);
}

// ── ТАЙЛАН ──
async function openReport(){
  const now=new Date();
  document.getElementById('report-date').textContent=now.toLocaleDateString('mn-MN')+' · '+currentBranchName;
  try{
    const today=now.toISOString().split('T')[0];
    const data=await apiGet('/api/reports/daily?date='+today+'&branch_id='+currentBranch);
    const s=data.summary;
    document.getElementById('rep-total').textContent='₮'+parseInt(s.total_revenue||0).toLocaleString();
    document.getElementById('rep-count').textContent=s.transaction_count||0;
    document.getElementById('rep-cash').textContent='₮'+parseInt(s.cash_total||0).toLocaleString();
    document.getElementById('rep-digital').textContent='₮'+(parseInt(s.card_total||0)+parseInt(s.qpay_total||0)).toLocaleString();
    const tbody=document.getElementById('rep-items');
    tbody.innerHTML=(data.top_products||[]).length
      ? (data.top_products||[]).map(p=>`<tr><td>${p.product_name}</td><td>${p.sold_qty}</td><td>₮${parseInt(p.revenue).toLocaleString()}</td></tr>`).join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--gray);padding:20px">Өнөөдөр борлуулалт байхгүй</td></tr>';
  }catch(e){
    document.getElementById('rep-items').innerHTML='<tr><td colspan="3" style="color:red">Тайлан татахад алдаа гарлаа</td></tr>';
  }
  openModal('modal-report');
}

function openReturn(){openModal('modal-return');}

let returnOrderCache=null;
async function searchReturnOrder(num){
  const info=document.getElementById('return-order-info');
  const detail=document.getElementById('return-order-detail');
  returnOrderCache=null;
  if(num.length<6){info.style.display='none';return;}
  const sale=todaySales.find(s=>s.id.includes(num));
  if(sale){
    returnOrderCache={local:true,...sale};
    info.style.display='block';
    detail.innerHTML=`
      <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
        <div><b>Дугаар:</b> ${sale.id}</div>
        <div><b>Дүн:</b> ₮${sale.total.toLocaleString()}</div>
        <div><b>Төлбөр:</b> ${{cash:'Бэлэн',card:'Карт',qpay:'QPay'}[sale.payMethod]}</div>
        <div><b>Бараа:</b> ${sale.items.map(i=>i.name+'×'+i.qty).join(', ')}</div>
      </div>`;
    document.getElementById('return-amount').value=sale.total;
    document.getElementById('return-pay-method').value=sale.payMethod;
    return;
  }
  try{
    const data=await apiGet('/api/orders?order_number='+encodeURIComponent(num)+'&limit=1');
    const order=Array.isArray(data)?data[0]:(data.orders?.[0]||data.order||null);
    if(!order){info.style.display='none';return;}
    returnOrderCache=order;
    const total=parseInt(order.total||order.total_amount||0);
    info.style.display='block';
    detail.innerHTML=`
      <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
        <div><b>Дугаар:</b> ${order.order_number||order.id}</div>
        <div><b>Дүн:</b> ₮${total.toLocaleString()}</div>
        <div><b>Төлбөр:</b> ${order.payment_method||''}</div>
        <div><b>Статус:</b> ${order.status||''}</div>
      </div>`;
    document.getElementById('return-amount').value=total;
    document.getElementById('return-pay-method').value=order.payment_method||'cash';
  }catch(e){info.style.display='none';}
}

async function confirmReturn(){
  const orderNum=document.getElementById('return-order-num').value.trim();
  const reason=document.getElementById('return-reason-sel').value;
  const amount=parseInt(document.getElementById('return-amount').value)||0;
  const method=document.getElementById('return-pay-method').value;
  if(!orderNum){showToast('Захиалгын дугаар оруулна уу','error');return;}
  if(amount<=0){showToast('Буцаах дүн оруулна уу','error');return;}
  const returnItems=(returnOrderCache?.items||[]).map(i=>({
    variant_id:i.variantId||i.variant_id,
    quantity:i.qty||i.quantity,
    condition:'good',
    resell:true,
    action:'restock'
  })).filter(i=>i.variant_id&&i.quantity>0);
  if(!returnItems.length){showToast('Буцаах барааны variant мэдээлэл алга байна','error');return;}
  try{
    await apiPost('/api/returns',{
      return_type:'customer',
      source_branch_id:currentBranch,
      order_id:returnOrderCache?.orderDbId||returnOrderCache?.id||null,
      customer_name:returnOrderCache?.customer_name||null,
      customer_phone:returnOrderCache?.customer_phone||null,
      reason,
      note:'POS return '+orderNum+' / '+method+' / ₮'+amount,
      items:returnItems
    });
    showToast('Буцаалт бүртгэгдлээ — ₮'+amount.toLocaleString(),'success');
    loadProducts();
  }catch(e){
    showToast('Буцаалт бүртгэхэд алдаа: '+e.message,'error');
    return;
  }
  closeModal('modal-return');
  document.getElementById('return-order-num').value='';
  document.getElementById('return-order-info').style.display='none';
  document.getElementById('return-amount').value='';
}

function openModal(id){document.getElementById(id).classList.add('show')}
function closeModal(id){document.getElementById(id).classList.remove('show')}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.className='toast'+(type?' '+type:'');
  document.getElementById('toast-msg').textContent=msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2800);
}

document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{
    if(e.target===o&&o.id!=='modal-cash-open')o.classList.remove('show');
  });
});

// ── INIT ──
// Салбар татах
loadBranches();
