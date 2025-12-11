(function() {
    'use strict';

    // ========== TELEGRAM ==========
    var tg = window.Telegram && window.Telegram.WebApp;

    if (tg) {
        tg.ready();
        tg.expand();

        var root = document.documentElement;
        var p = tg.themeParams;
        if (p.bg_color) root.style.setProperty('--bg', p.bg_color);
        if (p.text_color) root.style.setProperty('--text', p.text_color);
        if (p.hint_color) root.style.setProperty('--hint', p.hint_color);
        if (p.button_color) root.style.setProperty('--accent', p.button_color);
        if (p.secondary_bg_color) root.style.setProperty('--secondary', p.secondary_bg_color);
    }

    // ========== КОНСТАНТЫ ==========
    var DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    var DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PRIORITY_EMOJI = {0: '⚪', 1: '🟢', 2: '🟡', 3: '🔴'};
    var REPEAT_LABELS = { daily: 'Ежедневно', weekdays: 'Будни', weekends: 'Выходные', weekly: 'Еженедельно' };

    // ========== СОСТОЯНИЕ ==========
    var today = new Date().getDay();
    var currentDay = today === 0 ? 6 : today - 1;
    var currentView = 'tasks';
    var selectedPriority = 0;
    var selectedRepeatPriority = 0;
    var selectedRepeatType = 'daily';
    var selectedDays = [];
    var confirmCallback = null;
    var priorityTaskId = null;

    // ========== ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ==========
    function getStorageKey() {
        var now = new Date();
        var year = now.getFullYear();
        var week = getWeekNumber(now);
        return 'weekly_' + year + '_' + week;
    }

    function getWeekNumber(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function loadTasks() {
        var key = getStorageKey();
        var data = localStorage.getItem(key);
        if (data) {
            return JSON.parse(data);
        }
        return {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
    }

    function saveTasks(tasks) {
        var key = getStorageKey();
        localStorage.setItem(key, JSON.stringify(tasks));
    }

    function loadRepeats() {
        var data = localStorage.getItem('weekly_repeats');
        if (data) {
            return JSON.parse(data);
        }
        return [];
    }

    function saveRepeats(repeats) {
        localStorage.setItem('weekly_repeats', JSON.stringify(repeats));
    }

    function generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    // ========== ПОВТОРЫ ==========
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

        if (changed) {
            saveTasks(tasks);
        }

        return tasks;
    }

    // ========== HAPTIC ==========
    function haptic(type) {
        if (!tg || !tg.HapticFeedback) return;
        if (type === 'light') tg.HapticFeedback.impactOccurred('light');
        else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
    }

    // ========== UI ==========
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
        if (id === 'modal-add') {
            document.getElementById('form-add-task').reset();
            selectedPriority = 0;
            updatePriorityButtons('priority-select', 0);
        }
        if (id === 'modal-repeat') {
            document.getElementById('form-add-repeat').reset();
            selectedRepeatPriority = 0;
            selectedRepeatType = 'daily';
            selectedDays = [];
            updatePriorityButtons('repeat-priority-select', 0);
            updateRepeatTypeButtons('daily');
            updateDaysButtons([]);
            document.getElementById('days-select-group').style.display = 'none';
        }
    }

    function updatePriorityButtons(containerId, priority) {
        var btns = document.querySelectorAll('#' + containerId + ' .priority-btn');
        for (var i = 0; i < btns.length; i++) {
            if (parseInt(btns[i].getAttribute('data-priority')) === priority) {
                btns[i].classList.add('active');
            } else {
                btns[i].classList.remove('active');
            }
        }
    }

    function updateRepeatTypeButtons(type) {
        var btns = document.querySelectorAll('#repeat-type-select .repeat-type-btn');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].getAttribute('data-type') === type) {
                btns[i].classList.add('active');
            } else {
                btns[i].classList.remove('active');
            }
        }
        document.getElementById('days-select-group').style.display = type === 'weekly' ? 'block' : 'none';
    }

    function updateDaysButtons(days) {
        var btns = document.querySelectorAll('#days-select .day-btn');
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
        document.getElementById('stats-fill').style.width = pct + '%';
        document.getElementById('stats-text').textContent = done + '/' + total;
    }

function updateTabs() {
    var tasks = loadTasks();
    var tabs = document.querySelectorAll('.tab');

    for (var i = 0; i < tabs.length; i++) {
        var day = parseInt(tabs[i].getAttribute('data-day'));
        var hasTasks = tasks[day] && tasks[day].length > 0;

        // Сначала убираем все классы
        tabs[i].classList.remove('active');
        tabs[i].classList.remove('has-tasks');

        // Добавляем active для текущего дня
        if (day === currentDay) {
            tabs[i].classList.add('active');
        }

        // Добавляем has-tasks если есть задачи
        if (hasTasks) {
            tabs[i].classList.add('has-tasks');
        }
    }
}

    function renderTasks() {
        var tasks = applyRepeats();
        var dayTasks = tasks[currentDay] || [];
        var list = document.getElementById('tasks-list');
        var empty = document.getElementById('empty-state');

        document.getElementById('day-title').textContent = DAYS[currentDay];

        // Сортировка: приоритет (высокий первый), потом время
        dayTasks.sort(function(a, b) {
            if (b.priority !== a.priority) return b.priority - a.priority;
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        if (dayTasks.length === 0) {
            list.innerHTML = '';
            empty.classList.add('show');
            return;
        }

        empty.classList.remove('show');

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

        list.innerHTML = html;
        updateStats();
        updateTabs();
    }

    function renderRepeats() {
        var repeats = loadRepeats();
        var list = document.getElementById('repeats-list');
        var empty = document.getElementById('empty-repeats');

        if (repeats.length === 0) {
            list.innerHTML = '';
            empty.classList.add('show');
            return;
        }

        empty.classList.remove('show');

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

        list.innerHTML = html;
    }

    // ========== ДЕЙСТВИЯ ==========
    function toggleTask(id) {
        var tasks = loadTasks();
        var dayTasks = tasks[currentDay] || [];

        for (var i = 0; i < dayTasks.length; i++) {
            if (dayTasks[i].id === id) {
                dayTasks[i].done = !dayTasks[i].done;
                break;
            }
        }

        saveTasks(tasks);
        haptic('success');
        renderTasks();
    }

    function deleteTask(id) {
        var tasks = loadTasks();
        tasks[currentDay] = (tasks[currentDay] || []).filter(function(t) { return t.id !== id; });
        saveTasks(tasks);
        haptic('success');
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
        document.getElementById('confirm-text').textContent = 'Очистить ' + DAYS[currentDay] + '?';
        confirmCallback = function() {
            var tasks = loadTasks();
            tasks[currentDay] = [];
            saveTasks(tasks);
            haptic('success');
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
                break;
            }
        }

        saveRepeats(repeats);
        haptic('success');
        renderRepeats();
    }

    function deleteRepeat(id) {
        var repeats = loadRepeats().filter(function(r) { return r.id !== id; });
        saveRepeats(repeats);
        haptic('success');
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
        renderRepeats();
        renderTasks();
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    document.addEventListener('DOMContentLoaded', function() {
        renderTasks();
        renderRepeats();

        // Навигация
        var navTabs = document.querySelectorAll('.nav-tab');
        for (var i = 0; i < navTabs.length; i++) {
            navTabs[i].addEventListener('click', function() {
                currentView = this.getAttribute('data-view');

                for (var j = 0; j < navTabs.length; j++) navTabs[j].classList.remove('active');
                this.classList.add('active');

                var views = document.querySelectorAll('.view');
                for (var k = 0; k < views.length; k++) views[k].classList.remove('active');
                document.getElementById('view-' + currentView).classList.add('active');

                haptic('light');
            });
        }

        // Дни
        var dayTabs = document.querySelectorAll('.tab');
        for (var i = 0; i < dayTabs.length; i++) {
            dayTabs[i].addEventListener('click', function() {
                currentDay = parseInt(this.getAttribute('data-day'));
                haptic('light');
                renderTasks();
            });
        }

        // FAB
        document.getElementById('btn-add').addEventListener('click', function() {
            haptic('light');
            openModal(currentView === 'tasks' ? 'modal-add' : 'modal-repeat');
        });

        // Очистка
        document.getElementById('btn-clear-day').addEventListener('click', clearDay);

        // Закрытие модалок
        var closeBtns = document.querySelectorAll('.modal-close, .btn-cancel');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].addEventListener('click', function() {
                closeModal(this.getAttribute('data-modal'));
            });
        }

        var modals = document.querySelectorAll('.modal');
        for (var i = 0; i < modals.length; i++) {
            modals[i].addEventListener('click', function(e) {
                if (e.target === this) closeModal(this.id);
            });
        }

        // Приоритеты
        var prioSelects = document.querySelectorAll('#priority-select .priority-btn');
        for (var i = 0; i < prioSelects.length; i++) {
            prioSelects[i].addEventListener('click', function() {
                selectedPriority = parseInt(this.getAttribute('data-priority'));
                updatePriorityButtons('priority-select', selectedPriority);
                haptic('light');
            });
        }

        var repeatPrioSelects = document.querySelectorAll('#repeat-priority-select .priority-btn');
        for (var i = 0; i < repeatPrioSelects.length; i++) {
            repeatPrioSelects[i].addEventListener('click', function() {
                selectedRepeatPriority = parseInt(this.getAttribute('data-priority'));
                updatePriorityButtons('repeat-priority-select', selectedRepeatPriority);
                haptic('light');
            });
        }

        // Тип повтора
        var repeatTypes = document.querySelectorAll('#repeat-type-select .repeat-type-btn');
        for (var i = 0; i < repeatTypes.length; i++) {
            repeatTypes[i].addEventListener('click', function() {
                selectedRepeatType = this.getAttribute('data-type');
                updateRepeatTypeButtons(selectedRepeatType);
                haptic('light');
            });
        }

        // Дни для повтора
        var dayBtns = document.querySelectorAll('#days-select .day-btn');
        for (var i = 0; i < dayBtns.length; i++) {
            dayBtns[i].addEventListener('click', function() {
                var d = parseInt(this.getAttribute('data-day'));
                var idx = selectedDays.indexOf(d);
                if (idx !== -1) selectedDays.splice(idx, 1);
                else selectedDays.push(d);
                updateDaysButtons(selectedDays);
                haptic('light');
            });
        }

        // Форма задачи
        document.getElementById('form-add-task').addEventListener('submit', function(e) {
            e.preventDefault();
            var text = document.getElementById('task-text').value.trim();
            var time = document.getElementById('task-time').value;
            if (text) {
                addTask(text, time, selectedPriority);
                closeModal('modal-add');
            }
        });

        // Форма повтора
        document.getElementById('form-add-repeat').addEventListener('submit', function(e) {
            e.preventDefault();
            var text = document.getElementById('repeat-text').value.trim();
            var time = document.getElementById('repeat-time').value;

            if (selectedRepeatType === 'weekly' && selectedDays.length === 0) {
                alert('Выберите хотя бы один день');
                return;
            }

            if (text) {
                createRepeat(text, time, selectedRepeatPriority, selectedRepeatType, selectedDays);
                closeModal('modal-repeat');
            }
        });

        // Изменение приоритета
        var prioOptions = document.querySelectorAll('#priority-change .priority-option');
        for (var i = 0; i < prioOptions.length; i++) {
            prioOptions[i].addEventListener('click', function() {
                changePriority(parseInt(this.getAttribute('data-priority')));
            });
        }

        // Подтверждение
        document.getElementById('btn-confirm-ok').addEventListener('click', function() {
            if (confirmCallback) confirmCallback();
            confirmCallback = null;
        });

        // Делегирование: задачи
        document.getElementById('tasks-list').addEventListener('click', function(e) {
            var t = e.target;
            var id = t.getAttribute('data-id');

            if (t.classList.contains('task-checkbox')) {
                toggleTask(id);
            } else if (t.classList.contains('task-priority')) {
                priorityTaskId = id;
                haptic('light');
                openModal('modal-priority');
            } else if (t.classList.contains('task-delete')) {
                haptic('warning');
                document.getElementById('confirm-text').textContent = 'Удалить задачу?';
                confirmCallback = function() { deleteTask(id); };
                openModal('modal-confirm');
            }
        });

        // Делегирование: повторы
        document.getElementById('repeats-list').addEventListener('click', function(e) {
            var t = e.target;
            var id = t.getAttribute('data-id');

            if (t.classList.contains('btn-toggle')) {
                toggleRepeat(id);
            } else if (t.classList.contains('btn-remove')) {
                haptic('warning');
                document.getElementById('confirm-text').textContent = 'Удалить повтор?';
                confirmCallback = function() { deleteRepeat(id); };
                openModal('modal-confirm');
            }
        });
    });

})();