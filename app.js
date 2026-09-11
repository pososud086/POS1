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

// --- ส่วนของระบบตั้งค่า (Settings) ---

function openSettings() {
  document.getElementById('settings-modal').style.display = 'flex';
  
  // โหลดค่าหมวดหมู่ใส่ Dropdown สำหรับเมนู
  const catSelect = document.getElementById('set-menu-cat');
  catSelect.innerHTML = '<option value="">-- เลือกหมวดหมู่ --</option>';
  db.categories.forEach(c => {
    catSelect.innerHTML += `<option value="${c.CatID}">${c.CatName}</option>`;
  });

  // โหลดค่าเมนูใส่ Dropdown สำหรับ Add-on
  const menuSelect = document.getElementById('set-addon-menu');
  menuSelect.innerHTML = '<option value="ALL">-- ใช้กับทุกเมนู --</option>'; // ปรับปรุงให้ผูกกับทุกเมนูได้
  db.menus.forEach(m => {
    menuSelect.innerHTML += `<option value="${m.MenuID}">${m.MenuName}</option>`;
  });
  
  // โหลดตั้งค่าทั่วไป
  const logo = db.settings?.find(s => s.Key === "LogoURL")?.Value || "";
  const printer = db.settings?.find(s => s.Key === "PrinterType")?.Value || "Bluetooth";
  document.getElementById('set-logo').value = logo;
  document.getElementById('set-printer').value = printer;
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

// ฟังก์ชันกลางสำหรับส่งข้อมูลตั้งค่า
async function sendConfig(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: "saveConfig", payload: payload })
    });
    const result = await res.json();
    if(result.status === "success") {
      alert("บันทึกข้อมูลสำเร็จ!");
      // รีโหลดข้อมูลจากฐานข้อมูลใหม่หลังบันทึก
      const freshRes = await fetch(API_URL + "?action=getData");
      db = await freshRes.json();
      renderCategories(); // อัปเดตหน้าจอหลัก
    }
  } catch(e) {
    alert("เกิดข้อผิดพลาดในการบันทึก");
  }
}

// 1. บันทึกตั้งค่าทั่วไป
function saveGeneralSettings() {
  const logo = document.getElementById('set-logo').value;
  const printer = document.getElementById('set-printer').value;
  sendConfig({ type: "setting", key: "LogoURL", value: logo });
  setTimeout(() => sendConfig({ type: "setting", key: "PrinterType", value: printer }), 1000); // ดีเลย์เล็กน้อยเพื่อป้องกันทับกัน
}

// 2. บันทึกหมวดหมู่
function saveCategory() {
  const name = document.getElementById('set-cat-name').value;
  if(!name) return alert("กรุณาใส่ชื่อหมวดหมู่");
  sendConfig({ type: "category", name: name });
  document.getElementById('set-cat-name').value = ""; // ล้างค่า
}

// 3. บันทึกเมนู
function saveMenu() {
  const catId = document.getElementById('set-menu-cat').value;
  const name = document.getElementById('set-menu-name').value;
  const price = document.getElementById('set-menu-price').value;
  const isAcc = document.getElementById('set-menu-acc').checked;
  
  if(!catId || !name || !price) return alert("กรุณากรอกข้อมูลให้ครบ");
  sendConfig({ type: "menu", catId: catId, name: name, price: price, isAccumulate: isAcc });
  
  document.getElementById('set-menu-name').value = "";
  document.getElementById('set-menu-price').value = "";
}

// 4. บันทึกตัวเลือกเสริม
function saveAddon() {
  const menuId = document.getElementById('set-addon-menu').value;
  const name = document.getElementById('set-addon-name').value;
  const price = document.getElementById('set-addon-price').value || 0;
  const type = document.getElementById('set-addon-type').value;
  const isReq = document.getElementById('set-addon-req').checked;
  
  if(!menuId || !name) return alert("กรุณากรอกข้อมูลให้ครบ");
  sendConfig({ type: "addon", menuId: menuId, name: name, price: price, choiceType: type, isRequired: isReq });
  
  document.getElementById('set-addon-name').value = "";
  document.getElementById('set-addon-price').value = 0;
}

async function handlePrint(data) {

      try {

        const canvas = document.getElementById('receiptCanvas');

        

        // === แก้ไขที่ 1: ขยายความสูง Canvas เป็น 800 ป้องกันขอบล่างโดนตัด ===

        canvas.height = 800; 

        

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        ctx.fillStyle = 'white';

        ctx.fillRect(0, 0, canvas.width, canvas.height);

        

        ctx.fillStyle = 'black';

        ctx.textAlign = 'center';

        

        let y = 40;

        

        ctx.font = 'bold 24px sans-serif';

        ctx.fillText('สมัครสมาชิก LINE เติมมัทฉะ', 192, y);

        y += 30;



        const qrLine = new QRious({ value: 'https://lin.ee/qcDHIwx', size: 150 });

        ctx.drawImage(qrLine.canvas, 192 - 75, y, 150, 150);

        y += 180;



        ctx.font = '22px sans-serif';

        ctx.fillText('สแกน หรือ กรอกโค้ดเพื่อสะสมแต้ม', 192, y);

        y += 40;



        ctx.font = 'bold 28px sans-serif';

        ctx.fillText('จำนวน ' + data.cups + ' แก้ว', 192, y);

        y += 30;



        const qrCode = new QRious({ value: String(data.code), size: 200 });

        ctx.drawImage(qrCode.canvas, 192 - 100, y, 200, 200);

        y += 230; 

        

        ctx.font = 'bold 28px sans-serif';

        ctx.fillText(data.code || "ไม่พบโค้ด", 192, y);

        y += 35;

        

        ctx.font = '20px sans-serif';

        ctx.fillText('โค้ดสะสมแต้มมีอายุ 30 วัน', 192, y);

        y += 30; // เลื่อนลงมาพิมพ์บรรทัดต่อไป

        ctx.fillText('(หมดอายุ ' + data.expiryDate + ')', 192, y);

        

        // === แก้ไขที่ 2: เว้นบรรทัด และใส่เส้นประปิดท้าย ===

        y += 50; // ระยะเว้นห่างก่อนถึงเส้นประ

        ctx.fillText('------------------------------', 192, y);



        const printHeight = y + 20; // เผื่อขอบขาวด้านล่างภาพนิดหน่อย

        const escposData = convertCanvasToESCPOS(ctx, canvas.width, printHeight);

        

        const CHUNK_SIZE = 100;

        for (let i = 0; i < escposData.length; i += CHUNK_SIZE) {

          const chunk = escposData.slice(i, i + CHUNK_SIZE);

          await printCharacteristic.writeValue(chunk);

        }



      } catch (e) {

        alert("ปริ้นล้มเหลว: " + e.message);

      } finally {

        document.getElementById('loading').style.display = 'none';

      }

    }



    // ฟังก์ชันแปลงภาพเป็นคำสั่งเครื่องปริ้น

    function convertCanvasToESCPOS(ctx, width, height) {

      const imgData = ctx.getImageData(0, 0, width, height).data;

      const xL = (width / 8) % 256;

      const xH = Math.floor((width / 8) / 256);

      const yL = height % 256;

      const yH = Math.floor(height / 256);

      let bytes = [0x1B, 0x40, 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];

      

      for (let y = 0; y < height; y++) {

        for (let x = 0; x < width; x += 8) {

          let byte = 0;

          for (let b = 0; b < 8; b++) {

            if (x + b < width) {

              const i = ((y * width) + (x + b)) * 4;

              const brightness = (0.299 * imgData[i] + 0.587 * imgData[i+1] + 0.114 * imgData[i+2]);

              if (imgData[i+3] > 128 && brightness < 128) byte |= (1 << (7 - b));

            }

          }

          bytes.push(byte);

        }

      }

      

      // === แก้ไขที่ 3: ใช้คำสั่งขึ้นบรรทัดใหม่ (LF - 0x0A) 4 ครั้ง ซึ่งเครื่องพิมพ์ทุกรุ่นรองรับ 100% ===

      bytes.push(0x0A, 0x0A, 0x0A, 0x0A); 

      return new Uint8Array(bytes);

    }
// ฟังก์ชัน handlePrint(data) และ convertCanvasToESCPOS ที่คุณเตรียมไว้ ให้นำมาวางต่อตรงนี้ได้เลย
