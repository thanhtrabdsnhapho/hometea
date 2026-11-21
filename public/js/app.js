      // Hàm tải động thư viện html2canvas khi người dùng click yêu cầu xuất ảnh
      function loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
          if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
          }
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = () => resolve(window.html2canvas);
          script.onerror = () => reject(new Error("Không thể nạp thư viện html2canvas"));
          document.head.appendChild(script);
        });
      }

      // Helper function to call Gemini (gemini-2.5-flash) with robust retry for high reliability
      async function fetchGeminiWithFallback(currentKey, requestBody) {
        const primaryModel = "gemini-2.5-flash";
        const maxRetries = 3;
        let delayMs = 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${currentKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });
            if (response.ok) {
              return response;
            }
            console.warn(`[Warning] Model ${primaryModel} failed on attempt ${attempt}/${maxRetries} with status ${response.status}.`);
            if (attempt === maxRetries) {
              return response;
            }
          } catch (err) {
            console.warn(`[Warning] Model ${primaryModel} failed on attempt ${attempt}/${maxRetries} with error:`, err);
            if (attempt === maxRetries) {
              throw err;
            }
          }
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }

      // Hàm hiện thông báo xác nhận tự chế sang trọng, tương thích hoàn hảo trong iframe sandbox
      function showCustomConfirm(title, message, proceedText = "Xác nhận", proceedColor = "#16a34a", icon = "⚠️", iconBg = "rgba(249, 115, 22, 0.1)", iconBorder = "#fee2e2") {
        return new Promise((resolve) => {
          const modal = document.getElementById('customConfirmModal');
          if (!modal) {
            console.warn("customConfirmModal not found, resolving true");
            resolve(true);
            return;
          }
          const titleEl = document.getElementById('customConfirmTitle');
          const msgEl = document.getElementById('customConfirmMessage');
          const btnCancel = document.getElementById('btnConfirmCancel');
          const btnProceed = document.getElementById('btnConfirmProceed');
          const iconEl = document.getElementById('customConfirmIcon');
          const iconWrap = document.getElementById('customConfirmIconWrap');
          
          if (titleEl) titleEl.textContent = title;
          if (msgEl) msgEl.textContent = message;
          if (btnProceed) {
            btnProceed.textContent = proceedText;
            btnProceed.style.background = proceedColor;
            btnProceed.style.boxShadow = `0 4px 6px -1px ${proceedColor}40`;
          }
          if (iconEl) iconEl.textContent = icon;
          if (iconWrap) {
            iconWrap.style.background = iconBg;
            iconWrap.style.borderColor = iconBorder;
          }
          
          console.log("Opening custom confirm modal...");
          modal.style.display = 'flex';
          modal.style.pointerEvents = 'auto'; // Kích hoạt sự kiện click tuyệt đối trực tiếp bằng JS
          const childDiv = modal.querySelector('div');
          requestAnimationFrame(() => {
            modal.style.opacity = '1';
            if (childDiv) childDiv.style.transform = 'scale(1)';
          });
          
          const cleanup = (value) => {
            console.log("Cleaning up custom confirm. Value selected: " + value);
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none'; // Vô hiệu hóa click khi đóng modal
            if (childDiv) childDiv.style.transform = 'scale(0.9)';
            if (btnCancel) btnCancel.onclick = null;
            if (btnProceed) btnProceed.onclick = null;
            setTimeout(() => {
              modal.style.display = 'none';
              resolve(value);
            }, 250);
          };
          
          if (btnCancel) {
            btnCancel.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              cleanup(false);
            };
          }
          if (btnProceed) {
            btnProceed.onclick = (e) => {
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
              cleanup(true);
            };
          }
        });
      }
      window.showCustomConfirm = showCustomConfirm;

      // Khởi tạo theme tức thì để tránh giật lag nhấp nháy giao diện
      (function() {
        const savedTheme = localStorage.getItem('app-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
      })();

      // Khai báo các biến trạng thái toàn cục trước để tránh lỗi TDZ (Temporal Dead Zone)
      function checkAdminLoginStatus() {
        try {
          const raw = localStorage.getItem('admin_login_session');
          if (!raw) return false;
          const data = JSON.parse(raw);
          if (!data || !data.timestamp) return false;
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - data.timestamp > thirtyDays) {
            localStorage.removeItem('admin_login_session');
            return false;
          }
          return true;
        } catch (e) {
          return false;
        }
      }
      window.checkAdminLoginStatus = checkAdminLoginStatus;

      let isAdminLoggedIn = checkAdminLoginStatus();
      if (isAdminLoggedIn) {
        try {
          document.cookie = "admin_logged_in=true; path=/; max-age=" + (30 * 86400) + "; SameSite=Lax; Secure";
        } catch (e) {}
      }
      let supabaseUrl = localStorage.getItem("supabase_url") || "";
      let supabaseAnonKey = localStorage.getItem("supabase_anon_key") || "";
      let isSupabaseConnected = false;
      const supabaseTable = "properties_hometea";
      let supabaseHasViewsColumn = true;
      const cardImageIndexes = {};
      let currentFilteredProducts = [];
      let displayedProductLimit = 12;

      function getPropertyEffectiveTime(p) {
        if (!p) return 0;
        const tUp = p.updated_at || p.updatedAt ? new Date(p.updated_at || p.updatedAt).getTime() : 0;
        const tCr = p.created_at || p.createdAt ? new Date(p.created_at || p.createdAt).getTime() : 0;
        const maxTime = Math.max(isNaN(tUp) ? 0 : tUp, isNaN(tCr) ? 0 : tCr);
        if (maxTime > 0) return maxTime;
        const numId = parseInt(p.id) || 0;
        return numId > 1000000000 ? numId * 1000 : numId;
      }
      window.getPropertyEffectiveTime = getPropertyEffectiveTime;

      function formatFloors(floors) {
        if (floors === undefined || floors === null) return "Đất trống";
        const val = parseInt(floors);
        if (isNaN(val)) return floors || 'Đất trống';
        if (val === 0) return "Đất trống";
        if (val === 1) return "Cấp 4";
        return `${val} tầng`;
      }

      function cleanImageUrlsList(input) {
        if (!input) return [];
        let rawItems = [];
        if (Array.isArray(input)) {
          rawItems = input;
        } else if (typeof input === 'string') {
          const trimmed = input.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const p = JSON.parse(trimmed);
              if (Array.isArray(p)) rawItems = p;
              else rawItems = [trimmed];
            } catch (e) {
              rawItems = [trimmed];
            }
          } else {
            rawItems = [trimmed];
          }
        }
        const cleaned = [];
        const seenNormalized = new Set();
        for (const it of rawItems) {
          if (!it) continue;
          if (typeof it === 'string') {
            const s = it.trim();
            if (s.startsWith('[') && s.endsWith(']')) {
              try {
                const sub = JSON.parse(s);
                if (Array.isArray(sub)) {
                  for (const subItem of sub) {
                    if (subItem && typeof subItem === 'string' && subItem.trim() !== '') {
                      const cleanSub = subItem.trim().replace(/^http:\/\//i, 'https://').split('?')[0].replace(/\/+$/, '');
                      if (!seenNormalized.has(cleanSub)) {
                        seenNormalized.add(cleanSub);
                        cleaned.push(subItem.trim());
                      }
                    }
                  }
                  continue;
                }
              } catch (e) {}
            }
            if (s !== '') {
              const cleanS = s.replace(/^http:\/\//i, 'https://').split('?')[0].replace(/\/+$/, '');
              if (!seenNormalized.has(cleanS)) {
                seenNormalized.add(cleanS);
                cleaned.push(s);
              }
            }
          }
        }
        return cleaned.filter(url => 
          typeof url === 'string' && 
          url.trim() !== '' && 
          !url.trim().startsWith('[') && 
          !url.trim().startsWith('{')
        );
      }
      window.cleanImageUrlsList = cleanImageUrlsList;

      function createSlug(title) {
        // Bảng chuyển đổi tiếng Việt có dấu → không dấu
        const map = {
          'à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ': 'a',
          'è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ': 'e',
          'ì|í|ị|ỉ|ĩ': 'i',
          'ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ': 'o',
          'ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ': 'u',
          'ỳ|ý|ỵ|ỷ|ỹ': 'y',
          'đ': 'd',
          'À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ': 'a',
          'È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ': 'e',
          'Ì|Í|Ị|Ỉ|Ĩ': 'i',
          'Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ': 'o',
          'Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ': 'u',
          'Ỳ|Ý|Ỵ|Ỷ|Ỹ': 'y',
          'Đ': 'd'
        };
        let str = title || '';
        if (typeof str !== 'string') {
          str = String(str);
        }
        for (const [pattern, replacement] of Object.entries(map)) {
          str = str.replace(new RegExp(pattern, 'g'), replacement);
        }
        return str
          .replace(/[^\w\s-]/g, '')   // bỏ ký tự đặc biệt và emoji
          .replace(/[\s_]+/g, '-')    // khoảng trắng → gạch ngang
          .replace(/-+/g, '-')        // nhiều gạch liên tiếp → 1 gạch
          .replace(/^-+|-+$/g, '')    // bỏ gạch đầu/cuối
          .toLowerCase();
      }

      function getPublicDisplayAddress(p) {
        if (!p) return "";
        let streetVal = p.street ? p.street.trim() : "";
        let wardVal = p.ward ? p.ward.trim() : "";
        if (streetVal !== "" || wardVal !== "") {
          let parts = [];
          if (streetVal !== "") {
            parts.push(streetVal);
          }
          if (wardVal !== "") {
            let w = wardVal;
            if (!w.toLowerCase().startsWith("phường")) {
              w = "Phường " + w;
            }
            parts.push(w);
          }
          parts.push("TP. Thủ Đức, TP.HCM");
          return parts.join(", ");
        }
        let addr = p.address || "";
        let hn = (p.houseNumber || p.house_number || "").trim();
        if (hn !== "") {
          let regex = new RegExp("^" + hn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*,?\\s*", "i");
          addr = addr.replace(regex, "");
        }
        return addr || "TP. Thủ Đức, TP.HCM";
      }

      /* ==========================================
         1. DỮ LIỆU SẢN PHẨM MẪU CHẤT LƯỢNG CAO (MẢNG CƠ SỞ)
         ========================================== */
      const initialDefaultData = [];

      // Cơ chế tự động giải phóng cache khi hệ thống cập nhật phiên bản mới
      const APP_CACHE_VERSION = "v3.3";
      const savedVersion = localStorage.getItem("app_cache_version");
      if (savedVersion !== APP_CACHE_VERSION) {
        localStorage.removeItem("property_data"); // Xóa cache dữ liệu cũ để cập nhật mới sạch sẽ
        localStorage.setItem("app_cache_version", APP_CACHE_VERSION);
      }

      let propertyData = JSON.parse(localStorage.getItem('property_data'));
      if (!Array.isArray(propertyData) || propertyData.length === 0) {
        propertyData = [...initialDefaultData];
      }
      
      // Khắc phục an toàn: Chuyển đổi toàn bộ các mã ID lớn hơn giới hạn Integer 2147483647 về dạng giây an toàn
      propertyData.forEach(p => {
        if (p && p.id && parseInt(p.id) > 2147483647) {
          const oldId = p.id;
          p.id = Math.floor(parseInt(p.id) / 1000);
          console.log(`Đã chuẩn hóa ID lớn ${oldId} thành ID an toàn ${p.id}`);
        }
        if (p && !p.publish_status && !p.publishStatus) {
          if (p.badge && /bản\s*nháp/i.test(p.badge)) {
            p.publish_status = 'draft';
            p.publishStatus = 'draft';
          } else {
            p.publish_status = 'published';
            p.publishStatus = 'published';
          }
        }
      });
      
      const startLocalViews = JSON.parse(localStorage.getItem('local_property_views') || '{}');
      const startPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
      propertyData.forEach(p => {
        if (p && p.id && startLocalViews[p.id]) {
          p.views = Math.max(p.views || 0, startLocalViews[p.id]);
        }
        if (p && p.id && startPriceReductions[p.id]) {
          p.priceReducedAt = startPriceReductions[p.id];
        }
      });
      let lastSavedPropertyId = null;
      let currentHomeTab = 'all';
      let currentAdminSubTab = 'selling';



      function savePropertyDataToStorage() {
        if (typeof invalidateDuplicateCache === 'function') {
          invalidateDuplicateCache();
        }
        try {
          localStorage.setItem('property_data', JSON.stringify(propertyData));
        } catch (e) {
          console.warn("LocalStorage quota exceeded! Trying to save light fallback version to conserve space...", e);
          try {
            const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='%230c1524'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%23f97316' font-weight='bold'>THANH TRA BDS</text></svg>";
            const lighterData = propertyData.map(item => {
              const copy = { ...item };
              if (copy.img && copy.img.startsWith('data:image/')) {
                copy.img = placeholderSvg;
              }
              if (Array.isArray(copy.imgList)) {
                copy.imgList = copy.imgList.map(imgStr => {
                  if (imgStr && imgStr.startsWith('data:image/')) {
                    return placeholderSvg;
                  }
                  return imgStr;
                });
              } else if (typeof copy.imgList === 'string' && copy.imgList.startsWith('data:image/')) {
                copy.imgList = placeholderSvg;
              }
              return copy;
            });
            localStorage.setItem('property_data', JSON.stringify(lighterData));
            console.log("Successfully saved lightweight backup of properties to LocalStorage.");
          } catch (innerError) {
            console.error("Critical: Storage space severely constrained. Removing property cache completely to avoid application freeze.", innerError);
            try {
              localStorage.removeItem('property_data');
            } catch (rErr) {}
          }
        }
      }

      async function autoMigrateBase64Properties() {
        let hasChanges = false;
        for (let i = 0; i < propertyData.length; i++) {
          const item = propertyData[i];
          let itemChanged = false;
          
          if (item.img && typeof item.img === 'string' && item.img.startsWith('data:image/') && item.img.includes(';base64,')) {
            console.log(`Đang re-upload ảnh chính base64 của tin ${item.id} (${item.title || ""})...`);
            const secureUrl = await uploadBase64ToCloudinary(item.img);
            if (secureUrl) {
              item.img = secureUrl;
              itemChanged = true;
            }
          }
          
          if (Array.isArray(item.imgList)) {
            const newList = [];
            let listChanged = false;
            for (let j = 0; j < item.imgList.length; j++) {
              const url = item.imgList[j];
              if (url && typeof url === 'string' && url.startsWith('data:image/') && url.includes(';base64,')) {
                console.log(`Đang re-upload ảnh con #${j+1} base64 của tin ${item.id}...`);
                const secureUrl = await uploadBase64ToCloudinary(url);
                if (secureUrl) {
                  newList.push(secureUrl);
                  listChanged = true;
                } else {
                  newList.push(url);
                }
              } else {
                newList.push(url);
              }
            }
            if (listChanged) {
              item.imgList = newList;
              itemChanged = true;
            }
          }
          
          if (itemChanged) {
            hasChanges = true;
            if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
              try {
                const bodyPayload = {
                  id: item.id,
                  title: item.title,
                  price: item.price,
                  price_text: item.priceText,
                  ward: item.ward,
                  direction: item.direction,
                  floors: item.floors,
                  badge: item.badge,
                  address: item.address,
                  img: item.img,
                  img_list: JSON.stringify(item.imgList),
                  desc: item.desc,
                  area: item.area,
                  house_number: item.houseNumber,
                  street: item.street,
                  width: item.width,
                  bedrooms: item.bedrooms,
                  bathrooms: item.bathrooms,
                  legal: item.legal,
                  views: item.views
                };

                if (!supabaseHasViewsColumn) {
                  delete bodyPayload.views;
                }

                const url = `${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${item.id}`;
                await fetch(url, {
                  method: 'PATCH',
                  headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify(bodyPayload)
                });
                console.log(`Đã đồng bộ tin ${item.id} sau khi dọn dẹp base64 lên Supabase.`);
              } catch (err) {
                console.error(`Không thể đồng bộ tin ${item.id} lên Supabase:`, err);
              }
            }
          }
        }
        
        if (hasChanges) {
          savePropertyDataToStorage();
          applyFilters();
          renderAdminTable();
          console.log("Đã tự động rà soát & dọn dẹp dữ liệu ảnh cũ dạng base64 thành công.");
        }
      }

      /* ==========================================
         2. BỘ LỌC TÌM KIẾM SẢN PHẨM REALTIME (KHÔNG LOAD LẠI TRANG)
         ========================================== */
      const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
      const filterCollapsibleContent = document.getElementById('filterCollapsibleContent');
      const toggleText = document.getElementById('toggleText');
      const toggleChevron = document.getElementById('toggleChevron');
      const mainSearchKeyword = document.getElementById('mainSearchKeyword');

      function toggleFilters(forceOpen = null) {
        if (!filterCollapsibleContent) return;
        const isOpen = filterCollapsibleContent.classList.contains('expanded');
        const nextState = forceOpen !== null ? forceOpen : !isOpen;

        if (nextState) {
          filterCollapsibleContent.style.maxHeight = "1000px"; // high enough value
          filterCollapsibleContent.classList.add('expanded');
          if (toggleText) toggleText.textContent = "Thu gọn bộ lọc";
          if (toggleChevron) toggleChevron.style.transform = "rotate(180deg)";
        } else {
          filterCollapsibleContent.style.maxHeight = "0px";
          filterCollapsibleContent.classList.remove('expanded');
          if (toggleText) toggleText.textContent = "Bộ lọc nâng cao";
          if (toggleChevron) toggleChevron.style.transform = "rotate(0deg)";
        }
      }

      if (btnToggleAdvanced) {
        btnToggleAdvanced.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFilters();
        });
      }

      const filterKeyword = document.getElementById('filterKeyword');

      // Tự động đồng bộ trường nhập liệu và kích hoạt hiển thị bộ lọc
      if (mainSearchKeyword) {
        mainSearchKeyword.addEventListener('focus', () => {
          toggleFilters(true);
        });
        mainSearchKeyword.addEventListener('input', (e) => {
          if (filterKeyword) {
            filterKeyword.value = e.target.value;
          }
          applyFilters();
        });
      }

      if (filterKeyword) {
        filterKeyword.addEventListener('input', (e) => {
          if (mainSearchKeyword) {
            mainSearchKeyword.value = e.target.value;
          }
          applyFilters();
        });
      }
      const filterWard = document.getElementById('filterWard');
      const filterDirection = document.getElementById('filterDirection');
      const filterAreaMin = document.getElementById('filterAreaMin');
      const filterAreaMax = document.getElementById('filterAreaMax');
      const filterFloorsMin = document.getElementById('filterFloorsMin');
      const filterFloorsMax = document.getElementById('filterFloorsMax');
      const filterStreet = document.getElementById('filterStreet');
      const filterPriceMin = document.getElementById('filterPriceMin');
      const filterPriceMax = document.getElementById('filterPriceMax');
      const productsGrid = document.getElementById('productsGrid');
      const statCountText = document.getElementById('statCountText');
      const btnResetFilters = document.getElementById('btnResetFilters');

      // Hàm hiển thị hiệu ứng skeleton loading khi đang tải sản phẩm từ Cloud
      function renderSkeletons() {
        if (!productsGrid) return;
        productsGrid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
          productsGrid.innerHTML += `
            <div class="skeleton-card">
              <div class="skeleton-image"></div>
              <div class="skeleton-body">
                <style>
                  /* Thêm một số thuộc tính animation phụ trợ trực tiếp nếu cần */
                </style>
                <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
                  <div class="skeleton-line" style="width: 70px; height: 16px; margin-bottom: 0;"></div>
                  <div class="skeleton-line" style="width: 80px; height: 16px; margin-bottom: 0;"></div>
                </div>
                <div class="skeleton-line-title" style="height: 20px;"></div>
                <div class="skeleton-line-paragraph" style="height: 14px;"></div>
                <div class="skeleton-line-paragraph" style="width: 90%; height: 14px;"></div>
                <div class="skeleton-grid">
                  <div class="skeleton-spec" style="height: 14px;"></div>
                  <div class="skeleton-spec" style="height: 14px;"></div>
                  <div class="skeleton-spec" style="height: 14px;"></div>
                  <div class="skeleton-spec" style="height: 14px;"></div>
                </div>
                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div class="skeleton-line" style="width: 100px; height: 20px; margin-bottom: 0;"></div>
                  <div class="skeleton-line" style="width: 60px; height: 20px; margin-bottom: 0;"></div>
                </div>
              </div>
            </div>
          `;
        }
      }

      // Hàm sao chép liên kết chia sẻ của từng sản phẩm chứa mã căn ?id=X
      function fallbackCopyText(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            showToast('Đã sao chép liên kết chia sẻ của căn này!', true);
          } else {
            showToast('Không tự động sao chép được liên kết!', false);
          }
        } catch (err) {
          showToast('Có lỗi xảy ra khi sao chép liên kết!', false);
        }
        document.body.removeChild(textArea);
      }

      function copyShareLink(id) {
        try {
          const p = propertyData.find(item => String(item.id) === String(id));
          const slug = p ? createSlug(p.title) : '';
          const shareUrl = slug ? `https://thanhtrabds.vercel.app/chitiet/${id}-${slug}` : `https://thanhtrabds.vercel.app/chitiet?id=${id}`;
          
          // Ghi nhận lượt chia sẻ
          try {
            const shares = JSON.parse(localStorage.getItem('local_shares') || '{"fb":0,"zalo":0,"copy":4}');
            shares.copy = (shares.copy || 0) + 1;
            localStorage.setItem('local_shares', JSON.stringify(shares));
            const nameStr = p ? p.title : `ID: ${id}`;
            logSystemActivity('SHARE', `Người dùng sao chép liên kết chia sẻ nhà phố: "${nameStr.substring(0, 30)}..."`);
          } catch (errShare) {
            console.error("Lỗi ghi nhận share:", errShare);
          }

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
              showToast('Đã sao chép liên kết chia sẻ của căn này!', true);
            }).catch(() => {
              fallbackCopyText(shareUrl);
            });
          } else {
            fallbackCopyText(shareUrl);
          }
        } catch (e) {
          console.error(e);
          showToast('Có lỗi xảy ra khi sao chép liên kết!', false);
        }
      }

      // Hàm tối ưu hóa URL hình ảnh từ Cloudinary dynamically ở phía client-side
      function getOptimizedCloudinaryUrl(url, width, height, watermark = false) {
        if (!url) return "";
        if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
          const params = ["f_auto", "q_auto"];
          if (width) params.push(`w_${width}`);
          if (height) {
            params.push(`h_${height}`);
            params.push("c_fill");
          } else if (width) {
            params.push("c_limit");
          }

          let transformStr = params.join(",");
          if (watermark) {
            transformStr += "/l_thanhtra-watermark,w_0.3,fl_relative,o_60,g_south,y_15,fl_layer_apply";
          }

          return url.replace("/image/upload/", `/image/upload/${transformStr}/`);
        }
        if (url.includes("images.unsplash.com")) {
          try {
            const urlObj = new URL(url);
            urlObj.searchParams.set("auto", "format");
            urlObj.searchParams.set("fm", "webp");
            urlObj.searchParams.set("q", "75");
            if (width) urlObj.searchParams.set("w", String(width));
            if (height) {
              urlObj.searchParams.set("h", String(height));
              urlObj.searchParams.set("fit", "crop");
            }
            return urlObj.toString();
          } catch(e) {
            return url;
          }
        }
        return url;
      }

      function getEffectiveTime(p) {
        if (!p) return 0;
        const d = p.published_at || p.publishedAt || p.created_at || p.createdAt;
        if (!d) return 0;
        const t = new Date(d).getTime();
        return isNaN(t) ? 0 : t;
      }
      window.getEffectiveTime = getEffectiveTime;

      function universalSortProperties(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr.sort((a, b) => {
          const timeA = getEffectiveTime(a);
          const timeB = getEffectiveTime(b);
          if (timeB !== timeA) return timeB - timeA;
          return 0;
        });
      }
      window.universalSortProperties = universalSortProperties;

      function isNewListing(p) {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const d = p.created_at || p.createdAt ? new Date(p.created_at || p.createdAt).getTime() : 0;
        return d > 0 && (Date.now() - d) <= threeDaysMs;
      }
      window.isNewListing = isNewListing;

      // Hàm hiển thị sản phẩm lên trang
      function renderProducts(products, resetPagination = true) {
        if (resetPagination) {
          displayedProductLimit = 12;
        }

        // Sắp xếp các sản phẩm theo Tab điều hướng đang kích hoạt
        const sortedProducts = [...products];
        if (currentHomeTab === 'views') {
          sortedProducts.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else {
          universalSortProperties(sortedProducts);
          if (currentHomeTab === 'discount') {
            sortedProducts.sort((a, b) => {
              const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
              const aReduced = a.isPriceReduced && a.priceUpdatedAt && (Date.now() - new Date(a.priceUpdatedAt).getTime()) < twoDaysMs;
              const bReduced = b.isPriceReduced && b.priceUpdatedAt && (Date.now() - new Date(b.priceUpdatedAt).getTime()) < twoDaysMs;
              if (aReduced && !bReduced) return -1;
              if (!aReduced && bReduced) return 1;
              return 0;
            });
          }
        }

        currentFilteredProducts = sortedProducts;
        productsGrid.innerHTML = '';
        
        // Cập nhật số lượng sản phẩm đang lọc được ngay trên thanh filter
        const filterResultCountText = document.getElementById('filterResultCountText');
        if (filterResultCountText) {
          filterResultCountText.textContent = sortedProducts.length;
        }

        // Tính toán lượt xem cao nhất để gắn nhãn "Xem nhiều nhất"
        const maxViewsVal = propertyData && propertyData.length > 0 
          ? Math.max(...propertyData.map(item => item.views || 0)) 
          : 0;
        
        const btnLoadMore = document.getElementById('btnLoadMore');
        
        if (sortedProducts.length === 0) {
          let emptyText = "Rất tiếc! Không có sản phẩm nào phù hợp với bộ lọc tìm kiếm hiện tại.";
          let resetBtnHtml = `<button onclick="resetAllFilters()" class="btn-reset-filters">Đặt lại bộ lọc tìm kiếm</button>`;
          if (currentHomeTab === 'new' || currentHomeTab === 'discount') {
            emptyText = "Hiện chưa có tin mới/giảm giá trong thời gian gần đây";
            resetBtnHtml = "";
          }
          productsGrid.innerHTML = `
            <div class="empty-state">
              <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color: var(--text-muted); margin-bottom: 12px; display: inline-block;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>${emptyText}</p>
              ${resetBtnHtml}
            </div>
          `;
          if (statCountText) {
            statCountText.textContent = `Hiển thị 0 trong tổng số ${propertyData.length} sản phẩm`;
          }
          if (btnLoadMore) btnLoadMore.style.display = 'none';
          return;
        }

        const visibleProducts = sortedProducts.slice(0, displayedProductLimit);

        if (statCountText) {
          statCountText.textContent = `Hiển thị 1-${visibleProducts.length} trong tổng số ${sortedProducts.length} sản phẩm (Tổng kho: ${propertyData.length})`;
        }

        if (btnLoadMore) {
          if (sortedProducts.length > displayedProductLimit) {
            btnLoadMore.style.display = 'inline-flex';
          } else {
            btnLoadMore.style.display = 'none';
          }
        }

        const cardsHtmlList = visibleProducts.map((p, idx) => renderSingleProductCard(p, idx, maxViewsVal));
        productsGrid.innerHTML = cardsHtmlList.join('');
      }

      function renderSingleProductCard(p, idx, maxViewsVal) {
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
        const sliderNavHtml = hasMultipleImages ? `
          <button class="card-slider-nav prev" aria-label="Xem ảnh trước" onclick="changeCardImage('${p.id}', -1, event)">&#10094;</button>
          <button class="card-slider-nav next" aria-label="Xem ảnh tiếp theo" onclick="changeCardImage('${p.id}', 1, event)">&#10095;</button>
          <span class="card-slider-badge">${currentImgIndex + 1}/${list.length}</span>
        ` : '';
                
        const viewsCount = p.views !== undefined ? p.views : 0;
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const pubTime = p.published_at || p.publishedAt ? new Date(p.published_at || p.publishedAt).getTime() : 0;
        const isNew = pubTime > 0 && (now - pubTime) <= threeDaysMs;

        const oldPVal = parseFloat(p.oldPrice || p.gia_cu) || 0;
        const currPVal = parseFloat(p.price) || 0;
        const redTime = (p.isPriceReduced || p.is_price_reduced) && oldPVal > 0 && currPVal < oldPVal && (p.priceUpdatedAt || p.price_updated_at) ? new Date(p.priceUpdatedAt || p.price_updated_at).getTime() : 0;
        const isReduced = redTime > 0 && (now - redTime) <= twoDaysMs;

        let priceDisplayHtml = `<span>${currPVal} tỷ</span>`;
        if (isReduced) {
          const diffVnd = Math.round(oldPVal * 1e9) - Math.round(currPVal * 1e9);
          const diffBillion = Math.round((diffVnd / 1e9) * 100) / 100;
          const percent = oldPVal > 0 ? Math.round(((diffVnd / Math.round(oldPVal * 1e9)) * 100) * 100) / 100 : 0;
          
          priceDisplayHtml = `
            <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85em; margin-right: 4px;">${oldPVal} tỷ</span>
            <span style="color: var(--price-color); font-weight: bold; font-size: 1.1em;">${currPVal} tỷ</span>
          `;
        }

        let giamXBadgeHtml = '';
        if (isReduced) {
          const diffVnd = Math.round(oldPVal * 1e9) - Math.round(currPVal * 1e9);
          const diffBillion = Math.round((diffVnd / 1e9) * 100) / 100;
          const percent = oldPVal > 0 ? Math.round(((diffVnd / Math.round(oldPVal * 1e9)) * 100) * 100) / 100 : 0;
          giamXBadgeHtml = `<span class="card-badge-item" style="background: var(--bg-badge-reduced, rgba(239, 68, 68, 0.15)); color: var(--text-badge-reduced, #dc2626); border: 1px solid var(--border-badge-reduced, #fca5a5); font-weight: 700;">📉 Giảm ${diffBillion} tỷ (${percent}%)</span>`;
        }

        const isFeatured = p.is_featured === true || p.is_featured === 'true';
        let badgeNoibatHtml = '';
        if (isFeatured) {
          badgeNoibatHtml = `<div class="badge-noibat">⭐ NỔI BẬT</div>`;
        }
        const pSlug = createSlug(p.title);
        const pUrl = `/chitiet/${p.id}-${pSlug}`;
        return `
          <article class="product-card" id="prop-${p.id}" style="cursor: pointer; display: flex; flex-direction: column;" onclick="openProductModal('${p.id}', event)">
            <!-- Slider hình ảnh -->
            <a href="${pUrl}" onclick="openProductModal('${p.id}', event)" style="display: block; text-decoration: none; color: inherit; width: 100%;">
              <div class="card-slider-container">
                ${badgeNoibatHtml}
                <img class="card-slider-img" width="380" height="240" src="${activeImgSrcOptimized}" alt="${p.title}" ${loadingAttr} onload="this.style.opacity=1" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22800%22%20height=%22600%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%230c1524%22/%3E%3Ctext%20x=%2250%25%22%20y=%2250%25%22%20dominant-baseline=%22middle%22%20text-anchor=%22middle%22%20font-family=%22system-ui%22%20font-size=%2222%22%20font-weight=%22bold%22%20fill=%22%23f97316%22%3EThanh%20Tr%C3%A0%20B%C4%90S%3C/text%3E%3C/svg%3E'; this.style.opacity=1;">
                ${sliderNavHtml}
              </div>
            </a>
                        
            <!-- Thân card -->
            <div class="product-body" style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
              <!-- Hàng Badge mới -->
              <div class="card-badges-row">
                ${isNew ? '<span class="card-badge-item card-badge-new">🔥 Mới đăng</span>' : ''}
                ${isReduced ? '<span class="card-badge-item card-badge-discount">📉 Giảm giá</span>' : ''}
                ${giamXBadgeHtml}
                <span class="card-badge-item card-badge-views">👁️ ${viewsCount} lượt xem</span>
                ${viewsCount > 0 && viewsCount === maxViewsVal ? '<span class="card-badge-item card-badge-popular">👑 Xem nhiều nhất</span>' : ''}
              </div>
              
              <h3 class="card-title-upper" title="${p.title}" style="height: auto; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px;">
                <a href="${pUrl}" onclick="openProductModal('${p.id}', event)" style="color: inherit; text-decoration: none; display: block;">${p.title.toUpperCase()}</a>
              </h3>
                            
              <div class="card-address-full" style="display: flex; align-items: flex-start; gap: 5px; margin-bottom: 6px; font-size: 13px; color: var(--text-dark);" title="${getPublicDisplayAddress(p)}">
                <span style="color: #ef4444; font-size: 14px; flex-shrink: 0; margin-top: 1px;">📍</span>
                <span style="font-weight: 500; font-family: var(--font-sans); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${getPublicDisplayAddress(p)}</span>
              </div>

              <!-- Thông số BDS -->
              <div class="card-specs-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12.5px; color: var(--text-muted); flex-wrap: wrap;">
                ${p.area ? `<span>📐 <strong>${p.area}m²</strong></span>` : ''}
                ${p.bedrooms ? `<span>🛏️ <strong>${p.bedrooms} PN</strong></span>` : ''}
                ${p.bathrooms ? `<span>🚿 <strong>${p.bathrooms} WC</strong></span>` : ''}
                ${p.direction ? `<span>🧭 <strong>${p.direction}</strong></span>` : ''}
              </div>

              <!-- Giá và nút xem chi tiết -->
              <div class="card-footer-row" style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; pt-2; border-top: 1px solid var(--border);">
                <div class="card-price-display" style="display: flex; align-items: baseline;">
                  ${priceDisplayHtml}
                </div>
                <button type="button" class="card-detail-btn" onclick="openProductModal('${p.id}', event)">Xem chi tiết</button>
              </div>
            </div>
          </article>
        `;
      }
      
      function applyFilters() {
        const keyword = filterKeyword ? filterKeyword.value.toLowerCase().trim() : '';
        const ward = filterWard ? filterWard.value : 'all';
        const direction = filterDirection ? filterDirection.value : 'all';
        const street = filterStreet ? filterStreet.value.toLowerCase().trim() : '';
                
        const areaMin = filterAreaMin && filterAreaMin.value !== '' ? parseFloat(filterAreaMin.value) : null;
        const areaMax = filterAreaMax && filterAreaMax.value !== '' ? parseFloat(filterAreaMax.value) : null;
                
        const floorsMin = filterFloorsMin && filterFloorsMin.value !== '' ? parseInt(filterFloorsMin.value) : null;
        const floorsMax = filterFloorsMax && filterFloorsMax.value !== '' ? parseInt(filterFloorsMax.value) : null;
                
        const priceMin = filterPriceMin && filterPriceMin.value !== '' ? parseFloat(filterPriceMin.value) : null;
        const priceMax = filterPriceMax && filterPriceMax.value !== '' ? parseFloat(filterPriceMax.value) : null;

        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        let filtered = propertyData.filter(p => {
          const isDraft = (p.publish_status === 'draft' || p.publishStatus === 'draft' || (p.badge && /bản\s*nháp/i.test(p.badge)));
          const isPublished = (p.publish_status === 'published' || p.publishStatus === 'published');
          if (p.isSold || isDraft || !isPublished) {
            return false;
          }

          const pubTime = p.published_at || p.publishedAt ? new Date(p.published_at || p.publishedAt).getTime() : 0;
          const isNew3Days = pubTime > 0 && (now - pubTime) <= threeDaysMs;

          const redTime = (p.isPriceReduced || p.is_price_reduced) && p.oldPrice !== undefined && p.oldPrice !== null && p.price < p.oldPrice && (p.priceUpdatedAt || p.price_updated_at) ? new Date(p.priceUpdatedAt || p.price_updated_at).getTime() : 0;
          const isReduced2Days = redTime > 0 && (now - redTime) <= twoDaysMs;

          if (currentHomeTab === 'new') {
            if (!isNew3Days) return false;
          } else if (currentHomeTab === 'discount') {
            if (!isReduced2Days) return false;
          }

          if (ward !== 'all' && p.ward !== ward) {
            return false;
          }
          if (direction !== 'all' && p.direction !== direction) {
            return false;
          }
          const pArea = parseFloat(p.area);
          if (areaMin !== null && pArea < areaMin) return false;
          if (areaMax !== null && pArea > areaMax) return false;
          const pFloors = parseInt(p.floors);
          if (floorsMin !== null && pFloors < floorsMin) return false;
          if (floorsMax !== null && pFloors > floorsMax) return false;
          const pPrice = parseFloat(p.price);
          if (priceMin !== null && pPrice < priceMin) return false;
          if (priceMax !== null && pPrice > priceMax) return false;
          if (street) {
            const propStreet = (p.street || '').toLowerCase();
            const propAddr = (p.address || '').toLowerCase();
            if (!propStreet.includes(street) && !propAddr.includes(street)) {
              return false;
            }
          }
          if (keyword) {
            const propTitle = (p.title || '').toLowerCase();
            const propDesc = (p.desc || '').toLowerCase();
            const propAddr = (p.address || '').toLowerCase();
            if (!propTitle.includes(keyword) && !propDesc.includes(keyword) && !propAddr.includes(keyword)) {
              return false;
            }
          }
          return true;
        });

        if (currentHomeTab === 'views') {
          filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else if (currentHomeTab === 'discount') {
          filtered.sort((a, b) => {
            const tA = a.priceUpdatedAt || a.price_updated_at ? new Date(a.priceUpdatedAt || a.price_updated_at).getTime() : 0;
            const tB = b.priceUpdatedAt || b.price_updated_at ? new Date(b.priceUpdatedAt || b.price_updated_at).getTime() : 0;
            return tB - tA;
          });
        } else if (currentHomeTab === 'new') {
          filtered.sort((a, b) => {
            const tA = a.published_at || a.publishedAt ? new Date(a.published_at || a.publishedAt).getTime() : 0;
            const tB = b.published_at || b.publishedAt ? new Date(b.published_at || b.publishedAt).getTime() : 0;
            return tB - tA;
          });
        } else {
          filtered.sort((a, b) => {
            const aPub = a.published_at || a.publishedAt ? new Date(a.published_at || a.publishedAt).getTime() : 0;
            const aRed = (a.isPriceReduced || a.is_price_reduced) && a.oldPrice !== undefined && a.oldPrice !== null && a.price < a.oldPrice && (a.priceUpdatedAt || a.price_updated_at) ? new Date(a.priceUpdatedAt || a.price_updated_at).getTime() : 0;
            const aMax = Math.max((now - aPub <= threeDaysMs ? aPub : 0), (now - aRed <= twoDaysMs ? aRed : 0));

            const bPub = b.published_at || b.publishedAt ? new Date(b.published_at || b.publishedAt).getTime() : 0;
            const bRed = (b.isPriceReduced || b.is_price_reduced) && b.oldPrice !== undefined && b.oldPrice !== null && b.price < b.oldPrice && (b.priceUpdatedAt || b.price_updated_at) ? new Date(b.priceUpdatedAt || b.price_updated_at).getTime() : 0;
            const bMax = Math.max((now - bPub <= threeDaysMs ? bPub : 0), (now - bRed <= twoDaysMs ? bRed : 0));

            return bMax - aMax;
          });
        }

        renderProducts(filtered);
        if (typeof renderFeaturedProducts === 'function') {
          renderFeaturedProducts(true);
        }
        if (typeof renderPublicMarketPriceTable === 'function') {
          renderPublicMarketPriceTable();
        }
      }
      window.applyFilters = applyFilters;
      window.toggleFilters = toggleFilters;

      
      let currentModalImgIndex = 0;
      let currentModalImgList = [];
      function slideModalImg(direction) {
        if (!currentModalImgList || currentModalImgList.length <= 1) return;
        currentModalImgIndex = (currentModalImgIndex + direction + currentModalImgList.length) % currentModalImgList.length;
        const imgEl = document.getElementById('modalMainImg');
        if (imgEl) {
          imgEl.src = getOptimizedCloudinaryUrl(currentModalImgList[currentModalImgIndex], 800, 600, false);
        }
        const badgeEl = document.getElementById('modalImgBadge');
        if (badgeEl) {
          badgeEl.textContent = `${currentModalImgIndex + 1}/${currentModalImgList.length}`;
        }
      }
      function setModalImgIndex(index) {
        if (!currentModalImgList || index < 0 || index >= currentModalImgList.length) return;
        currentModalImgIndex = index;
        const imgEl = document.getElementById('modalMainImg');
        if (imgEl) {
          imgEl.src = getOptimizedCloudinaryUrl(currentModalImgList[currentModalImgIndex], 800, 600, false);
        }
        const badgeEl = document.getElementById('modalImgBadge');
        if (badgeEl) {
          badgeEl.textContent = `${currentModalImgIndex + 1}/${currentModalImgList.length}`;
        }
      }

      window.slideModalImg = slideModalImg;
      window.setModalImgIndex = setModalImgIndex;
      
      function handleRealImagesUpload(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        if (!window.uploadedImagesList) window.uploadedImagesList = [];
        for (const file of files) {
          const reader = new FileReader();
          reader.onload = (event) => {
            window.uploadedImagesList.push(event.target.result);
            if (typeof renderUploadedImagesPreviews === 'function') renderUploadedImagesPreviews();
          };
          reader.readAsDataURL(file);
        }
      }
      function removeUploadedImage(index) {
        if (window.uploadedImagesList && index >= 0 && index < window.uploadedImagesList.length) {
          window.uploadedImagesList.splice(index, 1);
          if (typeof renderUploadedImagesPreviews === 'function') renderUploadedImagesPreviews();
        }
      }
      function openSaveSuccessModal() {
        const modal = document.getElementById('saveSuccessModal');
        if (modal) modal.style.display = 'flex';
      }
      function closeSaveSuccessModal() {
        const modal = document.getElementById('saveSuccessModal');
        if (modal) modal.style.display = 'none';
      }
      function handleSaveSuccessChoice(choice) {
        closeSaveSuccessModal();
        if (choice === 'new') {
          if (typeof showAdminForm === 'function') showAdminForm(null);
        } else if (choice === 'list') {
          if (typeof hideAdminForm === 'function') hideAdminForm();
        }
      }
      async function uploadFastImagesCloud() {
        showToast("Đang tải ảnh lên Cloud...", true);
      }

      window.handleRealImagesUpload = handleRealImagesUpload;
      window.removeUploadedImage = removeUploadedImage;
      window.openSaveSuccessModal = openSaveSuccessModal;
      window.closeSaveSuccessModal = closeSaveSuccessModal;
      window.handleSaveSuccessChoice = handleSaveSuccessChoice;
      window.uploadFastImagesCloud = uploadFastImagesCloud;
      
      function changeCardImage(propertyId, direction, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!cardImageIndexes[propertyId]) {
          cardImageIndexes[propertyId] = 0;
        }
        const p = propertyData.find(item => item.id == propertyId);
        if (!p) return;
        const list = p.imgList && p.imgList.length > 0 ? p.imgList : [p.img];
        if (!list || list.length <= 1) return;
        cardImageIndexes[propertyId] = (cardImageIndexes[propertyId] + direction + list.length) % list.length;
        const cardEl = document.getElementById('prop-' + propertyId);
        if (cardEl) {
          const imgEl = cardEl.querySelector('.card-slider-img');
          const badgeEl = cardEl.querySelector('.card-slider-badge');
          if (imgEl) {
            const newImg = list[cardImageIndexes[propertyId]];
            imgEl.src = getOptimizedCloudinaryUrl(newImg, 380, 240, false);
          }
          if (badgeEl) {
            badgeEl.textContent = `${cardImageIndexes[propertyId] + 1}/${list.length}`;
          }
        }
      }

      window.changeCardImage = changeCardImage;

      function showAdminBulkForm(e) {
        if (e) e.preventDefault();
        const dSec = document.getElementById('adminDashboardSection');
        const bSec = document.getElementById('adminBulkSection');
        if (dSec) dSec.style.display = 'none';
        if (bSec) bSec.style.display = 'block';
      }
      function hideAdminBulkForm(e) {
        if (e) e.preventDefault();
        const dSec = document.getElementById('adminDashboardSection');
        const bSec = document.getElementById('adminBulkSection');
        if (bSec) bSec.style.display = 'none';
        if (dSec) dSec.style.display = 'block';
      }
      function handleFastDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const zone = document.getElementById('fastDropZone');
        if (zone) zone.style.borderColor = 'var(--primary)';
      }
      function handleFastDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const zone = document.getElementById('fastDropZone');
        if (zone) zone.style.borderColor = 'var(--border)';
      }
      function handleFastDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const zone = document.getElementById('fastDropZone');
        if (zone) zone.style.borderColor = 'var(--border)';
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          processFastFiles(files);
        }
      }
      function handleFastUpload(e) {
        const files = e.target.files;
        if (files && files.length > 0) {
          processFastFiles(files);
        }
      }
      function processFastFiles(files) {
        showToast(`Đã nhận ${files.length} tệp. Đang xử lý...`, true);
      }
      function analyzeFastTextAI() {
        showToast("Đang phân tích văn bản bằng AI...", true);
      }

      window.showAdminBulkForm = showAdminBulkForm;
      window.hideAdminBulkForm = hideAdminBulkForm;
      window.handleFastDragOver = handleFastDragOver;
      window.handleFastDragLeave = handleFastDragLeave;
      window.handleFastDrop = handleFastDrop;
      window.handleFastUpload = handleFastUpload;
      window.processFastFiles = processFastFiles;
      window.analyzeFastTextAI = analyzeFastTextAI;
      
      function fillFormAndOpenFast(e, n) {
        if (typeof showAdminForm === 'function') showAdminForm(null);
        if (e && document.getElementById("formTitle")) document.getElementById("formTitle").value = e.title ? e.title.toUpperCase() : "";
        if (e && document.getElementById("formPrice")) document.getElementById("formPrice").value = e.price || "";
        if (e && document.getElementById("formArea")) document.getElementById("formArea").value = e.area || "";
        if (n && n.length > 0) {
          window.uploadedImagesList = n;
          const d = document.getElementById("formImg");
          if (d) d.value = n[0];
          if (typeof renderUploadedImagesPreviews === 'function') renderUploadedImagesPreviews();
        }
        const bSec = document.getElementById("adminBulkSection");
        if (bSec) bSec.style.display = "none";
        const pArea = document.getElementById("fastProgressArea");
        if (pArea) pArea.style.display = "none";
        showToast("✨ Đã nạp dữ liệu nhanh thành công!", true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      window.fillFormAndOpenFast = fillFormAndOpenFast;

      function copySupabaseSql() {
        const textarea = document.getElementById('supabaseSqlCopyText');
        if (textarea) {
          textarea.select();
          document.execCommand('copy');
          showToast("📋 Đã sao chép câu lệnh SQL vào clipboard!", true);
        } else {
          showToast("📋 Đã sao chép câu lệnh SQL!", true);
        }
      }
      function saveSupabaseSettings() {
        const u = document.getElementById('sb_ur_fld')?.value?.trim() || '';
        const k = document.getElementById('sb_ky_fld')?.value?.trim() || '';
        if (u) localStorage.setItem('supabase_url', u);
        if (k) localStorage.setItem('supabase_anon_key', k);
        supabaseUrl = u;
        supabaseAnonKey = k;
        showToast("💾 Đã lưu cấu hình Supabase!", true);
        testSupabaseConnection(false, true);
      }
      async function testSupabaseConnection(silent = false, loadProps = false) {
        if (!supabaseUrl || !supabaseAnonKey) {
          if (!silent) alert("Vui lòng cấu hình Supabase URL và Anon Key!");
          return false;
        }
        try {
          const res = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?select=id&limit=1`, {
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            }
          });
          if (res.ok) {
            isSupabaseConnected = true;
            if (!silent) showToast("🔌 Kiểm tra kết nối Supabase thành công!", true);
            if (loadProps) fetchPropertiesFromSupabase(true, 100);
            return true;
          } else {
            throw new Error("HTTP " + res.status);
          }
        } catch (err) {
          console.error("Supabase connection error:", err);
          isSupabaseConnected = false;
          if (!silent) alert("Lỗi kết nối Supabase: " + err.message);
          return false;
        }
      }

      async function fetchPropertiesFromSupabase(reset = true, limit = 1000) {
        try {
          if (!supabaseUrl || !supabaseAnonKey) return;
          const url = `${supabaseUrl}/rest/v1/${supabaseTable}?publish_status=eq.published&select=*&limit=${limit}`;
          const res = await fetch(url, {
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            }
          });
          if (!res.ok) throw new Error("HTTP error " + res.status);
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log(`[Supabase] Đã tải ${data.length} tin từ Cloud.`);
            const mapped = data.map(item => ({
              id: item.id,
              title: item.title,
              price: item.price,
              oldPrice: item.old_price || item.oldPrice,
              ward: item.ward,
              direction: item.direction,
              floors: item.floors,
              badge: item.badge,
              address: item.address,
              img: item.img,
              imgList: cleanImageUrlsList(item.img_list || item.imgList || item.img),
              desc: item.desc,
              area: item.area,
              houseNumber: item.house_number || item.houseNumber,
              street: item.street,
              width: item.width,
              bedrooms: item.bedrooms,
              bathrooms: item.bathrooms,
              legal: item.legal,
              views: item.views || 0,
              publish_status: item.publish_status || 'published',
              is_featured: item.is_featured || false,
              created_at: item.created_at || item.createdAt
            }));
            propertyData = mapped;
            savePropertyDataToStorage();
          }
        } catch (err) {
          console.error("[Supabase] Lỗi tải tin từ Cloud:", err);
        }
      }

      async function initSupabaseState() {
        try {
          console.log("đã lấy cấu hình");
          let u = localStorage.getItem('supabase_url') || '';
          let k = localStorage.getItem('supabase_anon_key') || '';
          if (!u || !k) {
            try {
              const cfgRes = await fetch('/api/supabase-config');
              if (cfgRes.ok) {
                const cfg = await cfgRes.json();
                if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
                  u = cfg.supabaseUrl;
                  k = cfg.supabaseAnonKey;
                  localStorage.setItem('supabase_url', u);
                  localStorage.setItem('supabase_anon_key', k);
                }
              }
            } catch (cfgErr) {
              console.warn("Không thể tải cấu hình Supabase từ server:", cfgErr);
            }
          }
          supabaseUrl = u;
          supabaseAnonKey = k;

          console.log("đã tạo client");
          let loadedCount = 0;
          if (supabaseUrl && supabaseAnonKey) {
            try {
              const res = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?publish_status=eq.published&select=*&limit=1000`, {
                headers: {
                  'apikey': supabaseAnonKey,
                  'Authorization': `Bearer ${supabaseAnonKey}`
                }
              });
              if (res.ok) {
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0) {
                  loadedCount = rows.length;
                  console.log(`đã tải ${loadedCount} tin`);
                  const mapped = rows.map(item => ({
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    oldPrice: item.old_price || item.oldPrice,
                    ward: item.ward,
                    direction: item.direction,
                    floors: item.floors,
                    badge: item.badge,
                    address: item.address,
                    img: item.img,
                    imgList: cleanImageUrlsList(item.img_list || item.imgList || item.img),
                    desc: item.desc,
                    area: item.area,
                    houseNumber: item.house_number || item.houseNumber,
                    street: item.street,
                    width: item.width,
                    bedrooms: item.bedrooms,
                    bathrooms: item.bathrooms,
                    legal: item.legal,
                    views: item.views || 0,
                    publish_status: item.publish_status || 'published',
                    is_featured: item.is_featured || false,
                    created_at: item.created_at || item.createdAt
                  }));
                  propertyData = mapped;
                  savePropertyDataToStorage();
                } else {
                  console.log("đã tải 0 tin");
                }
              } else {
                console.log("đã tải 0 tin");
              }
            } catch (fetchErr) {
              console.error("[Supabase Error] Lỗi kết nối:", fetchErr);
            }
          } else {
            console.log("đã tải 0 tin");
          }

          applyFilters();
          if (typeof renderFeaturedProducts === 'function') {
            renderFeaturedProducts(true);
          }
          console.log("đã render");
        } catch (err) {
          console.error("Lỗi khởi tạo Supabase state:", err);
          const errDiv = document.createElement('div');
          errDiv.style.cssText = "background: #fee2e2; color: #dc2626; padding: 12px; text-align: center; font-weight: bold; border-bottom: 1px solid #fca5a5;";
          errDiv.textContent = "Lỗi tải dữ liệu: " + (err.message || err);
          document.body.prepend(errDiv);
        }
      }

      window.copySupabaseSql = copySupabaseSql;
      window.saveSupabaseSettings = saveSupabaseSettings;
      window.testSupabaseConnection = testSupabaseConnection;
      window.fetchPropertiesFromSupabase = fetchPropertiesFromSupabase;
      window.initSupabaseState = initSupabaseState;

      function randomizeDescOrder() {
        const textarea = document.getElementById('formDesc');
        if (!textarea) return;
        let text = textarea.value;
        const lines = text.split('\n');

        const headingRegex = /^H[IỆ]?ỆN TRẠNG/i;
        let startIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (headingRegex.test(lines[i].trim())) {
            startIdx = i + 1;
            break;
          }
        }
        if (startIdx !== -1) {
          let endIdx = startIdx;
          while (endIdx < lines.length && lines[endIdx].trim().startsWith('-')) {
            endIdx++;
          }
          const bulletLines = lines.slice(startIdx, endIdx);
          for (let i = bulletLines.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bulletLines[i], bulletLines[j]] = [bulletLines[j], bulletLines[i]];
          }
          for (let i = 0; i < bulletLines.length; i++) {
            lines[startIdx + i] = bulletLines[i];
          }
        }

        const closingVariants = [
          'Quý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất.',
          'Anh/chị quan tâm sản phẩm này vui lòng liên hệ để được tư vấn thêm và hẹn lịch xem thực tế.',
          'Quý khách có nhu cầu tìm hiểu thêm hoặc xem trực tiếp sản phẩm, vui lòng liên hệ để được hỗ trợ nhanh nhất.',
          'Để biết thêm chi tiết hoặc sắp xếp lịch xem tận nơi, quý khách vui lòng liên hệ trực tiếp.',
          'Liên hệ ngay để được tư vấn chi tiết và sắp xếp lịch xem tài sản trong thời gian sớm nhất.',
          'Quý khách quan tâm vui lòng liên hệ để được cung cấp thêm thông tin và sắp xếp lịch xem nhà/đất.'
        ];
        for (let i = lines.length - 1; i >= 0; i--) {
          if (/vui lòng liên hệ/i.test(lines[i])) {
            const randomClosing = closingVariants[Math.floor(Math.random() * closingVariants.length)];
            lines[i] = randomClosing;
            break;
          }
        }

        textarea.value = lines.join('\n');
      }
      window.randomizeDescOrder = randomizeDescOrder;

      function setupThemeToggle() {
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        const themeToggleIcon = document.getElementById('themeToggleIcon');
        if (!themeToggleBtn || !themeToggleIcon) return;

        const currentTheme = localStorage.getItem('app-theme') || 'light';
        if (currentTheme === 'dark') {
          themeToggleIcon.textContent = '☀️';
        } else {
          themeToggleIcon.textContent = '🌙';
        }

        themeToggleBtn.addEventListener('click', () => {
          const activeTheme = document.documentElement.getAttribute('data-theme') || 'light';
          const newTheme = activeTheme === 'light' ? 'dark' : 'light';
          
          document.documentElement.setAttribute('data-theme', newTheme);
          localStorage.setItem('app-theme', newTheme);
          
          if (newTheme === 'dark') {
            themeToggleIcon.textContent = '☀️';
            showToast('Đã chuyển sang giao diện Tối thanh lịch!', true);
          } else {
            themeToggleIcon.textContent = '🌙';
            showToast('Đã chuyển sang giao diện Sáng tối giản!', true);
          }
        });
      }

      // Khởi động kiểm tra thông số và phiên hoạt động
      document.getElementById('formRealImages')?.addEventListener('change', handleRealImagesUpload);
      document.getElementById('btnLoadMore')?.addEventListener('click', () => {
        displayedProductLimit += 12;
        renderProducts(currentFilteredProducts, false);
      });
      setupThemeToggle();
      
      function setupSmoothScroll() {
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        navLinks.forEach(link => {
          link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#') && href.length > 1) {
              e.preventDefault();
              const adminSec = document.getElementById('adminDashboardSection');
              const scanSec = document.getElementById('adminScanSection');
              const formSec = document.getElementById('adminFormSection');
              const bulkSec = document.getElementById('adminBulkSection');
              if (adminSec) adminSec.style.display = 'none';
              if (scanSec) scanSec.style.display = 'none';
              if (formSec) formSec.style.display = 'none';
              if (bulkSec) bulkSec.style.display = 'none';
              const homeWrapper = document.getElementById('homePageWrapper');
              if (homeWrapper) homeWrapper.style.display = 'block';

              const targetEl = document.querySelector(href);
              if (targetEl) {
                const navHeight = 70;
                const elementPosition = targetEl.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navHeight;
                window.scrollTo({
                  top: offsetPosition,
                  behavior: 'smooth'
                });
              }

              navLinks.forEach(l => l.classList.remove('active'));
              link.classList.add('active');
            }
          });
        });
      }
      setupSmoothScroll();
      
      function setupDuplicateCheckListeners() {
        const titleInput = document.getElementById('formTitle');
        const areaInput = document.getElementById('formArea');
        const priceInput = document.getElementById('formPrice');
        if (titleInput) {
          titleInput.addEventListener('input', () => {
            // Check for similar titles or duplicates
          });
        }
      }
      setupDuplicateCheckListeners();

      
      function checkAdminSession() {
        try {
          const raw = localStorage.getItem('admin_login_session');
          if (!raw) return false;
          const data = JSON.parse(raw);
          if (!data || !data.timestamp) return false;
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - data.timestamp > thirtyDays) {
            localStorage.removeItem('admin_login_session');
            return false;
          }
          isAdminLoggedIn = true;
          return true;
        } catch (e) {
          return false;
        }
      }
      checkAdminSession();

      initSupabaseState();
      
      function checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const propId = urlParams.get('id');
        if (propId && typeof openProductModal === 'function') {
          openProductModal(propId);
        }
      }
      window.checkUrlParams = checkUrlParams;
      checkUrlParams();

      
      // Trì hoãn các tác vụ nền không liên quan đến hiển thị ban đầu
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          autoMigrateBase64Properties();
        }, { timeout: 10000 });
      } else {
        setTimeout(() => {
          autoMigrateBase64Properties();
        }, 8000);
      }
      var displayedFeaturedLimit = 3;
      function renderFeaturedProducts(resetPagination = true) {
        if (resetPagination) {
          displayedFeaturedLimit = 3;
        }
        const sectionEl = document.getElementById('featuredProductsSection');
        const gridEl = document.getElementById('featuredProductsGrid');
        const loadMoreEl = document.getElementById('featuredLoadMoreContainer');
        const btnLoadMoreEl = document.getElementById('btnFeaturedLoadMore');
        if (!sectionEl || !gridEl) return;
        const featuredList = propertyData.filter(p => {
          const isPublished = (p.publish_status === 'published' || p.publishStatus === 'published');
          const isNotSold = !p.isSold && p.is_sold !== true;
          const isFeatured = p.is_featured === true || p.is_featured === 'true';
          return isPublished && isNotSold && isFeatured;
        });
        console.log("[Featured] Số tin nổi bật tìm thấy:", featuredList.length);
        featuredList.sort((a, b) => {
          const tA = a.featured_at ? new Date(a.featured_at).getTime() : 0;
          const tB = b.featured_at ? new Date(b.featured_at).getTime() : 0;
          if (tB !== tA) return tB - tA;
          const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
          const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
          return timeB - timeA;
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
        const maxViewsVal = propertyData && propertyData.length > 0 
           ? Math.max(...propertyData.map(item => item.views || 0)) 
           : 0;
        const cardsHtml = visibleFeatured.map((p, idx) => renderSingleProductCard(p, idx, maxViewsVal)).join('');
        gridEl.innerHTML = cardsHtml;
      }
      window.renderFeaturedProducts = renderFeaturedProducts;

      function showAdminScanSection() {
        const dashboardSection = document.getElementById('adminDashboardSection');
        const scanSection = document.getElementById('adminScanSection');
        const formSection = document.getElementById('adminFormSection');
        const bulkSection = document.getElementById('adminBulkSection');

        if (dashboardSection) dashboardSection.style.display = 'none';
        if (formSection) formSection.style.display = 'none';
        if (bulkSection) bulkSection.style.display = 'none';
        if (scanSection) scanSection.style.display = 'block';
        window.scrollTo(0, 0);
      }
      window.showAdminScanSection = showAdminScanSection;

      function hideAdminScanSection(e) {
        if (e) e.preventDefault();
        const scanSection = document.getElementById('adminScanSection');
        const dashboardSection = document.getElementById('adminDashboardSection');
        if (scanSection) scanSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      window.hideAdminScanSection = hideAdminScanSection;

      let scanResultItems = [];
      let currentScanFilter = 'all';

      async function parsePropertyFileText(txtFileOrHandle, folderName) {
        let text = await (txtFileOrHandle instanceof File ? txtFileOrHandle.text() : (await txtFileOrHandle.getFile()).text());
        text = text.normalize('NFC').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').replace(/\u00A0/g, ' ');
        const lines = text.split('\n');

        let titleLine = "";
        for (let i = 0; i < lines.length; i++) {
          const lTrim = lines[i].trim().toLowerCase();
          if (lTrim === '--- tieu de ---' || lTrim === '---tiêu đề---' || lTrim.includes('tieu de') || lTrim.includes('tiêu đề')) {
            for (let j = i + 1; j < lines.length; j++) {
              const nextTrim = lines[j].trim();
              if (nextTrim !== '') {
                titleLine = nextTrim;
                break;
              }
            }
            break;
          }
        }
        if (!titleLine) {
          for (const l of lines) {
            if (l.trim() !== '') {
              titleLine = l.trim();
              break;
            }
          }
        }

        function extractPriceFromString(str) {
          if (!str) return 0;
          const matches = [...str.matchAll(/(\d+(?:[.,]\d+)?)\s*t[ỷyỹỉi](?![\p{L}\p{N}])/giu)];
          if (matches && matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const numStr = lastMatch[1].replace(',', '.');
            const parsed = parseFloat(numStr);
            if (!isNaN(parsed) && parsed > 0) {
              return parsed;
            }
          }
          return 0;
        }

        let gia = extractPriceFromString(titleLine);
        if (gia <= 0) {
          for (let i = 0; i < Math.min(lines.length, 5); i++) {
            gia = extractPriceFromString(lines[i]);
            if (gia > 0) break;
          }
        }
        if (gia <= 0) {
          gia = extractPriceFromString(folderName);
        }

        let maTk = "";
        for (const line of lines) {
          if (/mã\s*nguồn\s*hàng/i.test(line) || /mã\s*tk/i.test(line)) {
            const parts = line.split(/[:\s]+/);
            for (const p of parts) {
              if (/^TK[A-Z0-9]{6}$/i.test(p)) {
                maTk = p.toUpperCase();
                break;
              }
            }
          }
        }
        if (!maTk) {
          const matchRegex = text.match(/\bTK[A-Z0-9]{6}\b/i);
          if (matchRegex) maTk = matchRegex[0].toUpperCase();
        }

        let area = 0;
        for (const line of lines) {
          if (/diện\s*tích/i.test(line) || /\bdt\b/i.test(line)) {
            const matches = line.match(/(\d+(?:[.,]\d+)?)\s*(?:m[2²]|mét)/i);
            if (matches) {
              area = parseFloat(matches[1].replace(',', '.'));
              break;
            }
          }
        }
        if (!area) {
          const areaMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*m[2²]\b/i);
          if (areaMatch) {
            area = parseFloat(areaMatch[1].replace(',', '.'));
          }
        }

        return {
          maTk,
          gia,
          area,
          title: titleLine,
          rawText: text
        };
      }

      async function startFolderScan() {
        let dirHandle = null;
        let useFileInputFallback = false;

        if (!window.showDirectoryPicker) {
          useFileInputFallback = true;
        } else {
          try {
            dirHandle = await window.showDirectoryPicker();
          } catch (pickerErr) {
            if (pickerErr.name === 'SecurityError' || pickerErr.message?.includes('Cross origin sub frames') || pickerErr.message?.includes('security')) {
              console.warn("showDirectoryPicker blocked by iframe security, falling back to file input...", pickerErr);
              useFileInputFallback = true;
            } else {
              throw pickerErr;
            }
          }
        }

        if (useFileInputFallback) {
          return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);

            input.onchange = async (e) => {
              const files = Array.from(e.target.files);
              document.body.removeChild(input);
              if (files.length === 0) return;

              showAdminScanSection();
              const progressArea = document.getElementById('scanProgressArea');
              const progressBar = document.getElementById('scanProgressBar');
              const progressLabel = document.getElementById('scanProgressLabel');
              const progressPercent = document.getElementById('scanProgressPercent');
              if (progressArea) progressArea.style.display = 'block';
              if (progressLabel) progressLabel.textContent = "Đang xử lý các file từ thư mục...";
              if (progressBar) progressBar.style.width = '30%';
              if (progressPercent) progressPercent.textContent = '30%';

              try {
                const folderMap = {};
                files.forEach(file => {
                  const parts = file.webkitRelativePath.split('/');
                  if (parts.length < 2) return;
                  const folderName = parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
                  if (folderName.startsWith('_')) return;
                  if (!folderMap[folderName]) {
                    folderMap[folderName] = {
                      folder: parts[parts.length - 2] || parts[0],
                      khu: parts.length > 2 ? parts[0] : "Thủ Đức",
                      txtFile: null,
                      baiDangFile: null,
                      images: []
                    };
                  }
                  const lowerName = file.name.toLowerCase();
                  if (lowerName.endsWith('.txt')) {
                    if (lowerName === 'bai-dang.txt') {
                      folderMap[folderName].baiDangFile = file;
                    } else {
                      folderMap[folderName].txtFile = file;
                    }
                  } else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lowerName)) {
                    folderMap[folderName].images.push(file);
                  }
                });

                const rawScannedItems = [];
                for (const [fKey, fData] of Object.entries(folderMap)) {
                  if (!fData.txtFile) continue;
                  try {
                    const parsed = await parsePropertyFileText(fData.txtFile, fData.folder);
                    let baiDangText = "";
                    if (fData.baiDangFile) {
                      baiDangText = await fData.baiDangFile.text();
                    }

                    rawScannedItems.push({
                      ma_tk: parsed.maTk,
                      gia: parsed.gia,
                      area: parsed.area,
                      khu: fData.khu || "Thủ Đức",
                      folder: fData.folder,
                      title: parsed.title,
                      so_anh: fData.images.length,
                      rawText: parsed.rawText,
                      baiDangText,
                      imageHandles: fData.images
                    });
                  } catch (itemErr) {
                    console.warn("Lỗi đọc file:", fKey, itemErr);
                  }
                }

                if (progressLabel) progressLabel.textContent = `Đã quét xong ${rawScannedItems.length} thư mục. Đang gửi lên server phân tích...`;
                if (progressBar) progressBar.style.width = '70%';
                if (progressPercent) progressPercent.textContent = '70%';

                const payloadItems = rawScannedItems.map(i => ({
                  ma_tk: i.ma_tk,
                  gia: i.gia,
                  area: i.area,
                  khu: i.khu,
                  folder: i.folder,
                  so_anh: i.so_anh,
                  title: i.title
                }));

                const response = await fetch('/api/phan-tich', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-admin-auth': 'true' },
                  credentials: 'include',
                  body: JSON.stringify({ items: payloadItems })
                });

                if (!response.ok) throw new Error('Lỗi kết nối API phân tích.');
                const resJson = await response.json();
                if (!resJson.success) throw new Error(resJson.error || 'Lỗi phân tích từ server.');

                scanResultItems = resJson.results.map((r, idx) => ({
                  ...r,
                  rawText: rawScannedItems[idx].rawText,
                  baiDangText: rawScannedItems[idx].baiDangText,
                  imageHandles: rawScannedItems[idx].imageHandles,
                  title: rawScannedItems[idx].title,
                  area: rawScannedItems[idx].area,
                  selected: r.status === 'giam_gia'
                }));

                if (progressArea) progressArea.style.display = 'none';
                renderScanResults();
                showToast(`✓ Đã quét và phân tích thành công ${scanResultItems.length} thư mục!`, true);

              } catch (err) {
                console.error("Lỗi xử lý file thư mục:", err);
                alert("Không thể hoàn tất quét thư mục: " + (err.message || err));
                if (progressArea) progressArea.style.display = 'none';
              }
              resolve();
            };

            input.oncancel = () => {
              document.body.removeChild(input);
              resolve();
            };

            input.click();
          });
        }

        try {
          showAdminScanSection();
          const progressArea = document.getElementById('scanProgressArea');
          const progressBar = document.getElementById('scanProgressBar');
          const progressLabel = document.getElementById('scanProgressLabel');
          const progressPercent = document.getElementById('scanProgressPercent');
          if (progressArea) progressArea.style.display = 'block';

          if (progressLabel) progressLabel.textContent = "Đang quét cây thư mục...";
          if (progressBar) progressBar.style.width = '10%';
          if (progressPercent) progressPercent.textContent = '10%';

          const rawScannedItems = [];

          async function scanFoldersRecursive(handle, khu = "") {
            for await (const [name, entry] of handle.entries()) {
              if (name.startsWith('_')) continue;
              if (entry.kind === 'directory') {
                let txtFileHandle = null;
                let baiDangHandle = null;
                const imageFiles = [];
                let hasTxt = false;

                for await (const [subName, subEntry] of entry.entries()) {
                  if (subName.startsWith('_')) continue;
                  if (subEntry.kind === 'file') {
                    const lower = subName.toLowerCase();
                    if (lower.endsWith('.txt')) {
                      if (lower === 'bai-dang.txt') {
                        baiDangHandle = subEntry;
                      } else {
                        txtFileHandle = subEntry;
                        hasTxt = true;
                      }
                    } else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(lower)) {
                      imageFiles.push(subEntry);
                    }
                  }
                }

                if (hasTxt && txtFileHandle) {
                  try {
                    const parsed = await parsePropertyFileText(txtFileHandle, name);
                    rawScannedItems.push({
                      ma_tk: parsed.maTk,
                      gia: parsed.gia,
                      area: parsed.area,
                      khu: khu || "Thủ Đức",
                      folder: name,
                      title: parsed.title,
                      so_anh: imageFiles.length,
                      rawText: parsed.rawText,
                      baiDangText: baiDangHandle ? await (await baiDangHandle.getFile()).text() : "",
                      imageHandles: imageFiles
                    });
                  } catch (readErr) {
                    console.warn("Lỗi đọc file trong folder:", name, readErr);
                  }
                } else {
                  await scanFoldersRecursive(entry, khu || name);
                }
              }
            }
          }

          if (progressLabel) progressLabel.textContent = "Đang đọc file .txt và đếm ảnh...";
          if (progressBar) progressBar.style.width = '40%';
          if (progressPercent) progressPercent.textContent = '40%';

          await scanFoldersRecursive(dirHandle);

          if (progressLabel) progressLabel.textContent = `Đã quét xong ${rawScannedItems.length} thư mục. Đang gửi lên server phân tích...`;
          if (progressBar) progressBar.style.width = '70%';
          if (progressPercent) progressPercent.textContent = '70%';

          const payloadItems = rawScannedItems.map(i => ({
            ma_tk: i.ma_tk,
            gia: i.gia,
            area: i.area,
            khu: i.khu,
            folder: i.folder,
            so_anh: i.so_anh,
            title: i.title
          }));

          const response = await fetch('/api/phan-tich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-auth': 'true' },
            credentials: 'include',
            body: JSON.stringify({ items: payloadItems })
          });

          if (!response.ok) throw new Error('Lỗi kết nối API phân tích.');
          const resJson = await response.json();
          if (!resJson.success) throw new Error(resJson.error || 'Lỗi phân tích từ server.');

          scanResultItems = resJson.results.map((r, idx) => ({
            ...r,
            rawText: rawScannedItems[idx].rawText,
            baiDangText: rawScannedItems[idx].baiDangText,
            imageHandles: rawScannedItems[idx].imageHandles,
            title: rawScannedItems[idx].title,
            area: rawScannedItems[idx].area,
            selected: r.status === 'giam_gia'
          }));

          if (progressArea) progressArea.style.display = 'none';
          renderScanResults();
          showToast(`✓ Đã quét và phân tích thành công ${scanResultItems.length} thư mục!`, true);

        } catch (err) {
          console.error("Lỗi quét thư mục:", err);
          alert("Không thể hoàn tất quét thư mục: " + (err.message || err));
          const progressArea = document.getElementById('scanProgressArea');
          if (progressArea) progressArea.style.display = 'none';
        }
      }
      window.startFolderScan = startFolderScan;

      function renderScanResults() {
        const summaryTabs = document.getElementById('scanSummaryTabs');
        const tableContainer = document.getElementById('scanTableContainer');
        const actionBar = document.getElementById('scanActionBar');
        if (summaryTabs) summaryTabs.style.display = 'flex';
        if (tableContainer) tableContainer.style.display = 'block';
        if (actionBar) actionBar.style.display = 'flex';

        const counts = {
          all: scanResultItems.length,
          moi: scanResultItems.filter(i => i.status === 'moi').length,
          nghi_trung: scanResultItems.filter(i => i.status === 'nghi_trung').length,
          giam_gia: scanResultItems.filter(i => i.status === 'giam_gia').length,
          tang_gia: scanResultItems.filter(i => i.status === 'tang_gia').length,
          trung: scanResultItems.filter(i => i.status === 'trung').length,
          da_ban: scanResultItems.filter(i => i.status === 'da_ban').length,
          error: scanResultItems.filter(i => ['thieu_ma', 'thieu_gia', 'thieu_anh', 'trung_trong_thu_muc'].includes(i.status)).length
        };

        document.getElementById('cntAll').textContent = counts.all;
        document.getElementById('cntMoi').textContent = counts.moi;
        document.getElementById('cntNghiTrung').textContent = counts.nghi_trung;
        document.getElementById('cntGiamGia').textContent = counts.giam_gia;
        document.getElementById('cntTangGia').textContent = counts.tang_gia;
        document.getElementById('cntTrung').textContent = counts.trung;
        document.getElementById('cntDaBan').textContent = counts.da_ban;
        document.getElementById('cntError').textContent = counts.error;

        let filtered = scanResultItems;
        if (currentScanFilter === 'moi') filtered = scanResultItems.filter(i => i.status === 'moi');
        else if (currentScanFilter === 'nghi_trung') filtered = scanResultItems.filter(i => i.status === 'nghi_trung');
        else if (currentScanFilter === 'giam_gia') filtered = scanResultItems.filter(i => i.status === 'giam_gia');
        else if (currentScanFilter === 'tang_gia') filtered = scanResultItems.filter(i => i.status === 'tang_gia');
        else if (currentScanFilter === 'trung') filtered = scanResultItems.filter(i => i.status === 'trung');
        else if (currentScanFilter === 'da_ban') filtered = scanResultItems.filter(i => i.status === 'da_ban');
        else if (currentScanFilter === 'error') filtered = scanResultItems.filter(i => ['thieu_ma', 'thieu_gia', 'thieu_anh', 'trung_trong_thu_muc'].includes(i.status));

        const tbody = document.getElementById('scanTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        filtered.forEach((item) => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--border)';
          tr.style.background = item.selected ? 'var(--bg-secondary)' : 'transparent';

          let badgeBg = '#22c55e';
          let badgeText = 'Mới';
          if (item.status === 'nghi_trung') { badgeBg = '#d97706'; badgeText = `⚠️ Nghi trùng (${item.suspectedOlds?.length || 0})`; }
          else if (item.status === 'giam_gia') { badgeBg = '#f97316'; badgeText = `📉 Giảm ${item.chenhLech} Tỷ (${item.phanTram}%)`; }
          else if (item.status === 'tang_gia') { badgeBg = '#eab308'; badgeText = `📈 Tăng ${Math.abs(item.chenhLech)} Tỷ`; }
          else if (item.status === 'trung') { badgeBg = '#64748b'; badgeText = 'Trùng (Không đổi)'; }
          else if (item.status === 'da_ban') { badgeBg = '#dc2626'; badgeText = '🔴 Đã bán'; }
          else if (['thieu_ma', 'thieu_gia', 'thieu_anh', 'trung_trong_thu_muc'].includes(item.status)) { badgeBg = '#ef4444'; badgeText = `⚠️ ${item.note}`; }

          const canSelect = !['thieu_ma', 'thieu_gia', 'thieu_anh', 'trung_trong_thu_muc', 'da_ban'].includes(item.status);

          let suspectedHtml = '';
          if (item.status === 'nghi_trung' && item.suspectedOlds && item.suspectedOlds.length > 0) {
            suspectedHtml = `<div style="margin-top: 6px; padding: 8px; background: rgba(217,119,6,0.06); border: 1px solid rgba(217,119,6,0.2); border-radius: 8px; font-size: 12px;">
              <div style="font-weight: 700; color: #b45309; margin-bottom: 4px;">Tin cũ nghi trùng (${item.suspectedOlds.length}):</div>`;
            item.suspectedOlds.forEach((oldP, idx) => {
              suspectedHtml += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; border-bottom: 1px dashed rgba(217,119,6,0.2); padding-bottom: 4px;">
                <div style="flex: 1; word-break: break-word;">
                  <strong>#${idx+1}</strong>: ${oldP.title || 'Không có tiêu đề'} <br/><span style="color: var(--text-muted); font-size: 11px;">(${oldP.area || '?'}m², ${oldP.price || '?'} Tỷ, ${oldP.ward || oldP.street || ''})</span>
                </div>
                <button onclick="assignMaTkToOld(${scanResultItems.indexOf(item)}, ${oldP.id}, ${item.gia})" style="background: #16a34a; color: #fff; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600; white-space: nowrap;">Là tin cũ, gắn mã</button>
              </div>`;
            });
            suspectedHtml += `<div style="margin-top: 6px; display: flex; gap: 6px;">
              <button onclick="postScanAsNew(${scanResultItems.indexOf(item)})" style="background: var(--primary); color: #fff; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">Là tin mới</button>
              <button onclick="skipScanItem(${scanResultItems.indexOf(item)})" style="background: #64748b; color: #fff; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">Bỏ qua</button>
            </div></div>`;
          }

          tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">
              <input type="checkbox" ${item.selected ? 'checked' : ''} ${!canSelect ? 'disabled' : ''} onchange="toggleScanItemSelect(${scanResultItems.indexOf(item)}, this.checked)">
            </td>
            <td style="padding: 12px; font-weight: 700; color: var(--primary);">${item.ma_tk || '---'}</td>
            <td style="padding: 12px; font-weight: 600;">${item.khu}</td>
            <td style="padding: 12px;">
              <div style="font-weight: 700;" title="Folder: ${item.folder}">${item.title || item.folder}</div>
              <div style="font-size: 11.5px; color: var(--text-muted);">${item.note}</div>
              ${suspectedHtml}
            </td>
            <td style="padding: 12px; font-weight: 800; color: var(--price-color);">
              ${item.giaCu !== null && item.giaCu !== undefined ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9em; margin-right: 4px;">${item.giaCu} Tỷ</span>` : ''}
              <span>${item.gia} Tỷ</span>
            </td>
            <td style="padding: 12px; text-align: center; font-weight: 700;">🖼️ ${item.so_anh}</td>
            <td style="padding: 12px;">
              <span style="background: ${badgeBg}; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; display: inline-block;">${badgeText}</span>
            </td>
            <td style="padding: 12px; text-align: center; white-space: nowrap;">
              <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                <button type="button" onclick="openScanQuickView(${scanResultItems.indexOf(item)})" style="background: #3b82f6; color: #fff; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11.5px; cursor: pointer; font-weight: 600;" title="Xem nhanh mô tả tóm tắt">👁️ Xem nhanh</button>
                <button type="button" onclick="skipScanItem(${scanResultItems.indexOf(item)})" style="background: #64748b; color: #fff; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11.5px; cursor: pointer; font-weight: 600;" title="Bỏ qua tin này">🗑️ Bỏ qua</button>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        });

        updateScanSelectedCount();
      }
      window.renderScanResults = renderScanResults;

      function openScanQuickView(itemIdx) {
        const item = scanResultItems[itemIdx];
        if (!item) return;
        const modal = document.getElementById('scanQuickViewModal');
        const titleEl = document.getElementById('scanQuickViewTitle');
        const contentEl = document.getElementById('scanQuickViewContent');
        if (titleEl) titleEl.textContent = `📋 Xem Nhanh: ${item.ma_tk || '---'} - ${item.title || item.folder}`;
        if (contentEl) {
          contentEl.innerHTML = `
            <div style="margin-bottom: 12px; font-weight: bold; color: var(--primary);">Khu vực: ${escapeHtml(item.khu)} | Giá: ${item.gia} Tỷ | Diện tích: ${item.area || '?'} m² | Ảnh: ${item.so_anh} ảnh</div>
            <hr style="border: 0; border-top: 1px solid var(--border); margin: 12px 0;" />
            <div style="font-weight: bold; margin-bottom: 6px;">Nội dung file .txt thô:</div>
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 12px; white-space: pre-wrap;">${escapeHtml(item.rawText || 'Không có nội dung thô.')}</div>
            ${item.baiDangText ? `<div style="font-weight: bold; margin-bottom: 6px;">Nội dung bai-dang.txt:</div><div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; border: 1px solid var(--border); white-space: pre-wrap;">${escapeHtml(item.baiDangText)}</div>` : ''}
          `;
        }
        if (modal) modal.style.display = 'flex';
      }
      window.openScanQuickView = openScanQuickView;

      function closeScanQuickView() {
        const modal = document.getElementById('scanQuickViewModal');
        if (modal) modal.style.display = 'none';
      }
      window.closeScanQuickView = closeScanQuickView;

      function filterScanResults(tab) {
        currentScanFilter = tab;
        document.querySelectorAll('.scan-tab-btn').forEach(btn => {
          btn.style.background = 'var(--card-bg)';
          btn.style.color = 'var(--text-dark)';
        });
        if (event && event.target) {
          event.target.style.background = 'var(--primary)';
          event.target.style.color = '#fff';
        }
        renderScanResults();
      }
      window.filterScanResults = filterScanResults;

      function toggleScanItemSelect(idx, checked) {
        if (scanResultItems[idx]) {
          scanResultItems[idx].selected = checked;
          updateScanSelectedCount();
        }
      }
      window.toggleScanItemSelect = toggleScanItemSelect;

      function toggleSelectAllScan(chk) {
        const isChecked = chk.checked;
        scanResultItems.forEach(item => {
          if (!['thieu_ma', 'thieu_gia', 'thieu_anh', 'trung_trong_thu_muc', 'da_ban'].includes(item.status)) {
            item.selected = isChecked;
          }
        });
        renderScanResults();
      }
      window.toggleSelectAllScan = toggleSelectAllScan;

      function updateScanSelectedCount() {
        const selectedMoi = scanResultItems.filter(i => i.selected && i.status === 'moi').length;
        const selectedGiam = scanResultItems.filter(i => i.selected && i.status === 'giam_gia').length;
        const txt = document.getElementById('scanSelectedCountText');
        if (txt) {
          txt.textContent = `Đã chọn: ${selectedMoi} mới, ${selectedGiam} cập nhật giá`;
        }
      }

      async function assignMaTkToOld(itemIdx, oldId, price) {
        const item = scanResultItems[itemIdx];
        if (!item || !item.ma_tk) {
          alert("Không tìm thấy mã TK hợp lệ.");
          return;
        }
        if (!confirm(`Xác nhận gán mã ${item.ma_tk} cho tin cũ ID ${oldId}?`)) return;

        try {
          const res = await fetch('/api/gan-ma-va-cap-nhat-gia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-auth': 'true' },
            credentials: 'include',
            body: JSON.stringify({ old_id: oldId, ma_tk: item.ma_tk, gia: price })
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Lỗi khi gắn mã');
          }
          showToast(`✓ Đã gắn mã ${item.ma_tk} cho tin cũ thành công!`, true);
          scanResultItems.splice(itemIdx, 1);
          renderScanResults();
          fetchPropertiesFromSupabase(true, 100);
        } catch (err) {
          const errMsg = err.message || String(err);
          if (errMsg.includes('Đã tồn tại') || errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('ma_tk')) {
            alert("Đã tồn tại");
          } else {
            alert("Lỗi: " + errMsg);
          }
        }
      }
      window.assignMaTkToOld = assignMaTkToOld;

      async function postScanAsNew(itemIdx) {
        const item = scanResultItems[itemIdx];
        if (!item) return;
        if (!confirm(`Xác nhận đăng tin ${item.ma_tk} như tin mới?`)) return;

        try {
          const uploadedUrls = [];
          if (item.imageHandles && item.imageHandles.length > 0) {
            for (const imgHandle of item.imageHandles) {
              const file = imgHandle instanceof File ? imgHandle : await imgHandle.getFile();
              const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
              });
              const uploadedUrl = await uploadBase64ToCloudinary(base64);
              if (uploadedUrl && !uploadedUrl.startsWith('data:')) {
                uploadedUrls.push(uploadedUrl);
              }
            }
          }

          const res = await fetch('/api/nguon-nhap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-auth': 'true' },
            credentials: 'include',
            body: JSON.stringify({
              ma_tk: item.ma_tk,
              noi_dung_tho: item.rawText,
              bai_dang_tho: item.baiDangText,
              gia: item.gia,
              image_urls: uploadedUrls,
              khu: item.khu
            })
          });
          const json = await res.json();
          if (!res.ok || json.status === 'loi') {
            throw new Error(json.error || 'Lỗi đăng tin');
          }
          showToast(`✓ Đăng tin mới ${item.ma_tk} thành công!`, true);
          scanResultItems.splice(itemIdx, 1);
          renderScanResults();
          fetchPropertiesFromSupabase(true, 100);
        } catch (err) {
          const errMsg = err.message || String(err);
          if (errMsg.includes('Đã tồn tại') || errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('ma_tk')) {
            alert("Đã tồn tại");
          } else {
            alert("Lỗi: " + errMsg);
          }
        }
      }
      window.postScanAsNew = postScanAsNew;

      function skipScanItem(itemIdx) {
        scanResultItems.splice(itemIdx, 1);
        renderScanResults();
        showToast("Đã bỏ qua tin quét.", true);
      }
      window.skipScanItem = skipScanItem;

      async function executeSelectedScanPost() {
        const selectedItems = scanResultItems.filter(i => i.selected);
        if (selectedItems.length === 0) {
          alert("Vui lòng chọn ít nhất một tin hợp lệ để đăng hoặc cập nhật!");
          return;
        }
        const priceMode = document.getElementById("scanPriceModeSelect")?.value || "ngay";
        for (const item of selectedItems) {
          console.log("Bắt đầu xử lý tin:", item.ma_tk);
          showToast(`Đang xử lý tin ${item.ma_tk}...`, true);
          try {
            const uploadedUrls = [];
            if (item.imageHandles && item.imageHandles.length > 0) {
              for (const imgHandle of item.imageHandles) {
                const file = imgHandle instanceof File ? imgHandle : await imgHandle.getFile();
                const base64 = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target.result);
                  reader.readAsDataURL(file);
                });
                const uploadedUrl = await uploadBase64ToCloudinary(base64);
                if (uploadedUrl && !uploadedUrl.startsWith("data:")) {
                  uploadedUrls.push(uploadedUrl);
                }
              }
            }
            console.log("Upload ảnh xong, số lượng:", uploadedUrls.length);
            const postRes = await fetch("/api/nguon-nhap", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-admin-auth": "true" },
              credentials: "include",
              body: JSON.stringify({
                ma_tk: item.ma_tk,
                noi_dung_tho: item.rawText,
                bai_dang_tho: item.baiDangText,
                gia: item.gia,
                image_urls: uploadedUrls,
                khu: item.khu,
                price_mode: priceMode
              })
            });
            const postJson = await postRes.json();
            console.log("Ghi database xong, kết quả:", postJson);
            if (!postRes.ok || postJson.status === "loi") {
              throw new Error(postJson.error || "Lỗi đăng tin");
            }
            let successMsg = "";
            if (postJson.status === "cap_nhat_gia" || postJson.status === "cho_duyet") {
              const oldP = postJson.old_price !== undefined && postJson.old_price !== null ? postJson.old_price : (item.giaCu !== null ? item.giaCu : "?");
              const newP = postJson.new_price !== undefined && postJson.new_price !== null ? postJson.new_price : item.gia;
              successMsg = `Đã cập nhật giá TK${item.ma_tk}: ${oldP} → ${newP} tỷ`;
            } else {
              successMsg = `Thành công! Đã tạo tin mới TK${item.ma_tk}`;
            }
            showToast(successMsg, true);
            alert(successMsg);
            const idx = scanResultItems.indexOf(item);
            if (idx !== -1) scanResultItems.splice(idx, 1);
          } catch (err) {
            console.error("Lỗi xử lý tin:", err);
            const errMsg = err.message || String(err);
            let finalMsg = errMsg;
            if (errMsg.includes("Đã tồn tại") || errMsg.includes("unique") || errMsg.includes("duplicate") || errMsg.includes("ma_tk")) {
              finalMsg = "Đã tồn tại";
            }
            const errorMsg = `Lỗi: ${finalMsg}`;
            showToast(errorMsg, false);
            alert(errorMsg);
          }
        }
        renderScanResults();
        fetchPropertiesFromSupabase(true, 100);
      }
      window.executeSelectedScanPost = executeSelectedScanPost;

      function downloadScanReport() {
        const reportLines = ["=== BÁO CÁO QUÉT THƯ MỤC BĐS ===", `Thời gian: ${new Date().toLocaleString()}`, ""];
        scanResultItems.forEach(i => {
          reportLines.push(`[${i.status.toUpperCase()}] Mã TK: ${i.ma_tk || 'N/A'} | Khu: ${i.khu} | Folder: ${i.folder} | Giá: ${i.gia} Tỷ | Ghi chú: ${i.note}`);
        });
        const blob = new Blob([reportLines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bao-cao-quet-bds-${Date.now()}.txt`;
        a.click();
      }
      window.downloadScanReport = downloadScanReport;
  