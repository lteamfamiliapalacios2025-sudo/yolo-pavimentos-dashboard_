document.addEventListener('DOMContentLoaded', () => {
    const DATA_SOURCE = './data_refs/resultado_validado.json';
    const DATA_SOURCE_LABEL = 'Fuente: resultado validado';

    let allRefs = [];
    let currentRefs = [];
    let selectedRef = null;
    let currentImageIndex = 0;

    const $ = id => document.getElementById(id);

    const refList = $('refList');
    const refSearch = $('refSearch');
    const welcomeScreen = $('welcomeScreen');
    const dashboard = $('dashboard');
    const toast = $('toast');
    const jsonViewer = $('jsonViewer');
    const sourceBadge = $('sourceBadge');

    const filterType = $('filterType');
    const filterSemaforo = $('filterSemaforo');
    const filterDecision = $('filterDecision');
    const btnClearFilters = $('btnClearFilters');

    const baselineImage = $('baselineImage');
    const experimentImage = $('experimentImage');
    const baselineImageInfo = $('baselineImageInfo');
    const experimentImageInfo = $('experimentImageInfo');
    const btnPrevCompare = $('btnPrevCompare');
    const btnNextCompare = $('btnNextCompare');
    const btnCopyComparePaths = $('btnCopyComparePaths');

    const btnOpenExp = $('btnOpenExp');
    const btnOpenComp = $('btnOpenComp');
    const btnCopyMetadata = $('btnCopyMetadata');

    const btnAccept = $('btnAccept');
    const btnReview = $('btnReview');
    const btnReject = $('btnReject');
    const btnExport = $('btnExport');

    init();

    async function init() {
        try {
            const res = await fetch(DATA_SOURCE, { cache: 'no-store' });
            console.log('JSON status:', res.status, res.ok, res.url);

            if (!res.ok) throw new Error(`No se pudo cargar ${DATA_SOURCE}`);

            const data = await res.json();

            allRefs = normalizeRefs(data);
            currentRefs = [...allRefs];
            window.allRefs = allRefs;

            if (sourceBadge) sourceBadge.textContent = DATA_SOURCE_LABEL;

            refreshDashboard(currentRefs);

            if (currentRefs.length > 0) {
                const firstItem = refList?.querySelector('.ref-item');
                showReference(currentRefs[0], firstItem);
            }
        } catch (err) {
            console.error('Error cargando JSON:', err);
            showToast('Error cargando resultado_validado.json');

            if (sourceBadge) sourceBadge.textContent = 'Fuente: error al cargar JSON';
        }
    }

    function normalizeRefs(data) {
        const sourceRefs = Array.isArray(data.ranking)
            ? data.ranking
            : Array.isArray(data.references)
                ? data.references
                : [];

        const refs = sourceRefs.map(r => ({ ...r }));
        const baseline = refs.find(r => String(r.type).toLowerCase() === 'baseline') || refs[0];

        const baseScore = Number(baseline?.score ?? 0);
        const baseFP = Number(baseline?.false_positives ?? 0);
        const baseFN = Number(baseline?.false_negatives ?? 0);
        const baseDet = Number(baseline?.detections ?? 0);

        const processed = refs.map(r => {
            const score = Number(r.score ?? 0);
            const fp = Number(r.false_positives ?? 0);
            const fn = Number(r.false_negatives ?? 0);
            const det = Number(r.detections ?? 0);
            const indice = Number(r.indice_calidad ?? (score - fp * 0.001).toFixed(3));

            return {
                ...r,
                score,
                detections: det,
                false_positives: fp,
                false_negatives: fn,
                indice_calidad: indice,
                type: r.type || 'experimento',
                status: r.status || 'estable',
                decision: r.decision || 'VALIDAR',
                semaforo: r.semaforo || '',
                images: Array.isArray(r.images) ? r.images : [],
                grafico_label: r.grafico_label || cleanLabel(r.title),
                delta_score: Number(r.delta_score ?? (score - baseScore).toFixed(3)),
                delta_detections: Number(r.delta_detections ?? det - baseDet),
                delta_false_positives: Number(r.delta_false_positives ?? fp - baseFP),
                delta_false_negatives: Number(r.delta_false_negatives ?? fn - baseFN),
                lectura_tecnica: r.lectura_tecnica || ''
            };
        });

        processed.sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999));

        processed.forEach((r, i) => {
            if (!r.ranking) r.ranking = i + 1;

            if (!r.semaforo) {
                if (r.indice_calidad >= 0.75) r.semaforo = 'VERDE';
                else if (r.indice_calidad >= 0.70) r.semaforo = 'NARANJA';
                else r.semaforo = 'ROJO';
            }

            if (!r.lectura_tecnica) {
                if (String(r.type).toLowerCase() === 'baseline') {
                    r.lectura_tecnica = 'Referencia base';
                } else if (r.delta_score > 0 && r.delta_false_positives <= 5 && r.delta_false_negatives < 0) {
                    r.lectura_tecnica = 'Mejor equilibrio técnico frente al baseline';
                } else if (r.delta_false_negatives < 0 && r.delta_false_positives > 5) {
                    r.lectura_tecnica = 'Reduce FN, pero incrementa FP';
                } else {
                    r.lectura_tecnica = 'Requiere revisión visual';
                }
            }
        });

        return processed;
    }

    function cleanLabel(title = '') {
        return String(title)
            .replace('Experimento ', '')
            .replace('Baseline V2', 'Baseline')
            .trim();
    }

    function refreshDashboard(refs) {
        currentRefs = refs;
        renderList(refs);
        renderSummary(refs);
        renderComparisonTable(refs);
        renderCharts(refs);
    }

    function renderList(refs) {
        if (!refList) return;

        refList.innerHTML = '';

        refs.forEach(ref => {
            const li = document.createElement('li');
            li.className = 'ref-item';

            if (selectedRef?.id === ref.id) li.classList.add('active');

            li.innerHTML = `
                <span class="ref-name">#${ref.ranking} - ${ref.title}</span>
                <span class="ref-meta">IC: ${fmt(ref.indice_calidad)} | ${ref.semaforo}</span>
            `;

            li.addEventListener('click', () => showReference(ref, li));
            refList.appendChild(li);
        });
    }

    function showReference(ref, li) {
        selectedRef = ref;
        currentImageIndex = 0;

        document.querySelectorAll('.ref-item').forEach(el => el.classList.remove('active'));
        if (li) li.classList.add('active');

        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');

        setText('refTitle', ref.title);
        setText('refTypeBadge', ref.type);
        setText('refId', ref.id);
        setText('refStatus', ref.status || 'No especificado');
        setText('refSource', ref.source_project || 'No especificado');
        setText('refTechType', ref.type || 'No especificado');
        setText('refVersion', ref.grafico_label || 'No especificado');
        setText('refVisible', ref.visible_in_app === true ? 'Sí' : 'No especificado');

        setText('metricDetections', ref.detections);
        setText('metricFP', ref.false_positives);
        setText('metricFN', ref.false_negatives);

        const scoreEl = $('metricScore');
        if (scoreEl) {
            scoreEl.textContent = fmt(ref.score);
            scoreEl.style.color = ref.score >= 0.75 ? '#16a34a' : '#d97706';
        }

        setText('metricConclusion', ref.lectura_tecnica);

        setText(
            'baselineComparison',
            `Δ Score: ${sign(ref.delta_score)} | Δ Detecciones: ${sign(ref.delta_detections)} | Δ FP: ${sign(ref.delta_false_positives)} | Δ FN: ${sign(ref.delta_false_negatives)}`
        );

        setText('technicalDecision', ref.decision || 'Sin decisión técnica');
        setDecisionColor(ref.decision);
        setEvalStatus(ref);

        setText('refNotes', `Ranking: ${ref.ranking} | Semáforo: ${ref.semaforo}`);

        if (jsonViewer) jsonViewer.textContent = JSON.stringify(ref, null, 2);

        renderCompareImages();

        const savedDecision = localStorage.getItem(`decision_${ref.id}`);
        setText('manualDecision', savedDecision ? `Decisión manual: ${savedDecision}` : 'Sin decisión manual');
        markManualButton(savedDecision);

        if (btnOpenComp) {
            btnOpenComp.classList.toggle('btn-disabled', !ref.comparison_path);
            btnOpenComp.title = ref.comparison_path ? '' : 'Ruta no disponible';
        }
    }

    function getBaselineRef() {
        return allRefs.find(r => String(r.type).toLowerCase() === 'baseline') || null;
    }

    function renderCompareImages() {
        const baselineRef = getBaselineRef();
        const experimentRef = selectedRef;

        if (!baselineImage || !experimentImage) return;

        const baselineImages = baselineRef?.images || [];
        const experimentImages = experimentRef?.images || [];
        const maxImages = Math.max(baselineImages.length, experimentImages.length);

        if (!selectedRef || maxImages === 0) {
            baselineImage.removeAttribute('src');
            experimentImage.removeAttribute('src');
            setText('baselineImageInfo', 'Baseline sin imágenes');
            setText('experimentImageInfo', 'Experimento sin imágenes');
            return;
        }

        if (currentImageIndex >= maxImages) currentImageIndex = 0;
        if (currentImageIndex < 0) currentImageIndex = maxImages - 1;

        const baselineImg = baselineImages[currentImageIndex] || baselineImages[0];
        const experimentImg = experimentImages[currentImageIndex] || experimentImages[0];

        if (baselineImg?.path) {
            baselineImage.src = addCacheBreaker(baselineImg.path);
            baselineImage.alt = baselineImg.file || 'Baseline V2';
            setText('baselineImageInfo', `${baselineImg.file || 'Imagen baseline'} (${currentImageIndex + 1}/${baselineImages.length})`);
        } else {
            baselineImage.removeAttribute('src');
            setText('baselineImageInfo', 'Baseline sin imagen equivalente');
        }

        if (experimentImg?.path) {
            experimentImage.src = addCacheBreaker(experimentImg.path);
            experimentImage.alt = experimentImg.file || 'Experimento';
            setText('experimentImageInfo', `${experimentImg.file || 'Imagen experimento'} (${currentImageIndex + 1}/${experimentImages.length})`);
        } else {
            experimentImage.removeAttribute('src');
            setText('experimentImageInfo', 'Experimento sin imagen equivalente');
        }
    }

    function nextCompareImage() {
        const baselineRef = getBaselineRef();
        const maxImages = Math.max(baselineRef?.images?.length || 0, selectedRef?.images?.length || 0);

        if (!selectedRef || maxImages === 0) {
            showToast('Sin imágenes disponibles');
            return;
        }

        currentImageIndex = (currentImageIndex + 1) % maxImages;
        renderCompareImages();
    }

    function prevCompareImage() {
        const baselineRef = getBaselineRef();
        const maxImages = Math.max(baselineRef?.images?.length || 0, selectedRef?.images?.length || 0);

        if (!selectedRef || maxImages === 0) {
            showToast('Sin imágenes disponibles');
            return;
        }

        currentImageIndex--;
        if (currentImageIndex < 0) currentImageIndex = maxImages - 1;

        renderCompareImages();
    }

    function copyComparePaths() {
        const baselineRef = getBaselineRef();
        const baselineImg = baselineRef?.images?.[currentImageIndex] || baselineRef?.images?.[0];
        const experimentImg = selectedRef?.images?.[currentImageIndex] || selectedRef?.images?.[0];

        const text = [
            `Baseline: ${baselineImg?.path || 'No disponible'}`,
            `Experimento: ${experimentImg?.path || 'No disponible'}`
        ].join('\n');

        copyText(text);
        showToast('Rutas comparativas copiadas');
    }

    function renderSummary(refs) {
        setText('totalRefs', refs.length);
        setText('totalBaselines', refs.filter(r => r.type === 'baseline').length);
        setText('totalExperiments', refs.filter(r => r.type === 'experimento').length);
        setText('totalAccepted', refs.filter(r => r.decision === 'ACEPTADO').length);
        setText('totalReview', refs.filter(r => r.decision === 'VALIDAR').length);
        setText('totalRejected', refs.filter(r => r.decision === 'RECHAZADO').length);

        const best = [...refs].sort((a, b) => b.indice_calidad - a.indice_calidad)[0];

        setText('bestScore', best ? fmt(best.indice_calidad) : '-');
        setText('bestReference', best ? best.title : 'No disponible');

        const rankingList = $('rankingList');
        if (rankingList) {
            rankingList.innerHTML = '';

            refs.forEach(r => {
                const li = document.createElement('li');
                li.className = `ranking-item ranking-${String(r.semaforo).toLowerCase()}`;
                li.innerHTML = `
                    <strong>#${r.ranking}</strong>
                    <span>${r.title}</span>
                    <small>IC ${fmt(r.indice_calidad)} · ${r.semaforo}</small>
                `;
                rankingList.appendChild(li);
            });
        }

        setText(
            'rankingConclusion',
            best
                ? `La mejor referencia técnica es ${best.title}, con índice de calidad ${fmt(best.indice_calidad)}.`
                : 'No hay referencias para mostrar.'
        );
    }

    function renderComparisonTable(refs) {
        const tbody = $('comparisonTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        refs.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.ranking}</td>
                <td><strong>${r.title}</strong></td>
                <td>${r.type}</td>
                <td>${fmt(r.score)}</td>
                <td>${fmt(r.indice_calidad)}</td>
                <td>${r.detections}</td>
                <td>${r.false_positives}</td>
                <td>${r.false_negatives}</td>
                <td><span class="semaforo-pill ${String(r.semaforo).toLowerCase()}">${r.semaforo}</span></td>
                <td>${r.decision || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderCharts(refs) {
        renderQualityChart(refs);
        renderFpFnChart(refs);
    }

    function renderQualityChart(refs) {
        const chart = $('qualityChart');
        if (!chart) return;

        const maxValue = Math.max(...refs.map(r => r.indice_calidad || 0), 1);

        chart.innerHTML = refs.map(r => `
            <div class="bar-row">
                <div class="bar-label">${r.grafico_label || r.title}</div>
                <div class="bar-track">
                    <div class="bar-fill quality-${String(r.semaforo).toLowerCase()}" style="width:${((r.indice_calidad / maxValue) * 100).toFixed(1)}%"></div>
                </div>
                <div class="bar-value">${fmt(r.indice_calidad)}</div>
            </div>
        `).join('');
    }

    function renderFpFnChart(refs) {
        const chart = $('errorChart');
        if (!chart) return;

        const maxValue = Math.max(
            ...refs.map(r => r.false_positives || 0),
            ...refs.map(r => r.false_negatives || 0),
            1
        );

        chart.innerHTML = refs.map(r => `
            <div class="dual-chart-group">
                <div class="dual-title">${r.grafico_label || r.title}</div>

                <div class="bar-row">
                    <div class="bar-label">FP</div>
                    <div class="bar-track">
                        <div class="bar-fill error-fp" style="width:${((r.false_positives / maxValue) * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="bar-value">${r.false_positives}</div>
                </div>

                <div class="bar-row">
                    <div class="bar-label">FN</div>
                    <div class="bar-track">
                        <div class="bar-fill error-fn" style="width:${((r.false_negatives / maxValue) * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="bar-value">${r.false_negatives}</div>
                </div>
            </div>
        `).join('');
    }

    function setDecisionColor(decision) {
        const el = $('technicalDecision');
        if (!el) return;

        el.classList.remove('decision-green', 'decision-yellow', 'decision-red', 'decision-neutral');

        if (decision === 'ACEPTADO') el.classList.add('decision-green');
        else if (decision === 'VALIDAR') el.classList.add('decision-yellow');
        else if (decision === 'RECHAZADO') el.classList.add('decision-red');
        else el.classList.add('decision-neutral');
    }

    function setEvalStatus(ref) {
        const evalText = $('evalStatus');
        if (!evalText || !evalText.parentElement) return;

        const box = evalText.parentElement;
        box.classList.remove('eval-green', 'eval-yellow', 'eval-red', 'eval-neutral');

        if (ref.semaforo === 'VERDE') {
            setText('evalStatus', 'Evaluación cargada: mejor referencia técnica');
            box.classList.add('eval-green');
        } else if (['AMARILLO', 'NARANJA'].includes(ref.semaforo)) {
            setText('evalStatus', 'Evaluación cargada: requiere revisión técnica');
            box.classList.add('eval-yellow');
        } else if (ref.semaforo === 'ROJO') {
            setText('evalStatus', 'Evaluación cargada: menor desempeño relativo');
            box.classList.add('eval-red');
        } else {
            setText('evalStatus', 'Evaluación cargada');
            box.classList.add('eval-neutral');
        }
    }

    function applyFilters() {
        const searchText = (refSearch?.value || '').toLowerCase().trim();
        const typeValue = filterType?.value || '';
        const semaforoValue = filterSemaforo?.value || '';
        const decisionValue = filterDecision?.value || '';

        let filtered = [...allRefs];

        if (searchText) {
            filtered = filtered.filter(r =>
                String(r.title || '').toLowerCase().includes(searchText) ||
                String(r.id || '').toLowerCase().includes(searchText)
            );
        }

        if (typeValue) filtered = filtered.filter(r => r.type === typeValue);
        if (semaforoValue) filtered = filtered.filter(r => r.semaforo === semaforoValue);
        if (decisionValue) filtered = filtered.filter(r => r.decision === decisionValue);

        refreshDashboard(filtered);

        if (filtered.length > 0) {
            const firstLi = refList?.querySelector('.ref-item');
            showReference(filtered[0], firstLi);
        } else {
            selectedRef = null;
            if (dashboard) dashboard.classList.add('hidden');
            if (welcomeScreen) welcomeScreen.classList.remove('hidden');
        }
    }

    function clearFilters() {
        if (refSearch) refSearch.value = '';
        if (filterType) filterType.value = '';
        if (filterSemaforo) filterSemaforo.value = '';
        if (filterDecision) filterDecision.value = '';

        refreshDashboard(allRefs);

        if (allRefs.length > 0) {
            const firstLi = refList?.querySelector('.ref-item');
            showReference(allRefs[0], firstLi);
        }

        showToast('Filtros limpiados');
    }

    function saveUserDecision(decision) {
        if (!selectedRef) {
            showToast('Seleccione una referencia primero');
            return;
        }

        localStorage.setItem(`decision_${selectedRef.id}`, decision);
        setText('manualDecision', `Decisión manual: ${decision}`);
        markManualButton(decision);
        showToast(`Decisión guardada: ${decision}`);
    }

    function markManualButton(decision) {
        document.querySelectorAll('.decision-actions button').forEach(btn => {
            btn.classList.remove('manual-active');
        });

        if (decision === 'ACEPTADO' && btnAccept) btnAccept.classList.add('manual-active');
        if (decision === 'VALIDAR' && btnReview) btnReview.classList.add('manual-active');
        if (decision === 'RECHAZADO' && btnReject) btnReject.classList.add('manual-active');
    }

    function exportResults(refs) {
        const exportData = {
            export_metadata: {
                project: 'YOLO Pavimentos - Dashboard técnico V3',
                export_date: new Date().toISOString(),
                total_exported: refs.length,
                version: 'V3'
            },
            references: refs,
            ranking: [...refs].sort((a, b) => Number(a.ranking || 999) - Number(b.ranking || 999))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `YOLO_E2_resultado_validado_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    function handlePath(path, tipo) {
        if (!path) {
            showToast(`Ruta de ${tipo} no disponible`);
            return;
        }

        copyText(path);
        showToast(`Ruta de ${tipo} copiada`);
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text || '').catch(() => fallbackCopy(text));
            return;
        }

        fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const el = document.createElement('textarea');
        el.value = text || '';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }

    function addCacheBreaker(path) {
        if (!path) return '';
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}v=${Date.now()}`;
    }

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value ?? '';
    }

    function fmt(value) {
        if (value === null || value === undefined || value === '') return '-';

        const n = Number(value);
        if (Number.isNaN(n)) return value;

        return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }

    function sign(value) {
        const n = Number(value || 0);
        return n > 0 ? `+${fmt(n)}` : fmt(n);
    }

    function showToast(message) {
        if (!toast) return;

        toast.textContent = message;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2200);
    }

    if (refSearch) refSearch.addEventListener('input', applyFilters);
    if (filterType) filterType.addEventListener('change', applyFilters);
    if (filterSemaforo) filterSemaforo.addEventListener('change', applyFilters);
    if (filterDecision) filterDecision.addEventListener('change', applyFilters);
    if (btnClearFilters) btnClearFilters.addEventListener('click', clearFilters);

    if (btnOpenExp) {
        btnOpenExp.addEventListener('click', () => {
            handlePath(selectedRef?.experiment_path, 'experimento');
        });
    }

    if (btnOpenComp) {
        btnOpenComp.addEventListener('click', () => {
            handlePath(selectedRef?.comparison_path, 'comparación');
        });
    }

    if (btnCopyMetadata) {
        btnCopyMetadata.addEventListener('click', () => {
            if (!selectedRef) {
                showToast('Seleccione una referencia primero');
                return;
            }

            copyText(JSON.stringify(selectedRef, null, 2));
            showToast('Metadata copiada');
        });
    }

    if (btnExport) {
        btnExport.addEventListener('click', () => exportResults(currentRefs));
    }

    if (btnAccept) {
        btnAccept.addEventListener('click', () => saveUserDecision('ACEPTADO'));
    }

    if (btnReview) {
        btnReview.addEventListener('click', () => saveUserDecision('VALIDAR'));
    }

    if (btnReject) {
        btnReject.addEventListener('click', () => saveUserDecision('RECHAZADO'));
    }

    if (btnNextCompare) {
        btnNextCompare.addEventListener('click', nextCompareImage);
    }

    if (btnPrevCompare) {
        btnPrevCompare.addEventListener('click', prevCompareImage);
    }

    if (btnCopyComparePaths) {
        btnCopyComparePaths.addEventListener('click', copyComparePaths);
    }
});
