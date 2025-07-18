// ----- URL DE LA LISTA MAESTRA EN REPOSITORIO (DEBE SER UN ARCHIVO .XLSX) -----
const URL_LISTA_MAESTRA_REPOSITORIO = 'https://raw.githubusercontent.com/Galaz94/Double_Control/main/maestra.xlsx';

// ----- ESTADO DE LA APLICACIÓN -----
let listaFoco = new Map();
let upcToCodigoMap = new Map();
let listaVerificar = new Set();
let datosVerificacionCargados = [];
let coincidencias = new Map();
const LOCAL_STORAGE_KEY_LISTA_FOCO = 'sDCI_listaFocoGuardada_v3.0.3';
let listaFocoCacheadaLocalmente = new Map();
let html5QrCodeVerifier = null;
let scannerVerifierActive = false;
let searchDebounceTimeout;

const $ = (id) => document.getElementById(id);
const DOM = {
    views: {
        panelInicio: $('panelInicio'),
        gestionMaestraStep: $('gestionMaestraStep'),
        dobleControlStep: $('dobleControlStep'),
        resultadosStep: $('resultadosStep'),
        confirmacionCambiosStep: $('confirmacionCambiosStep'),
        itemDetailModal: $('itemDetailModal'),
        helpModal: $('helpModal'),
    },
    buttons: {
        iniciarDobleControl: $('btnIniciarDobleControlDesdePanel'),
        gestionMaestra: $('btnGestionMaestraDesdePanel'),
        borrarStorage: $('btnBorrarMaestraStorage'),
        volverDesdeGestion: $('btnVolverAlPanelDesdeGestion'),
        volverDesdeDobleControl: $('btnVolverAlPanelDesdeDobleControl'),
        compare: $('btnCompare'),
        startScanVerify: $('startScanVerifyBtn'),
        layoutToggle: $('layoutToggleResultsBtn'),
        downloadXlsx: $('downloadXlsxResultsBtn'),
        downloadCsv: $('downloadCsvResultsBtn'),
        newVerification: $('btnNewVerification'),
        confirmarCambios: $('btnConfirmarCambiosRepositorio'),
        rechazarCambios: $('btnRechazarCambiosRepositorio'),
        uploadLocalMaestra: $('btnUploadLocalMaestra'),
        mostrarItemsFiltrados: $('btnMostrarItemsFiltrados'),
        helpGestionMaestra: $('helpGestionMaestra'),
        helpDobleControl: $('helpDobleControl'),
        closeHelpModal: $('closeHelpModal'),
    },
    inputs: {
        searchFoco: $('searchFocoInput'),
        verifyTextarea: $('verifyTextarea'),
        verifyFileTxtCsv: $('verifyFileTxtCsv'),
        verifyFileExcel: $('verifyFileExcel'),
        verifyCodigoCol: $('verifyCodigoCol'),
        verifyCsvDelimiter: $('verifyCsvDelimiter'),
        verifyHasHeader: $('verifyHasHeader'),
        scannedCodesVerifyTextarea: $('scannedCodesVerifyTextarea'),
        masterFileExcelUpload: $('masterFileExcelUpload'),
    },
    displays: {
        panelInicioInfo: $('panelInicioInfo'),
        focoSearchResults: $('focoSearchResults'),
        focoPreview: $('focoPreview'),
        verifyPreview: $('verifyPreview'),
        scannerContainerVerify: $('scannerContainerVerify'),
        readerVerify: $('readerVerify'),
        outputResults: $('outputResults'),
        filteredItemsDisplay: $('filteredItemsDisplay'),
    },
    stats: {
        totalFoco: $('totalFoco'),
        totalVerify: $('totalVerify'),
        totalMatches: $('totalMatches'),
        itemsBySegment: $('statItemsBySegment'),
    },
    filters: {
        department: $('departmentFilter'),
        segment: $('segmentFilter'),
    },
    modal: {
        image: $('modalItemImage'),
        imageError: $('modalImageError'),
        codigo: $('modalItemCodigo'),
        descripcion: $('modalItemDescripcion'),
        upc: $('modalItemUPC'),
        brand: $('modalItemBrand'),
        department: $('modalItemDepartment'),
        uom: $('modalItemUom'),
        barcodeSvgContainer: $('modalItemBarcodeSvg'),
        helpTitle: $('helpModalTitle'),
        helpBody: $('helpModalBody'),
    },
    resumenCambios: {
        nuevos: document.querySelector('#resumenNuevos ul'),
        eliminados: document.querySelector('#resumenEliminados ul'),
        modificados: document.querySelector('#resumenModificados ul'),
    }
};

document.addEventListener('DOMContentLoaded', () => {
    checkInitialState();
    navigateToView('panelInicio');
    addEventListeners();
});

function showToast(message, type = 'info', duration = 3000) {
    let toastContainer = $('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true });
    }, duration);
}

function addEventListeners() {
    // Listeners para el modal de detalles de ítem
    DOM.views.itemDetailModal.addEventListener('click', (event) => {
        if (event.target === DOM.views.itemDetailModal || event.target.classList.contains('close-modal')) {
            closeItemDetailModal();
        }
    });
    $('closeItemDetailModal').addEventListener('click', closeItemDetailModal);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !DOM.views.itemDetailModal.classList.contains('hidden')) {
            closeItemDetailModal();
        }
    });

    // Listeners para el modal de ayuda
    DOM.views.helpModal.addEventListener('click', (event) => {
        if (event.target === DOM.views.helpModal) {
            closeHelpModal();
        }
    });
    DOM.buttons.closeHelpModal.addEventListener('click', closeHelpModal);
     document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !DOM.views.helpModal.classList.contains('hidden')) {
            closeHelpModal();
        }
    });

    DOM.modal.image.onerror = function() {
        this.style.display = 'none';
        DOM.modal.imageError.style.display = 'block';
    };
    DOM.modal.image.onload = function() {
        this.style.display = 'block';
        DOM.modal.imageError.style.display = 'none';
    };

    DOM.buttons.iniciarDobleControl.addEventListener('click', handleIniciarDobleControl);
    DOM.buttons.gestionMaestra.addEventListener('click', () => navigateToView('gestionMaestraStep'));
    DOM.buttons.borrarStorage.addEventListener('click', handleBorrarStorage);
    DOM.buttons.uploadLocalMaestra.addEventListener('click', handleMasterFileUpload);
    DOM.inputs.masterFileExcelUpload.addEventListener('change', () => {
        DOM.buttons.uploadLocalMaestra.disabled = !DOM.inputs.masterFileExcelUpload.files.length;
    });
    DOM.buttons.uploadLocalMaestra.disabled = true;
    DOM.inputs.searchFoco.addEventListener('input', () => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => updateFocoPreviewAndSearch(), 250);
    });
    DOM.filters.department.addEventListener('change', () => updateFocoPreviewAndSearch());
    DOM.filters.segment.addEventListener('change', () => updateFocoPreviewAndSearch());
    DOM.buttons.volverDesdeGestion.addEventListener('click', () => navigateToView('panelInicio'));
    DOM.inputs.verifyFileTxtCsv.addEventListener('change', (e) => handleVerifyFileUpload(e.target.files[0], 'textcsv'));
    DOM.inputs.verifyFileExcel.addEventListener('change', (e) => handleVerifyFileUpload(e.target.files[0], 'excel'));
    DOM.buttons.startScanVerify.addEventListener('click', toggleScanner);
    DOM.buttons.compare.addEventListener('click', handleCompare);
    DOM.buttons.volverDesdeDobleControl.addEventListener('click', () => navigateToView('panelInicio'));
    DOM.buttons.layoutToggle.addEventListener('click', toggleResultsLayout);
    DOM.buttons.downloadCsv.addEventListener('click', downloadCsvResults);
    DOM.buttons.downloadXlsx.addEventListener('click', downloadXlsxResults);
    DOM.buttons.newVerification.addEventListener('click', handleNewVerification);

    DOM.displays.outputResults.addEventListener('click', (event) => {
        const itemContainer = event.target.closest('.barcode-item-container');
        if (itemContainer && itemContainer.dataset.iditem) {
            openItemDetailModal(itemContainer.dataset.iditem);
        }
    });

    DOM.displays.focoSearchResults.addEventListener('click', (event) => {
        const itemContainer = event.target.closest('.search-result-item');
        if (itemContainer && itemContainer.dataset.iditem) {
            openItemDetailModal(itemContainer.dataset.iditem);
        }
    });

    DOM.buttons.confirmarCambios.addEventListener('click', () => {
        const maestraRepositorioMap = JSON.parse(DOM.buttons.confirmarCambios.dataset.maestraRepositorio || '{}', (key, value) => {
            if (typeof value === 'object' && value !== null && value.__isMap__) return new Map(value.data);
            return value;
        });
        if (maestraRepositorioMap && maestraRepositorioMap.size > 0) {
            listaFoco = maestraRepositorioMap;
            rebuildUpcToCodigoMap();
            saveListaFocoToStorage();
            updateFocoPreviewAndSearch();
            DOM.displays.panelInicioInfo.innerHTML = `✅ Maestra Sincronizada (${listaFoco.size} ítems) y guardada.`;
            showToast(`Maestra Sincronizada (${listaFoco.size} ítems) y guardada.`, 'success');
        } else {
            DOM.displays.panelInicioInfo.innerHTML = `⚠️ Error al aplicar cambios. Se mantuvo la versión actual.`;
            showToast(`Error al aplicar cambios. Se mantuvo la versión actual.`, 'error');
        }
        navigateToView('panelInicio');
    });
    DOM.buttons.rechazarCambios.addEventListener('click', () => {
        rebuildUpcToCodigoMap();
        updateFocoPreviewAndSearch();
        DOM.displays.panelInicioInfo.innerHTML = `ℹ️ Cambios del repositorio ignorados. Maestra local (${listaFoco.size} ítems).`;
        showToast(`Cambios del repositorio ignorados. Maestra local (${listaFoco.size} ítems).`, 'info');
        navigateToView('panelInicio');
    });

    DOM.buttons.helpGestionMaestra.addEventListener('click', () => {
        openHelpModal(
            'Ayuda: Gestión de Lista Maestra',
            `<p>Esta sección te permite visualizar y gestionar la lista maestra de ítems.</p>
             <ul>
                <li><b>Buscar:</b> Ingresa uno o más términos para encontrar ítems por código, UPC, descripción o marca.</li>
                <li><b>Filtros:</b> Puedes filtrar los ítems por Departamento y Segmento (ACP/PPS).</li>
                <li><b>Resultados de Búsqueda:</b> Se muestra una vista previa. Haz clic en un ítem para ver sus detalles.</li>
                <li><b>Mostrar Ítems Filtrados:</b> Este botón cargará TODOS los ítems que coincidan con tus filtros a la pantalla de Doble Control.</li>
             </ul>`
        );
    });

    DOM.buttons.helpDobleControl.addEventListener('click', () => {
        openHelpModal(
            'Ayuda: Cargar Lista de Verificación',
            `<p>Aquí puedes cargar los ítems que deseas verificar contra la lista maestra.</p>
             <ul>
                <li><b>Pegar desde Texto:</b> Pega una lista de códigos de ítem separados por espacios o saltos de línea.</li>
                <li><b>Subir Archivo:</b> Carga un archivo de texto, CSV o Excel. Debes especificar en qué columna está el código del ítem.</li>
                <li><b>Escanear UPC:</b> Usa la cámara para escanear códigos de barra UPC. El sistema los convertirá al código de ítem correspondiente.</li>
             </ul>`
        );
    });

    DOM.buttons.mostrarItemsFiltrados.addEventListener('click', handleMostrarItemsFiltrados);
}


// --- FUNCIONES PARA MANEJAR MODALES (CORREGIDAS) ---
function openItemDetailModal(idItem) {
    const item = listaFoco.get(idItem) ?? coincidencias.get(idItem);
    
    if (item) {
        DOM.modal.codigo.textContent = "ID Ítem: " + (item.codigo || 'N/A');
        DOM.modal.descripcion.textContent = item.descripcion || 'No disponible';
        DOM.modal.upc.textContent = item.upc || 'No disponible';
        DOM.modal.brand.textContent = item.brand || 'No disponible';
        DOM.modal.department.textContent = item.department || 'No disponible';
        DOM.modal.uom.textContent = item.uom || 'No disponible';
        DOM.modal.barcodeSvgContainer.innerHTML = '';

        const barcodeValue = (item.upc && String(item.upc).trim().length > 0) ? String(item.upc).trim() : item.codigo;
        if (barcodeValue) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            try {
                JsBarcode(svg, barcodeValue, { format: "CODE128", width: 2, height: 50, displayValue: true, margin: 10 });
                DOM.modal.barcodeSvgContainer.appendChild(svg);
            } catch (e) {
                DOM.modal.barcodeSvgContainer.innerHTML = `<p style="color:red; font-size:0.8em;">Error al generar código de barras.</p>`;
            }
        }

        const imageUrl = item.url?.trim();
        if (imageUrl) {
            DOM.modal.image.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
            DOM.modal.image.style.display = 'block';
            DOM.modal.imageError.style.display = 'none';
        } else {
            DOM.modal.image.style.display = 'none';
            DOM.modal.imageError.style.display = 'block';
        }
        
        // --- CORRECCIÓN CLAVE ---
        // Se quita la clase y se fuerza el display para anular cualquier CSS conflictivo.
        DOM.views.itemDetailModal.classList.remove('hidden');
        DOM.views.itemDetailModal.style.display = 'flex'; 
    } else {
        console.error(`Error: No se encontraron datos para el ID "${idItem}". El modal no se puede abrir.`);
        showToast("Ítem no encontrado para mostrar detalles.", 'error');
    }
}

function closeItemDetailModal() {
    // --- CORRECCIÓN CLAVE ---
    // Se añade la clase y se fuerza la ocultación del display.
    DOM.views.itemDetailModal.classList.add('hidden');
    DOM.views.itemDetailModal.style.display = 'none'; 
    
    // Limpieza del modal
    DOM.modal.image.src = "#";
    DOM.modal.barcodeSvgContainer.innerHTML = '';
}

function openHelpModal(title, bodyHtml) {
    DOM.modal.helpTitle.textContent = title;
    DOM.modal.helpBody.innerHTML = bodyHtml;
    // --- CORRECCIÓN CLAVE ---
    DOM.views.helpModal.classList.remove('hidden');
    DOM.views.helpModal.style.display = 'flex';
}

function closeHelpModal() {
    // --- CORRECCIÓN CLAVE ---
    DOM.views.helpModal.classList.add('hidden');
    DOM.views.helpModal.style.display = 'none';
}


// --- Resto de las funciones (sin cambios relevantes para este problema) ---

function cleanText(text) { return text ? String(text).trim() : ''; }

async function parsearMaestraXLSX(arrayBuffer) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) throw new Error("Archivo XLSX de Maestra sin hojas.");
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, rawNumbers: false, defval: null });
    if (jsonData.length === 0) return [];
    const headersRow = jsonData[0].map(h => cleanText(h || '').toLowerCase());
    const dataRows = jsonData.slice(1);
    const expectedHeaders = ['department', 'item', 'upc', 'descripcion', 'brand', 'uom', 'quantity', 'url'];
    const headerMap = {};
    expectedHeaders.forEach(eh => {
        const idx = headersRow.indexOf(eh);
        if (idx !== -1) headerMap[eh] = idx;
    });
    if (headerMap['item'] === undefined) {
        throw new Error("Columna 'item' (ID de ítem) no encontrada en el archivo XLSX de la maestra.");
    }
    const itemsArray = dataRows.map(row => {
        if (!row || row.every(cell => cell === null || cell === '')) return null;
        const item = {};
        item.department = cleanText(row[headerMap['department']]);
        item.codigo = cleanText(row[headerMap['item']]);
        item.upc = cleanText(row[headerMap['upc']]);
        item.descripcion = cleanText(row[headerMap['descripcion']]);
        item.brand = cleanText(row[headerMap['brand']]);
        item.uom = cleanText(row[headerMap['uom']]) || cleanText(row[headerMap['quantity']]);
        item.url = cleanText(row[headerMap['url']]);
        if (!item.codigo) return null;
        return item;
    }).filter(Boolean);
    return itemsArray;
}

function rebuildUpcToCodigoMap() {
    upcToCodigoMap.clear();
    listaFoco.forEach(item => {
        if (item.upc?.trim()) {
            upcToCodigoMap.set(item.upc.trim(), item.codigo);
        }
    });
}

async function cargarMaestraDesdeRepositorio() {
    if (!URL_LISTA_MAESTRA_REPOSITORIO || URL_LISTA_MAESTRA_REPOSITORIO.includes('PON_AQUI_LA_URL')) {
        return null;
    }
    try {
        const response = await fetch(`${URL_LISTA_MAESTRA_REPOSITORIO}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const itemsArray = await parsearMaestraXLSX(arrayBuffer);
        const nuevaListaMap = new Map();
        itemsArray.forEach(item => {
            const idItemLimpio = cleanCode(item.codigo);
            if (idItemLimpio) nuevaListaMap.set(idItemLimpio, item);
        });
        return nuevaListaMap;
    } catch (error) {
        return null;
    }
}

function compararListas(listaLocalMap, listaRemotaMap) {
    const nuevos = [], eliminados = [], modificados = [];
    listaRemotaMap.forEach((itemRemoto, codigo) => {
        if (!listaLocalMap.has(codigo)) {
            nuevos.push(itemRemoto);
        } else {
            const itemLocal = listaLocalMap.get(codigo);
            const changedFields = {};
            if ((itemLocal.department ?? '') !== (itemRemoto.department ?? '')) changedFields.department = { old: itemLocal.department, new: itemRemoto.department };
            if ((itemLocal.uom ?? '') !== (itemRemoto.uom ?? '')) changedFields.uom = { old: itemLocal.uom, new: itemRemoto.uom };
            if ((itemLocal.descripcion ?? '') !== (itemRemoto.descripcion ?? '')) changedFields.descripcion = { old: itemLocal.descripcion, new: itemRemoto.descripcion };
            if ((itemLocal.upc ?? '') !== (itemRemoto.upc ?? '')) changedFields.upc = { old: itemLocal.upc, new: itemRemoto.upc };
            if ((itemLocal.brand ?? '') !== (itemRemoto.brand ?? '')) changedFields.brand = { old: itemLocal.brand, new: itemRemoto.brand };
            if ((itemLocal.url ?? '') !== (itemRemoto.url ?? '')) changedFields.url = { old: itemLocal.url, new: itemRemoto.url };
            if (Object.keys(changedFields).length > 0) {
                modificados.push({ ...itemRemoto, changedFields });
            }
        }
    });
    listaLocalMap.forEach((itemLocal, codigo) => {
        if (!listaRemotaMap.has(codigo)) eliminados.push(itemLocal);
    });
    return { nuevos, eliminados, modificados };
}

function mostrarConfirmacionCambios(nuevos, eliminados, modificados, maestraRepositorioMap) {
    const popularListaResumen = (ul, items, fmt) => {
        ul.innerHTML = items.length > 0 ? items.map(fmt).join('') : '<li>Ninguno</li>';
    };
    const itemFormatter = itm => `<li><span class="code">${itm.codigo}</span>: ${itm.descripcion??'N/A'}</li>`;
    popularListaResumen(DOM.resumenCambios.nuevos, nuevos, itemFormatter);
    popularListaResumen(DOM.resumenCambios.eliminados, eliminados, itemFormatter);
    popularListaResumen(DOM.resumenCambios.modificados, modificados, itm => {
        let chgs = Object.entries(itm.changedFields).map(([key, val]) => 
            `<span class="field-change">${key}: <s>${val.old??'N/A'}</s> &rarr; ${val.new??'N/A'}</span>`
        ).join('');
        return `<li><span class="code">${itm.codigo}</span>${chgs}</li>`;
    });
    DOM.buttons.confirmarCambios.dataset.maestraRepositorio = JSON.stringify(maestraRepositorioMap, (key, value) => {
        if (value instanceof Map) return { __isMap__: true, data: Array.from(value.entries()) };
        return value;
    });
    navigateToView('confirmacionCambiosStep');
}

async function checkInitialState() {
    loadListaFocoFromStorage(false);
    listaFocoCacheadaLocalmente = new Map(listaFoco);
    DOM.displays.panelInicioInfo.innerHTML = '🔄 Sincronizando Maestra desde el repositorio...';
    const maestraDesdeRepositorio = await cargarMaestraDesdeRepositorio();
    DOM.buttons.iniciarDobleControl.disabled = false;
    DOM.buttons.gestionMaestra.disabled = false;
    if (maestraDesdeRepositorio) {
        const { nuevos, eliminados, modificados } = compararListas(listaFocoCacheadaLocalmente, maestraDesdeRepositorio);
        if (nuevos.length === 0 && eliminados.length === 0 && modificados.length === 0) {
            DOM.displays.panelInicioInfo.innerHTML = `✅ Maestra Sincronizada (${listaFoco.size} ítems). Ya estaba actualizada.`;
            showToast(`Maestra Sincronizada (${listaFoco.size} ítems).`, 'success');
        } else {
            DOM.displays.panelInicioInfo.innerHTML = `ℹ️ Cambios detectados en Maestra. Revisa y confirma.`;
            showToast(`Cambios detectados en Maestra. Revisa y confirma.`, 'warning');
            mostrarConfirmacionCambios(nuevos, eliminados, modificados, maestraDesdeRepositorio);
            return;
        }
    } else {
        if (listaFoco.size > 0) {
            DOM.displays.panelInicioInfo.innerHTML = `⚠️ Error al cargar desde repositorio. Usando Maestra local (${listaFoco.size} ítems).`;
            showToast(`Error al cargar desde repositorio. Usando Maestra local (${listaFoco.size} ítems).`, 'warning');
        } else {
            DOM.displays.panelInicioInfo.innerHTML = `❌ Error al cargar y no hay Maestra local. Funcionalidad limitada.`;
            DOM.buttons.iniciarDobleControl.disabled = true;
            DOM.buttons.gestionMaestra.disabled = true;
            showToast(`Error al cargar y no hay Maestra local.`, 'error');
        }
    }
    rebuildUpcToCodigoMap();
    updateFocoPreviewAndSearch();
    if(DOM.views.confirmacionCambiosStep.classList.contains('hidden')){
        navigateToView('panelInicio');
    }
}

function navigateToView(viewName) {
    Object.values(DOM.views).forEach(div => {
        if (div.id !== 'itemDetailModal' && div.id !== 'helpModal') {
            div.classList.add('hidden');
        }
    });
    const viewToShow = DOM.views[viewName];
    if (viewToShow) {
        viewToShow.classList.remove('hidden');
    }
}

function cleanCode(code) {
    if (typeof code !== 'string' && typeof code !== 'number') return '';
    return String(code).trim().replace(/[^a-zA-Z0-9\-]+/g, '').toUpperCase();
}
function resetFileInput(el) { if(el) el.value = null; }

function updateFocoPreviewAndSearch() {
    let ppsCount = 0, acpCount = 0;
    const uniqueDepartments = new Set();
    listaFoco.forEach(item => {
        const department = item.department?.trim();
        if (department) {
            uniqueDepartments.add(department);
            const deptNum = parseInt(department, 10);
            if (!isNaN(deptNum)) {
                ([90, 91, 97].includes(deptNum)) ? ppsCount++ : acpCount++;
            }
        }
    });

    DOM.stats.itemsBySegment.innerHTML = `<li>ACP: ${acpCount} ítems</li><li>PPS: ${ppsCount} ítems</li>`;

    const currentDept = DOM.filters.department.value;
    DOM.filters.department.innerHTML = '<option value="">Todos los Departamentos</option>';
    Array.from(uniqueDepartments).sort((a, b) => parseInt(a) - parseInt(b)).forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = `Departamento ${dept}`;
        DOM.filters.department.appendChild(option);
    });
    DOM.filters.department.value = currentDept;

    const filteredResults = getFilteredItems();
    DOM.displays.focoSearchResults.innerHTML = ''; 
    DOM.displays.filteredItemsDisplay.innerHTML = ''; 

    if (filteredResults.length > 0) {
        const fragment = document.createDocumentFragment();
        filteredResults.slice(0, 30).forEach(item => {
            const p = document.createElement('div');
            p.className = 'search-result-item';
            p.dataset.iditem = item.codigo;
            p.innerHTML = `<span class="code">${item.codigo}</span> <span class="upc-brand-url">(Depto: ${item.department??'N/A'})</span> <span class="desc">${item.descripcion??'(S/D)'}</span>`;
            fragment.appendChild(p);
        });
        DOM.displays.focoSearchResults.appendChild(fragment);
        if (filteredResults.length > 30) {
            DOM.displays.focoSearchResults.innerHTML += `<p style="text-align:center; font-style:italic;">... y ${filteredResults.length - 30} más.</p>`;
        }
    } else if (DOM.inputs.searchFoco.value || DOM.filters.department.value || DOM.filters.segment.value) {
        DOM.displays.focoSearchResults.innerHTML = '<p style="text-align:center;">No se encontraron ítems con los filtros aplicados.</p>';
    } else {
        DOM.displays.focoSearchResults.innerHTML = '<p style="text-align:center;">Ingrese un término para buscar o use los filtros.</p>';
    }
}

function getFilteredItems() {
    const rawSearchTerm = DOM.inputs.searchFoco.value.toLowerCase().trim();
    const searchTerms = rawSearchTerm.split(/[\s,.;:\-]+/).filter(Boolean);
    const selectedDepartment = DOM.filters.department.value;
    const selectedSegment = DOM.filters.segment.value;

    return Array.from(listaFoco.values()).filter(item => {
        const matchesSearch = searchTerms.length === 0 || searchTerms.some(term =>
            (item.codigo?.toLowerCase().includes(term)) ||
            (item.upc?.toLowerCase().includes(term)) ||
            (item.descripcion?.toLowerCase().includes(term)) ||
            (item.brand?.toLowerCase().includes(term))
        );
        const matchesDepartment = !selectedDepartment || item.department === selectedDepartment;
        let matchesSegment = true;
        if (selectedSegment) {
            const deptNum = parseInt(item.department, 10);
            if (selectedSegment === "PPS") {
                matchesSegment = [90, 91, 97].includes(deptNum);
            } else if (selectedSegment === "ACP") {
                matchesSegment = !isNaN(deptNum) && ![90, 91, 97].includes(deptNum);
            }
        }
        return matchesSearch && matchesDepartment && matchesSegment;
    });
}

function handleMostrarItemsFiltrados() {
    const results = getFilteredItems();
    if (results.length > 0) {
        listaVerificar.clear();
        datosVerificacionCargados = [];
        results.forEach(item => {
            listaVerificar.add(item.codigo);
            datosVerificacionCargados.push({
                idItem: item.codigo,
                contenedora: 'N/A_FILTRO',
                cantidad: 0,
                allRowData: { item_: item.codigo },
                isSuitableForGroupedReport: false
            });
        });
        updateVerifyPreview();
        showToast(`Se cargaron ${results.length} ítems filtrados para verificación.`, 'success');
        navigateToView('dobleControlStep');
    } else {
        showToast('No se encontraron ítems con los filtros actuales.', 'warning');
    }
}


function saveListaFocoToStorage(showAlert = true) {
    if (listaFoco.size === 0 && showAlert && !confirm("Maestra vacía. ¿Guardar vacía?")) return false;
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_LISTA_FOCO, JSON.stringify(Array.from(listaFoco.values())));
        if (showAlert) showToast(`Maestra con ${listaFoco.size} ítems guardada.`, 'success');
        return true;
    } catch (e) {
        if (showAlert) showToast(`Error al guardar Maestra: ${e.message}`, 'error');
        return false;
    }
}

function loadListaFocoFromStorage(showAlerts = true) {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_LISTA_FOCO);
    listaFoco.clear();
    if (data) {
        try {
            const itemsArray = JSON.parse(data);
            itemsArray.forEach(item => {
                const idItemLimpio = cleanCode(item.codigo);
                if (idItemLimpio) listaFoco.set(idItemLimpio, item);
            });
            if (showAlerts) showToast(`Maestra local con ${listaFoco.size} ítems cargada.`, 'info');
        } catch (e) {
            if (showAlerts) showToast("Error al cargar Maestra: datos corruptos. Se borrará.", 'error');
            localStorage.removeItem(LOCAL_STORAGE_KEY_LISTA_FOCO);
        }
    }
}

async function handleMasterFileUpload() {
    const file = DOM.inputs.masterFileExcelUpload.files[0];
    if (!file) return;
    DOM.displays.panelInicioInfo.innerHTML = `🔄 Cargando "${file.name}"...`;
    DOM.buttons.uploadLocalMaestra.disabled = true;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const itemsArray = await parsearMaestraXLSX(e.target.result);
            const nuevaListaMap = new Map();
            itemsArray.forEach(item => {
                const idItemLimpio = cleanCode(item.codigo);
                if (idItemLimpio) nuevaListaMap.set(idItemLimpio, item);
            });
            listaFoco = nuevaListaMap;
            rebuildUpcToCodigoMap();
            saveListaFocoToStorage(true);
            updateFocoPreviewAndSearch();
            DOM.displays.panelInicioInfo.innerHTML = `✅ Maestra local "${file.name}" cargada (${listaFoco.size} ítems).`;
            resetFileInput(DOM.inputs.masterFileExcelUpload);
        } catch (error) {
            DOM.displays.panelInicioInfo.innerHTML = `❌ Error al cargar "${file.name}": ${error.message}`;
            showToast(`Error al cargar el archivo de Maestra: ${error.message}`, 'error');
        } finally {
            DOM.buttons.uploadLocalMaestra.disabled = false;
        }
    };
    reader.readAsArrayBuffer(file);
}

function handleVerifyFileUpload(file, fileType) {
    if (!file) return;
    DOM.displays.verifyPreview.innerHTML = `Procesando "${file.name}"...`;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let parsedItems = [];
            if (fileType === 'excel') {
                const idItemColUserInput = parseInt(DOM.inputs.verifyCodigoCol.value);
                const hasHeader = DOM.inputs.verifyHasHeader.checked;
                parsedItems = processExcelDataForVerify(e.target.result, idItemColUserInput, hasHeader);
            } else {
                const colIdx = parseInt(DOM.inputs.verifyCodigoCol.value) - 1;
                const hasHeader = DOM.inputs.verifyHasHeader.checked;
                const delimiter = DOM.inputs.verifyCsvDelimiter.value;
                const itemIdsOnly = processTextCsvDataForVerify(e.target.result, colIdx, hasHeader, delimiter);
                parsedItems = itemIdsOnly.map(id => ({
                    idItem: id,
                    contenedora: 'N/A_TXT_CSV',
                    cantidad: 0,
                    isSuitableForGroupedReport: false
                }));
            }
            parsedItems.forEach(itemObj => {
                const trimmedIdItem = cleanCode(itemObj.idItem);
                if (trimmedIdItem && /^[0-9]+$/.test(trimmedIdItem) && trimmedIdItem.length > 5) {
                    listaVerificar.add(trimmedIdItem);
                    datosVerificacionCargados.push({...itemObj, idItem: trimmedIdItem });
                }
            });
            updateVerifyPreview();
            showToast(`Archivo "${file.name}" procesado. ${parsedItems.length} ítems cargados.`, 'success');
        } catch (error) {
            showToast(`Error procesando ${file.name}: ${error.message}`, 'error');
        }
        resetFileInput(fileType === 'excel' ? DOM.inputs.verifyFileExcel : DOM.inputs.verifyFileTxtCsv);
    };
    if (fileType === 'excel') reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
}

function processTextCsvDataForVerify(content, colIdx, hasHeader, delimiter = ',') {
    const lines = content.split(/\r\n|\n/);
    const dataRows = hasHeader ? lines.slice(1) : lines;
    const delimRegex = new RegExp(delimiter.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    return dataRows.map(line => line.split(delimRegex)[colIdx]?.trim()).filter(Boolean);
}

function processExcelDataForVerify(arrayBuffer, itemColIdxUser, hasHeader) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) throw new Error("Excel sin hojas.");
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, rawNumbers: false, defval: null });
    if (jsonData.length === 0) return [];
    let headerRow = hasHeader ? jsonData[0]?.map(h => h?.toString().toLowerCase().trim() || '') : [];
    let dataRows = hasHeader ? jsonData.slice(1) : jsonData;
    let actualItemColIdx = headerRow.indexOf('item_');
    if (actualItemColIdx === -1) actualItemColIdx = itemColIdxUser - 1;
    if (actualItemColIdx < 0) throw new Error(`Columna de ítem no encontrada.`);

    const contenedoraColIdx = headerRow.indexOf('contenedoras');
    const cantidadColIdx = headerRow.indexOf('cantidad');
    const isSuitableForGroupedReport = contenedoraColIdx !== -1 && cantidadColIdx !== -1;

    return dataRows.map(row => {
        if (!row || row.every(cell => cell == null)) return null;
        const idItem = row[actualItemColIdx]?.toString().trim();
        const contenedora = row[contenedoraColIdx]?.toString().trim() || 'N/A';
        const cantidad = parseFloat(row[cantidadColIdx]?.toString().replace(',', '.')) || 0;
        return { idItem, contenedora, cantidad, isSuitableForGroupedReport };
    }).filter(item => item && item.idItem);
}

function updateVerifyPreview() {
    const count = listaVerificar.size;
    DOM.displays.verifyPreview.textContent = `Ítems a Verificar: ${count}. ${count > 0 ? `Primeros: ${[...listaVerificar].slice(0,5).join(', ')}...` : 'Vacía.'}`;
}

function collectVerifyDataFromInputs() {
    const textVerifyItems = DOM.inputs.verifyTextarea.value.trim();
    if (textVerifyItems) {
        textVerifyItems.split(/\s+/).forEach(id => {
            const trimmedIdItem = String(id).trim();
            if (/^[0-9]+$/.test(trimmedIdItem) && trimmedIdItem.length > 5) {
                listaVerificar.add(trimmedIdItem);
                if (!datosVerificacionCargados.some(d => d.idItem === trimmedIdItem && d.contenedora === 'N/A_TEXTAREA')) {
                    datosVerificacionCargados.push({ idItem: trimmedIdItem, contenedora: 'N/A_TEXTAREA', cantidad: 0, isSuitableForGroupedReport: false });
                }
            }
        });
    }
    updateVerifyPreview();
}

function onScanSuccessVerify(decodedText){
    const scannedUPC = cleanText(decodedText);
    const internalCode = upcToCodigoMap.get(scannedUPC);
    if (internalCode) {
        if (!listaVerificar.has(internalCode)) {
            listaVerificar.add(internalCode);
            datosVerificacionCargados.push({ idItem: internalCode, contenedora: 'N/A_SCANNER', cantidad: 0, isSuitableForGroupedReport: false });
            DOM.inputs.scannedCodesVerifyTextarea.value += (DOM.inputs.scannedCodesVerifyTextarea.value ? '\n' : '') + internalCode;
            updateVerifyPreview();
            showToast(`UPC escaneado agregado como ID ${internalCode}.`, 'success');
        } else {
            showToast(`El ítem ${internalCode} ya fue agregado.`, 'info');
        }
    } else {
        showToast(`UPC escaneado (${scannedUPC}) no encontrado en Maestra.`, 'warning');
    }
}

function toggleScanner() {
    if(scannerVerifierActive){
        if(html5QrCodeVerifier?.isScanning) html5QrCodeVerifier.stop();
        scannerVerifierActive = false;
        DOM.displays.scannerContainerVerify.classList.add('hidden');
        DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
    } else {
        if(location.protocol !=='https:' && !['localhost','127.0.0.1'].includes(location.hostname)){
            showToast('Escáner requiere HTTPS o localhost.', 'error'); return;
        }
        DOM.displays.scannerContainerVerify.classList.remove('hidden');
        DOM.buttons.startScanVerify.textContent = '🛑 Detener Escáner';
        if(!html5QrCodeVerifier) html5QrCodeVerifier = new Html5Qrcode("readerVerify", { verbose: false });
        html5QrCodeVerifier.start({ facingMode: "environment" }, { fps: 10, qrbox: {width: 250, height: 150} }, onScanSuccessVerify, () => {})
        .then(() => scannerVerifierActive = true)
        .catch(err => {
            showToast(`Error al iniciar escáner: ${err.message || err}`, 'error');
            DOM.displays.scannerContainerVerify.classList.add('hidden');
            DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
        });
    }
}

function compareListsAndDisplayResults(){
    coincidencias.clear();
    listaVerificar.forEach(id => {
        if(listaFoco.has(id)) coincidencias.set(id, listaFoco.get(id));
    });
    displayFinalResults();
}

function displayFinalResults() {
    DOM.stats.totalFoco.textContent = listaFoco.size;
    DOM.stats.totalVerify.textContent = listaVerificar.size;
    DOM.stats.totalMatches.textContent = coincidencias.size;
    DOM.displays.outputResults.innerHTML = '';
    DOM.displays.outputResults.className = 'list';
    if (coincidencias.size === 0) {
        DOM.displays.outputResults.innerHTML = '<p>No se encontraron Ítems concordantes.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    coincidencias.forEach(item => {
        const cD = document.createElement("div");
        cD.className = "barcode-item-container";
        cD.dataset.iditem = item.codigo;
        cD.innerHTML = `<p class="barcode-item-code">${item.codigo}</p><p class="barcode-item-desc">${item.descripcion}</p><div class="barcode-item-svg"></div>`;
        const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        try { JsBarcode(svg, item.codigo, {format:"CODE128",width:2,height:50,displayValue:false,margin:5}); cD.querySelector('.barcode-item-svg').appendChild(svg); }
        catch(e) { cD.querySelector('.barcode-item-svg').innerHTML=`<p style="color:red;">Error BC</p>`; }
        fragment.appendChild(cD);
    });
    DOM.displays.outputResults.appendChild(fragment);
    setResultsLayoutByDevice();
}

function handleIniciarDobleControl() {
    if (listaFoco.size === 0) { showToast("No hay Lista Maestra cargada.", 'warning'); return; }
    listaVerificar.clear(); datosVerificacionCargados = []; coincidencias.clear();
    DOM.inputs.verifyTextarea.value = ''; DOM.inputs.scannedCodesVerifyTextarea.value = '';
    resetFileInput(DOM.inputs.verifyFileTxtCsv); resetFileInput(DOM.inputs.verifyFileExcel);
    updateVerifyPreview();
    navigateToView('dobleControlStep');
}

function handleBorrarStorage() {
    if (confirm("¿Borrar Maestra local y resincronizar?")) {
        localStorage.removeItem(LOCAL_STORAGE_KEY_LISTA_FOCO);
        listaFoco.clear();
        showToast("Maestra local borrada. Resincronizando...", 'info');
        checkInitialState();
    }
}

function handleCompare() {
    collectVerifyDataFromInputs();
    if (listaVerificar.size === 0) { showToast("Cargue o escanee Ítems para verificar.", 'warning'); return; }
    if (listaFoco.size === 0) { showToast("Lista Maestra vacía.", 'error'); return; }
    compareListsAndDisplayResults();
    navigateToView('resultadosStep');
}

function toggleResultsLayout(){
    DOM.displays.outputResults.classList.toggle('grid');
    DOM.displays.outputResults.classList.toggle('list');
    DOM.buttons.layoutToggle.textContent = DOM.displays.outputResults.classList.contains('grid') ? '📊 Vista Lista' : '📊 Vista Cuadrícula';
}

function setResultsLayoutByDevice() {
    const isMobile = window.innerWidth < 768;
    DOM.displays.outputResults.classList.toggle('list', isMobile);
    DOM.displays.outputResults.classList.toggle('grid', !isMobile);
    DOM.buttons.layoutToggle.textContent = isMobile ? '📊 Vista Cuadrícula' : '📊 Vista Lista';
}

function downloadCsvResults(){
    if(coincidencias.size===0) return;
    let csvContent="ID_Item,Departamento,UPC,Descripcion,Marca,URL_Imagen,UOM_Maestra\n";
    coincidencias.forEach(item=>{
        const esc = (v) => `"${(v??'').replace(/"/g,'""')}"`;
        csvContent+=`${esc(item.codigo)},${esc(item.department)},${esc(item.upc)},${esc(item.descripcion)},${esc(item.brand)},${esc(item.url)},${esc(item.uom)}\n`;
    });
    const blob = new Blob(["\uFEFF"+csvContent],{type:'text/csv;charset=utf-8;'});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `concordancias_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

async function downloadXlsxResults() {
    if (coincidencias.size === 0) { showToast("No hay ítems para exportar.", 'warning'); return; }
    const btn = DOM.buttons.downloadXlsx;
    btn.textContent = 'Generando...'; btn.disabled = true;
    try {
        const dataForSheet = [];
        dataForSheet.push(["Informe de Verificación por Contenedora"]);
        dataForSheet.push([`Fecha: ${new Date().toLocaleDateString("es-CL")}`]);
        dataForSheet.push([]);
        
        const groupedByContainer = new Map();
        datosVerificacionCargados.forEach(item => {
            if (coincidencias.has(item.idItem)) {
                if (!groupedByContainer.has(item.contenedora)) groupedByContainer.set(item.contenedora, []);
                groupedByContainer.get(item.contenedora).push({
                    ...coincidencias.get(item.idItem),
                    cantidadCargada: item.cantidad
                });
            }
        });
        
        groupedByContainer.forEach((items, container) => {
            dataForSheet.push([`Contenedora: ${container}`]);
            items.forEach(item => {
                dataForSheet.push(["ID Ítem:", item.codigo]);
                dataForSheet.push(["Descripción:", item.descripcion]);
                dataForSheet.push(["Marca:", item.brand]);
                dataForSheet.push(["Cantidad Cargada:", item.cantidadCargada]);
                dataForSheet.push(["Revisado:", "☐"]);
                dataForSheet.push([]);
            });
        });
        
        const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Informe");
        XLSX.writeFile(wb, `Informe_Doble_Control_${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast("Informe XLSX descargado.", 'success');
    } catch (error) {
        showToast(`Error al generar XLSX: ${error.message}`, 'error');
    } finally {
        btn.textContent = '📊 Descargar XLSX'; btn.disabled = false;
    }
}

function handleNewVerification() {
    if (confirm("¿Iniciar un nuevo Doble Control?")) {
        listaVerificar.clear();
        datosVerificacionCargados = [];
        coincidencias.clear();
        DOM.inputs.verifyTextarea.value = '';
        DOM.inputs.scannedCodesVerifyTextarea.value = '';
        updateVerifyPreview();
        if (scannerVerifierActive) toggleScanner();
        navigateToView('dobleControlStep');
    }
}
