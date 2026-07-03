// Ghi đè an toàn alert và confirm để chạy mượt mà trong chế độ iframe sandboxed của Google AI Studio
(function() {
  const originalConfirm = window.confirm;
  window.confirm = function(message) {
    try {
      return originalConfirm.call(window, message);
    } catch (e) {
      console.warn("confirm() bị chặn bởi sandbox iframe, tự động xác nhận:", e);
      return true;
    }
  };

  const originalAlert = window.alert;
  window.alert = function(message) {
    try {
      originalAlert.call(window, message);
    } catch (e) {
      console.warn("alert() bị chặn bởi sandbox iframe, nội dung:", message);
      setTimeout(() => {
        if (typeof showToast === 'function') {
          showToast(message, false);
        } else {
          console.log("Alert content:", message);
        }
      }, 50);
    }
  };
})();
