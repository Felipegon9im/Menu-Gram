/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Fix: Add declarations for global variables from external scripts.
declare var firebase: any;
declare var d3: any;
declare var XLSX: any;
declare var process: any;

import { GoogleGenAI } from "@google/genai";

document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Config ---
    const firebaseConfig = {
        apiKey: "AIzaSyC08kGcRY7rWrDRbbbXZjrI7pffqsFTwDU",
        authDomain: "cardapioonline-ce986.firebaseapp.com",
        projectId: "cardapioonline-ce986",
        storageBucket: "cardapioonline-ce986.appspot.com",
        messagingSenderId: "851882063397",
        appId: "1:851882063397:web:d61577093b176ef534b1cc"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- State Variables ---
    let activeOrdersUnsubscribe, finishedOrdersUnsubscribe;
    let configUnsubscribe, produtosUnsubscribe, categoriesUnsubscribe;
    // Fix: Initialize storeConfig as any to allow dynamic properties.
    let storeConfig: any = {}, categories = [], allProdutosSimples = [], userEmpresaId = null, allOrders = {};
    let isConfigFormRendered = false;
    let reportData = [];

    // --- DOM Element References ---
    const loginScreen = document.getElementById('login-screen'), mainPanel = document.getElementById('main-panel'), authCheckScreen = document.getElementById('auth-check-screen'), loginForm = document.getElementById('login-form'), loginError = document.getElementById('login-error'), logoutButton = document.getElementById('logout-button'), panelTitle = document.getElementById('panel-title'), produtosList = document.getElementById('produtos-list'), categoryList = document.getElementById('category-list'), configForm = document.getElementById('config-form'), addItemForm = document.getElementById('add-item-form'), addCategoryForm = document.getElementById('add-category-form'), notificationSound = document.getElementById('notification-sound') as HTMLAudioElement, editItemModal = document.getElementById('edit-item-modal'), cancelOrderModal = document.getElementById('cancel-order-modal'), pedidosTab = document.getElementById('pedidos');

    // --- Authentication ---
    auth.onAuthStateChanged(async user => {
        if (user) {
            showAuthCheck();
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (userDoc.exists && userDoc.data().empresa_id) {
                    userEmpresaId = userDoc.data().empresa_id;
                    showMainPanel();
                    loadInitialData(userEmpresaId);
                } else { throw new Error('Acesso negado. Usuário não associado a uma empresa.'); }
            } catch (error) {
                loginError.textContent = error.message || 'Acesso negado. Contate o suporte.';
                auth.signOut();
            }
        } else { showLoginSection(); }
    });

    loginForm.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        // Fix: Cast e.target to any to access form fields.
        const target = e.target as any;
        auth.signInWithEmailAndPassword(target.email.value, target.password.value).catch(() => { loginError.textContent = 'Email ou senha inválidos.'; }); 
    });
    logoutButton.addEventListener('click', () => auth.signOut());

    // --- UI State Management ---
    function showAuthCheck() { loginScreen.classList.add('hidden'); mainPanel.classList.add('hidden'); authCheckScreen.classList.remove('hidden'); }
    function showMainPanel() { loginScreen.classList.add('hidden'); authCheckScreen.classList.add('hidden'); mainPanel.classList.remove('hidden'); }
    function showLoginSection() {
        loginScreen.classList.remove('hidden'); mainPanel.classList.add('hidden'); authCheckScreen.classList.add('hidden');
        if (activeOrdersUnsubscribe) activeOrdersUnsubscribe();
        if (finishedOrdersUnsubscribe) finishedOrdersUnsubscribe();
        isConfigFormRendered = false;
        if (configUnsubscribe) configUnsubscribe();
        if (produtosUnsubscribe) produtosUnsubscribe();
        if (categoriesUnsubscribe) categoriesUnsubscribe();
    }

    // --- Data Loading & Listeners ---
    function loadInitialData(empresaId) {
        if (!empresaId) return;
        listenToConfig(empresaId);
        listenToCategories(empresaId);
        listenToProdutos(empresaId);
        listenToPedidos(empresaId);
        setupReportTab();
    }

    function listenToConfig(empresaId) {
        if (configUnsubscribe) configUnsubscribe();
        configUnsubscribe = db.collection('empresas').doc(empresaId).onSnapshot(doc => {
            storeConfig = doc.exists ? { id: doc.id, ...doc.data() } : {};
            panelTitle.textContent = `Painel de Gestão - ${storeConfig.name || 'Sua Loja'}`;
            updateViewMenuButton();
            if (!isConfigFormRendered) {
                renderConfigForm(storeConfig);
                isConfigFormRendered = true;
            }
        });
    }

    function updateViewMenuButton() {
        const viewMenuBtn = document.getElementById('view-menu-btn') as HTMLAnchorElement;
        if (storeConfig && storeConfig.slug) {
            viewMenuBtn.href = `/menu.html?slug=${storeConfig.slug}`;
            viewMenuBtn.classList.remove('hidden');
        } else {
            viewMenuBtn.classList.add('hidden');
        }
    }

    function listenToCategories(empresaId) {
        if (categoriesUnsubscribe) categoriesUnsubscribe();
        categoriesUnsubscribe = db.collection('categorias').where('empresa_id', '==', empresaId).orderBy('name').onSnapshot(snapshot => {
            categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderCategoryList(categories);
            renderAddItemForm(categories);
        });
    }

    function listenToProdutos(empresaId) {
        if (produtosUnsubscribe) produtosUnsubscribe();
        produtosUnsubscribe = db.collection('produtos').where('empresa_id', '==', empresaId).orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            const produtos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allProdutosSimples = produtos.filter(p => !p.productType || p.productType === 'simples');
            renderProdutosList(produtos);
            renderAddItemForm(categories);
        });
    }

    function listenToPedidos(empresaId) {
        if (activeOrdersUnsubscribe) activeOrdersUnsubscribe();
        if (finishedOrdersUnsubscribe) finishedOrdersUnsubscribe();
        const processAndRender = () => {
            const ordersArray = Object.values(allOrders);
            renderPedidosPorStatus(ordersArray);
            updateDashboard(ordersArray);
        };
        const activeStatuses = ['aberto', 'em_preparo', 'pronto'];
        activeOrdersUnsubscribe = db.collection('pedidos').where('empresa_id', '==', empresaId).where('status', 'in', activeStatuses)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === "removed") { delete allOrders[change.doc.id]; } 
                    else { allOrders[change.doc.id] = { id: change.doc.id, ...change.doc.data() }; }
                });
                const hasNewOrders = snapshot.docChanges().some(change => change.type === 'added' && !change.doc.metadata.hasPendingWrites && change.doc.data().status === 'aberto');
                if (hasNewOrders) notificationSound.play().catch(() => {});
                processAndRender();
            }, error => console.error("Erro ao buscar pedidos ativos:", error));
        const hoje = new Date();
        const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
        finishedOrdersUnsubscribe = db.collection('pedidos').where('empresa_id', '==', empresaId).where('status', 'in', ['concluido', 'cancelado']).where('timestamp', '>=', inicioDoDia)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    allOrders[change.doc.id] = { id: change.doc.id, ...change.doc.data() };
                });
                processAndRender();
            }, error => console.error("Erro ao buscar pedidos finalizados:", error));
    }

    // --- Dashboard Rendering ---
    function updateDashboard(pedidos) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todaysOrders = pedidos.filter(p => p.timestamp && (p.timestamp.seconds * 1000) >= todayStart.getTime());

        const completedOrders = todaysOrders.filter(p => p.status === 'concluido');
        const totalRevenue = completedOrders.reduce((acc, order) => acc + order.total, 0);
        const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
        const canceledCount = todaysOrders.filter(p => p.status === 'cancelado').length;

        document.getElementById('dash-total').textContent = `R$ ${totalRevenue.toFixed(2)}`;
        document.getElementById('dash-completed-orders').textContent = completedOrders.length.toString();
        document.getElementById('dash-avg-ticket').textContent = `R$ ${avgTicket.toFixed(2)}`;
        document.getElementById('dash-canceled-orders').textContent = canceledCount.toString();

        renderSalesChart(completedOrders);
        renderTopItems(completedOrders);
    }

    function renderSalesChart(completedOrders) {
        const container = d3.select("#sales-chart-container");
        container.selectAll("*").remove(); 

        const salesByHour = Array(24).fill(0);
        completedOrders.forEach(order => {
            const hour = new Date(order.timestamp.seconds * 1000).getHours();
            salesByHour[hour] += order.total;
        });
        
        const chartData = salesByHour.map((sales, hour) => ({ hour, sales })).filter(d => d.sales > 0);

        if (chartData.length === 0) {
            container.append("p").attr("class", "text-center text-gray-500").text("Nenhuma venda hoje para exibir no gráfico.");
            return;
        }

        const margin = { top: 20, right: 20, bottom: 30, left: 40 };
        // Fix: Cast container.node() to getBoundingClientRect
        const node = container.node() as HTMLElement;
        const width = node.getBoundingClientRect().width - margin.left - margin.right;
        const height = node.getBoundingClientRect().height - margin.top - margin.bottom;

        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        const x = d3.scaleBand()
            .range([0, width])
            .domain(chartData.map(d => `${d.hour}:00`))
            .padding(0.2);

        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)");

        const y = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.sales)])
            .range([height, 0]);

        svg.append("g").call(d3.axisLeft(y));

        svg.selectAll("mybar")
            .data(chartData)
            .enter()
            .append("rect")
            .attr("x", d => x(`${d.hour}:00`))
            .attr("y", d => y(d.sales))
            .attr("width", x.bandwidth())
            .attr("height", d => height - y(d.sales))
            .attr("fill", "#3b82f6");
    }

    function renderTopItems(completedOrders) {
        const topItemsList = document.getElementById('top-items-list');
        topItemsList.innerHTML = '';

        if (completedOrders.length === 0) {
            topItemsList.innerHTML = `<p class="text-center text-gray-500">Nenhum pedido concluído hoje.</p>`;
            return;
        }

        const itemsCount = {};
        completedOrders.forEach(order => {
            (order.items || []).forEach(item => {
                itemsCount[item.name] = (itemsCount[item.name] || 0) + item.quantity;
            });
        });

        const sortedItems = Object.entries(itemsCount)
            // Fix: Cast sort parameters to numbers.
            .sort(([,a],[,b]) => (b as number)-(a as number))
            .slice(0, 5);

        if (sortedItems.length === 0) {
            topItemsList.innerHTML = `<p class="text-center text-gray-500">Nenhum item vendido hoje.</p>`;
            return;
        }

        sortedItems.forEach(([name, quantity]) => {
            const el = document.createElement('div');
            el.className = 'flex justify-between items-center text-sm';
            el.innerHTML = `<p class="font-medium text-gray-700">${name}</p><p class="font-bold text-gray-900">${quantity}x</p>`;
            topItemsList.appendChild(el);
        });
    }

    // --- Kanban (Pedidos) Rendering ---
    function renderPedidosPorStatus(pedidos) {
        const containers = { aberto: document.getElementById('pedidos-aberto'), em_preparo: document.getElementById('pedidos-em_preparo'), pronto: document.getElementById('pedidos-pronto'), finalizados: document.getElementById('pedidos-finalizados') };
        Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });
        const counts = { aberto: 0, em_preparo: 0, pronto: 0, finalizados: 0 };
        pedidos.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        pedidos.forEach(pedido => {
            const status = pedido.status;
            let container;
            if (status === 'concluido' || status === 'cancelado') { container = containers.finalizados; counts.finalizados++; } 
            else if (containers[status]) { container = containers[status]; counts[status]++; }
            if (container) container.appendChild(renderPedidoCard(pedido));
        });
        Object.keys(counts).forEach(status => { const countEl = document.getElementById(`count-${status}`); if(countEl) countEl.textContent = counts[status].toString(); });
    }

    function renderPedidoCard(pedido) {
        const el = document.createElement('div');
        el.id = `pedido-${pedido.id}`;
        el.className = 'bg-white p-3 rounded-lg shadow-md border-l-4';
        let scheduledHtml = '';
        if (pedido.scheduledFor && pedido.scheduledFor.seconds) {
            const scheduledDate = new Date(pedido.scheduledFor.seconds * 1000);
            const formattedDate = `${String(scheduledDate.getDate()).padStart(2, '0')}/${String(scheduledDate.getMonth() + 1).padStart(2, '0')}`;
            const formattedTime = `${String(scheduledDate.getHours()).padStart(2, '0')}:${String(scheduledDate.getMinutes()).padStart(2, '0')}`;
            scheduledHtml = `<div class="mt-2 p-2 bg-orange-50 text-orange-700 rounded-lg text-sm font-semibold flex items-center"><i class="fas fa-calendar-alt mr-2"></i><span>Agendado para: ${formattedDate} às ${formattedTime}</span></div>`;
        }
        const itemsHtml = (pedido.items || []).map(item => `<li>${item.quantity}x ${item.name}</li>`).join('');
        let detailsHtml = '';
        if (pedido.orderType === 'Local') detailsHtml = `<div><h4 class="font-semibold">Local:</h4><p class="text-gray-700">${pedido.clientName}</p></div>`;
        else if (pedido.orderType === 'Entrega') detailsHtml = `<div><h4 class="font-semibold">Endereço:</h4><p class="text-gray-700">${pedido.clientAddress}</p></div>`;
        else detailsHtml = `<div><h4 class="font-semibold">Retirada por:</h4><p class="text-gray-700">${pedido.clientName}</p></div>`;
        const proofHtml = pedido.paymentProofUrl ? `<a href="${pedido.paymentProofUrl}" target="_blank" class="text-blue-500 underline hover:text-blue-700">Ver Comp.</a>` : '';
        const changeHtml = pedido.changeFor ? `<span class="font-semibold">Troco p/:</span> R$ ${parseFloat(pedido.changeFor).toFixed(2)}` : '';
        const notesHtml = pedido.notes ? `<div class="mt-2"><h4 class="font-semibold">Obs:</h4><p class="text-sm text-gray-600 italic">"${pedido.notes}"</p></div>` : '';
        let borderColor = 'border-gray-400', actionsHtml = '';
        switch (pedido.status) {
            case 'aberto': borderColor = 'border-blue-500'; actionsHtml = `<button data-id="${pedido.id}" data-status="em_preparo" class="update-status-btn flex-1 bg-yellow-500 text-white font-bold py-1 px-2 text-xs rounded hover:bg-yellow-600">Preparo</button>`; break;
            case 'em_preparo': borderColor = 'border-yellow-500'; actionsHtml = `<button data-id="${pedido.id}" data-status="pronto" class="update-status-btn flex-1 bg-green-500 text-white font-bold py-1 px-2 text-xs rounded hover:bg-green-600">Pronto</button>`; break;
            case 'pronto': borderColor = 'border-green-500'; actionsHtml = `<button data-id="${pedido.id}" data-status="concluido" class="update-status-btn flex-1 bg-blue-500 text-white font-bold py-1 px-2 text-xs rounded hover:bg-blue-600">Finalizar</button>`; break;
            case 'concluido': borderColor = 'border-gray-300'; actionsHtml = `<p class="text-xs text-green-600 font-semibold">Concluído</p>`; break;
            case 'cancelado': borderColor = 'border-red-500'; actionsHtml = `<p class="text-xs text-red-600 font-semibold">Cancelado</p>`; break;
        }
        if (pedido.status !== 'concluido' && pedido.status !== 'cancelado') {
            actionsHtml += `<button data-id="${pedido.id}" class="cancel-order-btn flex-1 bg-red-500 text-white font-bold py-1 px-2 text-xs rounded hover:bg-red-600 ml-2">Cancelar</button>`;
        }
        el.classList.add(borderColor);
        el.innerHTML = `<div class="flex justify-between items-start"><div><p class="font-bold">#${pedido.orderNumber || pedido.id.substring(0,6)} <span class="text-sm font-normal">(${pedido.orderType})</span></p></div><span class="font-bold">R$ ${pedido.total.toFixed(2)}</span></div>${scheduledHtml}<p class="text-sm text-gray-500 mb-2">Cliente: ${pedido.clientName} (${pedido.clientPhone || 'sem telefone'})</p><div class="mt-2 text-sm">${detailsHtml}</div><div class="mt-2 text-sm"><h4 class="font-semibold">Itens:</h4><ul class="list-disc list-inside text-gray-700">${itemsHtml}</ul></div>${notesHtml}${pedido.cancellationReason ? `<div class="mt-2 p-2 bg-red-50 rounded-md"><h4 class="font-semibold text-red-700">Cancelado:</h4><p class="text-sm text-red-600">${pedido.cancellationReason} ${pedido.wasPaid ? '(Cliente pagou!)' : ''}</p></div>` : ''}<div class="mt-2 pt-2 border-t flex justify-between items-center text-xs"><div><span class="font-semibold">${pedido.paymentMethod}</span> ${proofHtml} ${changeHtml}</div></div><div class="mt-4 pt-2 border-t flex justify-around items-center">${actionsHtml}</div>`;
        return el;
    }

    // --- Gestão Tab Rendering & Logic ---
    function renderConfigForm(config) {
        config.horarios = config.horarios || {};
        config.deliveryFees = config.deliveryFees || { simple: [], advanced: [] };
        config.deliverySystem = config.deliverySystem || 'simple';
        const agendamento = config.agendamento || {};

        const diasDaSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        const horariosHtml = diasDaSemana.map(dia => {
            const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
            const horario = config.horarios[dia] || { aberto: true, inicio: '08:00', fim: '22:00' };
            return `<div class="grid grid-cols-4 gap-2 items-center text-sm"><label class="font-medium col-span-1">${diaCapitalizado}</label><input type="time" id="horario-${dia}-inicio" class="p-1 border rounded" value="${horario.inicio}" ${!horario.aberto ? 'disabled' : ''}><input type="time" id="horario-${dia}-fim" class="p-1 border rounded" value="${horario.fim}" ${!horario.aberto ? 'disabled' : ''}><div class="flex items-center justify-end"><label class="switch"><input type="checkbox" id="horario-${dia}-aberto" ${horario.aberto ? 'checked' : ''}><span class="slider"></span></label></div></div>`;
        }).join('');
        
        configForm.innerHTML = `
            <input type="text" id="configName" placeholder="Nome da Loja" class="w-full p-2 border rounded" value="${config.name || ''}" required>
            <textarea id="configBio" placeholder="Bio da Loja" class="w-full p-2 border rounded" maxlength="150">${config.bio || ''}</textarea>
            
            <div class="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <label for="configSlug" class="block text-sm font-bold text-yellow-800">URL do Cardápio (Slug)</label>
                <input type="text" id="configSlug" placeholder="ex: meu-restaurante-feliz" class="w-full p-2 border rounded mt-1" value="${config.slug || ''}" required>
                <p class="text-xs text-yellow-700 mt-1">Este é o nome que aparecerá na URL. Use apenas letras minúsculas, números e hífens (-).</p>
            </div>

            <div class="pt-4 border-t">
                <h4 class="font-bold">Configurações de Upload (Cloudinary)</h4>
                <p class="text-xs text-gray-500 mb-2">Necessário para os clientes enviarem comprovativos de PIX.</p>
                <input type="text" id="configCloudinaryCloudName" placeholder="Cloudinary: Cloud Name" class="w-full p-2 border rounded mt-1" value="${config.cloudinaryCloudName || ''}" required>
                <input type="text" id="configCloudinaryUploadPreset" placeholder="Cloudinary: Upload Preset" class="w-full p-2 border rounded mt-1" value="${config.cloudinaryUploadPreset || ''}" required>
            </div>

            <div class="space-y-2 pt-4 border-t">
                <label class="block text-sm font-medium text-gray-700">Foto de Perfil (Logo)</label>
                <div class="flex items-center space-x-4">
                    <img id="profilePicPreview" src="${config.profilePicUrl || 'https://placehold.co/64x64'}" class="w-16 h-16 rounded-full object-cover bg-gray-200">
                    <input type="file" id="configProfilePic" data-preview="profilePicPreview" class="w-full text-sm file-input-preview" accept="image/*">
                </div>
            </div>
            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700">Foto de Capa</label>
                <div class="flex items-center space-x-4">
                    <img id="coverPhotoPreview" src="${config.coverPhotoUrl || 'https://placehold.co/128x64'}" class="w-32 h-16 rounded-md object-cover bg-gray-200">
                    <input type="file" id="configCoverPhoto" data-preview="coverPhotoPreview" class="w-full text-sm file-input-preview" accept="image/*">
                </div>
            </div>

            <div class="pt-4 border-t">
                <label for="configAddress" class="block text-sm font-medium text-gray-700">Endereço Completo da Loja</label>
                <input type="text" id="configAddress" placeholder="Rua, Número, Bairro, Cidade, Estado" class="w-full p-2 border rounded mt-1" value="${config.address || ''}">
            </div>

            <div class="pt-4 border-t">
                <label class="block text-sm font-medium text-gray-700">Redes Sociais</label>
                <input type="text" id="configInstagram" placeholder="Link do Instagram" class="w-full p-2 border rounded mt-1" value="${config.instagram || ''}">
                <input type="text" id="configFacebook" placeholder="Link do Facebook" class="w-full p-2 border rounded mt-1" value="${config.facebook || ''}">
            </div>

            <h4 class="font-bold mt-4 border-t pt-4">Horário de Funcionamento</h4>
            <div class="space-y-2">${horariosHtml}</div>
            
            <div class="border-t pt-4 mt-4">
                <h4 class="font-bold">Agendamento de Pedidos</h4>
                <div class="flex items-center justify-between mt-2">
                    <label for="configAgendamentoEnabled" class="text-sm font-medium">Ativar agendamento</label>
                    <label class="switch"><input type="checkbox" id="configAgendamentoEnabled" ${agendamento.enabled ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <div id="agendamento-fields" class="${agendamento.enabled ? '' : 'hidden'} space-y-2 mt-2 border-l-2 border-gray-200 pl-4">
                    <div><label class="text-xs font-medium">Antecedência mínima (minutos)</label><input type="number" id="configAgendamentoAntecedencia" class="w-full p-2 border rounded" value="${agendamento.antecedenciaMinutos || '30'}"></div>
                    <div><label class="text-xs font-medium">Agendar para até X dias no futuro</label><input type="number" id="configAgendamentoDias" class="w-full p-2 border rounded" value="${agendamento.diasFuturos || '2'}"></div>
                    <div><label class="text-xs font-medium">Intervalo entre horários (minutos)</label><input type="number" id="configAgendamentoIntervalo" class="w-full p-2 border rounded" value="${agendamento.intervaloMinutos || '15'}"></div>
                </div>
            </div>

            <h4 class="font-bold mt-4 border-t pt-4">Opções de Pedido</h4>
            <div class="space-y-2">
                <div class="flex items-center justify-between"><label class="text-sm font-medium">Permitir pedidos para Entrega</label><label class="switch"><input type="checkbox" id="configPermitirDelivery" ${config.permitirDelivery !== false ? 'checked' : ''}><span class="slider"></span></label></div>
                <div class="flex items-center justify-between"><label class="text-sm font-medium">Permitir pedidos para Consumo no Local</label><label class="switch"><input type="checkbox" id="configPermitirLocal" ${config.permitirLocal ? 'checked' : ''}><span class="slider"></span></label></div>
            </div>
            
            <div id="delivery-section" class="pt-4 border-t mt-4 space-y-4">
                <h4 class="font-bold">Configuração de Entrega</h4>
                
                <div class="p-4 bg-blue-50 rounded-lg">
                    <label for="delivery-system-select" class="block text-sm font-medium text-gray-800 font-semibold">Qual sistema de taxas deseja usar?</label>
                    <select id="delivery-system-select" class="w-full p-2 border rounded mt-1">
                        <option value="simple" ${config.deliverySystem !== 'advanced' ? 'selected' : ''}>Modo Simples (Taxa fixa por Bairro)</option>
                        <option value="advanced" ${config.deliverySystem === 'advanced' ? 'selected' : ''}>Modo Avançado (Múltiplas Regras de CEP/Bairro)</option>
                    </select>
                </div>

                <div id="simple-delivery-container">
                    <h5 class="font-semibold text-md">Regras do Modo Simples</h5>
                    <div id="add-simple-fee-form-container" class="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm items-center mt-2">
                        <input type="text" id="simple-bairro" placeholder="Nome do Bairro" class="md:col-span-1 w-full p-2 border rounded">
                        <input type="number" step="0.01" id="simple-valor" placeholder="Valor R$" class="md:col-span-1 w-full p-2 border rounded">
                        <button type="button" id="add-simple-fee-btn" class="md:col-span-1 bg-blue-500 text-white font-bold py-2 px-3 rounded hover:bg-blue-600">Adicionar Bairro</button>
                    </div>
                    <div id="simple-fees-list" class="space-y-2 my-2 max-h-40 overflow-y-auto pr-2 mt-4"></div>
                </div>

                <div id="advanced-delivery-container" class="hidden">
                    <h5 class="font-semibold text-md">Regras do Modo Avançado (com Prioridade)</h5>
                    <div id="add-advanced-fee-form-container" class="p-4 bg-gray-50 rounded-lg space-y-3 mb-4">
                        <h5 class="font-semibold text-md">Adicionar Nova Regra</h5>
                        <select id="rule-type-select" class="w-full p-2 border rounded mt-1">
                            <option value="cep-range">1. Faixa de CEP (Prioridade Alta)</option>
                            <option value="bairro">2. Bairro Específico (Prioridade Média)</option>
                            <option value="padrao">3. Taxa Padrão / Restante (Prioridade Baixa)</option>
                        </select>
                        <div id="rule-fields-container"></div>
                        <button type="button" id="add-advanced-fee-btn" class="w-full bg-blue-500 text-white font-bold py-2 px-3 rounded hover:bg-blue-600">Adicionar Regra</button>
                    </div>
                    <h5 class="font-semibold text-md mt-4">Regras Atuais (ordem de prioridade)</h5>
                    <div id="advanced-fees-list" class="space-y-2 my-2 max-h-60 overflow-y-auto pr-2 mt-4"></div>
                </div>
            </div>

            <h4 class="font-bold mt-4 border-t pt-4">Formas de Pagamento</h4>
            <div class="space-y-2">
                <div class="flex items-center justify-between"><label class="text-sm font-medium">Aceita Pix</label><label class="switch"><input type="checkbox" id="configAceitaPix" ${config.aceitaPix !== false ? 'checked' : ''}><span class="slider"></span></label></div>
                <div class="flex items-center justify-between"><label class="text-sm font-medium">Aceita Cartão (link de pagamento)</label><label class="switch"><input type="checkbox" id="configAceitaCartao" ${config.aceitaCartao ? 'checked' : ''}><span class="slider"></span></label></div>
                <div class="flex items-center justify-between"><label class="text-sm font-medium">Aceita Dinheiro</label><label class="switch"><input type="checkbox" id="configAceitaDinheiro" ${config.aceitaDinheiro ? 'checked' : ''}><span class="slider"></span></label></div>
            </div>
            <input type="text" id="configPixKey" placeholder="Sua Chave Pix" class="w-full p-2 border rounded mt-2" value="${config.pixKey || ''}">
            <input type="text" id="configCardPaymentLink" placeholder="Link de Pagamento (Cartão)" class="w-full p-2 border rounded mt-2" value="${config.cardPaymentLink || ''}">

            <h4 class="font-bold mt-4 border-t pt-4">Contato</h4>
            <input type="text" id="configWhatsapp" placeholder="Nº WhatsApp (Ex: 55119...)" class="w-full p-2 border rounded" value="${config.whatsappNumber || ''}">

            <h4 class="font-bold mt-4 border-t pt-4">Outras Configurações</h4>
            <div class="flex items-center justify-between">
                <label class="text-sm font-medium">Selo de Verificado</label>
                <label class="switch"><input type="checkbox" id="configVerified" ${config.verified ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            
            <button type="submit" class="w-full bg-green-500 text-white font-bold py-3 px-4 rounded hover:bg-green-600 mt-6">Salvar Configurações</button>
        `;
        
        document.querySelectorAll('.file-input-preview').forEach(input => {
            input.addEventListener('change', function(e) {
                // Fix: Cast e.target to HTMLInputElement to access files.
                const target = e.target as HTMLInputElement;
                const file = target.files[0];
                if (!file) return;
                // Fix: Cast e.target to HTMLElement to access dataset.
                const previewId = (e.target as HTMLElement).dataset.preview;
                const previewEl = document.getElementById(previewId);
                if (previewEl) {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        // Fix: Cast previewEl to HTMLImageElement to set src.
                        (previewEl as HTMLImageElement).src = event.target.result as string;
                    }
                    reader.readAsDataURL(file);
                }
            });
        });

        const systemSelect = document.getElementById('delivery-system-select') as HTMLSelectElement;
        const simpleContainer = document.getElementById('simple-delivery-container');
        const advancedContainer = document.getElementById('advanced-delivery-container');

        function toggleDeliveryModeUI() {
            const isAdvanced = systemSelect.value === 'advanced';
            simpleContainer.classList.toggle('hidden', isAdvanced);
            advancedContainer.classList.toggle('hidden', !isAdvanced);
            // Fix: Cast element to HTMLInputElement to set disabled property.
            document.querySelectorAll('#simple-delivery-container input').forEach(input => (input as HTMLInputElement).disabled = isAdvanced);
            // Fix: Cast element to relevant HTML element types to set disabled property.
            document.querySelectorAll('#advanced-delivery-container input, #advanced-delivery-container select, #advanced-delivery-container button').forEach(el => (el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = !isAdvanced);
        }
        systemSelect.addEventListener('change', toggleDeliveryModeUI);

        document.getElementById('add-simple-fee-btn').addEventListener('click', () => {
            // Fix: Cast elements to HTMLInputElement to access value.
            const bairroInput = document.getElementById('simple-bairro') as HTMLInputElement;
            const valorInput = document.getElementById('simple-valor') as HTMLInputElement;
            const bairro = bairroInput.value.trim();
            const valor = parseFloat(valorInput.value);
            if (!bairro || isNaN(valor)) {
                showToast('Por favor, preencha o nome do bairro e um valor válido.', true);
                return;
            }
            const currentFees = getDeliveryFeesFromUI();
            currentFees.simple.push({ bairro, valor });
            renderDeliveryFees(currentFees);
            bairroInput.value = '';
            valorInput.value = '';
        });

        const ruleTypeSelect = document.getElementById('rule-type-select') as HTMLSelectElement;
        const ruleFieldsContainer = document.getElementById('rule-fields-container');
        function updateRuleFields() {
            const type = ruleTypeSelect.value;
            let fieldsHtml = '';
            if (type === 'cep-range') {
                fieldsHtml = `<div class="grid grid-cols-2 gap-2"><input type="text" id="rule-cep-inicial" placeholder="CEP Inicial" class="w-full p-2 border rounded"><input type="text" id="rule-cep-final" placeholder="CEP Final" class="w-full p-2 border rounded"></div><input type="number" step="0.01" id="rule-valor" placeholder="Valor da Taxa R$" class="w-full p-2 border rounded">`;
            } else if (type === 'bairro') {
                fieldsHtml = `<input type="text" id="rule-bairro" placeholder="Nome Exato do Bairro" class="w-full p-2 border rounded"><input type="number" step="0.01" id="rule-valor" placeholder="Valor da Taxa R$" class="w-full p-2 border rounded">`;
            } else if (type === 'padrao') {
                fieldsHtml = `<input type="number" step="0.01" id="rule-valor" placeholder="Valor da Taxa Padrão R$" class="w-full p-2 border rounded">`;
            }
            ruleFieldsContainer.innerHTML = fieldsHtml;
        }
        ruleTypeSelect.addEventListener('change', updateRuleFields);
        
        document.getElementById('add-advanced-fee-btn').addEventListener('click', () => {
            const type = ruleTypeSelect.value;
            const valorInput = document.getElementById('rule-valor') as HTMLInputElement;
            if (!valorInput || valorInput.value === '') { showToast('Por favor, preencha o valor da taxa.', true); return; }
            const valor = parseFloat(valorInput.value);
            if(isNaN(valor)) { showToast('O valor da taxa é inválido.', true); return; }
            // Fix: Define newRule as any to allow dynamic property assignment.
            let newRule: any = { type, valor };
            if (type === 'cep-range') {
                const cepInicialInput = document.getElementById('rule-cep-inicial') as HTMLInputElement;
                const cepFinalInput = document.getElementById('rule-cep-final') as HTMLInputElement;
                newRule.cepInicial = cepInicialInput ? cepInicialInput.value.replace(/\D/g, '') : '';
                newRule.cepFinal = cepFinalInput ? cepFinalInput.value.replace(/\D/g, '') : '';
                if (!newRule.cepInicial || !newRule.cepFinal) { showToast('Por favor, preencha a faixa de CEP.', true); return; }
            } else if (type === 'bairro') {
                const bairroInput = document.getElementById('rule-bairro') as HTMLInputElement;
                newRule.bairro = bairroInput ? bairroInput.value.trim() : '';
                if (!newRule.bairro) { showToast('Por favor, preencha o nome do bairro.', true); return; }
            }
            const currentFees = getDeliveryFeesFromUI();
            currentFees.advanced.push(newRule);
            renderDeliveryFees(currentFees);
            updateRuleFields(); 
        });

        renderDeliveryFees(config.deliveryFees);
        toggleDeliveryModeUI();
        updateRuleFields();

        document.getElementById('configAgendamentoEnabled').addEventListener('change', (e) => { 
            // Fix: Cast e.target to HTMLInputElement to access checked property.
            document.getElementById('agendamento-fields').classList.toggle('hidden', !(e.target as HTMLInputElement).checked); 
        });
    }

    // Fix: Add type annotation for feesObject parameter.
    function renderDeliveryFees(feesObject: any = {}) {
        feesObject.simple = feesObject.simple || [];
        feesObject.advanced = feesObject.advanced || [];

        const simpleList = document.getElementById('simple-fees-list');
        if (simpleList) {
            simpleList.innerHTML = feesObject.simple.length === 0 ? '<p class="text-xs text-center text-gray-500">Nenhum bairro adicionado.</p>' : '';
            feesObject.simple.forEach((fee, index) => {
                const el = document.createElement('div');
                el.className = 'flex justify-between items-center text-sm p-2 bg-gray-100 rounded';
                el.dataset.rule = JSON.stringify(fee);
                el.innerHTML = `<span><b>Bairro:</b> ${fee.bairro} - <b>Valor:</b> R$ ${fee.valor.toFixed(2)}</span><button type="button" class="remove-fee-btn text-red-500" data-type="simple" data-index="${index}">&times;</button>`;
                simpleList.appendChild(el);
            });
        }

        const advancedList = document.getElementById('advanced-fees-list');
        if(advancedList) {
            advancedList.innerHTML = feesObject.advanced.length === 0 ? '<p class="text-xs text-center text-gray-500">Nenhuma regra adicionada.</p>' : '';
            feesObject.advanced.forEach((fee, index) => {
                let ruleText = '';
                if (fee.type === 'cep-range') {
                    ruleText = `<b>Faixa de CEP:</b> De ${fee.cepInicial} a ${fee.cepFinal}`;
                } else if (fee.type === 'bairro') {
                    ruleText = `<b>Bairro:</b> ${fee.bairro}`;
                } else if (fee.type === 'padrao') {
                    ruleText = `<b>Taxa Padrão (Restante)</b>`;
                }
                const el = document.createElement('div');
                el.className = 'flex justify-between items-center text-sm p-3 bg-gray-100 rounded';
                el.dataset.rule = JSON.stringify(fee);
                el.innerHTML = `<div><p class="font-semibold">${ruleText}</p><p class="text-green-700 font-bold">Valor: R$ ${fee.valor.toFixed(2)}</p></div><button type="button" class="remove-fee-btn text-red-500 text-lg" data-type="advanced" data-index="${index}">&times;</button>`;
                advancedList.appendChild(el);
            });
        }

        document.querySelectorAll('.remove-fee-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Fix: Cast e.currentTarget to HTMLElement to access dataset.
                const target = e.currentTarget as HTMLElement;
                if (!target) return;
                const type = target.dataset.type;
                const index = parseInt(target.dataset.index);
                const currentFees = getDeliveryFeesFromUI();
                if (type === 'simple' && currentFees.simple[index]) {
                    currentFees.simple.splice(index, 1);
                } else if (type === 'advanced' && currentFees.advanced[index]) {
                    currentFees.advanced.splice(index, 1);
                }
                renderDeliveryFees(currentFees);
            });
        });
    }

    function getDeliveryFeesFromUI() {
        // Fix: Cast elements to HTMLElement to access dataset.
        const simpleRules = Array.from(document.querySelectorAll('#simple-fees-list > div')).map(el => JSON.parse((el as HTMLElement).dataset.rule));
        const advancedRules = Array.from(document.querySelectorAll('#advanced-fees-list > div')).map(el => JSON.parse((el as HTMLElement).dataset.rule));
        return {
            simple: simpleRules,
            advanced: advancedRules
        };
    }

    function renderAddItemForm(categories = []) {
        const categoryOptions = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
        const productOptions = allProdutosSimples.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        addItemForm.innerHTML = `<fieldset id="add-item-fieldset"><input type="text" id="newItemName" placeholder="Nome do Item ou Combo" class="w-full p-2 border rounded" required><textarea id="newItemDescription" placeholder="Descrição" class="w-full p-2 border rounded" required></textarea><div class="pt-4 border-t"><label class="block text-sm font-medium text-gray-700">Tipo de Produto</label><div class="flex space-x-4 mt-1"><label><input type="radio" name="productType" value="simples" checked class="product-type-selector"> Simples</label><label><input type="radio" name="productType" value="combo" class="product-type-selector"> Combo</label></div></div><div id="price-section"><input type="number" id="newItemPrice" placeholder="Preço do Item" step="0.01" class="w-full p-2 border rounded" required></div><div id="combo-section" class="hidden space-y-4 p-4 bg-gray-50 rounded-md"><h4 class="font-bold">Itens do Combo</h4><div class="flex space-x-2"><select id="combo-product-select" class="flex-grow p-2 border rounded">${productOptions.length > 0 ? productOptions : '<option disabled>Crie produtos simples primeiro</option>'}</select><button type="button" id="add-combo-item-btn" class="bg-blue-500 text-white px-3 rounded hover:bg-blue-600">Adicionar</button></div><ul id="combo-items-list" class="space-y-2 text-sm"></ul></div><div><label class="block text-sm font-medium text-gray-700">Categoria</label><select id="newItemCategory" class="w-full p-2 border rounded" required>${categoryOptions.length > 0 ? categoryOptions : '<option disabled>Crie uma categoria</option>'}</select></div><div><label class="block text-sm font-medium text-gray-700">Imagens</label><input type="file" id="newItemImages" class="w-full text-sm" multiple accept="image/*"></div><div class="flex items-center justify-between text-sm font-medium text-gray-700 pt-4 border-t"><label for="newItemIsFeatured">⭐ Marcar como Destaque</label><input type="checkbox" id="newItemIsFeatured" class="h-5 w-5 rounded border-gray-300"></div><div class="flex items-center justify-between text-sm font-medium text-gray-700"><label for="newItemIsHidden">🙈 Ocultar do Cardápio</label><input type="checkbox" id="newItemIsHidden" class="h-5 w-5 rounded border-gray-300"></div><div id="option-groups-container" class="space-y-4 border-t pt-4"><h4 class="font-bold">Variações (Opcional)</h4></div><button type="button" id="add-option-group-btn" class="w-full text-sm bg-gray-200 py-2 px-4 rounded">Adicionar Grupo de Opções</button><button type="submit" class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600">Adicionar Item</button></fieldset>`;
        
        const productTypeChangeHandler = (e) => {
            const isCombo = (e.target as HTMLInputElement).value === 'combo';
            
            document.getElementById('combo-section').classList.toggle('hidden', !isCombo);
            (document.getElementById('price-section').querySelector('input') as HTMLInputElement).placeholder = isCombo ? 'Preço do Combo' : 'Preço do Item';
            const optionGroupsContainer = document.getElementById('option-groups-container');
            const addOptionGroupBtn = document.getElementById('add-option-group-btn');

            optionGroupsContainer.classList.toggle('hidden', isCombo);
            addOptionGroupBtn.classList.toggle('hidden', isCombo);

            // Fix: Cast elements to set disabled property.
            document.querySelectorAll('#combo-section select, #combo-section button').forEach(el => (el as HTMLSelectElement | HTMLButtonElement).disabled = !isCombo);
            document.querySelectorAll('#option-groups-container input, #option-groups-container button').forEach(el => (el as HTMLInputElement | HTMLButtonElement).disabled = isCombo);
        };

        addItemForm.querySelectorAll('.product-type-selector').forEach(radio => {
            radio.addEventListener('change', productTypeChangeHandler);
        });

        const initialRadio = addItemForm.querySelector('input[name="productType"]:checked');
        if (initialRadio) {
           productTypeChangeHandler({ target: initialRadio });
        }

        document.getElementById('add-combo-item-btn').addEventListener('click', () => {
            // Fix: Cast select element to access value, options, selectedIndex.
            const select = document.getElementById('combo-product-select') as HTMLSelectElement;
            if(!select.value) return;
            const productId = select.value, productName = select.options[select.selectedIndex].text, list = document.getElementById('combo-items-list');
            if (productId && !list.querySelector(`li[data-id="${productId}"]`)) {
                const li = document.createElement('li');
                li.dataset.id = productId; li.dataset.name = productName;
                li.className = 'flex justify-between items-center bg-white p-2 rounded';
                li.innerHTML = `<span>${productName}</span><button type="button" class="text-red-500 remove-combo-item">&times;</button>`;
                list.appendChild(li);
            }
        });
        document.getElementById('combo-items-list').addEventListener('click', (e) => { 
            // Fix: Cast e.target to HTMLElement to access classList and parentElement.
            const target = e.target as HTMLElement;
            if (target.classList.contains('remove-combo-item')) target.parentElement.remove(); 
        });
        document.getElementById('add-option-group-btn').addEventListener('click', () => addOptionGroup('option-groups-container'));
    }
    
    function renderProdutosList(produtos) {
        produtosList.innerHTML = '';
        produtos.forEach(produto => {
            const el = document.createElement('div');
            el.className = `flex items-center justify-between p-2 border-b ${produto.isHidden ? 'opacity-50 bg-gray-100' : ''}`;
            let typeBadge = '';
            if(produto.productType === 'combo') { typeBadge = '<span class="ml-2 text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded-full">Combo</span>'; }
            el.innerHTML = `<div class="flex items-center space-x-3 min-w-0"><img src="${(produto.imageUrls && produto.imageUrls[0]) || 'https://placehold.co/40x40'}" alt="${produto.name}" class="w-10 h-10 rounded object-cover"><div><p class="font-semibold truncate">${produto.name}${typeBadge}</p><div class="flex items-center text-xs text-gray-500">${produto.isFeatured ? '<span class="mr-2 text-yellow-500">⭐ Destaque</span>' : ''}${produto.isHidden ? '<span class="text-red-500">🙈 Oculto</span>' : ''}</div></div></div><div><button class="edit-item-btn text-blue-500 hover:text-blue-700" data-id="${produto.id}"><i class="fas fa-edit"></i></button><button class="delete-item-btn text-red-500 hover:text-red-700 ml-2" data-id="${produto.id}"><i class="fas fa-trash"></i></button></div>`;
            produtosList.appendChild(el);
        });
    }

    function renderCategoryList(categories = []) {
        categoryList.innerHTML = '';
        if (categories.length === 0) { categoryList.innerHTML = `<p class="text-sm text-gray-500">Nenhuma categoria encontrada.</p>`; return; }
        categories.forEach(cat => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between p-2 bg-gray-50 rounded-md';
            el.innerHTML = `<span>${cat.name}</span><button class="delete-category-btn text-red-500 hover:text-red-700 text-sm" data-id="${cat.id}"><i class="fas fa-trash"></i></button>`;
            categoryList.appendChild(el);
        });
    }

    function renderEditModal(id, item, categories = []) {
        const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${item.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');
        const productOptions = allProdutosSimples.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        editItemModal.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><h3 class="text-xl font-bold text-gray-800 mb-4">Editar Item</h3><form id="edit-item-form" class="space-y-4"><input type="hidden" id="editItemId" value="${id}"><input type="text" id="editItemName" class="w-full p-2 border rounded" required value="${item.name || ''}"><textarea id="editItemDescription" class="w-full p-2 border rounded" required>${item.description || ''}</textarea><div class="pt-4 border-t"><label class="block text-sm font-medium">Tipo de Produto</label><div class="flex space-x-4 mt-1"><label><input type="radio" name="editProductType" value="simples" ${(!item.productType || item.productType === 'simples') ? 'checked' : ''} class="edit-product-type-selector"> Simples</label><label><input type="radio" name="editProductType" value="combo" ${item.productType === 'combo' ? 'checked' : ''} class="edit-product-type-selector"> Combo</label></div></div><div id="edit-price-section"><input type="number" id="editItemPrice" step="0.01" class="w-full p-2 border rounded" required value="${item.price || ''}"></div><div id="edit-combo-section" class="hidden space-y-4 p-4 bg-gray-50 rounded-md"><h4 class="font-bold">Itens do Combo</h4><div class="flex space-x-2"><select id="edit-combo-product-select" class="flex-grow p-2 border rounded">${productOptions}</select><button type="button" id="edit-add-combo-item-btn" class="bg-blue-500 text-white px-3 rounded hover:bg-blue-600">Adicionar</button></div><ul id="edit-combo-items-list" class="space-y-2 text-sm"></ul></div><div><label class="block text-sm font-medium">Categoria</label><select id="editItemCategory" class="w-full p-2 border rounded" required>${categoryOptions}</select></div><div class="flex items-center justify-between text-sm font-medium text-gray-700 pt-4 border-t"><label for="editItemIsFeatured">⭐ Marcar como Destaque</label><input type="checkbox" id="editItemIsFeatured" class="h-5 w-5 rounded border-gray-300" ${item.isFeatured ? 'checked' : ''}></div><div class="flex items-center justify-between text-sm font-medium text-gray-700"><label for="editItemIsHidden">🙈 Ocultar do Cardápio</label><input type="checkbox" id="editItemIsHidden" class="h-5 w-5 rounded border-gray-300" ${item.isHidden ? 'checked' : ''}></div><div id="edit-option-groups-container" class="space-y-4 border-t pt-4"><h4 class="font-bold">Variações</h4></div><button type="button" id="edit-add-option-group-btn" class="w-full text-sm bg-gray-200 font-semibold py-2 px-4 rounded">Adicionar Grupo de Opções</button><div><label class="block text-sm font-medium">Imagens Atuais</label><div id="current-images-gallery" class="mt-2 grid grid-cols-4 gap-2"></div></div><div><label class="block text-sm font-medium">Adicionar mais imagens</label><input type="file" id="editItemImages" class="w-full text-sm" multiple></div><div class="flex justify-end space-x-2"><button type="button" id="cancel-edit-btn" class="bg-gray-300 font-bold py-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-blue-500 text-white font-bold py-2 px-4 rounded">Salvar</button></div></form></div>`;
        
        const editProductTypeChangeHandler = (e) => {
            const isCombo = (e.target as HTMLInputElement).value === 'combo';
            editItemModal.querySelector('#edit-combo-section').classList.toggle('hidden', !isCombo);
            editItemModal.querySelector('#edit-option-groups-container').classList.toggle('hidden', isCombo);
            editItemModal.querySelector('#edit-add-option-group-btn').classList.toggle('hidden', isCombo);
            // Fix: Cast element to HTMLInputElement to set placeholder.
            (editItemModal.querySelector('#edit-price-section input') as HTMLInputElement).placeholder = isCombo ? 'Preço do Combo' : 'Preço do Item';
            
            // Fix: Cast elements to set disabled property.
            editItemModal.querySelectorAll('#edit-combo-section select, #edit-combo-section button').forEach(el => (el as HTMLSelectElement | HTMLButtonElement).disabled = !isCombo);
            editItemModal.querySelectorAll('#edit-option-groups-container input, #edit-option-groups-container button').forEach(el => (el as HTMLInputElement | HTMLButtonElement).disabled = isCombo);
        };

        editItemModal.querySelectorAll('.edit-product-type-selector').forEach(radio => {
            radio.addEventListener('change', editProductTypeChangeHandler);
        });
        
        const initialEditRadio = editItemModal.querySelector('input[name="editProductType"]:checked');
        if(initialEditRadio) {
            editProductTypeChangeHandler({ target: initialEditRadio });
        }

        const gallery = editItemModal.querySelector('#current-images-gallery'); gallery.innerHTML = '';
        (item.imageUrls || []).forEach(url => { const imgContainer = document.createElement('div'); imgContainer.className = 'relative group'; imgContainer.innerHTML = `<img src="${url}" class="w-full h-20 object-cover rounded"><button type="button" class="remove-image-btn absolute top-0 right-0 bg-red-600 text-white rounded-full h-6 w-6 opacity-0 group-hover:opacity-100">&times;</button>`; gallery.appendChild(imgContainer); });
        
        if (item.optionGroups) { 
            item.optionGroups.forEach(group => addOptionGroup('edit-option-groups-container', group)); 
        }

        if (item.comboItems) {
            const list = editItemModal.querySelector('#edit-combo-items-list');
            list.innerHTML = '';
            item.comboItems.forEach(ci => { const li = document.createElement('li'); li.dataset.id = ci.id; li.dataset.name = ci.name; li.className = 'flex justify-between items-center bg-white p-2 rounded'; li.innerHTML = `<span>${ci.name}</span><button type="button" class="text-red-500 remove-combo-item">&times;</button>`; list.appendChild(li); });
        }
        editItemModal.classList.remove('hidden');
    }
    
    // --- Option Groups Logic ---
    let groupCounter = 0;
    // Fix: Add type annotation for groupData parameter.
    function addOptionGroup(containerId, groupData: any = {}) {
        const container = document.getElementById(containerId); const groupId = `group-${groupCounter++}`; const groupEl = document.createElement('div'); groupEl.className = 'p-4 border rounded-md space-y-3 bg-gray-50 relative'; groupEl.innerHTML = `<button type="button" class="absolute top-2 right-2 text-red-500 remove-group-btn text-xl">&times;</button><input type="text" class="w-full p-2 border rounded font-semibold" placeholder="Nome do Grupo (Ex: Tamanho)" value="${groupData.name || ''}" required><div class="flex items-center space-x-4 text-sm"><div><input type="radio" id="${groupId}-single" name="${groupId}-type" value="single" ${groupData.type === 'single' || !groupData.type ? 'checked' : ''}><label for="${groupId}-single">Escolha Única</label></div><div><input type="radio" id="${groupId}-multiple" name="${groupId}-type" value="multiple" ${groupData.type === 'multiple' ? 'checked' : ''}><label for="${groupId}-multiple">Múltipla</label></div></div><div class="options-container space-y-2"></div><button type="button" class="w-full text-xs bg-blue-100 text-blue-800 font-semibold py-1 px-2 rounded add-option-btn">Adicionar Opção</button>`;
        container.appendChild(groupEl); if (groupData.options) { groupData.options.forEach(option => addOptionToGroup(groupEl.querySelector('.options-container'), option)); }
        groupEl.querySelector('.add-option-btn').addEventListener('click', (e) => { 
            // Fix: Cast target to HTMLElement to access previousElementSibling.
            addOptionToGroup((e.target as HTMLElement).previousElementSibling as HTMLElement); 
        });
        groupEl.querySelector('.remove-group-btn').addEventListener('click', () => groupEl.remove());
    }
    // Fix: Add type annotation for optionData parameter.
    function addOptionToGroup(container, optionData: any = {}) {
        const optionEl = document.createElement('div'); optionEl.className = 'flex items-center space-x-2'; optionEl.innerHTML = `<input type="text" class="flex-grow p-1 border rounded text-sm option-name" placeholder="Nome (Ex: Bacon)" value="${optionData.name || ''}" required><input type="number" class="w-24 p-1 border rounded text-sm option-price" placeholder="Preço" step="0.01" value="${optionData.price !== undefined ? optionData.price : ''}"><button type="button" class="text-gray-500 remove-option-btn text-xl">&times;</button>`;
        container.appendChild(optionEl); optionEl.querySelector('.remove-option-btn').addEventListener('click', () => optionEl.remove());
    }
    function getOptionGroupsFromForm(containerId) { const container = document.getElementById(containerId); if (!container) return []; return Array.from(container.querySelectorAll('.p-4.border')).map(groupEl => ({ 
        // Fix: Cast elements to access value property.
        name: (groupEl.querySelector('input[type="text"]') as HTMLInputElement).value, 
        type: (groupEl.querySelector('input[type="radio"]:checked') as HTMLInputElement).value, 
        options: Array.from(groupEl.querySelectorAll('.options-container > div')).map(optEl => ({ 
            name: (optEl.querySelector('.option-name') as HTMLInputElement).value, 
            price: parseFloat((optEl.querySelector('.option-price') as HTMLInputElement).value) || 0 
        })) 
    })).filter(group => group.name && group.options.length > 0 && group.options.every(opt => opt.name)); }
    
    // --- API & Actions ---
    function updateOrderStatus(orderId, newStatus) { db.collection('pedidos').doc(orderId).update({ status: newStatus }).then(() => showToast(`Pedido atualizado.`)).catch(() => showToast('Erro ao atualizar.', true)); }
    function showCancelModal(orderId) { cancelOrderModal.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md"><h3 class="text-xl font-bold mb-4">Cancelar Pedido #${orderId.substring(0,6)}</h3><form id="cancel-form" class="space-y-4"><div><label for="cancellation-reason" class="block text-sm font-medium">Motivo</label><textarea id="cancellation-reason" rows="3" class="w-full p-2 border rounded mt-1" required></textarea></div><div class="flex items-center"><input type="checkbox" id="was-paid" class="h-4 w-4 rounded"><label for="was-paid" class="ml-2 block text-sm">O cliente já pagou?</label></div><div class="flex justify-end space-x-2"><button type="button" id="cancel-modal-close" class="bg-gray-300 font-bold py-2 px-4 rounded">Voltar</button><button type="submit" class="bg-red-500 text-white font-bold py-2 px-4 rounded">Confirmar</button></div></form></div>`; cancelOrderModal.classList.remove('hidden'); cancelOrderModal.querySelector('#cancel-modal-close').addEventListener('click', () => cancelOrderModal.classList.add('hidden')); cancelOrderModal.querySelector('#cancel-form').addEventListener('submit', (e) => { e.preventDefault(); db.collection('pedidos').doc(orderId).update({ status: 'cancelado', cancellationReason: (e.target as any)['cancellation-reason'].value, wasPaid: (e.target as any)['was-paid'].checked }).then(() => { showToast('Pedido cancelado.'); cancelOrderModal.classList.add('hidden'); }).catch(() => showToast('Erro ao cancelar.', true)); }); }
    
    async function uploadFilesToCloudinary(files) {
        const { cloudinaryCloudName, cloudinaryUploadPreset } = storeConfig;
        if (!cloudinaryCloudName || !cloudinaryUploadPreset) {
            showToast("Configuração do Cloudinary está em falta no painel.", true);
            return [];
        }
        // Fix: Cast files to FileList before using Array.from.
        const uploadPromises = Array.from(files as FileList).map(file => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', cloudinaryUploadPreset);
            return fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`, { method: 'POST', body: formData }).then(res => res.ok ? res.json() : Promise.reject('Falha no upload'));
        });
        try {
            const results = await Promise.all(uploadPromises);
            return results.map(res => res.secure_url);
        } catch (error) {
            console.error("Erro no upload para o Cloudinary:", error);
            showToast("Erro no upload de imagens.", true);
            return [];
        }
    }
    
    // --- Utilities ---
    function showToast(message, isError = false) { 
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast p-4 rounded-lg shadow-lg text-white ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.classList.add('show'); }, 100);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { toast.remove(); }, 500); }, 4000);
    }
    
    // --- Event Listeners Setup ---
    document.querySelectorAll('.tab-link').forEach(button => { button.addEventListener('click', (e) => { 
        e.preventDefault(); 
        document.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active')); 
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active')); 
        // Fix: Cast currentTarget to HTMLElement to access classList and dataset.
        const currentTarget = e.currentTarget as HTMLElement;
        currentTarget.classList.add('active'); 
        document.getElementById(currentTarget.dataset.tab).classList.add('active'); 
    }); });
    pedidosTab.addEventListener('click', e => { 
        // Fix: Cast target to Element to use closest.
        const target = e.target as Element;
        const updateBtn = target.closest('.update-status-btn') as HTMLElement; 
        const cancelBtn = target.closest('.cancel-order-btn') as HTMLElement; 
        if (updateBtn) updateOrderStatus(updateBtn.dataset.id, updateBtn.dataset.status); 
        if (cancelBtn) showCancelModal(cancelBtn.dataset.id); 
    });

    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Fix: Cast e.target to HTMLElement to use querySelector.
        const target = e.target as HTMLElement;
        const submitButton = target.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="spinner mx-auto" style="width: 24px; height: 24px; border-left-color: white;"></div> Salvando...';
        try {
            // Fix: Cast elements to HTMLInputElement to access files.
            const profilePicFile = (document.getElementById('configProfilePic') as HTMLInputElement).files[0];
            const coverPhotoFile = (document.getElementById('configCoverPhoto') as HTMLInputElement).files[0];
            let profilePicUrl, coverPhotoUrl;
            if (profilePicFile) { const urls = await uploadFilesToCloudinary(new Array(profilePicFile)); if (urls.length > 0) profilePicUrl = urls[0]; }
            if (coverPhotoFile) { const urls = await uploadFilesToCloudinary(new Array(coverPhotoFile)); if (urls.length > 0) coverPhotoUrl = urls[0]; }
            const horarios = {};
            ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'].forEach(dia => {
                horarios[dia] = {
                    // Fix: Cast elements to HTMLInputElement to access checked/value.
                    aberto: (document.getElementById(`horario-${dia}-aberto`) as HTMLInputElement).checked,
                    inicio: (document.getElementById(`horario-${dia}-inicio`) as HTMLInputElement).value,
                    fim: (document.getElementById(`horario-${dia}-fim`) as HTMLInputElement).value
                };
            });
            // Fix: Define dataToSave as any to allow conditional property assignment.
            const dataToSave: any = {
                // Fix: Cast elements to access value/checked.
                name: (document.getElementById('configName') as HTMLInputElement).value,
                bio: (document.getElementById('configBio') as HTMLTextAreaElement).value,
                slug: (document.getElementById('configSlug') as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, '-'),
                cloudinaryCloudName: (document.getElementById('configCloudinaryCloudName') as HTMLInputElement).value.trim(),
                cloudinaryUploadPreset: (document.getElementById('configCloudinaryUploadPreset') as HTMLInputElement).value.trim(),
                horarios,
                address: (document.getElementById('configAddress') as HTMLInputElement).value,
                instagram: (document.getElementById('configInstagram') as HTMLInputElement).value,
                facebook: (document.getElementById('configFacebook') as HTMLInputElement).value,
                verified: (document.getElementById('configVerified') as HTMLInputElement).checked,
                agendamento: {
                    enabled: (document.getElementById('configAgendamentoEnabled') as HTMLInputElement).checked,
                    antecedenciaMinutos: parseInt((document.getElementById('configAgendamentoAntecedencia') as HTMLInputElement).value) || 30,
                    diasFuturos: parseInt((document.getElementById('configAgendamentoDias') as HTMLInputElement).value) || 2,
                    intervaloMinutos: parseInt((document.getElementById('configAgendamentoIntervalo') as HTMLInputElement).value) || 15,
                },
                deliverySystem: (document.getElementById('delivery-system-select') as HTMLSelectElement).value,
                deliveryFees: getDeliveryFeesFromUI(),
                permitirDelivery: (document.getElementById('configPermitirDelivery') as HTMLInputElement).checked,
                permitirLocal: (document.getElementById('configPermitirLocal') as HTMLInputElement).checked,
                aceitaPix: (document.getElementById('configAceitaPix') as HTMLInputElement).checked,
                aceitaCartao: (document.getElementById('configAceitaCartao') as HTMLInputElement).checked,
                aceitaDinheiro: (document.getElementById('configAceitaDinheiro') as HTMLInputElement).checked,
                pixKey: (document.getElementById('configPixKey') as HTMLInputElement).value,
                cardPaymentLink: (document.getElementById('configCardPaymentLink') as HTMLInputElement).value,
                whatsappNumber: (document.getElementById('configWhatsapp') as HTMLInputElement).value,
            };
            if (profilePicUrl) dataToSave.profilePicUrl = profilePicUrl;
            if (coverPhotoUrl) dataToSave.coverPhotoUrl = coverPhotoUrl;
            await db.collection('empresas').doc(userEmpresaId).set(dataToSave, { merge: true });
            showToast('Configurações salvas com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar config: ", error);
            showToast('Erro ao salvar configurações.', true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Configurações';
        }
    });
    
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Fix: Cast e.target to HTMLElement to use querySelector.
        const target = e.target as HTMLElement;
        const submitButton = target.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitButton.disabled = true; submitButton.textContent = 'Adicionando...';
        try {
            // Fix: Cast to HTMLInputElement to access files.
            const imageFiles = (document.getElementById('newItemImages') as HTMLInputElement).files; let uploadedUrls = []; if(imageFiles.length > 0) uploadedUrls = await uploadFilesToCloudinary(imageFiles);
            // Fix: Cast to HTMLInputElement to access value.
            const productType = (addItemForm.querySelector('input[name="productType"]:checked') as HTMLInputElement).value;
            // Fix: Define newItem as any to allow dynamic property assignment.
            const newItem: any = { 
                empresa_id: userEmpresaId, 
                name: (document.getElementById('newItemName') as HTMLInputElement).value, 
                description: (document.getElementById('newItemDescription') as HTMLTextAreaElement).value, 
                price: parseFloat((document.getElementById('newItemPrice') as HTMLInputElement).value), 
                categoryId: (document.getElementById('newItemCategory') as HTMLSelectElement).value, 
                imageUrls: uploadedUrls, 
                createdAt: firebase.firestore.FieldValue.serverTimestamp(), 
                isFeatured: (document.getElementById('newItemIsFeatured') as HTMLInputElement).checked, 
                isHidden: (document.getElementById('newItemIsHidden') as HTMLInputElement).checked, 
                productType: productType 
            };
            if (productType === 'combo') { 
                // Fix: Cast li to HTMLLIElement to access dataset.
                newItem.comboItems = Array.from(addItemForm.querySelectorAll('#combo-items-list li')).map(li => ({ id: (li as HTMLLIElement).dataset.id, name: (li as HTMLLIElement).dataset.name })); 
            } else { 
                newItem.optionGroups = getOptionGroupsFromForm('option-groups-container'); 
            }
            await db.collection('produtos').add(newItem);
            showToast('Item adicionado com sucesso!');
            renderAddItemForm(categories);
        } catch (error) { console.error("Erro ao adicionar item: ", error); showToast('Erro ao adicionar item.', true);
        } finally { submitButton.disabled = false; submitButton.textContent = 'Adicionar Item'; }
    });
    
    editItemModal.addEventListener('submit', async e => {
        e.preventDefault();
        // Fix: Cast e.target to Element to use closest.
        const form = (e.target as Element).closest('form');
        const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitButton.disabled = true; submitButton.textContent = 'Salvando...';
        try {
            const id = (form.querySelector('#editItemId') as HTMLInputElement).value;
            // Fix: Cast img to HTMLImageElement to access src.
            const existingImages = Array.from(form.querySelectorAll('#current-images-gallery img')).map(img => (img as HTMLImageElement).src);
            const newImageFiles = (form.querySelector('#editItemImages') as HTMLInputElement).files; let newUploadedUrls = []; if (newImageFiles.length > 0) newUploadedUrls = await uploadFilesToCloudinary(newImageFiles);
            const productType = (form.querySelector('input[name="editProductType"]:checked') as HTMLInputElement).value;
            // Fix: Define updatedData as any to allow dynamic property assignment.
            const updatedData: any = { 
                name: (form.querySelector('#editItemName') as HTMLInputElement).value, 
                description: (form.querySelector('#editItemDescription') as HTMLTextAreaElement).value, 
                price: parseFloat((form.querySelector('#editItemPrice') as HTMLInputElement).value), 
                categoryId: (form.querySelector('#editItemCategory') as HTMLSelectElement).value, 
                imageUrls: [...existingImages, ...newUploadedUrls], 
                isFeatured: (form.querySelector('#editItemIsFeatured') as HTMLInputElement).checked, 
                isHidden: (form.querySelector('#editItemIsHidden') as HTMLInputElement).checked, 
                productType: productType 
            };
            if (productType === 'combo') {
                // Fix: Cast li to HTMLLIElement to access dataset.
                updatedData.comboItems = Array.from(form.querySelectorAll('#edit-combo-items-list li')).map(li => ({ id: (li as HTMLLIElement).dataset.id, name: (li as HTMLLIElement).dataset.name }));
                updatedData.optionGroups = firebase.firestore.FieldValue.delete();
            } else {
                updatedData.optionGroups = getOptionGroupsFromForm('edit-option-groups-container');
                updatedData.comboItems = firebase.firestore.FieldValue.delete();
            }
            await db.collection('produtos').doc(id).update(updatedData);
            showToast('Item atualizado!');
            editItemModal.classList.add('hidden');
        } catch (error) { console.error("Erro ao atualizar item: ", error); showToast('Erro ao salvar.', true);
        } finally { submitButton.disabled = false; submitButton.textContent = 'Salvar'; }
    });

    addCategoryForm.addEventListener('submit', e => { 
        e.preventDefault(); 
        // Fix: Cast e.target to any to access form fields and reset.
        const target = e.target as any;
        const name = target.newCategoryName.value.trim(); 
        if (name) { 
            db.collection('categorias').add({ name: name, empresa_id: userEmpresaId }).then(() => { showToast('Categoria adicionada!'); target.reset(); }).catch(() => showToast('Erro ao adicionar.', true)); 
        } 
    });
    categoryList.addEventListener('click', e => { 
        // Fix: Cast e.target to Element to use closest.
        const deleteButton = (e.target as Element).closest('.delete-category-btn') as HTMLElement; 
        if (deleteButton) { 
            const id = deleteButton.dataset.id; if (confirm('Tem a certeza?')) { db.collection('categorias').doc(id).delete().then(() => showToast('Categoria apagada.')).catch(() => showToast('Erro ao apagar.', true)); } 
        } 
    });
    editItemModal.addEventListener('click', e => {
        // Fix: Cast e.target to Element/HTMLElement to access properties.
        const target = e.target as HTMLElement;
        if (target.id === 'cancel-edit-btn' || target.closest('#cancel-edit-btn') || target === editItemModal) { editItemModal.classList.add('hidden'); }
        const removeButton = target.closest('.remove-image-btn'); if(removeButton) { removeButton.parentElement.remove(); }
        if(target.closest('.edit-product-type-selector')) {
            const isComboNow = (target as HTMLInputElement).value === 'combo';
            editItemModal.querySelector('#edit-combo-section').classList.toggle('hidden', !isComboNow);
            editItemModal.querySelector('#edit-option-groups-container').classList.toggle('hidden', isComboNow);
            editItemModal.querySelector('#edit-add-option-group-btn').classList.toggle('hidden', isComboNow);
        }
        if(target.id === 'edit-add-combo-item-btn'){
            // Fix: Cast select to HTMLSelectElement.
            const select = editItemModal.querySelector('#edit-combo-product-select') as HTMLSelectElement;
            if(!select.value) return;
            const productId = select.value, productName = select.options[select.selectedIndex].text, list = editItemModal.querySelector('#edit-combo-items-list');
            if (productId && !list.querySelector(`li[data-id="${productId}"]`)) {
                const li = document.createElement('li');
                li.dataset.id = productId; li.dataset.name = productName;
                li.className = 'flex justify-between items-center bg-white p-2 rounded';
                li.innerHTML = `<span>${productName}</span><button type="button" class="text-red-500 remove-combo-item">&times;</button>`;
                list.appendChild(li);
            }
        }
        // Fix: Cast target to check classList and use parentElement.
        if(target.classList.contains('remove-combo-item')){ target.parentElement.remove(); }
    });
    produtosList.addEventListener('click', async e => {
        // Fix: Cast e.target to Element.
        const target = e.target as Element;
        const deleteButton = target.closest('.delete-item-btn') as HTMLElement;
        const editButton = target.closest('.edit-item-btn') as HTMLElement;
        if (deleteButton) { const id = deleteButton.dataset.id; if (confirm('Tem certeza?')) { try { await db.collection('produtos').doc(id).delete(); showToast('Item apagado.'); } catch (error) { showToast('Erro ao apagar.', true); } } }
        if (editButton) { const id = editButton.dataset.id; try { const doc = await db.collection('produtos').doc(id).get(); if (doc.exists) { renderEditModal(id, doc.data(), categories); } else { showToast('Item não encontrado.', true); } } catch (error) { showToast('Erro ao carregar item.', true); } }
    });
    
    // --- Relatórios Tab & AI Analysis ---
    function setupReportTab() {
        // Fix: Cast elements to HTMLInputElement.
        const startDateInput = document.getElementById('start-date') as HTMLInputElement;
        const endDateInput = document.getElementById('end-date') as HTMLInputElement;
        const getLocalDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        endDateInput.value = getLocalDate();
        startDateInput.value = getLocalDate();

        document.getElementById('filter-today').addEventListener('click', () => { endDateInput.value = getLocalDate(); startDateInput.value = getLocalDate(); });
        document.getElementById('filter-yesterday').addEventListener('click', () => { const y = new Date(); y.setDate(y.getDate() - 1); endDateInput.value = getLocalDate(y); startDateInput.value = getLocalDate(y); });
        document.getElementById('filter-7-days').addEventListener('click', () => { const t = new Date(); const s = new Date(); s.setDate(t.getDate() - 6); endDateInput.value = getLocalDate(t); startDateInput.value = getLocalDate(s); });
        document.getElementById('filter-this-month').addEventListener('click', () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth(), 1); endDateInput.value = getLocalDate(t); startDateInput.value = getLocalDate(f); });

        document.getElementById('generate-report-btn').addEventListener('click', async () => {
            // Fix: Cast to HTMLButtonElement.
            const btn = document.getElementById('generate-report-btn') as HTMLButtonElement;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner mx-auto" style="width: 20px; height: 20px; border-left-color: white;"></div>';

            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            if (!startDate || !endDate) {
                showToast("Por favor, selecione as datas de início e fim.", true);
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }
            reportData = await fetchReportData(startDate, endDate);
            displayReportSummary(reportData);
            btn.disabled = false;
            btn.innerHTML = originalText;
        });

        document.getElementById('download-excel-btn').addEventListener('click', () => {
            if (reportData.length === 0) {
                showToast("Nenhum dado para exportar. Gere um relatório primeiro.", true);
                return;
            }
            exportToExcel(reportData, startDateInput.value, endDateInput.value);
        });

        document.getElementById('analyze-report-btn').addEventListener('click', handleAIAnalysis);
    }

    function displayReportSummary(data) {
        const summaryContainer = document.getElementById('report-summary');
        // Fix: Cast buttons to HTMLButtonElement to set disabled property.
        const analyzeBtn = document.getElementById('analyze-report-btn') as HTMLButtonElement;
        const excelBtn = document.getElementById('download-excel-btn') as HTMLButtonElement;
        const aiContainer = document.getElementById('ai-analysis-container');
        
        aiContainer.classList.add('hidden'); // Hide previous analysis

        if (data.length === 0) {
            summaryContainer.classList.add('hidden');
            excelBtn.disabled = true;
            analyzeBtn.disabled = true;
            showToast("Nenhum pedido encontrado para o período selecionado.");
            return;
        }

        const completedOrders = data.filter(p => p.status === 'concluido');
        const canceledOrders = data.filter(p => p.status === 'cancelado');
        const totalRevenue = completedOrders.reduce((acc, order) => acc + order.total, 0);
        const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

        document.getElementById('summary-total').textContent = `R$ ${totalRevenue.toFixed(2)}`;
        document.getElementById('summary-completed-orders').textContent = completedOrders.length.toString();
        document.getElementById('summary-canceled-orders').textContent = canceledOrders.length.toString();
        document.getElementById('summary-avg-ticket').textContent = `R$ ${avgTicket.toFixed(2)}`;
        
        summaryContainer.classList.remove('hidden');
        excelBtn.disabled = false;
        analyzeBtn.disabled = false;
    }

    async function fetchReportData(startDate, endDate) {
        if (!userEmpresaId) return [];
        const query = db.collection('pedidos')
                          .where('empresa_id', '==', userEmpresaId)
                          .where('date', '>=', startDate)
                          .where('date', '<=', endDate);
        try {
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Erro ao buscar relatório:", error);
            showToast("Erro ao buscar dados do relatório.", true);
            if (error.code === 'failed-precondition') {
                showToast("É necessário criar um índice no Firestore. Verifique a consola do navegador (F12) para o link.", true);
            }
            return [];
        }
    }
    
    async function handleAIAnalysis() {
        if (!reportData || reportData.length === 0) {
            showToast("Gere um relatório primeiro para poder analisar.", true);
            return;
        }

        // Fix: Cast button to HTMLButtonElement.
        const btn = document.getElementById('analyze-report-btn') as HTMLButtonElement;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner mx-auto" style="width: 20px; height: 20px; border-left-color: white;"></div>';

        const aiContainer = document.getElementById('ai-analysis-container');
        const aiResultEl = document.getElementById('ai-analysis-result');
        aiResultEl.textContent = 'Analisando dados...';
        aiContainer.classList.remove('hidden');

        try {
            // Fix: Cast inputs to HTMLInputElement to access value.
            const prompt = generateAIPrompt(reportData, (document.getElementById('start-date') as HTMLInputElement).value, (document.getElementById('end-date') as HTMLInputElement).value);
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
            });
            aiResultEl.textContent = response.text;
        } catch (error) {
            console.error("Erro na análise com IA:", error);
            aiResultEl.textContent = "Ocorreu um erro ao tentar analisar os dados. Por favor, tente novamente.";
            showToast("Erro na comunicação com a IA.", true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    function generateAIPrompt(data, startDate, endDate) {
        const completedOrders = data.filter(p => p.status === 'concluido');
        const totalRevenue = completedOrders.reduce((acc, order) => acc + order.total, 0);
        const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
        const itemsCount = {};
        completedOrders.forEach(order => {
            (order.items || []).forEach(item => {
                itemsCount[item.name] = (itemsCount[item.name] || 0) + item.quantity;
            });
        });
        // Fix: Cast sort parameters to numbers.
        const topItems = Object.entries(itemsCount).sort(([,a],[,b]) => (b as number)-(a as number)).slice(0, 5)
                               .map(([name, qty]) => `- ${name}: ${qty} vendidos`).join('\n');
        
        return `Você é um analista de negócios especialista em restaurantes. Analise os seguintes dados de vendas e forneça insights e recomendações em português.

        **Dados do Período:**
        - **Período:** ${startDate} a ${endDate}
        - **Faturamento Total (Pedidos Concluídos):** R$ ${totalRevenue.toFixed(2)}
        - **Total de Pedidos Concluídos:** ${completedOrders.length}
        - **Total de Pedidos Cancelados:** ${data.filter(p => p.status === 'cancelado').length}
        - **Ticket Médio:** R$ ${avgTicket.toFixed(2)}
        - **Top 5 Itens Mais Vendidos:**
        ${topItems || 'Nenhum item vendido.'}

        **Sua Tarefa:**
        Forneça uma análise concisa em português com:
        1.  **Resumo Geral:** Uma visão geral do desempenho.
        2.  **Observações Chave:** Destaque tendências importantes (itens populares, etc.).
        3.  **Recomendações Acionáveis:** Dê de 2 a 3 sugestões claras para o dono do restaurante para aumentar as vendas ou melhorar a operação com base nos dados fornecidos.`;
    }

    function exportToExcel(data, startDate, endDate) {
        const completedOrders = data.filter(p => p.status === 'concluido');
        const totalRevenue = completedOrders.reduce((acc, order) => acc + order.total, 0);
        const summaryData = [
            { Metrica: "Período do Relatório", Valor: `${startDate} a ${endDate}` },
            { Metrica: "Faturamento Total (Pedidos Concluídos)", Valor: `R$ ${totalRevenue.toFixed(2)}` },
            { Metrica: "Total de Pedidos no Período", Valor: data.length },
            { Metrica: "Pedidos Concluídos", Valor: completedOrders.length },
            { Metrica: "Pedidos Cancelados", Valor: data.filter(p=>p.status === 'cancelado').length },
            { Metrica: "Ticket Médio", Valor: `R$ ${(completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0).toFixed(2)}` }
        ];
        const wsSummary = XLSX.utils.json_to_sheet(summaryData, { skipHeader: true });
        wsSummary["!cols"] = [ { wch: 40 }, { wch: 20 } ];

        const detailedOrdersData = data.map(order => ({
            "Nº Pedido": order.orderNumber || order.id.substring(0,6),
            "Data": order.date,
            "Hora": new Date(order.timestamp?.seconds * 1000).toLocaleTimeString('pt-BR'),
            "Status": order.status,
            "Cliente": order.clientName,
            "Telefone": order.clientPhone,
            "Tipo": order.orderType,
            "Itens": (order.items || []).map(item => `${item.quantity}x ${item.name}`).join(', '),
            "Total": order.total
        }));
        const wsDetailedOrders = XLSX.utils.json_to_sheet(detailedOrdersData);
        wsDetailedOrders["!cols"] = [ {wch: 10}, {wch: 12}, {wch: 10}, {wch: 12}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 50}, {wch: 10} ];

        // Fix: Define itemsSold as any to allow dynamic property assignment.
        const itemsSold: any = {};
        completedOrders.forEach(order => {
            (order.items || []).forEach(item => {
                if (itemsSold[item.name]) {
                    itemsSold[item.name].quantidade += item.quantity;
                    itemsSold[item.name].faturamento += item.price * item.quantity;
                } else {
                    itemsSold[item.name] = {
                        produto: item.name,
                        quantidade: item.quantity,
                        faturamento: item.price * item.quantity
                    };
                }
            });
        });
        const itemsSoldData = Object.values(itemsSold).sort((a: any, b: any) => b.quantidade - a.quantidade);
        const wsItemsSold = XLSX.utils.json_to_sheet(itemsSoldData);
        wsItemsSold["!cols"] = [ {wch: 40}, {wch: 15}, {wch: 15} ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Geral");
        XLSX.utils.book_append_sheet(wb, wsItemsSold, "Itens Vendidos");
        XLSX.utils.book_append_sheet(wb, wsDetailedOrders, "Todos os Pedidos");
        
        const fileName = `Relatorio_CardapioGram_${startDate}_a_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
});