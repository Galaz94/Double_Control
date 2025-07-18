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
        openHelpModal('Ayuda: Gestión de Lista Maestra', `<p>Esta sección te permite visualizar y gestionar la lista maestra de ítems.</p>
             <ul>
                <li><b>Buscar:</b> Ingresa uno o más términos para encontrar ítems por código, UPC, descripción o marca.</li>
                <li><b>Filtros de Segmento:</b> Puedes filtrar los ítems por ACP o PPS. Esto actualizará la lista de departamentos disponibles.</li>
                <li><b>Filtros de Departamento:</b> Marca uno o más departamentos para acotar tu búsqueda. La lista de departamentos depende del segmento que hayas elegido.</li>
                <li><b>Buscar y Verificar Ítems Filtrados:</b> Este botón toma todos los filtros activos, busca los ítems y te lleva directamente a la pantalla de resultados.</li>
             </ul>`);
    });
    DOM.buttons.helpDobleControl.addEventListener('click', () => {
        openHelpModal('Ayuda: Cargar Lista de Verificación', `<p>Aquí puedes cargar los ítems que deseas verificar contra la lista maestra.</p>
             <ul>
                <li><b>Pegar desde Texto:</b> Pega una lista de códigos de ítem separados por espacios o saltos de línea.</li>
                <li><b>Subir Archivo:</b> Carga un archivo de texto, CSV o Excel. Debes especificar en qué columna está el código del ítem.</li>
                <li><b>Escanear UPC:</b> Usa la cámara para escanear códigos de barra UPC. El sistema los convertirá al código de ítem correspondiente.</li>
             </ul>`);
    });
    DOM.buttons.closeHelpModal.addEventListener('click', closeHelpModal);
    DOM.views.helpModal.addEventListener('click', (event) => {
        if (event.target === DOM.views.helpModal) closeHelpModal();
    });

    DOM.buttons.mostrarItemsFiltrados.addEventListener('click', handleMostrarItemsFiltradosYVerificar);
}

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

function updateFocoPreviewAndSearch() {
    let ppsCount = 0;
    let acpCount = 0;
    const departmentsInSegment = new Set();
    const selectedSegment = DOM.filters.segment.value;

    listaFoco.forEach(item => {
        const department = item.department?.trim();
        if (department) {
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

    const departmentContainer = DOM.filters.departmentContainer;
    departmentContainer.innerHTML = '';
    Array.from(departmentsInSegment).sort((a, b) => parseInt(a) - parseInt(b)).forEach(dept => {
        const checkboxId = `dept-checkbox-${dept}`;
        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = dept;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${dept}`));
        departmentContainer.appendChild(label);
    });

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

function getFilteredItems() {
    const rawSearchTerm = DOM.inputs.searchFoco.value.toLowerCase().trim();
    const searchTerms = rawSearchTerm.split(/[\s,.;:\-]+/).filter(Boolean);
    const selectedSegment = DOM.filters.segment.value;
    
    const selectedDepartments = Array.from(document.querySelectorAll('#departmentFilterContainer input:checked')).map(cb => cb.value);

    return Array.from(listaFoco.values()).filter(item => {
        const matchesSearch = searchTerms.length === 0 || searchTerms.some(term =>
            (item.codigo?.toLowerCase().includes(term)) ||
            (item.upc?.toLowerCase().includes(term)) ||
            (item.descripcion?.toLowerCase().includes(term)) ||
            (item.brand?.toLowerCase().includes(term))
        );

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

function handleMostrarItemsFiltradosYVerificar() {
    const results = getFilteredItems();
    if (results.length === 0) {
        showToast('No se encontraron ítems con los filtros actuales para verificar.', 'warning');
        return;
    }

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
    handleCompare();
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
        
        const descText = item.descripcion ? `<p class="barcode-item-desc">${item.descripcion}</p>` : '';
        const brandText = `<p style="font-size:0.8em;text-align:center;color:#777;">Marca: ${item.brand??'N/A'}</p>`;
        
        cD.innerHTML = `<p class="barcode-item-code">${item.codigo}</p>${descText}${brandText}<div class="barcode-item-svg"></div>`;
        
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

// ----- El resto de funciones (checkInitialState, parseo, carga de archivos, etc.) no necesitan cambios y se omiten por brevedad -----
// ----- Debes mantener el resto de tu código como estaba -----

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
    const itemFormatter = itm => `<li><span class="code">${itm.codigo}</span>: D:${itm.descripcion??'N/A'}, U:${itm.upc??'N/A'}, Dept:${itm.department??'N/A'}, UOM:${itm.uom??'N/A'}</li>`;
    popularListaResumen(DOM.resumenCambios.nuevos, nuevos, itemFormatter);
    popularListaResumen(DOM.resumenCambios.eliminados, eliminados, itemFormatter);
    popularListaResumen(DOM.resumenCambios.modificados, modificados, itm => {
        let chgs = '';
        if(itm.changedFields.department) chgs += `<span class="field-change">Dept: <s>${itm.changedFields.department.old??'N/A'}</s> &rarr; ${itm.changedFields.department.new??'N/A'}</span>`;
        if(itm.changedFields.uom) chgs += `<span class="field-change">UOM: <s>${itm.changedFields.uom.old??'N/A'}</s> &rarr; ${itm.changedFields.uom.new??'N/A'}</span>`;
        if(itm.changedFields.descripcion) chgs += `<span class="field-change">Desc: <s>${itm.changedFields.descripcion.old??'N/A'}</s> &rarr; ${itm.changedFields.descripcion.new??'N/A'}</span>`;
        if(itm.changedFields.upc) chgs += `<span class="field-change">UPC: <s>${itm.changedFields.upc.old??'N/A'}</s> &rarr; ${itm.changedFields.upc.new??'N/A'}</span>`;
        if(itm.changedFields.brand) chgs += `<span class="field-change">Brand: <s>${itm.changedFields.brand.old??'N/A'}</s> &rarr; ${itm.changedFields.brand.new??'N/A'}</span>`;
        if(itm.changedFields.url) chgs += `<span class="field-change">URL Img: <s>${itm.changedFields.url.old??'N/A'}</s> &rarr; ${itm.changedFields.url.new??'N/A'}</span>`;
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
    DOM.displays.panelInicioInfo.className = 'panel-inicio-info info';
    DOM.buttons.iniciarDobleControl.disabled = true;
    DOM.buttons.gestionMaestra.disabled = true;
    const maestraDesdeRepositorio = await cargarMaestraDesdeRepositorio();
    DOM.buttons.iniciarDobleControl.disabled = false;
    DOM.buttons.gestionMaestra.disabled = false;
    if (maestraDesdeRepositorio) {
        const { nuevos, eliminados, modificados } = compararListas(listaFocoCacheadaLocalmente, maestraDesdeRepositorio);
        if (nuevos.length === 0 && eliminados.length === 0 && modificados.length === 0) {
            DOM.displays.panelInicioInfo.innerHTML = `✅ Maestra Sincronizada (${listaFoco.size} ítems). Ya estaba actualizada.`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info';
            const localValues = JSON.stringify(Array.from(listaFoco.values()));
            const repoValues = JSON.stringify(Array.from(maestraDesdeRepositorio.values()));
            if (localValues !== repoValues) {
                listaFoco = new Map(maestraDesdeRepositorio);
                saveListaFocoToStorage(false);
            }
            showToast(`Maestra Sincronizada (${listaFoco.size} ítems).`, 'success');
        } else {
            DOM.displays.panelInicioInfo.innerHTML = `ℹ️ Cambios detectados en Maestra. Revisa y confirma.`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info warning';
            showToast(`Cambios detectados en Maestra. Revisa y confirma.`, 'warning');
            mostrarConfirmacionCambios(nuevos, eliminados, modificados, maestraDesdeRepositorio);
            return;
        }
    } else {
        if (listaFoco.size > 0) {
            DOM.displays.panelInicioInfo.innerHTML = `⚠️ Error al cargar desde repositorio. Usando Maestra local (${listaFoco.size} ítems).`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info warning';
            showToast(`Error al cargar desde repositorio. Usando Maestra local (${listaFoco.size} ítems).`, 'warning');
        } else {
            DOM.displays.panelInicioInfo.innerHTML = `❌ Error al cargar y no hay Maestra local. Funcionalidad limitada.`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info error';
            DOM.buttons.iniciarDobleControl.disabled = true;
            DOM.buttons.gestionMaestra.disabled = true;
            showToast(`Error al cargar y no hay Maestra local. Funcionalidad limitada.`, 'error');
        }
    }
    rebuildUpcToCodigoMap();
    updateFocoPreviewAndSearch();
    if(DOM.views.confirmacionCambiosStep.classList.contains('hidden')){
        navigateToView('panelInicio');
    }
}

function navigateToView(viewName) {
    const viewToShow = DOM.views[viewName];
    if (!viewToShow) return;

    Object.values(DOM.views).forEach(div => {
        if (div.id !== 'itemDetailModal' && div.id !== 'helpModal') {
            div.classList.add('hidden');
        }
    });
    
    viewToShow.classList.remove('hidden');
}

function cleanCode(code) {
    if (typeof code !== 'string' && typeof code !== 'number') return '';
    return String(code).trim().replace(/[^a-zA-Z0-9\-]+/g, '').toUpperCase();
}
function resetFileInput(el) { if(el) el.value = null; }
function getDelimiterRegex(d) {
    if (d.toLowerCase()==='<tab>') return /\t/;
    return new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
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
    if (!file) {
        showToast("Por favor, selecciona un archivo XLSX de Maestra.", 'warning');
        return;
    }
    DOM.displays.panelInicioInfo.innerHTML = `🔄 Cargando "${file.name}" localmente...`;
    DOM.displays.panelInicioInfo.className = 'panel-inicio-info info';
    DOM.buttons.uploadLocalMaestra.disabled = true;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target.result;
            const itemsArray = await parsearMaestraXLSX(arrayBuffer);
            const nuevaListaMap = new Map();
            itemsArray.forEach(item => {
                const idItemLimpio = cleanCode(item.codigo);
                if (idItemLimpio) nuevaListaMap.set(idItemLimpio, item);
            });
            listaFoco = nuevaListaMap;
            rebuildUpcToCodigoMap();
            saveListaFocoToStorage(true);
            updateFocoPreviewAndSearch();
            DOM.displays.panelInicioInfo.innerHTML = `✅ Maestra local "${file.name}" cargada y guardada (${listaFoco.size} ítems).`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info';
            showToast(`Maestra local "${file.name}" cargada y guardada (${listaFoco.size} ítems).`, 'success');
            resetFileInput(DOM.inputs.masterFileExcelUpload);
        } catch (error) {
            DOM.displays.panelInicioInfo.innerHTML = `❌ Error al cargar "${file.name}": ${error.message}`;
            DOM.displays.panelInicioInfo.className = 'panel-inicio-info error';
            showToast(`Error al cargar el archivo de Maestra: ${error.message}`, 'error');
        } finally {
            DOM.buttons.uploadLocalMaestra.disabled = false;
        }
    };
    reader.onerror = (e) => {
        DOM.displays.panelInicioInfo.innerHTML = `❌ Error al leer "${file.name}".`;
        DOM.displays.panelInicioInfo.className = 'panel-inicio-info error';
        showToast(`Error al leer el archivo: ${file.name}`, 'error');
        DOM.buttons.uploadLocalMaestra.disabled = false;
    };
    reader.readAsArrayBuffer(file);
}

function handleVerifyFileUpload(file, fileType) {
    if (!file) return;
    DOM.displays.verifyPreview.innerHTML = `Procesando "${file.name}"...`;
    const idItemColUserInput = parseInt(DOM.inputs.verifyCodigoCol.value);
    const delimiter = DOM.inputs.verifyCsvDelimiter.value;
    const hasHeader = DOM.inputs.verifyHasHeader.checked;
    const targetFileElement = fileType === 'excel' ? DOM.inputs.verifyFileExcel : DOM.inputs.verifyFileTxtCsv;
    if (idItemColUserInput < 1 && fileType === 'textcsv') {
        showToast("Col. ID Ítem debe ser >= 1 para texto/CSV.", 'error');
        DOM.displays.verifyPreview.textContent = "Error.";
        resetFileInput(targetFileElement);
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        try {
            let parsedItems = [];
            if (fileType === 'excel') {
                parsedItems = processExcelDataForVerify(content, idItemColUserInput, hasHeader);
            } else {
                const itemIdsOnly = processTextCsvDataForVerify(content, idItemColUserInput - 1, hasHeader, delimiter);
                parsedItems = itemIdsOnly.map(id => ({
                    idItem: id,
                    contenedora: 'N/A_TXT_CSV',
                    cantidad: 0,
                    allRowData: { item_: id },
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
            DOM.displays.verifyPreview.textContent = `Error.`;
        }
        resetFileInput(targetFileElement);
    };
    reader.onerror = () => { showToast(`No se pudo leer ${file.name}.`, 'error'); resetFileInput(targetFileElement); };
    if (fileType === 'excel') reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
}

function processTextCsvDataForVerify(content, colIdx, hasHeader, delimiter = ',') {
    const lines = content.split(/\r\n|\n/);
    const dataRows = hasHeader ? lines.slice(1) : lines;
    const delimRegex = getDelimiterRegex(delimiter);
    return dataRows.map(line => {
        const parts = line.split(delimRegex);
        return parts[colIdx] ? String(Number(parts[colIdx])).trim() : null;
    }).filter(Boolean);
}

function processExcelDataForVerify(arrayBuffer, itemColIdxUser, hasHeader) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) throw new Error("Excel sin hojas.");
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, rawNumbers: false, defval: null });
    if (jsonData.length === 0) return [];
    let headerRow = [];
    let dataRows = jsonData;
    if (hasHeader && jsonData.length > 0) {
        headerRow = jsonData[0].map(h => h ? String(h).toLowerCase().trim() : '');
        dataRows = jsonData.slice(1);
    } else if (hasHeader && jsonData.length === 0) return [];
    const itemHeaderName = 'item_';
    const contenedoraHeaderName = 'contenedoras';
    const cantidadHeaderName = 'cantidad';
    let actualItemColIdx = -1;
    let contenedoraColIdx = -1;
    let cantidadColIdx = -1;
    let isSuitableForGroupedReport = false;
    if (hasHeader && headerRow.length > 0) {
        actualItemColIdx = headerRow.indexOf(itemHeaderName);
        contenedoraColIdx = headerRow.indexOf(contenedoraHeaderName);
        cantidadColIdx = headerRow.indexOf(cantidadHeaderName);
        if (actualItemColIdx === -1 && itemColIdxUser > 0 && (itemColIdxUser-1 < headerRow.length)) {
            actualItemColIdx = itemColIdxUser - 1;
        } else if (actualItemColIdx === -1) {
            throw new Error(`Columna '${itemHeaderName}' no encontrada o índice numérico no válido.`);
        }
        isSuitableForGroupedReport = (contenedoraColIdx !== -1 && cantidadColIdx !== -1 && actualItemColIdx !== -1);
    } else if (!hasHeader && itemColIdxUser > 0) {
        actualItemColIdx = itemColIdxUser - 1;
        isSuitableForGroupedReport = false;
    } else if (!hasHeader && itemColIdxUser <=0) {
        throw new Error("Excel sin encabezados y sin columna de ID válida.");
    }
    return dataRows.map(row => {
        if (!row || row.every(cell => cell === null || cell === '')) return null;
        const idItem = (actualItemColIdx !== -1 && actualItemColIdx < row.length && row[actualItemColIdx]) ? String(Number(row[actualItemColIdx])).trim() : null;
        const contenedora = (contenedoraColIdx !== -1 && contenedoraColIdx < row.length && row[contenedoraColIdx]) ? String(row[contenedoraColIdx]).trim() : (isSuitableForGroupedReport ? 'Sin Contenedora' : 'N/A_EXCEL_NO_CONT_INFO');
        const cantidadVal = (cantidadColIdx !== -1 && cantidadColIdx < row.length && row[cantidadColIdx]) ? String(row[cantidadColIdx]).replace(',', '.') : null;
        const cantidad = cantidadVal ? parseFloat(cantidadVal) : 0;
        const allRowData = {};
        if (hasHeader && headerRow.length > 0) {
            headerRow.forEach((header, idx) => { if (header) allRowData[header] = row[idx]; });
        } else {
            row.forEach((val, idx) => allRowData[`col_${idx+1}`] = val);
        }
        return {
            idItem: idItem,
            contenedora: contenedora,
            cantidad: !isNaN(cantidad) ? cantidad : 0,
            allRowData: allRowData,
            isSuitableForGroupedReport: isSuitableForGroupedReport && idItem !== null
        };
    }).filter(item => item && item.idItem);
}

function updateVerifyPreview() {
    const count = listaVerificar.size;
    DOM.displays.verifyPreview.textContent = `Ítems a Verificar: ${count}. ${count > 0 ? `Primeros: ${[...listaVerificar].slice(0,5).join(', ')}${count > 5 ? '...' : ''}` : 'Vacía.'}`;
}

function collectVerifyDataFromInputs() {
    const textVerifyItems = DOM.inputs.verifyTextarea.value.trim();
    if (textVerifyItems) {
        textVerifyItems.split(/\s+/).forEach(id => {
            const trimmedIdItem = String(Number(id)).trim();
            if (/^[0-9]+$/.test(trimmedIdItem) && trimmedIdItem.length > 5) {
                listaVerificar.add(trimmedIdItem);
                if (!datosVerificacionCargados.some(d => d.idItem === trimmedIdItem && d.contenedora === 'N/A_TEXTAREA')) {
                    datosVerificacionCargados.push({
                        idItem: trimmedIdItem, contenedora: 'N/A_TEXTAREA', cantidad: 0,
                        allRowData: { item_: trimmedIdItem }, isSuitableForGroupedReport: false
                    });
                }
            }
        });
    }
    updateVerifyPreview();
}

function onScanSuccessVerify(decodedText){
    const scannedUPC = cleanText(decodedText);
    let internalCode = null;
    if (scannedUPC) {
        internalCode = upcToCodigoMap.get(scannedUPC);
        if (internalCode) {
            if (!listaVerificar.has(internalCode)) {
                listaVerificar.add(internalCode);
                datosVerificacionCargados.push({
                    idItem: internalCode,
                    contenedora: 'N/A_SCANNER',
                    cantidad: 0,
                    allRowData: { upc: scannedUPC },
                    isSuitableForGroupedReport: false
                });
                DOM.inputs.scannedCodesVerifyTextarea.value += (DOM.inputs.scannedCodesVerifyTextarea.value ? '\n' : '') + internalCode;
                updateVerifyPreview();
                showToast(`UPC escaneado (${scannedUPC}) agregado como ID ${internalCode}.`, 'success');
            } else {
                showToast(`El ítem ${internalCode} ya fue agregado.`, 'info');
            }
        } else {
            showToast(`UPC escaneado (${scannedUPC}) no encontrado en Maestra.`, 'warning');
        }
    }
}

function toggleScanner() {
    if(scannerVerifierActive){
        if(html5QrCodeVerifier?.isScanning){
            html5QrCodeVerifier.stop().then(() => {
                scannerVerifierActive = false;
                DOM.displays.scannerContainerVerify.classList.add('hidden');
                DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
            }).catch(err => {});
        } else {
            scannerVerifierActive = false;
            DOM.displays.scannerContainerVerify.classList.add('hidden');
            DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
        }
    } else {
        if(location.protocol !=='https:' && !['localhost','127.0.0.1'].includes(location.hostname)){
            showToast('Escáner requiere HTTPS o localhost.', 'error'); return;
        }
        DOM.displays.scannerContainerVerify.classList.remove('hidden');
        DOM.buttons.startScanVerify.textContent = '🛑 Detener Escáner';
        if(!html5QrCodeVerifier) html5QrCodeVerifier = new Html5Qrcode("readerVerify", { verbose: false });
        const qrboxFunction = (vw, vh) => ({ width: Math.floor(vw * 0.8), height: Math.floor(vh * 0.4) });
        const config = { fps: 10, qrbox: qrboxFunction, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] };
        html5QrCodeVerifier.start({ facingMode: "environment" }, config, onScanSuccessVerify, (eM) => {})
        .then(() => scannerVerifierActive = true)
        .catch(err => {
            showToast(`Error al iniciar escáner: ${err.message || err}`, 'error');
            DOM.displays.scannerContainerVerify.classList.add('hidden');
            DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
            scannerVerifierActive = false;
        });
    }
}

function compareListsAndDisplayResults(){
    coincidencias.clear();
    listaVerificar.forEach(idItemToVerify => {
        if(listaFoco.has(idItemToVerify)) {
            coincidencias.set(idItemToVerify, listaFoco.get(idItemToVerify));
        }
    });
    displayFinalResults();
}

function handleIniciarDobleControl() {
    if (listaFoco.size === 0) { showToast("No hay Lista Maestra cargada. Por favor, carga o sincroniza una maestra.", 'warning'); return; }
    listaVerificar.clear(); datosVerificacionCargados = []; coincidencias.clear();
    DOM.inputs.verifyTextarea.value = ''; DOM.inputs.scannedCodesVerifyTextarea.value = '';
    resetFileInput(DOM.inputs.verifyFileTxtCsv); resetFileInput(DOM.inputs.verifyFileExcel);
    updateVerifyPreview();
    navigateToView('dobleControlStep');
}

function handleBorrarStorage() {
    if (confirm("¿Borrar Maestra local y resincronizar? Esto eliminará la versión local y buscará la última del repositorio.")) {
        localStorage.removeItem(LOCAL_STORAGE_KEY_LISTA_FOCO);
        listaFoco.clear(); listaFocoCacheadaLocalmente.clear(); upcToCodigoMap.clear();
        showToast("Maestra local borrada. Resincronizando desde repositorio...", 'info');
        checkInitialState();
    }
}

function toggleResultsLayout(){
    DOM.displays.outputResults.classList.toggle('grid');
    DOM.displays.outputResults.classList.toggle('list');
    DOM.buttons.layoutToggle.textContent = DOM.displays.outputResults.classList.contains('grid') ? '📊 Vista Lista' : '📊 Vista Cuadrícula';
}

function setResultsLayoutByDevice() {
    const isMobile = /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(navigator.userAgent);
    if (isMobile) {
        DOM.displays.outputResults.classList.remove('grid');
        DOM.displays.outputResults.classList.add('list');
        DOM.buttons.layoutToggle.textContent = '📊 Vista Cuadrícula';
    } else {
        DOM.displays.outputResults.classList.remove('list');
        DOM.displays.outputResults.classList.add('grid');
        DOM.buttons.layoutToggle.textContent = '📊 Vista Lista';
    }
}

function downloadCsvResults(){
    if(coincidencias.size===0){showToast("No hay Ítems concordantes para exportar.", 'warning');return;}
    let csvContent="ID_Item,Departamento,UPC,Descripcion,Marca,URL_Imagen,UOM_Maestra\n";
    coincidencias.forEach(item=>{
        const esc = (v) => `"${(v??'').replace(/"/g,'""')}"`;
        csvContent+=`${esc(item.codigo)},${esc(item.department)},${esc(item.upc)},${esc(item.descripcion)},${esc(item.brand)},${esc(item.url)},${esc(item.uom)}\n`;
    });
    const blob = new Blob(["\uFEFF"+csvContent],{type:'text/csv;charset=utf-8;'});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `concordancias_sdci_${new Date().toISOString().slice(0,10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
    showToast("CSV de concordancias descargado.", 'success');
}

async function downloadXlsxResults() {
    const hasHighQuantityItems = datosVerificacionCargados.some(item => item.cantidad >= 100 && !coincidencias.has(item.idItem));
    if (coincidencias.size === 0 && !hasHighQuantityItems) {
        showToast("No hay Ítems concordantes ni ítems con cantidad >= 100 (no en maestra) para exportar a XLSX.", 'warning');
        return;
    }
    const btn = DOM.buttons.downloadXlsx;
    const originalText = btn.textContent;
    btn.textContent = 'Generando XLSX...';
    btn.disabled = true;
    try {
        const groupedForXLSX = new Map();
        const itemsHandledBySpecificContainer = new Set();
        datosVerificacionCargados.forEach(uploadedItem => {
            if (coincidencias.has(uploadedItem.idItem)) {
                const masterDetails = coincidencias.get(uploadedItem.idItem);
                let contenedoraKey;
                if (uploadedItem.isSuitableForGroupedReport && uploadedItem.contenedora &&
                uploadedItem.contenedora.trim() !== '' && !uploadedItem.contenedora.startsWith('N/A_')) {
                    contenedoraKey = uploadedItem.contenedora.trim();
                    itemsHandledBySpecificContainer.add(uploadedItem.idItem);
                } else {
                    contenedoraKey = "Ítems Concordantes (Otros/Sin Contenedora Específica)";
                }
                if (!groupedForXLSX.has(contenedoraKey)) {
                    groupedForXLSX.set(contenedoraKey, []);
                }
                groupedForXLSX.get(contenedoraKey).push({
                    ...masterDetails,
                    cantidadCargada: (typeof uploadedItem.cantidad === 'number') ? uploadedItem.cantidad : 'N/A',
                    status: "Concordante",
                    _originalUploadedItemContext: { contenedora: uploadedItem.contenedora, cantidad: uploadedItem.cantidad }
                });
            }
        });
        coincidencias.forEach((masterItem, itemCodigo) => {
            if (!itemsHandledBySpecificContainer.has(itemCodigo)) {
                const defaultGroupKey = "Ítems Concordantes (Otros/Sin Contenedora Específica)";
                if (!groupedForXLSX.has(defaultGroupKey)) groupedForXLSX.set(defaultGroupKey, []);
                if (!groupedForXLSX.get(defaultGroupKey).some(item => item.codigo === itemCodigo && item.status === "Concordante")) {
                    groupedForXLSX.get(defaultGroupKey).push({
                        ...masterItem,
                        cantidadCargada: 'N/A',
                        status: "Concordante"
                    });
                }
            }
        });
        datosVerificacionCargados.forEach(uploadedItem => {
            if (uploadedItem.cantidad >= 100 && !coincidencias.has(uploadedItem.idItem)) {
                let contenedoraKey = (uploadedItem.isSuitableForGroupedReport && uploadedItem.contenedora &&
                    uploadedItem.contenedora.trim() !== '' && !uploadedItem.contenedora.startsWith('N/A_'))
                    ? uploadedItem.contenedora.trim()
                    : "Ítems Adicionales por Cantidad (Cont. Diversas)";
                if (!groupedForXLSX.has(contenedoraKey)) groupedForXLSX.set(contenedoraKey, []);
                const descFromUpload = uploadedItem.allRowData?.descripcion || uploadedItem.allRowData?.descripción || uploadedItem.allRowData?.description || "N/A (No en Maestra)";
                const brandFromUpload = uploadedItem.allRowData?.marca || uploadedItem.allRowData?.brand || "N/A (No en Maestra)";
                const itemExistsCheckKey = `${uploadedItem.idItem}-${uploadedItem.cantidad}-${uploadedItem.contenedora}`;
                let alreadyExists = groupedForXLSX.get(contenedoraKey).find(it =>
                    `${it.codigo}-${it.cantidadCargada}-${it.status === "No en Maestra (Cant. >= 100)" ? 'no_orig_cont' : it._originalUploadedItemContext?.contenedora}` === itemExistsCheckKey &&
                    it.status === "No en Maestra (Cant. >= 100)"
                );
                if (!alreadyExists) {
                    groupedForXLSX.get(contenedoraKey).push({
                        codigo: uploadedItem.idItem,
                        descripcion: descFromUpload,
                        brand: brandFromUpload,
                        upc: "N/A",
                        url: "N/A",
                        cantidadCargada: uploadedItem.cantidad,
                        status: "No en Maestra (Cant. >= 100)",
                        _originalUploadedItemContext: { contenedora: uploadedItem.contenedora, cantidad: uploadedItem.cantidad }
                    });
                }
            }
        });
        const dataForSheet = [];
        const mainTitleQuery = document.querySelector('.container > h1');
        const reportTitle = mainTitleQuery ? mainTitleQuery.innerText : "Sistema de Doble Control de Ítems";
        const currentDateFormatted = new Date().toLocaleDateString("es-CL", { year: 'numeric', month: 'long', day: 'numeric' });
        dataForSheet.push([reportTitle]);
        dataForSheet.push(["Informe de Verificación: Ítems por Contenedora"]);
        dataForSheet.push([`Fecha de Generación: ${currentDateFormatted}`]);
        dataForSheet.push([]);
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }
        ];
        let currentRow = 4;
        const sortedContenedoraKeys = Array.from(groupedForXLSX.keys()).sort((a, b) => {
            const defaultKey1 = "Ítems Concordantes (Otros/Sin Contenedora Específica)";
            const defaultKey2 = "Ítems Adicionales por Cantidad (Cont. Diversas)";
            const aIsDefault = (a === defaultKey1 || a === defaultKey2);
            const bIsDefault = (b === defaultKey1 || b === defaultKey2);
            if (aIsDefault && !bIsDefault) return 1;
            if (!aIsDefault && bIsDefault) return -1;
            if (a === defaultKey2 && b === defaultKey1) return 1;
            if (a === defaultKey1 && b === defaultKey2) return -1;
            return a.localeCompare(b);
        });
        sortedContenedoraKeys.forEach(contenedora => {
            const itemsInContenedora = groupedForXLSX.get(contenedora);
            if (!itemsInContenedora || itemsInContenedora.length === 0) return;
            const uniqueItemsForXLSXInGroup = [];
            const seenInThisGroup = new Set();
            itemsInContenedora.forEach(item => {
                const itemKey = `${item.codigo}-${item.cantidadCargada}-${item.status || 'concordante'}-${item._originalUploadedItemContext?.contenedora || 'no_orig_cont'}`;
                if (!seenInThisGroup.has(itemKey)) {
                    uniqueItemsForXLSXInGroup.push(item);
                    seenInThisGroup.add(itemKey);
                }
            });
            dataForSheet.push([`Contenedora: ${contenedora} (${uniqueItemsForXLSXInGroup.length} ítem(s))`]);
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
            currentRow++;
            uniqueItemsForXLSXInGroup.forEach(item => {
                let displayId = item.codigo || 'N/A';
                if (item.status === "No en Maestra (Cant. >= 100)") {
                    displayId += " (No en Maestra)";
                }
                dataForSheet.push(["ID Ítem:", displayId]); currentRow++;
                dataForSheet.push(["Descripción:", item.descripcion || 'N/A']); currentRow++;
                dataForSheet.push(["Marca:", item.brand || 'N/A']); currentRow++;
                dataForSheet.push(["Cantidad (Info. Carga):", item.cantidadCargada !== undefined ? item.cantidadCargada : 'N/A']); currentRow++;
                dataForSheet.push(["Revisado:", "☐ " + "_".repeat(40) + " (Firma/Obs)"]); currentRow++;
                dataForSheet.push(["Diferencias Encontradas:", "_".repeat(50)]); currentRow++;
                dataForSheet.push(["Notas Adicionales:", "_".repeat(50)]); currentRow++;
                dataForSheet.push([]); currentRow++;
            });
        });
        dataForSheet.push([], [], [], []);
        const signatureRow = [
            null, null,
            "___________________________", null, null,
            "___________________________"
        ];
        const signatureLabelRow = [
            null, null,
            "Firma Responsable", null, null,
            "Nombre y Cargo"
        ];
        dataForSheet.push(signatureRow, signatureLabelRow);
        merges.push({ s: { r: currentRow + 4, c: 2 }, e: { r: currentRow + 4, c: 4 } });
        merges.push({ s: { r: currentRow + 5, c: 2 }, e: { r: currentRow + 5, c: 4 } });
        merges.push({ s: { r: currentRow + 4, c: 5 }, e: { r: currentRow + 4, c: 7 } });
        merges.push({ s: { r: currentRow + 5, c: 5 }, e: { r: currentRow + 5, c: 7 } });
        const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
        ws['!merges'] = merges;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Informe de Control");
        XLSX.writeFile(wb, `Informe_Doble_Control_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast("Informe XLSX descargado con éxito.", 'success');
    } catch (error) {
        showToast(`Error al generar XLSX: ${error.message}`, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function handleNewVerification() {
    if (confirm("¿Deseas iniciar un nuevo Doble Control? Se borrarán los datos actuales de verificación.")) {
        listaVerificar.clear();
        datosVerificacionCargados = [];
        coincidencias.clear();
        DOM.inputs.verifyTextarea.value = '';
        DOM.inputs.scannedCodesVerifyTextarea.value = '';
        resetFileInput(DOM.inputs.verifyFileTxtCsv);
        resetFileInput(DOM.inputs.verifyFileExcel);
        updateVerifyPreview();
        if (scannerVerifierActive && html5QrCodeVerifier?.isScanning) {
            html5QrCodeVerifier.stop().then(() => {
                scannerVerifierActive = false;
                DOM.displays.scannerContainerVerify.classList.add('hidden');
                DOM.buttons.startScanVerify.textContent = '📷 Escanear UPC';
            }).catch(err => {});
        }
        showToast("Nueva verificación iniciada. Datos anteriores borrados.", 'info');
        navigateToView('dobleControlStep');
        setResultsLayoutByDevice();
    }
}
