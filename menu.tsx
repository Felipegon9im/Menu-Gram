declare var firebase: any;

document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
        apiKey: "AIzaSyC08kGcRY7rWrDRbbbXZjrI7pffqsFTwDU",
        authDomain: "cardapioonline-ce986.firebaseapp.com",
        projectId: "cardapioonline-ce986",
        storageBucket: "cardapioonline-ce986.firebasestorage.app",
        messagingSenderId: "851882063397",
        appId: "1:851882063397:web:d61577093b176ef534b1cc"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const empresaSlug = getEmpresaSlug();
    let cart = [], storeConfig: any = {}, currentStep = 1, temporaryOrderData: any = {};
    let allProdutos = [], allCategories = [];
    
    const skeletonLoader = document.getElementById('skeleton-loader'), 
          pageContent = document.getElementById('page-content'), 
          coverPhotoContainer = document.getElementById('cover-photo-container') as HTMLDivElement, 
          profilePicture = document.getElementById('profile-picture') as HTMLImageElement, 
          storeName = document.getElementById('store-name'), 
          storeBio = document.getElementById('store-bio'), 
          statsOrders = document.getElementById('stats-orders'), 
          statsItems = document.getElementById('stats-items'), 
          statsClients = document.getElementById('stats-clients'), 
          menuContainer = document.getElementById('menu-container'), 
          cartFab = document.getElementById('cart-fab'), 
          cartModal = document.getElementById('cart-modal'), 
          categoriesContainer = document.getElementById('categories-container'), 
          menuTitle = document.getElementById('menu-title'), 
          featuredCarouselContainer = document.getElementById('featured-carousel-container');

    function optimizeCloudinaryUrl(url, transformations) {
        if (!url || !url.includes('cloudinary')) return url;
        const parts = url.split('/upload/');
        return `${parts[0]}/upload/${transformations}/${parts[1]}`;
    }

    function checkStoreStatus(horarios) {
        if (!horarios) return true;
        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const agora = new Date();
        const diaAtualStr = dias[agora.getDay()];
        const horarioHoje = horarios[diaAtualStr];
        if (!horarioHoje || !horarioHoje.aberto) { return false; }
        const horarioAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
        const inicio = horarioHoje.inicio;
        const fim = horarioHoje.fim;
        if (inicio <= fim) { return horarioAtual >= inicio && horarioAtual <= fim; } 
        else { return horarioAtual >= inicio || horarioAtual <= fim; }
    }
    
    function showPermissionError(title, message) { document.body.innerHTML = `<div class="min-h-screen flex items-center justify-center bg-red-50 p-4"><div class="bg-white p-8 rounded-lg shadow-2xl max-w-lg text-center border-t-4 border-red-500"><i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i><h1 class="text-3xl font-bold">${title}</h1><p class="text-gray-600">${message}</p></div></div>`; }

    function showToast(message, isError = false) {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `p-4 rounded-lg shadow-lg text-white ${isError ? 'bg-red-500' : 'bg-green-500'} transform translate-x-full opacity-0 transition-all duration-500`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.classList.remove('translate-x-full', 'opacity-0'); }, 100);
        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => { toast.remove(); }, 500);
        }, 4000);
    }

    function getEmpresaSlug() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('slug')) return params.get('slug');
        const path = window.location.pathname.replace('/menu.html', '').slice(1).split('/')[0];
        return path || null;
    }

    function listenToStoreConfig() {
        if (!empresaSlug) { showPermissionError("Cardápio não encontrado", "URL inválida. Verifique se o endereço está correto."); return; }
        db.collection('empresas').where('slug', '==', empresaSlug).limit(1).onSnapshot(snapshot => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                storeConfig = { id: doc.id, ...doc.data() };
                document.title = storeConfig.name || "CardápioGram";
                listenToMenuAndStats(doc.id);
            } else {
                showPermissionError("Cardápio não encontrado", "Não encontramos um cardápio para este endereço.");
            }
        }, error => { 
            console.error("Erro ao buscar empresa:", error);
            showPermissionError("Erro de Conexão", "Não foi possível carregar as informações do cardápio."); 
        });
    }

    function listenToMenuAndStats(empresaId) {
        if (!empresaId) return;
        db.collection('categorias').where('empresa_id', '==', empresaId).orderBy('name').onSnapshot(snapshot => {
            allCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderCategories(allCategories);
        });
        db.collection('produtos').where('empresa_id', '==', empresaId).where('isHidden', '==', false).orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
            allProdutos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderPageContent();
            renderFeaturedCarousel(allProdutos);
            filterMenuByCategory('all');
        }, error => {
            if (error.code === 'failed-precondition') { showPermissionError("Erro de Configuração", "O cardápio precisa de um índice no Firebase. Por favor, contacte o suporte."); }
        });
    }

    function renderPageContent() {
        storeName.textContent = storeConfig.name || "Nome da Loja";
        storeBio.textContent = storeConfig.bio || "Bem-vindo!";
        coverPhotoContainer.style.backgroundImage = `url('${optimizeCloudinaryUrl(storeConfig.coverPhotoUrl, 'w_1200,q_auto,f_auto') || 'https://placehold.co/1200x400'}')`;
        profilePicture.src = optimizeCloudinaryUrl(storeConfig.profilePicUrl, 'w_256,q_auto,f_auto') || 'https://placehold.co/128x128';
        (document.getElementById('verified-badge') as HTMLElement).classList.toggle('hidden', !storeConfig.verified);
        const socialLinksContainer = document.getElementById('social-links');
        socialLinksContainer.innerHTML = '';
        if(storeConfig.instagram) socialLinksContainer.innerHTML += `<a href="${storeConfig.instagram}" target="_blank" class="hover:text-gray-800"><i class="fab fa-instagram"></i></a>`;
        if(storeConfig.facebook) socialLinksContainer.innerHTML += `<a href="${storeConfig.facebook}" target="_blank" class="hover:text-gray-800"><i class="fab fa-facebook"></i></a>`;
        if (storeConfig.marketingNumbersEnabled) {
            // Fix: Convert number to string for textContent.
            statsOrders.textContent = ((storeConfig.marketingPedidosBase || 0) + Math.floor(Math.random() * 5)).toString();
            // Fix: Convert number to string for textContent.
            statsClients.textContent = ((storeConfig.marketingClientesBase || 0) + Math.floor(Math.random() * 10)).toString();
        } else { statsOrders.textContent = '--'; statsClients.textContent = '--'; }
        const isAberto = checkStoreStatus(storeConfig.horarios);
        const agendamentoAtivo = storeConfig.agendamento?.enabled;
        (document.getElementById('cart-fab') as HTMLElement).classList.toggle('hidden', !isAberto && !agendamentoAtivo);
        const closedBanner = document.getElementById('closed-store-banner'), closedMessage = document.getElementById('closed-store-message'), closedScheduleBtn = document.getElementById('closed-store-schedule-btn');
        closedBanner.classList.toggle('hidden', isAberto);
        if(!isAberto && agendamentoAtivo) {
            closedMessage.textContent = 'Estamos fechados, mas já pode agendar o seu pedido!';
            closedScheduleBtn.classList.remove('hidden');
        } else if (!isAberto) {
            const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
            const horarioHoje = storeConfig.horarios ? storeConfig.horarios[dias[new Date().getDay()]] : null;
            closedMessage.innerHTML = `No momento estamos fechados. <span id="horario-funcionamento">${(horarioHoje && horarioHoje.aberto) ? `Nosso horário hoje é das ${horarioHoje.inicio} às ${horarioHoje.fim}` : `Não abrimos hoje`}</span>.`;
            closedScheduleBtn.classList.add('hidden');
        }
        (document.getElementById('schedule-order-btn') as HTMLElement).classList.toggle('hidden', !agendamentoAtivo);
        // Fix: Convert number to string for textContent.
        statsItems.textContent = allProdutos.length.toString();
        skeletonLoader.style.display = 'none';
        pageContent.classList.remove('hidden');
    }
    
    let carouselInterval;
    function renderFeaturedCarousel(products) {
        const featuredProducts = products.filter(p => p.isFeatured);
        if (featuredProducts.length === 0) { featuredCarouselContainer.innerHTML = ''; featuredCarouselContainer.classList.add('hidden'); return; }
        featuredCarouselContainer.classList.remove('hidden');
        const slidesHtml = featuredProducts.map((item, index) => `<div class="slide ${index === 0 ? 'active' : ''}" data-index="${index}"><div class="relative rounded-lg overflow-hidden shadow-lg cursor-pointer add-to-cart-btn" data-id="${item.id}"><img src="${optimizeCloudinaryUrl((item.imageUrls && item.imageUrls[0]), 'w_800,q_auto,f_auto') || 'https://placehold.co/800x400'}" class="w-full h-48 md:h-64 object-cover"><div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div><div class="absolute bottom-0 left-0 p-4 md:p-6 text-white"><span class="text-xs font-semibold bg-yellow-500 text-black px-2 py-1 rounded">⭐ EM DESTAQUE</span><h3 class="text-xl md:text-2xl font-bold mt-2">${item.name}</h3><p class="text-sm mt-1 hidden md:block">${item.description}</p></div></div></div>`).join('');
        featuredCarouselContainer.innerHTML = `<h2 class="text-2xl font-bold text-gray-800 mb-4">Destaques da Casa</h2><div class="featured-carousel relative"><div id="slides-container">${slidesHtml}</div><button id="carousel-prev" class="absolute top-1/2 left-2 -translate-y-1/2 bg-white/80 text-gray-800 rounded-full h-8 w-8 items-center justify-center shadow-md hover:bg-white hidden"><i class="fas fa-chevron-left"></i></button><button id="carousel-next" class="absolute top-1/2 right-2 -translate-y-1/2 bg-white/80 text-gray-800 rounded-full h-8 w-8 items-center justify-center shadow-md hover:bg-white hidden"><i class="fas fa-chevron-right"></i></button></div>`;
        setupCarouselLogic(featuredProducts.length);
    }
    
    function setupCarouselLogic(slideCount) {
        clearInterval(carouselInterval);
        const prevBtn = document.getElementById('carousel-prev'); const nextBtn = document.getElementById('carousel-next');
        if (slideCount <= 1) { if (prevBtn) prevBtn.style.display = 'none'; if (nextBtn) nextBtn.style.display = 'none'; return; }
        if (prevBtn) (prevBtn as HTMLElement).style.display = 'flex'; if (nextBtn) (nextBtn as HTMLElement).style.display = 'flex';
        let currentIndex = 0; const slides = document.querySelectorAll('.featured-carousel .slide');
        const showSlide = (index) => { slides.forEach((slide, i) => { slide.classList.toggle('active', i === index); }); };
        const nextSlide = () => { currentIndex = (currentIndex + 1) % slideCount; showSlide(currentIndex); };
        const prevSlide = () => { currentIndex = (currentIndex - 1 + slideCount) % slideCount; showSlide(currentIndex); };
        nextBtn.addEventListener('click', () => { nextSlide(); clearInterval(carouselInterval); });
        prevBtn.addEventListener('click', () => { prevSlide(); clearInterval(carouselInterval); });
        carouselInterval = setInterval(nextSlide, 5000);
    }

    function renderCategories(categories) {
        categoriesContainer.classList.toggle('hidden', categories.length === 0);
        if (categories.length > 0) {
            categoriesContainer.innerHTML = `<div class="flex space-x-2 overflow-x-auto pb-2"><button class="category-btn flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-blue-500 text-white" data-category-id="all">Todos</button>${categories.map(cat => `<button class="category-btn flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-white text-gray-700" data-category-id="${cat.id}">${cat.name}</button>`).join('')}</div>`;
        }
    }

    function filterMenuByCategory(categoryId) {
        const filteredProdutos = categoryId === 'all' ? allProdutos.filter(p => !p.isFeatured) : allProdutos.filter(p => p.categoryId === categoryId && !p.isFeatured);
        menuContainer.innerHTML = '';
        if (filteredProdutos.length === 0) {
             if (categoryId === 'all' && allProdutos.some(p => p.isFeatured)) { menuContainer.innerHTML = ''; } 
             else { menuContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center">Nenhum item encontrado nesta categoria.</p>'; }
        } else { filteredProdutos.forEach(item => renderMenuItem(item)); }
    }

    function renderMenuItem(item) {
        const itemEl = document.createElement('div');
        itemEl.className = 'product-card';
        
        const imageUrls = (item.imageUrls || []).map(url => optimizeCloudinaryUrl(url, 'w_400,q_auto,f_auto'));
        let badges = '';
        if (item.isFeatured) badges += '<span class="absolute top-2 left-2 text-xs font-semibold bg-yellow-400 text-black px-2 py-1 rounded">⭐ Destaque</span>';
        if (item.productType === 'combo') badges += `<span class="absolute top-2 ${item.isFeatured ? 'top-8' : 'top-2'} left-2 text-xs font-semibold bg-purple-500 text-white px-2 py-1 rounded">COMBO</span>`;
        
        let imageHtml = `<div class="relative"><img src="${(imageUrls[0] || 'https://placehold.co/400x300/e2e8f0/333?text=Sem+Foto')}" alt="${item.name}" loading="lazy" class="product-image"></div>`;

        let descriptionHtml = `<p class="product-description mt-2">${item.description}</p>`;
        if(item.productType === 'combo' && item.comboItems) {
            const comboItemsHtml = item.comboItems.map(ci => `<li>${ci.name}</li>`).join('');
            descriptionHtml = `<p class="text-gray-600 mt-2 text-sm">${item.description}</p><div class="mt-2 text-xs text-gray-800 flex-grow"><span class="font-semibold">Inclui:</span><ul class="list-disc list-inside ml-1">${comboItemsHtml}</ul></div>`;
        }

        const priceText = (item.optionGroups && item.optionGroups.length > 0 && item.productType !== 'combo') ? `A partir de R$ ${(item.price || 0).toFixed(2)}` : `R$ ${(item.price || 0).toFixed(2)}`;
        
        itemEl.innerHTML = `
            ${imageHtml}
            <div class="p-4 flex flex-col flex-grow">
                <h3 class="product-title">${item.name}</h3>
                ${descriptionHtml}
                <div class="flex justify-between items-center mt-4 pt-4 border-t">
                    <span class="text-xl font-bold text-theme">${priceText}</span>
                    <button class="add-to-cart-btn bg-theme text-white font-bold py-2 px-4 rounded-lg" data-id="${item.id}">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                </div>
            </div>
        `;
        menuContainer.appendChild(itemEl);
    }
    
    function openModal(){
        cartModal.innerHTML=`<div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"><div class="p-4 border-b flex justify-between items-center"><h2 id="modal-title" class="text-xl font-bold"></h2><button type="button" id="close-cart-btn" class="text-2xl">&times;</button></div><div class="p-6 overflow-y-auto"><div id="cart-content-step"></div><div id="checkout-form-step"></div><div id="payment-step"></div><div id="success-step"></div></div><div class="p-4 bg-gray-50 border-t"><div id="summary"></div><button id="next-step-btn" class="w-full bg-theme text-white font-bold py-3 px-4 rounded-lg">Continuar</button></div></div>`;
        cartModal.classList.remove("hidden");
        currentStep=1;
        temporaryOrderData = {};
        updateCart();
        updateModalView();
    }

    function closeModal(){cartModal.classList.add("hidden"),cartModal.innerHTML=""}

    function updateSummary(){const e=document.getElementById("summary");if(e){const t=cart.reduce((e,t)=>e+t.price*t.quantity,0),o=temporaryOrderData.deliveryFee||0,r=t+o;let a="";cart.length>0&&(a+=`<div class="flex justify-between text-gray-600"><span>Subtotal</span><span>R$ ${t.toFixed(2)}</span></div>`,o>0&&(a+=`<div class="flex justify-between text-gray-600"><span>Taxa de Entrega</span><span>R$ ${o.toFixed(2)}</span></div>`),a+=`<div class="flex justify-between font-bold text-xl pt-2 border-t mt-2"><span>Total</span><span>R$ ${r.toFixed(2)}</span></div>`),e.innerHTML=a}}

    function addToCart(e,t,o){const r={id:e.id+"-"+(o||[]).map(e=>e.name).sort().join("-"),name:e.name,price:t,options:o,quantity:1,isCombo:e.productType==="combo",comboItems:e.comboItems||[]},a=cart.find(e=>e.id===r.id);a?a.quantity++:cart.push(r),updateCart(),showToast(`${e.name} adicionado ao carrinho!`)}

    function showOptionsModal(e){const t=(e.optionGroups||[]).map(e=>{const t=e.options.map(t=>`<label class="flex items-center justify-between p-3 border rounded-lg has-[:checked]:bg-blue-50 cursor-pointer"><span>${t.name}</span><div class="flex items-center space-x-3"><span>+ R$ ${t.price.toFixed(2)}</span><input type="${"single"===e.type?"radio":"checkbox"}" name="${e.name}" data-price="${t.price}" data-name="${t.name}"></div></label>`).join("");return`<div class="option-group"><h4 class="font-bold text-lg mb-2">${e.name}</h4><div class="space-y-2">${t}</div></div>`}).join("");cartModal.innerHTML=`<div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"><div class="p-4 border-b flex justify-between items-center"><h2 class="text-xl font-bold">${e.name}</h2><button type="button" id="close-options-modal" class="text-2xl">&times;</button></div><div class="p-6 overflow-y-auto">${t}</div><div class="p-4 bg-gray-50 border-t"><div class="flex justify-between font-bold text-xl mb-4"><span>Total</span><span id="options-total-price">R$ ${e.price.toFixed(2)}</span></div><button id="add-with-options-btn" class="w-full bg-theme text-white font-bold py-3 px-4 rounded-lg">Adicionar</button></div></div>`,cartModal.classList.remove("hidden")}
    
    function updateCart(){localStorage.setItem(`cardapiogram_cart_${empresaSlug}`,JSON.stringify(cart)),document.getElementById("cart-count").textContent=cart.reduce((e,t)=>e+t.quantity,0).toString(),document.getElementById("cart-content-step")&&renderCartItems(),document.getElementById("summary")&&updateSummary()}
    
    function updateQuantity(e,t){const o=cart.findIndex(t=>t.id===e);o>-1&&(cart[o].quantity+=t,cart[o].quantity<=0&&cart.splice(o,1)),updateCart()}
    
    function renderCartItems(){const e=document.getElementById("cart-content-step");e&&(e.innerHTML=0===cart.length?'<p class="text-center">Carrinho vazio.</p>':cart.map(e=>{const t=(e.options||[]).map(e=>`<span class="text-xs bg-gray-200 px-2 py-1 rounded-full">${e.name}</span>`).join(" ");let o="";e.isCombo&&e.comboItems.length>0&&(o=`<ul class="list-disc list-inside text-xs text-gray-500 ml-1">${e.comboItems.map(e=>`<li>${e.name}</li>`).join("")}</ul>`);return`<div class="flex justify-between items-center mb-4 pb-4 border-b"><div class="flex-grow"><p class="font-semibold">${e.name}</p>${o}<div class="flex flex-wrap gap-1 mt-1">${t}</div><p class="text-sm">R$ ${e.price.toFixed(2)}</p></div><div class="flex items-center space-x-4"><button class="quantity-change-btn" data-id="${e.id}" data-change="-1">-</button><span>${e.quantity}</span><button class="quantity-change-btn text-theme" data-id="${e.id}" data-change="1">+</button></div></div>`}).join(""))}

    function updateModalView(){
        const steps={cart:document.getElementById("cart-content-step"),checkout:document.getElementById("checkout-form-step"),payment:document.getElementById("payment-step"),success:document.getElementById("success-step")};
        Object.values(steps).forEach(e=>{e?.classList.add("hidden")});
        const t=document.getElementById("modal-title"),e=document.getElementById("next-step-btn") as HTMLButtonElement,o=document.getElementById("summary");
        if(o) o.classList.remove("hidden");
        if(1===currentStep) t.textContent="Seu Pedido",steps.cart.classList.remove("hidden"),e.textContent="Continuar",e.disabled=0===cart.length,e.classList.toggle("opacity-50",0===cart.length);
        else if(2===currentStep){
            t.textContent="Detalhes do Pedido",steps.checkout.classList.remove("hidden");
            renderCheckoutStep();
            e.textContent="Ir para Pagamento";
        } else if (3 === currentStep) {
            t.textContent="Forma de Pagamento",steps.payment.classList.remove("hidden");
            renderPaymentStep();
            e.textContent="Finalizar Pedido";
        } else if(4===currentStep) {
            t.textContent="Pedido Enviado!",steps.success.classList.remove("hidden"),steps.success.innerHTML='<div class="text-center"><dotlottie-wc src="https://lottie.host/e220b334-a43a-4b7c-9494-11110a31d161/k9Vf2nGsUh.lottie" style="width:150px;height:150px;margin:auto;" autoplay></dotlottie-wc><p class="mt-4">Sucesso! Clique no botão abaixo para confirmar no WhatsApp.</p></div>',o.classList.add("hidden"),e.textContent="Enviar via WhatsApp";
        }
    }

    function renderCheckoutStep() {
        const checkoutForm = document.getElementById('checkout-form-step');
        if (!checkoutForm) return;

        const isAberto = checkStoreStatus(storeConfig.horarios);
        const agendamentoAtivo = storeConfig.agendamento?.enabled;
        let timingOptionsHtml = '';
        if (isAberto) { timingOptionsHtml += '<label class="flex items-center"><input type="radio" name="timing-type" value="agora" class="mr-2" checked>✅ Receber o mais rápido possível</label>'; }
        if (agendamentoAtivo) { timingOptionsHtml += `<label class="flex items-center"><input type="radio" name="timing-type" value="agendar" class="mr-2" ${!isAberto ? 'checked' : ''}>📅 Agendar</label>`; }
        
        checkoutForm.innerHTML=`<div class="space-y-4"><div><label class="block text-sm font-medium mb-2">Quando deseja receber?</label><div class="flex flex-col space-y-2">${timingOptionsHtml}</div></div><div id="scheduling-section" class="hidden space-y-2 pt-4 border-t"><label class="block text-sm font-medium">Escolha uma data e hora:</label><div class="grid grid-cols-2 gap-2"><select id="schedule-date" class="w-full p-2 border rounded"></select><select id="schedule-time" class="w-full p-2 border rounded"></select></div></div><div class="pt-4 border-t"><label class="block text-sm font-medium mb-2">Como quer receber?</label><div id="order-type-selector" class="flex flex-wrap gap-4"></div></div><div id="order-type-details" class="space-y-4 pt-4 border-t"></div></div>`;
        
        updateOrderTypeOptions();
        updateOrderTypeDetails();

        if (agendamentoAtivo) {
            const isScheduled = (document.querySelector('input[name="timing-type"]:checked') as HTMLInputElement).value === 'agendar';
            document.getElementById('scheduling-section').classList.toggle('hidden', !isScheduled);
            if(isScheduled) generateTimeSlots();
        }
    }
    
    function renderPaymentStep() {
        const paymentStep = document.getElementById('payment-step');
        if (!paymentStep) return;

        const isScheduled = temporaryOrderData.scheduledFor;
        let paymentOptionsHtml = "";
        if(storeConfig.aceitaPix) paymentOptionsHtml+='<option value="Pix">Pix</option>';
        if(storeConfig.aceitaCartao) {
            paymentOptionsHtml+='<option value="Cartão (Maquininha)">Cartão (na maquininha)</option>';
        }
        if(!isScheduled && storeConfig.aceitaDinheiro) paymentOptionsHtml+='<option value="Dinheiro">Dinheiro</option>';
        
        paymentStep.innerHTML=`<div><label for="payment-method" class="block text-sm font-medium mb-1">Escolha como pagar</label><select id="payment-method" class="w-full p-2 border rounded">${paymentOptionsHtml}</select>${isScheduled ? '<p class="text-xs text-gray-500 mt-2">Pagamento em dinheiro não está disponível para pedidos agendados.</p>' : ''}</div><div id="payment-details" class="mt-4 space-y-3"></div>`;
        updatePaymentDetails();
    }

    function updateOrderTypeOptions(){
        const orderTypeSelector = document.getElementById("order-type-selector");
        if(!orderTypeSelector) return;
        
        let html = "";
        if (storeConfig.permitirDelivery !== false) {
            html += '<label><input type="radio" name="order-type" value="Entrega" class="mr-2" checked>Entrega</label>';
            html += '<label><input type="radio" name="order-type" value="Retirada" class="mr-2">Retirada</label>';
        }
        if (storeConfig.permitirLocal) {
            html += `<label><input type="radio" name="order-type" value="Local" class="mr-2" ${storeConfig.permitirDelivery === false ? "checked": ""}>Consumo no Local</label>`;
        }
        orderTypeSelector.innerHTML = html;
    }

    function updateOrderTypeDetails(){
        const orderType = (document.querySelector('input[name="order-type"]:checked') as HTMLInputElement)?.value;
        const detailsContainer = document.getElementById("order-type-details");
        if(!detailsContainer) return;

        let html = `<div><label for="client-name" class="block text-sm font-medium mb-1">Seu Nome</label><input type="text" id="client-name" class="form-input w-full border-gray-300 rounded-lg" required><p id="error-client-name" class="error-message hidden">Campo obrigatório.</p></div><div><label for="client-phone" class="block text-sm font-medium mb-1">Seu Telefone/WhatsApp</label><input type="tel" id="client-phone" class="form-input w-full border-gray-300 rounded-lg" required placeholder="(XX) XXXXX-XXXX"><p id="error-client-phone" class="error-message hidden">Campo obrigatório.</p></div>`;

        if (orderType === "Entrega") {
            html += `
                <div><label for="client-cep" class="block text-sm font-medium mb-1">CEP</label><input type="text" id="client-cep" class="form-input w-full border-gray-300 rounded-lg"></div>
                <div class="grid grid-cols-3 gap-x-4">
                    <div class="col-span-2"><label for="client-street" class="block text-sm font-medium mb-1">Rua / Logradouro</label><input type="text" id="client-street" class="form-input w-full border-gray-300 rounded-lg" required><p id="error-client-street" class="error-message hidden">Obrigatório.</p></div>
                    <div><label for="client-number" class="block text-sm font-medium mb-1">Número</label><input type="text" id="client-number" class="form-input w-full border-gray-300 rounded-lg" required><p id="error-client-number" class="error-message hidden">Obrigatório.</p></div>
                </div>
                <div class="grid grid-cols-2 gap-x-4">
                    <div><label for="client-complement" class="block text-sm font-medium mb-1">Complemento</label><input type="text" id="client-complement" class="form-input w-full border-gray-300 rounded-lg" placeholder="Apto, Bloco, etc."></div>
                    <div><label for="client-bairro" class="block text-sm font-medium mb-1">Bairro</label><input type="text" id="client-bairro" class="form-input w-full border-gray-300 rounded-lg" required><p id="error-client-bairro" class="error-message hidden">Obrigatório.</p></div>
                </div>
            `;
        } else if (orderType === "Local" && !temporaryOrderData.scheduledFor) {
            html += '<div><label for="table-number" class="block text-sm font-medium mb-1">Número da Mesa</label><input type="number" id="table-number" class="form-input w-full border-gray-300 rounded-lg" required><p id="error-table-number" class="error-message hidden">Campo obrigatório.</p></div>';
        }

        html += '<div><label for="order-notes" class="block text-sm font-medium mb-1">Observações (Opcional)</label><textarea id="order-notes" rows="2" class="form-input w-full border-gray-300 rounded-lg" placeholder="Tirar a cebola, ponto da carne, etc."></textarea></div>';
        detailsContainer.innerHTML = html;

        const cepInput = document.getElementById("client-cep");
        if (cepInput) {
            cepInput.addEventListener("blur", async (e) => {
                const cep = (e.target as HTMLInputElement).value.replace(/\D/g, "");
                if (cep.length === 8) {
                    try {
                        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                        const data = await res.json();
                        if (!data.erro) {
                            (document.getElementById("client-street") as HTMLInputElement).value = data.logradouro || "";
                            (document.getElementById("client-bairro") as HTMLInputElement).value = data.bairro || "";
                            updateDeliveryFee(cep, data.bairro);
                        }
                    } catch (err) { console.error("Erro ao buscar CEP:", err); }
                }
            });
        }
    }

    function updatePaymentDetails(){const e=(document.getElementById("payment-method") as HTMLSelectElement)?.value,t=document.getElementById("payment-details");t&&("Pix"===e&&storeConfig.pixKey?t.innerHTML=`<div class="bg-gray-100 p-3 rounded-lg text-center"><p class="text-sm font-semibold">Chave Pix (Copia e Cola):</p><div class="flex items-center justify-center bg-white p-2 rounded-md mt-1"><code id="pix-key-text" class="text-gray-700">${storeConfig.pixKey}</code><button type="button" id="copy-pix-key" class="ml-3 text-blue-500"><i class="fas fa-copy"></i></button></div></div><div><label for="payment-proof" class="block text-sm font-medium mt-3 mb-1">Anexar Comprovante (Obrigatório)</label><input type="file" id="payment-proof" class="w-full text-sm" accept="image/*" required><p id="error-payment-proof" class="error-message hidden">O comprovante é obrigatório.</p></div>`:"Dinheiro"===e?t.innerHTML='<div><label for="change-for" class="block text-sm font-medium mb-1">Troco para quanto?</label><input type="number" id="change-for" class="form-input w-full border-gray-300 rounded-lg" placeholder="Deixe em branco se não precisar"></div>':"Cartão (Online)"===e?t.innerHTML='<p class="text-sm text-gray-600">Você será redirecionado para finalizar o pagamento com cartão de forma segura.</p>':"Cartão (Maquininha)"===e?t.innerHTML='<p class="text-sm text-gray-600">O pagamento será feito na maquininha no momento da entrega ou retirada.</p>':t.innerHTML="")}
    
    async function uploadFileToCloudinary(e){const{cloudinaryCloudName:t,cloudinaryUploadPreset:o}=storeConfig;if(!t||!o)throw new Error("Cloudinary não configurado.");const r=new FormData;r.append("file",e),r.append("upload_preset",o);const a=await fetch(`https://api.cloudinary.com/v1_1/${t}/image/upload`,{method:"POST",body:r});if(!a.ok)throw new Error("Falha no upload do comprovante.");return(await a.json()).secure_url}
    
    function validateStep(){
        let e = true;
        const t = (o: string) => { (document.getElementById(o) as HTMLElement)?.classList.add("form-input-error"), (document.getElementById(`error-${o}`) as HTMLElement)?.classList.remove("hidden"), e = !1 },
        o = (e: string) => { (document.getElementById(e) as HTMLElement)?.classList.remove("form-input-error"), (document.getElementById(`error-${e}`) as HTMLElement)?.classList.add("hidden") };
        if (2 === currentStep) {
            const r = (document.querySelector('input[name="order-type"]:checked') as HTMLInputElement).value;
            (document.getElementById("client-name") as HTMLInputElement).value.trim() ? o("client-name") : t("client-name");
            (document.getElementById("client-phone") as HTMLInputElement).value.trim() ? o("client-phone") : t("client-phone");
            if ("Entrega" === r) {
                if(!(document.getElementById("client-street") as HTMLInputElement).value.trim()) t("client-street"); else o("client-street");
                if(!(document.getElementById("client-number") as HTMLInputElement).value.trim()) t("client-number"); else o("client-number");
                if(!(document.getElementById("client-bairro") as HTMLInputElement).value.trim()) t("client-bairro"); else o("client-bairro");
            }
            if("Local" === r && !temporaryOrderData.scheduledFor && !(document.getElementById("table-number") as HTMLInputElement).value.trim()) t("table-number"); else o("table-number");
        } else if (3 === currentStep && ("Pix" === (document.getElementById("payment-method") as HTMLSelectElement).value && (document.getElementById("payment-proof") as HTMLInputElement).files.length === 0)) t("payment-proof"); else o("payment-proof");
        return e;
    }

    function generateTimeSlots(){
        const e = document.getElementById("schedule-date") as HTMLSelectElement,
              t = document.getElementById("schedule-time") as HTMLSelectElement;
        if (e && t) {
            e.innerHTML = "", t.innerHTML = "";
            const { agendamento: o, horarios: r } = storeConfig;
            if (o?.enabled && r) {
                const a = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"],
                    d = new Date,
                    n = new Date(d.getTime() + (o.antecedenciaMinutos || 30) * 6e4);
                let l = n;
                if (!checkStoreStatus(r)) {
                    let e = !1;
                    for (let t = 0; t < (o.diasFuturos || 2) + 1; t++) {
                        const c = new Date(d);
                        c.setDate(d.getDate() + t);
                        const i = a[c.getDay()], s = r[i];
                        if (s && s.aberto) {
                            const [o, r] = s.inicio.split(":");
                            (l = new Date(c)).setHours(o, r, 0, 0), l < n && (l.setDate(l.getDate() + 1), l.setHours(o, r, 0, 0)), e = !0;
                            break
                        }
                    }
                    if (!e) return
                }
                const c = {};
                for (let t = 0; t < (o.diasFuturos || 2); t++) {
                    const e = new Date(l);
                    e.setDate(l.getDate() + t);
                    const d = a[e.getDay()];
                    r[d] && r[d].aberto && (c[`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`] = `${String(e.getDate()).padStart(2,"0")}/${String(e.getMonth()+1).padStart(2,"0")} (${d.charAt(0).toUpperCase()+d.slice(1,3)})`)
                }
                Object.keys(c).forEach(t => { const o = new Option(c[t], t); e.add(o) });
                const i = () => {
                    t.innerHTML = "";
                    const c = new Date(`${e.value}T12:00:00`),
                        d = a[c.getDay()],
                        n = r[d];
                    if (n && n.aberto) {
                        let r = new Date(l);
                        if (e.value !== `${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,"0")}-${String(r.getDate()).padStart(2,"0")}`) {
                            const [e, t] = n.inicio.split(":");
                            (r = new Date(c)).setHours(e, t, 0, 0)
                        }
                        const [i, s] = n.fim.split(":");
                        const C = new Date(c);
                        C.setHours(i, s, 0, 0), n.inicio > n.fim && C.setDate(C.getDate() + 1);
                        for (; r <= C;) {
                            const e = `${String(r.getHours()).padStart(2,"0")}:${String(r.getMinutes()).padStart(2,"0")}`;
                            (n.inicio <= n.fim ? e >= n.inicio && e <= n.fim : e >= n.inicio || e <= n.fim) && t.add(new Option(e, e)), r.setMinutes(r.getMinutes() + (o.intervaloMinutos || 15))
                        }
                    }
                };
                e.addEventListener("change", i), i()
            }
        }
    }
    
    function updateDeliveryFee(cep, bairro) {
        if (!storeConfig.deliveryFees) {
            temporaryOrderData.deliveryFee = 0;
            updateSummary();
            return;
        }
        const { deliverySystem, deliveryFees } = storeConfig;
        let finalFee = null;
        if (deliverySystem === 'advanced' && deliveryFees.advanced) {
            const cepRule = deliveryFees.advanced.find(rule => 
                rule.type === 'cep-range' && 
                cep >= rule.cepInicial && 
                cep <= rule.cepFinal
            );
            if (cepRule) finalFee = cepRule.valor;
            if (finalFee === null) {
                const bairroRule = deliveryFees.advanced.find(rule => 
                    rule.type === 'bairro' && 
                    rule.bairro.toLowerCase() === bairro.toLowerCase()
                );
                if (bairroRule) finalFee = bairroRule.valor;
            }
            if (finalFee === null) {
                const defaultRule = deliveryFees.advanced.find(rule => rule.type === 'padrao');
                if (defaultRule) finalFee = defaultRule.valor;
            }
        } else if (deliverySystem === 'simple' && deliveryFees.simple) {
            const matchingFee = deliveryFees.simple.find(fee => fee.bairro.toLowerCase() === bairro.toLowerCase());
            if (matchingFee) finalFee = matchingFee.valor;
        }
        temporaryOrderData.deliveryFee = finalFee !== null ? finalFee : 0;
        updateSummary();
    }

    async function handleNextStep(){
        if(currentStep < 4 && !validateStep()) return;
        const nextBtn = document.getElementById("next-step-btn") as HTMLButtonElement;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            if (currentStep === 1) {
                currentStep = 2;
            } else if (currentStep === 2) {
                if ((document.querySelector('input[name="timing-type"]:checked') as HTMLInputElement).value === "agendar") {
                    const date = (document.getElementById("schedule-date") as HTMLSelectElement).value;
                    const time = (document.getElementById("schedule-time") as HTMLSelectElement).value;
                    if (!date || !time) throw new Error("Agendamento incompleto");
                    const [year, month, day] = date.split("-");
                    const [hour, minute] = time.split(":");
                    temporaryOrderData.scheduledFor = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
                } else {
                    temporaryOrderData.scheduledFor = null;
                }
                temporaryOrderData.orderType = (document.querySelector('input[name="order-type"]:checked') as HTMLInputElement).value;
                temporaryOrderData.clientName = (document.getElementById("client-name") as HTMLInputElement).value;
                temporaryOrderData.clientPhone = (document.getElementById("client-phone") as HTMLInputElement).value;
                temporaryOrderData.notes = (document.getElementById("order-notes") as HTMLTextAreaElement).value.trim();
                if (temporaryOrderData.orderType === "Entrega") {
                    const street = (document.getElementById('client-street') as HTMLInputElement).value;
                    const number = (document.getElementById('client-number') as HTMLInputElement).value;
                    const complement = (document.getElementById('client-complement') as HTMLInputElement).value;
                    const bairro = (document.getElementById('client-bairro') as HTMLInputElement).value;
                    let fullAddress = `${street}, Nº ${number}`;
                    if (complement) fullAddress += `, ${complement}`;
                    fullAddress += ` - ${bairro}`;
                    temporaryOrderData.clientAddress = fullAddress;
                } else if (temporaryOrderData.orderType === "Local" && !temporaryOrderData.scheduledFor) {
                    temporaryOrderData.tableNumber = (document.getElementById("table-number") as HTMLInputElement).value;
                }
                currentStep = 3;
            } else if (currentStep === 3) {
                temporaryOrderData.paymentMethod = (document.getElementById("payment-method") as HTMLSelectElement).value;
                const paymentMethod = temporaryOrderData.paymentMethod;
                if (paymentMethod === "Pix") {
                    temporaryOrderData.paymentProofUrl = await uploadFileToCloudinary((document.getElementById("payment-proof") as HTMLInputElement).files[0]);
                } else if (paymentMethod === "Dinheiro") {
                    temporaryOrderData.changeFor = (document.getElementById("change-for") as HTMLInputElement).value;
                } else if (paymentMethod === "Cartão (Online)") {
                    if (!storeConfig.cardPaymentLink) throw new Error("Link de pagamento com cartão não configurado.");
                    window.open(storeConfig.cardPaymentLink, "_blank");
                }
                currentStep = 4;
            } else if (currentStep === 4) {
                const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0) + (temporaryOrderData.deliveryFee || 0);
                const getDateString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
                const orderData = {
                    empresa_id: storeConfig.id,
                    items: cart,
                    total: total,
                    ...temporaryOrderData,
                    status: "aberto",
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    date: getDateString()
                };

                const counterRef = db.collection("counters").doc("pedidos");
                orderData.orderNumber = await db.runTransaction(async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);
                    if (!counterDoc.exists) { throw "Documento de contagem não encontrado!"; }
                    const newOrderNumber = counterDoc.data().lastOrderNumber + 1;
                    transaction.update(counterRef, { lastOrderNumber: newOrderNumber });
                    return newOrderNumber;
                });

                await db.collection("pedidos").add(orderData);
                
                let whatsappMessage = `Pedido Nº ${orderData.orderNumber}:\n\n`;
                if (orderData.scheduledFor) {
                    const date = new Date(orderData.scheduledFor);
                    whatsappMessage += `*PEDIDO AGENDADO PARA: ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}*\n\n`;
                }
                cart.forEach(item => {
                    whatsappMessage += `*${item.quantity}x ${item.name}* - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
                    if (item.options?.length > 0) {
                        item.options.forEach(opt => { whatsappMessage += `  - _${opt.name}_\n`; });
                    }
                });
                whatsappMessage += `\n*Subtotal:* R$ ${cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2)}\n`;
                if (orderData.deliveryFee > 0) {
                    whatsappMessage += `*Taxa de Entrega:* R$ ${orderData.deliveryFee.toFixed(2)}\n`;
                }
                whatsappMessage += `*Total:* R$ ${total.toFixed(2)}\n\n*Detalhes:*\nTipo: ${orderData.orderType}\nNome: ${orderData.clientName}\nTelefone: ${orderData.clientPhone}\n`;
                if (orderData.orderType === "Entrega") { whatsappMessage += `Endereço: ${orderData.clientAddress}\n`; }
                if (orderData.orderType === "Local" && !orderData.scheduledFor) { whatsappMessage += `Mesa: ${orderData.tableNumber}\n`; }
                if (orderData.notes) { whatsappMessage += `\n*Observações:*\n${orderData.notes}\n`; }
                whatsappMessage += `\n*Pagamento:* ${orderData.paymentMethod}\n`;
                if (orderData.changeFor) { whatsappMessage += `Troco para: R$ ${orderData.changeFor}\n`; }
                if (orderData.paymentProofUrl) { whatsappMessage += `Comprovante: ${orderData.paymentProofUrl}\n`; }
                
                window.open(`https://wa.me/${storeConfig.whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`, "_blank");
                
                cart = [];
                temporaryOrderData = {};
                updateCart();
                setTimeout(closeModal, 500);
                return;
            }
        } catch (error) {
            console.error("Erro no checkout:", error);
            alert(`Ocorreu um erro: ${error.message}`);
        } finally {
            nextBtn.disabled = false;
            updateModalView();
        }
    }

    const savedCart = localStorage.getItem(`cardapiogram_cart_${empresaSlug}`);
    if (savedCart) cart = JSON.parse(savedCart);
    listenToStoreConfig();
    updateCart();
    
    document.getElementById('open-cart-btn').addEventListener('click', openModal);
    document.getElementById('schedule-order-btn').addEventListener('click', openModal);
    document.getElementById('closed-store-schedule-btn').addEventListener('click', openModal);
    
    cartModal.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        if (target.closest('#close-cart-btn') || target.closest('#close-options-modal') || target === cartModal) closeModal();
        if (target.closest('#next-step-btn')) handleNextStep();
        if (target.closest('.quantity-change-btn')) updateQuantity((target.closest('.quantity-change-btn') as HTMLElement).dataset.id, parseInt((target.closest('.quantity-change-btn') as HTMLElement).dataset.change));
        if (target.id === 'copy-pix-key' || target.closest('#copy-pix-key')) { navigator.clipboard.writeText(document.getElementById('pix-key-text').textContent).then(() => showToast('Chave Pix copiada!')); }
        if (target.closest('#add-with-options-btn')) {
            const itemData = allProdutos.find(p => p.name === (cartModal.querySelector('h2') as HTMLElement).textContent);
            const finalPrice = parseFloat(document.getElementById('options-total-price').textContent.replace('R$ ', ''));
            const selected = Array.from(cartModal.querySelectorAll('input:checked')).map(i => ({ name: (i as HTMLInputElement).dataset.name, price: parseFloat((i as HTMLInputElement).dataset.price) }));
            addToCart(itemData, finalPrice, selected); closeModal();
        }
    });
    
    cartModal.addEventListener('change', e => {
        const target = e.target as HTMLInputElement;
        if(target.closest('.option-group')) {
            const itemData = allProdutos.find(p => p.name === (cartModal.querySelector('h2') as HTMLElement).textContent);
            let currentTotal = itemData.price;
            cartModal.querySelectorAll('.option-group input:checked').forEach(input => { currentTotal += parseFloat((input as HTMLInputElement).dataset.price); });
            document.getElementById('options-total-price').textContent = `R$ ${currentTotal.toFixed(2)}`;
        }
        if (target.name === 'timing-type') { 
            const isScheduled = target.value === 'agendar';
            document.getElementById('scheduling-section').classList.toggle('hidden', !isScheduled);
            if(isScheduled) generateTimeSlots();
        }
        if (target.name === 'order-type') updateOrderTypeDetails();
        if (target.id === 'payment-method') updatePaymentDetails();
    });

    pageContent.addEventListener('click', e => {
        const btn = (e.target as HTMLElement).closest('.add-to-cart-btn'); 
        if (btn) {
            const itemData = allProdutos.find(p => p.id === (btn as HTMLElement).dataset.id);
            if (!itemData) return;
            if (itemData.productType === 'combo' || !itemData.optionGroups || itemData.optionGroups.length === 0) {
                addToCart(itemData, itemData.price, []);
            } else { showOptionsModal(itemData); }
        }
    });
    
    categoriesContainer.addEventListener('click', e => {
        const btn = (e.target as HTMLElement).closest('.category-btn');
        if (btn) {
            document.querySelectorAll('.category-btn').forEach(b => { b.classList.remove('bg-blue-500', 'text-white'); b.classList.add('bg-white', 'text-gray-700'); });
            btn.classList.add('bg-blue-500', 'text-white');
            const categoryId = (btn as HTMLElement).dataset.categoryId;
            menuTitle.textContent = categoryId === 'all' ? 'Nosso Cardápio' : allCategories.find(c => c.id === categoryId).name;
            filterMenuByCategory(categoryId);
        }
    });
});