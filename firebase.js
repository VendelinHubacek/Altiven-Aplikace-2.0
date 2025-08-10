/* FirebaseSync – tenká vrstva nad App.STORE (localStorage)
   - Pokud je poskytnut validní Firebase config → povolí sync do Firestore.
   - Anonymní přihlášení (nebo později nahradíš vlastním Auth).
   - Delta-sync: při každém App.saveBlock() se naplánuje push (debounce).
*/

(function(global){
  const DEBOUNCE_MS = 600;
  let app = null;
  let cfg = null;
  let enabled = false;
  let pushTimer = null;
  let db = null;
  let auth = null;
  let uid = null;

  function isConfigFilled(c){
    if(!c) return false;
    const need = ['apiKey','authDomain','projectId','appId'];
    return need.every(k => typeof c[k] === 'string' && c[k].length>0);
  }

  function debouncePush(){
    if(!enabled) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, DEBOUNCE_MS);
  }

  async function pushNow(){
    if(!enabled || !uid || !db) return;
    try{
      // celý STORE objekt (JSON) uložíme do users/{uid}/store/doc:master
      const state = JSON.parse(localStorage.getItem('altiven_store_v2') || '{}');
      await db.collection('users').doc(uid).collection('store').doc('master').set(state, { merge:true });
      app.toast?.('Synchronizováno do cloudu');
    }catch(e){
      console.warn('Firebase push error', e);
    }
  }

  async function pullNow(){
    if(!enabled || !uid || !db) return;
    try{
      const snap = await db.collection('users').doc(uid).collection('store').doc('master').get();
      if(snap.exists){
        const cloud = snap.data() || {};
        const local = JSON.parse(localStorage.getItem('altiven_store_v2') || '{}');
        // jednoduché sloučení – cloud má přednost (můžeš upravit)
        const merged = Object.assign({}, local, cloud);
        localStorage.setItem('altiven_store_v2', JSON.stringify(merged));
        app.toast?.('Načteno z cloudu');
        // refresh aktuální stránky (aby se propsaly změny)
        // volitelné: window.location.reload();
      }
    }catch(e){
      console.warn('Firebase pull error', e);
    }
  }

  function patchAppSaveBlock(){
    if(!app || !app.saveBlock) return;
    const original = app.saveBlock;
    app.saveBlock = function(type, key, value){
      original.apply(app, arguments);
      debouncePush();
    };
  }

  async function signInAnon(){
    try{
      const res = await auth.signInAnonymously();
      uid = res.user.uid;
      await pullNow();      // stáhni cloud → merge do local
      debouncePush();       // a po chvíli nahraj zpátky, aby se sjednotilo
    }catch(e){
      console.warn('Anon sign-in failed', e);
    }
  }

  function init(config){
    cfg = config;
    if(!isConfigFilled(cfg)){
      console.info('FirebaseSync: žádný/invalidní config → běžím jen lokálně.');
      return;
    }
    try{
      firebase.initializeApp(cfg);
      auth = firebase.auth();
      db   = firebase.firestore();
      enabled = true;

      // Pokud už je user přihlášený, použij jeho UID; jinak anonym
      auth.onAuthStateChanged(async (user)=>{
        if(user){ uid = user.uid; await pullNow(); debouncePush(); }
        else { await signInAnon(); }
      });

      // Patchni App.saveBlock tak, aby se syncoval cloud
      if(global.App){ app = global.App; patchAppSaveBlock(); }
      else {
        // pokud App ještě není k dispozici, zkus za chvíli
        const t = setInterval(()=>{
          if(global.App){ app = global.App; patchAppSaveBlock(); clearInterval(t); }
        }, 200);
      }

      console.info('FirebaseSync: aktivní.');
    }catch(e){
      console.warn('Firebase init error', e);
      enabled = false;
    }
  }

  global.FirebaseSync = { init, pushNow, pullNow };
})(window);
