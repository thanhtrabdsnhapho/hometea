const fs = require('fs');

let code = fs.readFileSync('public/js/app.js', 'utf8');

// 1. Add featured fields to mapping if not already there
if (!code.includes('is_featured: item.is_featured')) {
  code = code.replace(
    /published_at:\s*item\.published_at\s*\|\|\s*null/g,
    `published_at: item.published_at || null,\n                   is_featured: item.is_featured === true || item.is_featured === 'true',\n                   featured_at: item.featured_at || null,\n                   featured_label: item.featured_label || null`
  );
}

// 2. Add renderFeaturedProducts call in applyFilters
if (!code.includes('renderFeaturedProducts(true)')) {
  code = code.replace(
    /renderProducts\(filtered\);\s*if\s*\(\s*typeof\s*renderPublicMarketPriceTable/g,
    `renderProducts(filtered);\n        if (typeof renderFeaturedProducts === 'function') {\n          renderFeaturedProducts(true);\n        }\n        if (typeof renderPublicMarketPriceTable === 'function'`
  );
}

// 3. Add helper functions and createPropertyCardHtml / renderFeaturedProducts if not present
if (!code.includes('renderFeaturedProducts')) {
  const helperCode = `
      function createPropertyCardHtml(p, idx) {
        const list = p.imgList && p.imgList.length > 0 ? p.imgList : [p.img];
        const hasMultipleImages = list.length > 1;
        
        if (cardImageIndexes[p.id] === undefined) {
          cardImageIndexes[p.id] = 0;
        }
        const currentImgIndex = cardImageIndexes[p.id];
        const activeImgSrc = list[currentImgIndex];
        const activeImgSrcOptimized = getOptimizedCloudinaryUrl(activeImgSrc, 380, 240, false);

        const isFirstCard = idx === 0;
        const loadingAttr = isFirstCard ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';

        const sliderNavHtml = hasMultipleImages ? \`
          <button class="card-slider-nav prev" aria-label="Xem ảnh trước" onclick="changeCardImage('\${p.id}', -1, event)">&#10094;</button>
          <button class="card-slider-nav next" aria-label="Xem ảnh tiếp theo" onclick="changeCardImage('\${p.id}', 1, event)">&#10095;</button>
          <span class="card-slider-badge">\${currentImgIndex + 1}/\${list.length}</span>
        \` : '';

        const isFeatured = p.is_featured === true || p.is_featured === 'true';
        const featuredLabel = p.featuredLabel || p.featured_label || null;
        let badgeNoibatHtml = '';
        if (isFeatured) {
          let bText = '⭐ NỔI BẬT';
          let bClass = 'badge-noibat';
          if (featuredLabel === 'gap_ban') {
            bText = '🔥 GẤP BÁN';
            bClass = 'badge-noibat gap-ban';
          } else if (featuredLabel === 'gia_tot') {
            bText = '💰 GIÁ TỐT';
            bClass = 'badge-noibat gia-tot';
          }
          badgeNoibatHtml = \`<div class="\${bClass}">\${bText}</div>\`;
        }

        let shortAddress = p.address;
        if (p.street && p.ward) {
          shortAddress = \`\${p.street}, Phường \${p.ward}\`;
        } else {
          shortAddress = p.address.replace(", Phường", "").replace(", P.", "").replace(", Phường ", "").replace(", P. ", "").replace(", TP. Thủ Đức, TP.HCM", "").replace(", TP. Thủ Đức", "").replace(", TP.HCM", "");
        }
        if (shortAddress.length > 25) {
          shortAddress = shortAddress.substring(0, 24) + "...";
        }

        const viewsCount = p.views !== undefined ? p.views : 0;
        const isNew = isNewListing(p);
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        const isReduced = p.isPriceReduced && 
          p.priceUpdatedAt &&
          (Date.now() - new Date(p.priceUpdatedAt).getTime()) <= twoDaysMs;

        let priceDisplayHtml = \`<span>\${p.price} tỷ</span>\`;
        if (isReduced && p.oldPrice) {
          priceDisplayHtml = \`
            <span style="text-decoration: line-through; color: #475569; font-size: 0.85em; margin-right: 4px;">\${p.oldPrice} tỷ</span>
            <span style="color: var(--price-color); font-weight: bold; font-size: 1.1em;">\${p.price} tỷ</span>
            <span style="background-color: #b91c1c; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px; margin-left: 4px; text-transform: uppercase; display: inline-block; line-height: 1.1;">NEW</span>
          \`;
        }

        const pSlug = createSlug(p.title);
        const pUrl = \`/chitiet/\${p.id}-\${pSlug}\`;
        return \`
          <article class="product-card" id="prop-\${p.id}" style="cursor: pointer; display: flex; flex-direction: column;" onclick="openProductModal('\${p.id}', event)">
            <a href="\${pUrl}" onclick="openProductModal('\${p.id}', event)" style="display: block; text-decoration: none; color: inherit; width: 100%;">
              <div class="card-slider-container">
                \${badgeNoibatHtml}
                <img class="card-slider-img" width="380" height="240" src="\${activeImgSrcOptimized}" alt="\${p.title}" \${loadingAttr} onload="this.style.opacity=1" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22800%22%20height=%22600%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%230c1524%22/%3E%3Ctext%20x=%2250%25%22%20y=%2250%25%22%20dominant-baseline=%22middle%22%20text-anchor=%22middle%22%20font-family=%22system-ui%22%20font-size=%2222%22%20font-weight=%22bold%22%20fill=%22%23f97316%22%3EThanh%20Tr%C3%A0%20B%C4%90S%3C/text%3E%3C/svg%3E'; this.style.opacity=1;">
                \${sliderNavHtml}
              </div>
            </a>
            
            <div class="product-body" style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
              <div class="card-badges-row">
                \${isNew ? '<span class="card-badge new">🔥 Mới đăng</span>' : ''}
                <span class="card-badge view">👁️ \${viewsCount} lượt xem</span>
                \${p.badge ? \`<span class="card-badge type">\${p.badge}</span>\` : ''}
              </div>
              <h3 class="product-title" style="font-size: 15px; font-weight: 700; margin: 8px 0 6px; line-height: 1.4; color: var(--text-dark); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 42px;">\${p.title}</h3>
              <p class="product-address" style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                \${shortAddress}
              </p>
              <div class="product-meta-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 10px; font-size: 11.5px; color: var(--text-muted);">
                <div><strong style="color: var(--text-dark); display: block;">\${p.area} m²</strong>Diện tích</div>
                <div><strong style="color: var(--text-dark); display: block;">\${p.floors > 0 ? p.floors + ' Tầng' : 'Đất'}</strong>Kết cấu</div>
                <div><strong style="color: var(--text-dark); display: block;">\${p.direction || '—'}</strong>Hướng</div>
              </div>
              <div class="product-footer" style="display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 4px;">
                <div class="product-price" style="font-size: 16px; font-weight: 800; color: var(--price-color);">
                  \${priceDisplayHtml}
                </div>
                <button class="btn-detail-link" onclick="openProductModal('\${p.id}', event)" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-dark); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Chi tiết</button>
              </div>
            </div>
          </article>
        \`;
      }
      window.createPropertyCardHtml = createPropertyCardHtml;

      let displayedFeaturedLimit = 3;
      function renderFeaturedProducts(resetPagination = true) {
        if (resetPagination) {
          displayedFeaturedLimit = 3;
        }
        const sectionEl = document.getElementById('featuredProductsSection');
        const gridEl = document.getElementById('featuredProductsGrid');
        const loadMoreEl = document.getElementById('featuredLoadMoreContainer');
        const btnLoadMoreEl = document.getElementById('btnFeaturedLoadMore');

        if (!sectionEl || !gridEl) return;

        const isDraftProp = (p) => (p.publish_status === 'draft' || p.publishStatus === 'draft' || (p.badge && /bản\\s*nháp/i.test(p.badge)));
        const featuredList = propertyData.filter(p => p.is_featured && !p.isSold && !isDraftProp(p));

        featuredList.sort((a, b) => {
          const tA = a.featured_at ? new Date(a.featured_at).getTime() : getEffectiveTime(a);
          const tB = b.featured_at ? new Date(b.featured_at).getTime() : getEffectiveTime(b);
          return tB - tA;
        });

        if (featuredList.length === 0) {
          sectionEl.style.display = 'none';
          return;
        }

        sectionEl.style.display = 'block';
        gridEl.innerHTML = '';

        const visibleFeatured = featuredList.slice(0, displayedFeaturedLimit);

        if (loadMoreEl && btnLoadMoreEl) {
          if (featuredList.length > displayedFeaturedLimit) {
            loadMoreEl.style.display = 'flex';
            btnLoadMoreEl.onclick = () => {
              displayedFeaturedLimit += 3;
              renderFeaturedProducts(false);
            };
          } else {
            loadMoreEl.style.display = 'none';
          }
        }

        const cardsHtml = visibleFeatured.map((p, idx) => createPropertyCardHtml(p, idx)).join('');
        gridEl.innerHTML = cardsHtml;
      }
      window.renderFeaturedProducts = renderFeaturedProducts;

      function toggleFormFeaturedOptions(checked) {
        const grp = document.getElementById('formFeaturedLabelGroup');
        if (grp) {
          grp.style.display = checked ? 'block' : 'none';
        }
      }
      window.toggleFormFeaturedOptions = toggleFormFeaturedOptions;

      async function inlineToggleFeatured(id) {
        const item = propertyData.find(p => String(p.id) === String(id));
        if (!item) return;
        const newIsFeatured = !item.is_featured;
        item.is_featured = newIsFeatured;
        if (!newIsFeatured) {
          item.featured_label = null;
          item.featuredLabel = null;
        }

        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast("Đang đồng bộ trạng thái Nổi bật lên Cloud...", true);
          try {
            const bodyPayload = {
              is_featured: newIsFeatured,
              featured_label: newIsFeatured ? (item.featured_label || item.featuredLabel || null) : null
            };
            const response = await fetch(\`\${supabaseUrl}/rest/v1/\${supabaseTable}?id=eq.\${id}\`, {
              method: 'PATCH',
              headers: {
                'apikey': supabaseAnonKey,
                'Authorization': \`Bearer \${supabaseAnonKey}\`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(bodyPayload)
            });
            if (response.ok) {
              showToast(newIsFeatured ? "✓ Đã bật Nổi bật" : "✓ Đã tắt Nổi bật", true);
            } else {
              showToast("Lỗi đồng bộ Nổi bật lên Cloud", false);
            }
          } catch (err) {
            console.error("Error toggling featured:", err);
            showToast("Lỗi kết nối khi đồng bộ Nổi bật", false);
          }
        } else {
          showToast(newIsFeatured ? "✓ Đã bật Nổi bật (Cục bộ)" : "✓ Đã tắt Nổi bật (Cục bộ)", true);
        }

        savePropertyDataToStorage();
        renderAdminTable();
        renderFeaturedProducts();
        applyFilters();
      }
      window.inlineToggleFeatured = inlineToggleFeatured;
  `;
  code = code.replace(/function\s+renderProducts\s*\(/, helperCode + '\n      function renderProducts(');
}

// 4. Update renderProducts to use createPropertyCardHtml
code = code.replace(
  /const cardsHtmlList = visibleProducts\.map\(\(p,\s*idx\)\s*=>\s*\{[\s\S]*?return\s+`[\s\S]*?`\s*\}\)\.join\(''\);/,
  `const cardsHtmlList = visibleProducts.map((p, idx) => createPropertyCardHtml(p, idx)).join('');`
);

fs.writeFileSync('public/js/app.js', code, 'utf8');
console.log('Successfully updated app.js with helper functions and renderFeaturedProducts!');
