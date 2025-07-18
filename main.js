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
        // CAMBIO: department ya no es un select, sino el contenedor de checkboxes
        departmentContainer: $('departmentFilterContainer'),
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
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

function addEventListeners() {
    DOM.views.itemDetailModal.addEventListener('click', (event) => {
        if (event.target === DOM.views.itemDetailModal || event.target.id === 'closeItemDetailModal') {
            closeItemDetailModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !DOM.views.itemDetailModal.classList.contains('hidden')) {
            closeItemDetailModal();
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
        searchDebounceTimeout = setTimeout(updateFocoPreviewAndSearch, 250);
    });
    
    // CAMBIO: Listeners para los nuevos filtros
    DOM.filters.segment.addEventListener('change', updateFocoPreviewAndSearch);
    DOM.filters.departmentContainer.addEventListener('change', updateFocoPreviewAndSearch);

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
        if (itemContainer?.dataset.iditem) openItemDetailModal(itemContainer.dataset.iditem);
    });
    DOM.displays.focoSearchResults.addEventListener('click', (event) => {
        const itemContainer = event.target.closest('.search-result-item');
        if (itemContainer?.dataset.iditem) openItemDetailModal(itemContainer.dataset.iditem);
    });

    DOM.buttons.confirmarCambios.addEventListener('click', () => {
        const maestraRepositorioMap = JSON.parse(DOM.buttons.confirmarCambios.dataset.maestraRepositorio || '{}', (key, value) => {
            if (typeof value === 'object' && value !== null && value.__isMap__) return new Map(value.data);
            return value;
        });
        if (maestraRepositorioMap?.size > 0) {
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
        showToast(`Cambios del repositorio ignorados.`, 'info');
        navigateToView('panelInicio');
    });

    DOM.buttons.helpGestionMaestra.addEventListener('click', () => {
        openHelpModal('Ayuda: Gestión de Lista Maestra', `...`);
    });
    DOM.buttons.helpDobleControl.addEventListener('click', () => {
        openHelpModal('Ayuda: Cargar Lista de Verificación', `...`);
    });
    DOM.buttons.closeHelpModal.addEventListener('click', closeHelpModal);
    DOM.views.helpModal.addEventListener('click', (event) => {
        if (event.target === DOM.views.helpModal) closeHelpModal();
    });

    DOM.buttons.mostrarItemsFiltrados.addEventListener('click', handleMostrarItemsFiltradosYVerificar);
}

// --- FUNCIONES DE MODAL (YA CORREGIDAS) ---
function openItemDetailModal(idItem) {
    let item = listaFoco.get(idItem) ?? coincidencias.get(idItem);
    if (!item) {
        const filteredItems = getFilteredItems();
        item = filteredItems.find(i => i.codigo === idItem);
    }
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
        DOM.views.itemDetailModal.classList.remove('hidden');
        DOM.views.itemDetailModal.style.display = 'flex';
    } else {
        showToast("Ítem no encontrado para mostrar detalles.", 'error');
    }
}

function closeItemDetailModal() {
    DOM.views.itemDetailModal.classList.add('hidden');
    DOM.views.itemDetailModal.style.display = 'none';
    DOM.modal.image.src = "#";
    DOM.modal.barcodeSvgContainer.innerHTML = '';
}

function openHelpModal(title, bodyHtml) {
    DOM.modal.helpTitle.textContent = title;
    DOM.modal.helpBody.innerHTML = bodyHtml;
    DOM.views.helpModal.classList.remove('hidden');
    DOM.views.helpModal.style.display = 'flex';
}

function closeHelpModal() {
    DOM.views.helpModal.classList.add('hidden');
    DOM.views.helpModal.style.display = 'none';
}

// ... (El resto de las funciones como parsearMaestraXLSX, etc., permanecen igual) ...

// CAMBIO: Esta función ahora se encarga de toda la lógica de filtros
function updateFocoPreviewAndSearch() {
    let ppsCount = 0;
    let acpCount = 0;
    const allDepartments = new Set();
    const departmentsInSegment = new Set();
    const selectedSegment = DOM.filters.segment.value;

    // 1. Determinar qué departamentos mostrar en el filtro
    listaFoco.forEach(item => {
        const department = item.department?.trim();
        if (department) {
            allDepartments.add(department);
            const deptNum = parseInt(department, 10);
            if (!isNaN(deptNum)) {
                if ([90, 91, 97].includes(deptNum)) {
                    ppsCount++;
                    if (selectedSegment === "PPS" || selectedSegment === "") {
                        departmentsInSegment.add(department);
                    }
                } else {
                    acpCount++;
                    if (selectedSegment === "ACP" || selectedSegment === "") {
                        departmentsInSegment.add(department);
                    }
                }
            }
        }
    });

    DOM.stats.itemsBySegment.innerHTML = `<li>ACP: ${acpCount} ítems</li><li>PPS: ${ppsCount} ítems</li>`;

    // 2. Poblar el filtro de departamentos con checkboxes
    const departmentContainer = DOM.filters.departmentContainer;
    departmentContainer.innerHTML = ''; // Limpiar
    Array.from(departmentsInSegment).sort((a, b) => parseInt(a) - parseInt(b)).forEach(dept => {
        const checkboxId = `dept-checkbox-${dept}`;
        const label = document.createElement('label');
        label.setAttribute('for', checkboxId);
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = dept;
        checkbox.dataset.dept = dept;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${dept}`));
        departmentContainer.appendChild(label);
    });

    // 3. Obtener resultados y mostrarlos
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
    } else if (DOM.inputs.searchFoco.value || selectedSegment || document.querySelectorAll('#departmentFilterContainer input:checked').length > 0) {
        DOM.displays.focoSearchResults.innerHTML = '<p style="text-align:center;">No se encontraron ítems con los filtros aplicados.</p>';
    } else {
        DOM.displays.focoSearchResults.innerHTML = '<p style="text-align:center;">Ingrese un término para buscar o use los filtros.</p>';
    }
}

// CAMBIO: getFilteredItems ahora lee los checkboxes
function getFilteredItems() {
    const rawSearchTerm = DOM.inputs.searchFoco.value.toLowerCase().trim();
    const searchTerms = rawSearchTerm.split(/[\s,.;:\-]+/).filter(Boolean);
    const selectedSegment = DOM.filters.segment.value;
    
    // Obtener todos los departamentos seleccionados
    const selectedDepartments = Array.from(document.querySelectorAll('#departmentFilterContainer input:checked')).map(cb => cb.value);

    return Array.from(listaFoco.values()).filter(item => {
        const matchesSearch = searchTerms.length === 0 || searchTerms.some(term =>
            (item.codigo?.toLowerCase().includes(term)) ||
            (item.upc?.toLowerCase().includes(term)) ||
            (item.descripcion?.toLowerCase().includes(term)) ||
            (item.brand?.toLowerCase().includes(term))
        );

        // Si no hay departamentos seleccionados, coincide con todos. Si hay, debe coincidir con al menos uno.
        const matchesDepartment = selectedDepartments.length === 0 || selectedDepartments.includes(item.department);

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


// CAMBIO: Esta función ahora combina el filtrado y la verificación
function handleMostrarItemsFiltradosYVerificar() {
    const results = getFilteredItems();
    if (results.length === 0) {
        showToast('No se encontraron ítems con los filtros actuales para verificar.', 'warning');
        return;
    }

    // 1. Cargar los ítems filtrados a la lista de verificación
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
    
    showToast(`${results.length} ítems filtrados cargados. Verificando...`, 'info');

    // 2. Ejecutar la comparación y mostrar resultados inmediatamente
    handleCompare();
}

// CAMBIO: displayFinalResults ahora usa UPC para el código de barras
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
        
        const descText = item.descripcion ? `<p class="barcode-item-desc">${item.descripcion}</p>` : '';
        const brandText = `<p style="font-size:0.8em;text-align:center;color:#777;">Marca: ${item.brand??'N/A'}</p>`;
        
        cD.innerHTML = `<p class="barcode-item-code">${item.codigo}</p>${descText}${brandText}<div class="barcode-item-svg"></div>`;
        
        // Lógica de barcode consistente con el modal (prioriza UPC)
        const barcodeValue = (item.upc && String(item.upc).trim().length > 0) ? String(item.upc).trim() : item.codigo;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        
        try {
            JsBarcode(svg, barcodeValue, { format: "CODE128", width: 1.5, height: 40, displayValue: false, margin: 5 });
            cD.querySelector('.barcode-item-svg').appendChild(svg);
        } catch (e) {
            cD.querySelector('.barcode-item-svg').innerHTML = `<p style="color:red;font-size:0.8em;">Error BC</p>`;
        }
        
        fragment.appendChild(cD);
    });
    
    DOM.displays.outputResults.appendChild(fragment);
    setResultsLayoutByDevice();
}

function handleCompare() {
    // Si se viene desde la carga manual, recolectar datos. Si no, ya están cargados por el filtro.
    if(listaVerificar.size === 0) {
       collectVerifyDataFromInputs();
    }
    
    if (listaVerificar.size === 0) {
        showToast("Cargue o escanee Ítems para la Lista de Verificación.", 'warning');
        return;
    }
    if (listaFoco.size === 0) {
        showToast("Lista Maestra vacía. Sincronice o cargue una localmente.", 'error');
        navigateToView('panelInicio');
        return;
    }
    
    compareListsAndDisplayResults();
    navigateToView('resultadosStep');
}

// El resto de funciones (save, load, upload, etc.) permanecen igual que en la versión anterior.
// ...
