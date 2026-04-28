// ── API ──
const API='';
let TOKEN=localStorage.getItem('admin_token')||'';

async function handleApiError(res){
  const text=await res.text();
  if(res.status===401){
    TOKEN='';
    localStorage.removeItem('admin_token');
    document.getElementById('login-wrap').style.display='flex';
    document.getElementById('admin-wrap').classList.remove('show');
    showToast('Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү','error');
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

let today=new Date().toISOString().split('T')[0];
let invFilter='all';

// ── AUTH ──
async function doLogin(){
  const u=document.getElementById('adm-user').value.trim();
  const p=document.getElementById('adm-pw').value;
  const err=document.getElementById('login-err');
  err.style.display='none';
  try{
    const data=await apiPost('/api/auth/login',{username:u,password:p});
    if(!['super_admin','admin'].includes(data.user.role)){
      err.style.display='block';err.textContent='Админ эрх байхгүй байна';return;
    }
    TOKEN=data.token;
    localStorage.setItem('admin_token',TOKEN);
    document.getElementById('sb-user').textContent=data.user.full_name||u;
    document.getElementById('login-wrap').style.display='none';
    document.getElementById('admin-wrap').classList.add('show');
    initDate();
    await loadAll();
  }catch(e){err.style.display='block';err.textContent='Нэвтрэх нэр эсвэл нууц үг буруу';}
}

function doLogout(){
  if(confirm('Системээс гарах уу?')){
    TOKEN='';localStorage.removeItem('admin_token');
    document.getElementById('login-wrap').style.display='flex';
    document.getElementById('admin-wrap').classList.remove('show');
  }
}

// ── NAV ──
function showPanel(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  if(btn) btn.classList.add('active');
  const titles={dashboard:'Дашбоард',branches:'Салбарууд',alerts:'Сануулга',inventory:'Үлдэгдэл',transfer:'Шилжүүлэг',suppliers:'Нийлүүлэгч',partners:'Гэрээт борлуулагч',sales:'Борлуулалт',products:'Бараа тайлан',users:'Хэрэглэгчид','manage-products':'Бараа удирдлага','wh-receive':'Орлогодох','wh-distribute':'Хуваарилах','wh-return':'Буцаалт',barcode:'Баркод үүсгэх'};
  if(id==='manage-products'){ loadProductCategories(); loadManageProducts(); }
  if(id==='wh-receive'||id==='wh-distribute'||id==='wh-return') loadWarehouseData();
  if(id==='barcode'){loadBarcodeProducts();loadUsers();}
  if(id==='transfer') loadTransferForm();
  if(id==='suppliers') loadSuppliers();
  if(document.getElementById('panel-partners')?.classList.contains('active')) renderPartners();
  if(id==='users') loadUsers();
  document.getElementById('page-title').textContent=titles[id]||id;
}

function initDate(){
  const n=new Date();
  today=n.toISOString().split('T')[0];
  document.getElementById('date-badge').textContent=n.getFullYear()+'/'+(n.getMonth()+1).toString().padStart(2,'0')+'/'+n.getDate().toString().padStart(2,'0');
}

async function refreshData(){
  const activePanel = document.querySelector('.panel.active')?.id || '';
  if(activePanel === 'panel-inventory'){
    await loadInventory();
  } else {
    await loadAll();
  }
}

// ── LOAD ALL ──
async function loadAll(){
  await loadProductCategories();
  await Promise.all([
    loadDashboard(),
    loadBranches(),
    loadInventory(),
    loadSales(),
    loadUsers(),
    loadSuppliers(),
    loadAlerts(),
    loadBarcodeProducts()
  ]);
  await loadTransferForm();
}

// ── DASHBOARD ──
async function loadDashboard(){
  try{
    const [branchData,daily] = await Promise.all([
      apiGet('/api/reports/branches?date='+today),
      apiGet('/api/reports/daily?date='+today)
    ]);

    const totalRev=branchData.reduce((s,b)=>s+parseInt(b.total_revenue||0),0);
    const totalTxn=branchData.reduce((s,b)=>s+parseInt(b.transaction_count||0),0);
    const s=daily.summary;
    const cash=parseInt(s.cash_total||0);
    const card=parseInt(s.card_total||0);
    const qpay=parseInt(s.qpay_total||0);
    const total=cash+card+qpay;

    document.getElementById('kpi-revenue').textContent='₮'+totalRev.toLocaleString();
    document.getElementById('kpi-txn').textContent=totalTxn;

    // Inventory KPI
    try{
      const inv=await apiGet('/api/inventory');
      const totalStock=inv.reduce((s,i)=>s+parseInt(i.quantity||0),0);
      document.getElementById('kpi-stock').textContent=totalStock.toLocaleString();
      const alerts=inv.filter(i=>parseInt(i.quantity||0)<=0).length;
      document.getElementById('kpi-alert').textContent=alerts;
    }catch(e){}

    // Bar chart - 7 хоног
    const days=['Да','Мя','Лх','Пү','Ба','Бя','Ня'];
    const vals=[820000,940000,1100000,780000,1350000,1580000,totalRev||1240000];
    const maxV=Math.max(...vals);
    document.getElementById('week-chart').innerHTML=days.map((d,i)=>`
      <div class="bar-col">
        <div class="bar-val">₮${(vals[i]/1000).toFixed(0)}K</div>
        <div class="bar" style="height:${Math.round(vals[i]/maxV*110)}px;background:${i===6?'var(--black)':'var(--gray-mid)'}"></div>
        <div class="bar-label">${d}</div>
      </div>`).join('');

    // Donut
    const payTotal=cash+card+qpay||1;
    const payData=[
      {name:'Бэлэн',pct:Math.round(cash/payTotal*100),color:'#0a0a0a'},
      {name:'Карт',pct:Math.round(card/payTotal*100),color:'#378ADD'},
      {name:'QPay',pct:Math.round(qpay/payTotal*100),color:'#27ae60'}
    ];
    let offset=0;const r=48,cx=60,cy=60,c=2*Math.PI*r;
    document.getElementById('donut-svg').innerHTML=payData.map(d=>{
      const dash=d.pct/100*c;
      const path=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="16" stroke-dasharray="${dash} ${c-dash}" stroke-dashoffset="${-offset*c/100}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset+=d.pct;return path;
    }).join('');
    document.getElementById('donut-legend').innerHTML=payData.map(d=>`
      <div class="legend-row">
        <div class="legend-left"><div class="legend-dot" style="background:${d.color}"></div>${d.name}</div>
        <div class="legend-val">${d.pct}%</div>
      </div>`).join('');

    // Branch table
    document.getElementById('branch-table').innerHTML=branchData.map(b=>{
      const rev=parseInt(b.total_revenue||0);
      const goal=2000000;
      const prog=Math.min(100,Math.round(rev/goal*100));
      return`<tr>
        <td><b>${b.name}</b><br><span style="font-size:11px;color:var(--gray)">${b.location||''}</span></td>
        <td>₮${rev.toLocaleString()}</td>
        <td>${b.transaction_count||0}</td>
        <td>₮${goal.toLocaleString()}</td>
        <td>
          <div class="progress-bar-wrap">
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${prog}%;background:${prog>=60?'var(--green)':prog>=30?'var(--amber)':'var(--red)'}"></div></div>
            <span class="progress-label">${prog}%</span>
          </div>
        </td>
        <td><span class="badge badge-green">Онлайн</span></td>
      </tr>`;}).join('');
  }catch(e){console.error('Dashboard алдаа:',e);}
}

// ── BRANCHES ──
function branchTypeLabel(type){
  const t = type || 'own_branch';
  if(t === 'partner') return 'Гэрээт борлуулагч';
  return 'Өөрийн салбар';
}
function branchTypeBadge(type){
  const t = type || 'own_branch';
  if(t === 'partner') return 'badge-amber';
  return 'badge-green';
}
function normalizeBranchType(b){
  const raw = b.branch_type || b.type || (b.is_consignment ? 'partner' : 'own_branch');
  return raw === 'consignment' ? 'partner' : raw;
}
function branchCommissionText(b){
  const v = b.commission_percent ?? b.commission ?? '';
  return v !== '' && v !== null && v !== undefined ? `${v}%` : '—';
}


function refreshBranchFilterOptions(branches){
  const sel=document.getElementById('branch-filter');
  if(!sel || !Array.isArray(branches)) return;

  const current=sel.value || 'all';
  const active=branches.filter(b=>b.is_active!==false);

  const own=active.filter(b=>normalizeBranchType(b)==='own_branch');
  const partners=active.filter(b=>normalizeBranchType(b)==='partner');

  const optionLabel=b=>{
    const type=normalizeBranchType(b)==='partner' ? 'Гэрээт борлуулагч' : 'Өөрийн салбар';
    const loc=b.location ? ' — '+b.location : '';
    return `${b.name}${loc} (${type})`;
  };

  sel.innerHTML =
    `<option value="all">Бүх салбар / борлуулагч</option>` +
    `<optgroup label="Өөрийн салбар">` +
      own.map(b=>`<option value="${b.id}">${optionLabel(b)}</option>`).join('') +
    `</optgroup>` +
    `<optgroup label="Гэрээт борлуулагч">` +
      partners.map(b=>`<option value="${b.id}">${optionLabel(b)}</option>`).join('') +
    `</optgroup>`;

  if([...sel.options].some(o=>o.value===current)) sel.value=current;
}

async function loadBranches(){
  try{
    const [reportData, masterData] = await Promise.all([
      apiGet('/api/reports/branches?date='+today).catch(()=>[]),
      fetch('/api/branches').then(r=>r.json()).catch(()=>[])
    ]);

    const masterMap = {};
    masterData.forEach(b => masterMap[b.id] = b);
    const data = reportData.length ? reportData.map(b => ({...b, ...(masterMap[b.id]||{})})) : masterData;
    window.BRANCHES = data;
    refreshBranchFilterOptions(masterData.length ? masterData : data);

    document.getElementById('branch-grid').innerHTML=data.map(b=>{
      const type = normalizeBranchType(b);
      return `
      <div class="branch-card">
        <div class="branch-card-head">
          <div class="branch-name">${b.name}<br>
            <span style="font-size:11px;color:var(--gray);font-weight:400">${b.location||''}</span><br>
            <span class="badge ${branchTypeBadge(type)}" style="margin-top:6px">${branchTypeLabel(type)}</span>
          </div>
          <div class="branch-status ${b.is_active===false?'offline':'online'}"></div>
        </div>
        <div class="branch-stat-row"><span>Өдрийн орлого</span><span>₮${parseInt(b.total_revenue||0).toLocaleString()}</span></div>
        <div class="branch-stat-row"><span>Гүйлгээ</span><span>${b.transaction_count||0}</span></div>
        <div class="branch-stat-row"><span>Комисс</span><span>${branchCommissionText(b)}</span></div>
        <div class="branch-stat-row"><span>Хариуцагч</span><span>${b.manager_name||b.contact_name||'—'}</span></div>
      </div>`}).join('');

    document.getElementById('branch-detail-table').innerHTML=data.map(b=>{
      const type = normalizeBranchType(b);
      return `
      <tr>
        <td><b>${b.name}</b><br><span style="font-size:11px;color:var(--gray)">${b.manager_name||b.contact_name||''} ${b.phone?`· ${b.phone}`:''}</span></td>
        <td><span class="badge ${branchTypeBadge(type)}">${branchTypeLabel(type)}</span></td>
        <td>${b.location||'—'}</td>
        <td>${branchCommissionText(b)}</td>
        <td>₮${parseInt(b.total_revenue||0).toLocaleString()}</td>
        <td>₮${parseInt(b.cash_total||0).toLocaleString()}</td>
        <td>₮${(parseInt(b.card_total||0)+parseInt(b.qpay_total||0)).toLocaleString()}</td>
        <td>${b.transaction_count||0}</td>
        <td><span class="badge ${b.is_active===false?'badge-gray':'badge-green'}">${b.is_active===false?'Идэвхгүй':'Идэвхтэй'}</span></td>
      </tr>`}).join('');
  }catch(e){console.error('Branches алдаа:',e);}
}

// ── ALERTS ──
async function loadAlerts(){
  try{
    const data=await apiGet('/api/alerts');
    const low=data.low_stock||[];
    if(!low.length){
      document.getElementById('alert-list').innerHTML='<div style="padding:40px;text-align:center;color:var(--gray)">Анхааруулга байхгүй байна ✓</div>';
      return;
    }
    document.getElementById('alert-list').innerHTML=low.map(i=>{
      const type=parseInt(i.quantity)===0?'urgent':'warn';
      const icon=parseInt(i.quantity)===0?'🔴':'🟡';
      return`<div class="alert-item ${type}">
        <div class="alert-icon">${icon}</div>
        <div class="alert-body">
          <div class="alert-title">${i.name} — ${parseInt(i.quantity)===0?'дууссан':i.quantity+' үлдсэн'}</div>
          <div class="alert-sub">${i.branch_name} · Доод хэмжээ: ${i.min_quantity}</div>
        </div>
        <button class="alert-action">Захиалах →</button>
      </div>`;}).join('');
  }catch(e){console.error('Alerts алдаа:',e);}
}

// ── INVENTORY ──
async function loadInventory(){
  try{
    const branch=document.getElementById('branch-filter')?.value || 'all';
    const selectedBranch=(window.BRANCHES||[]).find(b=>String(b.id)===String(branch));
    const selectedType=selectedBranch ? normalizeBranchType(selectedBranch) : 'all';

    if(branch !== 'all' && selectedType === 'partner'){
      const partnerInv=await apiGet('/api/partners/inventory');
      window.INV_DATA=(partnerInv||[])
        .filter(r=>String(r.partner_id)===String(branch))
        .map(r=>({
          name:r.product_name,
          sku:r.sku,
          color:r.color,
          size:r.size,
          barcode:r.barcode,
          branch_name:r.partner_name,
          quantity:r.on_hand_qty,
          min_quantity:0,
          category_name:'Гэрээт борлуулагч',
          status:parseInt(r.on_hand_qty||0)>0?'ok':'out'
        }));
      window.CURRENT_INV_BRANCH=branch;
      renderInventory();
      return;
    }

    const url = branch && branch !== 'all'
      ? '/api/inventory?branch_id=' + encodeURIComponent(branch)
      : '/api/inventory';

    const data=await apiGet(url);
    window.INV_DATA=data;
    window.CURRENT_INV_BRANCH=branch;
    renderInventory();
  }catch(e){
    console.error('Inventory алдаа:',e);
    showToast('Үлдэгдэл татахад алдаа: '+e.message,'error');
  }
}

function filterInv(btn,f){
  document.querySelectorAll('.inv-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');invFilter=f;renderInventory();
}

function clearInvSearchSort(){
  const search=document.getElementById('inv-search');
  const sort=document.getElementById('inv-sort');
  if(search) search.value='';
  if(sort) sort.value='';
  renderInventory();
}

function renderInventory(){
  const data=window.INV_DATA||[];
  const grouped={};
  data.forEach(i=>{
    const key=i.sku||i.name;
    if(!grouped[key]){grouped[key]={sku:i.sku,name:i.name,cat:i.category_name||'',total:0,warehouse:0,branches:0,min:parseInt(i.min_quantity||5)};}
    grouped[key].total+=parseInt(i.quantity||0);
    const qty=parseInt(i.quantity||0);
    if(window.CURRENT_INV_BRANCH && window.CURRENT_INV_BRANCH !== 'all'){
      const selectedBranch=(window.BRANCHES||[]).find(b=>String(b.id)===String(window.CURRENT_INV_BRANCH));
      const selectedType=selectedBranch ? normalizeBranchType(selectedBranch) : 'own_branch';
      if(i.branch_name==='Агуулах') grouped[key].warehouse += qty;
      else if(selectedType==='partner') grouped[key].branches += qty;
      else grouped[key].branches += qty;
    } else {
      if(i.branch_name==='Агуулах') grouped[key].warehouse += qty;
      else grouped[key].branches += qty;
    }
  });
  let list=Object.values(grouped);
  list.forEach(i=>{i.status=i.total===0?'out':i.total<i.min?'low':'ok';});

  if(invFilter!=='all')list=list.filter(i=>i.status===invFilter);

  const search=(document.getElementById('inv-search')?.value||'').toLowerCase().trim();
  if(search){
    list=list.filter(i=>`${i.sku||''} ${i.name||''} ${i.cat||''}`.toLowerCase().includes(search));
  }

  const sort=document.getElementById('inv-sort')?.value||'';
  list.sort((a,b)=>{
    if(sort==='stock-asc') return a.total-b.total;
    if(sort==='stock-desc') return b.total-a.total;
    if(sort==='warehouse-asc') return a.warehouse-b.warehouse;
    if(sort==='warehouse-desc') return b.warehouse-a.warehouse;
    if(sort==='name-asc') return (a.name||'').localeCompare(b.name||'','mn');
    if(sort==='name-desc') return (b.name||'').localeCompare(a.name||'','mn');
    return 0;
  });

  const branchText = document.getElementById('branch-filter')?.selectedOptions?.[0]?.textContent || 'Бүх салбар';
  document.getElementById('inv-count').textContent=list.length+' бараа · '+branchText;
  document.getElementById('inv-table').innerHTML=list.length ? list.map(i=>{
    const sc=i.status==='ok'?'badge-green':i.status==='low'?'badge-amber':'badge-red';
    const sl=i.status==='ok'?'Хангалттай':i.status==='low'?'Дутагдаж байна':'Дууссан';
    return`<tr>
      <td><span style="font-size:11px;font-family:monospace;background:var(--gray-light);padding:2px 8px;border-radius:4px">${i.sku||'—'}</span></td>
      <td><b>${i.name}</b></td><td>${i.cat}</td>
      <td style="font-weight:700;font-size:16px">${i.total}</td>
      <td>${i.warehouse}</td><td>${i.branches}</td><td>${i.min}</td>
      <td><span class="badge ${sc}">${sl}</span></td>
    </tr>`;}).join('') : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray)">Илэрц олдсонгүй</td></tr>';
}


// ── PARTNER SELLERS — BACKEND API CONNECTED ──
let PARTNER_PRODUCTS = [];
let PARTNER_INVENTORY = [];
let PARTNER_HISTORY = [];

function getPartners(){
  const list = window.BRANCHES || [];
  return list.filter(b => normalizeBranchType(b) === 'partner' && b.is_active !== false);
}

async function loadPartnerProducts(){
  if(PARTNER_PRODUCTS.length) return PARTNER_PRODUCTS;
  const products = await apiGet('/api/products?limit=200');
  const details = await Promise.all(
    products.map(p => apiGet('/api/products/' + p.id).catch(() => ({...p, variants:[]})))
  );
  PARTNER_PRODUCTS = details;
  return PARTNER_PRODUCTS;
}

function getPartnerVariantOptions(){
  const list = PARTNER_PRODUCTS || [];
  const opts = [];
  list.forEach(p => {
    (p.variants || []).forEach(v => {
      opts.push(`<option value="${v.id}" data-price="${p.price||0}">
        ${p.name} · ${v.color||'—'} / ${v.size||'—'} (${v.sku||p.sku||'-'})
      </option>`);
    });
  });
  return opts.join('');
}

function fillPartnerSelects(){
  const partners = getPartners();
  const partnerOptions = partners.map(p =>
    `<option value="${p.id}" data-commission="${p.commission_percent||0}">${p.name}</option>`
  ).join('');

  ['pt-transfer-partner','pt-sale-partner','pt-return-partner'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML = partnerOptions || '<option value="">Гэрээт борлуулагч байхгүй</option>';
  });

  const variantOptions = getPartnerVariantOptions();
  ['pt-transfer-product','pt-sale-product','pt-return-product'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML = variantOptions || '<option value="">Variant байхгүй</option>';
  });
}

function partnerTypeLabel(type){
  if(type === 'TRANSFER_TO_PARTNER') return 'Бараа өгсөн';
  if(type === 'PARTNER_SALE') return 'Зарсан тооцоо';
  if(type === 'PARTNER_RETURN') return 'Буцаалт';
  if(type === 'SETTLEMENT_PAID') return 'Тооцоо төлсөн';
  return type || '—';
}

function partnerTypeBadge(type){
  if(type === 'PARTNER_SALE') return 'badge-blue';
  if(type === 'PARTNER_RETURN') return 'badge-amber';
  if(type === 'TRANSFER_TO_PARTNER') return 'badge-green';
  return 'badge-gray';
}

async function loadPartnerData(){
  try{
    await loadBranches();
    await loadPartnerProducts();
    const [inv, hist] = await Promise.all([
      apiGet('/api/partners/inventory').catch(()=>[]),
      apiGet('/api/partners/transactions').catch(()=>[])
    ]);
    PARTNER_INVENTORY = inv || [];
    PARTNER_HISTORY = hist || [];
  }catch(e){
    console.error('Partner data алдаа:', e);
    showToast('Гэрээт борлуулагчийн мэдээлэл татахад алдаа: '+e.message,'error');
  }
}

async function partnerTransfer(){
  const partner_id=document.getElementById('pt-transfer-partner')?.value;
  const variant_id=document.getElementById('pt-transfer-product')?.value;
  const quantity=parseInt(document.getElementById('pt-transfer-qty')?.value||0);
  if(!partner_id||!variant_id||quantity<=0){showToast('Борлуулагч, бараа, тоо сонгоно уу','error');return;}

  try{
    await apiPost('/api/partners/transfer', {
      partner_id: parseInt(partner_id),
      variant_id: parseInt(variant_id),
      quantity,
      note: 'Admin frontend-с гэрээт борлуулагчид бараа өгсөн'
    });
    showToast('Гэрээт борлуулагчид '+quantity+'ш бараа өглөө','success');
    await renderPartners();
    if(typeof loadInventory === 'function') loadInventory();
  }catch(e){
    showToast('Бараа өгөхөд алдаа: '+e.message,'error');
  }
}

async function partnerSale(){
  const partner_id=document.getElementById('pt-sale-partner')?.value;
  const variant_id=document.getElementById('pt-sale-product')?.value;
  const quantity=parseInt(document.getElementById('pt-sale-qty')?.value||0);
  if(!partner_id||!variant_id||quantity<=0){showToast('Борлуулагч, бараа, зарсан тоо сонгоно уу','error');return;}

  try{
    const res = await apiPost('/api/partners/sale', {
      partner_id: parseInt(partner_id),
      variant_id: parseInt(variant_id),
      quantity,
      note: 'Гэрээт борлуулагчийн зарсан тооцоо'
    });
    showToast('Зарсан тооцоо орлоо: ₮'+parseInt(res.amount||0).toLocaleString(),'success');
    await renderPartners();
  }catch(e){
    showToast('Зарсан тооцоо оруулахад алдаа: '+e.message,'error');
  }
}

async function partnerReturn(){
  const partner_id=document.getElementById('pt-return-partner')?.value;
  const variant_id=document.getElementById('pt-return-product')?.value;
  const quantity=parseInt(document.getElementById('pt-return-qty')?.value||0);
  if(!partner_id||!variant_id||quantity<=0){showToast('Борлуулагч, бараа, буцаах тоо сонгоно уу','error');return;}

  try{
    await apiPost('/api/partners/return', {
      partner_id: parseInt(partner_id),
      variant_id: parseInt(variant_id),
      quantity,
      note: 'Гэрээт борлуулагчаас буцаалт авсан'
    });
    showToast('Буцаалт бүртгэгдлээ: '+quantity+'ш','success');
    await renderPartners();
    if(typeof loadInventory === 'function') loadInventory();
  }catch(e){
    showToast('Буцаалт хийхэд алдаа: '+e.message,'error');
  }
}

async function renderPartners(){
  await loadPartnerData();
  fillPartnerSelects();

  const partners=getPartners();
  const tbody=document.getElementById('pt-table');
  const hist=document.getElementById('pt-history');
  const activePartners=partners.filter(p=>p.is_active!==false).length;
  const totalStock=PARTNER_INVENTORY.reduce((s,r)=>s+(parseInt(r.on_hand_qty)||0),0);
  const receivable=PARTNER_INVENTORY.reduce((s,r)=>s+(parseInt(r.receivable_amount)||0),0);
  const returned=PARTNER_INVENTORY.reduce((s,r)=>s+(parseInt(r.returned_qty)||0),0);

  if(document.getElementById('pt-kpi-count')) document.getElementById('pt-kpi-count').textContent=activePartners;
  if(document.getElementById('pt-kpi-stock')) document.getElementById('pt-kpi-stock').textContent=totalStock;
  if(document.getElementById('pt-kpi-receivable')) document.getElementById('pt-kpi-receivable').textContent='₮'+receivable.toLocaleString();
  if(document.getElementById('pt-kpi-returned')) document.getElementById('pt-kpi-returned').textContent=returned;
  if(document.getElementById('pt-count')) document.getElementById('pt-count').textContent=PARTNER_INVENTORY.length+' мөр';

  if(tbody){
    tbody.innerHTML = PARTNER_INVENTORY.length ? PARTNER_INVENTORY.map(r=>`
      <tr>
        <td><b>${r.partner_name||'—'}</b></td>
        <td>${r.product_name||'—'}<br>
          <code style="font-size:11px;background:var(--gray-light);padding:2px 6px;border-radius:4px">${r.sku||r.barcode||'—'}</code>
          <span style="font-size:11px;color:var(--gray);margin-left:6px">${r.color||'—'} / ${r.size||'—'}</span>
        </td>
        <td>${parseInt(r.given_qty||0)}</td>
        <td>${parseInt(r.sold_qty||0)}</td>
        <td>${parseInt(r.returned_qty||0)}</td>
        <td style="font-weight:700">${parseInt(r.on_hand_qty||0)}</td>
        <td style="font-weight:700;color:var(--blue)">₮${parseInt(r.receivable_amount||0).toLocaleString()}</td>
        <td>${r.commission_percent||0}%</td>
        <td><span class="badge ${parseInt(r.on_hand_qty||0)>0?'badge-green':'badge-gray'}">${parseInt(r.on_hand_qty||0)>0?'Бараа байгаа':'Үлдэгдэлгүй'}</span></td>
      </tr>`).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--gray);padding:24px">Гэрээт борлуулагчид өгсөн бараа одоогоор алга</td></tr>`;
  }

  if(hist){
    hist.innerHTML = PARTNER_HISTORY.length ? PARTNER_HISTORY.map(h=>`
      <tr>
        <td>${new Date(h.created_at).toLocaleString('mn-MN')}</td>
        <td><span class="badge ${partnerTypeBadge(h.type)}">${partnerTypeLabel(h.type)}</span></td>
        <td>${h.partner_name||'—'}</td>
        <td>${h.product_name||'—'}<br><span style="font-size:11px;color:var(--gray)">${h.color||'—'} / ${h.size||'—'}</span></td>
        <td>${parseInt(h.quantity||0)}</td>
        <td>${parseInt(h.amount||0) ? '₮'+parseInt(h.amount).toLocaleString() : '—'}</td>
        <td>${h.note||'—'}</td>
      </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px">Хөдөлгөөний түүх алга</td></tr>`;
  }
}

// ── SUPPLIERS ──
async function loadSuppliers(){
  try{
    const data=await apiGet('/api/suppliers');
    document.getElementById('supplier-count').textContent=data.length+' нийлүүлэгч';
    document.getElementById('supplier-table').innerHTML=data.length ? data.map(s=>`
      <tr>
        <td><b>${s.name}</b></td>
        <td>${s.phone||'—'}</td>
        <td style="font-size:12px">${s.email||'—'}</td>
        <td style="font-size:12px;color:var(--gray)">${s.address||'—'}</td>
        <td style="font-weight:700;color:${parseInt(s.total_debt||0)>0?'var(--red)':'var(--green)'}">₮${parseInt(s.total_debt||0).toLocaleString()}</td>
        <td><span class="badge ${parseInt(s.total_debt||0)>0?'badge-red':'badge-green'}">${parseInt(s.total_debt||0)>0?'Өглөгтэй':'Ердийн'}</span></td>
        <td style="display:flex;gap:6px">
          <button onclick="editSupplier(${s.id},'${s.name}','${s.phone||''}','${s.email||''}','${s.address||''}',${s.total_debt||0})" style="border:1px solid var(--gray-mid);background:none;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Засах</button>
          <button onclick="deleteSupplier(${s.id},'${s.name}')" style="border:1px solid #fcc;background:#fff0ee;color:var(--red);padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Устгах</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray)">Нийлүүлэгч байхгүй байна</td></tr>';
  }catch(e){console.error('Suppliers алдаа:',e);}
}

function openAddSupplier(){
  document.getElementById('supplier-modal-title').textContent='Нийлүүлэгч нэмэх';
  document.getElementById('edit-supplier-id').value='';
  document.getElementById('sup-name').value='';
  document.getElementById('sup-phone').value='';
  document.getElementById('sup-email').value='';
  document.getElementById('sup-address').value='';
  document.getElementById('sup-debt').value='0';
  document.getElementById('modal-add-supplier').style.display='flex';
}

function editSupplier(id,name,phone,email,address,debt){
  document.getElementById('supplier-modal-title').textContent='Нийлүүлэгч засах';
  document.getElementById('edit-supplier-id').value=id;
  document.getElementById('sup-name').value=name;
  document.getElementById('sup-phone').value=phone;
  document.getElementById('sup-email').value=email;
  document.getElementById('sup-address').value=address;
  document.getElementById('sup-debt').value=debt;
  document.getElementById('modal-add-supplier').style.display='flex';
}

function closeAddSupplier(){
  document.getElementById('modal-add-supplier').style.display='none';
}

async function saveSupplier(){
  const name=document.getElementById('sup-name').value.trim();
  if(!name){showToast('Нэр оруулна уу','error');return;}
  const id=document.getElementById('edit-supplier-id').value;
  const body={
    name,
    phone:document.getElementById('sup-phone').value,
    email:document.getElementById('sup-email').value,
    address:document.getElementById('sup-address').value,
    total_debt:parseInt(document.getElementById('sup-debt').value)||0
  };
  try{
    if(id){
      await apiPost_put('/api/suppliers/'+id, body);
      showToast(name+' шинэчлэгдлээ','success');
    } else {
      await apiPost('/api/suppliers', body);
      showToast(name+' нэмэгдлээ','success');
    }
    closeAddSupplier();
    await loadSuppliers();
  }catch(e){showToast('Алдаа: '+e.message,'error');}
}

async function deleteSupplier(id,name){
  if(!confirm('"'+name+'" устгах уу?')) return;
  try{
    await fetch(API+'/api/suppliers/'+id,{method:'DELETE',headers:TOKEN?{Authorization:'Bearer '+TOKEN}:{}});
    showToast(name+' устгагдлаа','success');
    await loadSuppliers();
  }catch(e){showToast('Устгахад алдаа','error');}
}

// ── SALES ──
async function loadSales(){
  try{
    const data=await apiGet('/api/orders?limit=20');
    document.getElementById('sales-table').innerHTML=data.map(s=>`
      <tr>
        <td style="font-size:11px">${new Date(s.created_at).toLocaleString('mn-MN')}</td>
        <td><span style="font-family:monospace;font-size:11px;background:var(--gray-light);padding:2px 6px;border-radius:4px">${s.order_number}</span></td>
        <td>${s.branch_name||'—'}</td>
        <td>${s.cashier_name||'—'}</td>
        <td style="font-size:12px">—</td>
        <td><b>₮${parseInt(s.total||0).toLocaleString()}</b></td>
        <td>${{cash:'Бэлэн',card:'Карт',qpay:'QPay'}[s.payment_method]||s.payment_method}</td>
        <td><span class="badge ${s.status==='completed'?'badge-green':'badge-amber'}">${s.status==='completed'?'Дууссан':'Буцаагдсан'}</span></td>
      </tr>`).join('');

    // Sales KPI
    document.getElementById('rep-total') && (document.getElementById('rep-total').textContent='₮'+data.reduce((s,o)=>s+parseInt(o.total||0),0).toLocaleString());
  }catch(e){console.error('Sales алдаа:',e);}
}

// ── PRODUCT REPORT ──
async function loadProductReport(){
  try{
    const data=await apiGet('/api/products?limit=100');
    document.getElementById('product-report-table').innerHTML=data.map(p=>`
      <tr>
        <td><b>${p.name}</b></td>
        <td>—</td>
        <td>—</td>
        <td style="font-weight:700;color:${parseInt(p.total_stock||0)===0?'var(--red)':parseInt(p.total_stock||0)<=5?'var(--amber)':'var(--black)'}">${parseInt(p.total_stock||0)}</td>
        <td><span class="badge badge-gray">—</span></td>
        <td>—</td>
      </tr>`).join('');
  }catch(e){console.error('Product report алдаа:',e);}
}

// ── USERS ──
async function loadUsers(){
  try{
    const [data, branches] = await Promise.all([apiGet('/api/users'), fetch('/api/branches').then(r=>r.json())]);
    window.BRANCHES_LIST = branches;
    const ucEl = document.getElementById('users-count');
    if(ucEl) ucEl.textContent = data.length+' хэрэглэгч';

    // Branch select шинэчлэх
    const brSel = document.getElementById('usr-branch');
    if(brSel) brSel.innerHTML = '<option value="">— Сонгох —</option>' +
      branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');

    const roleNames={super_admin:'Супер Админ',admin:'Менежер',cashier:'Худалдагч',warehouse:'Агуулах'};
    const utEl=document.getElementById('users-table');
    if(!utEl) return;
    utEl.innerHTML=data.map(u=>`
      <tr>
        <td><code style="font-size:12px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${u.username}</code></td>
        <td><b>${u.full_name||'—'}</b></td>
        <td><span class="badge ${u.role==='super_admin'?'badge-red':u.role==='admin'?'badge-blue':u.role==='cashier'?'badge-gray':'badge-amber'}">${roleNames[u.role]||u.role}</span></td>
        <td>${u.branch_name||'Бүгд'}</td>
        <td><span class="badge ${u.is_active?'badge-green':'badge-gray'}">${u.is_active?'Идэвхтэй':'Идэвхгүй'}</span></td>
        <td style="display:flex;gap:6px">
          <button onclick="editUser(${u.id},'${u.username}','${u.full_name||''}','${u.role}',${u.branch_id||'null'},${u.is_active})" style="border:1px solid var(--gray-mid);background:none;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Засах</button>
        </td>
      </tr>`).join('');
  }catch(e){console.error('Users алдаа:',e);}
}

function openAddUser(){
  document.getElementById('user-modal-title').textContent='Хэрэглэгч нэмэх';
  document.getElementById('edit-user-id').value='';
  document.getElementById('usr-username').value='';
  document.getElementById('usr-password').value='';
  document.getElementById('usr-fullname').value='';
  document.getElementById('usr-role').value='cashier';
  document.getElementById('usr-branch').value='';
  document.getElementById('usr-active').checked=true;
  document.getElementById('usr-username').disabled=false;
  document.getElementById('modal-add-user').style.display='flex';
}

function editUser(id,username,fullname,role,branchId,isActive){
  document.getElementById('user-modal-title').textContent='Хэрэглэгч засах';
  document.getElementById('edit-user-id').value=id;
  document.getElementById('usr-username').value=username;
  document.getElementById('usr-username').disabled=true;
  document.getElementById('usr-password').value='';
  document.getElementById('usr-password').placeholder='Хоосон үлдээвэл өөрчлөгдөхгүй';
  document.getElementById('usr-fullname').value=fullname;
  document.getElementById('usr-role').value=role;
  document.getElementById('usr-branch').value=branchId||'';
  document.getElementById('usr-active').checked=isActive;
  document.getElementById('modal-add-user').style.display='flex';
}

function closeAddUser(){
  document.getElementById('modal-add-user').style.display='none';
}

async function saveUser(){
  const id=document.getElementById('edit-user-id').value;
  const username=document.getElementById('usr-username').value.trim();
  const password=document.getElementById('usr-password').value;
  const full_name=document.getElementById('usr-fullname').value.trim();
  const role=document.getElementById('usr-role').value;
  const branch_id=document.getElementById('usr-branch').value||null;
  const is_active=document.getElementById('usr-active').checked;

  if(!id && (!username||!password)){showToast('Нэвтрэх нэр болон нууц үг оруулна уу','error');return;}

  try{
    if(id){
      const body={full_name,role,branch_id,is_active};
      if(password) body.password=password;
      await apiPost_put('/api/users/'+id, body);
      showToast(full_name||username+' шинэчлэгдлээ','success');
    } else {
      await apiPost('/api/users',{username,password,full_name,role,branch_id,is_active});
      showToast(username+' нэмэгдлээ','success');
    }
    closeAddUser();
    await loadUsers();
  }catch(e){showToast('Алдаа: '+e.message,'error');}
}

// ── САЛБАР ЗАСАХ ──
async function openBranchManager(){
  try{
    const data=await fetch('/api/branches').then(r=>r.json());
    document.getElementById('branch-edit-list').innerHTML=`
      <div style="display:grid;grid-template-columns:1.1fr .9fr .9fr .75fr .8fr .8fr 1.2fr auto;gap:8px;padding:0 0 8px;border-bottom:1px solid var(--gray-light);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--gray);font-weight:600">
        <div>Нэр</div><div>Байршил</div><div>Төрөл</div><div>Утас</div><div>Хариуцагч</div><div>Комисс %</div><div>Тооцооны нөхцөл</div><div>Үйлдэл</div>
      </div>
    ` + data.map(b=>{
      const type = normalizeBranchType(b);
      return `
      <div style="display:grid;grid-template-columns:1.1fr .9fr .9fr .75fr .8fr .8fr 1.2fr auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-light)">
        <input value="${b.name||''}" id="br-name-${b.id}" class="f-input" placeholder="Салбарын нэр">
        <input value="${b.location||''}" id="br-loc-${b.id}" class="f-input" placeholder="Байршил">
        <select id="br-type-${b.id}" class="f-input" style="cursor:pointer">
          <option value="own_branch" ${type==='own_branch'?'selected':''}>Өөрийн салбар</option>
          <option value="partner" ${type==='partner'?'selected':''}>Гэрээт борлуулагч</option>
        </select>
        <input value="${b.phone||''}" id="br-phone-${b.id}" class="f-input" placeholder="Утас">
        <input value="${b.manager_name||b.contact_name||''}" id="br-manager-${b.id}" class="f-input" placeholder="Хариуцагч">
        <input value="${b.commission_percent??b.commission??''}" id="br-commission-${b.id}" class="f-input" type="number" min="0" max="100" placeholder="%">
        <input value="${b.payment_terms||''}" id="br-terms-${b.id}" class="f-input" placeholder="7 хоног бүр">
        <div style="display:flex;gap:6px">
          <button onclick="saveBranch(${b.id})" style="background:var(--black);color:var(--white);border:none;padding:9px 12px;font-size:11px;font-weight:600;cursor:pointer;border-radius:6px;font-family:var(--font-body);white-space:nowrap">Хадгалах</button>
          <button onclick="toggleBranchActive(${b.id},${b.is_active===false?'true':'false'})" style="border:1px solid var(--gray-mid);background:var(--white);padding:9px 10px;font-size:11px;cursor:pointer;border-radius:6px;font-family:var(--font-body);white-space:nowrap">${b.is_active===false?'Идэвхжүүлэх':'Идэвхгүй'}</button>
        </div>
      </div>`}).join('');
    document.getElementById('modal-branch').style.display='flex';
  }catch(e){showToast('Салбар татахад алдаа','error');}
}

async function addBranchLocation(){
  const body={
    name:document.getElementById('br-new-name').value.trim(),
    location:document.getElementById('br-new-loc').value.trim(),
    branch_type:document.getElementById('br-new-type').value,
    phone:document.getElementById('br-new-phone').value.trim(),
    manager_name:document.getElementById('br-new-manager').value.trim(),
    commission_percent:document.getElementById('br-new-commission').value||null,
    payment_terms:document.getElementById('br-new-terms').value.trim(),
    is_active:true
  };
  if(!body.name){showToast('Нэр оруулна уу','error');return;}
  try{
    try{
      await apiPost('/api/branches',body);
    }catch(firstErr){
      await apiPost('/api/branches',{name:body.name,location:body.location});
    }
    ['br-new-name','br-new-loc','br-new-phone','br-new-manager','br-new-commission','br-new-terms'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('br-new-type').value='own_branch';
    showToast('Салбар / гэрээт борлуулагч нэмэгдлээ','success');
    await openBranchManager();
    await loadBranches();
  }catch(e){showToast('Нэмэхэд алдаа: '+e.message,'error');}
}

async function saveBranch(id){
  const body={
    name:document.getElementById('br-name-'+id).value.trim(),
    location:document.getElementById('br-loc-'+id).value.trim(),
    branch_type:document.getElementById('br-type-'+id).value,
    phone:document.getElementById('br-phone-'+id).value.trim(),
    manager_name:document.getElementById('br-manager-'+id).value.trim(),
    commission_percent:document.getElementById('br-commission-'+id).value||null,
    payment_terms:document.getElementById('br-terms-'+id).value.trim()
  };
  if(!body.name){showToast('Нэр оруулна уу','error');return;}
  try{
    try{
      await apiPost_put('/api/branches/'+id,body);
    }catch(firstErr){
      await apiPost_put('/api/branches/'+id,{name:body.name,location:body.location});
    }
    showToast('Салбар шинэчлэгдлээ','success');
    await loadBranches();
  }catch(e){showToast('Алдаа: '+e.message,'error');}
}

async function toggleBranchActive(id, active){
  try{
    await apiPost_put('/api/branches/'+id,{is_active:active});
    showToast(active?'Идэвхжүүллээ':'Идэвхгүй болголоо','success');
    await openBranchManager();
    await loadBranches();
  }catch(e){showToast('Backend дээр is_active талбар дэмжигдээгүй байж магадгүй','error');}
}

// Transfers
async function loadTransferForm(){
  const fromSel=document.getElementById('tf-from');
  const toSel=document.getElementById('tf-to');
  if(!fromSel || !toSel) return;

  let branches=window.BRANCHES || [];
  if(!branches.length){
    branches=await fetch('/api/branches').then(r=>r.json()).catch(()=>[]);
    window.BRANCHES=branches;
  }
  const ownBranches=branches.filter(b=>normalizeBranchType(b)==='own_branch' && b.is_active!==false);
  const options=ownBranches.map(b=>'<option value="'+b.id+'">'+b.name+'</option>').join('');
  const fromValue=fromSel.value;
  const toValue=toSel.value;
  fromSel.innerHTML=options;
  toSel.innerHTML=ownBranches.filter(b=>b.id!==1).map(b=>'<option value="'+b.id+'">'+b.name+'</option>').join('') || options;
  if([...fromSel.options].some(o=>o.value===fromValue)) fromSel.value=fromValue;
  if([...toSel.options].some(o=>o.value===toValue)) toSel.value=toValue;
  if(fromSel.value && fromSel.value===toSel.value){
    const diff=[...toSel.options].find(o=>o.value!==fromSel.value);
    if(diff) toSel.value=diff.value;
  }
  await loadTransferProducts();
  renderTransfers();
}

async function loadTransferProducts(){
  const fromSel=document.getElementById('tf-from');
  const productSel=document.getElementById('tf-product');
  if(!fromSel || !productSel || !fromSel.value) return;
  try{
    const rows=await apiGet('/api/inventory?branch_id='+encodeURIComponent(fromSel.value));
    const available=(rows||[]).filter(r=>parseInt(r.quantity||0)>0 && r.variant_id);
    productSel.innerHTML=available.length ? available.map(r=>{
      const detail=[r.color,r.size].filter(Boolean).join(' / ');
      const label=r.name+(detail?' - '+detail:'')+' ('+r.quantity+')';
      return '<option value="'+r.variant_id+'" data-stock="'+r.quantity+'">'+label+'</option>';
    }).join('') : '<option value="">Үлдэгдэлтэй бараа алга</option>';
  }catch(e){
    productSel.innerHTML='<option value="">Бараа татахад алдаа</option>';
  }
}

function renderTransfers(){
  const table=document.getElementById('transfer-table');
  if(table) table.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray)">Шилжүүлгийн түүх байхгүй</td></tr>';
}

async function createTransfer(){
  const from=document.getElementById('tf-from');
  const to=document.getElementById('tf-to');
  const product=document.getElementById('tf-product');
  const qty=parseInt(document.getElementById('tf-qty').value)||0;
  if(!from?.value || !to?.value){showToast('Салбар сонгоно уу','error');return;}
  if(from.value===to.value){showToast('Хаанаас, хаашаа салбар ижил байна','error');return;}
  if(!product?.value){showToast('Бараа сонгоно уу','error');return;}
  if(qty<=0){showToast('Тоо оруулна уу','error');return;}
  const stock=parseInt(product.selectedOptions[0]?.dataset?.stock||0);
  if(stock && qty>stock){showToast('Үлдэгдлээс их тоо шилжүүлэх боломжгүй','error');return;}
  try{
    await apiPost('/api/transfers', {
      from_branch_id:parseInt(from.value),
      to_branch_id:parseInt(to.value),
      note:'Admin transfer',
      items:[{variant_id:parseInt(product.value), quantity:qty}]
    });
    showToast('Шилжүүлэг амжилттай хадгалагдлаа','success');
    await loadTransferProducts();
    await loadInventory();
  }catch(e){showToast('Шилжүүлэг алдаа: '+e.message,'error');}
}


// ── TOAST ──
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.className='toast'+(type?' '+type:'');
  document.getElementById('toast-msg').textContent=msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2800);
}

// ── БАРАА УДИРДЛАГА ──
let uploadedImages = [];
let editingProductId = null;

let allManageProducts = [];
let productCategories = [];

async function loadProductCategories(selectedId){
  try{
    const data = await apiGet('/api/categories');
    productCategories = data;
    const catSel = document.getElementById('mp-cat');
    if(catSel){
      const current = selectedId || catSel.value;
      catSel.innerHTML = '<option value="">Бүлэг сонгох</option>' + data.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
      if(current) catSel.value = String(current);
    }
    const filterSel = document.getElementById('mp-cat-filter');
    if(filterSel){
      const currentFilter = filterSel.value;
      filterSel.innerHTML = '<option value="">Бүх ангилал</option>' + data.map(c=>'<option value="'+c.name+'">'+c.name+'</option>').join('');
      if(currentFilter) filterSel.value = currentFilter;
    }
  }catch(e){console.error('Ангилал татахад алдаа:', e);}
}

async function addProductCategory(selectNew=false){
  const name = prompt('Шинэ бүлэг / ангиллын нэр оруулна уу');
  if(!name || !name.trim()) return;
  try{
    const cat = await apiPost('/api/categories', {name:name.trim()});
    await loadProductCategories(cat.id);
    if(selectNew) document.getElementById('mp-cat').value = String(cat.id);
    showToast('Бүлэг нэмэгдлээ: '+cat.name,'success');
  }catch(e){showToast('Бүлэг нэмэхэд алдаа: '+e.message,'error');}
}

function filterManageProducts(query){
  const q = (query||'').toLowerCase();
  const cat = document.getElementById('mp-cat-filter')?.value||'';
  const status = document.getElementById('mp-status-filter')?.value||'';
  
  let filtered = allManageProducts.filter(p=>{
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    const matchCat = !cat || p.category_name===cat;
    const matchStatus = !status || 
      (status==='active' && p.is_active && parseInt(p.total_stock||0)>0) ||
      (status==='inactive' && !p.is_active) ||
      (status==='out' && parseInt(p.total_stock||0)===0);
    return matchQ && matchCat && matchStatus;
  });

  const countEl = document.getElementById('mp-count');
  if(countEl) countEl.textContent = filtered.length+' / '+allManageProducts.length+' бараа';

  document.getElementById('mp-table').innerHTML = filtered.length ? filtered.map(p=>`
    <tr>
      <td>
        ${p.images && p.images.length > 0
          ? `<img src="${p.images[0]}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--gray-light)">`
          : `<div style="width:48px;height:48px;background:var(--gray-light);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`
        }
      </td>
      <td><b>${p.name}</b></td>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${p.sku}</code></td>
      <td>${p.category_name||'—'}</td>
      <td>₮${parseInt(p.price||0).toLocaleString()}</td>
      <td style="font-weight:700;color:${parseInt(p.total_stock||0)===0?'var(--red)':parseInt(p.total_stock||0)<10?'var(--amber)':'var(--black)'}">${parseInt(p.total_stock||0)}</td>
      <td><span class="badge ${p.is_active?'badge-green':'badge-gray'}">${p.is_active?'Идэвхтэй':'Идэвхгүй'}</span></td>
      <td style="display:flex;gap:6px">
        <button onclick="openBarcodeForProduct(${p.id})" style="border:1px solid var(--gray-mid);background:#fff;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Баркод</button>
        <button onclick="editProduct(${p.id})" style="border:1px solid var(--gray-mid);background:none;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Засах</button>
        <button onclick="deleteProduct(${p.id},'${p.name}')" style="border:1px solid #fcc;background:#fff0ee;color:var(--red);padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Устгах</button>
      </td>
    </tr>`).join('')
  : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray)">Бараа олдсонгүй</td></tr>';
}

async function loadManageProducts(){
  try{
    const data = await apiGet('/api/products?limit=200');
    allManageProducts = data;
    const countEl = document.getElementById('mp-count');
    if(countEl) countEl.textContent = data.length + ' бараа';
    // Хайлтын утга байвал шүүнэ
    const searchVal = document.getElementById('mp-search')?.value||'';
    if(searchVal || document.getElementById('mp-cat-filter')?.value || document.getElementById('mp-status-filter')?.value){
      filterManageProducts(searchVal);
      return;
    }
    document.getElementById('mp-table').innerHTML = data.map(p => `
      <tr>
        <td>
          ${p.images && p.images.length > 0
            ? `<img src="${p.images[0]}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--gray-light)">`
            : `<div style="width:48px;height:48px;background:var(--gray-light);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>`
          }
        </td>
        <td><b>${p.name}</b></td>
        <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${p.sku}</code></td>
        <td>${p.category_name||'—'}</td>
        <td>₮${parseInt(p.price||0).toLocaleString()}</td>
        <td style="font-weight:700;color:${parseInt(p.total_stock||0)===0?'var(--red)':parseInt(p.total_stock||0)<10?'var(--amber)':'var(--black)'}">${parseInt(p.total_stock||0)}</td>
        <td><span class="badge ${p.is_active?'badge-green':'badge-gray'}">${p.is_active?'Идэвхтэй':'Идэвхгүй'}</span></td>
        <td style="display:flex;gap:6px">
          <button onclick="openBarcodeForProduct(${p.id})" style="border:1px solid var(--gray-mid);background:#fff;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Баркод</button>
          <button onclick="editProduct(${p.id})" style="border:1px solid var(--gray-mid);background:none;padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Засах</button>
          <button onclick="deleteProduct(${p.id},'${p.name}')" style="border:1px solid #fcc;background:#fff0ee;color:var(--red);padding:5px 12px;font-size:11px;cursor:pointer;border-radius:4px;font-family:var(--font-body)">Устгах</button>
        </td>
      </tr>`).join('');
  }catch(e){console.error('Бараа удирдлага:', e);}
}

function openAddProduct(){
  editingProductId = null;
  uploadedImages = [];
  document.getElementById('modal-product-title').textContent = 'Шинэ бараа нэмэх';
  document.getElementById('edit-product-id').value = '';
  document.getElementById('mp-name').value = '';
  document.getElementById('mp-sku').value = '';
  document.getElementById('mp-price').value = '';
  document.getElementById('mp-wholesale').value = '';
  document.getElementById('mp-discount').value = '';
  document.getElementById('mp-desc').value = '';
  document.getElementById('mp-colors').value = 'Хар, Цагаан';
  document.getElementById('mp-sizes').value = 'S, M, L, XL';
  document.getElementById('mp-preview').innerHTML = '';
  document.getElementById('variant-section').style.display = 'block';
  loadProductCategories();
  document.getElementById('modal-add-product').style.display = 'flex';
}

async function editProduct(id){
  try{
    const p = await apiGet('/api/products/' + id);
    editingProductId = id;
    uploadedImages = p.images || [];
    document.getElementById('modal-product-title').textContent = 'Бараа засах';
    document.getElementById('edit-product-id').value = id;
    document.getElementById('mp-name').value = p.name || '';
    document.getElementById('mp-sku').value = p.sku || '';
    document.getElementById('mp-price').value = p.price || '';
    document.getElementById('mp-wholesale').value = p.wholesale_price || '';
    document.getElementById('mp-discount').value = p.discount_price || '';
    document.getElementById('mp-desc').value = p.description || '';
    await loadProductCategories(p.category_id);
    document.getElementById('mp-cat').value = p.category_id || '';
    document.getElementById('mp-colors').value = [...new Set((p.variants||[]).map(v=>v.color).filter(Boolean))].join(', ');
    document.getElementById('mp-sizes').value = [...new Set((p.variants||[]).map(v=>v.size).filter(Boolean))].join(', ');
    document.getElementById('variant-section').style.display = 'block';
    document.getElementById('mp-colors').placeholder = 'Шинэ өнгө нэмэх: Хар, Цагаан...';
    document.getElementById('mp-sizes').placeholder = 'Шинэ размер нэмэх: S, M, L...';
    document.getElementById('variant-section-label').textContent = 'Шинэ variant нэмэх (байгаа variant-д нөлөөлөхгүй)';
    renderImagePreview();
    document.getElementById('modal-add-product').style.display = 'flex';
  }catch(e){showToast('Бараа мэдээлэл татахад алдаа','error');}
}

function closeAddProduct(){
  document.getElementById('modal-add-product').style.display = 'none';
  uploadedImages = [];
  editingProductId = null;
}

function handleImageUpload(input){
  const files = Array.from(input.files);
  if(uploadedImages.length + files.length > 5){
    showToast('Хамгийн ихдээ 5 зураг оруулна уу','error');
    return;
  }
  const maxSize = 800 * 1024; // 800KB
  let hasError = false;
  
  files.forEach(file => {
    if(file.size > maxSize){
      showToast(file.name + ' — 800KB-аас том байна. Жижигрүүлнэ үү.','error');
      hasError = true;
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      uploadedImages.push(e.target.result);
      renderImagePreview();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderImagePreview(){
  document.getElementById('mp-preview').innerHTML = uploadedImages.map((img, i) => `
    <div style="position:relative">
      <img src="${img}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--gray-light)">
      <button onclick="uploadedImages.splice(${i},1);renderImagePreview()" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--red);color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center">×</button>
      ${i===0?'<div style="font-size:9px;text-align:center;color:var(--gray);margin-top:2px">Үндсэн</div>':''}
    </div>`).join('');
}

async function saveProduct(){
  const name = document.getElementById('mp-name').value.trim();
  const sku = document.getElementById('mp-sku').value.trim();
  const price = parseInt(document.getElementById('mp-price').value) || 0;

  if(!name || !price){showToast('Нэр болон үнэ заавал оруулна уу','error');return;}

  const btn = document.getElementById('save-product-btn');
  btn.disabled = true; btn.textContent = 'Хадгалж байна...';

  try{
    if(editingProductId){
      // Засах
      await apiPost_put('/api/products/'+editingProductId, {
        name,
        price,
        wholesale_price: parseInt(document.getElementById('mp-wholesale').value)||null,
        discount_price: parseInt(document.getElementById('mp-discount').value)||null,
        description: document.getElementById('mp-desc').value,
        is_active: true
      });
      // Variant нэмэх
      const newColorsRaw = document.getElementById('mp-colors').value.split(',').map(c=>c.trim()).filter(Boolean);
      const newSizesRaw = document.getElementById('mp-sizes').value.split(',').map(s=>s.trim()).filter(Boolean);
      const newColors = newColorsRaw.length ? newColorsRaw : [];
      const newSizes = newSizesRaw.length ? newSizesRaw : [];
      if(newColors.length && newSizes.length){
        try{
          const vResult = await apiPost('/api/products/'+editingProductId+'/variants', {colors:newColors, sizes:newSizes});
          console.log('Variant нэмэгдлээ:', vResult.added);
        }catch(ve){console.error('Variant алдаа:', ve);}
      }
      // Зураг хадгалах
      if(uploadedImages.length > 0){
        await apiPost('/api/products/'+editingProductId+'/images', {images: uploadedImages});
      }
      showToast('Бараа амжилттай шинэчлэгдлээ','success');
    } else {
      // Шинэ бараа
      const colorsRaw = document.getElementById('mp-colors').value.split(',').map(c=>c.trim()).filter(Boolean);
      const sizesRaw = document.getElementById('mp-sizes').value.split(',').map(s=>s.trim()).filter(Boolean);
      // Хоосон бол default утга
      const colors = colorsRaw.length ? colorsRaw : ['Нэг өнгө'];
      const sizes = sizesRaw.length ? sizesRaw : ['Нэг хэмжээ'];
      const result = await apiPost('/api/products', {
        name, sku,
        category_id: parseInt(document.getElementById('mp-cat').value),
        price,
        wholesale_price: parseInt(document.getElementById('mp-wholesale').value)||null,
        discount_price: parseInt(document.getElementById('mp-discount').value)||null,
        description: document.getElementById('mp-desc').value,
        colors, sizes
      });
      // Зураг хадгалах
      if(uploadedImages.length > 0 && result.product){
        await apiPost('/api/products/'+result.product.id+'/images', {images: uploadedImages});
      }
      const barcodeCount = result.variants?.length || 0;
      showToast(name+' нэмэгдлээ · '+barcodeCount+' barcode автоматаар үүслээ','success');
    }
    closeAddProduct();
    await loadManageProducts();
  }catch(e){
    showToast('Алдаа: '+e.message,'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Хадгалах';
  }
}

async function apiPost_put(url, data){
  const res = await fetch(API+url, {
    method: 'PUT',
    headers: {'Content-Type':'application/json', ...(TOKEN?{Authorization:'Bearer '+TOKEN}:{})},
    body: JSON.stringify(data)
  });
  if(!res.ok) await handleApiError(res);
  return res.json();
}

async function deleteProduct(id, name){
  if(!confirm('"'+name+'" барааг идэвхгүй болгох уу?')) return;
  try{
    await fetch(API+'/api/products/'+id, {
      method: 'DELETE',
      headers: TOKEN?{Authorization:'Bearer '+TOKEN}:{}
    });
    showToast(name+' устгагдлаа','success');
    await loadManageProducts();
  }catch(e){showToast('Устгахад алдаа','error');}
}

// ── WAREHOUSE FUNCTIONS ──
let whProducts=[], whBranches=[], whSuppliers=[];
let whReceiveItems=[], whDistItems=[], whReturnItems=[];
let whTodayIn=0;

async function loadWarehouseData(){
  try{
    const [prods, branches, suppliers] = await Promise.all([
      apiGet('/api/products?limit=100'),
      fetch('/api/branches').then(r=>r.json()),
      apiGet('/api/suppliers')
    ]);
    // Variant татах
    const details = await Promise.all(
      prods.map(p=>apiGet('/api/products/'+p.id).catch(()=>({...p,variants:[]})))
    );
    whProducts = details.map(p=>({
      ...p,
      sku: p.sku,
      price: p.wholesale_price||p.price,
      totalStock: parseInt(p.total_stock||0),
      colors: [...new Set((p.variants||[]).map(v=>v.color).filter(Boolean))],
      sizes: [...new Set((p.variants||[]).map(v=>v.size).filter(Boolean))],
      variants: p.variants||[]
    }));
    whBranches = branches;
    whSuppliers = suppliers;

    // KPI
    const totalStock = prods.reduce((s,p)=>s+parseInt(p.total_stock||0),0);
    document.getElementById('wh-kpi-total').textContent = totalStock.toLocaleString();
    document.getElementById('wh-kpi-supplier').textContent = suppliers.length;
    const lowCount = prods.filter(p=>parseInt(p.total_stock||0)<5).length;
    document.getElementById('wh-kpi-low').textContent = lowCount;

    // Нийлүүлэгч dropdown
    const supSel = document.getElementById('wh-supplier');
    if(supSel) supSel.innerHTML = suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

    // Салбар dropdown
    const receiveBranchSel = document.getElementById('wh-receive-branch');
    if(receiveBranchSel) receiveBranchSel.innerHTML = branches.filter(b=>normalizeBranchType(b)==='own_branch' && b.is_active!==false).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    const branchSel = document.getElementById('wh-dist-branch');
    if(branchSel) branchSel.innerHTML = branches.filter(b=>b.id>1).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    const returnBranchSel = document.getElementById('wh-return-branch');
    if(returnBranchSel) returnBranchSel.innerHTML = branches.filter(b=>b.id>1).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');

    // Date
    const dateEl = document.getElementById('wh-date');
    if(dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  }catch(e){console.error('Warehouse data алдаа:',e);}
}

function whFindProduct(sku){
  return whProducts.find(p=>p.sku.toLowerCase()===sku.toLowerCase().trim());
}

// RECEIVE
function whHandleBarcode(e){
  if(e.key!=='Enter') return;
  const sku = e.target.value.trim();
  const p = whFindProduct(sku);
  if(!p){showToast('Бараа олдсонгүй: '+sku,'error');return;}
  const ex = whReceiveItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    whReceiveItems.push({id:p.id,sku:p.sku,name:p.name,qty:1,price:p.wholesale_price||p.price,variants:p.variants||[]});
  }
  e.target.value='';
  whRenderReceive();
  showToast(p.name+' нэмэгдлээ','success');
}

function whRenderReceive(){
  const tbody = document.getElementById('wh-receive-items');
  const empty = document.getElementById('wh-receive-empty');
  const summary = document.getElementById('wh-receive-summary');
  if(!whReceiveItems.length){empty.style.display='block';tbody.innerHTML='';summary.style.display='none';return;}
  empty.style.display='none'; summary.style.display='block';
  tbody.innerHTML = whReceiveItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td>
      <td colspan="2">
        <select style="border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;min-width:130px" 
          onchange="whReceiveItems[${i}].selectedVariantId=this.value">
          <option value="">-- Бүгд --</option>
          ${(()=>{const prod=whProducts.find(p=>p.sku===item.sku||p.id===item.id);return(prod?.variants||[]).map(v=>`<option value="${v.id}">${v.color||''}${v.size?' / '+v.size:''}</option>`).join('');})()}
        </select>
      </td>
      <td>
        <div style="display:flex;align-items:center;border:1px solid var(--gray-light);border-radius:5px;overflow:hidden;width:fit-content">
          <button onclick="whReceiveItems[${i}].qty=Math.max(1,whReceiveItems[${i}].qty-1);whRenderReceive()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">−</button>
          <span style="width:36px;text-align:center;font-size:13px;font-weight:600;border-left:1px solid var(--gray-light);border-right:1px solid var(--gray-light);line-height:28px">${item.qty}</span>
          <button onclick="whReceiveItems[${i}].qty++;whRenderReceive()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">+</button>
        </div>
      </td>
      <td><input type="number" value="${item.price}" style="width:90px;border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body)" onchange="whReceiveItems[${i}].price=parseInt(this.value)||0;whRenderReceive()"></td>
      <td><b>₮${(item.price*item.qty).toLocaleString()}</b></td>
      <td><button onclick="whReceiveItems.splice(${i},1);whRenderReceive()" style="border:none;background:none;cursor:pointer;color:#e74c3c;font-size:18px">×</button></td>
    </tr>`).join('');
  const qty = whReceiveItems.reduce((s,i)=>s+i.qty,0);
  const price = whReceiveItems.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('wh-r-qty').textContent = qty+' ширхэг';
  document.getElementById('wh-r-price').textContent = '₮'+price.toLocaleString();
}

async function whConfirmReceive(){
  if(!whReceiveItems.length){showToast('Бараа нэмнэ үү','error');return;}
  const supplier = document.getElementById('wh-supplier');
  const receiveBranch = document.getElementById('wh-receive-branch');
  const invoice = document.getElementById('wh-invoice').value||'—';
  const qty = whReceiveItems.reduce((s,i)=>s+i.qty,0);
  const price = whReceiveItems.reduce((s,i)=>s+i.price*i.qty,0);
  const now = new Date();
  const time = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');

  try{
    // Variant-уудыг олж API-д явуулах
    const allItems = [];
    for(const item of whReceiveItems){
      const prod = whProducts.find(p=>p.sku===item.sku||p.id===item.id);
      const variants = prod?.variants||item.variants||[];
      
      if(item.selectedVariantId){
        // Тодорхой variant сонгосон
        allItems.push({variant_id:parseInt(item.selectedVariantId), quantity:item.qty, price:item.price});
      } else if(variants.length>=1){
        // Variant сонгоогүй — бүх variant-д тэнцүү хуваана
        const perV = Math.floor(item.qty/variants.length);
        const rem = item.qty%variants.length;
        variants.forEach((v,idx)=>{
          const q = perV+(idx===0?rem:0);
          if(q>0) allItems.push({variant_id:v.id, quantity:q, price:item.price});
        });
      } else {
        showToast(item.name+' барааны variant олдсонгүй','error');
        return;
      }
    }

    if(!allItems.length){
      showToast('Бараа нэмнэ үү','error');
      return;
    }

    const result = await apiPost('/api/receive',{
      items: allItems,
      supplier_id: supplier?.value||null,
      invoice,
      note: 'Админ орлого'
    });

    whTodayIn += qty;
    document.getElementById('wh-kpi-in').textContent = whTodayIn;

    const tbody = document.getElementById('wh-receive-history');
    const row = document.createElement('tr');
    row.innerHTML = `<td>${time}</td><td>${supplier?.options[supplier.selectedIndex]?.text||'—'}</td><td>${invoice}</td><td>${whReceiveItems.map(i=>i.name+'×'+i.qty).join(', ')}</td><td>${qty}</td><td>₮${price.toLocaleString()}</td><td><span class="badge badge-green">Дууссан</span></td>`;
    tbody.prepend(row);

    whClearReceive();
    showToast('Орлого амжилттай бүртгэгдлээ — '+qty+' ширхэг','success');
  }catch(e){
    showToast('Орлого бүртгэхэд алдаа: '+e.message,'error');
    console.error('whConfirmReceive алдаа:', e);
  }
}

function whClearReceive(){whReceiveItems=[];whRenderReceive();}

// DISTRIBUTE
function whHandleDistBarcode(e){
  if(e.key!=='Enter') return;
  const sku = e.target.value.trim();
  const p = whFindProduct(sku);
  if(!p){showToast('Бараа олдсонгүй','error');return;}
  const ex = whDistItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    whDistItems.push({id:p.id,sku:p.sku,name:p.name,qty:1,stock:parseInt(p.total_stock||0)});
  }
  e.target.value='';whRenderDist();
  showToast(p.name+' нэмэгдлээ','success');
}

function whRenderDist(){
  const tbody = document.getElementById('wh-dist-items');
  const empty = document.getElementById('wh-dist-empty');
  if(!whDistItems.length){empty.style.display='block';tbody.innerHTML='';return;}
  empty.style.display='none';
  tbody.innerHTML = whDistItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td>
      <td>—</td><td>—</td>
      <td style="font-weight:700;color:${item.stock<=5?'var(--red)':'var(--green)'}">${item.stock}</td>
      <td>
        <div style="display:flex;align-items:center;border:1px solid var(--gray-light);border-radius:5px;overflow:hidden;width:fit-content">
          <button onclick="whDistItems[${i}].qty=Math.max(1,whDistItems[${i}].qty-1);whRenderDist()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">−</button>
          <span style="width:36px;text-align:center;font-size:13px;font-weight:600;border-left:1px solid var(--gray-light);border-right:1px solid var(--gray-light);line-height:28px">${item.qty}</span>
          <button onclick="whDistItems[${i}].qty++;whRenderDist()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">+</button>
        </div>
      </td>
      <td><button onclick="whDistItems.splice(${i},1);whRenderDist()" style="border:none;background:none;cursor:pointer;color:#e74c3c;font-size:18px">×</button></td>
    </tr>`).join('');
}

async function whConfirmDist(){
  if(!whDistItems.length){showToast('Бараа нэмнэ үү','error');return;}
  const branch = document.getElementById('wh-dist-branch');
  const branchName = branch.options[branch.selectedIndex].text;
  const note = document.getElementById('wh-dist-note').value||'—';
  const qty = whDistItems.reduce((s,i)=>s+i.qty,0);

  const tbody = document.getElementById('wh-dist-history');
  const row = document.createElement('tr');
  row.innerHTML = `<td>${new Date().toLocaleDateString('mn-MN')}</td><td>${branchName}</td><td>${whDistItems.map(i=>i.name).join(', ')}</td><td>${qty}</td><td>Админ</td><td><span class="badge badge-green">Дууссан</span></td>`;
  tbody.prepend(row);

  whClearDist();
  showToast('Хуваарилалт амжилттай — '+qty+' ширхэг '+branchName+' руу явлаа','success');
}
function whClearDist(){whDistItems=[];whRenderDist();}

// RETURN
function whHandleReturnBarcode(e){
  if(e.key!=='Enter') return;
  const sku = e.target.value.trim();
  const p = whFindProduct(sku);
  if(!p){showToast('Бараа олдсонгүй','error');return;}
  const ex = whReturnItems.find(i=>i.sku===p.sku);
  if(ex){ex.qty++;} else {
    const variant=(p.variants||[])[0];
    whReturnItems.push({sku:p.sku,name:p.name,variant_id:variant?.id,qty:1,condition:'good',resell:true});
  }
  e.target.value='';whRenderReturn();
  showToast(p.name+' нэмэгдлээ','success');
}

function whRenderReturn(){
  const tbody = document.getElementById('wh-return-items');
  const empty = document.getElementById('wh-return-empty');
  if(!whReturnItems.length){empty.style.display='block';tbody.innerHTML='';return;}
  empty.style.display='none';
  tbody.innerHTML = whReturnItems.map((item,i)=>`
    <tr>
      <td><code style="font-size:11px;background:var(--gray-light);padding:2px 8px;border-radius:4px">${item.sku}</code></td>
      <td><b>${item.name}</b></td>
      <td>
        <div style="display:flex;align-items:center;border:1px solid var(--gray-light);border-radius:5px;overflow:hidden;width:fit-content">
          <button onclick="whReturnItems[${i}].qty=Math.max(1,whReturnItems[${i}].qty-1);whRenderReturn()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">−</button>
          <span style="width:36px;text-align:center;font-size:13px;font-weight:600;border-left:1px solid var(--gray-light);border-right:1px solid var(--gray-light);line-height:28px">${item.qty}</span>
          <button onclick="whReturnItems[${i}].qty++;whRenderReturn()" style="width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:15px">+</button>
        </div>
      </td>
      <td>
        <select style="border:1px solid var(--gray-light);border-radius:4px;padding:4px 8px;font-size:12px;font-family:var(--font-body)" onchange="whReturnItems[${i}].condition=this.value">
          <option value="good">Сайн</option>
          <option value="used">Хэрэглэсэн</option>
          <option value="damaged">Гэмтсэн</option>
        </select>
      </td>
      <td>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
          <input type="checkbox" ${item.resell?'checked':''} onchange="whReturnItems[${i}].resell=this.checked" style="accent-color:var(--black)"> Тийм
        </label>
      </td>
      <td><button onclick="whReturnItems.splice(${i},1);whRenderReturn()" style="border:none;background:none;cursor:pointer;color:#e74c3c;font-size:18px">×</button></td>
    </tr>`).join('');
}

async function whConfirmReturn(){
  if(!whReturnItems.length){showToast('Бараа нэмнэ үү','error');return;}
  const reason = document.getElementById('wh-return-reason').value||'—';
  const qty = whReturnItems.reduce((s,i)=>s+i.qty,0);
  const type = document.getElementById('wh-return-type');
  const returnType = type.value;
  const sourceBranchId = returnType==='branch' ? parseInt(document.getElementById('wh-return-branch').value) : 1;
  const items = whReturnItems.map(i=>({
    variant_id:i.variant_id,
    quantity:i.qty,
    condition:i.condition||'good',
    resell:i.resell!==false,
    action:i.resell!==false?'restock':'damaged'
  })).filter(i=>i.variant_id&&i.quantity>0);
  if(!items.length){showToast('Буцаах барааны variant мэдээлэл алга байна','error');return;}
  try{
    await apiPost('/api/returns',{
      return_type:returnType,
      source_branch_id:sourceBranchId,
      reason,
      note:document.getElementById('wh-return-order').value||'',
      items
    });
  }catch(e){
    showToast('Буцаалт бүртгэхэд алдаа: '+e.message,'error');
    return;
  }

  const tbody = document.getElementById('wh-return-history');
  const row = document.createElement('tr');
  row.innerHTML = `<td>${new Date().toLocaleDateString('mn-MN')}</td><td>${type.options[type.selectedIndex].text}</td><td>${whReturnItems.map(i=>i.name).join(', ')}</td><td>${qty}</td><td>${reason}</td><td><span class="badge badge-green">Дууссан</span></td>`;
  tbody.prepend(row);

  whClearReturn();
  showToast('Буцаалт бүртгэгдлээ — '+qty+' ширхэг','success');
}
function whClearReturn(){whReturnItems=[];whRenderReturn();}

// ── БАРКОД ──
let bcProducts = [];
let selectedVariants = [];

async function openBarcodeForProduct(productId){
  showPanel('barcode', document.querySelector('.nav-item[onclick*="barcode"]'));
  await loadBarcodeProducts();
  const sel=document.getElementById('bc-product');
  if(sel) sel.value=String(productId);
  await loadBarcodeVariants();
  generateBarcodes();
}

async function loadBarcodeProducts(){
  try{
    const data = await apiGet('/api/products?limit=200');
    bcProducts = data;
    const sel = document.getElementById('bc-product');
    if(sel) sel.innerHTML = '<option value="">— Бараа сонгох —</option>' +
      data.map(p=>`<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
  }catch(e){}
}

async function loadBarcodeVariants(){
  const productId = document.getElementById('bc-product').value;
  if(!productId){document.getElementById('bc-variants').innerHTML='';return;}
  try{
    const data = await apiGet('/api/products/'+productId);
    const variants = data.variants||[];
    selectedVariants = variants.map(v=>({...v, selected:true, productName:data.name, productSku:data.sku, price:data.price}));

    document.getElementById('bc-variants').innerHTML = selectedVariants.length
      ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--gray);font-weight:500;width:100%;margin-bottom:4px">Variant сонгох:</div>`+
        selectedVariants.map((v,i)=>`
          <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--gray-light);border-radius:6px;cursor:pointer;font-size:12px;background:var(--white)">
            <input type="checkbox" checked onchange="selectedVariants[${i}].selected=this.checked" style="accent-color:var(--black)">
            ${v.color||'—'} / ${v.size||'—'}
            <code style="font-size:10px;background:var(--gray-light);padding:1px 6px;border-radius:3px;margin-left:4px">${v.barcode||'код үүсгэ'}</code>
          </label>`).join('')
      : '<div style="color:var(--gray);font-size:12px">Variant байхгүй байна</div>';
  }catch(e){}
}

function generateBarcodes(){
  const count = parseInt(document.getElementById('bc-count').value)||1;
  const size = document.getElementById('bc-size').value;
  const active = selectedVariants.filter(v=>v.selected);

  if(!active.length){showToast('Variant сонгоно уу','error');return;}
  if(active.some(v=>!v.barcode || !/^\d+$/.test(String(v.barcode)))){
    showToast('Эхлээд "Шинэ код" дарж тоон barcode үүсгэнэ үү','error');
    return;
  }

  const dims = {small:{w:120,h:60,fs:8},medium:{w:180,h:90,fs:10},large:{w:240,h:120,fs:12}};
  const d = dims[size];

  const area = document.getElementById('bc-preview-area');
  let html = '';

  active.forEach(v => {
    for(let i=0;i<count;i++){
      const barcode = String(v.barcode);
      html += `
        <div class="barcode-label" style="width:${d.w}px;height:${d.h}px;border:1px solid #ddd;border-radius:4px;padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;background:white;font-family:monospace">
          <div style="font-size:${d.fs}px;font-weight:700;letter-spacing:1px;text-align:center;font-family:'DM Sans',sans-serif;line-height:1.2">${v.productName||'—'}</div>
          <div style="font-size:${d.fs-1}px;color:#666;text-align:center;font-family:'DM Sans',sans-serif">${v.color||''} ${v.size?'/ '+v.size:''}</div>
          <svg id="svg-${v.id}-${i}" width="${d.w-16}" height="${d.h*0.4}"></svg>
          <div style="font-size:${d.fs}px;letter-spacing:2px;font-family:monospace">${barcode}</div>
          <div style="font-size:${d.fs+1}px;font-weight:700;font-family:'DM Sans',sans-serif">₮${parseInt(v.price||0).toLocaleString()}</div>
        </div>`;
    }
  });

  area.innerHTML = html;
  document.getElementById('bc-preview-count').textContent = active.length * count + ' баркод';

  // SVG баркод зурах
  active.forEach(v => {
    for(let i=0;i<count;i++){
      const svg = document.getElementById('svg-'+v.id+'-'+i);
      if(svg) drawBarcode(svg, String(v.barcode), d.w-16, d.h*0.4);
    }
  });

  showToast(active.length*count+' баркод үүслээ','success');
}

async function regenerateSelectedBarcodes(){
  const productId = document.getElementById('bc-product').value;
  const active = selectedVariants.filter(v=>v.selected);
  if(!productId){showToast('Бараа сонгоно уу','error');return;}
  if(!active.length){showToast('Variant сонгоно уу','error');return;}
  if(!confirm('Сонгосон variant-уудын barcode шинээр солигдоно. Үргэлжлүүлэх үү?')) return;

  try{
    const result = await apiPost('/api/barcodes/generate', {
      variant_ids: active.map(v=>v.id)
    });
    const updated = result.updated || [];
    selectedVariants = selectedVariants.map(v=>{
      const found = updated.find(u=>u.id===v.id);
      return found ? {...v, barcode:found.barcode} : v;
    });
    loadBarcodeVariants();
    showToast(updated.length+' шинэ barcode хадгалагдлаа','success');
  }catch(e){
    showToast('Barcode үүсгэхэд алдаа: '+e.message,'error');
  }
}

function drawBarcode(svg, code, width, height){
  // Энгийн баркод зурах (Code 128 хялбаршуулсан)
  const encoded = code.replace(/[^0-9A-Z]/g,'');
  const barWidth = width / (encoded.length * 8 + 20);
  let x = barWidth * 5;
  let bars = '';

  // Start bar
  bars += `<rect x="${x}" y="0" width="${barWidth*2}" height="${height*0.85}" fill="black"/>`;
  x += barWidth * 3;

  for(let c of encoded){
    const n = parseInt(c, 36);
    const pattern = [1,0,1,0,1,0,1,0].map((_,i)=>(n>>i)&1);
    for(let bit of pattern){
      if(bit) bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height*0.85}" fill="black"/>`;
      x += barWidth * 1.2;
    }
  }

  // End bar
  bars += `<rect x="${x}" y="0" width="${barWidth*2}" height="${height*0.85}" fill="black"/>`;
  svg.innerHTML = bars;
}

// ── INIT ──
// Token байвал шууд нэвтрэх
if(TOKEN){
  apiGet('/api/categories').then(()=>{
    document.getElementById('login-wrap').style.display='none';
    document.getElementById('admin-wrap').classList.add('show');
    document.getElementById('sb-user').textContent='Админ';
    initDate();loadAll();
  }).catch(()=>{TOKEN='';localStorage.removeItem('admin_token');});
}
