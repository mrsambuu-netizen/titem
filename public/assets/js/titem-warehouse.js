// â”€â”€ API â”€â”€
const API='';
let TOKEN=localStorage.getItem('warehouse_token')||'';

async function handleApiError(res){
  const text=await res.text();
  if(res.status===401){
    TOKEN='';
    localStorage.removeItem('warehouse_token');
    showLoginPage();
    showToast('ÐÑÐ²Ñ‚Ñ€ÑÑ… Ñ…ÑƒÐ³Ð°Ñ†Ð°Ð° Ð´ÑƒÑƒÑÑÐ°Ð½. Ð”Ð°Ñ…Ð¸Ð½ Ð½ÑÐ²Ñ‚ÑÑ€Ð½Ñ Ò¯Ò¯','error');
  }
  throw new Error(text);
}

async function apiGet(url){
  const res=await fetch(API+url,{headers:TOKEN?{Authorization:'Bearer '+TOKEN}:{}}); 
  if(!res.ok)await handleApiError(res);
  return res.json();
}
async function apiPost(url,data){
  const res=await fetch(API+url,{method:'POST',headers:{'Content-Type':'application/json',...(TOKEN?{Authorization:'Bearer '+TOKEN}:{})},body:JSON.stringify(data)});
  if(!res.ok)await handleApiError(res);
  return res.json();
}

// â”€â”€ STATE â”€â”€
let PRODUCTS=[], BRANCHES=[], SUPPLIERS_LIST=[];
let receiveItems=[], distItems=[], returnItems=[], writeoffItems=[];
let allHistory=[];
let pendingApprovals=[];
let adjustmentHistory=[];
let lastInventoryRows=[];
let todayReceived=0;
let currentUser='warehouse01';

// â”€â”€ CLOCK â”€â”€
function tick(){
  const n=new Date();
  document.getElementById('clock').textContent=
    String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0');
}
tick(); setInterval(tick,1000);
document.getElementById('receive-date').value=new Date().toISOString().split('T')[0];

// â”€â”€ ÐÐ­Ð’Ð¢Ð Ð­Ð¥ â”€â”€
async function initWarehouse(){
  try{
    if(TOKEN){
      // Token Ñ…Ò¯Ñ‡Ð¸Ð½Ñ‚ÑÐ¹ ÑÑÑÑ…Ð¸Ð¹Ð³ ÑˆÐ°Ð»Ð³Ð°Ñ…
      try{
        await apiGet('/api/suppliers');
        await loadAll();
        return;
      }catch(e){
        // Token Ñ…Ò¯Ñ‡Ð¸Ð½Ð³Ò¯Ð¹ â€” ÑƒÑÑ‚Ð³Ð°Ð¶ login Ñ…ÑƒÑƒÐ´Ð°Ñ Ñ…Ð°Ñ€ÑƒÑƒÐ»Ð½Ð°
        TOKEN='';
        localStorage.removeItem('warehouse_token');
        showLoginPage();
        return;
      }
    }
    showLoginPage();
  }catch(e){
    showToast('Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð´ Ñ…Ð¾Ð»Ð±Ð¾Ð³Ð´Ð¾Ñ…Ð¾Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°','error');
    console.error(e);
  }
}

function showLoginPage(){
  document.getElementById('wh-login-page').style.display='flex';
  document.getElementById('wh-main').style.display='none';
}

async function doWarehouseLogin(){
  const username=document.getElementById('wh-username').value.trim();
  const password=document.getElementById('wh-password').value;
  const err=document.getElementById('wh-login-err');
  err.style.display='none';
  try{
    const data=await apiPost('/api/auth/login',{username,password});
    if(!['warehouse','admin','super_admin'].includes(data.user.role)){
      err.style.display='block';err.textContent='ÐÐ³ÑƒÑƒÐ»Ð°Ñ…Ñ‹Ð½ ÑÑ€Ñ… Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°';return;
    }
    TOKEN=data.token;
    localStorage.setItem('warehouse_token',TOKEN);
    currentUser=data.user.full_name||username;
    document.getElementById('wh-login-page').style.display='none';
    document.getElementById('wh-main').style.display='flex';
    document.querySelector('.sidebar-user-name').textContent=currentUser;
    await loadAll();
  }catch(e){
    err.style.display='block';
    err.textContent='ÐÑÐ²Ñ‚Ñ€ÑÑ… Ð½ÑÑ€ ÑÑÐ²ÑÐ» Ð½ÑƒÑƒÑ† Ò¯Ð³ Ð±ÑƒÑ€ÑƒÑƒ Ð±Ð°Ð¹Ð½Ð°';
  }
}

async function loadAll(){
  await Promise.all([loadProducts(), loadBranches(), loadSuppliers()]);
  updateKPIs();
}

async function loadProducts(){
  try{
    const data=await apiGet('/api/products?limit=100');
    const details=await Promise.all(
      data.map(p=>apiGet('/api/products/'+p.id).catch(()=>({...p,variants:[]})))
    );
    PRODUCTS=details.map(p=>({
      id:p.id,
      name:p.name,
      sku:p.sku,
      cat:p.category_name||'',
      price:p.wholesale_price||p.price,
      warehouseStock:0,
      totalStock:parseInt(p.total_stock||0),
      colors:[...new Set((p.variants||[]).map(v=>v.color).filter(Boolean))],
      sizes:[...new Set((p.variants||[]).map(v=>v.size).filter(Boolean))],
      variants:p.variants||[]
    }));
    console.log('Ð‘Ð°Ñ€Ð°Ð° Ñ‚Ð°Ñ‚Ð°Ð³Ð´Ð»Ð°Ð°:', PRODUCTS.length, '| Ð–Ð¸ÑˆÑÑ variant:', PRODUCTS[0]?.variants?.length);
    updateKPIs();
  }catch(e){
    console.error('loadProducts Ð°Ð»Ð´Ð°Ð°:', e);
    showToast('Ð‘Ð°Ñ€Ð°Ð° Ñ‚Ð°Ñ‚Ð°Ñ… Ð°Ð»Ð´Ð°Ð°: '+e.message,'error');
  }
}

async function loadBranches(){
  try{
    const data=await fetch('/api/branches').then(r=>r.json());
    BRANCHES=data;
    // Ð¥ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»Ð°Ñ… select ÑˆÐ¸Ð½ÑÑ‡Ð»ÑÑ…
    const sel=document.getElementById('dist-branch');
    if(sel) sel.innerHTML=data.filter(b=>b.id>1).map(b=>`<option value="${b.id}">${b.name} â€” ${b.location}</option>`).join('');
    const returnBranch=document.getElementById('return-branch');
    if(returnBranch) returnBranch.innerHTML=data.filter(b=>b.id>1).map(b=>`<option value="${b.id}">${b.name} â€” ${b.location}</option>`).join('');
    const tfFrom=document.getElementById('tf-from');
    const tfTo=document.getElementById('tf-to');
    if(tfFrom) tfFrom.innerHTML=`<option value="1">ðŸ­ ÐÐ³ÑƒÑƒÐ»Ð°Ñ…</option>`+data.filter(b=>b.id>1).map(b=>`<option value="${b.id}">ðŸª ${b.name}</option>`).join('');
    if(tfTo) tfTo.innerHTML=data.filter(b=>b.id>1).map(b=>`<option value="${b.id}">ðŸª ${b.name}</option>`).join('');
  }catch(e){}
}

async function loadSuppliers(){
  try{
    const data=await apiGet('/api/suppliers');
    SUPPLIERS_LIST=data;
    const sel=document.getElementById('receive-supplier');
    if(sel) sel.innerHTML=data.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }catch(e){}
}

function updateKPIs(){
  const total=PRODUCTS.reduce((s,p)=>s+p.totalStock,0);
  document.getElementById('kpi-total').textContent=total;
  document.getElementById('kpi-in').textContent=todayReceived;
  const low=PRODUCTS.filter(p=>p.totalStock<=5&&p.totalStock>0).length;
  document.getElementById('kpi-alert')||null;
}

// â”€â”€ NAV â”€â”€
function showPanel(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  btn.classList.add('active');
  const titles={receive:'Ð‘Ð°Ñ€Ð°Ð° Ð¾Ñ€Ð»Ð¾Ð³Ð¾Ð´Ð¾Ñ…',distribute:'Ð¡Ð°Ð»Ð±Ð°Ñ€Ñ‚ Ñ…ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»Ð°Ñ…',inventory:'Ò®Ð»Ð´ÑÐ³Ð´ÑÐ» Ñ…Ð°Ñ€Ð°Ñ…',return:'Ð‘ÑƒÑ†Ð°Ð°Ð»Ñ‚ Ð±Ò¯Ñ€Ñ‚Ð³ÑÑ…',writeoff:'Write-off / Ð£ÑÑ‚Ð³Ð°Ð»',approval:'Ð‘Ð°Ñ‚Ð»Ð°Ñ… Ð¶Ð°Ð³ÑÐ°Ð°Ð»Ñ‚',adjustment:'Ð¢Ð¾Ð¾Ð»Ð»Ð¾Ð³Ð¾ / Ð—Ó©Ñ€Ò¯Ò¯',history:'Ð‘Ò¯Ñ… Ñ‚Ò¯Ò¯Ñ…'};
  document.getElementById('page-title').textContent=titles[id]||id;
  if(id==='inventory') renderInventory();
  if(id==='approval') renderApprovals();
  if(id==='adjustment') renderAdjustments();
  if(id==='history') renderAllHistory('all');
}

// â”€â”€ FIND PRODUCT â”€â”€
function findProduct(sku){
  const q=sku.toLowerCase().trim();
  return PRODUCTS.find(p=>
    p.sku.toLowerCase()===q||
    p.name.toLowerCase()===q||
    p.sku.toLowerCase().includes(q)
  );
}

// â”€â”€ RECEIVE â”€â”€
function handleReceiveBarcode(e){
  if(e.key!=='Enter') return;
  const sku=e.target.value.trim();
  const p=findProduct(sku);
  if(!p){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹: '+sku,'error');return;}
  const ex=receiveItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    receiveItems.push({id:p.id,sku:p.sku,name:p.name,color:p.colors[0]||'',size:p.sizes[0]||'',qty:1,price:p.price,variants:p.variants});
  }
  e.target.value='';
  renderReceiveItems();
  showToast(p.name+' Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ','success');
}

function renderReceiveItems(){
  const tbody=document.getElementById('receive-items');
  const empty=document.getElementById('receive-empty');
  const summary=document.getElementById('receive-summary');
  if(!receiveItems.length){empty.style.display='block';tbody.innerHTML='';summary.style.display='none';return;}
  empty.style.display='none'; summary.style.display='block';
  tbody.innerHTML=receiveItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td>
      <td colspan="2">
        <select style="border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body);min-width:140px" onchange="receiveItems[${i}].selectedVariantId=this.value">
          <option value="">-- Ð‘Ò¯Ð³Ð´ (Ð½Ð¸Ð¹Ñ‚) --</option>
          ${(item.variants||[]).map(v=>`<option value="${v.id}">${v.color} / ${v.size}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="qty-ctrl">
          <button onclick="changeRQty(${i},-1)">âˆ’</button>
          <span>${item.qty}</span>
          <button onclick="changeRQty(${i},1)">+</button>
        </div>
      </td>
      <td><input type="number" value="${item.price}" style="width:90px;border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body)" onchange="receiveItems[${i}].price=parseInt(this.value)||0;updateReceiveSummary()"></td>
      <td><b>â‚®${(item.price*item.qty).toLocaleString()}</b></td>
      <td><button class="remove-btn" onclick="receiveItems.splice(${i},1);renderReceiveItems()">Ã—</button></td>
    </tr>`).join('');
  updateReceiveSummary();
}

function changeRQty(i,d){receiveItems[i].qty=Math.max(1,receiveItems[i].qty+d);renderReceiveItems();}
function updateReceiveSummary(){
  const qty=receiveItems.reduce((s,i)=>s+i.qty,0);
  const price=receiveItems.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('r-total-qty').textContent=qty+' ÑˆÐ¸Ñ€Ñ…ÑÐ³';
  document.getElementById('r-total-price').textContent='â‚®'+price.toLocaleString();
}

async function confirmReceive(){
  if(!receiveItems.length){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð½ÑÐ¼Ð½Ñ Ò¯Ò¯','error');return;}
  const supplier=document.getElementById('receive-supplier');
  const invoice=document.getElementById('receive-invoice').value||'â€”';
  const qty=receiveItems.reduce((s,i)=>s+i.qty,0);
  const price=receiveItems.reduce((s,i)=>s+i.price*i.qty,0);
  const now=new Date();
  const time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');

  try{
    // ÐžÑ€Ð»Ð¾Ð³Ð¾ API-Ð´ Ð±Ò¯Ñ€Ñ‚Ð³ÑÑ…
    const supplier=document.getElementById('receive-supplier');
    const supplierId=supplier?.value||null;
    
    // Ð‘Ð°Ñ€Ð°Ð° Ð±Ò¯Ñ€Ð¸Ð¹Ð½ Ð‘Ò®Ð“Ð” variant-Ð´ Ñ‚ÑÐ½Ñ†Ò¯Ò¯ Ñ…ÑƒÐ²Ð°Ð°Ð½ Ð½ÑÐ¼Ð½Ñ
    const allItems = [];
    for(const item of receiveItems){
      const variants = item.variants||[];
      if(!variants.length) continue;
      if(item.selectedVariantId){
        // Ð¢Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹ variant ÑÐ¾Ð½Ð³Ð¾ÑÐ¾Ð½
        allItems.push({
          variant_id: parseInt(item.selectedVariantId),
          quantity: item.qty,
          price: item.price
        });
      } else if(variants.length>=1){
        // Variant ÑÐ¾Ð½Ð³Ð¾Ð¾Ð³Ò¯Ð¹ â€” Ð±Ò¯Ñ… variant-Ð´ Ñ‚ÑÐ½Ñ†Ò¯Ò¯ Ñ…ÑƒÐ²Ð°Ð°Ð½Ð°
        const qtyPerVariant = Math.floor(item.qty / variants.length);
        const remainder = item.qty % variants.length;
        variants.forEach((v, idx) => {
          const q = qtyPerVariant + (idx === 0 ? remainder : 0);
          if(q > 0) allItems.push({variant_id: v.id, quantity: q, price: item.price});
        });
      } else {
        showToast(item.name+' Ð±Ð°Ñ€Ð°Ð°Ð½Ñ‹ variant Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹ â€” Ð‘Ð°Ñ€Ð°Ð° ÑƒÐ´Ð¸Ñ€Ð´Ð»Ð°Ð³Ð°Ð°Ñ variant Ð½ÑÐ¼Ð½Ñ Ò¯Ò¯','error');
        return;
      }
    }
    
    if(allItems.length){
      await apiPost('/api/receive',{
        items: allItems,
        supplier_id: supplierId,
        invoice,
        note: 'ÐžÑ€Ð»Ð¾Ð³Ð¾ Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ»'
      });
    } else {
      showToast('Variant Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹ â€” SKU Ð´Ð°Ñ…Ð¸Ð½ ÑˆÐ°Ð»Ð³Ð°Ð½Ð° ÑƒÑƒ','error');
      return;
    }
    
    // PRODUCTS-Ð½ totalStock ÑˆÐ¸Ð½ÑÑ‡Ð»ÑÑ…
    receiveItems.forEach(item=>{
      const p=PRODUCTS.find(pr=>pr.sku===item.sku);
      if(p) p.totalStock+=item.qty;
    });
  }catch(e){
    console.error('ÐžÑ€Ð»Ð¾Ð³Ð¾ API Ð°Ð»Ð´Ð°Ð°:',e);
    showToast('ÐžÑ€Ð»Ð¾Ð³Ð¾ Ð±Ò¯Ñ€Ñ‚Ð³ÑÑ…ÑÐ´ Ð°Ð»Ð´Ð°Ð°: '+e.message,'error');
    return;
  }

  todayReceived+=qty;
  document.getElementById('kpi-in').textContent=todayReceived;
  allHistory.unshift({
    date:now.toLocaleDateString('mn-MN')+' '+time,type:'receive',
    product:receiveItems.map(i=>i.name).join(', '),qty,
    detail:'ÐÐ¸Ð¹Ð»Ò¯Ò¯Ð»ÑÐ³Ñ‡: '+(supplier?.options[supplier.selectedIndex]?.text||'â€”')+' Â· '+invoice,
    user:currentUser
  });

  const tbody=document.getElementById('today-receive-list');
  const row=document.createElement('tr');
  row.innerHTML=`<td>${time}</td><td>${supplier?.options[supplier.selectedIndex]?.text||'â€”'}</td><td>${invoice}</td><td>${receiveItems.map(i=>i.name+'Ã—'+i.qty).join(', ')}</td><td>${qty}</td><td>â‚®${price.toLocaleString()}</td><td><span class="badge badge-green">Ð”ÑƒÑƒÑÑÐ°Ð½</span></td>`;
  tbody.prepend(row);
  clearReceive();
  showToast('ÐžÑ€Ð»Ð¾Ð³Ð¾ Ð°Ð¼Ð¶Ð¸Ð»Ñ‚Ñ‚Ð°Ð¹ Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ³Ð´Ð»ÑÑ â€” '+qty+' ÑˆÐ¸Ñ€Ñ…ÑÐ³','success');
}

function clearReceive(){receiveItems=[];renderReceiveItems();}

// â”€â”€ DISTRIBUTE â”€â”€
function handleDistBarcode(e){
  if(e.key!=='Enter') return;
  const sku=e.target.value.trim();
  const p=findProduct(sku);
  if(!p){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹','error');return;}
  const ex=distItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    distItems.push({sku:p.sku,name:p.name,color:p.colors[0]||'',size:p.sizes[0]||'',qty:1,totalStock:p.totalStock,variants:p.variants});
  }
  e.target.value='';renderDistItems();
  showToast(p.name+' Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ','success');
}

function renderDistItems(){
  const tbody=document.getElementById('dist-items');
  const empty=document.getElementById('dist-empty');
  if(!distItems.length){empty.style.display='block';tbody.innerHTML='';return;}
  empty.style.display='none';
  tbody.innerHTML=distItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td>
      <td>${item.color||'â€”'}</td>
      <td>${item.size||'â€”'}</td>
      <td><span style="font-weight:700;color:${item.totalStock<=5?'var(--red)':'var(--green)'}">${item.totalStock}</span></td>
      <td>
        <div class="qty-ctrl">
          <button onclick="changeDQty(${i},-1)">âˆ’</button>
          <span>${item.qty}</span>
          <button onclick="changeDQty(${i},1)">+</button>
        </div>
      </td>
      <td><button class="remove-btn" onclick="distItems.splice(${i},1);renderDistItems()">Ã—</button></td>
    </tr>`).join('');
}

function changeDQty(i,d){
  distItems[i].qty=Math.max(1,distItems[i].qty+d);
  renderDistItems();
}

async function confirmDistribute(){
  if(!distItems.length){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð½ÑÐ¼Ð½Ñ Ò¯Ò¯','error');return;}
  const branch=document.getElementById('dist-branch');
  const branchId=parseInt(branch.value);
  const branchName=branch.options[branch.selectedIndex].text;
  const note=document.getElementById('dist-note').value||'â€”';
  const qty=distItems.reduce((s,i)=>s+i.qty,0);

  try{
    const items=distItems.map(item=>{
      const variant=item.variants?.find(v=>v.color===item.color&&v.size===item.size);
      return{variant_id:variant?.id,quantity:item.qty};
    }).filter(i=>i.variant_id);

    if(items.length){
      await apiPost('/api/transfers',{items,from_branch_id:1,to_branch_id:branchId,note});
    }
  }catch(e){showToast('Ð¥ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»Ð°Ð»Ñ‚Ð°Ð´ Ð°Ð»Ð´Ð°Ð°: '+e.message,'error');return;}

  allHistory.unshift({
    date:new Date().toLocaleDateString('mn-MN'),type:'distribute',
    product:distItems.map(i=>i.name+'Ã—'+i.qty).join(', '),qty,
    detail:'â†’ '+branchName+' Â· '+note,user:currentUser
  });
  const tbody=document.getElementById('dist-history');
  const row=document.createElement('tr');
  row.innerHTML=`<td>${new Date().toLocaleDateString('mn-MN')}</td><td>${branchName}</td><td>${distItems.map(i=>i.name).join(', ')}</td><td>${qty}</td><td>${currentUser}</td><td><span class="badge badge-green">Ð”ÑƒÑƒÑÑÐ°Ð½</span></td>`;
  tbody.prepend(row);
  clearDist();
  showToast('Ð¥ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»Ð°Ð»Ñ‚ Ð°Ð¼Ð¶Ð¸Ð»Ñ‚Ñ‚Ð°Ð¹ â€” '+qty+' ÑˆÐ¸Ñ€Ñ…ÑÐ³ '+branchName+' Ñ€ÑƒÑƒ ÑÐ²Ð»Ð°Ð°','success');
  await loadProducts();
}
function clearDist(){distItems=[];renderDistItems();}

// â”€â”€ INVENTORY â”€â”€
async function renderInventory(){
  const tbody=document.getElementById('inv-table-body');
  tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:#888">ÐÑ‡Ð°Ð°Ð»Ð»Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°...</td></tr>';
  try{
    const invData=await apiGet('/api/inventory?branch_id=1');
    const stockMap={};
    invData.forEach(i=>{
      const key=i.sku;
      if(!stockMap[key]) stockMap[key]={warehouse:0,name:i.name,cat:i.category_name||'',variants:[]};
      stockMap[key].warehouse+=parseInt(i.quantity||0);
      stockMap[key].variants.push(i);
    });

    const search=(document.getElementById('inv-search')?.value||'').toLowerCase().trim();
    const sort=document.getElementById('inv-sort')?.value||'';
    let filteredProducts=PRODUCTS.filter(p=>{
      const text=`${p.sku||''} ${p.name||''} ${p.cat||''}`.toLowerCase();
      return text.includes(search);
    });
    filteredProducts.sort((a,b)=>{
      const aw=stockMap[a.sku]?.warehouse||0;
      const bw=stockMap[b.sku]?.warehouse||0;
      if(sort==='stock-asc') return aw-bw;
      if(sort==='stock-desc') return bw-aw;
      if(sort==='name-asc') return (a.name||'').localeCompare(b.name||'');
      return 0;
    });

    const reorder=[];
    lastInventoryRows=filteredProducts.map(p=>{
      const inv=stockMap[p.sku]||{warehouse:0,variants:[]};
      const warehouseStock=inv.warehouse;
      if(warehouseStock<5) reorder.push({sku:p.sku,name:p.name,need:Math.max(0,15-warehouseStock),stock:warehouseStock});
      const st=warehouseStock===0?'out':warehouseStock<5?'low':'ok';
      const sc=st==='ok'?'badge-green':st==='low'?'badge-amber':'badge-red';
      const sl=st==='ok'?'Ð¥Ð°Ð½Ð³Ð°Ð»Ñ‚Ñ‚Ð°Ð¹':st==='low'?'Ð”ÑƒÑ‚Ð°Ð³Ð´Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°':'Ð”ÑƒÑƒÑÑÐ°Ð½';
      const variantText=(p.variants||[]).slice(0,4).map(v=>`${v.color||'-'} / ${v.size||'-'}`).join(' Â· ');
      return {p,warehouseStock,sc,sl,variantText};
    });

    document.getElementById('reorder-box').innerHTML=reorder.length
      ? 'âš ï¸ Reorder ÑÐ°Ð½Ð°Ð»: '+reorder.slice(0,8).map(r=>`<b>${r.sku}</b> ${r.need}Ñˆ`).join(' Â· ')
      : 'âœ… Reorder ÑˆÐ°Ð°Ñ€Ð´Ð»Ð°Ð³Ð°Ñ‚Ð°Ð¹ Ð±Ð°Ñ€Ð°Ð° Ð°Ð»Ð³Ð° Ð±Ð°Ð¹Ð½Ð°';
    document.getElementById('reorder-box').className='alert-box '+(reorder.length?'warn':'good');

    const rows=lastInventoryRows.map(({p,warehouseStock,sc,sl,variantText})=>`<tr>
        <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${p.sku}</code></td>
        <td><b>${p.name}</b><div class="variant-detail">Variant: ${variantText||'â€”'}</div></td>
        <td>${p.cat}</td>
        <td style="font-weight:700;font-size:16px;color:${warehouseStock===0?'var(--red)':warehouseStock<5?'var(--amber)':'var(--black)'}">${warehouseStock}</td>
        <td>${p.totalStock}</td>
        <td>5</td>
        <td>${warehouseStock<5?`<span style="color:var(--blue);font-weight:600">${Math.max(0,15-warehouseStock)} Ñˆ Ð·Ð°Ñ…Ð¸Ð°Ð»Ð½Ð°</span>`:'â€”'}</td>
        <td><span class="badge ${sc}">${sl}</span></td>
      </tr>`);
    tbody.innerHTML=rows.length?rows.join(''):'<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray)">Ð˜Ð»ÑÑ€Ñ† Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹</td></tr>';
  }catch(e){
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:red">Ò®Ð»Ð´ÑÐ³Ð´ÑÐ» Ñ‚Ð°Ñ‚Ð°Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°</td></tr>';
  }
}
function clearInventorySearch(){
  const s=document.getElementById('inv-search'); const sort=document.getElementById('inv-sort');
  if(s) s.value=''; if(sort) sort.value=''; renderInventory();
}
function downloadInventoryCSV(){
  const rows=[['SKU','Ð‘Ð°Ñ€Ð°Ð°','ÐÐ½Ð³Ð¸Ð»Ð°Ð»','ÐÐ³ÑƒÑƒÐ»Ð°Ñ…Ñ‚','ÐÐ¸Ð¹Ñ‚','Ð”Ð¾Ð¾Ð´ Ñ…ÑÐ¼Ð¶ÑÑ','Ð¡Ñ‚Ð°Ñ‚ÑƒÑ']];
  lastInventoryRows.forEach(({p,warehouseStock,sl})=>rows.push([p.sku,p.name,p.cat,warehouseStock,p.totalStock,5,sl]));
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='titem-warehouse-inventory.csv';a.click();URL.revokeObjectURL(a.href);
}
function printBarcodeLabels(){
  const rows=(lastInventoryRows.length?lastInventoryRows:PRODUCTS.map(p=>({p,warehouseStock:p.totalStock,sl:''}))).slice(0,60);
  const html=`<html><head><title>TITEM Barcode Labels</title><style>body{font-family:Arial;padding:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.label{border:1px solid #111;padding:10px;height:82px}.brand{letter-spacing:4px;font-size:12px}.sku{font-family:monospace;font-size:18px;font-weight:bold;margin-top:8px}.name{font-size:11px;margin-top:4px}</style></head><body><div class="grid">${rows.map(r=>`<div class="label"><div class="brand">TITEM</div><div class="sku">${r.p.sku}</div><div class="name">${r.p.name}</div></div>`).join('')}</div><script>window.print()<\/script></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();
}
function handleReceiveCSV(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const lines=String(reader.result).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    let added=0;
    lines.forEach((line,idx)=>{
      if(idx===0 && /sku/i.test(line)) return;
      const [sku,qty,price]=line.split(',').map(x=>x.trim());
      const p=findProduct(sku||''); if(!p) return;
      const q=Math.max(1,parseInt(qty)||1);
      const ex=receiveItems.find(i=>i.sku===p.sku);
      if(ex){ex.qty+=q;} else receiveItems.push({id:p.id,sku:p.sku,name:p.name,color:p.colors[0]||'',size:p.sizes[0]||'',qty:q,price:parseInt(price)||p.price,variants:p.variants});
      added+=q;
    });
    renderReceiveItems(); showToast('CSV-ÑÑÑ '+added+' ÑˆÐ¸Ñ€Ñ…ÑÐ³ Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ','success'); e.target.value='';
  };
  reader.readAsText(file);
}

// â”€â”€ RETURN â”€â”€
function updateReturnType(){
  const t=document.getElementById('return-type').value;
  document.getElementById('return-branch-group').style.display=t==='branch'?'flex':'none';
}
updateReturnType();

function handleReturnBarcode(e){
  if(e.key!=='Enter') return;
  const sku=e.target.value.trim();
  const p=findProduct(sku);
  if(!p){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹','error');return;}
  const ex=returnItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    const variant=(p.variants||[])[0];
    returnItems.push({sku:p.sku,name:p.name,color:p.colors[0]||'',size:p.sizes[0]||'',variant_id:variant?.id,qty:1,condition:'good',resell:true});
  }
  e.target.value='';renderReturnItems();
  showToast(p.name+' Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ','success');
}

function renderReturnItems(){
  const tbody=document.getElementById('return-items');
  const empty=document.getElementById('return-empty');
  if(!returnItems.length){empty.style.display='block';tbody.innerHTML='';return;}
  empty.style.display='none';
  tbody.innerHTML=returnItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td><td>${item.color}</td><td>${item.size}</td>
      <td>
        <div class="qty-ctrl">
          <button onclick="returnItems[${i}].qty=Math.max(1,returnItems[${i}].qty-1);renderReturnItems()">âˆ’</button>
          <span>${item.qty}</span>
          <button onclick="returnItems[${i}].qty++;renderReturnItems()">+</button>
        </div>
      </td>
      <td>
        <select style="border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body)" onchange="returnItems[${i}].condition=this.value">
          <option value="good">Ð¡Ð°Ð¹Ð½</option>
          <option value="used">Ð¥ÑÑ€ÑÐ³Ð»ÑÑÑÐ½</option>
          <option value="damaged">Ð“ÑÐ¼Ñ‚ÑÑÐ½</option>
        </select>
      </td>
      <td>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
          <input type="checkbox" ${item.resell?'checked':''} onchange="returnItems[${i}].resell=this.checked" style="accent-color:var(--black)">
          Ð¢Ð¸Ð¹Ð¼
        </label>
      </td>
      <td><button class="remove-btn" onclick="returnItems.splice(${i},1);renderReturnItems()">Ã—</button></td>
    </tr>`).join('');
}

async function confirmReturn(){
  if(!returnItems.length){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð½ÑÐ¼Ð½Ñ Ò¯Ò¯','error');return;}
  const reason=document.getElementById('return-reason').value||'â€”';
  const qty=returnItems.reduce((s,i)=>s+i.qty,0);
  const returnType=document.getElementById('return-type').value;
  const sourceBranchId=returnType==='branch'?parseInt(document.getElementById('return-branch').value):1;
  const items=returnItems.map(i=>({
    variant_id:i.variant_id,
    quantity:i.qty,
    condition:i.condition||'good',
    resell:i.resell!==false,
    action:i.resell!==false?'restock':'damaged'
  })).filter(i=>i.variant_id&&i.quantity>0);
  if(!items.length){showToast('Ð‘ÑƒÑ†Ð°Ð°Ñ… Ð±Ð°Ñ€Ð°Ð°Ð½Ñ‹ variant Ð¼ÑÐ´ÑÑÐ»ÑÐ» Ð°Ð»Ð³Ð° Ð±Ð°Ð¹Ð½Ð°','error');return;}
  try{
    await apiPost('/api/returns',{
      return_type:returnType,
      source_branch_id:sourceBranchId,
      reason,
      note:document.getElementById('return-order').value||'',
      items
    });
    allHistory.unshift({
      date:new Date().toLocaleDateString('mn-MN'),type:'return',
      product:returnItems.map(i=>i.name+'Ã—'+i.qty).join(', '),qty,
      detail:'Ð¨Ð°Ð»Ñ‚Ð³Ð°Ð°Ð½: '+reason,user:currentUser
    });
  }catch(e){
    showToast('Ð‘ÑƒÑ†Ð°Ð°Ð»Ñ‚ Ð±Ò¯Ñ€Ñ‚Ð³ÑÑ…ÑÐ´ Ð°Ð»Ð´Ð°Ð°: '+e.message,'error');
    return;
  }
  const tbody=document.getElementById('return-history');
  const row=document.createElement('tr');
  const type=document.getElementById('return-type');
  row.innerHTML=`<td>${new Date().toLocaleDateString('mn-MN')}</td><td>${type.options[type.selectedIndex].text}</td><td>${returnItems.map(i=>i.name).join(', ')}</td><td>${qty}</td><td>${reason}</td><td><span class="badge badge-green">Ð¢Ð¸Ð¹Ð¼</span></td><td><span class="badge badge-green">Ð”ÑƒÑƒÑÑÐ°Ð½</span></td>`;
  tbody.prepend(row);
  clearReturn();
  showToast('Ð‘ÑƒÑ†Ð°Ð°Ð»Ñ‚ Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ³Ð´Ð»ÑÑ â€” '+qty+' ÑˆÐ¸Ñ€Ñ…ÑÐ³','success');
}
function clearReturn(){returnItems=[];renderReturnItems();}

// â”€â”€ WRITE-OFF â”€â”€
function handleWriteoffBarcode(e){
  if(e.key!=='Enter') return;
  const sku=e.target.value.trim();
  const p=findProduct(sku);
  if(!p){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹','error');return;}
  const ex=writeoffItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    writeoffItems.push({sku:p.sku,name:p.name,color:p.colors[0]||'',size:p.sizes[0]||'',qty:1,reason:''});
  }
  e.target.value='';renderWriteoffItems();
  showToast(p.name+' Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ','warn');
}

function renderWriteoffItems(){
  const tbody=document.getElementById('writeoff-items');
  const empty=document.getElementById('writeoff-empty');
  if(!writeoffItems.length){empty.style.display='block';tbody.innerHTML='';return;}
  empty.style.display='none';
  tbody.innerHTML=writeoffItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td><td>${item.color}</td><td>${item.size}</td>
      <td>
        <div class="qty-ctrl">
          <button onclick="writeoffItems[${i}].qty=Math.max(1,writeoffItems[${i}].qty-1);renderWriteoffItems()">âˆ’</button>
          <span>${item.qty}</span>
          <button onclick="writeoffItems[${i}].qty++;renderWriteoffItems()">+</button>
        </div>
      </td>
      <td>
        <select style="border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body)" onchange="writeoffItems[${i}].reason=this.value">
          <option value="">Ð¡Ð¾Ð½Ð³Ð¾Ñ…...</option>
          <option value="Ð“ÑÐ¼Ñ‚ÑÑÐ½">Ð“ÑÐ¼Ñ‚ÑÑÐ½</option>
          <option value="ÐÐ»Ð´Ð°Ð³Ð´ÑÐ°Ð½">ÐÐ»Ð´Ð°Ð³Ð´ÑÐ°Ð½</option>
          <option value="Ð¥ÑƒÑƒÑ‡Ð¸Ñ€ÑÐ°Ð½">Ð¥ÑƒÑƒÑ‡Ð¸Ñ€ÑÐ°Ð½</option>
          <option value="Ð§Ð°Ð½Ð°Ñ€Ð³Ò¯Ð¹">Ð§Ð°Ð½Ð°Ñ€Ð³Ò¯Ð¹</option>
          <option value="Ð‘ÑƒÑÐ°Ð´">Ð‘ÑƒÑÐ°Ð´</option>
        </select>
      </td>
      <td><button class="remove-btn" onclick="writeoffItems.splice(${i},1);renderWriteoffItems()">Ã—</button></td>
    </tr>`).join('');
}

function confirmWriteoff(){
  if(!writeoffItems.length){showToast('Ð‘Ð°Ñ€Ð°Ð° Ð½ÑÐ¼Ð½Ñ Ò¯Ò¯','error');return;}
  const missing=writeoffItems.filter(i=>!i.reason);
  if(missing.length){showToast('Ð‘Ò¯Ñ… Ð±Ð°Ñ€Ð°Ð°Ð½Ñ‹ ÑˆÐ°Ð»Ñ‚Ð³Ð°Ð°Ð½Ñ‹Ð³ ÑÐ¾Ð½Ð³Ð¾Ð½Ð¾ ÑƒÑƒ','error');return;}
  document.getElementById('writeoff-confirm-list').innerHTML=
    writeoffItems.map(i=>`<div>â€¢ ${i.name} (${i.color}, ${i.size}) Ã— ${i.qty} Ñˆ â€” ${i.reason}</div>`).join('');
  openModal('modal-writeoff-confirm');
}

function doWriteoff(){
  const qty=writeoffItems.reduce((s,i)=>s+i.qty,0);
  allHistory.unshift({
    date:new Date().toLocaleDateString('mn-MN'),type:'writeoff',
    product:writeoffItems.map(i=>i.name+'Ã—'+i.qty).join(', '),qty,
    detail:writeoffItems.map(i=>i.reason).join(', '),user:currentUser
  });
  const tbody=document.getElementById('writeoff-history');
  writeoffItems.forEach(item=>{
    const row=document.createElement('tr');
    row.innerHTML=`<td>${new Date().toLocaleDateString('mn-MN')}</td><td><code style="font-size:11px;background:var(--gray-light);padding:2px 6px;border-radius:4px">${item.sku}</code></td><td>${item.name}</td><td style="color:var(--red);font-weight:700">${item.qty}</td><td>${item.reason}</td><td>${currentUser}</td>`;
    tbody.prepend(row);
  });
  closeModal('modal-writeoff-confirm');
  clearWriteoff();
  showToast(qty+' ÑˆÐ¸Ñ€Ñ…ÑÐ³ Ð±Ð°Ñ€Ð°Ð° ÑƒÑÑ‚Ð³Ð°Ð³Ð´Ð»Ð°Ð°','warn');
}
function clearWriteoff(){writeoffItems=[];renderWriteoffItems();}

// â”€â”€ APPROVAL / ADJUSTMENT â”€â”€
function renderApprovals(){
  const tbody=document.getElementById('approval-list');
  if(!tbody) return;
  document.getElementById('ap-receive').textContent=pendingApprovals.filter(a=>a.type==='receive').length;
  document.getElementById('ap-transfer').textContent=pendingApprovals.filter(a=>a.type==='distribute').length;
  document.getElementById('ap-return').textContent=pendingApprovals.filter(a=>a.type==='return').length;
  document.getElementById('ap-writeoff').textContent=pendingApprovals.filter(a=>a.type==='writeoff').length;
  tbody.innerHTML=pendingApprovals.length?pendingApprovals.map((a,i)=>`<tr><td>${a.date}</td><td>${a.type}</td><td>${a.product}</td><td><b>${a.qty}</b></td><td><span class="badge badge-amber">Pending</span></td><td><button class="mini-action" onclick="approvePending(${i})">Approve</button></td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--gray)">ÐžÐ´Ð¾Ð¾Ð³Ð¾Ð¾Ñ€ pending approval Ð°Ð»Ð³Ð°</td></tr>';
}
function approvePending(i){
  const a=pendingApprovals.splice(i,1)[0];
  if(a){allHistory.unshift({...a,detail:(a.detail||'')+' Â· Approved',user:currentUser});showToast('Approval Ð±Ð°Ñ‚Ð»Ð°Ð³Ð´Ð»Ð°Ð°','success');}
  renderApprovals();
}
function submitAdjustment(){
  const sku=document.getElementById('adj-sku').value.trim();
  const real=parseInt(document.getElementById('adj-real').value);
  const system=parseInt(document.getElementById('adj-system').value);
  const reason=document.getElementById('adj-reason').value;
  if(!sku||Number.isNaN(real)||Number.isNaN(system)){showToast('SKU, Ð±Ð¾Ð´Ð¸Ñ‚ Ñ‚Ð¾Ð¾, ÑÐ¸ÑÑ‚ÐµÐ¼Ð¸Ð¹Ð½ Ñ‚Ð¾Ð¾Ð³ Ð±Ó©Ð³Ð»Ó©Ð½Ó© Ò¯Ò¯','error');return;}
  const diff=real-system;
  const row={date:new Date().toLocaleDateString('mn-MN'),sku,real,system,diff,reason,user:currentUser};
  adjustmentHistory.unshift(row);
  allHistory.unshift({date:row.date,type:'adjustment',product:sku,qty:diff,detail:`System ${system} â†’ Real ${real} Â· ${reason}`,user:currentUser});
  renderAdjustments();clearAdjustment();showToast('Adjustment Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ³Ð´Ð»ÑÑ','success');
}
function renderAdjustments(){
  const tbody=document.getElementById('adjustment-history'); if(!tbody) return;
  tbody.innerHTML=adjustmentHistory.length?adjustmentHistory.map(r=>`<tr><td>${r.date}</td><td><code style="font-size:11px;background:var(--gray-light);padding:2px 6px;border-radius:4px">${r.sku}</code></td><td>${r.system}</td><td>${r.real}</td><td style="font-weight:700;color:${r.diff<0?'var(--red)':'var(--green)'}">${r.diff>0?'+':''}${r.diff}</td><td>${r.reason}</td><td>${r.user}</td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray)">Adjustment Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ» Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹</td></tr>';
}
function clearAdjustment(){['adj-sku','adj-real','adj-system'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});}

// â”€â”€ HISTORY â”€â”€
function renderAllHistory(filter){
  const list=filter==='all'?allHistory:allHistory.filter(h=>h.type===filter);
  document.getElementById('history-count').textContent=list.length+' Ð±Ð¸Ñ‡Ð»ÑÐ³';
  const typeLabels={receive:'ÐžÑ€Ð»Ð¾Ð³Ð¾',distribute:'Ð¥ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»Ð°Ð»Ñ‚',return:'Ð‘ÑƒÑ†Ð°Ð°Ð»Ñ‚',writeoff:'Write-off',adjustment:'Adjustment'};
  const typeBadges={receive:'badge-green',distribute:'badge-blue',return:'badge-amber',writeoff:'badge-red',adjustment:'badge-gray'};
  document.getElementById('all-history').innerHTML=list.length
    ? list.map(h=>`<tr>
        <td style="font-size:11px">${h.date}</td>
        <td><span class="badge ${typeBadges[h.type]}">${typeLabels[h.type]}</span></td>
        <td>${h.product}</td>
        <td><b>${h.qty}</b></td>
        <td style="font-size:11px;color:var(--gray)">${h.detail}</td>
        <td>${h.user}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--gray)">ÐžÐ´Ð¾Ð¾Ð³Ð¾Ð¾Ñ€ Ð±Ð¸Ñ‡Ð»ÑÐ³ Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°</td></tr>';
}
function filterHistory(f,btn){
  document.querySelectorAll('#panel-history .btn-secondary').forEach(b=>{b.style.background='';b.style.color='';});
  btn.style.background='var(--black)';btn.style.color='var(--white)';
  renderAllHistory(f);
}

// â”€â”€ MODAL â”€â”€
function openModal(id){document.getElementById(id).classList.add('show')}
function closeModal(id){document.getElementById(id).classList.remove('show')}

// â”€â”€ TOAST â”€â”€
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.className='toast'+(type?' '+type:'');
  document.getElementById('toast-msg').textContent=msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2800);
}

// â”€â”€ AUTOCOMPLETE â”€â”€
function whShowSuggestions(query, type){
  const sugEl = document.getElementById(type+'-suggestions');
  if(!sugEl) return;
  if(!query || query.length < 1){sugEl.style.display='none';return;}
  
  const q = query.toLowerCase();
  const filtered = PRODUCTS.filter(p => 
    p.sku.toLowerCase().includes(q) || 
    p.name.toLowerCase().includes(q)
  ).slice(0, 8);
  
  if(!filtered.length){sugEl.style.display='none';return;}
  
  sugEl.style.display='block';
  sugEl.innerHTML = filtered.map(p => `
    <div onclick="whSelectProduct('${p.sku}','${type}')" 
      style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-light);transition:background .15s"
      onmouseover="this.style.background='#f8f8f8'" 
      onmouseout="this.style.background='white'">
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${p.name}</div>
        <div style="font-size:11px;color:var(--gray)">${p.sku} Â· ${p.cat}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;font-weight:600;color:var(--black)">â‚®${p.price.toLocaleString()}</div>
        <div style="font-size:10px;color:${p.totalStock<=5?'var(--red)':'var(--green)'}">${p.totalStock} ÑˆÐ¸Ñ€Ñ…ÑÐ³</div>
      </div>
    </div>`).join('');
}

function whHideSuggestions(type){
  const sugEl = document.getElementById(type+'-suggestions');
  if(sugEl) sugEl.style.display='none';
}

function whSelectProduct(sku, type){
  const inputMap = {receive:'wh-barcode', dist:'wh-dist-barcode', return:'wh-return-barcode'};
  const input = document.getElementById(inputMap[type]);
  if(input){
    input.value = sku;
    whHideSuggestions(type);
    // Enter Ð´Ð°Ñ€ÑÐ°Ð½Ñ‚Ð°Ð¹ Ð°Ð´Ð¸Ð» Ð°Ð¶Ð¸Ð»Ð»ÑƒÑƒÐ»Ð½Ð°
    const event = {key:'Enter', target:input};
    if(type==='receive') whHandleBarcode(event);
    else if(type==='dist') whHandleDistBarcode(event);
    else if(type==='return') whHandleReturnBarcode(event);
  }
}

function doWarehouseLogout(){
  if(confirm('Ð¡Ð¸ÑÑ‚ÐµÐ¼ÑÑÑ Ð³Ð°Ñ€Ð°Ñ… ÑƒÑƒ?')){
    TOKEN='';
    localStorage.removeItem('warehouse_token');
    location.reload();
  }
}

// â”€â”€ INIT â”€â”€
initWarehouse();

