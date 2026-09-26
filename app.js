(function(){
  const CFG = window.SUPABASE_CONFIG || {};
  const isConfigured = CFG.url && CFG.anonKey && !CFG.url.includes('PASTE_') && !CFG.anonKey.includes('PASTE_');
  const sb = isConfigured && window.supabase ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const page = document.body?.dataset?.page || 'home';
  const state = { user:null, profile:null, settings:null, lessons:[], materials:[], progress:[], allProgress:[], allProfiles:[], events:[], errors:[] };
  let selectedLessonId = null;

  function isTestMode(){ return sessionStorage.getItem('sg_test_mode') === '1' || new URLSearchParams(location.search).get('test') === '1'; }
  function enableTestMode(){ sessionStorage.setItem('sg_test_mode','1'); }
  function disableTestMode(){ sessionStorage.removeItem('sg_test_mode'); sessionStorage.removeItem('sg_test_progress'); location.href='admin.html'; }
  function loadTestProgress(){ try{return JSON.parse(sessionStorage.getItem('sg_test_progress')||'[]');}catch(e){return [];} }
  function saveTestProgress(){ sessionStorage.setItem('sg_test_progress', JSON.stringify(state.progress||[])); }
  function lessonStatusLabel(lesson){ return lesson?.is_published ? 'Опубликован' : 'Черновик / скрыт'; }
  function approvalStatus(profile=state.profile){ return profile?.approval_status || (profile?.role === 'admin' ? 'approved' : 'pending'); }
  function hasCourseAccess(profile=state.profile){ return profile?.role === 'admin' || approvalStatus(profile) === 'approved'; }
  function approvalText(profile=state.profile){ const st=approvalStatus(profile); if(st==='approved') return 'Подтвержден'; if(st==='blocked') return 'Отклонен / заблокирован'; return 'Ожидает подтверждения'; }
  function approvalClass(profile=state.profile){ const st=approvalStatus(profile); if(st==='approved') return 'done'; if(st==='blocked') return 'lock'; return 'pending'; }

  function msg(text, type='notice') { return `<div class="notice ${type}">${text}</div>`; }
  function esc(s=''){return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function arr(v){ if(Array.isArray(v)) return v.filter(Boolean); if(typeof v==='string') return v.split('\n').map(x=>x.trim()).filter(Boolean); return []; }
  function joinLines(v){ return arr(v).join('\n'); }
  function getQuery(name){ return new URLSearchParams(location.search).get(name); }
  function safeNextPath(value=''){
    const raw = String(value || '').trim();
    if(!raw) return '';
    try{
      const url = new URL(raw, location.href);
      if(url.origin !== location.origin) return '';
      const file = url.pathname.split('/').pop() || 'index.html';
      const allowed = new Set(['index.html','program.html','course.html','lesson.html','materials.html','cabinet.html','complete.html','admin.html']);
      return allowed.has(file) ? `${file}${url.search}` : '';
    }catch(e){ return ''; }
  }
  function safeExternalUrl(value='', fallback='#'){
    const raw = String(value || '').trim();
    if(!raw) return fallback;
    if(raw === '#') return '#';
    try{
      const url = new URL(raw, location.href);
      return ['http:','https:'].includes(url.protocol) ? url.toString() : fallback;
    }catch(e){ return fallback; }
  }
  function cleanPhone(p=''){ return String(p).replace(/\D/g,''); }
  function todayRu(){ return new Date().toLocaleDateString('ru-RU'); }
  function shortId(id=''){ return String(id).replace(/-/g,'').slice(0,10).toUpperCase(); }
  function prettyBytes(bytes=0){ const n=Number(bytes||0); if(n<1024) return n+' Б'; if(n<1024*1024) return (n/1024).toFixed(1)+' КБ'; if(n<1024*1024*1024) return (n/1024/1024).toFixed(1)+' МБ'; return (n/1024/1024/1024).toFixed(2)+' ГБ'; }
  function naturalVideoNumber(value='', fallback=999999){
    const text = String(value || '');
    const part = text.match(/(?:part|часть|chast|segment|seg|_)(?:_|-|\s)*(\d{1,5})/i) || text.match(/(\d{1,5})(?=\D*$)/);
    return part ? Number(part[1]) : fallback;
  }
  function cleanVideoTitle(name='', index=0){
    const base = String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const n = naturalVideoNumber(base, index + 1);
    if(/part|часть|segment|seg/i.test(base)) return `Часть ${String(n).padStart(2,'0')}`;
    return base || `Часть ${index + 1}`;
  }
  function sortVideoParts(parts){
    return (parts || []).map((p,i)=>({...p, __i:i, __n:Number(p.order || p.sort_order || naturalVideoNumber((p.title || '') + ' ' + (p.url || ''), 999999))}))
      .sort((a,b)=>(a.__n-b.__n) || (a.__i-b.__i))
      .map(({__i,__n,...p})=>p);
  }
  function downloadFile(name, text, type='application/json'){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function confirmAction(text){ return window.confirm(text || 'Подтвердите действие'); }
  async function safePromise(promise, fallback=null){ try{ return await promise; }catch(e){ console.warn(e); return fallback; } }

  function extractIframeSrc(value=''){
    const text = String(value || '').trim();
    const match = text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    return match ? match[1].trim() : text;
  }
  function timeToSeconds(value=''){
    const t = String(value || '').trim();
    if(!t) return 0;
    if(/^\d+$/.test(t)) return Number(t);
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
    if(!m) return 0;
    return (Number(m[1]||0)*3600) + (Number(m[2]||0)*60) + Number(m[3]||0);
  }
  function youtubeEmbedUrl(value=''){
    const raw = extractIframeSrc(value);
    if(!raw) return '';
    try{
      const u = new URL(raw, location.href);
      const host = u.hostname.replace(/^www\./,'').replace(/^m\./,'');
      let id = '';
      if(host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || '';
      if(host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')){
        const parts = u.pathname.split('/').filter(Boolean);
        if(u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else if(parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') id = parts[1] || '';
      }
      id = String(id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
      if(!id) return '';
      const start = Number(u.searchParams.get('start') || timeToSeconds(u.searchParams.get('t') || u.searchParams.get('time_continue')) || 0);
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      embed.searchParams.set('rel','0');
      embed.searchParams.set('modestbranding','1');
      embed.searchParams.set('playsinline','1');
      if(start > 0) embed.searchParams.set('start', String(start));
      return embed.toString();
    }catch(e){ return ''; }
  }
  function rutubeEmbedUrl(value=''){
    const raw = extractIframeSrc(value);
    if(!raw) return '';
    try{
      const u = new URL(raw, location.href);
      const host = u.hostname.replace(/^www\./,'');
      if(!host.endsWith('rutube.ru')) return '';
      const parts = u.pathname.split('/').filter(Boolean);
      let id = '';
      if(parts[0] === 'video') id = parts[1] || '';
      if(parts[0] === 'play' && parts[1] === 'embed') id = parts[2] || '';
      id = String(id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
      return id ? `https://rutube.ru/play/embed/${id}/` : '';
    }catch(e){ return ''; }
  }

  function vkEmbedUrl(value=''){
    const raw = extractIframeSrc(value);
    if(!raw) return '';
    try{
      const u = new URL(raw, location.href);
      const host = u.hostname.replace(/^www\./,'').replace(/^m\./,'');
      const isVkHost = host === 'vk.com' || host === 'vk.ru' || host.endsWith('.vk.com') || host === 'vkvideo.ru' || host.endsWith('.vkvideo.ru');
      if(!isVkHost) return '';

      // Если админ вставил готовый iframe-код или embed-ссылку из VK — используем ее как есть.
      if(/\/video_ext\.php$/i.test(u.pathname)){
        if(!u.searchParams.get('autoplay')) u.searchParams.set('autoplay','0');
        return u.toString().replace('https://vk.com/video_ext.php', 'https://vkvideo.ru/video_ext.php');
      }

      const full = decodeURIComponent(raw);
      const z = u.searchParams.get('z') ? decodeURIComponent(u.searchParams.get('z')) : '';
      const candidates = [full, u.pathname, z].filter(Boolean).join(' ');
      const m = candidates.match(/video(-?\d+)_(\d+)/i);
      if(!m) return '';
      const oid = m[1];
      const id = m[2];
      const embed = new URL('https://vkvideo.ru/video_ext.php');
      embed.searchParams.set('oid', oid);
      embed.searchParams.set('id', id);
      embed.searchParams.set('hd', u.searchParams.get('hd') || '2');
      embed.searchParams.set('autoplay', '0');
      const hash = u.searchParams.get('hash') || u.searchParams.get('list') || '';
      if(hash && /^[a-zA-Z0-9_-]{4,128}$/.test(hash)) embed.searchParams.set('hash', hash);
      return embed.toString();
    }catch(e){ return ''; }
  }

  function directVideoUrl(value=''){
    const raw = extractIframeSrc(value);
    return /\.(mp4|webm|mov)(\?|#|$)/i.test(raw) ? raw : '';
  }
  function normalizeLessonVideo(value='', selectedType='auto'){
    const raw = extractIframeSrc(value);
    const typed = String(selectedType || 'auto');
    if(!raw) return {type:'none', url:''};
    const yt = youtubeEmbedUrl(raw);
    if(yt) return {type:'youtube', url:yt, provider:'youtube'};
    const rt = rutubeEmbedUrl(raw);
    if(rt) return {type:'youtube', url:rt, provider:'rutube'};
    const vk = vkEmbedUrl(raw);
    if(vk) return {type:'youtube', url:vk, provider:'vk'};
    const safeUrl = safeExternalUrl(raw, '');
    if(!safeUrl) return {type:'none', url:''};
    if(typed === 'file') return {type:'file', url:safeUrl};
    // Не помещаем неизвестный адрес в iframe: это защищает страницу от подмены содержимого.
    if(typed === 'youtube') return {type:'external', url:safeUrl};
    if(typed === 'none') return {type:'external', url:safeUrl};
    return {type:typed || 'external', url:safeUrl};
  }

  function normalizeVideoParts(value){
    let items = [];
    if(Array.isArray(value)) items = value;
    else if(typeof value === 'string' && value.trim()){
      const t = value.trim();
      try{
        const parsed = JSON.parse(t);
        if(Array.isArray(parsed)) items = parsed;
      }catch(e){
        items = t.split(/\n+/).map(line=>line.trim()).filter(Boolean).map(line=>{
          const parts = line.split('|').map(x=>x.trim()).filter(Boolean);
          if(parts.length >= 2) return {title:parts[0], url:parts.slice(1).join('|')};
          return {title:'', url:line};
        });
      }
    }
    const normalizedItems = items.map((item, i)=>{
      const raw = typeof item === 'string' ? item : (item?.url || item?.video_url || '');
      const title = typeof item === 'object' ? (item.title || item.name || '') : '';
      const normalized = normalizeLessonVideo(raw, item?.type || 'auto');
      if(!normalized.url || normalized.type === 'none') return null;
      return {title: title || `Часть ${i+1}`, type: normalized.type, url: normalized.url, order: Number(item?.order || item?.sort_order || naturalVideoNumber((title || '') + ' ' + raw, i + 1))};
    }).filter(Boolean);
    return sortVideoParts(normalizedItems).map((p,i)=>({...p, title:p.title || `Часть ${i+1}`}));
  }
  function videoPartsToText(value){
    return normalizeVideoParts(value).map((p,i)=>`${p.title || ('Часть '+(i+1))} | ${p.url}`).join('\n');
  }
  function videoPlayerHtml(part, i=0, total=1){
    const title = part.title || `Часть ${i+1}`;
    const badge = total > 1 ? `<span class="viz-badge video-part-badge">${i+1}/${total}</span>` : '';
    const head = `<div class="video-part-title"><b>${esc(title)}</b>${badge}</div>`;
    const direct = !(part.type === 'youtube') && !(part.type === 'external' && !directVideoUrl(part.url));
    if(part.type === 'youtube'){
      return `<article class="video-part-card" data-video-part="${i}">${head}<div class="video-box"><iframe title="${esc(title)}" src="${esc(part.url)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="hint">Встроенное видео открывается внутри сайта.</p></article>`;
    }
    if(part.type === 'external' && !directVideoUrl(part.url)){
      return `<article class="video-part-card" data-video-part="${i}">${head}<div class="video-box"><div class="empty">Внешняя ссылка на видео</div></div><p><a class="secondary" href="${esc(part.url)}" target="_blank" rel="noopener">Открыть видео</a></p></article>`;
    }
    return `<article class="video-part-card ${direct?'direct-video-part':''}" data-video-part="${i}">${head}<div class="video-box"><video data-video-part-player data-video-index="${i}" src="${esc(part.url)}" controls controlslist="nodownload" playsinline preload="metadata"></video></div></article>`;
  }

  function videoStateKey(lessonId){ return `sg_video_parts_state_${String(lessonId || 'demo')}`; }
  function getSavedVideoState(lessonId){ try{return JSON.parse(localStorage.getItem(videoStateKey(lessonId)) || '{}');}catch(e){return {};} }
  function setSavedVideoState(lessonId, data){ try{ localStorage.setItem(videoStateKey(lessonId), JSON.stringify(data || {})); }catch(e){} }
  async function markLessonVideoWatched(lesson){
    if(!lesson || pFor(lesson.id)?.video_watched) return;
    await saveProgress(lesson.id,{video_watched:true});
    trackEvent('video_parts_complete',{lesson_id:lesson.id,title:lesson.title});
    const btn = $('#watchedBtn');
    if(btn){ btn.className = 'success'; btn.textContent = '✅ Видео отмечено'; }
    $$('.smart-row').forEach(row=>{ if(row.textContent.includes('Видео')) row.classList.add('done'); });
  }
  function setupVideoPartsPlayback(lesson){
    const root = $('[data-video-playlist]');
    if(!root || !lesson) return;
    const videos = $$('[data-video-part-player]', root);
    if(!videos.length) return;
    const bar = $('[data-video-total-bar]', root);
    const text = $('[data-video-total-text]', root);
    const stateKey = videoStateKey(lesson.id);
    const saved = getSavedVideoState(lesson.id);
    const partState = saved.parts || {};
    let alreadyMarked = !!pFor(lesson.id)?.video_watched;

    function saveLocal(){
      const data = { updated_at:new Date().toISOString(), parts:partState };
      videos.forEach((v, idx)=>{
        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (partState[idx]?.duration || 0);
        const current = Number.isFinite(v.currentTime) ? v.currentTime : (partState[idx]?.current || 0);
        const ended = !!v.ended || (duration && current >= duration * .96) || !!partState[idx]?.ended;
        partState[idx] = { duration, current, ended };
      });
      setSavedVideoState(lesson.id, data);
    }
    function updateProgress(){
      let sum = 0;
      videos.forEach((v, idx)=>{
        const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (partState[idx]?.duration || 0);
        const c = Number.isFinite(v.currentTime) ? v.currentTime : (partState[idx]?.current || 0);
        const ended = !!v.ended || !!partState[idx]?.ended;
        const pct = ended ? 1 : (d ? Math.min(1, c / d) : 0);
        sum += pct;
        const card = v.closest('[data-video-part]');
        if(card) card.classList.toggle('done', pct >= .96);
      });
      const percent = Math.round((sum / videos.length) * 100);
      if(bar) bar.style.width = percent + '%';
      if(text) text.textContent = percent + '% просмотрено';
      if(percent >= 96 && !alreadyMarked){ alreadyMarked = true; markLessonVideoWatched(lesson); }
    }
    videos.forEach((video, idx)=>{
      const savedPart = partState[idx];
      video.addEventListener('loadedmetadata', ()=>{
        if(savedPart?.current && savedPart.current > 3 && savedPart.current < video.duration - 5){
          try{ video.currentTime = savedPart.current; }catch(e){}
        }
        updateProgress();
      });
      video.addEventListener('play', ()=>{
        $$('[data-video-part]', root).forEach(x=>x.classList.remove('active'));
        video.closest('[data-video-part]')?.classList.add('active');
        videos.forEach((other, j)=>{ if(j !== idx && !other.paused) other.pause(); });
      });
      video.addEventListener('timeupdate', ()=>{
        partState[idx] = {duration: video.duration || 0, current: video.currentTime || 0, ended: video.ended};
        updateProgress();
        if(Math.floor(video.currentTime || 0) % 5 === 0) setSavedVideoState(lesson.id, {updated_at:new Date().toISOString(), parts:partState});
      });
      video.addEventListener('ended', async()=>{
        partState[idx] = {duration: video.duration || 0, current: video.duration || video.currentTime || 0, ended:true};
        saveLocal(); updateProgress();
        const next = videos[idx+1];
        if(next){
          next.closest('[data-video-part]')?.scrollIntoView({behavior:'smooth', block:'center'});
          try{ await next.play(); }catch(e){
            const note = $('[data-video-total-note]', root);
            if(note) note.textContent = 'Следующая часть готова. Нажмите ▶, если браузер не запустил ее автоматически.';
          }
        } else {
          await markLessonVideoWatched(lesson);
          const note = $('[data-video-total-note]', root);
          if(note) note.textContent = 'Все части просмотрены. Видео автоматически отмечено как просмотренное.';
        }
      });
    });
    root.addEventListener('click', (e)=>{
      const card = e.target.closest('[data-video-part]');
      if(!card || e.target.closest('video,iframe,a,button')) return;
      const v = $('[data-video-part-player]', card);
      if(v) v.play().catch(()=>{});
    });
    updateProgress();
  }


  const CACHE_VERSION = 'v14_multiple_video_lessons';
  function cacheKey(name, extra='global'){
    const project = (CFG.url || 'demo').replace(/[^a-zA-Z0-9]/g,'_').slice(-42);
    return `sg_${CACHE_VERSION}_${project}_${name}_${extra || 'global'}`;
  }
  function cacheGet(name, extra='global', ttl=60000){
    try{
      const raw = sessionStorage.getItem(cacheKey(name, extra));
      if(!raw) return null;
      const item = JSON.parse(raw);
      if(!item || !item.t || (Date.now() - item.t) > ttl) return null;
      return item.v;
    }catch(e){ return null; }
  }
  function cacheSet(name, extra='global', value){
    try{ sessionStorage.setItem(cacheKey(name, extra), JSON.stringify({t:Date.now(), v:value})); }catch(e){}
  }
  function cacheRemove(name, extra='global'){
    try{ sessionStorage.removeItem(cacheKey(name, extra)); }catch(e){}
  }
  async function withTimeout(promise, ms=9000, label='операция'){
    let timer;
    try{
      return await Promise.race([
        promise,
        new Promise((_, reject)=>{ timer=setTimeout(()=>reject(new Error(`Долгая загрузка: ${label}`)), ms); })
      ]);
    } finally { if(timer) clearTimeout(timer); }
  }
  function renderFastLoading(selector, title='Загружаем данные', text='Открываем страницу. Если Supabase недавно был восстановлен, первая загрузка может занять немного дольше.'){
    const root = $(selector);
    if(!root || root.dataset.ready === '1') return;
    root.innerHTML = `<section class="glass panel fast-loading-card"><div class="loader-dot"></div><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="skeleton-lines"><span></span><span></span><span></span></div></section>`;
  }
  function networkErrorHtml(title='Не удалось загрузить данные'){
    return `<section class="glass panel"><h1>${esc(title)}</h1><p class="notice error">Supabase не ответил вовремя. Обычно помогает обновить страницу через 10–20 секунд. Если проект недавно был восстановлен после паузы, первая загрузка может быть медленной.</p><div class="auth-actions"><button class="primary" onclick="location.reload()">Обновить</button><a class="secondary" href="index.html">На главную</a></div></section>`;
  }

  function defaultSettings(){
    return {
      id:1,
      site_title:'Школа Госуслуг',
      site_subtitle:'Научитесь пользоваться государственными услугами быстро и уверенно',
      site_logo:'✦',
      site_logo_url:'',
      site_logo_bg:'',
      hero_badge:'🎓 Пошаговое обучение для новичков',
      hero_title:'Научитесь пользоваться',
      hero_highlight:'госуслугами',
      hero_text:'Понятный онлайн-курс с видеоуроками, инструкциями и проверкой знаний. Ученик проходит материал по шагам: смотрит урок, выполняет задание, проходит тест и открывает следующий этап.',
      primary_button_text:'Начать обучение',
      secondary_button_text:'Личный кабинет',
      whatsapp_phone:'79000000000',
      passing_score:70,
      about_title:'О курсе',
      about_text:'Курс помогает ученику уверенно пользоваться онлайн-сервисами: смотреть понятные видео, повторять действия по шагам, закреплять знания тестами и видеть свой прогресс в личном кабинете.',
      about_cards:['Подходит для новичков','Можно проходить с телефона','Уроки открываются по порядку'],
      process_title:'Как проходит обучение',
      process_steps:['Зарегистрируйтесь и откройте курс','Посмотрите видеоурок','Выполните инструкцию и практику','Пройдите тест и откройте следующий урок'],
      support_title:'Нужна помощь?',
      support_text:'Если у ученика возник вопрос по уроку, он может сразу написать преподавателю в WhatsApp.',
      theme_primary:'#42d7ff',
      theme_secondary:'#8b5cf6',
      theme_accent:'#ff4ecd',
      site_width:1360,
      footer_text:''
    };
  }

  function demoLessons(){
    return [
      {id:'demo-1',sort_order:1,icon:'🧭',title:'Что такое Госуслуги и как проходит курс',description:'Стартовый урок: для чего нужен портал и как устроено обучение.',duration:'8 минут',video_type:'none',video_url:'',content:'Госуслуги помогают получать государственные услуги онлайн. В этом курсе ученик учится действовать по инструкции, смотреть видео, читать подсказки и закреплять материал тестами.',steps:['Открыть курс','Изучить видео','Прочитать инструкцию','Пройти тест'],mistakes:['Пытаться открыть все уроки сразу','Пропускать инструкцию','Не сохранять прогресс'],practice:'Откройте личный кабинет и посмотрите, где отображается прогресс.',passing_score:70,is_published:true},
      {id:'demo-2',sort_order:2,icon:'🔐',title:'Безопасный вход и защита аккаунта',description:'Пароли, SMS-коды, проверка адреса сайта и базовая безопасность.',duration:'12 минут',video_type:'none',video_url:'',content:'Безопасность — первый навык при работе с государственными сервисами. Пароль и SMS-код нельзя сообщать другим людям.',steps:['Проверить адрес сайта','Не сообщать SMS-коды','Использовать надежный пароль','Включить дополнительную защиту'],mistakes:['Передавать код помощнику','Открывать подозрительные ссылки','Использовать один пароль везде'],practice:'Составьте список признаков безопасного входа.',passing_score:70,is_published:true},
      {id:'demo-3',sort_order:3,icon:'🔎',title:'Поиск нужной услуги',description:'Как пользоваться поиском, разделами и описанием услуги.',duration:'10 минут',video_type:'none',video_url:'',content:'Для поиска услуги лучше использовать короткие понятные запросы: справка, запись к врачу, замена паспорта, госпошлина.',steps:['Открыть поиск','Ввести короткий запрос','Открыть услугу','Прочитать условия'],mistakes:['Искать слишком длинной фразой','Не читать описание','Выбирать первую услугу без проверки'],practice:'Придумайте 3 запроса для поиска услуг.',passing_score:70,is_published:true}
    ];
  }
  function demoQuestions(lessonId){
    const q = {
      'demo-1':[
        {question:'Как открываются уроки в курсе?',answers:['Все сразу','По порядку после выполнения предыдущего','Случайно'],correct_index:1},
        {question:'Что показывает личный кабинет?',answers:['Прогресс обучения','Погоду','Музыку'],correct_index:0}
      ],
      'demo-2':[
        {question:'Можно ли передавать SMS-код другому человеку?',answers:['Да','Нет','Только знакомым'],correct_index:1},
        {question:'Что нужно проверить перед входом?',answers:['Адрес сайта','Цвет кнопки','Размер экрана'],correct_index:0}
      ],
      'demo-3':[
        {question:'Как быстрее найти услугу?',answers:['Через поиск','Случайно нажимать','Закрыть сайт'],correct_index:0},
        {question:'Что нужно прочитать перед оформлением?',answers:['Описание услуги','Новости спорта','Настройки монитора'],correct_index:0}
      ]
    };
    return q[lessonId] || [];
  }


  function demoMaterials(){
    return [
      {id:'mat-demo-1',title:'Памятка ученика',description:'Короткий чек-лист перед прохождением уроков.',file_url:'#',file_type:'pdf',lesson_id:null,is_published:true,created_at:new Date().toISOString()},
      {id:'mat-demo-2',title:'Шаблон заметок по уроку',description:'Можно использовать как конспект во время обучения.',file_url:'#',file_type:'doc',lesson_id:null,is_published:true,created_at:new Date().toISOString()}
    ];
  }

  function settings(){ return {...defaultSettings(), ...(state.settings || {})}; }
  function whatsappUrl(text='Здравствуйте! У меня вопрос по обучению.'){ const phone = cleanPhone(settings().whatsapp_phone); return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`; }
  function setWhatsAppLinks(){
    $$('.whatsapp-link,.float-whatsapp').forEach(a=>{
      let text='Здравствуйте! У меня вопрос по обучению.';
      try{
        const current=new URL(a.getAttribute('href') || '#', location.href);
        if(current.hostname==='wa.me' && current.searchParams.get('text')) text=current.searchParams.get('text');
      }catch(e){}
      a.href=whatsappUrl(text);
      if(a.target==='_blank') a.rel='noopener';
    });
  }
  async function trackEvent(action, metadata={}){
    if(!sb || !state.user) return;
    try{
      await sb.from('site_events').insert({
        user_id: state.user?.id || null,
        page,
        action,
        metadata
      });
    } catch(e){ console.warn('analytics skipped', e); }
  }
  async function trackError(action, error, metadata={}){
    if(!sb || !state.user) return;
    try{
      const message = error?.message || String(error || 'unknown');
      await sb.from('site_errors').insert({
        user_id: state.user?.id || null,
        page,
        action: action || 'client_error',
        message: message.slice(0,1000),
        metadata: {
          ...metadata,
          path: location.pathname,
          search: location.search,
          user_agent: navigator.userAgent
        }
      });
    } catch(e){ console.warn('error log skipped', e); }
  }
  window.addEventListener('error', (event)=>{
    trackError('js_error', event.error || event.message, {filename:event.filename, lineno:event.lineno, colno:event.colno});
  });
  window.addEventListener('unhandledrejection', (event)=>{
    trackError('promise_error', event.reason || 'unhandled promise rejection', {});
  });
  function recoveryModeRequested(){
    const search = new URLSearchParams(location.search);
    const hash = new URLSearchParams((location.hash||'').replace(/^#/,''));
    return search.get('recovery') === '1' || search.get('type') === 'recovery' || hash.get('type') === 'recovery';
  }
  function redirectLogin(){
    const next = safeNextPath(location.pathname.split('/').pop()+location.search) || 'cabinet.html';
    location.href = `index.html?login=1&next=${encodeURIComponent(next)}`;
  }

  async function init(){
    renderConfigWarning();
    if(!sb){
      state.settings = defaultSettings();
      state.lessons = demoLessons();
      state.materials = demoMaterials();
      state.progress = [{user_id:'demo-user', lesson_id:'demo-1', video_watched:true, practice_done:true, quiz_score:100, completed:true, completed_at:new Date().toISOString(), updated_at:new Date().toISOString()}];
      state.user = {id:'demo-user', email:'demo@example.com'};
      state.profile = {id:'demo-user', email:'demo@example.com', full_name:'Демо-ученик', role:'student', approval_status:'approved'};
      hydrateBrand(); setWhatsAppLinks(); bindCommon(); initDemoPage(); return;
    }
    const { data } = await withTimeout(sb.auth.getSession(), 8000, 'проверка входа');
    state.user = data.session?.user || null;
    await Promise.all([loadSettings(), state.user ? loadProfile() : Promise.resolve(null)]);
    hydrateBrand(); setWhatsAppLinks(); bindCommon();
    trackEvent('page_view', { title: document.title });
    if(recoveryModeRequested()) setTimeout(()=>showAuthModal('new_password'), 50);
    if(page==='home') return initHome();
    if(page==='course') return initCourse();
    if(page==='lesson') return initLesson();
    if(page==='cabinet') return initCabinet();
    if(page==='admin') return initAdmin();
    if(page==='complete') return initComplete();
    if(page==='certificate') return location.replace('complete.html');
    if(page==='program') return initProgram();
    if(page==='materials') return initMaterials();
  }

  function renderConfigWarning(){
    if(sb) return;
    const main = $('main.container');
    if(main) main.insertAdjacentHTML('afterbegin', msg('Supabase пока не подключен. После подключения все уроки, видео, тексты, тесты, ученики и настройки будут управляться через админку.', 'warning'));
  }

  function renderStaticFallback(){
    if(page==='home') renderHomeSections();
    if(page==='program') $('#lessonPreview') && ($('#lessonPreview').innerHTML = `<div class="empty">После подключения Supabase здесь появится программа курса.</div>`);
  }

  function initDemoPage(){
    if(page==='home') { renderHomeSections(); renderLessonPreview(); const count=$('#lessonsCount'); if(count) count.textContent=String(state.lessons.length); const box=$('#homeAuthBox'); if(box) box.innerHTML = `<div class="notice warning">Демо-режим: Supabase не подключен. После подключения здесь будет настоящая регистрация.</div><div class="auth-actions"><a class="primary" href="course.html">Посмотреть курс</a><a class="secondary" href="cabinet.html">Посмотреть кабинет</a></div>`; }
    if(page==='program') { renderLessonPreview(); renderMaterialsPreview(); }
    if(page==='materials') { renderMaterialsPage(); }
    if(page==='course') { hydrateCourseHeader(); renderCourse(); }
    if(page==='lesson') { const id=getQuery('id') || state.lessons[0]?.id; const lesson=state.lessons.find(l=>l.id===id); if(!lesson){ const root=$('#lessonRoot'); if(root) root.innerHTML=msg('Урок не найден. Проверьте ссылку или вернитесь к курсу.','error')+'<p><a class="secondary" href="course.html">Вернуться к курсу</a></p>'; } else renderLesson(lesson, state.lessons.indexOf(lesson), demoQuestions(lesson.id)); }
    if(page==='cabinet') { renderCabinet(); }
    if(page==='complete') { renderComplete(); }
    if(page==='certificate') { location.replace('complete.html'); }
    if(page==='admin') { renderAdminDemo(); }
  }
  function renderAdminDemo(){
    const root = $('#adminRoot'); if(!root) return;
    root.innerHTML = `<div class="page-title"><h1>Панель управления</h1><p>Демо-вид админки. После подключения Supabase здесь будут работать загрузка видео, уроки, ученики и настройки.</p></div><div class="admin-layout"><aside class="admin-menu glass"><button class="secondary active">📊 Обзор</button><button class="secondary">📚 Уроки</button><button class="secondary">🎬 Файлы</button><button class="secondary">🎨 Настройки</button></aside><section class="glass panel"><h2>Демо-обзор</h2><div class="metric-grid"><div class="metric"><b>${state.lessons.length}</b><span>уроков</span></div><div class="metric"><b>1</b><span>демо-ученик</span></div><div class="metric"><b>100%</b><span>тест</span></div><div class="metric"><b>0</b><span>файлов</span></div></div><div class="notice warning">Для настоящей загрузки видео нужно выполнить setup.sql, указать Supabase URL/key и войти под email с ролью admin.</div></section></div>`;
  }


  async function loadSettings(){
    const cached = cacheGet('settings','global',5*60*1000);
    if(cached){
      state.settings = {...defaultSettings(), ...(cached || {})};
      withTimeout(sb.from('site_settings').select('*').eq('id',1).single(), 8000, 'настройки сайта')
        .then(({data,error})=>{ if(!error && data){ state.settings={...defaultSettings(),...data}; cacheSet('settings','global',data); hydrateBrand(); } })
        .catch(e=>console.warn(e));
      return state.settings;
    }
    try{
      const { data, error } = await withTimeout(sb.from('site_settings').select('*').eq('id',1).single(), 9000, 'настройки сайта');
      state.settings = {...defaultSettings(), ...(data || {})};
      if(data) cacheSet('settings','global',data);
      if(error) console.warn(error);
    }catch(e){ console.warn(e); state.settings = defaultSettings(); }
    return state.settings;
  }
  async function loadProfile(){
    if(!state.user) return null;
    const key = state.user.id;
    const cached = cacheGet('profile', key, 20*1000);
    if(cached){
      state.profile = cached;
      withTimeout(sb.from('profiles').select('id,email,full_name,phone,role,approval_status,created_at,updated_at').eq('id',state.user.id).maybeSingle(), 8000, 'профиль')
        .then(async ({data})=>{ if(data){ state.profile=data; cacheSet('profile', key, data); hydrateBrand(); } })
        .catch(e=>console.warn(e));
      return cached;
    }
    try{
      let { data } = await withTimeout(sb.from('profiles').select('id,email,full_name,phone,role,approval_status,created_at,updated_at').eq('id',state.user.id).maybeSingle(), 9000, 'профиль');
      if(!data){
        const payload = {id:state.user.id,email:state.user.email,full_name:state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || 'Ученик', role:'student', approval_status:'pending'};
        await withTimeout(sb.from('profiles').insert(payload), 9000, 'создание профиля');
        data = payload;
      }
      state.profile = data;
      cacheSet('profile', key, data);
      return data;
    }catch(e){ console.warn(e); return state.profile; }
  }
  async function loadLessons(includeAll=false){
    const cacheName = includeAll ? null : 'lessons_public';
    if(cacheName){
      const cached = cacheGet(cacheName,'global',45*1000);
      if(cached){ state.lessons = cached; return state.lessons; }
    }
    try{
      let q = sb.from('lessons').select('*').order('sort_order',{ascending:true});
      if(!includeAll) q = q.eq('is_published',true);
      const { data, error } = await withTimeout(q, 9000, 'уроки');
      if(error){ console.warn(error); return state.lessons || []; }
      state.lessons = data || [];
      if(cacheName) cacheSet(cacheName,'global',state.lessons);
      return state.lessons;
    }catch(e){ console.warn(e); return state.lessons || []; }
  }
  async function loadQuestions(lessonId){
    const key = String(lessonId||'');
    const cached = cacheGet('questions', key, 45*1000);
    if(cached) return cached;
    try{
      let { data, error } = await withTimeout(sb.rpc('get_lesson_quiz',{p_lesson_id:lessonId}), 9000, 'вопросы урока');
      // Совместимость со старой базой до повторного запуска setup.sql.
      if(error){
        console.warn('get_lesson_quiz fallback', error);
        const fallback = await withTimeout(sb.from('quiz_questions').select('*').eq('lesson_id',lessonId).order('sort_order',{ascending:true}), 9000, 'вопросы урока');
        data = fallback.data;
        error = fallback.error;
      }
      if(error){ console.warn(error); return []; }
      cacheSet('questions', key, data || []);
      return data || [];
    }catch(e){ console.warn(e); return []; }
  }
  async function loadMaterials(includeAll=false){
    if(!sb){ state.materials = demoMaterials(); return state.materials; }
    const cacheName = includeAll ? null : 'materials_public';
    if(cacheName){
      const cached = cacheGet(cacheName,'global',45*1000);
      if(cached){ state.materials = cached; return state.materials; }
    }
    try{
      let q = sb.from('materials').select('*').order('created_at',{ascending:false});
      if(!includeAll) q = q.eq('is_published',true);
      const { data, error } = await withTimeout(q, 9000, 'материалы');
      if(error){ console.warn(error); return state.materials || []; }
      state.materials = data || [];
      if(cacheName) cacheSet(cacheName,'global',state.materials);
      return state.materials;
    }catch(e){ console.warn(e); return state.materials || []; }
  }

  async function loadProgress(userId=state.user?.id){
    if(!userId) return [];
    const key = String(userId);
    const cached = cacheGet('progress', key, 15*1000);
    if(cached){ state.progress = cached; return state.progress; }
    try{
      const { data, error } = await withTimeout(sb.from('lesson_progress').select('*').eq('user_id',userId), 9000, 'прогресс');
      if(error){ console.warn(error); return state.progress || []; }
      state.progress = data || [];
      cacheSet('progress', key, state.progress);
      return state.progress;
    }catch(e){ console.warn(e); return state.progress || []; }
  }

  async function loadProgressAll(){
    try{
      const [progressRes, profilesRes, eventsRes, errorsRes] = await Promise.all([
        withTimeout(sb.from('lesson_progress').select('*, profiles:user_id(email,full_name,phone), lessons:lesson_id(title,sort_order)').order('updated_at',{ascending:false}).limit(1000), 12000, 'прогресс учеников'),
        withTimeout(sb.from('profiles').select('*').order('created_at',{ascending:false}).limit(1000), 12000, 'ученики'),
        safePromise(withTimeout(sb.from('site_events').select('*').order('created_at',{ascending:false}).limit(200), 10000, 'активность'), null),
        safePromise(withTimeout(sb.from('site_errors').select('*').order('created_at',{ascending:false}).limit(80), 10000, 'ошибки сайта'), null)
      ]);
      state.allProgress=progressRes?.data||[];
      state.allProfiles=profilesRes?.data||[];
      state.events = eventsRes?.data || [];
      state.errors = errorsRes?.data || [];
    }catch(e){ console.warn(e); state.allProgress=state.allProgress||[]; state.allProfiles=state.allProfiles||[]; state.events=state.events||[]; state.errors=state.errors||[]; }
  }
  function applyDashboardBundle(bundle){
    if(!bundle || typeof bundle !== 'object') return false;
    if(bundle.profile){ state.profile = bundle.profile; cacheSet('profile', state.user?.id, bundle.profile); }
    if(Array.isArray(bundle.lessons)){ state.lessons = bundle.lessons; cacheSet('lessons_public','global',bundle.lessons); }
    if(Array.isArray(bundle.progress)){ state.progress = bundle.progress; cacheSet('progress', state.user?.id, bundle.progress); }
    if(Array.isArray(bundle.materials)){ state.materials = bundle.materials; cacheSet('materials_public','global',bundle.materials); }
    return true;
  }
  async function loadDashboardBundle(){
    if(!sb || !state.user) return false;
    const cacheId = state.user.id;
    const cached = cacheGet('dashboard_bundle', cacheId, 12000);
    if(cached && applyDashboardBundle(cached)){
      // Обновляем в фоне, чтобы кабинет открылся мгновенно, но данные подтянулись свежие.
      sb.rpc('get_my_dashboard')
        .then(({data,error})=>{ if(!error && data){ cacheSet('dashboard_bundle', cacheId, data); applyDashboardBundle(data); const root=$('#cabinetRoot'); if(page==='cabinet' && root && root.dataset.ready==='1') renderCabinet(); } })
        .catch(e=>console.warn(e));
      return true;
    }
    try{
      const { data, error } = await withTimeout(sb.rpc('get_my_dashboard'), 8000, 'быстрые данные кабинета');
      if(error) throw error;
      if(!data) return false;
      cacheSet('dashboard_bundle', cacheId, data);
      return applyDashboardBundle(data);
    }catch(e){
      console.warn('dashboard rpc fallback', e);
      trackError('dashboard_rpc_fallback', e, {});
      return false;
    }
  }
  async function loadAdminBundle(){
    if(!sb || !state.user) return false;
    try{
      const { data, error } = await withTimeout(sb.rpc('get_admin_dashboard', { p_rows_limit: 1000, p_events_limit: 200 }), 12000, 'быстрые данные админки');
      if(error) throw error;
      if(!data) return false;
      if(data.settings){ state.settings = {...defaultSettings(), ...data.settings}; cacheSet('settings','global',data.settings); }
      state.lessons = Array.isArray(data.lessons) ? data.lessons : [];
      state.materials = Array.isArray(data.materials) ? data.materials : [];
      state.allProfiles = Array.isArray(data.profiles) ? data.profiles : [];
      state.allProgress = Array.isArray(data.progress) ? data.progress : [];
      state.events = Array.isArray(data.events) ? data.events : [];
      state.errors = Array.isArray(data.errors) ? data.errors : [];
      return true;
    }catch(e){
      console.warn('admin rpc fallback', e);
      trackError('admin_rpc_fallback', e, {});
      return false;
    }
  }
  function pFor(lessonId){ return state.progress.find(p=>p.lesson_id===lessonId); }
  function passScore(lesson){ return Number(lesson?.passing_score || settings().passing_score || 70); }
  function isComplete(lesson){ const p=pFor(lesson.id); return !!(p?.completed || (p?.video_watched && p?.practice_done && Number(p?.quiz_score||0) >= passScore(lesson))); }
  function isUnlocked(index){ if(isTestMode() && state.profile?.role === 'admin') return true; return index===0 || isComplete(state.lessons[index-1]); }
  function courseSummary(){
    const total=state.lessons.length;
    const done=state.lessons.filter(isComplete).length;
    const watched=state.progress.filter(p=>p.video_watched).length;
    const practice=state.progress.filter(p=>p.practice_done).length;
    const scores=state.progress.map(p=>p.quiz_score).filter(v=>v!=null);
    const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
    const percent=total?Math.round(done/total*100):0;
    const next=state.lessons.find((l,i)=>isUnlocked(i)&&!isComplete(l));
    return {total,done,watched,practice,avg,percent,next};
  }


  function lessonPartStatus(lesson){
    const p = pFor(lesson.id) || {};
    const video = !!p.video_watched;
    const practice = !!p.practice_done;
    const test = Number(p.quiz_score || 0) >= passScore(lesson);
    const percent = Math.round(([video, practice, test].filter(Boolean).length / 3) * 100);
    return {video, practice, test, percent, score:p.quiz_score};
  }
  function progressChecklistHtml(lesson){
    const st = lessonPartStatus(lesson);
    return `<div class="smart-progress"><div class="smart-row ${st.video?'done':''}"><b>${st.video?'✅':'○'}</b><span>Видео просмотрено</span></div><div class="smart-row ${st.practice?'done':''}"><b>${st.practice?'✅':'○'}</b><span>Практика выполнена</span></div><div class="smart-row ${st.test?'done':''}"><b>${st.test?'✅':'○'}</b><span>Тест пройден${st.score!=null?' — '+st.score+'%':''}</span></div></div>`;
  }
  function materialIcon(m){
    const t = (m.file_type || '').toLowerCase();
    if(t.includes('pdf')) return '📄';
    if(t.includes('video')) return '🎬';
    if(t.includes('image')) return '🖼️';
    return '📎';
  }
  function materialCardHtml(m){
    const lesson = state.lessons.find(l=>l.id===m.lesson_id);
    const url = safeExternalUrl(m.file_url, '#');
    return `<a class="material-card card" href="${esc(url)}" target="_blank" rel="noopener"><div class="icon">${materialIcon(m)}</div><h3>${esc(m.title || 'Материал')}</h3><p>${esc(m.description || '')}</p>${lesson?`<span>К уроку: ${esc(lesson.title)}</span>`:''}</a>`;
  }
  function searchItems(term=''){
    const q = String(term||'').trim().toLowerCase();
    const lessons = state.lessons.filter(l=>!q || [l.title,l.description,l.content,joinLines(l.steps),joinLines(l.mistakes),l.practice].join(' ').toLowerCase().includes(q));
    const materials = state.materials.filter(m=>!q || [m.title,m.description,m.file_type,state.lessons.find(l=>l.id===m.lesson_id)?.title].join(' ').toLowerCase().includes(q));
    return {lessons, materials};
  }

  function hydrateBrand(){
    const s = settings();
    document.documentElement.style.setProperty('--blue', s.theme_primary || '#42d7ff');
    document.documentElement.style.setProperty('--violet', s.theme_secondary || '#8b5cf6');
    document.documentElement.style.setProperty('--pink', s.theme_accent || '#ff4ecd');
    if(s.site_width){
      const width = Math.min(1800, Math.max(960, Number(s.site_width) || 1360));
      document.documentElement.style.setProperty('--max', `${width}px`);
    }
    document.title = document.title.replace('Школа Госуслуг', s.site_title || 'Школа Госуслуг');
    const metaDesc = document.querySelector('meta[name="description"]'); if(metaDesc) metaDesc.setAttribute('content', s.hero_text || s.site_subtitle || 'Онлайн-обучение работе с государственными услугами');
    const ogTitle = document.querySelector('meta[property="og:title"]'); if(ogTitle) ogTitle.setAttribute('content', s.site_title || 'Школа Госуслуг');
    const ogDesc = document.querySelector('meta[property="og:description"]'); if(ogDesc) ogDesc.setAttribute('content', s.hero_text || s.site_subtitle || 'Онлайн-обучение работе с государственными услугами');
    document.documentElement.style.setProperty('--logo-bg', s.site_logo_bg || 'linear-gradient(135deg,var(--blue),var(--violet))');
    $$('.brand-icon').forEach(el=>{
      const logoUrl = safeExternalUrl(s.site_logo_url, '');
      el.classList.toggle('has-image', !!logoUrl);
      if(logoUrl){
        el.innerHTML = `<img src="${esc(logoUrl)}" alt="${esc(s.site_title || 'Логотип')}" loading="eager">`;
        el.style.background = s.site_logo_bg || 'rgba(255,255,255,.06)';
      }else{
        el.textContent=s.site_logo || '✦';
        el.style.background = '';
      }
    });
    $$('.brand strong').forEach(el=>el.textContent=s.site_title || 'Школа Госуслуг');
    $$('.brand span').forEach(el=>el.textContent=s.site_subtitle || '');
    const badge = $('#heroBadge'); if(badge) badge.textContent = s.hero_badge || '';
    const heading = $('#heroHeading');
    if(heading){
      const title = esc(s.hero_title || 'Обучение работе с');
      const highlight = String(s.hero_highlight || 'госуслугами');
      const cleanHighlight = highlight.toLowerCase().replace(/ё/g,'е').trim();
      const highlighted = cleanHighlight === 'госуслугами'
        ? '<span class="hero-word-gos"><span class="hero-word-blue">гос</span><span class="hero-word-red">услугами</span></span>'
        : `<span>${esc(highlight)}</span>`;
      heading.innerHTML = `${title} ${highlighted}`;
    }
    const heroText = $('#heroText'); if(heroText) heroText.textContent = s.hero_text || '';
    $$('[data-primary-label]').forEach(el=>el.textContent=s.primary_button_text||'Пройти курс');
    $$('[data-secondary-label]').forEach(el=>el.textContent=s.secondary_button_text||'Личный кабинет');
    const foot = $('.footer'); if(foot) foot.textContent = s.footer_text || '';
    $$('.nav a').forEach(link=>{
      const active = (link.getAttribute('href') || '').split('?')[0] === `${page === 'home' ? 'index' : page}.html`;
      link.classList.toggle('active', active);
      if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    const userBox = $('#userBox');
    if(userBox) userBox.innerHTML = !sb ? `<span class="nav-pill">Демо-режим</span>` : state.user ? `<button class="secondary" id="logoutBtn">Выйти</button>` : `<button class="secondary" data-open-auth>Войти</button>`;
    const out = $('#logoutBtn'); if(out) out.onclick = signOut;
    renderMobileSessionBar();
  }

  function renderMobileSessionBar(){
    let bar = $('#mobileSessionBar');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'mobileSessionBar';
      bar.className = 'mobile-session-bar';
      document.body.appendChild(bar);
    }
    if(!sb){
      bar.innerHTML = `<a class="secondary" href="index.html">Главная</a><a class="secondary" href="program.html">Программа</a><a class="primary" href="course.html">Курс</a><a class="secondary" href="cabinet.html">Кабинет</a>`;
    } else if(state.user){
      const destination = state.profile?.role === 'admin' ? 'admin.html' : (hasCourseAccess() ? 'course.html' : 'cabinet.html');
      const label = state.profile?.role === 'admin' ? 'Админка' : (hasCourseAccess() ? 'Курс' : 'Статус');
      bar.innerHTML = `<a class="secondary" href="materials.html">Материалы</a><a class="secondary" href="cabinet.html">Кабинет</a><a class="primary" href="${destination}">${label}</a><button class="danger" id="mobileLogoutBtn">Выйти</button>`;
      const mobileOut = $('#mobileLogoutBtn');
      if(mobileOut) mobileOut.onclick = signOut;
    } else {
      bar.innerHTML = `<a class="secondary" href="index.html">Главная</a><a class="secondary" href="program.html">Программа</a><button class="primary" data-open-auth>Войти</button>`;
    }
  }

  function bindCommon(){
    if(window.__sgCommonBound) return;
    window.__sgCommonBound = true;
    document.addEventListener('click', async (e)=>{
      const exitTest = e.target.closest('[data-exit-test-mode]');
      if(exitTest){ e.preventDefault(); disableTestMode(); return; }
      const openAuth = e.target.closest('[data-open-auth]');
      if(openAuth){ e.preventDefault(); showAuthModal('signin'); return; }
      const startCourse = e.target.closest('[data-start-course]');
      if(startCourse){
        e.preventDefault();
        if(!sb) { location.href='course.html'; return; }
        if(!state.user) return showAuthModal('signup');
        if(!state.profile) await loadProfile();
        if(state.profile?.role === 'admin') location.href = 'admin.html';
        else if(!hasCourseAccess()) location.href = 'cabinet.html';
        else location.href = 'course.html';
        return;
      }
      const modal = $('#authModal');
      if(modal && e.target === modal) modal.remove();
    });
    if(new URLSearchParams(location.search).get('login')) showAuthModal('signin');
  }
  function showAuthModal(mode='signin'){
    let modal = $('#authModal');
    if(!modal){
      document.body.insertAdjacentHTML('beforeend', `<div id="authModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="authTitle"><div class="auth-card glass"><div class="modal-head"><h2 id="authTitle">Вход</h2><button class="secondary" id="closeAuth" type="button" aria-label="Закрыть окно входа">×</button></div><div id="authBody"></div></div></div>`);
      modal = $('#authModal'); $('#closeAuth').onclick=()=>modal.remove();
    }
    renderAuth($('#authBody'), mode);
  }
  function renderAuth(root, mode='signin', message=''){
    if(!root) return;
    const signup = mode==='signup';
    const reset = mode==='reset';
    const newPassword = mode==='new_password';
    const title = $('#authTitle');
    if(title) title.textContent = newPassword ? 'Новый пароль' : reset ? 'Восстановление пароля' : signup ? 'Регистрация ученика' : 'Вход в кабинет';
    if(newPassword){
      root.innerHTML = `${message}${!sb?msg('Сначала подключите Supabase. Сейчас открыт демо-режим.', 'warning'):''}
        <form class="form" id="authForm">
          <label>Новый пароль<input name="password" type="password" required minlength="6" placeholder="Минимум 6 символов" autocomplete="new-password"></label>
          <button class="primary" type="submit" id="authSubmitBtn">Сохранить пароль</button>
        </form>
        <p class="hint"><button class="secondary" id="toggleAuth" type="button">Вернуться ко входу</button></p>`;
      $('#toggleAuth',root).onclick=()=>renderAuth(root, 'signin');
      $('#authForm',root).onsubmit=async(e)=>{
        e.preventDefault();
        if(!sb) return renderAuth(root, 'signin', msg('Подключите Supabase, чтобы сменить пароль.', 'warning'));
        const btn=$('#authSubmitBtn',root); const old=btn.textContent; btn.disabled=true; btn.textContent='Сохраняем...';
        try{
          const password=String(new FormData(e.currentTarget).get('password')||'');
          const {error}=await sb.auth.updateUser({password});
          if(error) return renderAuth(root,'new_password',msg('Не удалось сменить пароль: '+esc(error.message),'error'));
          history.replaceState(null,'',location.pathname);
          renderAuth(root,'signin',msg('Пароль обновлен. Теперь войдите с новым паролем.','notice'));
        } catch(err){
          renderAuth(root,'new_password',msg('Ошибка соединения. Попробуйте еще раз.','error'));
        } finally { const b=$('#authSubmitBtn',root); if(b){b.disabled=false;b.textContent=old;} }
      };
      return;
    }
    if(reset){
      root.innerHTML = `${message}
        <div class="notice warning"><b>Восстановление через письмо отключено.</b><br>Чтобы не ловить ошибку <b>email rate limit exceeded</b>, сайт больше не отправляет письма Supabase. Если ученик забыл пароль, администратор меняет его в Supabase: Authentication → Users → пользователь → Reset password / Update password.</div>
        <p class="hint"><button class="secondary" id="toggleAuth" type="button">Вернуться ко входу</button></p>`;
      $('#toggleAuth',root).onclick=()=>renderAuth(root, 'signin');
      return;
    }
    root.innerHTML = `${message}${!sb?msg('Сначала подключите Supabase. Сейчас открыт демо-режим.', 'warning'):''}
      <form class="form" id="authForm">
        ${signup?`<label>Имя ученика<input name="name" required placeholder="Например: Анна Иванова"></label>`:''}
        <label>Email<input name="email" type="email" required placeholder="you@example.com" autocomplete="email"></label>
        <label>Пароль<input name="password" type="password" required minlength="6" placeholder="Минимум 6 символов" autocomplete="${signup?'new-password':'current-password'}"></label>
        <button class="primary" type="submit" id="authSubmitBtn">${signup?'Создать кабинет':'Войти'}</button>
      </form>
      <p class="hint auth-switch-row">${signup?'Уже есть кабинет?':'Нет кабинета?'} <button class="secondary" id="toggleAuth" type="button">${signup?'Войти':'Зарегистрироваться'}</button>${!signup?` <span class="hint">Забыли пароль? Обратитесь к администратору.</span>`:''}</p>`;
    $('#toggleAuth',root).onclick=()=>renderAuth(root, signup?'signin':'signup');
    $('#authForm',root).onsubmit=async(e)=>{
      e.preventDefault();
      if(!sb){ location.href = signup ? 'course.html' : 'cabinet.html'; return; }
      const form = e.currentTarget;
      const btn = $('#authSubmitBtn', root);
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = signup ? 'Создаем кабинет...' : 'Входим...';
      const fd = new FormData(form);
      const email=String(fd.get('email')).trim();
      const password=String(fd.get('password')||'');
      const name=String(fd.get('name') || '').trim();
      try{
        let res;
        if(signup){
          res = await sb.auth.signUp({email,password,options:{data:{full_name:name}}});
          if(res.error){
            const em = String(res.error.message || '');
            if(em.toLowerCase().includes('email rate limit')) return renderAuth(root, 'signup', msg('Supabase пытается отправить письмо и уперся в лимит. Отключите в Supabase: Authentication → Providers → Email → Confirm email = OFF. После этого регистрация будет работать без писем, а доступ ученикам подтверждает админ.', 'error'));
            return renderAuth(root, 'signup', msg(em,'error'));
          }
          if(!res.data.session){
            return renderAuth(root, 'signin', msg('Кабинет создан, но Supabase не выдал сессию. Обычно это значит, что включено подтверждение email. Отключите Confirm email в Supabase, чтобы ученики регистрировались без писем и ждали подтверждения админа.', 'warning'));
          }
          state.user = res.data.user; await loadProfile();
          if(name) await sb.from('profiles').update({full_name:name}).eq('id',state.user.id);
          location.href = 'cabinet.html';
        } else {
          res = await sb.auth.signInWithPassword({email,password});
          if(res.error) return renderAuth(root, 'signin', msg('Не удалось войти. Проверьте email и пароль. Если пароль забыли — администратор меняет его в Supabase → Authentication → Users.', 'error'));
          state.user = res.data.user; await loadProfile();
          const nextParam = safeNextPath(new URLSearchParams(location.search).get('next'));
          if(state.profile?.role === 'admin' && (!nextParam || nextParam === 'cabinet.html' || nextParam === 'course.html')) location.href = 'admin.html';
          else if(state.profile?.role !== 'admin' && !hasCourseAccess() && (!nextParam || ['course.html','lesson.html','materials.html','complete.html'].some(x=>nextParam.includes(x)))) location.href = 'cabinet.html';
          else location.href = nextParam || (state.profile?.role === 'admin' ? 'admin.html' : (hasCourseAccess() ? 'course.html' : 'cabinet.html'));
        }
      } catch(err){
        renderAuth(root, signup?'signup':'signin', msg('Ошибка соединения. Проверьте интернет, Supabase URL и ключ.', 'error'));
      } finally {
        const stillBtn = $('#authSubmitBtn', root);
        if(stillBtn){ stillBtn.disabled = false; stillBtn.textContent = oldText; }
      }
    };
  }
  async function signOut(){ if(sb) await sb.auth.signOut(); location.href='index.html'; }

  async function initHome(){
    const authPlace = $('#homeAuthBox');
    if(authPlace && !state.user) renderAuth(authPlace,'signup');
    if(authPlace && state.user) authPlace.innerHTML = `<div class="notice">Вы вошли как <b>${esc(state.profile?.full_name || state.user.email)}</b>.<br><span class="hint">Статус: ${esc(approvalText())}</span></div><div class="auth-actions"><a class="primary" href="${state.profile?.role === 'admin' ? 'admin.html' : (hasCourseAccess() ? 'course.html' : 'cabinet.html')}">${state.profile?.role === 'admin' ? 'Открыть панель управления' : (hasCourseAccess() ? 'Продолжить курс' : 'Проверить статус')}</a></div>`;
    await loadLessons(); await loadMaterials();
    const count = $('#lessonsCount'); if(count) count.textContent = String(state.lessons.length || 0);
    renderLessonPreview(); renderHomeSections(); hydrateBrand();
  }
  function renderHomeSections(){
    const s=settings();
    const about=$('#homeAbout');
    if(about) about.innerHTML = `<div class="section-head"><div><h2>${esc(s.about_title)}</h2><p>${esc(s.about_text)}</p></div></div><div class="grid-3">${arr(s.about_cards).map((x,i)=>`<div class="card"><div class="icon">${['🎯','📱','🔓'][i]||'✨'}</div><h3>${esc(x)}</h3><p>Этот пункт можно изменить в админке в разделе «Настройки сайта».</p></div>`).join('')}</div>`;
    const process=$('#homeProcess');
    if(process) process.innerHTML = `<div class="section-head"><div><h2>${esc(s.process_title)}</h2><p>Понятный путь ученика от регистрации до уверенного прохождения курса.</p></div></div><div class="process-grid">${arr(s.process_steps).map((x,i)=>`<div class="process-step"><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>`;
    const support=$('#homeSupport');
    if(support) support.innerHTML = `<div class="glass panel support-panel"><div><h2>${esc(s.support_title)}</h2><p>${esc(s.support_text)}</p></div><a class="primary whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl()}">Написать в WhatsApp</a></div>`;
  }
  function renderLessonPreview(){
    const root = $('#lessonPreview'); if(!root) return;
    root.innerHTML = state.lessons.slice(0,9).map((l,i)=>`<div class="card"><div class="icon">${esc(l.icon)}</div><h3>${i+1}. ${esc(l.title)}</h3><p>${esc(l.description||'')}</p><span>${esc(l.duration||'')}</span></div>`).join('') || `<div class="empty">Уроки появятся после добавления в панели управления.</div>`;
  }
  function renderMaterialsPreview(){
    const root = $('#materialsPreview'); if(!root) return;
    root.innerHTML = (state.materials||[]).slice(0,6).map(materialCardHtml).join('') || `<div class="empty">Материалы появятся после добавления в панели управления.</div>`;
  }
  async function initMaterials(){
    renderFastLoading('#materialsRoot','Загружаем материалы','Открываем библиотеку и поиск.');
    if(!await requireApprovedStudent('#materialsRoot')) return;
    try{ await Promise.all([loadLessons(), loadMaterials()]); renderMaterialsPage(); }
    catch(e){ console.warn(e); const root=$('#materialsRoot'); if(root) root.innerHTML = networkErrorHtml('Материалы не загрузились'); }
  }
  function renderMaterialsPage(){
    const root = $('#materialsRoot'); if(!root) return;
    root.innerHTML = `<div class="page-title"><h1>Библиотека материалов</h1><p>Здесь собраны памятки, PDF, изображения и дополнительные файлы по урокам.</p></div><section class="glass panel"><label>Поиск по материалам и урокам<input id="materialsSearch" placeholder="Например: заявление, безопасность, статус"></label><div id="materialsResults" class="search-results"></div></section>`;
    const render = ()=>{ const {lessons,materials}=searchItems($('#materialsSearch')?.value||''); $('#materialsResults').innerHTML = `<h2>Материалы</h2><div class="grid-3">${materials.map(materialCardHtml).join('') || '<div class="empty">Материалы не найдены</div>'}</div><h2>Уроки по запросу</h2><div class="grid-3">${lessons.map((l,i)=>`<a class="card" href="lesson.html?id=${l.id}"><div class="icon">${esc(l.icon)}</div><h3>${esc(l.title)}</h3><p>${esc(l.description||'')}</p></a>`).join('') || '<div class="empty">Уроки не найдены</div>'}</div>`; };
    $('#materialsSearch').oninput=render; render();
  }


  async function requireStudent(){
    if(!sb) return false;
    if(!state.user){ redirectLogin(); return false; }
    await loadProfile(); return true;
  }
  function renderApprovalPending(targetSelector){
    const root = $(targetSelector) || $('main.container') || document.body;
    const blocked = approvalStatus() === 'blocked';
    const text = blocked
      ? 'Доступ к обучению пока закрыт. Свяжитесь с администратором, чтобы уточнить причину.'
      : 'Ваша заявка на обучение отправлена. Администратор проверит регистрацию и откроет доступ к урокам.';
    root.innerHTML = `<section class="approval-card glass panel"><div class="approval-icon">${blocked?'⛔':'⏳'}</div><h1>${blocked?'Доступ не открыт':'Ожидает подтверждения'}</h1><p>${esc(text)}</p><div class="approval-status-row"><span class="status ${approvalClass()}">${esc(approvalText())}</span><span>${esc(state.profile?.email || state.user?.email || '')}</span></div><div class="auth-actions"><a class="secondary" href="cabinet.html">Открыть кабинет</a><a class="ghost-btn whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl('Здравствуйте! Я зарегистрировался на курс и ожидаю подтверждения доступа.')}">Написать в WhatsApp</a></div></section>`;
    setWhatsAppLinks();
  }
  async function requireApprovedStudent(targetSelector){
    if(!await requireStudent()) return false;
    if(state.profile?.role === 'admin') return true;
    if(!hasCourseAccess()){ renderApprovalPending(targetSelector); return false; }
    return true;
  }
  async function initCourse(){
    const list=$('#courseList'); if(list) list.innerHTML = `<div class="glass panel fast-loading-card"><div class="loader-dot"></div><h2>Открываем курс</h2><p>Загружаем уроки и ваш прогресс.</p><div class="skeleton-lines"><span></span><span></span><span></span></div></div>`;
    if(!await requireStudent()) return;
    const test = isTestMode() && state.profile?.role === 'admin';
    if(state.profile?.role==='admin' && !test){ location.replace('admin.html'); return; }
    if(!test && !hasCourseAccess()){ renderApprovalPending('#courseList'); const side=$('#courseSide'); if(side) side.innerHTML=''; return; }
    try{
      if(test){ await Promise.all([loadLessons(test), loadMaterials(test)]); state.progress = loadTestProgress(); }
      else await Promise.all([loadLessons(test), loadMaterials(test), loadProgress()]);
      trackEvent('course_open',{});
      hydrateCourseHeader(); renderCourse();
    }catch(e){ console.warn(e); if(list) list.innerHTML = networkErrorHtml('Курс не загрузился'); }
  }
  function hydrateCourseHeader(){ const n=$('#studentName'); if(n) n.textContent=state.profile?.full_name || state.user.email; }
  function renderCourse(){
    const root = $('#courseList'); const side = $('#courseSide'); if(!root) return;
    const sum=courseSummary();
    const term = $('#courseSearchInput')?.value || '';
    const {lessons:filteredLessons, materials:filteredMaterials} = searchItems(term);
    const testNotice = isTestMode() ? `<div class="notice warning"><b>Тестовый режим администратора.</b><br>Данные не записываются в статистику учеников.<br><button class="secondary" data-exit-test-mode>Выйти из тестового режима</button></div>` : '';
    if(side) side.innerHTML = `<div class="panel glass sidebar-sticky course-progress-card">${testNotice}<h3>Ваш прогресс</h3><div class="progressbar"><span style="width:${sum.percent}%"></span></div><p class="course-progress-main"><b>${sum.done}</b> из <b>${sum.total}</b> уроков завершено</p><p class="hint course-progress-hint">Видео: ${sum.watched} · Практика: ${sum.practice} · Средний тест: ${sum.avg}%</p>${sum.next?`<p class="hint course-next-lesson">Следующий урок: <b>${esc(sum.next.title)}</b></p><div class="course-side-actions"><a class="primary" href="lesson.html?id=${sum.next.id}">Продолжить</a><a class="secondary" href="cabinet.html">Открыть кабинет</a><a class="secondary" href="materials.html">Материалы</a></div>`:`<div class="notice small course-finish-note">Курс завершен. Все уроки выполнены.</div><div class="course-side-actions"><a class="primary" href="complete.html">Страница завершения</a><a class="secondary" href="cabinet.html">Открыть кабинет</a><a class="secondary" href="materials.html">Материалы</a></div>`}</div>`;
    const parent = root.parentElement;
    let searchBox = $('#courseSearchBox');
    if(parent && !searchBox){ parent.insertAdjacentHTML('afterbegin', `<div class="glass panel course-search" id="courseSearchBox"><label>Поиск по урокам и материалам<input id="courseSearchInput" placeholder="Например: заявление, вход, статус, PDF"></label><div id="courseSearchHint" class="hint"></div></div>`); $('#courseSearchInput').oninput=renderCourse; }
    const sourceList = term ? filteredLessons : state.lessons;
    root.innerHTML = sourceList.map((l,i)=>{
      const originalIndex = state.lessons.findIndex(x=>x.id===l.id);
      const unlocked = isUnlocked(originalIndex); const complete = isComplete(l); const p=pFor(l.id); const st=lessonPartStatus(l);
      const status = complete ? `<span class="status done">✅ Завершен</span>` : unlocked ? `<span class="status open">Открыт</span>` : `<span class="status lock">🔒 Закрыт</span>`;
      const href = unlocked ? `lesson.html?id=${l.id}` : '#';
      return `<a class="lesson-card ${unlocked?'':'locked'}" href="${href}" ${unlocked?'':'onclick="return false"'}><div class="lesson-num">${esc(l.icon)}</div><div><h3>${originalIndex+1}. ${esc(l.title)}</h3><p>${esc(l.description||'')}</p><span>${esc(l.duration||'')}</span><div class="mini-progress-line"><span class="${st.video?'on':''}">Видео</span><span class="${st.practice?'on':''}">Практика</span><span class="${st.test?'on':''}">Тест${p?.quiz_score!=null?' '+p.quiz_score+'%':''}</span></div></div>${status}</a>`;
    }).join('') || `<div class="empty">${term?'По запросу уроки не найдены.':'Пока нет опубликованных уроков.'}</div>`;
    const hint=$('#courseSearchHint');
    if(hint) hint.innerHTML = term ? `Найдено уроков: <b>${filteredLessons.length}</b>, материалов: <b>${filteredMaterials.length}</b>.` + (filteredMaterials.length?`<div class="material-inline-list">${filteredMaterials.slice(0,3).map(m=>`<a href="${esc(safeExternalUrl(m.file_url,'#'))}" target="_blank" rel="noopener">${materialIcon(m)} ${esc(m.title)}</a>`).join('')}</div>`:'') : 'Введите слово, чтобы найти урок или материал.';
  }

  async function initLesson(){
    renderFastLoading('#lessonRoot','Открываем урок','Загружаем видео, текст, тест и прогресс.');
    if(!await requireStudent()) return;
    const test = isTestMode() && state.profile?.role === 'admin';
    if(state.profile?.role==='admin' && !test){ location.replace('admin.html'); return; }
    if(!test && !hasCourseAccess()){ renderApprovalPending('#lessonRoot'); return; }
    try{
      if(test){ await loadLessons(test); state.progress = loadTestProgress(); }
      else await Promise.all([loadLessons(test), loadProgress()]);
      const id=getQuery('id'); const idx=state.lessons.findIndex(l=>l.id===id); const lesson=state.lessons[idx];
      if(!lesson) return $('#lessonRoot').innerHTML = msg('Урок не найден или пока скрыт.', 'error');
      if(!isUnlocked(idx)) return $('#lessonRoot').innerHTML = msg('Этот урок пока закрыт. Сначала завершите предыдущий урок.', 'warning') + `<p><a class="secondary" href="course.html">Вернуться к курсу</a></p>`;
      const questions = await loadQuestions(id); trackEvent('lesson_open',{lesson_id:id,title:lesson.title}); renderLesson(lesson, idx, questions);
    }catch(e){ console.warn(e); const root=$('#lessonRoot'); if(root) root.innerHTML = networkErrorHtml('Урок не загрузился'); }
  }
  function renderVideo(lesson){
    const parts = normalizeVideoParts(lesson.video_parts);
    if(parts.length){
      const directCount = parts.filter(p => !(p.type === 'youtube') && !(p.type === 'external' && !directVideoUrl(p.url))).length;
      const note = directCount > 1 ? 'После окончания одной части следующая запускается автоматически. Для ученика это выглядит как один урок.' : (parts.length > 1 ? 'Все части собраны на одной странице урока.' : 'Видео открывается прямо внутри урока.');
      return `<div class="lesson-video-parts" data-video-playlist data-lesson-id="${esc(lesson.id || '')}"><div class="section-head video-parts-head"><div><h2>Видео урока</h2><p>${parts.length > 1 ? 'В этом уроке добавлено несколько видео. Все они открываются прямо внутри этой страницы.' : 'Видео открывается прямо внутри урока.'}</p></div><span class="status open">${parts.length} ${parts.length===1?'часть':'частей'}</span></div><div class="video-total-progress"><div><b>Общий просмотр</b><span data-video-total-text>0% просмотрено</span></div><div class="progressbar"><span data-video-total-bar style="width:0%"></span></div><p class="hint" data-video-total-note>${note}</p></div>${parts.map((p,i)=>videoPlayerHtml(p,i,parts.length)).join('')}</div>`;
    }
    const normalized = normalizeLessonVideo(lesson.video_url, lesson.video_type);
    if(!normalized.url || normalized.type==='none') return `<div class="video-box"><div class="empty">Видео пока не добавлено. Можно изучить текст и отметить урок просмотренным.</div></div>`;
    if(normalized.type==='youtube') return `<div class="video-box"><iframe title="Видео урока" src="${esc(normalized.url)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="video-note">Видео открывается прямо внутри сайта.</p>`;
    if(normalized.type==='external' && !directVideoUrl(normalized.url)) return `<div class="video-box"><div class="empty">Внешняя ссылка на видео</div></div><p><a class="secondary" href="${esc(normalized.url)}" target="_blank" rel="noopener">Открыть видео</a></p>`;
    return `<div class="video-box"><video src="${esc(normalized.url)}" controls playsinline preload="metadata"></video></div>`;
  }
  function lessonContentHtml(lesson){
    return `<div class="lesson-content"><h2>Конспект урока</h2><p>${esc(lesson.content||'Материал урока скоро появится.').replace(/\n/g,'<br>')}</p></div>
      <h2>Пошаговая инструкция</h2><ol class="check-list">${arr(lesson.steps).map(s=>`<li>${esc(s)}</li>`).join('') || '<li>Посмотрите видео и выполните задание.</li>'}</ol>
      <h2>Частые ошибки</h2><ul class="check-list">${arr(lesson.mistakes).map(s=>`<li>${esc(s)}</li>`).join('') || '<li>Не торопитесь и проверяйте каждый шаг.</li>'}</ul>
      <h2>Практика</h2><div class="notice">${esc(lesson.practice || 'Закрепите материал на учебном примере.')}</div>`;
  }
  function renderLesson(lesson, idx, questions){
    const p=pFor(lesson.id) || {}; const watched=!!p.video_watched; const practiceDone=!!p.practice_done; const root=$('#lessonRoot'); if(!root) return;
    const st=lessonPartStatus(lesson);
    const testNotice = isTestMode() ? `<div class="notice warning"><b>Тестовый режим:</b> прогресс не сохраняется ученикам. <button class="secondary" data-exit-test-mode>Выйти</button></div>` : '';
    root.innerHTML = `${testNotice}<div class="page-title"><a class="secondary" href="course.html">← К списку уроков</a><h1>${esc(lesson.icon)} ${idx+1}. ${esc(lesson.title)}</h1><p>${esc(lesson.description||'')}</p></div>
      <div class="lesson-shell"><div class="glass panel">${renderVideo(lesson)}
      <div class="lesson-actions"><button id="watchedBtn" class="${watched?'success':'primary'}" type="button">${watched?'✅ Видео отмечено':'Я посмотрел видео'}</button><button id="practiceBtn" class="${practiceDone?'success':'secondary'}" type="button">${practiceDone?'✅ Практика выполнена':'Я выполнил практику'}</button><a class="ghost-btn whatsapp-link" href="${whatsappUrl('Здравствуйте! У меня вопрос по уроку: '+lesson.title)}" target="_blank" rel="noopener">Задать вопрос по уроку</a></div>
      ${lessonContentHtml(lesson)}<h2>Ваш прогресс по уроку</h2>${progressChecklistHtml(lesson)}<h2>Тест после урока</h2><div id="quizBox"></div></div>
      <aside class="glass panel sidebar-sticky"><h3>Условие открытия следующего урока</h3><p>1. Отметить просмотр видео.</p><p>2. Выполнить практику.</p><p>3. Пройти тест минимум на <b>${passScore(lesson)}%</b>.</p><div class="progressbar"><span style="width:${st.percent}%"></span></div>${progressChecklistHtml(lesson)}<p>${isComplete(lesson)?'Урок завершен ✅':'Урок еще не завершен'}</p></aside></div>`;
    $('#watchedBtn').onclick=async()=>{ await saveProgress(lesson.id,{video_watched:true}); trackEvent('video_watched',{lesson_id:lesson.id,title:lesson.title}); location.reload(); };
    $('#practiceBtn').onclick=async()=>{ await saveProgress(lesson.id,{practice_done:true}); trackEvent('practice_done',{lesson_id:lesson.id,title:lesson.title}); location.reload(); };
    renderQuiz(lesson, questions);
    setupVideoPartsPlayback(lesson);
  }
  function renderQuiz(lesson, questions){
    const root=$('#quizBox'); if(!root) return;
    if(!questions.length){ root.innerHTML = msg('Вопросы теста пока не добавлены. Отметьте видео и практику, затем завершите урок.', 'warning') + `<button class="primary" id="completeNoQuiz">Завершить урок</button>`; $('#completeNoQuiz').onclick=async()=>{ const saved=await saveProgress(lesson.id, sb && !(isTestMode() && state.profile?.role==='admin') ? {video_watched:true,practice_done:true,answers:[]} : {video_watched:true,practice_done:true,quiz_score:100}); if(!saved) return; trackEvent('lesson_complete_no_quiz',{lesson_id:lesson.id,title:lesson.title}); location.href='course.html'; }; return; }
    root.innerHTML = `<form id="quizForm">${questions.map((q,qi)=>`<div class="quiz-item"><h3>${qi+1}. ${esc(q.question)}</h3><div class="quiz-answers">${arr(q.answers).map((a,ai)=>`<label><input type="radio" required name="q${qi}" value="${ai}">${esc(a)}</label>`).join('')}</div></div>`).join('')}<button class="primary" type="submit">Проверить тест</button></form><div id="quizResult"></div>`;
    $('#quizForm').onsubmit=async(e)=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const answers=questions.map((q,qi)=>Number(fd.get('q'+qi)));
      let score=0; let complete=false;
      if(sb && !(isTestMode() && state.profile?.role==='admin')){
        const saved=await saveProgress(lesson.id,{video_watched:true,answers});
        if(!saved){ $('#quizResult').innerHTML=msg('Не удалось проверить тест. Повторите попытку.','error'); return; }
        score=Number(saved.quiz_score||0); complete=!!saved.completed;
      }else{
        let ok=0; questions.forEach((q,qi)=>{ if(answers[qi]===Number(q.correct_index)) ok++; });
        score=Math.round(ok/questions.length*100);
        const saved=await saveProgress(lesson.id,{video_watched:true,quiz_score:score});
        complete=!!saved?.completed;
      }
      trackEvent('quiz_submit',{lesson_id:lesson.id,title:lesson.title,score,complete});
      $('#quizResult').innerHTML = complete ? msg(`Отлично! Результат ${score}%. Следующий урок открыт.`) + `<p><a class="primary" href="course.html">К списку уроков</a></p>` : msg(score>=passScore(lesson) ? `Результат ${score}%. Осталось отметить практику, чтобы завершить урок.` : `Результат ${score}%. Нужно минимум ${passScore(lesson)}%. Попробуйте еще раз.`, score>=passScore(lesson)?'warning':'error');
    };
  }
  async function saveProgress(lessonId, fields){
    const lesson = state.lessons.find(l=>l.id===lessonId) || {};
    const current = pFor(lessonId) || {};
    const clientFields = {...fields};
    delete clientFields.answers;
    const merged = {...current, ...clientFields};
    const computedComplete = !!(merged.video_watched && merged.practice_done && Number(merged.quiz_score || 0) >= passScore(lesson));
    const completed = !!(merged.completed || current.completed || computedComplete);
    const payload = {user_id:state.user.id, lesson_id:lessonId, ...clientFields, completed, completed_at:completed?(merged.completed_at || current.completed_at || new Date().toISOString()):null, updated_at:new Date().toISOString()};
    if(isTestMode() && state.profile?.role === 'admin'){
      const i = state.progress.findIndex(p=>p.lesson_id===lessonId && p.user_id===state.user.id);
      if(i>=0) state.progress[i] = {...state.progress[i], ...payload};
      else state.progress.push(payload);
      saveTestProgress();
      return state.progress.find(p=>p.lesson_id===lessonId && p.user_id===state.user.id) || payload;
    }
    if(!sb){
      const i = state.progress.findIndex(p=>p.lesson_id===lessonId && p.user_id===state.user.id);
      if(i>=0) state.progress[i] = {...state.progress[i], ...payload};
      else state.progress.push(payload);
      return state.progress.find(p=>p.lesson_id===lessonId && p.user_id===state.user.id) || payload;
    }
    const {data,error}=await withTimeout(sb.rpc('save_lesson_progress',{
      p_lesson_id:lessonId,
      p_video_watched:fields.video_watched ?? null,
      p_practice_done:fields.practice_done ?? null,
      p_answers:Array.isArray(fields.answers) ? fields.answers : null
    }),9000,'сохранение прогресса');
    if(error){ alert('Не удалось сохранить прогресс: '+error.message); return null; }
    cacheRemove('progress', state.user.id);
    if(data){
      const i=state.progress.findIndex(p=>p.lesson_id===lessonId && p.user_id===state.user.id);
      if(i>=0) state.progress[i]=data; else state.progress.push(data);
    }
    return data || null;
  }

  async function initCabinet(){
    renderFastLoading('#cabinetRoot','Открываем личный кабинет','Загружаем только нужные данные: профиль, уроки и ваш прогресс.');
    if(!await requireStudent()) return;
    if(state.profile?.role === 'admin'){ location.replace('admin.html'); return; }
    if(!hasCourseAccess()){ trackEvent('cabinet_pending',{}); renderPendingCabinet(); return; }
    try{
      const usedBundle = await loadDashboardBundle();
      if(!usedBundle) await Promise.all([loadLessons(), loadProgress()]);
      trackEvent('cabinet_open',{fast_bundle:usedBundle});
      const root=$('#cabinetRoot'); if(root) root.dataset.ready='1';
      renderCabinet();
    }catch(e){
      console.warn(e);
      trackError('cabinet_load_failed', e, {});
      const root=$('#cabinetRoot'); if(root) root.innerHTML = networkErrorHtml('Кабинет не загрузился');
    }
  }
  function renderPendingCabinet(){
    const root=$('#cabinetRoot'); if(!root) return;
    const blocked = approvalStatus() === 'blocked';
    root.innerHTML = `<div class="page-title"><h1>Личный кабинет</h1><p>Здравствуйте, ${esc(state.profile?.full_name || state.user.email)}.</p></div><section class="approval-card glass panel"><div class="approval-icon">${blocked?'⛔':'⏳'}</div><h2>${blocked?'Доступ к курсу пока закрыт':'Заявка ожидает подтверждения'}</h2><p>${blocked?'Администратор пока не открыл вам доступ к урокам. Напишите в WhatsApp, если считаете, что это ошибка.':'Вы успешно зарегистрировались. Уроки откроются после подтверждения администратором.'}</p><div class="approval-status-row"><span class="status ${approvalClass()}">${esc(approvalText())}</span><span>${esc(state.profile?.email || '')}</span></div><div class="notice small">После подтверждения в этом кабинете появятся уроки, прогресс, материалы и кнопка продолжения курса.</div><div class="auth-actions"><a class="ghost-btn whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl('Здравствуйте! Я зарегистрировался на курс и ожидаю подтверждения доступа.')}">Написать в WhatsApp</a><button class="secondary" onclick="location.reload()">Обновить статус</button></div></section>`;
    setWhatsAppLinks();
  }
  function renderCabinet(){
    const root=$('#cabinetRoot'); if(!root) return;
    const sum=courseSummary();
    const notices = sum.next ? [`Следующий урок: ${sum.next.title}`, sum.done===0?'Начните с первого урока и пройдите тест.':'Продолжайте обучение с доступного урока.'] : ['Все уроки завершены. Курс пройден полностью.'];
    root.innerHTML = `<div class="page-title"><h1>Личный кабинет</h1><p>Здравствуйте, ${esc(state.profile?.full_name || state.user.email)}. Здесь видно, что уже выполнено и что делать дальше.</p></div>
      <div class="metric-grid"><div class="metric"><b>${sum.percent}%</b><span>общий прогресс</span></div><div class="metric"><b>${sum.done}/${sum.total}</b><span>уроков завершено</span></div><div class="metric"><b>${sum.watched}</b><span>видео просмотрено</span></div><div class="metric"><b>${sum.practice}</b><span>заданий выполнено</span></div><div class="metric"><b>${sum.avg}%</b><span>средний тест</span></div></div>
      <section class="glass panel next-step"><h2>Ваш следующий шаг</h2>${notices.map(n=>`<div class="notice small">${esc(n)}</div>`).join('')}${sum.next?`<a class="primary" href="lesson.html?id=${sum.next.id}">Продолжить обучение</a>`:`<a class="primary" href="complete.html">Посмотреть итог курса</a>`}</section>
      <section class="grid-2"><div class="glass panel"><h2>Уведомления</h2>${renderCabinetNotifications()}</div><div class="glass panel"><h2>Помощь</h2><p>${esc(settings().support_text)}</p><a class="ghost-btn whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl()}">Написать в WhatsApp</a></div></section>
      <section class="glass panel"><h2>Прогресс по урокам</h2><div class="lesson-list">${state.lessons.map((l,i)=>{const p=pFor(l.id)||{};return `<div class="lesson-card smart-lesson-card"><div class="lesson-num">${esc(l.icon)}</div><div><h3>${i+1}. ${esc(l.title)}</h3>${progressChecklistHtml(l)}</div>${isComplete(l)?'<span class="status done">✅ Готово</span>':isUnlocked(i)?'<span class="status open">Доступен</span>':'<span class="status lock">Закрыт</span>'}</div>`}).join('')}</div></section>`;
    setWhatsAppLinks();
  }
  function renderCabinetNotifications(){
    const completed = state.lessons.filter(isComplete).slice(-3);
    if(!completed.length) return `<p class="hint">Здесь будут появляться уведомления об открытых уроках и пройденных тестах.</p>`;
    return completed.map(l=>`<div class="notice">✅ Урок «${esc(l.title)}» завершен.</div>`).join('');
  }

  async function initCertificate(){ location.replace('complete.html'); }
  async function initComplete(){ if(!await requireStudent()) return; if(state.profile?.role === 'admin' && !isTestMode()){ location.replace('admin.html'); return; } if(!isTestMode() && !hasCourseAccess()){ renderApprovalPending('#completeRoot'); return; } await loadLessons(); if(isTestMode()) state.progress = loadTestProgress(); else await loadProgress(); renderComplete(); }
  function renderComplete(){
    const root=$('#completeRoot') || $('#certificateRoot'); if(!root) return; const sum=courseSummary();
    const done = sum.done >= sum.total && sum.total > 0;
    root.innerHTML = `<section class="completion-card glass"><div class="completion-icon">${done?'🎉':'🚀'}</div><h1>${done?'Курс завершен!':'Продолжайте обучение'}</h1><p>${done?'Вы прошли все доступные уроки, выполнили практику и закрепили знания тестами. Теперь можно увереннее пользоваться государственными услугами по инструкции.':'Вы еще не завершили все уроки. Вернитесь к курсу и продолжите с доступного этапа.'}</p><div class="metric-grid"><div class="metric"><b>${sum.percent}%</b><span>прогресс</span></div><div class="metric"><b>${sum.done}/${sum.total}</b><span>уроков</span></div><div class="metric"><b>${sum.avg}%</b><span>средний тест</span></div></div><div class="completion-actions"><a class="primary" href="cabinet.html">Вернуться в кабинет</a><a class="secondary" href="course.html">Повторить / продолжить курс</a><a class="ghost-btn whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl(done?'Здравствуйте! Я завершил курс.':'Здравствуйте! Мне нужна помощь с прохождением курса.')}">Написать в WhatsApp</a></div></section>`; setWhatsAppLinks();
  }
  async function initProgram(){ await loadLessons(); await loadMaterials(); renderLessonPreview(); renderMaterialsPreview(); }

  async function requireAdmin(){
    if(!sb) return false;
    if(!state.user){ $('#adminRoot').innerHTML = `<div class="auth-card glass"><h2>Вход администратора</h2><div id="adminAuth"></div></div>`; renderAuth($('#adminAuth'),'signin'); return false; }
    await loadProfile();
    if(state.profile?.role !== 'admin'){ $('#adminRoot').innerHTML = msg('У вашего аккаунта нет прав администратора.', 'error'); return false; }
    return true;
  }
  async function initAdmin(){
    if(!await requireAdmin()) return;
    renderFastLoading('#adminRoot','Открываем админку','Загружаем статистику и данные платформы одним быстрым пакетом.');
    const usedBundle = await loadAdminBundle();
    if(!usedBundle){
      await loadSettings();
      await loadLessons(true);
      await loadMaterials(true);
      await loadProgressAll();
    }
    renderAdmin();
  }
  async function renderAdmin(){
    const root=$('#adminRoot');
    root.innerHTML = `<div class="page-title"><h1>Панель управления</h1><p>Уроки, файлы, ученики и внешний вид сайта — без редактирования кода.</p></div>
      <div class="admin-layout"><aside class="admin-menu glass"><button class="secondary active" data-tab="overview">📊 Обзор</button><button class="secondary" data-tab="lessons">📚 Уроки</button><button class="secondary" data-tab="files">🎬 Файлы</button><button class="secondary" data-tab="materials">📎 Материалы</button><button class="secondary" data-tab="students">👥 Ученики</button><button class="secondary" data-tab="problems">⚠️ Проблемы</button><button class="secondary" data-tab="activity">🕘 Активность</button><button class="secondary" data-tab="backup">💾 Резерв</button><button class="secondary" data-tab="help">❔ Инструкция</button><button class="secondary" data-tab="settings">🎨 Настройки сайта</button><button class="danger" id="adminLogout">Выйти</button></aside><div>
      <section id="tab-overview" class="admin-tab active glass panel"></section><section id="tab-lessons" class="admin-tab glass panel"></section><section id="tab-files" class="admin-tab glass panel"></section><section id="tab-materials" class="admin-tab glass panel"></section><section id="tab-students" class="admin-tab glass panel"></section><section id="tab-problems" class="admin-tab glass panel"></section><section id="tab-activity" class="admin-tab glass panel"></section><section id="tab-backup" class="admin-tab glass panel"></section><section id="tab-help" class="admin-tab glass panel"></section><section id="tab-settings" class="admin-tab glass panel"></section></div></div>`;
    $$('.admin-menu [data-tab]').forEach(b=>b.onclick=()=>{ $$('.admin-menu [data-tab]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.admin-tab').forEach(t=>t.classList.remove('active')); $('#tab-'+b.dataset.tab).classList.add('active'); });
    $('#adminLogout').onclick=signOut;
    renderAdminOverview(); await renderAdminLessons(); renderAdminFiles(); renderAdminMaterials(); renderAdminStudents(); renderAdminProblems(); renderAdminActivity(); renderAdminBackup(); renderAdminHelp(); renderAdminSettings();
  }
  function renderAdminOverview(){
    const root=$('#tab-overview'); if(!root) return; const students=(state.allProfiles||[]).filter(p=>p.role!=='admin'); const pendingStudents=students.filter(st=>approvalStatus(st)==='pending').length; const completedStudents=students.filter(st=>state.lessons.length && state.lessons.every(l=>state.allProgress.some(p=>p.user_id===st.id && p.lesson_id===l.id && p.completed))).length;
    const active = students.filter(st=>state.allProgress.some(p=>p.user_id===st.id)).length;
    const events = state.events || [];
    const pageViews = events.filter(e=>e.action==='page_view').length;
    const uploads = events.filter(e=>e.action==='file_upload' || e.action==='lesson_video_upload').length;
    const stuck = students.filter(st=>{ const pr=state.allProgress.filter(p=>p.user_id===st.id); return pr.length && !state.lessons.every(l=>pr.some(p=>p.lesson_id===l.id && p.completed)); }).length;
    root.innerHTML = `<div class="section-head"><div><h2>Обзор платформы</h2><p>Краткая статистика по урокам, ученикам и активности.</p></div><div class="admin-actions"><button class="secondary" id="refreshOverview">Обновить</button><button class="primary" id="openTestModeBtn">Открыть курс в тестовом режиме</button></div></div><div class="metric-grid"><div class="metric"><b>${students.length}</b><span>учеников</span></div><div class="metric"><b>${pendingStudents}</b><span>ожидают доступа</span></div><div class="metric"><b>${active}</b><span>начали курс</span></div><div class="metric"><b>${completedStudents}</b><span>завершили</span></div><div class="metric"><b>${state.lessons.length}</b><span>уроков</span></div><div class="metric"><b>${pageViews}</b><span>просмотров страниц</span></div></div><section class="grid-2 admin-overview-grid"><div class="glass-lite"><h3>Где ученики могут застрять</h3><p class="big-number">${stuck}</p><p class="hint">учеников начали курс, но еще не завершили все уроки.</p></div><div class="glass-lite"><h3>Последняя активность</h3><div class="mini-list compact">${events.slice(0,8).map(e=>`<div class="mini-item"><span>${esc(e.action)} · ${esc(e.page||'')}</span><small>${new Date(e.created_at).toLocaleString('ru-RU')}</small></div>`).join('') || '<div class="empty">Активности пока нет</div>'}</div></div></section>`;
    $('#refreshOverview').onclick=async()=>{await loadProgressAll();renderAdminOverview();renderAdminStudents();renderAdminProblems();};
    $('#openTestModeBtn').onclick=()=>{ enableTestMode(); location.href='course.html?test=1'; }; 
  }
  function lessonVideoStatusHtml(lesson){
    const parts = normalizeVideoParts(lesson.video_parts);
    const main = normalizeLessonVideo(lesson.video_url, lesson.video_type);
    if(parts.length){
      return `<div class="lesson-video-admin-status"><span class="status open">🎬 ${parts.length} ${parts.length===1?'видео':'видео'}</span><span class="hint">Все видео будут показаны внутри одного урока. Для MP4 следующая часть может включаться автоматически.</span></div>`;
    }
    if(main.url){
      const label = main.provider === 'youtube' ? 'YouTube' : main.provider === 'rutube' ? 'Rutube' : main.provider === 'vk' ? 'VK Видео' : main.type === 'file' ? 'Файл' : 'Ссылка';
      return `<div class="lesson-video-admin-status"><span class="status done">🎬 ${esc(label)}</span><span class="hint">Основное видео добавлено.</span></div>`;
    }
    return `<div class="lesson-video-admin-status"><span class="status lock">Видео не добавлено</span><span class="hint">Можно вставить одну или несколько ссылок VK/YouTube/Rutube, iframe-код VK или загрузить MP4.</span></div>`;
  }

  async function renderAdminLessons(){
    const root=$('#tab-lessons'); if(!root) return;
    const total = state.lessons.length;
    root.innerHTML = `<div class="section-head"><div><h2>Уроки</h2><p>Список всех уроков. Редактор откроется только после нажатия «Редактировать».</p></div><button class="primary" id="newLessonBtn">+ Новый урок</button></div>
      <div class="admin-lesson-toolbar"><input id="adminLessonSearch" placeholder="Найти урок по названию или описанию"></div>
      <div id="adminLessonsList" class="admin-lesson-list"></div>
      <div id="lessonFormBox" class="lesson-form-placeholder"><div class="empty">Выберите урок и нажмите «Редактировать», чтобы открыть панель изменения урока.</div></div>`;

    const renderList = () => {
      const term = ($('#adminLessonSearch')?.value || '').toLowerCase().trim();
      const lessons = state.lessons.filter(l => !term || [l.title,l.description,l.content].join(' ').toLowerCase().includes(term));
      const list = $('#adminLessonsList'); if(!list) return;
      list.innerHTML = lessons.map(l => `
        <article class="admin-lesson-row ${l.id===selectedLessonId?'active':''}">
          <div class="admin-lesson-main">
            <div class="lesson-title-line">
              <span class="lesson-order">${esc(l.sort_order || '')}</span>
              <h3>${esc(l.icon || '🎓')} ${esc(l.title || 'Без названия')}</h3>
              <span class="status ${l.is_published ? 'done':'lock'}">${lessonStatusLabel(l)}</span>
            </div>
            <p>${esc(l.description || 'Описание пока не добавлено.')}</p>
            ${lessonVideoStatusHtml(l)}
            <div class="lesson-under-actions">
              <button class="secondary" data-edit-lesson="${l.id}">Редактировать</button>
              <button class="danger" data-delete-lesson="${l.id}">Удалить</button>
            </div>
          </div>
        </article>`).join('') || '<div class="empty">Уроки не найдены. Нажмите «+ Новый урок», чтобы добавить первый урок.</div>';

      $$('[data-edit-lesson]', list).forEach(btn => btn.onclick = async () => {
        selectedLessonId = btn.dataset.editLesson;
        renderList();
        const lesson = state.lessons.find(x => x.id === selectedLessonId);
        const questions = lesson ? await loadQuestions(lesson.id) : [];
        renderLessonForm(lesson, questions);
        $('#lessonFormBox')?.scrollIntoView({behavior:'smooth', block:'start'});
      });

      $$('[data-delete-lesson]', list).forEach(btn => btn.onclick = async () => {
        const lesson = state.lessons.find(x => x.id === btn.dataset.deleteLesson);
        if(!lesson) return;
        if(confirmAction(`Удалить урок «${lesson.title}» окончательно? Вместе с ним удалятся вопросы теста и прогресс по этому уроку.`)){
          trackEvent('lesson_delete',{lesson_id:lesson.id,title:lesson.title});
          const { error } = await sb.from('lessons').delete().eq('id', lesson.id);
          if(error){ $('#lessonFormBox').innerHTML = msg('Не удалось удалить урок: '+error.message,'error'); return; }
          if(selectedLessonId === lesson.id) selectedLessonId = null;
          await loadLessons(true);
          $('#lessonFormBox').innerHTML = '<div class="empty">Урок удален. Выберите другой урок или создайте новый.</div>';
          renderList();
          renderAdminOverview();
          renderAdminProblems();
        }
      });
    };

    renderList();
    $('#adminLessonSearch').oninput = renderList;
    $('#newLessonBtn').onclick = () => {
      selectedLessonId = null;
      renderList();
      renderLessonForm(null, []);
      $('#lessonFormBox')?.scrollIntoView({behavior:'smooth', block:'start'});
    };
  }
  function renderLessonForm(lesson, questions){
    const root=$('#lessonFormBox'); if(!root) return;
    const qList = questions.length ? questions : [{question:'',answers:['','',''],correct_index:0}];
    root.innerHTML = `<form class="form lesson-simple-form" id="lessonForm">
      <div class="notice small"><b>Быстрое добавление урока:</b> заполните название, загрузите видео, напишите текст и добавьте тест. Остальное можно не трогать.</div>
      <h3>1. Основное</h3>
      <label>Название урока<input name="title" required value="${esc(lesson?.title || '')}" placeholder="Например: Как записаться к врачу"></label>
      <label>Краткое описание<input name="description" value="${esc(lesson?.description || '')}" placeholder="О чем этот урок в 1 предложении"></label>
      <div class="form-row"><label>Длительность<input name="duration" value="${esc(lesson?.duration || '10 минут')}" placeholder="10 минут"></label><label>Порядок<input name="sort_order" type="number" value="${esc(lesson?.sort_order || state.lessons.length+1)}"></label></div>

      <h3>2. Видео</h3>
      <div class="notice compact-note"><b>Удобный вариант для заказчика:</b> можно вставить одно видео или сразу несколько видео в один урок. Поддерживаются VK Видео, YouTube, Rutube, iframe-код VK и MP4-файлы до 50 МБ.</div>
      <label>Одно основное видео <small>если в уроке нужно только одно видео</small><input name="video_url" id="videoUrlInput" value="${esc(lesson?.video_url || '')}" placeholder="Вставьте ссылку YouTube / Rutube / VK Видео или iframe-код VK"></label>
      <div class="admin-actions compact-actions"><button class="secondary" type="button" id="addMainVideoToList">+ Добавить эту ссылку в список видео</button><button class="secondary" type="button" id="clearMainVideoUrl">Очистить основную ссылку</button></div>
      <label>Несколько видео в одном уроке <small>каждое видео с новой строки. Можно просто ссылку или так: Название | ссылка</small><textarea name="video_parts" id="videoPartsInput" placeholder="Введение | https://vkvideo.ru/video-123456_789012345
Практика | https://youtu.be/xxxx
Итог | https://rutube.ru/video/xxxx/">${esc(videoPartsToText(lesson?.video_parts))}</textarea></label>
      <div class="notice compact-note"><b>Как лучше делать:</b> если видео большое, загрузите его в группу ВК и вставьте ссылку сюда. Тогда заказчик просто добавляет ссылки, а ученики смотрят все видео внутри одного урока.</div>
      <div class="upload-helper simplified-upload"><div><b>Загрузить MP4-файлы до 50 МБ</b><p class="hint">Можно выбрать сразу несколько MP4-файлов. Они автоматически добавятся в список видео этого урока. Большие файлы лучше хранить в VK Видео, YouTube или Rutube.</p></div><div class="upload-row"><input type="file" id="lessonVideoFile" accept="video/mp4,video/webm,video/quicktime" multiple><button class="secondary" type="button" id="uploadLessonVideo">Загрузить выбранные видео</button></div><div id="lessonUploadResult"></div></div>
      <label class="small-select">Тип основного видео<select name="video_type" id="videoTypeSelect"><option value="none">Без основного видео</option><option value="file">Загруженное видео</option><option value="youtube">Встроенное видео YouTube/Rutube/VK</option><option value="external">Прямая ссылка</option></select></label>

      <h3>3. Материал урока</h3>
      <label>Текст урока<textarea name="content" placeholder="Напишите здесь основной материал урока простыми словами">${esc(lesson?.content || '')}</textarea></label>
      <label>Пошаговая инструкция <small>каждый шаг с новой строки</small><textarea name="steps" placeholder="Откройте раздел...&#10;Выберите услугу...&#10;Проверьте данные...">${esc(joinLines(lesson?.steps))}</textarea></label>

      <details class="advanced-options">
        <summary>Дополнительные настройки урока</summary>
        <div class="form-row"><label>Иконка<input name="icon" value="${esc(lesson?.icon || '🎓')}"></label><label>Проходной балл<input name="passing_score" type="number" min="0" max="100" value="${esc(lesson?.passing_score || settings().passing_score || 70)}"></label></div>
        <label>Частые ошибки <small>каждая ошибка с новой строки</small><textarea name="mistakes">${esc(joinLines(lesson?.mistakes))}</textarea></label>
        <label>Практическое задание<textarea name="practice">${esc(lesson?.practice || '')}</textarea></label>
      </details>

      <h3>4. Тест</h3>
      <p class="hint">Можно оставить один вопрос или добавить несколько. Правильный ответ указывается номером: 1, 2, 3...</p>
      <div id="quizEditor" class="quiz-editor">${qList.map((q,i)=>questionEditorHtml(q,i)).join('')}</div>

      <div class="lesson-status-panel"><b>Статус урока:</b> <span class="status ${lesson?.is_published!==false?'done':'lock'}">${lessonStatusLabel(lesson || {is_published:true})}</span><label class="check-label"><input type="checkbox" name="is_published" ${lesson?.is_published!==false?'checked':''}> Показывать ученикам</label></div>
      <div class="admin-actions"><button class="secondary" type="button" id="addQuestionBtn">+ Добавить вопрос</button><button class="secondary" type="button" id="previewLessonBtn">Предпросмотр</button>${lesson?'<button class="secondary" type="button" id="previewAsStudentBtn">Посмотреть как ученик</button><button class="secondary" type="button" id="togglePublishBtn">'+(lesson.is_published?'Скрыть':'Опубликовать')+'</button>':''}<button class="primary" type="submit">Сохранить урок</button>${lesson?'<button class="danger" type="button" id="deleteLessonBtn">Удалить</button>':''}</div>
      <div id="lessonPreviewAdmin"></div><div id="lessonSaveResult"></div></form>`;
    if(lesson) $('select[name="video_type"]',root).value = lesson.video_type || 'none';
    const videoUrlInput = $('#videoUrlInput', root);
    const videoTypeSelect = $('#videoTypeSelect', root) || $('select[name="video_type"]', root);
    if(videoUrlInput && videoTypeSelect){
      videoUrlInput.addEventListener('input', ()=>{
        const detected = normalizeLessonVideo(videoUrlInput.value, videoTypeSelect.value);
        if(detected.type === 'youtube') videoTypeSelect.value = 'youtube';
        else if(detected.type === 'external' && videoTypeSelect.value === 'none') videoTypeSelect.value = 'external';
      });
    }
    const addMainBtn = $('#addMainVideoToList', root);
    const clearMainBtn = $('#clearMainVideoUrl', root);
    const partsInputQuick = $('#videoPartsInput', root);
    if(addMainBtn) addMainBtn.onclick = ()=>{
      const raw = String(videoUrlInput?.value || '').trim();
      if(!raw){ $('#lessonUploadResult', root).innerHTML = msg('Сначала вставьте ссылку на видео.', 'warning'); return; }
      const normalized = normalizeLessonVideo(raw, 'auto');
      if(!normalized.url){ $('#lessonUploadResult', root).innerHTML = msg('Не удалось распознать ссылку. Вставьте ссылку VK Видео, YouTube, Rutube или iframe-код VK.', 'error'); return; }
      const current = String(partsInputQuick?.value || '').trim();
      const count = normalizeVideoParts(current).length + 1;
      const line = `Видео ${String(count).padStart(2,'0')} | ${raw}`;
      if(partsInputQuick) partsInputQuick.value = current ? `${current}
${line}` : line;
      if(videoUrlInput) videoUrlInput.value = '';
      if(videoTypeSelect) videoTypeSelect.value = 'none';
      $('#lessonUploadResult', root).innerHTML = msg('Видео добавлено в список. Теперь нажмите «Сохранить урок».');
    };
    if(clearMainBtn) clearMainBtn.onclick = ()=>{ if(videoUrlInput) videoUrlInput.value=''; if(videoTypeSelect) videoTypeSelect.value='none'; };
    const uploadBtn = $('#uploadLessonVideo', root);
    if(uploadBtn) uploadBtn.onclick = async()=>uploadLessonVideo(root);
    $('#addQuestionBtn').onclick=()=>{ const idx=$$('.question-box').length; $('#quizEditor').insertAdjacentHTML('beforeend', questionEditorHtml({question:'',answers:['','',''],correct_index:0},idx)); };
    $('#previewLessonBtn').onclick=()=>{ const preview=lessonFormPayload(new FormData($('#lessonForm'))); $('#lessonPreviewAdmin').innerHTML=`<div class="preview-box"><h3>Предпросмотр урока</h3><h2>${esc(preview.icon)} ${esc(preview.title||'Без названия')}</h2><p>${esc(preview.description||'')}</p>${lessonContentHtml(preview)}</div>`; };
    const previewAsStudent=$('#previewAsStudentBtn'); if(previewAsStudent) previewAsStudent.onclick=()=>{ enableTestMode(); location.href='lesson.html?id='+lesson.id+'&test=1'; };
    const togglePublish=$('#togglePublishBtn'); if(togglePublish) togglePublish.onclick=async()=>{ const next=!lesson.is_published; await sb.from('lessons').update({is_published:next}).eq('id',lesson.id); trackEvent(next?'lesson_publish':'lesson_hide',{lesson_id:lesson.id,title:lesson.title}); await loadLessons(true); await renderAdminLessons(); renderAdminOverview(); renderAdminProblems(); }; 
    if($('#deleteLessonBtn')) $('#deleteLessonBtn').onclick=async()=>{ if(confirmAction('Удалить урок окончательно? Вместе с ним удалятся вопросы теста и прогресс по этому уроку.')){ trackEvent('lesson_delete',{lesson_id:lesson.id,title:lesson.title}); await sb.from('lessons').delete().eq('id',lesson.id); selectedLessonId=null; await loadLessons(true); await renderAdminLessons(); renderAdminOverview(); } };
    $('#lessonForm').onsubmit=async(e)=>{
      e.preventDefault(); const payload=lessonFormPayload(new FormData(e.currentTarget)); let saved;
      if(lesson){ const {data,error}=await sb.from('lessons').update(payload).eq('id',lesson.id).select().single(); if(error) return $('#lessonSaveResult').innerHTML=msg(error.message,'error'); saved=data; }
      else { const {data,error}=await sb.from('lessons').insert(payload).select().single(); if(error) return $('#lessonSaveResult').innerHTML=msg(error.message,'error'); saved=data; }
      const quiz = collectQuiz(); await sb.from('quiz_questions').delete().eq('lesson_id',saved.id); if(quiz.length) await sb.from('quiz_questions').insert(quiz.map((q,i)=>({...q,lesson_id:saved.id,sort_order:i+1})));
      selectedLessonId=saved.id; await loadLessons(true); trackEvent('lesson_save',{lesson_id:saved.id,title:saved.title}); $('#lessonSaveResult').innerHTML=msg('Урок сохранен. Изменения сразу доступны на сайте.'); await renderAdminLessons(); renderAdminOverview();
    };
  }
  function lessonFormPayload(fd){
    const originalVideoUrl=String(fd.get('video_url')||'').trim();
    const selectedVideoType=fd.get('video_type')||'none';
    const normalizedVideo = normalizeLessonVideo(originalVideoUrl, selectedVideoType);
    const parts = normalizeVideoParts(String(fd.get('video_parts')||''));
    const finalType = normalizedVideo.url ? normalizedVideo.type : (parts.length ? 'file' : 'none');
    return {sort_order:Number(fd.get('sort_order')||1),icon:fd.get('icon')||'🎓',title:fd.get('title'),description:fd.get('description'),duration:fd.get('duration'),video_type:finalType,video_url:normalizedVideo.url,video_parts:parts,content:fd.get('content'),steps:arr(fd.get('steps')),mistakes:arr(fd.get('mistakes')),practice:fd.get('practice'),passing_score:Number(fd.get('passing_score')||settings().passing_score||70),is_published:!!fd.get('is_published')};
  }
  function questionEditorHtml(q,i){ const answers=arr(q.answers); while(answers.length<3) answers.push(''); return `<div class="question-box"><label>Вопрос ${i+1}<input name="question" value="${esc(q.question||'')}"></label><label>Ответы <small>каждый ответ с новой строки</small><textarea name="answers">${esc(answers.join('\n'))}</textarea></label><label>Номер правильного ответа <small>1, 2, 3...</small><input name="correct_index" type="number" min="1" value="${Number(q.correct_index||0)+1}"></label></div>`; }
  function collectQuiz(){ return $$('.question-box').map(box=>{ const question=$('input[name="question"]',box).value.trim(); const answers=arr($('textarea[name="answers"]',box).value); const correct_index=Math.max(0,Number($('input[name="correct_index"]',box).value||1)-1); return {question,answers,correct_index}; }).filter(q=>q.question && q.answers.length>=2); }


  async function uploadLessonVideo(root=document){
    const fileInput = $('#lessonVideoFile', root);
    const result = $('#lessonUploadResult', root);
    const btn = $('#uploadLessonVideo', root);
    const files = Array.from(fileInput?.files || []).sort((a,b)=>{
      const an = naturalVideoNumber(a.name, 999999);
      const bn = naturalVideoNumber(b.name, 999999);
      return (an-bn) || a.name.localeCompare(b.name, 'ru', {numeric:true, sensitivity:'base'});
    });
    if(!result) return;
    if(!sb) { result.innerHTML = msg('Supabase не подключен. Загрузка видео начнет работать после настройки проекта.', 'warning'); return; }
    if(!files.length) { result.innerHTML = msg('Сначала выберите один или несколько видеофайлов.', 'warning'); return; }
    const allowed = ['video/mp4','video/webm','video/quicktime'];
    const max = 50 * 1024 * 1024;
    const tooBig = files.filter(file=>file.size > max);
    if(tooBig.length){
      result.innerHTML = msg(`Файл больше 50 МБ: ${esc(tooBig.map(f=>f.name+' — '+prettyBytes(f.size)).join(', '))}. Запусти VIDEO_CONVERTER.bat из архива, он сожмет и разделит видео на части до 50 МБ.`, 'error');
      return;
    }
    const badType = files.find(file=>file.type && !allowed.includes(file.type));
    if(badType) { result.innerHTML = msg('Лучше загрузить видео в формате MP4, WEBM или MOV.', 'error'); return; }
    const old = btn?.textContent || '';
    if(btn){ btn.disabled = true; btn.textContent = files.length > 1 ? 'Загружаем части...' : 'Загружаем...'; }
    result.innerHTML = msg(`Идет загрузка: ${files.length} файл(ов). Не закрывайте страницу.`, 'warning');
    try{
      const uploaded = [];
      for(let i=0;i<files.length;i++){
        const file = files[i];
        if(btn) btn.textContent = `Загружаем ${i+1}/${files.length}`;
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g,'_');
        const path = `videos/${Date.now()}-${i+1}-${safeName}`;
        const { error } = await sb.storage.from('lesson-files').upload(path, file, { upsert:false, contentType:file.type || 'video/mp4', cacheControl:'3600' });
        if(error){
          result.innerHTML = msg(`Видео не загрузилось: ${esc(error.message)}. Проверьте, что выполнен свежий setup.sql, создан bucket lesson-files и ваш email имеет роль admin.`, 'error');
          return;
        }
        const {data} = sb.storage.from('lesson-files').getPublicUrl(path);
        uploaded.push({title: files.length > 1 ? cleanVideoTitle(file.name, i) : (file.name.replace(/\.[^.]+$/,'') || 'Видео'), type:'file', url:data.publicUrl, order:naturalVideoNumber(file.name, i+1)});
        trackEvent('lesson_video_upload',{name:file.name,size:file.size,path,part:i+1,total:files.length});
      }
      const urlInput = $('#videoUrlInput', root);
      const typeSelect = $('#videoTypeSelect', root) || $('select[name="video_type"]', root);
      const partsInput = $('#videoPartsInput', root);
      if(typeSelect) typeSelect.value = 'file';
      if(uploaded.length === 1 && urlInput && !String(partsInput?.value || '').trim()){
        urlInput.value = uploaded[0].url;
        result.innerHTML = msg('Видео загружено. Ссылка вставлена в урок. Теперь нажмите «Сохранить урок».') + `<input value="${esc(uploaded[0].url)}" onclick="this.select()">`;
      } else {
        const existing = normalizeVideoParts(partsInput?.value || '');
        const all = sortVideoParts(existing.concat(uploaded));
        if(partsInput) partsInput.value = all.map((p,i)=>`${p.title || ('Часть '+String(i+1).padStart(2,'0'))} | ${p.url}`).join('\n');
        result.innerHTML = msg(`Загружено видео: ${uploaded.length}. Они добавлены в поле «Несколько видео». Теперь нажмите «Сохранить урок».`);
      }
    } catch(err){
      console.warn(err);
      result.innerHTML = msg('Не удалось загрузить видео. Проверьте интернет и настройки Supabase Storage.', 'error');
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = old; }
    }
  }


  function storagePathFromUrl(url){
    const value = String(url || '');
    const marker = '/storage/v1/object/public/lesson-files/';
    if(!value.includes(marker)) return '';
    try { return decodeURIComponent(value.split(marker)[1].split('?')[0]); } catch(e){ return value.split(marker)[1].split('?')[0]; }
  }
  function storagePublicUrl(path){
    if(!sb || !path) return '';
    try { return sb.storage.from('lesson-files').getPublicUrl(path).data.publicUrl || ''; } catch(e){ return ''; }
  }
  function lessonsUsingFile(path){
    const publicUrl = storagePublicUrl(path);
    return (state.lessons || []).filter(l => {
      const url = String(l.video_url || '');
      return url && (url === publicUrl || storagePathFromUrl(url) === path);
    });
  }
  function materialsUsingFile(path){
    const publicUrl = storagePublicUrl(path);
    return (state.materials || []).filter(m => {
      const url = String(m.file_url || '');
      return m.file_path === path || storagePathFromUrl(url) === path || (publicUrl && url === publicUrl);
    });
  }
  async function deleteUploadedFile(path){
    if(!sb){ alert('Supabase не подключен.'); return false; }
    path = String(path || '').trim();
    if(!path){ alert('Не найден путь файла.'); return false; }
    const linkedMaterials = materialsUsingFile(path);
    const linkedLessons = lessonsUsingFile(path);
    let confirmText = `Удалить файл из хранилища?\n\n${path}`;
    if(linkedMaterials.length) confirmText += `\n\nТакже будут удалены материалы из библиотеки: ${linkedMaterials.length}.`;
    if(linkedLessons.length) confirmText += `\n\nФайл используется в уроках:\n— ${linkedLessons.map(l=>l.title).join('\n— ')}`;
    if(!confirmAction(confirmText)) return false;

    if(linkedMaterials.length){
      const ids = linkedMaterials.map(m=>m.id).filter(Boolean);
      if(ids.length){
        const matRes = await sb.from('materials').delete().in('id', ids);
        if(matRes.error){ alert('Материалы не удалились: ' + matRes.error.message); return false; }
      }
    }

    if(linkedLessons.length && confirmAction('Очистить ссылку на это видео в уроках, где оно используется?')){
      for(const lesson of linkedLessons){
        const res = await sb.from('lessons').update({video_url:'', video_type:'none'}).eq('id', lesson.id);
        if(res.error){ alert('Не удалось очистить видео в уроке: ' + res.error.message); return false; }
      }
    }

    const {error} = await sb.storage.from('lesson-files').remove([path]);
    if(error){ alert('Файл не удалился: ' + error.message); return false; }
    trackEvent('file_delete', {path, materials: linkedMaterials.length, lessons: linkedLessons.length});
    await loadLessons(true);
    await loadMaterials(true);
    return true;
  }

  function renderAdminFiles(){
    const root=$('#tab-files'); if(!root) return;
    root.innerHTML = `<div class="section-head"><div><h2>Видео и файлы</h2><p>Загрузите MP4, WEBM, PDF или картинку. Ссылку можно вставить в урок.</p></div><button class="secondary" id="listFilesBtn">Показать файлы</button></div><div class="notice"><b>Совет:</b> на бесплатном Supabase видео лучше держать до 50 МБ. Для больших уроков загрузите видео на YouTube как «Доступ по ссылке» и вставьте ссылку в урок.</div><div class="file-upload"><form id="fileForm" class="form"><label>Выберите файл<input type="file" name="file" required accept="video/*,application/pdf,image/*"></label><button class="primary" type="submit" id="fileUploadBtn">Загрузить файл</button></form><div id="fileResult"></div><div id="fileList"></div></div>`;
    $('#fileForm').onsubmit=async(e)=>{
      e.preventDefault();
      const form=e.currentTarget;
      const file=new FormData(form).get('file');
      const result = $('#fileResult');
      const btn = $('#fileUploadBtn');
      if(!file || !file.name){ result.innerHTML=msg('Сначала выберите файл.', 'warning'); return; }
      const max = 500 * 1024 * 1024;
      if(file.size > max){ result.innerHTML=msg('Файл слишком большой. Рекомендуемый максимум — 500 МБ.', 'error'); return; }
      const old=btn.textContent; btn.disabled=true; btn.textContent='Загружаем...'; result.innerHTML=msg(`Загрузка файла ${esc(file.name)} (${prettyBytes(file.size)})...`);
      try{
        const dir = file.type?.startsWith('video/') ? 'videos' : file.type?.startsWith('image/') ? 'images' : 'docs';
        const path=`${dir}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
        const {error}=await sb.storage.from('lesson-files').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
        if(error){ result.innerHTML=msg(`Файл не загрузился: ${esc(error.message)}. Проверьте свежий setup.sql, bucket lesson-files и роль admin.`, 'error'); return; }
        const {data}=sb.storage.from('lesson-files').getPublicUrl(path);
        trackEvent('file_upload',{path,size:file.size,type:file.type});
        result.innerHTML=`${msg('Файл загружен. Скопируйте ссылку ниже.')}<input value="${esc(data.publicUrl)}" onclick="this.select()">`;
        form.reset(); await listFiles();
      } catch(err){ result.innerHTML=msg('Ошибка загрузки. Проверьте интернет и Supabase Storage.', 'error'); }
      finally{ btn.disabled=false; btn.textContent=old; }
    };
    $('#listFilesBtn').onclick=listFiles;
  }
  async function listFiles(){
    const root=$('#fileList'); if(!root) return;
    if(!sb){ root.innerHTML=msg('Supabase не подключен.','warning'); return; }
    root.innerHTML=msg('Загружаем список файлов...');
    const dirs=['videos','images','docs'];
    const files=[];
    for(const dir of dirs){
      const {data,error}=await sb.storage.from('lesson-files').list(dir,{limit:100,sortBy:{column:'created_at',order:'desc'}});
      if(error){ root.innerHTML=msg(error.message,'error'); return; }
      (data||[]).forEach(f=>files.push({...f,path:`${dir}/${f.name}`}));
    }
    if(!files.length){ root.innerHTML='<div class="empty">Файлов пока нет</div>'; return; }
    root.innerHTML = `<div class="notice small"><b>Удаление файлов:</b> если файл привязан к материалу, запись материала тоже удалится. Если видео используется в уроке, сайт предложит очистить ссылку в уроке.</div><div class="mini-list">${files.map(f=>{const url=storagePublicUrl(f.path); const usedLessons=lessonsUsingFile(f.path).length; const usedMaterials=materialsUsingFile(f.path).length; return `<div class="mini-item file-mini"><div><b>${esc(f.path)}</b><small>${prettyBytes(f.metadata?.size||0)}${usedLessons?` · уроков: ${usedLessons}`:''}${usedMaterials?` · материалов: ${usedMaterials}`:''}</small></div><input value="${esc(url)}" onclick="this.select()"><button class="danger small" data-delete-file="${esc(f.path)}">Удалить файл</button></div>`}).join('')}</div>`;
    $$('[data-delete-file]',root).forEach(btn=>btn.onclick=async()=>{
      const path=btn.dataset.deleteFile;
      btn.disabled=true;
      btn.textContent='Удаляем...';
      const ok = await deleteUploadedFile(path);
      if(ok) await listFiles();
      else { btn.disabled=false; btn.textContent='Удалить файл'; }
    });
  }

  function renderAdminMaterials(){
    const root=$('#tab-materials'); if(!root) return;
    const lessonOptions = `<option value="">Без привязки к уроку</option>` + state.lessons.map(l=>`<option value="${l.id}">${l.sort_order}. ${esc(l.title)}</option>`).join('');
    root.innerHTML = `<div class="section-head"><div><h2>Библиотека материалов</h2><p>Добавляйте PDF, памятки, картинки и дополнительные материалы. Они появятся на странице «Материалы» и в поиске.</p></div><button class="secondary" id="refreshMaterialsBtn">Обновить</button></div><div class="grid-2"><form id="materialForm" class="form glass-lite"><h3>Добавить материал</h3><label>Название<input name="title" required placeholder="Например: Памятка перед заполнением заявления"></label><label>Описание<textarea name="description" placeholder="Коротко объясните, что внутри файла"></textarea></label><label>Привязать к уроку<select name="lesson_id">${lessonOptions}</select></label><label>Файл<input type="file" name="file" accept="application/pdf,image/*,video/*" required></label><label class="check-label"><input type="checkbox" name="is_published" checked> Опубликовать материал</label><button class="primary" id="materialSaveBtn">Загрузить и сохранить</button><div id="materialResult"></div></form><div><h3>Опубликованные материалы</h3><div id="materialsAdminList" class="mini-list"></div></div></div>`;
    $('#materialForm').onsubmit=saveMaterial;
    $('#refreshMaterialsBtn').onclick=async()=>{await loadMaterials(true); renderAdminMaterials();};
    renderMaterialsAdminList();
  }
  function renderMaterialsAdminList(){
    const list=$('#materialsAdminList'); if(!list) return;
    list.innerHTML = (state.materials||[]).map(m=>{ const lesson=state.lessons.find(l=>l.id===m.lesson_id); const path=m.file_path || storagePathFromUrl(m.file_url); return `<div class="mini-item file-mini"><div><b>${materialIcon(m)} ${esc(m.title)}</b><small>${lesson?`Урок: ${esc(lesson.title)} · `:''}${m.is_published?'Опубликован':'Скрыт'}${path?` · ${esc(path)}`:''}</small><p class="hint">${esc(m.description||'')}</p></div><div class="admin-actions"><a class="secondary small" href="${esc(safeExternalUrl(m.file_url,'#'))}" target="_blank" rel="noopener">Открыть</a><button class="danger small" data-delete-material="${m.id}">Удалить</button></div></div>`; }).join('') || '<div class="empty">Материалов пока нет</div>';
    $$('[data-delete-material]', list).forEach(btn=>btn.onclick=async()=>{
      const material = (state.materials||[]).find(m=>String(m.id)===String(btn.dataset.deleteMaterial));
      if(!material) return;
      const path = material.file_path || storagePathFromUrl(material.file_url);
      if(path){
        if(!confirmAction(`Удалить материал «${material.title}» и сам файл из хранилища?`)) return;
        btn.disabled=true; btn.textContent='Удаляем...';
        const ok = await deleteUploadedFile(path);
        if(ok){ await loadMaterials(true); renderMaterialsAdminList(); }
        else { btn.disabled=false; btn.textContent='Удалить'; }
      } else {
        if(!confirmAction(`Удалить материал «${material.title}» из библиотеки?`)) return;
        const {error}=await sb.from('materials').delete().eq('id',material.id);
        if(error) return alert(error.message);
        trackEvent('material_delete',{id:material.id,title:material.title});
        await loadMaterials(true); renderMaterialsAdminList();
      }
    });
  }

  async function saveMaterial(e){
    e.preventDefault(); const form=e.currentTarget; const fd=new FormData(form); const file=fd.get('file'); const result=$('#materialResult'); const btn=$('#materialSaveBtn');
    if(!file || !file.name){ result.innerHTML=msg('Выберите файл.','warning'); return; }
    const max = 500 * 1024 * 1024; if(file.size > max){ result.innerHTML=msg('Файл слишком большой. Максимум 500 МБ.','error'); return; }
    const old=btn.textContent; btn.disabled=true; btn.textContent='Загружаем...'; result.innerHTML=msg('Загружаем материал...','warning');
    try{
      const dir = file.type?.startsWith('video/') ? 'videos' : file.type?.startsWith('image/') ? 'images' : 'docs';
      const path=`${dir}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
      const {error}=await sb.storage.from('lesson-files').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
      if(error){ result.innerHTML=msg(`Не удалось загрузить файл: ${esc(error.message)}`,'error'); return; }
      const {data}=sb.storage.from('lesson-files').getPublicUrl(path);
      const payload={title:fd.get('title'),description:fd.get('description'),lesson_id:fd.get('lesson_id')||null,file_url:data.publicUrl,file_path:path,file_type:file.type||'file',is_published:!!fd.get('is_published')};
      const res=await sb.from('materials').insert(payload).select().single();
      if(res.error){ result.innerHTML=msg(res.error.message,'error'); return; }
      trackEvent('material_upload',{title:payload.title,path,size:file.size,type:file.type});
      await loadMaterials(true); form.reset(); renderMaterialsAdminList(); result.innerHTML=msg('Материал добавлен в библиотеку.');
    }catch(err){ result.innerHTML=msg('Ошибка загрузки материала. Проверьте Storage и права admin.','error'); }
    finally{ btn.disabled=false; btn.textContent=old; }
  }
  function renderAdminActivity(){
    const root=$('#tab-activity'); if(!root) return;
    const profilesById=Object.fromEntries((state.allProfiles||[]).map(p=>[p.id,p]));
    const names={page_view:'Просмотр страницы',cabinet_pending:'Ожидает подтверждения',student_approval_update:'Обновлен доступ ученика',course_open:'Открыл курс',lesson_open:'Открыл урок',video_watched:'Отметил видео',practice_done:'Выполнил практику',quiz_submit:'Прошел тест',cabinet_open:'Открыл кабинет',file_upload:'Загрузил файл',material_upload:'Добавил материал',lesson_save:'Сохранил урок',file_delete:'Удалил файл',material_delete:'Удалил материал',js_error:'Ошибка JavaScript',promise_error:'Ошибка загрузки',cabinet_load_failed:'Ошибка кабинета'};
    root.innerHTML = `<div class="section-head"><div><h2>История активности</h2><p>Последние действия учеников и администратора: входы, уроки, видео, практика, тесты и загрузки.</p></div><button class="secondary" id="refreshActivityBtn">Обновить</button></div><div class="activity-feed">${(state.events||[]).slice(0,120).map(e=>{ const pr=profilesById[e.user_id]||{}; const meta=e.metadata||{}; return `<div class="activity-item"><div><b>${esc(names[e.action]||e.action)}</b><p>${esc(pr.full_name||pr.email||'Гость')} ${meta.title?'· '+esc(meta.title):''}${meta.score!=null?' · '+meta.score+'%':''}</p></div><small>${new Date(e.created_at).toLocaleString('ru-RU')}</small></div>`; }).join('') || '<div class="empty">Активности пока нет</div>'}</div>`;
    $('#refreshActivityBtn').onclick=async()=>{await loadProgressAll(); renderAdminActivity(); renderAdminOverview();};
  }

  function studentStats(profile){
    const pr=(state.allProgress||[]).filter(x=>x.user_id===profile.id);
    const completed=pr.filter(x=>x.completed).length;
    const avg=pr.filter(x=>x.quiz_score!=null); const score=avg.length?Math.round(avg.reduce((s,x)=>s+x.quiz_score,0)/avg.length):0;
    const next=state.lessons.find(l=>!pr.some(x=>x.lesson_id===l.id && x.completed));
    return {pr,completed,score,next,last:pr[0]?.updated_at?new Date(pr[0].updated_at).toLocaleString('ru-RU'):'—'};
  }
  function studentRowHtml(p, full=true){
    const st=studentStats(p);
    const status = approvalStatus(p);
    const statusHtml = `<span class="status ${approvalClass(p)}">${esc(approvalText(p))}</span>`;
    const actions = p.role === 'admin' ? '' : `<div class="admin-actions compact-actions">${status!=='approved'?`<button class="success small" data-approve-student="${p.id}">Одобрить</button>`:''}${status!=='blocked'?`<button class="danger small" data-block-student="${p.id}">Закрыть</button>`:''}${status!=='pending'?`<button class="secondary small" data-pending-student="${p.id}">В ожидание</button>`:''}</div>`;
    return `<tr><td>${esc(p.full_name||p.email)}</td><td>${esc(p.email||'')}</td><td>${statusHtml}</td><td>${st.completed}/${state.lessons.length}</td><td>${st.next?esc(st.next.title):'Курс завершен'}</td>${full?`<td>${st.score}%</td><td>${st.last}</td><td>${actions}</td>`:''}</tr>`;
  }
  async function setStudentApproval(id, status){
    const payload={approval_status:status};
    if(status==='approved'){ payload.approved_at=new Date().toISOString(); payload.approved_by=state.user.id; }
    if(status!=='approved'){ payload.approved_at=null; payload.approved_by=null; }
    const {error}=await sb.from('profiles').update(payload).eq('id',id).neq('role','admin');
    if(error){ alert(error.message); return; }
    trackEvent('student_approval_update',{student_id:id,status});
    await loadProgressAll(); renderAdminStudents(); renderAdminOverview(); renderAdminProblems();
  }
  function bindStudentApprovalButtons(root){
    $$('[data-approve-student]',root).forEach(btn=>btn.onclick=()=>setStudentApproval(btn.dataset.approveStudent,'approved'));
    $$('[data-block-student]',root).forEach(btn=>btn.onclick=()=>{ if(confirmAction('Закрыть этому ученику доступ к урокам?')) setStudentApproval(btn.dataset.blockStudent,'blocked'); });
    $$('[data-pending-student]',root).forEach(btn=>btn.onclick=()=>setStudentApproval(btn.dataset.pendingStudent,'pending'));
  }
  function renderAdminStudents(){
    const root=$('#tab-students'); if(!root) return;
    const rows=(state.allProfiles||[]).filter(p=>p.role!=='admin').map(p=>studentRowHtml(p,true)).join('');
    root.innerHTML = `<div class="section-head"><div><h2>Ученики и доступ</h2><p>Новый ученик после регистрации попадает в ожидание. Нажмите «Одобрить», чтобы открыть ему уроки и материалы.</p></div><button class="secondary" id="refreshStudents">Обновить</button></div><table class="table"><thead><tr><th>Ученик</th><th>Email</th><th>Доступ</th><th>Прогресс</th><th>Где находится</th><th>Средний тест</th><th>Последняя активность</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Учеников пока нет</td></tr>'}</tbody></table>`;
    $('#refreshStudents').onclick=async()=>{await loadProgressAll();renderAdminStudents();renderAdminOverview();renderAdminProblems();};
    bindStudentApprovalButtons(root);
  }

  function studentProblemData(){
    const students=(state.allProfiles||[]).filter(p=>p.role!=='admin');
    const now=Date.now();
    const inactiveDays=7;
    const lessonIds=state.lessons.map(l=>l.id);
    return students.map(st=>{
      const pr=state.allProgress.filter(p=>p.user_id===st.id);
      const completed=lessonIds.filter(id=>pr.some(p=>p.lesson_id===id && p.completed)).length;
      const failed=pr.filter(p=>p.quiz_score!=null && !p.completed).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
      const last=pr.map(p=>p.updated_at).filter(Boolean).sort().pop();
      const inactive=last ? (now-new Date(last).getTime())/86400000 > inactiveDays : false;
      const next=state.lessons.find((l,i)=> i===0 || pr.some(p=>p.lesson_id===state.lessons[i-1]?.id && p.completed));
      let type='ok', note='Активность нормальная';
      if(approvalStatus(st)==='pending'){ type='pending'; note='Ожидает подтверждения доступа'; }
      else if(approvalStatus(st)==='blocked'){ type='blocked'; note='Доступ закрыт администратором'; }
      else if(!pr.length){ type='not-started'; note='Еще не начал курс'; }
      else if(failed.length){ type='failed'; note='Не прошел тест: '+(failed[0].lessons?.title || state.lessons.find(l=>l.id===failed[0].lesson_id)?.title || 'урок'); }
      else if(inactive){ type='inactive'; note='Нет активности больше 7 дней'; }
      else if(completed < state.lessons.length){ type='stuck'; note='Остановился на курсе. Следующий шаг: '+(next?.title || 'продолжить'); }
      return {student:st, progress:completed, total:state.lessons.length, last, type, note};
    });
  }
  function renderAdminProblems(){
    const root=$('#tab-problems'); if(!root) return;
    const data=studentProblemData();
    const groups={
      'pending':'Ожидают подтверждения',
      'blocked':'Доступ закрыт',
      'not-started':'Не начали курс',
      'failed':'Не прошли тест',
      'inactive':'Давно не заходили',
      'stuck':'Остановились на уроке'
    };
    const cards=Object.entries(groups).map(([key,title])=>{ const items=data.filter(x=>x.type===key); return `<div class="glass-lite problem-card"><h3>${esc(title)}</h3><p class="big-number">${items.length}</p><div class="mini-list compact">${items.slice(0,8).map(x=>`<div class="mini-item"><span>${esc(x.student.full_name||x.student.email)}<br><small>${esc(x.note)}</small></span><div class="compact-actions">${x.type==='pending'?`<button class="success small" data-approve-student="${x.student.id}">Одобрить</button>`:`<small>${x.progress}/${x.total}</small>`}</div></div>`).join('') || '<div class="empty">Нет учеников</div>'}</div></div>`; }).join('');
    const errors = state.errors || [];
    const errorsCard = `<div class="glass-lite problem-card"><h3>Ошибки сайта</h3><p class="big-number">${errors.length}</p><div class="mini-list compact">${errors.slice(0,8).map(e=>`<div class="mini-item"><span>${esc(e.action || 'ошибка')} · ${esc(e.page || '')}<br><small>${esc(e.message || '')}</small></span><small>${new Date(e.created_at).toLocaleString('ru-RU')}</small></div>`).join('') || '<div class="empty">Ошибок не зафиксировано</div>'}</div></div>`;
    root.innerHTML=`<div class="section-head"><div><h2>Проблемы учеников</h2><p>Здесь видно, кому может понадобиться помощь: кто ждет подтверждения, не начал курс, не прошел тест, давно не заходил, остановился на уроке или столкнулся с ошибкой сайта.</p></div><button class="secondary" id="refreshProblems">Обновить</button></div><div class="grid-2">${errorsCard}${cards}</div>`;
    $('#refreshProblems').onclick=async()=>{ await loadProgressAll(); renderAdminProblems(); renderAdminStudents(); renderAdminOverview(); };
    bindStudentApprovalButtons(root);
  }

  function renderAdminBackup(){
    const root=$('#tab-backup'); if(!root) return;
    root.innerHTML = `<div class="section-head"><div><h2>Резервная копия</h2><p>Скачайте копию уроков, тестов и настроек. Ее можно импортировать обратно, если что-то случайно удалили.</p></div></div><div class="grid-2"><div class="glass-lite"><h3>Экспорт</h3><p>Сохранит уроки, вопросы тестов и настройки сайта в один JSON-файл.</p><button class="primary" id="exportBackupBtn">Скачать резервную копию</button><div id="backupExportResult"></div></div><div class="glass-lite"><h3>Импорт</h3><p>Восстановит данные из JSON-файла. Перед импортом лучше сделать свежий экспорт.</p><form id="importBackupForm" class="form"><label>Файл резервной копии<input type="file" name="backup" accept="application/json" required></label><button class="danger" type="submit">Импортировать</button></form><div id="backupImportResult"></div></div></div>`;
    $('#exportBackupBtn').onclick=exportBackup;
    $('#importBackupForm').onsubmit=importBackup;
  }
  async function exportBackup(){
    const result=$('#backupExportResult'); result.innerHTML=msg('Готовим файл...');
    const lessonsRes=await sb.from('lessons').select('*').order('sort_order',{ascending:true});
    let quizRes=await sb.rpc('get_admin_quiz_questions');
    if(quizRes.error) quizRes=await sb.from('quiz_questions').select('*').order('sort_order',{ascending:true});
    const settingsRes=await sb.from('site_settings').select('*').eq('id',1).single();
    const materialsRes=await sb.from('materials').select('*').order('created_at',{ascending:false});
    const backup={version:3,exported_at:new Date().toISOString(),settings:settingsRes.data||settings(),lessons:lessonsRes.data||[],questions:quizRes.data||[],materials:materialsRes.data||[]};
    downloadFile(`shkola-gosuslug-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(backup,null,2));
    trackEvent('backup_export',{lessons:backup.lessons.length,questions:backup.questions.length});
    result.innerHTML=msg('Резервная копия скачана.');
  }
  async function importBackup(e){
    e.preventDefault();
    const result=$('#backupImportResult');
    const file=new FormData(e.currentTarget).get('backup');
    if(!file || !file.name) return result.innerHTML=msg('Выберите JSON-файл резервной копии.','warning');
    if(!confirmAction('Импорт изменит уроки, тесты и настройки. Продолжить?')) return;
    try{
      const backup=JSON.parse(await file.text());
      if(!backup.lessons || !Array.isArray(backup.lessons)) throw new Error('В файле нет массива lessons');
      result.innerHTML=msg('Импортируем данные...');
      if(backup.settings){ const st={...backup.settings,id:1}; await sb.from('site_settings').upsert(st,{onConflict:'id'}); }
      for(const lesson of backup.lessons){ await sb.from('lessons').upsert(lesson,{onConflict:'id'}); }
      if(Array.isArray(backup.materials)){ for(const m of backup.materials){ await sb.from('materials').upsert(m,{onConflict:'id'}); } }
      if(Array.isArray(backup.questions)){ 
        const lessonIds=[...new Set(backup.questions.map(q=>q.lesson_id).filter(Boolean))];
        for(const id of lessonIds){ await sb.from('quiz_questions').delete().eq('lesson_id',id); }
        if(backup.questions.length) await sb.from('quiz_questions').insert(backup.questions);
      }
      trackEvent('backup_import',{lessons:backup.lessons.length,questions:backup.questions?.length||0});
      await loadSettings(); await loadLessons(true); await loadProgressAll();
      renderAdminOverview(); await renderAdminLessons(); renderAdminStudents(); renderAdminProblems(); renderAdminSettings();
      result.innerHTML=msg('Импорт завершен. Проверьте уроки и настройки.');
    } catch(err){ result.innerHTML=msg('Не удалось импортировать: '+esc(err.message),'error'); }
  }
  function renderAdminHelp(){
    const root=$('#tab-help'); if(!root) return;
    root.innerHTML = `<h2>Как пользоваться админкой</h2><div class="help-steps"><div class="help-step"><b>1</b><h3>Создайте урок</h3><p>Откройте «Уроки», нажмите «+ Новый урок». Обязательны только название, описание, видео/текст и тест.</p></div><div class="help-step"><b>2</b><h3>Загрузите видео</h3><p>В форме урока выберите файл MP4/WEBM/MOV и нажмите «Загрузить видео». Ссылка вставится автоматически.</p></div><div class="help-step"><b>3</b><h3>Добавьте тест</h3><p>Добавьте вопросы, варианты ответа и номер правильного ответа. Проходной балл задается в уроке или настройках.</p></div><div class="help-step"><b>4</b><h3>Проверьте предпросмотр</h3><p>Нажмите «Предпросмотр», чтобы увидеть, как урок будет выглядеть для ученика.</p></div><div class="help-step"><b>5</b><h3>Опубликуйте</h3><p>Включите «Опубликован» и сохраните урок. Он появится в курсе автоматически.</p></div><div class="help-step"><b>6</b><h3>Следите за учениками</h3><p>В разделе «Ученики» видно прогресс, результаты тестов и активность.</p></div></div><div class="notice"><b>Рекомендация:</b> перед большими изменениями открывайте раздел «Резерв» и скачивайте копию уроков.</div>`;
  }
  function isImageFile(file){ return file && /^image\/(png|jpeg|jpg|webp|svg\+xml)$/i.test(file.type || ''); }
  function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
  function extractLogoBackground(file){
    return new Promise((resolve)=>{
      if(!file || file.type === 'image/svg+xml'){ resolve(''); return; }
      const img = new Image();
      img.onload = ()=>{
        try{
          const size = 96;
          const canvas = document.createElement('canvas'); canvas.width=size; canvas.height=size;
          const ctx = canvas.getContext('2d', {willReadFrequently:true});
          ctx.clearRect(0,0,size,size); ctx.drawImage(img,0,0,size,size);
          const data = ctx.getImageData(0,0,size,size).data;
          let r=0,g=0,b=0,count=0;
          const take=(x,y)=>{ const i=(y*size+x)*4; const a=data[i+3]; if(a>20){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; } };
          for(let i=0;i<size;i++){
            take(i,0); take(i,size-1); take(0,i); take(size-1,i);
          }
          if(count<12){
            for(let y=0;y<size;y+=4) for(let x=0;x<size;x+=4) take(x,y);
          }
          URL.revokeObjectURL(img.src);
          resolve(count ? rgbToHex(r/count,g/count,b/count) : '');
        }catch(e){ resolve(''); }
      };
      img.onerror = ()=>resolve('');
      img.src = URL.createObjectURL(file);
    });
  }
  async function uploadSiteLogo(file){
    if(!file) throw new Error('Выберите PNG, JPG, WEBP или SVG логотип.');
    if(!isImageFile(file)) throw new Error('Логотип должен быть PNG, JPG, WEBP или SVG.');
    if(file.size > 3*1024*1024) throw new Error('Логотип слишком большой. Лучше загрузить файл до 3 МБ.');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'') || 'png';
    const path = `site/logo-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('lesson-files').upload(path, file, { upsert:false, contentType:file.type || 'image/png', cacheControl:'3600' });
    if(error) throw error;
    const { data } = sb.storage.from('lesson-files').getPublicUrl(path);
    return data.publicUrl;
  }

  function renderAdminSettings(){
    const root=$('#tab-settings'); if(!root) return; const s=settings();
    root.innerHTML = `<h2>Настройки сайта</h2><p class="hint">Здесь можно менять внешний вид, тексты главной страницы, блоки, кнопки и WhatsApp без кода.</p><form class="form settings-form" id="settingsForm">
      <h3>Бренд и шапка</h3><div class="logo-settings-box"><div class="logo-live-preview"><div class="brand-icon logo-preview ${s.site_logo_url?'has-image':''}" id="logoPreview" style="background:${esc(s.site_logo_bg || '')}">${s.site_logo_url?`<img src="${esc(s.site_logo_url)}" alt="Логотип">`:esc(s.site_logo||'✦')}</div><div><b>Предпросмотр логотипа</b><p class="hint">Загрузите PNG/JPG/WEBP/SVG. Сайт сам возьмет цвет с краев изображения и поставит его фоном, чтобы не было отличий.</p></div></div><label>Загрузить логотип PNG/JPG/WEBP/SVG<input type="file" id="siteLogoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><div class="form-row"><label>Текстовая иконка, если нет картинки<input name="site_logo" value="${esc(s.site_logo)}"></label><label>Фон под логотип <small>автоматически или вручную</small><input name="site_logo_bg" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(s.site_logo_bg||'') ? s.site_logo_bg : '#0b1730')}"></label></div><input type="hidden" name="site_logo_url" value="${esc(s.site_logo_url||'')}"><div class="auth-actions"><button class="secondary" type="button" id="uploadSiteLogoBtn">Загрузить и применить логотип</button><button class="ghost-btn" type="button" id="clearSiteLogoBtn">Убрать картинку</button></div><div id="logoUploadResult"></div></div><label>Название сайта<input name="site_title" value="${esc(s.site_title)}"></label><label>Подзаголовок в шапке<input name="site_subtitle" value="${esc(s.site_subtitle)}"></label>
      <h3>Первый экран</h3><label>Плашка над заголовком<input name="hero_badge" value="${esc(s.hero_badge)}"></label><div class="form-row"><label>Заголовок до выделения<input name="hero_title" value="${esc(s.hero_title)}"></label><label>Выделенное слово<input name="hero_highlight" value="${esc(s.hero_highlight)}"></label></div><label>Текст под заголовком<textarea name="hero_text">${esc(s.hero_text)}</textarea></label><div class="form-row"><label>Текст главной кнопки<input name="primary_button_text" value="${esc(s.primary_button_text)}"></label><label>Текст второй кнопки<input name="secondary_button_text" value="${esc(s.secondary_button_text)}"></label></div>
      <h3>О курсе</h3><label>Заголовок блока<input name="about_title" value="${esc(s.about_title)}"></label><label>Описание курса<textarea name="about_text">${esc(s.about_text)}</textarea></label><label>Карточки “О курсе” <small>каждая с новой строки</small><textarea name="about_cards">${esc(joinLines(s.about_cards))}</textarea></label>
      <h3>Как проходит обучение</h3><label>Заголовок блока<input name="process_title" value="${esc(s.process_title)}"></label><label>Шаги обучения <small>каждый шаг с новой строки</small><textarea name="process_steps">${esc(joinLines(s.process_steps))}</textarea></label>
      <h3>Помощь и WhatsApp</h3><div class="form-row"><label>Заголовок помощи<input name="support_title" value="${esc(s.support_title)}"></label><label>WhatsApp без плюса<input name="whatsapp_phone" value="${esc(s.whatsapp_phone)}"></label></div><label>Текст помощи<textarea name="support_text">${esc(s.support_text)}</textarea></label>
      <h3>Обучение</h3><div class="form-row"><label>Проходной балл<input name="passing_score" type="number" min="0" max="100" value="${esc(s.passing_score)}"></label><label>Ширина сайта на ПК<input name="site_width" type="number" min="1100" max="1600" value="${esc(s.site_width)}"></label></div><h3>Цветовая тема</h3><div class="form-row"><label>Основной цвет<input name="theme_primary" type="color" value="${esc(s.theme_primary)}"></label><label>Второй цвет<input name="theme_secondary" type="color" value="${esc(s.theme_secondary)}"></label></div><label>Акцентный цвет<input name="theme_accent" type="color" value="${esc(s.theme_accent)}"></label>
      <label>Текст внизу сайта <small>можно оставить пустым</small><input name="footer_text" value="${esc(s.footer_text||'')}"></label><button class="primary">Сохранить все настройки</button><div id="settingsResult"></div></form>`;
    const logoFile = $('#siteLogoFile');
    const logoPreview = $('#logoPreview');
    const logoBgInput = $('[name="site_logo_bg"]');
    const logoUrlInput = $('[name="site_logo_url"]');
    if(logoFile) logoFile.onchange=async()=>{
      const file = logoFile.files && logoFile.files[0];
      if(!file) return;
      const bg = await extractLogoBackground(file);
      if(bg && logoBgInput) logoBgInput.value = bg;
      if(logoPreview){
        logoPreview.classList.add('has-image');
        logoPreview.style.background = bg || logoBgInput?.value || '';
        logoPreview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Предпросмотр логотипа">`;
      }
    };
    const uploadLogoBtn = $('#uploadSiteLogoBtn');
    if(uploadLogoBtn) uploadLogoBtn.onclick=async()=>{
      const result=$('#logoUploadResult');
      const file = logoFile?.files?.[0];
      try{
        uploadLogoBtn.disabled=true; uploadLogoBtn.textContent='Загружаю...';
        const url = await uploadSiteLogo(file);
        const autoBg = await extractLogoBackground(file);
        if(autoBg && logoBgInput) logoBgInput.value = autoBg;
        if(logoUrlInput) logoUrlInput.value = url;
        if(result) result.innerHTML = msg('Логотип загружен. Теперь нажмите «Сохранить все настройки».');
      }catch(error){ if(result) result.innerHTML = msg(`Логотип не загрузился: ${esc(error.message || error)}`, 'error'); }
      finally{ uploadLogoBtn.disabled=false; uploadLogoBtn.textContent='Загрузить и применить логотип'; }
    };
    const clearLogoBtn = $('#clearSiteLogoBtn');
    if(clearLogoBtn) clearLogoBtn.onclick=()=>{
      if(logoUrlInput) logoUrlInput.value='';
      if(logoFile) logoFile.value='';
      if(logoPreview){ logoPreview.classList.remove('has-image'); logoPreview.style.background=''; logoPreview.textContent=$('[name="site_logo"]')?.value || '✦'; }
      const result=$('#logoUploadResult'); if(result) result.innerHTML=msg('Картинка убрана. Нажмите «Сохранить все настройки».');
    };
    $('#settingsForm').onsubmit=async(e)=>{ e.preventDefault(); const fd=new FormData(e.currentTarget); const payload={site_logo:fd.get('site_logo'),site_logo_url:fd.get('site_logo_url'),site_logo_bg:fd.get('site_logo_bg'),site_title:fd.get('site_title'),site_subtitle:fd.get('site_subtitle'),hero_badge:fd.get('hero_badge'),hero_title:fd.get('hero_title'),hero_highlight:fd.get('hero_highlight'),hero_text:fd.get('hero_text'),primary_button_text:fd.get('primary_button_text'),secondary_button_text:fd.get('secondary_button_text'),about_title:fd.get('about_title'),about_text:fd.get('about_text'),about_cards:arr(fd.get('about_cards')),process_title:fd.get('process_title'),process_steps:arr(fd.get('process_steps')),support_title:fd.get('support_title'),support_text:fd.get('support_text'),whatsapp_phone:fd.get('whatsapp_phone'),passing_score:Number(fd.get('passing_score')||70),theme_primary:fd.get('theme_primary'),theme_secondary:fd.get('theme_secondary'),theme_accent:fd.get('theme_accent'),site_width:Number(fd.get('site_width')||1360),footer_text:fd.get('footer_text')}; const {error}=await sb.from('site_settings').update(payload).eq('id',1); $('#settingsResult').innerHTML=error?msg(error.message,'error'):msg('Настройки сохранены. Обновите главную страницу, чтобы увидеть изменения.'); await loadSettings(); hydrateBrand(); setWhatsAppLinks(); };
  }

  function renderBootError(err){
    const map = {admin:'#adminRoot',cabinet:'#cabinetRoot',course:'#courseList',lesson:'#lessonRoot',materials:'#materialsRoot',complete:'#completeRoot'};
    const root = $(map[page] || 'main.container');
    if(root) root.innerHTML = networkErrorHtml('Сайт не загрузился');
  }
  function setupAccessibility(){
    const main=$('main');
    if(main && !main.id) main.id='mainContent';
    if(main && !$('.skip-link')) document.body.insertAdjacentHTML('afterbegin','<a class="skip-link" href="#'+main.id+'">Перейти к содержанию</a>');
    document.addEventListener('keydown',(event)=>{
      if(event.key==='Escape') $('#authModal')?.remove();
    });
  }
  function boot(){
    setupAccessibility();
    init().catch((err)=>{
      console.error(err);
      trackError('boot_failed', err, {page});
      renderBootError(err);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
