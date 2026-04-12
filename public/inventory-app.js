// ===== inventory-app.js（Next.js 移植版：google.script.run → fetch）=====

class InventoryApp {
  constructor() {
    this.products = {};
    this.selectedProductId = null;
    this.editingRowIndex = null;
    this.dateFrom = null;
    this.dateTo = null;
    this.partners = [];
    this.selectedPartnerForView = null;
    this.activeView = 'inventory';
    this.editingPartnerNo = null;
    this.partnerDateFrom = null;
    this.partnerDateTo = null;
    this.isSaving = false;
    this.saveQueued = false;
    this.lastSaveOkAt = null;
    this.partnerInactivityMap = {};
    this.inactivityThresholdKey = '3m';
    this.STORAGE_KEY_MAIN = 'sakagura_inventory_v2';
    this.STORAGE_KEY_FALLBACK = 'sakagura_inventory_v3';
    this.LAST_PRODUCT_KEY = 'sakagura_last_product_id';
    this._partnersLoadedOnce = false;
    this._partnersLoading = false;
    this.STAFF_KEY = 'sakagura_staff_list';
    this.staffList = [];
    this.mapScope = 'domestic';
    this.mapSelectedPrefecture = '';
    this.mapSelectedCountry = '';
    this.mapDateFrom = null;
    this.mapDateTo = null;
    this._jpnAtlasTopology = null;
    this._worldAtlasTopology = null;
    this._svgZoomState = {};
  }

  // GAS の init() チェック削除 — Next.js では常に通常起動
  init() {
    this.loadStaffList_();
    this.loadInactivityThreshold_();
    this.bindEvents();
    this.loadPartners_(() => {
      this.loadData();
      this.showInventoryView_();
    });
  }

  normalizeCountry_(country) { return String(country || '').trim(); }

  normalizeCountryKey_(country) {
    const s = String(country || '').trim().toLowerCase();
    if (!s) return '';
    const map = {
      'usa':'united states','u.s.a.':'united states','us':'united states','u.s.':'united states',
      'uk':'united kingdom','u.k.':'united kingdom',
      'jp':'japan','\u65e5\u672c':'japan',
      'south korea':'south korea','korea, republic of':'south korea','republic of korea':'south korea',
      'north korea':'north korea',"korea, democratic people's republic of":'north korea',
      'russia':'russia','russian federation':'russia',
      'uae':'united arab emirates','u.a.e.':'united arab emirates',
      'czech republic':'czechia',
      'ivory coast':'\u00c3\u00b4te d\u2019ivoire',"cote d'ivoire":'\u00c3\u00b4te d\u2019ivoire',
      'c\u00f4te d\u2019ivoire':'\u00c3\u00b4te d\u2019ivoire'
    };
    return map[s] || s;
  }

  isJapanCountry_(country) {
    const c = this.normalizeCountry_(country).toLowerCase();
    return c === 'japan' || c === '\u65e5\u672c' || c === 'jp';
  }

  normalizePartnerType_(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'export' || s === '\u8f38\u51fa') return 'export';
    return 'domestic';
  }

  isExportPartner_(p) { return this.normalizePartnerType_(p?.partnerType) === 'export'; }

  getEffectiveDomesticPrefecture_(p) {
    if (!p) return '';
    const partnerType = this.normalizePartnerType_(p.partnerType);
    const released = !!p.mapConditionReleased;
    const pref = String(p.prefecture || '').trim();
    const country = this.normalizeCountry_(p.country);
    if (!pref) return '';
    if (partnerType === 'export') return released ? pref : '';
    if (this.isJapanCountry_(country) || country === '') return pref;
    return '';
  }

  getEffectiveWorldCountry_(p) {
    if (!p) return '';
    const partnerType = this.normalizePartnerType_(p.partnerType);
    const released = !!p.mapConditionReleased;
    const exportCountry = this.normalizeCountry_(p.exportCountry);
    const country = this.normalizeCountry_(p.country);
    if (partnerType === 'export') {
      if (exportCountry) return exportCountry;
      if (released && country && !this.isJapanCountry_(country)) return country;
      return '';
    }
    if (country && !this.isJapanCountry_(country)) return country;
    return '';
  }

  buildPartnerLocationLine_(p) {
    if (!p) return '';
    const partnerType = this.normalizePartnerType_(p.partnerType);
    const country = this.normalizeCountry_(p.country);
    const pref = String(p.prefecture || '').trim();
    const addr = String(p.address || '').trim();
    const exportCountry = this.normalizeCountry_(p.exportCountry);
    const released = !!p.mapConditionReleased;
    if (partnerType === 'export') {
      const left = [country || 'Japan', pref, addr].filter(Boolean).join(' / ');
      const right = exportCountry ? `\u8f38\u51fa\u5148: ${exportCountry}` : '\u8f38\u51fa\u5148: \u672a\u8a2d\u5b9a';
      return released ? `${left} / ${right} / \u6761\u4ef6\u89e3\u9664ON` : `${left} / ${right}`;
    }
    if (!country && !pref && !addr) return '';
    if (this.isJapanCountry_(country) || country === '') return [country || 'Japan', pref, addr].filter(Boolean).join(' / ');
    return [country, addr].filter(Boolean).join(' / ');
  }

  partnerTypeBadgeHtml_(p) {
    const type = this.normalizePartnerType_(p?.partnerType);
    if (type === 'export') {
      const label = p?.exportCountry ? `\u8f38\u51fa / ${this.escapeHtml_(p.exportCountry)}` : '\u8f38\u51fa';
      return `<span class="partner-type-badge">${label}</span>`;
    }
    return `<span class="partner-type-badge">\u56fd\u5185</span>`;
  }

  setSaveStatus_(state, message) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    el.className = 'save-status ' + (state || 'wait');
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  setUiDisabledWhileSaving_(disabled) {
    const ids = ['addRowBtn','addProductBtn','modalConfirm','rowModalConfirm',
      'partnerSaveBtn','exportSelectedPartnerCsvBtn','deleteProductBtn','updateProductNameBtn',
      'mapExportSelectedPartnerCsvBtn'];
    ids.forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = !!disabled;
    });
  }

  loadInactivityThreshold_() {
    const v = String(localStorage.getItem('sakagura_inactivity_threshold') || '').trim();
    if (this.isValidInactivityKey_(v)) this.inactivityThresholdKey = v;
  }

  isValidInactivityKey_(v) {
    if (!v) return false;
    if (v === '1y') return true;
    return !!String(v).match(/^([1-9]|1[0-2])m$/);
  }

  saveInactivityThreshold_(key) {
    this.inactivityThresholdKey = key;
    localStorage.setItem('sakagura_inactivity_threshold', key);
  }

  formatYmd_(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  calcCutoffYmd_(key) {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const k = String(key || '').trim();
    if (k === '1y') { base.setFullYear(base.getFullYear() - 1); return this.formatYmd_(base); }
    const m = k.match(/^([1-9]|1[0-2])m$/);
    if (m) { base.setMonth(base.getMonth() - Number(m[1])); return this.formatYmd_(base); }
    base.setMonth(base.getMonth() - 3);
    return this.formatYmd_(base);
  }

  calcPartnerInactivity_() {
    const cutoff = this.calcCutoffYmd_(this.inactivityThresholdKey);
    const lastByNo = {};
    Object.values(this.products || {}).forEach(prod => {
      (prod.rows || []).forEach(r => {
        const pno = Number(r.partnerNo || 0);
        if (!pno) return;
        const d = String(r.date || '').trim();
        if (!d) return;
        const order = (Number(r.ship1F) || 0) + (Number(r.ship2F) || 0);
        if (order <= 0) return;
        if (!lastByNo[pno] || d > lastByNo[pno]) lastByNo[pno] = d;
      });
    });
    const map = {};
    (this.partners || []).forEach(p => {
      const no = Number(p.no || 0);
      if (!no) return;
      const last = lastByNo[no] || '';
      if (!last) { map[no] = { lastDate: '', cutoff }; return; }
      if (last < cutoff) map[no] = { lastDate: last, cutoff };
    });
    this.partnerInactivityMap = map;
  }

  bindEvents() {
    const productSelect = document.getElementById('productSelect');
    if (productSelect) {
      productSelect.onchange = (e) => {
        const id = e.target.value;
        this.showInventoryView_();
        this.selectProduct(id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
    const nav = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    nav('navInventoryBtn', () => this.showInventoryView_());
    nav('navPartnersBtn', () => this.showPartnersView_());
    nav('navAnalysisBtn', () => this.showAnalysisView_());
    nav('navMapBtn', () => this.showMapView_());
    nav('analysisYearSelect', null);
    const yearSel = document.getElementById('analysisYearSelect');
    if (yearSel) yearSel.onchange = () => this.renderAnalysisRanking_();
    const afs = document.getElementById('analysisFilterStatus');
    if (afs) afs.onchange = () => this.renderAnalysisRanking_();
    const ask = document.getElementById('analysisSortKey');
    if (ask) ask.onchange = () => this.renderAnalysisRanking_();
    nav('usageBtn', () => this.openModal_('usageModal'));
    nav('addProductBtn', () => this.openModal_('productModal'));
    nav('modalConfirm', () => this.addProduct());
    nav('addRowBtn', () => this.showRowModal());
    nav('rowModalConfirm', () => this.saveRow());

    const btnApply = document.getElementById('btnApplyDateRange');
    if (btnApply) btnApply.onclick = () => {
      this.dateFrom = document.getElementById('dateFrom')?.value || null;
      this.dateTo = document.getElementById('dateTo')?.value || null;
      const label = document.getElementById('displayPeriodLabel');
      if (label) label.textContent = (this.dateFrom || this.dateTo)
        ? `\u8868\u793a\u671f\u9593: ${this.dateFrom || '\u59cb'} \u301c ${this.dateTo || '\u7d42'}`
        : '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderTable(); this.updateSummary(); this.updatePrintHeader_();
    };
    const btnReset = document.getElementById('btnResetDateRange');
    if (btnReset) btnReset.onclick = () => {
      this.dateFrom = null; this.dateTo = null;
      const df = document.getElementById('dateFrom'); const dt = document.getElementById('dateTo');
      if (df) df.value = ''; if (dt) dt.value = '';
      const label = document.getElementById('displayPeriodLabel');
      if (label) label.textContent = '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderTable(); this.updateSummary(); this.updatePrintHeader_();
    };

    nav('partnerBtnInline', () => this.openPartnerModal(null));
    nav('partnerSaveBtn', () => this.savePartner());

    const psi = document.getElementById('partnerSearchInput');
    if (psi) psi.oninput = () => this.renderPartnerList_();
    const pcsi = document.getElementById('partnerCountrySearchInput');
    if (pcsi) pcsi.oninput = () => this.renderPartnerList_();
    const ppsi = document.getElementById('partnerPrefectureSearchInput');
    if (ppsi) ppsi.oninput = () => this.renderPartnerList_();
    const pcsb = document.getElementById('partnerClearSearchBtn');
    if (pcsb) pcsb.onclick = () => {
      const a = document.getElementById('partnerSearchInput'); if (a) a.value = '';
      const b = document.getElementById('partnerCountrySearchInput'); if (b) b.value = '';
      const c = document.getElementById('partnerPrefectureSearchInput'); if (c) c.value = '';
      this.renderPartnerList_();
    };

    const countrySel = document.getElementById('partnerCountry');
    if (countrySel) countrySel.onchange = () => this.onPartnerCountryChange_();
    const ptd = document.getElementById('partnerTypeDomestic');
    const pte = document.getElementById('partnerTypeExport');
    const ecs = document.getElementById('partnerExportCountry');
    const rel = document.getElementById('partnerMapConditionReleased');
    if (ptd) ptd.onchange = () => this.onPartnerTypeChange_();
    if (pte) pte.onchange = () => this.onPartnerTypeChange_();
    if (ecs) ecs.onchange = () => this.onPartnerTypeChange_();
    if (rel) rel.onchange = () => this.onPartnerTypeChange_();

    const pApply = document.getElementById('partnerBtnApplyDateRange');
    if (pApply) pApply.onclick = () => {
      this.partnerDateFrom = document.getElementById('partnerDateFrom')?.value || null;
      this.partnerDateTo = document.getElementById('partnerDateTo')?.value || null;
      const label = document.getElementById('partnerDisplayPeriodLabel');
      if (label) label.textContent = (this.partnerDateFrom || this.partnerDateTo)
        ? `\u8868\u793a\u671f\u9593: ${this.partnerDateFrom || '\u59cb'} \u301c ${this.partnerDateTo || '\u7d42'}`
        : '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderPartnerShipments_();
    };
    const pReset = document.getElementById('partnerBtnResetDateRange');
    if (pReset) pReset.onclick = () => {
      this.partnerDateFrom = null; this.partnerDateTo = null;
      const df = document.getElementById('partnerDateFrom'); const dt = document.getElementById('partnerDateTo');
      if (df) df.value = ''; if (dt) dt.value = '';
      const label = document.getElementById('partnerDisplayPeriodLabel');
      if (label) label.textContent = '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderPartnerShipments_();
    };

    nav('exportSelectedPartnerCsvBtn', () => this.exportSelectedPartnerShipmentsCsv_());
    nav('exportInventoryCsvBtn', () => this.exportInventoryCsv_());
    nav('settingsBtn', () => { this.syncSettingsModal_(); this.openModal_('settingsModal'); });
    nav('updateProductNameBtn', () => this.updateProductName_());
    nav('deleteProductBtn', () => this.deleteCurrentProduct_());

    const th = document.getElementById('inactivityThresholdSelect');
    if (th) {
      th.value = this.inactivityThresholdKey || '3m';
      th.onchange = () => {
        const key = String(th.value || '3m').trim();
        if (!this.isValidInactivityKey_(key)) return;
        this.saveInactivityThreshold_(key);
        this.calcPartnerInactivity_();
        this.renderPartnerList_();
        if (this.activeView === 'analysis') this.renderAnalysisRanking_();
        if (this.activeView === 'map') this.renderMapView_();
      };
    }

    const addStaffBtn = document.getElementById('addStaffBtn');
    if (addStaffBtn) addStaffBtn.onclick = () => {
      const input = document.getElementById('newStaffName');
      const name = (input?.value || '').trim();
      if (!name) { alert('\u62c5\u5f53\u8005\u540d\u304c\u7a7a\u3067\u3059'); return; }
      if (!this.staffList) this.staffList = [];
      if (this.staffList.includes(name)) { alert('\u540c\u3058\u62c5\u5f53\u8005\u540d\u304c\u65e2\u306b\u3042\u308a\u307e\u3059'); return; }
      this.staffList.push(name);
      this.staffList.sort((a,b) => String(a).localeCompare(String(b),'ja'));
      this.saveStaffList_();
      if (input) input.value = '';
      this.renderStaffManager_();
      this.renderStaffSelect_();
      this.showNotification('\u62c5\u5f53\u8005\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f');
    };

    nav('mapClearPrefBtn', () => this.clearMapSelection_());
    nav('mapResetZoomBtn', () => this.resetMapZoom_());
    nav('mapScopeDomesticBtn', () => this.setMapScope_('domestic'));
    nav('mapScopeWorldBtn', () => this.setMapScope_('world'));

    const mApply = document.getElementById('mapBtnApplyDateRange');
    if (mApply) mApply.onclick = () => {
      this.mapDateFrom = document.getElementById('mapDateFrom')?.value || null;
      this.mapDateTo = document.getElementById('mapDateTo')?.value || null;
      const label = document.getElementById('mapDisplayPeriodLabel');
      if (label) label.textContent = (this.mapDateFrom || this.mapDateTo)
        ? `\u8868\u793a\u671f\u9593: ${this.mapDateFrom || '\u59cb'} \u301c ${this.mapDateTo || '\u7d42'}`
        : '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderMapShipments_();
    };
    const mReset = document.getElementById('mapBtnResetDateRange');
    if (mReset) mReset.onclick = () => {
      this.mapDateFrom = null; this.mapDateTo = null;
      const df = document.getElementById('mapDateFrom'); const dt = document.getElementById('mapDateTo');
      if (df) df.value = ''; if (dt) dt.value = '';
      const label = document.getElementById('mapDisplayPeriodLabel');
      if (label) label.textContent = '\u8868\u793a\u671f\u9593: \u5168\u671f\u9593';
      this.renderMapShipments_();
    };

    nav('mapExportSelectedPartnerCsvBtn', () => this.exportSelectedPartnerShipmentsCsv_());
    document.querySelectorAll('.cancel-modal').forEach(el => { el.onclick = () => this.closeAllModals_(); });
  }

  openModal_(id) { this.closeAllModals_(); document.getElementById(id)?.classList.add('show'); }
  closeAllModals_() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('show')); }

  showInventoryView_() {
    this.activeView = 'inventory';
    document.getElementById('inventoryView').style.display = this.selectedProductId ? 'block' : 'none';
    document.getElementById('partnersView').style.display = 'none';
    document.getElementById('analysisView').style.display = 'none';
    document.getElementById('mapView').style.display = 'none';
    document.getElementById('summaryPanel').style.display = this.selectedProductId ? 'block' : 'none';
    document.getElementById('navInventoryBtn').className = 'btn btn-dark';
    document.getElementById('navPartnersBtn').className = 'btn btn-light';
    document.getElementById('navAnalysisBtn').className = 'btn btn-light';
    document.getElementById('navMapBtn').className = 'btn btn-light';
  }

  showPartnersView_() {
    this.activeView = 'partners';
    document.getElementById('inventoryView').style.display = 'none';
    document.getElementById('partnersView').style.display = 'block';
    document.getElementById('analysisView').style.display = 'none';
    document.getElementById('mapView').style.display = 'none';
    document.getElementById('summaryPanel').style.display = 'none';
    document.getElementById('navInventoryBtn').className = 'btn btn-light';
    document.getElementById('navPartnersBtn').className = 'btn btn-dark';
    document.getElementById('navAnalysisBtn').className = 'btn btn-light';
    document.getElementById('navMapBtn').className = 'btn btn-light';
    this.calcPartnerInactivity_();
    this.renderPartnerList_();
    this.renderPartnerShipments_();
  }

  showAnalysisView_() {
    this.activeView = 'analysis';
    document.getElementById('inventoryView').style.display = 'none';
    document.getElementById('partnersView').style.display = 'none';
    document.getElementById('analysisView').style.display = 'block';
    document.getElementById('mapView').style.display = 'none';
    document.getElementById('summaryPanel').style.display = 'none';
    document.getElementById('navInventoryBtn').className = 'btn btn-light';
    document.getElementById('navPartnersBtn').className = 'btn btn-light';
    document.getElementById('navAnalysisBtn').className = 'btn btn-dark';
    document.getElementById('navMapBtn').className = 'btn btn-light';
    this.syncAnalysisYearSelect_();
    this.calcPartnerInactivity_();
    this.renderAnalysisRanking_();
  }

  showMapView_() {
    this.activeView = 'map';
    document.getElementById('inventoryView').style.display = 'none';
    document.getElementById('partnersView').style.display = 'none';
    document.getElementById('analysisView').style.display = 'none';
    document.getElementById('mapView').style.display = 'block';
    document.getElementById('summaryPanel').style.display = 'none';
    document.getElementById('navInventoryBtn').className = 'btn btn-light';
    document.getElementById('navPartnersBtn').className = 'btn btn-light';
    document.getElementById('navAnalysisBtn').className = 'btn btn-light';
    document.getElementById('navMapBtn').className = 'btn btn-dark';
    this.renderMapView_();
  }

  setMapScope_(scope) {
    const next = (scope === 'world') ? 'world' : 'domestic';
    if (this.mapScope === next) return;
    this.mapScope = next;
    this.selectedPartnerForView = null;
    this.mapSelectedPrefecture = '';
    this.mapSelectedCountry = '';
    const btn = document.getElementById('mapExportSelectedPartnerCsvBtn');
    if (btn) btn.disabled = true;
    this.renderMapView_();
  }

  clearMapSelection_() {
    this.selectedPartnerForView = null;
    this.mapSelectedPrefecture = '';
    this.mapSelectedCountry = '';
    const btn = document.getElementById('mapExportSelectedPartnerCsvBtn');
    if (btn) btn.disabled = true;
    this.renderMapView_();
  }

  readLocalProducts_() {
    const s1 = localStorage.getItem(this.STORAGE_KEY_MAIN);
    if (s1) { try { return JSON.parse(s1) || {}; } catch(e) {} }
    const s2 = localStorage.getItem(this.STORAGE_KEY_FALLBACK);
    if (s2) { try { return JSON.parse(s2) || {}; } catch(e) {} }
    return {};
  }

  writeLocalProducts_(obj) {
    const json = JSON.stringify(obj || {});
    localStorage.setItem(this.STORAGE_KEY_MAIN, json);
    localStorage.setItem(this.STORAGE_KEY_FALLBACK, json);
  }

  // GAS fetchData() → GET /api/products
  loadData() {
    fetch('/api/products')
      .then(r => r.json())
      .then((serverData) => {
        serverData = (serverData && typeof serverData === 'object' && !Array.isArray(serverData)) ? serverData : {};
        const localData = this.readLocalProducts_();

        if (Object.keys(serverData).length > 0) {
          this.products = serverData;
          this.writeLocalProducts_(this.products);
        } else if (localData && Object.keys(localData).length > 0) {
          this.products = localData;
        } else {
          this.products = {};
        }

        this.renderProductSelect();
        const sel = document.getElementById('productSelect');
        const current = sel ? sel.value : '';

        if (current && this.products[current]) {
          this.selectProduct(current);
        } else {
          const last = localStorage.getItem(this.LAST_PRODUCT_KEY);
          if (last && this.products[last]) {
            if (sel) sel.value = last;
            this.selectProduct(last);
          } else {
            this.selectProduct('');
          }
        }

        this.calcPartnerInactivity_();
        this.showInventoryView_();
        this.syncAnalysisYearSelect_();
        if (this.activeView === 'partners') this.renderPartnerList_();
        if (this.activeView === 'analysis') this.renderAnalysisRanking_();
        if (this.activeView === 'map') this.renderMapView_();
      })
      .catch((err) => {
        alert('\u30c7\u30fc\u30bf\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
      });
  }

  // GAS saveProductFromUi() → POST /api/products
  saveData() {
    this.writeLocalProducts_(this.products);
    const selectedProduct = this.selectedProductId ? this.products[this.selectedProductId] : null;
    if (!selectedProduct) return;

    if (this.isSaving) {
      this.saveQueued = true;
      this.setSaveStatus_('wait', '\u4fdd\u5b58\u5f85\u3061');
      return;
    }

    const finalize = () => {
      this.isSaving = false;
      this.setUiDisabledWhileSaving_(false);
      if (this.saveQueued) { this.saveQueued = false; this.saveData(); }
    };

    this.isSaving = true;
    this.saveQueued = false;
    this.setUiDisabledWhileSaving_(true);
    this.setSaveStatus_('wait', '\u4fdd\u5b58\u4e2d');

    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedProduct)
    })
      .then(r => r.json())
      .then((res) => {
        const ok = res && res.status === 'success';
        if (ok) {
          this.lastSaveOkAt = new Date();
          this.setSaveStatus_('ok', '\u4fdd\u5b58\u5b8c\u4e86');
          setTimeout(() => this.setSaveStatus_('', ''), 1200);
        } else {
          this.setSaveStatus_('ng', res?.message || '\u4fdd\u5b58\u5931\u6557');
        }
        finalize();
      })
      .catch((err) => {
        this.setSaveStatus_('ng', '\u4fdd\u5b58\u5931\u6557: ' + err.message);
        finalize();
      });
  }

  addProduct() {
    const n = (document.getElementById('newProductName')?.value || '').trim();
    if (!n) return;
    const id = 'p_' + Date.now();
    this.products[id] = { id, name: n, rows: [] };
    this.selectedProductId = id;
    localStorage.setItem(this.LAST_PRODUCT_KEY, id);
    this.saveData();
    this.renderProductSelect();
    const sel = document.getElementById('productSelect');
    if (sel) sel.value = id;
    this.showInventoryView_();
    this.selectProduct(id);
    this.closeAllModals_();
  }

  selectProduct(id) {
    this.selectedProductId = id || null;
    if (this.selectedProductId) localStorage.setItem(this.LAST_PRODUCT_KEY, this.selectedProductId);
    document.getElementById('partnersView').style.display = 'none';
    document.getElementById('analysisView').style.display = 'none';
    document.getElementById('mapView').style.display = 'none';
    document.getElementById('inventoryView').style.display = id ? 'block' : 'none';
    document.getElementById('summaryPanel').style.display = id ? 'block' : 'none';
    this.activeView = 'inventory';
    document.getElementById('navInventoryBtn').className = 'btn btn-dark';
    document.getElementById('navPartnersBtn').className = 'btn btn-light';
    document.getElementById('navAnalysisBtn').className = 'btn btn-light';
    document.getElementById('navMapBtn').className = 'btn btn-light';
    if (!id) return;
    this.renderTable();
    this.updateSummary();
    this.updatePrintHeader_();
  }

  updatePrintHeader_() {
    const t = document.getElementById('printProductTitle');
    if (t) t.textContent = `\u8ab2\u7a0e\u79fb\u51fa\u7c3f\uff08${this.products[this.selectedProductId]?.name || ''}\uff09`;
    const pd = document.getElementById('printDateString');
    if (pd) {
      const s = (this.dateFrom || this.dateTo) ? `${this.dateFrom || '\u59cb'} \u301c ${this.dateTo || '\u7d42'}` : '\u5168\u671f\u9593';
      pd.textContent = `\u8868\u793a\u671f\u9593: ${s}`;
    }
  }

  renderProductSelect() {
    const sel = document.getElementById('productSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044</option>';
    const arr = Object.values(this.products || {})
      .filter(p => p && p.id)
      .sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'ja'));
    arr.forEach(p => {
      sel.insertAdjacentHTML('beforeend', `<option value="${p.id}">${this.escapeHtml_(p.name || p.id)}</option>`);
    });
    if (this.products[cur]) sel.value = cur;
  }

  showRowModal(idx = null) {
    const today = new Date().toISOString().split('T')[0];
    const inputDate = document.getElementById('inputDate');
    if (inputDate) inputDate.value = today;
    ['Tsumeguchi','Ship1F','Ship2F','Gift','Sample','Damage','Analysis','Cork'].forEach(id => {
      const el = document.getElementById('input' + id); if (el) el.value = '';
    });
    const remarks = document.getElementById('inputRemarks');
    if (remarks) remarks.value = '';
    const partnerSel = document.getElementById('remarksPartnerSelect');
    if (partnerSel) partnerSel.value = '';
    this.loadStaffList_();
    this.renderStaffSelect_();
    const staffSel = document.getElementById('inputStaff');
    if (staffSel) staffSel.value = '';

    if (idx !== null && this.selectedProductId && this.products[this.selectedProductId]) {
      const r = this.products[this.selectedProductId].rows[idx];
      if (inputDate) inputDate.value = r.date || today;
      ['tsumeguchi','ship1F','ship2F','gift','sample','damage','analysis','cork'].forEach(k => {
        const id2 = 'input' + k.charAt(0).toUpperCase() + k.slice(1);
        const el = document.getElementById(id2);
        if (el) el.value = (r[k] ?? '') === 0 ? 0 : (r[k] ?? '');
      });
      if (remarks) remarks.value = r.remarks || '';
      if (partnerSel) {
        if (r.partnerNo) partnerSel.value = String(r.partnerNo);
        else this.syncPartnerSelectWithRemarks_(r.remarks || '');
      }
      if (staffSel) staffSel.value = r.staff || '';
      this.editingRowIndex = idx;
    } else {
      this.editingRowIndex = null;
    }

    if (partnerSel) {
      partnerSel.onchange = () => {
        const rem = document.getElementById('inputRemarks');
        if (!rem) return;
        const no = Number(partnerSel.value || 0);
        if (!no) { rem.value = ''; return; }
        const p = this.partners.find(x => x.no === no);
        rem.value = p ? p.name : '';
      };
    }
    this.openModal_('rowModal');
  }

  saveRow() {
    if (!this.selectedProductId || !this.products[this.selectedProductId]) return;
    const staff = (document.getElementById('inputStaff')?.value || '').trim();
    if (!staff) { alert('\u62c5\u5f53\u8005\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'); return; }
    const p = this.products[this.selectedProductId];
    const v = (id) => {
      const el = document.getElementById('input' + id);
      if (!el) return 0;
      const val = el.value;
      return val === '' ? 0 : parseFloat(val);
    };
    const partnerNo = Number(document.getElementById('remarksPartnerSelect')?.value || 0) || 0;
    const data = {
      date: document.getElementById('inputDate')?.value || new Date().toISOString().split('T')[0],
      tsumeguchi: v('Tsumeguchi'), ship1F: v('Ship1F'), ship2F: v('Ship2F'),
      gift: v('Gift'), sample: v('Sample'), damage: v('Damage'), analysis: v('Analysis'), cork: v('Cork'),
      partnerNo, remarks: document.getElementById('inputRemarks')?.value || '', staff
    };
    if (this.editingRowIndex !== null) p.rows[this.editingRowIndex] = data;
    else p.rows.push(data);
    p.rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''), 'ja'));
    this.saveData();
    this.calcPartnerInactivity_();
    this.renderTable();
    this.updateSummary();
    this.closeAllModals_();
    if (this.activeView === 'partners') { this.renderPartnerList_(); this.renderPartnerShipments_(); }
    if (this.activeView === 'analysis') this.renderAnalysisRanking_();
    if (this.activeView === 'map') this.renderMapView_();
  }

  deleteRow(i) {
    if (!this.selectedProductId || !this.products[this.selectedProductId]) return;
    if (!confirm('\u6d88\u3057\u307e\u3059\u304b\uff1f')) return;
    this.products[this.selectedProductId].rows.splice(i, 1);
    this.saveData();
    this.calcPartnerInactivity_();
    this.renderTable();
    this.updateSummary();
    if (this.activeView === 'partners') { this.renderPartnerList_(); this.renderPartnerShipments_(); }
    if (this.activeView === 'analysis') this.renderAnalysisRanking_();
    if (this.activeView === 'map') this.renderMapView_();
  }

  renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!this.selectedProductId || !this.products[this.selectedProductId]) return;
    let stock = 0;
    this.products[this.selectedProductId].rows.forEach((r, i) => {
      const isIn = (!this.dateFrom || r.date >= this.dateFrom) && (!this.dateTo || r.date <= this.dateTo);
      if ((this.dateFrom || this.dateTo) && !isIn) return;
      const inQty = Number(r.tsumeguchi || 0);
      const wh = Number(r.ship1F || 0), rt = Number(r.ship2F || 0);
      const gift = Number(r.gift || 0), sample = Number(r.sample || 0);
      const damage = Number(r.damage || 0), analysis = Number(r.analysis || 0), cork = Number(r.cork || 0);
      const outTotal = wh + rt + gift + sample + damage + analysis;
      stock = stock + inQty - outTotal;
      const shipTotal = wh + rt + gift + sample;
      const dateStr = (r.date || '').replace(/-/g,'/');
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${dateStr}</td><td>${inQty}</td><td><b>${stock}</b></td>
          <td>${wh}</td><td>${rt}</td><td>${gift}</td><td>${sample}</td><td><b>${shipTotal}</b></td>
          <td>${damage}</td><td>${analysis}</td><td>${cork}</td>
          <td class="col-remarks" style="text-align:left">${this.escapeHtml_(r.remarks || '')}</td>
          <td class="col-staff" style="text-align:left">${this.escapeHtml_(r.staff || '')}</td>
          <td class="no-print">
            <span class="op-icon" onclick="app.showRowModal(${i})">✏️</span>
            <span class="op-icon" onclick="app.deleteRow(${i})">🗑️</span>
          </td>
        </tr>
      `);
    });
  }

  updateSummary() {
    if (!this.selectedProductId || !this.products[this.selectedProductId]) return;
    const p = this.products[this.selectedProductId];
    let stock = 0, wh=0, rt=0, g=0, sa=0, d=0, an=0, c=0;
    p.rows.forEach(r => {
      const inQty = Number(r.tsumeguchi || 0);
      const outShip = Number(r.ship1F||0)+Number(r.ship2F||0)+Number(r.gift||0)+Number(r.sample||0);
      const outOther = Number(r.damage||0)+Number(r.analysis||0);
      if (!this.dateTo || r.date <= this.dateTo) stock = stock + inQty - outShip - outOther;
      const isIn = (!this.dateFrom || r.date >= this.dateFrom) && (!this.dateTo || r.date <= this.dateTo);
      if (isIn) {
        wh+=Number(r.ship1F||0); rt+=Number(r.ship2F||0); g+=Number(r.gift||0); sa+=Number(r.sample||0);
        d+=Number(r.damage||0); an+=Number(r.analysis||0); c+=Number(r.cork||0);
      }
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    set('summarySalesStock', stock); set('summaryWh', wh); set('summaryRt', rt);
    set('summaryGift', g); set('summarySample', sa); set('summaryShipTotal', wh+rt+g+sa);
    set('summaryDamage', d); set('summaryAnalysis', an); set('summaryCork', c); set('summaryOtherTotal', d+an+c);
  }

  // GAS getPartners() → GET /api/partners
  loadPartners_(cb) {
    if (this._partnersLoading) return;
    this._partnersLoading = true;

    fetch('/api/partners')
      .then(r => r.json())
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        if (this._partnersLoadedOnce && arr.length === 0) {
          this._partnersLoading = false;
          this.showNotification('\u53d6\u5f15\u5148\u306e\u53d6\u5f97\u304c\u7a7a\u3067\u3057\u305f\uff08\u524d\u56de\u30c7\u30fc\u30bf\u3092\u4fdd\u6301\uff09');
          if (typeof cb === 'function') cb();
          return;
        }
        this.partners = arr.map(p => ({
          ...p,
          partnerType: this.normalizePartnerType_(p.partnerType),
          exportCountry: String(p.exportCountry || ''),
          mapConditionReleased: !!p.mapConditionReleased
        }));
        this._partnersLoadedOnce = true;
        this._partnersLoading = false;
        this.renderPartnerSelect();
        this.initCountryPrefectureUI_();
        this.calcPartnerInactivity_();
        this.renderPartnerList_();
        if (this.activeView === 'partners') this.renderPartnerShipments_();
        this.syncAnalysisYearSelect_();
        if (this.activeView === 'analysis') this.renderAnalysisRanking_();
        if (this.activeView === 'map') this.renderMapView_();
        if (typeof cb === 'function') cb();
      })
      .catch((err) => {
        this._partnersLoading = false;
        alert('\u53d6\u5f15\u5148\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
        if (typeof cb === 'function') cb();
      });
  }

  loadPartners() { this.loadPartners_(null); }

  renderPartnerSelect() {
    const sel = document.getElementById('remarksPartnerSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">\u53d6\u5f15\u5148\u3092\u9078\u629e</option>';
    (this.partners || []).slice().sort((a,b)=>(a.name||'').localeCompare((b.name||''),'ja')).forEach(p => {
      const label = this.isExportPartner_(p)
        ? `${p.name}\uff08\u8f38\u51fa${p.exportCountry ? ' / ' + p.exportCountry : ''}\uff09`
        : `${p.name}`;
      sel.insertAdjacentHTML('beforeend', `<option value="${p.no}">${this.escapeHtml_(label)}</option>`);
    });
    if (cur) sel.value = cur;
  }

  renderPartnerList_() {
    const wrap = document.getElementById('partnerList');
    if (!wrap) return;
    const q = (document.getElementById('partnerSearchInput')?.value || '').trim().toLowerCase();
    const countryQ = (document.getElementById('partnerCountrySearchInput')?.value || '').trim().toLowerCase();
    const prefQ = (document.getElementById('partnerPrefectureSearchInput')?.value || '').trim().toLowerCase();
    let arr = [...(this.partners || [])].filter(p => {
      const searchCountry = this.isExportPartner_(p) ? (p.exportCountry || p.country || '') : (p.country || '');
      const searchPref = this.getEffectiveDomesticPrefecture_(p) || p.prefecture || '';
      const text = [p.name, p.person, p.address, p.phone, p.country, p.prefecture, p.exportCountry,
        p.partnerType === 'export' ? '\u8f38\u51fa' : '\u56fd\u5185'].filter(Boolean).join(' ').toLowerCase();
      if (q && !text.includes(q)) return false;
      if (countryQ && !String(searchCountry||'').toLowerCase().includes(countryQ)) return false;
      if (prefQ && !String(searchPref||'').toLowerCase().includes(prefQ)) return false;
      return true;
    }).sort((a,b)=>(a.name||'').localeCompare((b.name||''),'ja'));
    wrap.innerHTML = '';
    arr.forEach(p => {
      const active = this.selectedPartnerForView && this.selectedPartnerForView.no === p.no;
      const locLine = this.buildPartnerLocationLine_(p);
      const alertObj = this.partnerInactivityMap && this.partnerInactivityMap[p.no];
      const lost = !!p.lost;
      const badgeHtml = lost
        ? '<span class="inactive-badge">\u5931\u6ce8</span>'
        : alertObj
          ? `<span class="inactive-badge">\u8981\u30d5\u30a9\u30ed\u30fc\uff08${alertObj.lastDate ? alertObj.lastDate.replace(/-/g,'/') : '\u672a\u6ce8\u6587'}\uff09</span>`
          : '';
      wrap.insertAdjacentHTML('beforeend', `
        <div class="partner-card ${active ? 'active' : ''}" data-no="${p.no}">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div style="min-width:0;">
              <div class="partner-name">${this.escapeHtml_(p.name)}${this.partnerTypeBadgeHtml_(p)}${badgeHtml}</div>
              <div class="partner-meta">${this.escapeHtml_(locLine||'')}</div>
              <div class="partner-meta">No: ${p.no}</div>
            </div>
            <button class="partner-more-btn" data-edit-no="${p.no}" aria-label="\u53d6\u5f15\u5148\u7de8\u96c6">\u30fb\u30fb\u30fb</button>
          </div>
        </div>
      `);
    });
    wrap.querySelectorAll('.partner-card').forEach(el => {
      el.onclick = () => {
        const no = Number(el.getAttribute('data-no'));
        const hit = (this.partners||[]).find(x => x.no === no);
        if (!hit) return;
        this.selectedPartnerForView = hit;
        const title = document.getElementById('partnerPanelTitle');
        if (title) title.textContent = `\u3010${hit.name}\u3011\u306e\u51fa\u8377\u5c65\u6b74`;
        const btn = document.getElementById('exportSelectedPartnerCsvBtn');
        if (btn) btn.disabled = false;
        this.renderPartnerList_();
        this.renderPartnerShipments_();
      };
    });
    wrap.querySelectorAll('.partner-more-btn').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const no = Number(btn.getAttribute('data-edit-no'));
        const hit = (this.partners||[]).find(x => x.no === no);
        if (!hit) return;
        this.openPartnerModal(hit);
      };
    });
  }

  renderPartnerShipments_() {
    this.renderShipmentsInto_(this.selectedPartnerForView, 'partnerShipmentsBody', this.partnerDateFrom, this.partnerDateTo);
  }

  renderShipmentsInto_(partner, tbodyId, dateFrom, dateTo) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!partner) return;
    const rows = [];
    Object.values(this.products||{}).forEach(prod => {
      (prod.rows||[]).forEach(r => {
        const d = String(r.date||'');
        if (!d || (dateFrom && d < dateFrom) || (dateTo && d > dateTo)) return;
        if (Number(r.partnerNo||0) !== Number(partner.no)) return;
        const order = (Number(r.ship1F)||0)+(Number(r.ship2F)||0);
        const sample = Number(r.sample)||0;
        const total = order + sample;
        if (total === 0) return;
        rows.push({ date: d, productName: prod.name||'', order, sample, total });
      });
    });
    rows.sort((a,b)=>(a.date||'').localeCompare((b.date||''),'ja'));
    rows.forEach(x => {
      const ds = (x.date||'').replace(/-/g,'/');
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${ds}</td><td>${this.escapeHtml_(x.productName)}</td>
          <td><b>${x.order}</b></td><td>${x.sample}</td><td><b>${x.total}</b></td>
        </tr>
      `);
    });
  }

  // GAS exportSelectedPartnerShipmentsCsv() → POST /api/export/partner-shipments
  exportSelectedPartnerShipmentsCsv_() {
    if (!this.selectedPartnerForView) return;
    const payload = {
      partnerNo: this.selectedPartnerForView.no,
      dateFrom: (this.activeView === 'map') ? (this.mapDateFrom||null) : (this.partnerDateFrom||null),
      dateTo: (this.activeView === 'map') ? (this.mapDateTo||null) : (this.partnerDateTo||null)
    };
    fetch('/api/export/partner-shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then((res) => {
        if (!res || !res.ok) { alert(res?.message || '\u51fa\u529b\u306b\u5931\u6557\u3057\u307e\u3057\u305f'); return; }
        this.downloadBase64Csv_(res.filename, res.base64);
        this.showNotification('CSV\u3092\u51fa\u529b\u3057\u307e\u3057\u305f');
      });
  }

  // GAS exportInventoryCsv() → POST /api/export/inventory
  exportInventoryCsv_() {
    if (!this.selectedProductId) { alert('\u5546\u54c1\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'); return; }
    const payload = { productId: this.selectedProductId, dateFrom: this.dateFrom||null, dateTo: this.dateTo||null };
    fetch('/api/export/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then((res) => {
        if (!res || !res.ok) { alert(res?.message || 'CSV\u51fa\u529b\u306b\u5931\u6557\u3057\u307e\u3057\u305f'); return; }
        this.downloadBase64Csv_(res.filename, res.base64);
        this.showNotification('\u5728\u5eabCSV\u3092\u51fa\u529b\u3057\u307e\u3057\u305f');
      })
      .catch((err) => { alert('CSV\u51fa\u529b\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message); });
  }

  downloadBase64Csv_(filename, base64) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  getSelectedPartnerType_() {
    return document.getElementById('partnerTypeExport')?.checked ? 'export' : 'domestic';
  }

  onPartnerTypeChange_() {
    const type = this.getSelectedPartnerType_();
    const exportWrap = document.getElementById('exportSettingsWrap');
    const exportCountry = document.getElementById('partnerExportCountry');
    const releasedEl = document.getElementById('partnerMapConditionReleased');
    const prefWrap = document.getElementById('prefectureWrap');
    const prefSel = document.getElementById('partnerPrefecture');
    const countrySel = document.getElementById('partnerCountry');
    const isExport = type === 'export';
    if (exportWrap) exportWrap.style.display = isExport ? 'block' : 'none';
    if (exportCountry) exportCountry.disabled = !isExport;
    if (releasedEl) releasedEl.disabled = !isExport;
    if (!isExport) {
      if (exportCountry) exportCountry.value = '';
      if (releasedEl) releasedEl.checked = false;
    }
    const country = this.normalizeCountry_(countrySel?.value || '');
    const jp = (this.isJapanCountry_(country) || country === '');
    if (prefWrap) prefWrap.style.display = jp ? 'block' : 'none';
    if (prefSel) prefSel.disabled = !jp;
  }

  openPartnerModal(partner) {
    if (!document.getElementById('partnerCountry')?.children?.length) this.initCountryPrefectureUI_();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    this.editingPartnerNo = partner ? Number(partner.no) : null;
    set('partnerName', partner?.name || '');
    set('partnerAddress', partner?.address || '');
    set('partnerPhone', partner?.phone || '');
    set('partnerPerson', partner?.person || '');
    set('partnerRemarks', partner?.remarks || '');
    set('partnerClaims', partner?.claims || '');
    const lostEl = document.getElementById('partnerLost');
    if (lostEl) lostEl.checked = !!partner?.lost;
    const countrySel = document.getElementById('partnerCountry');
    if (countrySel) countrySel.value = this.normalizeCountry_(partner?.country) || 'Japan';
    const partnerType = this.normalizePartnerType_(partner?.partnerType || 'domestic');
    const domesticEl = document.getElementById('partnerTypeDomestic');
    const exportEl = document.getElementById('partnerTypeExport');
    if (domesticEl) domesticEl.checked = partnerType === 'domestic';
    if (exportEl) exportEl.checked = partnerType === 'export';
    const exportCountrySel = document.getElementById('partnerExportCountry');
    if (exportCountrySel) exportCountrySel.value = this.normalizeCountry_(partner?.exportCountry) || '';
    const releasedEl = document.getElementById('partnerMapConditionReleased');
    if (releasedEl) releasedEl.checked = !!partner?.mapConditionReleased;
    this.onPartnerCountryChange_();
    this.onPartnerTypeChange_();
    const prefSel = document.getElementById('partnerPrefecture');
    if (prefSel) prefSel.value = partner?.prefecture || '';
    const title = document.getElementById('partnerModalTitle');
    if (title) title.textContent = partner ? '\u53d6\u5f15\u5148\u3092\u7de8\u96c6' : '\u53d6\u5f15\u5148\u767b\u9332';
    const btn = document.getElementById('partnerSaveBtn');
    if (btn) btn.textContent = partner ? '\u66f4\u65b0' : '\u767b\u9332';
    const noLabel = document.getElementById('partnerNoLabel');
    if (noLabel) noLabel.textContent = partner ? String(partner.no) : '\u81ea\u52d5\u63a1\u756a';
    this.openModal_('partnerModal');
  }

  // GAS addPartner/updatePartner → POST/PUT /api/partners
  savePartner() {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const name = v('partnerName');
    if (!name) { alert('\u540d\u79f0\u304c\u7a7a\u3067\u3059'); return; }
    const lost = !!document.getElementById('partnerLost')?.checked;
    const country = this.normalizeCountry_(document.getElementById('partnerCountry')?.value || '');
    let prefecture = v('partnerPrefecture');
    const partnerType = this.getSelectedPartnerType_();
    const exportCountry = this.normalizeCountry_(document.getElementById('partnerExportCountry')?.value || '');
    const mapConditionReleased = !!document.getElementById('partnerMapConditionReleased')?.checked;
    if (partnerType === 'export' && !exportCountry) {
      alert('\u8f38\u51fa\u5148\u56fd\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'); return;
    }
    if (!(this.isJapanCountry_(country) || country === '')) prefecture = '';
    const payload = {
      name, address: v('partnerAddress'), phone: v('partnerPhone'), person: v('partnerPerson'),
      country: country || 'Japan', prefecture, remarks: v('partnerRemarks'), claims: v('partnerClaims'),
      lost, partnerType,
      exportCountry: partnerType === 'export' ? exportCountry : '',
      mapConditionReleased: partnerType === 'export' ? mapConditionReleased : false
    };

    if (this.editingPartnerNo) {
      payload.no = this.editingPartnerNo;
      fetch('/api/partners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then((res) => {
          if (!res || !res.ok) { alert(res?.message || '\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f'); return; }
          this.showNotification('\u53d6\u5f15\u5148\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f');
          this.loadPartners_(null);
          this.closeAllModals_();
        });
      return;
    }

    fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then((res) => {
        if (!res || !res.ok) { alert(res?.message || '\u767b\u9332\u306b\u5931\u6557\u3057\u307e\u3057\u305f'); return; }
        this.showNotification('\u53d6\u5f15\u5148\u3092\u767b\u9332\u3057\u307e\u3057\u305f');
        this.loadPartners_(null);
        this.closeAllModals_();
      });
  }

  syncPartnerSelectWithRemarks_(remarksText) {
    const rs = document.getElementById('remarksPartnerSelect');
    if (!rs) return;
    const hit = (this.partners||[]).find(x => x.name === String(remarksText||''));
    rs.value = hit ? String(hit.no) : '';
  }

  initCountryPrefectureUI_() {
    const countries = this.getAllCountries_();
    const prefs = this.getJapanPrefectures_();
    const fill = (id, opts) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value;
      el.innerHTML = '<option value="">\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044</option>' +
        opts.map(c => `<option value="${this.escapeHtml_(c)}">${this.escapeHtml_(c)}</option>`).join('');
      el.value = cur || '';
    };
    const countrySel = document.getElementById('partnerCountry');
    if (countrySel) {
      const cur = countrySel.value;
      countrySel.innerHTML = '<option value="">\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044</option>' +
        countries.map(c => `<option value="${this.escapeHtml_(c)}">${this.escapeHtml_(c)}</option>`).join('');
      countrySel.value = cur || 'Japan';
    }
    fill('partnerExportCountry', countries.filter(c => !this.isJapanCountry_(c)));
    fill('partnerPrefecture', prefs);
    const countryDl = document.getElementById('partnerCountryList');
    if (countryDl) countryDl.innerHTML = countries.map(v => `<option value="${this.escapeHtml_(v)}"></option>`).join('');
    const prefDl = document.getElementById('partnerPrefectureList');
    if (prefDl) prefDl.innerHTML = prefs.map(v => `<option value="${this.escapeHtml_(v)}"></option>`).join('');
    this.onPartnerCountryChange_();
    this.onPartnerTypeChange_();
  }

  onPartnerCountryChange_() {
    const country = this.normalizeCountry_(document.getElementById('partnerCountry')?.value || '');
    const wrap = document.getElementById('prefectureWrap');
    const prefSel = document.getElementById('partnerPrefecture');
    const jp = (this.isJapanCountry_(country) || country === '');
    if (wrap) wrap.style.display = jp ? 'block' : 'none';
    if (prefSel) { if (!jp) { prefSel.value = ''; prefSel.disabled = true; } else { prefSel.disabled = false; } }
  }

  syncSettingsModal_() {
    const input = document.getElementById('editProductName');
    if (!input) return;
    input.value = (this.selectedProductId && this.products[this.selectedProductId])
      ? this.products[this.selectedProductId].name || '' : '';
    this.loadStaffList_();
    this.renderStaffManager_();
    const ns = document.getElementById('newStaffName');
    if (ns) ns.value = '';
  }

  updateProductName_() {
    if (!this.selectedProductId || !this.products[this.selectedProductId]) return;
    const input = document.getElementById('editProductName');
    const newName = (input?.value || '').trim();
    if (!newName) return;
    this.products[this.selectedProductId].name = newName;
    this.saveData();
    this.renderProductSelect();
    this.updatePrintHeader_();
    this.showNotification('\u5546\u54c1\u540d\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f');
  }

  // GAS deleteProductFromUi() → DELETE /api/products?productId=xxx
  deleteCurrentProduct_() {
    if (!this.selectedProductId) return;
    const pid = this.selectedProductId;
    const name = this.products[pid]?.name || pid;
    if (!confirm(`\u300c${name}\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f`)) return;
    this.setUiDisabledWhileSaving_(true);
    this.setSaveStatus_('wait', '\u524a\u9664\u4e2d');
    fetch(`/api/products?productId=${encodeURIComponent(pid)}`, { method: 'DELETE' })
      .then(r => r.json())
      .then((res) => {
        if (!res || !res.ok) {
          this.setSaveStatus_('ng', res?.message || '\u524a\u9664\u5931\u6557');
          this.setUiDisabledWhileSaving_(false);
          return;
        }
        delete this.products[pid];
        this.selectedProductId = null;
        this.writeLocalProducts_(this.products);
        localStorage.removeItem(this.LAST_PRODUCT_KEY);
        const sel = document.getElementById('productSelect');
        if (sel) sel.value = '';
        this.renderProductSelect();
        this.showInventoryView_();
        this.closeAllModals_();
        this.calcPartnerInactivity_();
        if (this.activeView === 'partners') this.renderPartnerList_();
        if (this.activeView === 'analysis') this.renderAnalysisRanking_();
        if (this.activeView === 'map') this.renderMapView_();
        this.setSaveStatus_('ok', '\u524a\u9664\u5b8c\u4e86');
        setTimeout(() => this.setSaveStatus_('', ''), 1200);
        this.setUiDisabledWhileSaving_(false);
        this.showNotification('\u5546\u54c1\u3092\u524a\u9664\u3057\u307e\u3057\u305f');
      })
      .catch((err) => {
        this.setSaveStatus_('ng', '\u524a\u9664\u5931\u6557: ' + err.message);
        this.setUiDisabledWhileSaving_(false);
      });
  }

  showNotification(m) {
    const n = document.getElementById('notification');
    if (!n) return;
    n.textContent = m;
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 3000);
  }

  escapeHtml_(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  loadStaffList_() {
    let arr = [];
    try { const s = localStorage.getItem(this.STAFF_KEY); if (s) arr = JSON.parse(s)||[]; } catch(e) { arr=[]; }
    this.staffList = (Array.isArray(arr) ? arr : []).map(x => String(x||'').trim()).filter(Boolean);
  }

  saveStaffList_() { localStorage.setItem(this.STAFF_KEY, JSON.stringify(this.staffList||[])); }

  renderStaffSelect_() {
    const sel = document.getElementById('inputStaff');
    if (!sel) return;
    const cur = sel.value || '';
    sel.innerHTML = '<option value="">\u62c5\u5f53\u8005\u3092\u9078\u629e</option>';
    (this.staffList||[]).forEach(name => {
      sel.insertAdjacentHTML('beforeend', `<option value="${this.escapeHtml_(name)}">${this.escapeHtml_(name)}</option>`);
    });
    if (cur && (this.staffList||[]).includes(cur)) sel.value = cur;
    else if (!cur && (this.staffList||[]).length === 1) sel.value = this.staffList[0];
  }

  renderStaffManager_() {
    const wrap = document.getElementById('staffListWrap');
    if (!wrap) return;
    const list = this.staffList||[];
    if (list.length === 0) {
      wrap.innerHTML = '<div style="color:#94a3b8;font-size:0.78rem;">\u62c5\u5f53\u8005\u304c\u672a\u767b\u9332\u3067\u3059</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach((name, i) => {
      wrap.insertAdjacentHTML('beforeend', `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 4px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:900;color:#0f172a;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml_(name)}</div>
          <button class="btn btn-light" data-staff-del="${i}" style="padding:4px 10px;font-size:0.75rem;">\u524a\u9664</button>
        </div>
      `);
    });
    wrap.querySelectorAll('button[data-staff-del]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-staff-del'));
        if (Number.isNaN(idx)) return;
        const name = this.staffList[idx];
        if (!confirm(`\u62c5\u5f53\u8005\u300c${name}\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f`)) return;
        this.staffList.splice(idx, 1);
        this.saveStaffList_();
        this.renderStaffManager_();
        this.renderStaffSelect_();
        this.showNotification('\u62c5\u5f53\u8005\u3092\u524a\u9664\u3057\u307e\u3057\u305f');
      };
    });
  }

  getAvailableYears_() {
    const years = new Set();
    Object.values(this.products||{}).forEach(prod => {
      (prod.rows||[]).forEach(r => { const d = String(r.date||''); if (d && d.length >= 4) years.add(d.slice(0,4)); });
    });
    return Array.from(years).filter(Boolean).sort((a,b)=>String(b).localeCompare(String(a)));
  }

  syncAnalysisYearSelect_() {
    const sel = document.getElementById('analysisYearSelect');
    if (!sel) return;
    const years = this.getAvailableYears_();
    const cur = sel.value;
    sel.innerHTML = years.length ? '' : '<option value="">\u5e74\u3092\u9078\u629e</option>';
    years.forEach(y => sel.insertAdjacentHTML('beforeend', `<option value="${y}">${y}\u5e74</option>`));
    const nowY = String(new Date().getFullYear());
    if (years.includes(cur)) sel.value = cur;
    else if (years.includes(nowY)) sel.value = nowY;
    else if (years[0]) sel.value = years[0];
  }

  buildPartnerYearRanking_(year) {
    const map = {};
    const y = String(year||'').trim();
    if (!y) return [];
    Object.values(this.products||{}).forEach(prod => {
      (prod.rows||[]).forEach(r => {
        const d = String(r.date||'');
        if (!d || d.slice(0,4) !== y) return;
        const pno = Number(r.partnerNo||0);
        if (!pno) return;
        const order = (Number(r.ship1F)||0)+(Number(r.ship2F)||0);
        const sample = Number(r.sample)||0;
        const total = order + sample;
        if (total === 0) return;
        if (!map[pno]) map[pno] = { partnerNo:pno, order:0, sample:0, total:0, lastOrderDate:'' };
        map[pno].order += order; map[pno].sample += sample; map[pno].total += total;
        if (order > 0 && (!map[pno].lastOrderDate || d > map[pno].lastOrderDate)) map[pno].lastOrderDate = d;
      });
    });
    return Object.values(map).map(x => {
      const partner = (this.partners||[]).find(p => Number(p.no) === Number(x.partnerNo));
      return { partnerNo:x.partnerNo, name:partner?(partner.name||''):`No:${x.partnerNo}`,
        order:x.order, sample:x.sample, total:x.total, lastOrderDate:x.lastOrderDate||'', lost:!!partner?.lost };
    });
  }

  renderAnalysisRanking_() {
    const year = document.getElementById('analysisYearSelect')?.value||'';
    const tbody = document.getElementById('analysisBody');
    const title = document.getElementById('analysisTitle');
    if (tbody) tbody.innerHTML = '';
    if (!year) { if (title) title.textContent = '\u5e74\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'; return; }
    if (title) title.textContent = `${year}\u5e74 \u53d6\u5f15\u5148\u51fa\u8377\u91cf`;
    this.calcPartnerInactivity_();
    let rows = this.buildPartnerYearRanking_(year);
    if (!tbody) return;
    const status = document.getElementById('analysisFilterStatus')?.value||'all';
    const sortKey = document.getElementById('analysisSortKey')?.value||'total_desc';
    rows = rows.filter(x => {
      const inactive = !!this.partnerInactivityMap?.[x.partnerNo];
      if (status==='lost_only') return x.lost;
      if (status==='lost_exclude') return !x.lost;
      if (status==='inactive_only') return inactive;
      if (status==='inactive_exclude') return !inactive;
      if (status==='inactive_or_lost') return inactive||x.lost;
      return true;
    });
    const cmpName = (a,b)=>(a.name||'').localeCompare((b.name||''),'ja');
    rows.sort((a,b) => {
      if (sortKey==='total_desc') return (b.total-a.total)||(b.order-a.order)||cmpName(a,b);
      if (sortKey==='order_desc') return (b.order-a.order)||(b.total-a.total)||cmpName(a,b);
      if (sortKey==='sample_desc') return (b.sample-a.sample)||(b.total-a.total)||cmpName(a,b);
      const ad=a.lastOrderDate||'0000-00-00', bd=b.lastOrderDate||'0000-00-00';
      if (sortKey==='last_old') return (ad<bd?-1:ad>bd?1:0)||(b.total-a.total)||cmpName(a,b);
      if (sortKey==='last_new') return (ad>bd?-1:ad<bd?1:0)||(b.total-a.total)||cmpName(a,b);
      return (b.total-a.total)||cmpName(a,b);
    });
    if (rows.length===0) {
      tbody.insertAdjacentHTML('beforeend','<tr><td colspan="6" style="text-align:center;color:#64748b;">\u30c7\u30fc\u30bf\u304c\u3042\u308a\u307e\u305b\u3093</td></tr>');
      return;
    }
    rows.forEach((x,i) => {
      const last = x.lastOrderDate ? x.lastOrderDate.replace(/-/g,'/') : '-';
      const inactive = !!this.partnerInactivityMap?.[x.partnerNo];
      const badge = x.lost ? '<span class="inactive-badge">\u5931\u6ce8</span>'
        : inactive ? '<span class="inactive-badge">\u8981\u30d5\u30a9\u30ed\u30fc</span>' : '';
      tbody.insertAdjacentHTML('beforeend', `
        <tr data-pno="${x.partnerNo}">
          <td>${i+1}</td><td>${this.escapeHtml_(x.name)} ${badge}</td>
          <td><b>${x.order}</b></td><td>${x.sample}</td><td><b>${x.total}</b></td><td>${last}</td>
        </tr>
      `);
    });
    tbody.querySelectorAll('tr[data-pno]').forEach(tr => {
      tr.onclick = () => {
        const pno = Number(tr.getAttribute('data-pno'));
        const hit = (this.partners||[]).find(p => Number(p.no)===pno);
        if (!hit) return;
        this.selectedPartnerForView = hit;
        const title2 = document.getElementById('partnerPanelTitle');
        if (title2) title2.textContent = `\u3010${hit.name}\u3011\u306e\u51fa\u8377\u5c65\u6b74`;
        const btn = document.getElementById('exportSelectedPartnerCsvBtn');
        if (btn) btn.disabled = false;
        this.showPartnersView_();
      };
      tr.style.cursor = 'pointer';
    });
  }

  renderMapView_() {
    this.calcPartnerInactivity_();
    const title = document.getElementById('mapMainTitle');
    const guide = document.getElementById('mapGuideText');
    const pill = document.getElementById('mapSelectedPrefPill');
    const cntPill = document.getElementById('mapSelectedCountPill');
    const domesticBtn = document.getElementById('mapScopeDomesticBtn');
    const worldBtn = document.getElementById('mapScopeWorldBtn');
    if (domesticBtn) domesticBtn.classList.toggle('active', this.mapScope==='domestic');
    if (worldBtn) worldBtn.classList.toggle('active', this.mapScope==='world');
    if (this.mapScope==='domestic') {
      if (title) title.textContent = '\u56fd\u5185\u53d6\u5f15\u5148\u30de\u30c3\u30d7';
      if (guide) guide.textContent = '\u90fd\u9053\u5e9c\u770c\u3092\u30af\u30ea\u30c3\u30af\u3059\u308b\u3068\u3001\u56fd\u5185\u306b\u53cd\u6620\u3055\u308c\u308b\u53d6\u5f15\u5148\u3092\u7d5e\u308a\u8fbc\u307f\u3067\u304d\u307e\u3059';
      if (pill) pill.textContent = `\u90fd\u9053\u5e9c\u770c: ${this.mapSelectedPrefecture||'\u672a\u9078\u629e'}`;
      const counts = this.buildPrefectureCounts_();
      if (cntPill) cntPill.textContent = `\u4ef6\u6570: ${this.mapSelectedPrefecture?(counts[this.mapSelectedPrefecture]||0):0}`;
      this.renderJapanMap_();
      this.renderMapPrefQuickList_();
    } else {
      if (title) title.textContent = '\u4e16\u754c\u53d6\u5f15\u5148\u30de\u30c3\u30d7';
      if (guide) guide.textContent = '\u56fd\u3092\u30af\u30ea\u30c3\u30af\u3059\u308b\u3068\u3001\u4e16\u754c\u306b\u53cd\u6620\u3055\u308c\u308b\u53d6\u5f15\u5148\u3092\u7d5e\u308a\u8fbc\u307f\u3067\u304d\u307e\u3059';
      if (pill) pill.textContent = `\u56fd: ${this.mapSelectedCountry||'\u672a\u9078\u629e'}`;
      const counts = this.buildCountryCounts_();
      if (cntPill) cntPill.textContent = `\u4ef6\u6570: ${this.mapSelectedCountry?(counts[this.mapSelectedCountry]||0):0}`;
      this.renderWorldMap_();
      this.renderMapCountryQuickList_();
    }
    this.renderMapPartnerList_();
    this.renderMapShipments_();
  }

  buildPrefectureCounts_() {
    const counts = {};
    this.getJapanPrefectures_().forEach(p => counts[p]=0);
    (this.partners||[]).forEach(p => {
      const pref = this.getEffectiveDomesticPrefecture_(p);
      if (pref) { if (counts[pref]===undefined) counts[pref]=0; counts[pref]+=1; }
    });
    return counts;
  }

  buildCountryCounts_() {
    const counts = {};
    (this.partners||[]).forEach(p => {
      const effectiveCountry = this.getEffectiveWorldCountry_(p);
      if (!effectiveCountry) return;
      const key = this.normalizeCountryKey_(effectiveCountry);
      if (!key) return;
      if (counts[key]===undefined) counts[key]=0;
      counts[key]+=1;
    });
    return counts;
  }

  getMapFilteredPartners_() {
    if (this.mapScope==='world') return this.getMapFilteredPartnersWorld_();
    const pref = String(this.mapSelectedPrefecture||'').trim();
    if (!pref) return [];
    return (this.partners||[]).filter(p=>this.getEffectiveDomesticPrefecture_(p)===pref)
      .slice().sort((a,b)=>(a.name||'').localeCompare((b.name||''),'ja'));
  }

  getMapFilteredPartnersWorld_() {
    const countryKey = String(this.mapSelectedCountry||'').trim();
    if (!countryKey) return [];
    return (this.partners||[]).filter(p => {
      const ec = this.getEffectiveWorldCountry_(p);
      return ec && this.normalizeCountryKey_(ec)===countryKey;
    }).slice().sort((a,b)=>(a.name||'').localeCompare((b.name||''),'ja'));
  }

  renderMapPartnerList_() {
    const listEl = document.getElementById('mapPartnerList');
    const metaEl = document.getElementById('mapPartnerListMeta');
    const titleEl = document.getElementById('mapPartnerPanelTitle');
    if (!listEl||!metaEl||!titleEl) return;
    const selectedLabel = this.mapScope==='domestic' ? (this.mapSelectedPrefecture||'') : (this.mapSelectedCountry||'');
    if (!selectedLabel) {
      listEl.innerHTML = `<div style="color:#94a3b8;font-weight:900;padding:10px;">${this.mapScope==='domestic'?'\u90fd\u9053\u5e9c\u770c\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044':'\u56fd\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'}</div>`;
      metaEl.textContent = '0\u4ef6';
      titleEl.textContent = this.mapScope==='domestic' ? '\u90fd\u9053\u5e9c\u770c\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044' : '\u56fd\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044';
      return;
    }
    const arr = this.getMapFilteredPartners_();
    metaEl.textContent = `${arr.length}\u4ef6`;
    titleEl.textContent = `\u3010${selectedLabel}\u3011\u306e\u53d6\u5f15\u5148`;
    listEl.innerHTML = '';
    arr.forEach(p => {
      const active = this.selectedPartnerForView && Number(this.selectedPartnerForView.no)===Number(p.no);
      const locLine = this.buildPartnerLocationLine_(p);
      const alertObj = this.partnerInactivityMap && this.partnerInactivityMap[p.no];
      const lost = !!p.lost;
      const badgeHtml = lost ? '<span class="inactive-badge">\u5931\u6ce8</span>'
        : alertObj ? '<span class="inactive-badge">\u8981\u30d5\u30a9\u30ed\u30fc</span>' : '';
      listEl.insertAdjacentHTML('beforeend', `
        <div class="map-partner-card ${active?'active':''}" data-no="${p.no}">
          <div class="map-partner-name">${this.escapeHtml_(p.name)}${this.partnerTypeBadgeHtml_(p)}${badgeHtml}</div>
          <div class="map-partner-meta">${this.escapeHtml_(locLine||'')}</div>
          <div class="map-partner-meta">No: ${p.no}</div>
        </div>
      `);
    });
    listEl.querySelectorAll('.map-partner-card').forEach(el => {
      el.onclick = () => {
        const no = Number(el.getAttribute('data-no'));
        const hit = (this.partners||[]).find(x=>Number(x.no)===no);
        if (!hit) return;
        this.selectedPartnerForView = hit;
        const meta = document.getElementById('mapShipmentsMeta');
        if (meta) meta.textContent = `\u3010${hit.name}\u3011`;
        const btn = document.getElementById('mapExportSelectedPartnerCsvBtn');
        if (btn) btn.disabled = false;
        this.renderMapPartnerList_();
        this.renderMapShipments_();
      };
    });
    if (this.selectedPartnerForView) {
      let stillInScope = false;
      if (this.mapScope==='domestic') {
        stillInScope = this.getEffectiveDomesticPrefecture_(this.selectedPartnerForView)===this.mapSelectedPrefecture;
      } else {
        stillInScope = this.normalizeCountryKey_(this.getEffectiveWorldCountry_(this.selectedPartnerForView))===this.mapSelectedCountry;
      }
      if (!stillInScope) {
        this.selectedPartnerForView = null;
        const btn = document.getElementById('mapExportSelectedPartnerCsvBtn');
        if (btn) btn.disabled = true;
      }
    }
  }

  renderMapShipments_() {
    const meta = document.getElementById('mapShipmentsMeta');
    const btn = document.getElementById('mapExportSelectedPartnerCsvBtn');
    if (!this.selectedPartnerForView) {
      if (meta) meta.textContent = '\u53d6\u5f15\u5148\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044';
      if (btn) btn.disabled = true;
      const tbody = document.getElementById('mapPartnerShipmentsBody');
      if (tbody) tbody.innerHTML = '';
      return;
    }
    if (meta) meta.textContent = `\u3010${this.selectedPartnerForView.name}\u3011`;
    if (btn) btn.disabled = false;
    this.renderShipmentsInto_(this.selectedPartnerForView, 'mapPartnerShipmentsBody', this.mapDateFrom, this.mapDateTo);
  }

  renderMapPrefQuickList_() {
    const wrap = document.getElementById('mapPrefQuickList');
    if (!wrap) return;
    const counts = this.buildPrefectureCounts_();
    const prefs = this.getJapanPrefectures_().slice().sort((a,b) => {
      const ca=counts[a]||0, cb=counts[b]||0;
      return (cb-ca)||String(a).localeCompare(String(b),'ja');
    });
    wrap.innerHTML = '';
    prefs.forEach(p => {
      const cnt = counts[p]||0;
      const active = this.mapSelectedPrefecture===p;
      wrap.insertAdjacentHTML('beforeend', `
        <div class="map-pref-chip ${active?'active':''}" data-pref="${this.escapeHtml_(p)}">
          <span>${this.escapeHtml_(p)}</span><span class="cnt">${cnt}</span>
        </div>
      `);
    });
    wrap.querySelectorAll('.map-pref-chip').forEach(el => {
      el.onclick = () => {
        const pref = String(el.getAttribute('data-pref')||'').trim();
        if (!pref) return;
        this.selectedPartnerForView = null;
        this.mapSelectedPrefecture = this.mapSelectedPrefecture===pref ? '' : pref;
        this.renderMapView_();
      };
    });
  }

  renderMapCountryQuickList_() {
    const wrap = document.getElementById('mapPrefQuickList');
    if (!wrap) return;
    const counts = this.buildCountryCounts_();
    const countries = Object.keys(counts).sort((a,b)=>{
      const ca=counts[a]||0,cb=counts[b]||0;
      return (cb-ca)||String(a).localeCompare(String(b),'ja');
    });
    wrap.innerHTML = '';
    countries.forEach(country => {
      const cnt = counts[country]||0;
      const active = this.mapSelectedCountry===country;
      wrap.insertAdjacentHTML('beforeend', `
        <div class="map-pref-chip ${active?'active':''}" data-country="${this.escapeHtml_(country)}">
          <span>${this.escapeHtml_(country)}</span><span class="cnt">${cnt}</span>
        </div>
      `);
    });
    wrap.querySelectorAll('.map-pref-chip').forEach(el => {
      el.onclick = () => {
        const country = String(el.getAttribute('data-country')||'').trim();
        if (!country) return;
        this.selectedPartnerForView = null;
        this.mapSelectedCountry = this.mapSelectedCountry===country ? '' : country;
        this.renderMapView_();
      };
    });
  }

  attachSvgZoom_(svg, contentNode, modeKey) {
    if (!(window.d3 && svg && contentNode)) return;
    const d3 = window.d3;
    const svgSel = d3.select(svg);
    const contentSel = d3.select(contentNode);
    svgSel.on('.zoom', null);
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on('start', () => svg.classList.add('dragging'))
      .on('end', () => svg.classList.remove('dragging'))
      .on('zoom', (event) => {
        contentSel.attr('transform', event.transform);
        this._svgZoomState[modeKey] = { transform: event.transform, zoom };
      });
    svgSel.call(zoom);
    const state = this._svgZoomState[modeKey];
    if (state && state.transform) svgSel.call(zoom.transform, state.transform);
    else { svgSel.call(zoom.transform, d3.zoomIdentity); this._svgZoomState[modeKey] = { transform: d3.zoomIdentity, zoom }; }
  }

  resetMapZoom_() {
    const svg = document.getElementById('jpMapSvg');
    if (!(window.d3 && svg)) return;
    const modeKey = this.mapScope==='world' ? 'world' : 'domestic';
    const state = this._svgZoomState[modeKey];
    if (!state || !state.zoom) return;
    window.d3.select(svg).transition().duration(250).call(state.zoom.transform, window.d3.zoomIdentity);
    this._svgZoomState[modeKey] = { transform: window.d3.zoomIdentity, zoom: state.zoom };
  }

  async renderJapanMap_() {
    const svg = document.getElementById('jpMapSvg');
    if (!svg) return;
    const ensureLibs = () => {
      const ok = window.d3 && window.topojson && typeof window.topojson.feature === 'function';
      if (!ok) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u5730\u56f3\u30e9\u30a4\u30d6\u30e9\u30ea\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f</text>'; }
      return ok;
    };
    if (!ensureLibs()) return;
    const draw = (topology) => {
      const counts = this.buildPrefectureCounts_();
      svg.innerHTML = '';
      const d3 = window.d3;
      const path = d3.geoPath();
      const obj = topology?.objects?.prefectures || topology?.objects?.japan;
      if (!obj) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u5730\u56f3\u30c7\u30fc\u30bf\u5f62\u5f0f\u304c\u60f3\u5b9a\u3068\u9055\u3044\u307e\u3059</text>'; return; }
      const geo = window.topojson.feature(topology, obj);
      const features = geo?.features || [];
      if (!features.length) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u5730\u56f3\u30c7\u30fc\u30bf\u304c\u7a7a\u3067\u3059</text>'; return; }
      const bounds = path.bounds(geo);
      const x0=bounds[0][0],y0=bounds[0][1],x1=bounds[1][0],y1=bounds[1][1];
      svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(10,x1-x0)} ${Math.max(10,y1-y0)}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      root.setAttribute('id', 'mapZoomRoot');
      svg.appendChild(root);
      const PREF_NAMES = this.getJapanPrefectures_();
      const idToPref = (id) => { const n=Number(id); return (Number.isFinite(n)&&n>=1&&n<=47) ? PREF_NAMES[n-1] : ''; };
      features.forEach(f => {
        const pref = String(f?.properties?.name_ja||f?.properties?.name||'').trim() || idToPref(f?.id??f?.properties?.id??f?.properties?.prefecture);
        if (!pref) return;
        const cnt = counts[pref]||0;
        const active = this.mapSelectedPrefecture===pref;
        const g = document.createElementNS('http://www.w3.org/2000/svg','g');
        g.setAttribute('class', ['jp-pref', cnt>0?'has-partners':'', active?'active':''].filter(Boolean).join(' '));
        g.setAttribute('data-pref', pref);
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', path(f)||'');
        g.appendChild(p); root.appendChild(g);
      });
      svg.querySelectorAll('g.jp-pref').forEach(g => {
        g.onclick = () => {
          const pref = String(g.getAttribute('data-pref')||'').trim();
          if (!pref) return;
          this.selectedPartnerForView = null;
          this.mapSelectedPrefecture = this.mapSelectedPrefecture===pref ? '' : pref;
          this.renderMapView_();
        };
      });
      this.attachSvgZoom_(svg, root, 'domestic');
    };
    if (this._jpnAtlasTopology) { draw(this._jpnAtlasTopology); return; }
    svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u5730\u56f3\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...</text>';
    try {
      const res = await fetch('https://unpkg.com/jpn-atlas@1/japan/japan.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      this._jpnAtlasTopology = await res.json();
      draw(this._jpnAtlasTopology);
    } catch(e) {
      svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#b91c1c;">\u5730\u56f3\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f</text>';
    }
  }

  async renderWorldMap_() {
    const svg = document.getElementById('jpMapSvg');
    if (!svg) return;
    const ensureLibs = () => {
      const ok = window.d3 && window.topojson && typeof window.topojson.feature === 'function';
      if (!ok) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u5730\u56f3\u30e9\u30a4\u30d6\u30e9\u30ea\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f</text>'; }
      return ok;
    };
    if (!ensureLibs()) return;
    const draw = (topology) => {
      const counts = this.buildCountryCounts_();
      svg.innerHTML = '';
      const d3 = window.d3;
      const obj = topology?.objects?.countries;
      if (!obj) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u4e16\u754c\u5730\u56f3\u30c7\u30fc\u30bf\u5f62\u5f0f\u304c\u60f3\u5b9a\u3068\u9055\u3044\u307e\u3059</text>'; return; }
      const geo = window.topojson.feature(topology, obj);
      const features = geo?.features||[];
      if (!features.length) { svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u4e16\u754c\u5730\u56f3\u30c7\u30fc\u30bf\u304c\u7a7a\u3067\u3059</text>'; return; }
      const projection = d3.geoNaturalEarth1().fitSize([1000, 560], geo);
      const path = d3.geoPath(projection);
      svg.setAttribute('viewBox', '0 0 1000 560');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const root = document.createElementNS('http://www.w3.org/2000/svg','g');
      root.setAttribute('id', 'mapZoomRoot');
      svg.appendChild(root);
      const normName = (f) => this.normalizeCountryKey_(String(f?.properties?.name||f?.properties?.NAME||f?.properties?.admin||'').trim());
      features.forEach(f => {
        const key = normName(f);
        const cnt = counts[key]||0;
        const active = this.mapSelectedCountry===key;
        const g = document.createElementNS('http://www.w3.org/2000/svg','g');
        g.setAttribute('class', ['jp-pref', cnt>0?'has-partners':'', active?'active':''].filter(Boolean).join(' '));
        g.setAttribute('data-country', key);
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', path(f)||'');
        g.appendChild(p); root.appendChild(g);
      });
      svg.querySelectorAll('g.jp-pref').forEach(g => {
        g.onclick = () => {
          const country = String(g.getAttribute('data-country')||'').trim();
          if (!country || !(this.buildCountryCounts_()[country]>0)) return;
          this.selectedPartnerForView = null;
          this.mapSelectedCountry = this.mapSelectedCountry===country ? '' : country;
          this.renderMapView_();
        };
      });
      this.attachSvgZoom_(svg, root, 'world');
    };
    if (this._worldAtlasTopology) { draw(this._worldAtlasTopology); return; }
    svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#64748b;">\u4e16\u754c\u5730\u56f3\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...</text>';
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      this._worldAtlasTopology = await res.json();
      draw(this._worldAtlasTopology);
    } catch(e) {
      svg.innerHTML = '<text x="10" y="20" style="font-size:12px;fill:#b91c1c;">\u4e16\u754c\u5730\u56f3\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f</text>';
    }
  }

  getJapanPrefectures_() {
    return ['\u5317\u6d77\u9053','\u9752\u68ee\u770c','\u5ca9\u624b\u770c','\u5bae\u57ce\u770c','\u79cb\u7530\u770c','\u5c71\u5f62\u770c','\u798f\u5cf6\u770c',
      '\u8328\u57ce\u770c','\u6803\u6728\u770c','\u7fa4\u99ac\u770c','\u57fc\u7389\u770c','\u5343\u8449\u770c','\u6771\u4eac\u90fd','\u795e\u5948\u5ddd\u770c',
      '\u65b0\u6f5f\u770c','\u5bcc\u5c71\u770c','\u77f3\u5ddd\u770c','\u798f\u4e95\u770c','\u5c71\u68a8\u770c','\u9577\u91ce\u770c',
      '\u5c90\u961c\u770c','\u9759\u5ca1\u770c','\u611b\u77e5\u770c','\u4e09\u91cd\u770c',
      '\u6ecb\u8cc0\u770c','\u4eac\u90fd\u5e9c','\u5927\u962a\u5e9c','\u5175\u5eab\u770c','\u5948\u826f\u770c','\u548c\u6b4c\u5c71\u770c',
      '\u9ce5\u53d6\u770c','\u5cf6\u6839\u770c','\u5ca1\u5c71\u770c','\u5e83\u5cf6\u770c','\u5c71\u53e3\u770c',
      '\u5fb3\u5cf6\u770c','\u9999\u5ddd\u770c','\u611b\u5a9b\u770c','\u9ad8\u77e5\u770c',
      '\u798f\u5ca1\u770c','\u4f50\u8cc0\u770c','\u9577\u5d0e\u770c','\u718a\u672c\u770c','\u5927\u5206\u770c','\u5bae\u5d0e\u770c','\u9e7f\u5150\u5cf6\u770c',
      '\u6c96\u7e04\u770c'];
  }

  getAllCountries_() {
    return ['Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria','Azerbaijan',
      'Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi',
      'Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo (Congo-Brazzaville)','Costa Rica',
      'C\u00f4te d\u2019Ivoire','Croatia','Cuba','Cyprus','Czechia',
      'Democratic Republic of the Congo','Denmark','Djibouti','Dominica','Dominican Republic',
      'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia',
      'Fiji','Finland','France',
      'Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana',
      'Haiti','Holy See','Honduras','Hungary',
      'Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
      'Jamaica','Japan','Jordan',
      'Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
      'Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
      'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar',
      'Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway',
      'Oman',
      'Pakistan','Palau','Palestine State','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal',
      'Qatar',
      'Romania','Russia','Rwanda',
      'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria',
      'Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu',
      'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
      'Vanuatu','Venezuela','Vietnam',
      'Yemen',
      'Zambia','Zimbabwe'];
  }
}

// Next.js page.tsx の useEffect から初期化するためにクラスを公開
window.InventoryApp = InventoryApp;
