// App Logic & State
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbz6TgwaRt4D8kT3swSGkJdXBY7SHExWbI6wcG90pPjxqGMgc4h6fPrgH69O8ofQHWI8/exec";

let state = {
  settings: {},
  categories: [],
  menus: [],
  addons: [],
  cart: [],
  selectedFreeCupOption: false,
  freeCupApplied: false,
  paymentMethod: null,
  rewardableCupsCount: 0,
  activePendingMenu: null
};

window.onload = async () => {
  await fetchInitialData();
  renderCategories();
  renderMenus();
};

// ==========================================
// 1. ระบบสลับหน้าจอ (View Navigation)
// ==========================================
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
  
  if (viewName === 'pos') {
    document.getElementById('view-pos').style.display = 'grid';
  } else if (viewName === 'expense') {
    document.getElementById('view-expense').style.display = 'block';
  } else if (viewName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'block';
    loadDashboardData();
  }
}

// ==========================================
// 2. ดึงข้อมูล & Render หน้าร้าน
// ==========================================
async function fetchInitialData() {
  try {
    const res = await fetch(`${GAS_API_URL}?action=getInitialData`);
    const json = await res.json();
    if (json.status === "success") {
      state.settings = json.data.settings || {};
      state.categories = json.data.categories || [];
      state.menus = json.data.menus || [];
      state.addons = json.data.addons || [];
      
      if (state.settings.logoUrl) {
        const logoImg = document.getElementById('store-logo');
        logoImg.src = state.settings.logoUrl;
        logoImg.style.display = 'block';
      }
    }
  } catch (e) {
    console.error("API Error", e);
  }
}

function renderCategories() {
  const catBar = document.getElementById('category-bar');
  catBar.innerHTML = `<button class="btn-touch btn-warning" onclick="renderMenus()">ทั้งหมด</button>`;
  state.categories.forEach(cat => {
    catBar.innerHTML += `<button class="btn-touch" style="background:#333;" onclick="filterMenus('${cat.id}')">${cat.name}</button>`;
  });
}

function renderMenus(catId = null) {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';
  const items = catId ? state.menus.filter(m => m.categoryId === catId) : state.menus;
  items.forEach(menu => {
    grid.innerHTML += `
      <div class="menu-card" onclick="openAddonModalForMenu('${menu.id}')">
        <strong>${menu.name}</strong>
        <p style="color:var(--accent-orange); margin-top:5px;">${menu.price} ฿</p>
      </div>
    `;
  });
}

// ==========================================
// 3. ระบบ Add-ons & ตะกร้าสินค้า
// ==========================================
function openAddonModalForMenu(menuId) {
  const menu = state.menus.find(m => m.id === menuId);
  state.activePendingMenu = menu;
  
  const menuAddons = state.addons.filter(a => a.menuId === menuId);
  if (menuAddons.length === 0) {
    addToCart(menu, []);
    return;
  }

  document.getElementById('addon-menu-title').innerText = `ตัวเลือก: ${menu.name}`;
  const container = document.getElementById('addon-list-container');
  container.innerHTML = '';
  
  menuAddons.forEach(a => {
    container.innerHTML += `
      <label style="display:block; padding:10px; background:#2a2a2a; margin-bottom:8px; border-radius:8px;">
        <input type="checkbox" class="addon-checkbox" value="${a.id}" data-price="${a.price}" data-name="${a.name}">
        ${a.name} (+${a.price} ฿)
      </label>
    `;
  });

  document.getElementById('modal-addons').style.display = 'flex';
}

function confirmAddonSelection() {
  const selectedAddons = [];
  document.querySelectorAll('.addon-checkbox:checked').forEach(cb => {
    selectedAddons.push({
      name: cb.getAttribute('data-name'),
      price: Number(cb.getAttribute('data-price'))
    });
  });

  addToCart(state.activePendingMenu, selectedAddons);
  closeAddonModal();
}

function closeAddonModal() {
  document.getElementById('modal-addons').style.display = 'none';
  state.activePendingMenu = null;
}

function addToCart(menu, selectedAddons) {
  const addonTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  state.cart.push({
    ...menu,
    selectedAddons,
    finalPrice: menu.price + addonTotal
  });
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cart-items');
  container.innerHTML = '';
  let total = 0;
  state.rewardableCupsCount = 0;

  state.cart.forEach((item) => {
    total += item.finalPrice;
    if (item.isRewardable) state.rewardableCupsCount++;
    
    let addonText = item.selectedAddons.map(a => a.name).join(', ');
    container.innerHTML += `
      <div style="border-bottom:1px solid #333; padding: 8px 0;">
        <div style="display:flex; justify-content:space-between;">
          <span>${item.name}</span>
          <span>${item.finalPrice} ฿</span>
        </div>
        ${addonText ? `<small style="color:#aaa;">+ ${addonText}</small>` : ''}
      </div>
    `;
  });

  document.getElementById('cart-total').innerText = total;

  localStorage.setItem('pos_cart_update', JSON.stringify({
    cart: state.cart,
    total: total,
    timestamp: Date.now()
  }));
}

// ==========================================
// 4. ระบบตั้งค่าร้านค้า (Settings Modal)
// ==========================================
function openSettingsModal() {
  document.getElementById('set-logo-url').value = state.settings.logoUrl || '';
  document.getElementById('set-printer-type').value = state.settings.printerType || 'Bluetooth';
  document.getElementById('modal-settings').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('modal-settings').style.display = 'none';
}

async function saveSettingsUI() {
  const payload = {
    action: 'saveSettings',
    data: {
      logoUrl: document.getElementById('set-logo-url').value,
      printerType: document.getElementById('set-printer-type').value,
      categories: state.categories,
      menus: state.menus,
      addons: state.addons
    }
  };

  const res = await fetch(GAS_API_URL, { method: 'POST', body: JSON.stringify(payload) });
  const json = await res.json();
  alert(json.message || 'บันทึกเรียบร้อย');
  closeSettingsModal();
}

// ==========================================
// 5. ระบบบันทึกรายจ่าย
// ==========================================
async function saveExpenseUI() {
  const title = document.getElementById('exp-title').value;
  const amount = document.getElementById('exp-amount').value;
  const category = document.getElementById('exp-category').value;
  const note = document.getElementById('exp-note').value;

  if (!title || !amount) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

  await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveExpense',
      data: { title, amount: Number(amount), category, note }
    })
  });

  alert('บันทึกรายจ่ายสำเร็จ');
  document.getElementById('exp-title').value = '';
  document.getElementById('exp-amount').value = '';
}

// ==========================================
// 6. แดชบอร์ด & รายงานภาษี PDF
// ==========================================
async function loadDashboardData() {
  const start = document.getElementById('dash-start').value;
  const end = document.getElementById('dash-end').value;

  const res = await fetch(`${GAS_API_URL}?action=getDashboardData&startDate=${start}&endDate=${end}`);
  const json = await res.json();
  
  if (json.status === 'success') {
    let salesTotal = json.data.sales.reduce((sum, s) => sum + Number(s.net || 0), 0);
    let expTotal = json.data.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    document.getElementById('dash-total-sales').innerText = `${salesTotal} ฿`;
    document.getElementById('dash-total-exp').innerText = `${expTotal} ฿`;
    document.getElementById('dash-net-profit').innerText = `${salesTotal - expTotal} ฿`;
  }
}

function exportPDFReport(typeFilter) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(`รายงานสรุปยอดขายสำหรับยื่นภาษี (${typeFilter})`, 14, 20);
  doc.setFontSize(12);
  doc.text(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, 14, 30);

  doc.autoTable({
    startY: 40,
    head: [['รายการ', 'ประเภทชำระเงิน', 'จำนวนเงิน (บาท)']],
    body: [
      ['ยอดขายรวม', typeFilter, document.getElementById('dash-total-sales').innerText]
    ]
  });

  doc.save(`Tax-Report-${typeFilter}-${Date.now()}.pdf`);
}

// ==========================================
// 7. ชำระเงิน Numpad & Checkout
// ==========================================
function openCheckoutModal() {
  if (state.cart.length === 0) return alert('กรุณาเลือกเมนูก่อน');
  document.getElementById('modal-checkout').style.display = 'flex';
  
  if (state.rewardableCupsCount >= 11) {
    alert('ยอดสั่งซื้อถึง 11 แก้ว ปรับสิทธิ์แถมฟรีให้อัตโนมัติ 1 แก้ว');
    state.freeCupApplied = true;
    selectFreeCupOption('use');
  }
}

function closeCheckoutModal() {
  document.getElementById('modal-checkout').style.display = 'none';
}

function selectFreeCupOption(option) {
  state.selectedFreeCupOption = true;
  if (option === 'use' && !state.freeCupApplied) {
    document.getElementById('modal-numpad').style.display = 'flex';
  } else {
    const paySec = document.getElementById('payment-section');
    paySec.style.opacity = '1';
    paySec.style.pointerEvents = 'auto';
  }
}

function pressNumpad(num) {
  document.getElementById('phone-input').value += num;
}
function clearNumpad() {
  document.getElementById('phone-input').value = '';
}

async function submitPhoneCheck() {
  const phone = document.getElementById('phone-input').value;
  if (!phone) return;

  const res = await fetch(`${GAS_API_URL}?action=checkMember&phone=${phone}`);
  const json = await res.json();
  
  if (json.data && json.data.cups >= 10) {
    alert(`พบเบอร์ ${phone} สะสม ${json.data.cups} แก้ว (ใช้สิทธิ์หัก 10 แก้ว)`);
    state.freeCupApplied = true;
    document.getElementById('modal-numpad').style.display = 'none';
    
    const paySec = document.getElementById('payment-section');
    paySec.style.opacity = '1';
    paySec.style.pointerEvents = 'auto';
  } else {
    alert('แก้วสะสมไม่เพียงพอ (ต้องมีอย่างน้อย 10 แก้ว)');
  }
}

function selectPaymentMethod(method) {
  state.paymentMethod = method;
  document.getElementById('btn-confirm-pay').style.display = 'inline-block';

  if (method === 'QR-CODE') {
    localStorage.setItem('pos_payment_qr', JSON.stringify({
      qrUrl: 'https://via.placeholder.com/300x300.png?text=PromptPay+QR',
      timestamp: Date.now()
    }));
  }
}

async function processPaymentAndPrint() {
  const randomChars = Math.random().toString(36).substring(2, 12);
  const earnedCups = Math.max(0, state.rewardableCupsCount - (state.freeCupApplied ? 10 : 0));
  const loyaltyCode = `${randomChars}${String(earnedCups).padStart(2, '0')}`;

  await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveLoyaltyCode',
      data: {
        code: loyaltyCode,
        phone: document.getElementById('phone-input').value || '',
        expireDate: new Date(Date.now() + 30*24*60*60*1000).toISOString()
      }
    })
  });

  await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveOrder',
      data: {
        orderId: 'ORD-' + Date.now(),
        itemsSummary: state.cart.map(i => i.name).join(', '),
        totalAmount: document.getElementById('cart-total').innerText,
        discount: state.freeCupApplied ? 50 : 0,
        netAmount: document.getElementById('cart-total').innerText,
        paymentMethod: state.paymentMethod,
        freeCupUsed: state.freeCupApplied
      }
    })
  });

  alert(`บันทึกสำเร็จ! โค้ดสะสมแต้มท้ายบิล: ${loyaltyCode}`);
  location.reload();
}
