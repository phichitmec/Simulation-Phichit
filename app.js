/**
 * ==========================================================================
 * Simulation-Phichit Main Application Controller (Mobile-First High Performance)
 * Architecturally compliant with 5 Mandatory Performance Standards
 * ==========================================================================
 */

// Global Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycby8n00MxXKKBLIx30IAr_SLL58eJLg7QbEPUeVIVDZdg497oNQTAAP7IXF9zIoU2Ik/exec';

// Central Global In-Memory State Cache
window.globalData = {
    inventory: [],
    reservations: [],
    departments: [],
    studentGroups: [],
    teachers: [],
    dashboardHistory: [],
    isLoaded: false,
    serverTimestamp: null
};

// Fallback Cache Invalidation Flag (Standard 5)
window.dataNeedsRefresh = false;

// Local Component State
let cart = [];
let filteredMannequins = [];
let categories = new Set();
let currentPage = 1;
const itemsPerPage = 8;
let selectedCategory = '';

// Active Reservations State (Newest First & Pagination)
let reservationsCurrentPage = 1;
let reservationsPerPage = 10;
let reservationsSearchTerm = '';

// Dashboard Filter State
let dashboardSelectedYear = '';
let dashboardSelectedMonth = '';
let dashboardSelectedType = '';

// Chart Instances
let yearlyBookingChart = null;
let monthlyBookingChart = null;
let simPieChart = null;
let departmentChart = null;
let simMostUsed = null;

// Offline Inlined SVG Placeholder (Safe from ERR_CONNECTION_CLOSED)
const placeholderImage = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200" fill="%23f1f5f9"><rect width="300" height="200" fill="%23f8fafc"/><circle cx="150" cy="85" r="35" fill="%23cbd5e1"/><path d="M90 160 C90 125, 210 125, 210 160 Z" fill="%23cbd5e1"/><text x="50%25" y="185" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="%2394a3b8">ไม่มีรูปภาพ</text></svg>';

function formatImageUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        return placeholderImage;
    }
    if (url.includes('drive.google.com')) {
        const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            return `https://lh5.googleusercontent.com/d/${fileIdMatch[1]}`;
        }
    }
    return url;
}

const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * ==========================================================================
 * Network & API Client
 * ==========================================================================
 */
async function callApi(action, method = 'GET', data = null, params = {}) {
    let url = API_URL;
    const options = {
        method: method,
        redirect: 'follow'
    };

    if (method === 'GET') {
        const queryParams = new URLSearchParams({ action, ...params });
        url += `?${queryParams.toString()}`;
    } else {
        // Explicit text/plain Content-Type avoids CORS preflight OPTIONS and ensures smooth 302 redirect handling in Apps Script
        options.headers = {
            'Content-Type': 'text/plain;charset=utf-8'
        };
        options.body = JSON.stringify({ action: action, data: data });
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

/**
 * Standard 1: Single Batch Read Boot Function
 * Fetches all required master data in 1 server execution upon app boot.
 */
async function fetchInitialData(forceRefresh = false) {
    if (window.globalData.isLoaded && !forceRefresh && !window.dataNeedsRefresh) {
        return window.globalData;
    }

    try {
        showLoading('กำลังโหลดข้อมูลระบบ...');

        // 1 Single consolidated read endpoint
        const result = await callApi('get_initial_data', 'GET');

        if (!result.success || !result.data) {
            throw new Error(result.message || 'Failed to load initial data');
        }

        // Store into global memory cache
        window.globalData = {
            inventory: result.data.inventory || [],
            reservations: result.data.reservations || [],
            departments: result.data.departments || [],
            studentGroups: result.data.studentGroups || [],
            teachers: result.data.teachers || [],
            dashboardHistory: result.data.dashboardHistory || [],
            isLoaded: true,
            serverTimestamp: result.data.serverTimestamp || Date.now()
        };

        window.dataNeedsRefresh = false;

        // Standard 3: In-Memory Master Lookups & Derivations
        populateMasterDropdowns();
        extractCategories();

        hideLoading();
        return window.globalData;

    } catch (error) {
        hideLoading();
        console.error('Fetch Initial Data Error:', error);
        showError('ไม่สามารถโหลดข้อมูลระบบได้: ' + error.message);
        throw error;
    }
}

/**
 * Standard 4: Targeted Sheet Sync
 * Selectively re-fetches only modified formula sheets without full re-boot.
 */
window.syncTargetedSimSheets = async function (sheets = ['หุ่นฝึกหัถการ', 'join-sheet']) {
    try {
        const response = await callApi('read_targeted_sheets', 'GET', null, { sheets: sheets.join(',') });
        if (response && response.success && response.data) {
            if (response.data.inventory) {
                window.globalData.inventory = response.data.inventory;
                extractCategories();
            }
            if (response.data.reservations) {
                window.globalData.reservations = response.data.reservations;
            }
            return true;
        }
    } catch (err) {
        console.warn('Targeted sync warning:', err);
        window.dataNeedsRefresh = true;
    }
    return false;
};

/**
 * ==========================================================================
 * In-Memory Master Lookups & Filter Helpers (Standard 3)
 * ==========================================================================
 */
function populateMasterDropdowns() {
    // 1. Departments Datalist
    const departmentList = document.getElementById('departmentList');
    if (departmentList) {
        departmentList.innerHTML = '';
        window.globalData.departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            departmentList.appendChild(option);
        });
    }

    // 2. Student Groups Select
    const stuGroupSelect = document.getElementById('stuGroup');
    if (stuGroupSelect) {
        stuGroupSelect.innerHTML = '<option value="">เลือกกลุ่มนิสิตแพทย์</option>';
        window.globalData.studentGroups.forEach(g => {
            const option = document.createElement('option');
            option.value = g;
            option.textContent = g;
            stuGroupSelect.appendChild(option);
        });
    }

    // 3. Teachers Datalist
    const teachersList = document.getElementById('teacherslist');
    if (teachersList) {
        teachersList.innerHTML = '';
        window.globalData.teachers.forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            teachersList.appendChild(option);
        });
    }
}

function extractCategories() {
    categories = new Set(window.globalData.inventory.map(item => item.category).filter(Boolean));
    
    // 1. Populate Hidden Select
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="">ทุกประเภท</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            if (category === currentValue) option.selected = true;
            categoryFilter.appendChild(option);
        });
    }

    // 2. Populate Mobile Horizontal Category Chips
    populateCategoryChips();
}

function populateCategoryChips() {
    const chipsContainer = document.getElementById('categoryChips');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = '';

    // "All" chip
    const allChip = document.createElement('button');
    allChip.className = `category-chip px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-medium border ${selectedCategory === '' ? 'active' : ''}`;
    allChip.textContent = 'ทั้งหมด';
    allChip.addEventListener('click', () => selectCategoryChip(''));
    chipsContainer.appendChild(allChip);

    // Individual category chips
    categories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = `category-chip px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-medium border ${selectedCategory === cat ? 'active' : ''}`;
        chip.textContent = cat;
        chip.addEventListener('click', () => selectCategoryChip(cat));
        chipsContainer.appendChild(chip);
    });
}

function selectCategoryChip(cat) {
    selectedCategory = cat;
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) categoryFilter.value = cat;

    // Update chip active classes
    const chips = document.querySelectorAll('.category-chip');
    chips.forEach(chip => {
        if ((cat === '' && chip.textContent === 'ทั้งหมด') || chip.textContent === cat) {
            chip.classList.add('active');
            chip.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
        } else {
            chip.classList.remove('active');
        }
    });

    filterAndSortMannequins();
}

/**
 * ==========================================================================
 * View Routers & Zero-Latency Tab Switching (Standard 1)
 * Consumes strictly from window.globalData without firing secondary fetch requests
 * ==========================================================================
 */
function showReservationView() {
    setActiveTabStyle('reserveTab');
    document.getElementById('calendarSection')?.classList.add('hidden');
    document.getElementById('dashboardSection')?.classList.add('hidden');
    document.getElementById('reservationsView')?.classList.add('hidden');
    document.getElementById('reservationView')?.classList.remove('hidden');
    document.getElementById('reservationViewBtn')?.classList.remove('hidden');

    filterAndSortMannequins();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCalendarView() {
    setActiveTabStyle('calendarTab');
    document.getElementById('reservationView')?.classList.add('hidden');
    document.getElementById('reservationsView')?.classList.add('hidden');
    document.getElementById('dashboardSection')?.classList.add('hidden');
    document.getElementById('calendarSection')?.classList.remove('hidden');
    document.getElementById('reservationViewBtn')?.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showReservationsView() {
    setActiveTabStyle('reservationsTab');
    document.getElementById('calendarSection')?.classList.add('hidden');
    document.getElementById('dashboardSection')?.classList.add('hidden');
    document.getElementById('reservationView')?.classList.add('hidden');
    document.getElementById('reservationsView')?.classList.remove('hidden');
    document.getElementById('reservationViewBtn')?.classList.add('hidden');

    reservationsCurrentPage = 1;
    renderReservations();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboardView() {
    setActiveTabStyle('dashboardTab');
    document.getElementById('reservationView')?.classList.add('hidden');
    document.getElementById('calendarSection')?.classList.add('hidden');
    document.getElementById('reservationsView')?.classList.add('hidden');
    document.getElementById('dashboardSection')?.classList.remove('hidden');
    document.getElementById('reservationViewBtn')?.classList.add('hidden');

    renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setActiveTabStyle(activeTabId) {
    // 1. Desktop Top Tabs Sync
    const desktopTabs = [
        { id: 'reserveTab', btn: document.getElementById('reserveTab') },
        { id: 'calendarTab', btn: document.getElementById('calendarTab') },
        { id: 'reservationsTab', btn: document.getElementById('reservationsTab') },
        { id: 'dashboardTab', btn: document.getElementById('dashboardTab') }
    ];

    desktopTabs.forEach(t => {
        if (!t.btn) return;
        if (t.id === activeTabId) {
            t.btn.className = 'tab-btn px-4 py-2 rounded-t-lg text-sm font-medium bg-blue-800 text-white whitespace-nowrap shadow-sm';
        } else {
            t.btn.className = 'tab-btn px-4 py-2 rounded-t-lg text-sm font-medium bg-blue-600 hover:bg-blue-800 text-white whitespace-nowrap';
        }
    });

    // 2. Mobile Bottom Navigation Bar Sync
    const bottomNavMap = {
        'reserveTab': 'bottomNavReserve',
        'calendarTab': 'bottomNavCalendar',
        'reservationsTab': 'bottomNavReservations',
        'dashboardTab': 'bottomNavDashboard'
    };

    const targetBottomNavId = bottomNavMap[activeTabId];
    const bottomNavButtons = ['bottomNavReserve', 'bottomNavCalendar', 'bottomNavReservations', 'bottomNavDashboard'];
    
    bottomNavButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (id === targetBottomNavId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * ==========================================================================
 * View Renderers (Inventory, Reservations, Dashboard)
 * ==========================================================================
 */

// 1. Mannequins Inventory Rendering (Optimized for Mobile 2-Column Grid)
function renderMannequins() {
    const mannequinList = document.getElementById('mannequinList');
    const paginationMenu = document.getElementById('paginationMenu');
    if (!mannequinList) return;

    mannequinList.innerHTML = '';
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filteredMannequins.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
        mannequinList.innerHTML = `
            <div class="col-span-full text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-14 w-14 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p class="text-slate-500 text-sm font-medium">ไม่พบรายการหุ่นฝึกตามเงื่อนไขที่ค้นหา</p>
            </div>
        `;
        if (paginationMenu) paginationMenu.classList.add('hidden');
        return;
    }

    if (paginationMenu) paginationMenu.classList.remove('hidden');

    paginatedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'mannequin-card flex flex-col justify-between';
        
        const imageUrl = formatImageUrl(item.imageUrl);
        const isInCart = cart.some(cartItem => cartItem.id === item.id);
        const isAvailable = item.status === 'พร้อมให้บริการ' || item.status === '' || !item.status;

        card.innerHTML = `
            <div>
                <!-- Image Showcase Area -->
                <div class="card-image-box relative h-28 sm:h-36 md:h-48 overflow-hidden flex items-center justify-center p-2">
                    <img src="${imageUrl}" alt="${item.name}" class="w-full h-full object-contain transition-transform duration-300 hover:scale-105" loading="lazy" onerror="this.onerror=null; this.src=placeholderImage;">
                    <div class="absolute top-1.5 right-1.5 bg-blue-700/90 backdrop-blur-sm text-white font-medium px-2 py-0.5 rounded-full text-[10px] sm:text-xs shadow-sm line-clamp-1 max-w-[80%]">
                        ${item.category || 'ทั่วไป'}
                    </div>
                </div>
                <!-- Details -->
                <div class="p-2.5 sm:p-3.5 space-y-1 sm:space-y-1.5">
                    <div class="flex items-center">
                        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 line-clamp-1">
                            ${item.code || '-'}
                        </span>
                    </div>
                    <h3 class="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-tight hover:text-blue-700 transition" title="${item.name}">
                        ${item.name}
                    </h3>
                </div>
            </div>
            <!-- Card Footer Action -->
            <div class="card-footer px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col sm:flex-row gap-1.5 sm:items-center sm:justify-between mt-auto">
                <span class="inline-flex items-center px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full w-fit ${isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                    <span class="w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'} mr-1"></span>
                    ${item.status || 'พร้อมให้บริการ'}
                </span>
                <button class="add-to-cart-btn w-full sm:w-auto inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${!isAvailable ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : isInCart ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}" 
                    data-id="${item.id}" ${!isAvailable ? 'disabled' : ''}>
                    ${isInCart ? `
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg> เลือกแล้ว` : `
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                        </svg> เลือก`}
                </button>
            </div>
        `;

        mannequinList.appendChild(card);

        if (isAvailable) {
            const btn = card.querySelector('.add-to-cart-btn');
            if (btn) {
                btn.addEventListener('click', () => toggleCartItem(item));
            }
        }
    });

    renderPagination();
}

function renderPagination() {
    const totalPages = Math.ceil(filteredMannequins.length / itemsPerPage) || 1;
    const pageNumbers = document.getElementById('pageNumbers');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    if (prevPage) prevPage.disabled = currentPage === 1;
    if (nextPage) nextPage.disabled = currentPage === totalPages;
    if (pageInfo) pageInfo.textContent = `หน้า ${currentPage}/${totalPages}`;

    if (!pageNumbers) return;
    pageNumbers.innerHTML = '';

    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, startPage + 2);
    startPage = Math.max(1, endPage - 2);

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition ${i === currentPage ? 'bg-blue-700 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
        btn.textContent = i;
        btn.addEventListener('click', () => {
            currentPage = i;
            renderMannequins();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        pageNumbers.appendChild(btn);
    }
}

function filterAndSortMannequins() {
    const searchInput = document.getElementById('searchInput');
    const sortBy = document.getElementById('sortBy');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const categoryValue = selectedCategory || '';
    const sortValue = sortBy ? sortBy.value : 'name';

    filteredMannequins = window.globalData.inventory.filter(item => {
        const matchesSearch = !searchTerm ||
            (item.name && item.name.toLowerCase().includes(searchTerm)) ||
            (item.code && item.code.toLowerCase().includes(searchTerm)) ||
            (item.category && item.category.toLowerCase().includes(searchTerm));
        const matchesCategory = !categoryValue || (item.category === categoryValue);
        return matchesSearch && matchesCategory;
    });

    filteredMannequins.sort((a, b) => {
        if (sortValue === 'name') return (a.name || '').localeCompare(b.name || '', 'th');
        if (sortValue === 'category') return (a.category || '').localeCompare(b.category || '', 'th');
        return 0;
    });

    currentPage = 1;
    renderMannequins();
}

/**
 * ==========================================================================
 * 2. Active Reservations Rendering (Newest First & Pagination Default 10)
 * ==========================================================================
 */
function getSortedReservations() {
    let list = [...(window.globalData.reservations || [])];

    if (reservationsSearchTerm) {
        const term = reservationsSearchTerm.toLowerCase().trim();
        list = list.filter(r => 
            (r.borrowerName && r.borrowerName.toLowerCase().includes(term)) ||
            (r.mannequinName && r.mannequinName.toLowerCase().includes(term)) ||
            (r.department && r.department.toLowerCase().includes(term)) ||
            (r.borrowType && r.borrowType.toLowerCase().includes(term)) ||
            (r.textDetails && r.textDetails.toLowerCase().includes(term)) ||
            (r.textStatus && r.textStatus.toLowerCase().includes(term)) ||
            (r.studyGroup && r.studyGroup.toLowerCase().includes(term)) ||
            (r.teacherName && r.teacherName.toLowerCase().includes(term))
        );
    }

    // Sort descending: newest first by startDateTime or timestamp
    return list.sort((a, b) => {
        const timeA = new Date(a.startDateTime || a.timestamp || 0).getTime();
        const timeB = new Date(b.startDateTime || b.timestamp || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
    });
}

function renderReservations() {
    const reservationsTableBody = document.getElementById('reservationsTableBody');
    const reservationsCards = document.getElementById('reservationsCards');
    const reservationsTable = document.getElementById('reservationsTable');
    const noReservations = document.getElementById('noReservations');
    const paginationMenu = document.getElementById('reservationsPaginationMenu');

    const sortedList = getSortedReservations();

    if (sortedList.length === 0) {
        if (reservationsTable) reservationsTable.classList.add('hidden');
        if (reservationsCards) reservationsCards.classList.add('hidden');
        if (noReservations) noReservations.classList.remove('hidden');
        if (paginationMenu) paginationMenu.classList.add('hidden');
        return;
    }

    if (reservationsTable) reservationsTable.classList.remove('hidden');
    if (reservationsCards) reservationsCards.classList.remove('hidden');
    if (noReservations) noReservations.classList.add('hidden');
    if (paginationMenu) paginationMenu.classList.remove('hidden');

    const totalPages = Math.ceil(sortedList.length / reservationsPerPage) || 1;
    if (reservationsCurrentPage > totalPages) reservationsCurrentPage = totalPages;
    if (reservationsCurrentPage < 1) reservationsCurrentPage = 1;

    const startIndex = (reservationsCurrentPage - 1) * reservationsPerPage;
    const endIndex = startIndex + reservationsPerPage;
    const paginatedList = sortedList.slice(startIndex, endIndex);

    // A. Render Desktop Table
    if (reservationsTableBody) {
        reservationsTableBody.innerHTML = '';
        paginatedList.forEach(res => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition border-b border-gray-100 text-sm';

            let statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">ไม่ระบุ</span>';
            if (res.textStatus === 'รอตรวจสอบ') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold badge-pending">รอตรวจสอบ</span>';
            } else if (res.textStatus === 'อนุมัติ') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold badge-approved">อนุมัติ</span>';
            } else if (res.textStatus === 'กำลังใช้งาน') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold badge-active">กำลังใช้งาน</span>';
            }

            row.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
                <td class="px-4 py-3 whitespace-nowrap font-medium text-slate-900">${res.borrowerName || '-'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-800">${res.mannequinName || '-'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-600">${res.borrowType || '-'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-600">${res.department || '-'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-600 text-center">${res.useNumber || '-'}</td>
                <td class="px-4 py-3 text-slate-600 max-w-xs truncate" title="${res.textDetails || ''}">${res.textDetails || '-'}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-xs">${formatThaiDate(res.startDateTime)}</td>
                <td class="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-xs">${formatThaiDate(res.endDateTime)}</td>
            `;
            reservationsTableBody.appendChild(row);
        });
    }

    // B. Render Mobile Cards (Ticket Style)
    if (reservationsCards) {
        reservationsCards.innerHTML = '';
        paginatedList.forEach(res => {
            const card = document.createElement('div');
            card.className = 'reservation-card p-3.5 space-y-2.5';

            let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">ไม่ระบุ</span>';
            if (res.textStatus === 'รอตรวจสอบ') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold badge-pending">รอตรวจสอบ</span>';
            } else if (res.textStatus === 'อนุมัติ') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold badge-approved">อนุมัติ</span>';
            } else if (res.textStatus === 'กำลังใช้งาน') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold badge-active">กำลังใช้งาน</span>';
            }

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-xs font-bold text-slate-900">${res.borrowerName || '-'}</span>
                        <p class="text-[11px] text-slate-500">${res.department || '-'}</p>
                    </div>
                    ${statusBadge}
                </div>

                <div class="bg-slate-50 p-2.5 rounded-xl space-y-1 text-xs border border-slate-100">
                    <p class="font-semibold text-blue-700 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        ${res.mannequinName || '-'}
                    </p>
                    <p class="text-slate-600 text-[11px]">ประเภท: <span class="font-medium text-slate-800">${res.borrowType || '-'}</span> | จำนวน: <span class="font-medium text-slate-800">${res.useNumber || '-'} คน</span></p>
                    ${res.textDetails ? `<p class="text-slate-500 text-[11px] line-clamp-2">รายละเอียด: ${res.textDetails}</p>` : ''}
                </div>

                <div class="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-100 font-mono">
                    <span>เริ่ม: ${formatThaiDate(res.startDateTime)}</span>
                    <span>ถึง: ${formatThaiDate(res.endDateTime)}</span>
                </div>
            `;
            reservationsCards.appendChild(card);
        });
    }

    renderReservationsPagination(sortedList.length);
}

function renderReservationsPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / reservationsPerPage) || 1;
    const pageNumbers = document.getElementById('reservationsPageNumbers');
    const prevPage = document.getElementById('prevReservationsPage');
    const nextPage = document.getElementById('nextReservationsPage');
    const pageInfo = document.getElementById('reservationsPageInfo');

    if (prevPage) prevPage.disabled = reservationsCurrentPage === 1;
    if (nextPage) nextPage.disabled = reservationsCurrentPage === totalPages;
    if (pageInfo) pageInfo.textContent = `หน้า ${reservationsCurrentPage}/${totalPages} (ทั้งหมด ${totalItems} รายการ)`;

    if (!pageNumbers) return;
    pageNumbers.innerHTML = '';

    let startPage = Math.max(1, reservationsCurrentPage - 1);
    let endPage = Math.min(totalPages, startPage + 2);
    startPage = Math.max(1, endPage - 2);

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition ${i === reservationsCurrentPage ? 'bg-blue-700 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
        btn.textContent = i;
        btn.addEventListener('click', () => {
            reservationsCurrentPage = i;
            renderReservations();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        pageNumbers.appendChild(btn);
    }
}

/**
 * ==========================================================================
 * 3. Dashboard Chart Rendering with Dynamic Filters (Year & Borrow Type)
 * ==========================================================================
 */
function getDashboardSourceRecords() {
    if (window.globalData.dashboardHistory && window.globalData.dashboardHistory.length > 0) {
        return window.globalData.dashboardHistory;
    }
    return window.globalData.reservations || [];
}

function populateDashboardFilters() {
    const yearSelect = document.getElementById('dashboardYearFilter');
    const typeSelect = document.getElementById('dashboardTypeFilter');
    const sourceRecords = getDashboardSourceRecords();

    // 1. Populate Year Filter from Column H (startDateTime)
    if (yearSelect) {
        const years = new Set();
        sourceRecords.forEach(r => {
            if (r.startDateTime) {
                const d = new Date(r.startDateTime);
                if (!isNaN(d.getTime())) {
                    years.add(d.getFullYear());
                }
            }
        });

        const sortedYears = Array.from(years).sort((a, b) => b - a);
        const currentYearVal = yearSelect.value;
        yearSelect.innerHTML = '<option value="">ทั้งหมด (ทุกปี)</option>';
        sortedYears.forEach(y => {
            const thaiYear = y + 543;
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `พ.ศ. ${thaiYear} (${y})`;
            if (String(y) === currentYearVal) opt.selected = true;
            yearSelect.appendChild(opt);
        });
    }

    // 2. Populate Borrow Type Filter from Column D (borrowType)
    if (typeSelect) {
        const types = new Set();
        sourceRecords.forEach(r => {
            if (r.borrowType && String(r.borrowType).trim() !== '' && r.borrowType !== '-') {
                types.add(String(r.borrowType).trim());
            }
        });

        const currentTypeVal = typeSelect.value;
        typeSelect.innerHTML = '<option value="">ทั้งหมด (ทุกประเภท)</option>';
        Array.from(types).sort().forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === currentTypeVal) opt.selected = true;
            typeSelect.appendChild(opt);
        });
    }
}

function computeDashboardStats() {
    const sourceRecords = getDashboardSourceRecords();
    const inventory = window.globalData.inventory || [];
    const reservations = window.globalData.reservations || [];

    // KPI Card 3: กำลังถูกใช้งาน - ดึงจาก Sheet "join-sheet" โดย Column J = "อนุมัติ" หรือ "กำลังใช้งาน"
    const mannequinsInUse = reservations.filter(r => r.textStatus === 'อนุมัติ' || r.textStatus === 'กำลังใช้งาน').length;

    // In-memory Filter by Year (Col H), Month (Col H), and Borrow Type (Col D)
    const filtered = sourceRecords.filter(r => {
        let matchYear = true;
        let matchMonth = true;
        let matchType = true;

        if (r.startDateTime) {
            const d = new Date(r.startDateTime);
            if (!isNaN(d.getTime())) {
                if (dashboardSelectedYear) {
                    matchYear = String(d.getFullYear()) === String(dashboardSelectedYear);
                }
                if (dashboardSelectedMonth !== '') {
                    matchMonth = d.getMonth() === parseInt(dashboardSelectedMonth, 10);
                }
            } else if (dashboardSelectedYear || dashboardSelectedMonth !== '') {
                matchYear = false;
                matchMonth = false;
            }
        } else if (dashboardSelectedYear || dashboardSelectedMonth !== '') {
            matchYear = false;
            matchMonth = false;
        }

        if (dashboardSelectedType) {
            matchType = String(r.borrowType || '').trim() === String(dashboardSelectedType).trim();
        }

        return matchYear && matchMonth && matchType;
    });

    const totalReservations = filtered.length;
    const totalMannequins = inventory.length;

    // 1. Yearly Counts (จำนวนการจองรายปี) from Column H (startDateTime)
    const yearlyMap = {};
    filtered.forEach(r => {
        if (r.startDateTime) {
            const d = new Date(r.startDateTime);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                yearlyMap[y] = (yearlyMap[y] || 0) + 1;
            }
        }
    });

    const sortedYearsList = Object.keys(yearlyMap).map(Number).sort((a, b) => a - b);
    const yearlyCounts = {};
    sortedYearsList.forEach(y => {
        const thaiYear = y + 543;
        yearlyCounts[`พ.ศ. ${thaiYear}`] = yearlyMap[y];
    });

    // 2. Monthly Counts (12 Thai Months) from Column H (startDateTime)
    const monthlyCounts = {};
    monthNames.forEach(m => { monthlyCounts[m] = 0; });
    filtered.forEach(r => {
        if (r.startDateTime) {
            const d = new Date(r.startDateTime);
            if (!isNaN(d.getTime())) {
                const mName = monthNames[d.getMonth()];
                monthlyCounts[mName] = (monthlyCounts[mName] || 0) + 1;
            }
        }
    });

    // 3. Borrow Type Counts from Column D (borrowType)
    const typeCounts = {};
    filtered.forEach(r => {
        const t = (r.borrowType && String(r.borrowType).trim() && r.borrowType !== '-') ? String(r.borrowType).trim() : 'ไม่ระบุ';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    // 4. Department Counts (Top 10) from Column E (department)
    const deptCounts = {};
    filtered.forEach(r => {
        const dept = (r.department && String(r.department).trim() && r.department !== '-') ? String(r.department).trim() : 'ไม่ระบุ';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    const topDepts = Object.fromEntries(
        Object.entries(deptCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
    );

    // 5. Most Used Mannequins (Top 10) from Column C (mannequinName)
    const mannequinUsageCounts = {};
    filtered.forEach(r => {
        const mName = (r.mannequinName && String(r.mannequinName).trim() && r.mannequinName !== '-') ? String(r.mannequinName).trim() : 'ไม่ระบุ';
        mName.split(',').map(s => s.trim()).filter(Boolean).forEach(name => {
            mannequinUsageCounts[name] = (mannequinUsageCounts[name] || 0) + 1;
        });
    });
    const topMannequins = Object.fromEntries(
        Object.entries(mannequinUsageCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
    );

    return {
        totalReservations,
        totalMannequins,
        mannequinsInUse,
        yearlyCounts,
        monthlyCounts,
        typeCounts,
        departmentCounts: topDepts,
        mannequinUsage: topMannequins
    };
}

function renderDashboard() {
    populateDashboardFilters();
    const stats = computeDashboardStats();

    // Stats Counters
    const totalUsed = document.getElementById('totalUsed');
    const simulationsTotal = document.getElementById('simulationsTotal');
    const simulationUsing = document.getElementById('simulationUsing');

    if (totalUsed) totalUsed.textContent = (stats.totalReservations || 0).toLocaleString('th-TH');
    if (simulationsTotal) simulationsTotal.textContent = (stats.totalMannequins || 0).toLocaleString('th-TH');
    if (simulationUsing) simulationUsing.textContent = (stats.mannequinsInUse || 0).toLocaleString('th-TH');

    // Destroy existing chart instances
    if (yearlyBookingChart) { yearlyBookingChart.destroy(); yearlyBookingChart = null; }
    if (monthlyBookingChart) { monthlyBookingChart.destroy(); monthlyBookingChart = null; }
    if (simPieChart) { simPieChart.destroy(); simPieChart = null; }
    if (departmentChart) { departmentChart.destroy(); departmentChart = null; }
    if (simMostUsed) { simMostUsed.destroy(); simMostUsed = null; }

    const defaultFont = { family: 'Prompt', size: 11 };

    // 1. Yearly Booking Bar Chart
    const yearlyCanvas = document.getElementById('yearlyBookingChart');
    if (yearlyCanvas) {
        const yearLabels = Object.keys(stats.yearlyCounts);
        const yearData = Object.values(stats.yearlyCounts);
        yearlyBookingChart = new Chart(yearlyCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: yearLabels.length > 0 ? yearLabels : ['ไม่มีข้อมูล'],
                datasets: [{
                    label: 'จำนวนการจองรายปี (ครั้ง)',
                    data: yearData.length > 0 ? yearData : [0],
                    backgroundColor: '#2563eb',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: defaultFont } },
                    tooltip: { bodyFont: defaultFont, titleFont: defaultFont }
                },
                scales: {
                    x: { ticks: { font: defaultFont } },
                    y: { beginAtZero: true, ticks: { precision: 0, font: defaultFont } }
                }
            }
        });
    }

    // 2. Monthly Booking Bar Chart
    const monthlyCanvas = document.getElementById('monthlyBookingChart');
    if (monthlyCanvas) {
        monthlyBookingChart = new Chart(monthlyCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(stats.monthlyCounts),
                datasets: [{
                    label: 'จำนวนการจองรายเดือน (ครั้ง)',
                    data: Object.values(stats.monthlyCounts),
                    backgroundColor: '#0d9488',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: defaultFont } },
                    tooltip: { bodyFont: defaultFont, titleFont: defaultFont }
                },
                scales: {
                    x: { ticks: { font: { family: 'Prompt', size: 10 } } },
                    y: { beginAtZero: true, ticks: { precision: 0, font: defaultFont } }
                }
            }
        });
    }

    // 3. Borrow Type Doughnut Chart
    const pieCanvas = document.getElementById('simPieChart');
    if (pieCanvas) {
        const typeLabels = Object.keys(stats.typeCounts);
        const typeData = Object.values(stats.typeCounts);

        simPieChart = new Chart(pieCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: typeLabels.length > 0 ? typeLabels : ['ไม่มีข้อมูล'],
                datasets: [{
                    data: typeData.length > 0 ? typeData : [0],
                    backgroundColor: ['#2563eb', '#0284c7', '#0d9488', '#e11d48', '#d97706', '#7c3aed', '#64748b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: defaultFont } },
                    tooltip: { bodyFont: defaultFont, titleFont: defaultFont }
                }
            }
        });
    }

    // 4. Department Horizontal Bar Chart
    const deptCanvas = document.getElementById('departmentChart');
    if (deptCanvas) {
        const deptLabels = Object.keys(stats.departmentCounts);
        const deptData = Object.values(stats.departmentCounts);

        departmentChart = new Chart(deptCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: deptLabels.length > 0 ? deptLabels : ['ไม่มีข้อมูล'],
                datasets: [{
                    label: 'จำนวนการจอง',
                    data: deptData.length > 0 ? deptData : [0],
                    backgroundColor: '#0284c7',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: defaultFont } },
                    tooltip: { bodyFont: defaultFont, titleFont: defaultFont }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0, font: defaultFont } },
                    y: { ticks: { font: { family: 'Prompt', size: 10 } } }
                }
            }
        });
    }

    // 5. Most Used Mannequins Bar Chart
    const mostUsedCanvas = document.getElementById('simMostUsed');
    if (mostUsedCanvas) {
        const mannequinLabels = Object.keys(stats.mannequinUsage);
        const mannequinData = Object.values(stats.mannequinUsage);

        simMostUsed = new Chart(mostUsedCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: mannequinLabels.length > 0 ? mannequinLabels : ['ไม่มีข้อมูล'],
                datasets: [{
                    label: 'จำนวนครั้งที่ใช้งาน',
                    data: mannequinData.length > 0 ? mannequinData : [0],
                    backgroundColor: '#4f46e5',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: defaultFont } },
                    tooltip: { bodyFont: defaultFont, titleFont: defaultFont }
                },
                scales: {
                    x: { ticks: { font: { family: 'Prompt', size: 10 } } },
                    y: { beginAtZero: true, ticks: { precision: 0, font: defaultFont } }
                }
            }
        });
    }
}

/**
 * ==========================================================================
 * Cart & Slide-Up Bottom Sheet Drawer Management
 * ==========================================================================
 */
function toggleCartItem(item) {
    const index = cart.findIndex(c => c.id === item.id);
    if (index === -1) {
        cart.push(item);
    } else {
        cart.splice(index, 1);
    }
    updateCartCount();
    renderMannequins();
    renderCartItems();
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    if (cartCount) cartCount.textContent = cart.length;
}

function renderCartItems() {
    const emptyCartMessage = document.getElementById('emptyCartMessage');
    const cartItemsList = document.getElementById('cartItemsList');
    const reservationForm = document.getElementById('reservationForm');

    if (cart.length === 0) {
        if (emptyCartMessage) emptyCartMessage.classList.remove('hidden');
        if (cartItemsList) cartItemsList.classList.add('hidden');
        if (reservationForm) reservationForm.classList.add('hidden');
        return;
    }

    if (emptyCartMessage) emptyCartMessage.classList.add('hidden');
    if (cartItemsList) {
        cartItemsList.classList.remove('hidden');
        cartItemsList.innerHTML = '';

        cart.forEach(item => {
            const cartItem = document.createElement('div');
            cartItem.className = 'flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200';
            const imageUrl = formatImageUrl(item.imageUrl);

            cartItem.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="${imageUrl}" alt="${item.name}" class="h-10 w-10 sm:h-12 sm:w-12 object-contain bg-white rounded-lg p-1 border border-slate-100" onerror="this.onerror=null; this.src=placeholderImage;">
                    <div>
                        <p class="text-[10px] font-mono text-blue-600 font-bold">${item.code || ''}</p>
                        <h4 class="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">${item.name}</h4>
                        <p class="text-[10px] text-slate-500">${item.category || 'ทั่วไป'}</p>
                    </div>
                </div>
                <button class="remove-btn text-rose-500 hover:text-rose-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition" data-id="${item.id}">
                    ลบ
                </button>
            `;

            cartItemsList.appendChild(cartItem);

            cartItem.querySelector('.remove-btn').addEventListener('click', () => {
                const idx = cart.findIndex(c => c.id === item.id);
                if (idx !== -1) {
                    cart.splice(idx, 1);
                    updateCartCount();
                    renderCartItems();
                    renderMannequins();
                }
            });
        });
    }

    if (reservationForm) reservationForm.classList.remove('hidden');
}

function openCartDrawer() {
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
        cartModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock background scroll
        renderCartItems();
    }
}

function closeCartDrawer() {
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
        cartModal.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock background scroll
    }
}

/**
 * ==========================================================================
 * Standard 5: Pessimistic Mutation Execution & Cache Synchronization
 * ==========================================================================
 */
async function submitReservation(event) {
    if (event) event.preventDefault();

    if (cart.length === 0) {
        showError('กรุณาเลือกหุ่นฝึกหัตถการอย่างน้อย 1 รายการ');
        return;
    }

    const borrowerName = document.getElementById('borrowerName')?.value.trim();
    const department = document.getElementById('department')?.value.trim();
    const startDateTime = document.getElementById('startDateTime')?.value;
    const endDateTime = document.getElementById('endDateTime')?.value;
    const borrowType = document.getElementById('borrowType')?.value;
    const useNumber = document.getElementById('useNumber')?.value;
    const textDetails = document.getElementById('textDetails')?.value.trim();
    const studyGroup = document.getElementById('stuGroup')?.value || '';
    const teacherName = document.getElementById('teachers')?.value || '';

    if (!window.globalData.departments.includes(department)) {
        showError('กรุณาเลือกแผนก/รายวิชาที่ถูกต้องจากรายการ');
        return;
    }

    if (!borrowerName || !department || !startDateTime || !endDateTime || !borrowType || !useNumber || !textDetails) {
        showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
        return;
    }

    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    if (startDate >= endDate) {
        showError('วันที่/เวลาสิ้นสุดต้องมากกว่าวันที่/เวลาเริ่มต้น');
        return;
    }

    const result = await Swal.fire({
        title: 'ยืนยันการบันทึกการจอง',
        text: `คุณต้องการบันทึกการจองหุ่นฝึก ${cart.length} รายการใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันการจอง',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#1d4ed8',
        cancelButtonColor: '#64748b'
    });

    if (!result.isConfirmed) return;

    const submitBtn = document.getElementById('submitReservationBtn');
    const submitBtnText = document.getElementById('submitBtnText');
    const loader = submitBtn?.querySelector('.loader');

    try {
        Swal.fire({
            title: 'กำลังบันทึกข้อมูล...',
            text: 'กรุณารอสักครู่ ระบบกำลังประมวลผล',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => { Swal.showLoading(); }
        });

        if (submitBtn) submitBtn.disabled = true;
        if (loader) loader.classList.remove('hidden');
        if (submitBtnText) submitBtnText.textContent = 'กำลังบันทึก...';

        const reservationsPayload = cart.map(item => ({
            mannequinId: item.id,
            mannequinName: item.name,
            borrowerName,
            startDateTime,
            endDateTime,
            borrowType,
            department,
            timestamp: new Date().toISOString(),
            textDetails,
            useNumber,
            studyGroup,
            teacherName
        }));

        // Atomic POST Execution
        const response = await callApi('saveReservation', 'POST', reservationsPayload);

        // Strict Pessimistic Frontend Update: Mutate state ONLY AFTER success
        if (response && response.success) {
            const reservedIds = new Set(cart.map(c => c.id));

            // 1. Direct Cache Update: Update inventory availability in client memory
            window.globalData.inventory = window.globalData.inventory.map(item => {
                if (reservedIds.has(item.id)) {
                    return { ...item, status: 'ถูกจองแล้ว' };
                }
                return item;
            });

            // 2. Targeted Sync (Standard 4): Selective refresh for computed formulas
            window.syncTargetedSimSheets(['หุ่นฝึกหัถการ', 'join-sheet']).then(() => {
                filterAndSortMannequins();
            });

            // Reset UI state
            cart = [];
            updateCartCount();
            closeCartDrawer();
            document.getElementById('reservationForm')?.reset();

            await Swal.fire({
                icon: 'success',
                title: 'บันทึกการจองสำเร็จ!',
                text: 'ระบบได้ส่งข้อมูลการจองและแจ้งเตือนเรียบร้อยแล้ว',
                confirmButtonColor: '#1d4ed8',
                timer: 2000
            });

            // Re-render views
            filterAndSortMannequins();
        } else {
            throw new Error(response.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }
    } catch (error) {
        console.error('submitReservation Error:', error);
        // Fallback Cache Invalidation (Standard 5)
        window.dataNeedsRefresh = true;
        showError('ไม่สามารถบันทึกข้อมูลได้: ' + error.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (loader) loader.classList.add('hidden');
        if (submitBtnText) submitBtnText.textContent = 'ยืนยันการจอง';
    }
}

/**
 * ==========================================================================
 * Utility & UI Helpers
 * ==========================================================================
 */
function showLoading(msg = 'กำลังโหลดข้อมูล...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    if (text) text.textContent = msg;
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function showError(msg) {
    Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: msg,
        confirmButtonColor: '#1d4ed8'
    });
}

function formatThaiDate(dateInput) {
    if (!dateInput || dateInput === '-') return '-';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput.toString();

    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear() + 543;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${minutes}`;
}

/**
 * ==========================================================================
 * Application Initialization & Event Listeners
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Desktop Top Tab Elements
    const dashboardTab = document.getElementById('dashboardTab');
    const reserveTab = document.getElementById('reserveTab');
    const calendarTab = document.getElementById('calendarTab');
    const reservationsTab = document.getElementById('reservationsTab');

    // Mobile Bottom Navigation Elements
    const bottomNavReserve = document.getElementById('bottomNavReserve');
    const bottomNavCalendar = document.getElementById('bottomNavCalendar');
    const bottomNavReservations = document.getElementById('bottomNavReservations');
    const bottomNavDashboard = document.getElementById('bottomNavDashboard');

    // Cart Modal Elements
    const cartBtn = document.getElementById('headerCartBtn');
    const cartModal = document.getElementById('cartModal');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const submitReservationBtn = document.getElementById('submitReservationBtn');

    // Mannequin Filter Elements
    const searchInput = document.getElementById('searchInput');
    const sortBy = document.getElementById('sortBy');

    // Mannequin Pagination Elements
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');

    // Active Reservations Pagination Elements
    const prevReservationsPage = document.getElementById('prevReservationsPage');
    const nextReservationsPage = document.getElementById('nextReservationsPage');

    // Dashboard Filter Elements
    const dashboardYearFilter = document.getElementById('dashboardYearFilter');
    const dashboardMonthFilter = document.getElementById('dashboardMonthFilter');
    const dashboardTypeFilter = document.getElementById('dashboardTypeFilter');
    const resetDashboardFilterBtn = document.getElementById('resetDashboardFilterBtn');

    // Desktop Tab Events
    if (reserveTab) reserveTab.addEventListener('click', showReservationView);
    if (calendarTab) calendarTab.addEventListener('click', showCalendarView);
    if (reservationsTab) reservationsTab.addEventListener('click', showReservationsView);
    if (dashboardTab) dashboardTab.addEventListener('click', showDashboardView);

    // Mobile Bottom Navigation Events
    if (bottomNavReserve) bottomNavReserve.addEventListener('click', showReservationView);
    if (bottomNavCalendar) bottomNavCalendar.addEventListener('click', showCalendarView);
    if (bottomNavReservations) bottomNavReservations.addEventListener('click', showReservationsView);
    if (bottomNavDashboard) bottomNavDashboard.addEventListener('click', showDashboardView);

    // Cart Modal Events
    if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCartDrawer);

    if (clearCartBtn) clearCartBtn.addEventListener('click', async () => {
        if (cart.length === 0) return;
        const res = await Swal.fire({
            icon: 'warning',
            title: 'ต้องการล้างตะกร้า?',
            text: 'รายการที่เลือกไว้จะถูกลบทั้งหมด',
            showCancelButton: true,
            confirmButtonText: 'ล้างตะกร้า',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#ef4444'
        });
        if (res.isConfirmed) {
            cart = [];
            updateCartCount();
            renderCartItems();
            renderMannequins();
        }
    });

    if (submitReservationBtn) submitReservationBtn.addEventListener('click', submitReservation);

    // Mannequin Filter Events
    if (searchInput) searchInput.addEventListener('input', filterAndSortMannequins);
    if (sortBy) sortBy.addEventListener('change', filterAndSortMannequins);

    // Mannequin Pagination Events
    if (prevPage) prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderMannequins();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    if (nextPage) nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredMannequins.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderMannequins();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Active Reservations Search & Pagination Events
    const reservationsSearchInput = document.getElementById('reservationsSearchInput');
    const reservationsPerPageSelect = document.getElementById('reservationsPerPageSelect');

    if (reservationsSearchInput) {
        reservationsSearchInput.addEventListener('input', (e) => {
            reservationsSearchTerm = e.target.value;
            reservationsCurrentPage = 1;
            renderReservations();
        });
    }

    if (reservationsPerPageSelect) {
        reservationsPerPageSelect.addEventListener('change', (e) => {
            reservationsPerPage = parseInt(e.target.value, 10) || 10;
            reservationsCurrentPage = 1;
            renderReservations();
        });
    }

    if (prevReservationsPage) prevReservationsPage.addEventListener('click', () => {
        if (reservationsCurrentPage > 1) {
            reservationsCurrentPage--;
            renderReservations();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    if (nextReservationsPage) nextReservationsPage.addEventListener('click', () => {
        const sorted = getSortedReservations();
        const totalPages = Math.ceil(sorted.length / reservationsPerPage);
        if (reservationsCurrentPage < totalPages) {
            reservationsCurrentPage++;
            renderReservations();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Dashboard Filter Events
    if (dashboardYearFilter) {
        dashboardYearFilter.addEventListener('change', (e) => {
            dashboardSelectedYear = e.target.value;
            renderDashboard();
        });
    }

    if (dashboardMonthFilter) {
        dashboardMonthFilter.addEventListener('change', (e) => {
            dashboardSelectedMonth = e.target.value;
            renderDashboard();
        });
    }

    if (dashboardTypeFilter) {
        dashboardTypeFilter.addEventListener('change', (e) => {
            dashboardSelectedType = e.target.value;
            renderDashboard();
        });
    }

    if (resetDashboardFilterBtn) {
        resetDashboardFilterBtn.addEventListener('click', () => {
            dashboardSelectedYear = '';
            dashboardSelectedMonth = '';
            dashboardSelectedType = '';
            if (dashboardYearFilter) dashboardYearFilter.value = '';
            if (dashboardMonthFilter) dashboardMonthFilter.value = '';
            if (dashboardTypeFilter) dashboardTypeFilter.value = '';
            renderDashboard();
        });
    }

    // Close Modal on Background Click
    window.addEventListener('click', (e) => {
        if (e.target === cartModal) closeCartDrawer();
    });

    // Set Min Datetime for inputs
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const minIso = `${year}-${month}-${day}T${hours}:${minutes}`;

    const startDateTime = document.getElementById('startDateTime');
    const endDateTime = document.getElementById('endDateTime');
    if (startDateTime) startDateTime.min = minIso;
    if (endDateTime) endDateTime.min = minIso;

    // Boot App: Fetch Initial Data ONCE (Standard 1)
    try {
        await fetchInitialData();
        showReservationView();
    } catch (e) {
        console.error('App Boot Error:', e);
    }
});
