/**
 * main.js — 앱 초기화 부트스트래퍼 (Bootstrapper)
 * 각종 매니저(UIManager, AppStateManager) 및 서브 모듈들을 연결하는 역할만 수행합니다.
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. 순수 UI 모듈 초기화 (이벤트 리스너 바인딩 등)
    if (window.UIManager) {
        window.UIManager.init();
    }

    // 2. 외부 데이터 통신 로드 (드롭다운, 이전 화면 상태)
    await loadDropdowns();

    // 3. 상태 매니저를 통한 초기 UI 복원
    if (window.appStateManager) {
        const savedState = await window.appStateManager.loadStateFromServer();
        // UI 렌더링 지연 방지 플래그 (중요: 복원 전엔 저장 안 되도록 막음)
        window.appStateLoaded = false;

        if (savedState) {
            window.appStateManager.applyState(savedState);
        } else {
            if (window.UIManager) window.UIManager.openTab('tab-generate');
        }

        // setTimeout을 통해 현재 콜스택이 비워진 뒤(UI 복원이 끝난 뒤) 저장 허용
        setTimeout(() => {
            window.appStateLoaded = true;
        }, 100);
    }

    // 4. 독립 서브 탭 초기 데이터 Fetch
    if (typeof fetchGallery === 'function') {
        fetchGallery('checkpoints');
    }

    // 5. 전역 폼 입력 변경에 따른 자동 저장 이벤트 바인딩
    document.addEventListener('input', () => {
        if (window.appStateManager && window.appStateLoaded) window.appStateManager.debounceSave();
    });
    document.addEventListener('change', () => {
        if (window.appStateManager && window.appStateLoaded) window.appStateManager.debounceSave();
    });
});