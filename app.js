// Global State
let state = {
  settings: {},
  categories: [],
  menus: [],
  addons: [],
  cart: [],
  selectedFreeCupOption: false,
  freeCupApplied: false,
  paymentMethod: null,
  rewardableCupsCount: 0
};

// 1. ระบบสลับหน้าจอ (บังคับผูกกับ window)
window.switchView = function(viewName) {
  const views = ['pos', 'expense', 'dashboard'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = 'none';
  });

  if (viewName === 'pos') {
    const pos = document.getElementById('view-pos');
    if (pos) pos.style.display = 'grid';
  } else if (viewName === 'expense') {
    const exp = document.getElementById('view-expense');
    if (exp) exp.style.display = 'block';
  } else if (viewName === 'dashboard') {
    const dash = document.getElementById('view-dashboard');
    if (dash) dash.style.display = 'block';
    window.loadDashboardData();
  }
};

// 2. ระบบ Modal ตั้งค่าร้านค้า
window.openSettingsModal = function() {
  const modal = document.getElementById('modal-settings');
  if (modal) {
    document.getElementById('set-logo-url').value = state.settings.logoUrl || '';
    document.getElementById('set-printer-type').value = state.settings.printerType || 'Bluetooth';
    modal.style.display = 'flex';
  }
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.style.display = 'none';
};

window.saveSettingsUI = async function() {
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

  try {
    const res = await fetch(GAS_API_URL, { method: 'POST', body: JSON.stringify(payload) });
    const json = await res.json();
    alert(json.message || 'บันทึกตั้งค่าสำเร็จ');
    window.closeSettingsModal();
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ API');
  }
};

// 3. ระบบบันทึกรายจ่าย
window.saveExpenseUI = async function() {
  const title = document.getElementById('exp-title').value;
  const amount = document.getElementById('exp-amount').value;
  const category = document.getElementById('exp-category').value;
  const note = document.getElementById('exp-note').value;

  if (!title || !amount) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveExpense',
        data: { title, amount: Number(amount), category, note }
      })
    });
    alert('บันทึกรายจ่ายเรียบร้อยแล้ว');
    document.getElementById('exp-title').value = '';
    document.getElementById('exp-amount').value = '';
  } catch (err) {
    alert('ไม่สามารถบันทึกรายจ่ายได้');
  }
};

// 4. โหลดข้อมูลแดชบอร์ด & ออกรายงาน PDF
window.loadDashboardData = async function() {
  const start = document.getElementById('dash-start').value;
  const end = document.getElementById('dash-end').value;

  try {
    const res = await fetch(`${GAS_API_URL}?action=getDashboardData&startDate=${start}&endDate=${end}`);
    const json = await res.json();
    
    if (json.status === 'success') {
      let salesTotal = (json.data.sales || []).reduce((sum, s) => sum + Number(s.net || 0), 0);
      let expTotal = (json.data.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

      document.getElementById('dash-total-sales').innerText = `${salesTotal} ฿`;
      document.getElementById('dash-total-exp').innerText = `${expTotal} ฿`;
      document.getElementById('dash-net-profit').innerText = `${salesTotal - expTotal} ฿`;
    }
  } catch (e) {
    console.error("Dashboard Load Error", e);
  }
};

window.exportPDFReport = function(typeFilter) {
  if (!window.jspdf) return alert('ไม่พบไลบรารี jsPDF');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(`รายงานสรุปยอดขาย (${typeFilter})`, 14, 20);
  doc.text(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, 14, 30);

  doc.autoTable({
    startY: 40,
    head: [['รายการ', 'ประเภทชำระเงิน', 'จำนวนเงิน (บาท)']],
    body: [
      ['ยอดขายรวม', typeFilter, document.getElementById('dash-total-sales').innerText]
    ]
  });

  doc.save(`Tax-Report-${typeFilter}.pdf`);
};

// เริ่มต้นระบบเมื่อโหลดหน้าเว็บ
window.addEventListener('DOMContentLoaded', () => {
  console.log("POS System Loaded Successfully");
});
