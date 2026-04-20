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

  // --- BBS クラス ---
  function BBS(opts) {
    this.storageKey = opts.storageKey;
    this.defaults = opts.defaults || [];
    this.listEl = opts.listEl;
    this.countEl = opts.countEl;
    this.page = 0;
    this.openSet = {}; // id -> true
    this._init();
  }

  BBS.prototype._init = function () {
    var topics = loadTopics(this.storageKey, this.defaults);
    ensureIds(topics, this.storageKey);
    this.render();
  };

  BBS.prototype._topics = function () {
    var topics = loadTopics(this.storageKey, this.defaults);
    ensureIds(topics, this.storageKey);
    return topics;
  };

  BBS.prototype._save = function (topics) {
    saveTopics(this.storageKey, topics);
  };

  BBS.prototype.addTopic = function (name, subj, body, delkey) {
    if (!subj) { alert('件名を入力してください。'); return false; }
    if (!body) { alert('本文を入力してください。'); return false; }
    var topics = this._topics();
    var t = { id: nextId(this.storageKey), name: name || '名無しさん', subj: subj, body: body, date: now(), delkey: delkey || '', replies: [] };
    topics.unshift(t);
    this._save(topics);
    this.page = 0;
    this.openSet[t.id] = true;
    this.render();
    return true;
  };

  BBS.prototype.deleteTopic = function (id) {
    var key = prompt('削除キーを入力してください：');
    if (key === null) return;
    var topics = this._topics();
    var idx = -1;
    for (var i = 0; i < topics.length; i++) { if (topics[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    if (key === ADMIN_KEY || (topics[idx].delkey && key === topics[idx].delkey)) {
      delete this.openSet[id];
      topics.splice(idx, 1);
      this._save(topics);
      this.render();
    } else { alert('削除キーが一致しません。'); }
  };

  BBS.prototype.addReply = function (topicId, name, body, delkey) {
    if (!body) { alert('本文を入力してください。'); return false; }
    var topics = this._topics();
    var t = null;
    for (var i = 0; i < topics.length; i++) { if (topics[i].id === topicId) { t = topics[i]; break; } }
    if (!t) return false;
    if (!t.replies) t.replies = [];
    t.replies.push({ id: nextId(this.storageKey), name: name || '名無しさん', body: body, date: now(), delkey: delkey || '' });
    this._save(topics);
    this.openSet[topicId] = true;
    this.render();
    return true;
  };

  BBS.prototype.deleteReply = function (topicId, replyId) {
    var key = prompt('削除キーを入力してください：');
    if (key === null) return;
    var topics = this._topics();
    var t = null;
    for (var i = 0; i < topics.length; i++) { if (topics[i].id === topicId) { t = topics[i]; break; } }
    if (!t || !t.replies) return;
    var ri = -1;
    for (var j = 0; j < t.replies.length; j++) { if (t.replies[j].id === replyId) { ri = j; break; } }
    if (ri < 0) return;
    if (key === ADMIN_KEY || (t.replies[ri].delkey && key === t.replies[ri].delkey)) {
      t.replies.splice(ri, 1);
      this._save(topics);
      this.openSet[topicId] = true;
      this.render();
    } else { alert('削除キーが一致しません。'); }
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
    var topics = this._topics();
    var total = topics.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (self.page >= totalPages) self.page = totalPages - 1;
    if (self.page < 0) self.page = 0;
    var start = self.page * PAGE_SIZE;
    var pageTopics = topics.slice(start, start + PAGE_SIZE);

    // カウント表示
    if (self.countEl) {
      self.countEl.textContent = '(' + total + '件)';
    }

    // リストクリア
    while (self.listEl.firstChild) self.listEl.removeChild(self.listEl.firstChild);

    if (total === 0) {
      self.listEl.appendChild(el('p', { className: 'tp-empty', textContent: 'まだ投稿がありません。' }));
      return;
    }

    // トピック描画
    pageTopics.forEach(function (t, pageIdx) {
      var globalIdx = start + pageIdx;
      var topicNum = total - globalIdx; // 表示番号（新しい順）
      var isOpen = !!self.openSet[t.id];
      var rc = (t.replies && t.replies.length) || 0;

      var article = el('article', { className: 'tp' });

      // ヘッダー行
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
        el('span', { className: 'tog', id: 'tg-' + t.id, textContent: isOpen ? '[-]' : '[+]' }),
      ]);
      article.appendChild(head);

      // 詳細
      var detail = el('div', { className: 'tp-detail' + (isOpen ? ' open' : ''), id: 'td-' + t.id });

      // 本文
      var bodyDiv = el('div', { className: 'tp-body' });
      bodyDiv.appendChild(textToNodes(t.body));
      detail.appendChild(bodyDiv);

      // 削除ボタン
      var actions = el('div', { className: 'tp-actions' });
      actions.appendChild(el('button', {
        className: 'btn btn-sm btn-del',
        textContent: '削除',
        onClick: function (e) { e.stopPropagation(); self.deleteTopic(t.id); }
      }));
      detail.appendChild(actions);

      // レス表示
      if (t.replies) {
        t.replies.forEach(function (r) {
          var reply = el('div', { className: 'reply' });
          var rHead = el('div', { className: 'r-head' }, [
            el('span', { className: 'r-nm', textContent: r.name }),
            el('span', { className: 'r-da', textContent: r.date }),
          ]);
          reply.appendChild(rHead);
          var rBody = el('div', { className: 'r-body' });
          rBody.appendChild(textToNodes(r.body));
          reply.appendChild(rBody);
          var rDel = el('div', { className: 'r-del' });
          rDel.appendChild(el('button', {
            className: 'btn btn-sm btn-del',
            textContent: '削除',
            onClick: function (e) { e.stopPropagation(); self.deleteReply(t.id, r.id); }
          }));
          reply.appendChild(rDel);
          detail.appendChild(reply);
        });
      }

      // レスフォーム（折りたたみ式）
      var rf = el('div', { className: 'reply-form' });
      var rfToggle = el('button', {
        className: 'btn btn-sm rf-toggle',
        textContent: '返信する ▼',
        onClick: function (e) {
          e.stopPropagation();
          var isOpen = rfBody.classList.toggle('open');
          rfToggle.textContent = isOpen ? '返信を閉じる ▲' : '返信する ▼';
        }
      });
      rf.appendChild(rfToggle);

      var rfBody = el('div', { className: 'rf-body' });
      var rnInput = el('input', { type: 'text', placeholder: '名無しさん', maxlength: '30' });
      var rbArea = el('textarea', { placeholder: '返信を入力' });
      var rdInput = el('input', { type: 'password', placeholder: '削除キー', maxlength: '8' });

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
            rnInput.value = ''; rbArea.value = ''; rdInput.value = '';
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

  // グローバル公開
  window.BBS = BBS;
})();
