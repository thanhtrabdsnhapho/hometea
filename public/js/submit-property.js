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

  // Cập nhật giao diện danh sách ảnh đã chọn
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
    selectedImages.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'sp-image-item';
      
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = `Ảnh ${index + 1}`;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'sp-remove-img-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Xóa ảnh này';
      removeBtn.type = 'button';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeImage(index);
      };

      item.appendChild(img);
      item.appendChild(removeBtn);
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
    const fbInput = document.getElementById('spFacebook');
    const webInput = document.getElementById('spWebsite');
    const contentInput = document.getElementById('spContent');
    const progressContainer = document.getElementById('spProgressContainer');

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
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
