const API_URL = "https://script.google.com/macros/s/AKfycbyTsblHupSi2rU2Ue4kXRRpaH-_EfncjOM2bLt41B3fKOnJOCjnyeinaGoSMo5h9VSsXQ/exec"; 
let cart = [];
let db = { categories: [], menus: [], addons: [] };
let accumulateCups = 0;
let discount = 0;

// โหลดข้อมูลตอนเปิดหน้าเว็บ
window.onload = async () => {
  const res = await fetch(API_URL + "?action=getData");
  db = await res.json();
  renderCategories();
};

function renderCategories() {
  const catDiv = document.getElementById('category-list');
  catDiv.innerHTML = '';
  db.categories.forEach(cat => {
    let btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.innerText = cat.CatName;
    btn.onclick = () => renderMenus(cat.CatID);
    catDiv.appendChild(btn);
  });
}

function renderMenus(catID) {
  const menuDiv = document.getElementById('menu-list');
  menuDiv.innerHTML = '';
  db.menus.filter(m => String(m.CatID) === String(catID)).forEach(m => {
    let btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.innerHTML = `${m.MenuName}<br><span style="color:#ff9800">${m.Price} ฿</span>`;
    btn.onclick = () => addToCart(m);
    menuDiv.appendChild(btn);
  });
}

function addToCart(menu) {
  // ระบบ Add-on สามารถต่อยอดเพิ่ม popup เลือก Topping ตรงนี้ได้
  cart.push({ id: menu.MenuID, name: menu.MenuName, price: menu.Price, isAccumulate: menu.IsAccumulate });
  updateCart();
}

function updateCart() {
  const cartDiv = document.getElementById('cart-items');
  cartDiv.innerHTML = '';
  let total = 0;
  accumulateCups = 0;

  cart.forEach((item, index) => {
    total += Number(item.price);
    if (String(item.isAccumulate).toUpperCase() === "TRUE") accumulateCups++;
    
    let div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `<span>${item.name}</span> <span>${item.price} ฿ <button onclick="cart.splice(${index},1); updateCart()" style="background:red; color:white; border:none; border-radius:4px; padding:5px;">X</button></span>`;
    cartDiv.appendChild(div);
  });

  const finalTotal = total - discount;
  document.getElementById('total-price').innerText = finalTotal;
  
  // ซิงค์จอฝั่งลูกค้า
  localStorage.setItem('pos_cart_sync', JSON.stringify({ items: cart, total: finalTotal, discount: discount }));
}

function checkoutStep1() {
  if (cart.length === 0) return alert('กรุณาเลือกเมนู');
  document.getElementById('checkout-modal').style.display = 'flex';
  document.getElementById('free-cup-section').style.display = 'block';
  document.getElementById('payment-section').style.display = 'none';

  // ตรรกะแถมอัตโนมัติ ถ้าสั่ง 11 แก้วขึ้นไป
  if (accumulateCups >= 11) {
    alert('ลูกค้าซื้อเกิน 11 แก้ว ได้รับสิทธิ์แถมฟรี 1 แก้วทันที!');
    applyFreeCupAuto();
    selectPayment();
  }
}

function applyFreeCupAuto() {
  // หาแก้วที่ราคาถูกที่สุดเพื่อเป็นส่วนลด
  let eligible = cart.filter(i => String(i.isAccumulate).toUpperCase() === "TRUE");
  if(eligible.length > 0) {
    eligible.sort((a,b) => a.price - b.price);
    discount = eligible[0].price;
    updateCart();
  }
}

async function promptMember() {
  const phone = prompt("กรุณากรอกเบอร์โทรสมาชิก:");
  if (!phone) return;
  
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: "checkMember", payload: phone })
  });
  const result = await res.json();
  
  if (result.status === "success") {
    alert(result.message);
    applyFreeCupAuto();
    selectPayment();
  } else {
    alert(result.message);
  }
}

function selectPayment() {
  document.getElementById('free-cup-section').style.display = 'none';
  document.getElementById('payment-section').style.display = 'block';
}

async function completeOrder(method) {
  let finalTotal = parseInt(document.getElementById('total-price').innerText);
  
  // คำนวณแต้มที่ได้ (หักแก้วฟรีและแต้มที่ใช้ไป)
  let earnedCups = accumulateCups;
  if (discount > 0) earnedCups = accumulateCups > 11 ? accumulateCups - 11 : 0; 
  
  // สร้าง Code หากมีแต้มสะสม
  let codeData = { code: "", expiryDate: "", cups: 0 };
  if (earnedCups > 0) {
    const resCode = await fetch(API_URL, {
      method: 'POST', body: JSON.stringify({ action: "generateCode", payload: earnedCups })
    });
    codeData = await resCode.json();
  }

  // บันทึกออเดอร์
  const orderData = { total: finalTotal, discount: discount, paymentMethod: method, items: cart };
  const resOrder = await fetch(API_URL, {
    method: 'POST', body: JSON.stringify({ action: "saveOrder", payload: orderData })
  });
  const orderResult = await resOrder.json();

  alert('บันทึกออเดอร์ ' + orderResult.orderId + ' สำเร็จ!');
  
  // ปริ้นใบเสร็จ (เรียกใช้ฟังก์ชัน handlePrint ที่คุณให้มา โดยโยน codeData เข้าไป)
  if (codeData.code) {
    await handlePrint(codeData); 
  }
  
  // รีเซ็ต
  cart = []; discount = 0; updateCart();
  document.getElementById('checkout-modal').style.display = 'none';
}

// ฟังก์ชัน handlePrint(data) และ convertCanvasToESCPOS ที่คุณเตรียมไว้ ให้นำมาวางต่อตรงนี้ได้เลย