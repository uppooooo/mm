// ============================================================
// bbs-core.js — 共通BBSロジック (DOM API, ページング, 展開保持)
// ============================================================
;(function () {
  'use strict';

  var ADMIN_KEY = (window.SITE_CONFIG && window.SITE_CONFIG.adminKey) || 'admin';
  var PAGE_SIZE = 20;

  // --- ユーティリティ ---
  function pad(n) { return String(n).padStart(2, '0'); }

  function formatDate(d) {
    if (d instanceof Date) {
      return d.getFullYear() + ':' + pad(d.getMonth() + 1) + ':' + pad(d.getDate()) + ':' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return String(d);
  }

  function now() { return formatDate(new Date()); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'textContent') { node.textContent = attrs[k]; }
        else if (k.indexOf('on') === 0) { node.addEventListener(k.slice(2).toLowerCase(), attrs[k]); }
        else { node.setAttribute(k, attrs[k]); }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function textToNodes(text) {
    var frag = document.createDocumentFragment();
    String(text).split('\n').forEach(function (line, i) {
      if (i > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(line));
    });
    return frag;
  }

  // --- 記憶：投稿者名・削除キー ---
  function saveUserPrefs(storageKey, name, delkey) {
    try {
      localStorage.setItem(storageKey + '_userName', name);
      localStorage.setItem(storageKey + '_userDelkey', delkey);
    } catch (e) { /* ignore */ }
  }
  function loadUserPrefs(storageKey) {
    try {
      return {
        name: localStorage.getItem(storageKey + '_userName') || '',
        delkey: localStorage.getItem(storageKey + '_userDelkey') || ''
      };
    } catch (e) { return { name: '', delkey: '' }; }
  }

  // --- ストレージ ---
  function loadTopics(key, defaults) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var data = JSON.parse(raw);
        if (Array.isArray(data)) return data;
      }
    } catch (e) { /* ignore */ }
    return defaults.map(function (t) {
      return Object.assign({ replies: [] }, t);
    });
  }

  function saveTopics(key, topics) {
    try { localStorage.setItem(key, JSON.stringify(topics)); } catch (e) { /* ignore */ }
  }

  // --- 連番ID管理 ---
  function nextId(key) {
    var counterKey = key + '_counter';
    var n;
    try { n = parseInt(localStorage.getItem(counterKey)) || 0; } catch (e) { n = 0; }
    n++;
    try { localStorage.setItem(counterKey, n); } catch (e) { /* ignore */ }
    return n;
  }

  function ensureIds(topics, key) {
    var changed = false;
    topics.forEach(function (t) {
      if (!t.id) { t.id = nextId(key); changed = true; }
      if (t.replies) {
        t.replies.forEach(function (r) {
          if (!r.id) { r.id = nextId(key); changed = true; }
        });
      }
    });
    if (changed) saveTopics(key, topics);
  }

  // --- カスタムモーダル ---
  function showActionModal(opts, callback) {
    // opts: { title, showEdit }
    // callback(action, key)  action = 'delete' | 'edit' | null
    var overlay = el('div', { className: 'modal-overlay' });
    var box = el('div', { className: 'modal-box' });

    if (opts.title) {
      box.appendChild(el('div', { className: 'modal-title', textContent: opts.title }));
    }

    var keyInput = el('input', {
      type: 'password',
      className: 'modal-input',
      placeholder: '削除キーを入力',
      maxlength: '8'
    });
    box.appendChild(keyInput);

    var btnRow = el('div', { className: 'modal-btns' });

    var btnDel = el('button', {
      className: 'btn btn-sm btn-del modal-btn',
      textContent: '削除',
      onClick: function () { close('delete'); }
    });
    btnRow.appendChild(btnDel);

    if (opts.showEdit) {
      var btnEdit = el('button', {
        className: 'btn btn-sm modal-btn',
        textContent: '編集',
        onClick: function () { close('edit'); }
      });
      btnRow.appendChild(btnEdit);
    }

    var btnCancel = el('button', {
      className: 'btn btn-sm btn-cancel modal-btn',
      textContent: 'キャンセル',
      onClick: function () { close(null); }
    });
    btnRow.appendChild(btnCancel);

    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // フォーカス
    setTimeout(function () { keyInput.focus(); }, 50);

    function close(action) {
      var key = keyInput.value.trim();
      document.body.removeChild(overlay);
      callback(action, key);
    }
  }

  // --- 編集モーダル ---
  function showEditModal(opts, callback) {
    // opts: { subj, body } (subjはトピック編集時のみ)
    // callback(newSubj, newBody) or callback(null) on cancel
    var overlay = el('div', { className: 'modal-overlay' });
    var box = el('div', { className: 'modal-box modal-edit' });

    box.appendChild(el('div', { className: 'modal-title', textContent: '編集' }));

    var subjInput = null;
    if (opts.subj !== undefined) {
      box.appendChild(el('label', { className: 'modal-label', textContent: '件名：' }));
      subjInput = el('input', { type: 'text', className: 'modal-input', maxlength: '80' });
      subjInput.value = opts.subj;
      box.appendChild(subjInput);
    }

    box.appendChild(el('label', { className: 'modal-label', textContent: '本文：' }));
    var bodyArea = el('textarea', { className: 'modal-textarea' });
    bodyArea.value = opts.body;
    box.appendChild(bodyArea);

    var btnRow = el('div', { className: 'modal-btns' });
    btnRow.appendChild(el('button', {
      className: 'btn btn-sm modal-btn',
      textContent: '保存',
      onClick: function () {
        var newSubj = subjInput ? subjInput.value.trim() : undefined;
        var newBody = bodyArea.value.trim();
        if (subjInput && !newSubj) { alert('件名を入力してください。'); return; }
        if (!newBody) { alert('本文を入力してください。'); return; }
        document.body.removeChild(overlay);
        callback(newSubj, newBody);
      }
    }));
    btnRow.appendChild(el('button', {
      className: 'btn btn-sm btn-cancel modal-btn',
      textContent: 'キャンセル',
      onClick: function () {
        document.body.removeChild(overlay);
        callback(null);
      }
    }));
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(function () { (subjInput || bodyArea).focus(); }, 50);
  }

  // --- BBS クラス ---
  function BBS(opts) {
    this.storageKey = opts.storageKey;
    this.defaults = opts.defaults || [];
    this.listEl = opts.listEl;
    this.countEl = opts.countEl;
    this.searchEl = opts.searchEl || null;
    this.page = 0;
    this.openSet = {};
    this.searchQuery = '';
    this._init();
  }

  BBS.prototype._init = function () {
    var self = this;
    var topics = loadTopics(this.storageKey, this.defaults);
    ensureIds(topics, this.storageKey);

    // 検索窓イベント
    if (this.searchEl) {
      this.searchEl.addEventListener('input', function () {
        self.searchQuery = self.searchEl.value.trim().toLowerCase();
        self.page = 0;
        self.render();
      });
    }

    // フォームに前回の名前・削除キーを復元
    this._restoreUserPrefs();

    this.render();
  };

  BBS.prototype._restoreUserPrefs = function () {
    var prefs = loadUserPrefs(this.storageKey);
    var nameEl = document.getElementById('pName');
    var delEl = document.getElementById('pDel');
    if (nameEl && prefs.name) nameEl.value = prefs.name;
    if (delEl && prefs.delkey) delEl.value = prefs.delkey;
  };

  BBS.prototype._topics = function () {
    var topics = loadTopics(this.storageKey, this.defaults);
    ensureIds(topics, this.storageKey);
    return topics;
  };

  BBS.prototype._save = function (topics) {
    saveTopics(this.storageKey, topics);
  };

  BBS.prototype._filtered = function () {
    var q = this.searchQuery;
    if (!q) return this._topics();
    return this._topics().filter(function (t) {
      if (t.name && t.name.toLowerCase().indexOf(q) >= 0) return true;
      if (t.subj && t.subj.toLowerCase().indexOf(q) >= 0) return true;
      if (t.body && t.body.toLowerCase().indexOf(q) >= 0) return true;
      if (t.replies) {
        for (var i = 0; i < t.replies.length; i++) {
          var r = t.replies[i];
          if (r.name && r.name.toLowerCase().indexOf(q) >= 0) return true;
          if (r.body && r.body.toLowerCase().indexOf(q) >= 0) return true;
        }
      }
      return false;
    });
  };

  BBS.prototype.addTopic = function (name, subj, body, delkey) {
    if (!subj) { alert('件名を入力してください。'); return false; }
    if (!body) { alert('本文を入力してください。'); return false; }
    var topics = this._topics();
    var t = { id: nextId(this.storageKey), name: name || '名無しさん', subj: subj, body: body, date: now(), edited: '', delkey: delkey || '', replies: [] };
    topics.unshift(t);
    this._save(topics);
    saveUserPrefs(this.storageKey, name || '', delkey || '');
    this.page = 0;
    this.openSet[t.id] = true;
    this.render();
    return true;
  };

  BBS.prototype._findTopic = function (topics, id) {
    for (var i = 0; i < topics.length; i++) { if (topics[i].id === id) return i; }
    return -1;
  };

  BBS.prototype.actionTopic = function (id) {
    var self = this;
    showActionModal({ title: 'トピック操作', showEdit: true }, function (action, key) {
      if (!action) return;
      var topics = self._topics();
      var idx = self._findTopic(topics, id);
      if (idx < 0) return;
      var t = topics[idx];
      if (key !== ADMIN_KEY && (!t.delkey || key !== t.delkey)) {
        alert('削除キーが一致しません。'); return;
      }
      if (action === 'delete') {
        delete self.openSet[id];
        topics.splice(idx, 1);
        self._save(topics);
        self.render();
      } else if (action === 'edit') {
        showEditModal({ subj: t.subj, body: t.body }, function (newSubj, newBody) {
          if (newSubj === null) return;
          var topics2 = self._topics();
          var idx2 = self._findTopic(topics2, id);
          if (idx2 < 0) return;
          topics2[idx2].subj = newSubj;
          topics2[idx2].body = newBody;
          topics2[idx2].edited = now();
          self._save(topics2);
          self.openSet[id] = true;
          self.render();
        });
      }
    });
  };

  BBS.prototype.addReply = function (topicId, name, body, delkey) {
    if (!body) { alert('本文を入力してください。'); return false; }
    var topics = this._topics();
    var idx = this._findTopic(topics, topicId);
    if (idx < 0) return false;
    var t = topics[idx];
    if (!t.replies) t.replies = [];
    t.replies.push({ id: nextId(this.storageKey), name: name || '名無しさん', body: body, date: now(), edited: '', delkey: delkey || '' });
    this._save(topics);
    saveUserPrefs(this.storageKey, name || '', delkey || '');
    this.openSet[topicId] = true;
    this.render();
    return true;
  };

  BBS.prototype.actionReply = function (topicId, replyId) {
    var self = this;
    showActionModal({ title: '返信操作', showEdit: true }, function (action, key) {
      if (!action) return;
      var topics = self._topics();
      var ti = self._findTopic(topics, topicId);
      if (ti < 0) return;
      var t = topics[ti];
      if (!t.replies) return;
      var ri = -1;
      for (var j = 0; j < t.replies.length; j++) { if (t.replies[j].id === replyId) { ri = j; break; } }
      if (ri < 0) return;
      var r = t.replies[ri];
      if (key !== ADMIN_KEY && (!r.delkey || key !== r.delkey)) {
        alert('削除キーが一致しません。'); return;
      }
      if (action === 'delete') {
        t.replies.splice(ri, 1);
        self._save(topics);
        self.openSet[topicId] = true;
        self.render();
      } else if (action === 'edit') {
        showEditModal({ body: r.body }, function (newSubj, newBody) {
          if (newSubj === null && newBody === undefined) return;
          if (!newBody) return;
          var topics2 = self._topics();
          var ti2 = self._findTopic(topics2, topicId);
          if (ti2 < 0) return;
          var replies = topics2[ti2].replies;
          for (var k = 0; k < replies.length; k++) {
            if (replies[k].id === replyId) {
              replies[k].body = newBody;
              replies[k].edited = now();
              break;
            }
          }
          self._save(topics2);
          self.openSet[topicId] = true;
          self.render();
        });
      }
    });
  };

  BBS.prototype.toggleTopic = function (id) {
    this.openSet[id] = !this.openSet[id];
    var detail = document.getElementById('td-' + id);
    var tog = document.getElementById('tg-' + id);
    if (detail) {
      detail.classList.toggle('open', !!this.openSet[id]);
      if (tog) tog.textContent = this.openSet[id] ? '[-]' : '[+]';
    }
  };

  BBS.prototype.render = function () {
    var self = this;
    var topics = self._filtered();
    var total = topics.length;
    var allTotal = self._topics().length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (self.page >= totalPages) self.page = totalPages - 1;
    if (self.page < 0) self.page = 0;
    var start = self.page * PAGE_SIZE;
    var pageTopics = topics.slice(start, start + PAGE_SIZE);

    if (self.countEl) {
      self.countEl.textContent = self.searchQuery
        ? '(' + total + '件 / ' + allTotal + '件中)'
        : '(' + allTotal + '件)';
    }

    while (self.listEl.firstChild) self.listEl.removeChild(self.listEl.firstChild);

    if (total === 0) {
      self.listEl.appendChild(el('p', { className: 'tp-empty', textContent: self.searchQuery ? '該当する投稿が見つかりません。' : 'まだ投稿がありません。' }));
      return;
    }

    pageTopics.forEach(function (t, pageIdx) {
      var globalIdx = start + pageIdx;
      var topicNum = total - globalIdx;
      var isOpen = !!self.openSet[t.id];
      var rc = (t.replies && t.replies.length) || 0;

      var article = el('article', { className: 'tp' });

      var head = el('div', {
        className: 'tp-head',
        role: 'button',
        tabindex: '0',
        'aria-expanded': String(isOpen),
        onClick: function () { self.toggleTopic(t.id); },
        onKeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.toggleTopic(t.id); } }
      }, [
        el('span', { className: 'no', textContent: String(topicNum) }),
        el('span', { className: 'su', textContent: t.subj }),
        el('span', { className: 'nm', textContent: t.name }),
        rc > 0 ? el('span', { className: 'rc', textContent: 'Res:' + rc }) : null,
        el('span', { className: 'da', textContent: t.date }),
        t.edited ? el('span', { className: 'da', textContent: '(編集:' + t.edited + ')' }) : null,
        el('span', { className: 'tog', id: 'tg-' + t.id, textContent: isOpen ? '[-]' : '[+]' }),
      ]);
      article.appendChild(head);

      var detail = el('div', { className: 'tp-detail' + (isOpen ? ' open' : ''), id: 'td-' + t.id });

      var bodyDiv = el('div', { className: 'tp-body' });
      bodyDiv.appendChild(textToNodes(t.body));
      detail.appendChild(bodyDiv);

      // 返信ボタン(左) + 削除・編集ボタン(右) を横並び
      var actions = el('div', { className: 'tp-actions' });

      var rfToggle = el('button', {
        className: 'btn btn-sm rf-toggle',
        textContent: '返信する ▼',
        onClick: function (e) {
          e.stopPropagation();
          var isOpen = rfBody.classList.toggle('open');
          rfToggle.textContent = isOpen ? '返信を閉じる ▲' : '返信する ▼';
        }
      });
      actions.appendChild(rfToggle);

      actions.appendChild(el('button', {
        className: 'btn btn-sm btn-del',
        textContent: '削除・編集',
        onClick: function (e) { e.stopPropagation(); self.actionTopic(t.id); }
      }));
      detail.appendChild(actions);

      // レス表示
      if (t.replies) {
        t.replies.forEach(function (r) {
          var reply = el('div', { className: 'reply' });
          var dateText = r.date;
          if (r.edited) dateText += ' (編集:' + r.edited + ')';
          var rHead = el('div', { className: 'r-head' }, [
            el('span', { className: 'r-nm', textContent: r.name }),
            el('span', { className: 'r-da', textContent: dateText }),
          ]);
          reply.appendChild(rHead);
          var rBody = el('div', { className: 'r-body' });
          rBody.appendChild(textToNodes(r.body));
          reply.appendChild(rBody);
          var rDel = el('div', { className: 'r-del' });
          rDel.appendChild(el('button', {
            className: 'btn btn-sm btn-del',
            textContent: '削除・編集',
            onClick: function (e) { e.stopPropagation(); self.actionReply(t.id, r.id); }
          }));
          reply.appendChild(rDel);
          detail.appendChild(reply);
        });
      }

      // レスフォーム
      var rf = el('div', { className: 'reply-form-area' });
      var rfBody = el('div', { className: 'rf-body' });
      var prefs = loadUserPrefs(self.storageKey);
      var rnInput = el('input', { type: 'text', placeholder: '名無しさん', maxlength: '30' });
      rnInput.value = prefs.name;
      var rbArea = el('textarea', { placeholder: '返信を入力' });
      var rdInput = el('input', { type: 'password', placeholder: '削除キー', maxlength: '8' });
      rdInput.value = prefs.delkey;

      rfBody.appendChild(el('div', { className: 'fr' }, [el('label', { textContent: '名前：' }), rnInput]));
      rfBody.appendChild(rbArea);
      rfBody.appendChild(el('div', { className: 'fr' }, [el('label', { textContent: '削除キー：' }), rdInput]));
      var rfBtn = el('div', { className: 'rf-actions' });
      rfBtn.appendChild(el('button', {
        className: 'btn btn-sm',
        textContent: '返信',
        onClick: function (e) {
          e.stopPropagation();
          if (self.addReply(t.id, rnInput.value.trim(), rbArea.value.trim(), rdInput.value.trim())) {
            rbArea.value = '';
          }
        }
      }));
      rfBody.appendChild(rfBtn);
      rf.appendChild(rfBody);
      detail.appendChild(rf);

      article.appendChild(detail);
      self.listEl.appendChild(article);
    });

    // ページング
    if (totalPages > 1) {
      var pager = el('nav', { className: 'pager', 'aria-label': 'ページナビゲーション' });
      if (self.page > 0) {
        pager.appendChild(el('button', {
          className: 'btn btn-sm btn-page',
          textContent: '≪ 前へ',
          onClick: function () { self.page--; self.render(); self.listEl.scrollIntoView({ behavior: 'smooth' }); }
        }));
      }
      pager.appendChild(el('span', { className: 'page-info', textContent: (self.page + 1) + ' / ' + totalPages + ' ページ' }));
      if (self.page < totalPages - 1) {
        pager.appendChild(el('button', {
          className: 'btn btn-sm btn-page',
          textContent: '次へ ≫',
          onClick: function () { self.page++; self.render(); self.listEl.scrollIntoView({ behavior: 'smooth' }); }
        }));
      }
      self.listEl.appendChild(pager);
    }
  };

  window.BBS = BBS;
})();
