import React from "react";

// Định nghĩa Interface Props rõ ràng cho Component bằng TypeScript
interface CloudinaryImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  width?: number;
  height?: number;
  alt: string;
  className?: string;
}

/**
 * Hàm trợ giúp bóc tách và chèn các tham số tự động tối ưu hóa của Cloudinary (f_auto, q_auto, c_fill, v.v.)
 * @param url URL gốc lấy từ database
 * @param width Rộng cần resize (pixel)
 * @param height Cao cần resize (pixel)
 */
export function getOptimizedCloudinaryUrl(url: string, width?: number, height?: number): string {
  if (!url) return "";

  // Chỉ tối ưu đối với các ảnh thuộc kho lưu trữ Cloudinary
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    const params: string[] = ["f_auto", "q_auto"];

    if (width) {
      params.push(`w_${width}`);
    }
    if (height) {
      params.push(`h_${height}`);
      params.push("c_fill"); // Tự động cắt cúp vừa vặn với khung tỉ lệ yêu cầu
    } else if (width) {
      params.push("c_limit"); // Bảo toàn tỉ lệ gốc nếu chỉ xác định chiều rộng
    }

    const transformParams = params.join(",");
    // Thay thế cụm mốc /image/upload/ bằng cụm có chứa tham số tối ưu
    return url.replace("/image/upload/", `/image/upload/${transformParams}/`);
  }

  // Trả về ảnh gốc (như Unsplash, local...) khi không thuộc hệ thống Cloudinary
  return url;
}

/**
 * Component <CloudinaryImage /> hiển thị hình ảnh tối ưu tốc độ vượt bậc
 * - Tự động tải định dạng nhẹ nhất (WebP, AVIF) hỗ trợ bởi trình duyệt nhờ f_auto.
 * - Tự động nén dung lượng xuống tối thiểu nhưng giữ nguyên chất lượng nhờ q_auto.
 * - Hỗ trợ resize đúng tỉ lệ thiết kế để giảm RAM thiết bị của người dùng nhờ w_ và h_.
 * - Thiết lập loading="lazy" mặc định giúp tăng điểm số SEO Core Web Vitals.
 */
export const CloudinaryImage: React.FC<CloudinaryImageProps> = ({
  src,
  width,
  height,
  alt,
  className = "",
  loading = "lazy",
  ...props
}) => {
  const optimizedSrc = getOptimizedCloudinaryUrl(src, width, height);

  return (
    <img
      src={optimizedSrc}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      className={className}
      referrerPolicy="no-referrer"
      onError={(e) => {
        // Fallback sang ảnh truyền thống nếu có lỗi kết nối ảnh
        const target = e.target as HTMLImageElement;
        if (target.src !== src) {
          target.src = src;
        }
      }}
      {...props}
    />
  );
};

export default CloudinaryImage;
