(function () {
  // ---- 見た目のパラメータ(元の Design Canvas 版のデフォルト値と同じ) ----
  var W = 168, H = 248, T = 4;
  var GAP = 72;
  var ACCENT = '#8a1f2f';
  var ACCENT_DEEP = '#430e18';
  var GOLD = '#d9b872';
  var TILT_X = 12;
  var SPEED = 7; // deg/秒
  var CARD_COUNT = 12;
  var DEFAULT_HEADLINE = '1〜12 のカードを円柱状に配置';
  var deg2rad = Math.PI / 180;

  function $(id) { return document.getElementById(id); }

  var stage = $('ccStage');
  var scene = $('ccScene');
  var axis = $('ccAxis');
  var toggleBtn = $('ccToggle');
  var headlineEl = $('ccHeadline');
  var toastEl = $('ccToast');

  var registerOpenBtn = $('ccRegisterOpen');
  var registerBackdrop = $('ccRegisterBackdrop');
  var registerSave = $('ccRegisterSave');
  var registerError = $('ccRegisterError');
  var titleInput = $('ccFormTitle');
  var genreInput = $('ccFormGenre');
  var categoryInput = $('ccFormCategory');
  var registrantInput = $('ccFormRegistrant');
  var addressInput = $('ccFormAddress');
  var memoInput = $('ccFormMemo');
  var imageSlotsEl = $('ccImageSlots');

  var filterOpenBtn = $('ccFilterOpen');
  var filterBackdrop = $('ccFilterBackdrop');
  var filterCategory = $('ccFilterCategory');
  var filterGenre = $('ccFilterGenre');
  var filterKeyword = $('ccFilterKeyword');
  var filterCount = $('ccFilterCount');

  var detailOverlay = $('ccDetailOverlay');
  var detailPhoto = $('ccDetailPhoto');
  var detailPhotoInner = $('ccDetailPhotoInner');
  var detailDots = $('ccDetailDots');
  var detailTitle = $('ccDetailTitle');
  var detailMeta = $('ccDetailMeta');
  var detailMemo = $('ccDetailMemo');
  var detailDelete = $('ccDetailDelete');

  axis.style.height = (H + 30) + 'px';

  // ---- サーバーとのやりとり ----
  // ログインが切れていたら(401)ログイン画面に戻す
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      if (res.status === 401) { location.href = '/login'; throw new Error('ログインが必要です'); }
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ('通信エラー(' + res.status + ')'));
        return data;
      });
    });
  }

  function imageUrl(group, slot) {
    return '/api/groups/' + group.id + '/images/' + slot;
  }

  var toastTimer = null;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3000);
  }

  // ---- 画像グループ ----
  // allGroups: サーバーにある全グループ(登録順)
  // activeGroups: 絞り込み条件に合うグループ(カードへの割り当てはこちらを使う)
  var allGroups = [];
  var activeGroups = [];
  var filter = { category: '', genre: '', keyword: '' };

  function matchesFilter(g) {
    if (filter.category && g.category !== filter.category) return false;
    if (filter.genre && g.genre !== filter.genre) return false;
    if (filter.keyword) {
      var kw = filter.keyword.toLowerCase();
      if ((g.title + '\n' + g.memo).toLowerCase().indexOf(kw) === -1) return false;
    }
    return true;
  }

  function loadGroups() {
    return api('GET', '/api/groups').then(function (groups) {
      allGroups = groups;
      refreshFilterOptions();
      applyFilter();
    }).catch(function (err) { showToast('読み込みに失敗しました: ' + err.message); });
  }

  // ---- カードのDOMを一度だけ組み立てる ----
  var cards = [];
  for (var i = 0; i < CARD_COUNT; i++) {
    var num = i + 1;

    var pivot = document.createElement('div');
    pivot.className = 'cc-pivot';

    var wrapper = document.createElement('div');
    wrapper.className = 'cc-wrapper';
    wrapper.style.left = GAP + 'px';
    wrapper.style.top = (-H / 2) + 'px';
    wrapper.style.width = W + 'px';
    wrapper.style.height = H + 'px';

    var front = document.createElement('div');
    front.className = 'cc-face cc-front';
    front.style.width = W + 'px';
    front.style.height = H + 'px';
    front.style.border = '1.5px solid ' + GOLD;
    front.style.background = 'linear-gradient(155deg,' + ACCENT + ' 0%,' + ACCENT_DEEP + ' 100%)';

    var thumbImg = document.createElement('img');
    thumbImg.className = 'cc-card-thumb';
    thumbImg.alt = '';
    thumbImg.style.display = 'none';

    var numBig = document.createElement('div');
    numBig.className = 'cc-num cc-num-big';
    numBig.textContent = String(num);

    var numTl = document.createElement('div');
    numTl.className = 'cc-num cc-num-corner cc-num-tl';
    numTl.textContent = String(num);

    var numBr = document.createElement('div');
    numBr.className = 'cc-num cc-num-corner cc-num-br';
    numBr.textContent = String(num);

    var overlay = document.createElement('div');
    overlay.className = 'cc-overlay';

    front.appendChild(thumbImg);
    front.appendChild(numBig);
    front.appendChild(numTl);
    front.appendChild(numBr);
    front.appendChild(overlay);

    var back = document.createElement('div');
    back.className = 'cc-face cc-back';
    back.style.width = W + 'px';
    back.style.height = H + 'px';
    back.style.border = '1.5px solid ' + GOLD;
    back.style.background = 'repeating-linear-gradient(45deg,' + ACCENT_DEEP + ' 0px,' + ACCENT_DEEP + ' 6px,#2c0910 6px,#2c0910 12px)';
    back.style.transform = 'rotateY(180deg) translateZ(' + (T / 2) + 'px)';

    var right = document.createElement('div');
    right.className = 'cc-face';
    right.style.left = (W - T / 2) + 'px';
    right.style.width = T + 'px';
    right.style.height = H + 'px';
    right.style.background = 'linear-gradient(90deg,' + ACCENT_DEEP + ',#22070d)';
    right.style.transform = 'rotateY(90deg)';

    var top = document.createElement('div');
    top.className = 'cc-face';
    top.style.top = (-T / 2) + 'px';
    top.style.width = W + 'px';
    top.style.height = T + 'px';
    top.style.background = 'linear-gradient(180deg,#c79a5a,' + GOLD + ')';
    top.style.transform = 'rotateX(90deg)';

    var bottom = document.createElement('div');
    bottom.className = 'cc-face';
    bottom.style.top = (H - T / 2) + 'px';
    bottom.style.width = W + 'px';
    bottom.style.height = T + 'px';
    bottom.style.background = 'linear-gradient(180deg,' + ACCENT_DEEP + ',#22070d)';
    bottom.style.transform = 'rotateX(-90deg)';

    wrapper.setAttribute('data-index', String(i));

    wrapper.appendChild(front);
    wrapper.appendChild(back);
    wrapper.appendChild(right);
    wrapper.appendChild(top);
    wrapper.appendChild(bottom);
    pivot.appendChild(wrapper);
    scene.appendChild(pivot);

    cards.push({
      baseAngle: i * 30, pivot: pivot, wrapper: wrapper, front: front, overlay: overlay,
      numBig: numBig, thumbImg: thumbImg, group: null, prevWorld: null,
    });
  }

  // front面の translateZ はここで一度だけ設定(twist回転は wrapper 側が担当)
  cards.forEach(function (c) { c.front.style.transform = 'translateZ(' + (T / 2) + 'px)'; });

  // ---- カードへのグループ割り当て ----
  // 12件以下: カード i にグループ (i mod 件数) を繰り返し表示する。
  // 13件以上: 最初はグループ 1〜12 を載せ、各カードが基準の0°(円柱の奥側)を通過する
  //           たびに、まだ載っていない次の順番のグループへ差し替える(コンベア式)。
  var nextGroupIndex = 0;

  function setCardGroup(c, group) {
    c.group = group;
    if (group && group.images[0]) {
      var src = imageUrl(group, 0);
      if (c.thumbImg.getAttribute('src') !== src) c.thumbImg.src = src;
      c.thumbImg.style.display = '';
      c.numBig.style.display = 'none';
    } else {
      c.thumbImg.style.display = 'none';
      c.thumbImg.removeAttribute('src');
      c.numBig.style.display = '';
    }
  }

  function assignCards() {
    var n = activeGroups.length;
    cards.forEach(function (c, idx) {
      setCardGroup(c, n ? activeGroups[idx % n] : null);
    });
    nextGroupIndex = n ? CARD_COUNT % n : 0;
  }

  function advanceCard(c) {
    var n = activeGroups.length;
    if (n <= CARD_COUNT) return;
    setCardGroup(c, activeGroups[nextGroupIndex]);
    nextGroupIndex = (nextGroupIndex + 1) % n;
  }

  // 正方向の回転で 360°→0° をまたいだカードを差し替える
  function checkConveyor(c, worldMod) {
    if (c.prevWorld !== null) {
      var delta = ((worldMod - c.prevWorld + 540) % 360) - 180;
      if (delta > 0 && worldMod < c.prevWorld) advanceCard(c);
    }
    c.prevWorld = worldMod;
  }

  // ---- 06:30(195°)⇄05:30(165°) の付近で「見た目の向き」だけ180°補正する ----
  // (位置=円柱上の配置はそのまま。カード自体だけを裏返して番号面を常に正面に保つ)
  var sinTilt = Math.sin(TILT_X * deg2rad) || 0.001;
  function worldForClock(clockDeg) {
    var r = clockDeg * deg2rad;
    var w = Math.atan2(Math.cos(r) / sinTilt, Math.sin(r)) / deg2rad;
    if (w < 0) w += 360;
    return w;
  }
  var exitA = worldForClock(195);
  var exitB = worldForClock(165);
  var exitCenter = (exitA + exitB) / 2;
  var FLIP_WIDEN = 2.5; // 反転をゆっくりにする倍率(大きいほどゆっくり)
  var exitHalf = (Math.abs(exitA - exitB) / 2) * FLIP_WIDEN;
  var exitLo = exitCenter - exitHalf;
  var exitHi = exitCenter + exitHalf;
  var winWidth = (exitHi - exitLo) || 0.001;
  var entryLo = 360 - exitHi;
  var entryHi = 360 - exitLo;
  var worldTarget180 = worldForClock(180);

  function twistFor(worldDeg) {
    var wm = worldDeg % 360;
    if (wm < 0) wm += 360;
    if (wm >= exitLo && wm <= exitHi) return (180 * (exitHi - wm)) / winWidth;      // 180°→0°
    if (wm >= entryLo && wm <= entryHi) return (180 * (wm - entryLo)) / winWidth;   // 0°→180°
    if (wm > entryHi && wm < exitLo) return 180;                                    // 背面側:常に180°補正
    return 0;                                                                       // 表面側:補正不要
  }

  // ---- アニメーションループ ----
  var spin = 25;
  var playing = true;
  var dragging = false;
  var dragMoved = false;
  var last = null;
  var lastHeadlineText = null;

  function updateHeadline() {
    var bestDiff = Infinity, frontCard = cards[0];
    cards.forEach(function (c) {
      var w = (c.baseAngle + spin) % 360;
      var diff = Math.abs(w - worldTarget180);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) { bestDiff = diff; frontCard = c; }
    });
    var g = frontCard.group;
    var text = (g && g.title) ? g.title : DEFAULT_HEADLINE;
    if (text !== lastHeadlineText) {
      headlineEl.textContent = text;
      lastHeadlineText = text;
    }
  }

  function render() {
    scene.style.transform =
      'translate(-50%,-50%) rotateX(' + (-TILT_X) + 'deg) rotateY(' + spin + 'deg)';

    cards.forEach(function (c) {
      var world = c.baseAngle + spin;
      checkConveyor(c, ((world % 360) + 360) % 360);
      var twist = twistFor(world);
      var facing = Math.cos((world + twist) * deg2rad);
      var shade = 0.26 + 0.62 * Math.max(0, facing);
      var overlayAlpha = (1 - shade).toFixed(3);

      c.pivot.style.transform = 'translateY(-50%) rotateY(' + c.baseAngle + 'deg)';
      c.wrapper.style.transform = 'rotateY(' + twist + 'deg)';
      c.overlay.style.background = 'rgba(0,0,0,' + overlayAlpha + ')';
    });

    updateHeadline();
  }

  function loop(t) {
    if (last === null) last = t;
    var dt = t - last;
    last = t;
    if (playing && !dragging) {
      spin = (spin + (dt / 1000) * SPEED) % 360;
    }
    render();
    requestAnimationFrame(loop);
  }

  toggleBtn.addEventListener('click', function () {
    playing = !playing;
    toggleBtn.textContent = playing ? '一時停止' : '再生する';
  });

  // ---- ドラッグ / スワイプで手動回転(モーダルや詳細画面が開いている間は無効) ----
  // ボタンをクリックした時は setPointerCapture を奪わないようにし、カードのクリック
  // (画像グループの選択)は移動量の少ないポインター操作として stage 側でまとめて判定する。
  // ( setPointerCapture 中はブラウザの click イベントが捕獲先の要素に付け替わってしまい、
  //   ボタンやカードの通常の click ハンドラが発火しなくなるため。)
  var dragStartX = 0;
  var dragStartSpin = 0;
  var SENSITIVITY = 0.4; // 1pxのドラッグ = 0.4度の回転
  var downCardIndex = null;

  function overlayOpen() {
    return registerBackdrop.style.display !== 'none' ||
      filterBackdrop.style.display !== 'none' ||
      selectedGroup !== null;
  }

  stage.addEventListener('pointerdown', function (e) {
    if (overlayOpen()) return;
    if (e.target.closest('button, form')) return;
    dragStartX = e.clientX;
    dragStartSpin = spin;
    dragMoved = false;
    var wrapperEl = e.target.closest('.cc-wrapper');
    downCardIndex = wrapperEl ? parseInt(wrapperEl.getAttribute('data-index'), 10) : null;
    dragging = true;
    stage.classList.add('cc-dragging');
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });

  stage.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 2) dragMoved = true;
    var s = (dragStartSpin + dx * SENSITIVITY) % 360;
    if (s < 0) s += 360;
    spin = s;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('cc-dragging');
    if (!dragMoved && downCardIndex !== null) openDetail(cards[downCardIndex].group);
    downCardIndex = null;
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ---- 画像を canvas で縮小してから data URL にする(送信量とDB容量を抑えるため) ----
  function resizeImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('画像を読み込めませんでした')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('画像として開けないファイルです')); };
        img.onload = function () {
          var maxDim = 900;
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- 登録モーダル ----
  var formImages = [null, null, null, null];
  var slotPreviewEls = [];
  var slotFileInputs = [];

  [0, 1, 2, 3].forEach(function (idx) {
    var slot = document.createElement('div');
    slot.className = 'cc-image-slot';

    var preview = document.createElement('div');
    preview.className = 'cc-image-slot-preview';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      resizeImageFile(file).then(function (dataUrl) {
        formImages[idx] = dataUrl;
        renderImageSlots();
      }, function (err) { registerError.textContent = err.message; });
    });

    slot.appendChild(preview);
    slot.appendChild(fileInput);
    imageSlotsEl.appendChild(slot);
    slotPreviewEls.push(preview);
    slotFileInputs.push(fileInput);
  });

  function renderImageSlots() {
    for (var k = 0; k < 4; k++) {
      var src = formImages[k];
      slotPreviewEls[k].innerHTML = '';
      if (src) {
        var img = document.createElement('img');
        img.src = src;
        slotPreviewEls[k].appendChild(img);
      } else {
        var span = document.createElement('span');
        span.textContent = k === 0 ? 'サムネイル' : ('画像' + (k + 1));
        slotPreviewEls[k].appendChild(span);
      }
    }
  }

  function openRegister() {
    [titleInput, genreInput, categoryInput, registrantInput, addressInput, memoInput].forEach(function (el) { el.value = ''; });
    slotFileInputs.forEach(function (el) { el.value = ''; });
    formImages = [null, null, null, null];
    registerError.textContent = '';
    renderImageSlots();
    registerBackdrop.style.display = 'flex';
    titleInput.focus();
  }

  function closeRegister() {
    registerBackdrop.style.display = 'none';
  }

  registerOpenBtn.addEventListener('click', openRegister);
  $('ccRegisterClose').addEventListener('click', closeRegister);
  $('ccRegisterCancel').addEventListener('click', closeRegister);
  registerBackdrop.addEventListener('click', function (e) {
    if (e.target === registerBackdrop) closeRegister();
  });

  registerSave.addEventListener('click', function () {
    if (!titleInput.value.trim()) {
      registerError.textContent = 'タイトルを入力してください';
      titleInput.focus();
      return;
    }
    registerError.textContent = '';
    registerSave.disabled = true;
    registerSave.textContent = '保存中…';
    api('POST', '/api/groups', {
      title: titleInput.value,
      genre: genreInput.value,
      category: categoryInput.value,
      registrant: registrantInput.value,
      address: addressInput.value,
      memo: memoInput.value,
      images: formImages,
    }).then(function () {
      closeRegister();
      showToast('登録しました');
      return loadGroups();
    }, function (err) {
      registerError.textContent = err.message;
    }).then(function () {
      registerSave.disabled = false;
      registerSave.textContent = '登録する';
    });
  });

  // ---- 絞り込み ----
  function uniqueSorted(field) {
    var seen = {};
    allGroups.forEach(function (g) { if (g[field]) seen[g[field]] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'ja'); });
  }

  function fillSelect(select, values, current) {
    select.innerHTML = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'すべて';
    select.appendChild(all);
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = values.indexOf(current) === -1 ? '' : current;
  }

  function fillDatalist(list, values) {
    list.innerHTML = '';
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      list.appendChild(opt);
    });
  }

  function refreshFilterOptions() {
    var categories = uniqueSorted('category');
    var genres = uniqueSorted('genre');
    fillSelect(filterCategory, categories, filter.category);
    fillSelect(filterGenre, genres, filter.genre);
    fillDatalist($('ccCategoryList'), categories);
    fillDatalist($('ccGenreList'), genres);
  }

  function readFilterForm() {
    return {
      category: filterCategory.value,
      genre: filterGenre.value,
      keyword: filterKeyword.value.trim(),
    };
  }

  function updateFilterCount() {
    var saved = filter;
    filter = readFilterForm();
    var count = allGroups.filter(matchesFilter).length;
    filter = saved;
    filterCount.textContent = '該当 ' + count + ' 件 / 全 ' + allGroups.length + ' 件';
  }

  function applyFilter() {
    activeGroups = allGroups.filter(matchesFilter);
    var active = !!(filter.category || filter.genre || filter.keyword);
    filterOpenBtn.textContent = active ? '絞り込み(' + activeGroups.length + '件)' : '絞り込み';
    filterOpenBtn.classList.toggle('cc-active', active);
    assignCards();
  }

  function openFilter() {
    filterCategory.value = filter.category;
    filterGenre.value = filter.genre;
    filterKeyword.value = filter.keyword;
    updateFilterCount();
    filterBackdrop.style.display = 'flex';
  }

  function closeFilter() {
    filterBackdrop.style.display = 'none';
  }

  filterOpenBtn.addEventListener('click', openFilter);
  $('ccFilterClose').addEventListener('click', closeFilter);
  filterBackdrop.addEventListener('click', function (e) {
    if (e.target === filterBackdrop) closeFilter();
  });
  [filterCategory, filterGenre].forEach(function (el) { el.addEventListener('change', updateFilterCount); });
  filterKeyword.addEventListener('input', updateFilterCount);

  $('ccFilterApply').addEventListener('click', function () {
    filter = readFilterForm();
    applyFilter();
    closeFilter();
  });
  $('ccFilterClear').addEventListener('click', function () {
    filterCategory.value = '';
    filterGenre.value = '';
    filterKeyword.value = '';
    updateFilterCount();
  });

  // ---- カードをクリックして詳細を表示(4枚の画像はスワイプで切り替え) ----
  var selectedGroup = null;
  var photoIndex = 0;

  function openDetail(group) {
    if (!group) return;
    selectedGroup = group;
    photoIndex = 0;
    renderDetail();
    detailOverlay.style.display = 'flex';
  }

  function closeDetail() {
    selectedGroup = null;
    detailOverlay.style.display = 'none';
  }

  function renderDetail() {
    var g = selectedGroup;
    detailTitle.textContent = g.title;
    detailMeta.innerHTML = '';
    ['ジャンル: ' + g.genre, 'カテゴリー: ' + g.category, '登録者: ' + g.registrant, '住所: ' + g.address].forEach(function (t) {
      var span = document.createElement('span');
      span.textContent = t;
      detailMeta.appendChild(span);
    });
    detailMemo.textContent = g.memo;
    renderDetailPhoto();
  }

  function renderDetailPhoto() {
    var g = selectedGroup;
    detailPhotoInner.innerHTML = '';
    if (g.images[photoIndex]) {
      var img = document.createElement('img');
      img.src = imageUrl(g, photoIndex);
      img.alt = g.title + ' の画像' + (photoIndex + 1);
      detailPhotoInner.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.textContent = '画像なし';
      detailPhotoInner.appendChild(span);
    }
    detailDots.innerHTML = '';
    for (var k = 0; k < 4; k++) {
      var dot = document.createElement('div');
      dot.className = 'cc-detail-dot' + (k === photoIndex ? ' active' : '');
      detailDots.appendChild(dot);
    }
  }

  function nextPhoto() { photoIndex = (photoIndex + 1) % 4; renderDetailPhoto(); }
  function prevPhoto() { photoIndex = (photoIndex + 3) % 4; renderDetailPhoto(); }

  $('ccDetailClose').addEventListener('click', closeDetail);
  $('ccDetailPrev').addEventListener('click', prevPhoto);
  $('ccDetailNext').addEventListener('click', nextPhoto);

  detailDelete.addEventListener('click', function () {
    var g = selectedGroup;
    if (!g || !confirm('「' + g.title + '」を削除しますか?(元に戻せません)')) return;
    api('DELETE', '/api/groups/' + g.id).then(function () {
      closeDetail();
      showToast('削除しました');
      return loadGroups();
    }, function (err) { showToast('削除に失敗しました: ' + err.message); });
  });

  // 詳細画面の画像はスワイプ(横ドラッグ)で切り替える。ステージ全体の回転ドラッグとは
  // 別の独立したジェスチャーとして扱う(stopPropagationでステージ側に伝播させない)。
  // ‹ › ボタンの上では setPointerCapture しない(ボタンの click が届かなくなるため)。
  var photoDragStartX = null;

  detailPhoto.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    if (e.target.closest('button')) return;
    photoDragStartX = e.clientX;
    try { detailPhoto.setPointerCapture(e.pointerId); } catch (err) {}
  });
  detailPhoto.addEventListener('pointermove', function (e) {
    e.stopPropagation();
  });
  function endPhotoDrag(e) {
    e.stopPropagation();
    if (photoDragStartX === null) return;
    try { detailPhoto.releasePointerCapture(e.pointerId); } catch (err) {}
    var dx = e.clientX - photoDragStartX;
    var THRESHOLD = 40;
    if (dx <= -THRESHOLD) nextPhoto();
    else if (dx >= THRESHOLD) prevPhoto();
    photoDragStartX = null;
  }
  detailPhoto.addEventListener('pointerup', endPhotoDrag);
  detailPhoto.addEventListener('pointercancel', endPhotoDrag);

  renderImageSlots();
  assignCards();
  loadGroups();
  requestAnimationFrame(loop);
})();
