/**
 * ========================================================
 * THANH TRÀ BĐS - MODULE GỬI THÔNG TIN NHÀ CẦN BÁN
 * Ký gửi BĐS trực tiếp lên Supabase 'chu_nha_can_ban'
 * Upload hình ảnh trực tiếp lên Cloudinary (chu-nha-can-ban)
 * ========================================================
 */

(function () {
  'use strict';

  // Cấu hình mặc định hệ thống
  let config = {
    nguonnhapkUrl: 'https://ziesvswqtpaohfmkwwhy.supabase.co',
    nguonnhapkAnonKey: 'sb_publishable_bLdFCx-K-fKEfwP2XSayCQ_TcP08uoM',
    cloudinaryCloudName: 'xkenwzvh',
    cloudinaryUploadPreset: '674579822363486'
  };

  // Mảng lưu trữ các file ảnh đã chọn (tối đa 10)
  let selectedImages = [];
  let isSubmitting = false;
  let nguonnhapkClient = null;

  // Khởi tạo và nạp cấu hình từ server nếu có
  async function initConfig() {
    try {
      const res = await fetch('/api/supabase-config');
      if (res.ok) {
        const data = await res.json();
        if (data.nguonnhapkUrl) config.nguonnhapkUrl = data.nguonnhapkUrl;
        if (data.nguonnhapkAnonKey) {
          config.nguonnhapkAnonKey = data.nguonnhapkAnonKey.replace(/^d(sb_)/, '$1');
        }
        if (data.cloudinaryCloudName) config.cloudinaryCloudName = data.cloudinaryCloudName;
        if (data.cloudinaryUploadPreset) config.cloudinaryUploadPreset = data.cloudinaryUploadPreset;
      }
    } catch (e) {
      console.log('Sử dụng cấu hình fallback client cho Nguồn Nhà PK.');
    }

    // Khởi tạo Supabase Client riêng cho Nguồn Nhà
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        nguonnhapkClient = window.supabase.createClient(config.nguonnhapkUrl, config.nguonnhapkAnonKey);
      } catch (err) {
        console.warn('Lỗi khởi tạo Supabase Client:', err);
      }
    }
  }

  // Validate số điện thoại Việt Nam
  function validateVNPhone(phone) {
    if (!phone) return false;
    const cleanPhone = phone.replace(/[\s\-\.\(\)]/g, '');
    // Định dạng: 10 số bắt đầu bằng 03, 05, 07, 08, 09 hoặc +843, +845, +847, +848, +849
    const vnPhoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    return vnPhoneRegex.test(cleanPhone);
  }

  // Hiển thị thông báo trong Alert Box của modal
  function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('spAlertBox');
    const alertText = document.getElementById('spAlertText');
    const alertIcon = document.getElementById('spAlertIcon');
    if (!alertBox || !alertText) return;

    alertBox.className = `sp-alert-box ${type}`;
    alertText.textContent = message;
    if (alertIcon) {
      alertIcon.textContent = type === 'error' ? '⚠️' : '✅';
    }
    alertBox.style.display = 'flex';
  }

  // Ẩn thông báo
  function hideAlert() {
    const alertBox = document.getElementById('spAlertBox');
    if (alertBox) {
      alertBox.style.display = 'none';
    }
  }

  let spDraggedImageIndex = null;

  // Di chuyển thứ tự ảnh trong danh sách
  function moveSelectedImage(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= selectedImages.length) return;
    if (toIndex < 0 || toIndex >= selectedImages.length) return;
    const item = selectedImages.splice(fromIndex, 1)[0];
    selectedImages.splice(toIndex, 0, item);
    updateImagePreviews();
  }

  // Đặt ảnh làm ảnh đại diện (đầu tiên)
  function makeFirstSelectedImage(index) {
    if (index <= 0 || index >= selectedImages.length) return;
    const item = selectedImages.splice(index, 1)[0];
    selectedImages.unshift(item);
    updateImagePreviews();
  }

  // Cập nhật giao diện danh sách ảnh đã chọn có kéo thả thay đổi thứ tự
  function updateImagePreviews() {
    const previewContainer = document.getElementById('spImagePreviews');
    const badge = document.getElementById('spImageCountBadge');
    const fileInput = document.getElementById('spFileInput');
    if (!previewContainer) return;

    if (badge) {
      badge.textContent = `${selectedImages.length} / 10 ảnh`;
      if (selectedImages.length >= 10) {
        badge.style.background = 'rgba(239, 68, 68, 0.1)';
        badge.style.color = '#ef4444';
      } else {
        badge.style.background = 'rgba(249, 115, 22, 0.1)';
        badge.style.color = '#f97316';
      }
    }

    previewContainer.innerHTML = '';
    
    if (selectedImages.length > 1) {
      const tip = document.createElement('div');
      tip.style.gridColumn = '1/-1';
      tip.style.fontSize = '12px';
      tip.style.color = '#c2410c';
      tip.style.background = 'rgba(249, 115, 22, 0.08)';
      tip.style.padding = '6px 12px';
      tip.style.borderRadius = '6px';
      tip.style.border = '1px dashed rgba(249, 115, 22, 0.35)';
      tip.style.display = 'flex';
      tip.style.alignItems = 'center';
      tip.style.gap = '6px';
      tip.style.marginBottom = '4px';
      tip.innerHTML = `<span>🖐️</span><span><strong>Kéo thả ảnh</strong> để thay đổi vị trí. <strong>Ảnh 1</strong> là Ảnh Đại Diện.</span>`;
      previewContainer.appendChild(tip);
    }

    selectedImages.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'sp-image-item' + (index === 0 ? ' is-cover' : '');
      item.draggable = true;
      item.setAttribute('data-index', String(index));
      item.style.cursor = 'grab';
      
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = `Ảnh ${index + 1}`;
      img.style.pointerEvents = 'none';
      item.appendChild(img);

      // Badge ảnh bìa hoặc nút chọn làm bìa
      if (index === 0) {
        const coverBadge = document.createElement('span');
        coverBadge.style.cssText = 'position: absolute; top: 4px; left: 4px; background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; z-index: 2; pointer-events: none; text-transform: uppercase; box-shadow: 0 2px 4px rgba(0,0,0,0.3);';
        coverBadge.textContent = '⭐ Bìa';
        item.appendChild(coverBadge);
      } else {
        const setCoverBtn = document.createElement('button');
        setCoverBtn.type = 'button';
        setCoverBtn.style.cssText = 'position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.7); color: #fbbf24; font-size: 8.5px; font-weight: 700; padding: 2px 5px; border-radius: 4px; z-index: 2; border: 1px solid rgba(251,191,36,0.3); cursor: pointer;';
        setCoverBtn.textContent = '⭐ Bìa';
        setCoverBtn.title = 'Đặt làm ảnh đại diện';
        setCoverBtn.onclick = (e) => {
          e.stopPropagation();
          makeFirstSelectedImage(index);
        };
        item.appendChild(setCoverBtn);
      }
      
      // Nút xóa ảnh
      const removeBtn = document.createElement('button');
      removeBtn.className = 'sp-remove-img-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Xóa ảnh này';
      removeBtn.type = 'button';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeImage(index);
      };
      item.appendChild(removeBtn);

      // Thanh điều hướng thứ tự dưới cùng
      const navBar = document.createElement('div');
      navBar.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.85)); color: white; font-size: 10px; padding: 6px 4px 2px 4px; display: flex; align-items: center; justify-content: space-between; z-index: 2;';
      
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.textContent = '◀';
      prevBtn.title = 'Đổi lên trước';
      if (index === 0) {
        prevBtn.disabled = true;
        prevBtn.style.cssText = 'opacity: 0.2; cursor: default; background: transparent; border: none; color: white; padding: 1px 3px; font-size: 9px;';
      } else {
        prevBtn.style.cssText = 'cursor: pointer; background: rgba(255,255,255,0.25); border: none; color: white; border-radius: 2px; padding: 1px 4px; font-size: 9px;';
        prevBtn.onclick = (e) => {
          e.stopPropagation();
          moveSelectedImage(index, index - 1);
        };
      }

      const orderLabel = document.createElement('span');
      orderLabel.style.fontWeight = '700';
      orderLabel.textContent = `${index + 1}`;

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.textContent = '▶';
      nextBtn.title = 'Đổi ra sau';
      if (index === selectedImages.length - 1) {
        nextBtn.disabled = true;
        nextBtn.style.cssText = 'opacity: 0.2; cursor: default; background: transparent; border: none; color: white; padding: 1px 3px; font-size: 9px;';
      } else {
        nextBtn.style.cssText = 'cursor: pointer; background: rgba(255,255,255,0.25); border: none; color: white; border-radius: 2px; padding: 1px 4px; font-size: 9px;';
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          moveSelectedImage(index, index + 1);
        };
      }

      navBar.appendChild(prevBtn);
      navBar.appendChild(orderLabel);
      navBar.appendChild(nextBtn);
      item.appendChild(navBar);

      // Sự kiện Drag & Drop
      item.addEventListener('dragstart', (e) => {
        spDraggedImageIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        item.classList.add('is-dragging');
        item.style.cursor = 'grabbing';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        item.style.cursor = 'grab';
        spDraggedImageIndex = null;
        document.querySelectorAll('.sp-image-item').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (spDraggedImageIndex !== null && spDraggedImageIndex !== index) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drag-over');
        let fromIdx = spDraggedImageIndex;
        if (fromIdx === null) {
          const t = e.dataTransfer.getData('text/plain');
          if (t !== '') fromIdx = parseInt(t, 10);
        }
        if (fromIdx !== null && !isNaN(fromIdx) && fromIdx !== index && fromIdx >= 0 && fromIdx < selectedImages.length) {
          const moved = selectedImages.splice(fromIdx, 1)[0];
          selectedImages.splice(index, 0, moved);
          updateImagePreviews();
        }
        spDraggedImageIndex = null;
      });

      // Touch events
      let touchStartX = 0;
      let touchStartY = 0;
      let isTouchDragging = false;

      item.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouchDragging = false;
      }, { passive: true });

      item.addEventListener('touchmove', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const diffX = Math.abs(e.touches[0].clientX - touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - touchStartY);
        if (diffX > 15 || diffY > 15) {
          isTouchDragging = true;
          item.classList.add('is-dragging');
        }
      }, { passive: true });

      item.addEventListener('touchend', (e) => {
        item.classList.remove('is-dragging');
        if (!isTouchDragging) return;
        isTouchDragging = false;
        const touch = e.changedTouches[0];
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = targetEl ? targetEl.closest('.sp-image-item') : null;
        if (targetItem && targetItem !== item) {
          const targetIdx = parseInt(targetItem.getAttribute('data-index'), 10);
          if (!isNaN(targetIdx) && targetIdx !== index && targetIdx >= 0 && targetIdx < selectedImages.length) {
            const moved = selectedImages.splice(index, 1)[0];
            selectedImages.splice(targetIdx, 0, moved);
            updateImagePreviews();
          }
        }
      });

      previewContainer.appendChild(item);
    });

    if (fileInput) {
      fileInput.value = '';
    }
  }

  // Xóa 1 ảnh khỏi danh sách
  function removeImage(index) {
    if (index >= 0 && index < selectedImages.length) {
      selectedImages.splice(index, 1);
      updateImagePreviews();
    }
  }

  // Thêm các files vào danh sách ảnh
  function handleFilesAdded(files) {
    hideAlert();
    const validFiles = Array.from(files).filter(file => {
      const isImage = file.type.startsWith('image/');
      const isValidSize = file.size <= 15 * 1024 * 1024; // 15MB
      if (!isImage) {
        showAlert(`File "${file.name}" không phải là ảnh hợp lệ!`, 'error');
      } else if (!isValidSize) {
        showAlert(`File "${file.name}" vượt quá dung lượng tối đa 15MB!`, 'error');
      }
      return isImage && isValidSize;
    });

    if (selectedImages.length + validFiles.length > 10) {
      const allowedCount = 10 - selectedImages.length;
      if (allowedCount > 0) {
        selectedImages = selectedImages.concat(validFiles.slice(0, allowedCount));
        showAlert(`Chỉ có thể chọn tối đa 10 ảnh. Đã lấy ${allowedCount} ảnh đầu tiên.`, 'error');
      } else {
        showAlert('Bạn đã chọn đủ tối đa 10 ảnh!', 'error');
      }
    } else {
      selectedImages = selectedImages.concat(validFiles);
    }

    updateImagePreviews();
  }

  // Khởi tạo sự kiện cho Dropzone
  function setupDropzoneEvents() {
    const dropzone = document.getElementById('spDropzone');
    const fileInput = document.getElementById('spFileInput');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFilesAdded(e.target.files);
        }
      });
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        }, false);
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleFilesAdded(dt.files);
        }
      }, false);
    }
  }

  // Nén và chuyển đổi File sang Base64
  function fileToBase64WithCompression(file, maxWidth = 1600, maxHeight = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Lấy Base64 JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = () => {
          // Fallback nếu ảnh không vẽ được canvas
          resolve(event.target.result);
        };
        img.src = event.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // Upload 1 file ảnh lên Cloudinary
  async function uploadImageToCloudinary(file, index, total) {
    const progressText = document.getElementById('spProgressText');
    const progressPercent = document.getElementById('spProgressPercent');
    const progressBarFill = document.getElementById('spProgressBarFill');

    if (progressText) progressText.textContent = `Đang xử lý & tải ảnh ${index + 1}/${total}...`;
    const percent = Math.round(((index) / total) * 100);
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;

    const base64Data = await fileToBase64WithCompression(file);

    // 1. Tải lên Cloudinary thông qua Server API Route (/api/upload)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          folder: 'chu-nha-can-ban'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.secure_url || data.url)) {
          return data.secure_url || data.url;
        }
      }
    } catch (apiErr) {
      console.warn(`Lỗi gọi /api/upload cho ảnh "${file.name}":`, apiErr);
    }

    // 2. Fallback tải trực tiếp nếu có preset
    try {
      const formData = new FormData();
      formData.append('file', base64Data);
      if (config.cloudinaryUploadPreset) {
        formData.append('upload_preset', config.cloudinaryUploadPreset);
      }
      formData.append('folder', 'chu-nha-can-ban');

      const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName || 'dwjbwoz4p'}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data.secure_url || data.url) {
          return data.secure_url || data.url;
        }
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Lỗi tải ảnh (${res.status})`);
    } catch (err) {
      console.warn(`Lỗi upload ảnh "${file.name}":`, err);
      throw new Error(`Không thể tải ảnh "${file.name}" lên Cloudinary. Vui lòng thử lại!`);
    }
  }

  // Mở modal gửi nhà cần bán
  function openSubmitPropertyModal() {
    const modal = document.getElementById('submitPropertyModal');
    if (!modal) return;

    hideAlert();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus vào ô tên
    setTimeout(() => {
      const nameInput = document.getElementById('spOwnerName');
      if (nameInput) nameInput.focus();
    }, 100);
  }

  // Đóng modal gửi nhà cần bán
  function closeSubmitPropertyModal() {
    if (isSubmitting) return; // Không đóng khi đang lưu
    const modal = document.getElementById('submitPropertyModal');
    if (!modal) return;

    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Mở modal thành công
  function openSubmitPropertySuccessModal() {
    const modal = document.getElementById('submitPropertySuccessModal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Đóng modal thành công
  function closeSubmitPropertySuccessModal() {
    const modal = document.getElementById('submitPropertySuccessModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Reset toàn bộ form
  function resetForm() {
    const nameInput = document.getElementById('spOwnerName');
    const phoneInput = document.getElementById('spPhone');
    const khuVucSelect = document.getElementById('spKhuVuc');
    const fbInput = document.getElementById('spFacebook');
    const webInput = document.getElementById('spWebsite');
    const contentInput = document.getElementById('spContent');
    const progressContainer = document.getElementById('spProgressContainer');

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (khuVucSelect) khuVucSelect.value = '';
    if (fbInput) fbInput.value = '';
    if (webInput) webInput.value = '';
    if (contentInput) contentInput.value = '';
    if (progressContainer) progressContainer.style.display = 'none';

    selectedImages = [];
    updateImagePreviews();
    hideAlert();
  }

  // Xử lý gửi form
  async function handleSubmitPropertyForm() {
    if (isSubmitting) return;

    const nameInput = document.getElementById('spOwnerName');
    const phoneInput = document.getElementById('spPhone');
    const khuVucSelect = document.getElementById('spKhuVuc');
    const fbInput = document.getElementById('spFacebook');
    const webInput = document.getElementById('spWebsite');
    const contentInput = document.getElementById('spContent');
    const submitBtn = document.getElementById('spSubmitBtn');
    const submitBtnIcon = document.getElementById('spSubmitBtnIcon');
    const submitBtnText = document.getElementById('spSubmitBtnText');
    const progressContainer = document.getElementById('spProgressContainer');
    const progressBarFill = document.getElementById('spProgressBarFill');
    const progressPercent = document.getElementById('spProgressPercent');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const khuVuc = khuVucSelect ? khuVucSelect.value.trim() : '';
    const facebookLink = fbInput ? fbInput.value.trim() : '';
    const websiteLink = webInput ? webInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';

    // Validate Tên chủ nhà
    if (!name) {
      showAlert('Vui lòng nhập tên chủ nhà!', 'error');
      if (nameInput) nameInput.focus();
      return;
    }

    // Validate Số điện thoại VN
    if (!phone) {
      showAlert('Vui lòng nhập số điện thoại liên hệ!', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (!validateVNPhone(phone)) {
      showAlert('Số điện thoại không đúng định dạng Việt Nam (Ví dụ: 0912 345 678)!', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    // Validate Khu vực (Quận/Huyện)
    if (!khuVuc) {
      showAlert('Vui lòng chọn Khu vực (Quận/Huyện)!', 'error');
      if (khuVucSelect) khuVucSelect.focus();
      return;
    }

    // Bắt đầu quá trình lưu
    isSubmitting = true;
    hideAlert();
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtnIcon) submitBtnIcon.textContent = '⏳';
    if (submitBtnText) submitBtnText.textContent = 'Đang xử lý...';

    const uploadedUrls = [];

    try {
      // 1. Tải hình ảnh lên Cloudinary nếu có
      if (selectedImages.length > 0) {
        if (progressContainer) progressContainer.style.display = 'flex';

        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const imgUrl = await uploadImageToCloudinary(file, i, selectedImages.length);
          if (imgUrl) {
            uploadedUrls.push(imgUrl);
          }
        }

        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
      }

      if (submitBtnText) submitBtnText.textContent = 'Đang lưu vào hệ thống...';

      // 2. Chuẩn bị payload khớp với Schema Supabase 'chu_nha_can_ban'
      // Gán cứng: loai_giao_dich = "khach_ban", status = "moi" (ràng buộc DB)
      const recordPayload = {
        name: name,
        phone: phone.replace(/[\s\-\.\(\)]/g, ''),
        district: khuVuc,
        facebook_link: facebookLink || null,
        website_link: websiteLink || null,
        content: content || null,
        image_urls: uploadedUrls,
        loai_giao_dich: 'khach_ban',
        status: 'moi'
      };

      // 3. Thực hiện insert vào Supabase Nguồn Nhà
      let insertSuccess = false;

      // Ưu tiên dùng Supabase Client
      if (nguonnhapkClient) {
        const { data, error } = await nguonnhapkClient
          .from('chu_nha_can_ban')
          .insert([recordPayload])
          .select();

        if (error) {
          throw new Error(error.message || 'Lỗi lưu dữ liệu vào Supabase');
        }
        insertSuccess = true;
      } else {
        // Fallback gọi REST API trực tiếp
        const endpoint = `${config.nguonnhapkUrl}/rest/v1/chu_nha_can_ban`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'apikey': config.nguonnhapkAnonKey,
            'Authorization': `Bearer ${config.nguonnhapkAnonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(recordPayload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Lỗi lưu dữ liệu (${res.status}): ${errText}`);
        }
        insertSuccess = true;
      }

      if (insertSuccess) {
        // Hoàn tất thành công: Đóng modal form, reset và mở modal thông báo
        closeSubmitPropertyModal();
        resetForm();
        openSubmitPropertySuccessModal();

        // Kèm toast nếu có
        if (typeof window.showToast === 'function') {
          window.showToast('Dạ chào anh chị, chúng em xin phép nhận thông tin và sẽ liên hệ lại sớm nhất có thể.', true);
        }
      }
    } catch (err) {
      console.error('Lỗi khi gửi thông tin nhà cần bán:', err);
      showAlert(`Lỗi: ${err.message || 'Không thể lưu tin. Vui lòng thử lại sau.'}`, 'error');
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      if (submitBtnIcon) submitBtnIcon.textContent = '💾';
      if (submitBtnText) submitBtnText.textContent = 'Lưu Tin & Gửi';
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  // Khởi động khi DOM tải xong
  document.addEventListener('DOMContentLoaded', () => {
    initConfig();
    setupDropzoneEvents();
  });

  // Xuất các hàm ra window để truy cập từ HTML onclick
  window.openSubmitPropertyModal = openSubmitPropertyModal;
  window.closeSubmitPropertyModal = closeSubmitPropertyModal;
  window.openSubmitPropertySuccessModal = openSubmitPropertySuccessModal;
  window.closeSubmitPropertySuccessModal = closeSubmitPropertySuccessModal;
  window.handleSubmitPropertyForm = handleSubmitPropertyForm;
  window.removeSubmitPropertyImage = removeImage;

})();
