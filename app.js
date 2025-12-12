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
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'Еженедельно' };

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

    // ========== STORAGE ==========
    
    function getStorageKey() {
        var now = new Date();
        var year = now.getFullYear();
        var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return 'weekly_' + year + '_' + week;
    }

    function loadTasks() {
        try {
            var data = localStorage.getItem(getStorageKey());
            return data ? JSON.parse(data) : {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
        } catch(e) {
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
            var data = localStorage.getItem('weekly_repeats');
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }

    function saveRepeats(repeats) {
        try {
            localStorage.setItem('weekly_repeats', JSON.stringify(repeats));
        } catch(e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    function generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // ========== REPEATS ==========
    
    function applyRepeats() {
        var tasks = loadTasks();
        var repeats = loadRepeats();
        var changed = false;

        for (var i = 0; i < repeats.length; i++) {
            var r = repeats[i];
            if (!r.active) continue;

            var daysToAdd = [];
            if (r.type === 'daily') daysToAdd = [0,1,2,3,4,5,6];
            else if (r.type === 'weekdays') daysToAdd = [0,1,2,3,4];
            else if (r.type === 'weekends') daysToAdd = [5,6];
            else if (r.type === 'weekly') daysToAdd = r.days || [];

            for (var j = 0; j < daysToAdd.length; j++) {
                var day = daysToAdd[j];
                if (!tasks[day]) tasks[day] = [];
                
                var exists = false;
                for (var k = 0; k < tasks[day].length; k++) {
                    if (tasks[day][k].repeatId === r.id) {
                        exists = true;
                        break;
                    }
                }

                if (!exists) {
                    tasks[day].push({
                        id: generateId(),
                        text: r.text,
                        time: r.time,
                        priority: r.priority,
                        done: false,
                        repeatId: r.id
                    });
                    changed = true;
                }
            }
        }

        if (changed) saveTasks(tasks);
        return tasks;
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

    // ========== UI ==========
    
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
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
            var daysGroup = document.getElementById('days-select-group');
            if (daysGroup) daysGroup.style.display = 'none';
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
            btns[i].classList.remove('active');
            var d = parseInt(btns[i].getAttribute('data-day'));
            if (days.indexOf(d) !== -1) {
                btns[i].classList.add('active');
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

    function renderTasks() {
        var tasks = applyRepeats();
        var dayTasks = tasks[currentDay] || [];
        var list = document.getElementById('tasks-list');
        var empty = document.getElementById('empty-state');
        var title = document.getElementById('day-title');

        if (title) title.textContent = DAYS[currentDay];

        // Сортировка
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
                html += '<div class="task-card ' + (t.done ? 'done' : '') + '" data-id="' + t.id + '" data-priority="' + t.priority + '">' +
                    '<div class="task-checkbox ' + (t.done ? 'checked' : '') + '" data-id="' + t.id + '"></div>' +
                    '<div class="task-content">' +
                        '<div class="task-meta">' +
                            (t.time ? '<span class="task-time">⏰ ' + t.time + '</span>' : '') +
                            '<span class="task-priority" data-id="' + t.id + '">' + PRIORITY_EMOJI[t.priority] + '</span>' +
                            (t.repeatId ? '<span class="task-repeat">🔄</span>' : '') +
                        '</div>' +
                        '<div class="task-text">' + escapeHtml(t.text) + '</div>' +
                    '</div>' +
                    '<button class="task-delete" data-id="' + t.id + '">×</button>' +
                '</div>';
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

        if (repeats.length === 0) {
            if (list) list.innerHTML = '';
            if (empty) empty.classList.add('show');
            return;
        }

        if (empty) empty.classList.remove('show');

        var html = '';
        for (var i = 0; i < repeats.length; i++) {
            var r = repeats[i];
            var schedule = REPEAT_LABELS[r.type] || '';
            
            if (r.type === 'weekly' && r.days && r.days.length > 0) {
                var names = [];
                for (var j = 0; j < r.days.length; j++) {
                    names.push(DAYS_SHORT[r.days[j]]);
                }
                schedule = names.join(', ');
            }

            html += '<div class="repeat-card ' + (r.active ? '' : 'inactive') + '">' +
                '<div class="repeat-header">' +
                    '<span class="repeat-priority">' + PRIORITY_EMOJI[r.priority] + '</span>' +
                    '<span class="repeat-text">' + escapeHtml(r.text) + '</span>' +
                '</div>' +
                '<div class="repeat-info">' +
                    (r.time ? '<span class="repeat-badge">⏰ ' + r.time + '</span>' : '') +
                    '<span class="repeat-badge">📅 ' + schedule + '</span>' +
                '</div>' +
                '<div class="repeat-actions">' +
                    '<button class="btn-toggle" data-id="' + r.id + '">' + (r.active ? '⏸ Пауза' : '▶️ Вкл') + '</button>' +
                    '<button class="btn-remove" data-id="' + r.id + '">🗑</button>' +
                '</div>' +
            '</div>';
        }

        if (list) list.innerHTML = html;
    }

    // ========== ACTIONS ==========
    
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
        var newTasks = [];
        var dayTasks = tasks[currentDay] || [];
        
        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id !== id) {
                newTasks.push(dayTasks[i]);
            }
        }
        
        tasks[currentDay] = newTasks;
        saveTasks(tasks);
        haptic('success');
        showToast('Удалено', 'success');
        renderTasks();
        closeModal('modal-confirm');
    }

    function addTask(text, time, priority) {
        var tasks = loadTasks();
        if (!tasks[currentDay]) tasks[currentDay] = [];

        tasks[currentDay].push({
            id: generateId(),
            text: text,
            time: time || null,
            priority: priority,
            done: false,
            repeatId: null
        });

        saveTasks(tasks);
        haptic('success');
        showToast('Добавлено!', 'success');
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
        renderTasks();
        closeModal('modal-priority');
        priorityTaskId = null;
    }

    function clearDay() {
        haptic('warning');
        var confirmText = document.getElementById('confirm-text');
        if (confirmText) confirmText.textContent = 'Очистить ' + DAYS[currentDay] + '?';
        
        confirmCallback = function() {
            var tasks = loadTasks();
            tasks[currentDay] = [];
            saveTasks(tasks);
            haptic('success');
            showToast('Очищено', 'success');
            renderTasks();
            closeModal('modal-confirm');
        };
        openModal('modal-confirm');
    }

    function toggleRepeat(id) {
        var repeats = loadRepeats();

        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].id === id) {
                repeats[i].active = !repeats[i].active;
                showToast(repeats[i].active ? 'Включено' : 'На паузе', 'success');
                break;
            }
        }

        saveRepeats(repeats);
        haptic('success');
        renderRepeats();
    }

    function deleteRepeat(id) {
        var repeats = loadRepeats();
        var newRepeats = [];
        
        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].id !== id) {
                newRepeats.push(repeats[i]);
            }
        }
        
        saveRepeats(newRepeats);
        haptic('success');
        showToast('Удалено', 'success');
        renderRepeats();
        closeModal('modal-confirm');
    }

    function createRepeat(text, time, priority, type, days) {
        var repeats = loadRepeats();

        repeats.push({
            id: generateId(),
            text: text,
            time: time || null,
            priority: priority,
            type: type,
            days: type === 'weekly' ? days : [],
            active: true
        });

        saveRepeats(repeats);
        haptic('success');
        showToast('Создано!', 'success');
        renderRepeats();
        renderTasks();
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

    // ========== INIT ==========
    
    function init() {
        console.log('Инициализация приложения...');
        
        renderTasks();
        renderRepeats();

        // Swipe
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

        // Nav tabs
        var navTabs = document.querySelectorAll('.nav-tab');
        for (var i = 0; i < navTabs.length; i++) {
            navTabs[i].addEventListener('click', function(e) {
                e.preventDefault();
                currentView = this.getAttribute('data-view');

                var allNavTabs = document.querySelectorAll('.nav-tab');
                for (var j = 0; j < allNavTabs.length; j++) {
                    allNavTabs[j].classList.remove('active');
                }
                this.classList.add('active');

                var views = document.querySelectorAll('.view');
                for (var k = 0; k < views.length; k++) {
                    views[k].classList.remove('active');
                }
                
                var targetView = document.getElementById('view-' + currentView);
                if (targetView) targetView.classList.add('active');

                haptic('light');
            });
        }

        // Day tabs
        var dayTabs = document.querySelectorAll('.tabs .tab');
        for (var i = 0; i < dayTabs.length; i++) {
            dayTabs[i].addEventListener('click', function(e) {
                e.preventDefault();
                currentDay = parseInt(this.getAttribute('data-day'));
                haptic('light');
                renderTasks();
            });
        }

        // FAB
        var btnAdd = document.getElementById('btn-add');
        if (btnAdd) {
            btnAdd.addEventListener('click', function(e) {
                e.preventDefault();
                haptic('light');
                openModal(currentView === 'tasks' ? 'modal-add' : 'modal-repeat');
            });
        }

        // Clear day
        var btnClear = document.getElementById('btn-clear-day');
        if (btnClear) {
            btnClear.addEventListener('click', function(e) {
                e.preventDefault();
                clearDay();
            });
        }

        // Close modals
        var closeBtns = document.querySelectorAll('.modal-close, .btn-cancel');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].addEventListener('click', function(e) {
                e.preventDefault();
                var modal = this.getAttribute('data-modal');
                if (modal) closeModal(modal);
            });
        }

        // Click outside modal
        var modals = document.querySelectorAll('.modal');
        for (var i = 0; i < modals.length; i++) {
            modals[i].addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModal(this.id);
                }
            });
        }

        // Priority buttons (add task)
        var prioSelect = document.getElementById('priority-select');
        if (prioSelect) {
            var prioBtns = prioSelect.querySelectorAll('.priority-btn');
            for (var i = 0; i < prioBtns.length; i++) {
                prioBtns[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedPriority = parseInt(this.getAttribute('data-priority'));
                    updatePriorityButtons('priority-select', selectedPriority);
                    haptic('light');
                });
            }
        }

        // Priority buttons (repeat)
        var repeatPrioSelect = document.getElementById('repeat-priority-select');
        if (repeatPrioSelect) {
            var repeatPrioBtns = repeatPrioSelect.querySelectorAll('.priority-btn');
            for (var i = 0; i < repeatPrioBtns.length; i++) {
                repeatPrioBtns[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedRepeatPriority = parseInt(this.getAttribute('data-priority'));
                    updatePriorityButtons('repeat-priority-select', selectedRepeatPriority);
                    haptic('light');
                });
            }
        }

        // Repeat type
        var repeatTypeSelect = document.getElementById('repeat-type-select');
        if (repeatTypeSelect) {
            var repeatTypeBtns = repeatTypeSelect.querySelectorAll('.repeat-type-btn');
            for (var i = 0; i < repeatTypeBtns.length; i++) {
                repeatTypeBtns[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    selectedRepeatType = this.getAttribute('data-type');
                    updateRepeatTypeButtons(selectedRepeatType);
                    haptic('light');
                });
            }
        }

        // Days select
        var daysSelect = document.getElementById('days-select');
        if (daysSelect) {
            var dayBtns = daysSelect.querySelectorAll('.day-btn');
            for (var i = 0; i < dayBtns.length; i++) {
                dayBtns[i].addEventListener('click', function(e) {
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
                });
            }
        }

        // Add task form
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
                }
            });
        }

        // Add repeat form
        var formAddRepeat = document.getElementById('form-add-repeat');
        if (formAddRepeat) {
            formAddRepeat.addEventListener('submit', function(e) {
                e.preventDefault();
                var textInput = document.getElementById('repeat-text');
                var timeInput = document.getElementById('repeat-time');
                
                var text = textInput ? textInput.value.trim() : '';
                var time = timeInput ? timeInput.value : '';

                if (selectedRepeatType === 'weekly' && selectedDays.length === 0) {
                    showToast('Выберите дни', 'error');
                    haptic('error');
                    return;
                }

                if (text) {
                    createRepeat(text, time, selectedRepeatPriority, selectedRepeatType, selectedDays);
                    closeModal('modal-repeat');
                }
            });
        }

        // Priority change modal
        var prioChange = document.getElementById('priority-change');
        if (prioChange) {
            var prioOptions = prioChange.querySelectorAll('.priority-option');
            for (var i = 0; i < prioOptions.length; i++) {
                prioOptions[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    changePriority(parseInt(this.getAttribute('data-priority')));
                });
            }
        }

        // Confirm button
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

        // Task actions (delegation)
        var tasksList = document.getElementById('tasks-list');
        if (tasksList) {
            tasksList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('task-checkbox')) {
                    e.preventDefault();
                    toggleTask(id);
                } else if (target.classList.contains('task-priority')) {
                    e.preventDefault();
                    priorityTaskId = id;
                    haptic('light');
                    openModal('modal-priority');
                } else if (target.classList.contains('task-delete')) {
                    e.preventDefault();
                    haptic('warning');
                    var confirmText = document.getElementById('confirm-text');
                    if (confirmText) confirmText.textContent = 'Удалить задачу?';
                    confirmCallback = function() { deleteTask(id); };
                    openModal('modal-confirm');
                }
            });
        }

        // Repeat actions (delegation)
        var repeatsList = document.getElementById('repeats-list');
        if (repeatsList) {
            repeatsList.addEventListener('click', function(e) {
                var target = e.target;
                var id = target.getAttribute('data-id');

                if (target.classList.contains('btn-toggle')) {
                    e.preventDefault();
                    toggleRepeat(id);
                } else if (target.classList.contains('btn-remove')) {
                    e.preventDefault();
                    haptic('warning');
                    var confirmText = document.getElementById('confirm-text');
                    if (confirmText) confirmText.textContent = 'Удалить повтор?';
                    confirmCallback = function() { deleteRepeat(id); };
                    openModal('modal-confirm');
                }
            });
        }

        // Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal('modal-add');
                closeModal('modal-repeat');
                closeModal('modal-confirm');
                closeModal('modal-priority');
            }
        });
        
        console.log('Приложение готово!');
    }

    // Запуск после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
