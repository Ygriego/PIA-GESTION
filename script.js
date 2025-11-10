// Constantes de almacenamiento
const STORAGE_KEY = 'laShulaPOS_state';

// Estado global
let state = {
  inventario: [],
  recetas: [],
  mesas: {}, // Ahora las mesas son dinámicas
  mesaActual: null,
  mermas: [],
  ventas: [],
  shifts: [],
  currentShiftId: null,
  lastSale: null,
  logoUrl: '',
  // Nuevo: contador para la próxima mesa a agregar
  nextMesaId: 1
};

// Utilidades
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const toMoney = n => (Number(n)||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const nowISO = () => new Date().toISOString();
const fmtDateTime = d => new Date(d).toLocaleString('es-MX');
const norm = s => String(s||'').trim().toLowerCase();

// --- LOCAL STORAGE ---

function saveState() {
  const dataToSave = {
    inventario: state.inventario,
    recetas: state.recetas,
    mesas: state.mesas,
    mermas: state.mermas,
    ventas: state.ventas,
    shifts: state.shifts,
    logoUrl: state.logoUrl,
    nextMesaId: state.nextMesaId
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch(e) {
    console.error('Error al guardar en localStorage:', e);
  }
}

function loadState() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      const savedState = JSON.parse(json);
      // Fusionar el estado guardado con el estado inicial para mantener la estructura completa
      state = { ...state, ...savedState };
      if(!state.mesas) state.mesas = {};
      if(!state.nextMesaId || state.nextMesaId < 1) {
          const existingIds = Object.keys(state.mesas).map(Number).filter(id => id > 0);
          state.nextMesaId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
      }
    }
  } catch(e) {
    console.error('Error al cargar de localStorage:', e);
  }
}

// --- FUNCIONALIDAD DE MESAS DINÁMICAS Y ELIMINACIÓN ---

function initMesas() {
  // Si no hay mesas cargadas, inicializar con un valor por defecto (ej. 5 mesas)
  if (Object.keys(state.mesas).length === 0) {
      for(let i=1; i<=5; i++) {
        // Añadimos printedItems para tracking de comanda
        state.mesas[i] = { id: i, name: `Mesa ${i}`, items:[], notas:'', printedItems:[] };
      }
      state.nextMesaId = 6;
  }
}

function getMesaName(id) {
    const mesa = state.mesas[id];
    return mesa ? (mesa.name || `Mesa ${id}`) : `Mesa ${id}`;
}

function addMesa() {
    const newId = state.nextMesaId;
    const mesaPrompt = prompt(`Ingrese el nombre o número para la nueva Mesa:`, `Mesa ${newId}`);
    
    if (mesaPrompt === null || mesaPrompt.trim() === '') {
        alert('Se canceló la adición de la mesa.');
        return;
    }

    let finalId = newId;
    const customName = mesaPrompt.trim();

    // Comprobación simple de duplicados por nombre
    if (Object.values(state.mesas).some(m => norm(m.name) === norm(customName))) {
        alert(`Ya existe una mesa con el nombre "${customName}". Por favor, usa un nombre único.`);
        return;
    }

    state.mesas[finalId] = { 
        id: finalId,
        name: customName,
        items:[], 
        notas:'',
        printedItems: [] // Inicializar para comanda incremental
    };
    
    state.nextMesaId++;
    saveState();
    renderMesasGrid();
    alert(`Mesa "${customName}" agregada con ID: ${finalId}!`);
}

function deleteMesa(id) {
    if (String(id) === String(state.mesaActual)) {
        alert('No puedes eliminar la mesa que está activa.');
        return;
    }
    const mesa = state.mesas[id];
    if (mesa.items.length > 0) {
        alert('No puedes eliminar una mesa con productos en el carrito. Primero vacía el carrito.');
        return;
    }
    
    // Obtener el nombre antes de borrar
    const mesaName = getMesaName(id);

    if (confirm(`¿Estás seguro de eliminar la mesa "${mesaName}"? Esta acción es irreversible.`)) {
        delete state.mesas[id];
        
        // Si no quedan mesas, el estado actual debe ser null
        if (Object.keys(state.mesas).length === 0) {
            state.mesaActual = null;
        } 
        
        saveState();
        renderMesasGrid();
        renderCart();
    }
}


function renderMesasGrid(){
    const grid = $('#mesasGrid');
    const mesaActualEl = $('#mesaActual');
    grid.innerHTML = '';
    
    const mesaIds = Object.keys(state.mesas);
    mesaIds.sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        } else {
            return String(a).localeCompare(String(b));
        }
    });

    if (state.mesaActual !== null && state.mesas[state.mesaActual]) {
        mesaActualEl.textContent = getMesaName(state.mesaActual);
    } else {
        state.mesaActual = null; // Limpiar si la mesa activa fue eliminada
        mesaActualEl.textContent = 'Ninguna';
    }

    mesaIds.forEach(id => {
        const mesa = state.mesas[id];
        const cant = mesa.items.reduce((s,it)=>s+it.qty,0);
        const isSelected = String(state.mesaActual) === String(id);
        const isEmpty = cant === 0;
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mesa-btn';
        if(cant > 0) btn.classList.add('ocupada');
        if(isSelected) btn.classList.add('activa');
        
        const name = getMesaName(id);
        
        btn.innerHTML = `
            <div class="mesa-num">${name}</div>
            <div class="mesa-status">${cant > 0 ? cant+' item'+(cant>1?'s':'') : 'Libre'}</div>
            ${cant > 0 ? `<div class="mesa-badge">${cant}</div>` : ''}
            ${isEmpty && !isSelected ? `<button type="button" class="mesa-delete-btn" data-mesa-id="${id}">❌</button>` : ''}
        `;
        
        // Manejador de clic para seleccionar mesa
        btn.onclick = (e) => {
            // Si se hizo clic en el botón de eliminar, no seleccionar la mesa
            if(e.target.classList.contains('mesa-delete-btn')) return;
            seleccionarMesa(id);
        };
        
        // Manejador de clic para el botón de eliminar (si existe)
        const deleteBtn = btn.querySelector('.mesa-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita que se active el onclick del botón principal (seleccionar mesa)
                deleteMesa(id);
            });
        }
        
        grid.appendChild(btn);
    });
}

function seleccionarMesa(id){
    // Guardar el carrito y notas de la mesa activa antes de cambiar
    if(state.mesaActual !== null && state.mesas[state.mesaActual]) {
        state.mesas[state.mesaActual].notas = $('#orderNotas')?.value || '';
        saveState();
    }

    // Establecer la nueva mesa
    state.mesaActual = id; 
    
    const mesa = state.mesas[id];
    // Asegurar que el tracking de items impresos exista
    if (!mesa.printedItems) mesa.printedItems = [];
    
    // Cargar los datos de la nueva mesa
    const notas = mesa?.notas || '';
    $('#orderNotas').value = notas;

    renderCart();
    renderMesasGrid();
    updateChangeUI();
    // Guardar el nuevo estado de mesaActual
    saveState(); 
}

function getCurrentCart(){
    return state.mesaActual !== null && state.mesas[state.mesaActual] ? state.mesas[state.mesaActual].items : [];
}

// TABS
function bindTabs(){
  $$('.tab').forEach(btn => {
    btn.onclick = function() {
      const id = this.getAttribute('data-tab');
      if(!id) return;
      
      $$('.tab').forEach(b => b.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      
      this.classList.add('active');
      const panel = document.getElementById(id);
      if(panel) panel.classList.add('active');
      
      window.scrollTo({top:0, behavior:'smooth'});
    };
  });
}

// MENÚ
function renderMenu(){
  const list = $('#menuList');
  const q = norm($('#searchMenu')?.value||'');
  list.innerHTML='';
  const filtered = state.recetas.filter(r => norm(r.dish).includes(q));
  if(!filtered.length){ 
    list.innerHTML='<p class="empty">Aún no hay platillos. Ve a <b>Recetarios</b>.</p>'; 
    return; 
  }
  filtered.forEach(r => {
    const el=document.createElement('article'); 
    el.className='card';
    el.innerHTML=`
      <div class="card-body">
        <h3 class="card-title">${r.dish}</h3>
        <p class="card-sub">${toMoney(r.price)}</p>
      </div>
      <div class="card-actions">
        <label class="qty-wrap">Cant.
          <input type="number" min="1" value="1" class="card-qty"/>
        </label>
        <button type="button" class="btn primary add-btn">Agregar</button>
      </div>`;
    list.appendChild(el);
  });
}

// CARRITO
function renderCart(){
    const cart = getCurrentCart();
    const list = $('#cartItems');
    list.innerHTML = '';

    if(!state.mesaActual){
        list.innerHTML = '<p class="empty">Selecciona una mesa para empezar un pedido.</p>';
    } else if (cart.length === 0) {
        list.innerHTML = `<p class="empty">Mesa ${getMesaName(state.mesaActual)} vacía. Agrega productos del menú.</p>`;
    } else {
        cart.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'cart-row';
            row.innerHTML = `
                <span class="cart-title">${item.dish}</span>
                <label class="qty-wrap">Cant.
                    <input type="number" min="1" value="${item.qty}" data-index="${index}" class="input cart-qty-input"/>
                </label>
                <strong>${toMoney(item.unitPrice * item.qty)}</strong>
                <button type="button" class="btn danger remove-item" data-index="${index}">🗑️</button>
            `;
            list.appendChild(row);
        });
    }

    const subtotal = calcCartSubtotal();
    const tipAmount = calcTip(subtotal);
    const totalWithTip = subtotal + tipAmount;

    $('#subtotal').textContent = toMoney(subtotal);
    $('#tipAmount').textContent = toMoney(tipAmount);
    $('#tipAmountOut').textContent = toMoney(tipAmount);
    $('#totalWithTip').textContent = toMoney(totalWithTip);

    updateChangeUI();
}

function calcCartSubtotal(){
    const cart = getCurrentCart();
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
}

function calcTip(subtotal){
    const mode = $('#tipMode')?.value;
    const value = parseFloat($('#tipValue')?.value || '0');
    if (mode === 'percent' && value > 0) {
        return subtotal * (value / 100);
    }
    if (mode === 'fixed' && value > 0) {
        return value;
    }
    return 0;
}

function addToCart(dishName, qty){
    if(!state.mesaActual){ 
        alert('Por favor, selecciona una mesa primero'); 
        return; 
    }
    const key = norm(dishName);
    const receta = state.recetas.find(r => norm(r.dish) === key);
    if(!receta){ 
        alert('Platillo no encontrado en Recetarios.'); 
        return; 
    }
    const cart = getCurrentCart();
    const exist = cart.find(c=>norm(c.dish)===key);
    if(exist){
        exist.qty += qty;
    } else {
        cart.push({dish:receta.dish, unitPrice:receta.price, qty});
    }
    saveState();
    renderCart();
    renderMesasGrid();
}

function bindVentas(){
    const menuList = $('#menuList');
    if(menuList){
      menuList.onclick = function(e){
        const btn = e.target.closest('.add-btn');
        if(!btn) return;
        const card = btn.closest('.card');
        const dish = card.querySelector('.card-title').textContent;
        const qtyInput = card.querySelector('.card-qty');
        const qty = Math.max(1, Number(qtyInput.value)||1);
        addToCart(dish, qty);
      };
    }

    const vaciar = $('#vaciarCarrito');
    if(vaciar){
      vaciar.onclick = function(){
        if(!state.mesaActual) return;
        if(confirm('¿Vaciar carrito de Mesa '+getMesaName(state.mesaActual)+'?')){
          state.mesas[state.mesaActual].items = [];
          state.mesas[state.mesaActual].notas = ''; // Limpiar notas al vaciar
          state.mesas[state.mesaActual].printedItems = []; // Limpiar items impresos
          saveState();
          renderCart();
          renderMesasGrid();
        }
      };
    }

    const cartItems = $('#cartItems');
    if(cartItems) {
      cartItems.onclick = function(e) {
        const btn = e.target.closest('.remove-item');
        if(!btn) return;
        const index = Number(btn.getAttribute('data-index'));
        const cart = getCurrentCart();
        cart.splice(index, 1);
        saveState();
        renderCart();
        renderMesasGrid();
      };
      cartItems.onchange = function(e) {
        const input = e.target.closest('.cart-qty-input');
        if(!input) return;
        const index = Number(input.getAttribute('data-index'));
        const newQty = Math.max(1, Number(input.value)||1);
        const cart = getCurrentCart();
        cart[index].qty = newQty;
        saveState();
        renderCart();
      };
    }
    
    const search = $('#searchMenu');
    if(search) search.oninput = renderMenu;

    const addMesaBtn = $('#addMesaBtn');
    if(addMesaBtn) addMesaBtn.onclick = addMesa; 
    
    // --- BOTONES DE IMPRESIÓN ---
    const btnTicketConsumo = $('#btnTicketConsumo'); 
    if(btnTicketConsumo) btnTicketConsumo.onclick = () => printCurrentOrder('consumo'); 
    const btnComanda = $('#btnComanda'); 
    if(btnComanda) btnComanda.onclick = () => printCurrentOrder('comanda'); 
    // ----------------------------

    const cobrar = $('#cobrar'); 
    if(cobrar) cobrar.onclick = cobrarVenta;
    
    const orderNotas = $('#orderNotas');
    if(orderNotas) orderNotas.onchange = function() {
        if(state.mesaActual) {
            state.mesas[state.mesaActual].notas = orderNotas.value;
            saveState();
        }
    };
}

// PAGO Y CAMBIO
function updateChangeUI(){
    const sub = calcCartSubtotal();
    const totalWithTip = sub + calcTip(sub);
    const payEl = $('#payAmount');
    const out = $('#changeDue');
    if(!payEl || !out) return;
    const paid = parseFloat(payEl.value||'0');
    const change = Math.max(0, paid - totalWithTip);
    out.textContent = toMoney(change);
    
    const cobrarBtn = $('#cobrar');
    if(cobrarBtn) cobrarBtn.disabled = paid < totalWithTip;
}

function bindPaymentBox(){
    const tipMode = $('#tipMode');
    const tipValue = $('#tipValue');
    const payAmount = $('#payAmount');
    const montoExacto = $('#btnMontoExacto');

    [tipMode, tipValue].forEach(el => el.onchange = () => { renderCart(); saveState(); });
    if(tipValue) tipValue.oninput = () => { renderCart(); saveState(); };
    if(payAmount) payAmount.oninput = updateChangeUI;
    
    if(montoExacto) montoExacto.onclick = function(){
        const total = parseFloat($('#totalWithTip').textContent.replace(/[$,]/g, '')); // Quitar $ y comas
        $('#payAmount').value = total.toFixed(2);
        updateChangeUI();
    };
    
    const orderType = $('#orderType');
    if(orderType) orderType.onchange = () => saveState(); 
}

function getTipConfig(){
    return {
        mode: $('#tipMode')?.value,
        val: parseFloat($('#tipValue')?.value || '0')
    };
}

/**
 * Verifica si hay suficiente inventario para los items en el carrito.
 * @returns {object|null} Un objeto con {ing: {required:x, stock:y}} si hay faltantes, o null si todo está bien.
 */
function checkInventory(){
    const cart = getCurrentCart();
    const requiredStock = {};
    const missing = {};
    
    // 1. Calcular el stock total requerido para la venta
    for(const item of cart){
        const receta = state.recetas.find(r=>norm(r.dish)===norm(item.dish));
        if(!receta) continue;
        
        for(const ing of receta.ingredients){
            if(!ing.ingredient) continue;
            const inv = getInv(ing.ingredient);
            if(!inv) continue;
            
            const req = Number(ing.qty||0) * Number(item.qty||0);
            
            if(!requiredStock[inv.ingredient]){
                requiredStock[inv.ingredient] = { required: 0, stock: Number(inv.stock||0), unit: inv.unit };
            }
            requiredStock[inv.ingredient].required += req;
        }
    }
    
    // 2. Comparar el stock requerido con el stock actual
    for(const ingName in requiredStock){
        const { required, stock, unit } = requiredStock[ingName];
        if(required > stock){
            missing[ingName] = { required, stock, unit };
        }
    }
    
    return Object.keys(missing).length > 0 ? missing : null;
}

function cobrarVenta(){
    if(!state.mesaActual){
        alert('Selecciona una mesa para cobrar.');
        return;
    }
    const cart = getCurrentCart();
    if(cart.length === 0){
        alert('El carrito está vacío.');
        return;
    }

    const subtotal = calcCartSubtotal();
    const tipAmount = calcTip(subtotal);
    const totalWithTip = subtotal + tipAmount;

    const payEl = $('#payAmount');
    const paid = payEl ? parseFloat(payEl.value||'0') : 0;
    if(paid < totalWithTip){
        alert('El monto pagado es menor al total');
        return;
    }
    
    // VALIDACIÓN DE STOCK
    const missingStock = checkInventory();
    if(missingStock){
        let alertMsg = '⚠️ Venta bloqueada por INVENTARIO INSUFICIENTE ⚠️\n\nFaltan los siguientes ingredientes para completar el pedido:\n';
        for(const ingName in missingStock){
            const { required, stock, unit } = missingStock[ingName];
            const needed = required - stock;
            alertMsg += `\n- ${ingName}: Faltan ${needed.toFixed(2)} ${unit} (se requieren ${required.toFixed(2)}, hay ${stock.toFixed(2)})`;
        }
        alert(alertMsg);
        return; // Detener la venta
    }
    
    // Descontar inventario
    const lowAfter = new Set();
    for(const item of cart){
        const receta = state.recetas.find(r=>norm(r.dish)===norm(item.dish));
        if(!receta) continue;
        for(const ing of receta.ingredients){
            if(!ing.ingredient) continue;
            const inv = getInv(ing.ingredient);
            if(!inv) continue;
            const req = Number(ing.qty||0) * Number(item.qty||0);
            inv.stock = Math.max(0, Number(inv.stock||0)-req);
            if(Number(inv.stock||0) <= Number(inv.min||0)){
                lowAfter.add(inv.ingredient);
            }
        }
    }

    const tipCfg = getTipConfig();
    const orderType = $('#orderType')?.value || '';
    const notas = $('#orderNotas')?.value || '';
    // --- NUEVO: Capturar método de pago ---
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo'; 
    // -------------------------------------
    
    const sale = {
        id: 'S'+Date.now(),
        date: nowISO(),
        mesa: state.mesaActual, // Usar el ID de mesa
        mesaName: getMesaName(state.mesaActual),
        notas: notas,
        items: cart.map(c=>({dish:c.dish, qty:Number(c.qty), unitPrice:Number(c.unitPrice)})),
        subtotal,
        tipMode: tipCfg.mode,
        tipValue: tipCfg.val,
        tipAmount: +tipAmount.toFixed(2),
        total: subtotal,
        totalWithTip: +totalWithTip.toFixed(2),
        paid,
        change: +(paid - totalWithTip).toFixed(2),
        orderType,
        paymentMethod: paymentMethod, // NUEVO: Añadir método de pago
        shiftId: state.currentShiftId
    };

    state.ventas.unshift(sale);
    state.lastSale = sale; // Guardar la última venta

    // Limpiar mesa
    state.mesas[state.mesaActual].items = [];
    state.mesas[state.mesaActual].notas = '';
    state.mesas[state.mesaActual].printedItems = []; // Limpiar items impresos después de la venta
    
    saveState();

    renderCart();
    renderMesasGrid();
    renderInventario(lowAfter);
    renderReporte();

    _print('venta', sale); // Imprimir el ticket de venta

    payEl.value = '';
    $('#changeDue').textContent = toMoney(0);
    $('#orderNotas').value = '';

    alert(`¡Venta de ${toMoney(sale.totalWithTip)} registrada! Cambio: ${toMoney(sale.change)} (${sale.paymentMethod})`);
}

// --- LÓGICA DE IMPRESIÓN CORREGIDA E INCREMENTAL ---

/**
 * Prepara los datos del carrito actual para imprimir un ticket o comanda.
 * Esto se usa ANTES de la venta.
 * @param {string} type 'consumo' o 'comanda'
 */
function printCurrentOrder(type){
    if(!state.mesaActual){
        alert('Selecciona una mesa primero.');
        return;
    }
    
    const mesaId = state.mesaActual;
    const mesa = state.mesas[mesaId];
    if (!mesa.printedItems) mesa.printedItems = []; // Asegurar el tracking
    
    const currentCart = mesa.items;
    
    if (currentCart.length === 0) {
        alert('El carrito está vacío. Agrega productos.');
        return;
    }

    let itemsToPrint = currentCart;
    let itemsForComandaUpdate = []; // Solo para el caso 'comanda'

    if(type === 'comanda'){
        // 1. Calcular los items nuevos/actualizados
        itemsToPrint = [];
        currentCart.forEach(currentItem => {
            const printed = mesa.printedItems.find(p => norm(p.dish) === norm(currentItem.dish));
            const printedQty = printed ? printed.qty : 0;
            const newQty = currentItem.qty - printedQty;
            
            if(newQty > 0){
                // Solo imprimir la cantidad nueva
                itemsToPrint.push({ 
                    dish: currentItem.dish, 
                    unitPrice: currentItem.unitPrice, 
                    qty: newQty 
                });
                // Guardar para actualizar el estado después de imprimir
                itemsForComandaUpdate.push({ 
                    dish: currentItem.dish, 
                    qty: newQty 
                });
            }
        });

        if(itemsToPrint.length === 0) {
            alert('No hay productos nuevos para enviar a cocina.');
            return;
        }
    }
    
    // Totales del carrito completo (se usan en 'consumo')
    const wholeCartSubtotal = calcCartSubtotal();
    const tipAmount = calcTip(wholeCartSubtotal);
    const totalWithTip = wholeCartSubtotal + tipAmount;

    // Construir un objeto de venta temporal
    const tempSale = {
        id: (type === 'comanda' ? 'COM' : 'PRE')+'-'+Date.now(),
        date: nowISO(),
        mesa: mesaId, 
        mesaName: getMesaName(mesaId),
        notas: $('#orderNotas')?.value || '',
        // Los items a imprimir son los calculados (solo nuevos para comanda, todos para consumo)
        items: itemsToPrint.map(c=>({dish:c.dish, qty:Number(c.qty), unitPrice:Number(c.unitPrice)})),
        
        // Para comanda, los totales no tienen sentido, se usan los totales del carrito completo para Consumo.
        subtotal: wholeCartSubtotal, 
        tipAmount: +tipAmount.toFixed(2),
        totalWithTip: +totalWithTip.toFixed(2),
        paid: 0,
        change: 0,
        orderType: $('#orderType')?.value || 'Para comer aquí',
        paymentMethod: document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Efectivo', // Incluir para fines de impresión de consumo si fuera necesario
        shiftId: state.currentShiftId
    };

    _print(type, tempSale);
    
    if(type === 'comanda' && itemsForComandaUpdate.length > 0){
        // 2. Actualizar printedItems después de imprimir la comanda
        itemsForComandaUpdate.forEach(newItem => {
            const existing = mesa.printedItems.find(p => norm(p.dish) === norm(newItem.dish));
            if (existing) {
                existing.qty += newItem.qty;
            } else {
                mesa.printedItems.push({ dish: newItem.dish, qty: newItem.qty });
            }
        });
        saveState();
    }
}


/**
 * Construye y envía el HTML para imprimir
 * @param {string} type - Tipo de documento ('consumo', 'comanda', 'venta')
 * @param {object} sale - Objeto de venta o de pedido temporal
 */
function _print(type, sale){
    const html = buildTicketHTML(type, sale);
    if(!html) return;
    let frame = document.getElementById('print-frame');
    if(!frame){
        frame = document.createElement('iframe');
        frame.id = 'print-frame';
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.setAttribute('aria-hidden','true');
        document.body.appendChild(frame);
    }
    const fdoc = frame.contentDocument || frame.contentWindow.document;
    fdoc.open();
    fdoc.write(html);
    fdoc.close();
    frame.onload = () => {
        const win = frame.contentWindow;
        setTimeout(() => { try{ win.focus(); win.print(); }catch(e){ console.error(e); } }, 500);
    };
}

/**
 * Genera el HTML del ticket o comanda
 * @param {string} type - Tipo de documento ('consumo', 'comanda', 'venta')
 * @param {object} sale - Objeto de venta o de pedido temporal
 */
function buildTicketHTML(type, sale){
    if(!sale) return null;
    
    const showPrices = type !== 'comanda';
    const title = type === 'comanda' ? 'COMANDA' : (type === 'consumo' ? 'TICKET DE CONSUMO' : 'TICKET DE VENTA');
    const mesaName = sale.mesaName || getMesaName(sale.mesa); 

    // Agrupar items por área para la comanda
    let itemsHTML = '';
    if(type === 'comanda'){
        const groups = {};
        sale.items.forEach(it=>{
            const receta = state.recetas.find(r=>norm(r.dish)===norm(it.dish));
            const area = receta?.area || 'otra';
            if(!groups[area]) groups[area] = [];
            groups[area].push(it);
        });

        const order = ['caliente','frío','bebidas','barra','postres','otra'];
        order.forEach(a=>{
            if(groups[a] && groups[a].length > 0){ // Solo imprimir si hay items en el área
                itemsHTML += `<div class="t-line"></div><div class="t-center t-sm t-muted">${a.toUpperCase()}</div>`;
                groups[a].forEach(it=>{
                    itemsHTML += `<div class="t-row"><span><strong>${it.qty} ×</strong> ${it.dish}</span></div>`;
                });
            }
        });
        
        if (itemsHTML === '') {
            // Esto no debería pasar si printCurrentOrder funciona bien, pero por seguridad
            return null; 
        }

    } else {
        // Lista de items con precios
        itemsHTML = '<table class="items"><thead><tr><th class="qty">Cant</th><th class="desc">Descripción</th>';
        if(showPrices) itemsHTML += '<th class="amt">Importe</th>';
        itemsHTML += '</tr></thead><tbody>';
        sale.items.forEach(it=>{
            itemsHTML += `<tr><td class="qty">${it.qty}</td><td class="desc">${it.dish}</td>`;
            if(showPrices){
                itemsHTML += `<td class="amt">${toMoney(Number(it.unitPrice)*Number(it.qty))}</td>`;
            }
            itemsHTML += '</tr>';
        });
        itemsHTML += '</tbody></table>';
    }

    const subtotal = sale.subtotal || sale.total || 0;
    const tipAmt = sale.tipAmount || 0;
    const totalWithTip = sale.totalWithTip || (subtotal + tipAmt);

    let totHTML = '';
    if(showPrices){
        totHTML = `<div class="t-line"></div> <p class="total">SUBTOTAL: ${toMoney(subtotal)}</p> <p class="total">PROPINA: ${toMoney(tipAmt)}</p> <p class="total"><strong>TOTAL: ${toMoney(totalWithTip)}</strong></p>`;
        if(type === 'venta' && sale.paid > 0){
            // Añadir el método de pago al ticket de venta
            totHTML += `<div class="t-line"></div><p class="total">Método de Pago: <strong>${sale.paymentMethod || 'Efectivo'}</strong></p>`; 
            totHTML += `<p class="total">Paga con: ${toMoney(sale.paid)}</p> <p class="total">Cambio: ${toMoney(sale.change)}</p> <p class="total">Pedido: ${sale.orderType||''}</p>`;
        }
    }

    const notasHTML = sale.notas ? `<div class="t-line"></div><p class="pre">Notas: ${sale.notas}</p>` : '';
    const logo = state.logoUrl ? `<img src="${state.logoUrl}" class="logo-img" alt="Logo"/>` : '';

    return `<!DOCTYPE html><html><head><title>${title}</title><style>
    /* Estilos de Ticket */
    .logo-img{ max-width: 50mm; max-height: 20mm; display: block; margin: 0 auto 5mm; }
    .t-wrap{ width: 80mm; padding: 4mm; font-family: sans-serif; font-size: 11pt; }
    .t-center{ text-align: center; } .t-sm{ font-size: 9pt; } .t-muted{ opacity: 0.7; }
    .t-line{ border-top: 1px dashed #000; margin: 3mm 0; }
    .meta div{ margin-bottom: 0.5mm; }
    .items{ width: 100%; border-collapse: collapse; margin: 3mm 0; }
    .items th, .items td{ padding: 1mm 0; }
    .items .qty{ width: 10mm; text-align: left; } .items .desc{ text-align: left; }
    .items .amt{ width: 20mm; text-align: right }
    .total{ font-weight: 700; text-align: right; margin: 1mm 0; }
    .footer{ text-align:center; font-size: 9pt; margin-top: 2mm }
    .block{ break-inside: avoid; page-break-inside: avoid; }
    * { line-height: 1.2; }
    </style></head> <body> <div class="t-wrap"> <div class="block t-center"> ${logo} <h1>LA SHULA</h1> <h2>Mariscos de México</h2> </div> <div class="t-line"></div> <div class="block meta"> <div><strong>${title}</strong></div> <div>Folio: <strong>${sale.id}</strong></div> <div>Fecha: ${fmtDateTime(sale.date)}</div> ${sale.shiftId?`<div>Turno: ${sale.shiftId}</div>`:''} <div>Mesa: <strong>${mesaName}</strong></div> </div> <div class="t-line"></div> <div class="block"> ${itemsHTML} </div> ${type !== 'comanda' ? totHTML : ''} ${notasHTML} <div class="double"></div> <div class="footer block"> <div>Gracias por su preferencia</div> <div>La Shula — Mariscos de México</div> </div> </div> </body></html>`;
}
// ------------------------------------------

// INVENTARIO
function getInv(name){
    return state.inventario.find(i=>norm(i.ingredient)===norm(name));
}

function renderInventario(lowSet = new Set()){
    const body = $('#tablaInventario tbody');
    const empty = $('#invEmpty');
    const alertEl = $('#invAlert');
    body.innerHTML = '';
    
    let lowStock = false;
    let lowStockNames = []; // Para la alerta inicial
    
    state.inventario.forEach((i, idx) => {
        const tr = document.createElement('tr');
        const stock = Number(i.stock||0);
        const min = Number(i.min||0);
        
        if(stock <= min){
            tr.classList.add('low');
            lowStock = true;
            if(!lowSet.size) lowStockNames.push(i.ingredient); // Solo para la alerta inicial
        } else if (lowSet.has(i.ingredient)){
            tr.classList.add('low');
        }

        tr.innerHTML = `
            <td><input type="text" class="input inv-name" data-idx="${idx}" value="${i.ingredient}" /></td>
            <td><input type="text" class="input inv-unit" data-idx="${idx}" value="${i.unit}" /></td>
            <td>
                <input type="number" min="0" class="input inv-stock" data-idx="${idx}" value="${stock}" />
                ${stock <= min ? '<span class="low-flag"> ⚠️ ¡Bajo!</span>' : ''}
            </td>
            <td><input type="number" min="0" class="input inv-min" data-idx="${idx}" value="${min}" /></td>
            <td class="row-actions">
                <button type="button" class="btn danger btn-sm inv-delete" data-inv-del="${idx}">Eliminar</button>
            </td>
        `;
        body.appendChild(tr);
    });

    empty.style.display = state.inventario.length === 0 ? 'block' : 'none';
    alertEl.style.display = lowStock ? 'block' : 'none';
    
    return lowStockNames; // Retornar nombres para la alerta inicial
}

function addNewInventory(){
    const name = ($('#newInvName')?.value||'').trim();
    const unit = ($('#newInvUnit')?.value||'').trim();
    const stock = Number($('#newInvStock')?.value||0);
    const min = Number($('#newInvMin')?.value||0);
    
    if(!name || !unit){ alert('Nombre y unidad obligatorios'); return; }
    if(state.inventario.some(i=>norm(i.ingredient)===norm(name))){ alert('Ese ingrediente ya existe'); return; }

    state.inventario.unshift({ ingredient:name, unit, stock, min });
    saveState();
    renderInventario();
    syncDatalist();
    llenarSelectores();

    $('#newInvName').value = '';
    $('#newInvUnit').value = '';
    $('#newInvStock').value = '';
    $('#newInvMin').value = '';
}

function bindInventarioTable(){
    const table = $('#tablaInventario');
    if(!table) return;

    table.onclick = function(e){
        const d = e.target.closest('.inv-delete');
        if(d){
            const i = +d.getAttribute('data-inv-del');
            if(confirm('¿Eliminar ingrediente?')){
                state.inventario.splice(i,1);
                saveState();
                renderInventario();
                syncDatalist();
                llenarSelectores();
            }
        }
    };
    table.onchange = function(e){
        const i = Number(e.target.getAttribute('data-idx'));
        if(e.target.classList.contains('inv-name')){
            state.inventario[i].ingredient = e.target.value.trim();
            syncDatalist();
            llenarSelectores();
        }
        if(e.target.classList.contains('inv-unit')){
            state.inventario[i].unit = e.target.value.trim();
        }
        if(e.target.classList.contains('inv-stock')){
            state.inventario[i].stock = Number(e.target.value)||0;
        }
        if(e.target.classList.contains('inv-min')){
            state.inventario[i].min = Number(e.target.value)||0;
        }
        saveState();
        renderInventario();
    };
}

// RECETARIOS
function addDish(){
    const name = ($('#newDishName')?.value||'').trim();
    const price = Number($('#newDishPrice')?.value||0);
    const area = $('#newDishArea')?.value || 'otra';
    if(!name){ alert('Escribe el nombre del platillo'); return; }
    if(state.recetas.some(r=>norm(r.dish)===norm(name))){ alert('Ese platillo ya existe'); return; }

    state.recetas.unshift({ dish: name, price, area, ingredients: [{ingredient:'', qty:0, unit:'g'}] });
    saveState();
    renderRecetas();
    renderMenu();
    $('#newDishName').value = '';
    $('#newDishPrice').value = '';
}

function renderRecetas(){
    const body = $('#tablaRecetas tbody');
    const empty = $('#recEmpty');
    body.innerHTML = '';
    
    state.recetas.forEach((r,ridx)=>{
        const items = r.ingredients.map((i,iidx)=>`
            <div class="grid three" style="gap:6px; margin:4px 0">
                <input class="input rec-ing" list="invNames" data-r="${ridx}" data-i="${iidx}" value="${i.ingredient}" placeholder="Ingrediente"/>
                <input type="number" class="input rec-qty" data-r="${ridx}" data-i="${iidx}" value="${Number(i.qty)||0}" placeholder="Cantidad"/>
                <input class="input rec-unit" data-r="${ridx}" data-i="${iidx}" value="${i.unit||''}" placeholder="Unidad" disabled/>
                <button type="button" class="btn danger" style="padding:6px; font-size:10px" data-r="${ridx}" data-i="${iidx}" data-action="delete-ing">🗑️</button>
            </div>
        `).join('');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input class="input rec-dish" data-r="${ridx}" value="${r.dish}"/></td>
            <td><input type="number" min="0" step="0.01" class="input rec-price" data-r="${ridx}" value="${r.price}"/></td>
            <td>
                <select class="input rec-area" data-r="${ridx}">
                    <option value="caliente" ${r.area==='caliente'?'selected':''}>Caliente</option>
                    <option value="frío" ${r.area==='frío'?'selected':''}>Frío</option>
                    <option value="bebidas" ${r.area==='bebidas'?'selected':''}>Bebidas</option>
                    <option value="barra" ${r.area==='barra'?'selected':''}>Barra</option>
                    <option value="postres" ${r.area==='postres'?'selected':''}>Postres</option>
                    <option value="otra" ${r.area==='otra'?'selected':''}>Otra</option>
                </select>
            </td>
            <td>
                ${items}
                <div class="toolbar" style="margin-top:6px">
                    <button type="button" class="btn ghost" style="padding:6px; font-size:10px" data-r="${ridx}" data-action="add-ing">+ Ingrediente</button>
                </div>
            </td>
            <td class="row-actions">
                <button type="button" class="btn danger btn-sm rec-delete" data-rec-del="${ridx}">Eliminar</button>
            </td>
        `;
        body.appendChild(tr);
    });

    empty.style.display = state.recetas.length === 0 ? 'block' : 'none';
}

function bindRecetasTable(){
    const table = $('#tablaRecetas');
    if(!table) return;

    table.onclick = function(e){
        const d = e.target.closest('.rec-delete');
        if(d){
            const i = +d.getAttribute('data-rec-del');
            if(confirm('¿Eliminar platillo?')){
                state.recetas.splice(i,1);
                saveState();
                renderRecetas();
                renderMenu();
            }
        }
        
        const btn = e.target.closest('button[data-action]');
        if(btn){
            const r = +btn.getAttribute('data-r');
            const action = btn.getAttribute('data-action');
            const receta = state.recetas[r];

            if(action === 'add-ing'){
                receta.ingredients.push({ingredient:'', qty:0, unit:'g'});
                saveState();
                renderRecetas();
            } else if (action === 'delete-ing'){
                const i = +btn.getAttribute('data-i');
                receta.ingredients.splice(i, 1);
                saveState();
                renderRecetas();
            }
        }
    };
    table.onchange = function(e){
        const r = Number(e.target.getAttribute('data-r'));
        
        if(e.target.classList.contains('rec-dish')){
            state.recetas[r].dish = e.target.value.trim();
            renderMenu();
        }
        if(e.target.classList.contains('rec-price')){
            state.recetas[r].price = Number(e.target.value)||0;
            renderMenu();
        }
        if(e.target.classList.contains('rec-area')){
            state.recetas[r].area = e.target.value;
        }

        const i = Number(e.target.getAttribute('data-i'));
        if(!isNaN(i)){
            const ing = state.recetas[r].ingredients[i];
            if(e.target.classList.contains('rec-ing')){
                ing.ingredient = e.target.value.trim();
                const inv = getInv(ing.ingredient);
                ing.unit = inv ? inv.unit : '';
            }
            if(e.target.classList.contains('rec-qty')){
                ing.qty = Number(e.target.value)||0;
            }
            if(e.target.classList.contains('rec-unit')){
                ing.unit = e.target.value.trim();
            }
        }
        saveState();
        renderRecetas();
    };
}

function syncDatalist(){
    const datalist = $('#invNames');
    datalist.innerHTML = '';
    state.inventario.forEach(i=>{
        const opt = document.createElement('option');
        opt.value = i.ingredient;
        datalist.appendChild(opt);
    });
}

// MERMAS
function llenarSelectores(){
    const mermaIng = $('#mermaIngrediente');
    mermaIng.innerHTML = '<option value="">-- Selecciona ingrediente --</option>';
    state.inventario.forEach(i=>{
        const opt = document.createElement('option');
        opt.value = i.ingredient;
        opt.textContent = i.ingredient + ' ('+i.unit+')';
        mermaIng.appendChild(opt);
    });

    mermaIng.onchange = function(){
        const inv = getInv(mermaIng.value);
        $('#mermaUnidad').value = inv ? inv.unit : '';
    };
}

function renderMermas(){
    const body = $('#tablaMermas tbody');
    body.innerHTML = '';
    state.mermas.forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${fmtDateTime(m.date)}</td><td>${m.ingredient}</td><td>${m.qty}</td><td>${m.unit}</td><td>${m.motivo||''}</td>`;
        body.appendChild(tr);
    });
}

function addMerma(){
    const ing = $('#mermaIngrediente')?.value;
    const qty = Number($('#mermaCantidad')?.value||0);
    const unit = ($('#mermaUnidad')?.value||'').trim();
    const motivo = ($('#mermaMotivo')?.value||'').trim();
    if(!ing || !qty || !unit){ alert('Ingrediente, cantidad y unidad son obligatorios'); return; }
    const inv = state.inventario.find(i=>norm(i.ingredient)===norm(ing));
    if(!inv){ alert('Ingrediente no existe en inventario'); return; }
    if(norm(inv.unit)!==norm(unit)){ alert('Unidad distinta a la del inventario'); return; }
    if(Number(inv.stock||0) < qty){ alert('Cantidad mayor al stock'); return; }

    inv.stock = Math.max(0, Number(inv.stock||0) - qty);
    state.mermas.unshift({ date: nowISO(), ingredient: ing, qty, unit, motivo });

    saveState();
    renderInventario();
    renderMermas();
    $('#mermaCantidad').value = '';
    $('#mermaUnidad').value = '';
    $('#mermaMotivo').value = '';
}

// REPORTE
function filterVentasByDate(fromStr, toStr){
    const from = fromStr ? new Date(fromStr+'T00:00:00') : new Date('1970-01-01');
    const to = toStr ? new Date(toStr+'T23:59:59') : new Date('2999-12-31');
    return state.ventas.filter(v => {
        const d = new Date(v.date);
        return d >= from && d <= to;
    });
}

function renderReporte(rows = state.ventas){
    const body = $('#tablaVentas tbody');
    const empty = $('#repEmpty');
    body.innerHTML = '';

    const repTickets = $('#repTickets');
    const repItems = $('#repItems');
    const repTotal = $('#repTotal');
    
    let totalItems = 0;
    let totalVendido = 0;

    rows.forEach(v => {
        const tr = document.createElement('tr');
        const detail = v.items.map(i => `${i.qty}x ${i.dish}`).join(' | ');
        const total = v.totalWithTip || v.total;
        
        tr.innerHTML = `
            <td>${fmtDateTime(v.date)}</td>
            <td>${v.mesaName||getMesaName(v.mesa)||'N/A'}</td>
            <td>${detail}</td>
            <td>${toMoney(total)}</td>
        `;
        body.appendChild(tr);

        totalItems += v.items.reduce((s,i)=>s+i.qty,0);
        totalVendido += total;
    });

    repTickets.textContent = rows.length;
    repItems.textContent = totalItems;
    repTotal.textContent = toMoney(totalVendido);

    empty.style.display = rows.length === 0 ? 'block' : 'none';
}

function updateShiftUI(){
    const status = $('#shiftStatus');
    const openBtn = $('#openShift');
    const closeBtn = $('#closeShift');
    const current = state.shifts.find(s=>s.id === state.currentShiftId);

    if(current){
        status.textContent = 'Turno: abierto (' + current.id + ')';
        status.classList.remove('pill');
        status.style.backgroundColor = 'var(--success)';
        status.style.color = '#fff';
        openBtn.style.display = 'none';
        closeBtn.style.display = 'inline-block';
    } else {
        status.textContent = 'Turno: cerrado';
        status.classList.add('pill');
        status.style.backgroundColor = '';
        status.style.color = 'var(--fg)';
        openBtn.style.display = 'inline-block';
        closeBtn.style.display = 'none';
    }
}

function fillShiftSelect(){
    const select = $('#shiftSelect');
    select.innerHTML = '<option value="">-- Todos los turnos --</option>';
    state.shifts.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id} (${fmtDateTime(s.openedAt)} - ${s.closedAt ? fmtDateTime(s.closedAt) : 'Abierto'})`;
        select.appendChild(opt);
    });
}

function openShift(){
    const newShift = { id: 'T'+Date.now(), openedAt: nowISO(), closedAt: null, sales: 0, total: 0 };
    state.shifts.unshift(newShift);
    state.currentShiftId = newShift.id;
    updateShiftUI();
    fillShiftSelect();
    saveState();
}

function closeShift(){
    if(!confirm('¿Estás seguro de cerrar el turno?')){ return; }
    const s = state.shifts.find(t=>t.id===state.currentShiftId);
    if(!s){ alert('Error: Turno actual no encontrado'); return; }
    s.closedAt = nowISO();
    state.currentShiftId = null;
    updateShiftUI();
    fillShiftSelect();
    saveState();
}

function repFilter(){
    const from = $('#repFrom')?.value;
    const to = $('#repTo')?.value;
    const filtered = filterVentasByDate(from, to);
    renderReporte(filtered);
}

function repShift(){
    const shiftId = $('#shiftSelect')?.value;
    if(!shiftId) {
        renderReporte(state.ventas);
        return;
    }
    const filtered = state.ventas.filter(v => v.shiftId === shiftId);
    renderReporte(filtered);
}

function repToday(){
    const today = new Date().toISOString().split('T')[0];
    $('#repFrom').value = today;
    $('#repTo').value = today;
    repFilter();
}

function bindTurnos(){
    const openBtn = $('#openShift');
    const closeBtn = $('#closeShift');
    if(openBtn) openBtn.onclick = openShift;
    if(closeBtn) closeBtn.onclick = closeShift;
}

// Actualización de repExport para incluir el método de pago y traducir encabezados
function repExport(rows){
    // *********************************************************************************
    // ENCABEZADOS TRADUCIDOS A ESPAÑOL
    // *********************************************************************************
    const csvRows = [['Folio','Fecha','Mesa','Notas','Detalle de Items','Subtotal','Modo Propina','Valor Propina','Monto Propina','Total con Propina','Monto Pagado','Cambio','Tipo Pedido','Metodo Pago','ID Turno']];
    // *********************************************************************************
    
    rows.forEach(v=>{
        const detail = v.items.map(i=>`${i.qty}x ${i.dish} @ ${i.unitPrice}`).join(' | ');
        const mesaName = v.mesaName || getMesaName(v.mesa) || '';
        csvRows.push([ 
            v.id, v.date, mesaName, v.notas||'', detail, v.subtotal??v.total, v.tipMode||'', v.tipValue||0, v.tipAmount||0, 
            v.totalWithTip??v.total, v.paid||0, v.change||0, v.orderType||'', v.paymentMethod||'Efectivo', v.shiftId||'' 
        ]);
    });
    const csv = csvRows.map(r=>r.map(c=>{
        const s = String(c||'');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_ventas_'+new Date().toISOString().split('T')[0]+'.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function bindReporte(){
    const repFiltrar = $('#repFiltrar');
    const repHoy = $('#repHoy');
    const repExportBtn = $('#repExport'); 
    const repShiftBtn = $('#repShift');
    const repExportShiftBtn = $('#repExportShift');

    if(repFiltrar) repFiltrar.onclick = repFilter;
    if(repHoy) repHoy.onclick = repToday;
    if(repShiftBtn) repShiftBtn.onclick = repShift;
    
    // Llamar a la función global repExport
    if(repExportBtn) repExportBtn.onclick = () => {
        const from = $('#repFrom')?.value;
        const to = $('#repTo')?.value;
        repExport(filterVentasByDate(from, to));
    };
    if(repExportShiftBtn) repExportShiftBtn.onclick = () => {
        const shiftId = $('#shiftSelect')?.value;
        if(!shiftId) { alert('Selecciona un turno primero.'); return; }
        repExport(state.ventas.filter(v => v.shiftId === shiftId));
    };

    const saveLogoBtn = $('#saveLogo');
    const clearLogoBtn = $('#clearLogo');
    if(saveLogoBtn) saveLogoBtn.onclick = saveLogo;
    if(clearLogoBtn) clearLogoBtn.onclick = clearLogo;
}

function saveLogo(){
    const url = ($('#logoUrl')?.value||'').trim();
    state.logoUrl = url;
    saveState();
    alert(url ? 'Logo guardado.' : 'Logo eliminado.');
}

function clearLogo(){
    state.logoUrl = '';
    $('#logoUrl').value = '';
    saveState();
    alert('Logo eliminado.');
}


// INICIALIZACIÓN
function initApp(){
    loadState(); // Cargar datos
    initMesas(); // Inicializar mesas (con las cargadas o por defecto)
    
    // Configuración inicial de ejemplo si es la primera vez
    if(state.inventario.length === 0){
        state.inventario = [
            { ingredient:'Tortilla', unit:'u', stock:100, min:20 },
            { ingredient:'Camarón', unit:'g', stock:1000, min:200 },
            { ingredient:'Pescado Blanco', unit:'g', stock:1500, min:300 },
            { ingredient:'Limón', unit:'u', stock:50, min:10 },
            { ingredient:'Cebolla', unit:'g', stock:500, min:50 },
            { ingredient:'Cilantro', unit:'g', stock:200, min:20 },
            { ingredient:'Aguacate', unit:'u', stock:15, min:5 }
        ];
        saveState();
    }
    if(state.recetas.length === 0){
        state.recetas = [
          { dish:'Taco de Camarón', price:35, area:'caliente', ingredients:[ {ingredient:'Tortilla', qty:2, unit:'u'}, {ingredient:'Camarón', qty:50, unit:'g'}, {ingredient:'Cebolla', qty:10, unit:'g'}, {ingredient:'Cilantro', qty:5, unit:'g'} ] },
          { dish:'Ceviche de Pescado', price:85, area:'frío', ingredients:[ {ingredient:'Pescado Blanco', qty:150, unit:'g'}, {ingredient:'Limón', qty:3, unit:'u'}, {ingredient:'Cebolla', qty:30, unit:'g'}, {ingredient:'Cilantro', qty:10, unit:'g'} ] },
          { dish:'Guacamole', price:45, area:'frío', ingredients:[ {ingredient:'Aguacate', qty:2, unit:'u'}, {ingredient:'Limón', qty:1, unit:'u'}, {ingredient:'Cebolla', qty:20, unit:'g'}, {ingredient:'Cilantro', qty:5, unit:'g'} ] }
        ];
        saveState();
    }
    
    // Bind de eventos
    bindTabs();
    bindVentas();
    bindPaymentBox();
    bindInventarioTable();
    bindRecetasTable();
    bindReporte();
    bindTurnos();

    // Bind botón de agregar ingrediente
    const addInvBtn = $('#addInvBtn');
    if(addInvBtn) addInvBtn.onclick = addNewInventory;

    // Bind botón de agregar platillo
    const addDishBtn = $('#addDishBtn');
    if(addDishBtn) addDishBtn.onclick = addDish;

    // Bind botón de agregar merma
    const agregarMerma = $('#agregarMerma');
    if(agregarMerma) agregarMerma.onclick = addMerma;

    // Renders iniciales
    syncDatalist();
    llenarSelectores();
    updateShiftUI();
    fillShiftSelect();
    renderMenu();
    renderMesasGrid();
    renderCart();
    
    const lowStockNames = renderInventario();
    if(lowStockNames.length > 0) {
        // Alerta solo si es la primera carga y hay stock bajo
        alert('🚨 ALERTA DE INVENTARIO BAJO 🚨\n\nLos siguientes ingredientes están en o por debajo de su nivel mínimo:\n- ' + lowStockNames.join('\n- '));
    }
    
    renderRecetas();
    renderMermas();
    renderReporte();

    console.log('La Shula POS iniciado correctamente ✅');
}

// Iniciar cuando el DOM esté listo
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}