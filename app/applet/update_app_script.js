const fs = require('fs');
const filePath = './public/js/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update selectCols
const oldSelect = "const selectCols = 'id,title,price,price_text,ward,direction,floors,badge,address,img,img_list,desc,area,house_number,street,width,bedrooms,bathrooms,legal,views,created_at,updated_at,published_at,is_price_reduced,old_price,price_updated_at,loai_vi_tri,is_sold,publish_status';";
const newSelect = "const selectCols = 'id,title,price,price_text,ward,direction,floors,badge,address,img,img_list,desc,area,house_number,street,width,bedrooms,bathrooms,legal,views,created_at,updated_at,published_at,is_price_reduced,old_price,price_updated_at,loai_vi_tri,is_sold,publish_status,is_featured,featured_at,featured_label';";

if (content.includes(oldSelect)) {
  content = content.replace(oldSelect, newSelect);
  console.log("Updated selectCols successfully.");
} else {
  console.log("oldSelect not found or already updated.");
}

// 2. Update mapping in fetchPropertiesFromSupabase
const oldMapping = `publish_status: item.publish_status || 'published',
                   publishStatus: item.publish_status || 'published',
                   published_at: item.published_at || null`;

const newMapping = `publish_status: item.publish_status || 'published',
                   publishStatus: item.publish_status || 'published',
                   published_at: item.published_at || null,
                   is_featured: item.is_featured === true || item.is_featured === 'true',
                   featured_at: item.featured_at || null,
                   featured_label: item.featured_label || null`;

if (content.includes(oldMapping)) {
  content = content.replace(oldMapping, newMapping);
  console.log("Updated property mapping successfully.");
} else {
  console.log("oldMapping not found or already updated.");
}

// 3. Update applyFilters to call renderFeaturedProducts
const oldApply = `renderProducts(filtered);
         if (typeof renderPublicMarketPriceTable === 'function') {`;

const newApply = `renderProducts(filtered);
         if (typeof renderFeaturedProducts === 'function') {
           renderFeaturedProducts(true);
         }
         if (typeof renderPublicMarketPriceTable === 'function') {`;

if (content.includes(oldApply)) {
  content = content.replace(oldApply, newApply);
  console.log("Updated applyFilters successfully.");
} else {
  console.log("oldApply not found or already updated.");
}

// 4. Update switchAdminSubTab
const oldSwitchSubTab = `const tabSelling = document.getElementById('adminSubTab_selling');`;
const newSwitchSubTab = `const tabFeatured = document.getElementById('adminSubTab_featured');
         if (tabFeatured) {
           tabFeatured.style.background = subTab === 'featured' ? '#f97316' : 'var(--bg-light)';
           tabFeatured.style.color = subTab === 'featured' ? '#ffffff' : 'var(--text-dark)';
           tabFeatured.style.border = subTab === 'featured' ? 'none' : '1px solid var(--border)';
         }
         const tabSelling = document.getElementById('adminSubTab_selling');`;

if (content.includes(oldSwitchSubTab) && !content.includes('tabFeatured')) {
  content = content.replace(oldSwitchSubTab, newSwitchSubTab);
  console.log("Updated switchAdminSubTab successfully.");
} else {
  console.log("oldSwitchSubTab not found or already updated.");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("App.js updated successfully.");
