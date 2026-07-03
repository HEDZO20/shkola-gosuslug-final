(function(){
  const CFG = window.SUPABASE_CONFIG || {};
  const isConfigured = CFG.url && CFG.anonKey && !CFG.url.includes('PASTE_') && !CFG.anonKey.includes('PASTE_');
  const sb = isConfigured && window.supabase ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const page = document.body?.dataset?.page || 'home';
  const state = { user:null, profile:null, settings:null, lessons:[], progress:[], allProgress:[], allProfiles:[] };
  let selectedLessonId = null;

  function msg(text, type='notice') { return `<div class="notice ${type}">${text}</div>`; }
  function esc(s=''){return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function arr(v){ if(Array.isArray(v)) return v.filter(Boolean); if(typeof v==='string') return v.split('\n').map(x=>x.trim()).filter(Boolean); return []; }
  function joinLines(v){ return arr(v).join('\n'); }
  function getQuery(name){ return new URLSearchParams(location.search).get(name); }
  function cleanPhone(p=''){ return String(p).replace(/\D/g,''); }
  function todayRu(){ return new Date().toLocaleDateString('ru-RU'); }
  function shortId(id=''){ return String(id).replace(/-/g,'').slice(0,10).toUpperCase(); }

  function defaultSettings(){
    return {
      id:1,
      site_title:'Школа Госуслуг',
      site_subtitle:'Научитесь пользоваться государственными услугами быстро и уверенно',
      site_logo:'✦',
      hero_badge:'🚀 Полноценная учебная платформа',
      hero_title:'Обучение работе с',
      hero_highlight:'госуслугами',
      hero_text:'Простые видеоуроки, понятные инструкции, практические задания и тесты. Уроки открываются поэтапно после просмотра видео и успешного теста.',
      primary_button_text:'Пройти курс',
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
      certificate_title:'Сертификат участника',
      certificate_text:'подтверждает успешное прохождение курса',
      certificate_footer:'Школа Госуслуг',
      theme_primary:'#42d7ff',
      theme_secondary:'#8b5cf6',
      theme_accent:'#ff4ecd',
      site_width:1360,
      footer_text:''
    };
  }
  function settings(){ return {...defaultSettings(), ...(state.settings || {})}; }
  function whatsappUrl(text='Здравствуйте! У меня вопрос по обучению.'){ const phone = cleanPhone(settings().whatsapp_phone); return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`; }
  function setWhatsAppLinks(){ $$('.whatsapp-link,.float-whatsapp').forEach(a=>{ a.href=whatsappUrl(); }); }
  function redirectLogin(){ location.href = `index.html?login=1&next=${encodeURIComponent(location.pathname.split('/').pop()+location.search)}`; }

  async function init(){
    renderConfigWarning();
    if(!sb){ state.settings = defaultSettings(); hydrateBrand(); setWhatsAppLinks(); bindCommon(); renderStaticFallback(); return; }
    const { data } = await sb.auth.getSession();
    state.user = data.session?.user || null;
    await loadSettings();
    if(state.user) await loadProfile();
    hydrateBrand(); setWhatsAppLinks(); bindCommon();
    if(page==='home') return initHome();
    if(page==='course') return initCourse();
    if(page==='lesson') return initLesson();
    if(page==='cabinet') return initCabinet();
    if(page==='admin') return initAdmin();
    if(page==='certificate') return initCertificate();
    if(page==='program') return initProgram();
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

  async function loadSettings(){
    const { data, error } = await sb.from('site_settings').select('*').eq('id',1).single();
    state.settings = {...defaultSettings(), ...(data || {})};
    if(error) console.warn(error);
  }
  async function loadProfile(){
    if(!state.user) return null;
    let { data } = await sb.from('profiles').select('*').eq('id',state.user.id).maybeSingle();
    if(!data){
      const payload = {id:state.user.id,email:state.user.email,full_name:state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || 'Ученик', role:'student'};
      await sb.from('profiles').insert(payload);
      data = payload;
    }
    state.profile = data;
    return data;
  }
  async function loadLessons(includeAll=false){
    let q = sb.from('lessons').select('*').order('sort_order',{ascending:true});
    if(!includeAll) q = q.eq('is_published',true);
    const { data, error } = await q;
    if(error){ console.warn(error); return []; }
    state.lessons = data || [];
    return state.lessons;
  }
  async function loadQuestions(lessonId){
    const { data, error } = await sb.from('quiz_questions').select('*').eq('lesson_id',lessonId).order('sort_order',{ascending:true});
    if(error){ console.warn(error); return []; }
    return data || [];
  }
  async function loadProgress(userId=state.user?.id){
    if(!userId) return [];
    const { data, error } = await sb.from('lesson_progress').select('*').eq('user_id',userId);
    if(error){ console.warn(error); return []; }
    state.progress = data || [];
    return state.progress;
  }
  async function loadProgressAll(){
    const {data}=await sb.from('lesson_progress').select('*, profiles:user_id(email,full_name,phone), lessons:lesson_id(title,sort_order)').order('updated_at',{ascending:false});
    state.allProgress=data||[];
    const {data:profiles}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
    state.allProfiles=profiles||[];
  }
  function pFor(lessonId){ return state.progress.find(p=>p.lesson_id===lessonId); }
  function passScore(lesson){ return Number(lesson?.passing_score || settings().passing_score || 70); }
  function isComplete(lesson){ const p=pFor(lesson.id); return !!(p?.completed || (p?.video_watched && Number(p?.quiz_score||0) >= passScore(lesson))); }
  function isUnlocked(index){ return index===0 || isComplete(state.lessons[index-1]); }
  function courseSummary(){
    const total=state.lessons.length;
    const done=state.lessons.filter(isComplete).length;
    const watched=state.progress.filter(p=>p.video_watched).length;
    const scores=state.progress.map(p=>p.quiz_score).filter(v=>v!=null);
    const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
    const percent=total?Math.round(done/total*100):0;
    const next=state.lessons.find((l,i)=>isUnlocked(i)&&!isComplete(l));
    return {total,done,watched,avg,percent,next};
  }

  function hydrateBrand(){
    const s = settings();
    document.documentElement.style.setProperty('--blue', s.theme_primary || '#42d7ff');
    document.documentElement.style.setProperty('--violet', s.theme_secondary || '#8b5cf6');
    document.documentElement.style.setProperty('--pink', s.theme_accent || '#ff4ecd');
    if(s.site_width) document.documentElement.style.setProperty('--max', `${Number(s.site_width)||1360}px`);
    document.title = document.title.replace('Школа Госуслуг', s.site_title || 'Школа Госуслуг');
    $$('.brand-icon').forEach(el=>el.textContent=s.site_logo || '✦');
    $$('.brand strong').forEach(el=>el.textContent=s.site_title || 'Школа Госуслуг');
    $$('.brand span').forEach(el=>el.textContent=s.site_subtitle || '');
    const badge = $('#heroBadge'); if(badge) badge.textContent = s.hero_badge || '';
    const heading = $('#heroHeading'); if(heading) heading.innerHTML = `${esc(s.hero_title || 'Обучение работе с')} <span>${esc(s.hero_highlight || 'госуслугами')}</span>`;
    const heroText = $('#heroText'); if(heroText) heroText.textContent = s.hero_text || '';
    $$('[data-primary-label]').forEach(el=>el.textContent=s.primary_button_text||'Пройти курс');
    $$('[data-secondary-label]').forEach(el=>el.textContent=s.secondary_button_text||'Личный кабинет');
    const foot = $('.footer'); if(foot) foot.textContent = s.footer_text || '';
    const userBox = $('#userBox');
    if(userBox) userBox.innerHTML = state.user ? `<button class="secondary" id="logoutBtn">Выйти</button>` : `<button class="secondary" data-open-auth>Войти</button>`;
    const out = $('#logoutBtn'); if(out) out.onclick = signOut;
  }

  function bindCommon(){
    $$('[data-open-auth]').forEach(btn=>btn.addEventListener('click',()=>showAuthModal()));
    $$('[data-start-course]').forEach(btn=>btn.addEventListener('click',async()=>{ if(!state.user) return showAuthModal('signup'); location.href=state.profile?.role==='admin'?'admin.html':'course.html'; }));
    if(new URLSearchParams(location.search).get('login')) showAuthModal('signin');
  }
  function showAuthModal(mode='signin'){
    let modal = $('#authModal');
    if(!modal){
      document.body.insertAdjacentHTML('beforeend', `<div id="authModal" class="modal"><div class="auth-card glass"><div class="modal-head"><h2 id="authTitle">Вход</h2><button class="secondary" id="closeAuth">×</button></div><div id="authBody"></div></div></div>`);
      modal = $('#authModal'); $('#closeAuth').onclick=()=>modal.remove();
    }
    renderAuth($('#authBody'), mode);
  }
  function renderAuth(root, mode='signin', message=''){
    if(!root) return;
    const signup = mode==='signup';
    $('#authTitle') && ($('#authTitle').textContent = signup ? 'Регистрация ученика' : 'Вход в кабинет');
    root.innerHTML = `${message}${!sb?msg('Сначала подключите Supabase.', 'error'):''}
      <form class="form" id="authForm">
        ${signup?`<label>Имя ученика<input name="name" required placeholder="Например: Анна Иванова"></label>`:''}
        <label>Email<input name="email" type="email" required placeholder="you@example.com"></label>
        <label>Пароль<input name="password" type="password" required minlength="6" placeholder="Минимум 6 символов"></label>
        <button class="primary" type="submit">${signup?'Создать кабинет':'Войти'}</button>
      </form>
      <p class="hint">${signup?'Уже есть кабинет?':'Нет кабинета?'} <button class="secondary" id="toggleAuth" type="button">${signup?'Войти':'Зарегистрироваться'}</button></p>`;
    $('#toggleAuth',root).onclick=()=>renderAuth(root, signup?'signin':'signup');
    $('#authForm',root).onsubmit=async(e)=>{
      e.preventDefault(); if(!sb) return;
      const fd = new FormData(e.currentTarget); const email=String(fd.get('email')).trim(); const password=fd.get('password'); const name=fd.get('name') || '';
      let res;
      if(signup){
        res = await sb.auth.signUp({email,password,options:{data:{full_name:name}}});
        if(res.error) return renderAuth(root, 'signup', msg(res.error.message,'error'));
        if(res.data.user){
          state.user = res.data.user; await loadProfile();
          if(name) await sb.from('profiles').update({full_name:name}).eq('id',state.user.id);
          location.href = new URLSearchParams(location.search).get('next') || 'course.html';
        }
      } else {
        res = await sb.auth.signInWithPassword({email,password});
        if(res.error) return renderAuth(root, 'signin', msg('Не удалось войти. Проверьте email и пароль.','error'));
        state.user = res.data.user; await loadProfile();
        const nextParam = new URLSearchParams(location.search).get('next');
        if(state.profile?.role === 'admin' && (!nextParam || nextParam === 'cabinet.html' || nextParam === 'course.html')) location.href = 'admin.html';
        else location.href = nextParam || (state.profile?.role === 'admin' ? 'admin.html' : 'course.html');
      }
    };
  }
  async function signOut(){ if(sb) await sb.auth.signOut(); location.href='index.html'; }

  async function initHome(){
    const authPlace = $('#homeAuthBox');
    if(authPlace && !state.user) renderAuth(authPlace,'signup');
    if(authPlace && state.user) authPlace.innerHTML = `<div class="notice">Вы вошли как <b>${esc(state.profile?.full_name || state.user.email)}</b>.</div><div class="auth-actions"><a class="primary" href="${state.profile?.role === 'admin' ? 'admin.html' : 'course.html'}">${state.profile?.role === 'admin' ? 'Открыть панель управления' : 'Продолжить курс'}</a></div>`;
    await loadLessons();
    const count = $('#lessonsCount'); if(count) count.textContent = String(state.lessons.length || 0);
    renderLessonPreview(); renderHomeSections(); hydrateBrand();
  }
  function renderHomeSections(){
    const s=settings();
    const about=$('#homeAbout');
    if(about) about.innerHTML = `<div class="section-head"><div><h2>${esc(s.about_title)}</h2><p>${esc(s.about_text)}</p></div></div><div class="grid-3">${arr(s.about_cards).map((x,i)=>`<div class="card"><div class="icon">${['🎯','📱','🔓'][i]||'✨'}</div><h3>${esc(x)}</h3><p>Этот пункт можно изменить в админке в разделе «Настройки сайта».</p></div>`).join('')}</div>`;
    const process=$('#homeProcess');
    if(process) process.innerHTML = `<div class="section-head"><div><h2>${esc(s.process_title)}</h2><p>Понятный путь ученика от регистрации до сертификата.</p></div></div><div class="process-grid">${arr(s.process_steps).map((x,i)=>`<div class="process-step"><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>`;
    const support=$('#homeSupport');
    if(support) support.innerHTML = `<div class="glass panel support-panel"><div><h2>${esc(s.support_title)}</h2><p>${esc(s.support_text)}</p></div><a class="primary whatsapp-link" target="_blank" rel="noopener" href="${whatsappUrl()}">Написать в WhatsApp</a></div>`;
  }
  function renderLessonPreview(){
    const root = $('#lessonPreview'); if(!root) return;
    root.innerHTML = state.lessons.slice(0,9).map((l,i)=>`<div class="card"><div class="icon">${esc(l.icon)}</div><h3>${i+1}. ${esc(l.title)}</h3><p>${esc(l.description||'')}</p><span>${esc(l.duration||'')}</span></div>`).join('') || `<div class="empty">Уроки появятся после добавления в панели управления.</div>`;
  }

  async function requireStudent(){
    if(!sb) return false;
    if(!state.user){ redirectLogin(); return false; }
    await loadProfile(); return true;
  }
  async function initCourse(){ if(!await requireStudent()) return; if(state.profile?.role==='admin'){ location.replace('admin.html'); return; } await loadLessons(); await loadProgress(); hydrateCourseHeader(); renderCourse(); }
  function hydrateCourseHeader(){ const n=$('#studentName'); if(n) n.textContent=state.profile?.full_name || state.user.email; }
  function renderCourse(){
    const root = $('#courseList'); const side = $('#courseSide'); if(!root) return;
    const sum=courseSummary();
    if(side) side.innerHTML = `<div class="panel glass sidebar-sticky"><h3>Ваш прогресс</h3><div class="progressbar"><span style="width:${sum.percent}%"></span></div><p><b>${sum.done}</b> из <b>${sum.total}</b> уроков завершено</p>${sum.next?`<p class="hint">Следующий урок: <b>${esc(sum.next.title)}</b></p><a class="primary" href="lesson.html?id=${sum.next.id}">Продолжить</a>`:`<a class="primary" href="certificate.html">Открыть сертификат</a>`}<a class="secondary" href="cabinet.html">Открыть кабинет</a></div>`;
    root.innerHTML = state.lessons.map((l,i)=>{
      const unlocked = isUnlocked(i); const complete = isComplete(l); const p=pFor(l.id);
      const status = complete ? `<span class="status done">✅ Завершен</span>` : unlocked ? `<span class="status open">Открыт</span>` : `<span class="status lock">🔒 Закрыт</span>`;
      const href = unlocked ? `lesson.html?id=${l.id}` : '#';
      return `<a class="lesson-card ${unlocked?'':'locked'}" href="${href}" ${unlocked?'':'onclick="return false"'}><div class="lesson-num">${esc(l.icon)}</div><div><h3>${i+1}. ${esc(l.title)}</h3><p>${esc(l.description||'')}</p><span>${esc(l.duration||'')}</span>${p?.quiz_score!=null?`<span> · тест ${p.quiz_score}%</span>`:''}</div>${status}</a>`;
    }).join('') || `<div class="empty">Пока нет опубликованных уроков.</div>`;
  }

  async function initLesson(){
    if(!await requireStudent()) return; if(state.profile?.role==='admin'){ location.replace('admin.html'); return; }
    await loadLessons(); await loadProgress();
    const id=getQuery('id'); const idx=state.lessons.findIndex(l=>l.id===id); const lesson=state.lessons[idx];
    if(!lesson) return $('#lessonRoot').innerHTML = msg('Урок не найден или пока скрыт.', 'error');
    if(!isUnlocked(idx)) return $('#lessonRoot').innerHTML = msg('Этот урок пока закрыт. Сначала завершите предыдущий урок.', 'warning') + `<p><a class="secondary" href="course.html">Вернуться к курсу</a></p>`;
    const questions = await loadQuestions(id); renderLesson(lesson, idx, questions);
  }
  function renderVideo(lesson){
    if(!lesson.video_url || lesson.video_type==='none') return `<div class="video-box"><div class="empty">Видео пока не добавлено. Можно изучить текст и отметить урок просмотренным.</div></div>`;
    if(lesson.video_type==='youtube') return `<div class="video-box"><iframe src="${esc(lesson.video_url)}" allowfullscreen></iframe></div>`;
    return `<div class="video-box"><video src="${esc(lesson.video_url)}" controls playsinline></video></div>`;
  }
  function lessonContentHtml(lesson){
    return `<div class="lesson-content"><h2>Конспект урока</h2><p>${String(lesson.content||'Материал урока скоро появится.').replace(/\n/g,'<br>')}</p></div>
      <h2>Пошаговая инструкция</h2><ol class="check-list">${arr(lesson.steps).map(s=>`<li>${esc(s)}</li>`).join('') || '<li>Посмотрите видео и выполните задание.</li>'}</ol>
      <h2>Частые ошибки</h2><ul class="check-list">${arr(lesson.mistakes).map(s=>`<li>${esc(s)}</li>`).join('') || '<li>Не торопитесь и проверяйте каждый шаг.</li>'}</ul>
      <h2>Практика</h2><div class="notice">${esc(lesson.practice || 'Закрепите материал на учебном примере.')}</div>`;
  }
  function renderLesson(lesson, idx, questions){
    const p=pFor(lesson.id) || {}; const watched=!!p.video_watched; const root=$('#lessonRoot'); if(!root) return;
    root.innerHTML = `<div class="page-title"><a class="secondary" href="course.html">← К списку уроков</a><h1>${esc(lesson.icon)} ${idx+1}. ${esc(lesson.title)}</h1><p>${esc(lesson.description||'')}</p></div>
      <div class="lesson-shell"><div class="glass panel">${renderVideo(lesson)}
      <div class="lesson-actions"><button id="watchedBtn" class="${watched?'success':'primary'}" type="button">${watched?'✅ Видео отмечено':'Я посмотрел видео'}</button><a class="ghost-btn whatsapp-link" href="${whatsappUrl('Здравствуйте! У меня вопрос по уроку: '+lesson.title)}" target="_blank">Задать вопрос по уроку</a></div>
      ${lessonContentHtml(lesson)}<h2>Тест после урока</h2><div id="quizBox"></div></div>
      <aside class="glass panel sidebar-sticky"><h3>Условие открытия следующего урока</h3><p>1. Отметить просмотр видео.</p><p>2. Пройти тест минимум на <b>${passScore(lesson)}%</b>.</p><div class="progressbar"><span style="width:${p.completed?100:(watched?50:0)}%"></span></div><p>${p.completed?'Урок завершен ✅':'Урок еще не завершен'}</p></aside></div>`;
    $('#watchedBtn').onclick=async()=>{ await saveProgress(lesson.id,{video_watched:true}); location.reload(); };
    renderQuiz(lesson, questions);
  }
  function renderQuiz(lesson, questions){
    const root=$('#quizBox'); if(!root) return;
    if(!questions.length){ root.innerHTML = msg('Вопросы теста пока не добавлены. Отметьте видео просмотренным, чтобы завершить урок.', 'warning') + `<button class="primary" id="completeNoQuiz">Завершить урок</button>`; $('#completeNoQuiz').onclick=async()=>{ await saveProgress(lesson.id,{video_watched:true,quiz_score:100,completed:true,completed_at:new Date().toISOString()}); location.href='course.html'; }; return; }
    root.innerHTML = `<form id="quizForm">${questions.map((q,qi)=>`<div class="quiz-item"><h3>${qi+1}. ${esc(q.question)}</h3><div class="quiz-answers">${arr(q.answers).map((a,ai)=>`<label><input type="radio" required name="q${qi}" value="${ai}">${esc(a)}</label>`).join('')}</div></div>`).join('')}<button class="primary" type="submit">Проверить тест</button></form><div id="quizResult"></div>`;
    $('#quizForm').onsubmit=async(e)=>{
      e.preventDefault(); let ok=0; const fd=new FormData(e.currentTarget); questions.forEach((q,qi)=>{ if(Number(fd.get('q'+qi))===Number(q.correct_index)) ok++; });
      const score = Math.round(ok/questions.length*100); const complete = score>=passScore(lesson);
      await saveProgress(lesson.id,{video_watched:true,quiz_score:score,completed:complete,completed_at:complete?new Date().toISOString():null});
      $('#quizResult').innerHTML = complete ? msg(`Отлично! Результат ${score}%. Следующий урок открыт.`) + `<p><a class="primary" href="course.html">К списку уроков</a></p>` : msg(`Результат ${score}%. Нужно минимум ${passScore(lesson)}%. Попробуйте еще раз.`, 'error');
    };
  }
  async function saveProgress(lessonId, fields){ const payload = {user_id:state.user.id, lesson_id:lessonId, ...fields, updated_at:new Date().toISOString()}; const { error } = await sb.from('lesson_progress').upsert(payload,{onConflict:'user_id,lesson_id'}); if(error) alert(error.message); }

  async function initCabinet(){ if(!await requireStudent()) return; if(state.profile?.role === 'admin'){ location.replace('admin.html'); return; } await loadLessons(); await loadProgress(); renderCabinet(); }
  function renderCabinet(){
    const root=$('#cabinetRoot'); if(!root) return;
    const sum=courseSummary();
    const notices = sum.next ? [`Следующий урок: ${sum.next.title}`, sum.done===0?'Начните с первого урока и пройдите тест.':'Продолжайте обучение с доступного урока.'] : ['Все уроки завершены. Сертификат доступен.'];
    root.innerHTML = `<div class="page-title"><h1>Личный кабинет</h1><p>Здравствуйте, ${esc(state.profile?.full_name || state.user.email)}. Здесь видно, что уже выполнено и что делать дальше.</p></div>
      <div class="metric-grid"><div class="metric"><b>${sum.percent}%</b><span>общий прогресс</span></div><div class="metric"><b>${sum.done}/${sum.total}</b><span>уроков завершено</span></div><div class="metric"><b>${sum.watched}</b><span>видео просмотрено</span></div><div class="metric"><b>${sum.avg}%</b><span>средний тест</span></div></div>
      <section class="glass panel next-step"><h2>Ваш следующий шаг</h2>${notices.map(n=>`<div class="notice small">${esc(n)}</div>`).join('')}${sum.next?`<a class="primary" href="lesson.html?id=${sum.next.id}">Продолжить обучение</a>`:`<a class="primary" href="certificate.html">Открыть сертификат</a>`}</section>
      <section class="grid-2"><div class="glass panel"><h2>Уведомления</h2>${renderCabinetNotifications()}</div><div class="glass panel"><h2>Помощь</h2><p>${esc(settings().support_text)}</p><a class="ghost-btn whatsapp-link" target="_blank" href="${whatsappUrl()}">Написать в WhatsApp</a></div></section>
      <section class="glass panel"><h2>Прогресс по урокам</h2><div class="lesson-list">${state.lessons.map((l,i)=>{const p=pFor(l.id)||{};return `<div class="lesson-card"><div class="lesson-num">${esc(l.icon)}</div><div><h3>${i+1}. ${esc(l.title)}</h3><p>Видео: ${p.video_watched?'просмотрено':'не просмотрено'} · Тест: ${p.quiz_score!=null?p.quiz_score+'%':'не пройден'}</p></div>${isComplete(l)?'<span class="status done">✅ Готово</span>':isUnlocked(i)?'<span class="status open">Доступен</span>':'<span class="status lock">Закрыт</span>'}</div>`}).join('')}</div></section>`;
    setWhatsAppLinks();
  }
  function renderCabinetNotifications(){
    const completed = state.lessons.filter(isComplete).slice(-3);
    if(!completed.length) return `<p class="hint">Здесь будут появляться уведомления об открытых уроках и пройденных тестах.</p>`;
    return completed.map(l=>`<div class="notice">✅ Урок «${esc(l.title)}» завершен.</div>`).join('');
  }

  async function initCertificate(){
    if(!await requireStudent()) return; if(state.profile?.role==='admin'){ location.replace('admin.html'); return; }
    await loadLessons(); await loadProgress(); const sum=courseSummary();
    const allDone=state.lessons.length && state.lessons.every(isComplete); const root=$('#certificateRoot'); const s=settings();
    root.innerHTML = allDone ? `<div class="certificate-card glass panel"><div class="cert-ornament">🏆</div><h1>${esc(s.certificate_title)}</h1><p>${esc(s.certificate_text)}</p><h2>${esc(state.profile?.full_name || state.user.email)}</h2><p>Курс: <b>${esc(s.site_title)}</b></p><div class="cert-grid"><div><b>${todayRu()}</b><span>дата завершения</span></div><div><b>${sum.avg}%</b><span>средний результат</span></div><div><b>${shortId(state.user.id)}</b><span>номер сертификата</span></div></div><p class="cert-footer">${esc(s.certificate_footer)}</p><button class="primary" onclick="window.print()">Скачать / сохранить PDF</button></div>` : msg('Сертификат откроется после завершения всех уроков.', 'warning') + `<p><a class="primary" href="course.html">Вернуться к курсу</a></p>`;
  }
  async function initProgram(){ await loadLessons(); renderLessonPreview(); }

  async function requireAdmin(){
    if(!sb) return false;
    if(!state.user){ $('#adminRoot').innerHTML = `<div class="auth-card glass"><h2>Вход администратора</h2><div id="adminAuth"></div></div>`; renderAuth($('#adminAuth'),'signin'); return false; }
    await loadProfile();
    if(state.profile?.role !== 'admin'){ $('#adminRoot').innerHTML = msg('У вашего аккаунта нет прав администратора.', 'error'); return false; }
    return true;
  }
  async function initAdmin(){ if(!await requireAdmin()) return; await loadSettings(); await loadLessons(true); await loadProgressAll(); renderAdmin(); }
  async function renderAdmin(){
    const root=$('#adminRoot');
    root.innerHTML = `<div class="page-title"><h1>Панель управления</h1><p>Уроки, файлы, ученики, сертификаты и внешний вид сайта — без редактирования кода.</p></div>
      <div class="admin-layout"><aside class="admin-menu glass"><button class="secondary active" data-tab="overview">📊 Обзор</button><button class="secondary" data-tab="lessons">📚 Уроки</button><button class="secondary" data-tab="files">🎬 Файлы</button><button class="secondary" data-tab="students">👥 Ученики</button><button class="secondary" data-tab="settings">🎨 Настройки сайта</button><button class="danger" id="adminLogout">Выйти</button></aside><div>
      <section id="tab-overview" class="admin-tab active glass panel"></section><section id="tab-lessons" class="admin-tab glass panel"></section><section id="tab-files" class="admin-tab glass panel"></section><section id="tab-students" class="admin-tab glass panel"></section><section id="tab-settings" class="admin-tab glass panel"></section></div></div>`;
    $$('.admin-menu [data-tab]').forEach(b=>b.onclick=()=>{ $$('.admin-menu [data-tab]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.admin-tab').forEach(t=>t.classList.remove('active')); $('#tab-'+b.dataset.tab).classList.add('active'); });
    $('#adminLogout').onclick=signOut;
    renderAdminOverview(); await renderAdminLessons(); renderAdminFiles(); renderAdminStudents(); renderAdminSettings();
  }
  function renderAdminOverview(){
    const root=$('#tab-overview'); if(!root) return;
    const students=(state.allProfiles||[]).filter(p=>p.role!=='admin');
    const active=students.filter(p=>(state.allProgress||[]).some(x=>x.user_id===p.id)).length;
    const completed=students.filter(p=>state.lessons.length && state.lessons.every(l=>(state.allProgress||[]).some(x=>x.user_id===p.id && x.lesson_id===l.id && x.completed))).length;
    const rows=students.slice(0,6).map(p=>studentRowHtml(p,false)).join('');
    root.innerHTML = `<div class="section-head"><div><h2>Обзор платформы</h2><p>Быстрая статистика по урокам и ученикам.</p></div><button class="secondary" id="refreshOverview">Обновить</button></div><div class="metric-grid"><div class="metric"><b>${state.lessons.length}</b><span>уроков всего</span></div><div class="metric"><b>${students.length}</b><span>учеников</span></div><div class="metric"><b>${active}</b><span>начали курс</span></div><div class="metric"><b>${completed}</b><span>завершили курс</span></div></div><h3>Последние ученики</h3><table class="table"><thead><tr><th>Ученик</th><th>Email</th><th>Прогресс</th><th>Где находится</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Данных пока нет</td></tr>'}</tbody></table>`;
    $('#refreshOverview').onclick=async()=>{await loadProgressAll();renderAdminOverview();renderAdminStudents();};
  }
  async function renderAdminLessons(){
    const root=$('#tab-lessons'); if(!root) return;
    if(!selectedLessonId && state.lessons[0]) selectedLessonId = state.lessons[0].id;
    const lesson = state.lessons.find(l=>l.id===selectedLessonId) || null;
    const questions = lesson ? await loadQuestions(lesson.id) : [];
    root.innerHTML = `<div class="section-head"><div><h2>Уроки</h2><p>Черновики не видны ученикам. Опубликованные уроки появляются сразу.</p></div><button class="primary" id="newLessonBtn">+ Новый урок</button></div><div class="editor-grid"><div class="mini-list">${state.lessons.map(l=>`<button class="mini-item ${l.id===selectedLessonId?'active':''}" data-lesson-id="${l.id}"><span>${l.sort_order}. ${esc(l.icon)} ${esc(l.title)}</span><small>${l.is_published?'опубликован':'черновик'}</small></button>`).join('') || '<div class="empty">Пока нет уроков</div>'}</div><div id="lessonFormBox"></div></div>`;
    $$('.mini-item[data-lesson-id]',root).forEach(b=>b.onclick=()=>{selectedLessonId=b.dataset.lessonId;renderAdminLessons();});
    $('#newLessonBtn').onclick=()=>{selectedLessonId=null; renderLessonForm(null,[]);};
    renderLessonForm(lesson, questions);
  }
  function renderLessonForm(lesson, questions){
    const root=$('#lessonFormBox'); if(!root) return;
    const qList = questions.length ? questions : [{question:'',answers:['','',''],correct_index:0}];
    root.innerHTML = `<form class="form" id="lessonForm">
      <div class="form-row"><label>Порядок<input name="sort_order" type="number" value="${esc(lesson?.sort_order || state.lessons.length+1)}"></label><label>Иконка<input name="icon" value="${esc(lesson?.icon || '🎓')}"></label></div>
      <label>Название урока<input name="title" required value="${esc(lesson?.title || '')}" placeholder="Например: Заполнение заявления"></label>
      <label>Краткое описание<input name="description" value="${esc(lesson?.description || '')}"></label>
      <div class="form-row"><label>Длительность<input name="duration" value="${esc(lesson?.duration || '10 минут')}"></label><label>Проходной балл<input name="passing_score" type="number" min="0" max="100" value="${esc(lesson?.passing_score || settings().passing_score || 70)}"></label></div>
      <div class="form-row"><label>Тип видео<select name="video_type"><option value="none">Без видео</option><option value="youtube">YouTube/Rutube iframe</option><option value="file">Файл из Supabase Storage</option><option value="external">Прямая ссылка</option></select></label><label>Ссылка на видео<input name="video_url" id="videoUrlInput" value="${esc(lesson?.video_url || '')}" placeholder="https://..."></label></div>
      <label>Текст урока<textarea name="content" placeholder="Основной текст урока">${esc(lesson?.content || '')}</textarea></label>
      <label>Пошаговая инструкция <small>каждый шаг с новой строки</small><textarea name="steps">${esc(joinLines(lesson?.steps))}</textarea></label>
      <label>Частые ошибки <small>каждая ошибка с новой строки</small><textarea name="mistakes">${esc(joinLines(lesson?.mistakes))}</textarea></label>
      <label>Практическое задание<textarea name="practice">${esc(lesson?.practice || '')}</textarea></label>
      <label class="check-label"><input type="checkbox" name="is_published" ${lesson?.is_published!==false?'checked':''}> Опубликовать урок</label>
      <h3>Вопросы теста</h3><div id="quizEditor" class="quiz-editor">${qList.map((q,i)=>questionEditorHtml(q,i)).join('')}</div>
      <div class="admin-actions"><button class="secondary" type="button" id="addQuestionBtn">+ Вопрос</button><button class="secondary" type="button" id="previewLessonBtn">Предпросмотр</button><button class="primary" type="submit">Сохранить урок</button>${lesson?'<button class="danger" type="button" id="deleteLessonBtn">Удалить</button>':''}</div>
      <div id="lessonPreviewAdmin"></div><div id="lessonSaveResult"></div></form>`;
    if(lesson) $('select[name="video_type"]',root).value = lesson.video_type || 'none';
    $('#addQuestionBtn').onclick=()=>{ const idx=$$('.question-box').length; $('#quizEditor').insertAdjacentHTML('beforeend', questionEditorHtml({question:'',answers:['','',''],correct_index:0},idx)); };
    $('#previewLessonBtn').onclick=()=>{ const preview=lessonFormPayload(new FormData($('#lessonForm'))); $('#lessonPreviewAdmin').innerHTML=`<div class="preview-box"><h3>Предпросмотр урока</h3><h2>${esc(preview.icon)} ${esc(preview.title||'Без названия')}</h2><p>${esc(preview.description||'')}</p>${lessonContentHtml(preview)}</div>`; };
    if($('#deleteLessonBtn')) $('#deleteLessonBtn').onclick=async()=>{ if(confirm('Удалить урок? Это действие нельзя отменить.')){ await sb.from('lessons').delete().eq('id',lesson.id); selectedLessonId=null; await loadLessons(true); await renderAdminLessons(); renderAdminOverview(); } };
    $('#lessonForm').onsubmit=async(e)=>{
      e.preventDefault(); const payload=lessonFormPayload(new FormData(e.currentTarget)); let saved;
      if(lesson){ const {data,error}=await sb.from('lessons').update(payload).eq('id',lesson.id).select().single(); if(error) return $('#lessonSaveResult').innerHTML=msg(error.message,'error'); saved=data; }
      else { const {data,error}=await sb.from('lessons').insert(payload).select().single(); if(error) return $('#lessonSaveResult').innerHTML=msg(error.message,'error'); saved=data; }
      const quiz = collectQuiz(); await sb.from('quiz_questions').delete().eq('lesson_id',saved.id); if(quiz.length) await sb.from('quiz_questions').insert(quiz.map((q,i)=>({...q,lesson_id:saved.id,sort_order:i+1})));
      selectedLessonId=saved.id; await loadLessons(true); $('#lessonSaveResult').innerHTML=msg('Урок сохранен. Изменения сразу доступны на сайте.'); await renderAdminLessons(); renderAdminOverview();
    };
  }
  function lessonFormPayload(fd){ return {sort_order:Number(fd.get('sort_order')||1),icon:fd.get('icon')||'🎓',title:fd.get('title'),description:fd.get('description'),duration:fd.get('duration'),video_type:fd.get('video_type'),video_url:fd.get('video_url'),content:fd.get('content'),steps:arr(fd.get('steps')),mistakes:arr(fd.get('mistakes')),practice:fd.get('practice'),passing_score:Number(fd.get('passing_score')||settings().passing_score||70),is_published:!!fd.get('is_published')}; }
  function questionEditorHtml(q,i){ const answers=arr(q.answers); while(answers.length<3) answers.push(''); return `<div class="question-box"><label>Вопрос ${i+1}<input name="question" value="${esc(q.question||'')}"></label><label>Ответы <small>каждый ответ с новой строки</small><textarea name="answers">${esc(answers.join('\n'))}</textarea></label><label>Номер правильного ответа <small>1, 2, 3...</small><input name="correct_index" type="number" min="1" value="${Number(q.correct_index||0)+1}"></label></div>`; }
  function collectQuiz(){ return $$('.question-box').map(box=>{ const question=$('input[name="question"]',box).value.trim(); const answers=arr($('textarea[name="answers"]',box).value); const correct_index=Math.max(0,Number($('input[name="correct_index"]',box).value||1)-1); return {question,answers,correct_index}; }).filter(q=>q.question && q.answers.length>=2); }

  function renderAdminFiles(){
    const root=$('#tab-files'); if(!root) return;
    root.innerHTML = `<div class="section-head"><div><h2>Видео и файлы</h2><p>Загрузите MP4, WEBM, PDF или картинку. Ссылку можно вставить в урок.</p></div><button class="secondary" id="listFilesBtn">Показать файлы</button></div><div class="file-upload"><form id="fileForm" class="form"><label>Выберите файл<input type="file" name="file" required accept="video/*,application/pdf,image/*"></label><button class="primary" type="submit">Загрузить файл</button></form><div id="fileResult"></div><div id="fileList"></div></div>`;
    $('#fileForm').onsubmit=async(e)=>{ e.preventDefault(); const file=new FormData(e.currentTarget).get('file'); if(!file) return; const path=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`; const {error}=await sb.storage.from('lesson-files').upload(path,file,{upsert:false}); if(error) return $('#fileResult').innerHTML=msg(error.message,'error'); const {data}=sb.storage.from('lesson-files').getPublicUrl(path); $('#fileResult').innerHTML=msg('Файл загружен. Скопируйте ссылку:')+`<input value="${esc(data.publicUrl)}" onclick="this.select()">`; };
    $('#listFilesBtn').onclick=listFiles;
  }
  async function listFiles(){
    const {data,error}=await sb.storage.from('lesson-files').list('',{limit:100,sortBy:{column:'created_at',order:'desc'}});
    const root=$('#fileList'); if(error) return root.innerHTML=msg(error.message,'error');
    root.innerHTML = `<div class="mini-list">${(data||[]).map(f=>{const url=sb.storage.from('lesson-files').getPublicUrl(f.name).data.publicUrl; return `<div class="mini-item"><span>${esc(f.name)}</span><input value="${esc(url)}" onclick="this.select()"></div>`}).join('') || '<div class="empty">Файлов пока нет</div>'}</div>`;
  }
  function studentStats(profile){
    const pr=(state.allProgress||[]).filter(x=>x.user_id===profile.id);
    const completed=pr.filter(x=>x.completed).length;
    const avg=pr.filter(x=>x.quiz_score!=null); const score=avg.length?Math.round(avg.reduce((s,x)=>s+x.quiz_score,0)/avg.length):0;
    const next=state.lessons.find(l=>!pr.some(x=>x.lesson_id===l.id && x.completed));
    return {pr,completed,score,next,last:pr[0]?.updated_at?new Date(pr[0].updated_at).toLocaleString('ru-RU'):'—'};
  }
  function studentRowHtml(p, full=true){ const st=studentStats(p); return `<tr><td>${esc(p.full_name||p.email)}</td><td>${esc(p.email||'')}</td><td>${st.completed}/${state.lessons.length}</td><td>${st.next?esc(st.next.title):'Курс завершен'}</td>${full?`<td>${st.score}%</td><td>${st.last}</td>`:''}</tr>`; }
  function renderAdminStudents(){
    const root=$('#tab-students'); if(!root) return;
    const rows=(state.allProfiles||[]).filter(p=>p.role!=='admin').map(p=>studentRowHtml(p,true)).join('');
    root.innerHTML = `<div class="section-head"><div><h2>Ученики</h2><p>Видно, кто проходит курс и где остановился.</p></div><button class="secondary" id="refreshStudents">Обновить</button></div><table class="table"><thead><tr><th>Ученик</th><th>Email</th><th>Прогресс</th><th>Где находится</th><th>Средний тест</th><th>Последняя активность</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Учеников пока нет</td></tr>'}</tbody></table>`;
    $('#refreshStudents').onclick=async()=>{await loadProgressAll();renderAdminStudents();renderAdminOverview();};
  }
  function renderAdminSettings(){
    const root=$('#tab-settings'); if(!root) return; const s=settings();
    root.innerHTML = `<h2>Настройки сайта</h2><p class="hint">Здесь можно менять внешний вид, тексты главной страницы, блоки, кнопки, WhatsApp и сертификат без кода.</p><form class="form settings-form" id="settingsForm">
      <h3>Бренд и шапка</h3><div class="form-row"><label>Иконка / логотип<input name="site_logo" value="${esc(s.site_logo)}"></label><label>Название сайта<input name="site_title" value="${esc(s.site_title)}"></label></div><label>Подзаголовок в шапке<input name="site_subtitle" value="${esc(s.site_subtitle)}"></label>
      <h3>Первый экран</h3><label>Плашка над заголовком<input name="hero_badge" value="${esc(s.hero_badge)}"></label><div class="form-row"><label>Заголовок до выделения<input name="hero_title" value="${esc(s.hero_title)}"></label><label>Выделенное слово<input name="hero_highlight" value="${esc(s.hero_highlight)}"></label></div><label>Текст под заголовком<textarea name="hero_text">${esc(s.hero_text)}</textarea></label><div class="form-row"><label>Текст главной кнопки<input name="primary_button_text" value="${esc(s.primary_button_text)}"></label><label>Текст второй кнопки<input name="secondary_button_text" value="${esc(s.secondary_button_text)}"></label></div>
      <h3>О курсе</h3><label>Заголовок блока<input name="about_title" value="${esc(s.about_title)}"></label><label>Описание курса<textarea name="about_text">${esc(s.about_text)}</textarea></label><label>Карточки “О курсе” <small>каждая с новой строки</small><textarea name="about_cards">${esc(joinLines(s.about_cards))}</textarea></label>
      <h3>Как проходит обучение</h3><label>Заголовок блока<input name="process_title" value="${esc(s.process_title)}"></label><label>Шаги обучения <small>каждый шаг с новой строки</small><textarea name="process_steps">${esc(joinLines(s.process_steps))}</textarea></label>
      <h3>Помощь и WhatsApp</h3><div class="form-row"><label>Заголовок помощи<input name="support_title" value="${esc(s.support_title)}"></label><label>WhatsApp без плюса<input name="whatsapp_phone" value="${esc(s.whatsapp_phone)}"></label></div><label>Текст помощи<textarea name="support_text">${esc(s.support_text)}</textarea></label>
      <h3>Обучение и сертификат</h3><div class="form-row"><label>Проходной балл<input name="passing_score" type="number" min="0" max="100" value="${esc(s.passing_score)}"></label><label>Ширина сайта на ПК<input name="site_width" type="number" min="1100" max="1600" value="${esc(s.site_width)}"></label></div><label>Название сертификата<input name="certificate_title" value="${esc(s.certificate_title)}"></label><label>Текст сертификата<input name="certificate_text" value="${esc(s.certificate_text)}"></label><label>Подпись в сертификате<input name="certificate_footer" value="${esc(s.certificate_footer)}"></label>
      <h3>Цветовая тема</h3><div class="form-row"><label>Основной цвет<input name="theme_primary" type="color" value="${esc(s.theme_primary)}"></label><label>Второй цвет<input name="theme_secondary" type="color" value="${esc(s.theme_secondary)}"></label></div><label>Акцентный цвет<input name="theme_accent" type="color" value="${esc(s.theme_accent)}"></label>
      <label>Текст внизу сайта <small>можно оставить пустым</small><input name="footer_text" value="${esc(s.footer_text||'')}"></label><button class="primary">Сохранить все настройки</button><div id="settingsResult"></div></form>`;
    $('#settingsForm').onsubmit=async(e)=>{ e.preventDefault(); const fd=new FormData(e.currentTarget); const payload={site_logo:fd.get('site_logo'),site_title:fd.get('site_title'),site_subtitle:fd.get('site_subtitle'),hero_badge:fd.get('hero_badge'),hero_title:fd.get('hero_title'),hero_highlight:fd.get('hero_highlight'),hero_text:fd.get('hero_text'),primary_button_text:fd.get('primary_button_text'),secondary_button_text:fd.get('secondary_button_text'),about_title:fd.get('about_title'),about_text:fd.get('about_text'),about_cards:arr(fd.get('about_cards')),process_title:fd.get('process_title'),process_steps:arr(fd.get('process_steps')),support_title:fd.get('support_title'),support_text:fd.get('support_text'),whatsapp_phone:fd.get('whatsapp_phone'),passing_score:Number(fd.get('passing_score')||70),certificate_title:fd.get('certificate_title'),certificate_text:fd.get('certificate_text'),certificate_footer:fd.get('certificate_footer'),theme_primary:fd.get('theme_primary'),theme_secondary:fd.get('theme_secondary'),theme_accent:fd.get('theme_accent'),site_width:Number(fd.get('site_width')||1360),footer_text:fd.get('footer_text')}; const {error}=await sb.from('site_settings').update(payload).eq('id',1); $('#settingsResult').innerHTML=error?msg(error.message,'error'):msg('Настройки сохранены. Обновите главную страницу, чтобы увидеть изменения.'); await loadSettings(); hydrateBrand(); setWhatsAppLinks(); };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
