/* Personal PWA · 只缓存应用静态资源，不缓存课程数据和任何 API 响应。 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {scope: './'})
      .catch(error => console.info('离线缓存暂不可用（需 HTTPS 或 localhost）：', error));
  });
})();
