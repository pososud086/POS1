
// State
let API_URL = localStorage.getItem('pos_api_url') || "";
let appData = { categories: [], menus: [], addons: [], config: {} };
let cart = [];
let currentMenuSelection = null;
let orderState = { phone: "", points: 0, rowIndex: null, usedFreeCup: false, accumulatingCups: 0 };
let currentTab = 'pos';
let transactions = [];

// Initialize
window.onload = () => {
    if(!API_URL) {
        alert("กรุณาตั้งค่า API URL ในเมนูตั้งค่าก่อนใช้งาน");
        openModal('settings-modal');
    } else {
        fetchData();
    }
};

// ================= API CALLS =================
async function fetchData() {
    try {
        const res = await fetch(API_URL + "?action=getData");
        const json = await res.json();
        if(json.success) {
            appData = json.data;
            transactions = json.transactions || [];
            
            // Default dummy data if empty
            if(appData.categories.length === 0) {
                appData = {
                    categories: [{id: 1, name: "ชาเขียว"}],
                    menus: [{id: 1, catId: 1, name: "มัทฉะลาเต้", price: 60, isAccumulate: true}],
                    addons: [{id: 1, menuId: 1, name: "เพิ่มไข่มุก", price: 10, type: "single"}],
                    config: { logo: "https://via.placeholder.com/100", printer: "bluetooth" }
                };
            }
            
            document.getElementById('set-json-data').value = JSON.stringify(appData, null, 2);
            document.getElementById('set-logo').value = appData.config.logo || "";
            document.getElementById('shop-logo').src = appData.config.logo || "https://via.placeholder.com/50";
            
            renderCategories();
            renderDashboard();
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

async function apiPost(payload) {
    const res = await fetch(API_URL, {
        method: "POST", body: JSON.stringify(payload)
    });
    return await res.json();
}

// ================= UI & CART =================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).style.display = 'flex';
    if(tabId === 'dashboard') renderDashboard();
}

function renderCategories() {
    const container = document.getElementById('category-list');
    container.innerHTML = "";
    appData.categories.forEach((c, idx) => {
        let btn = document.createElement('button');
        btn.className = `cat-btn ${idx === 0 ? 'active' : ''}`;
        btn.innerText = c.name;
        btn.onclick = (e) => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderMenus(c.id);
        };
        container.appendChild(btn);
    });
    if(appData.categories.length > 0) renderMenus(appData.categories[0].id);
}

function renderMenus(catId) {
    const container = document.getElementById('menu-grid');
    container.innerHTML = "";
    const menus = appData.menus.filter(m => m.catId === catId);
    menus.forEach(m => {
        let btn = document.createElement('div');
        btn.className = 'menu-btn';
        btn.innerHTML = `<h3>${m.name}</h3><span>${m.price}฿</span>`;
        btn.onclick = () => openAddonModal(m);
        container.appendChild(btn);
    });
}

function openAddonModal(menu) {
    const addons = appData.addons.filter(a => a.menuId === menu.id);
    if(addons.length === 0) {
        addToCart(menu, []);
        return;
    }
    currentMenuSelection = menu;
    document.getElementById('modal-menu-name').innerText = menu.name;
    const container = document.getElementById('addon-options');
    container.innerHTML = "";
    addons.forEach(a => {
        container.innerHTML += `
            <div style="margin: 10px 0; font-size: 1.2em;">
                <label>
                    <input type="${a.type==='single'?'radio':'checkbox'}" name="addon" value="${a.id}" data-price="${a.price}" data-name="${a.name}"> 
                    ${a.name} (+${a.price}฿)
                </label>
            </div>
        `;
    });
    openModal('addon-modal');
}

function addToCartFromModal() {
    const inputs = document.querySelectorAll('#addon-options input:checked');
    let selectedAddons = [];
    inputs.forEach(i => {
        selectedAddons.push({ name: i.dataset.name, price: Number(i.dataset.price) });
    });
    addToCart(currentMenuSelection, selectedAddons);
    closeModal('addon-modal');
}

function addToCart(menu, addons) {
    let addonPrice = addons.reduce((sum, a) => sum + a.price, 0);
    cart.push({
        id: Date.now(), menuId: menu.id, name: menu.name, price: menu.price + addonPrice, qty: 1, 
        addons: addons, isAccumulate: menu.isAccumulate, isFree: false
    });
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    container.innerHTML = "";
    let total = 0;
    cart.forEach((c, idx) => {
        let itemTotal = c.isFree ? 0 : (c.price * c.qty);
        total += itemTotal;
        let addonText = c.addons.map(a => a.name).join(', ');
        container.innerHTML += `
            <div class="cart-item">
                <div style="flex:1">
                    <h4 style="color:${c.isFree ? '#4CAF50' : 'white'}">${c.isFree ? '[ฟรี] ' : ''}${c.name}</h4>
                    <small style="color:#aaa">${addonText}</small>
                </div>
                <div style="font-size:1.2em; font-weight:bold; color:${c.isFree ? '#4CAF50' : 'white'}">${itemTotal}฿</div>
                <button class="btn-danger" style="padding: 5px 10px; margin-left: 10px;" onclick="removeFromCart(${idx})">X</button>
            </div>
        `;
    });
    document.getElementById('cart-total').innerText = total;
    syncCFD('update', total);
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    updateCartUI();
}

// ================= CHECKOUT FLOW =================
function proceedCheckout() {
    if(cart.length === 0) return alert("ไม่มีรายการในตะกร้า");
    
    // Reset state
    orderState = { phone: "", points: 0, rowIndex: null, usedFreeCup: false };
    
    let accumulateItems = cart.filter(c => c.isAccumulate && !c.isFree);
    let totalAccQty = accumulateItems.reduce((sum, c) => sum + c.qty, 0);
    orderState.accumulatingCups = totalAccQty;
    
    if(totalAccQty >= 11) {
        // Force 1 free cup immediately from this order
        showForceFreeSelectModal(accumulateItems);
    } else {
        openModal('free-cup-modal');
    }
}

function selectFreeCupChoice(choice) {
    closeModal('free-cup-modal');
    if(choice === 'yes') {
        document.getElementById('numpad-display').value = "";
        openModal('numpad-modal');
    } else {
        openModal('payment-modal');
    }
}

// Numpad logic
function numpad(val) {
    let disp = document.getElementById('numpad-display');
    if(val === 'clear') disp.value = "";
    else disp.value += val;
}

async function checkMemberPhone() {
    let phone = document.getElementById('numpad-display').value;
    if(phone.length < 9) return alert("เบอร์โทรศัพท์ไม่ถูกต้อง");
    
    try {
        const res = await apiPost({ action: "checkMember", phone: phone });
        if(res.found && res.points >= 10) {
            orderState.phone = phone;
            orderState.points = res.points;
            orderState.rowIndex = res.rowIndex;
            closeModal('numpad-modal');
            showForceFreeSelectModal(cart.filter(c => !c.isFree));
        } else {
            alert(res.found ? `แต้มไม่พอ (มี ${res.points} แต้ม)` : "ไม่พบเบอร์สมาชิกนี้ในระบบ");
        }
    } catch (e) { alert("Error API"); }
}

function showForceFreeSelectModal(availableItems) {
    const list = document.getElementById('free-item-list');
    list.innerHTML = "";
    availableItems.forEach((c, idx) => {
        let btn = document.createElement('button');
        btn.className = "btn-large btn-secondary";
        btn.style.marginBottom = "10px";
        btn.innerText = `[${c.price}฿] ${c.name}`;
        btn.onclick = () => {
            // Apply Free
            c.isFree = true;
            orderState.usedFreeCup = true;
            updateCartUI();
            closeModal('select-free-modal');
            openModal('payment-modal');
        };
        list.appendChild(btn);
    });
    openModal('select-free-modal');
}

function processPayment(method) {
    const total = document.getElementById('cart-total').innerText;
    closeModal('payment-modal');
    
    if(method === 'QR-CODE') {
        syncCFD('qr', total);
        openModal('confirm-qr-modal');
    } else {
        finalizeOrder('เงินสด');
    }
}

async function finalizeOrder(method) {
    closeModal('confirm-qr-modal');
    const total = document.getElementById('cart-total').innerText;
    
    // Calculate QR points (total accumulate items - 10 if used from current bill)
    let pointsForQR = 0;
    if(orderState.accumulatingCups >= 11) {
        let freeCups = Math.floor(orderState.accumulatingCups / 11);
        pointsForQR = orderState.accumulatingCups - (10 * freeCups);
    } else if (orderState.accumulatingCups > 0) {
        pointsForQR = orderState.accumulatingCups;
    }

    try {
        const payload = {
            action: "checkout",
            total: Number(total),
            payMethod: method,
            cart: cart,
            phone: orderState.phone,
            memberRowIndex: orderState.usedFreeCup && orderState.phone ? orderState.rowIndex : null,
            pointsForQR: pointsForQR
        };
        
        const res = await apiPost(payload);
        if(res.success) {
            syncCFD('clear', 0);
            document.getElementById('point-code-display').innerText = res.pointCode ? `โค้ดสะสมแต้ม: ${res.pointCode}` : "";
            
            // Print Customer Receipt (Auto)
            const printData = buildPrintData(payload, res.pointCode);
            await window.handlePrint(printData);
            
            openModal('print-modal');
        }
    } catch(e) { alert("Checkout Error"); }
}

function printStaffReceipt() {
    closeModal('print-modal');
    cart = [];
    updateCartUI();
    alert("จบออเดอร์");
}

// ================= CFD SYNC =================
function syncCFD(type, total) {
    let payload = { cart: cart, total: total, payment: type === 'qr' ? 'QR-CODE' : '' };
    localStorage.setItem('cfd_state', JSON.stringify(payload));
}

// ================= MODAL UTILS =================
function openModal(id) { 
    document.getElementById(id).style.display = 'flex'; 
    if(id === 'payment-modal') document.getElementById('pay-total-display').innerText = document.getElementById('cart-total').innerText + " บาท";
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openSettings() { document.getElementById('set-api').value = API_URL; openModal('settings-modal'); }

async function saveSettings() {
    let apiUrl = document.getElementById('set-api').value;
    localStorage.setItem('pos_api_url', apiUrl);
    API_URL = apiUrl;
    
    let jsonRaw = document.getElementById('set-json-data').value;
    try {
        let parsed = JSON.parse(jsonRaw);
        parsed.config.logo = document.getElementById('set-logo').value;
        parsed.config.printer = document.getElementById('set-printer').value;
        
        await fetch(API_URL, {
            method: "POST", body: JSON.stringify({ action: "saveSettings", data: parsed })
        });
        alert("บันทึกสำเร็จ");
        window.location.reload();
    } catch(e) { alert("JSON ไม่ถูกต้อง"); }
}

// ================= DASHBOARD & PDF =================
function renderDashboard() {
    let totalIn = 0, totalEx = 0;
    transactions.forEach(t => {
        if(t.type === 'Income') totalIn += Number(t.amount);
        else totalEx += Number(t.amount);
    });
    document.getElementById('stat-income').innerText = totalIn;
    document.getElementById('stat-expense').innerText = totalEx;
    document.getElementById('stat-profit').innerText = totalIn - totalEx;
    
    // Draw chart (mock logic)
    const ctx = document.getElementById('salesChart').getContext('2d');
    if(window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['รายรับ', 'รายจ่าย', 'กำไร'],
            datasets: [{ label: 'ยอดเงิน (บาท)', data: [totalIn, totalEx, totalIn-totalEx], backgroundColor: ['#4CAF50', '#F44336', '#2196F3'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Load Thai Font to avoid Base64 bloat
    try {
        const fontRes = await fetch('https://cdn.jsdelivr.net/npm/font-th-sarabun-new@1.0.0/fonts/THSarabunNew.ttf');
        const buffer = await fontRes.arrayBuffer();
        const fontBase64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        doc.addFileToVFS("THSarabun.ttf", fontBase64);
        doc.addFont("THSarabun.ttf", "THSarabun", "normal");
        doc.setFont("THSarabun");
    } catch(e) { console.warn("Failed to load Thai Font"); }
    
    doc.setFontSize(20);
    doc.text("รายงานยอดขายและภาษี", 14, 20);
    
    const filter = document.getElementById('pdf-filter').value;
    let filteredTx = transactions;
    if(filter !== 'all') {
        filteredTx = transactions.filter(t => t.method === filter && t.type === 'Income');
    }
    
    const tableData = filteredTx.map(t => [new Date(t.date).toLocaleString(), t.type, t.method, t.amount]);
    
    doc.autoTable({
        startY: 30,
        head: [['วันที่/เวลา', 'ประเภท', 'ช่องทาง', 'ยอดเงิน']],
        body: tableData,
        styles: { font: "THSarabun", fontSize: 14 }
    });
    doc.save("Report.pdf");
}

async function saveExpense() {
    const detail = document.getElementById('exp-detail').value;
    const amt = document.getElementById('exp-amount').value;
    if(!detail || !amt) return alert("กรุณากรอกข้อมูลให้ครบ");
    
    await apiPost({ action: "saveExpense", amount: amt, details: detail });
    alert("บันทึกรายจ่ายสำเร็จ");
    document.getElementById('exp-detail').value = "";
    document.getElementById('exp-amount').value = "";
    fetchData(); // reload
}

function buildPrintData(payload, pointCode) {
    let receiptText = "ร้านเติมมัทฉะ\n------------------------\n";
    payload.cart.forEach(c => {
        receiptText += `${c.qty}x ${c.name} - ${c.isFree ? 'ฟรี' : (c.price + '฿')}\n`;
    });
    receiptText += `------------------------\nยอดรวม: ${payload.total} บาท\n`;
    if(pointCode) receiptText += `\nรหัสสะสมแต้ม: ${pointCode}\n(หมดอายุ 30 วัน)\n`;
    return { raw: receiptText, html: receiptText.replace(/\n/g, "<br>") };
}

// [นำโค้ด async function handlePrint(data) วางต่อตรงนี้]
if (typeof window.handlePrint !== 'function') {
    window.handlePrint = async function(data) {
        console.log("Mock Print:", data.raw);
        // User should replace this with their Bluetooth print logic
    };
}
