(function(){
  function showNetBadge(text, type){
    var old = document.getElementById('netStatusBadge');
    if(old) old.remove();
    var el = document.createElement('div');
    el.id = 'netStatusBadge';
    el.className = 'net-status-badge ' + (type || '');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function(){ if(el && el.parentNode) el.remove(); }, type === 'offline' ? 6000 : 2600);
  }

  window.addEventListener('offline', function(){ showNetBadge('Нет интернета. Откроем сохраненную версию сайта.', 'offline'); });
  window.addEventListener('online', function(){ showNetBadge('Интернет вернулся. Обновляем данные.', 'online'); });

  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./service-worker.js')
      .then(function(reg){
        reg.update().catch(function(){});
        setInterval(function(){ reg.update().catch(function(){}); }, 60 * 60 * 1000);
        if (reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
        reg.addEventListener('updatefound', function(){
          var sw = reg.installing;
          if(!sw) return;
          sw.addEventListener('statechange', function(){
            if(sw.state === 'installed' && navigator.serviceWorker.controller){
              showNetBadge('Сайт обновлен. При следующем открытии будет новая версия.', 'online');
            }
          });
        });
      })
      .catch(function(err){ console.warn('PWA не включился:', err); });
  });
})();
