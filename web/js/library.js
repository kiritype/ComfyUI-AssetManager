/**
 * library.js — 프롬프트 라이브러리 관리 모듈
 * 작품(Work) > 그룹(Category) > 조각(Item) 3단 계층 구조를 지원합니다.
 * 아코디언 트리, 모달 편집, 드래그앤드롭 정렬, 컨텍스트 메뉴 복사/붙여넣기,
 * 직교곱(Cartesian Product) 기반 배치 큐 전송, 내보내기/가져오기 기능을 제공합니다.
 */

let libraryData = { works: [] };
let activeWorkId = null;
let activeCategoryId = null;
let selectedSet = {};
let editingState = { work: null, category: null, item: null };
let clipboardGroup = null;

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const raw = await API.get('/assetmanager/api/library');
        libraryData = migrateLibraryData(raw);
    } catch (e) {
        console.warn("라이브러리 로드 오류, 빈 데이터로 시작:", e);
        libraryData = migrateLibraryData(null);
    }
    renderWorkTree();

    document.addEventListener('click', () => {
        document.getElementById('lib-context-menu').style.display = 'none';
    });
});

/* ──────────────────────────────────────────────
   데이터 마이그레이션
   ────────────────────────────────────────────── */

/**
 * 구 포맷(categories 배열만 있는 형태)을 새 포맷(works 배열)으로 자동 변환.
 * 복사 버그로 발생한 중복 그룹 ID도 함께 수정한다.
 */
function migrateLibraryData(data) {
    let result = { works: [] };
    if (!data) return result;

    if (data.works && Array.isArray(data.works)) {
        result = data;
    } else if (data.categories && Array.isArray(data.categories)) {
        console.log("[Library] 구 포맷 감지, 자동 마이그레이션 실행");
        result = { works: [{ id: "default", name: "기본", categories: data.categories }] };
    }

    const seenCatIds = new Set();
    let hasModifiedIds = false;

    result.works.forEach(work => {
        if (!work.categories) return;
        work.categories.forEach(cat => {
            if (seenCatIds.has(cat.id)) {
                cat.id = 'cat_fix_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                hasModifiedIds = true;
            }
            seenCatIds.add(cat.id);
        });
    });

    if (hasModifiedIds || (data.categories && !data.works)) {
        API.post('/assetmanager/api/library', result)
            .catch(err => console.error("마이그레이션 저장 실패:", err));
    }

    return result;
}

/* ──────────────────────────────────────────────
   헬퍼 함수
   ────────────────────────────────────────────── */

/** 현재 활성화된 작품 객체를 반환 */
function getActiveWork() {
    return libraryData.works.find(w => w.id === activeWorkId) || null;
}

/** 현재 활성화된 그룹 객체를 반환 */
function getActiveCategory() {
    const work = getActiveWork();
    if (!work) return null;
    return work.categories.find(c => c.id === activeCategoryId) || null;
}

/** 모든 작품의 그룹을 1차원 배열로 반환 */
function getAllCategories() {
    const result = [];
    libraryData.works.forEach(w => w.categories.forEach(cat => result.push(cat)));
    return result;
}

let libraryAutoSaveTimer;

/** 라이브러리 데이터를 500ms 디바운스로 서버에 자동 저장 */
function debounceLibrarySave() {
    clearTimeout(libraryAutoSaveTimer);
    libraryAutoSaveTimer = setTimeout(async () => {
        API.post('/assetmanager/api/library', libraryData)
            .catch(err => console.error("라이브러리 저장 실패:", err));
    }, 500);
}

/** 즉시 저장 (사용자가 명시적으로 저장 버튼을 클릭한 경우) */
async function saveLibrary() {
    clearTimeout(libraryAutoSaveTimer);
    try {
        await API.post('/assetmanager/api/library', libraryData);
        alert("프롬프트 라이브러리가 저장되었습니다.");
    } catch (e) {
        console.error("라이브러리 저장 에러:", e);
    }
}

/* ──────────────────────────────────────────────
   작품/그룹 수정 모달
   ────────────────────────────────────────────── */

/**
 * 작품 또는 그룹의 ID/이름을 수정하는 모달을 연다.
 * @param {string} type - 'work' 또는 'category'
 * @param {string} id - 수정할 대상의 ID
 */
function openWorkEditModal(type, id) {
    let target;
    if (type === 'work') {
        target = libraryData.works.find(w => w.id === id);
        document.getElementById('work-edit-modal-title').innerText = '작품 수정';
    } else {
        const work = getActiveWork();
        if (!work) return;
        target = work.categories.find(c => c.id === id);
        document.getElementById('work-edit-modal-title').innerText = '그룹 수정';
    }
    if (!target) return;

    document.getElementById('work-edit-type').value = type;
    document.getElementById('work-edit-original-id').value = target.id;
    document.getElementById('work-edit-id').value = target.id;
    document.getElementById('work-edit-name').value = target.name;
    document.getElementById('work-edit-modal').style.display = 'flex';
}

/** 수정 모달 닫기 */
function closeWorkEditModal() {
    document.getElementById('work-edit-modal').style.display = 'none';
}

/** 수정 모달에서 입력된 값을 데이터에 반영 */
function saveWorkEditModal() {
    const type = document.getElementById('work-edit-type').value;
    const oldId = document.getElementById('work-edit-original-id').value;
    const newId = document.getElementById('work-edit-id').value.trim();
    const newName = document.getElementById('work-edit-name').value.trim();

    if (!newId || !newName) { alert("ID와 이름을 모두 입력해주세요."); return; }

    if (type === 'work') {
        const work = libraryData.works.find(w => w.id === oldId);
        if (!work) return;
        if (newId !== oldId && libraryData.works.some(w => w.id === newId)) {
            alert("이미 존재하는 작품 ID입니다."); return;
        }
        if (activeWorkId === oldId) activeWorkId = newId;
        work.id = newId;
        work.name = newName;
    } else {
        const work = getActiveWork();
        if (!work) return;
        const cat = work.categories.find(c => c.id === oldId);
        if (!cat) return;
        if (newId !== oldId && work.categories.some(c => c.id === newId)) {
            alert("같은 작품 내에 중복된 그룹 ID입니다."); return;
        }
        if (selectedSet[oldId] !== undefined) {
            selectedSet[newId] = selectedSet[oldId];
            delete selectedSet[oldId];
        }
        if (activeCategoryId === oldId) activeCategoryId = newId;
        cat.id = newId;
        cat.name = newName;
    }

    closeWorkEditModal();
    renderWorkTree();
    renderItems();
    renderBuilder();
    debounceLibrarySave();
}

/* ──────────────────────────────────────────────
   작품(Work) 관리
   ────────────────────────────────────────────── */

/** 새 작품을 추가하고 수정 모달을 바로 연다 */
function addWork() {
    const newId = 'work_' + Date.now();
    libraryData.works.push({ id: newId, name: "새 작품", categories: [] });
    activeWorkId = newId;
    renderWorkTree();
    openWorkEditModal('work', newId);
    debounceLibrarySave();
}

/** 작품과 하위 모든 그룹/조각을 삭제 */
function deleteWork(e, workId) {
    e.stopPropagation();
    const work = libraryData.works.find(w => w.id === workId);
    if (!work) return;
    if (!confirm(`'${work.name}' 작품과 포함된 모든 그룹/조각이 삭제됩니다.\n계속할까요?`)) return;
    libraryData.works = libraryData.works.filter(w => w.id !== workId);
    if (activeWorkId === workId) { activeWorkId = null; activeCategoryId = null; }
    renderWorkTree();
    renderItems();
    debounceLibrarySave();
}

/** 작품을 펼치거나 접는다 */
function toggleWork(workId) {
    activeWorkId = activeWorkId === workId ? null : workId;
    activeCategoryId = null;
    renderWorkTree();
    renderItems();
}

/* ──────────────────────────────────────────────
   그룹(Category) 관리
   ────────────────────────────────────────────── */

/** 현재 활성 작품에 새 그룹을 추가 */
function addCategory() {
    const work = getActiveWork();
    if (!work) { alert("먼저 작품을 선택(펼치기)해 주세요."); return; }
    const newId = 'cat_' + Date.now();
    work.categories.push({ id: newId, name: "새 그룹", items: [] });
    activeCategoryId = newId;
    renderWorkTree();
    renderItems();
    openWorkEditModal('category', newId);
    debounceLibrarySave();
}

/** 그룹과 하위 조각을 삭제 */
function deleteCategory(e, catId) {
    e.stopPropagation();
    const work = getActiveWork();
    if (!work) return;
    if (!confirm("이 그룹과 포함된 모든 조각이 삭제됩니다.\n계속할까요?")) return;
    work.categories = work.categories.filter(c => c.id !== catId);
    if (activeCategoryId === catId) activeCategoryId = null;
    renderWorkTree();
    renderItems();
    debounceLibrarySave();
}

/** 특정 그룹을 선택하고 해당 그룹의 조각 목록을 표시 */
function selectCategory(workId, catId) {
    activeWorkId = workId;
    activeCategoryId = catId;
    renderWorkTree();
    renderItems();
    document.getElementById('btn-add-item').style.display = 'block';
}

/* ──────────────────────────────────────────────
   트리 렌더링
   ────────────────────────────────────────────── */

/** 좌측 패널의 작품 > 그룹 아코디언 트리를 렌더링 */
function renderWorkTree() {
    const tree = document.getElementById('work-tree');
    if (!tree) return;
    if (libraryData.works.length === 0) {
        tree.innerHTML = '<p class="empty-msg">작품을 추가해 주세요.</p>';
        return;
    }

    let html = '';
    libraryData.works.forEach((work, wIdx) => {
        const isExpanded = activeWorkId === work.id;
        html += `<div class="work-node" data-work-id="${work.id}" data-work-idx="${wIdx}">`;

        html += `<div class="work-header ${isExpanded ? 'active' : ''}" draggable="true"
            onclick="toggleWork('${work.id}')"
            oncontextmenu="event.preventDefault(); showWorkContextMenu(event, '${work.id}');">`;
        html += `<span class="work-arrow ${isExpanded ? 'expanded' : ''}">▶</span>`;
        html += `<span class="work-name">${work.name}</span>`;
        html += `<div class="action-btns">`;
        html += `<button class="btn-edit" onclick="event.stopPropagation(); openWorkEditModal('work', '${work.id}')" title="수정">✏️</button>`;
        html += `<button class="btn-delete" onclick="deleteWork(event, '${work.id}')" title="삭제">×</button>`;
        html += `</div></div>`;

        html += `<div class="work-children ${isExpanded ? 'expanded' : ''}">`;
        if (work.categories.length === 0) {
            html += '<p class="empty-msg" style="font-size:0.8em; padding: 5px 10px;">그룹 없음</p>';
        } else {
            work.categories.forEach((cat, cIdx) => {
                const isCatActive = activeCategoryId === cat.id && activeWorkId === work.id;
                html += `<div class="group-node ${isCatActive ? 'active' : ''}" draggable="true"
                    data-work-id="${work.id}" data-cat-id="${cat.id}" data-cat-idx="${cIdx}"
                    onclick="selectCategory('${work.id}', '${cat.id}')"
                    oncontextmenu="event.preventDefault(); showGroupContextMenu(event, '${work.id}', '${cat.id}');">`;
                html += `<span class="group-name">${cat.name} <small style="color:#666;">(${cat.items.length})</small></span>`;
                html += `<div class="action-btns">`;
                html += `<button class="btn-edit" onclick="event.stopPropagation(); openWorkEditModal('category', '${cat.id}')" title="수정">✏️</button>`;
                html += `<button class="btn-delete" onclick="deleteCategory(event, '${cat.id}')" title="삭제">×</button>`;
                html += `</div></div>`;
            });
        }
        html += `</div></div>`;
    });

    tree.innerHTML = html;
    attachTreeDragHandlers();
}

/* ──────────────────────────────────────────────
   드래그앤드롭 (작품 & 그룹 순서 변경)
   ────────────────────────────────────────────── */

/** 트리 내 작품/그룹 요소에 드래그앤드롭 이벤트를 바인딩 */
function attachTreeDragHandlers() {
    const tree = document.getElementById('work-tree');
    if (!tree) return;

    /* 작품 헤더 드래그 */
    tree.querySelectorAll('.work-header[draggable]').forEach(header => {
        header.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const workNode = header.closest('.work-node');
            workNode.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'work', id: workNode.dataset.workId }));
            e.dataTransfer.effectAllowed = 'move';
        });
        header.addEventListener('dragend', () => {
            tree.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom').forEach(el => {
                el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
            });
        });
    });

    /* 그룹 노드 드래그 */
    tree.querySelectorAll('.group-node[draggable]').forEach(node => {
        node.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            node.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'group', workId: node.dataset.workId, catId: node.dataset.catId
            }));
            e.dataTransfer.effectAllowed = 'move';
        });
        node.addEventListener('dragend', () => {
            tree.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom').forEach(el => {
                el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
            });
        });
    });

    /* 작품 드롭 영역 */
    tree.querySelectorAll('.work-node').forEach(workNode => {
        workNode.addEventListener('dragover', (e) => {
            e.preventDefault();
            const data = getDragData(e);
            if (!data || data.type !== 'work') return;
            e.dataTransfer.dropEffect = 'move';
            const rect = workNode.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            workNode.classList.remove('drag-over-top', 'drag-over-bottom');
            workNode.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
        });
        workNode.addEventListener('dragleave', () => {
            workNode.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        workNode.addEventListener('drop', (e) => {
            e.preventDefault();
            workNode.classList.remove('drag-over-top', 'drag-over-bottom');
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.type !== 'work') return;
                const fromIdx = libraryData.works.findIndex(w => w.id === data.id);
                const toIdx = parseInt(workNode.dataset.workIdx);
                if (fromIdx === -1 || fromIdx === toIdx) return;

                const rect = workNode.getBoundingClientRect();
                const insertBefore = e.clientY < rect.top + rect.height / 2;
                const [moved] = libraryData.works.splice(fromIdx, 1);
                let newIdx = insertBefore ? toIdx : toIdx + 1;
                if (fromIdx < toIdx) newIdx--;
                libraryData.works.splice(newIdx, 0, moved);
                renderWorkTree();
                debounceLibrarySave();
            } catch (err) { }
        });
    });

    /* 그룹 드롭 영역 */
    tree.querySelectorAll('.group-node').forEach(node => {
        node.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const types = e.dataTransfer.types;
            if (!types.includes('text/plain')) return;
            e.dataTransfer.dropEffect = 'move';

            node.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
            const rect = node.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            node.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
        });
        node.addEventListener('dragleave', () => {
            node.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
        });
        node.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            node.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));

                /* 조각(Item)을 다른 그룹으로 이동 */
                if (data.type === 'item') {
                    const destWorkId = node.dataset.workId;
                    const destCatId = node.dataset.catId;

                    if (data.catId === destCatId) return;

                    const srcCat = getAllCategories().find(c => c.id === data.catId);
                    const destWork = libraryData.works.find(w => w.id === destWorkId);
                    if (!srcCat || !destWork) return;
                    const destCat = destWork.categories.find(c => c.id === destCatId);
                    if (!destCat) return;

                    const fromIdx = parseInt(data.idx);
                    if (isNaN(fromIdx) || fromIdx < 0 || fromIdx >= srcCat.items.length) return;

                    const [moved] = srcCat.items.splice(fromIdx, 1);
                    destCat.items.push(moved);

                    if (activeCategoryId === data.catId || activeCategoryId === destCatId) {
                        renderItems();
                    }
                    debounceLibrarySave();
                    return;
                }

                /* 그룹(Category) 순서 변경 */
                if (data.type === 'group') {
                    const srcWork = libraryData.works.find(w => w.id === data.workId);
                    const destWork = libraryData.works.find(w => w.id === node.dataset.workId);
                    if (!srcWork || !destWork) return;

                    const fromIdx = srcWork.categories.findIndex(c => c.id === data.catId);
                    const toIdx = parseInt(node.dataset.catIdx);
                    if (fromIdx === -1) return;

                    const rect = node.getBoundingClientRect();
                    const insertBefore = e.clientY < rect.top + rect.height / 2;

                    const [moved] = srcWork.categories.splice(fromIdx, 1);
                    let newIdx = insertBefore ? toIdx : toIdx + 1;
                    if (srcWork === destWork && fromIdx < toIdx) newIdx--;
                    destWork.categories.splice(newIdx, 0, moved);

                    renderWorkTree();
                    debounceLibrarySave();
                }
            } catch (err) { }
        });
    });
}

/** dragover 이벤트에서 드래그 데이터 타입을 확인하는 헬퍼 */
function getDragData(e) {
    if (e.dataTransfer.types.includes('text/plain')) {
        return { type: 'work' };
    }
    return null;
}

/* ──────────────────────────────────────────────
   컨텍스트 메뉴 (복사/잘라내기/붙여넣기)
   ────────────────────────────────────────────── */

/** 작품 우클릭 컨텍스트 메뉴 표시 */
function showWorkContextMenu(e, workId) {
    e.stopPropagation();
    const menu = document.getElementById('lib-context-menu');
    let html = '';
    if (clipboardGroup) {
        html += `<div class="ctx-item" onclick="pasteGroupToWork('${workId}')">📥 그룹 붙여넣기</div>`;
        html += `<div class="ctx-divider"></div>`;
    }
    html += `<div class="ctx-item" onclick="openWorkEditModal('work', '${workId}')">✏️ 작품 수정</div>`;
    html += `<div class="ctx-item" onclick="deleteWork(event, '${workId}')">🗑️ 작품 삭제</div>`;

    menu.innerHTML = html;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
}

/** 그룹 우클릭 컨텍스트 메뉴 표시 */
function showGroupContextMenu(e, workId, catId) {
    e.stopPropagation();
    const menu = document.getElementById('lib-context-menu');
    let html = '';
    html += `<div class="ctx-item" onclick="copyGroup('${workId}', '${catId}')">📋 그룹 복사</div>`;
    html += `<div class="ctx-item" onclick="cutGroup('${workId}', '${catId}')">✂️ 그룹 잘라내기</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" onclick="openWorkEditModal('category', '${catId}')">✏️ 그룹 수정</div>`;
    html += `<div class="ctx-item" onclick="deleteCategory(event, '${catId}')">🗑️ 그룹 삭제</div>`;

    menu.innerHTML = html;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
}

/** 그룹을 클립보드에 복사 */
function copyGroup(workId, catId) {
    const work = libraryData.works.find(w => w.id === workId);
    if (!work) return;
    const cat = work.categories.find(c => c.id === catId);
    if (!cat) return;
    clipboardGroup = { action: 'copy', workId, catId, data: JSON.parse(JSON.stringify(cat)) };
    document.getElementById('lib-context-menu').style.display = 'none';
}

/** 그룹을 클립보드에 잘라내기 */
function cutGroup(workId, catId) {
    const work = libraryData.works.find(w => w.id === workId);
    if (!work) return;
    const cat = work.categories.find(c => c.id === catId);
    if (!cat) return;
    clipboardGroup = { action: 'cut', workId, catId, data: JSON.parse(JSON.stringify(cat)) };
    document.getElementById('lib-context-menu').style.display = 'none';
}

/** 클립보드의 그룹을 대상 작품에 붙여넣기 */
function pasteGroupToWork(targetWorkId) {
    if (!clipboardGroup) return;
    const targetWork = libraryData.works.find(w => w.id === targetWorkId);
    if (!targetWork) return;

    let newCat = JSON.parse(JSON.stringify(clipboardGroup.data));

    if (clipboardGroup.action === 'copy') {
        newCat.id = 'cat_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    } else {
        if (targetWork.categories.some(c => c.id === newCat.id)) {
            newCat.id = newCat.id + '_copy_' + Date.now();
        }
    }

    targetWork.categories.push(newCat);

    if (clipboardGroup.action === 'cut') {
        const srcWork = libraryData.works.find(w => w.id === clipboardGroup.workId);
        if (srcWork) {
            srcWork.categories = srcWork.categories.filter(c => c.id !== clipboardGroup.catId);
        }
        clipboardGroup = null;
    }

    document.getElementById('lib-context-menu').style.display = 'none';
    renderWorkTree();
    debounceLibrarySave();
}

/* ──────────────────────────────────────────────
   조각(Item) 관리 및 렌더링
   ────────────────────────────────────────────── */

/**
 * 현재 활성 그룹의 조각 목록을 렌더링.
 * requires 속성이 있는 조각은 부모 조각이 선택되었을 때만 표시된다.
 */
function renderItems() {
    const list = document.getElementById('item-list');
    const category = getActiveCategory();

    if (!category) {
        document.getElementById('current-cat-name').innerText = `📝 그룹을 선택하세요`;
        list.innerHTML = '<p class="empty-msg" style="width:100%;">그룹을 선택해 주세요.</p>';
        document.getElementById('btn-add-item').style.display = 'none';
        return;
    }

    document.getElementById('current-cat-name').innerText = `📝 ${category.name}`;
    document.getElementById('btn-add-item').style.display = 'block';

    const activeParentIds = [];
    for (const [catId, itemSet] of Object.entries(selectedSet)) {
        if (itemSet && itemSet.size > 0) {
            for (const id of itemSet) activeParentIds.push(`${catId}_${id}`);
        }
    }

    let html = '';
    category.items.forEach((item, idx) => {
        if (item.requires && Array.isArray(item.requires) && item.requires.length > 0) {
            const isRequirementMet = item.requires.some(reqId => activeParentIds.includes(reqId));
            if (!isRequirementMet) return;
        }

        const catSet = selectedSet[activeCategoryId];
        const isSelected = catSet && catSet.has(item.id);
        const isFirst = idx === 0;
        const isLast = idx === category.items.length - 1;

        html += `
            <div class="prompt-tag ${isSelected ? 'selected' : ''}" 
                 draggable="true" data-cat-id="${activeCategoryId}" data-item-idx="${idx}" data-item-id="${item.id}"
                 onclick="selectItemToSet('${item.id}', event)"
                 oncontextmenu="event.preventDefault(); openPromptEditModal('${item.id}');">
                <span class="tag-name">${item.name}</span>
                <span class="tag-id" style="display:none;">${item.id}</span>
                <span class="tag-value" style="display:none;">${item.prompt}</span>
                <button class="tag-edit-btn" onclick="event.stopPropagation(); openPromptEditModal('${item.id}');" title="수정">✏️</button>
                <button class="tag-delete-btn" onclick="event.stopPropagation(); deleteItem(event, '${item.id}');" title="삭제">×</button>
            </div>
        `;
    });

    if (html === '') {
        html = '<p class="empty-msg" style="width:100%; font-size: 0.9em;">조건에 맞는(활성화된) 조각이 없습니다.</p>';
    }
    list.innerHTML = html;
    if (typeof filterPromptTags === 'function') filterPromptTags();
    attachItemDragHandlers();
}

/** 조각 태그에 드래그앤드롭 이벤트를 바인딩 (같은 그룹 내 순서 변경용) */
function attachItemDragHandlers() {
    const list = document.getElementById('item-list');
    if (!list) return;

    list.querySelectorAll('.prompt-tag[draggable]').forEach(tag => {
        tag.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            tag.classList.add('dragging-item');
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'item',
                catId: tag.dataset.catId,
                itemId: tag.dataset.itemId,
                idx: tag.dataset.itemIdx
            }));
            e.dataTransfer.effectAllowed = 'move';
        });

        tag.addEventListener('dragend', () => {
            list.querySelectorAll('.dragging-item, .drag-over-left, .drag-over-right').forEach(el => {
                el.classList.remove('dragging-item', 'drag-over-left', 'drag-over-right');
            });
        });

        tag.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.dataTransfer.types.includes('text/plain')) return;
            e.dataTransfer.dropEffect = 'move';

            const rect = tag.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            tag.classList.remove('drag-over-left', 'drag-over-right');
            tag.classList.add(e.clientX < midX ? 'drag-over-left' : 'drag-over-right');
        });

        tag.addEventListener('dragleave', () => {
            tag.classList.remove('drag-over-left', 'drag-over-right');
        });

        tag.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            tag.classList.remove('drag-over-left', 'drag-over-right');

            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.type !== 'item') return;

                const category = getActiveCategory();
                if (!category || category.id !== data.catId) return;

                const fromIdx = parseInt(data.idx);
                const toIdx = parseInt(tag.dataset.itemIdx);
                if (fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;

                const rect = tag.getBoundingClientRect();
                const insertBefore = e.clientX < rect.left + rect.width / 2;

                const [moved] = category.items.splice(fromIdx, 1);
                let newIdx = insertBefore ? toIdx : toIdx + 1;
                if (fromIdx < toIdx) newIdx--;

                category.items.splice(newIdx, 0, moved);
                renderItems();
                debounceLibrarySave();
            } catch (err) { }
        });
    });
}

/* ──────────────────────────────────────────────
   조각 편집 모달
   ────────────────────────────────────────────── */

/** 조각의 ID, 이름, 프롬프트, 의존성(requires)을 수정하는 모달을 연다 */
function openPromptEditModal(itemId) {
    const category = getActiveCategory();
    if (!category) return;
    const item = category.items.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('edit-prompt-original-id').value = item.id;
    document.getElementById('edit-prompt-name').value = item.name || '';
    document.getElementById('edit-prompt-id').value = item.id || '';
    document.getElementById('edit-prompt-value').value = item.prompt || '';
    const requiresStr = (item.requires && Array.isArray(item.requires)) ? item.requires.join(', ') : '';
    document.getElementById('edit-prompt-requires').value = requiresStr;
    document.getElementById('prompt-edit-modal').style.display = 'flex';
}

/** 조각 편집 모달 닫기 */
function closePromptEditModal() {
    document.getElementById('prompt-edit-modal').style.display = 'none';
}

/** 조각 편집 모달에서 입력된 값을 데이터에 반영 */
function savePromptEditModal() {
    const category = getActiveCategory();
    if (!category) return;
    const oldId = document.getElementById('edit-prompt-original-id').value;
    const item = category.items.find(i => i.id === oldId);
    if (!item) return;

    const newId = document.getElementById('edit-prompt-id').value.trim();
    if (!newId) { alert("ID는 비어둘 수 없습니다."); return; }
    if (newId !== oldId && category.items.some(i => i.id === newId)) {
        alert("동일한 그룹 내에 중복된 ID가 존재합니다."); return;
    }

    item.id = newId;
    item.name = document.getElementById('edit-prompt-name').value.trim();
    item.prompt = document.getElementById('edit-prompt-value').value;

    const reqStr = document.getElementById('edit-prompt-requires').value;
    const reqArray = reqStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (reqArray.length > 0) { item.requires = reqArray; } else { delete item.requires; }

    if (selectedSet[activeCategoryId] === oldId) selectedSet[activeCategoryId] = newId;

    closePromptEditModal();
    renderItems();
    renderBuilder();
    debounceLibrarySave();
}

/** 새 조각을 추가하고 편집 모달을 바로 연다 */
function addItem() {
    const category = getActiveCategory();
    if (!category) return;
    const newItemId = 'item_' + Date.now();
    category.items.push({ id: newItemId, name: "새 조각", prompt: "" });
    renderItems();
    openPromptEditModal(newItemId);
    debounceLibrarySave();
}

/** 조각 삭제 */
function deleteItem(e, id) {
    if (e) e.stopPropagation();
    if (!confirm(`'${id}' 조각을 삭제하시겠습니까?`)) return;
    const category = getActiveCategory();
    if (!category) return;
    category.items = category.items.filter(i => i.id !== id);
    if (selectedSet[activeCategoryId] === id) delete selectedSet[activeCategoryId];
    renderItems();
    renderBuilder();
    debounceLibrarySave();
}

/**
 * 조각을 선택 세트에 추가/제거.
 * 일반 클릭: 단일 토글, Shift 클릭: 같은 그룹 내 다중 추가/해제
 */
function selectItemToSet(itemId, event) {
    if (!activeCategoryId) return;
    const isShift = event && event.shiftKey;

    if (!selectedSet[activeCategoryId]) selectedSet[activeCategoryId] = new Set();
    const catSet = selectedSet[activeCategoryId];

    if (isShift) {
        if (catSet.has(itemId)) catSet.delete(itemId);
        else catSet.add(itemId);
    } else {
        if (catSet.size === 1 && catSet.has(itemId)) {
            catSet.clear();
        } else {
            catSet.clear();
            catSet.add(itemId);
        }
    }

    if (catSet.size === 0) delete selectedSet[activeCategoryId];

    renderItems();
    renderBuilder();
}

/* ──────────────────────────────────────────────
   검색
   ────────────────────────────────────────────── */

/** 조각 목록을 검색어로 필터링하여 보이기/숨기기 처리 */
function filterPromptTags() {
    const input = document.getElementById('prompt-search-input');
    if (!input) return;
    const filter = input.value.toLowerCase().trim();
    document.querySelectorAll('#item-list .prompt-tag').forEach(tag => {
        tag.style.display = tag.innerText.toLowerCase().includes(filter) ? 'flex' : 'none';
    });
}

/* ──────────────────────────────────────────────
   세트 빌더 (선택 미리보기 & 배치 전송)
   ────────────────────────────────────────────── */

/** 선택된 모든 조각을 초기화 */
function clearSelectedSet() {
    selectedSet = {};
    renderItems();
    renderBuilder();
}

/**
 * 여러 배열의 직교곱(Cartesian Product)을 생성.
 * 배치 전송 시 다중 선택된 그룹들의 모든 조합을 계산하는 데 사용된다.
 */
function cartesianProduct(arrays) {
    if (arrays.length === 0) return [[]];
    return arrays.reduce((acc, curr) => {
        const result = [];
        acc.forEach(a => curr.forEach(b => result.push([...a, b])));
        return result;
    }, [[]]);
}

/**
 * 조합 내 모든 requires 제약 조건이 충족되는지 검증.
 * 각 항목의 requires에 지정된 부모 ID가 같은 조합 내에 존재해야 유효하다.
 */
function isValidCombination(combo) {
    const selectedIds = new Set();
    combo.forEach(entry => selectedIds.add(`${entry.catId}_${entry.item.id}`));

    return combo.every(entry => {
        if (!entry.item.requires || entry.item.requires.length === 0) return true;
        return entry.item.requires.some(reqId => selectedIds.has(reqId));
    });
}

/** 다중 선택 시 유효한 조합의 총 수를 계산하여 반환 */
function countValidCombinations() {
    const allCats = getAllCategories();
    const groupArrays = [];

    allCats.forEach(cat => {
        const catSet = selectedSet[cat.id];
        if (catSet && catSet.size > 0) {
            const items = [];
            for (const itemId of catSet) {
                const item = cat.items.find(i => i.id === itemId);
                if (item) items.push({ catId: cat.id, catName: cat.name, item });
            }
            if (items.length > 0) groupArrays.push(items);
        }
    });

    if (groupArrays.length === 0) return 0;
    const combos = cartesianProduct(groupArrays);
    return combos.filter(isValidCombination).length;
}

/** 우측 빌더 패널에 현재 선택 상태를 렌더링 */
function renderBuilder() {
    const view = document.getElementById('selected-set-view');
    let pathParts = [];
    let html = "";
    let hasMulti = false;

    getAllCategories().forEach(cat => {
        const catSet = selectedSet[cat.id];
        if (catSet && catSet.size > 0) {
            const items = [];
            for (const itemId of catSet) {
                const item = cat.items.find(i => i.id === itemId);
                if (item) items.push(item);
            }

            if (items.length === 1) {
                pathParts.push(items[0].name);
                html += `<div class="list-item active" style="margin-bottom:10px;"><small>${cat.name}</small><span class="item-name">${items[0].name}</span></div>`;
            } else if (items.length > 1) {
                hasMulti = true;
                pathParts.push(`[${cat.name}×${items.length}]`);
                const names = items.map(i => i.name).join(', ');
                html += `<div class="list-item active" style="margin-bottom:10px; border-left: 4px solid #FF9800;">
                    <small>${cat.name} <span style="color:#FF9800; font-weight:bold;">(×${items.length})</span></small>
                    <span class="item-name" style="font-size:0.85em;">${names}</span>
                </div>`;
            }
        }
    });

    view.innerHTML = html || '<p class="empty-msg">조각을 선택해 보세요.</p>';
    document.getElementById('path-preview').innerText = pathParts.join('_') || "선택 없음";

    const sendBtn = document.querySelector('#lib-builder .builder-footer .btn-primary');
    if (sendBtn) {
        const validCount = countValidCombinations();
        if (validCount > 1) {
            sendBtn.textContent = `📥 ${validCount}건 일괄 전송`;
            sendBtn.style.background = '#FF9800';
        } else {
            sendBtn.textContent = '📥 이 세트를 대기열로 전송';
            sendBtn.style.background = '';
        }
    }
}

/**
 * 선택된 조각들의 직교곱 조합을 생성하고,
 * requires 제약 조건을 검증한 후 유효한 조합만 배치 큐에 추가한다.
 */
function sendSetToQueue() {
    if (Object.keys(selectedSet).length === 0) return alert("선택된 조각이 없습니다.");
    let rCount = parseInt(document.getElementById('global-repeat-count')?.value || "1");
    if (isNaN(rCount) || rCount < 1) rCount = 1;

    const allCats = getAllCategories();
    const groupArrays = [];

    allCats.forEach(cat => {
        const catSet = selectedSet[cat.id];
        if (catSet && catSet.size > 0) {
            const items = [];
            for (const itemId of catSet) {
                const item = cat.items.find(i => i.id === itemId);
                if (item) items.push({ catId: cat.id, catName: cat.name, item });
            }
            if (items.length > 0) groupArrays.push(items);
        }
    });

    if (groupArrays.length === 0) return alert("선택된 조각이 없습니다.");

    const allCombos = cartesianProduct(groupArrays);
    const validCombos = allCombos.filter(isValidCombination);
    const skippedCount = allCombos.length - validCombos.length;

    if (validCombos.length === 0) {
        return alert("선택한 조합이 모두 제약 조건(requires)에 의해 제외되었습니다.");
    }

    validCombos.forEach((combo, i) => {
        const jobData = { id: Date.now() + i, labels: {}, fullPrompt: [], repeatCount: rCount };
        combo.forEach(entry => {
            jobData.labels[entry.catName] = entry.item.name;
            jobData.fullPrompt.push(entry.item.prompt);
        });
        addJobToQueue(jobData);
    });

    document.getElementById('mode-batch').checked = true;
    toggleGenMode();

    let msg = `✅ ${validCombos.length}건의 작업이 대기열에 추가되었습니다.`;
    if (skippedCount > 0) msg += `\n(제약 조건에 의해 ${skippedCount}건 제외됨)`;
    alert(msg);

    clearSelectedSet();
}

/* ──────────────────────────────────────────────
   내보내기 / 가져오기
   ────────────────────────────────────────────── */

/** 현재 라이브러리 데이터를 JSON 파일로 다운로드 */
function exportLibrary() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(libraryData, null, 4));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "prompt_library.json");
    a.click();
}

/** JSON 파일을 업로드하여 라이브러리 데이터를 교체 */
async function importLibrary(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            libraryData = migrateLibraryData(JSON.parse(e.target.result));
            await API.post('/assetmanager/api/library', libraryData);
            activeWorkId = null;
            activeCategoryId = null;
            renderWorkTree();
            renderItems();
            alert("라이브러리를 성공적으로 불러왔습니다.");
        } catch (err) { alert("잘못된 JSON 파일입니다."); }
    };
    reader.readAsText(file);
}