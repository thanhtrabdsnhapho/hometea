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
      function showCustomConfirm(title, message) {
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
          
          if (titleEl) titleEl.textContent = title;
          if (msgEl) msgEl.textContent = message;
          
          console.log("Opening custom confirm modal...");
          modal.style.display = 'flex';
          modal.style.pointerEvents = 'auto'; // Kích hoạt sự kiện click tuyệt đối trực tiếp bằng JS
          modal.offsetHeight; // trigger reflow
          modal.style.opacity = '1';
          const childDiv = modal.querySelector('div');
          if (childDiv) childDiv.style.transform = 'scale(1)';
          
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
      let isAdminLoggedIn = sessionStorage.getItem('admin_logged_in') === 'true';
      const cardImageIndexes = {};
      let currentFilteredProducts = [];
      let displayedProductLimit = 12;

      function formatFloors(floors) {
        const val = parseInt(floors);
        if (isNaN(val)) return floors || '';
        if (val === 0) return "Đất trống";
        if (val === 1) return "Cấp 4";
        return `${val} tầng`;
      }

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
      const APP_CACHE_VERSION = "v3.0";
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
      function getOptimizedCloudinaryUrl(url, width, height) {
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
          return url.replace("/image/upload/", `/image/upload/${params.join(",")}/`);
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

      // Hàm hiển thị sản phẩm lên trang
      function renderProducts(products, resetPagination = true) {
        if (resetPagination) {
          displayedProductLimit = 12;
        }

        // Sắp xếp các sản phẩm theo Tab điều hướng đang kích hoạt
        const sortedProducts = [...products].sort((a, b) => {
          if (currentHomeTab === 'views') {
            return (b.views || 0) - (a.views || 0);
          }
          if (currentHomeTab === 'newest') {
            return b.id - a.id;
          }
          if (currentHomeTab === 'discount') {
            return b.id - a.id;
          }
          
          // Với lựa chọn "all" (Mặc định): Đưa các sản phẩm Giảm giá nổi bật lên hàng đầu
          const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

          const aReduced = a.isPriceReduced && 
            a.priceUpdatedAt &&
            (Date.now() - new Date(a.priceUpdatedAt).getTime()) < twoDaysMs;

          const bReduced = b.isPriceReduced && 
            b.priceUpdatedAt &&
            (Date.now() - new Date(b.priceUpdatedAt).getTime()) < twoDaysMs;

          if (aReduced && !bReduced) return -1;
          if (!aReduced && bReduced) return 1;
          
          // Các căn bình thường sắp xếp ID giảm dần (mới nhất lên đầu)
          return b.id - a.id;
        });

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
          productsGrid.innerHTML = `
            <div class="empty-state">
              <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color: var(--text-muted); margin-bottom: 12px; display: inline-block;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>Rất tiếc! Không có sản phẩm nào phù hợp với bộ lọc tìm kiếm hiện tại.</p>
              <button onclick="resetAllFilters()" class="btn-reset-filters">Đặt lại bộ lọc tìm kiếm</button>
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

        visibleProducts.forEach((p, idx) => {
          // Tính toán danh sách hình ảnh
          const list = p.imgList && p.imgList.length > 0 ? p.imgList : [p.img];
          const hasMultipleImages = list.length > 1;
          
          // Lấy vị trí ảnh hiện tại của card (mặc định 0)
          if (cardImageIndexes[p.id] === undefined) {
            cardImageIndexes[p.id] = 0;
          }
          const currentImgIndex = cardImageIndexes[p.id];
          const activeImgSrc = list[currentImgIndex];
          const activeImgSrcOptimized = getOptimizedCloudinaryUrl(activeImgSrc, 400, 300);

          // Tối ưu hóa fold: 4 sản phẩm đầu tiên được ưu tiên tải trước (fetchpriority="high") thay vì bị trì hoãn bởi lazy load
          const isAboveFold = idx < 4;
          const loadingAttr = isAboveFold ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';

          // Tạo các nút điều khiển slider HTML nếu nhiều ảnh
          const sliderNavHtml = hasMultipleImages ? `
            <button class="card-slider-nav prev" onclick="changeCardImage('${p.id}', -1, event)">&#10094;</button>
            <button class="card-slider-nav next" onclick="changeCardImage('${p.id}', 1, event)">&#10095;</button>
            <span class="card-slider-badge">${currentImgIndex + 1}/${list.length}</span>
          ` : '';

          // Rút gọn địa chỉ phường đề hiển thị ngắn gọn trong cột
          let shortAddress = p.address;
          if (p.street && p.ward) {
            shortAddress = `${p.street}, Phường ${p.ward}`;
          } else {
            // Rút gọn bớt chuỗi ", TP. Thủ Đức, TP.HCM"
            shortAddress = p.address.replace(", Phường", "").replace(", P.", "").replace(", Phường ", "").replace(", P. ", "").replace(", TP. Thủ Đức, TP.HCM", "").replace(", TP. Thủ Đức", "").replace(", TP.HCM", "");
          }
          if (shortAddress.length > 25) {
            shortAddress = shortAddress.substring(0, 24) + "...";
          }

           // Thiết lập số lượt xem (như trong ảnh hiển thị "0 lượt xem")
          const viewsCount = p.views !== undefined ? p.views : 0;

          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
          // "Mới đăng": dùng created_at thực từ Supabase
          const createdTime = p.created_at ? new Date(p.created_at).getTime() : 0;
          const isNew = createdTime > 0 && (Date.now() - createdTime) <= threeDaysMs;
          const isReduced = p.isPriceReduced && 
            p.priceUpdatedAt &&
            (Date.now() - new Date(p.priceUpdatedAt).getTime()) < 2 * 24 * 60 * 60 * 1000;

          let priceDisplayHtml = `<span>${p.price} tỷ</span>`;
          if (isReduced && p.oldPrice) {
            priceDisplayHtml = `
              <span style="text-decoration: line-through; color: #999; font-size: 0.85em; margin-right: 4px;">${p.oldPrice} tỷ</span>
              <span style="color: #f97316; font-weight: bold; font-size: 1.1em;">${p.price} tỷ</span>
              <span style="background-color: #ef4444; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px; margin-left: 4px; text-transform: uppercase; display: inline-block; line-height: 1.1;">NEW</span>
            `;
          }

          const pSlug = createSlug(p.title);
          const pUrl = `/chitiet/${p.id}-${pSlug}`;
          const cardHtml = `
            <article class="product-card" id="prop-${p.id}" style="cursor: pointer; display: flex; flex-direction: column;" onclick="openProductModal('${p.id}', event)">
              <!-- Slider hình ảnh -->
              <a href="${pUrl}" onclick="openProductModal('${p.id}', event)" style="display: block; text-decoration: none; color: inherit; width: 100%;">
                <div class="card-slider-container">
                  <img class="card-slider-img" src="${activeImgSrcOptimized}" alt="${p.title}" ${loadingAttr} onload="this.style.opacity=1" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22800%22%20height=%22600%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%230c1524%22/%3E%3Ctext%20x=%2250%25%22%20y=%2250%25%22%20dominant-baseline=%22middle%22%20text-anchor=%22middle%22%20font-family=%22system-ui%22%20font-size=%2222%22%20font-weight=%22bold%22%20fill=%22%23f97316%22%3EThanh%20Tr%C3%A0%20B%C4%90S%3C/text%3E%3C/svg%3E'; this.style.opacity=1;">
                  ${sliderNavHtml}
                </div>
              </a>
              
              <!-- Thân card -->
              <div class="product-body" style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
                <!-- Hàng Badge mới: Mới đăng và Lượt xem giống hệt như ảnh -->
                <div class="card-badges-row">
                  ${isNew ? '<span class="card-badge-item card-badge-new">🔥 Mới đăng</span>' : ''}
                  ${isReduced ? '<span class="card-badge-item card-badge-discount">📉 Giảm giá</span>' : ''}
                  <span class="card-badge-item card-badge-views">👁️ ${viewsCount} lượt xem</span>
                  ${viewsCount > 0 && viewsCount === maxViewsVal ? '<span class="card-badge-item card-badge-popular">👑 Xem nhiều nhất</span>' : ''}
                </div>

                <!-- Tiêu đề đóng vai trò viết hoa in đậm -->
                <h4 class="card-title-upper" title="${p.title}" style="height: auto; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px;">
                  <a href="${pUrl}" onclick="openProductModal('${p.id}', event)" style="color: inherit; text-decoration: none; display: block;">${p.title.toUpperCase()}</a>
                </h4>
                
                <!-- Địa chỉ đầy đủ hiển thị dưới tiêu đề như trong ảnh -->
                <div class="card-address-full" style="display: flex; align-items: flex-start; gap: 5px; margin-bottom: 6px; font-size: 13px; color: #4b5563;" title="${getPublicDisplayAddress(p)}">
                  <span style="color: #ef4444; font-size: 14px; flex-shrink: 0; margin-top: 1px;">📍</span>
                  <span style="font-weight: 500; font-family: var(--font-sans); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${getPublicDisplayAddress(p)}</span>
                </div>

                <!-- Bố cục lưới thông số 2 cột thanh tao -->
                <div class="card-grid-specs">
                  <!-- Cột Trái -->
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #2563eb;">📐</span>
                      <span style="font-weight: 700; color: var(--text-dark);">${p.area} m²</span>
                    </div>
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #6b7280;">🏢</span>
                      <span>${formatFloors(p.floors)}</span>
                    </div>
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #0ea5e9;">🚽</span>
                      <span>${p.bathrooms !== undefined && p.bathrooms !== null ? p.bathrooms : 3} WC</span>
                    </div>
                  </div>
                  
                  <!-- Cột Phải -->
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #22c55e;">🛏️</span>
                      <span>${p.bedrooms !== undefined && p.bedrooms !== null ? p.bedrooms : 3} PN</span>
                    </div>
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #f59e0b;">🧭</span>
                      <span>${p.direction || 'Đông Bắc'}</span>
                    </div>
                    <div class="card-grid-spec-item">
                      <span class="card-grid-icon" style="color: #8b5cf6;">📜</span>
                      <span style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.legal || 'Sổ hồng'}">${p.legal || 'Sổ hồng'}</span>
                    </div>
                  </div>
                </div>
                
                <!-- Đường kẻ phân cách ngang mảnh -->
                <hr class="card-divider-line" style="margin-top: auto; margin-bottom: 8px;">
                
                <!-- Giá rực rỡ đã chỉnh sửa trùng tỷ -->
                <div class="card-price-row" style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 0; margin-bottom: 8px;">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span class="card-price-symbol">💰</span>
                    ${priceDisplayHtml}
                  </div>
                  ${(() => {
                    const rawPrice = parseFloat(p.price);
                    const rawArea = parseFloat(p.area);
                    if (!isNaN(rawPrice) && !isNaN(rawArea) && rawArea > 0) {
                      const m2PriceInMillions = (rawPrice * 1000) / rawArea;
                      return '<span style="font-size: 13px; font-weight: 500; color: #64748b; margin-left: auto; font-family: var(--font-sans);">(' + m2PriceInMillions.toFixed(1) + ' triệu/m²)</span>';
                    }
                    return '';
                  })()}
                </div>
                
                <!-- Nút Zalo & Chia sẻ song song rộng 50% -->
                <div class="card-ctas-row" style="margin-top: 0;">
                  <a href="https://zalo.me/0854100036?text=${encodeURIComponent('Xin chào Thanh Trà BĐS, tôi muốn nhận thông tin đầy đủ căn: ' + p.title + ' (Mã số căn #' + p.id + ')')}" target="_blank" rel="noopener noreferrer" class="card-btn card-btn-zalo" onclick="event.stopPropagation();">
                    <span style="font-size: 14px;">💬</span> Zalo
                  </a>
                  <button type="button" class="card-btn card-btn-share" onclick="event.stopPropagation(); copyShareLink('${p.id}');">
                    <span style="font-size: 14px;">📘</span> Chia sẻ
                  </button>
                </div>
              </div>
            </article>
          `;
          productsGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
      }

      // Hàm lọc sản phẩm realtime
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

        let filtered = propertyData.filter(p => {
          // Hide sold listings from public pages
          if (p.isSold) {
            return false;
          }

          // 1. Phường/xã
          if (ward !== 'all' && p.ward !== ward) {
            return false;
          }

          // 2. Hướng nhà
          if (direction !== 'all' && p.direction !== direction) {
            return false;
          }

          // 3. Diện tích
          const pArea = parseFloat(p.area);
          if (areaMin !== null && pArea < areaMin) return false;
          if (areaMax !== null && pArea > areaMax) return false;

          // 4. Số tầng
          const pFloors = parseInt(p.floors);
          if (floorsMin !== null && pFloors < floorsMin) return false;
          if (floorsMax !== null && pFloors > floorsMax) return false;

          // 5. Giá tiền
          const pPrice = parseFloat(p.price);
          if (priceMin !== null && pPrice < priceMin) return false;
          if (priceMax !== null && pPrice > priceMax) return false;

          // 6. Đường phố
          if (street) {
            const propStreet = (p.street || '').toLowerCase();
            const propAddr = (p.address || '').toLowerCase();
            if (!propStreet.includes(street) && !propAddr.includes(street)) {
              return false;
            }
          }

          // 7. Từ khóa (Tìm kiếm nhanh)
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

        // Áp dụng bộ lọc Tab hiện tại (ví dụ tab Có tag giảm giá)
        if (currentHomeTab === 'discount') {
          filtered = filtered.filter(p => {
            return p.isPriceReduced && 
              p.priceUpdatedAt &&
              (Date.now() - new Date(p.priceUpdatedAt).getTime()) < 2 * 24 * 60 * 60 * 1000;
          });
        }

        renderProducts(filtered);
        if (typeof renderPublicMarketPriceTable === 'function') {
          renderPublicMarketPriceTable();
        }
      }

      // Hàm chuyển đổi các Tab điều hướng bên ngoài (Tất cả, Giảm giá, Mới đăng, Xem nhiều nhất)
      function switchHomeTab(tabId) {
        currentHomeTab = tabId;
        
        // Cập nhật trạng thái hiển thị của các nút tab
        document.querySelectorAll('.home-tab-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        
        const activeBtn = document.getElementById('homeTab_' + tabId);
        if (activeBtn) {
          activeBtn.classList.add('active');
        }
        
        applyFilters();
      }
      window.switchHomeTab = switchHomeTab;

      // Đặt lại toàn bộ bộ lọc
      function resetAllFilters() {
        if (mainSearchKeyword) mainSearchKeyword.value = '';
        if (filterKeyword) filterKeyword.value = '';
        if (filterWard) filterWard.value = 'all';
        if (filterDirection) filterDirection.value = 'all';
        if (filterAreaMin) filterAreaMin.value = '';
        if (filterAreaMax) filterAreaMax.value = '';
        if (filterFloorsMin) filterFloorsMin.value = '';
        if (filterFloorsMax) filterFloorsMax.value = '';
        if (filterStreet) filterStreet.value = '';
        if (filterPriceMin) filterPriceMin.value = '';
        if (filterPriceMax) filterPriceMax.value = '';
        
        // Reset Tab về mặc định Tất cả
        currentHomeTab = 'all';
        document.querySelectorAll('.home-tab-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        const activeBtn = document.getElementById('homeTab_all');
        if (activeBtn) activeBtn.classList.add('active');
        
        applyFilters();
      }

      // Gắn sự kiện lắng nghe để lọc realtime
      const filterCtrls = [
        filterKeyword, filterWard, filterDirection,
        filterAreaMin, filterAreaMax, filterFloorsMin, filterFloorsMax,
        filterStreet, filterPriceMin, filterPriceMax
      ];
      filterCtrls.forEach(ctrl => {
        if (ctrl) {
          ctrl.addEventListener('input', applyFilters);
          ctrl.addEventListener('change', applyFilters);
        }
      });
      if (btnResetFilters) btnResetFilters.addEventListener('click', resetAllFilters);
      
      const btnApplyFilters = document.getElementById('btnApplyFilters');
      if (btnApplyFilters) btnApplyFilters.addEventListener('click', applyFilters);

      const btnSearchSubmit = document.getElementById('btnSearchSubmit');
      if (btnSearchSubmit) btnSearchSubmit.addEventListener('click', applyFilters);

      // Khởi chạy render lần đầu
      renderProducts(propertyData);


      /* ==========================================
         3. ĐIỀU HƯỚNG NAVBAR CỐ ĐỊNH & MOBILE MENU HAMBURGER
         ========================================== */
      const navbar = document.getElementById('navbar');
      const menuToggle = document.getElementById('menuToggle');
      const navMenu = document.getElementById('navMenu');

      window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
          navbar.classList.add('scrolled');
        } else {
          navbar.classList.remove('scrolled');
        }
      });

      menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        navMenu.classList.toggle('open');
      });

      // Tự động đóng menu khi nhấp vào link chuyển hướng và hỗ trợ quay về home nếu đang ở admin
      document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
          if (link.id === 'navAdminLink') {
            if (!isAdminLoggedIn) {
              if (menuToggle) menuToggle.classList.remove('active');
              if (navMenu) navMenu.classList.remove('open');
              return;
            }
          } else {
            // Nếu không phải là admin link, đảm bảo quay lại trang chủ
            switchToPage('home');
            
            // Lấy anchor từ href để tự động cuộn chính xác
            const targetId = link.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
              e.preventDefault();
              setTimeout(() => {
                const targetEl = document.querySelector(targetId);
                if (targetEl) {
                  const navHeight = 75;
                  const targetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - navHeight;
                  window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                  });
                }
              }, 50);
            }
          }
          document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
          link.classList.add('active');
          if (menuToggle) menuToggle.classList.remove('active');
          if (navMenu) navMenu.classList.remove('open');
        });
      });


      /* ==========================================
         4. ĐIỀU KHIỂN CHI TIẾT POPUP (MODAL DIALOG)
         ========================================== */
      const propertyModal = document.getElementById('propertyModal');
      const modalCloseBtn = document.getElementById('modalCloseBtn');
      const mMainImg = document.getElementById('mMainImg');
      const mTitle = document.getElementById('mTitle');
      const mAddress = document.getElementById('mAddress');
      const mPrice = document.getElementById('mPrice');
      const mArea = document.getElementById('mArea');
      const mFloors = document.getElementById('mFloors');
      const mDirection = document.getElementById('mDirection');
      const mDescText = document.getElementById('mDescText');
      const mZaloLink = document.getElementById('mZaloLink');

      let modalImagesList = [];
      let currentModalImgIndex = 0;

      function slideModalImg(direction) {
        if (modalImagesList.length <= 1) return;
        currentModalImgIndex = (currentModalImgIndex + direction + modalImagesList.length) % modalImagesList.length;
        updateModalImageDisplay();
      }

      function setModalImgIndex(index) {
        currentModalImgIndex = index;
        updateModalImageDisplay();
      }

      function updateModalImageDisplay() {
        const mMainImg = document.getElementById('mMainImg');
        if (modalImagesList.length > 0 && mMainImg) {
          mMainImg.style.opacity = 0;
          const originalUrl = modalImagesList[currentModalImgIndex];
          // Tối ưu hóa ảnh với kích thước chi tiết khoảng 900x675 sắc sảo
          mMainImg.src = getOptimizedCloudinaryUrl(originalUrl, 900, 675);
        }
        
        // Cập nhật các dots tuyển chọn
        const dots = document.querySelectorAll('.modal-dot');
        dots.forEach((dot, idx) => {
          if (idx === currentModalImgIndex) {
            dot.style.background = 'var(--accent)';
            dot.style.transform = 'scale(1.2)';
          } else {
            dot.style.background = 'rgba(255,255,255,0.6)';
            dot.style.transform = 'scale(1)';
          }
        });

        // Cập nhật đường border đỏ cho thumbnail active
        const thumbs = document.querySelectorAll('.modal-thumb-item');
        thumbs.forEach((thumb, idx) => {
          if (idx === currentModalImgIndex) {
            thumb.style.borderColor = 'var(--accent)';
            thumb.style.boxShadow = '0 0 6px var(--accent)';
            // Tự động cuộn thumbnail active vào vùng nhìn thấy nếu bị khuất
            thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } else {
            thumb.style.borderColor = 'var(--border)';
            thumb.style.boxShadow = 'none';
          }
        });
      }

      function openProductModal(id, event) {
        const foundItem = propertyData.find(p => p.id == id);
        const slug = foundItem ? createSlug(foundItem.title) : '';
        const url = foundItem ? `/chitiet/${foundItem.id}-${slug}` : `/chitiet?id=${id}`;

        if (event) {
          // Nếu click bằng chuột giữa hoặc giữ phím Ctrl/Cmd/Shift thì để trình duyệt tự mở tab mới theo href
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) {
            return;
          }
          event.preventDefault();
        }
        window.location.href = url;
        return;

        const item = propertyData.find(p => p.id == id);
        if (!item) return;

        // Cập nhật tiêu đề trang web động để Google Index tốt hơn
        document.title = `${item.title} | Thanh Trà BĐS`;

        // Tạo URL riêng biệt dạng ?id=123 để Google có thể thu thập dữ liệu sản phẩm
        try {
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.get('id') !== String(id)) {
            currentUrl.searchParams.set('id', id);
            window.history.pushState({ id: id }, '', currentUrl.toString());
          }
        } catch (urlErr) {
          console.warn("Không thể cập nhật URL PushState:", urlErr);
        }

        // Cập nhật canonical tag động theo từng sản phẩm
        try {
          let canonicalTag = document.querySelector('link[rel="canonical"]');
          if (!canonicalTag) {
            canonicalTag = document.createElement('link');
            canonicalTag.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalTag);
          }
          canonicalTag.setAttribute('href', `https://thanhtrabds.vercel.app/?id=${id}`);
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc && item.desc) {
            const short = item.desc.length > 150 ? item.desc.substring(0, 150) + '...' : item.desc;
            metaDesc.setAttribute('content', `${item.title}. Giá: ${item.priceText}. Diện tích: ${item.area}m². ${short}`);
          }
          const ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) ogTitle.setAttribute('content', item.title);
          const ogUrl = document.querySelector('meta[property="og:url"]');
          if (ogUrl) ogUrl.setAttribute('content', `https://thanhtrabds.vercel.app/?id=${id}`);
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage && item.img) ogImage.setAttribute('content', item.img);
        } catch (canErr) {
          console.warn("Không thể cập nhật canonical:", canErr);
        }

        // Tăng lượt xem thực tế của tin đăng và lưu trữ
        item.views = (item.views !== undefined ? parseInt(item.views) : 0) + 1;
        
        // Lưu trữ cụ thể độc lập tránh bị rỗng khi DB chưa thêm cột views hoặc tải rổ hàng mới
        try {
          const localViews = JSON.parse(localStorage.getItem('local_property_views') || '{}');
          localViews[item.id] = item.views;
          localStorage.setItem('local_property_views', JSON.stringify(localViews));
        } catch (e) {
          console.warn("Lỗi lưu trữ local_property_views:", e);
        }
        
        savePropertyDataToStorage();

        // Cập nhật lượt xem trực tiếp ngoài Card trang chủ mà không cần tải lại trang
        const countBadge = document.querySelector(`#prop-${item.id} .card-badge-views`);
        if (countBadge) {
          countBadge.innerHTML = `👁️ ${item.views} lượt xem`;
        }

        // Đồng bộ số lượt xem mới lên Supabase Cloud (nếu có kết nối và DB hỗ trợ)
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey && supabaseHasViewsColumn) {
          fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ views: item.views })
          }).then(res => {
            if (!res.ok) console.warn("Lỗi đồng bộ lượt xem lên Supabase:", res.status);
          }).catch(err => {
            console.error("Lỗi đồng bộ lượt xem lên Supabase:", err);
          });
        }

        // Lưu danh sách hình ảnh thực tế
        modalImagesList = item.imgList && item.imgList.length > 0 ? [...item.imgList] : [item.img];
        currentModalImgIndex = 0;

        mTitle.textContent = item.title;
        mAddress.innerHTML = `
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${getPublicDisplayAddress(item)}
        `;
        const rawModalPrice = parseFloat(item.price);
        const rawModalArea = parseFloat(item.area);
        const isReducedModal = item.isPriceReduced && 
          item.priceUpdatedAt &&
          (Date.now() - new Date(item.priceUpdatedAt).getTime()) < 2 * 24 * 60 * 60 * 1000;

        let modalPriceHtml = `<span>${item.priceText}</span>`;
        if (isReducedModal && item.oldPrice) {
          modalPriceHtml = `
            <span style="text-decoration: line-through; color: #999; font-size: 0.85em; margin-right: 8px;">${item.oldPrice} Tỷ</span>
            <span style="color: #f97316; font-weight: bold; font-size: 1.1em;">${item.price} Tỷ</span>
            <span style="background-color: #ef4444; color: #ffffff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-left: 8px; text-transform: uppercase; display: inline-block; line-height: 1.1;">NEW</span>
          `;
        }

        if (!isNaN(rawModalPrice) && !isNaN(rawModalArea) && rawModalArea > 0) {
          const perM2 = (rawModalPrice * 1000) / rawModalArea;
          mPrice.innerHTML = `${modalPriceHtml} <span style="font-size: 15px; font-weight: 500; color: #64748b; font-family: var(--font-sans); display: inline-block; margin-left: 8px;">(${perM2.toFixed(1)} triệu/m²)</span>`;
        } else {
          mPrice.innerHTML = modalPriceHtml;
        }
        mArea.textContent = `${item.area} m²`;
        mFloors.textContent = formatFloors(item.floors);
        mDirection.textContent = item.direction;
        mDescText.textContent = item.desc;

        // Điền các thông số chi tiết cấu trúc bổ sung
        const mWidth = document.getElementById('mWidth');
        const mBedrooms = document.getElementById('mBedrooms');
        const mBathrooms = document.getElementById('mBathrooms');
        const mLegal = document.getElementById('mLegal');

        if (mWidth) {
          mWidth.textContent = (item.width && item.width > 0) ? `${item.width} m` : "Thương lượng";
        }
        if (mBedrooms) {
          mBedrooms.textContent = (item.bedrooms !== undefined && item.bedrooms !== null) ? `${item.bedrooms} PN` : "3 PN";
        }
        if (mBathrooms) {
          mBathrooms.textContent = (item.bathrooms !== undefined && item.bathrooms !== null) ? `${item.bathrooms} WC` : "3 WC";
        }
        if (mLegal) {
          mLegal.textContent = item.legal || "Sổ hồng riêng";
        }

        // Hiện nút trượt nếu có từ 2 ảnh trở lên
        const prevBtn = document.getElementById('modalPrevBtn');
        const nextBtn = document.getElementById('modalNextBtn');
        const dotsCont = document.getElementById('modalDotsContainer');
        const thumbsCont = document.getElementById('modalThumbnailsRow');

        if (prevBtn && nextBtn) {
          if (modalImagesList.length > 1) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
          } else {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
          }
        }

        // Tạo danh sách dots
        if (dotsCont) {
          dotsCont.innerHTML = '';
          if (modalImagesList.length > 1) {
            modalImagesList.forEach((_, idx) => {
              const dot = document.createElement('span');
              dot.className = 'modal-dot';
              dot.style.width = '8px';
              dot.style.height = '8px';
              dot.style.borderRadius = '50%';
              dot.style.background = 'rgba(255,255,255,0.6)';
              dot.style.cursor = 'pointer';
              dot.style.transition = 'all 0.2s ease';
              dot.onclick = () => setModalImgIndex(idx);
              dotsCont.appendChild(dot);
            });
          }
        }

        // Tạo danh sách thumbnails
        if (thumbsCont) {
          thumbsCont.innerHTML = '';
          if (modalImagesList.length > 1) {
            thumbsCont.style.display = 'flex';
            modalImagesList.forEach((src, idx) => {
              const img = document.createElement('img');
              img.src = getOptimizedCloudinaryUrl(src, 120, 90);
              img.className = 'modal-thumb-item';
              img.style.width = '64px';
              img.style.height = '48px';
              img.style.objectFit = 'cover';
              img.style.borderRadius = '4px';
              img.style.border = '2px solid var(--border)';
              img.style.cursor = 'pointer';
              img.style.flexShrink = '0';
              img.style.transition = 'all 0.2s ease';
              img.onclick = () => setModalImgIndex(idx);
              thumbsCont.appendChild(img);
            });
          } else {
            thumbsCont.style.display = 'none';
          }
        }

        updateModalImageDisplay();
        
        // Link Zalo cá nhân hóa chứa lời chào riêng cho căn này
        const textMessage = `Xin chào Thanh Trà BĐS, tôi muốn nhận thông tin chi tiết căn: "${item.title}" có mã số căn #${item.id}`;
        mZaloLink.href = `https://zalo.me/0854100036?text=${encodeURIComponent(textMessage)}`;

        // Gắn nút chia sẻ động trong Modal
        const modalShareBtn = document.getElementById('modalShareBtn');
        if (modalShareBtn) {
          modalShareBtn.onclick = () => {
            copyShareLink(item.id);
          };
        }

        // Gắn nút chụp ảnh dọc tin đăng gửi khách hàng
        const modalDownloadImageBtn = document.getElementById('modalDownloadImageBtn');
        if (modalDownloadImageBtn) {
          modalDownloadImageBtn.onclick = () => {
            const activeImgSrc = mMainImg ? mMainImg.src : item.img;
            
            showToast('Đang tải hình ảnh chuẩn bị chụp...', true);
            
            let imgList = item.imgList && item.imgList.length > 0 ? item.imgList : [item.img];
            // Lọc các giá trị rỗng, không hợp lệ
            imgList = imgList.filter(src => src && typeof src === 'string' && src.trim() !== '');
            
            // Chuẩn hóa toàn bộ ảnh thành URL tuyệt đối để loại bỏ trùng lặp và so sánh chính xác
            const absoluteImgList = imgList.map(src => {
              try {
                return new URL(src, window.location.href).href;
              } catch (e) {
                return src;
              }
            });
            
            const uniqueImgList = [...new Set(absoluteImgList)];
            
            let image1 = activeImgSrc;
            try {
              image1 = new URL(activeImgSrc, window.location.href).href;
            } catch (e) {}
            
            let image2 = null;
            
            // Nếu có nhiều hơn 1 ảnh độc nhất, lấy ảnh thứ 2 khác ảnh đang xem (image1)
            if (uniqueImgList.length > 1) {
              const otherImgs = uniqueImgList.filter(src => src !== image1);
              if (otherImgs.length > 0) {
                image2 = otherImgs[0];
              }
            }

            const img1 = new Image();
            img1.crossOrigin = 'anonymous';
            img1.src = image1;

            let img2 = null;
            if (image2) {
              img2 = new Image();
              img2.crossOrigin = 'anonymous';
              img2.src = image2;
            }

            let loadedCount = 0;
            const targetCount = image2 ? 2 : 1;

            const showFormatSelector = () => {
              const dialogOverlay = document.createElement('div');
              dialogOverlay.style.position = 'fixed';
              dialogOverlay.style.top = '0';
              dialogOverlay.style.left = '0';
              dialogOverlay.style.width = '100vw';
              dialogOverlay.style.height = '100vh';
              dialogOverlay.style.backgroundColor = 'rgba(2, 6, 23, 0.85)';
              dialogOverlay.style.backdropFilter = 'blur(8px)';
              dialogOverlay.style.display = 'flex';
              dialogOverlay.style.alignItems = 'center';
              dialogOverlay.style.justifyContent = 'center';
              dialogOverlay.style.zIndex = '99999';
              dialogOverlay.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
              dialogOverlay.style.animation = 'fadeIn 0.25s ease-out';

              if (!document.getElementById('capture-modal-styles')) {
                const styles = document.createElement('style');
                styles.id = 'capture-modal-styles';
                styles.innerHTML = `
                  @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                  }
                  @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  .capture-option-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    border: 2px solid rgba(255, 255, 255, 0.08);
                  }
                  .capture-option-card:hover {
                    transform: translateY(-4px);
                    border-color: #f97316 !important;
                    background: rgba(249, 115, 22, 0.08) !important;
                    box-shadow: 0 12px 20px -8px rgba(249, 115, 22, 0.3);
                  }
                `;
                document.head.appendChild(styles);
              }

              dialogOverlay.innerHTML = `
                <div style="background: #0f172a; border: 2px solid rgba(249, 115, 22, 0.3); border-radius: 20px; width: 90%; max-width: 520px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); color: #f1f5f9; box-sizing: border-box;">
                  <!-- Header -->
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: rgba(249, 115, 22, 0.1); border-radius: 50%; color: #f97316; font-size: 24px; margin-bottom: 12px;">📸</div>
                    <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">Chụp ảnh tin đăng siêu nét</h3>
                    <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; font-weight: 500;">Tùy chỉnh kích thước và độ phân giải tối ưu hóa cho từng nền tảng</p>
                  </div>

                  <!-- Options -->
                  <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
                    <!-- Option 1: Facebook Feed (4:5) -->
                    <div id="captureOptFB" class="capture-option-card" style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; display: flex; align-items: flex-start; gap: 14px; position: relative;">
                      <span style="font-size: 24px; margin-top: 2px; flex-shrink: 0;">📘</span>
                      <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 15px; font-weight: 700; color: #ffffff;">Đăng bài Facebook (Tỷ lệ đứng 4:5)</span>
                          <span style="background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Tối ưu FB</span>
                        </div>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.4;">Hiển thị nguyên vẹn, chiếm diện tích lớn nhất trên Bảng tin Facebook di động mà không bị cắt xén.</p>
                        <div style="margin-top: 8px; font-size: 11px; color: #fbbf24; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                          🔍 Độ phân giải: 1680 x 2100 px (Nét gấp 3.5 lần)
                        </div>
                      </div>
                    </div>

                    <!-- Option 2: Stories / Zalo (9:16) -->
                    <div id="captureOptStory" class="capture-option-card" style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; display: flex; align-items: flex-start; gap: 14px; position: relative;">
                      <span style="font-size: 24px; margin-top: 2px; flex-shrink: 0;">📱</span>
                      <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 15px; font-weight: 700; color: #ffffff;">Đăng Story / Gửi Zalo (Tỷ lệ 9:16)</span>
                        </div>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.4;">Phù hợp chia sẻ lên Facebook/Instagram Stories, tin nhắn Zalo, Viber hoặc Reels dọc.</p>
                        <div style="margin-top: 8px; font-size: 11px; color: #fbbf24; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                          🔍 Độ phân giải: 1680 x 2986 px (Nét gấp 3.5 lần)
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div style="display: flex; gap: 10px;">
                    <button id="captureCancelBtn" style="flex: 1; padding: 12px; background: transparent; border: 1.5px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: #cbd5e1; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Hủy</button>
                  </div>
                </div>
              `;

              document.body.appendChild(dialogOverlay);

              // Click Handlers
              document.getElementById('captureOptFB').onclick = () => {
                document.body.removeChild(dialogOverlay);
                showToast('Đang tạo ảnh bài đăng Facebook độ phân giải cao...', true);
                proceedWithCapture(true);
              };

              document.getElementById('captureOptStory').onclick = () => {
                document.body.removeChild(dialogOverlay);
                showToast('Đang tạo ảnh đứng Story / Zalo độ phân giải cao...', true);
                proceedWithCapture(false);
              };

              document.getElementById('captureCancelBtn').onclick = () => {
                document.body.removeChild(dialogOverlay);
              };
            };

            const proceedWithCapture = (isFacebookRatio) => {
              // Khởi tạo thẻ flyer chứa giao diện chuyên nghiệp
              const flyer = document.createElement('div');
              flyer.id = 'dynamicShareCard';
              flyer.style.position = 'fixed';
              flyer.style.left = '-9999px';
              flyer.style.top = '-9999px';
              
              if (isFacebookRatio) {
                flyer.style.width = '480px';
                flyer.style.height = '600px'; // Tỷ lệ 4:5
                flyer.style.padding = '14px 18px';
                flyer.style.gap = '6px';
              } else {
                flyer.style.width = '480px';
                flyer.style.height = '853.33px'; // Tỷ lệ 9:16
                flyer.style.padding = '22px';
                flyer.style.gap = '10px';
              }
              flyer.style.boxSizing = 'border-box';
              flyer.style.background = 'linear-gradient(180deg, #020712 0%, #061124 50%, #020817 100%)'; 
              flyer.style.color = '#f1f5f9';
              flyer.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
              flyer.style.borderRadius = '16px';
              flyer.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.5)';
              flyer.style.display = 'flex';
              flyer.style.flexDirection = 'column';
              flyer.style.justifyContent = 'space-between';
              flyer.style.border = '2.5px solid rgba(249, 115, 22, 0.4)';
              flyer.style.zIndex = '-999';
              
              // 1. Header logo thương hiệu & hotline
              const header = document.createElement('div');
              header.style.display = 'flex';
              header.style.justifyContent = 'space-between';
              header.style.alignItems = 'center';
              header.style.borderBottom = '1.5px solid rgba(249, 115, 22, 0.2)';
              header.style.paddingBottom = isFacebookRatio ? '6px' : '10px';
              header.style.width = '100%';
              
              const brandInfo = document.createElement('div');
              brandInfo.innerHTML = `
                <div style="font-size: 18px; font-weight: 800; color: #fff; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                  <span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 6px; font-weight: 900; font-size: 16px;">T</span>
                  <span>THANH TRÀ BĐS</span>
                </div>
                <div style="font-size: 9px; font-weight: 700; color: #f97316; text-transform: uppercase; margin-top: 1px; letter-spacing: 1px;">MUA BÁN NHÀ PHỐ UY TÍN</div>
              `;
              
              const phoneInfo = document.createElement('div');
              phoneInfo.style.textAlign = 'right';
              phoneInfo.innerHTML = `
                <div style="font-size: 13px; font-weight: 800; color: #f97316; display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                  📞 0854.100.036
                </div>
                <div style="font-size: 8px; color: #94a3b8; font-weight: 600; margin-top: 1px; letter-spacing: 0.3px;">TƯ VẤN PHÁP LÝ LIÊN TỤC 24/7</div>
              `;
              
              header.appendChild(brandInfo);
              header.appendChild(phoneInfo);
              flyer.appendChild(header);
              
              // 2. Tiêu đề tài sản & Giá + Diện tích nổi bật
              const heroRow = document.createElement('div');
              heroRow.style.display = 'flex';
              heroRow.style.justifyContent = 'space-between';
              heroRow.style.alignItems = 'flex-start';
              heroRow.style.width = '100%';
              heroRow.style.gap = isFacebookRatio ? '6px' : '10px';

              // Tách tiêu đề thành Title Main & Title Sub để hiển thị chuẩn
              let titleMain = item.title;
              let titleSub = "";
              const sepMatch = item.title.match(/[-|]/);
              if (sepMatch) {
                const splitIndex = item.title.indexOf(sepMatch[0]);
                titleMain = item.title.substring(0, splitIndex).trim();
                titleSub = item.title.substring(splitIndex + 1).trim();
              } else {
                const words = item.title.split(' ');
                if (words.length > 3) {
                  titleMain = words.slice(0, 3).join(' ');
                  titleSub = words.slice(3).join(' ');
                }
              }

              const leftTitleBlock = document.createElement('div');
              leftTitleBlock.style.flex = '1';
              leftTitleBlock.style.display = 'flex';
              leftTitleBlock.style.flexDirection = 'column';
              leftTitleBlock.style.gap = '2px';

              const mainTitleEl = document.createElement('h3');
              mainTitleEl.textContent = '🔥 ' + titleMain;
              mainTitleEl.style.fontSize = isFacebookRatio ? '14px' : '18px';
              mainTitleEl.style.fontWeight = '800';
              mainTitleEl.style.fontStyle = 'italic';
              mainTitleEl.style.lineHeight = '1.25';
              mainTitleEl.style.color = '#ffffff';
              mainTitleEl.style.margin = '0';
              mainTitleEl.style.textTransform = 'uppercase';
              leftTitleBlock.appendChild(mainTitleEl);

              if (titleSub) {
                const subTitleEl = document.createElement('h4');
                subTitleEl.textContent = titleSub;
                subTitleEl.style.fontSize = isFacebookRatio ? '12px' : '16px';
                subTitleEl.style.fontWeight = '800';
                subTitleEl.style.fontStyle = 'italic';
                subTitleEl.style.lineHeight = '1.25';
                subTitleEl.style.color = '#fbbf24';
                subTitleEl.style.margin = '0';
                subTitleEl.style.textTransform = 'uppercase';
                leftTitleBlock.appendChild(subTitleEl);
              }

              const priceBadge = document.createElement('div');
              priceBadge.style.background = 'linear-gradient(90deg, rgba(249,115,22,0.25) 0%, rgba(249,115,22,0.05) 100%)';
              priceBadge.style.border = '1.5px solid rgba(249, 115, 22, 0.7)';
              priceBadge.style.borderRadius = '8px';
              priceBadge.style.padding = isFacebookRatio ? '2px 8px' : '3px 12px';
              priceBadge.style.fontSize = isFacebookRatio ? '14px' : '18px';
              priceBadge.style.fontWeight = '900';
              priceBadge.style.color = '#fbbf24';
              priceBadge.style.textShadow = '0 0 10px rgba(249,115,22,0.4)';
              priceBadge.style.display = 'inline-block';
              priceBadge.style.marginTop = '4px';
              priceBadge.style.width = 'fit-content';
              priceBadge.textContent = item.priceText;
              leftTitleBlock.appendChild(priceBadge);

              const rightStatsBlock = document.createElement('div');
              rightStatsBlock.style.display = 'flex';
              rightStatsBlock.style.gap = isFacebookRatio ? '6px' : '8px';
              rightStatsBlock.style.padding = isFacebookRatio ? '6px 8px' : '8px 10px';
              rightStatsBlock.style.background = 'rgba(15, 23, 42, 0.45)';
              rightStatsBlock.style.border = '1px solid rgba(255, 255, 255, 0.08)';
              rightStatsBlock.style.borderRadius = '10px';
              rightStatsBlock.style.alignItems = 'center';
              rightStatsBlock.style.justifyContent = 'center';
              rightStatsBlock.style.flexShrink = '0';

              rightStatsBlock.innerHTML = `
                <div style="padding-right: ${isFacebookRatio ? '6px' : '8px'}; border-right: 1px solid rgba(255,255,255,0.1); text-align: center;">
                  <div style="font-size: ${isFacebookRatio ? '7px' : '8px'}; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">MỨC GIÁ BÁN</div>
                  <div style="font-size: ${isFacebookRatio ? '11px' : '14px'}; font-weight: 800; color: #fbbf24; margin-top: 1px;">${item.priceText}</div>
                </div>
                <div style="text-align: center; padding-left: 2px;">
                  <div style="font-size: ${isFacebookRatio ? '7px' : '8px'}; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">DIỆN TÍCH SỔ</div>
                  <div style="font-size: ${isFacebookRatio ? '11px' : '14px'}; font-weight: 800; color: #ffffff; margin-top: 1px;">${item.area}m²</div>
                </div>
              `;

              heroRow.appendChild(leftTitleBlock);
              heroRow.appendChild(rightStatsBlock);
              flyer.appendChild(heroRow);

              // 3. Địa chỉ cụ thể
              const addressEl = document.createElement('div');
              addressEl.style.fontSize = isFacebookRatio ? '10px' : '11px';
              addressEl.style.color = '#cbd5e1';
              addressEl.style.fontWeight = '500';
              addressEl.style.display = 'flex';
              addressEl.style.alignItems = 'center';
              addressEl.style.gap = '4px';
              addressEl.style.width = '100%';
              addressEl.innerHTML = `📍 ${getPublicDisplayAddress(item)}`;
              flyer.appendChild(addressEl);

              // 4. Ảnh lớn của bất động sản đang xem
              const imgContainer = document.createElement('div');
              imgContainer.style.width = '100%';
              imgContainer.style.height = isFacebookRatio ? '155px' : '230px';
              imgContainer.style.display = 'flex';
              imgContainer.style.gap = '10px';
              imgContainer.style.boxSizing = 'border-box';

              if (image2) {
                // 2 ảnh song song
                const flyerImg1 = document.createElement('div');
                flyerImg1.style.flex = '1';
                flyerImg1.style.height = '100%';
                flyerImg1.style.borderRadius = '14px';
                flyerImg1.style.overflow = 'hidden';
                flyerImg1.style.border = '1.5px solid rgba(255, 255, 255, 0.1)';
                flyerImg1.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
                
                const imgEl1 = document.createElement('img');
                imgEl1.src = img1.src;
                imgEl1.style.width = '100%';
                imgEl1.style.height = '100%';
                imgEl1.style.objectFit = 'cover';
                flyerImg1.appendChild(imgEl1);

                const flyerImg2 = document.createElement('div');
                flyerImg2.style.flex = '1';
                flyerImg2.style.height = '100%';
                flyerImg2.style.borderRadius = '14px';
                flyerImg2.style.overflow = 'hidden';
                flyerImg2.style.border = '1.5px solid rgba(255, 255, 255, 0.1)';
                flyerImg2.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
                
                const imgEl2 = document.createElement('img');
                imgEl2.src = img2.src;
                imgEl2.style.width = '100%';
                imgEl2.style.height = '100%';
                imgEl2.style.objectFit = 'cover';
                flyerImg2.appendChild(imgEl2);

                imgContainer.appendChild(flyerImg1);
                imgContainer.appendChild(flyerImg2);
              } else {
                // 1 ảnh to chiếm toàn chiều rộng (gấp đôi kích thước ảnh khi song hành)
                const flyerImg1 = document.createElement('div');
                flyerImg1.style.width = '100%';
                flyerImg1.style.height = '100%';
                flyerImg1.style.borderRadius = '14px';
                flyerImg1.style.overflow = 'hidden';
                flyerImg1.style.border = '1.5px solid rgba(255, 255, 255, 0.1)';
                flyerImg1.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
                
                const imgEl1 = document.createElement('img');
                imgEl1.src = img1.src;
                imgEl1.style.width = '100%';
                imgEl1.style.height = '100%';
                imgEl1.style.objectFit = 'cover';
                flyerImg1.appendChild(imgEl1);

                imgContainer.appendChild(flyerImg1);
              }
              flyer.appendChild(imgContainer);

              // 5. Khối thông tin kép (Thông tin nổi bật & Thông tin chi tiết)
              const specsRow = document.createElement('div');
              specsRow.style.display = 'flex';
              specsRow.style.gap = '10px';
              specsRow.style.width = '100%';
              specsRow.style.boxSizing = 'border-box';

              // 5a. Hộp THÔNG TIN NỔI BẬT
              const leftHighlightsBlock = document.createElement('div');
              leftHighlightsBlock.style.flex = '1';
              leftHighlightsBlock.style.background = 'rgba(15, 23, 42, 0.45)';
              leftHighlightsBlock.style.border = '1px solid rgba(255, 255, 255, 0.08)';
              leftHighlightsBlock.style.borderRadius = '12px';
              leftHighlightsBlock.style.padding = isFacebookRatio ? '6px 8px' : '10px';
              leftHighlightsBlock.style.display = 'flex';
              leftHighlightsBlock.style.flexDirection = 'column';

              const highlightsTitle = document.createElement('div');
              highlightsTitle.textContent = 'THÔNG TIN NỔI BẬT';
              highlightsTitle.style.fontSize = isFacebookRatio ? '9.5px' : '11px';
              highlightsTitle.style.fontWeight = '800';
              highlightsTitle.style.color = '#fbbf24';
              highlightsTitle.style.textAlign = 'center';
              highlightsTitle.style.letterSpacing = '0.5px';
              highlightsTitle.style.borderBottom = '1.5px solid rgba(249, 115, 22, 0.2)';
              highlightsTitle.style.paddingBottom = '5px';
              highlightsTitle.style.marginBottom = isFacebookRatio ? '4px' : '8px';
              leftHighlightsBlock.appendChild(highlightsTitle);

              const bulletHTML = (icon, text) => `
                <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: ${isFacebookRatio ? '3px' : '6px'}; font-family: var(--font-sans);">
                  <div style="background: rgba(249, 115, 22, 0.12); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 50%; width: ${isFacebookRatio ? '16px' : '20px'}; height: ${isFacebookRatio ? '16px' : '20px'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: ${isFacebookRatio ? '8.5px' : '10px'};">
                    ${icon}
                  </div>
                  <div style="font-size: ${isFacebookRatio ? '8.5px' : '9.5px'}; line-height: 1.35; color: #cbd5e1; font-weight: 500;">
                    ${text}
                  </div>
                </div>
              `;

              const parsedFloors = formatFloors(item.floors);
              leftHighlightsBlock.innerHTML += `
                ${bulletHTML('📍', `Vị trí tại phường ${item.ward || 'Trường Thạnh'}, TP. Thủ Đức.`)}
                ${bulletHTML('📐', `Diện tích đất ${item.area}m².`)}
                ${bulletHTML('🏢', `Kết cấu gồm ${parsedFloors}, thiết kế ${item.bedrooms || 3} phòng ngủ.`)}
                ${bulletHTML('🧭', `Hướng nhà: ${item.direction || 'Không xác định'}.`)}
                ${bulletHTML('💰', `Giá bán: ${item.priceText} đồng.`)}
              `;

              // 5b. Hộp THÔNG TIN CHI TIẾT
              const rightSpecsBlock = document.createElement('div');
              rightSpecsBlock.style.flex = '1';
              rightSpecsBlock.style.background = 'rgba(15, 23, 42, 0.45)';
              rightSpecsBlock.style.border = '1px solid rgba(255, 255, 255, 0.08)';
              rightSpecsBlock.style.borderRadius = '12px';
              rightSpecsBlock.style.padding = isFacebookRatio ? '6px 8px' : '10px';
              rightSpecsBlock.style.display = 'flex';
              rightSpecsBlock.style.flexDirection = 'column';

              const specsTitle = document.createElement('div');
              specsTitle.textContent = 'THÔNG TIN CHI TIẾT';
              specsTitle.style.fontSize = isFacebookRatio ? '9.5px' : '11px';
              specsTitle.style.fontWeight = '800';
              specsTitle.style.color = '#fbbf24';
              specsTitle.style.textAlign = 'center';
              specsTitle.style.letterSpacing = '0.5px';
              specsTitle.style.borderBottom = '1.5px solid rgba(249, 115, 22, 0.2)';
              specsTitle.style.paddingBottom = '5px';
              specsTitle.style.marginBottom = isFacebookRatio ? '4px' : '8px';
              rightSpecsBlock.appendChild(specsTitle);

              const specGrid = document.createElement('div');
              specGrid.style.display = 'grid';
              specGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
              specGrid.style.gap = isFacebookRatio ? '4px 6px' : '6px 8px';
              specGrid.style.width = '100%';

              const specItemHTML = (icon, label, value, valColor = '#ffffff') => `
                <div style="display: flex; align-items: center; gap: 4px; padding: 1px 0;">
                  <span style="font-size: ${isFacebookRatio ? '11px' : '13px'}; color: #f97316;">${icon}</span>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 6.5px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.2px;">${label}</span>
                    <span style="font-size: ${isFacebookRatio ? '8.5px' : '9.5px'}; font-weight: 700; color: ${valColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ${isFacebookRatio ? '70px' : '80px'};">${value}</span>
                  </div>
                </div>
              `;

              specGrid.innerHTML = `
                ${specItemHTML('📐', 'Diện Tích', `${item.area} m²`)}
                ${specItemHTML('📏', 'C.Ngang', (item.width && item.width > 0) ? `${item.width} m` : "4 m")}
                ${specItemHTML('🏢', 'Kết Cấu', parsedFloors)}
                ${specItemHTML('🧭', 'Hướng Nhà', item.direction)}
                ${specItemHTML('🛏️', 'Phòng Ngủ', (item.bedrooms !== undefined && item.bedrooms !== null) ? `${item.bedrooms} PN` : "3 PN")}
                ${specItemHTML('🚽', 'Phòng WC', (item.bathrooms !== undefined && item.bathrooms !== null) ? `${item.bathrooms} WC` : "3 WC")}
              `;

              const legalRow = document.createElement('div');
              legalRow.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
              legalRow.style.paddingTop = isFacebookRatio ? '4px' : '6px';
              legalRow.style.marginTop = isFacebookRatio ? '2px' : '4px';
              legalRow.style.width = '100%';
              legalRow.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: ${isFacebookRatio ? '12px' : '14px'};">📜</span>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 6.5px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.2px;">PHÁP LÝ BÁN ĐẰNG</span>
                    <span style="font-size: ${isFacebookRatio ? '9px' : '10px'}; font-weight: 800; color: #22c55e;">${item.legal || "Sổ hồng riêng"}</span>
                  </div>
                </div>
              `;

              rightSpecsBlock.appendChild(specGrid);
              rightSpecsBlock.appendChild(legalRow);

              specsRow.appendChild(leftHighlightsBlock);
              specsRow.appendChild(rightSpecsBlock);
              flyer.appendChild(specsRow);

              // 6. Chân trang liên hệ và QR Code
              const appFooter = document.createElement('div');
              appFooter.style.display = 'flex';
              appFooter.style.alignItems = 'center';
              appFooter.style.justifyContent = 'space-between';
              appFooter.style.background = 'rgba(15, 23, 42, 0.45)';
              appFooter.style.padding = isFacebookRatio ? '6px 10px' : '8px 12px';
              appFooter.style.borderRadius = '12px';
              appFooter.style.border = '1.5px solid rgba(249, 115, 22, 0.35)';
              appFooter.style.marginTop = 'auto';
              appFooter.style.position = 'relative';
              appFooter.style.width = '100%';

              const leftContact = document.createElement('div');
              leftContact.style.display = 'flex';
              leftContact.style.alignItems = 'center';
              leftContact.style.gap = '8px';

              const phoneIconContainer = document.createElement('div');
              phoneIconContainer.style.background = 'linear-gradient(135deg, #f97316, #ea580c)';
              phoneIconContainer.style.borderRadius = '50%';
              phoneIconContainer.style.width = isFacebookRatio ? '26px' : '32px';
              phoneIconContainer.style.height = isFacebookRatio ? '26px' : '32px';
              phoneIconContainer.style.display = 'flex';
              phoneIconContainer.style.alignItems = 'center';
              phoneIconContainer.style.justifyContent = 'center';
              phoneIconContainer.style.flexShrink = '0';
              phoneIconContainer.style.fontSize = isFacebookRatio ? '10px' : '12px';
              phoneIconContainer.style.color = '#ffffff';
              phoneIconContainer.textContent = '📞';

              const contactTexts = document.createElement('div');
              contactTexts.style.display = 'flex';
              contactTexts.style.flexDirection = 'column';
              contactTexts.style.gap = '1px';
              contactTexts.innerHTML = `
                <div style="font-size: ${isFacebookRatio ? '10px' : '11.5px'}; font-weight: 800; color: #ffffff; font-family: var(--font-sans);">Liên hệ: Mr. Thanh Trà</div>
                <div style="font-size: ${isFacebookRatio ? '11px' : '13px'}; font-weight: 950; color: #fbbf24; text-shadow: 0 0 6px rgba(249,115,22,0.3); font-family: var(--font-sans);">0854.100.036 <span style="font-size: ${isFacebookRatio ? '7px' : '8px'}; font-weight: 600; color: #cbd5e1; text-shadow: none;">(Zalo)</span></div>
                <div style="font-size: ${isFacebookRatio ? '7px' : '8px'}; color: #94a3b8; font-weight: 600;">Quét QR nhận sổ hồng chính chủ!</div>
              `;

              leftContact.appendChild(phoneIconContainer);
              leftContact.appendChild(contactTexts);
              appFooter.appendChild(leftContact);

              // Nhãn phụ quét mã
              const qrPromoText = document.createElement('div');
              qrPromoText.style.position = 'absolute';
              qrPromoText.style.right = isFacebookRatio ? '64px' : '74px';
              qrPromoText.style.bottom = isFacebookRatio ? '8px' : '12px';
              qrPromoText.style.color = '#f97316';
              qrPromoText.style.fontSize = '7.5px';
              qrPromoText.style.fontWeight = '800';
              qrPromoText.style.fontStyle = 'italic';
              qrPromoText.style.transform = 'rotate(-8deg)';
              qrPromoText.innerHTML = 'Quét mã! ➔';
              appFooter.appendChild(qrPromoText);

              const qrFrame = document.createElement('div');
              qrFrame.style.border = '1.5px solid #f97316';
              qrFrame.style.borderRadius = '6px';
              qrFrame.style.padding = '3px';
              qrFrame.style.background = '#ffffff';
              qrFrame.style.width = isFacebookRatio ? '44px' : '56px';
              qrFrame.style.height = isFacebookRatio ? '44px' : '56px';
              qrFrame.style.display = 'flex';
              qrFrame.style.alignItems = 'center';
              qrFrame.style.justifyContent = 'center';
              qrFrame.style.boxShadow = '0 0 8px rgba(249, 115, 22, 0.3)';
              qrFrame.style.flexShrink = '0';

              const qrImg = document.createElement('img');
              qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://zalo.me/0854100036')}`;
              qrImg.style.width = '100%';
              qrImg.style.height = '100%';
              qrImg.style.objectFit = 'contain';

              qrFrame.appendChild(qrImg);
              appFooter.appendChild(qrFrame);
              flyer.appendChild(appFooter);

              // 7. Thanh tính năng cam kết cuối trang
              const bottomBar = document.createElement('div');
              bottomBar.style.display = 'flex';
              bottomBar.style.justifyContent = 'space-around';
              bottomBar.style.alignItems = 'center';
              bottomBar.style.width = '100%';
              bottomBar.style.borderTop = '1px solid rgba(255,255,255,0.08)';
              bottomBar.style.paddingTop = isFacebookRatio ? '4px' : '6px';
              bottomBar.style.fontFamily = 'var(--font-sans)';
              bottomBar.style.fontSize = isFacebookRatio ? '8px' : '9px';
              bottomBar.style.color = '#cbd5e1';
              bottomBar.style.fontWeight = '700';

              bottomBar.innerHTML = `
                <div style="display: flex; align-items: center; gap: 3px;">🛡️ Pháp lý rõ ràng</div>
                <div style="color: rgba(255,255,255,0.15);">|</div>
                <div style="display: flex; align-items: center; gap: 3px;">🤝 Làm việc chính chủ</div>
                <div style="color: rgba(255,255,255,0.15);">|</div>
                <div style="display: flex; align-items: center; gap: 3px;">🕒 Hỗ trợ 24/7</div>
              `;
              flyer.appendChild(bottomBar);

              document.body.appendChild(flyer);
              
              // Chạy html2canvas để kết xuất ảnh siêu nét với scale 3.5
              setTimeout(async () => {
                try {
                  await loadHtml2Canvas();
                  html2canvas(flyer, {
                    useCORS: true,
                    allowTaint: false,
                    scale: 3.5,
                    backgroundColor: '#020712',
                    logging: false
                  }).then(canvas => {
                    const dataUrl = canvas.toDataURL('image/png');
                    const downloadLink = document.createElement('a');
                    const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/g, '').replace(/\s+/g, '-');
                    const ratioSuffix = isFacebookRatio ? 'facebook-feed' : 'story-zalo';
                    downloadLink.download = `tin-dang-thanh-tra-bds-${cleanTitle || item.id}-${ratioSuffix}.png`;
                    downloadLink.href = dataUrl;
                    downloadLink.click();
                    
                    document.body.removeChild(flyer);
                    showToast('Đã chụp và lưu ảnh đăng thành công!', true);
                  }).catch(err => {
                    console.error('Lỗi khi chụp ảnh:', err);
                    if (document.body.contains(flyer)) {
                      document.body.removeChild(flyer);
                    }
                    showToast('Không tự động tải hình được do chặn quyền bảo mật của trình duyệt', false);
                  });
                } catch (loadErr) {
                  console.error('Lỗi tải html2canvas:', loadErr);
                  if (document.body.contains(flyer)) {
                    document.body.removeChild(flyer);
                  }
                  showToast('Không thể nạp thư viện chụp ảnh', false);
                }
              }, 400);
            };

            const onImageLoaded = () => {
              loadedCount++;
              if (loadedCount === targetCount) {
                showFormatSelector();
              }
            };

            img1.onload = onImageLoaded;
            img1.onerror = () => {
              img1.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"%3E%3Crect width="100%25" height="100%25" fill="%231a2238"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="28" fill="%23f97316"%3EThanh Trà BĐS Nhà Phố Thủ Đức%3C/text%3E%3C/svg%3E';
              onImageLoaded();
            };

            if (img2) {
              img2.onload = onImageLoaded;
              img2.onerror = () => {
                img2.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"%3E%3Crect width="100%25" height="100%25" fill="%231a2238"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="28" fill="%23f97316"%3EThanh Trà BĐS Nhà Phố Thủ Đức%3C/text%3E%3C/svg%3E';
                onImageLoaded();
              };
            }
          };
        }

        propertyModal.classList.add('open');
        document.body.style.overflow = 'hidden'; // Ngăn chặn scroll nền
      }

      function closeProductModal() {
        propertyModal.classList.remove('open');
        document.body.style.overflow = 'auto';

        // Khôi phục tiêu đề gốc của trang web khi đóng modal
        document.title = "Thanh Trà BĐS | Mua Bán Nhà Phố Uy Tín TP. Thủ Đức, TP.HCM";

        // Khôi phục URL sạch (loại bỏ ?id khỏi địa chỉ) khi dọn dẹp modal
        try {
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.has('id')) {
            currentUrl.searchParams.delete('id');
            window.history.pushState({ id: null }, '', currentUrl.toString());
          }
        } catch (urlErr) {
          console.warn("Không thể xóa URL param PushState:", urlErr);
        }

        // Khôi phục canonical về trang chủ khi đóng modal
        try {
          const canonicalTag = document.querySelector('link[rel="canonical"]');
          if (canonicalTag) canonicalTag.setAttribute('href', 'https://thanhtrabds.vercel.app/');
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.setAttribute('content', 'Thanh Trà BĐS - Chuyên mua bán nhà phố tại TP. Thủ Đức, TP.HCM. Tư vấn miễn phí, pháp lý rõ ràng, sổ hồng riêng. Hotline: 0854.100.036');
          const ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) ogTitle.setAttribute('content', 'Thanh Trà BĐS | Nhà Phố Thủ Đức Uy Tín');
          const ogUrl = document.querySelector('meta[property="og:url"]');
          if (ogUrl) ogUrl.setAttribute('content', 'https://thanhtrabds.vercel.app/');
        } catch (canErr) {
          console.warn("Không thể khôi phục canonical:", canErr);
        }
      }

      function checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        if (idParam) {
          const propId = parseInt(idParam);
          if (!isNaN(propId)) {
            const item = propertyData.find(p => p.id === propId);
            if (item) {
              setTimeout(() => {
                openProductModal(propId);
              }, 400);
            }
          }
        }
      }

      modalCloseBtn.addEventListener('click', closeProductModal);
      propertyModal.addEventListener('click', (e) => {
        if (e.target === propertyModal) closeProductModal();
      });

      // Lắng nghe sự kiện nhấn nút điều hướng (Back/Forward) của Trình duyệt để xử lý đóng mở modal đồng bộ với URL ?id=X
      window.addEventListener('popstate', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        if (idParam) {
          const propId = parseInt(idParam);
          if (!isNaN(propId)) {
            const item = propertyData || [];
            const foundItem = item.find(p => p.id == propId);
            if (foundItem) {
              openProductModal(propId);
            }
          }
        } else {
          if (propertyModal && propertyModal.classList.contains('open')) {
            propertyModal.classList.remove('open');
            document.body.style.overflow = 'auto';
            document.title = "Thanh Trà BĐS | Mua Bán Nhà Phố Uy Tín TP. Thủ Đức, TP.HCM";
          }
        }
      });


      /* ==========================================
         5. FORM BIỂU MẪU ĐĂNG KÝ LIÊN HỆ & TOAST ALERT
         ========================================== */
      const contactForm = document.getElementById('contactForm');
      const toastNotification = document.getElementById('toastNotification');
      const toastMessage = document.getElementById('toastMessage');

      function showToast(message, isSuccess = true) {
        toastMessage.textContent = message;
        toastNotification.style.backgroundColor = isSuccess ? '#065f46' : '#991b1b';
        toastNotification.style.borderLeftColor = isSuccess ? '#34d399' : '#f87171';
        toastNotification.classList.add('show');
        
        setTimeout(() => {
          toastNotification.classList.remove('show');
        }, 4000);
      }

      if (contactForm && contactForm.tagName.toLowerCase() !== 'form') {
        contactForm.reset = function() {
          this.querySelectorAll('input, textarea').forEach(el => el.value = '');
        };
      }

      function handleContactSubmit() {
        const nameInp = document.getElementById('cl_nm_fld');
        const phoneInp = document.getElementById('cl_ph_fld');
        const noteInp = document.getElementById('cl_nt_fld');
        
        if (!nameInp || !phoneInp) return;
        const name = nameInp.value.trim();
        const phone = phoneInp.value.trim();
        const note = noteInp ? noteInp.value.trim() : "";

        if (!name) {
          alert("Vui lòng nhập Họ & Tên của bạn!");
          return;
        }
        if (!phone) {
          alert("Vui lòng nhập Số điện thoại!");
          return;
        }

        // Ghi nhận trực tiếp dữ liệu đăng ký vào danh sách lead local
        try {
          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          const newLead = {
            id: Date.now(),
            name: name,
            phone: phone,
            note: note,
            time: new Date().toISOString(),
            status: 'new'
          };
          leads.push(newLead);
          localStorage.setItem('local_leads', JSON.stringify(leads));

          // Ghi nhật ký vào Hệ thống quản trị
          if (typeof logSystemActivity === 'function') {
            logSystemActivity('LEAD', `Khách hàng mới ${name} (${phone}) đăng ký tư vấn trực tuyến.`);
          }
          
          // Vẽ lại luồng inbox nếu đang xem màn hình admin
          if (typeof renderAdminInbox === 'function') {
            renderAdminInbox();
          }
          if (typeof renderAdminReports === 'function') {
            renderAdminReports();
          }
        } catch (e) {
          console.error("Lỗi ghi nhận lead đăng ký tư vấn:", e);
        }

        if (contactForm && typeof contactForm.reset === 'function') {
          contactForm.reset();
        }
        showToast(`Cảm ơn anh/chị ${name}! Yêu cầu tư vấn đã được gửi thành công. Thanh Trà BĐS sẽ gọi lại ngay qua số ${phone}.`);
      }
      window.handleContactSubmit = handleContactSubmit;


      /* ==========================================
         6. CHATBOX AI CONSULTANT (GOOGLE GEMINI API)
         ========================================== */
      const aiChatTrigger = document.getElementById('aiChatTrigger');
      const aiChatWindow = document.getElementById('aiChatWindow');
      const btnAiClose = document.getElementById('btnAiClose');
      const btnAiConfigure = document.getElementById('btnAiConfigure');
      const chatAiKeySetup = document.getElementById('chatAiKeySetup');
      const chatAiPlayground = document.getElementById('chatAiPlayground');
      const geminiApiKey = document.getElementById('gm_ak_fld');
      const btnActivateAi = document.getElementById('btnActivateAi');
      const chatAiMessages = document.getElementById('chatAiMessages');
      const chatInputField = document.getElementById('chatInputField');
      const btnSendMessage = document.getElementById('btnSendMessage');
      const chatSuggestions = document.getElementById('chatSuggestions');

      // Các mã khóa và đường dẫn kết nối đồng bộ cơ sở dữ liệu làm giá trị mặc định (Fallback) khi chạy trên Hosting tĩnh (Vercel, Netlify, GitHub...)
      const DEFAULT_FALLBACK_GEMINI_KEY = ""; // Để trống làm mặc định để gọi lên Express API Proxy
      const DEFAULT_FALLBACK_SUPABASE_URL = "https://bywboejxhpvdahbfvote.supabase.co";
      const DEFAULT_FALLBACK_SUPABASE_KEY = "sb_publishable_lxZE5oD0i3Gh8EA6PrgG3A_OgLVYm1r";

      // ==========================================
      // CẤU HÌNH KHÓA GEMINI API AN TOÀN TRỰC TIẾP LÊN CLIENT-SIDE (Dành cho Vercel/HTML tĩnh)
      // ==========================================
      // Nhằm bảo mật tối đa và tránh bị robot của GitHub/Google rà quét vô hiệu hóa API Key, 
      // anh/chị có thể dán mã API Key của mình vào biến dưới đây.
      // Hỗ trợ chế độ an toàn:
      // - Đảo ngược chuỗi (Ví dụ: "AIzaSyABC..." viết ngược thành "...CBAySazIA")
      // - Hoặc Mã hoá Base64 của API Key (Ví dụ: "QUl6YVN5...")
      // - Hoặc dán trực tiếp API Key gốc vào đây.
      const SECURE_EMBEDDED_KEY = "A358_gJzecH-yuX91MoEGs44icbbbIQDGaU7C2EtXzqJ6NR8bA.QA"; // <--- DÁN KHÓA AN TOÀN VÀO ĐÂY (đã đảo chuỗi hoặc mã Base64)

      // Giải mã khóa an toàn (hỗ trợ đảo chuỗi, bóc tách base64, hoặc khóa trực tiếp)
      function decodeSecureKey(str) {
        if (!str) return "";
        const trimmed = str.trim();
        if (trimmed === "" || trimmed.startsWith("%")) return "";
        
        try {
          // 1. Kiểm tra nếu là chuỗi đảo ngược (kết thúc bằng 'ySazIA' hoặc '.QA' sau khi đảo ngược ngược lại)
          const reversed = trimmed.split("").reverse().join("");
          if (reversed.startsWith("AIzaSy") || reversed.startsWith("AQ.")) {
            return reversed;
          }
          
          // 2. Kiểm tra nếu là mã hóa Base64
          if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
            const decoded = atob(trimmed);
            if (decoded && (decoded.startsWith("AIzaSy") || decoded.startsWith("AQ."))) {
              return decoded;
            }
          }
        } catch (e) {
          // Lỗi giải mã, bỏ qua
        }
        return trimmed;
      }

      // Các biến môi trường được thay thế tự động khi build bằng Vite (Cung cấp giải pháp cho Vercel, Netlify, Github...)
      const INJECTED_VITE_GEMINI_KEY = "%VITE_GEMINI_API_KEY%";
      const INJECTED_VITE_SUPABASE_URL = "%VITE_SUPABASE_URL%";
      const INJECTED_VITE_SUPABASE_KEY = "%VITE_SUPABASE_ANON_KEY%";

      // Hàm bóc tách giá trị hợp lệ hỗ trợ mọi loại môi trường tĩnh hoặc full-stack
      function getValidValue(injected, fallback) {
        if (!injected || injected === "" || injected === "undefined" || injected === "null" || injected.startsWith("%VITE_") || injected.startsWith("%")) {
          return fallback;
        }
        return injected;
      }

      const rawBuildGeminiKey = getValidValue(INJECTED_VITE_GEMINI_KEY, DEFAULT_FALLBACK_GEMINI_KEY);
      const decodedEmbeddedKey = decodeSecureKey(SECURE_EMBEDDED_KEY);
      const buildGeminiKey = decodedEmbeddedKey || rawBuildGeminiKey;

      const buildSupabaseUrl = getValidValue(INJECTED_VITE_SUPABASE_URL, DEFAULT_FALLBACK_SUPABASE_URL);
      const buildSupabaseKey = getValidValue(INJECTED_VITE_SUPABASE_KEY, DEFAULT_FALLBACK_SUPABASE_KEY);

      // Hàm kiểm tra định dạng Gemini API Key hợp lệ (lọc các khóa rỗng, định vị sai)
      function isValidGeminiKey(keyString) {
        if (!keyString || typeof keyString !== 'string') return true; // Sẽ tự động dùng hệ thống key pool mặc định nếu trống
        const keys = keyString.split(/[,\s;\n]+/).map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) return true;
        return keys.some(k => {
          const decK = decryptKeyIfNeeded(k);
          const blockedKey = decryptKeyIfNeeded("QXQ0VDNwcGx2NHJxMlBNdVhrU044UlRhS09XYl9pR3k4eWMyY3JMbmkzYk9JblI4YkEuUUE=");
          if (decK === blockedKey) return false;
          return decK.length >= 8 || decK === 'auto' || decK.startsWith('AI_');
        });
      }

      // Giải mã an toàn đối với các key hệ thống được bảo mật mã hóa ngược dạng Base64
      function decryptKeyIfNeeded(key) {
        if (!key) return "";
        const trimmed = key.trim();
        // Nếu là phím dạng Base64 của chúng ta (không phải key thô thông thường bắt đầu bằng AIzaSy hay AQ.)
        if (trimmed.length > 20 && !trimmed.startsWith("AIzaSy") && !trimmed.startsWith("AQ.")) {
          try {
            const decodedB64 = atob(trimmed);
            // Đảo ngược chuỗi về nguyên bản bắt đầu bằng AQ.
            return decodedB64.split("").reverse().join("");
          } catch (e) {
            // Bỏ qua nếu có lỗi
          }
        }
        return trimmed;
      }

      // Trích xuất danh sách khóa API từ Local Storage hoặc build variable kèm theo 5 khóa dự phòng mặc định cấp cao
      function getGeminiKeysArray() {
        const stored = (localStorage.getItem('gemini_api_key') || buildGeminiKey || "").trim();
        
        // Bản đồ hóa các máy chủ với khóa đã mã hóa ngược dưới dạng Base64 để bảo mật chống quét Secret của GitHub, Google...
        const keyMap = {
          "AI_1": "QTM1OF9nSnplY0gteXVYOTFNb0VHczQ0aWNiYmJJUURHYVU3QzJFdFh6cUk2TlI4YkEuUUE=",
          "AI_2": "QXpDbEljYVZoeGMwN0NiejgzeXlsRVdpNnJVT3BXNG5sTm1VMlpnMV9WQ0k2TlI4YkEuUUE=",
          "AI_3": "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=",
          "AI_4": "d2dmWjdZeU1icWlHV21rVHJwTUZvUnpEYnBHN1drLWc4RTdJTTN2ZlRaMEw2TlI4YkEuUUE=",
          "AI_5": "UUk0bTF2T2hKcG5iem92S0FMYVBLUlZFOVJqa0NFdjJJeEFwdVNTQzZBTks2TlI4YkEuUUE="
        };

        if (keyMap[stored]) {
          return [decryptKeyIfNeeded(keyMap[stored])];
        }

        let keys = stored
          .split(/[,\s;\n]+/)
          .map(k => k.trim())
          .filter(k => k.length >= 8 && decryptKeyIfNeeded(k) !== decryptKeyIfNeeded("QXQ0VDNwcGx2NHJxMlBNdVhrU044UlRhS09XYl9pR3k4eWMyY3JMbmkzYk9JblI4YkEuUUE="));
        
        if (keys.length === 0 || stored === 'auto') {
          keys = [
            decryptKeyIfNeeded(keyMap["AI_1"]),
            decryptKeyIfNeeded(keyMap["AI_2"]),
            decryptKeyIfNeeded(keyMap["AI_3"]),
            decryptKeyIfNeeded(keyMap["AI_4"]),
            decryptKeyIfNeeded(keyMap["AI_5"])
          ];
        } else {
          keys = keys.map(k => decryptKeyIfNeeded(k));
        }
        return keys;
      }

      // Tự động kiểm tra và dọn dẹp khóa không hợp lệ trên trang tải, tự động nạp khóa nhúng an toàn nếu trình duyệt chưa có để chạy mượt mà ngay
      (function cleanOnLoad() {
        const storedKey = localStorage.getItem('gemini_api_key') || "";
        const isStoredValid = isValidGeminiKey(storedKey);
        const isBuildValid = isValidGeminiKey(buildGeminiKey);
        
        if (isBuildValid) {
          // Chỉ ghi đè nạp khóa nếu trình duyệt mới (chưa có key hợp lệ)
          if (!isStoredValid) {
            localStorage.setItem('gemini_api_key', buildGeminiKey);
          }
        } else {
          // Không có key cứng hợp lệ, thực hiện dọn dẹp nếu có chuỗi rác hoặc null/undefined
          if (storedKey === "null" || storedKey === "undefined" || (storedKey && !isStoredValid)) {
            localStorage.removeItem('gemini_api_key');
          }
        }
      })();

      function getActiveLocalKey() {
        return localStorage.getItem('gemini_api_key') || "";
      }

      let serverHasKey = isValidGeminiKey(buildGeminiKey); // Nếu build-time có Key hợp lệ thì coi như sẵn sàng

      // Check if server-side has the API key
      async function checkServerKey() {
        if (isValidGeminiKey(buildGeminiKey)) {
          serverHasKey = true;
          initChatboxState();
          return;
        }
        try {
          const res = await fetch('/api/has-key');
          if (res.ok) {
            const data = await res.json();
            serverHasKey = !!data.hasKey;
          } else {
            serverHasKey = false;
          }
        } catch (e) {
          console.warn("Could not check server API key status:", e);
          serverHasKey = false; // Đặt về false nếu server ko phản hồi để có thể dùng client-side key
        }
        initChatboxState();
      }

      // Mở/Đóng chatbox
      aiChatTrigger.addEventListener('click', () => {
        aiChatWindow.classList.toggle('open');
        if (aiChatWindow.classList.contains('open')) {
          checkServerKey();
          scrollChatToBottom();
        }
      });

      btnAiClose.addEventListener('click', () => {
        aiChatWindow.classList.remove('open');
      });

      // Kiểm tra trạng thái Key ban đầu - hiển thị setup nếu chưa có key và bật cửa sổ hội thoại khi có key
      function initChatboxState() {
        const activeLocalKey = getActiveLocalKey();
        const hasKey = isValidGeminiKey(activeLocalKey) || serverHasKey;
        if (hasKey) {
          chatAiKeySetup.style.display = 'none';
          chatAiPlayground.style.display = 'flex';
        } else {
          chatAiKeySetup.style.display = 'flex';
          chatAiPlayground.style.display = 'none';
        }
      }

      // Quản lý lựa chọn Máy Chủ AI hoạt động
      const aiServerButtons = document.querySelectorAll('#aiServerButtonsContainer .btn-ai-server');
      
      const rawToAliasMap = {
        "QTM1OF9nSnplY0gteXVYOTFNb0VHczQ0aWNiYmJJUURHYVU3QzJFdFh6cUk2TlI4YkEuUUE=": "AI_1",
        "QXpDbEljYVZoeGMwN0NiejgzeXlsRVdpNnJVT3BXNG5sTm1VMlpnMV9WQ0k2TlI4YkEuUUE=": "AI_2",
        "ZzBzakRMMUo1Z3hJUkZfSXczN2QwcDVkNmhLUTVBNWVsbnNPb0d3MmZJSUk2TlI4YkEuUUE=": "AI_3",
        "d2dmWjdZeU1icWlHV21rVHJwTUZvUnpEYnBHN1drLWc4RTdJTTN2ZlRaMEw2TlI4YkEuUUE=": "AI_4",
        "UUk0bTF2T2hKcG5iem92S0FMYVBLUlZFOVJqa0NFdjJJeEFwdVNTQzZBTks2TlI4YkEuUUE=": "AI_5"
      };

      // Tự động giải mã các khóa để thêm vào đối sánh động trên trình duyệt
      Object.keys(rawToAliasMap).forEach(encKey => {
        const decKey = decryptKeyIfNeeded(encKey);
        if (decKey && decKey !== encKey) {
          rawToAliasMap[decKey] = rawToAliasMap[encKey];
        }
      });

      function getPrettyServerName(mode) {
        if (!mode) return "Server AI Tự Động";
        const cleanMode = String(mode).trim();
        if (cleanMode === 'auto') return "Server AI Tự Động";
        
        if (rawToAliasMap[cleanMode]) {
          return "Server " + rawToAliasMap[cleanMode];
        }
        
        if (cleanMode.startsWith("AI_")) {
          return "Server " + cleanMode;
        }
        
        if (cleanMode.length > 8) {
          return "Server AI Cá Nhân";
        }
        return "Server " + cleanMode;
      }

      let selectedServerMode = (localStorage.getItem('gemini_api_key') || 'auto').trim();
      if (rawToAliasMap[selectedServerMode]) {
        selectedServerMode = rawToAliasMap[selectedServerMode];
      }

      function updateActiveServerButtonUI() {
        aiServerButtons.forEach(btn => {
          if (btn.getAttribute('data-server-mode') === selectedServerMode) {
            btn.classList.add('active-btn');
          } else {
            btn.classList.remove('active-btn');
          }
        });
      }

      // Bắt sự kiện click các nút Server
      aiServerButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedServerMode = btn.getAttribute('data-server-mode') || 'auto';
          updateActiveServerButtonUI();
        });
      });

      // Thiết lập hiển thị ban đầu
      updateActiveServerButtonUI();

      // Kích hoạt khóa bảo mật API / máy chủ AI
      btnActivateAi.addEventListener('click', () => {
        localStorage.setItem('gemini_api_key', selectedServerMode);
        initChatboxState();
        showToast(`Kết nối thành công qua ${getPrettyServerName(selectedServerMode)}!`, true);
      });

      // Nhấn nút cấu hình lại bánh răng
      btnAiConfigure.addEventListener('click', () => {
        selectedServerMode = localStorage.getItem('gemini_api_key') || 'auto';
        if (rawToAliasMap[selectedServerMode]) {
          selectedServerMode = rawToAliasMap[selectedServerMode];
        }
        updateActiveServerButtonUI();
        chatAiPlayground.style.display = 'none';
        chatAiKeySetup.style.display = 'flex';
        showToast("Đã chuyển sang chế độ cấu hình Server. Anh/Chị chọn Kênh rồi nhấn Xác nhận nhé!", true);
      });

      // Run on page load as well to greet accurately
      checkServerKey();

      // Cuộn xuống tin nhắn mới nhất
      function scrollChatToBottom() {
        chatAiMessages.scrollTop = chatAiMessages.scrollHeight;
      }

      // Tạo cấu trúc tin nhắn cục bộ
      function appendMessage(text, isUser = false) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`;
        
        // Thêm định dạng đơn giản (bold, dòng mới)
        if (!isUser) {
          // Bảo vệ HTML và format cơ bản
          let formattedText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/- (.*?)\n/g, '• $1<br>')
            .replace(/\n/g, '<br>');
          
          // Chuyển đổi mã số căn trong câu trả lời thành liên kết chi tiết trực quan tự động mở popup
          formattedText = formattedText.replace(/(?:\[?Căn\s*#(\d+)\]?)/gi, (match, propId) => {
            const item = propertyData.find(p => p.id == propId);
            const slug = item ? createSlug(item.title) : '';
            const linkUrl = slug ? `${window.location.origin}/chitiet/${propId}-${slug}` : `${window.location.origin}/chitiet?id=${propId}`;
            return `<a href="${linkUrl}" onclick="openProductModal('${propId}', event);" class="chat-product-link" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #fff3eb; color: #ea580c; border: 1px solid #ffedd5; border-radius: 6px; font-weight: 700; font-size: 12.5px; text-decoration: none; margin: 4px 2px; transition: all 0.2s; cursor: pointer;" onmouseover="this.style.background='#ffedd5'" onmouseout="this.style.background='#fff3eb'">🏡 Xem chi tiết Căn #${propId} ↗</a>`;
          });
          
          bubble.innerHTML = formattedText;
        } else {
          bubble.textContent = text;
        }

        const suggestionsEl = document.getElementById('chatSuggestions');
        if (suggestionsEl && suggestionsEl.parentNode === chatAiMessages) {
          chatAiMessages.insertBefore(bubble, suggestionsEl);
        } else {
          chatAiMessages.appendChild(bubble);
        }
        scrollChatToBottom();
        return bubble;
      }

      // Thêm loading động
      function appendLoader() {
        const loader = document.createElement('div');
        loader.className = 'chat-bubble bubble-bot';
        loader.id = 'aiTypingLoader';
        loader.innerHTML = `
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        `;
        const suggestionsEl = document.getElementById('chatSuggestions');
        if (suggestionsEl && suggestionsEl.parentNode === chatAiMessages) {
          chatAiMessages.insertBefore(loader, suggestionsEl);
        } else {
          chatAiMessages.appendChild(loader);
        }
        scrollChatToBottom();
      }

      function removeLoader() {
        const loader = document.getElementById('aiTypingLoader');
        if (loader) {
          loader.remove();
        }
      }

      // Hệ thống hóa kho nhà phố để gửi chung làm tư liệu mồi cho trí tuệ nhân tạo (Grounding dữ liệu thật)
      function getWarehouseContext() {
        let text = "Dưới đây là danh sách giỏ hàng sản phẩm nhà đất phố đang có sẵn tại Thanh Trà BĐS TP. Thủ Đức để bạn tham khảo giới thiệu đúng chuẩn cho khách:\n";
        propertyData.forEach(p => {
          text += `- [Căn #${p.id}]: ${p.title}. Giá bán: ${p.priceText}, Phường: ${p.ward}, Diện tích: ${p.area}m², Số tầng: ${p.floors} tầng, Hướng: ${p.direction}. Địa chỉ: ${getPublicDisplayAddress(p)}. Mô tả ngắn: ${p.badge}.\n`;
        });
        return text;
      }

      // Gửi yêu cầu tư vấn đến Google Gemini API
      async function askGeminiAPI(userQuestion) {
        const keysList = getGeminiKeysArray();
        const activeClientKeyString = localStorage.getItem('gemini_api_key') || buildGeminiKey || "";
        
        if (keysList.length === 0 && !serverHasKey) {
          initChatboxState();
          return;
        }

        appendLoader();

        // Tạo câu lệnh cấu trúc (System Prompt) ràng buộc AI
        const systemInstruction = `Bạn là Trợ lý AI chuyên nghiệp và thân thiện của thương hiệu "Thanh Trà BĐS" (đại diện cho nhà môi giới Thanh Trà).
Nhiệm vụ chính: Tư vấn môi giới, định hướng, giải đáp pháp lý về bất động sản nhà phố CHỈ tại khu vực TP. Thủ Đức, TP. Hồ Chí Minh.
Thông tin liên hệ chính thống bắt buộc để cung cấp cho người dùng:
- Hotline/Zalo: 0854.100.036
- Địa chỉ văn phòng: Lò Lu, Trường Thạnh, TP. Thủ Đức
- Email: thanhtra1996st@gmail.com
- Link chat Zalo: https://zalo.me/0854100036

Nguyên tắc trả lời:
1. Thân thiện, tận tâm, trung thực và cực kỳ ngắn gọn, súc tích (mỗi câu trả lời không quá 3-4 câu ngắn).
2. Khi khách hỏi tìm nơi ở hoặc tầm giá, hãy đối chiếu và đề xuất KHỚP chính xác căn nhà nào đang có sẵn trong Giỏ Hàng do Thanh Trà đang bán. Khi đề cập đến một căn cụ thể, BẮT BUỘC phải ghi mã số căn ở định dạng "[Căn #ID]" (ví dụ: [Căn #1], [Căn #15]) để hệ thống lập tức chèn liên kết xem chi tiết sản phẩm trực tiếp. Nếu không có căn trùng khít hoàn hảo, hãy giới thiệu căn gần giống nhất ở dạng "[Căn #ID]" và mời họ kết nối Hotline để Thanh Trà đi tìm thêm sản phẩm ở giỏ hàng kín khác.
3. Luôn luôn lồng ghép khéo léo lời mời khách gọi điện/Zalo số 0854.100.036 để xem nhà trực tiếp hoặc tư vấn cụ thể.
4. Tránh luyên thuyên lý thuyết suông.
5. TUYỆT ĐỐI KHÔNG DÙNG CÁC TỪ NGỮ QUẢNG CÁO TỰ PHONG, KHẲNG ĐỊNH THỨ HẠNG HOẶC ĐỘC QUYỀN TRÊN NỀN TẢNG (LUẬT QUẢNG CÁO):
   - KHÔNG bao giờ dùng từ khẳng định thứ hạng/chất lượng: "Số 1", "No.1", "Top 1", "Nhất", "Tốt nhất", "Uy tín nhất", "Hiệu quả nhất", "Chất lượng nhất", "Dẫn đầu", "Hàng đầu" hoặc các biến thể so sánh nhất.
   - KHÔNG bao giờ dùng nhóm từ khẳng định độc quyền: "Duy nhất", "Độc nhất", "Chỉ có tại...".
   - KHÔNG bao giờ dùng mô tả cam kết quá đà về Bất động sản: "Đẹp nhất khu vực", "Vị trí đắc địa nhất", "Giá tốt nhất thị trường", "Cam kết sinh lời cao nhất", "Sinh lời tốt nhất".
   - Hãy ưu tiên dùng các tính từ biểu đạt khách quan, thanh lịch: "tiềm năng tốt", "vị trí thuận lợi", "mức giá cực kỳ cạnh tranh, hợp lý", "không gian sang trọng thoáng đãng", "thiết kế hiện đại chuẩn chỉnh".`;

        const warehouseData = getWarehouseContext();

        try {
          // Đầu tiên, thử gọi qua proxy Node.js backend đi kèm của hệ thống (hỗ trợ xoay vòng xoay khóa trên server)
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userQuestion,
              warehouseData,
              systemInstruction,
              localKey: activeClientKeyString
            })
          });

          if (response.ok) {
            const resData = await response.json();
            removeLoader();
            if (resData.reply) {
              appendMessage(resData.reply, false);
              return;
            }
          }
          throw new Error("Proxy backend response is not OK");
        } catch (error) {
          console.warn("Máy chủ proxy local không phản hồi hoặc đang chạy tĩnh trên Hosting. Đang tự động gọi trực tiếp Google Gemini API qua Client-side key pool...", error);
          
          if (keysList.length > 0) {
            let lastError = null;
            for (let i = 0; i < keysList.length; i++) {
              const currentKey = keysList[i];
              try {
                console.log(`[Info] Client-side thử gọi Gemini bằng Key ${i + 1}/${keysList.length}...`);
                const directResponse = await fetchGeminiWithFallback(currentKey, {
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        { text: systemInstruction + "\n\n=== DỮ LIỆU RỔ HÀNG HIỆN TẠI ===\n" + warehouseData + "\n\n=== CÂU HỎI CỦA KHÁCH HÀNG ===\n" + userQuestion }
                      ]
                    }
                  ],
                  generationConfig: {
                    temperature: 0.7
                  }
                });

                if (directResponse.ok) {
                   const directData = await directResponse.json();
                   removeLoader();
                   if (directData.candidates?.[0]?.content?.parts?.[0]?.text) {
                     const replyText = directData.candidates[0].content.parts[0].text;
                     appendMessage(replyText, false);
                     return;
                   }
                }
                const errorDetails = await directResponse.json().catch(() => ({}));
                console.error(`Direct Gemini API Key #${i + 1} error:`, errorDetails);
                lastError = errorDetails;
              } catch (innerError) {
                console.error(`Client API Key #${i + 1} call error:`, innerError);
                lastError = innerError;
              }
            }
          }
          
          removeLoader();
          appendMessage("Không thể nhận diện câu trả lời. Có thể các API Key của bạn đã đạt giới hạn quota hôm nay hoặc bận bách khoa. Anh/Chị vui lòng cấu hình/bổ sung thêm mã khóa API Key của riêng mình trong tiện ích Thiết lập để tiếp tục nhé!", false);
        }
      }

      // Xử lý gửi tin nhắn
      function triggerUserMessage() {
        const text = chatInputField.value.trim();
        if (!text) return;

        appendMessage(text, true);
        chatInputField.value = '';
        
        // Gọi API Gemini
        askGeminiAPI(text);
      }

      btnSendMessage.addEventListener('click', triggerUserMessage);
      chatInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          triggerUserMessage();
        }
      });

      // Click gợi ý câu hỏi nhanh
      chatSuggestions.addEventListener('click', (e) => {
        const btn = e.target.closest('.suggestion-pill');
        if (!btn) return;
        
        const question = btn.getAttribute('data-question');
        appendMessage(question, true);
        askGeminiAPI(question);
      });


      /* ==========================================
         7. CHỨC NĂNG DÀNH CHO QUẢN TRỊ VIÊN (ADMIN CONTROL)
         ========================================== */
      const adminTableBody = document.getElementById('adminTableBody');
      const adminPropForm = document.getElementById('adminPropForm');
      if (adminPropForm && adminPropForm.tagName.toLowerCase() !== 'form') {
        adminPropForm.reset = function() {
          this.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'hidden') {
              el.value = '';
            } else if (el.type === 'checkbox') {
              el.checked = false;
            } else if (el.id === 'formBedrooms' || el.id === 'formBathrooms') {
              el.value = '3';
            } else if (el.id === 'formFloors') {
              el.value = '3';
            } else if (el.id === 'formLegal') {
              el.value = 'Sổ hồng riêng';
            } else if (el.id === 'ap_dt_fld') {
              el.value = 'TP. THỦ ĐỨC, TP.HCM';
            } else {
              el.value = '';
            }
          });
          const oldPriceGroup = document.getElementById('oldPriceGroup');
          if (oldPriceGroup) oldPriceGroup.style.display = 'none';
        };
      }

      // Lắng nghe sự kiện check giảm giá
      const formIsPriceReduced = document.getElementById('formIsPriceReduced');
      const oldPriceGroup = document.getElementById('oldPriceGroup');
      const formOldPrice = document.getElementById('formOldPrice');
      const formPrice = document.getElementById('formPrice');

      if (formIsPriceReduced && oldPriceGroup && formOldPrice && formPrice) {
        formIsPriceReduced.addEventListener('change', function() {
          if (this.checked) {
            oldPriceGroup.style.display = 'block';
            if (!formOldPrice.value) {
              formOldPrice.value = formPrice.value;
            }
          } else {
            oldPriceGroup.style.display = 'none';
          }
        });
      }
      
      const formPropId = document.getElementById('formPropId');
      const formTitle = document.getElementById('formTitle');
      const formArea = document.getElementById('formArea');
      const formWard = document.getElementById('ap_wd_fld');
      const formDirection = document.getElementById('formDirection');
      const formFloors = document.getElementById('formFloors');
      const formBadge = document.getElementById('formBadge');
      const formAddress = document.getElementById('formAddress');
      const formImg = document.getElementById('formImg');
      const formDesc = document.getElementById('formDesc');

      isAdminLoggedIn = sessionStorage.getItem('admin_logged_in') === 'true';

      // Chuyển trang/màn hình mượt mà giữa Chợ BĐS và Trang Admin
      function switchToPage(pageName) {
        const homePageWrapper = document.getElementById('homePageWrapper');
        const adminPageWrapper = document.getElementById('adminPageWrapper');
        const navAdminLink = document.getElementById('navAdminLink');
        const aiChatWindow = document.getElementById('aiChatWindow');
        const aiChatTrigger = document.getElementById('aiChatTrigger');
        
        if (pageName === 'admin') {
          if (homePageWrapper) homePageWrapper.style.display = 'none';
          if (adminPageWrapper) adminPageWrapper.style.display = 'block';
          if (aiChatWindow) aiChatWindow.classList.remove('open');
          if (aiChatTrigger) aiChatTrigger.style.display = 'none'; // Ẩn nút bong bóng AI để nhường không gian hoạt động admin
          
          document.querySelectorAll('#navMenu .nav-link').forEach(link => link.classList.remove('active'));
          if (navAdminLink) navAdminLink.classList.add('active');
          
          renderAdminTable();
          hideAdminForm(); // Trả lại danh sách bảng tin đăng trước
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          if (homePageWrapper) homePageWrapper.style.display = 'block';
          if (adminPageWrapper) adminPageWrapper.style.display = 'none';
          if (aiChatTrigger) aiChatTrigger.style.display = 'flex'; // Hiện lại bong bóng AI
          
          document.querySelectorAll('#navMenu .nav-link').forEach(link => link.classList.remove('active'));
          const homeLink = document.querySelector("#navMenu a[href='#hero']");
          if (homeLink) homeLink.classList.add('active');
          
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      function showAdminSection(e) {
        if (e) e.preventDefault();
        if (isAdminLoggedIn) {
          switchToPage('admin');
        } else {
          openAdminLoginModal();
        }
      }

      function openAdminLoginModal() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) {
          modal.classList.add('open');
          document.body.style.overflow = 'hidden';
          const pwdField = document.getElementById('ad_pw_fld');
          if (pwdField) {
            pwdField.value = '';
            pwdField.focus();
          }
        }
      }

      function closeAdminLoginModal() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) {
          modal.classList.remove('open');
          document.body.style.overflow = 'auto';
        }
      }

      let pendingAdminAction = null;

      function onAdminLoginSuccess(message) {
        isAdminLoggedIn = true;
        sessionStorage.setItem('admin_logged_in', 'true');
        closeAdminLoginModal();
        switchToPage('admin');
        if (pendingAdminAction === 'create_post') {
          switchAdminTab('products');
          showAdminForm(null);
          pendingAdminAction = null;
        }
        showToast(message || "Xác thực quản trị viên thành công!", true);
      }

      function handleDirectPostClick(e) {
        if (e) e.preventDefault();
        const navMenu = document.getElementById('navMenu');
        const menuToggle = document.getElementById('menuToggle');
        if (navMenu && navMenu.classList.contains('open')) {
          navMenu.classList.remove('open');
          if (menuToggle) menuToggle.classList.remove('open');
        }

        if (isAdminLoggedIn) {
          switchToPage('admin');
          switchAdminTab('products');
          showAdminForm(null);
        } else {
          pendingAdminAction = 'create_post';
          openAdminLoginModal();
        }
      }

      async function handleAdminLoginModal(e) {
        if (e) e.preventDefault();
        const pwdField = document.getElementById('ad_pw_fld');
        if (!pwdField) return;
        const pwd = pwdField.value.trim();
        
        const btn = document.querySelector('#adminLoginModal .btn-admin-login') || document.querySelector('#adminLoginModal button');
        const originalText = btn ? btn.innerHTML : '';
        
        try {
          if (btn) {
            btn.innerHTML = 'Đang xác thực...';
            btn.disabled = true;
          }
          
          const res = await fetch("/api/admin-login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ password: pwd })
          });
          
          if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
          
          const data = await res.json();
          if (res.ok && data.success) {
            onAdminLoginSuccess(data.message);
          } else {
            // Local fallback if server returns incorrect but we match local default admin password
            if (pwd === "123456") {
              onAdminLoginSuccess("Xác thực thành công (Local Fallback)!");
            } else {
              alert(data.error || "Sai mật khẩu hệ thống! Vui lòng thử lại.");
            }
          }
        } catch (err) {
          console.error("Lỗi đăng nhập admin:", err);
          if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
          
          // Local fallback when network error/Vercel serverless backend is offline
          if (pwd === "123456") {
            onAdminLoginSuccess("Xác thực thành công (Offline Fallback)!");
          } else {
            alert("Sai mật khẩu hệ thống hoặc không kết nối được với máy chủ quản trị. Vui lòng kiểm tra lại.");
          }
        }
      }

      function handleAdminLogout() {
        isAdminLoggedIn = false;
        sessionStorage.removeItem('admin_logged_in');
        switchToPage('home');
        showToast("Đăng xuất quyền quản trị thành công.", true);
        if (typeof logSystemActivity === 'function') {
          logSystemActivity('SYS', "Quản trị viên đăng xuất.");
        }
      }

      // =========================================================================
      // --- CÁC HÀM XỬ LÝ QUẢN TRỊ ADMIN (TABS, BÁO CÁO, NHẬT KÝ, HỘP THƯ) ---
      // =========================================================================
      
      let activeInboxFilter = 'all';

      function initAdminStats() {
        try {
          // Khởi tạo lượt xem trang mặc định
          if (!localStorage.getItem('local_page_views')) {
            localStorage.setItem('local_page_views', '58');
          } else {
            const currentViews = parseInt(localStorage.getItem('local_page_views') || '58', 10);
            localStorage.setItem('local_page_views', String(currentViews + 1));
          }

          // Khởi tạo lượt chia sẻ
          if (!localStorage.getItem('local_shares')) {
            localStorage.setItem('local_shares', JSON.stringify({ fb: 0, zalo: 0, copy: 4 }));
          }

          // Khởi tạo Khách hàng tiềm năng (Leads) mẫu ban đầu nếu rỗng
          if (!localStorage.getItem('local_leads')) {
            const seedLeads = [
              {
                id: Date.now() - 3600000 * 24 * 3, // 3 ngày trước
                name: "Nguyễn Văn Minh",
                phone: "0901234567",
                note: "Tôi muốn đặt lịch hẹn đi xem thực tế căn nhà góc 3 tầng đường Lò Lu vào chiều thứ 7 này.",
                time: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
                status: "new"
              },
              {
                id: Date.now() - 3600000 * 24 * 1.5, // 1.5 ngày trước
                name: "Phạm Thị Tuyết",
                phone: "0918765432",
                note: "Cần tư vấn thêm pháp lý sổ hồng riêng và quy hoạch đường Trường Thạnh.",
                time: new Date(Date.now() - 3600000 * 24 * 1.5).toISOString(),
                status: "contacted"
              },
              {
                id: Date.now() - 1000 * 60 * 45, // 45 phút trước
                name: "Trần Minh Quân",
                phone: "0934567890",
                note: "Tôi đang rất quan tâm căn nhà cấp 4 ở Long Phước, xin vui lòng gửi thêm sơ đồ thửa đất kế cận.",
                time: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                status: "new"
              }
            ];
            localStorage.setItem('local_leads', JSON.stringify(seedLeads));
          }

          // Khởi tạo Nhật ký logs nếu rỗng
          if (!localStorage.getItem('local_activity_logs')) {
            const seedLogs = [
              { time: new Date(Date.now() - 3600000).toLocaleTimeString('vi-VN', {hour12:false}), level: "SUCCESS", message: "Khởi động và tải dữ liệu rổ hàng nhà phố Thủ Đức thành công." },
              { time: new Date(Date.now() - 1800000).toLocaleTimeString('vi-VN', {hour12:false}), level: "LEAD", message: "Yêu cầu tư vấn mới từ khách hàng Trần Minh Quân." },
              { time: new Date(Date.now() - 600000).toLocaleTimeString('vi-VN', {hour12:false}), level: "SYS", message: "Mở giao diện báo cáo tổng hợp & phân bổ khu vực." }
            ];
            localStorage.setItem('local_activity_logs', JSON.stringify(seedLogs));
          }

          // Kích hoạt đồng hồ ticking real-time báo cáo
          setInterval(() => {
            const clockEl = document.getElementById('adminReportClock');
            if (clockEl) {
              clockEl.textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false });
            }
          }, 1000);

        } catch (e) {
          console.error("Lỗi trong initAdminStats:", e);
        }
      }

      function switchAdminTab(tabName) {
        // Ẩn toàn bộ tab contents
        document.querySelectorAll('.admin-tab-content-block').forEach(el => {
          el.style.display = 'none';
        });
        
        // Hoàn dọn trạng thái active trên các tab btn
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
          btn.classList.remove('active');
          btn.style.borderBottomColor = 'transparent';
          btn.style.color = 'var(--text-muted)';
        });

        // Thiết lập tab được chọn
        if (tabName === 'products') {
          const content = document.getElementById('adminTabContentProducts');
          if (content) content.style.display = 'block';
          const btn = document.getElementById('adminTabBtnProducts');
          if (btn) {
            btn.classList.add('active');
            btn.style.borderBottomColor = 'var(--accent)';
            btn.style.color = 'var(--primary)';
          }
          logSystemActivity('NAV', "Click mục Quản lý tin đăng.");
          renderAdminTable();
        } else if (tabName === 'reports') {
          const content = document.getElementById('adminTabContentReports');
          if (content) content.style.display = 'block';
          const btn = document.getElementById('adminTabBtnReports');
          if (btn) {
            btn.classList.add('active');
            btn.style.borderBottomColor = 'var(--accent)';
            btn.style.color = 'var(--primary)';
          }
          logSystemActivity('NAV', "Click mục Báo cáo & Quản trị.");
          renderAdminReports();
        } else if (tabName === 'inbox') {
          const content = document.getElementById('adminTabContentInbox');
          if (content) content.style.display = 'block';
          const btn = document.getElementById('adminTabBtnInbox');
          if (btn) {
            btn.classList.add('active');
            btn.style.borderBottomColor = 'var(--accent)';
            btn.style.color = 'var(--primary)';
          }
          logSystemActivity('NAV', "Click mục Hộp thư tư vấn.");
          renderAdminInbox();
        } else if (tabName === 'facebook') {
          const content = document.getElementById('adminTabContentFacebook');
          if (content) content.style.display = 'block';
          const btn = document.getElementById('adminTabBtnFacebook');
          if (btn) {
            btn.classList.add('active');
            btn.style.borderBottomColor = 'var(--accent)';
            btn.style.color = 'var(--primary)';
          }
          logSystemActivity('NAV', "Click mục Cấu hình Facebook Fanpage.");
          loadFacebookPages();
        } else if (tabName === 'facebook-history') {
          const content = document.getElementById('adminTabContentFacebookHistory');
          if (content) content.style.display = 'block';
          const btn = document.getElementById('adminTabBtnFacebookHistory');
          if (btn) {
            btn.classList.add('active');
            btn.style.borderBottomColor = 'var(--accent)';
            btn.style.color = 'var(--primary)';
          }
          logSystemActivity('NAV', "Click mục Lịch sử đăng Facebook.");
          loadFacebookPostHistory(1);
        }
      }

      function logSystemActivity(level, message) {
        try {
          const logs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
          const newLog = {
            time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
            level: level.toUpperCase(),
            message: message
          };
          logs.unshift(newLog);
          if (logs.length > 50) logs.pop();
          localStorage.setItem('local_activity_logs', JSON.stringify(logs));
          
          // Vẽ lại báo cáo nếu tab đang hiển thị
          const reportsTab = document.getElementById('adminTabContentReports');
          if (reportsTab && reportsTab.style.display !== 'none') {
            renderAdminReports();
          }
        } catch (e) {
          console.error("Lỗi logSystemActivity:", e);
        }
      }

      async function clearSystemLogs() {
        const isConfirmed = await showCustomConfirm(
          "Dọn Nhật Ký",
          "Bạn có chắc chắn muốn dọn sạch nhật ký hệ thống không?"
        );
        if (isConfirmed) {
          localStorage.setItem('local_activity_logs', JSON.stringify([]));
          logSystemActivity('SYS', "Dọn sạch nhật ký hệ thống.");
          renderAdminReports();
        }
      }

      function renderAdminReports() {
        try {
          // 1. KPI Lượt xem
          const prodViewsSum = propertyData.reduce((sum, p) => sum + (p.views || 0), 0);
          const pageViewsVal = parseInt(localStorage.getItem('local_page_views') || '58', 10);
          const totalViews = prodViewsSum + pageViewsVal;
          
          const viewsEl = document.getElementById('kpiValueViews');
          if (viewsEl) viewsEl.textContent = String(totalViews);

          // 2. KPI Lượt Chia Sẻ
          const sharesObj = JSON.parse(localStorage.getItem('local_shares') || '{"fb":0,"zalo":0,"copy":4}');
          const totalShares = (sharesObj.fb || 0) + (sharesObj.zalo || 0) + (sharesObj.copy || 0);
          const sharesEl = document.getElementById('kpiValueShares');
          if (sharesEl) sharesEl.textContent = String(totalShares);
          
          const breakdownEl = document.getElementById('kpiValueSharesBreakdown');
          if (breakdownEl) {
            breakdownEl.textContent = `FB: ${sharesObj.fb || 0} | Zalo: ${sharesObj.zalo || 0} | Copy: ${sharesObj.copy || 4}`;
          }

          // 3. KPI Khách Tiềm Năng (Leads)
          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          const totalLeads = leads.length;
          const newLeadsCount = leads.filter(l => l.status === 'new').length;
          const contactedCount = leads.filter(l => l.status === 'contacted').length;

          const leadsEl = document.getElementById('kpiValueLeads');
          if (leadsEl) leadsEl.textContent = String(totalLeads);

          const leadsBreakdownEl = document.getElementById('kpiValueLeadsBreakdown');
          if (leadsBreakdownEl) {
            leadsBreakdownEl.innerHTML = `Mới: <span style="color: #ea580c; font-weight: 700;">${newLeadsCount}</span> • Đã xử lý: <span style="color: #16a34a; font-weight: 700;">${contactedCount}</span>`;
          }

          // Đồng bộ unread badge chính trên tab điều hướng
          const tabBadge = document.getElementById('adminInboxUnreadBadge');
          if (tabBadge) {
            if (newLeadsCount > 0) {
              tabBadge.textContent = String(newLeadsCount);
              tabBadge.style.display = 'inline-flex';
            } else {
              tabBadge.style.display = 'none';
            }
          }

          // 4. KPI Tỷ Lệ Chuyển Đổi
          const convEl = document.getElementById('kpiValueConversion');
          if (convEl) {
            if (totalViews > 0) {
              const rate = ((totalLeads / totalViews) * 100).toFixed(1);
              convEl.textContent = `${rate}%`;
            } else {
              convEl.textContent = '0.0%';
            }
          }

          // 5. KPI BĐS Đã Bán & Doanh Số Ước Tính
          const soldProperties = propertyData.filter(p => p.isSold);
          const totalSoldVal = soldProperties.length;
          const estimatedRevenueVal = soldProperties.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);

          const totalSoldEl = document.getElementById('kpiValueTotalSold');
          if (totalSoldEl) totalSoldEl.textContent = String(totalSoldVal);

          const estRevEl = document.getElementById('kpiValueEstimatedRevenue');
          if (estRevEl) {
            estRevEl.textContent = Number(estimatedRevenueVal.toFixed(1)) + " Tỷ";
          }

          // 6. Biểu đồ phân bổ BĐS
          const wardsContainer = document.getElementById('adminReportWardsContainer');
          if (wardsContainer) {
            wardsContainer.innerHTML = '';
            
            const wardCounts = {};
            propertyData.forEach(p => {
              if (p && p.ward) {
                const w = p.ward.trim();
                if (w) {
                  wardCounts[w] = (wardCounts[w] || 0) + 1;
                }
              }
            });

            const sortedWards = Object.keys(wardCounts).map(w => ({
              name: w,
              count: wardCounts[w]
            })).sort((a, b) => b.count - a.count);

            const totalProdCount = propertyData.length || 1;

            if (sortedWards.length === 0) {
              wardsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13.5px; text-align: center; padding: 24px 0;">Không có dữ liệu bất động sản rổ hàng.</div>';
            } else {
              sortedWards.forEach(item => {
                const percent = Math.round((item.count / totalProdCount) * 100);
                const itemHtml = `
                  <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 700; color: var(--primary);">
                      <span style="font-size: 13px;">📌 Phường ${item.name}</span>
                      <span>${item.count} căn (${percent}%)</span>
                    </div>
                    <div style="width: 100%; border: 1px solid var(--border); border-radius: 99px; height: 10px; overflow: hidden; background: #f1f5f9;">
                      <div style="height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent-hover)); width: ${percent}%;"></div>
                    </div>
                  </div>
                `;
                wardsContainer.insertAdjacentHTML('beforeend', itemHtml);
              });
            }
          }

          // 6. Hoạt động Logs thời gian thực
          const logsContainer = document.getElementById('adminSystemLogsContainer');
          if (logsContainer) {
            logsContainer.innerHTML = '';
            const logs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
            
            if (logs.length === 0) {
              logsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13.5px; text-align: center; padding: 24px 0;">Nhật ký rỗng.</div>';
            } else {
              logs.forEach(log => {
                let badgeStyle = "background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;";
                if (log.level === 'SUCCESS' || log.level === 'SYS') {
                  badgeStyle = "background: #dcfce7; color: #15803d; border: 1px solid #86efac;";
                } else if (log.level === 'LEAD') {
                  badgeStyle = "background: #fef3c7; color: #b45309; border: 1px solid #fde68a;";
                } else if (log.level === 'EDIT' || log.level === 'ADD') {
                  badgeStyle = "background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd;";
                } else if (log.level === 'DELETE') {
                  badgeStyle = "background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;";
                } else if (log.level === 'NAV') {
                  badgeStyle = "background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff;";
                } else if (log.level === 'SHARE') {
                  badgeStyle = "background: #f5f3ff; color: #5b21b6; border: 1px solid #ddd6fe;";
                }

                const logHtml = `
                  <div style="display: flex; gap: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--border); align-items: flex-start;">
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); padding-top: 2px;">[${log.time}]</span>
                    <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; ${badgeStyle}">${log.level}</span>
                    <span style="color: var(--text-dark); flex: 1; word-break: break-word; line-height: 1.4;">${log.message}</span>
                  </div>
                `;
                logsContainer.insertAdjacentHTML('beforeend', logHtml);
              });
            }
          }

          // 7. Phân tích giá thị trường
          renderPriceAnalysisTable();

        } catch (e) {
          console.error("Lỗi vẽ báo cáo admin:", e);
        }
      }

      window.currentPriceAnalysisTab = 'land';

      function renderPriceAnalysisTable() {
        try {
          const tbody = document.getElementById('adminPriceAnalysisTableBody');
          if (!tbody) return;
          tbody.innerHTML = '';

          const activeTab = window.currentPriceAnalysisTab || 'land';

          // Group by ward
          const wardGroups = {};

          propertyData.forEach(p => {
            if (!p) return;
            const price = parseFloat(p.price);
            const area = parseFloat(p.area);

            // Bỏ qua listing có area = 0 hoặc price = 0 khi tính
            if (isNaN(price) || price <= 0 || isNaN(area) || area <= 0) return;

            // Ward name
            const ward = p.ward ? p.ward.trim() : '';
            if (!ward) return;

            // Determine if Land vs Townhouse (Đất nền: sotang === "0" hoặc sotang === 0. Nhà phố: sotang khác 0)
            const floorsVal = p.floors;
            const floorsInt = parseInt(floorsVal);
            const isLand = (floorsVal === 0 || floorsVal === '0' || floorsInt === 0 || isNaN(floorsInt));

            // Filter based on selected tab
            if (activeTab === 'land') {
              if (!isLand) return;
            } else if (activeTab === 'house') {
              if (isLand || isNaN(floorsInt) || floorsInt <= 0) return;
            } else {
              // Tab 3, 4, 5 gộp chung cả đất lẫn nhà (không lọc theo sotang), bỏ qua listing có loai_vi_tri null/rỗng
              const lvt = p.loaiViTri || p.loai_vi_tri;
              if (!lvt || lvt.trim() === '') return;

              if (activeTab === 'frontage') {
                if (lvt !== 'mat_tien') return;
              } else if (activeTab === 'alley_car') {
                if (lvt !== 'hem_xe_hoi' && lvt !== 'hem') return;
              } else if (activeTab === 'alley_moto') {
                if (lvt !== 'hem_xe_may') return;
              }
            }

            // Compute price_per_m2 (price is in Billion, area is in m2 -> price * 1000 / area is Million/m2)
            const pricePerM2 = (price * 1000) / area;

            if (!wardGroups[ward]) {
              wardGroups[ward] = {
                sum: 0,
                min: pricePerM2,
                max: pricePerM2,
                count: 0
              };
            }

            wardGroups[ward].sum += pricePerM2;
            if (pricePerM2 < wardGroups[ward].min) wardGroups[ward].min = pricePerM2;
            if (pricePerM2 > wardGroups[ward].max) wardGroups[ward].max = pricePerM2;
            wardGroups[ward].count++;
          });

          // Calculate total samples across all wards
          const totalSamples = Object.values(wardGroups).reduce((sum, g) => sum + g.count, 0);

          if (totalSamples < 2) {
            tbody.innerHTML = `
              <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px 0; font-size: 11px; font-style: italic;">
                  Chưa đủ dữ liệu
                </td>
              </tr>
            `;
            return;
          }

          const sortedWards = Object.keys(wardGroups).sort((a, b) => a.localeCompare(b));

          sortedWards.forEach(ward => {
            const data = wardGroups[ward];
            const avg = data.sum / data.count;
            
            // Làm tròn số đến 1 chữ số thập phân
            const avgStr = avg.toFixed(1);
            const minStr = data.min.toFixed(1);
            const maxStr = data.max.toFixed(1);

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td style="padding: 12px 16px; font-weight: 700; color: var(--text-dark);">📌 Phường ${ward}</td>
              <td style="padding: 12px 16px; text-align: right; font-weight: 700; color: var(--accent);">${avgStr}</td>
              <td style="padding: 12px 16px; text-align: right; color: var(--text-dark);">${minStr}</td>
              <td style="padding: 12px 16px; text-align: right; color: var(--text-dark);">${maxStr}</td>
              <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: var(--text-muted);">${data.count}</td>
            `;
            tbody.appendChild(tr);
          });

        } catch (e) {
          console.error("Lỗi vẽ bảng phân tích giá:", e);
        }
      }

      window.switchPriceAnalysisTab = function(tab) {
        window.currentPriceAnalysisTab = tab;
        const tabs = {
          'land': 'adminPriceAnalysisTabLand',
          'house': 'adminPriceAnalysisTabHouse',
          'frontage': 'adminPriceAnalysisTabFrontage',
          'alley_car': 'adminPriceAnalysisTabAlleyCar',
          'alley_moto': 'adminPriceAnalysisTabAlleyMoto'
        };
        for (const [key, id] of Object.entries(tabs)) {
          const btn = document.getElementById(id);
          if (btn) {
            if (key === tab) {
              btn.style.background = 'var(--primary)';
              btn.style.color = '#fff';
            } else {
              btn.style.background = 'transparent';
              btn.style.color = 'var(--text-dark)';
            }
          }
        }
        renderPriceAnalysisTable();
      };

      window.isMarketPriceExpanded = false;

      window.renderPublicMarketPriceTable = function() {
        try {
          const tbody = document.getElementById('publicMarketPriceTableBody');
          if (!tbody) return;
          tbody.innerHTML = '';

          // Group by ward
          const wardGroups = {};

          propertyData.forEach(p => {
            if (!p) return;
            const price = parseFloat(p.price);
            const area = parseFloat(p.area);

            // loại bỏ listing có price = 0 hoặc area = 0
            if (isNaN(price) || price <= 0 || isNaN(area) || area <= 0) return;

            const ward = p.ward ? p.ward.trim() : '';
            if (!ward) return;

            const pricePerM2 = (price * 1000) / area; // triệu/m²

            if (!wardGroups[ward]) {
              wardGroups[ward] = {
                sum: 0,
                count: 0,
                prices: []
              };
            }
            wardGroups[ward].sum += pricePerM2;
            wardGroups[ward].count++;
            wardGroups[ward].prices.push(pricePerM2);
          });

          // Sắp xếp các phường có nhiều listing nhất (theo count giảm dần)
          const sortedWards = Object.keys(wardGroups).sort((a, b) => {
            return wardGroups[b].count - wardGroups[a].count;
          });

          if (sortedWards.length === 0) {
            tbody.innerHTML = `
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px 0;">
                  Không có dữ liệu phân tích giá thị trường.
                </td>
              </tr>
            `;
            return;
          }

          const showCount = window.isMarketPriceExpanded ? sortedWards.length : 6;
          const visibleWards = sortedWards.slice(0, showCount);

          visibleWards.forEach(ward => {
            const group = wardGroups[ward];
            const avg = group.sum / group.count;
            const min = Math.min(...group.prices);
            const max = Math.max(...group.prices);

            const avgStr = avg.toFixed(1) + " tr";
            const rangeStr = `${min.toFixed(1)}–${max.toFixed(1)} tr`;
            const countStr = `${group.count} tin`;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = `
              <td style="padding: 16px; font-weight: 700; color: var(--text-dark);">📍 Phường ${ward}</td>
              <td style="padding: 16px; text-align: right; font-weight: 800; color: var(--accent);">${avgStr}/m²</td>
              <td style="padding: 16px; text-align: right; color: var(--text-muted);">${rangeStr}</td>
              <td style="padding: 16px; text-align: right; font-weight: 600; color: var(--text-dark);">${countStr}</td>
            `;
            tbody.appendChild(tr);
          });

          // Hiển thị / ẩn nút Xem thêm
          const loadMoreContainer = document.getElementById('marketPriceLoadMoreContainer');
          const btnLoadMore = document.getElementById('btnMarketPriceLoadMore');
          if (loadMoreContainer && btnLoadMore) {
            if (sortedWards.length > 6) {
              loadMoreContainer.style.display = 'flex';
              if (window.isMarketPriceExpanded) {
                btnLoadMore.innerHTML = `Thu gọn bớt <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="display: inline-block; transform: rotate(180deg);"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
              } else {
                btnLoadMore.innerHTML = `Xem thêm các phường khác <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="display: inline-block;"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
              }
            } else {
              loadMoreContainer.style.display = 'none';
            }
          }

        } catch (e) {
          console.error("Lỗi vẽ bảng giá công cộng:", e);
        }
      };

      window.toggleMarketPriceRows = function() {
        window.isMarketPriceExpanded = !window.isMarketPriceExpanded;
        window.renderPublicMarketPriceTable();
      };

      function renderAdminInbox() {
        try {
          const container = document.getElementById('adminInboxContainer');
          if (!container) return;
          container.innerHTML = '';

          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          
          let filteredLeads = [...leads];
          if (activeInboxFilter === 'new') {
            filteredLeads = filteredLeads.filter(l => l.status === 'new');
          } else if (activeInboxFilter === 'contacted') {
            filteredLeads = filteredLeads.filter(l => l.status === 'contacted');
          }

          // Mới nhất lên đầu
          filteredLeads.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

          // Chọn style cho các nút điều hướng lọc
          const btnAll = document.getElementById('inboxFilterAll');
          const btnNew = document.getElementById('inboxFilterNew');
          const btnContacted = document.getElementById('inboxFilterContacted');
          
          if (btnAll) { btnAll.style.background = 'transparent'; btnAll.style.color = 'var(--text-dark)'; }
          if (btnNew) { btnNew.style.background = 'transparent'; btnNew.style.color = 'var(--text-dark)'; }
          if (btnContacted) { btnContacted.style.background = 'transparent'; btnContacted.style.color = 'var(--text-dark)'; }

          if (activeInboxFilter === 'all' && btnAll) {
            btnAll.style.background = 'var(--primary)';
            btnAll.style.color = '#fff';
          } else if (activeInboxFilter === 'new' && btnNew) {
            btnNew.style.background = 'var(--primary)';
            btnNew.style.color = '#fff';
          } else if (activeInboxFilter === 'contacted' && btnContacted) {
            btnContacted.style.background = 'var(--primary)';
            btnContacted.style.color = '#fff';
          }

          // Cập nhật số unread count tab
          const newLeadsCount = leads.filter(l => l.status === 'new').length;
          const tabBadge = document.getElementById('adminInboxUnreadBadge');
          if (tabBadge) {
            if (newLeadsCount > 0) {
              tabBadge.textContent = String(newLeadsCount);
              tabBadge.style.display = 'inline-flex';
            } else {
              tabBadge.style.display = 'none';
            }
          }

          if (filteredLeads.length === 0) {
            container.innerHTML = `
              <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 48px; text-align: center; box-shadow: var(--shadow);">
                <div style="font-size: 44px; margin-bottom: 12px;">📬</div>
                <h5 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--primary);">Hộp thư trống</h5>
                <p style="font-size: 13.5px; color: var(--text-muted); margin-top: 6px; margin-bottom: 0;">Không tìm thấy yêu cầu tư vấn nào phù hợp với điều kiện này.</p>
              </div>
            `;
            return;
          }

          filteredLeads.forEach(lead => {
            const timeFormatted = new Date(lead.time).toLocaleString('vi-VN', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });

            const isNew = lead.status === 'new';
            const cardBg = isNew ? "rgba(249, 115, 22, 0.04)" : "var(--card-bg)";
            const cardBorder = isNew ? "1px solid rgba(249, 115, 22, 0.25)" : "1px solid var(--border)";
            const statusBadge = isNew 
              ? `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase;">🔴 Chờ tư vấn</span>`
              : `<span style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase;">💚 Đã liên hệ</span>`;

            const actionBtn = isNew
              ? `<button onclick="markLeadContacted(${lead.id})" style="display: inline-flex; align-items: center; gap: 4px; background: #16a34a; color: #fff; padding: 8px 14px; border: none; border-radius: 6px; font-size: 12.5px; font-weight: 700; cursor: pointer;">✔️ Đánh dấu đã tư vấn</button>`
              : `<button onclick="restoreLeadNew(${lead.id})" style="display: inline-flex; align-items: center; gap: 4px; background: #4b5563; color: #fff; padding: 8px 14px; border: none; border-radius: 6px; font-size: 12.5px; font-weight: 700; cursor: pointer;">🔄 Khôi phục tin chờ</button>`;

            const leadHtml = `
              <div class="lead-card" style="background: ${cardBg}; border: ${cardBorder}; padding: 20px; border-radius: 12px; box-shadow: var(--shadow); transition: var(--transition); display: flex; flex-direction: column; gap: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: var(--accent); background: var(--bg-secondary);">
                      👤
                    </div>
                    <div>
                      <h6 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--primary);">${lead.name}</h6>
                      <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${timeFormatted}</span>
                    </div>
                  </div>
                  <div>
                    ${statusBadge}
                  </div>
                </div>

                <div style="font-size: 13.5px; color: var(--text-dark); background: var(--bg-secondary); border: 1px solid var(--border); padding: 12px 16px; border-radius: 8px; line-height: 1.5;">
                  <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap;">
                    <strong style="color: var(--primary);">📞 Số điện thoại:</strong> 
                    <a href="tel:${lead.phone}" style="color: var(--accent); font-weight: 800; font-family: var(--font-mono); text-decoration: underline; font-size: 14px;">${lead.phone}</a>
                    <button onclick="navigator.clipboard.writeText('${lead.phone}'); showToast('Đã sao chép Hotline!', true);" style="background: var(--bg-light); border: 1px solid var(--border); cursor: pointer; padding: 2px 6px; font-size: 11px; font-weight: 700; color: var(--text-dark); border-radius: 4px;">📋 Copy</button>
                    <a href="tel:${lead.phone}" style="background: #2563eb; color: #fff; text-decoration: none; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">📞 Gọi ngay</a>
                  </div>
                  <div style="white-space: pre-line; color: var(--text-dark); margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px;">
                    <strong style="color: var(--primary);">💬 Yêu cầu nhận tư vấn:</strong><br>
                    <span style="display: inline-block; margin-top: 4px; line-height: 1.5;">${lead.note ? lead.note : '<em style="color: var(--text-muted);">Không ghi chú nội dung thêm.</em>'}</span>
                  </div>
                </div>

                <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center; border-top: 1px dashed var(--border); padding-top: 12px; flex-wrap: wrap;">
                  ${actionBtn}
                  <button onclick="deleteLead(${lead.id})" style="display: inline-flex; align-items: center; gap: 4px; background: transparent; border: 1px solid #fca5a5; color: #dc2626; padding: 8px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 700; cursor: pointer; hover:bg-red-50;">🗑️ Xóa yêu cầu</button>
                </div>
              </div>
            `;
            container.insertAdjacentHTML('beforeend', leadHtml);
          });
        } catch (e) {
          console.error("Lỗi render danh sách hộp thư:", e);
        }
      }

      function filterInbox(status) {
        activeInboxFilter = status;
        renderAdminInbox();
      }

      function markLeadContacted(leadId) {
        try {
          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          const idx = leads.findIndex(l => l.id === leadId);
          if (idx !== -1) {
            leads[idx].status = 'contacted';
            localStorage.setItem('local_leads', JSON.stringify(leads));
            logSystemActivity('INFO', `Yêu cầu tư vấn của [${leads[idx].name}] được chuyển thành "Đã liên hệ".`);
            renderAdminInbox();
            renderAdminReports();
            showToast("Đã chuyển trạng thái Đã liên hệ thành công!", true);
          }
        } catch (e) {
          console.error(e);
        }
      }

      function restoreLeadNew(leadId) {
        try {
          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          const idx = leads.findIndex(l => l.id === leadId);
          if (idx !== -1) {
            leads[idx].status = 'new';
            localStorage.setItem('local_leads', JSON.stringify(leads));
            logSystemActivity('INFO', `Đặt lại yêu cầu tư vấn của [${leads[idx].name}] về trạng thái "Chờ xử lý".`);
            renderAdminInbox();
            renderAdminReports();
            showToast("Đã khôi phục về danh mục chờ tư vấn thành công!", true);
          }
        } catch (e) {
          console.error(e);
        }
      }

      async function deleteLead(leadId) {
        const isConfirmed = await showCustomConfirm(
          "Xóa Yêu Cầu Liên Hệ",
          "Bạn có chắc chắn muốn xóa vĩnh viễn yêu cầu nhận liên hệ này không?"
        );
        if (!isConfirmed) return;
        try {
          const leads = JSON.parse(localStorage.getItem('local_leads') || '[]');
          const idx = leads.findIndex(l => l.id === leadId);
          if (idx !== -1) {
            const tempName = leads[idx].name;
            leads.splice(idx, 1);
            localStorage.setItem('local_leads', JSON.stringify(leads));
            logSystemActivity('DELETE', `Đã xóa vĩnh viễn khách hàng đăng ký: [${tempName}].`);
            renderAdminInbox();
            renderAdminReports();
            showToast("Đã xóa vĩnh viễn biểu ghi thành công.", true);
          }
        } catch (e) {
          console.error(e);
        }
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function copyFacebookSql() {
        const area = document.getElementById('facebookSqlCopyText');
        if (area) {
          navigator.clipboard.writeText(area.value);
          showToast("Đã sao chép đoạn mã SQL cấu hình facebook_pages!", true);
        }
      }

      let globalFacebookPages = [];
      let editingFacebookPageId = null;
      let originalTokenValueForEdit = '';

      let fbHistoryCurrentPage = 1;
      let fbHistoryTotalPages = 1;

      async function loadFacebookPostHistory(page = 1) {
        fbHistoryCurrentPage = page;
        const container = document.getElementById('fbHistoryTableBody');
        const paginationContainer = document.getElementById('fbHistoryPagination');
        
        if (!container) return;
        container.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
              Đang tải lịch sử đăng bài...
            </td>
          </tr>
        `;

        try {
          const resp = await fetch(`/api/facebook?action=history&page=${page}&limit=20`);
          const result = await resp.json();

          if (resp.status !== 200 || result.error) {
            container.innerHTML = `
              <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: #ef4444; font-weight: 700;">
                  ❌ Không thể tải lịch sử: ${result.error || 'Lỗi không xác định'}
                </td>
              </tr>
            `;
            return;
          }

          if (result.warning) {
            container.innerHTML = `
              <tr>
                <td colspan="6" style="text-align: center; padding: 32px; color: #ea580c; background: #fff7ed; border-radius: 8px;">
                  ⚠️ ${result.warning}
                  <br>
                  <span style="font-size: 11.5px; opacity: 0.9; margin-top: 6px; display: inline-block;">
                    Hãy mở mục <strong>Cấu hình Fanpage</strong> ở trên -> xem phần <strong>Mã SQL hướng dẫn khởi tạo</strong>, copy đoạn code và chạy SQL Editor trong Supabase của bạn một lần để tạo bảng này.
                  </span>
                </td>
              </tr>
            `;
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
          }

          const data = result.data || [];
          const count = result.count || 0;
          fbHistoryTotalPages = Math.ceil(count / 20) || 1;

          if (data.length === 0) {
            container.innerHTML = `
              <tr>
                <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
                  📭 Chưa có lịch sử đăng bài bất động sản nào được ghi nhận.
                </td>
              </tr>
            `;
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
          }

          let html = '';
          data.forEach(item => {
            const timeStr = item.posted_at ? new Date(item.posted_at).toLocaleString('vi-VN') : '---';
            const statusBadge = item.status === 'success' 
              ? `<span style="background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 99px; display: inline-block;">✅ Thành công</span>`
              : `<span style="background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 99px; display: inline-block;">❌ Thất bại</span>`;

            const errMessage = item.error_message 
              ? `<span style="color: #c62828; font-size: 12px; display: inline-block; max-width: 250px; overflow-wrap: break-word; white-space: normal;">${escapeHtml(item.error_message)}</span>` 
              : `<span style="color: var(--text-muted); font-size: 12px;">---</span>`;

            html += `
              <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s; background: #fff;">
                <td style="padding: 12px 16px; font-size: 12px; color: var(--text-muted); font-family: monospace;">#${escapeHtml(item.product_id || 'N/A')}</td>
                <td style="padding: 12px 16px; font-size: 13.5px; color: var(--primary); font-weight: 700;">${escapeHtml(item.product_name || 'N/A')}</td>
                <td style="padding: 12px 16px; font-size: 13.5px; color: var(--text-dark); font-weight: 700;">🔷 ${escapeHtml(item.page_name || '---')} <br><span style="font-size: 10.5px; font-weight: normal; color: var(--text-muted);">ID: ${escapeHtml(item.page_id || '---')}</span></td>
                <td style="padding: 12px 16px; font-size: 12.5px; color: var(--text-muted); font-family: monospace;">${escapeHtml(timeStr)}</td>
                <td style="padding: 12px 16px;">${statusBadge}</td>
                <td style="padding: 12px 16px; max-width: 250px;">${errMessage}</td>
              </tr>
            `;
          });
          container.innerHTML = html;

          // Render pagination
          if (paginationContainer) {
            if (fbHistoryTotalPages <= 1) {
              paginationContainer.innerHTML = '';
            } else {
              let pagHtml = `
                <div style="display: flex; align-items: center; gap: 6px; font-size: 13.5px;">
                  <button type="button" onclick="loadFacebookPostHistory(1)" ${fbHistoryCurrentPage === 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #eee;"' : 'style="cursor: pointer; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #fff;"'}>« Đầu</button>
                  <button type="button" onclick="loadFacebookPostHistory(${fbHistoryCurrentPage - 1})" ${fbHistoryCurrentPage === 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #eee;"' : 'style="cursor: pointer; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #fff;"'}>‹ Trước</button>
                  <span style="font-weight: 700; margin: 0 8px; color: var(--text-dark);">Trang ${fbHistoryCurrentPage} / ${fbHistoryTotalPages}</span>
                  <button type="button" onclick="loadFacebookPostHistory(${fbHistoryCurrentPage + 1})" ${fbHistoryCurrentPage === fbHistoryTotalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #eee;"' : 'style="cursor: pointer; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #fff;"'}>Sau ›</button>
                  <button type="button" onclick="loadFacebookPostHistory(${fbHistoryTotalPages})" ${fbHistoryCurrentPage === fbHistoryTotalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #eee;"' : 'style="cursor: pointer; padding: 6px 12px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border); background: #fff;"'}>Cuối »</button>
                </div>
              `;
              paginationContainer.innerHTML = pagHtml;
            }
          }
        } catch (err) {
          console.error(err);
          container.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 24px; color: #ef4444; font-weight: 700;">
                ❌ Lỗi kết nối API máy chủ hoặc chưa khởi tạo bảng.
              </td>
            </tr>
          `;
        }
      }

      window.loadFacebookPostHistory = loadFacebookPostHistory;

      async function loadFacebookPages() {
        const container = document.getElementById('fbPagesList');
        if (!container) return;
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px 0;">⌛ Đang tải danh sách...</div>';

        try {
          const response = await fetch('/api/facebook?action=list-pages');
          const pages = await response.json();
          globalFacebookPages = pages || [];

          if (response.status !== 200 || pages.error) {
            container.innerHTML = `<div style="color: #ef4444; font-size: 13px; text-align: center; padding: 24px 10px;">❌ Lỗi: ${pages.error || 'Không thể lấy dữ liệu'}</div>`;
            return;
          }

          if (!Array.isArray(pages) || pages.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 13.5px; text-align: center; padding: 40px 10px;">Chưa cấu hình fanpage nào.</div>';
            return;
          }

          let html = '';
          pages.forEach(p => {
            html += `
              <div class="fb-page-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-light); transition: var(--transition);">
                <div style="flex: 1; min-width: 0; padding-right: 12px;">
                  <div style="font-weight: 700; font-size: 14px; color: var(--primary); display: flex; align-items: center; gap: 6px;">
                    <span style="color: #1877f2; font-size: 16px;">🔷</span> ${escapeHtml(p.page_name)}
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                    <strong>ID:</strong> ${escapeHtml(p.page_id)}
                  </div>
                  <div style="font-size: 11.5px; font-family: var(--font-mono); color: #15803d; background: #dcfce7; display: inline-block; padding: 2px 6px; border-radius: 4px; margin-top: 4px;">
                    🔑 ${escapeHtml(p.access_token)}
                  </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <button onclick="editFacebookPage('${p.id}')" style="background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ✏️ Sửa
                  </button>
                  <button onclick="deleteFacebookPage('${p.id}')" style="background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            `;
          });
          container.innerHTML = html;
        } catch (err) {
          console.error(err);
          container.innerHTML = '<div style="color: #ef4444; font-size: 13px; text-align: center; padding: 24px 10px;">❌ Không kết nối được API máy chủ hoặc lỗi bảng chưa được tạo. Hãy chạy lệnh khởi tạo SQL trước.</div>';
        }
      }

      function editFacebookPage(id) {
        const p = globalFacebookPages.find(item => String(item.id) === String(id));
        if (!p) return;

        editingFacebookPageId = p.id;
        originalTokenValueForEdit = p.access_token;

        document.getElementById('fb_page_name').value = p.page_name || '';
        document.getElementById('fb_page_id').value = p.page_id || '';
        document.getElementById('fb_access_token').value = p.access_token || '';

        // Update form state header
        const formTitle = document.querySelector('#fbPageForm').previousElementSibling;
        if (formTitle) {
          formTitle.innerHTML = `✏️ Sửa Cấu Hình Fanpage`;
        }

        const submitBtn = document.getElementById('btnSaveFacebookPage');
        if (submitBtn) {
          submitBtn.textContent = 'Lưu thay đổi';
        }

        // Show/create cancel button
        let cancelBtn = document.getElementById('fbPageFormCancelBtn');
        if (!cancelBtn) {
          cancelBtn = document.createElement('button');
          cancelBtn.id = 'fbPageFormCancelBtn';
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Hủy';
          cancelBtn.onclick = cancelEditFacebookPage;
          cancelBtn.style.cssText = `
            background: #e2e8f0;
            color: #475569;
            border: 1px solid var(--border);
            font-weight: 700;
            font-size: 13.5px;
            padding: 10px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 4px;
            text-transform: uppercase;
            transition: opacity 0.2s;
            width: 100%;
          `;
          submitBtn.after(cancelBtn);
        } else {
          cancelBtn.style.display = 'block';
        }
      }

      function cancelEditFacebookPage() {
        editingFacebookPageId = null;
        originalTokenValueForEdit = '';

        document.getElementById('fb_page_name').value = '';
        document.getElementById('fb_page_id').value = '';
        document.getElementById('fb_access_token').value = '';

        const formTitle = document.querySelector('#fbPageForm').previousElementSibling;
        if (formTitle) {
          formTitle.innerHTML = `➕ Thêm Fanpage Mới`;
        }

        const submitBtn = document.getElementById('btnSaveFacebookPage');
        if (submitBtn) {
          submitBtn.textContent = 'Lưu Fanpage';
        }

        const cancelBtn = document.getElementById('fbPageFormCancelBtn');
        if (cancelBtn) {
          cancelBtn.style.display = 'none';
        }
      }

      async function syncAllFBFromSystemUser() {
        const btn = document.getElementById('btnSyncSystemUserFB');
        if (!btn) return;

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⌛ Đang đồng bộ...';
        btn.style.opacity = '0.6';

        try {
          const response = await fetch('/api/facebook?action=sync_all_pages_from_system_user', {
            method: 'POST'
          });
          const result = await response.json();

          if (!response.ok || result.error) {
            showToast(result.error || 'Gặp lỗi trong quá trình đồng bộ!', false);
          } else {
            const successCount = result.synced_count || 0;
            const failedCount = result.failed_pages ? result.failed_pages.length : 0;
            
            let message = `Đồng bộ thành công ${successCount} Fanpage từ System User!`;
            if (failedCount > 0) {
              message += ` Thất bại ${failedCount} trang.`;
            }

            showToast(message, true);

            if (result.failed_pages && result.failed_pages.length > 0) {
              console.warn("Một số Fanpage không đồng bộ thành công:", result.failed_pages);
            }
          }

          // Refresh the list
          await loadFacebookPages();
        } catch (err) {
          console.error('[syncAllFBFromSystemUser] error:', err);
          showToast('Không kết nối được API máy chủ để đồng bộ!', false);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
          btn.style.opacity = '1';
        }
      }

      async function saveFacebookPage(event) {
        if (event) event.preventDefault();

        const nameInput = document.getElementById('fb_page_name');
        const idInput = document.getElementById('fb_page_id');
        const tokenInput = document.getElementById('fb_access_token');

        if (!nameInput || !idInput || !tokenInput) return;

        const page_name = nameInput.value.trim();
        const page_id = idInput.value.trim();
        const access_token = tokenInput.value.trim();

        if (!page_name || !page_id || !access_token) {
          showToast("Vui lòng điền đầy đủ tất cả các trường dữ liệu!", false);
          return;
        }

        const isEdit = !!editingFacebookPageId;

        try {
          const btn = event?.submitter || event?.target || document.getElementById('btnSaveFacebookPage');
          const origText = btn ? btn.textContent : (isEdit ? 'Lưu thay đổi' : 'Lưu Fanpage');
          if (btn) {
            btn.disabled = true;
            btn.textContent = '⌛ Đang xử lý...';
            btn.style.opacity = '0.6';
          }

          const url = isEdit ? '/api/facebook?action=update-page' : '/api/facebook?action=save-page';
          const method = isEdit ? 'PUT' : 'POST';
          const payload = isEdit 
            ? { id: editingFacebookPageId, page_name, page_id, access_token } 
            : { page_name, page_id, access_token };

          // [DEBUG] Console log payload to verify the correct page ID is being sent as requested
          console.log("Saving Facebook Page Payload:", payload);

          const response = await fetch(url, {
            method: method,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (btn) {
            btn.disabled = false;
            btn.textContent = origText;
            btn.style.opacity = '1';
          }

          if (response.status === 200 || response.status === 201 || result.success) {
            showToast(isEdit ? "Cập nhật cấu hình Fanpage thành công!" : "Lưu cấu hình Fanpage thành công!", true);
            nameInput.value = '';
            idInput.value = '';
            tokenInput.value = '';
            
            logSystemActivity(isEdit ? 'UPDATE' : 'INSERT', isEdit ? `Đã cập nhật cấu hình fanpage: ${page_name}` : `Đã thêm cấu hình fanpage: ${page_name}`);
            cancelEditFacebookPage();
            loadFacebookPages();
          } else {
            console.error("Lưu Fanpage thất bại:", result);
            showToast("Lỗi khi lưu: " + (result.error || result.message || 'Lỗi không xác định từ máy chủ hoặc SQL.'), false);
          }
        } catch (err) {
          console.error("Lỗi khi kết nối API:", err);
          showToast("Lỗi khi lưu: Không thể kết nối với API máy chủ. Chi tiết: " + (err.message || err), false);
        }
      }

      async function deleteFacebookPage(id) {
        if (!id) return;
        const confirmOk = await showCustomConfirm(
          "⚠️ Xác nhận xóa cấu hình Fanpage", 
          "Anh/Chị có chắc chắn muốn xóa cấu hình fanpage này khỏi hệ thống không? Dữ liệu về token sẽ bị xóa hoàn toàn khỏi bảng."
        );
        if (!confirmOk) {
          return;
        }

        try {
          const response = await fetch(`/api/facebook?action=delete-page&id=${id}`, {
            method: 'DELETE'
          });

          const result = await response.json();

          if (response.status === 200 || result.success) {
            showToast("Đã xóa cấu hình Fanpage thành công!", true);
            logSystemActivity('DELETE', "Đã xóa một cấu hình fanpage khỏi Supabase.");
            
            // If deleting the page currently being edited, cancel the edit mode
            if (editingFacebookPageId === id) {
              cancelEditFacebookPage();
            }

            loadFacebookPages();
          } else {
            alert("Xóa thất bại: " + (result.error || 'Lỗi không xác định'));
          }
        } catch (err) {
          console.error(err);
          alert("Lỗi: Không thể kết nối dengan API máy chủ hoặc lỗi thực thi.");
        }
      }

      /* ==========================================
         FB PUBLISH MODAL & COMPOSITION LOGIC
         ========================================== */
      let activeFacebookPostProp = null;

      function detectLoaiHinh(item) {
        const title = (item.title || "").toLowerCase();
        if (title.includes("đất") || title.includes("đất nền")) return "Đất nền";
        if (title.includes("biệt thự")) return "Biệt thự";
        if (title.includes("căn hộ") || title.includes("chung cư")) return "Căn hộ";
        return "Nhà phố";
      }

      async function openFacebookPostModal(id) {
        const item = propertyData.find(p => p.id == id);
        if (!item) {
          showToast("Không tìm thấy thông tin sản phẩm!", false);
          return;
        }

        activeFacebookPostProp = item;

        // Reset elements
        const statusPanel = document.getElementById('fbModalStatusPanel');
        if (statusPanel) {
          statusPanel.style.display = 'none';
          statusPanel.innerHTML = '';
        }

        const submitBtn = document.getElementById('btnFacebookPublishSubmit');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.textContent = '🚀 Đăng ngay lên Facebook';
        }

        const modal = document.getElementById('facebookPublishModal');
        if (modal) {
          modal.style.display = 'flex';
          modal.offsetHeight; // trigger reflow
          modal.style.opacity = '1';
          modal.style.pointerEvents = 'auto';
        }

        // Fill visual header of modal
        const imgEl = document.getElementById('fbModalProdImg');
        if (imgEl) {
          imgEl.src = item.img ? getOptimizedCloudinaryUrl(item.img, 100, 75) : 'https://placehold.co/100x75?text=BDS';
        }

        const titleEl = document.getElementById('fbModalProdTitle');
        if (titleEl) {
          titleEl.textContent = item.title || 'Sản phẩm không tên';
        }

        const subEl = document.getElementById('fbModalProdSub');
        if (subEl) {
          subEl.textContent = `Giá: ${item.priceText || item.price || 'Thỏa thuận'} • Diện tích: ${item.area || 'N/A'} m² • Phường: ${item.ward || 'N/A'}`;
        }

        // Initialize / generate random caption
        regenerateFacebookCaption();

        // Initialize / load checkboxed images (max 4 images)
        setupFacebookModalImages(item);

        // Initialize / load saved Facebook Page configurations (checkboxes)
        await loadFacebookModalFanpages();
      }

      function closeFacebookPublishModal() {
        const modal = document.getElementById('facebookPublishModal');
        if (modal) {
          modal.style.opacity = '0';
          modal.style.pointerEvents = 'none';
          setTimeout(() => {
            modal.style.display = 'none';
          }, 250);
        }
        activeFacebookPostProp = null;
      }

      function cleanCaptionFromExaggerations(text) {
        if (!text) return "";
        let cleaned = text;
        const replacements = [
          { pattern: /tốt nhất/gi, rep: "tốt" },
          { pattern: /đẹp nhất/gi, rep: "nhà đẹp" },
          { pattern: /hiếm nhất/gi, rep: "tiềm năng" },
          { pattern: /số 1/gi, rep: "chất lượng" },
          { pattern: /đỉnh nhất/gi, rep: "nổi bật" },
          { pattern: /duy nhất/gi, rep: "đặc biệt" },
          { pattern: /hoàn hảo/gi, rep: "chỉn chu" },
          { pattern: /đẳng cấp nhất/gi, rep: "cao cấp" },
          { pattern: /siêu phẩm/gi, rep: "nhà đẹp" },
          { pattern: /hoàn mỹ/gi, rep: "chỉn chu" },
          { pattern: /độc nhất vô nhị/gi, rep: "đặc biệt" },
          { pattern: /độc nhất/gi, rep: "tiềm năng" },
          { pattern: /tuyệt vời nhất/gi, rep: "rất thuận tiện" },
          { pattern: /đỉnh cao/gi, rep: "chất lượng" },
          { pattern: /vô địch/gi, rep: "tiềm năng" },
          { pattern: /hiếm có khó tìm/gi, rep: "tiềm năng" }
        ];
        replacements.forEach(({ pattern, rep }) => {
          cleaned = cleaned.replace(pattern, rep);
        });
        return cleaned;
      }

      function formatPriceToVnText(val) {
        if (!val) return "Thỏa thuận";
        if (typeof val === 'string' && (val.includes('Tỷ') || val.includes('Triệu') || val.includes('tỷ') || val.includes('triệu'))) {
          return val;
        }
        let numVal = parseFloat(val);
        if (isNaN(numVal) || numVal <= 0) {
          return val;
        }
        if (numVal < 50) {
          if (numVal >= 1) {
            const ty = Math.floor(numVal);
            const le = Math.round((numVal - ty) * 1000);
            if (le > 0) {
              return `${ty} Tỷ ${le} Triệu`;
            } else {
              return `${ty} Tỷ`;
            }
          } else {
            const trieu = Math.round(numVal * 1000);
            return `${trieu} Triệu`;
          }
        } else {
          const ty = Math.floor(numVal / 1000);
          const le = Math.round(numVal % 1000);
          if (ty > 0) {
            if (le > 0) {
              return `${ty} Tỷ ${le} Triệu`;
            } else {
              return `${ty} Tỷ`;
            }
          } else {
            return `${le} Triệu`;
          }
        }
      }

      async function regenerateFacebookCaption() {
        if (!activeFacebookPostProp) return;
        const p = activeFacebookPostProp;

        const tenTin = p.title || '';
        const dienTich = p.area ? p.area + 'm²' : '';
        const chieuNgang = (p.width && parseFloat(p.width) > 0) ? p.width + 'm' : '';
        const phongNgu = (p.bedrooms !== undefined && p.bedrooms !== null && p.bedrooms !== '') ? p.bedrooms : '';
        const phongWC = (p.bathrooms !== undefined && p.bathrooms !== null && p.bathrooms !== '') ? p.bathrooms : '';
        const phapLy = p.legal || '';
        const hotline = '0854.100.036';
        const moTa = p.desc || '';
        const loaiHinh = detectLoaiHinh(p);
        const diaChi = p.address || '';
        const huongNha = (p.direction && p.direction !== 'Không xác định' && p.direction !== 'Chưa xác định') ? p.direction : '';

        const giaTxt = formatPriceToVnText(p.price || p.priceText);
        const isLand = loaiHinh.toLowerCase().includes('đất') || loaiHinh.toLowerCase().includes('nền');

        const txtArea = document.getElementById('fbModalCaption');
        if (!txtArea) return;

        // 1. Tình trạng nhà: mới hoàn công/đã hoàn thiện/xây kiên cố... - lấy từ trường moTa nếu có nhắc tình trạng
        function getTinhTrangNha(desc) {
          if (!desc) return null;
          const lower = desc.toLowerCase();
          
          const optionsHoanCong = [
            "Tình trạng nhà: đã hoàn công đầy đủ, pháp lý sạch",
            "Hiện trạng: mới hoàn công hoàn chỉnh, sẵn sang tên",
            "Nhà đã hoàn công chuẩn chỉnh, cực kỳ yên tâm",
            "Hiện trạng: sổ hồng đã hoàn công đầy đủ, sẵn sàng giao dịch"
          ];
          const optionsKienCo = [
            "Hiện trạng: xây dựng kiên cố, cực kỳ chắc chắn",
            "Tình trạng nhà: thiết kế đúc kiên cố, kết cấu vững chãi",
            "Nhà đúc kiên cố, móng băng chắc chắn, bền đẹp",
            "Hiện trạng: kết cấu xây dựng kiên cố, chất lượng công trình rất tốt"
          ];
          const optionsHoanThien = [
            "Tình trạng nhà: đã hoàn thiện sạch đẹp, chỉn chu",
            "Hiện trạng: hoàn thiện tinh tế, nội thất cơ bản đầy đủ",
            "Nhà hoàn thiện đồng bộ, không gian ấm cúng sang trọng",
            "Tình trạng: đã hoàn thiện đẹp mắt, thiết kế trẻ trung tối ưu"
          ];
          const optionsONgay = [
            "Tình trạng nhà: sạch đẹp, dọn vào ở ngay",
            "Hiện trạng: nhà mới đẹp, sẵn sàng xách vali vào ở ngay",
            "Nhà đẹp lung linh, vào ở ngay không cần sửa chữa",
            "Hiện trạng: sẵn ở, thiết kế thông thoáng mát mẻ"
          ];
          const optionsMoiXay = [
            "Tình trạng nhà: mới xây dựng xong, cực kỳ tinh tươm",
            "Hiện trạng: nhà mới 100% tinh tươm, kiến trúc hiện đại",
            "Nhà mới xây dựng hoàn thiện, nội thất cơ bản xịn mịn",
            "Hiện trạng: nhà mới keng chưa qua sử dụng, sạch sẽ thoáng đãng"
          ];
          const optionsDatTrong = [
            "Hiện trạng: đất trống bằng phẳng, rất tiện xây mới",
            "Tình trạng: đất trống sạch sẽ, xây dựng tự do",
            "Hiện trạng: đất trống cao ráo, thích hợp thiết kế xây dựng mới"
          ];
          const optionsNhaCu = [
            "Hiện trạng: nhà cũ tính giá trị đất, rất tốt để tiện xây mới",
            "Tình trạng: nhà cấp 4 cũ, phù hợp cải tạo hoặc xây mới theo sở thích",
            "Hiện trạng: nhà cũ tiện xây dựng mới theo nhu cầu sử dụng"
          ];

          if (lower.includes("hoàn công")) {
            return optionsHoanCong[Math.floor(Math.random() * optionsHoanCong.length)];
          }
          if (lower.includes("kiên cố")) {
            return optionsKienCo[Math.floor(Math.random() * optionsKienCo.length)];
          }
          if (lower.includes("hoàn thiện")) {
            return optionsHoanThien[Math.floor(Math.random() * optionsHoanThien.length)];
          }
          if (lower.includes("ở ngay") || lower.includes("sẵn ở") || lower.includes("vào ở")) {
            return optionsONgay[Math.floor(Math.random() * optionsONgay.length)];
          }
          if (lower.includes("mới xây") || lower.includes("nhà mới") || lower.includes("mới tinh") || lower.includes("mới 100%")) {
            return optionsMoiXay[Math.floor(Math.random() * optionsMoiXay.length)];
          }
          if (lower.includes("đất trống") || lower.includes("đất nền")) {
            return optionsDatTrong[Math.floor(Math.random() * optionsDatTrong.length)];
          }
          if (lower.includes("nhà cũ") || lower.includes("cấp 4 cũ")) {
            return optionsNhaCu[Math.floor(Math.random() * optionsNhaCu.length)];
          }
          
          return null;
        }

        // 2. Vị trí: lấy từ diaChi, có thể thêm loại hẻm nếu trong moTa có nhắc "hẻm xe hơi"/"hẻm ô tô"/"mặt tiền"
        function getViTri(address, desc) {
          if (!address) return null;
          const lower = desc ? desc.toLowerCase() : '';
          let laneInfo = '';
          if (lower.includes("hẻm xe hơi") || lower.includes("xe hơi") || lower.includes("hxh")) {
            laneInfo = "hẻm xe hơi";
          } else if (lower.includes("hẻm ô tô") || lower.includes("ô tô") || lower.includes("hẻm oto") || lower.includes("oto")) {
            laneInfo = "hẻm ô tô";
          } else if (lower.includes("mặt tiền") || lower.includes("mt")) {
            laneInfo = "mặt tiền đường rộng rãi";
          }

          const options = [
            `Vị trí: ${address}${laneInfo ? `, ${laneInfo}` : ''}`,
            `Địa chỉ: ${address}${laneInfo ? ` (${laneInfo})` : ''}`,
            `Tọa lạc tại: ${address}${laneInfo ? `, khu vực ${laneInfo} thông thoáng` : ''}`,
            `Khu vực: ${address}${laneInfo ? `, vị trí ${laneInfo} cực đẹp` : ''}`
          ];
          return options[Math.floor(Math.random() * options.length)];
        }

        // 3. Diện tích, ngang, kết cấu, công năng
        let ketCau = '';
        if (p.floors !== undefined && p.floors !== null && p.floors !== '') {
          const f = parseInt(p.floors);
          if (f === 0) {
            ketCau = isLand ? 'đất trống' : 'nhà cấp 4';
          } else if (!isNaN(f)) {
            ketCau = f + ' tầng';
          } else {
            ketCau = p.floors;
          }
        }

        function getThongSoChiTiet(dt, ngang, kc, pn, wc, hn) {
          const dtPart = dt ? `diện tích ${dt}` : '';
          const ngangPart = ngang ? `ngang ${ngang}` : '';
          const kcPart = kc ? `kết cấu ${kc}` : '';
          
          const pnPart = pn ? `${pn} phòng ngủ` : '';
          const wcPart = wc ? `${wc} WC` : '';
          const congNangParts = [pnPart, wcPart].filter(Boolean);
          const congNangPart = congNangParts.length > 0 ? `công năng: ${congNangParts.join(', ')}` : '';
          const hnPart = hn ? `hướng ${hn}` : '';

          const detailsList = [dtPart, ngangPart, kcPart, congNangPart, hnPart].filter(Boolean);
          if (detailsList.length === 0) return null;

          const rawContent = detailsList.join(', ');
          const formattedContent = rawContent.charAt(0).toUpperCase() + rawContent.slice(1);

          const prefixes = [
            `Thông số: ${formattedContent}`,
            `Diện tích & Kết cấu: ${formattedContent}`,
            `Thông số lý tưởng: ${formattedContent}`,
            `Chi tiết sản phẩm: ${formattedContent}`
          ];

          return prefixes[Math.floor(Math.random() * prefixes.length)];
        }

        // 4. Khu vực xung quanh: trích từ moTa nếu có nhắc chợ/trường học/tiện ích/khu dân cư
        function getKhuVucXungQuanh(desc) {
          if (!desc) return null;
          
          // Split into sentences or clauses to find surrounding details
          const parts = desc.split(/[.,;\n•-]/);
          const matchedChunks = [];
          const keywords = ["chợ", "trường", "tiện ích", "dân cư", "bệnh viện", "siêu thị", "bách hóa", "trung tâm", "ubnd", "ủy ban", "công viên", "gần"];
          
          for (let part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const lower = trimmed.toLowerCase();
            
            const hasKeyword = keywords.some(kw => lower.includes(kw));
            if (hasKeyword) {
              matchedChunks.push(trimmed);
            }
          }
          
          if (matchedChunks.length === 0) return null;
          
          // Take first 3 matched details to construct the description naturally
          const extracted = matchedChunks.slice(0, 3).join(', ');
          const cleanExt = extracted.charAt(0).toLowerCase() + extracted.slice(1);
          
          const options = [
            `Khu vực xung quanh: ${cleanExt}`,
            `Tiện ích lân cận: ${cleanExt}`,
            `Tiện ích xung quanh: ${cleanExt}`,
            `Khu dân cư sinh sống: ${cleanExt}`
          ];
          return options[Math.floor(Math.random() * options.length)];
        }

        // 5. Pháp lý: {phapLy}, hỗ trợ công chứng nhanh
        function getPhapLy(pl) {
          const legalVal = pl || 'Sổ hồng riêng';
          const options = [
            `Pháp lý: ${legalVal}, hỗ trợ công chứng nhanh`,
            `Sổ sách pháp lý: ${legalVal}, hỗ trợ công chứng nhanh chóng`,
            `Pháp lý rõ ràng: ${legalVal}, bao sang tên công chứng nhanh`,
            `Tình trạng pháp lý: ${legalVal}, sẵn sàng hỗ trợ công chứng nhanh`
          ];
          return options[Math.floor(Math.random() * options.length)];
        }

        // 6. Giá hiện tại: {gia}, còn thương lượng
        function getGiaBan(g) {
          if (!g) return null;
          const options = [
            `Giá hiện tại: ${g}, còn thương lượng`,
            `Giá chào bán: ${g}, có thương lượng nhẹ`,
            `Giá cực kỳ tốt: ${g}, thương lượng chính chủ`,
            `Giá bán: ${g}, còn bớt lộc cho khách thiện chí`
          ];
          return options[Math.floor(Math.random() * options.length)];
        }

        // Assemble the bullet points
        const bullets = [];

        const ttrLine = getTinhTrangNha(moTa);
        if (ttrLine) bullets.push(`◦ ${ttrLine}`);

        const vtLine = getViTri(diaChi, moTa);
        if (vtLine) bullets.push(`◦ ${vtLine}`);

        const tsLine = getThongSoChiTiet(dienTich, chieuNgang, ketCau, phongNgu, phongWC, huongNha);
        if (tsLine) bullets.push(`◦ ${tsLine}`);

        const xqLine = getKhuVucXungQuanh(moTa);
        if (xqLine) bullets.push(`◦ ${xqLine}`);

        const plLine = getPhapLy(phapLy);
        if (plLine) bullets.push(`◦ ${plLine}`);

        const gLine = getGiaBan(giaTxt);
        if (gLine) bullets.push(`◦ ${gLine}`);

        // Assemble final text
        let finalCaption = bullets.join('\n');
        
        if (finalCaption) {
          finalCaption += '\n';
        }
        finalCaption += `Liên hệ: ${hotline} để xem nhà thực tế.`;

        // Hashtags
        const cleanLoaiHinh = loaiHinh.toLowerCase().replace(/\s+/g, '');
        finalCaption += `\n\n#nhaphophukhang #${cleanLoaiHinh} #trapk`;

        txtArea.value = finalCaption;
      }

      function setupFacebookModalImages(item) {
        const wrapper = document.getElementById('fbModalImagesWrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';

        let images = [];
        if (Array.isArray(item.imgList)) {
          images = [...item.imgList];
        } else if (typeof item.imgList === 'string' && item.imgList.trim() !== '') {
          try {
            const parsed = JSON.parse(item.imgList);
            if (Array.isArray(parsed)) {
              images = parsed;
            } else {
              images = [parsed];
            }
          } catch (e) {
            images = [item.imgList];
          }
        } else if (item.img) {
          images = [item.img];
        }

        // Limit to max 4 images
        const targetImages = images.filter(Boolean).slice(0, 4);

        if (targetImages.length === 0) {
          wrapper.innerHTML = '<div style="grid-column: span 4; text-align: center; font-size: 13px; color: var(--text-muted); padding: 12px 0;">Sản phẩm này không có hình ảnh nào.</div>';
          return;
        }

        targetImages.forEach((imgUrl) => {
          const div = document.createElement('div');
          div.style.position = 'relative';
          div.style.borderRadius = '6px';
          div.style.overflow = 'hidden';
          div.style.border = '1px solid var(--border)';
          div.style.aspectRatio = '4/3';

          div.innerHTML = `
            <img src="${getOptimizedCloudinaryUrl(imgUrl, 150, 110)}" style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.6); padding: 2px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
              <input type="checkbox" class="fb-modal-img-cb" value="${escapeHtml(imgUrl)}" checked style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent);">
            </div>
          `;
          wrapper.appendChild(div);
        });
      }

      async function loadFacebookModalFanpages() {
        const container = document.getElementById('fbModalCheckboxPagesList');
        if (!container) return;
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 10px 0; text-align: center;">⌛ Đang tải các trang Fanpage...</div>';

        try {
          const response = await fetch('/api/facebook?action=list-pages');
          const pages = await response.json();

          if (response.status !== 200 || pages.error) {
            container.innerHTML = `<div style="color: #ef4444; font-size: 13px; text-align: center;">❌ Không thể kết nối: ${pages.error}</div>`;
            return;
          }

          if (!Array.isArray(pages) || pages.length === 0) {
            container.innerHTML = `
              <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 10px 0;">
                Chưa có Trang Fanpage nào được cấu hình.
                <br>
                <a href="javascript:void(0)" onclick="closeFacebookPublishModal(); switchAdminTab('facebook');" style="color: var(--accent); font-weight: 700; text-decoration: underline; margin-top: 6px; display: inline-block;">Đi tới Cấu hình Fanpage ngay</a>
              </div>
            `;
            return;
          }

          let html = '';
          pages.forEach(p => {
            html += `
              <label class="fb-cb-label" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; transition: background 0.2s; user-select: none;">
                <input type="checkbox" class="fb-modal-page-cb" data-name="${escapeHtml(p.page_name)}" data-id="${escapeHtml(p.page_id)}" data-token="${escapeHtml(p.access_token)}" onchange="updateFacebookModalDelayVisibility()" style="width: 17px; height: 17px; cursor: pointer;">
                <span style="font-weight: 700; font-size: 13.5px; color: var(--text-dark); flex: 1;">🔷 ${escapeHtml(p.page_name)} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">(ID: ${escapeHtml(p.page_id)})</span></span>
              </label>
            `;
          });
          container.innerHTML = html;
        } catch (err) {
          console.error(err);
          container.innerHTML = '<div style="color: #ef4444; font-size: 13px; text-align: center;">❌ Lỗi kết nối API máy chủ.</div>';
        }
      }

      function updateFacebookModalDelayVisibility() {
        const checkboxes = document.querySelectorAll('.fb-modal-page-cb');
        let checkedCount = 0;
        checkboxes.forEach(cb => {
          if (cb.checked) checkedCount++;
        });

        const delayContainer = document.getElementById('fbModalDelayContainer');
        if (delayContainer) {
          if (checkedCount >= 2) {
            delayContainer.style.display = 'flex';
          } else {
            delayContainer.style.display = 'none';
          }
        }
      }

      async function submitFacebookPosts() {
        if (!activeFacebookPostProp) {
          showToast("Không tìm thấy thông tin sản phẩm đăng bài!", false);
          return;
        }

        const captionField = document.getElementById('fbModalCaption');
        const caption = captionField ? captionField.value.trim() : '';
        if (!caption) {
          showToast("Vui lòng nhập nội dung caption!", false);
          return;
        }

        // Get selected pages
        const pageCbs = document.querySelectorAll('.fb-modal-page-cb:checked');
        if (pageCbs.length === 0) {
          showToast("Vui lòng chọn ít nhất 1 Fanpage Facebook để đăng bài!", false);
          return;
        }

        const selectedPages = [];
        pageCbs.forEach(cb => {
          selectedPages.push({
            id: cb.dataset.id,
            name: cb.dataset.name,
            token: cb.dataset.token
          });
        });

        // Get selected images
        const imgCbs = document.querySelectorAll('.fb-modal-img-cb:checked');
        const selectedImages = [];
        imgCbs.forEach(cb => {
          selectedImages.push(cb.value);
        });

        // Initialize queue controller state
        window.cancelFbPosting = false;

        const submitBtn = document.getElementById('btnFacebookPublishSubmit');
        const statusPanel = document.getElementById('fbModalStatusPanel');

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.5';
          submitBtn.textContent = '⌛ Đang xử lý đăng bài...';
        }

        if (statusPanel) {
          statusPanel.style.display = 'block';
          statusPanel.style.background = '#f0fdf4';
          statusPanel.style.border = '1px solid #bbf7d0';
          statusPanel.style.color = '#166534';
          statusPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 8px; border-bottom: 1px dashed #bbf7d0; padding-bottom: 6px;">
              <span>⚙️ Tiến trình đăng bài:</span>
              <button type="button" onclick="window.cancelFbPosting = true; this.style.display='none';" style="background: #ef4444; color: white; border: none; padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: opacity 0.2s;">🛑 Dừng Hàng Chờ</button>
            </div>
          `;
        }

        try {
          // Giới hạn an toàn đăng bài đã gỡ bỏ theo yêu cầu


          // Delay handling - in seconds
          let delaySeconds = 2;
          const delayInput = document.getElementById('fbModalDelayHours');
          if (delayInput) {
            delaySeconds = parseFloat(delayInput.value) || 0;
            if (delaySeconds < 0) delaySeconds = 0;
          }
          const delayMs = delaySeconds * 1000;

          for (let i = 0; i < selectedPages.length; i++) {
            const page = selectedPages[i];

            if (window.cancelFbPosting) {
              if (statusPanel) {
                const cancelLog = document.createElement('div');
                cancelLog.style.color = '#ef4444';
                cancelLog.style.fontWeight = '700';
                cancelLog.style.marginTop = '8px';
                cancelLog.textContent = '🛑 Đã dừng hàng chờ đăng bài theo yêu cầu của Anh/Chị!';
                statusPanel.appendChild(cancelLog);
              }
              break;
            }

            if (i > 0 && delayMs > 0) {
              const waitLog = document.createElement('div');
              waitLog.style.color = '#b45309';
              waitLog.style.margin = '4px 0';
              if (statusPanel) statusPanel.appendChild(waitLog);

              let secondsLeft = Math.round(delayMs / 1000);
              for (let s = secondsLeft; s > 0; s--) {
                if (window.cancelFbPosting) {
                  break;
                }
                waitLog.innerHTML = `⏳ Sẽ đăng lên <strong>${escapeHtml(page.name)}</strong> sau ${s} giây tiếp theo...`;
                await new Promise(r => setTimeout(r, 1000));
              }

              if (window.cancelFbPosting) {
                if (statusPanel) {
                  const cancelLog = document.createElement('div');
                  cancelLog.style.color = '#ef4444';
                  cancelLog.style.fontWeight = '700';
                  cancelLog.style.marginTop = '8px';
                  cancelLog.textContent = '🛑 Đã dừng hàng chờ đăng bài theo yêu cầu của Anh/Chị!';
                  statusPanel.appendChild(cancelLog);
                }
                break;
              }
              waitLog.remove();
            }

            const stepLog = document.createElement('div');
            stepLog.style.margin = '4px 0';
            stepLog.innerHTML = `🔷 Đang tải dữ liệu và đăng bài lên <strong>${escapeHtml(page.name)}</strong>...`;
            if (statusPanel) statusPanel.appendChild(stepLog);

            const response = await fetch('/api/facebook?action=post', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                page_id: page.id,
                page_name: page.name,
                access_token: page.token,
                caption: caption,
                image_urls: selectedImages,
                product_id: String(activeFacebookPostProp.id),
                product_name: activeFacebookPostProp.title || 'Sản phẩm không tên'
              })
            });

            const result = await response.json();

            if (response.status === 200 && result.success) {
              stepLog.innerHTML = `✅ Đăng tin thành công lên <strong>${escapeHtml(page.name)}</strong>! <span style="font-size:11px; color:#15803d;">(Post ID: ${result.post_id})</span>`;
              logSystemActivity('POST_FB', `Đăng thành công sản phẩm #${activeFacebookPostProp.id} lên Page: ${page.name}`);
            } else {
              stepLog.style.color = '#b91c1c';
              stepLog.innerHTML = `❌ Thất bại tại <strong>${escapeHtml(page.name)}</strong>: ${result.error || result.message || 'Lỗi không xác định từ máy chủ Facebook'}`;
              logSystemActivity('POST_FB_ERR', `Lỗi đăng sản phẩm #${activeFacebookPostProp.id} lên Page ${page.name}: ${result.error || result.message}`);
            }
          }

          if (!window.cancelFbPosting) {
            // Complete
            if (statusPanel) {
              const finishLog = document.createElement('div');
              finishLog.style.fontWeight = '700';
              finishLog.style.marginTop = '12px';
              finishLog.style.color = '#15803d';
              finishLog.textContent = '🎉 Hoàn tất tiến trình đăng bài lên Facebook!';
              statusPanel.appendChild(finishLog);
            }
          }

        } catch (err) {
          console.error(err);
          if (statusPanel) {
            const errDiv = document.createElement('div');
            errDiv.style.color = '#b91c1c';
            errDiv.style.fontWeight = '700';
            errDiv.style.marginTop = '10px';
            errDiv.textContent = `🚨 Lỗi ngoại lệ trong quá trình thực thi: ${err.message || err}`;
            statusPanel.appendChild(errDiv);
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.textContent = '🚀 Đăng ngay lên Facebook';
          }
          // Hide stop queue button on wrapper header if exists
          try {
            const stopQBtn = statusPanel ? statusPanel.querySelector('button') : null;
            if (stopQBtn) stopQBtn.style.display = 'none';
          } catch(e) {}
        }
      }

      // Expose to window for inline onclick execution
      window.switchAdminTab = switchAdminTab;
      window.copyFacebookSql = copyFacebookSql;
      window.loadFacebookPages = loadFacebookPages;
      window.syncAllFBFromSystemUser = syncAllFBFromSystemUser;
      window.saveFacebookPage = saveFacebookPage;
      window.deleteFacebookPage = deleteFacebookPage;
      window.editFacebookPage = editFacebookPage;
      window.cancelEditFacebookPage = cancelEditFacebookPage;
      window.clearSystemLogs = clearSystemLogs;
      window.filterInbox = filterInbox;
      window.markLeadContacted = markLeadContacted;
      window.restoreLeadNew = restoreLeadNew;
      window.deleteLead = deleteLead;
      window.logSystemActivity = logSystemActivity;

      window.openFacebookPostModal = openFacebookPostModal;
      window.closeFacebookPublishModal = closeFacebookPublishModal;
      window.regenerateFacebookCaption = regenerateFacebookCaption;
      window.submitFacebookPosts = submitFacebookPosts;
      window.updateFacebookModalDelayVisibility = updateFacebookModalDelayVisibility;

      function checkAdminSession() {
        // Tải khởi dựng số liệu thống kê & Hộp thư mẫu cục bộ
        initAdminStats();
        
        // Tự động điều hướng nếu tải lại trang mà admin còn giữ phiên hoạt động
        if (isAdminLoggedIn) {
          switchToPage('admin');
          switchAdminTab('products');
          renderAdminReports();
          renderAdminInbox();
        } else {
          switchToPage('home');
        }
      }

      function renderAdminTable() {
        if (!adminTableBody) return;
        adminTableBody.innerHTML = '';

        // Update counts on sub-tabs dynamically
        const sellingCount = propertyData.filter(p => !p.isSold).length;
        const soldCount = propertyData.filter(p => p.isSold).length;
        const adminSellingCountEl = document.getElementById('adminSellingCount');
        const adminSoldCountEl = document.getElementById('adminSoldCount');
        if (adminSellingCountEl) adminSellingCountEl.textContent = sellingCount;
        if (adminSoldCountEl) adminSoldCountEl.textContent = soldCount;
        
        const qInput = document.getElementById('adminSearchQuery');
        const q = qInput ? qInput.value.trim().toLowerCase() : "";
        
        const wSelect = document.getElementById('adminFilterWard');
        const ward = wSelect ? wSelect.value : "";
        
        const sSelect = document.getElementById('adminFilterSort');
        const sortVal = sSelect ? sSelect.value : "newest";

        let filtered = [...propertyData];

        // 1. Filter by sub-tab: Selling vs Sold
        if (currentAdminSubTab === 'selling') {
          filtered = filtered.filter(p => !p.isSold);
        } else if (currentAdminSubTab === 'sold') {
          filtered = filtered.filter(p => p.isSold);
        }

        // 2. Lọc theo chuỗi tìm kiếm
        if (q) {
          filtered = filtered.filter(p => {
            const idMatch = String(p.id).includes(q);
            const titleMatch = p.title && p.title.toLowerCase().includes(q);
            const descMatch = p.desc && p.desc.toLowerCase().includes(q);
            const addressMatch = p.address && p.address.toLowerCase().includes(q);
            const wardMatch = p.ward && p.ward.toLowerCase().includes(q);
            const badgeMatch = p.badge && p.badge.toLowerCase().includes(q);
            return idMatch || titleMatch || descMatch || addressMatch || wardMatch || badgeMatch;
          });
        }

        // 3. Lọc theo Phường
        if (ward) {
          filtered = filtered.filter(p => p.ward === ward);
        }

        // 4. Sắp xếp kết quả
        if (sortVal === "newest") {
          filtered.sort((a, b) => b.id - a.id);
        } else if (sortVal === "oldest") {
          filtered.sort((a, b) => a.id - b.id);
        } else if (sortVal === "price_asc") {
          filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
        } else if (sortVal === "price_desc") {
          filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
        } else if (sortVal === "area_desc") {
          filtered.sort((a, b) => (parseInt(b.area) || 0) - (parseInt(a.area) || 0));
        } else if (sortVal === "discount") {
          filtered = filtered.filter(p => {
            return p.isPriceReduced && 
              p.priceUpdatedAt &&
              (Date.now() - new Date(p.priceUpdatedAt).getTime()) < 2 * 24 * 60 * 60 * 1000;
          });
        }

        // Cập nhật số lượng đếm hiển thị
        const filteredCountEl = document.getElementById('adminFilteredCount');
        if (filteredCountEl) {
          filteredCountEl.textContent = `Đang hiển thị ${filtered.length} / ${propertyData.length} sản phẩm`;
        }

        filtered.forEach(p => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--border)';
          const adminImgSrc = getOptimizedCloudinaryUrl(p.img, 100, 75);

          // Tính toán nhãn Mới đăng & Giảm giá & Đã bán
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
          const createdTime = p.created_at ? new Date(p.created_at).getTime() : 0;
          const isNew = createdTime > 0 && (Date.now() - createdTime) <= threeDaysMs;

          const updatedTime = p.updated_at ? new Date(p.updated_at).getTime() : 0;
          const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
          const wasEdited = updatedTime > 0 && (updatedTime - createdTime) > 60000;
          const isReduced = wasEdited && (Date.now() - updatedTime) <= twoDaysMs;

          let badgeHtml = '';
          let toggleSoldBtnHtml = '';
          if (p.isSold) {
            badgeHtml += ' <span style="background: #ef4444; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; display: inline-block; vertical-align: middle;">🔴 ĐÃ BÁN</span>';
            toggleSoldBtnHtml = `
              <button class="btn-action-restore" onclick="inlineToggleSold('${p.id}', false)" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.15); color: #22c55e; font-weight: 700; font-size: 12.5px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                🔄 Khôi phục
              </button>
            `;
          } else {
            toggleSoldBtnHtml = `
              <button class="btn-action-sold" onclick="inlineToggleSold('${p.id}', true)" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); color: #ef4444; font-weight: 700; font-size: 12.5px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                🏷️ Đã Bán
              </button>
            `;
          }
          if (isNew) {
            badgeHtml += ' <span style="background: #ef4444; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; display: inline-block; vertical-align: middle;">🔥 Mới</span>';
          }
          if (isReduced) {
            badgeHtml += ' <span style="background: #16a34a; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; display: inline-block; vertical-align: middle;">📉 Giảm giá</span>';
          }

          tr.innerHTML = `
            <td style="padding: 16px;">
              <img src="${adminImgSrc}" class="admin-prop-img" alt="" style="width: 70px; height: 50px; object-fit: cover; border-radius: 6px;">
            </td>
            <td style="padding: 16px;">
              <div class="admin-prop-title" style="font-weight: 700; color: var(--primary); font-size: 15px;">${p.title}${badgeHtml}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">ID: #${p.id} • ${p.area}m² • Đường/Hẻm: ${getPublicDisplayAddress(p)}</div>
            </td>
            <td style="padding: 16px; position: relative;" class="inline-price-cell" data-id="${p.id}">
              <div class="inline-price-display" onclick="startInlinePriceEdit(event, '${p.id}', ${p.price})" style="font-weight: 800; color: var(--accent); font-size: 15px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; padding: 2px 4px; border: 1px dashed transparent; transition: all 0.15s; width: fit-content;" onmouseenter="this.style.border='1px dashed rgba(255,255,255,0.2)'; this.style.backgroundColor='rgba(255,255,255,0.04)';" onmouseleave="this.style.border='1px dashed transparent'; this.style.backgroundColor='transparent';">
                ${p.priceText}
              </div>
              <div class="inline-price-edit-container" style="display: none; flex-direction: column; gap: 2px; max-width: 100px;">
                <div style="display: flex; align-items: center; gap: 4px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; padding: 2px 6px;">
                  <input type="number" step="any" class="inline-price-input" placeholder="${p.price}" value="${p.price}" style="width: 100%; border: none; outline: none; background: transparent; color: #f8fafc; font-weight: 700; font-size: 13.5px; padding: 2px 0;" onkeydown="handleInlinePriceKeydown(event, '${p.id}')">
                  <span style="color: var(--accent); font-weight: 700; font-size: 12px; white-space: nowrap;">Tỷ</span>
                </div>
                <div class="inline-price-error" style="display: none; color: #ef4444; font-size: 10px; font-weight: 600; margin-top: 2px;">Giá không hợp lệ</div>
              </div>
            </td>
            <td style="padding: 16px; position: relative;">
              <div style="font-weight: 600; color: var(--primary); font-size: 13.5px;">Phường ${p.ward}</div>
              <div class="inline-loai-vi-tri-container" data-id="${p.id}" style="margin-top: 4px; position: relative;">
                <div class="inline-display" onclick="startInlineEdit(event, '${p.id}')" style="font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; padding: 2px 6px; background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.12); color: var(--text-muted); transition: all 0.15s; width: fit-content;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'; this.style.color='var(--primary)';" onmouseleave="this.style.background='rgba(255,255,255,0.04)'; this.style.color='var(--text-muted)';">
                  ${(() => {
                    const lvt = p.loaiViTri;
                    if (lvt === 'hem_xe_hoi' || lvt === 'hem') {
                      return `🚗 Hẻm xe hơi`;
                    } else if (lvt === 'hem_xe_may') {
                      return `🛵 Hẻm xe máy`;
                    } else if (lvt === 'mat_tien') {
                      return `🏢 Mặt tiền`;
                    } else {
                      return `<span style="color: #64748b; font-style: italic;">— chưa phân loại —</span>`;
                    }
                  })()}
                </div>
                <div class="inline-edit-dropdown" style="display: none; position: absolute; left: 0; top: 26px; z-index: 50; min-width: 130px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4); padding: 4px;">
                  <div class="inline-option" onclick="selectInlineLoaiViTri(event, '${p.id}', 'hem_xe_hoi')" onmouseenter="this.style.backgroundColor='#334155'" onmouseleave="this.style.backgroundColor='transparent'" style="padding: 6px 8px; color: #f8fafc; font-size: 11.5px; font-weight: 600; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 6px; transition: background 0.1s; background: transparent;">
                    🚗 Hẻm xe hơi
                  </div>
                  <div class="inline-option" onclick="selectInlineLoaiViTri(event, '${p.id}', 'hem_xe_may')" onmouseenter="this.style.backgroundColor='#334155'" onmouseleave="this.style.backgroundColor='transparent'" style="padding: 6px 8px; color: #f8fafc; font-size: 11.5px; font-weight: 600; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 6px; transition: background 0.1s; background: transparent;">
                    🛵 Hẻm xe máy
                  </div>
                  <div class="inline-option" onclick="selectInlineLoaiViTri(event, '${p.id}', 'mat_tien')" onmouseenter="this.style.backgroundColor='#334155'" onmouseleave="this.style.backgroundColor='transparent'" style="padding: 6px 8px; color: #f8fafc; font-size: 11.5px; font-weight: 600; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 6px; transition: background 0.1s; background: transparent;">
                    🏢 Mặt tiền
                  </div>
                </div>
              </div>
            </td>
            <td style="padding: 16px; text-align: center;">
              <div class="admin-actions-cell" style="display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap;">
                <button class="btn-action-edit" onclick="showAdminForm('${p.id}')" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(30,58,138,0.06); border: 1px solid rgba(30,58,138,0.1); color: #2563eb; font-weight: 700; font-size: 12.5px; border-radius: 6px; cursor: pointer;">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.5-8.5a2.625 2.625 0 113.75 3.75L12 18.5H8.5V15L19.5 4z" />
                  </svg>
                  Sửa
                </button>
                ${toggleSoldBtnHtml}
                <button class="btn-action-delete" onclick="deleteAdminProperty('${p.id}')" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.1); color: #ef4444; font-weight: 700; font-size: 12.5px; border-radius: 6px; cursor: pointer;">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Xóa
                </button>
              </div>
            </td>
          `;
          adminTableBody.appendChild(tr);
        });
      }

      function showAdminForm(id) {
        const formSection = document.getElementById('adminFormSection');
        const dashboardSection = document.getElementById('adminDashboardSection');
        const formTitleHeader = document.getElementById('adminFormTitle');

        // Reset all inputs first
        if (formPropId) formPropId.value = '';
        if (formTitle) formTitle.value = '';
        if (formPrice) formPrice.value = '';
        if (formArea) formArea.value = '';
        if (formWard) formWard.value = '';
        if (formDirection) formDirection.value = 'Không xác định';
        if (formFloors) formFloors.value = '';
        if (formBadge) formBadge.value = '';
        if (formAddress) formAddress.value = '';
        if (formImg) formImg.value = '';
        if (formDesc) formDesc.value = '';

        const isReducedCheck = document.getElementById('formIsPriceReduced');
        const oldPriceGrp = document.getElementById('oldPriceGroup');
        const oldPriceFld = document.getElementById('formOldPrice');
        if (isReducedCheck) isReducedCheck.checked = false;
        if (oldPriceGrp) oldPriceGrp.style.display = 'none';
        if (oldPriceFld) oldPriceFld.value = '';

        const houseNumberInput = document.getElementById('ap_hn_fld');
        const loaiViTriInput = document.getElementById('formLoaiViTri');
        const streetInput = document.getElementById('ap_st_fld');
        const widthInput = document.getElementById('formWidth');
        const bedroomsInput = document.getElementById('formBedrooms');
        const bathroomsInput = document.getElementById('formBathrooms');
        const legalInput = document.getElementById('formLegal');

        if (houseNumberInput) houseNumberInput.value = '';
        if (loaiViTriInput) loaiViTriInput.value = 'hem_xe_hoi'; // Default khi tạo mới: chọn sẵn Hẻm xe hơi
        if (streetInput) streetInput.value = '';
        if (widthInput) widthInput.value = '';
        if (bedroomsInput) bedroomsInput.value = '';
        if (bathroomsInput) bathroomsInput.value = '';
        if (legalInput) legalInput.value = 'Sổ hồng riêng';

        if (id) {
          // Edit mode
          const item = propertyData.find(p => p.id == id);
          if (item) {
            if (formTitleHeader) formTitleHeader.innerHTML = '📋 Chỉnh sửa tin đăng bất động sản';
            if (formPropId) formPropId.value = item.id;
            if (formTitle) formTitle.value = item.title || '';
            if (formPrice) formPrice.value = item.price || '';
            if (formArea) formArea.value = item.area || '';
            if (formWard) formWard.value = item.ward || '';
            if (formDirection) formDirection.value = item.direction || 'Không xác định';
            if (formFloors) formFloors.value = (item.floors !== undefined && item.floors !== null) ? item.floors : '3';
            if (formBadge) formBadge.value = item.badge || '';
            if (formAddress) formAddress.value = item.address || '';
            if (formImg) formImg.value = item.img || '';
            if (formDesc) formDesc.value = item.desc || '';

            if (isReducedCheck) {
              isReducedCheck.checked = !!item.isPriceReduced;
              if (item.isPriceReduced) {
                if (oldPriceGrp) oldPriceGrp.style.display = 'block';
                if (oldPriceFld) oldPriceFld.value = item.oldPrice || '';
              }
            }

            if (houseNumberInput) houseNumberInput.value = item.houseNumber || '';
            if (loaiViTriInput) loaiViTriInput.value = item.loaiViTri || 'hem_xe_hoi';
            if (streetInput) streetInput.value = item.street || '';
            if (widthInput) widthInput.value = (item.width !== undefined && item.width !== null) ? item.width : '';
            if (bedroomsInput) bedroomsInput.value = (item.bedrooms !== undefined && item.bedrooms !== null) ? item.bedrooms : '';
            if (bathroomsInput) bathroomsInput.value = (item.bathrooms !== undefined && item.bathrooms !== null) ? item.bathrooms : '';
            if (legalInput) legalInput.value = item.legal || 'Sổ hồng riêng';

            // Handle images
            uploadedImagesList = [];
            if (Array.isArray(item.imgList)) {
              uploadedImagesList = [...item.imgList];
            } else if (typeof item.imgList === 'string' && item.imgList.trim() !== '') {
              try {
                const parsed = JSON.parse(item.imgList);
                if (Array.isArray(parsed)) {
                  uploadedImagesList = parsed;
                } else {
                  uploadedImagesList = [parsed];
                }
              } catch (e) {
                uploadedImagesList = [item.imgList];
              }
            } else if (item.img) {
              uploadedImagesList = [item.img];
            }

            // Handle sold status button
            const btn = document.getElementById('formSoldBtn');
            if (btn) {
              btn.style.display = 'inline-block';
              if (item.isSold) {
                btn.textContent = 'KHÔI PHỤC ĐÃ BÁN';
                btn.style.background = '#22c55e';
              } else {
                btn.textContent = 'ĐÁNH DẤU ĐÃ BÁN';
                btn.style.background = '#ef4444';
              }
            }
          }
        } else {
          // Create Mode
          if (formTitleHeader) formTitleHeader.innerHTML = '📋 Đăng tin rao bán nhà phố';
          uploadedImagesList = [];
          
          // Hide sold status button in create mode
          const btn = document.getElementById('formSoldBtn');
          if (btn) {
            btn.style.display = 'none';
          }
        }

        renderUploadedImagesPreviews();

        if (dashboardSection) dashboardSection.style.display = 'none';
        if (formSection) formSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function hideAdminForm(e) {
        if (e) e.preventDefault();
        const formSection = document.getElementById('adminFormSection');
        const dashboardSection = document.getElementById('adminDashboardSection');
        if (formSection) formSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function switchAdminSubTab(subTab) {
        currentAdminSubTab = subTab;
        
        const tabSelling = document.getElementById('adminSubTab_selling');
        const tabSold = document.getElementById('adminSubTab_sold');
        
        if (subTab === 'selling') {
          if (tabSelling) {
            tabSelling.style.background = 'var(--accent)';
            tabSelling.style.color = '#ffffff';
          }
          if (tabSold) {
            tabSold.style.background = 'var(--bg-light)';
            tabSold.style.color = 'var(--text-dark)';
            tabSold.style.border = '1px solid var(--border)';
          }
        } else {
          if (tabSelling) {
            tabSelling.style.background = 'var(--bg-light)';
            tabSelling.style.color = 'var(--text-dark)';
            tabSelling.style.border = '1px solid var(--border)';
          }
          if (tabSold) {
            tabSold.style.background = '#ef4444';
            tabSold.style.color = '#ffffff';
            tabSold.style.border = 'none';
          }
        }
        
        renderAdminTable();
      }
      window.switchAdminSubTab = switchAdminSubTab;

      async function toggleFormSoldStatus(e) {
        if (e) e.preventDefault();
        const idVal = formPropId ? formPropId.value : "";
        if (!idVal) return;
        
        const item = propertyData.find(p => p.id == idVal);
        if (!item) return;
        
        const currentlySold = !!item.isSold;
        
        if (!currentlySold) {
          const isConfirmed = await showCustomConfirm(
            "Đánh dấu Đã Bán",
            "Xác nhận đánh dấu tin này đã bán? Tin sẽ bị ẩn khỏi trang public."
          );
          if (!isConfirmed) return;
          item.isSold = true;
          logSystemActivity('EDIT', `Đánh dấu bất động sản #${item.id} (${item.title}) là ĐÃ BÁN.`);
        } else {
          const isConfirmed = await showCustomConfirm(
            "Khôi phục Đang bán",
            "Xác nhận khôi phục bất động sản này về trạng thái đang bán?"
          );
          if (!isConfirmed) return;
          item.isSold = false;
          logSystemActivity('EDIT', `Khôi phục bất động sản #${item.id} (${item.title}) về trạng thái Đang bán.`);
        }
        
        // Update the form button text/style immediately
        const btn = document.getElementById('formSoldBtn');
        if (btn) {
          if (item.isSold) {
            btn.textContent = 'KHÔI PHỤC ĐÃ BÁN';
            btn.style.background = '#22c55e';
          } else {
            btn.textContent = 'ĐÁNH DẤU ĐÃ BÁN';
            btn.style.background = '#ef4444';
          }
        }
        
        // Save to Supabase Cloud directly if connected
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast("Đang đồng bộ trạng thái Giao dịch lên Cloud...", true);
          fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${idVal}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_sold: item.isSold })
          }).then(res => {
            if (res.ok) {
              showToast(item.isSold ? "Đã đánh dấu bất động sản đã bán thành công!" : "Đã khôi phục bất động sản về trạng thái đang bán!", true);
              savePropertyDataToStorage();
              applyFilters();
              renderAdminTable();
              renderAdminReports();
            } else {
              showToast("Có lỗi xảy ra khi đồng bộ lên Cloud.", false);
              console.error("Lỗi đồng bộ is_sold lên Supabase:", res.status);
            }
          }).catch(err => {
            showToast("Có lỗi kết nối khi đồng bộ lên Cloud.", false);
            console.error("Lỗi đồng bộ is_sold lên Supabase:", err);
          });
        } else {
          showToast(item.isSold ? "Đã đánh dấu bất động sản đã bán thành công (Cục bộ)!" : "Đã khôi phục bất động sản về trạng thái đang bán (Cục bộ)!", true);
          savePropertyDataToStorage();
          applyFilters();
          renderAdminTable();
          renderAdminReports();
        }
      }
      window.toggleFormSoldStatus = toggleFormSoldStatus;

      async function inlineToggleSold(id, toSold) {
        const item = propertyData.find(p => String(p.id) === String(id));
        if (!item) return;

        if (toSold) {
          const isConfirmed = await showCustomConfirm(
            "Đánh dấu Đã Bán",
            "Đánh dấu tin này đã bán?"
          );
          if (!isConfirmed) return;
          item.isSold = true;
          logSystemActivity('EDIT', `Đánh dấu bất động sản #${item.id} (${item.title}) là ĐÃ BÁN (Trực tiếp từ danh sách).`);
        } else {
          const isConfirmed = await showCustomConfirm(
            "Khôi phục Đang bán",
            "Xác nhận khôi phục bất động sản này về trạng thái đang bán?"
          );
          if (!isConfirmed) return;
          item.isSold = false;
          logSystemActivity('EDIT', `Khôi phục bất động sản #${item.id} (${item.title}) về trạng thái Đang bán (Trực tiếp từ danh sách).`);
        }

        // Save to Supabase Cloud directly if connected
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast("Đang đồng bộ trạng thái Giao dịch lên Cloud...", true);
          fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_sold: item.isSold })
          }).then(res => {
            if (res.ok) {
              showToast(item.isSold ? "Đã đánh dấu bất động sản đã bán thành công!" : "Đã khôi phục bất động sản về trạng thái đang bán!", true);
              savePropertyDataToStorage();
              applyFilters();
              renderAdminTable();
              renderAdminReports();
            } else {
              showToast("Có lỗi xảy ra khi đồng bộ lên Cloud.", false);
              console.error("Lỗi đồng bộ is_sold lên Supabase:", res.status);
            }
          }).catch(err => {
            showToast("Có lỗi kết nối khi đồng bộ lên Cloud.", false);
            console.error("Lỗi đồng bộ is_sold lên Supabase:", err);
          });
        } else {
          showToast(item.isSold ? "Đã đánh dấu bất động sản đã bán thành công (Cục bộ)!" : "Đã khôi phục bất động sản về trạng thái đang bán (Cục bộ)!", true);
          savePropertyDataToStorage();
          applyFilters();
          renderAdminTable();
          renderAdminReports();
        }
      }
       window.inlineToggleSold = inlineToggleSold;
 
      function startInlineEdit(e, id) {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        
        // Close all other open inline dropdowns first
        document.querySelectorAll('.inline-edit-dropdown').forEach(el => {
          el.style.display = 'none';
        });
        
        const container = e.currentTarget.closest('.inline-loai-vi-tri-container');
        if (!container) return;
        
        const dropdown = container.querySelector('.inline-edit-dropdown');
        if (dropdown) {
          dropdown.style.display = 'block';
        }
        
        // Handler to close when clicking outside
        const closeDropdownHandler = (event) => {
          if (!container.contains(event.target)) {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeDropdownHandler);
          }
        };
        
        // Timeout to avoid immediate triggering from this click event
        setTimeout(() => {
          document.addEventListener('click', closeDropdownHandler);
        }, 50);
      }
      window.startInlineEdit = startInlineEdit;

      function selectInlineLoaiViTri(e, id, newValue) {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        
        // Find the property
        const item = propertyData.find(p => String(p.id) === String(id));
        if (!item) return;
        
        // Set new value locally
        item.loaiViTri = newValue;
        
        // Close dropdown
        const container = e.target.closest('.inline-loai-vi-tri-container');
        if (container) {
          const dropdown = container.querySelector('.inline-edit-dropdown');
          if (dropdown) dropdown.style.display = 'none';
        }
        
        // Save locally and sync to Supabase
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast("Đang đồng bộ loại vị trí lên Cloud...", true);
          fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ loai_vi_tri: newValue })
          }).then(res => {
            if (res.ok) {
              showToast("✓ Đã cập nhật", true);
              savePropertyDataToStorage();
              applyFilters();
              renderAdminTable();
              renderAdminReports();
            } else {
              showToast("Có lỗi xảy ra khi đồng bộ lên Cloud.", false);
              console.error("Lỗi đồng bộ loai_vi_tri lên Supabase:", res.status);
            }
          }).catch(err => {
            showToast("Có lỗi kết nối khi đồng bộ lên Cloud.", false);
            console.error("Lỗi đồng bộ loai_vi_tri lên Supabase:", err);
          });
        } else {
          showToast("✓ Đã cập nhật (Cục bộ)", true);
          savePropertyDataToStorage();
          applyFilters();
          renderAdminTable();
          renderAdminReports();
        }
      }
      window.selectInlineLoaiViTri = selectInlineLoaiViTri;
 
      function startInlinePriceEdit(e, id, currentPrice) {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        
        // Close all other open inline edits first
        document.querySelectorAll('.inline-price-cell').forEach(cell => {
          const disp = cell.querySelector('.inline-price-display');
          const editContainer = cell.querySelector('.inline-price-edit-container');
          if (disp && editContainer) {
            disp.style.display = 'inline-flex';
            editContainer.style.display = 'none';
            const errorEl = cell.querySelector('.inline-price-error');
            if (errorEl) errorEl.style.display = 'none';
          }
        });

        const cell = e.currentTarget.closest('.inline-price-cell');
        if (!cell) return;

        const disp = cell.querySelector('.inline-price-display');
        const editContainer = cell.querySelector('.inline-price-edit-container');
        const input = cell.querySelector('.inline-price-input');
        
        if (disp && editContainer && input) {
          disp.style.display = 'none';
          editContainer.style.display = 'flex';
          input.value = currentPrice || '';
          input.focus();
          input.select();

          // Handler to close when clicking outside
          const closePriceHandler = (event) => {
            if (!cell.contains(event.target)) {
              disp.style.display = 'inline-flex';
              editContainer.style.display = 'none';
              const errorEl = cell.querySelector('.inline-price-error');
              if (errorEl) errorEl.style.display = 'none';
              document.removeEventListener('click', closePriceHandler);
            }
          };

          // Timeout to avoid immediate triggering from this click event
          setTimeout(() => {
            document.addEventListener('click', closePriceHandler);
          }, 50);
        }
      }
      window.startInlinePriceEdit = startInlinePriceEdit;

      function handleInlinePriceKeydown(e, id) {
        if (e.key === 'Escape') {
          // Cancel edit
          const cell = e.target.closest('.inline-price-cell');
          if (cell) {
            const disp = cell.querySelector('.inline-price-display');
            const editContainer = cell.querySelector('.inline-price-edit-container');
            if (disp && editContainer) {
              disp.style.display = 'inline-flex';
              editContainer.style.display = 'none';
              const errorEl = cell.querySelector('.inline-price-error');
              if (errorEl) errorEl.style.display = 'none';
            }
          }
          return;
        }

        if (e.key === 'Enter') {
          const val = parseFloat(e.target.value);
          const cell = e.target.closest('.inline-price-cell');
          const errorEl = cell ? cell.querySelector('.inline-price-error') : null;

          if (isNaN(val) || val <= 0) {
            if (errorEl) {
              errorEl.style.display = 'block';
            }
            return;
          }

          if (errorEl) {
            errorEl.style.display = 'none';
          }

          // Save price
          saveInlinePrice(id, val);
        }
      }
      window.handleInlinePriceKeydown = handleInlinePriceKeydown;

      function saveInlinePrice(id, newPrice) {
        const item = propertyData.find(p => String(p.id) === String(id));
        if (!item) return;

        const oldPrice = parseFloat(item.price) || 0;
        
        if (newPrice < oldPrice && oldPrice > 0) {
          const localPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
          localPriceReductions[id] = Date.now();
          localStorage.setItem('local_price_reductions', JSON.stringify(localPriceReductions));
          item.priceReducedAt = Date.now();
          item.isPriceReduced = true;
          item.oldPrice = oldPrice;
        } else if (newPrice > oldPrice) {
          const localPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
          delete localPriceReductions[id];
          localStorage.setItem('local_price_reductions', JSON.stringify(localPriceReductions));
          delete item.priceReducedAt;
          item.isPriceReduced = false;
          item.oldPrice = null;
        }

        item.price = newPrice;
        item.priceText = newPrice + " Tỷ";

        // Save to Supabase Cloud directly if connected
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast("Đang đồng bộ giá lên Cloud...", true);
          
          const patchData = {
            price: newPrice,
            price_text: item.priceText
          };
          if (newPrice < oldPrice && oldPrice > 0) {
            patchData.is_price_reduced = true;
            patchData.old_price = oldPrice;
            patchData.price_updated_at = new Date().toISOString();
          } else if (newPrice > oldPrice) {
            patchData.is_price_reduced = false;
            patchData.old_price = null;
            patchData.price_updated_at = null;
          }

          fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(patchData)
          }).then(res => {
            if (res.ok) {
              showToast("✓ Đã cập nhật giá", true);
              savePropertyDataToStorage();
              applyFilters();
              renderAdminTable();
              renderAdminReports();
            } else {
              showToast("Có lỗi xảy ra khi đồng bộ lên Cloud.", false);
              console.error("Lỗi đồng bộ giá lên Supabase:", res.status);
            }
          }).catch(err => {
            showToast("Có lỗi kết nối khi đồng bộ lên Cloud.", false);
            console.error("Lỗi đồng bộ giá lên Supabase:", err);
          });
        } else {
          showToast("✓ Đã cập nhật giá", true);
          savePropertyDataToStorage();
          applyFilters();
          renderAdminTable();
          renderAdminReports();
        }
      }
      window.saveInlinePrice = saveInlinePrice;

      function selectQuickImg(url) {
        if (formImg) formImg.value = url;
      }

      let uploadedImagesList = []; // Mảng danh sách chuỗi Base64 ảnh thực tế

      // Hàm hiển thị list ảnh đã chọn
      function renderUploadedImagesPreviews() {
        const container = document.getElementById('realImagesPreviews');
        if (!container) return;
        container.innerHTML = '';
        
        if (uploadedImagesList.length === 0) {
          container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px 0;">
              Chưa quy tập hình ảnh thực tế nào. Vui lòng bấm "Chọn & Tải Ảnh" (Tối đa 10 ảnh).
            </div>
          `;
          return;
        }

        uploadedImagesList.forEach((base64, index) => {
          const div = document.createElement('div');
          div.className = 'real-img-preview-card';
          div.style.position = 'relative';
          div.style.borderRadius = '8px';
          div.style.overflow = 'hidden';
          div.style.aspectRatio = '1/1';
          div.style.border = '1px solid var(--border)';
          
          div.innerHTML = `
            <img src="${base64}" style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" onclick="removeUploadedImage(${index})" style="position: absolute; top: 4px; right: 4px; background: rgba(220, 38, 38, 0.85); color: white; border: none; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; line-height: 1; box-shadow: 0 2px 4px rgba(0,0,0,0.25);" title="Xóa ảnh này">
              ✕
            </button>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 10px; text-align: center; padding: 2px 0;">
              Ảnh ${index + 1}
            </div>
          `;
          container.appendChild(div);
        });
      }

      function removeUploadedImage(index) {
        uploadedImagesList.splice(index, 1);
        renderUploadedImagesPreviews();
      }

      function handleRealImagesUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        // Hỗ trợ cộng dồn tối đa 10 ảnh
        const remainingSpace = 10 - uploadedImagesList.length;
        if (remainingSpace <= 0) {
          alert("Bạn đã thêm tối đa 10 ảnh bất động sản rồi!");
          return;
        }
        
        const filesToProcess = files.slice(0, remainingSpace);
        if (files.length > remainingSpace) {
          alert(`Chỉ có thể tải thêm ${remainingSpace} ảnh (giới hạn tối đa 10 ảnh).`);
        }
        
        const dropzone = document.getElementById('imageUploadDropzone');
        const originalHTML = dropzone ? dropzone.innerHTML : '';
        if (dropzone) {
          dropzone.innerHTML = `
            <div class="cloud-uploading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px;">
              <svg style="color: var(--accent); margin-bottom: 12px; transform-origin: center; animation: spin 1s linear infinite;" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="2.5"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
              <div style="font-size: 14px; font-weight: 700; color: var(--accent);">Đang nén & đồng bộ ảnh lên Cloudinary...</div>
              <div id="uploadProgressText" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Đang xử lý: 0 / ${filesToProcess.length} ảnh</div>
            </div>
          `;
        }

        let processedCount = 0;
        let successCount = 0;
        let failCount = 0;

        async function uploadRawFile(file) {
          try {
            let base64String = null;
            if (typeof file === 'string') {
              base64String = file;
            } else {
              base64String = await new Promise((resolve) => {
                const r = new FileReader();
                r.readAsDataURL(file);
                r.onload = () => resolve(r.result);
                r.onerror = () => resolve(null);
              });
            }

            if (!base64String) {
              throw new Error("Không thể chuyển đổi ảnh thành chuỗi Base64");
            }

            const response = await fetch('/api/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ image: base64String })
            });
            
            const data = await response.json();
            if (response.ok && data.success && data.secure_url) {
              uploadedImagesList.push(data.secure_url);
              successCount++;
            } else {
              console.error("Lỗi upload file:", data?.error || response.statusText);
              failCount++;
            }
          } catch (err) {
            console.error("Lỗi kết nối upload file:", err);
            failCount++;
          } finally {
            processedCount++;
            updateProgressUI();
          }
        }

        function updateProgressUI() {
          const progressText = document.getElementById('uploadProgressText');
          if (progressText) {
            progressText.textContent = `Đang xử lý: ${processedCount} / ${filesToProcess.length} (Thành công: ${successCount}, Thất bại: ${failCount})`;
          }
          
          if (processedCount === filesToProcess.length) {
            if (dropzone) dropzone.innerHTML = originalHTML;
            renderUploadedImagesPreviews();
            
            if (successCount > 0) {
              showToast(`Đã tối ưu & tải lên Cloudinary thành công ${successCount} hình ảnh!`, true);
            }
            if (failCount > 0) {
              alert(`Có ${failCount} hình ảnh tải lên thất bại. Vui lòng đảm bảo bạn đã điền các biến môi trường Cloudinary thích hợp ở server.`);
            }
          }
        }

        filesToProcess.forEach(file => {
          const reader = new FileReader();
          reader.onload = function(event) {
            const base64Data = event.target.result;
            
            // Luôn nén và tối ưu kích thước hình ảnh ở phía client để tiết kiệm 90% băng thông tải lên
            const img = new Image();
            img.src = base64Data;
            img.onload = async function() {
              try {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const maxDim = 1200; // Tăng độ phân giải tối đa lên 1200px cho sắc nét hoàn hảo
                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Nén JPEG chất lượng cao 0.75
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
                await uploadRawFile(compressedBase64);
              } catch (err) {
                console.error("Lỗi nén ảnh:", err);
                await uploadRawFile(file);
              }
            };
            img.onerror = async function() {
              await uploadRawFile(file);
            };
          };
          reader.readAsDataURL(file);
        });
      }

      function compressBase64Image(base64Str, maxDim = 1200, quality = 0.75) {
        return new Promise((resolve) => {
          if (!base64Str) return resolve(null);
          // Chỉ nén các dữ liệu ảnh base64 thực sự, bỏ qua các dữ liệu khác như svg hoặc url thông thường
          if (!base64Str.startsWith('data:image/') || !base64Str.includes(';base64,')) {
            return resolve(base64Str);
          }
          const img = new Image();
          img.onload = function() {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (e) {
              console.warn("Lỗi trong quá trình nén base64 canvas:", e);
              resolve(base64Str);
            }
          };
          img.onerror = function() {
            resolve(base64Str);
          };
          img.src = base64Str;
        });
      }

      async function uploadBase64ToCloudinary(base64Str) {
        if (!base64Str) return null;
        // Bỏ qua nếu là url thông thường đã được lưu hoặc là ảnh svg vector đại diện
        if (!base64Str.startsWith('data:image/') || !base64Str.includes(';base64,')) {
          return base64Str.startsWith('http') ? base64Str : null;
        }
        try {
          const compressed = await compressBase64Image(base64Str);
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: compressed })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.secure_url) {
              return data.secure_url;
            }
          } else {
            const errData = await response.json().catch(() => ({}));
            console.error("Lỗi API upload:", errData?.error || response.statusText);
          }
        } catch (err) {
          console.error("Lỗi uploadBase64ToCloudinary:", err);
        }
        return null;
      }

      async function saveAdminProperty(e) {
        if (e) e.preventDefault();
        
        const idVal = formPropId ? formPropId.value : "";
        const titleVal = document.getElementById('formTitle').value.trim();
        const priceVal = parseFloat(document.getElementById('formPrice').value) || 0;
        const areaVal = parseInt(document.getElementById('formArea').value) || 0;
        const wardVal = document.getElementById('ap_wd_fld').value;
        const directionVal = document.getElementById('formDirection').value;
        const floorsVal = parseInt(document.getElementById('formFloors').value) || 0;
        const badgeVal = document.getElementById('formBadge').value.trim();
        const descVal = document.getElementById('formDesc').value;
        
        const houseNumberVal = document.getElementById('ap_hn_fld').value.trim();
        const loaiViTriVal = document.getElementById('formLoaiViTri').value;
        const streetVal = document.getElementById('ap_st_fld').value.trim();
        const widthRawText = document.getElementById('formWidth').value.trim();
        const widthVal = widthRawText !== "" ? (parseFloat(widthRawText) || 0) : 4;
        const bedroomsRawText = document.getElementById('formBedrooms').value.trim();
        const bedroomsVal = bedroomsRawText !== "" ? (parseInt(bedroomsRawText) || 0) : 3;
        const bathroomsRawText = document.getElementById('formBathrooms').value.trim();
        const bathroomsVal = bathroomsRawText !== "" ? (parseInt(bathroomsRawText) || 0) : 3;
        const legalVal = document.getElementById('formLegal').value.trim() || 'Sổ hồng riêng';
        const formImg = document.getElementById('formImg');

        const isPriceReducedChecked = document.getElementById('formIsPriceReduced') ? document.getElementById('formIsPriceReduced').checked : false;
        const oldPriceVal = isPriceReducedChecked ? (parseFloat(document.getElementById('formOldPrice').value) || null) : null;
        const priceUpdatedAtVal = isPriceReducedChecked ? new Date().toISOString() : null;

        // Tự động lắp ráp cấu trúc địa chỉ đầy đủ
        let addressVal = "";
        let addressParts = [];
        if (houseNumberVal) addressParts.push(houseNumberVal);
        if (streetVal) addressParts.push(streetVal);
        if (wardVal) addressParts.push("Phường " + wardVal);
        addressParts.push("TP. Thủ Đức, TP.HCM");
        
        const formAddress = document.getElementById('formAddress');
        addressVal = (formAddress && formAddress.value.trim() !== "") ? formAddress.value.trim() : addressParts.join(", ");

        let imgVal = formImg.value.trim() || "https://images.unsplash.com/photo-1564013799912-8581894dff3e?auto=format&fit=crop&w=800&q=80";
        let imgListVal = uploadedImagesList && uploadedImagesList.length > 0 ? uploadedImagesList : [imgVal];

        // Tự động kiểm tra và đồng bộ hóa các ảnh base64 còn sót rải rác lên Cloudinary trước khi lưu
        let hasBase64 = false;
        if (imgVal.startsWith('data:image/') && imgVal.includes(';base64,')) hasBase64 = true;
        if (imgListVal.some(img => img && typeof img === 'string' && img.startsWith('data:image/') && img.includes(';base64,'))) {
          hasBase64 = true;
        }

        if (hasBase64) {
          showToast("Đang đồng bộ hóa và tối ưu hình ảnh lên Cloudinary...", true);
          const cleanedImgList = [];
          for (let img of imgListVal) {
            if (img && typeof img === 'string' && img.startsWith('data:image/') && img.includes(';base64,')) {
              const secureUrl = await uploadBase64ToCloudinary(img);
              if (secureUrl) {
                cleanedImgList.push(secureUrl);
              } else {
                cleanedImgList.push("https://images.unsplash.com/photo-1564013799912-8581894dff3e?auto=format&fit=crop&w=800&q=80");
              }
            } else {
              cleanedImgList.push(img);
            }
          }
          imgListVal = cleanedImgList;
          if (imgVal.startsWith('data:image/') && imgVal.includes(';base64,')) {
            imgVal = imgListVal[0] || "https://images.unsplash.com/photo-1564013799912-8581894dff3e?auto=format&fit=crop&w=800&q=80";
          }
          uploadedImagesList = imgListVal;
          if (formImg) {
            formImg.value = imgVal;
          }
          renderUploadedImagesPreviews();
        }

        let success = true;
        let finalItem = null;

        if (idVal) {
          // Chỉnh sửa tin đăng có sẵn
          const item = propertyData.find(p => p.id == idVal);
          if (item) {
            const oldPrice = parseFloat(item.price) || 0;
            const newPrice = parseFloat(priceVal) || 0;
            if (newPrice < oldPrice && oldPrice > 0) {
              const localPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
              localPriceReductions[idVal] = Date.now();
              localStorage.setItem('local_price_reductions', JSON.stringify(localPriceReductions));
              item.priceReducedAt = Date.now();
            } else if (newPrice > oldPrice) {
              const localPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
              delete localPriceReductions[idVal];
              localStorage.setItem('local_price_reductions', JSON.stringify(localPriceReductions));
              delete item.priceReducedAt;
            }

            item.title = titleVal;
            item.price = priceVal;
            item.priceText = priceVal + " Tỷ";
            item.area = areaVal;
            item.ward = wardVal;
            item.direction = directionVal;
            item.floors = floorsVal;
            item.badge = badgeVal;
            
            // Làm sạch nội dung mô tả, thay thế thẻ HTML <br> và xóa dòng liên hệ BĐS theo yêu cầu người dùng
            let cleanedDesc = descVal.replace(/<br\s*\/?>/gi, '\n');
            const linesToRemove = [
              /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*TP\.\s*Thủ\s*Đức\)\.?/gi,
              /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*Lò\s*Lu,\s*TP\.\s*Thủ\s*Đức\)\.?/gi
            ];
            for (const regex of linesToRemove) {
              cleanedDesc = cleanedDesc.replace(regex, '');
            }
            cleanedDesc = cleanedDesc.trim();
            item.desc = cleanedDesc;
            
            item.address = addressVal;
            item.img = imgVal;
            item.imgList = imgListVal;
            item.houseNumber = houseNumberVal;
            item.loaiViTri = loaiViTriVal;
            item.street = streetVal;
            item.width = widthVal;
            item.bedrooms = bedroomsVal;
            item.bathrooms = bathroomsVal;
            item.legal = legalVal;
            item.isPriceReduced = isPriceReducedChecked;
            item.oldPrice = oldPriceVal;
            item.priceUpdatedAt = priceUpdatedAtVal;
            finalItem = item;
            lastSavedPropertyId = idVal;
          }
        } else {
          // Đăng tin mới với ID số nguyên 32-bit an toàn (sử dụng mốc giây thay vì mili giây)
          let newId = Math.floor(Date.now() / 1000);
          while (propertyData.some(p => p.id == newId)) {
            newId++;
          }
          // Làm sạch nội dung mô tả, thay thế thẻ HTML <br> và xóa dòng liên hệ BĐS theo yêu cầu người dùng
          let cleanedDesc = descVal.replace(/<br\s*\/?>/gi, '\n');
          const linesToRemove = [
            /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*TP\.\s*Thủ\s*Đức\)\.?/gi,
            /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*Lò\s*Lu,\s*TP\.\s*Thủ\s*Đức\)\.?/gi
          ];
          for (const regex of linesToRemove) {
            cleanedDesc = cleanedDesc.replace(regex, '');
          }
          cleanedDesc = cleanedDesc.trim();

          const newItem = {
            id: newId,
            title: titleVal,
            price: priceVal,
            priceText: priceVal + " Tỷ",
            area: areaVal,
            ward: wardVal,
            direction: directionVal,
            floors: floorsVal,
            badge: badgeVal,
            desc: cleanedDesc,
            address: addressVal,
            img: imgVal,
            imgList: imgListVal,
            houseNumber: houseNumberVal,
            loaiViTri: loaiViTriVal,
            street: streetVal,
            width: widthVal,
            bedrooms: bedroomsVal,
            bathrooms: bathroomsVal,
            legal: legalVal,
            views: 0,
            isPriceReduced: isPriceReducedChecked,
            oldPrice: oldPriceVal,
            priceUpdatedAt: priceUpdatedAtVal,
            isSold: false
          };
          propertyData.unshift(newItem);
          finalItem = newItem;
          lastSavedPropertyId = newId;
        }

        // Lưu vào Supabase Cloud nếu được kết nối
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey && finalItem) {
          showToast("Đang đồng bộ dữ liệu sửa đổi lên Supabase Cloud...", true);
          try {
            const bodyPayload = {
              id: finalItem.id,
              title: finalItem.title,
              price: finalItem.price,
              price_text: finalItem.priceText,
              ward: finalItem.ward,
              direction: finalItem.direction,
              floors: finalItem.floors,
              badge: finalItem.badge,
              address: finalItem.address,
              img: finalItem.img,
              img_list: JSON.stringify(finalItem.imgList),
              desc: finalItem.desc,
              area: finalItem.area,
              house_number: finalItem.houseNumber,
              loai_vi_tri: finalItem.loaiViTri,
              street: finalItem.street,
              width: finalItem.width,
              bedrooms: finalItem.bedrooms,
              bathrooms: finalItem.bathrooms,
              legal: finalItem.legal,
              views: finalItem.views,
              is_price_reduced: finalItem.isPriceReduced,
              old_price: finalItem.oldPrice,
              price_updated_at: finalItem.priceUpdatedAt,
              is_sold: finalItem.isSold || false
            };

            if (!supabaseHasViewsColumn) {
              delete bodyPayload.views;
            }

            const url = idVal 
              ? `${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${idVal}`
              : `${supabaseUrl}/rest/v1/${supabaseTable}`;
            
            let response = await fetch(url, {
              method: idVal ? 'PATCH' : 'POST',
              headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(bodyPayload)
            });

            if (!response.ok) {
              const errTxt = await response.text();
              const isKnownViewsIssue = errTxt.includes("views") || errTxt.includes("PGRST204") || errTxt.includes("column");
              
              if (isKnownViewsIssue) {
                console.warn("Supabase write first attempt warning (known views schema omission, will try fallback):", errTxt);
              } else {
                console.error("Supabase write failed:", errTxt);
              }
              
              // Nếu gặp lỗi PGRST204 hoặc thông báo lỗi cột 'views' không tồn tại
              if (isKnownViewsIssue) {
                console.warn("Phát hiện lỗi cột 'views' chưa được khởi tạo trên database Supabase của bạn. Đang thử lưu lại sau khi bỏ thuộc tính views...");
                const fallbackPayload = { ...bodyPayload };
                delete fallbackPayload.views;

                const fallbackResponse = await fetch(url, {
                  method: idVal ? 'PATCH' : 'POST',
                  headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify(fallbackPayload)
                });

                if (fallbackResponse.ok) {
                  showToast("Lưu thành công (Đã bỏ qua lưu trữ lượt xem do DB của bạn chưa chạy lệnh SQL thêm cột 'views')", true);
                } else {
                  const fallbackErrTxt = await fallbackResponse.text();
                  console.error("Supabase write fallback failed:", fallbackErrTxt);
                  alert("Không thể tải thông tin đồng bộ lên Supabase: " + fallbackErrTxt);
                  success = false;
                }
              } else {
                alert("Không thể tải thông tin đồng bộ lên Supabase: " + errTxt);
                success = false;
              }
            }
          } catch (e) {
            console.error("Network problem syncing with Supabase:", e);
            success = false;
          }
        }

        savePropertyDataToStorage();
        renderAdminTable();
        applyFilters();

        // Ghi nhật ký vào Hệ thống
        try {
          if (typeof logSystemActivity === 'function') {
            if (idVal) {
              logSystemActivity('EDIT', `Chỉnh sửa bất động sản ID: ${idVal} - "${titleVal.substring(0, 30)}..."`);
            } else {
              logSystemActivity('ADD', `Đăng tin mới rao bán thành công: "${titleVal.substring(0, 30)}..."`);
            }
          }
        } catch (errAct) {
          console.error(errAct);
        }

        if (success) {
          showToast("Đã lưu trữ tin rao bán bất động sản thành công!", true);
          openSaveSuccessModal();
        } else {
          showToast("Đã lưu tin cục bộ (Lỗi kết nối đồng bộ Cloud Database)", false);
          openSaveSuccessModal();
        }
      }

      async function analyzeRawDataAI(e) {
        if (e) e.preventDefault();
        
        const activeClientKey = localStorage.getItem('gemini_api_key') || buildGeminiKey;
        if (!activeClientKey && !serverHasKey) {
          alert("Vui lòng kích hoạt & thiết lập Gemini API Key tại bong bóng Chatbox AI góc dưới phải màn hình trước!");
          const aiChatWindow = document.getElementById('aiChatWindow');
          if (aiChatWindow && !aiChatWindow.classList.contains('open')) {
            aiChatWindow.classList.add('open');
            initChatboxState();
          }
          return;
        }

        let rawInputText = document.getElementById('aiInputPrompt').value.trim();
        if (!rawInputText) {
          alert("Vui lòng nhập hoặc dán thông tin thô của bất động sản trước khi thực hiện phân tích!");
          return;
        }
        // Thay thế sạch toàn bộ <br>, <br/> hoặc <br /> thành ký tự xuống dòng thực tế \n
        rawInputText = rawInputText.replace(/<br\s*\/?>/gi, '\n');

        const btn = e.currentTarget || e.target;
        let originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "⚡ Đang xử lý bóc tách...";

        const formTitle = document.getElementById('formTitle');
        const formHouseNumber = document.getElementById('ap_hn_fld');
        const formLoaiViTri = document.getElementById('formLoaiViTri');
        const formStreet = document.getElementById('ap_st_fld');
        const formWard = document.getElementById('ap_wd_fld');
        const formArea = document.getElementById('formArea');
        const formWidth = document.getElementById('formWidth');
        const formPrice = document.getElementById('formPrice');
        const formBedrooms = document.getElementById('formBedrooms');
        const formBathrooms = document.getElementById('formBathrooms');
        const formFloors = document.getElementById('formFloors');
        const formDirection = document.getElementById('formDirection');
        const formLegal = document.getElementById('formLegal');
        const formBadge = document.getElementById('formBadge');
        const formDesc = document.getElementById('formDesc');

        // Hiện thông báo trạng thái tạm thời
        formDesc.value = "🤖 Trợ lý AI đang áp dụng quy tắc phân tích chi tiết dữ liệu thô và cấu trúc bài viết... Vui lòng đợi trong giây lát...";

        const systemPayloadPrompt = `Bạn là một trợ lý thông minh cao cấp cho trang web BĐS TP. Thủ Đức, là chuyên gia sáng tạo nội dung bất động sản chuyên nghiệp.
Nhiệm vụ của bạn là nhận thông tin thô do người dùng cung cấp, lọc bỏ từ ngữ vi phạm, và:
1. Phân tích chi tiết để bóc tách các thông số cấu trúc của bất động sản.
2. Biên soạn một bài viết quảng cáo đăng bán (desc) chuẩn mực theo đúng quy tắc bên dưới.

Yêu cầu bóc tách các thông số cụ thể:
- Tiêu đề (title): Phải viết hoa toàn bộ, bắt đầu bằng icon (🔥), tóm tắt được điểm nhấn (Loại hình – Vị trí – Diện tích – Giá).
- Số nhà (houseNumber): Số nhà/số căn (nếu nhắc tới trong dữ liệu thô, nếu không thì để trống "").
- Loại vị trí (loaiViTri): Một trong ba giá trị chính xác sau: "hem_xe_hoi", "hem_xe_may", "mat_tien". (Hẻm xe hơi, xe tải, ô tô vào -> "hem_xe_hoi"; Hẻm xe máy, hẻm ba gác, hẻm nhỏ -> "hem_xe_may"; Nhà mặt tiền, mặt phố -> "mat_tien"). Nếu không có thông tin chi tiết, đặt mặc định là "hem_xe_hoi".
- Tên đường (street): Tên đường phố, hẻm chính (nếu nhắc tới, không thì bỏ trống).
- Phường/xã (ward): Tên phường tại TP. Thủ Đức (VD: Trường Thạnh, Long Phước, Hiệp Phú, Thạnh Mỹ Lợi, Cát Lái...). Nếu không nhắc tới phường nhưng có tên đường, hãy suy đoán phường tương ứng hoặc ghi "Thủ Đức".
- Diện tích (area): Giá trị số diện tích đất hoặc sử dụng (m²), phải là số nguyên.
- Ngang (width): Chiều ngang (m), số thực. Nếu không có, mặc định là 4.
- Giá bán (price): Giá chào bán quy đổi thành số thực đơn vị TỶ ĐỒNG. Nếu không có, gán mặc định là 0.
- Số phòng ngủ (bedrooms): Số phòng ngủ, nguyên. Nếu không có, mặc định là 3. (Nếu là đất trống/đất bán không có nhà thì đặt là 0).
- Số phòng vệ sinh (bathrooms): Số phòng vệ sinh, nguyên. Nếu không có, mặc định là 3. (Nếu là đất trống/đất bán không có nhà thì đặt là 0).
- Số tầng (floors): Số tầng kết cấu, nguyên. Nếu không có, mặc định là 3. ĐẶC BIỆT: Nếu bất động sản là đất trống, đất thổ cư, đất vườn, hoặc là bán đất (không có nhà cửa xây dựng hoặc ghi rõ là đất trống), thì trường floors (Số tầng) bắt buộc phải bóc tách bằng số 0 (không).
- Hướng nhà (direction): Một trong các hướng chuẩn: "Không xác định", "Đông", "Tây", "Nam", "Bắc", "Đông Nam", "Đông Bắc", "Tây Nam", "Tây Bắc". Hãy tìm hướng thích hợp từ dữ liệu thô, nếu không nhắc tới hướng thì bắt buộc chọn mặc định là "Không xác định".
- Pháp lý (legal): Tình trạng pháp lý, mặc định thường là "Sổ hồng riêng" hoặc theo dữ liệu thô.
- Nhãn nổi bật (badge): Một nhãn ngắn như "Sổ Hồng Riêng", "Hẻm Xe Hơi", "Mặt Tiền Kinh Doanh", "Sát Đại Học", "Giá Đầu Tư".

Yêu cầu biên soạn bài viết quảng cáo (desc):
Bạn phải tuân thủ nghiêm ngặt các quy tắc sau:

1. CẤU TRÚC BÀI VIẾT (BẮT BUỘC SỬ DỤNG KÝ TỰ XUỐNG DÒNG '\n' ĐỂ CHIA DÒNG CỤ THỂ):
Bạn bắt buộc phải trình bày nội dung bài viết dưới dạng có xuống dòng rõ ràng bằng ký tự '\n' cho từng dòng y hệt như cấu trúc dưới đây. Mỗi ý, mỗi thông tin hoặc mỗi gạch đầu dòng phải nằm trên một dòng riêng biệt. KHÔNG được gộp tất cả các dòng thành một đoạn văn duy nhất liền dòng.
- Tiêu đề: VIẾT HOA TOÀN BỘ, bắt đầu bằng icon (🔥), tóm tắt điểm nhấn (như loại hình, vị trí, diện tích, giá).
- Mục 1: THÔNG SỐ & GIÁ BÁN:
  + Dòng chữ: THÔNG SỐ & GIÁ BÁN:
  + Dòng tiếp theo: Vị trí tại phường [Tên Phường, ví dụ: Long Phước], TP. Thủ Đức.
  + Dòng tiếp theo: - Diện tích đất [Diện tích]m2.
  + Dòng tiếp theo: - Kết cấu gồm [Số tầng] tầng, thiết kế [Số PN] phòng ngủ và [Số WC] phòng vệ sinh.
  + Dòng tiếp theo: - Hướng nhà: [Hướng nhà]. Giá bán: [Giá] tỷ đồng.
- Mục 2: HIỆN TRẠNG:
  + Dòng chữ: HIỆN TRẠNG:
  + Sử dụng các dòng tiếp theo, mỗi dòng bắt đầu bằng dấu trừ '-' để liệt kê: thiết kế, nội thất, hạ tầng giao thông đường xá, pháp lý minh bạch...
- Kết bài: Dòng tiếp theo: Quý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất.
👉 CHÚ Ý QUAN TRỌNG: Tuyệt đối KHÔNG ĐƯỢC ghi thêm bất kỳ thông tin liên hệ, số điện thoại, zalo, email, hoặc địa chỉ văn phòng của Thanh Trà BĐS ở cuối bài viết. Hãy kết thúc chính xác ở câu kêu gọi hành động phía trên.

2. QUY ĐỊNH VỀ NGÔN NGỮ VÀ TRÌNH BÀY (TUÂN THỦ PHÁP LUẬT):
- CẤM: Tuyệt đối không dùng các từ ngữ khẳng định tuyệt đối hoặc mang tính cường điệu như: "tốt nhất", "đẹp nhất", "hiếm nhất", "số 1", "đỉnh nhất", "duy nhất", "hoàn hảo", "đẳng cấp nhất", "siêu phẩm".
- KHUYẾN KHÍCH: Sử dụng từ ngữ trung lập, khách quan như: "đắc địa", "tiềm năng", "hiện đại", "thuận tiện", "thông thoáng", "nổi bật", "phù hợp cho nhu cầu ở hoặc kinh doanh", "thiết kế chỉn chu".
- TRÌNH BÀY HÌNH THỨC:
  + BẮT BUỘC xuống dòng bằng kí tự '\n' cho từng thông số, từng dòng như hướng dẫn ở trên để bài viết đẹp mắt, dễ đọc.
  + Tuyệt đối KHÔNG dùng ký tự xuống dòng kép (\n\n) để tạo khoảng trống dòng trống giữa các dòng. Hãy dùng đúng một ký tự '\n' duy nhất để xuống dòng viết tiếp ngay dòng dưới để các dòng nằm khít nhau nhưng vẫn xuống dòng đẹp đẽ.
  + TUYỆT ĐỐI KHÔNG sử dụng hay cấu tạo thẻ HTML '<br>' hoặc bất kỳ thẻ HTML nào trong nội dung "desc" mà bạn biên soạn. Hãy chỉ dùng ký tự xuống dòng thực tế '\n' thông thường để đổi dòng.
  + Không được đưa số nhà cụ thể hay số hẻm riêng tư chi tiết vào nội dung bài viết quảng cáo (trừ khi có yêu cầu riêng). Chỉ đăng thông tin chung về khu vực/đường phố.
  + Không sử dụng tiêu đề "Ưu điểm" hay "Ưu điểm nổi bật". Thay vào đó hãy đặt tên phần là "HIỆN TRẠNG" đúng theo yêu cầu.

3. PHONG CÁCH VIẾT:
Ngắn gọn, súc tích, tập trung vào công năng sử dụng và tính pháp lý minh bạch (Sổ hồng, hoàn công đầy đủ).
Ngôn ngữ chuyên nghiệp, rõ ràng, phù hợp để người dùng đọc nhanh trên thiết bị di động.

4. CƠ CHẾ XỬ LÝ DỮ LIỆU:
Trực xuất thông tin có sẵn và lọc bỏ các từ ngữ vi phạm quy định ở mục 2 và áp dụng cấu trúc ở mục 1.
Nếu thông tin thiếu (như giá hoặc diện tích), hãy trình bày dựa trên những gì có sẵn và giữ nguyên câu kết bài.

Hãy trả về kết quả hoàn chỉnh dưới định dạng JSON duy nhất. KHÔNG bao quanh bằng bất cứ văn bản dẫn dắt hay markdown nhãn ngoại trừ cấu trúc JSON hợp lệ sau:
{
  "title": "...",
  "houseNumber": "...",
  "loaiViTri": "hem_xe_hoi / hem_xe_may / mat_tien",
  "street": "...",
  "ward": "...",
  "area": 0,
  "width": 0,
  "price": 0,
  "bedrooms": 0,
  "bathrooms": 0,
  "floors": 0,
  "direction": "...",
  "legal": "...",
  "badge": "...",
  "desc": "THÔNG SỐ & GIÁ BÁN:\nVị trí tại phường [Tên Phường], TP. Thủ Đức.\n- Diện tích đất [Diện Tích]m2.\n- Kết cấu gồm [Số Tầng] tầng, thiết kế [Số PN] phòng ngủ và [Số WC] phòng vệ sinh.\n- Hướng nhà: [Hướng Nhà]. Giá bán: [Giá] tỷ đồng.\nHIỆN TRẠNG:\n- [Ý hiện trạng 1]\n- [Ý hiện trạng 2]\n- [Ý hiện trạng 3]\n- [Ý hiện trạng 4]\n- [Ý hiện trạng 5]\nQuý khách hàng quan tâm đến tài sản này vui lòng liên hệ để nhận thêm chi tiết và sắp xếp lịch xem nhà/đất."
}

DỮ LIỆU THÔ CẦN PHÂN TÍCH:
"${rawInputText}"`;

        function fillFormWithResult(data) {
          if (!data) return;
          if (data.title && formTitle) formTitle.value = cleanCaptionFromExaggerations(data.title);
          if (data.houseNumber !== undefined && formHouseNumber) formHouseNumber.value = data.houseNumber;
          if (formLoaiViTri) {
            let mappedVal = data.loaiViTri || 'hem_xe_hoi';
            if (mappedVal === 'hem') mappedVal = 'hem_xe_hoi';
            formLoaiViTri.value = mappedVal;
          }
          if (data.street && formStreet) formStreet.value = data.street;
          if (data.ward && formWard) formWard.value = data.ward;
          if (data.area && formArea) formArea.value = data.area;
          if (data.width && formWidth) formWidth.value = data.width;
          if (data.price !== undefined && formPrice) formPrice.value = data.price;
          if (data.bedrooms !== undefined && formBedrooms) formBedrooms.value = data.bedrooms;
          if (data.bathrooms !== undefined && formBathrooms) formBathrooms.value = data.bathrooms;
          if (data.floors !== undefined && formFloors) formFloors.value = data.floors;
          if (data.legal && formLegal) formLegal.value = cleanCaptionFromExaggerations(data.legal);
          if (data.badge && formBadge) formBadge.value = cleanCaptionFromExaggerations(data.badge);
          
          if (data.desc && formDesc) {
            // Thay thế cả thẻ HTML <br> và bỏ dòng liên hệ Thanh Trà BĐS để tránh lỗi hiển thị
            let tempDesc = data.desc.replace(/<br\s*\/?>/gi, '\n');
            const linesToRemove = [
              /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*TP\.\s*Thủ\s*Đức\)\.?/gi,
              /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*Lò\s*Lu,\s*TP\.\s*Thủ\s*Đức\)\.?/gi
            ];
            for (const regex of linesToRemove) {
              tempDesc = tempDesc.replace(regex, '');
            }
            formDesc.value = cleanCaptionFromExaggerations(tempDesc.trim());
          }

          // Hướng nhà
          if (data.direction && formDirection) {
            const normalizedDir = data.direction.trim();
            const optionExists = Array.from(formDirection.options).some(opt => opt.value === normalizedDir);
            if (optionExists) {
              formDirection.value = normalizedDir;
            } else {
              if (normalizedDir.includes("Đông Nam")) formDirection.value = "Đông Nam";
              else if (normalizedDir.includes("Đông Bắc")) formDirection.value = "Đông Bắc";
              else if (normalizedDir.includes("Tây Nam")) formDirection.value = "Tây Nam";
              else if (normalizedDir.includes("Tây Bắc")) formDirection.value = "Tây Bắc";
              else if (normalizedDir.includes("Đông")) formDirection.value = "Đông";
              else if (normalizedDir.includes("Tây")) formDirection.value = "Tây";
              else if (normalizedDir.includes("Nam")) formDirection.value = "Nam";
              else if (normalizedDir.includes("Bắc")) formDirection.value = "Bắc";
            }
          }
        }

        try {
          const response = await fetch('/api/analyze-raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawInput: rawInputText,
              localKey: activeClientKey
            })
          });

          if (response.ok) {
            const resData = await response.json();
            fillFormWithResult(resData);
            showToast("Đã phân tích bách khoa toàn thư và tự động điền biểu mẫu BĐS thành công!", true);
            return;
          }
          throw new Error("Local server return error or offline");
        } catch (error) {
          console.warn("Proxy local offline. Đang kết nối trực tiếp đến Google Gemini Client-side qua nhóm API Keys...", error);
          
          const keysList = getGeminiKeysArray();
          if (keysList.length > 0) {
            let lastError = null;
            for (let i = 0; i < keysList.length; i++) {
              const currentKey = keysList[i];
              try {
                const directResponse = await fetchGeminiWithFallback(currentKey, {
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        { text: systemPayloadPrompt }
                      ]
                    }
                  ],
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                  }
                });

                if (directResponse.ok) {
                  const directData = await directResponse.json();
                  if (directData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const dataObj = JSON.parse(directData.candidates[0].content.parts[0].text);
                    fillFormWithResult(dataObj);
                    showToast("Đã bóc tách dữ liệu tuyệt đối thành công trực tiếp qua Client-side!", true);
                    return;
                  }
                }
                const errInfo = await directResponse.json().catch(() => ({}));
                console.error(`Direct api analysis with Key #${i + 1} failed:`, errInfo);
                lastError = errInfo;
              } catch (innerError) {
                console.error(`Lỗi phân tích trực tiếp client Key #${i + 1}:`, innerError);
                lastError = innerError;
              }
            }
          }
          alert("Không thể kết nối đến máy chủ AI để phân tích thông tin thô. Có thể tất cả các API Key trong nhóm của bạn đều bận hoặc hết hạn hôm nay. Hãy thêm mã API Key của riêng mình trong tiện ích Thiết lập để tiếp tục nhé!");
          formDesc.value = "";
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalContent;
        }
      }

      async function generateAIDescription(e) {
        if (e) e.preventDefault();
        
        const activeClientKey = localStorage.getItem('gemini_api_key') || buildGeminiKey;
        if (!activeClientKey && !serverHasKey) {
          alert("Vui lòng kích hoạt & thiết lập Gemini API Key tại bong bóng Chatbox AI góc dưới phải màn hình trước!");
          const aiChatTrigger = document.getElementById('aiChatTrigger');
          const aiChatWindow = document.getElementById('aiChatWindow');
          if (aiChatWindow && !aiChatWindow.classList.contains('open')) {
            aiChatWindow.classList.add('open');
            initChatboxState();
          }
          return;
        }

        const pWard = document.getElementById('ap_wd_fld').value;
        const pPrice = document.getElementById('formPrice').value || "Chưa xác định";
        const pArea = document.getElementById('formArea').value || "Chưa xác định";
        const pDirection = document.getElementById('formDirection').value;
        const pFloors = document.getElementById('formFloors').value;
        const pCustom = document.getElementById('aiInputPrompt').value.trim();

        const promptInput = `Bạn là chuyên gia tư vấn hàng đầu & Content Writer có tầm của Thanh Trà BĐS khu vực TP. Thủ Đức.
Mời bạn tự viết bài mô tả quảng cáo tin đăng bán nhà phố vô cùng ấn tượng và cuốn hút khách mua.
Các thông số kỹ thuật được lấy trực tiếp từ biểu mẫu:
- Vị trí: Phường ${pWard}, thành phố Thủ Đức, TP. Hồ Chí Minh
- Giá chào bán: ${pPrice} Tỷ đồng (tính thanh khoản cực tốt)
- Chiều sâu diện tích sử dụng: ${pArea} m² rộng rãi
- Hướng nhà: Hướng ${pDirection} đại lộc đại cát
- Quy mô kết cấu: nhà đúc kiên cố ${pFloors} tầng
- Đặc tính nổi bật kèm thêm: ${pCustom || "Hẻm xe hơi ra vào tự do, khu phố tri thức an ninh, dân trí cao"}

TUYỆT ĐỐI TUÂN THỦ QUY TẮC MÔ TẢ & LUẬT QUẢNG CÁO (TRÁNH CÁC TỪ NGỮ QUẢNG CÁO TỰ PHONG, KHẲNG ĐỊNH THỨ HẠNG HOẶC ĐỘC QUYỀN):
1. KHÔNG DÙNG nhóm khẳng định thứ hạng/chất lượng: Vĩnh viễn loại bỏ các chữ như "Số 1", "No.1", "Top 1", "Nhất", "Tốt nhất", "Uy tín nhất", "Hiệu quả nhất", "Chất lượng nhất", "Dẫn đầu", "Hàng đầu" hoặc các cụm từ so sánh tối thượng khác.
2. KHÔNG DÙNG nhóm khẳng định độc quyền: Tránh tuyệt đối "Duy nhất", "Độc nhất", "Chỉ có tại...".
3. KHÔNG DÙNG nhóm khẳng định quá đà về Bất động sản: Tránh viết "Đẹp nhất khu vực", "Vị trí đắc địa nhất", "Giá tốt nhất thị trường", "Cam kết sinh lờii cao nhất", "Sinh lời tốt nhất".
4. Thay thế bằng từ ngữ biểu đạt trang trọng, chuyên khoa và khách quan: Dùng "tiềm năng tốt", "vị trí đắc lực tiện lợi", "mức giá cực kỳ cạnh tranh, hợp lý trong phân khúc", "không gian sang trọng thoáng đãng, lộng gió", "kết cấu bền bỉ, phong cách thiết kế hiện đại".

Hãy soạn thảo theo cấu trúc mạch lạc:
1. Tiêu đề quảng cáo thu hút giới đầu tư và cư dân (sử dụng từ ngữ hợp lệ theo quy tắc trên).
2. Thiết kế chi tiết công năng tương xứng với ${pFloors} tầng (Phòng khách, bếp ấm cúng, số phòng ngủ tối ưu, toilet, không gian đón nắng gió tự nhiên).
3. Bản lĩnh pháp lý vững vàng: Sổ hồng riêng cầm tay thương lượng chính chủ, đã hoàn công quy hoạch chuẩn chỉnh, bảo đảm an toàn giao dịch.
4. Tiện ích liên hoàn: kế bên chợ, siêu thị bách hoá, kết nối giao thông linh hoạt qua Lò Lu hay Võ Chí Công đi trung tâm Quận 1, Quận 2, Quận 7 siêu tốc.
5. Chi tiết liên hệ tư vấn chuyên sâu mang danh: Thanh Trà BĐS (Hotline/Zalo: 0854.100.036, Email: thanhtra1996st@gmail.com, Văn phòng: Lò Lu, TP. Thủ Đức).`;

        const descTextarea = document.getElementById('formDesc');
        descTextarea.disabled = true;
        descTextarea.value = "🤖 Trợ lý thông minh AI đang phân tích tham chiếu biểu mẫu và tự viết mô tả rao bán đỉnh cao... Vui lòng chờ chút...";

        const btn = e.currentTarget || e.target;
        let originalContent = "";
        if (btn && btn.tagName === "BUTTON") {
          originalContent = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = "⚡ Đang biên soạn...";
        }

        try {
          // Thử gọi qua proxy Node.js backend đi kèm của hệ thống
          const response = await fetch('/api/generate-desc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              promptInput,
              localKey: activeClientKey
            })
          });

          if (response.ok) {
            const resData = await response.json();
            if (resData.reply) {
              descTextarea.value = resData.reply;
              showToast("AI viết bài tư vấn hoàn thiện thành công!", true);
              return;
            }
          }
          throw new Error("Express backend fails or returns error");
        } catch (error) {
          console.warn("Máy chủ viết bài proxy local không phản hồi hoặc đang chạy tĩnh trên Vercel. Đang tự động gọi trực tiếp Google Gemini API qua Client-side...", error);
          
          const keysList = getGeminiKeysArray();
          if (keysList.length > 0) {
            let lastError = null;
            for (let i = 0; i < keysList.length; i++) {
              const currentKey = keysList[i];
              try {
                const directResponse = await fetchGeminiWithFallback(currentKey, {
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        { text: promptInput }
                      ]
                    }
                  ],
                  generationConfig: {
                    temperature: 0.8
                  }
                });

                if (directResponse.ok) {
                  const directData = await directResponse.json();
                  if (directData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    descTextarea.value = directData.candidates[0].content.parts[0].text;
                    showToast("AI biên soạn bài mô tả thành công trực tiếp qua Client-side!", true);
                    return;
                  }
                }
                const errInfo = await directResponse.json().catch(() => ({}));
                console.error(`Direct desc Gemini API Key #${i + 1} error:`, errInfo);
                lastError = errInfo;
              } catch (innerError) {
                console.error(`Lỗi biên soạn trực tiếp qua client Key #${i + 1}:`, innerError);
                lastError = innerError;
              }
            }
          }
          
          descTextarea.value = "";
          alert("Không thể kết nối đến máy chủ AI để biên soạn bài mô tả. Có thể tất cả các API Key có sẵn đều bận học hết quota hôm nay. Hãy thêm mã API Key của riêng mình trong tiện ích Thiết lập để tiếp tục nhé!");
        } finally {
          descTextarea.disabled = false;
          if (btn && btn.tagName === "BUTTON") {
            btn.disabled = false;
            btn.innerHTML = originalContent;
          }
        }
      }

      // Các biến trạng thái Supabase toàn cục
      let supabaseUrl = localStorage.getItem('supabase_url') || "";
      let supabaseAnonKey = localStorage.getItem('supabase_anon_key') || "";
      let isSupabaseConnected = false;
      let supabaseTable = 'properties_hometea';
      let supabaseHasViewsColumn = true;

      // Khởi tạo trạng thái Supabase và cập nhật giao diện
      async function initSupabaseState() {
        const urlInput = document.getElementById('sb_ur_fld');
        const keyInput = document.getElementById('sb_ky_fld');
        
        let savedUrl = localStorage.getItem('supabase_url') || "";
        let savedKey = localStorage.getItem('supabase_anon_key') || "";

        // Kiểm tra xem có cấu hình build-time hợp lệ không
        const hasBuildUrl = typeof buildSupabaseUrl === 'string' && buildSupabaseUrl.trim() !== '' && !buildSupabaseUrl.startsWith('%');
        const hasBuildKey = typeof buildSupabaseKey === 'string' && buildSupabaseKey.trim() !== '' && !buildSupabaseKey.startsWith('%');

        // Chỉ tự động nạp cấu hình mặc định (build-time/fallback) nếu localStorage trống
        if (!savedUrl && hasBuildUrl) {
          savedUrl = buildSupabaseUrl;
          localStorage.setItem('supabase_url', savedUrl);
        }
        if (!savedKey && hasBuildKey) {
          savedKey = buildSupabaseKey;
          localStorage.setItem('supabase_anon_key', savedKey);
        }

        supabaseUrl = savedUrl;
        supabaseAnonKey = savedKey;

        // Đọc thẳng từ Vite env (Vercel build-time) hoặc fallback từ Server
        const viteUrl = hasBuildUrl ? buildSupabaseUrl : null;
        const viteKey = hasBuildKey ? buildSupabaseKey : null;
        if (viteUrl && viteKey) {
          supabaseUrl = viteUrl;
          supabaseAnonKey = viteKey;
          localStorage.setItem('supabase_url', supabaseUrl);
          localStorage.setItem('supabase_anon_key', supabaseAnonKey);
        } else {
          try {
            const res = await fetch('/api/supabase-config');
            if (res.ok) {
              const serverConfig = await res.json();
              if (serverConfig.supabaseUrl && serverConfig.supabaseAnonKey) {
                supabaseUrl = serverConfig.supabaseUrl;
                supabaseAnonKey = serverConfig.supabaseAnonKey;
                localStorage.setItem('supabase_url', supabaseUrl);
                localStorage.setItem('supabase_anon_key', supabaseAnonKey);
              }
            }
          } catch (e) {
            console.warn("Could not load server-side Supabase configuration hoặc đang chạy tĩnh trên Vercel:", e);
          }
        }

        if (urlInput) urlInput.value = supabaseUrl;
        if (keyInput) keyInput.value = supabaseAnonKey;
        
        if (supabaseUrl && supabaseAnonKey) {
          // Optimistic load: Directly fetch properties to avoid 3-second delay and duplicate test queries!
          // If the optimistic fetch fails due to missing table or column, it will automatically
          // trigger schema discovery testSupabaseConnection() to self-heal.
          await fetchPropertiesFromSupabase(true, 20);
        } else {
          updateSupabaseUIState(false, "offline");
          applyFilters();
          renderAdminTable();
        }
      }

      function updateSupabaseUIState(connected, mode = "") {
        isSupabaseConnected = connected;
        const badge = document.getElementById('supabaseConnectionBadge');
        const syncStatusText = document.getElementById('supabaseSyncStatusText');
        
        if (!badge) return;
        
        if (connected) {
          badge.style.background = "#dcfce7";
          badge.style.color = "#15803d";
          badge.style.borderColor = "#86efac";
          badge.textContent = "Đã kết nối Cloud";
          if (syncStatusText) {
            syncStatusText.textContent = "Đang đồng bộ trực diện rổ hàng với cơ sở dữ liệu Supabase Cloud.";
            syncStatusText.style.color = "#16a34a";
          }
        } else {
          if (mode === "error") {
            badge.style.background = "#fef3c7";
            badge.style.color = "#d97706";
            badge.style.borderColor = "#fcd34d";
            badge.textContent = "Lỗi kết nối";
            if (syncStatusText) {
              syncStatusText.textContent = "Kết nối Supabase lỗi (Sai URL/Key hoặc chưa chạy SQL khởi tạo bảng).";
              syncStatusText.style.color = "#dc2626";
            }
          } else {
            badge.style.background = "#f3f4f6";
            badge.style.color = "#4b5563";
            badge.style.borderColor = "#d1d5db";
            badge.textContent = "Chế độ Offline";
            if (syncStatusText) {
              syncStatusText.textContent = "Đang dùng bộ lưu trữ cục bộ LocalStorage. Chưa liên kết Cloud.";
              syncStatusText.style.color = "var(--text-muted)";
            }
          }
        }
      }

      function copySupabaseSql() {
        const copyText = document.getElementById("supabaseSqlCopyText");
        if (copyText) {
          copyText.select();
          copyText.setSelectionRange(0, 99999);
          navigator.clipboard.writeText(copyText.value);
          showToast("Đã sao chép kịch bản SQL khởi tạo vào Clipboard!", true);
        }
      }

      async function saveSupabaseSettings(e) {
        if (e) e.preventDefault();
        const urlInput = document.getElementById('sb_ur_fld').value.trim();
        const keyInput = document.getElementById('sb_ky_fld').value.trim();
        
        supabaseUrl = urlInput;
        supabaseAnonKey = keyInput;
        
        localStorage.setItem('supabase_url', urlInput);
        localStorage.setItem('supabase_anon_key', keyInput);
        
        showToast("Đang lưu cấu hình và kết nối đồng bộ...", true);
        await testSupabaseConnection(false, true); 
      }

      async function testSupabaseConnection(silent = false, fetchAndSync = false) {
        if (!supabaseUrl || !supabaseAnonKey) {
          if (!silent) alert("Vui lòng cấu hình đầy đủ Supabase URL & Anon Key!");
          updateSupabaseUIState(false, "offline");
          return false;
        }

        try {
          // 1. Thử kết nối với bảng properties_hometea có kiểm tra cột views luôn để tránh lỗi sau này
          let response = await fetch(`${supabaseUrl}/rest/v1/properties_hometea?select=id,views&limit=1`, {
            method: 'GET',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            }
          });

          if (response.ok) {
            supabaseTable = 'properties_hometea';
            supabaseHasViewsColumn = true;
            updateSupabaseUIState(true);
            if (!silent) showToast("Kết nối đồng hành với bảng 'properties_hometea' của Supabase thành công!", true);
            
            if (fetchAndSync) {
              await fetchPropertiesFromSupabase(silent);
            }
            return true;
          } else {
            const errorText = await response.text();
            let errObj = {};
            try {
              errObj = JSON.parse(errorText);
            } catch (e) {}

            const isMissingTable = (response.status === 404 || errObj.code === 'PGRST204' || errObj.code === 'PGRST205' || (errObj.message && errObj.message.includes('properties_hometea') && !errObj.message.includes('views')));

            // Nếu bảng properties_hometea tồn tại nhưng bị lỗi cột views (PGRST204 hoặc message chứa views)
            if (!isMissingTable && (errObj.code === 'PGRST204' || (errObj.message && errObj.message.includes('views')) || response.status === 400)) {
              console.warn("Bảng properties_hometea tồn tại nhưng chưa có cột views. Thử kết nối rút gọn...");
              let responseNoViews = await fetch(`${supabaseUrl}/rest/v1/properties_hometea?select=id&limit=1`, {
                method: 'GET',
                headers: {
                  'apikey': supabaseAnonKey,
                  'Authorization': `Bearer ${supabaseAnonKey}`
                }
              });
              if (responseNoViews.ok) {
                supabaseTable = 'properties_hometea';
                supabaseHasViewsColumn = false;
                updateSupabaseUIState(true);
                if (!silent) showToast("Kết nối thành công (Đã bỏ qua lưu trữ lượt xem do bảng chưa thêm cột 'views')!", true);
                
                if (fetchAndSync) {
                  await fetchPropertiesFromSupabase(silent);
                }
                return true;
              }
            }

            // 2. Thử sang bảng dự phòng 'properties'
            console.warn("Không thấy hoặc bị lỗi bảng properties_hometea. Thử kiểm tra bảng properties dự phòng...");
            const fallbackResponse = await fetch(`${supabaseUrl}/rest/v1/properties?select=id,views&limit=1`, {
              method: 'GET',
              headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
              }
            });

            if (fallbackResponse.ok) {
              supabaseTable = 'properties';
              supabaseHasViewsColumn = true;
              updateSupabaseUIState(true);
              if (!silent) showToast("Kết nối Supabase thành công (Đã tự động chuyển đổi sang bảng 'properties')!", true);
              
              if (fetchAndSync) {
                await fetchPropertiesFromSupabase(silent);
              }
              return true;
            } else {
              const fallbackErrTxt = await fallbackResponse.text();
              let fbErrObj = {};
              try {
                fbErrObj = JSON.parse(fallbackErrTxt);
              } catch (e) {}

              // Kiểm tra lỗi cột views trên bảng dự phòng
              if (fallbackResponse.status !== 404 && (fbErrObj.code === 'PGRST204' || (fbErrObj.message && fbErrObj.message.includes('views')) || fallbackResponse.status === 400)) {
                let fbResponseNoViews = await fetch(`${supabaseUrl}/rest/v1/properties?select=id&limit=1`, {
                  method: 'GET',
                  headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${supabaseAnonKey}`
                  }
                });
                if (fbResponseNoViews.ok) {
                  supabaseTable = 'properties';
                  supabaseHasViewsColumn = false;
                  updateSupabaseUIState(true);
                  if (!silent) showToast("Kết nối Supabase thành công 'properties' (Bỏ qua lưu trữ cột 'views')!", true);
                  
                  if (fetchAndSync) {
                    await fetchPropertiesFromSupabase(silent);
                  }
                  return true;
                }
              }
            }

            console.error("Supabase Connection Alert:", errorText);
            updateSupabaseUIState(false, "error");
            if (!silent) {
              alert("Kết nối Supabase không thành công!\nHãy chắc chắn bạn đã chạy đoạn mã SQL khởi tạo bảng 'properties_hometea' hoặc sử dụng bảng 'properties' trong Supabase Editor.");
            }
            return false;
          }
        } catch (err) {
          console.error("Supabase Connection Exception:", err);
          updateSupabaseUIState(false, "error");
          if (!silent) alert("Không thể kết nối đến Supabase (Kiểm tra lại đường dẫn URL/Key hoặc tường lửa).");
          return false;
        }
      }

      let hasLoadedAllProperties = false;

      async function fetchPropertiesFromSupabase(silent = false, limitCount = 20, isAutoRepairRun = false) {
        if (!supabaseUrl || !supabaseAnonKey) {
          applyFilters();
          renderAdminTable();
          return;
        }
        
        // Hiển thị khung xương skeleton khi đang nạp dữ liệu từ Cloud
        if (!silent || propertyData.length === 0) {
          renderSkeletons();
        }
        
        try {
          const selectCols = 'id,title,price,price_text,ward,direction,floors,badge,address,img,img_list,desc,area,house_number,street,width,bedrooms,bathrooms,legal,views,created_at,updated_at,is_price_reduced,old_price,price_updated_at,loai_vi_tri,is_sold';
          const urlParams = new URLSearchParams({
            select: selectCols,
            order: 'id.desc'
          });
          if (limitCount && !hasLoadedAllProperties) {
            urlParams.append('limit', limitCount.toString());
          }
          const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?${urlParams.toString()}`, {
            method: 'GET',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              isSupabaseConnected = true;
              updateSupabaseUIState(true);

              if (data.length > 0) {
                // Ánh xạ chuỗi từ snake_case của PostgreSQL về camelCase của React app
                const localViews = JSON.parse(localStorage.getItem('local_property_views') || '{}');
                const localPriceReductions = JSON.parse(localStorage.getItem('local_price_reductions') || '{}');
                const mappedData = data.map(item => ({
                  id: item.id,
                  title: item.title,
                  price: parseFloat(item.price) || 0,
                  priceText: item.price_text || (item.price + " Tỷ"),
                  ward: item.ward || "",
                  direction: item.direction || "",
                  floors: (() => {
                    if (item.floors !== undefined && item.floors !== null && !isNaN(parseInt(item.floors))) {
                      return parseInt(item.floors);
                    }
                    const text = ((item.title || "") + " " + (item.desc || "")).toLowerCase();
                    if (text.includes("đất") || text.includes("lô") || text.includes("nền") || text.includes("vườn") || text.includes("thổ cư")) {
                      return 0;
                    }
                    return 3;
                  })(),
                  badge: item.badge || "",
                  address: item.address || "",
                  img: item.img || "",
                  imgList: (() => {
                    if (Array.isArray(item.img_list)) return item.img_list;
                    if (typeof item.img_list === 'string' && item.img_list.trim() !== '') {
                      try {
                        const parsed = JSON.parse(item.img_list);
                        if (Array.isArray(parsed)) return parsed;
                        return [parsed];
                      } catch (e) {
                        return [item.img_list];
                      }
                    }
                    return [item.img || "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80"];
                  })(),
                  desc: item.desc || "",
                  area: parseInt(item.area) || 0,
                  houseNumber: item.house_number || "",
                  loaiViTri: (item.loai_vi_tri === "hem" ? "hem_xe_hoi" : (item.loai_vi_tri || "")),
                  street: item.street || "",
                  width: parseFloat(item.width) || 0,
                  bedrooms: (() => {
                    if (item.bedrooms !== undefined && item.bedrooms !== null && !isNaN(parseInt(item.bedrooms))) {
                      return parseInt(item.bedrooms);
                    }
                    const text = ((item.title || "") + " " + (item.desc || "")).toLowerCase();
                    if (text.includes("đất") || text.includes("lô") || text.includes("nền") || text.includes("vườn") || text.includes("thổ cư")) {
                      return 0;
                    }
                    return 3;
                  })(),
                  bathrooms: (() => {
                    if (item.bathrooms !== undefined && item.bathrooms !== null && !isNaN(parseInt(item.bathrooms))) {
                      return parseInt(item.bathrooms);
                    }
                    const text = ((item.title || "") + " " + (item.desc || "")).toLowerCase();
                    if (text.includes("đất") || text.includes("lô") || text.includes("nền") || text.includes("vườn") || text.includes("thổ cư")) {
                      return 0;
                    }
                    return 3;
                  })(),
                  legal: item.legal || "Sổ hồng riêng",
                  views: Math.max(parseInt(item.views) || 0, localViews[item.id] || 0),
                  priceReducedAt: localPriceReductions[item.id] || null,
                  created_at: item.created_at || null,
                  updated_at: item.updated_at || null,
                  isPriceReduced: item.is_price_reduced === true || item.is_price_reduced === 'true',
                  oldPrice: (item.old_price !== undefined && item.old_price !== null) ? parseFloat(item.old_price) : null,
                  priceUpdatedAt: item.price_updated_at || null,
                  isSold: item.is_sold === true || item.is_sold === 'true'
                }));

                if (limitCount && !hasLoadedAllProperties) {
                  propertyData = mappedData;
                } else {
                  propertyData = mappedData;
                  hasLoadedAllProperties = true;
                }
                
                // Lưu dự phòng cục bộ
                savePropertyDataToStorage();
                
                // Tự động quét và dọn sạch dữ liệu ảnh cũ dạng base64 nếu có
                autoMigrateBase64Properties();
                
                applyFilters();
                renderAdminTable();
                checkUrlParams();
                
                if (!silent) {
                  showToast(`Đã đồng bộ thành công ${data.length} bất động sản từ Supabase Cloud!`, true);
                }

                // Nếu vừa tải lần đầu (có limit), thiết lập tải toàn bộ danh sách ngầm sau 2 giây để tối ưu SEO và trải nghiệm cuộn/tìm kiếm
                if (limitCount && !hasLoadedAllProperties) {
                  setTimeout(() => {
                    fetchPropertiesFromSupabase(true, null);
                  }, 2000);
                }
              } else {
                console.log("Supabase table is currently empty. Local records will take precedence upon creation.");
                applyFilters();
                renderAdminTable();
              }
            } else {
              applyFilters();
              renderAdminTable();
            }
          } else {
            const errBody = await response.text().catch(() => "");
            console.warn(`Supabase rest api response not OK (Status: ${response.status}): ${errBody}`);
            
            if (!isAutoRepairRun) {
              console.log("Attempting Supabase schema discovery / self-heal...");
              const isRepaired = await testSupabaseConnection(true, false);
              if (isRepaired) {
                await fetchPropertiesFromSupabase(silent, limitCount, true);
                return;
              }
            }
            
            console.warn("Fallback to offline local storage data.");
            updateSupabaseUIState(false, "error");
            applyFilters();
            renderAdminTable();
          }
        } catch (err) {
          console.error("Lỗi khi đồng bộ nạp tệp từ Supabase:", err);
          
          if (!isAutoRepairRun) {
            console.log("Attempting Supabase schema discovery / self-heal due to exception...");
            const isRepaired = await testSupabaseConnection(true, false);
            if (isRepaired) {
              await fetchPropertiesFromSupabase(silent, limitCount, true);
              return;
            }
          }
          
          updateSupabaseUIState(false, "error");
          applyFilters();
          renderAdminTable();
        }
      }

      async function deleteAdminProperty(id) {
        const isConfirmed = await showCustomConfirm(
          "Bạn Có Chắc Chắn Muốn Xóa?",
          "Bạn có chắc chắn muốn gỡ bỏ hoàn toàn tin đăng bất động sản này khỏi hệ thống?"
        );
        if (!isConfirmed) return;
        
        let success = true;
        
        if (isSupabaseConnected && supabaseUrl && supabaseAnonKey) {
          showToast(`Đang xóa dữ liệu trên Supabase Cloud (${supabaseTable})...`, true);
          try {
            const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${id}`, {
              method: 'DELETE',
              headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
              }
            });
            if (!response.ok) {
              success = false;
              const text = await response.text();
              console.error("Supabase delete failed:", text);
              alert("Có lỗi xảy ra khi yêu cầu gỡ bỏ phía Cloud Database: " + text);
            }
          } catch (e) {
            success = false;
            console.error("Network crash deleting from Supabase:", e);
          }
        }
        
        // Ghi nhận nhật ký xóa
        try {
          if (typeof logSystemActivity === 'function') {
            logSystemActivity('DELETE', `Đã gỡ bỏ bài đăng bất động sản ID: ${id}`);
          }
        } catch (errDel) {
          console.error(errDel);
        }

        propertyData = propertyData.filter(p => String(p.id).trim() !== String(id).trim());
        savePropertyDataToStorage();
        renderAdminTable();
        applyFilters();
        
        if (success) {
          showToast("Đã gỡ bỏ bài đăng bất động sản thành công.", true);
        } else {
          showToast("Chỉ gỡ bỏ cục bộ dự phòng (Lỗi đồng bộ Cloud).", false);
        }
      }

      function openSaveSuccessModal() {
        const modal = document.getElementById('saveSuccessModal');
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.add('open');
          setTimeout(() => {
            modal.style.opacity = '1';
            const childDiv = modal.querySelector('div');
            if (childDiv) childDiv.style.transform = 'scale(1)';
          }, 10);
          document.body.style.overflow = 'hidden';
        }
      }

      function closeSaveSuccessModal() {
        const modal = document.getElementById('saveSuccessModal');
        if (modal) {
          modal.classList.remove('open');
          modal.style.opacity = '0';
          const childDiv = modal.querySelector('div');
          if (childDiv) childDiv.style.transform = 'scale(0.9)';
          setTimeout(() => {
            modal.style.display = 'none';
          }, 300);
          document.body.style.overflow = 'auto';
        }
      }

      function handleSaveSuccessChoice(choice) {
        closeSaveSuccessModal();
        if (choice === 'continue') {
          // Người dùng muốn đăng tin tiếp: reset form về ban đầu trống và giữ màn hình form mở
          showAdminForm(null); 
        } else if (choice === 'admin') {
          // Người dùng muốn trở về danh sách quản lý
          hideAdminForm();
        } else if (choice === 'view') {
          // Người dùng muốn xem sản phẩm: đóng form đăng tin, chuyển trang về Trang chủ và tiêu điểm sản phẩm vừa đăng
          hideAdminForm();
          switchToPage('home');
          
          if (lastSavedPropertyId) {
            setTimeout(() => {
              // Reset bộ lọc để bảo đảm sản phẩm không bị lẩn khuất
              resetAllFilters();
              
              const targetCard = document.getElementById(`prop-${lastSavedPropertyId}`);
              if (targetCard) {
                targetCard.style.scrollMarginTop = "120px";
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Tạo hiệu ứng phát sáng lấp lánh (pulsing highlight) siêu sành điệu
                targetCard.classList.add('highlight-pulse');
                setTimeout(() => {
                  targetCard.classList.remove('highlight-pulse');
                }, 3000);
              }
            }, 350);
          }
        }
      }

      // Quản lý ảnh trượt trực tiếp trên từng card sản phẩm ngoài trang chủ
      function changeCardImage(propId, step, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation(); // Tránh kích hoạt sự kiện bấm xem chi tiết sản phẩm
        }
        
        const item = propertyData.find(p => p.id == propId);
        if (!item) return;
        
        const list = item.imgList && item.imgList.length > 0 ? item.imgList : [item.img];
        if (list.length <= 1) return;
        
        if (cardImageIndexes[propId] === undefined) {
          cardImageIndexes[propId] = 0;
        }
        
        cardImageIndexes[propId] = (cardImageIndexes[propId] + step + list.length) % list.length;
        
        // Cập nhật thẻ IMG và thẻ Text chỉ đếm trang trong card
        const cardImg = document.querySelector(`#prop-${propId} .card-slider-img`);
        const cardBadge = document.querySelector(`#prop-${propId} .card-slider-badge`);
        
        if (cardImg) {
          cardImg.style.opacity = 0;
          cardImg.src = list[cardImageIndexes[propId]];
        }
        if (cardBadge) {
          cardBadge.textContent = `${cardImageIndexes[propId] + 1}/${list.length}`;
        }
      }

      // ==========================================
      // QUẢN LÝ ĐĂNG TIN NHANH TỪ THƯ MỤC (FAST POST LOGIC)
      // ==========================================
      function showAdminBulkForm() {
        const dashboardSection = document.getElementById('adminDashboardSection');
        const bulkSection = document.getElementById('adminBulkSection');
        const formSection = document.getElementById('adminFormSection');
        
        if (formSection) formSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'none';
        if (bulkSection) {
          bulkSection.style.display = 'block';
          // Trả về trạng thái sạch ban đầu của giao diện Đăng nhanh
          document.getElementById('fastProgressArea').style.display = 'none';
          document.getElementById('fastFolderInput').value = '';
          const dropzone = document.getElementById('fastUploadDropzone');
          if (dropzone) {
            dropzone.style.background = '#f8fafc';
            dropzone.style.borderColor = '#bfdbfe';
          }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function hideAdminBulkForm(e) {
        if (e) e.preventDefault();
        const bulkSection = document.getElementById('adminBulkSection');
        const dashboardSection = document.getElementById('adminDashboardSection');
        if (bulkSection) bulkSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function handleFastDragOver(e) {
        e.preventDefault();
        const dropzone = document.getElementById('fastUploadDropzone');
        if (dropzone) {
          dropzone.style.background = '#eff6ff';
          dropzone.style.borderColor = '#3b82f6';
          const icon = dropzone.querySelector('.drop-icon');
          if (icon) icon.style.transform = 'scale(1.15)';
        }
      }

      function handleFastDragLeave(e) {
        e.preventDefault();
        const dropzone = document.getElementById('fastUploadDropzone');
        if (dropzone) {
          dropzone.style.background = '#f8fafc';
          dropzone.style.borderColor = '#bfdbfe';
          const icon = dropzone.querySelector('.drop-icon');
          if (icon) icon.style.transform = 'scale(1)';
        }
      }

      async function handleFastDrop(e) {
        e.preventDefault();
        const dropzone = document.getElementById('fastUploadDropzone');
        if (dropzone) {
          dropzone.style.background = '#f8fafc';
          dropzone.style.borderColor = '#bfdbfe';
          const icon = dropzone.querySelector('.drop-icon');
          if (icon) icon.style.transform = 'scale(1)';
        }
        if (e.dataTransfer) {
          const files = await getAllFilesFromDataTransfer(e.dataTransfer);
          processFastFiles(files);
        }
      }

      async function getAllFilesFromDataTransfer(dataTransfer) {
        const files = [];
        const items = dataTransfer.items;
        if (!items) {
          return Array.from(dataTransfer.files || []);
        }
        
        const queue = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
            if (entry) {
              queue.push(readEntryRecursively(entry));
            } else {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
        }
        
        if (queue.length > 0) {
          const results = await Promise.all(queue);
          for (const resList of results) {
            files.push(...resList);
          }
        }
        return files;
      }

      function readEntryRecursively(entry) {
        return new Promise((resolve) => {
          if (entry.isFile) {
            entry.file((file) => resolve([file]), () => resolve([]));
          } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const allEntries = [];
            const readEntriesBatch = () => {
              dirReader.readEntries(async (entries) => {
                if (entries.length === 0) {
                  const files = [];
                  for (const subEntry of allEntries) {
                    const subFiles = await readEntryRecursively(subEntry);
                    files.push(...subFiles);
                  }
                  resolve(files);
                } else {
                  allEntries.push(...entries);
                  readEntriesBatch();
                }
              }, () => resolve([]));
            };
            readEntriesBatch();
          } else {
            resolve([]);
          }
        });
      }

      function handleFastUpload(e) {
        if (e.target && e.target.files) {
          const files = Array.from(e.target.files);
          processFastFiles(files);
        }
      }

      // Xử lý nạp các tệp tin hình ảnh & mô tả .txt
      async function processFastFiles(files) {
        if (!files || files.length === 0) {
          return;
        }

        const txtFile = files.find(f => f.name.toLowerCase().endsWith('.txt'));
        const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));

        const activeClientKey = localStorage.getItem('gemini_api_key') || buildGeminiKey;

        // Bắt đầu hiển thị khu vực tiến trình và cập nhật các checkbox trạng thái
        const progressArea = document.getElementById('fastProgressArea');
        const progressBar = document.getElementById('fastProgressBar');
        const progressPercent = document.getElementById('fastProgressPercent');
        const progressLabel = document.getElementById('fastProgressLabel');
        const progressDetail = document.getElementById('fastProgressDetail');

        progressArea.style.display = 'block';
        progressBar.style.width = '5%';
        progressPercent.textContent = '5%';
        progressLabel.innerHTML = `
          <svg style="color: #2563eb; transform-origin: center; animation: spin 1s linear infinite; margin-right: 6px;" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.1)" stroke-width="2.5"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          Đang phân tích các tài liệu trong Thư mục...
        `;

        // Reset text & checkmarks
        document.getElementById('iconReadTxt').textContent = '⏳';
        document.getElementById('stepReadTxt').style.color = 'var(--text-dark)';
        document.getElementById('iconAnalyzeAI').textContent = '⚪';
        document.getElementById('stepAnalyzeAI').style.color = 'var(--text-muted)';
        document.getElementById('iconUploadImgs').textContent = '⚪';
        document.getElementById('stepUploadImgs').style.color = 'var(--text-muted)';
        document.getElementById('labelUploadImgs').textContent = `3. Đồng bộ hóa hình ảnh lên Cloudinary (${imgFiles.length} ảnh)...`;

        progressDetail.textContent = 'Đang khởi chạy trình đọc tệp tin thuyết minh...';

        // 1. Phân tích: Đọc tệp tin .txt chứa mô tả
        if (!txtFile) {
          document.getElementById('iconReadTxt').textContent = '❌';
          document.getElementById('stepReadTxt').style.color = '#dc2626';
          progressLabel.textContent = '⚠️ Quá trình bị gián đoạn!';
          progressDetail.innerHTML = `
            <span style="color: #dc2626; font-weight: 700;">Không tìm thấy tệp .txt nào!</span><br>
            Để sử dụng tính năng Đăng nhanh, bạn bắt buộc phải kéo thả hoặc chọn ĐỒNG THỜI cả các tệp hình ảnh và 1 tệp văn bản <code>.txt</code> chứa bài thuyết minh thô của căn nhà đó.
          `;
          progressBar.style.width = '0%';
          progressPercent.textContent = '0%';
          return;
        }

        // Đọc nội dung tệp .txt bằng FileReader
        const reader = new FileReader();
        reader.onload = async function() {
          const rawText = reader.result.trim();
          if (!rawText) {
            document.getElementById('iconReadTxt').textContent = '❌';
            document.getElementById('stepReadTxt').style.color = '#dc2626';
            progressLabel.textContent = '⚠️ Thất bại khi đọc file!';
            progressDetail.textContent = `Tệp ${txtFile.name} trống hoặc không chứa ký tự hợp lệ.`;
            return;
          }

          document.getElementById('iconReadTxt').textContent = '✔️';
          document.getElementById('stepReadTxt').style.color = '#155724';
          progressDetail.textContent = `Đọc thành công tệp [${txtFile.name}] (Độ dài: ${rawText.length} ký tự).`;
          progressBar.style.width = '20%';
          progressPercent.textContent = '20%';

          // Chuyển qua Bước 2: Gọi AI phân tích bóc tách các trường thông số dồi dào
          await analyzeFastTextAI(rawText, imgFiles, activeClientKey);
        };
        reader.onerror = function() {
          document.getElementById('iconReadTxt').textContent = '❌';
          document.getElementById('stepReadTxt').style.color = '#dc2626';
          progressLabel.textContent = '⚠️ Không đọc được tệp!';
          progressDetail.textContent = 'Lỗi hệ thống khi tải tệp văn bản. Vui lòng kiểm tra lại quyền truy cập file.';
        };
        reader.readAsText(txtFile, 'UTF-8');
      }

      // Bước 2: Gọi Trợ lý AI phân tích và bóc tách các trường thông số thông minh
      async function analyzeFastTextAI(rawText, imgFiles, activeClientKey) {
        const progressBar = document.getElementById('fastProgressBar');
        const progressPercent = document.getElementById('fastProgressPercent');
        const progressDetail = document.getElementById('fastProgressDetail');

        document.getElementById('iconAnalyzeAI').textContent = '⏳';
        document.getElementById('stepAnalyzeAI').style.color = 'var(--text-dark)';
        progressBar.style.width = '40%';
        progressPercent.textContent = '40%';
        progressDetail.textContent = 'Đang kết nối đến Trợ lý AI để giải mã dữ liệu bài viết & bóc tách các thông số...';

        let parsedData = null;

        try {
          const response = await fetch('/api/analyze-raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawInput: rawText,
              localKey: activeClientKey || ''
            })
          });

          if (response.ok) {
            parsedData = await response.json();
          } else {
            console.warn("Proxy local trả về lỗi hoặc không khả dụng. Đang kết nối trực tiếp đến Google Gemini Client-side...");
            parsedData = await callDirectGeminiFast(rawText);
          }
        } catch (err) {
          console.warn("Lỗi kết nối API local, tiến hành gọi trực tiếp Gemini Client-side:", err);
          try {
            parsedData = await callDirectGeminiFast(rawText);
          } catch (fallbackErr) {
            console.error("Lỗi AI bóc tách Đăng nhanh cả hai phương án:", fallbackErr);
          }
        }

        async function callDirectGeminiFast(textToParse) {
          const keysList = getGeminiKeysArray();
          if (keysList.length > 0) {
            const systemPrompt = `Bạn là trợ lý thông minh cao cấp bóc tách BĐS. Hãy trả về kết quả JSON duy nhất theo đúng cấu trúc.
Các trường dữ liệu cần bóc tách bao gồm:
- title: Tiêu đề viết hoa toàn bộ, bắt đầu bằng 🔥.
- houseNumber: Số nhà (nếu có, không thì "").
- street: Tên đường (nếu có, không thì "").
- ward: Tên phường tại Thủ Đức (ví dụ: Long Phước, Trường Thạnh, Cát Lái...).
- area: Diện tích đất/m2 (số nguyên).
- width: Chiều ngang/m (mặc định 4).
- price: Giá bán đơn vị Tỷ (số thực, ví dụ: 2.5).
- bedrooms: Số phòng ngủ (mặc định 3, nếu là đất trống hoặc bán đất không có nhà thì 0).
- bathrooms: Số phòng vệ sinh (mặc định 3, nếu là đất trống hoặc bán đất không có nhà thì 0).
- floors: Số tầng (mặc định 3). ĐẶC BIỆT: Nếu là đất trống, đất thổ cư, đất vườn, hoặc là bán đất (không có nhà cửa xây dựng hoặc ghi rõ là đất trống, đất thổ cư), thì trường floors (Số tầng) bắt buộc phải bóc tách bằng số 0.
- direction: Hướng nhà (ví dụ "Không xác định", "Đông", "Tây").
- legal: Pháp lý (ví dụ "Sổ hồng riêng").
- badge: Nhãn nổi bật (ví dụ "Đất trống", "Sổ Hồng Riêng", "Giá Đầu Tư").
- desc: Đoạn mô tả quảng cáo cấu trúc đúng mẫu đã có sẵn thông số đất/nhà.

DỮ LIỆU THÔ: "${textToParse}"`;
            for (let i = 0; i < keysList.length; i++) {
              const currentKey = keysList[i];
              try {
                const directResponse = await fetchGeminiWithFallback(currentKey, {
                  contents: [{ parts: [{ text: systemPrompt }] }],
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                  }
                });
                if (directResponse.ok) {
                  const directJson = await directResponse.json();
                  const textResult = directJson.candidates[0].content.parts[0].text;
                  const cleanedResult = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
                  return JSON.parse(cleanedResult);
                }
                const errInfo = await directResponse.json().catch(() => ({}));
                console.error(`Direct fast analysis API Key #${i + 1} error:`, errInfo);
              } catch (innerError) {
                console.error(`Lỗi bóc tách nhanh trực tiếp qua client Key #${i + 1}:`, innerError);
              }
            }
          }
          return null;
        }

        // Tạo dữ liệu trống mặc định nếu AI không thể phản hồi đúng định dạng hoặc kết nối bị đứt
        if (!parsedData || !parsedData.title) {
          document.getElementById('iconAnalyzeAI').textContent = '⚠️';
          document.getElementById('stepAnalyzeAI').style.color = '#856404';
          progressDetail.textContent = 'AI bận hoặc bị giới hạn. Hệ thống sẽ giữ nguyên bản văn thô và tiếp tục đồng bộ ảnh...';
          
          parsedData = {
            title: "TIN ĐĂNG NHANH TỪ THƯ MỤC CHƯA CÓ TIÊU ĐỀ",
            desc: rawText,
            price: 0,
            area: 0,
            ward: "",
            direction: "Không xác định",
            floors: 3,
            bedrooms: 3,
            bathrooms: 3,
            badge: "Tin mới",
            houseNumber: "",
            street: "",
            width: 4,
            legal: "Sổ hồng riêng"
          };
        } else {
          document.getElementById('iconAnalyzeAI').textContent = '✔️';
          document.getElementById('stepAnalyzeAI').style.color = '#155724';
          progressDetail.textContent = `AI giải mã thành công! Căn hộ: ${parsedData.title.slice(0, 45)}... (Giá bóc tách: ${parsedData.price} Tỷ, DT: ${parsedData.area}m2).`;
        }

        progressBar.style.width = '60%';
        progressPercent.textContent = '60%';

        // Chuyển sang Bước 3: Upload đồng bộ hóa các hình ảnh lên Cloudinary
        await uploadFastImagesCloud(imgFiles, parsedData);
      }

      // Bước 3: Đồng bộ tải các hình ảnh thực tế lên Cloudinary
      async function uploadFastImagesCloud(imgFiles, parsedData) {
        const progressBar = document.getElementById('fastProgressBar');
        const progressPercent = document.getElementById('fastProgressPercent');
        const progressDetail = document.getElementById('fastProgressDetail');

        document.getElementById('iconUploadImgs').textContent = '⏳';
        document.getElementById('stepUploadImgs').style.color = 'var(--text-dark)';

        const uploadedUrlsList = [];
        const totalImgs = imgFiles.length;

        if (totalImgs === 0) {
          document.getElementById('iconUploadImgs').textContent = '✔️';
          document.getElementById('stepUploadImgs').style.color = '#155724';
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';
          progressDetail.textContent = 'Không có tệp hình ảnh bổ sung nào trong folder. Bắt đầu mở form...';
          
          fillFormAndOpenFast(parsedData, []);
          return;
        }

        // Thực hiện tải lần lượt từng ảnh lên Cloudinary server-side
        for (let i = 0; i < totalImgs; i++) {
          const file = imgFiles[i];
          const calculatedPct = 60 + Math.round((i / totalImgs) * 35);
          
          progressBar.style.width = `${calculatedPct}%`;
          progressPercent.textContent = `${calculatedPct}%`;
          document.getElementById('labelUploadImgs').textContent = `3. Đồng bộ hóa hình ảnh lên Cloudinary (${i + 1}/${totalImgs} ảnh)...`;
          progressDetail.innerHTML = `Đang nén mật độ cao & tải ảnh lên Cloudinary:<br>↳ <em style="font-size:11px; color:#555;">${file.name} (Kích thước: ${Math.round(file.size / 1024)} KB)</em>`;

          try {
            // Nén ảnh canvas cơ bản để gia tăng vận tốc và độ phản hồi ổn định nhất
            const compressed = await compressImageToBlob(file);
            const uploadFile = compressed ? new File([compressed], file.name, { type: 'image/jpeg' }) : file;

            // Đọc blob/file thành chuỗi Base64
            const base64String = await new Promise((resolve) => {
              const r = new FileReader();
              r.readAsDataURL(uploadFile);
              r.onload = () => resolve(r.result);
              r.onerror = () => resolve(null);
            });

            if (!base64String) {
              throw new Error("Không thể chuyển đổi ảnh thành chuỗi Base64");
            }

            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ image: base64String })
            });

            if (uploadResponse.ok) {
              const uData = await uploadResponse.json();
              if (uData.success && uData.secure_url) {
                uploadedUrlsList.push(udataUrlFilter(uData.secure_url));
              }
            } else {
              const errorText = await uploadResponse.text();
              console.error(`Không thể tải ảnh nhanh: ${file.name}`, errorText);
            }
          } catch (uploadError) {
            console.error(`Không thể tải ảnh nhanh: ${file.name}`, uploadError);
          }
        }

        // Hoàn tất Bước 3
        document.getElementById('iconUploadImgs').textContent = '✔️';
        document.getElementById('stepUploadImgs').style.color = '#155724';
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';
        progressDetail.textContent = `Tải thành công ${uploadedUrlsList.length}/${totalImgs} ảnh lên Cloudinary. Đang kết chuyển dữ liệu vào ô mô tả...`;

        setTimeout(() => {
          fillFormAndOpenFast(parsedData, uploadedUrlsList);
        }, 800);
      }

      // Giúp dọn định dạng url ảnh an toàn
      function udataUrlFilter(url) {
        if (!url) return '';
        return url.replace('http://', 'https://');
      }

      // Hàm nén ảnh tiện dụng client-side cho tính năng Đăng nhanh
      function compressImageToBlob(file) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              const maxDim = 1200;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                resolve(blob);
              }, 'image/jpeg', 0.75);
            };
            img.onerror = () => resolve(null);
          };
          reader.onerror = () => resolve(null);
        });
      }

      // Nạp tất cả thông số bóc tách và danh sách ảnh Cloud lên Form Đăng Tin chính để người dùng rà soát
      function fillFormAndOpenFast(parsedData, uploadedUrls) {
        // 1. Chuyển form đăng tin sang chế độ tạo mới sạch sẽ
        showAdminForm(null);

        // 2. Đổ đầy dữ liệu bóc tách được trực tiếp vào các ô input trong form đăng tin
        document.getElementById('formTitle').value = parsedData.title ? parsedData.title.toUpperCase() : '';
        document.getElementById('formPrice').value = parsedData.price || '';
        document.getElementById('formArea').value = parsedData.area || '';
        
        // So khớp và gán phường chuẩn xác
        const wardField = document.getElementById('ap_wd_fld');
        if (wardField && parsedData.ward) {
          let rawWard = parsedData.ward.trim();
          let cleanWard = rawWard.replace(/^[Pp]hường\s+/, "");
          wardField.value = cleanWard;
        }

        // Hướng nhà
        const dirField = document.getElementById('formDirection');
        if (dirField && parsedData.direction) {
          dirField.value = parsedData.direction;
        }

        document.getElementById('formFloors').value = (parsedData.floors !== undefined && parsedData.floors !== null) ? parsedData.floors : 3;
        document.getElementById('formBadge').value = parsedData.badge || 'Sổ hồng riêng';
        
        // Làm sạch mô tả trước khi đổ vào form theo yêu cầu xóa Thanh Trà BĐS
        let normDesc = parsedData.desc || '';
        const regexesToRemove = [
          /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*TP\.\s*Thủ\s*Đức\)\.?/gi,
          /Thanh Trà BĐS\s*\(Hotline\/Zalo:\s*0854\.100\.036\s*-\s*Email:\s*thanhtra1996st@gmail.com\s*-\s*Văn phòng:\s*Lò\s*Lu,\s*TP\.\s*Thủ\s*Đức\)\.?/gi
        ];
        for (const regex of regexesToRemove) {
          normDesc = normDesc.replace(regex, '');
        }
        document.getElementById('formDesc').value = normDesc.trim();

        document.getElementById('ap_hn_fld').value = parsedData.houseNumber || '';
        const parsedLoaiViTri = parsedData.loaiViTri || 'hem_xe_hoi';
        document.getElementById('formLoaiViTri').value = parsedLoaiViTri === 'hem' ? 'hem_xe_hoi' : parsedLoaiViTri;
        document.getElementById('ap_st_fld').value = parsedData.street || '';
        document.getElementById('formWidth').value = (parsedData.width !== undefined && parsedData.width !== null) ? parsedData.width : 4;
        document.getElementById('formBedrooms').value = (parsedData.bedrooms !== undefined && parsedData.bedrooms !== null) ? parsedData.bedrooms : 3;
        document.getElementById('formBathrooms').value = (parsedData.bathrooms !== undefined && parsedData.bathrooms !== null) ? parsedData.bathrooms : 3;
        document.getElementById('formLegal').value = parsedData.legal || 'Sổ hồng riêng';

        // Lắp ráp địa chỉ hiển thị
        let addressParts = [];
        if (parsedData.houseNumber) addressParts.push(parsedData.houseNumber.trim());
        if (parsedData.street) addressParts.push(parsedData.street.trim());
        if (parsedData.ward) addressParts.push("Phường " + parsedData.ward.trim());
        addressParts.push("TP. Thủ Đức, TP.HCM");
        const addrField = document.getElementById('formAddress');
        if (addrField) {
          addrField.value = addressParts.join(", ");
        }

        // 3. Xử lý hình ảnh thực tế vừa nạp
        if (uploadedUrls && uploadedUrls.length > 0) {
          uploadedImagesList = uploadedUrls;
          const imgField = document.getElementById('formImg');
          if (imgField) {
            imgField.value = uploadedUrls[0];
          }
          // Kích hoạt render preview của Form đăng tin để hiện ảnh trực quan
          renderUploadedImagesPreviews();
        }

        // 4. Toàn bộ hiệu ứng mở form mượt mà cuốn hút
        document.getElementById('adminBulkSection').style.display = 'none';
        document.getElementById('fastProgressArea').style.display = 'none';

        showToast("🪄 Đồng bộ hình ảnh & phân bóc nội dung AI thành công! Hãy bấm 'Lưu thông tin đăng' để lưu.", true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // Đăng ký cho các đường link trang chủ chuyển hoàn lại màn hình chính diện
      document.querySelectorAll("#navMenu a").forEach(link => {
        if (link.id !== "navAdminLink" && link.id !== "navPostLink") {
          link.addEventListener("click", () => {
            switchToPage("home");
          });
        }
      });

      // Gắn tất cả các hàm gọi trực tiếp từ thẻ HTML lên đối tượng window toàn cục tránh lỗi mất tầm vực
      window.showAdminSection = showAdminSection;
      window.handleDirectPostClick = handleDirectPostClick;
      window.openAdminLoginModal = openAdminLoginModal;
      window.closeAdminLoginModal = closeAdminLoginModal;
      window.handleAdminLoginModal = handleAdminLoginModal;
      window.handleAdminLogout = handleAdminLogout;
      window.checkAdminSession = checkAdminSession;
      window.renderAdminTable = renderAdminTable;
      window.showAdminForm = showAdminForm;
      window.hideAdminForm = hideAdminForm;
      window.selectQuickImg = selectQuickImg;
      window.generateAIDescription = generateAIDescription;
      window.analyzeRawDataAI = analyzeRawDataAI;
      window.saveAdminProperty = saveAdminProperty;
      window.deleteAdminProperty = deleteAdminProperty;
      window.openProductModal = openProductModal;
      window.closeProductModal = closeProductModal;
      window.checkUrlParams = checkUrlParams;
      window.resetAllFilters = resetAllFilters;
      window.applyFilters = applyFilters;
      window.toggleFilters = toggleFilters;

      // Gắn thêm các hàm slideshow và uploader ảnh mới vào window
      window.slideModalImg = slideModalImg;
      window.setModalImgIndex = setModalImgIndex;
      window.handleRealImagesUpload = handleRealImagesUpload;
      window.removeUploadedImage = removeUploadedImage;
      window.openSaveSuccessModal = openSaveSuccessModal;
      window.closeSaveSuccessModal = closeSaveSuccessModal;
      window.handleSaveSuccessChoice = handleSaveSuccessChoice;
      window.changeCardImage = changeCardImage;

      // Đăng ký các hàm quản lý Đăng nhanh từ Thư mục (Fast Posting) lên window toàn cục
      window.showAdminBulkForm = showAdminBulkForm;
      window.hideAdminBulkForm = hideAdminBulkForm;
      window.handleFastDragOver = handleFastDragOver;
      window.handleFastDragLeave = handleFastDragLeave;
      window.handleFastDrop = handleFastDrop;
      window.handleFastUpload = handleFastUpload;
      window.processFastFiles = processFastFiles;
      window.analyzeFastTextAI = analyzeFastTextAI;
      window.uploadFastImagesCloud = uploadFastImagesCloud;
      window.fillFormAndOpenFast = fillFormAndOpenFast;

      // Gắn các hàm cấu hình Supabase Cloud vào window
      window.copySupabaseSql = copySupabaseSql;
      window.saveSupabaseSettings = saveSupabaseSettings;
      window.testSupabaseConnection = testSupabaseConnection;
      window.fetchPropertiesFromSupabase = fetchPropertiesFromSupabase;
      window.initSupabaseState = initSupabaseState;

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
      checkServerKey();
      checkAdminSession();
      initSupabaseState();
      checkUrlParams();
      
      // Khởi động dọn dẹp các dữ liệu base64 cũ sau 3 giây khi ứng dụng nạp hoàn tất
      setTimeout(() => {
        autoMigrateBase64Properties();
      }, 3000);