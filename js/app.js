import supabase from './db.js';
import { StatCard, Table, AssetRow, CCTVCard, Modal } from './components.js';
import { showToast, formatDate } from './utils.js';

// --- State & Navigation ---
let currentView = 'dashboard';

const init = async () => {
    setupNavigation();
    window.renderView('dashboard');
};

const setupNavigation = () => {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');

            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            window.renderView(view);

            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebar-overlay').classList.add('hidden');
            }
        });
    });

    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const toggleMenu = () => {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    };

    menuBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
};

window.renderView = async (view, params = {}) => {
    currentView = view;
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="animate-pulse h-64 bg-white/5 rounded-2xl"></div>';

    try {
        switch (view) {
            case 'dashboard':
                await renderDashboard(container);
                break;
            case 'assets':
                await renderAssets(container, params);
                break;
            case 'staff':
                await renderStaff(container);
                break;
            case 'cctv':
                await fetchFloors(); // ensure floors are loaded
                await fetchPremises(); // ensure premises are loaded
                await renderCCTV(container);
                break;
            case 'accessories':
                await renderAccessories(container);
                break;
            case 'repairs':
                await renderRepairs(container);
                break;

            default:
                await renderDashboard(container);
        }

        // Trigger Page Transition Animation
        container.classList.remove('animate-fade-in');
        void container.offsetWidth; // Force Reflow
        container.classList.add('animate-fade-in');
    } catch (error) {
        console.error("Render Error:", error);
        showToast("Error loading view: " + error.message, "error");
    }
};

// --- Renderers ---

const renderDashboard = async (container) => {
    // Fetch aggregated data for stats
    const { data: assets } = await supabase.from('assets').select('type, status');
    const { count: cctvFaulty } = await supabase.from('cctv').select('*', { count: 'exact', head: true }).eq('status', 'Faulty');

    if (!assets) return;

    // Calculators
    const counts = {
        total: assets.length,
        totalLaptops: assets.filter(a => a.type === 'Laptop').length,
        totalMobiles: assets.filter(a => a.type === 'Mobile Phone').length,

        issued: assets.filter(a => a.status === 'Issued').length,
        issuedLaptops: assets.filter(a => a.status === 'Issued' && a.type === 'Laptop').length,
        issuedMobiles: assets.filter(a => a.status === 'Issued' && a.type === 'Mobile Phone').length,

        available: assets.filter(a => a.status === 'Available').length,

        repair: assets.filter(a => a.status === 'Repair').length,
        repairLaptops: assets.filter(a => a.status === 'Repair' && a.type === 'Laptop').length,
        repairMobiles: assets.filter(a => a.status === 'Repair' && a.type === 'Mobile Phone').length,
    };

    // Construct Detail HTMLs
    const totalDetails = `
        <div class="flex justify-between items-center"><span class="opacity-70">Laptops:</span> <span class="font-bold text-textMain">${counts.totalLaptops}</span></div>
        <div class="flex justify-between items-center"><span class="opacity-70">Mobiles:</span> <span class="font-bold text-textMain">${counts.totalMobiles}</span></div>
    `;

    const issuedDetails = `
        <div class="flex justify-between items-center"><span class="opacity-70">Laptops:</span> <span class="font-bold text-textMain">${counts.issuedLaptops}</span></div>
        <div class="flex justify-between items-center"><span class="opacity-70">Mobiles:</span> <span class="font-bold text-textMain">${counts.issuedMobiles}</span></div>
        <div onclick="window.renderView('assets', { status: 'Available' })" class="cursor-pointer hover:bg-white/5 transition-colors rounded px-1 -mx-1 flex justify-between items-center text-[#4ADE80] mt-1 pt-1 border-t border-border" title="Click to view available assets"><span class="opacity-90">Available to Issue:</span> <span class="font-bold">${counts.available}</span></div>
    `;

    const repairDetails = `
        <div class="flex justify-between items-center"><span class="opacity-70">Laptops:</span> <span class="font-bold text-textMain">${counts.repairLaptops}</span></div>
        <div class="flex justify-between items-center"><span class="opacity-70">Mobiles:</span> <span class="font-bold text-textMain">${counts.repairMobiles}</span></div>
    `;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            ${StatCard('Total Assets', counts.total, 'fas fa-cubes', 'bg-teal-400/10 text-teal-400', totalDetails)}
            ${StatCard('Issued', counts.issued, 'fas fa-user-check', 'bg-indigo-400/10 text-indigo-400', issuedDetails)}
            ${StatCard('In Repair', counts.repair, 'fas fa-wrench', 'bg-amber-400/10 text-amber-400', repairDetails)}
            ${StatCard('CCTV Faulty', cctvFaulty || 0, 'fas fa-video-slash', 'bg-rose-400/10 text-rose-400')}
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-surface p-6 rounded-lg border border-border">
                <h3 class="text-xl font-bold text-textMain mb-4">Recent Repairs</h3>
                <div id="dashboard-repairs" class="space-y-3"></div>
            </div>
             <div class="bg-surface p-6 rounded-lg border border-border">
                <h3 class="text-xl font-bold text-textMain mb-4">Recent Assignments</h3>
                <div id="dashboard-assignments" class="space-y-3"></div>
            </div>
        </div>
    `;

    // Load recent repairs
    const { data: repairs } = await supabase.from('repairs').select(`
        *,
        assets ( model )
    `).order('date', { ascending: false }).limit(5);

    const repairsHtml = repairs ? repairs.map((r, index) => `
        <div class="flex items-center gap-4 p-3 rounded bg-dark border border-border animate-slide-up" style="animation-delay: ${index * 100}ms">
            <div class="w-8 h-8 rounded flex items-center justify-center text-[#FBBF24] bg-[#FBBF24]/10">
                <i class="fas fa-wrench text-xs"></i>
            </div>
            <div>
                <p class="font-medium text-textMain text-sm">${r.assets?.model || 'Unknown'}</p>
                <p class="text-[11px] text-textSub">${r.faultDescription}</p>
            </div>
            <div class="ml-auto text-xs text-textSub font-mono">${formatDate(r.date)}</div>
        </div>
    `).join('') : '<p class="text-textSub text-sm italic">No recent repairs</p>';
    document.getElementById('dashboard-repairs').innerHTML = repairsHtml;

    // Load recent assignments (fetch latest 5 created)
    const { data: assignments } = await supabase
        .from('assignments')
        .select(`
            id,
            issueDate,
            created_at,
            assets!inner ( model, serialNumber ),
            staff!inner ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(5);

    const assHtml = assignments && assignments.length > 0 ? assignments.map((a, index) => `
        <div class="flex items-center gap-4 p-3 rounded bg-dark border border-border hover:bg-white/5 transition-colors animate-slide-up" style="animation-delay: ${index * 100}ms">
            <div class="w-8 h-8 rounded flex items-center justify-center text-primary bg-primary/10 border border-primary/20">
                <i class="fas fa-user-check text-xs"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-textMain text-sm truncate">${a.staff?.name || 'Unknown Staff'}</p>
                <div class="flex items-center gap-2 text-[11px] text-textSub mt-0.5">
                    <span class="truncate max-w-[120px]">${a.assets?.model || 'Unknown Item'}</span>
                    <span class="opacity-50">•</span>
                    <span class="font-mono opacity-70">${a.assets?.serialNumber || ''}</span>
                </div>
            </div>
            <div class="text-right">
                <div class="text-[10px] text-textSub font-mono opacity-80">${formatDate(a.issueDate)}</div>
            </div>
        </div>
    `).join('') : '<div class="p-4 text-center border border-dashed border-white/10 rounded-xl"><p class="text-textSub text-sm italic">No recent assignments found.</p></div>';

    const assignContainer = document.getElementById('dashboard-assignments');
    if (assignContainer) assignContainer.innerHTML = assHtml;
};

const renderAssets = async (container, params = {}) => {
    const initialStatus = params.status || '';

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <h2 class="text-2xl font-bold text-textMain">Asset Inventory</h2>
            <div class="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <div class="relative flex-1 md:w-48">
                     <select id="asset-filter-status" class="w-full bg-surface border border-border rounded px-4 py-2 text-sm focus:border-primary transition-colors text-textMain appearance-none cursor-pointer">
                        <option value="">All Statuses</option>
                        <option value="Available" ${initialStatus === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="Issued">Issued</option>
                        <option value="Repair">In Repair</option>
                        <option value="Scrap">Scrap</option>
                    </select>
                    <i class="fas fa-filter absolute right-3 top-2.5 text-textSub text-xs pointer-events-none"></i>
                </div>
                <div class="relative flex-1 md:w-64">
                    <input type="text" id="asset-search" placeholder="Search serial, model..." class="w-full bg-surface border border-border rounded px-4 py-2 pl-9 text-sm focus:border-primary transition-colors">
                    <i class="fas fa-search absolute left-3 top-2.5 text-textSub text-xs"></i>
                </div>
                <button onclick="window.openAddAssetModal()" class="px-4 py-2 bg-primary hover:bg-[#3E5C69] rounded text-white font-medium text-sm transition-all shadow-none whitespace-nowrap">
                    <i class="fas fa-plus mr-2"></i> Add Asset
                </button>
            </div>
        </div>

        ${Table(['Serial', 'Model', 'Type', 'Status', 'Assigned To', 'Actions'], 'assets-body')}
    `;

    const { data: assets } = await supabase.from('assets').select('*').order('created_at', { ascending: false });

    // Fetch active assignments to map assetId -> staffName
    const { data: assignments } = await supabase.from('assignments')
        .select('assetId, staff(name)')
        .is('returnDate', null);

    const assignmentMap = {};
    if (assignments) {
        assignments.forEach(a => {
            if (a.staff) assignmentMap[a.assetId] = a.staff.name;
        });
    }

    const renderRows = (list) => {
        const tbody = document.getElementById('assets-body');
        if (list.length > 0) {
            tbody.innerHTML = list.map(asset => AssetRow(asset, assignmentMap[asset.id])).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-textSub italic">No assets found matching criteria.</td></tr>';
        }
    };

    const filterAssets = () => {
        const term = document.getElementById('asset-search').value.toLowerCase();
        const status = document.getElementById('asset-filter-status').value;

        if (!assets) return;

        const filtered = assets.filter(a => {
            const matchesSearch = (a.serialNumber && a.serialNumber.toLowerCase().includes(term)) ||
                (a.model && a.model.toLowerCase().includes(term)) ||
                (assignmentMap[a.id] && assignmentMap[a.id].toLowerCase().includes(term));
            const matchesStatus = status === '' || a.status === status;
            return matchesSearch && matchesStatus;
        });

        renderRows(filtered);
    };

    if (assets) {
        // Initial Render (respecting initial filter)
        filterAssets();
    }

    // Event Listeners
    document.getElementById('asset-search').addEventListener('input', filterAssets);
    document.getElementById('asset-filter-status').addEventListener('change', filterAssets);
};

const renderStaff = async (container) => {
    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <h2 class="text-2xl font-bold text-textMain">Staff Directory</h2>
            <div class="flex gap-3 w-full md:w-auto">
                <div class="relative flex-1 md:w-64">
                    <input type="text" id="staff-search" placeholder="Search name, ID, department..." class="w-full bg-surface border border-border rounded px-4 py-2 pl-9 text-sm focus:border-primary transition-colors">
                    <i class="fas fa-search absolute left-3 top-2.5 text-textSub text-xs"></i>
                </div>
                <button onclick="window.openAddStaffModal()" class="px-4 py-2 bg-primary hover:bg-[#3E5C69] rounded text-white font-medium text-sm transition-all shadow-none">
                    <i class="fas fa-plus mr-2"></i> Add Staff
                </button>
            </div>
        </div>
        ${Table(['ID', 'Name', 'Department', 'Items Issued', 'Actions'], 'staff-body')}
    `;

    // Fetch staff and their active assignments count
    const { data: staff } = await supabase.from('staff').select('*').order('name');
    const { data: activeAssignments } = await supabase.from('assignments').select('staffId').is('returnDate', null);

    if (staff) {
        // Map counts
        const counts = {};
        if (activeAssignments) {
            activeAssignments.forEach(a => {
                counts[a.staffId] = (counts[a.staffId] || 0) + 1;
            });
        }

        const renderList = (list) => {
            const html = list.map(s => `
                <tr class="hover:bg-dark transition-colors group">
                    <td class="p-4 text-textSub font-mono text-sm group-hover:text-textMain transition-colors">${s.employeeId}</td>
                    <td class="p-4 font-medium text-textMain text-sm">${s.name}</td>
                    <td class="p-4 text-textSub text-sm">${s.department}</td>
                    <td class="p-4 text-sm">
                    ${counts[s.id] > 0
                    ? `<span class="bg-indigo-400/10 text-indigo-400 px-2.5 py-1 rounded text-xs font-bold">${counts[s.id]} Active</span>`
                    : `<span class="text-textSub opacity-50 text-xs shadow-none">-</span>`}
                    </td>
                    <td class="p-4 text-right">
                        <button onclick="window.viewStaffDetails(${s.id})" class="text-sm font-bold text-primary hover:text-white transition-colors bg-primary/10 hover:bg-primary px-3 py-1 rounded">View</button>
                    </td>
                </tr>
            `).join('');
            const tbody = document.getElementById('staff-body');
            if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="p-8 text-center text-textSub italic">No staff members found.</td></tr>';
        };

        renderList(staff);

        // Search Listener
        const searchInput = document.getElementById('staff-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = staff.filter(s =>
                    (s.name && s.name.toLowerCase().includes(term)) ||
                    (s.employeeId && s.employeeId.toLowerCase().includes(term)) ||
                    (s.department && s.department.toLowerCase().includes(term))
                );
                renderList(filtered);
            });
        }
    }
};

window.viewStaffDetails = async (id) => {
    const { data: s } = await supabase.from('staff').select('*').eq('id', id).single();
    if (!s) return;

    // Fetch active assignments with asset details
    const { data: assignments } = await supabase.from('assignments')
        .select('*, assets(model, serialNumber, type)')
        .eq('staffId', id)
        .is('returnDate', null);

    // Fetch updated history (returned items)
    const { data: history } = await supabase.from('assignments')
        .select('*, assets(model, serialNumber, type)')
        .eq('staffId', id)
        .not('returnDate', 'is', null)
        .order('returnDate', { ascending: false })
        .limit(5);

    const activeRows = assignments && assignments.length > 0 ? assignments.map(a => `
        <tr class="text-sm border-b border-border last:border-0 hover:bg-white/5">
            <td class="p-3 font-medium text-textMain">${a.assets?.model}</td>
            <td class="p-3 text-textSub font-mono text-xs">${a.assets?.serialNumber}</td>
            <td class="p-3 text-textSub text-xs">${a.assets?.type}</td>
            <td class="p-3 text-textSub text-xs">${formatDate(a.issueDate)}</td>
            <td class="p-3 text-right">
                <button onclick="window.returnAsset(${a.assetId}, 'staff', ${id})" class="text-xs font-bold text-primary hover:text-white hover:underline">
                    Return
                </button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="5" class="p-4 text-center text-textSub italic">No items currently issued.</td></tr>';

    const historyRows = history && history.length > 0 ? history.map(h => `
        <tr class="text-xs border-b border-border last:border-0 hover:bg-white/5">
            <td class="p-3 text-textMain font-medium">
                ${h.assets?.model}
                <span class="block text-[10px] text-textSub font-mono mt-0.5 opacity-80">${h.assets?.serialNumber || 'N/A'}</span>
            </td>
            <td class="p-3 text-textSub text-right">${formatDate(h.returnDate)}</td>
        </tr>
    `).join('') : '<tr><td colspan="2" class="p-4 text-center text-textSub italic opacity-50">No recent history.</td></tr>';

    const contentHtml = `
        <div class="space-y-6">
            <div class="p-4 bg-surface rounded border border-border flex justify-between items-start">
                <div>
                    <h3 class="text-xl font-bold text-textMain">${s.name}</h3>
                    <p class="text-sm text-textSub">${s.department}</p>
                </div>
                <div class="text-right">
                    <span class="text-xs font-mono text-textSub bg-dark px-2 py-1 rounded">ID: ${s.employeeId}</span>
                </div>
            </div>

            <div>
                <h4 class="text-sm font-bold text-textSub uppercase tracking-wider mb-2 flex items-center gap-2">
                    <i class="fas fa-box-open text-primary"></i> Currently Issued Items
                </h4>
                <div class="bg-dark rounded border border-border overflow-hidden">
                    <table class="w-full text-left">
                        <thead class="bg-surface text-xs text-textSub uppercase font-bold border-b border-border">
                            <tr>
                                <th class="p-3">Model</th>
                                <th class="p-3">Serial</th>
                                <th class="p-3">Type</th>
                                <th class="p-3">Issue Date</th>
                                <th class="p-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            ${activeRows}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div>
                 <h4 class="text-sm font-bold text-textSub uppercase tracking-wider mb-2 flex items-center gap-2">
                    <i class="fas fa-history text-secondary"></i> Recently Returned
                </h4>
                <div class="bg-dark rounded border border-border overflow-hidden">
                    <table class="w-full text-left">
                        <tbody class="divide-y divide-border">
                            ${historyRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    `;

    openModal('staffDetailsModal', 'Staff Profile', contentHtml, 'Close', 'closeHistory');
};

const renderCCTV = async (container) => {
    // 1. Fetch all cameras
    const { data: cameras } = await supabase.from('cctv').select('*').order('cameraLocation');
    if (!cameras) return;

    // 2. Identify Premises (from DB)
    if (!window.allPremises) await fetchPremises();

    // Sort by sort_order
    const sortedPremises = window.allPremises.sort((a, b) => a.sort_order - b.sort_order);

    // Fallback if empty
    const premiseNames = sortedPremises && sortedPremises.length > 0 ? sortedPremises.map(p => p.name) : ['Main Premise'];
    const allPremises = premiseNames;

    // Set default premise if needed
    if (!window.currentCctvPremise) window.currentCctvPremise = allPremises[0];

    // Inject Shell (Header + Content Container)
    // Inject Shell (Header + Content Container)
    container.innerHTML = `
        <div class="flex flex-col xl:flex-row justify-between items-center gap-4 mb-6">
            <h2 class="text-2xl font-bold text-textMain">CCTV Monitoring</h2>
            <div class="flex flex-wrap gap-2 justify-center xl:justify-end w-full xl:w-auto">
                 <div class="relative w-full sm:w-48 order-first xl:order-none mb-2 xl:mb-0">
                     <select id="cctv-sort" class="w-full bg-surface border border-border rounded px-3 py-2 text-xs focus:border-primary transition-colors text-textMain appearance-none cursor-pointer">
                        <option value="location">Sort by Location</option>
                        <option value="model">Sort by Model</option>
                        <option value="status-working">Sort by Working</option>
                        <option value="status-faulty">Sort by Faulty</option>
                        <option value="serial">Sort by Serial</option>
                        <option value="date-newest">Sort by Date (Newest)</option>
                        <option value="date-oldest">Sort by Date (Oldest)</option>
                    </select>
                    <i class="fas fa-sort absolute right-3 top-2.5 text-textSub text-[10px] pointer-events-none"></i>
                </div>
                 <div class="relative w-full sm:w-64 order-first xl:order-none mb-2 xl:mb-0">
                    <input type="text" id="cctv-search" placeholder="Search location, model, serial..." class="w-full bg-surface border border-border rounded px-3 py-2 pl-8 text-xs focus:border-primary transition-colors">
                    <i class="fas fa-search absolute left-2.5 top-2.5 text-textSub text-[10px]"></i>
                </div>
                 <button onclick="window.openManagePremisesModal()" class="px-3 py-2 bg-dark hover:bg-surface border border-border rounded text-textSub hover:text-textMain font-medium text-xs transition-all shadow-none">
                    <i class="fas fa-building mr-1"></i> Premises
                </button>
                <button onclick="window.openManageFloorsModal()" class="px-3 py-2 bg-dark hover:bg-surface border border-border rounded text-textSub hover:text-textMain font-medium text-xs transition-all shadow-none">
                    <i class="fas fa-layer-group mr-1"></i> Floors
                </button>
                <button onclick="window.downloadCCTVReport()" class="px-3 py-2 bg-dark hover:bg-surface border border-border rounded text-textSub hover:text-textMain font-medium text-xs transition-all shadow-none">
                    <i class="fas fa-download mr-1"></i> Export
                </button>
                <button onclick="window.openAddCCTVModal()" class="px-4 py-2 bg-primary hover:bg-[#3E5C69] rounded text-white font-medium text-sm transition-all shadow-none">
                    <i class="fas fa-plus mr-2"></i> Add Camera
                </button>
            </div>
        </div>
        
        <div id="cctv-content"></div>
    `;

    // Function to render the inner grids based on current state and search
    const renderGrids = () => {
        const searchTerm = document.getElementById('cctv-search')?.value.toLowerCase() || '';
        const sortMode = document.getElementById('cctv-sort')?.value || 'location';

        // Filter tabs logic
        const tabsHtml = allPremises.map(p => `
            <button onclick="window.switchCctvPremise('${p}')" 
                class="px-4 py-2 text-sm font-bold rounded-t-lg transition-colors border-b-2 
                ${window.currentCctvPremise === p
                ? 'text-primary border-primary bg-surface'
                : 'text-textSub border-transparent hover:text-textMain hover:bg-white/5'}">
                ${p}
            </button>
        `).join('');

        // Apply Search Filter
        const filteredCameras = cameras.filter(c => {
            if (!searchTerm) return true;
            return (c.cameraLocation && c.cameraLocation.toLowerCase().includes(searchTerm)) ||
                (c.model && c.model.toLowerCase().includes(searchTerm)) ||
                (c.serialNumber && c.serialNumber.toLowerCase().includes(searchTerm)) ||
                (c.status && c.status.toLowerCase().includes(searchTerm)) ||
                (c.floor && c.floor.toLowerCase().includes(searchTerm));
        });

        // Split Lists
        const stockList = filteredCameras.filter(c => c.status === 'In Stock');
        const scrapList = filteredCameras.filter(c => c.status === 'Damaged');

        // Active cameras for this premise only
        // Note: Search applies globally to stock/scrap, but active depends on tab + search
        const activeCameras = filteredCameras.filter(c =>
            c.status !== 'In Stock' &&
            c.status !== 'Damaged' &&
            (c.premise || 'Main Premise') === window.currentCctvPremise
        );

        const inventoryHtml = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                 <div class="bg-surface p-5 rounded border border-border">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-textSub font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                            <i class="fas fa-box text-primary"></i> Global Stock (${stockList.length})
                        </h3>
                        <button onclick="window.openAddStockCameraModal()" class="text-[10px] font-bold text-white bg-primary hover:bg-[#3E5C69] px-2.5 py-1 rounded transition-colors">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                        ${stockList.map(CCTVCard).join('') || '<p class="text-textSub text-xs italic col-span-2">No cameras found in stock matching query.</p>'}
                    </div>
                </div>
                
                <div class="bg-surface p-5 rounded border border-border">
                    <h3 class="text-textSub font-bold uppercase tracking-wider text-xs mb-4 flex items-center gap-2">
                        <i class="fas fa-trash-alt text-secondary"></i> Global Scrap (${scrapList.length})
                    </h3>
                     <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                        ${scrapList.map(CCTVCard).join('') || '<p class="text-textSub text-xs italic col-span-2">No damaged cameras matching query.</p>'}
                    </div>
                </div>
            </div>
        `;

        // Group Active by Floor
        const floors = {};
        activeCameras.forEach(cam => {
            const floor = cam.floor || 'Unassigned';
            if (!floors[floor]) floors[floor] = [];
            floors[floor].push(cam);
        });

        // Floor Sorting logic
        const floorOrderMap = {};
        if (window.allFloors) {
            window.allFloors.forEach((f) => {
                floorOrderMap[f.name] = f.sort_order;
            });
        }

        const sortedFloors = Object.keys(floors).sort((a, b) => {
            const orderA = floorOrderMap[a] !== undefined ? floorOrderMap[a] : 999;
            const orderB = floorOrderMap[b] !== undefined ? floorOrderMap[b] : 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });

        const floorHtml = sortedFloors.length > 0 ? sortedFloors.map(floor => `
            <div class="space-y-4">
                 <div class="flex items-center gap-3">
                    <div class="h-px flex-1 bg-border"></div>
                    <h3 class="text-sm font-bold text-textSub uppercase tracking-wider bg-dark px-3 py-1 rounded border border-border">${floor} Floor</h3>
                    <div class="h-px flex-1 bg-border"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${floors[floor].sort((a, b) => {
            switch (sortMode) {
                case 'location': return a.cameraLocation.localeCompare(b.cameraLocation);
                case 'model': return (a.model || '').localeCompare(b.model || '');
                case 'serial': return (a.serialNumber || '').localeCompare(b.serialNumber || '');
                case 'model': return (a.model || '').localeCompare(b.model || '');
                case 'status-working': return (a.status === 'Working' ? -1 : 1);
                case 'status-faulty': return (a.status === 'Faulty' ? -1 : 1);
                case 'serial': return (a.serialNumber || '').localeCompare(b.serialNumber || '');
                case 'date-oldest': return new Date(a.installDate || 0) - new Date(b.installDate || 0);
                default: return 0;
            }
        }).map(CCTVCard).join('')}
            </div>
        </div>
    `).join('') : `<div class="text-center py-12 border border-dashed border-white/10 rounded-xl"><p class="text-textSub">${searchTerm ? 'No cameras match your search.' : 'No active cameras in this premise.'}</p></div>`;

        // Update Content
        document.getElementById('cctv-content').innerHTML = `
            ${inventoryHtml}
            
            <div class="mb-6">
                <div class="flex border-b border-white/10 overflow-x-auto gap-1">
                    ${tabsHtml}
                </div>
            </div>

            <div id="cctv-floors" class="space-y-12">
                ${floorHtml}
            </div>
        `;
    };

    // Helper to switch tab (updates internal state and re-renders grids only)
    window.switchCctvPremise = (p) => {
        window.currentCctvPremise = p;
        renderGrids();
    };

    // Initial Render
    renderGrids();

    // Attach Search & Sort Listeners
    document.getElementById('cctv-search').addEventListener('input', renderGrids);
    document.getElementById('cctv-sort').addEventListener('change', renderGrids);
};

// --- REWRITTEN ACCESSORIES PAGE ---
const renderAccessories = async (container) => {
    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <h2 class="text-2xl font-bold text-textMain">Accessories Inventory</h2>
            <div class="flex gap-3 w-full md:w-auto">
                 <div class="relative flex-1 md:w-64">
                    <input type="text" id="accessory-search" placeholder="Search type, brand, model..." class="w-full bg-surface border border-border rounded px-4 py-2 pl-9 text-sm focus:border-primary transition-colors">
                    <i class="fas fa-search absolute left-3 top-2.5 text-textSub text-xs"></i>
                </div>
                <button onclick="window.openAddAccessoryModal()" class="px-4 py-2 bg-primary hover:bg-[#3E5C69] rounded text-white font-medium text-sm transition-all shadow-none whitespace-nowrap">
                    <i class="fas fa-plus mr-2"></i> Add Accessory
                </button>
            </div>
        </div>
        ${Table(['Serial', 'Type', 'Brand', 'Model', 'Status', 'Assigned To', 'Actions'], 'accessories-body')}
    `;

    // Fetch individual accessories with allocated asset
    const { data: accessories } = await supabase.from('accessories').select('*, assets(model, serialNumber)').order('created_at', { ascending: false });

    const statusClasses = {
        'Available': 'bg-[#163326] text-[#4ADE80] border border-[#163326]',
        'Installed': 'bg-[#1E2030] text-[#818CF8] border border-[#1E2030]',
        'Faulty': 'bg-[#331616] text-[#F87171] border border-[#331616]'
    };

    const renderRows = (list) => {
        const rows = list && list.length > 0 ? list.map(acc => `
        <tr class="hover:bg-dark transition-colors group">
            <td class="p-4 text-textMain font-mono text-sm">${acc.serialNumber || '-'}</td>
            <td class="p-4 text-textSub font-medium text-sm">${acc.type}</td>
            <td class="p-4 text-textSub text-sm">${acc.brand || '-'}</td>
            <td class="p-4 text-textSub text-sm">${acc.model || '-'}</td>
            <td class="p-4">
                 <span class="px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide ${statusClasses[acc.status] || 'bg-surface text-textSub border border-border'}">
                    ${acc.status}
                </span>
            </td>
            <td class="p-4 text-textSub text-xs">
                ${acc.status === 'Installed' && acc.assets
                ? `<span class="text-primary font-medium">${acc.assets.model}</span> <span class="opacity-70">(${acc.assets.serialNumber})</span>`
                : '-'}
            </td>
            <td class="p-4">
                <div class="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.viewAccessoryHistory(${acc.id})" class="p-2 hover:text-textMain transition-colors" title="View History">
                        <i class="fas fa-history"></i>
                    </button>
                    <button onclick="window.editAccessory(${acc.id})" class="p-2 hover:text-primary transition-colors" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${acc.status === 'Available'
                ? `<button onclick="window.deleteAccessory(${acc.id})" class="p-2 hover:text-[#F87171] transition-colors" title="Delete">
                             <i class="fas fa-trash"></i>
                           </button>`
                : ''}
                </div>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="7" class="p-8 text-center text-textSub italic">No accessories found.</td></tr>';

        document.getElementById('accessories-body').innerHTML = rows;
    };

    if (accessories) renderRows(accessories);

    document.getElementById('accessory-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (!accessories) return;
        const filtered = accessories.filter(a =>
            (a.type && a.type.toLowerCase().includes(term)) ||
            (a.brand && a.brand.toLowerCase().includes(term)) ||
            (a.model && a.model.toLowerCase().includes(term)) ||
            (a.serialNumber && a.serialNumber.toLowerCase().includes(term))
        );
        renderRows(filtered);
    });
};

window.viewAccessoryHistory = async (id) => {
    const { data: accessory } = await supabase.from('accessories').select('*').eq('id', id).single();
    if (!accessory) return;

    const { data: logs } = await supabase.from('accessory_logs')
        .select('*, assets(model, serialNumber)')
        .eq('accessoryId', id)
        .order('date', { ascending: false });

    const rows = logs && logs.length > 0 ? logs.map(l => `
    < tr class="text-xs border-b border-border last:border-0" >
            <td class="p-3 text-textSub font-mono">${formatDate(l.date)}</td>
            <td class="p-3">
                <span class="${l.action === 'Installed' ? 'text-[#4ADE80]' : 'text-[#F87171]'} font-bold uppercase tracking-wider text-[10px]">
                    ${l.action}
                </span>
            </td>
            <td class="p-3 text-textSub">
                ${l.assets ? `<span class="font-medium text-textMain">${l.assets.model}</span> <span class="opacity-70">(${l.assets.serialNumber})</span>` : '-'}
            </td>
             <td class="p-3 text-textSub italic">${l.technician || 'Admin'}</td>
        </tr >
    `).join('') : '<tr><td colspan="4" class="p-4 text-center text-textSub italic">No history available for this item.</td></tr>';

    const contentHtml = `
    < div class="space-y-4" >
            <div class="flex items-center gap-3 p-3 bg-surface rounded border border-border">
                <div class="w-10 h-10 rounded flex items-center justify-center text-primary bg-primary/10">
                    <i class="fas fa-history"></i>
                </div>
                <div>
                    <p class="text-[10px] text-textSub uppercase tracking-wider font-bold">History Log</p>
                    <p class="font-bold text-textMain text-sm">${accessory.brand} ${accessory.model}</p>
                    <p class="text-xs text-textSub font-mono">${accessory.serialNumber}</p>
                </div>
            </div>

            <div class="rounded border border-border bg-dark overflow-hidden max-h-64 overflow-y-auto">
                <table class="w-full text-left">
                    <thead class="bg-surface text-xs text-textSub uppercase font-bold sticky top-0 border-b border-border">
                        <tr>
                            <th class="p-3">Date</th>
                            <th class="p-3">Action</th>
                            <th class="p-3">Asset Device</th>
                            <th class="p-3">Tech</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div >
    `;

    openModal('accessoryHistoryModal', 'Item History', contentHtml, 'Close', 'closeHistory');
};

window.openAddAccessoryModal = () => {
    const formHtml = `
    < div class="space-y-4" >
             <div class="grid grid-cols-2 gap-3">
                 <select name="type" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                    <option value="">-- Type --</option>
                    <option value="RAM">RAM</option>
                    <option value="Storage">Storage (SSD/HDD)</option>
                    <option value="Mouse">Mouse</option>
                    <option value="Keyboard">Keyboard</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Adapter">Adapter/Charger</option>
                    <option value="Cable">Cable</option>
                    <option value="Other">Other</option>
                </select>
                <input type="text" name="brand" placeholder="Brand (e.g. Kingston)" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
            </div>
            
            <div class="grid grid-cols-2 gap-3">
                <input type="text" name="model" placeholder="Model (e.g. Fury 8GB)" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                <input type="text" name="serialNumber" placeholder="Serial Number" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
            </div>

             <select name="status" class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                <option value="Available">Available (In Stock)</option>
                <option value="Faulty">Faulty</option>
            </select>
        </div>
`;
    openModal('addAccessoryModal', 'Add New Accessory Item', formHtml, 'Add Item', 'createAccessoryItem');
};

window.editAccessory = async (id) => {
    const { data: acc } = await supabase.from('accessories').select('*').eq('id', id).single();
    if (!acc) return;

    const formHtml = `
    < input type = "hidden" name = "id" value = "${id}" >
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <select name="type" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                    <option value="RAM" ${acc.type === 'RAM' ? 'selected' : ''}>RAM</option>
                    <option value="Storage" ${acc.type === 'Storage' ? 'selected' : ''}>Storage</option>
                    <option value="Mouse" ${acc.type === 'Mouse' ? 'selected' : ''}>Mouse</option>
                    <option value="Keyboard" ${acc.type === 'Keyboard' ? 'selected' : ''}>Keyboard</option>
                    <option value="Monitor" ${acc.type === 'Monitor' ? 'selected' : ''}>Monitor</option>
                    <option value="Adapter" ${acc.type === 'Adapter' ? 'selected' : ''}>Adapter</option>
                    <option value="Cable" ${acc.type === 'Cable' ? 'selected' : ''}>Cable</option>
                    <option value="Other" ${acc.type === 'Other' ? 'selected' : ''}>Other</option>
                </select>
                <input type="text" name="brand" value="${acc.brand || ''}" placeholder="Brand" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
            </div>

            <div class="grid grid-cols-2 gap-3">
                <input type="text" name="model" value="${acc.model || ''}" placeholder="Model" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                    <input type="text" name="serialNumber" value="${acc.serialNumber || ''}" placeholder="Serial Number" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                    </div>

                    <select name="status" class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                        <option value="Available" ${acc.status === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="Installed" ${acc.status === 'Installed' ? 'selected' : ''}>Installed</option>
                        <option value="Faulty" ${acc.status === 'Faulty' ? 'selected' : ''}>Faulty</option>
                    </select>
            </div>
            `;
    openModal('editAccessoryModal', 'Edit Accessory', formHtml, 'Update Item', 'updateAccessoryItem');
};

window.deleteAccessory = async (id) => {
    if (confirm('Delete this accessory item?')) {
        await supabase.from('accessories').delete().eq('id', id);
        window.renderView('accessories');
        showToast('Item deleted', 'success');
    }
};

window.openAddStockCameraModal = () => {
    const formHtml = `
            <div class="space-y-3">
                <input type="hidden" name="status" value="In Stock">
                    <input type="hidden" name="floor" value="Unassigned">
                        <input type="hidden" name="cameraLocation" value="Storage">

                            <input type="text" name="serialNumber" placeholder="Serial Number" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                <input type="text" name="model" placeholder="Model (e.g. Hikvision 4K)" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                    <div class="grid grid-cols-1 gap-3">
                                        <input type="date" name="installDate" placeholder="Purchase Date" value="${new Date().toISOString().split('T')[0]}" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                    </div>
                                </div>
                                `;
    openModal('addStockCCTVModal', 'Add New Camera Stock', formHtml, 'Add to Inventory', 'createCCTV');
};

window.openAddCCTVModal = () => {
    const formHtml = `
                                <div class="space-y-3">
                                    <div class="grid grid-cols-2 gap-3">
                                        <select name="premise" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                            <option value="">-- Select Premise --</option>
                                            ${window.allPremises ? window.allPremises.map(p => `<option value="${p.name}">${p.name}</option>`).join('') : '<option value="Main Premise">Main Premise</option>'}
                                        </select>
                                        <select name="floor" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                            <option value="">-- Select Floor --</option>
                                            ${window.allFloors ? window.allFloors.map(f => `<option value="${f.name}">${f.name}</option>`).join('') : ''}
                                        </select>
                                    </div>
                                    <input type="text" name="cameraLocation" placeholder="Section (e.g. Lobby)" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                        <input type="text" name="serialNumber" placeholder="Serial Number" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                            <input type="text" name="model" placeholder="Model (e.g. Hikvision 4K)" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                                <div class="grid grid-cols-2 gap-3">
                                                    <select name="status" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                        <option value="Working">Working</option>
                                                        <option value="Faulty">Faulty</option>
                                                        <option value="In Stock">In Stock (Not Installed)</option>
                                                        <option value="Damaged">Damaged (Scrap)</option>
                                                    </select>
                                                    <input type="date" name="installDate" placeholder="Install Date" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                </div>
                                            </div>
                                            `;
    openModal('addCCTVModal', 'Add Camera Inventory', formHtml, 'Add Camera', 'createCCTV');
};

window.editCCTV = async (id) => {
    const { data: camera } = await supabase.from('cctv').select('*').eq('id', id).single();
    if (!camera) return;

    const floors = window.allFloors ? window.allFloors.map(f => f.name) : [];
    const floorOptions = floors.map(f => `<option value="${f}" ${camera.floor === f ? 'selected' : ''}>${f}</option>`).join('');

    const formHtml = `
                                            <input type="hidden" name="id" value="${id}">
                                                <div class="space-y-3">
                                                    <div class="grid grid-cols-2 gap-3">
                                                        <select name="premise" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                            <option value="">-- Select Premise --</option>
                                                            ${window.allPremises ? window.allPremises.map(p => `<option value="${p.name}" ${camera.premise === p.name ? 'selected' : ''}>${p.name}</option>`).join('') : '<option value="Main Premise">Main Premise</option>'}
                                                        </select>
                                                        <select name="floor" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                            <option value="">-- Select Floor --</option>
                                                            ${window.allFloors ? window.allFloors.map(f => `<option value="${f.name}" ${camera.floor === f.name ? 'selected' : ''}>${f.name}</option>`).join('') : ''}
                                                        </select>
                                                    </div>
                                                    <input type="text" name="cameraLocation" value="${camera.cameraLocation}" placeholder="Section (e.g. Lobby)" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                                        <input type="text" name="serialNumber" value="${camera.serialNumber || ''}" placeholder="Serial Number" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                            <input type="text" name="model" value="${camera.model || ''}" placeholder="Model (e.g. Hikvision 4K)" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                                                <div class="grid grid-cols-2 gap-3">
                                                                    <select name="status" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                        <option value="Working" ${camera.status === 'Working' ? 'selected' : ''}>Working</option>
                                                                        <option value="Faulty" ${camera.status === 'Faulty' ? 'selected' : ''}>Faulty</option>
                                                                        <option value="In Stock" ${camera.status === 'In Stock' ? 'selected' : ''}>In Stock</option>
                                                                        <option value="Damaged" ${camera.status === 'Damaged' ? 'selected' : ''}>Damaged</option>
                                                                    </select>
                                                                    <input type="date" name="installDate" value="${camera.installDate || ''}" placeholder="Install Date" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                </div>
                                                            </div>
                                                            `;
    openModal('editCCTVModal', 'Edit Camera', formHtml, 'Update Camera', 'updateCCTV');
};

const renderRepairs = async (container) => {
    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <h2 class="text-2xl font-bold text-textMain">Repair Logs</h2>
            <div class="flex gap-3 w-full md:w-auto">
                 <div class="relative flex-1 md:w-64">
                    <input type="text" id="repair-search" placeholder="Search asset, fault, tech..." class="w-full bg-surface border border-border rounded px-4 py-2 pl-9 text-sm focus:border-primary transition-colors">
                    <i class="fas fa-search absolute left-3 top-2.5 text-textSub text-xs"></i>
                </div>
                <button onclick="window.openAddRepairModal()" class="px-4 py-2 bg-primary hover:bg-[#3E5C69] rounded text-white font-medium shadow-none transition-all whitespace-nowrap">
                   <i class="fas fa-plus mr-2"></i> Log Repair
               </button>
            </div>
        </div>
        ${Table(['Date', 'Asset', 'Fault', 'Action', 'Cost', 'Technician'], 'repairs-body')}
    `;

    const { data: repairs } = await supabase.from('repairs').select(`
                                                            *,
                                                            assets ( model, serialNumber )
                                                            `).order('date', { ascending: false });

    const renderRows = (list) => {
        if (list && list.length > 0) {
            const rows = list.map(r => `
                <tr class="hover:bg-dark transition-colors group">
                    <td class="p-4 text-textSub font-mono text-sm">${formatDate(r.date)}</td>
                    <td class="p-4 text-textMain font-medium text-sm">${r.assets?.model || 'Unknown'} <span class="text-xs text-textSub opacity-70">(${r.assets?.serialNumber || '?'})</span></td>
                    <td class="p-4 text-textSub text-sm">${r.faultDescription}</td>
                    <td class="p-4 text-textSub text-sm">${r.partsReplaced || '-'}</td>
                    <td class="p-4 text-textSub text-sm font-mono">$${r.cost}</td>
                    <td class="p-4 text-textSub text-sm">${r.technician}</td>
                </tr>
            `);
            document.getElementById('repairs-body').innerHTML = rows.join('');
        } else {
            document.getElementById('repairs-body').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-textSub italic">No repair records found.</td></tr>';
        }
    };

    if (repairs) renderRows(repairs);

    document.getElementById('repair-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (!repairs) return;
        const filtered = repairs.filter(r =>
            (r.assets?.model && r.assets.model.toLowerCase().includes(term)) ||
            (r.faultDescription && r.faultDescription.toLowerCase().includes(term)) ||
            (r.technician && r.technician.toLowerCase().includes(term))
        );
        renderRows(filtered);
    });
};

// --- Window Global Functions ---

window.openAddAssetModal = () => {
    const formHtml = `
                                                            <div class="space-y-4">
                                                                <div class="grid grid-cols-2 gap-3">
                                                                    <input type="text" name="serialNumber" placeholder="Serial Number" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                        <input type="text" name="model" placeholder="Model (e.g. Dell Latitude 5420)" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                        </div>

                                                                        <div class="grid grid-cols-2 gap-3">
                                                                            <select name="type" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                                <option value="Laptop">Laptop</option>
                                                                                <option value="Desktop">Desktop</option>
                                                                                <option value="Mobile Phone">Mobile Phone</option>
                                                                                <option value="Monitor">Monitor</option>
                                                                                <option value="Printer">Printer</option>
                                                                                <option value="Networking">Networking</option>
                                                                                <option value="Peripheral">Peripheral</option>
                                                                            </select>
                                                                            <select name="status" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                                <option value="Available">Available</option>
                                                                                <option value="Repair">In Repair</option>
                                                                                <option value="Scrap">Scrap / Damaged</option>
                                                                            </select>
                                                                        </div>

                                                                        <div class="p-3 bg-dark rounded border border-border">
                                                                            <p class="text-xs text-textSub mb-2 font-bold uppercase tracking-wider">System Specs (Optional)</p>
                                                                            <div class="grid grid-cols-2 gap-3 mb-3">
                                                                                <input type="text" name="specs_processor" placeholder="Processor (e.g. i5)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                    <input type="text" name="specs_ram" placeholder="RAM (e.g. 16GB)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                    </div>
                                                                                    <div class="grid grid-cols-2 gap-3">
                                                                                        <input type="text" name="specs_storage" placeholder="Storage 1 (Primary)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                            <input type="text" name="specs_storage_2" placeholder="Storage 2 (Secondary)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                <input type="text" name="specs_os" placeholder="OS (e.g. Win 11)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                </div>
                                                                                            </div>
                                                                                    </div>
                                                                                    `;
    openModal('addAssetModal', 'Add New Asset', formHtml, 'Add Asset', 'createAsset');
};

window.openAddStaffModal = () => {
    const formHtml = `
                                                                                    <div class="space-y-3">
                                                                                        <input type="text" name="employeeId" placeholder="Employee ID" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                            <input type="text" name="name" placeholder="Full Name" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                <input type="text" name="department" placeholder="Department" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                </div>
                                                                                                `;
    openModal('addStaffModal', 'Add New Staff', formHtml, 'Add Staff', 'createStaff');
};



window.openAddRepairModal = async () => {
    const { data: assets } = await supabase.from('assets').select('*');
    const assetOptions = assets.map(a => `<option value="${a.id}">${a.model} (${a.serialNumber})</option>`).join('');

    // For cannibalization logic (Allow Available, Scrap, Repair)
    const scrapAssets = assets.filter(a => ['Available', 'Scrap', 'Repair'].includes(a.status));
    const cannibalOptions = scrapAssets.map(a => `<option value="${a.id}">${a.model} (${a.serialNumber})</option>`).join('');

    const formHtml = `
                                                                                                <div class="space-y-3">
                                                                                                    <label class="block text-xs text-textSub uppercase font-bold tracking-wider">Broken Asset</label>
                                                                                                    <select name="assetId" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                                                        <option value="">-- Select Asset --</option>
                                                                                                        ${assetOptions}
                                                                                                    </select>

                                                                                                    <input type="text" name="faultDescription" placeholder="Fault Description (e.g. Broken Screen)" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                                                                                        <label class="block text-xs text-textSub uppercase font-bold tracking-wider">Parts Replaced / Cannibalized From?</label>
                                                                                                        <div class="flex gap-2">
                                                                                                            <input type="text" name="partsReplaced" placeholder="Parts used..." class="flex-1 bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                                <select name="cannibalizedFromId" class="w-1/3 bg-surface border border-border rounded px-2 py-3 text-sm focus:border-primary text-textMain">
                                                                                                                    <option value="">(None)</option>
                                                                                                                    ${cannibalOptions}
                                                                                                                </select>
                                                                                                        </div>

                                                                                                        <div class="flex gap-4">
                                                                                                            <input type="number" name="cost" placeholder="Cost ($)" step="0.01" class="w-1/2 bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                                <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" class="w-1/2 bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                                </div>

                                                                                                                <input type="text" name="technician" placeholder="Technician Name" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">

                                                                                                                </div>
                                                                                                                `;
    openModal('addRepairModal', 'Log Repair', formHtml, 'Save Log', 'createRepair');
};

window.editAsset = async (id) => {
    const { data: asset } = await supabase.from('assets').select('*').eq('id', id).single();
    if (!asset) return;
    const formHtml = `
                                                                                                                <input type="hidden" name="id" value="${id}">
                                                                                                                    <div class="space-y-4">
                                                                                                                        <div class="grid grid-cols-2 gap-3">
                                                                                                                            <input type="text" name="serialNumber" value="${asset.serialNumber}" placeholder="Serial Number" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                                                <input type="text" name="model" value="${asset.model}" placeholder="Model" required class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary">
                                                                                                                                </div>

                                                                                                                                <div class="grid grid-cols-2 gap-3">
                                                                                                                                    <select name="type" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                                                                                        <option value="Laptop" ${asset.type === 'Laptop' ? 'selected' : ''}>Laptop</option>
                                                                                                                                        <option value="Desktop" ${asset.type === 'Desktop' ? 'selected' : ''}>Desktop</option>
                                                                                                                                        <option value="Mobile Phone" ${asset.type === 'Mobile Phone' ? 'selected' : ''}>Mobile Phone</option>
                                                                                                                                        <option value="Monitor" ${asset.type === 'Monitor' ? 'selected' : ''}>Monitor</option>
                                                                                                                                        <option value="Printer" ${asset.type === 'Printer' ? 'selected' : ''}>Printer</option>
                                                                                                                                        <option value="Networking" ${asset.type === 'Networking' ? 'selected' : ''}>Networking</option>
                                                                                                                                        <option value="Peripheral" ${asset.type === 'Peripheral' ? 'selected' : ''}>Peripheral</option>
                                                                                                                                    </select>
                                                                                                                                    <select name="status" class="w-full bg-surface border border-border rounded px-4 py-3 text-sm focus:border-primary text-textMain">
                                                                                                                                        <option value="Available" ${asset.status === 'Available' ? 'selected' : ''}>Available</option>
                                                                                                                                        <option value="Issued" ${asset.status === 'Issued' ? 'selected' : ''}>Issued</option>
                                                                                                                                        <option value="Repair" ${asset.status === 'Repair' ? 'selected' : ''}>Repair</option>
                                                                                                                                        <option value="Scrap" ${asset.status === 'Scrap' ? 'selected' : ''}>Scrap</option>
                                                                                                                                    </select>
                                                                                                                                </div>

                                                                                                                                <div class="p-3 bg-dark rounded border border-border">
                                                                                                                                    <p class="text-xs text-textSub mb-2 font-bold uppercase tracking-wider">System Specs</p>
                                                                                                                                    <div class="grid grid-cols-2 gap-3 mb-3">
                                                                                                                                        <input type="text" name="specs_processor" value="${asset.specs_processor || ''}" placeholder="Processor (e.g. i5)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                            <input type="text" name="specs_ram" value="${asset.specs_ram || ''}" placeholder="RAM (e.g. 16GB)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                            </div>
                                                                                                                                            <div class="grid grid-cols-2 gap-3">
                                                                                                                                                <input type="text" name="specs_storage" value="${asset.specs_storage || ''}" placeholder="Storage 1 (Primary)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                    <input type="text" name="specs_storage_2" value="${asset.specs_storage_2 || ''}" placeholder="Storage 2 (Secondary)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                        <input type="text" name="specs_os" value="${asset.specs_os || ''}" placeholder="OS (e.g. Win 11)" class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                        </div>
                                                                                                                                                    </div>
                                                                                                                                            </div>
                                                                                                                                            `;
    openModal('editAssetModal', 'Edit Asset', formHtml, 'Update Asset', 'updateAsset');
};



window.manageAssetAccessories = async (assetId) => {
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();
    // Get Currently Installed on this Asset (Status=Installed, assetId=this)
    const { data: installed } = await supabase.from('accessories')
        .select('*')
        .eq('assetId', assetId)
        .eq('status', 'Installed');

    // Get log history
    const { data: logs } = await supabase.from('accessory_logs')
        .select('*, accessories(type, brand, model)')
        .eq('assetId', assetId)
        .order('date', { ascending: false });

    // Get Available Stock for Picking
    const { data: stock } = await supabase.from('accessories')
        .select('*')
        .eq('status', 'Available')
        .order('type');

    // Render Installed Table
    const installedRows = installed && installed.length > 0 ? installed.map(item => `
                                                                                                                                            <tr class="text-sm border-b border-border last:border-0 hover:bg-white/5 group">
                                                                                                                                                <td class="p-3 text-textMain">${item.type}</td>
                                                                                                                                                <td class="p-3 text-textMain">${item.brand} ${item.model}</td>
                                                                                                                                                <td class="p-3 text-textSub font-mono text-xs">${item.serialNumber}</td>
                                                                                                                                                <td class="p-3 text-right">
                                                                                                                                                    <button onclick="window.removeAccessory(${item.id}, ${assetId})" class="text-[#F87171] hover:text-[#EF4444] text-xs font-bold uppercase tracking-wider border border-[#F87171]/20 px-2 py-1 rounded bg-[#F87171]/10 hover:bg-[#F87171]/20 transition-colors">
                                                                                                                                                        Remove
                                                                                                                                                    </button>
                                                                                                                                                </td>
                                                                                                                                            </tr>
                                                                                                                                            `).join('') : '<tr><td colspan="4" class="p-4 text-center text-textSub italic">No accessories installed.</td></tr>';

    const stockOptions = stock ? stock.map(s => `<option value="${s.id}">${s.type} - ${s.brand} ${s.model} (${s.serialNumber})</option>`).join('') : '';

    // History
    const historyRows = logs ? logs.map(l => `
                                                                                                                                            <tr class="text-xs border-b border-border last:border-0">
                                                                                                                                                <td class="p-2 text-textSub opacity-70">${formatDate(l.date)}</td>
                                                                                                                                                <td class="p-2 text-textMain">${l.accessories?.type || '-'}</td>
                                                                                                                                                <td class="p-2 text-textSub">${l.accessories?.model || '-'}</td>
                                                                                                                                                <td class="p-2">
                                                                                                                                                    <span class="${l.action === 'Installed' ? 'text-[#4ADE80]' : 'text-[#F87171]'} font-bold">
                                                                                                                                                        ${l.action}
                                                                                                                                                    </span>
                                                                                                                                                </td>
                                                                                                                                            </tr>
                                                                                                                                            `).join('') : '';

    const formHtml = `
                                                                                                                                            <div class="space-y-6">
                                                                                                                                                <div class="p-4 bg-surface rounded flex items-center gap-4 border border-border">
                                                                                                                                                    <div class="w-12 h-12 rounded flex items-center justify-center text-white text-xl bg-primary shadow-none">
                                                                                                                                                        <i class="fas fa-laptop"></i>
                                                                                                                                                    </div>
                                                                                                                                                    <div>
                                                                                                                                                        <p class="text-xs text-textSub uppercase tracking-wider font-bold">Managing Accessories For</p>
                                                                                                                                                        <p class="font-bold text-textMain text-lg leading-tight mt-0.5">${asset.model}</p>
                                                                                                                                                        <p class="text-xs text-textSub font-mono">${asset.serialNumber}</p>
                                                                                                                                                    </div>
                                                                                                                                                </div>

                                                                                                                                                <!-- Install New -->
                                                                                                                                                <div class="space-y-2">
                                                                                                                                                    <label class="block text-xs font-bold text-textSub uppercase tracking-wider">Install from Stock</label>
                                                                                                                                                    <div class="flex gap-2">
                                                                                                                                                        <select id="install-accessory-select" class="flex-1 bg-surface border border-border rounded px-4 py-2.5 text-sm focus:border-primary text-textMain">
                                                                                                                                                            <option value="">-- Select Available Item --</option>
                                                                                                                                                            ${stockOptions}
                                                                                                                                                        </select>
                                                                                                                                                        <button onclick="window.installAccessory(${assetId})" class="bg-[#163326] text-[#4ADE80] border border-[#163326] hover:bg-[#4ADE80]/20 px-5 py-2.5 rounded font-bold text-sm transition-all transform active:scale-95">
                                                                                                                                                            Install
                                                                                                                                                        </button>
                                                                                                                                                    </div>
                                                                                                                                                </div>

                                                                                                                                                <!-- Currently Installed List -->
                                                                                                                                                <div>
                                                                                                                                                    <label class="block text-xs font-bold text-textSub uppercase tracking-wider mb-2">Installed Components</label>
                                                                                                                                                    <div class="rounded border border-border bg-surface overflow-hidden">
                                                                                                                                                        <table class="w-full text-left">
                                                                                                                                                            <thead class="bg-dark text-xs text-textSub uppercase font-bold border-b border-border">
                                                                                                                                                                <tr>
                                                                                                                                                                    <th class="p-3">Type</th>
                                                                                                                                                                    <th class="p-3">Item</th>
                                                                                                                                                                    <th class="p-3">Serial</th>
                                                                                                                                                                    <th class="p-3 text-right">Action</th>
                                                                                                                                                                </tr>
                                                                                                                                                            </thead>
                                                                                                                                                            <tbody>
                                                                                                                                                                ${installedRows}
                                                                                                                                                            </tbody>
                                                                                                                                                        </table>
                                                                                                                                                    </div>
                                                                                                                                                </div>

                                                                                                                                                <!-- History -->
                                                                                                                                                <div class="border-t border-border pt-4">
                                                                                                                                                    <button onclick="document.getElementById('acc-history-panel').classList.toggle('hidden')" class="flex items-center gap-2 text-xs font-bold text-textSub hover:text-textMain transition-colors">
                                                                                                                                                        <i class="fas fa-history"></i> View Log History
                                                                                                                                                    </button>
                                                                                                                                                    <div id="acc-history-panel" class="hidden mt-3 max-h-32 overflow-y-auto rounded border border-border bg-surface">
                                                                                                                                                        <table class="w-full text-left">
                                                                                                                                                            <tbody class="divide-y divide-border">
                                                                                                                                                                ${historyRows || '<tr><td colspan="4" class="p-3 text-center text-textSub text-xs italic">Empty log.</td></tr>'}
                                                                                                                                                            </tbody>
                                                                                                                                                        </table>
                                                                                                                                                    </div>
                                                                                                                                                </div>
                                                                                                                                            </div>
                                                                                                                                            `;

    openModal('manageAccessoryModal', 'Asset Configuration', formHtml, 'Done', 'closeHistory');
};

window.installAccessory = async (assetId) => {
    const select = document.getElementById('install-accessory-select');
    const accessoryId = select.value;
    if (!accessoryId) return showToast('Please select an item', 'error');

    // Fetch Details before update
    const { data: accessory } = await supabase.from('accessories').select('*').eq('id', accessoryId).single();
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();

    if (!accessory || !asset) return showToast('Error fetching details', 'error');

    // 1. Update Accessory Status
    const { error: updateError } = await supabase.from('accessories')
        .update({ status: 'Installed', assetId: assetId })
        .eq('id', accessoryId);

    if (updateError) return showToast(updateError.message, 'error');

    // 2. Smart Spec Update
    const specValue = accessory.model; // Assuming '8GB' or '512GB SSD' is in Model
    let updates = {};

    const parseSize = (str) => {
        const match = str && str.match(/(\d+)/);
        return match ? parseInt(match[0]) : null;
    };

    if (accessory.type === 'RAM') {
        const current = asset.specs_ram || '';
        const currentVal = parseSize(current);
        const addedVal = parseSize(specValue);

        if (currentVal && addedVal && current.toUpperCase().includes('GB') && specValue.toUpperCase().includes('GB')) {
            updates.specs_ram = `${currentVal + addedVal}GB`; // Sum logic
        } else {
            updates.specs_ram = current ? `${current} + ${specValue}` : specValue; // Append logic
        }
    } else if (['Storage', 'HDD', 'SSD', 'Othe Storage'].includes(accessory.type)) {
        // Try Primary first
        if (!asset.specs_storage) {
            updates.specs_storage = specValue;
        } else if (!asset.specs_storage_2) {
            updates.specs_storage_2 = specValue;
        } else {
            // Append to secondary
            updates.specs_storage_2 = `${asset.specs_storage_2} + ${specValue}`;
        }
    }

    if (Object.keys(updates).length > 0) {
        await supabase.from('assets').update(updates).eq('id', assetId);
    }

    // 3. Log it
    await supabase.from('accessory_logs').insert([{
        assetId: assetId,
        accessoryId: accessoryId,
        action: 'Installed',
        date: new Date().toISOString(),
        technician: 'Admin'
    }]);

    showToast('Component Installed & Specs Updated', 'success');
    window.manageAssetAccessories(assetId); // Refresh UI
    renderView('assets'); // Refresh main table to show new specs
};

window.removeAccessory = async (accessoryId, assetId) => {
    if (!confirm('Remove this component and return to stock?')) return;

    // Fetch Details before removing
    const { data: accessory } = await supabase.from('accessories').select('*').eq('id', accessoryId).single();
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();

    if (!accessory || !asset) return showToast('Error fetching details', 'error');

    const specValue = accessory.model;
    let updates = {};

    const parseSize = (str) => {
        const match = str && str.match(/(\d+)/);
        return match ? parseInt(match[0]) : null;
    };

    if (accessory.type === 'RAM') {
        const current = asset.specs_ram || '';
        const currentVal = parseSize(current);
        const removedVal = parseSize(specValue);

        // If we can do math
        if (currentVal && removedVal && current.toUpperCase().includes('GB') && specValue.toUpperCase().includes('GB')) {
            const newVal = currentVal - removedVal;
            updates.specs_ram = newVal > 0 ? `${newVal}GB` : '';
        } else {
            // String removal fallback: Try to remove " + specValue" or "specValue + " or just "specValue"
            let newStr = current.replace(` + ${specValue}`, '').replace(`${specValue} + `, '').replace(specValue, '');
            updates.specs_ram = newStr.trim();
        }
    } else if (['Storage', 'HDD', 'SSD', 'Other Storage'].includes(accessory.type)) {
        // Check primary
        if (asset.specs_storage && asset.specs_storage.includes(specValue)) {
            let newStr = asset.specs_storage.replace(` + ${specValue}`, '').replace(`${specValue} + `, '').replace(specValue, '');
            updates.specs_storage = newStr.trim();
        }
        // Check secondary
        else if (asset.specs_storage_2 && asset.specs_storage_2.includes(specValue)) {
            let newStr = asset.specs_storage_2.replace(` + ${specValue}`, '').replace(`${specValue} + `, '').replace(specValue, '');
            updates.specs_storage_2 = newStr.trim();
        }
    }

    if (Object.keys(updates).length > 0) {
        await supabase.from('assets').update(updates).eq('id', assetId);
    }

    // 1. Update Accessory Status
    const { error: updateError } = await supabase.from('accessories')
        .update({ status: 'Available', assetId: null })
        .eq('id', accessoryId);

    if (updateError) return showToast(updateError.message, 'error');

    // 2. Log it
    await supabase.from('accessory_logs').insert([{
        assetId: assetId,
        accessoryId: accessoryId,
        action: 'Removed',
        date: new Date().toISOString(),
        technician: 'Admin'
    }]);

    showToast('Component Removed & Specs Updated', 'success');
    window.manageAssetAccessories(assetId); // Refresh UI
    renderView('assets');
};

window.issueAsset = async (assetId) => {
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();
    const { data: staff } = await supabase.from('staff').select('*');

    const staffOptions = staff.map(s => `<option value="${s.id}">${s.name} (${s.employeeId})</option>`).join('');

    const formHtml = `
        <input type="hidden" name="assetId" value="${assetId}">
        <div class="space-y-4">
            <div class="p-3 bg-surface rounded-xl border border-border">
                <p class="text-xs text-textSub uppercase tracking-wider font-bold mb-1">Asset to Issue</p>
                <p class="font-bold text-textMain text-sm">${asset.model}</p>
                 <p class="text-xs text-textSub font-mono">${asset.serialNumber}</p>
            </div>
            
            <div class="space-y-1 relative group" id="staff-search-container">
                <label class="block text-xs font-bold text-textSub uppercase tracking-wider">Select Staff</label>
                <input type="text" id="staff-search-input" placeholder="Search staff name or ID..." class="w-full bg-surface border border-border rounded px-4 py-2 text-sm focus:border-primary transition-colors text-textMain">
                <input type="hidden" name="staffId" id="selected-staff-id" required>
                
                <div id="staff-options-list" class="absolute left-0 right-0 top-[60px] max-h-48 overflow-y-auto bg-dark border border-border rounded shadow-xl z-50 hidden custom-scrollbar">
                    ${staff.map(s => `
                        <div class="staff-option p-2 hover:bg-white/5 cursor-pointer text-sm text-textSub hover:text-textMain transition-colors border-b border-border/50 last:border-0" 
                             data-id="${s.id}" 
                             data-name="${s.name} (${s.employeeId})">
                            <div class="font-medium">${s.name}</div>
                            <div class="text-xs opacity-70">${s.employeeId} • ${s.department || 'No Dept'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="space-y-1">
                <label class="block text-xs font-bold text-textSub uppercase tracking-wider">Issue Date</label>
                 <input type="date" name="issueDate" required value="${new Date().toISOString().split('T')[0]}" class="w-full bg-surface border border-border rounded px-4 py-2 text-sm focus:border-primary transition-colors text-textMain invert-calendar-icon">
            </div>
        </div>
    `;

    openModal('issueAssetModal', 'Issue Asset', formHtml, 'Confirm Issue', 'submitIssue');

    // Attach Search Logic
    setTimeout(() => {
        const searchInput = document.getElementById('staff-search-input');
        const optionsList = document.getElementById('staff-options-list');
        const hiddenInput = document.getElementById('selected-staff-id');
        const options = document.querySelectorAll('.staff-option');

        if (!searchInput || !optionsList) return;

        // Show options on focus
        searchInput.addEventListener('focus', () => {
            optionsList.classList.remove('hidden');
        });

        // Hide options on click outside
        document.addEventListener('click', (e) => {
            if (!document.getElementById('staff-search-container').contains(e.target)) {
                optionsList.classList.add('hidden');
            }
        });

        // Filter options
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            let hasVisible = false;
            options.forEach(opt => {
                const text = opt.innerText.toLowerCase();
                if (text.includes(term)) {
                    opt.classList.remove('hidden');
                    hasVisible = true;
                } else {
                    opt.classList.add('hidden');
                }
            });
            optionsList.classList.remove('hidden');
        });

        // Select option
        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const id = opt.getAttribute('data-id');
                const name = opt.getAttribute('data-name');

                hiddenInput.value = id;
                searchInput.value = name;
                optionsList.classList.add('hidden');
            });
        });
    }, 100);
};

window.returnAsset = async (assetId, context = 'assets', staffId = null) => {
    // Find active assignment safely (handle duplicates if any, take latest)
    const { data: assignments } = await supabase.from('assignments')
        .select('*')
        .eq('assetId', assetId)
        .is('returnDate', null)
        .order('issueDate', { ascending: false })
        .limit(1);

    const assignment = assignments && assignments.length > 0 ? assignments[0] : null;
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();

    // Use passed staffId or derive from assignment if possible
    const targetStaffId = staffId || (assignment ? assignment.staffId : '');

    const formHtml = `
                                                                                                                                                <input type="hidden" name="assetId" value="${assetId}">
                                                                                                                                                    <input type="hidden" name="assignmentId" value="${assignment ? assignment.id : ''}">
                                                                                                                                                        <input type="hidden" name="returnContext" value="${context}">
                                                                                                                                                            <input type="hidden" name="staffId" value="${targetStaffId}">

                                                                                                                                                                <div class="space-y-3">
                                                                                                                                                                    <div class="p-3 bg-white/5 rounded-xl border border-white/10">
                                                                                                                                                                        <p class="text-xs text-slate-400">Asset Returning</p>
                                                                                                                                                                        <p class="font-medium text-white">${asset.model} - ${asset.serialNumber}</p>
                                                                                                                                                                    </div>
                                                                                                                                                                    <label class="block text-xs text-slate-400">Return Date</label>
                                                                                                                                                                    <input type="date" name="returnDate" required value="${new Date().toISOString().split('T')[0]}" class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                </div>
                                                                                                                                                                `;
    openModal('returnAssetModal', 'Return Asset', formHtml, 'Confirm Return', 'submitReturn');
};

window.viewAssetHistory = async (assetId) => {
    const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();
    if (!asset) return;

    // Repairs
    const { data: repairs } = await supabase.from('repairs').select('*').eq('assetId', assetId).order('date', { ascending: false });

    // Assignments (Issuance History)
    const { data: assignments } = await supabase.from('assignments').select('*, staff(name)').eq('assetId', assetId).order('issueDate', { ascending: false });

    // Accessory Logs (Upgrades)
    const { data: upgrades } = await supabase.from('accessory_logs')
        .select('*, accessories(type, model)')
        .eq('assetId', assetId)
        .order('date', { ascending: false });

    // Build Upgrade HTML
    const upgradesHtml = upgrades && upgrades.length > 0 ? `
                                                                                                                                                                <div class="overflow-x-auto rounded-xl border border-white/10">
                                                                                                                                                                    <table class="w-full text-left border-collapse text-sm">
                                                                                                                                                                        <thead>
                                                                                                                                                                            <tr class="bg-white/5 border-b border-white/5 text-xs uppercase text-slate-400">
                                                                                                                                                                                <th class="p-3">Date</th>
                                                                                                                                                                                <th class="p-3">Action</th>
                                                                                                                                                                                <th class="p-3">Component</th>
                                                                                                                                                                                <th class="p-3">Tech</th>
                                                                                                                                                                            </tr>
                                                                                                                                                                        </thead>
                                                                                                                                                                        <tbody class="divide-y divide-white/5">
                                                                                                                                                                            ${upgrades.map(u => `
                            <tr>
                                <td class="p-3 text-slate-300">${formatDate(u.date)}</td>
                                <td class="p-3">
                                    <span class="${u.action === 'Installed' ? 'text-emerald-400' : 'text-red-400'} font-bold">
                                        ${u.action}
                                    </span>
                                </td>
                                <td class="p-3 text-white">
                                    ${u.accessories ? `${u.accessories.type} - ${u.accessories.model}` : 'Unknown Item'}
                                </td>
                                <td class="p-3 text-slate-300">${u.technician}</td>
                            </tr>
                        `).join('')}
                                                                                                                                                                        </tbody>
                                                                                                                                                                    </table>
                                                                                                                                                                </div>
                                                                                                                                                                ` : '<p class="text-slate-500 italic text-center py-4">No upgrade history found.</p>';

    // Build Repairs HTML
    const repairsHtml = repairs && repairs.length > 0 ? `
                                                                                                                                                                <div class="overflow-x-auto rounded-xl border border-white/10">
                                                                                                                                                                    <table class="w-full text-left border-collapse text-sm">
                                                                                                                                                                        <thead>
                                                                                                                                                                            <tr class="bg-white/5 border-b border-white/5 text-xs uppercase text-slate-400">
                                                                                                                                                                                <th class="p-3">Date</th>
                                                                                                                                                                                <th class="p-3">Fault</th>
                                                                                                                                                                                <th class="p-3">Parts</th>
                                                                                                                                                                                <th class="p-3">Tech</th>
                                                                                                                                                                            </tr>
                                                                                                                                                                        </thead>
                                                                                                                                                                        <tbody class="divide-y divide-white/5">
                                                                                                                                                                            ${repairs.map(r => `
                        <tr>
                            <td class="p-3 text-slate-300">${formatDate(r.date)}</td>
                            <td class="p-3 text-white">${r.faultDescription}</td>
                            <td class="p-3 text-slate-300">${r.partsReplaced || '-'}</td>
                             <td class="p-3 text-slate-300">${r.technician}</td>
                        </tr>
                    `).join('')}
                                                                                                                                                                        </tbody>
                                                                                                                                                                    </table>
                                                                                                                                                                </div>
                                                                                                                                                                ` : '<p class="text-slate-500 italic text-center py-4">No repair history records found.</p>';

    // Build Assignments HTML
    const assignmentsHtml = assignments && assignments.length > 0 ? `
                                                                                                                                                                <div class="overflow-x-auto rounded-xl border border-white/10">
                                                                                                                                                                    <table class="w-full text-left border-collapse text-sm">
                                                                                                                                                                        <thead>
                                                                                                                                                                            <tr class="bg-white/5 border-b border-white/5 text-xs uppercase text-slate-400">
                                                                                                                                                                                <th class="p-3">Issued To</th>
                                                                                                                                                                                <th class="p-3">Issue Date</th>
                                                                                                                                                                                <th class="p-3">Return Date</th>
                                                                                                                                                                            </tr>
                                                                                                                                                                        </thead>
                                                                                                                                                                        <tbody class="divide-y divide-white/5">
                                                                                                                                                                            ${assignments.map(a => `
                        <tr>
                            <td class="p-3 text-white font-medium">${a.staff?.name || 'Unknown'}</td>
                            <td class="p-3 text-slate-300">${formatDate(a.issueDate)}</td>
                            <td class="p-3 text-slate-300">${a.returnDate ? formatDate(a.returnDate) : '<span class="text-emerald-400 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/20">Active</span>'}</td>
                        </tr>
                    `).join('')}
                                                                                                                                                                        </tbody>
                                                                                                                                                                    </table>
                                                                                                                                                                </div>
                                                                                                                                                                ` : '<p class="text-slate-500 italic text-center py-4">No issuance history records found.</p>';

    const modalContent = `
                                                                                                                                                                <div class="max-h-[70vh] overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                                                                                                                                                                    <div class="p-4 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center bg-gradient-to-r from-white/5 to-transparent">
                                                                                                                                                                        <div>
                                                                                                                                                                            <p class="text-xs text-slate-400 uppercase tracking-wider mb-1">Asset Model</p>
                                                                                                                                                                            <h3 class="font-bold text-xl text-white">${asset.model}</h3>
                                                                                                                                                                        </div>
                                                                                                                                                                        <div class="text-right">
                                                                                                                                                                            <p class="text-xs text-slate-400 uppercase tracking-wider mb-1">Serial Number</p>
                                                                                                                                                                            <p class="font-mono text-primary font-bold text-lg">${asset.serialNumber}</p>
                                                                                                                                                                        </div>
                                                                                                                                                                    </div>

                                                                                                                                                                    <div>
                                                                                                                                                                        <h4 class="flex items-center gap-2 text-sm font-bold text-secondary uppercase tracking-wider mb-3 border-b border-white/10 pb-2">
                                                                                                                                                                            <i class="fas fa-user-clock"></i> Issuance History
                                                                                                                                                                        </h4>
                                                                                                                                                                        ${assignmentsHtml}
                                                                                                                                                                    </div>

                                                                                                                                                                    <div>
                                                                                                                                                                        <h4 class="flex items-center gap-2 text-sm font-bold text-purple-400 uppercase tracking-wider mb-3 border-b border-white/10 pb-2">
                                                                                                                                                                            <i class="fas fa-memory"></i> Upgrade History
                                                                                                                                                                        </h4>
                                                                                                                                                                        ${upgradesHtml}
                                                                                                                                                                    </div>

                                                                                                                                                                    <div>
                                                                                                                                                                        <h4 class="flex items-center gap-2 text-sm font-bold text-amber-500 uppercase tracking-wider mb-3 border-b border-white/10 pb-2">
                                                                                                                                                                            <i class="fas fa-tools"></i> Maintenance Log
                                                                                                                                                                        </h4>
                                                                                                                                                                        ${repairsHtml}
                                                                                                                                                                    </div>

                                                                                                                                                                    ${asset.status === 'Issued' ? `
            <div class="pt-4 border-t border-white/10 text-center">
                 <button onclick="window.reprintHandover(${asset.id})" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-slate-300 transition-colors border border-white/10">
                     <i class="fas fa-print mr-2"></i> Reprint Handover Form
                 </button>
            </div>
            ` : ''}
                                                                                                                                                                </div>
                                                                                                                                                                `;

    openModal('historyModal', 'Asset History', modalContent, 'Close', 'closeHistory');
};

window.toggleCCTV = async (id, newStatus) => {
    try {
        const { error } = await supabase.from('cctv').update({ status: newStatus }).eq('id', id);
        if (error) throw error;
        showToast(`Camera marked as ${newStatus}`, 'success');
        renderView('cctv');
    } catch (e) {
        showToast('Error updating status', 'error');
    }
};

window.deleteAsset = async (id) => {
    if (confirm('Are you sure?')) {
        const { error } = await supabase.from('assets').delete().eq('id', id);
        if (error) {
            showToast('Error deleting asset (check foreign keys?)', 'error');
        } else {
            renderView('assets');
            showToast('Asset deleted', 'success');
        }
    }
};

window.deleteStaff = async (id) => {
    if (confirm('Are you sure?')) {
        const { error } = await supabase.from('staff').delete().eq('id', id);
        if (!error) {
            renderView('staff');
            showToast('Staff deleted', 'success');
        } else {
            showToast('Error deleting staff', 'error');
        }
    }
};

window.deleteCCTV = async (id) => {
    if (confirm('Are you sure?')) {
        const { error } = await supabase.from('cctv').delete().eq('id', id);
        if (!error) {
            renderView('cctv');
            showToast('Camera deleted', 'success');
        }
    }
};

window.deleteAccessory = async (id) => {
    if (confirm('Are you sure you want to delete this item?')) {
        // Delete logs first manually just in case cascade isn't set
        await supabase.from('accessory_logs').delete().eq('accessoryId', id);

        const { error } = await supabase.from('accessories').delete().eq('id', id);
        if (error) {
            showToast('Error deleting item: ' + error.message, 'error');
        } else {
            showToast('Item deleted', 'success');
            renderView('accessories');
        }
    }
};


window.handleFormSubmit = async (event, action, modalId) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    // Clean up IDs to be numbers if valid
    // In supabase auto ID they are numbers (bigint).

    try {
        if (action === 'createAsset') {
            const { error } = await supabase.from('assets').insert([{
                model: data.model,
                serialNumber: data.serialNumber,
                type: data.type,
                status: data.status || 'Available',
                specs_ram: data.specs_ram,
                specs_storage: data.specs_storage,
                specs_processor: data.specs_processor,
                specs_os: data.specs_os
            }]);
            if (error) throw error;
            showToast('Asset added successfully', 'success');
            window.renderView('assets');
        } else if (action === 'updateAsset') {
            // Auto-close assignment if status changed from Issued to Available or Scrap
            // (Keep assignment active if just sending to Repair)
            if (['Available', 'Scrap'].includes(data.status)) {
                const { data: activeAssignment } = await supabase.from('assignments')
                    .select('id')
                    .eq('assetId', data.id)
                    .is('returnDate', null)
                    .maybeSingle();

                if (activeAssignment) {
                    await supabase.from('assignments').update({
                        returnDate: new Date().toISOString()
                    }).eq('id', activeAssignment.id);
                }
            }

            const { error } = await supabase.from('assets').update({
                serialNumber: data.serialNumber,
                model: data.model,
                type: data.type,
                status: data.status,
                specs_processor: data.specs_processor,
                specs_ram: data.specs_ram,
                specs_storage: data.specs_storage,
                specs_storage_2: data.specs_storage_2,
                specs_os: data.specs_os
            }).eq('id', data.id);
            if (error) throw error;
            showToast('Asset updated', 'success');
            window.renderView('assets');
        } else if (action === 'createStaff') {
            const { error } = await supabase.from('staff').insert([data]);
            if (error) throw error;
            showToast('Staff added', 'success');
            window.renderView('staff');
        } else if (action === 'createCCTV') {
            const { error } = await supabase.from('cctv').insert([data]);
            if (error) throw error;
            showToast('Camera added', 'success');
            window.renderView('cctv');
        } else if (action === 'updateCCTV') {
            const updateData = {
                floor: data.floor,
                premise: data.premise,
                cameraLocation: data.cameraLocation,
                serialNumber: data.serialNumber,
                model: data.model,
                status: data.status,
                installDate: data.installDate || null
            };
            const { error } = await supabase.from('cctv').update(updateData).eq('id', data.id);
            if (error) throw error;
            showToast('Camera updated', 'success');
            window.renderView('cctv');
        } else if (action === 'createAccessoryItem') {
            const { error } = await supabase.from('accessories').insert([{
                type: data.type,
                brand: data.brand,
                model: data.model,
                serialNumber: data.serialNumber,
                status: data.status
            }]);
            if (error) throw error;
            showToast('Item added', 'success');
            window.renderView('accessories');
        } else if (action === 'updateAccessoryItem') {
            const { error } = await supabase.from('accessories').update({
                type: data.type,
                brand: data.brand,
                model: data.model,
                serialNumber: data.serialNumber,
                status: data.status
            }).eq('id', data.id);
            if (error) throw error;
            showToast('Item updated', 'success');
            window.renderView('accessories');

        } else if (action === 'createCCTVRepair') {
            const { error } = await supabase.from('cctv_repairs').insert([{
                cctvId: data.cctvId,
                faultDescription: data.faultDescription,
                actionTaken: data.actionTaken,
                cost: data.cost,
                date: data.date,
                technician: data.technician
            }]);
            if (error) throw error;
            showToast('CCTV Repair logged', 'success');
            // Optionally reopen history modal to see new log
            await window.viewCCTVHistory(data.cctvId);
            return;
        } else if (action === 'replaceCCTV') {
            // 1. Get Old Camera
            const { data: oldCam } = await supabase.from('cctv').select('*').eq('id', data.oldCCTVId).single();
            // 2. Get New Camera
            const { data: newCam } = await supabase.from('cctv').select('*').eq('id', data.newCCTVId).single();

            if (!oldCam || !newCam) throw new Error("Camera not found");

            // 3. Mark Old as Scrap/Faulty, remove location
            await supabase.from('cctv').update({
                status: data.oldStatus,
                cameraLocation: oldCam.cameraLocation + ' (Removed)', // Keep context but mark removed
                floor: 'Unassigned'
            }).eq('id', oldCam.id);

            // 4. Mark New as Installed, take location
            await supabase.from('cctv').update({
                status: 'Working',
                cameraLocation: oldCam.cameraLocation,
                floor: oldCam.floor,
                installDate: data.date
            }).eq('id', newCam.id);

            // 5. Log History on OLD camera
            await supabase.from('cctv_repairs').insert([{
                cctvId: oldCam.id,
                faultDescription: 'Replaced',
                actionTaken: `Replaced by ${newCam.model} (SN: ${newCam.serialNumber})`,
                date: data.date,
                technician: data.technician
            }]);

            // 6. Log History on NEW camera (Installation Log)
            await supabase.from('cctv_repairs').insert([{
                cctvId: newCam.id,
                faultDescription: 'Installation',
                actionTaken: `Installed to replace ${oldCam.model} (SN: ${oldCam.serialNumber})`,
                date: data.date,
                technician: data.technician
            }]);

            showToast('Camera Replaced Successfully', 'success');
            window.renderView('cctv');
        } else if (action === 'createRepair') {
            let partsText = data.partsReplaced || ''; // Ensure it's a string
            if (data.cannibalizedFromId) {
                const { data: sourceAsset } = await supabase.from('assets').select('*').eq('id', data.cannibalizedFromId).single();
                if (sourceAsset) {
                    const appendText = ` (Taken from ${sourceAsset.model} #${sourceAsset.serialNumber})`;
                    partsText = partsText ? `${partsText}${appendText}` : appendText;
                }
            }

            const { error } = await supabase.from('repairs').insert([{
                assetId: data.assetId,
                faultDescription: data.faultDescription,
                partsReplaced: partsText,
                cost: data.cost,
                date: data.date,
                technician: data.technician
            }]);
            if (error) throw error;

            await supabase.from('assets').update({ status: 'Repair' }).eq('id', data.assetId);

            showToast('Repair logged', 'success');
            window.renderView('repairs');
        } else if (action === 'submitIssue') {
            await supabase.from('assets').update({ status: 'Issued' }).eq('id', data.assetId);
            await supabase.from('assignments').insert([{
                assetId: data.assetId,
                staffId: data.staffId,
                issueDate: data.issueDate,
                returnDate: null
            }]);
            renderView('assets');
            showToast('Asset issued successfully', 'success');

            setTimeout(() => {
                if (confirm("Asset Issued. Do you want to print the Handover Form now?")) {
                    window.generateHandoverForm(data.assetId, data.staffId);
                }
            }, 500);
        } else if (action === 'submitReturn') {
            await supabase.from('assets').update({ status: 'Available' }).eq('id', data.assetId);

            let assignmentId = data.assignmentId;
            // Failsafe: If assignmentId missing, try to find it one last time
            if (!assignmentId) {
                const { data: active } = await supabase.from('assignments')
                    .select('id')
                    .eq('assetId', data.assetId)
                    .is('returnDate', null)
                    .limit(1)
                    .maybeSingle();
                if (active) assignmentId = active.id;
            }

            if (assignmentId) {
                await supabase.from('assignments').update({ returnDate: data.returnDate }).eq('id', assignmentId);
            }
            showToast('Asset returned', 'success');

            if (data.returnContext === 'staff' && data.staffId && data.staffId !== 'undefined') {
                await renderView('staff');
                // Open modal immediately
                await window.viewStaffDetails(data.staffId);
            } else {
                renderView('assets');
            }
        } else if (action === 'removeAccessory') {
            const { error: logError } = await supabase.from('accessory_logs').insert([{
                assetId: data.assetId,
                accessoryId: data.accessoryId,
                action: 'Removed',
                quantity_change: 1, // Stock increases
                date: new Date().toISOString(),
                technician: data.technician || 'Admin'
            }]);

            if (logError) throw logError;



            // Increase Stock
            const { data: item } = await supabase.from('accessories').select('quantity').eq('id', data.accessoryId).single();
            const { error: stockError } = await supabase.from('accessories').update({ quantity: item.quantity + 1 }).eq('id', data.accessoryId);

            if (stockError) throw stockError;

            showToast('Accessory Removed/Returned', 'success');
            // Refresh modal
            window.manageAssetAccessories(data.assetId);
        } else if (action === 'createFloor') {
            const { error } = await supabase.from('floors').insert([{
                name: data.name,
                sort_order: parseInt(data.sort_order)
            }]);
            if (error) throw error;
            showToast('Floor added', 'success');
            await fetchFloors(); // refresh global
            // Re-render manage modal to show new list
            window.openManageFloorsModal();
        } else if (action === 'deleteFloor') {
            // Logic handled in window.deleteFloor directly usually, but if form submission...
            // We'll keep delete as a direct action.
            window.openManageFloorsModal();
        } else if (action === 'deleteFloor') {
            // Logic handled in window.deleteFloor directly usually, but if form submission...
            // We'll keep delete as a direct action.
        } else if (action === 'createPremise') {
            const { error } = await supabase.from('premises').insert([{
                name: data.name,
                sort_order: parseInt(data.sort_order)
            }]);
            if (error) throw error;
            showToast('Premise added', 'success');
            await fetchPremises(); // refresh global
            window.openManagePremisesModal();
        }
    } catch (error) {
        console.error(error);
        showToast('Operation failed: ' + error.message, 'error');
    }

    if (action === 'closeHistory') {
        // Special case: just close. 
        // Although submit logic usually doesn't trigger this unless it's a form submit. 
        // The 'Close' button in modal footer is usually just a button with onclick="closeModal".
        // But my Modal component might make it a submit button?
        // Let's just ignore for now as 'Close' is likely handled by UI.
    } else {
        window.closeModal(modalId);
    }
};


// --- Modal Helpers ---
const openModal = (id, title, formParams, btnText, action) => {
    const container = document.getElementById('modal-container');
    container.innerHTML = Modal(id, title, formParams, btnText, action);
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        document.getElementById(`${id}-content`).classList.remove('scale-95', 'opacity-0');
        document.getElementById(`${id}-content`).classList.add('scale-100', 'opacity-100');
    });
};

window.viewCCTVHistory = async (id) => {
    const { data: camera } = await supabase.from('cctv').select('*').eq('id', id).single();
    if (!camera) return;

    const { data: repairs } = await supabase.from('cctv_repairs').select('*').eq('cctvId', id).order('date', { ascending: false });

    const historyHtml = repairs && repairs.length > 0 ? `
                                                                                                                                                                <div class="overflow-x-auto rounded-xl border border-white/10">
                                                                                                                                                                    <table class="w-full text-left border-collapse text-sm">
                                                                                                                                                                        <thead>
                                                                                                                                                                            <tr class="bg-white/5 border-b border-white/5 text-xs uppercase text-slate-400">
                                                                                                                                                                                <th class="p-3">Date</th>
                                                                                                                                                                                <th class="p-3">Fault</th>
                                                                                                                                                                                <th class="p-3">Action</th>
                                                                                                                                                                                <th class="p-3">Tech</th>
                                                                                                                                                                            </tr>
                                                                                                                                                                        </thead>
                                                                                                                                                                        <tbody class="divide-y divide-white/5">
                                                                                                                                                                            ${repairs.map(r => `
                        <tr>
                            <td class="p-3 text-slate-300">${formatDate(r.date)}</td>
                            <td class="p-3 text-white">${r.faultDescription}</td>
                            <td class="p-3 text-slate-300">${r.actionTaken || '-'}</td>
                             <td class="p-3 text-slate-300">${r.technician}</td>
                        </tr>
                    `).join('')}
                                                                                                                                                                        </tbody>
                                                                                                                                                                    </table>
                                                                                                                                                                </div>
                                                                                                                                                                ` : '<p class="text-slate-500 italic text-center py-4">No repair history records found.</p>';

    const modalContent = `
                                                                                                                                                                <div class="space-y-4">
                                                                                                                                                                    <div class="p-3 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                                                                                                                                                                        <div>
                                                                                                                                                                            <p class="text-xs text-slate-400">Location</p>
                                                                                                                                                                            <p class="font-medium text-white text-lg">${camera.cameraLocation}</p>
                                                                                                                                                                            <div class="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                                                                                                                                                                <span class="bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">${camera.serialNumber || 'No Serial'}</span>
                                                                                                                                                                                <span class="text-slate-500">•</span>
                                                                                                                                                                                <span>${camera.model || 'Unknown Model'}</span>
                                                                                                                                                                            </div>
                                                                                                                                                                        </div>
                                                                                                                                                                        <div class="text-right flex flex-col gap-2">
                                                                                                                                                                            <button onclick="window.openLogCCTVRepairModal(${camera.id})" class="w-full px-3 py-1.5 bg-amber-500 hover:bg-amber-600 rounded-lg text-white text-xs font-bold shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-1">
                                                                                                                                                                                <i class="fas fa-wrench"></i> Log Repair
                                                                                                                                                                            </button>
                                                                                                                                                                            <button onclick="window.openReplaceCCTVModal(${camera.id})" class="w-full px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded-lg text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-1">
                                                                                                                                                                                <i class="fas fa-exchange-alt"></i> Replace
                                                                                                                                                                            </button>
                                                                                                                                                                        </div>
                                                                                                                                                                    </div>
                                                                                                                                                                    <h4 class="text-sm font-semibold text-slate-300 border-b border-white/10 pb-2">Maintenance Log</h4>
                                                                                                                                                                    ${historyHtml}
                                                                                                                                                                </div>
                                                                                                                                                                `;
    openModal('cctvHistoryModal', 'CCTV History', modalContent, 'Close', 'closeHistory');
};

window.openLogCCTVRepairModal = (id) => {
    // We close history modal internally by just opening a new one on top or replacing content.
    // Simplify usage by just overwriting.
    const formHtml = `
                                                                                                                                                                <input type="hidden" name="cctvId" value="${id}">
                                                                                                                                                                    <div class="space-y-3">
                                                                                                                                                                        <input type="text" name="faultDescription" placeholder="Fault (e.g. No Signal)" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                            <input type="text" name="actionTaken" placeholder="Action (e.g. Replaced Connector)" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                <div class="flex gap-4">
                                                                                                                                                                                    <input type="number" name="cost" placeholder="Cost ($)" step="0.01" class="w-1/2 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                        <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" class="w-1/2 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                        </div>
                                                                                                                                                                                        <input type="text" name="technician" placeholder="Technician Name" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                        </div>
                                                                                                                                                                                        `;
    openModal('cctvRepairModal', 'Log CCTV Repair', formHtml, 'Save Log', 'createCCTVRepair');
};

window.openReplaceCCTVModal = async (id) => {
    // Get inventory cameras
    const { data: stockCameras } = await supabase.from('cctv').select('*').eq('status', 'In Stock');

    const stockOptions = stockCameras && stockCameras.length > 0
        ? stockCameras.map(c => `<option value="${c.id}">${c.model} (SN: ${c.serialNumber || 'N/A'})</option>`).join('')
        : '<option value="" disabled>No cameras in stock!</option>';

    const formHtml = `
                                                                                                                                                                                        <input type="hidden" name="oldCCTVId" value="${id}">
                                                                                                                                                                                            <div class="space-y-4">
                                                                                                                                                                                                <div class="bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl text-center">
                                                                                                                                                                                                    <p class="text-xs text-purple-300 uppercase font-bold tracking-wider mb-1">Replacing Camera</p>
                                                                                                                                                                                                    <p class="text-white text-sm">This action will mark the current camera as faulty/scrap and install a new one from inventory.</p>
                                                                                                                                                                                                </div>

                                                                                                                                                                                                <div>
                                                                                                                                                                                                    <label class="block text-xs text-slate-400 mb-1">Select New Camera (From Stock)</label>
                                                                                                                                                                                                    <select name="newCCTVId" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                                                                                                                                                                                                        <option value="">-- Select Replacement --</option>
                                                                                                                                                                                                        ${stockOptions}
                                                                                                                                                                                                    </select>
                                                                                                                                                                                                </div>

                                                                                                                                                                                                <div class="grid grid-cols-2 gap-3">
                                                                                                                                                                                                    <div>
                                                                                                                                                                                                        <label class="block text-xs text-slate-400 mb-1">Old Camera Status</label>
                                                                                                                                                                                                        <select name="oldStatus" class="w-full bg-slate-900 border border-white/10 rounded-xl px-2 py-3 text-sm focus:outline-none focus:border-primary text-slate-300">
                                                                                                                                                                                                            <option value="Damaged">Damaged (Scrap)</option>
                                                                                                                                                                                                            <option value="Faulty">Faulty (Repair)</option>
                                                                                                                                                                                                        </select>
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                    <div>
                                                                                                                                                                                                        <label class="block text-xs text-slate-400 mb-1">Date</label>
                                                                                                                                                                                                        <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" class="w-full bg-slate-900 border border-white/10 rounded-xl px-2 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                </div>

                                                                                                                                                                                                <input type="text" name="technician" placeholder="Technician Name" required class="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary">
                                                                                                                                                                                            </div>
                                                                                                                                                                                            `;
    openModal('replaceCCTVModal', 'Replace Camera', formHtml, 'Confirm Replace', 'replaceCCTV');
};


window.reprintHandover = async (assetId) => {
    // Find who it is currently assigned to
    const { data: assignment } = await supabase.from('assignments')
        .select('*')
        .eq('assetId', assetId)
        .is('returnDate', null)
        .order('issueDate', { ascending: false })
        .limit(1)
        .single();

    if (!assignment) {
        alert("This asset is not currently assigned to anyone.");
        return;
    }

    if (confirm(`Reprint handover form for this asset (Assigned to Staff ID #${assignment.staffId})?`)) {
        window.generateHandoverForm(assetId, assignment.staffId);
    }
};

window.generateHandoverForm = async (assetId, staffId) => {
    try {
        // 1. Fetch Data
        const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();
        const { data: staff } = await supabase.from('staff').select('*').eq('id', staffId).single();
        const { data: accessories } = await supabase.from('accessories').select('*').eq('assetId', assetId).eq('status', 'Installed');

        if (!asset || !staff) {
            alert('Error fetching details for handover form.');
            return;
        }

        // 2. Load PDF Template
        const existingPdfBytes = await fetch('/Temp.pdf').then(res => {
            if (!res.ok) throw new Error("Could not load /Temp.pdf");
            return res.arrayBuffer();
        });

        // 3. Load PDF Document
        const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        // Font setup
        const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const fontSize = 10;
        const color = PDFLib.rgb(0, 0, 0);

        // Helper to draw text
        const draw = (text, x, y, size = fontSize) => {
            firstPage.drawText(String(text || ''), {
                x,
                y,
                size,
                font: helveticaFont,
                color,
            });
        };

        // --- EDIT COORDINATES HERE (x, y) ---
        // Coordinates usually start from bottom-left (0,0). So y increases upwards.
        // You'll need to adjust these by trial and error based on your Temp.pdf layout.

        const date = new Date().toLocaleDateString();

        // Header / Meta
        draw(date, 450, 750); // Date at top right

        // Staff Details (Adjust X/Y based on your form)
        // assuming standard form layout starting around y=650
        const col1Helper = 120; // Label column (approx)
        const col2Helper = 350; // Second column if any

        // Example positions:
        draw(staff.name, 250, 750);         // Staff Name
        draw(staff.employeeId, 250, 722);   // Employee ID
        draw(staff.department, 250, 695);   // Department

        // Asset Details
        draw(asset.model, 250, 668);        // Model
        draw(asset.serialNumber, 250, 643); // Serial
        // draw(asset.type, 150, 510);         // Type

        // Specs
        // let specs = [];
        // if (asset.specs_processor) specs.push(asset.specs_processor);
        // if (asset.specs_ram) specs.push(asset.specs_ram);
        // if (asset.specs_storage) specs.push(asset.specs_storage);
        // if (asset.specs_storage_2) specs.push(asset.specs_storage_2);

        // draw(specs.join(' | '), 150, 490);  // Specs line

        // // Accessories
        // let yPos = 430;
        // if (accessories && accessories.length > 0) {
        //     accessories.forEach(acc => {
        //         draw(`- ${acc.type}: ${acc.brand} ${acc.model} (SN: ${acc.serialNumber})`, 150, yPos);
        //         yPos -= 15;
        //     });
        // } else {
        //     draw("No additional accessories.", 150, yPos);
        // }

        // 4. Save and Open
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        // Open PDF in new tab
        const printWindow = window.open(blobUrl, '_blank');
        if (printWindow) {
            printWindow.onload = () => {
                setTimeout(() => printWindow.print(), 500); // Attempt to auto-print
            };
        } else {
            alert("Popup blocked! Please allow popups to view the PDF.");
        }

    } catch (err) {
        console.error("Error generating PDF:", err);
        alert("Error generating PDF form. Ensure Temp.pdf is in the root folder. Check console.");
    }
};

window.fetchFloors = async () => {
    const { data: floors } = await supabase.from('floors').select('*').order('sort_order', { ascending: true });
    window.allFloors = floors || [];
};

window.fetchPremises = async () => {
    const { data: premises } = await supabase.from('premises').select('*').order('sort_order', { ascending: true });
    window.allPremises = premises || [];
};

window.openManagePremisesModal = async () => {
    if (!window.allPremises) await fetchPremises();

    const listHtml = window.allPremises.map(p => `
                                                                                                                                                                                            <div class="flex justify-between items-center p-3 bg-dark rounded border border-border mb-2">
                                                                                                                                                                                                <div>
                                                                                                                                                                                                    <span class="font-bold text-textMain text-sm">${p.name}</span>
                                                                                                                                                                                                    <span class="text-xs text-textSub ml-2 bg-surface px-1.5 py-0.5 rounded border border-border">Order: ${p.sort_order}</span>
                                                                                                                                                                                                </div>
                                                                                                                                                                                                <button onclick="window.deletePremise(${p.id})" type="button" class="text-textSub hover:text-[#F87171] transition-colors p-2" title="Delete">
                                                                                                                                                                                                    <i class="fas fa-trash"></i>
                                                                                                                                                                                                </button>
                                                                                                                                                                                            </div>
                                                                                                                                                                                            `).join('');

    const formHtml = `
                                                                                                                                                                                            <div class="space-y-4">
                                                                                                                                                                                                <div class="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                                                                                                                                                                    ${listHtml || '<p class="text-textSub italic text-center py-4">No custom premises defined.</p>'}
                                                                                                                                                                                                </div>

                                                                                                                                                                                                <div class="pt-4 border-t border-border">
                                                                                                                                                                                                    <h4 class="text-xs font-bold text-textSub uppercase tracking-wider mb-3">Add New Premise</h4>
                                                                                                                                                                                                    <div class="flex gap-2">
                                                                                                                                                                                                        <input type="text" name="name" placeholder="Name (e.g. Branch Office)" required class="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                                                                            <input type="number" name="sort_order" placeholder="Order" value="${(window.allPremises.length + 1)}" class="w-20 bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                                                                                <button type="submit" class="bg-primary hover:bg-[#3E5C69] text-white px-4 rounded text-sm font-medium transition-colors">
                                                                                                                                                                                                                    Add
                                                                                                                                                                                                                </button>
                                                                                                                                                                                                            </div>
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                </div>
                                                                                                                                                                                                `;

    openModal('managePremisesModal', 'Manage Premises', formHtml, 'Add Premise', 'createPremise');
};

window.deletePremise = async (id) => {
    if (!confirm("Delete this premise? Cameras assigned to it might not display correctly.")) return;

    const { error } = await supabase.from('premises').delete().eq('id', id);
    if (error) {
        showToast("Error deleting: " + error.message, 'error');
    } else {
        showToast("Premise deleted", 'success');
        await fetchPremises();
        window.openManagePremisesModal();
    }
};

// Export Helper
window.downloadCCTVReport = async () => {
    // Fetch all for current premise
    if (!window.currentCctvPremise) {
        alert("Please select a premise first.");
        return;
    }

    showToast("Generating report...", "info");

    try {
        const { data: cameras } = await supabase.from('cctv').select('*')
            .eq('premise', window.currentCctvPremise)
            .order('floor', { ascending: true })
            .order('cameraLocation', { ascending: true });

        if (!cameras || cameras.length === 0) {
            showToast("No data to export.", "warning");
            return;
        }

        // CSV Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Premise,Floor,Location,Model,Serial Number,Status,Install Date\n";

        // CSV Rows
        cameras.forEach(c => {
            const row = [
                c.premise || 'Main Premise',
                c.floor || 'Unassigned',
                `"${(c.cameraLocation || '').replace(/"/g, '""')}"`, // Handle quotes
                `"${(c.model || '').replace(/"/g, '""')}"`,
                `"${(c.serialNumber || '').replace(/"/g, '""')}"`,
                c.status,
                c.installDate ? formatDate(c.installDate) : ''
            ].join(",");
            csvContent += row + "\n";
        });

        // Encode and Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `CCTV_Report_${window.currentCctvPremise}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast("Report downloaded successfully.", "success");

    } catch (err) {
        console.error(err);
        showToast("Error generating report.", "error");
    }
};

window.openManageFloorsModal = async () => {
    // Ensure we have latest
    if (!window.allFloors) await fetchFloors();

    const listHtml = window.allFloors.map(f => `
                                                                                                                                                                                                <div class="flex justify-between items-center p-3 bg-dark rounded border border-border mb-2">
                                                                                                                                                                                                    <div>
                                                                                                                                                                                                        <span class="font-bold text-textMain text-sm">${f.name}</span>
                                                                                                                                                                                                        <span class="text-xs text-textSub ml-2 bg-surface px-1.5 py-0.5 rounded border border-border">Order: ${f.sort_order}</span>
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                    <button onclick="window.deleteFloor(${f.id})" type="button" class="text-textSub hover:text-[#F87171] transition-colors p-2" title="Delete">
                                                                                                                                                                                                        <i class="fas fa-trash"></i>
                                                                                                                                                                                                    </button>
                                                                                                                                                                                                </div>
                                                                                                                                                                                                `).join('');

    const formHtml = `
                                                                                                                                                                                                <div class="space-y-4">
                                                                                                                                                                                                    <div class="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                                                                                                                                                                        ${listHtml || '<p class="text-textSub italic text-center py-4">No custom floors defined.</p>'}
                                                                                                                                                                                                    </div>

                                                                                                                                                                                                    <div class="pt-4 border-t border-border">
                                                                                                                                                                                                        <h4 class="text-xs font-bold text-textSub uppercase tracking-wider mb-3">Add New Floor</h4>
                                                                                                                                                                                                        <div class="flex gap-2">
                                                                                                                                                                                                            <input type="text" name="name" placeholder="Floor Name (e.g. 7th)" required class="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                                                                                <input type="number" name="sort_order" placeholder="Order" value="${(window.allFloors.length + 1)}" class="w-20 bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary">
                                                                                                                                                                                                                    <button type="submit" class="bg-primary hover:bg-[#3E5C69] text-white px-4 rounded text-sm font-medium transition-colors">
                                                                                                                                                                                                                        Add
                                                                                                                                                                                                                    </button>
                                                                                                                                                                                                                </div>
                                                                                                                                                                                                        </div>
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                    `;

    openModal('manageFloorsModal', 'Manage Floors', formHtml, 'Add Floor', 'createFloor');
};

window.deleteFloor = async (id) => {
    if (!confirm("Delete this floor? Camera locations associated with it might display incorrectly.")) return;

    const { error } = await supabase.from('floors').delete().eq('id', id);
    if (error) {
        showToast("Error deleting: " + error.message, 'error');
    } else {
        showToast("Floor deleted", 'success');
        await fetchFloors();
        window.openManageFloorsModal(); // Refresh UI
    }
};

window.closeModal = (id) => {
    const modalContent = document.getElementById(`${id}-content`);
    if (modalContent) {
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-95', 'opacity-0');
    }
    setTimeout(() => {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    }, 300);
};

// Start
init();
