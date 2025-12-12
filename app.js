(function() {
    'use strict';

    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { 
        tg.ready(); 
        tg.expand(); 
    }

    var DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    var DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PRIORITY_EMOJI = {0: '⚪', 1: '🟢', 2: '🟡', 3: '🔴'};
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'По дням' };

    var todayIndex = (function() {
        var d = new Date().getDay();
        return d === 0 ? 6 : d - 1;
    })();
    
    var currentDay = todayIndex;
    var currentView = 'tasks';
    var selectedPriority = 0;
    var selectedRepeatPriority = 0;
    var selectedRepeatType = 'daily';
    var selectedDays = [];
    var confirmCallback = null;
    var priorityTaskId = null;
    var deleteRepeatId = null;

    // ========== STORAGE ==========
    
    function getWeekId() {
        var now = new Date();
        var year = now.getFullYear();
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return year + '_' + week;
    }

    function getStorageKey() {
        return 'weekly_tasks_' + getWeekId();
    }

    function loadTasks() {
        try {
            var data = localStorage.getItem(getStorageKey());
            var tasks = data ? JSON.parse(data) : null;
            
            if (!tasks) {
                tasks = {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
            }
            
            // Убедимся что все дни существуют
            for (var i = 0; i < 7; i++) {
                if (!tasks[i]) tasks[i] = [];
            }
            
            return tasks;
        } catch(e) {
            console.error('Ошибка загрузки задач:', e);
            return {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
        }
    }

    function saveTasks(tasks) {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(tasks));
        } catch(e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    function loadRepeats() {
        try {
            var data = localStorage.getItem('weekly_repeats_v2');
            return data ? JSON.parse(data) : [];
        } catch(e) {
            console.error('Ошибка загрузки повторов:', e);
            return [];
        }
    }

    function saveRepeats(repeats) {
        try {
            localStorage.setItem('weekly_repeats_v2', JSON.stringify(repeats));
        } catch(e) {
            console.error('Ошибка сохранения повторов:', e);
        }
    }

    function generateId() {
        return 'id_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ========== REPEATS SYSTEM ==========
    
    function getRepeatDays(repeat) {
        switch(repeat.type) {
            case 'daily':
                return [0, 1, 2, 3, 4, 5, 6];
            case 'weekdays':
                return [0, 1, 2, 3, 4];
            case 'weekends':
                return [5, 6];
            case 'weekly':
                return repeat.days || [];
            default:
                return [];
        }
    }
    
    function applyRepeats() {
        var tasks = loadTasks();
        var repeats = loadRepeats();
        var weekId = getWeekId();
        var changed = false;

        console.log('Применяем повторы. Неделя:', weekId, 'Повторов:', repeats.length);

        for (var i = 0; i < repeats.length; i++) {
            var repeat = repeats[i];
            
            // Пропускаем неактивные
            if (!repeat.active) {
                console.log('Повтор неактивен:', repeat.text);
                continue;
            }
            
            // Проверяем, применяли ли уже на этой неделе
            var appliedKey = 'applied_' + weekId;
            if (repeat[appliedKey]) {
                console.log('Повтор уже применён на этой неделе:', repeat.text);
                continue;
            }

            var daysToAdd = getRepeatDays(repeat);
            console.log('Повтор:', repeat.text, 'Дни:', daysToAdd);

            for (var j = 0; j < daysToAdd.length; j++) {
                var day = daysToAdd[j];
                
                if (!tasks[day]) tasks[day] = [];
                
                // Проверяем, нет ли уже такой задачи
                var exists = false;
                for (var k = 0; k < tasks[day].length; k++) {
                    if (tasks[day][k].repeatId === repeat.id) {
                        exists = true;
                        break;
                    }
                }

                if (!exists) {
                    console.log('Добавляем задачу в день', day, ':', repeat.text);
                    tasks[day].push({
                        id: generateId(),
                        text: repeat.text,
                        time: repeat.time || null,
                        priority: repeat.priority || 0,
                        done: false,
                        repeatId: repeat.id
                    });
                    changed = true;
                }
            }
            
            // Отмечаем что применили
            repeat[appliedKey] = true;
        }

        if (changed) {
            saveTasks(tasks);
            saveRepeats(repeats);
            console.log('Задачи обновлены');
        }
        
        return tasks;
    }
    
    // Принудительно применить повторы заново
    function reapplyRepeats() {
        var repeats = loadRepeats();
        var weekId = getWeekId();
        var appliedKey = 'applied_' + weekId;
        
        // Сбрасываем флаги применения
        for (var i = 0; i < repeats.length; i++) {
            delete repeats[i][appliedKey];
        }
        
        saveRepeats(repeats);
        return applyRepeats();
    }

    // ========== TOAST ==========
    
    function showToast(message, type) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        var toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' ' + type : '');
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(function() { toast.classList.add('show'); }, 10);
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        }, 2500);
    }

    // ========== HAPTIC ==========
    
    function haptic(type) {
        if (!tg || !tg.HapticFeedback) return;
        try {
            if (type === 'light') tg.HapticFeedback.impactOccurred('light');
            else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
            else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
            else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        } catch(e) {}
    }

    // ========== UI HELPERS ==========
    
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function openModal(id) {
        var modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            haptic('light');
        }
    }

    function closeModal(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        
        modal.classList.remove('active');
        
        if (id === 'modal-add') {
            var form = document.getElementById('form-add-task');
            if (form) form.reset();
            selectedPriority = 0;
            updatePriorityButtons('priority-select', 0);
        }
        
        if (id === 'modal-repeat') {
            var form2 = document.getElementById('form-add-repeat');
            if (form2) form2.reset();
            selectedRepeatPriority = 0;
            selectedRepeatType = 'daily';
            selectedDays = [];
            updatePriorityButtons('repeat-priority-select', 0);
            updateRepeatTypeButtons('daily');
            updateDaysButtons([]);
        }
    }

    function updatePriorityButtons(containerId, priority) {
        var container = document.getElementById(containerId);
        if (!container) return;
        
        var btns = container.querySelectorAll('.priority-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.remove('active');
            if (parseInt(btns[i].getAttribute('data-priority')) === priority) {
                btns[i].classList.add('active');
            }
        }
    }

    function updateRepeatTypeButtons(type) {
        var container = document.getElementById('repeat-type-select');
        if (!container) return;
        
        var btns = container.querySelectorAll('.repeat-type-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.remove('active');
            if (btns[i].getAttribute('data-type') === type) {
                btns[i].classList.add('active');
            }
        }
        
        var daysGroup = document.getElementById('days-select-group');
        if (daysGroup) {
            daysGroup.style.display = type === 'weekly' ? 'block' : 'none';
        }
    }

    function updateDaysButtons(days) {
        var container = document.getElementById('days-select');
        if (!container) return;
        
        var btns = container.querySelectorAll('.day-btn');
        for (var i = 0; i < btns.length; i++) {
            var d = parseInt(btns[i].getAttribute('data-day'));
            if (days.indexOf(d) !== -1) {
                btns[i].classList.add('active');
            } else {
                btns[i].classList.remove('active');
            }
        }
    }

    function updateStats() {
        var tasks = loadTasks();
        var total = 0, done = 0;

        for (var day = 0; day < 7; day++) {
            var dayTasks = tasks[day] || [];
            total += dayTasks.length;
            for (var i = 0; i < dayTasks.length; i++) {
                if (dayTasks[i].done) done++;
            }
        }

        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        
        var fill = document.getElementById('stats-fill');
        var text = document.getElementById('stats-text');
        
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = done + '/' + total;
    }

    function updateTabs() {
        var tasks = loadTasks();
        var tabs = document.querySelectorAll('.tabs .tab');

        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var day = parseInt(tab.getAttribute('data-day'));
            var dayTasks = tasks[day] || [];
            
            var hasUndoneTasks = false;
            for (var j = 0; j < dayTasks.length; j++) {
                if (!dayTasks[j].done) {
                    hasUndoneTasks = true;
                    break;
                }
            }

            tab.classList.remove('active', 'has-tasks', 'today');

            if (day === currentDay) tab.classList.add('active');
            if (hasUndoneTasks) tab.classList.add('has-tasks');
            if (day === todayIndex) tab.classList.add('today');
        }
    }

    // ========== RENDER ==========

    function renderTasks() {
        var tasks = applyRepeats();
        var dayTasks = tasks[currentDay] || [];
        var list = document.getElementById('tasks-list');
        var empty = document.getElementById('empty-state');
        var title = document.getElementById('day-title');

        if (title) title.textContent = DAYS[currentDay];

        // Сортировка: сначала невыполненные, потом по приоритету, потом по времени
        dayTasks.sort(function(a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            if (b.priority !== a.priority) return b.priority - a.priority;
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        if (dayTasks.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
        } else {
            if (empty) empty.classList.remove('show');

            var html = '';
            for (var i = 0; i < dayTasks.length; i++) {
                var t = dayTasks[i];
                var priorityClass = t.priority || 0;
                
                html += '<div class="task-card ' + (t.done ? 'done' : '') + '" data-id="' + t.id + '" data-priority="' + priorityClass + '">';
                html += '<div class="task-checkbox ' + (t.done ? 'checked' : '') + '" data-id="' + t.id + '"></div>';
                html += '<div class="task-content">';
                html += '<div class="task-meta">';
                
                if (t.time) {
                    html += '<span class="task-time">⏰ ' + escapeHtml(t.time) + '</span>';
                }
                
                html += '<span class="task-priority" data-id="' + t.id + '">' + PRIORITY_EMOJI[t.priority || 0] + '</span>';
                
                if (t.repeatId) {
                    html += '<span class="task-repeat">🔄</span>';
                }
                
                html += '</div>';
                html += '<div class="task-text">' + escapeHtml(t.text) + '</div>';
                html += '</div>';
                html += '<button class="task-delete" data-id="' + t.id + '">×</button>';
                html += '</div>';
            }
            
            if (list) list.innerHTML = html;
        }

        updateStats();
        updateTabs();
    }

    function renderRepeats() {
        var repeats = loadRepeats();
        var list = document.getElementById('repeats-list');
        var empty = document.getElementById('empty-repeats');

        console.log('Рендер повторов:', repeats.length);

        if (repeats.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
            return;
        }

        if (empty) empty.classList.remove('show');

        var html = '';
        for (var i = 0; i < repeats.length; i++) {
            var r = repeats[i];
            var schedule = REPEAT_LABELS[r.type] || r.type;
            
            if (r.type === 'weekly' && r.days && r.days.length > 0) {
                var dayNames = [];
                for (var j = 0; j < r.days.length; j++) {
                    dayNames.push(DAYS_SHORT[r.days[j]]);
                }
                schedule = dayNames.join(', ');
            }
            
            var statusClass = r.active ? '' : 'inactive';
            var toggleText = r.active ? '⏸ Пауза' : '▶️ Включить';

            html += '<div class="repeat-card ' + statusClass + '" data-id="' + r.id + '">';
            html += '<div class="repeat-header">';
            html += '<span class="repeat-priority">' + PRIORITY_EMOJI[r.priority || 0] + '</span>';
            html += '<span class="repeat-text">' + escapeHtml(r.text) + '</span>';
            html += '</div>';
            html += '<div class="repeat-info">';
            
            if (r.time) {
                html += '<span class="repeat-badge">⏰ ' + escapeHtml(r.time) + '</span>';
            }
            
            html += '<span class="repeat-badge">📅 ' + escapeHtml(schedule) + '</span>';
            html += '</div>';
            html += '<div class="repeat-actions">';
            html += '<button class="btn-toggle" data-id="' + r.id + '">' + toggleText + '</button>';
            html += '<button class="btn-remove" data-id="' + r.id + '">🗑 Удалить</button>';
            html += '</div>';
            html += '</div>';
        }

        if (list) list.innerHTML = html;
    }

    // ========== TASK ACTIONS ==========
    
    function toggleTask(id) {
        var tasks = loadTasks();
        var dayTasks = tasks[currentDay] || [];

        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id === id) {
                dayTasks[i].done = !dayTasks[i].done;
                showToast(dayTasks[i].done ? '✓ Выполнено!' : 'Возвращено', 'success');
                break;
            }
        }

        saveTasks(tasks);
        haptic('success');
        renderTasks();
    }

    function deleteTask(id) {
        var tasks = loadTasks();
        var dayTasks = tasks[currentDay] || [];
        var newTasks = [];
        
        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id !== id) {
                newTasks.push(dayTasks[i]);
            }
        }
        
        tasks[currentDay] = newTasks;
        saveTasks(tasks);
        haptic('success');
        showToast('Задача удалена', 'success');
        renderTasks();
        closeModal('modal-confirm');
    }

    function addTask(text, time, priority) {
        if (!text || !text.trim()) return;
        
        var tasks = loadTasks();
        if (!tasks[currentDay]) tasks[currentDay] = [];

        tasks[currentDay].push({
            id: generateId(),
            text: text.trim(),
            time: time || null,
            priority: priority || 0,
            done: false,
            repeatId: null
        });

        saveTasks(tasks);
        haptic('success');
        showToast('Задача добавлена!', 'success');
        renderTasks();
    }

    function changePriority(priority) {
        var tasks = loadTasks();
        var dayTasks = tasks[currentDay] || [];

        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id === priorityTaskId) {
                dayTasks[i].priority = priority;
                break;
            }
        }

        saveTasks(tasks);
        haptic('success');
        showToast('Приоритет изменён', 'success');
        renderTasks();
        closeModal('modal-priority');
        priorityTaskId = null;
    }

    function clearDay() {
        var tasks = loadTasks();
        var count = (tasks[currentDay] || []).length;
        
        if (count === 0) {
            showToast('День уже пуст', 'error');
            return;
        }
        
        haptic('warning');
        var confirmText = document.getElementById('confirm-text');
        if (confirmText) {
            confirmText.textContent = 'Удалить все ' + count + ' задач за ' + DAYS[currentDay] + '?';
        }
        
        confirmCallback = function() {
            var tasks = loadTasks();
            tasks[currentDay] = [];
            saveTasks(tasks);
            haptic('success');
            showToast('День очищен', 'success');
            renderTasks();
            closeModal('modal-confirm');
        };
        
        openModal('modal-confirm');
    }

    // ========== REPEAT ACTIONS ==========

    function toggleRepeat(id) {
        var repeats = loadRepeats();
        var found = false;

        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].id === id) {
                repeats[i].active = !repeats[i].active;
                found = true;
                showToast(repeats[i].active ? 'Повтор включён' : 'Повтор на паузе', 'success');
                console.log('Переключён повтор:', repeats[i].text, 'Активен:', repeats[i].active);
                break;
            }
        }

        if (found) {
            saveRepeats(repeats);
            haptic('success');
            renderRepeats();
        }
    }

    function deleteRepeat(id) {
        var repeats = loadRepeats();
        var newRepeats = [];
        var deletedText = '';
        
        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].id !== id) {
                newRepeats.push(repeats[i]);
            } else {
                deletedText = repeats[i].text;
            }
        }
        
        saveRepeats(newRepeats);
        haptic('success');
        showToast('Повтор "' + deletedText + '" удалён', 'success');
        console.log('Удалён повтор:', deletedText);
        renderRepeats();
        closeModal('modal-confirm');
        deleteRepeatId = null;
    }

    function createRepeat(text, time, priority, type, days) {
        if (!text || !text.trim()) {
            showToast('Введите текст задачи', 'error');
            return false;
        }
        
        if (type === 'weekly' && (!days || days.length === 0)) {
            showToast('Выберите дни недели', 'error');
            haptic('error');
            return false;
        }
        
        var repeats = loadRepeats();
        
        var newRepeat = {
            id: generateId(),
            text: text.trim(),
            time: time || null,
            priority: priority || 0,
            type: type,
            days: (type === 'weekly') ? days.slice() : [],
            active: true
        };

        repeats.push(newRepeat);
        saveRepeats(repeats);
        
        console.log('Создан повтор:', newRepeat);
        
        haptic('success');
        showToast('Повтор создан!', 'success');
        
        // Сразу применяем к текущей неделе
        applyRepeats();
        
        renderRepeats();
        renderTasks();
        
        return true;
    }

    // ========== SWIPE ==========
    
    var touchStartX = 0;
    var touchEndX = 0;
    
    function handleSwipe() {
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 60) {
            if (diff > 0 && currentDay < 6) {
                currentDay++;
                haptic('light');
                renderTasks();
            } else if (diff < 0 && currentDay > 0) {
                currentDay--;
                haptic('light');
                renderTasks();
            }
        }
    }

    // ========== INITIALIZATION ==========
    
    function init() {
        console.log('=== Инициализация еженедельника ===');
        console.log('Текущий день:', DAYS[currentDay]);
        console.log('Неделя:', getWeekId());
        
        // Первичный рендер
        renderTasks();
        renderRepeats();

        // === SWIPE ===
        var tasksContainer = document.querySelector('.tasks-container');
        if (tasksContainer) {
            tasksContainer.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });
            
            tasksContainer.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }, { passive: true });
        }

        // === NAV TABS ===
        var navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(function(tab) {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                currentView = this.getAttribute('data-view');

                document.querySelectorAll('.nav-tab').forEach(function(t) {
                    t.classList.remove('active');
                });
                this.classList.add('active');

                document.querySelectorAll('.view').forEach(function(v) {
                    v.classList.remove('active');
                });
                
                var targetView = document.getElementById('view-' + currentView);
                if (targetView) targetView.classList.add('active');

                haptic('light');
                
                // Перерендер при переключении
                if (currentView === 'repeats') {
                    renderRepeats();
                } else {
                    renderTasks();
                }
            });
        });

        // === DAY TABS ===
        var dayTabs = document.querySelectorAll('.tabs .tab');
        dayTabs.forEach(function(tab) {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                currentDay = parseInt(this.getAttribute('data-day'));
                haptic('light');
                renderTasks();
            });
        });

        // === FAB BUTTON ===
        var btnAdd = document.getElementById('btn-add');
        if (btnAdd) {
            btnAdd.addEventListener('click', function(e) {
                e.preventDefault();
                haptic('light');
                if (currentView === 'tasks') {
                    openModal('modal-add');
                } else {
                    openModal('modal-repeat');
                }
            });
        }

        // === CLEAR DAY ===
        var btnClear = document.getElementById('btn-clear-day');
        if (btnClear) {
            btnClear.addEventListener('click', function(e) {
                e.preventDefault();
                clearDay();
            });
        }

        // === CLOSE MODALS ===
        document.querySelectorAll('.modal-close, .btn-cancel').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var modalId = this.getAttribute('data-modal');
                if (modalId) closeModal(modalId);
            });
        });

        // Click outside modal
        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModal(this.id);
                }
            });
        });

        // === PRIORITY BUTTONS (ADD TASK) ===
        var prioSelect = document.getElementById('priority-select');
        if (prioSelect) {
            prioSelect.querySelectorAll('.priority-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedPriority = parseInt(this.getAttribute('data-priority'));
                    updatePriorityButtons('priority-select', selectedPriority);
                    haptic('light');
                });
            });
        }

        // === PRIORITY BUTTONS (REPEAT) ===
        var repeatPrioSelect = document.getElementById('repeat-priority-select');
        if (repeatPrioSelect) {
            repeatPrioSelect.querySelectorAll('.priority-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedRepeatPriority = parseInt(this.getAttribute('data-priority'));
                    updatePriorityButtons('repeat-priority-select', selectedRepeatPriority);
                    haptic('light');
                });
            });
        }

        // === REPEAT TYPE ===
        var repeatTypeSelect = document.getElementById('repeat-type-select');
        if (repeatTypeSelect) {
            repeatTypeSelect.querySelectorAll('.repeat-type-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedRepeatType = this.getAttribute('data-type');
                    updateRepeatTypeButtons(selectedRepeatType);
                    haptic('light');
                    console.log('Выбран тип повтора:', selectedRepeatType);
                });
            });
        }

        // === DAYS SELECT ===
        var daysSelect = document.getElementById('days-select');
        if (daysSelect) {
            daysSelect.querySelectorAll('.day-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var d = parseInt(this.getAttribute('data-day'));
                    var idx = selectedDays.indexOf(d);
                    
                    if (idx !== -1) {
                        selectedDays.splice(idx, 1);
                    } else {
                        selectedDays.push(d);
                    }
                    
                    updateDaysButtons(selectedDays);
                    haptic('light');
                    console.log('Выбранные дни:', selectedDays);
                });
            });
        }

        // === ADD TASK FORM ===
        var formAddTask = document.getElementById('form-add-task');
        if (formAddTask) {
            formAddTask.addEventListener('submit', function(e) {
                e.preventDefault();
                
                var textInput = document.getElementById('task-text');
                var timeInput = document.getElementById('task-time');
                
                var text = textInput ? textInput.value.trim() : '';
                var time = timeInput ? timeInput.value : '';
                
                if (text) {
                    addTask(text, time, selectedPriority);
                    closeModal('modal-add');
                } else {
                    showToast('Введите текст задачи', 'error');
                }
            });
        }

        // === ADD REPEAT FORM ===
        var formAddRepeat = document.getElementById('form-add-repeat');
        if (formAddRepeat) {
            formAddRepeat.addEventListener('submit', function(e) {
                e.preventDefault();
                
                var textInput = document.getElementById('repeat-text');
                var timeInput = document.getElementById('repeat-time');
                
                var text = textInput ? textInput.value.trim() : '';
                var time = timeInput ? timeInput.value : '';

                console.log('Создание повтора:', {
                    text: text,
                    time: time,
                    priority: selectedRepeatPriority,
                    type: selectedRepeatType,
                    days: selectedDays
                });

                var success = createRepeat(text, time, selectedRepeatPriority, selectedRepeatType, selectedDays.slice());
                
                if (success) {
                    closeModal('modal-repeat');
                }
            });
        }

        // === PRIORITY CHANGE MODAL ===
        var prioChange = document.getElementById('priority-change');
        if (prioChange) {
            prioChange.querySelectorAll('.priority-option').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    changePriority(parseInt(this.getAttribute('data-priority')));
                });
            });
        }

        // === CONFIRM BUTTON ===
        var btnConfirm = document.getElementById('btn-confirm-ok');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirmCallback) {
                    confirmCallback();
                }
                confirmCallback = null;
            });
        }

        // === TASK LIST DELEGATION ===
        var tasksList = document.getElementById('tasks-list');
        if (tasksList) {
            tasksList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('task-checkbox')) {
                    e.preventDefault();
                    if (id) toggleTask(id);
                    
                } else if (target.classList.contains('task-priority')) {
                    e.preventDefault();
                    if (id) {
                        priorityTaskId = id;
                        haptic('light');
                        openModal('modal-priority');
                    }
                    
                } else if (target.classList.contains('task-delete')) {
                    e.preventDefault();
                    if (id) {
                        haptic('warning');
                        var confirmText = document.getElementById('confirm-text');
                        if (confirmText) confirmText.textContent = 'Удалить задачу?';
                        confirmCallback = function() { deleteTask(id); };
                        openModal('modal-confirm');
                    }
                }
            });
        }

        // === REPEATS LIST DELEGATION ===
        var repeatsList = document.getElementById('repeats-list');
        if (repeatsList) {
            repeatsList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');
                
                console.log('Клик в списке повторов:', target.className, 'ID:', id);

                if (target.classList.contains('btn-toggle')) {
                    e.preventDefault();
                    if (id) toggleRepeat(id);
                    
                } else if (target.classList.contains('btn-remove')) {
                    e.preventDefault();
                    if (id) {
                        haptic('warning');
                        deleteRepeatId = id;
                        var confirmText = document.getElementById('confirm-text');
                        if (confirmText) confirmText.textContent = 'Удалить повтор?';
                        confirmCallback = function() { deleteRepeat(deleteRepeatId); };
                        openModal('modal-confirm');
                    }
                }
            });
        }

        // === KEYBOARD ===
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal('modal-add');
                closeModal('modal-repeat');
                closeModal('modal-confirm');
                closeModal('modal-priority');
            }
        });

        console.log('=== Приложение готово! ===');
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
