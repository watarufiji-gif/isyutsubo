'use client';

import Script from 'next/script';

export default function Home() {
  return (
    <>
      {/* ===== ヘッダー ===== */}
      <header className="header no-print">
        <h1 className="header-title">課税移出簿</h1>
        <div className="header-nav">
          <select id="productSelect" className="select-styled header-product-select">
            <option value="">商品を選択</option>
          </select>
          <button id="addProductBtn" className="btn btn-light">＋ 商品追加</button>
          <span className="header-sep" />
          <button id="navInventoryBtn" className="btn btn-dark">在庫管理</button>
          <button id="navPartnersBtn" className="btn btn-light">取引先一覧</button>
          <button id="navAnalysisBtn" className="btn btn-light">取引数量</button>
          <button id="navMapBtn" className="btn btn-light">地図</button>
          <span className="header-sep" />
          <button id="usageBtn" className="btn btn-light">説明</button>
          <button id="settingsBtn" className="btn btn-light btn-icon-text">⚙</button>
        </div>
      </header>

      {/* ===== 在庫管理ビュー ===== */}
      <div id="inventoryView" style={{ display: 'none' }}>

        {/* 期間フィルター行 */}
        <div className="inv-filter-bar no-print">
          <span className="filter-label">期間指定</span>
          <input id="dateFrom" type="date" className="input-date" />
          <span className="sep">〜</span>
          <input id="dateTo" type="date" className="input-date" />
          <button id="btnApplyDateRange" className="btn btn-primary">適用</button>
          <button id="btnResetDateRange" className="btn btn-light">全期間</button>
          <button id="exportInventoryCsvBtn" className="btn btn-light">在庫 CSV</button>
          <span id="displayPeriodLabel" className="period-label" />
        </div>

        {/* サマリーカード */}
        <div id="summaryPanel" className="summary-panel no-print" style={{ display: 'none' }}>
          <div className="summary-grid">

            <div className="summary-group">
              <div className="summary-group-label">在庫数（本）</div>
              <div className="cards">
                <div className="card card-blue">
                  <small>販売在庫</small>
                  <span id="summarySalesStock">0</span>
                </div>
              </div>
            </div>

            <div className="summary-group">
              <div className="summary-group-label">出荷数（本）</div>
              <div className="cards">
                <div className="card card-navy">
                  <small>卸</small>
                  <span id="summaryWh">0</span>
                </div>
                <div className="card card-navy">
                  <small>小売</small>
                  <span id="summaryRt">0</span>
                </div>
                <div className="card card-navy">
                  <small>贈与</small>
                  <span id="summaryGift">0</span>
                </div>
                <div className="card card-navy">
                  <small>サンプル</small>
                  <span id="summarySample">0</span>
                </div>
                <div className="card card-navy card-navy-bold">
                  <small>合計</small>
                  <span id="summaryShipTotal">0</span>
                </div>
              </div>
            </div>

            <div className="summary-group">
              <div className="summary-group-label">その他（本）</div>
              <div className="cards">
                <div className="card card-pink">
                  <small>破損</small>
                  <span id="summaryDamage">0</span>
                </div>
                <div className="card card-orange">
                  <small>分析</small>
                  <span id="summaryAnalysis">0</span>
                </div>
                <div className="card card-red">
                  <small>不良</small>
                  <span id="summaryCork">0</span>
                </div>
                <div className="card card-red card-red-bold">
                  <small>合計</small>
                  <span id="summaryOtherTotal">0</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 印刷ヘッダー */}
        <div className="print-header">
          <h2 id="printProductTitle"></h2>
          <div id="printDateString"></div>
        </div>

        {/* テーブル */}
        <div className="main-content">
          <div className="table-container">
            <table className="data-table inventory-table">
              <colgroup>
                <col className="c-date" />
                <col className="c-tsumeguchi" />
                <col className="c-sales" />
                <col className="c-ship" />
                <col className="c-ship" />
                <col className="c-ship" />
                <col className="c-ship" />
                <col className="c-ship-total" />
                <col className="c-other" />
                <col className="c-other" />
                <col className="c-other" />
                <col className="c-remarks" />
                <col className="c-staff" />
                <col className="c-op no-print" />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>日時</th>
                  <th rowSpan={2}>詰口</th>
                  <th rowSpan={2} className="header-group-green">販売在庫</th>
                  <th colSpan={5} className="header-group-green">出荷情報</th>
                  <th rowSpan={2}>破損</th>
                  <th rowSpan={2}>分析</th>
                  <th rowSpan={2}>不良</th>
                  <th rowSpan={2}>備考</th>
                  <th rowSpan={2}>担当者</th>
                  <th rowSpan={2} className="no-print">操作</th>
                </tr>
                <tr className="sub-header">
                  <th>卸</th>
                  <th>小売</th>
                  <th>贈与</th>
                  <th>サンプル</th>
                  <th>合計</th>
                </tr>
              </thead>
              <tbody id="tableBody"></tbody>
            </table>
          </div>

          {/* 行追加ボタン */}
          <div className="add-btn-container no-print">
            <button id="addRowBtn" className="btn btn-green-main">
              ＋ 新しい行を追加
            </button>
          </div>
        </div>
      </div>

      {/* ===== 取引先ビュー ===== */}
      <div id="partnersView" className="main-content" style={{ display: 'none' }}>
        <div className="partners-page">
          <div className="partners-left">
            <div className="partners-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="partners-title">取引先一覧</span>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                onClick={() => (window as any).app?.openPartnerModal(null)}
              >
                ＋ 追加
              </button>
            </div>
            <div className="partners-controls">
              <input id="partnerSearchInput" type="text" className="input" placeholder="名前・住所・電話で検索" />
              <div className="partners-controls-row">
                <input id="partnerCountrySearchInput" type="text" className="input" placeholder="国で検索" />
                <input id="partnerPrefectureSearchInput" type="text" className="input" placeholder="都道府県で検索" />
              </div>
              <div className="partners-controls-row">
                <button id="partnerClearSearchBtn" className="btn btn-light">検索クリア</button>
              </div>
            </div>
            <div id="partnerList" className="partners-list"></div>
          </div>

          <div className="partners-right">
            <div className="partners-panel-head">
              <span id="partnerPanelTitle" className="partners-panel-title">取引先を選択してください</span>
              <div className="partners-panel-actions">
                <button id="exportSelectedPartnerCsvBtn" className="btn btn-light" disabled>CSV出力</button>
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="filter-label">期間:</span>
              <input id="partnerDateFrom" type="date" className="input-date" />
              <span className="sep">〜</span>
              <input id="partnerDateTo" type="date" className="input-date" />
              <button id="partnerBtnApplyDateRange" className="btn btn-primary">適用</button>
              <button id="partnerBtnResetDateRange" className="btn btn-light">リセット</button>
              <span id="partnerDisplayPeriodLabel" className="period-label">全期間</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table partners-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>商品名</th>
                    <th>受注(本)</th>
                    <th>サンプル(本)</th>
                    <th>合計(本)</th>
                  </tr>
                </thead>
                <tbody id="partnerShipmentsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 取引数量ビュー ===== */}
      <div id="analysisView" className="main-content" style={{ display: 'none' }}>
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="filter-label">年度:</span>
          <select id="analysisYearSelect" className="select-styled" style={{ minWidth: 120 }}></select>
          <span className="filter-label">フィルタ:</span>
          <select id="analysisFilterStatus" className="select-styled" style={{ minWidth: 160 }}>
            <option value="all">すべて</option>
            <option value="lost_only">失注のみ</option>
            <option value="lost_exclude">失注を除く</option>
            <option value="inactive_only">要フォローのみ</option>
            <option value="inactive_exclude">要フォローを除く</option>
            <option value="inactive_or_lost">要フォロー or 失注</option>
          </select>
          <span className="filter-label">並び替え:</span>
          <select id="analysisSortKey" className="select-styled" style={{ minWidth: 160 }}>
            <option value="total_desc">合計(多い順)</option>
            <option value="order_desc">受注(多い順)</option>
            <option value="sample_desc">サンプル(多い順)</option>
            <option value="last_old">最終注文(古い順)</option>
            <option value="last_new">最終注文(新しい順)</option>
          </select>
        </div>
        <h3 id="analysisTitle" style={{ fontWeight: 900, fontSize: '1.05rem', color: '#1a5f7a', marginBottom: 12 }}></h3>
        <div className="table-container">
          <table className="data-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>順位</th>
                <th style={{ textAlign: 'left' }}>取引先名</th>
                <th>受注(本)</th>
                <th>サンプル(本)</th>
                <th>合計(本)</th>
                <th>最終注文</th>
              </tr>
            </thead>
            <tbody id="analysisBody"></tbody>
          </table>
        </div>
      </div>

      {/* ===== 地図ビュー ===== */}
      <div id="mapView" className="main-content" style={{ display: 'none' }}>
        <div className="map-page">
          <div className="map-left">
            <div className="map-controls">
              <div className="map-scope-tabs">
                <button id="mapScopeDomesticBtn" className="map-scope-btn active">国内</button>
                <button id="mapScopeWorldBtn" className="map-scope-btn">世界</button>
                <button id="mapClearPrefBtn" className="btn btn-light" style={{ fontSize: '0.76rem', padding: '4px 10px' }}>選択解除</button>
                <button id="mapResetZoomBtn" className="btn btn-light" style={{ fontSize: '0.76rem', padding: '4px 10px' }}>ズームリセット</button>
              </div>
              <div className="map-pill-row">
                <span id="mapSelectedPrefPill" className="map-pill map-pill-muted">都道府県: 未選択</span>
                <span id="mapSelectedCountPill" className="map-pill map-pill-muted">件数: 0</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="filter-label">期間:</span>
                <input id="mapDateFrom" type="date" className="input-date" />
                <span className="sep">〜</span>
                <input id="mapDateTo" type="date" className="input-date" />
                <button id="mapBtnApplyDateRange" className="btn btn-primary">適用</button>
                <button id="mapBtnResetDateRange" className="btn btn-light">リセット</button>
              </div>
              <span id="mapDisplayPeriodLabel" className="period-label">表示期間: 全期間</span>
            </div>
            <div className="map-canvas">
              <h4 id="mapMainTitle" style={{ fontWeight: 900, color: '#1a5f7a', marginBottom: 6 }}>国内取引先マップ</h4>
              <p id="mapGuideText" style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>都道府県をクリックすると取引先を絞り込みできます</p>
              <div className="jp-map-wrap">
                <svg id="jpMapSvg" className="jp-map" viewBox="0 0 960 960"></svg>
              </div>
              <div className="map-legend">
                <div className="map-legend-item"><div className="map-legend-dot"></div>取引先あり</div>
                <div className="map-legend-item"><div className="map-legend-dot map-legend-dot-muted"></div>取引先なし</div>
              </div>
            </div>
            <div id="mapPrefQuickList" className="map-pref-list"></div>
          </div>

          <div className="map-right">
            <div className="map-split">
              <div className="map-partner-list-wrap">
                <div className="map-subhead">
                  <span id="mapPartnerPanelTitle" className="map-subhead-title">取引先</span>
                  <span id="mapPartnerListMeta" className="map-subhead-meta"></span>
                </div>
                <div id="mapPartnerList" className="map-partner-list"></div>
              </div>
              <div className="map-shipments-wrap">
                <div className="map-subhead">
                  <span className="map-subhead-title">出荷履歴</span>
                  <span id="mapShipmentsMeta" className="map-subhead-meta"></span>
                  <button id="mapExportSelectedPartnerCsvBtn" className="btn btn-light" style={{ fontSize: '0.76rem', padding: '4px 10px' }} disabled>CSV出力</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>商品名</th>
                        <th>受注(本)</th>
                        <th>サンプル(本)</th>
                        <th>合計(本)</th>
                      </tr>
                    </thead>
                    <tbody id="mapPartnerShipmentsBody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== モーダル: 行追加/編集 ===== */}
      <div id="rowModal" className="modal">
        <div className="modal-content" style={{ maxWidth: 580 }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 900, color: '#1a5f7a' }}>行の追加 / 編集</h3>
            <button className="btn btn-icon cancel-modal" style={{ fontSize: '1.4rem' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>日付</div>
                <input id="inputDate" type="date" className="input" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>詰口(本)</div>
                <input id="inputTsumeguchi" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>卸</div>
                <input id="inputShip1F" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>小売</div>
                <input id="inputShip2F" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>贈与</div>
                <input id="inputGift" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>サンプル</div>
                <input id="inputSample" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>破損</div>
                <input id="inputDamage" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>分析</div>
                <input id="inputAnalysis" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
              <label>
                <div className="filter-label" style={{ marginBottom: 4 }}>不良</div>
                <input id="inputCork" type="number" className="input" placeholder="0" style={{ width: '100%' }} />
              </label>
            </div>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>取引先</div>
              <select id="remarksPartnerSelect" className="select-styled" style={{ width: '100%' }}>
                <option value="">取引先を選択</option>
              </select>
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>備考</div>
              <input id="inputRemarks" type="text" className="input" placeholder="備考（任意）" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>担当者 <span style={{ color: '#b91c1c' }}>*</span></div>
              <select id="inputStaff" className="select-styled" style={{ width: '100%' }}>
                <option value="">担当者を選択</option>
              </select>
            </label>
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-light cancel-modal">キャンセル</button>
            <button id="rowModalConfirm" className="btn btn-primary">保存</button>
          </div>
        </div>
      </div>

      {/* ===== モーダル: 取引先登録/編集 ===== */}
      <div id="partnerModal" className="modal">
        <div className="modal-content" style={{ maxWidth: 620 }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 id="partnerModalTitle" style={{ fontWeight: 900, color: '#1a5f7a' }}>取引先登録</h3>
            <button className="btn btn-icon cancel-modal" style={{ fontSize: '1.4rem' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>No: <span id="partnerNoLabel" style={{ fontWeight: 900 }}>自動採番</span></div>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>名称 <span style={{ color: '#b91c1c' }}>*</span></div>
              <input id="partnerName" type="text" className="input" placeholder="取引先名" style={{ width: '100%' }} />
            </label>
            <div>
              <div className="filter-label" style={{ marginBottom: 6 }}>種別</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                  <input id="partnerTypeDomestic" type="radio" name="partnerType" defaultChecked /> 国内
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                  <input id="partnerTypeExport" type="radio" name="partnerType" /> 輸出
                </label>
              </div>
            </div>
            <div id="exportSettingsWrap" style={{ display: 'none', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12 }}>
              <div className="filter-label" style={{ marginBottom: 6 }}>輸出先国 <span style={{ color: '#b91c1c' }}>*</span></div>
              <select id="partnerExportCountry" className="select-styled" style={{ width: '100%' }}></select>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: '0.82rem' }}>
                  <input id="partnerMapConditionReleased" type="checkbox" />
                  マップ掲載済み（世界マップに表示）
                </label>
              </div>
            </div>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>国</div>
              <select id="partnerCountry" className="select-styled" style={{ width: '100%' }}>
                <option value="">選択してください</option>
              </select>
            </label>
            <div id="prefectureWrap">
              <div className="filter-label" style={{ marginBottom: 4 }}>都道府県</div>
              <select id="partnerPrefecture" className="select-styled" style={{ width: '100%' }}></select>
            </div>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>住所</div>
              <input id="partnerAddress" type="text" className="input" placeholder="住所（任意）" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>電話</div>
              <input id="partnerPhone" type="text" className="input" placeholder="電話番号（任意）" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>担当者</div>
              <input id="partnerPerson" type="text" className="input" placeholder="担当者名（任意）" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>備考</div>
              <input id="partnerRemarks" type="text" className="input" placeholder="備考（任意）" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="filter-label" style={{ marginBottom: 4 }}>クレーム履歴</div>
              <input id="partnerClaims" type="text" className="input" placeholder="クレーム履歴（任意）" style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
              <input id="partnerLost" type="checkbox" />
              失注（取引終了）
            </label>
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-light cancel-modal">キャンセル</button>
            <button id="partnerSaveBtn" className="btn btn-primary">登録</button>
          </div>
        </div>
        <datalist id="partnerCountryList"></datalist>
        <datalist id="partnerPrefectureList"></datalist>
      </div>

      {/* ===== モーダル: 設定 ===== */}
      <div id="settingsModal" className="modal">
        <div className="modal-content" style={{ maxWidth: 500 }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 900, color: '#1a5f7a' }}>設定</h3>
            <button className="btn btn-icon cancel-modal" style={{ fontSize: '1.4rem' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div className="filter-label" style={{ marginBottom: 6 }}>商品名の変更</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="editProductName" type="text" className="input" placeholder="商品名" style={{ flex: 1 }} />
                <button id="updateProductNameBtn" className="btn btn-primary">更新</button>
              </div>
            </div>
            <div>
              <div className="filter-label" style={{ marginBottom: 6 }}>担当者管理</div>
              <div id="staffListWrap" style={{ marginBottom: 10, maxHeight: 150, overflowY: 'auto' }}></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="newStaffName" type="text" className="input" placeholder="担当者名" style={{ flex: 1 }} />
                <button id="addStaffBtn" className="btn btn-primary">追加</button>
              </div>
            </div>
            <div>
              <div className="filter-label" style={{ marginBottom: 6 }}>要フォロー判定（最終注文からの経過）</div>
              <select id="inactivityThresholdSelect" className="select-styled" style={{ width: '100%' }}>
                <option value="1m">1ヶ月</option>
                <option value="2m">2ヶ月</option>
                <option value="3m">3ヶ月</option>
                <option value="6m">6ヶ月</option>
                <option value="9m">9ヶ月</option>
                <option value="12m">12ヶ月</option>
                <option value="1y">1年</option>
              </select>
            </div>
            <div style={{ borderTop: '1px solid #fee2e2', paddingTop: 14 }}>
              <div className="filter-label" style={{ marginBottom: 6, color: '#b91c1c' }}>危険な操作</div>
              <button
                id="deleteProductBtn"
                className="btn"
                style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '7px 16px' }}
              >
                この商品を削除する
              </button>
            </div>
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-light cancel-modal">閉じる</button>
          </div>
        </div>
      </div>

      {/* ===== モーダル: 商品追加 ===== */}
      <div id="addProductModal" className="modal">
        <div className="modal-content" style={{ maxWidth: 420 }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 900, color: '#1a5f7a' }}>商品を追加</h3>
            <button className="btn btn-icon cancel-modal" style={{ fontSize: '1.4rem' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <div className="filter-label" style={{ marginBottom: 6 }}>商品名 <span style={{ color: '#b91c1c' }}>*</span></div>
            <input id="newProductName" type="text" className="input" placeholder="例: 純米大吟醸 〇〇" style={{ width: '100%' }} />
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-light cancel-modal">キャンセル</button>
            <button id="modalConfirm" className="btn btn-primary">追加</button>
          </div>
        </div>
      </div>

      {/* ===== モーダル: 説明 ===== */}
      <div id="usageModal" className="modal usage-modal">
        <div className="modal-content">
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 900, color: '#1a5f7a' }}>使い方ガイド</h3>
            <button className="btn btn-icon cancel-modal" style={{ fontSize: '1.4rem' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px', maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="usage-wrap">
              <div className="usage-grid">
                <div className="usage-box">
                  <div className="usage-section-title">📦 在庫管理</div>
                  <p>商品を選択して「＋ 新しい行を追加」から詰口・出荷・サンプル等を記録します。期間フィルタで絞り込みが可能です。</p>
                </div>
                <div className="usage-box">
                  <div className="usage-section-title">🤝 取引先一覧</div>
                  <p>取引先の登録・編集・出荷履歴の確認ができます。失注フラグや要フォロー通知に対応しています。</p>
                </div>
                <div className="usage-box">
                  <div className="usage-section-title">📊 取引数量</div>
                  <p>年度別の取引先出荷量ランキングを表示します。フィルタや並び替えで要フォロー先を把握できます。</p>
                </div>
                <div className="usage-box">
                  <div className="usage-section-title">🗺 地図</div>
                  <p>国内・世界の取引先を地図上で可視化します。都道府県・国をクリックして絞り込みができます。</p>
                </div>
              </div>
              <div className="usage-section-title" style={{ marginTop: 16 }}>各列の説明</div>
              <div className="usage-box">
                <p>
                  <b>詰口</b>: 瓶詰め数（入庫）<br />
                  <b>販売在庫</b>: 詰口累計 − 出荷合計（破損・分析含む）<br />
                  <b>卸 / 小売</b>: 課税移出（取引先出荷）<br />
                  <b>贈与</b>: 非売品贈与<br />
                  <b>サンプル</b>: 試飲・営業サンプル<br />
                  <b>合計</b>: 卸＋小売＋贈与＋サンプル<br />
                  <b>破損</b>: 破損廃棄（在庫から差引）<br />
                  <b>分析</b>: 成分分析用（在庫から差引）<br />
                  <b>不良</b>: コルク不良等（在庫計算には含まない）
                </p>
              </div>
              <p className="usage-note" style={{ marginTop: 10 }}>※ データはサーバー（Supabase）と端末ローカルストレージの両方に保存されます。</p>
            </div>
          </div>
          <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-light cancel-modal">閉じる</button>
          </div>
        </div>
      </div>

      {/* ===== 通知 / 保存ステータス ===== */}
      <div id="notification" className="notification"></div>
      <div id="saveStatus" className="save-status" style={{ display: 'none' }}></div>

      {/* ===== スクリプト初期化 ===== */}
      <Script
        src="/inventory-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          const app = new (window as any).InventoryApp();
          (window as any).app = app;
          app.init();
          // bindEvents の addProductBtn は productModal を開こうとするので上書き
          const addProductBtn = document.getElementById('addProductBtn');
          if (addProductBtn) addProductBtn.onclick = () => app.openModal_('addProductModal');
        }}
      />
    </>
  );
}
