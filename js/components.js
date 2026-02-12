export const StatCard = (title, value, icon, colorClass, details = '') => `
    <div class="bg-surface border border-border p-5 rounded-lg relative overflow-hidden h-full flex flex-col justify-between card-hover transform transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group">
        <div>
            <div class="flex items-center justify-between mb-4">
                <span class="text-textSub text-[10px] font-bold uppercase tracking-widest">${title}</span>
                <div class="${colorClass} w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                    <i class="${icon} text-sm"></i>
                </div>
            </div>
            <h3 class="text-3xl font-bold text-textMain mb-2">${value}</h3>
        </div>
        ${details ? `<div class="mt-2 text-xs space-y-1 border-t border-border pt-2">${details}</div>` : ''}
    </div>
`;

export const Table = (headers, bodyId) => `
    <div class="bg-surface rounded-lg border border-border overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-dark border-b border-border text-xs uppercase text-textSub">
                        ${headers.map(h => `<th class="p-4 font-semibold">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody id="${bodyId}" class="text-sm divide-y divide-border">
                    <!-- Rows injected here -->
                </tbody>
            </table>
        </div>
    </div>
`;

export const AssetRow = (asset, assignedTo = null) => {
    // Enterprise status colors (Subtle badges)
    const statusClasses = {
        'Available': 'bg-[#163326] text-[#4ADE80] border border-[#163326]', // Subtle Green
        'Issued': 'bg-[#1E2030] text-[#818CF8] border border-[#1E2030]', // Subtle Indigo
        'Repair': 'bg-[#332616] text-[#FBBF24] border border-[#332616]', // Subtle Amber
        'Scrap': 'bg-[#331616] text-[#F87171] border border-[#331616]'  // Subtle Red
    };
    const statusClass = statusClasses[asset.status] || 'bg-surface text-textSub border border-border';

    return `
        <tr class="hover:bg-dark transition-colors group">
            <td class="p-4 font-mono text-textMain text-sm">${asset.serialNumber}</td>
            <td class="p-4 text-textSub">
                <div class="font-medium text-textMain">${asset.model}</div>
                ${(asset.type === 'Laptop' || asset.type === 'Desktop') && (asset.specs_ram || asset.specs_storage || asset.specs_storage_2 || asset.specs_processor) ?
            `<div class="flex flex-wrap gap-4 text-[11px] text-textSub mt-1.5 font-mono opacity-90 items-center">
                        ${asset.specs_processor ? `<span class="flex items-center gap-1.5" title="Processor"><i class="fas fa-microchip text-primary"></i> ${asset.specs_processor}</span>` : ''}
                        ${asset.specs_ram ? `<span class="flex items-center gap-1.5" title="RAM"><i class="fas fa-memory text-primary"></i> ${asset.specs_ram}</span>` : ''}
                        ${asset.specs_storage ? `<span class="flex items-center gap-1.5" title="Storage"><i class="fas fa-hdd text-primary"></i> ${asset.specs_storage}</span>` : ''}
                        ${asset.specs_storage_2 ? `<span class="flex items-center gap-1 opacity-70" title="Secondary Storage">+ ${asset.specs_storage_2}</span>` : ''}
                    </div>` : ''
        }
            </td>
            <td class="p-4 text-textSub">${asset.type}</td>
            <td class="p-4">
                <span class="px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide ${statusClass}">
                    ${asset.status}
                </span>
                </span>
            </td>
            <td class="p-4 text-textSub text-sm">
                ${assignedTo ? `<span class="flex items-center gap-1.5 text-textMain"><i class="fas fa-user text-primary text-xs"></i> ${assignedTo}</span>` : '<span class="opacity-30">-</span>'}
            </td>
            <td class="p-4">
                <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.editAsset(${asset.id})" class="p-2 hover:text-primary transition-colors" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${(asset.type === 'Laptop' || asset.type === 'Desktop') ?
            `<button onclick="window.manageAssetAccessories(${asset.id})" class="p-2 hover:text-primary transition-colors" title="Manage Accessories">
                            <i class="fas fa-plug"></i>
                        </button>` : ''
        }
                    <button onclick="window.viewAssetHistory(${asset.id})" class="p-2 hover:text-primary transition-colors" title="Maintenance History">
                        <i class="fas fa-history"></i>
                    </button>
                    <button onclick="window.deleteAsset(${asset.id})" class="p-2 hover:text-secondary transition-colors" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${asset.status === 'Available' ?
            `<button onclick="window.issueAsset(${asset.id})" class="p-2 hover:text-primary transition-colors" title="Issue">
                            <i class="fas fa-user-plus"></i>
                        </button>` : ''
        }
                     ${asset.status === 'Issued' ?
            `<button onclick="window.returnAsset(${asset.id})" class="p-2 hover:text-primary transition-colors" title="Return">
                            <i class="fas fa-undo"></i>
                        </button>` : ''
        }
                </div>
            </td>
        </tr>
    `;
};

export const CCTVCard = (camera) => {
    const isWorking = camera.status === 'Working';
    const isStock = camera.status === 'In Stock';
    const isDamaged = camera.status === 'Damaged';

    let borderColor = 'border-border';
    let iconClass = 'text-textSub';

    let icon = 'fa-video';

    // Customize based on status (Muted colors)
    if (isStock) {
        borderColor = 'border-l-primary'; // Use primary for stock
        iconClass = 'text-primary bg-primary/10';
        icon = 'fa-box';
    } else if (isDamaged) {
        borderColor = 'border-l-[#F87171]'; // Subtle Red
        iconClass = 'text-[#F87171] bg-[#F87171]/10';
        icon = 'fa-times-circle';
    } else if (!isWorking) {
        borderColor = 'border-l-[#FBBF24]'; // Subtle Amber
        iconClass = 'text-[#FBBF24] bg-[#FBBF24]/10';
        icon = 'fa-video-slash';
    } else {
        borderColor = 'border-l-[#4ADE80]'; // Subtle Green for working
        iconClass = 'text-[#4ADE80] bg-[#4ADE80]/10';
    }

    return `
        <div class="bg-surface rounded-xl border ${borderColor} p-4 h-full relative group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cctv-card" data-search="${(camera.model || '').toLowerCase()} ${(camera.serialNumber || '').toLowerCase()} ${(camera.cameraLocation || '').toLowerCase()}">
            <div class="flex justify-between items-start mb-3">
                <div>
                     <span class="text-[10px] uppercase font-bold text-textSub tracking-wider">${camera.floor || 'Unassigned'}</span>
                    <h4 class="font-bold text-textMain text-sm leading-tight mb-0.5 truncate max-w-[140px]" title="${camera.cameraLocation}">${camera.cameraLocation}</h4>
                     ${camera.model ? `<p class="text-[11px] text-textSub font-medium truncate max-w-[140px]">${camera.model}</p>` : ''}
                     <p class="text-[10px] text-textSub opacity-70 font-mono mt-0.5 truncate max-w-[140px]" title="Serial Number">${camera.serialNumber || 'SN: N/A'}</p>
                </div>
                <div class="w-8 h-8 rounded flex items-center justify-center ${iconClass}">
                    <i class="fas ${icon} text-sm"></i>
                </div>
            </div>
            
            <div class="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                 <button onclick="window.viewCCTVHistory(${camera.id})" class="text-textSub hover:text-textMain transition-colors" title="History">
                    <i class="fas fa-history"></i>
                </button>
                 <button onclick="window.editCCTV(${camera.id})" class="text-textSub hover:text-textMain text-xs font-medium uppercase tracking-wide transition-colors">
                    Edit
                </button>
                <div class="flex-1"></div>
                 ${isWorking || !isWorking && !isStock && !isDamaged ?
            `<button onclick="window.toggleCCTV(${camera.id}, '${isWorking ? 'Faulty' : 'Working'}')" 
                        class="text-xs font-bold uppercase tracking-wider transition-colors px-2 py-0.5 rounded ${isWorking ? 'text-[#F87171] hover:bg-[#F87171]/10' : 'text-[#4ADE80] hover:bg-[#4ADE80]/10'}">
                        ${isWorking ? 'Report Fault' : 'Mark Fixed'}
                    </button>` : ''
        }
                ${!isStock && !isDamaged ?
            `<button onclick="window.openReplaceCCTVModal(${camera.id})" class="text-textSub hover:text-primary transition-colors" title="Replace Camera">
                        <i class="fas fa-exchange-alt"></i>
                    </button>` : ''
        }
                <button onclick="window.deleteCCTV(${camera.id})" class="text-textSub hover:text-[#F87171] transition-colors" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
};


export const Modal = (id, title, formParams, buttonText = 'Save', buttonAction = 'save') => `
    <div id="${id}" class="fixed inset-0 z-50 flex items-center justify-center hidden backdrop-blur-sm transition-opacity duration-300">
        <div class="absolute inset-0 bg-black/80" onclick="window.closeModal('${id}')"></div>
        <div class="bg-surface border border-border w-full max-w-md p-6 rounded shadow-2xl relative z-10 transform scale-95 opacity-0 transition-all duration-200 animate-scale-in" id="${id}-content">
            <div class="flex justify-between items-center mb-6 pb-4 border-b border-border">
                <h3 class="text-lg font-bold text-textMain uppercase tracking-wide">${title}</h3>
                <button onclick="window.closeModal('${id}')" class="text-textSub hover:text-textMain transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form onsubmit="window.handleFormSubmit(event, '${buttonAction}', '${id}')" class="space-y-4">
                ${formParams}
                <div class="pt-6 flex gap-3">
                    <button type="button" onclick="window.closeModal('${id}')" class="flex-1 py-2 rounded text-sm font-medium border border-border text-textSub hover:bg-border transition-colors">
                        Cancel
                    </button>
                    <button type="submit" class="flex-1 py-2 rounded text-sm font-medium bg-primary hover:bg-[#3E5C69] text-white shadow-none transition-all">
                        ${buttonText}
                    </button>
                </div>
            </form>
        </div>
    </div>
`;
