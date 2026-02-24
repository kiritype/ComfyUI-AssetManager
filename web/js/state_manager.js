/**
 * state_manager.js — 애플리케이션 전역 상태 관리자
 * 화면(DOM)의 설정값을 수집하여 JSON 객체로 직렬화하고,
 * 백엔드 /assetmanager/api/save_state 엔드포인트와 동기화합니다.
 * 페이지 새로고침 시 이전 세션의 설정을 복원하는 역할도 담당합니다.
 */

class AppStateManager {
    constructor() {
        this.saveTimeout = null;
    }

    /**
     * 현재 화면(DOM)의 모든 설정값을 수집하여 JSON 직렬화 가능한 객체로 반환.
     * 반환된 객체가 그대로 app_state.json에 저장된다.
     */
    getCurrentState() {
        const detailerOpts = {
            face: document.getElementById('detailer-face-toggle')?.checked || false,
            eye: document.getElementById('detailer-eye-toggle')?.checked || false,
            mouth: document.getElementById('detailer-mouth-toggle')?.checked || false,
            hand: document.getElementById('detailer-hand-toggle')?.checked || false,
            faceModel: document.getElementById('detailer-face-model')?.value || '',
            eyeModel: document.getElementById('detailer-eye-model')?.value || '',
            mouthModel: document.getElementById('detailer-mouth-model')?.value || '',
            handModel: document.getElementById('detailer-hand-model')?.value || ''
        };

        const mosaicOpts = {
            nipples: document.getElementById('censor-nipples')?.checked || false,
            pussy: document.getElementById('censor-pussy')?.checked || false,
            penis: document.getElementById('censor-penis')?.checked || false,
            anus: document.getElementById('censor-anus')?.checked || false,
            testicles: document.getElementById('censor-testicles')?.checked || false,
            xray: document.getElementById('censor-xray')?.checked || false,
            'cross-section': document.getElementById('censor-cross-section')?.checked || false,
            mode: document.getElementById('censor-mode')?.value || 'mosaic',
            intensity: document.getElementById('censor-intensity')?.value || '15'
        };

        const standaloneCensorOpts = {
            nipples: document.getElementById('tool-censor-nipples')?.checked !== false,
            pussy: document.getElementById('tool-censor-pussy')?.checked !== false,
            penis: document.getElementById('tool-censor-penis')?.checked !== false,
            anus: document.getElementById('tool-censor-anus')?.checked !== false,
            testicles: document.getElementById('tool-censor-testicles')?.checked !== false,
            xray: document.getElementById('tool-censor-xray')?.checked !== false,
            'cross-section': document.getElementById('tool-censor-cross-section')?.checked !== false,
            mode: document.getElementById('tool-censor-mode')?.value || 'mosaic',
            intensity: document.getElementById('tool-censor-intensity')?.value || '3.0'
        };

        const loraOpts = Array.from(document.querySelectorAll('#selected-loras .lora-item')).map(row => ({
            model: row.querySelector('select').value,
            weight: parseFloat(row.querySelector('input[type="number"]').value)
        }));

        const genModeInput = document.querySelector('input[name="gen-mode"]:checked');
        const activeTabEl = document.querySelector('.tab-panel.active');

        let currentTabId = 'tab-generate';
        if (activeTabEl && activeTabEl.id) {
            currentTabId = activeTabEl.id;
        }

        return {
            activeTab: currentTabId,
            globalRepeatCount: document.getElementById('global-repeat-count')?.value || 1,
            checkpoint: document.getElementById('gen-checkpoint')?.value || '',
            basePos: document.getElementById('base-pos')?.value || '',
            baseNeg: document.getElementById('base-neg')?.value || '',

            upscaleOn: document.getElementById('toggle-upscale')?.checked || false,
            upscaleModel: document.getElementById('upscale-model')?.value || '',
            upscaleScale: document.getElementById('upscale-ratio')?.value || '1.1',

            detailerOn: document.getElementById('toggle-detailer')?.checked || false,
            detailerOpts: detailerOpts,

            mosaicOn: document.getElementById('toggle-mosaic')?.checked || false,
            mosaicOpts: mosaicOpts,

            standaloneCensorOpts: standaloneCensorOpts,

            resizerOpts: {
                mode: document.getElementById('resizer-mode')?.value || 'none',
                scale: document.getElementById('resizer-val-scale')?.value || '50',
                longest: document.getElementById('resizer-val-longest')?.value || '1024',
                width: document.getElementById('resizer-val-width')?.value || '512',
                height: document.getElementById('resizer-val-height')?.value || '512',
                format: document.getElementById('resizer-format')?.value || 'webp',
                quality: document.getElementById('resizer-quality')?.value || '85'
            },

            loraOpts: loraOpts,
            genMode: genModeInput ? genModeInput.value : 'txt2img',
            templatePath: document.getElementById('template-path')?.value || 'workflows/SD1.5/Base/V1',
            civitaiMetadataOn: document.getElementById('toggle-civitai-metadata')?.checked || true,
            livePreviewCollapsed: document.getElementById('live-preview-body')?.classList.contains('collapsed') || false,

            /* generate.js의 let jobQueue는 로컬 변수이므로 getter 함수로 접근 */
            jobQueue: typeof getJobQueue === 'function' ? getJobQueue() : [],
            pathTemplate: document.getElementById('batch-path-template')?.value || ''
        };
    }

    /**
     * 백엔드에서 불러온 JSON 객체를 바탕으로 화면(DOM) 설정값들을 채움.
     * 각 필드가 존재할 때만 해당 DOM 요소에 값을 반영한다.
     */
    applyState(state) {
        if (!state) return;

        /* 활성 탭 복원 */
        if (state.activeTab && window.UIManager) {
            window.UIManager.openTab(state.activeTab);
        }

        /* 전역 반복 횟수 */
        if (state.globalRepeatCount && document.getElementById('global-repeat-count')) {
            document.getElementById('global-repeat-count').value = state.globalRepeatCount;
            if (document.getElementById('global-repeat-count-str')) {
                document.getElementById('global-repeat-count-str').innerText = state.globalRepeatCount;
            }
        }

        /* 체크포인트 / 프롬프트 텍스트 */
        if (state.checkpoint && document.getElementById('gen-checkpoint')) {
            document.getElementById('gen-checkpoint').value = state.checkpoint;
        }
        if (state.basePos !== undefined && document.getElementById('base-pos')) {
            document.getElementById('base-pos').value = state.basePos;
        }
        if (state.baseNeg !== undefined && document.getElementById('base-neg')) {
            document.getElementById('base-neg').value = state.baseNeg;
        }

        /* 업스케일 설정 */
        if (state.upscaleOn !== undefined && document.getElementById('toggle-upscale')) {
            document.getElementById('toggle-upscale').checked = state.upscaleOn;
        }
        if (state.upscaleModel && document.getElementById('upscale-model')) document.getElementById('upscale-model').value = state.upscaleModel;
        const upscaleVal = state.upscaleScale || state.upscaleRatio;
        if (upscaleVal && document.getElementById('upscale-ratio')) {
            document.getElementById('upscale-ratio').value = upscaleVal;
            if (document.getElementById('upscale-ratio-str')) document.getElementById('upscale-ratio-str').innerText = upscaleVal;
        }

        /* 디테일러 설정 */
        if (state.detailerOn !== undefined && document.getElementById('toggle-detailer')) {
            document.getElementById('toggle-detailer').checked = state.detailerOn;
        }
        if (state.detailerOpts) {
            const dOpts = state.detailerOpts;
            if (dOpts.face !== undefined && document.getElementById('detailer-face-toggle')) document.getElementById('detailer-face-toggle').checked = dOpts.face;
            if (dOpts.eye !== undefined && document.getElementById('detailer-eye-toggle')) document.getElementById('detailer-eye-toggle').checked = dOpts.eye;
            if (dOpts.mouth !== undefined && document.getElementById('detailer-mouth-toggle')) document.getElementById('detailer-mouth-toggle').checked = dOpts.mouth;
            if (dOpts.hand !== undefined && document.getElementById('detailer-hand-toggle')) document.getElementById('detailer-hand-toggle').checked = dOpts.hand;
            if (dOpts.faceModel && document.getElementById('detailer-face-model')) document.getElementById('detailer-face-model').value = dOpts.faceModel;
            if (dOpts.eyeModel && document.getElementById('detailer-eye-model')) document.getElementById('detailer-eye-model').value = dOpts.eyeModel;
            if (dOpts.mouthModel && document.getElementById('detailer-mouth-model')) document.getElementById('detailer-mouth-model').value = dOpts.mouthModel;
            if (dOpts.handModel && document.getElementById('detailer-hand-model')) document.getElementById('detailer-hand-model').value = dOpts.handModel;
        }

        /* 모자이크 설정 */
        if (state.mosaicOn !== undefined && document.getElementById('toggle-mosaic')) {
            document.getElementById('toggle-mosaic').checked = state.mosaicOn;
        }
        if (state.mosaicOpts) {
            const mOpts = state.mosaicOpts;
            const mosaicChecks = ['nipples', 'pussy', 'penis', 'anus', 'testicles', 'xray', 'cross-section'];
            mosaicChecks.forEach(id => {
                if (mOpts[id] !== undefined && document.getElementById(`censor-${id}`)) {
                    document.getElementById(`censor-${id}`).checked = mOpts[id];
                }
            });
            if (mOpts.mode && document.getElementById('censor-mode')) {
                document.getElementById('censor-mode').value = mOpts.mode;
            }
            if (mOpts.intensity && document.getElementById('censor-intensity')) {
                document.getElementById('censor-intensity').value = mOpts.intensity;
                if (document.getElementById('censor-val')) document.getElementById('censor-val').innerText = mOpts.intensity;
            }
        }

        /* 단독 검열기 */
        if (state.standaloneCensorOpts) {
            const censorChecks = ['nipples', 'pussy', 'penis', 'anus', 'testicles', 'xray', 'cross-section'];
            censorChecks.forEach(id => {
                const el = document.getElementById(`tool-censor-${id}`);
                if (el) el.checked = state.standaloneCensorOpts[id] !== false;
            });
            if (state.standaloneCensorOpts.mode && document.getElementById('tool-censor-mode')) {
                document.getElementById('tool-censor-mode').value = state.standaloneCensorOpts.mode;
            }
            if (state.standaloneCensorOpts.intensity && document.getElementById('tool-censor-intensity')) {
                document.getElementById('tool-censor-intensity').value = state.standaloneCensorOpts.intensity;
                if (document.getElementById('tool-censor-val')) {
                    document.getElementById('tool-censor-val').innerText = state.standaloneCensorOpts.intensity;
                }
            }
        }

        /* 퀵 리사이저 */
        if (state.resizerOpts) {
            if (state.resizerOpts.mode && document.getElementById('resizer-mode')) {
                document.getElementById('resizer-mode').value = state.resizerOpts.mode;
                if (typeof toggleResizerInputs === 'function') toggleResizerInputs();
            }
            if (state.resizerOpts.scale && document.getElementById('resizer-val-scale')) document.getElementById('resizer-val-scale').value = state.resizerOpts.scale;
            if (state.resizerOpts.longest && document.getElementById('resizer-val-longest')) document.getElementById('resizer-val-longest').value = state.resizerOpts.longest;
            if (state.resizerOpts.width && document.getElementById('resizer-val-width')) document.getElementById('resizer-val-width').value = state.resizerOpts.width;
            if (state.resizerOpts.height && document.getElementById('resizer-val-height')) document.getElementById('resizer-val-height').value = state.resizerOpts.height;

            if (state.resizerOpts.format && document.getElementById('resizer-format')) {
                document.getElementById('resizer-format').value = state.resizerOpts.format;
                if (typeof toggleResizerQuality === 'function') toggleResizerQuality();
            }
            if (state.resizerOpts.quality && document.getElementById('resizer-quality')) {
                document.getElementById('resizer-quality').value = state.resizerOpts.quality;
                if (document.getElementById('resizer-quality-str')) {
                    document.getElementById('resizer-quality-str').innerText = state.resizerOpts.quality;
                }
            }
        }

        /* 생성 모드(단일/배치) 및 UI 토글 */
        if (state.genMode) {
            const modeRadio = document.querySelector(`input[name="gen-mode"][value="${state.genMode}"]`);
            if (modeRadio) {
                modeRadio.checked = true;
                if (typeof toggleGenMode === 'function') toggleGenMode();
            }
        }

        if (state.templatePath && document.getElementById('template-path')) {
            document.getElementById('template-path').value = state.templatePath;
        }

        if (state.civitaiMetadataOn !== undefined && document.getElementById('toggle-civitai-metadata')) {
            document.getElementById('toggle-civitai-metadata').checked = state.civitaiMetadataOn;
        }

        /* LoRA 복원은 드롭다운 로딩 타이밍 문제로 별도 처리 필요 (현재 미구현) */
        if (state.loraOpts && typeof renderLoras === 'function') {
        }

        /* 파이프라인 UI 토글 상태 반영 */
        if (typeof togglePipelineOptions === 'function') togglePipelineOptions('upscale');
        if (typeof togglePipelineOptions === 'function') togglePipelineOptions('detailer');
        if (typeof togglePipelineOptions === 'function') togglePipelineOptions('mosaic');

        /* 라이브 프리뷰 접힘 상태 */
        if (state.livePreviewCollapsed !== undefined) {
            const body = document.getElementById('live-preview-body');
            const container = document.getElementById('live-preview-container');
            const btn = document.getElementById('live-preview-toggle');
            if (body && state.livePreviewCollapsed) {
                body.classList.add('collapsed');
                if (container) container.classList.add('collapsed-mode');
                if (btn) btn.textContent = '▼ 펼치기';
            }
        }

        /* 배치 큐 복원 (generate.js의 restoreJobQueue 브릿지 함수 사용) */
        if (state.jobQueue && Array.isArray(state.jobQueue)) {
            if (typeof restoreJobQueue === 'function') {
                restoreJobQueue(state.jobQueue);
            }
        }
        if (state.pathTemplate && document.getElementById('batch-path-template')) {
            document.getElementById('batch-path-template').value = state.pathTemplate;
        }
    }

    /**
     * 백엔드에서 저장된 상태를 불러온다.
     * 응답 형식: { status: "success", state: {...} } 또는 { status: "not_found" }
     * 실제 상태 객체(state)만 반환하며, 실패 시 null 반환.
     */
    async loadStateFromServer() {
        try {
            const data = await API.get('/assetmanager/api/load_state');
            if (data && data.status === 'success' && data.state) {
                return data.state;
            }
            console.warn("저장된 상태 없음 (status:", data?.status, ")");
            return null;
        } catch (e) {
            console.error("상태 로드 에러:", e);
        }
        return null;
    }

    /** 현재 화면 상태를 서버에 즉시 저장. 초기 로딩 중에는 덮어쓰기를 방지한다. */
    saveState() {
        if (!window.appStateLoaded) return;
        const state = this.getCurrentState();
        API.post('/assetmanager/api/save_state', state)
            .catch(err => console.error("상태 저장 실패:", err));
    }

    /** 0.5초 디바운싱이 적용된 저장 함수. input/change 이벤트에 주로 사용. */
    debounceSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveState();
        }, 500);
    }
}

/* const는 window 속성을 만들지 않으므로 반드시 window에 명시적으로 할당 */
window.appStateManager = new AppStateManager();
