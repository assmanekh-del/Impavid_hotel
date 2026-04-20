function App({user,onLogout}){
  const [view,setView]=useState("dashboard");
  const [reservations,setReservations]=useState([]);
  const [resources,setResources]=useState([]);
  const [contrats,setContrats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [modal,setModal]=useState(null);
  const [userRole,setUserRole]=useState(null);
  const [showJournal,setShowJournal]=useState(false);
  const [logs,setLogs]=useState([]);
  const [logsLoading,setLogsLoading]=useState(false);
  const [logsFilter,setLogsFilter]=useState("");
  const [form,setForm]=useState({});
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("all");
  const [filterDateFrom,setFilterDateFrom]=useState("");
  const [filterDateTo,setFilterDateTo]=useState("");
  const [filterPaid,setFilterPaid]=useState("all");
  const [toast,setToast]=useState(null);
  const [devisRooms,setDevisRooms]=useState([]);
  const [devisInfo,setDevisInfo]=useState({client:"",checkin:"",checkout:"",notes:""});
  const [newResName,setNewResName]=useState("");
  const [newResRole,setNewResRole]=useState("menage");
  const [freeInvoice,setFreeInvoice]=useState({client:"",adresse:"",phone:"",email:"",mf:"",lines:[{code:"",desc:"",qty:1,prixTTC:0}],remise:0,notes:"",showCachet:true});
  const [searchDates,setSearchDates]=useState({checkin:"",checkout:""});
  const [calYear,setCalYear]=useState(new Date().getFullYear());
  const [calMonth,setCalMonth]=useState(new Date().getMonth());
  const [cleanStatus,setCleanStatus]=useState({});
  const [stockEdit,setStockEdit]=useState({});
  const [invCounter,setInvCounter]=useState(0);
  const [printReady,setPrintReady]=useState(false);
  const [printData,setPrintData]=useState(null); // données à imprimer
  // Déclenche l'impression dès que printReady passe à true
  useEffect(()=>{
    if(printReady){
      const t=setTimeout(()=>{window.print();setPrintReady(false);},150);
      return()=>clearTimeout(t);
    }
  },[printReady]);
  async function nextInvNum(){
    // Utilise le RPC increment_counter en priorité
    try{
      const {data,error}=await sb.rpc('increment_counter',{counter_id:'invoice'});
      if(!error && data!=null) return String(data).padStart(5,'0');
    }catch(e){}
    // Fallback: compte les factures + 1
    try{
      const res=await sb.from('factures').select('*',{count:'exact',head:true}).not('numero','ilike','DEV-%');
      const nextVal=(res.count||0)+1;
      await sb.from('counters').update({val:nextVal}).eq('id','invoice');
      return String(nextVal).padStart(5,'0');
    }catch(e){}
    // Dernier fallback local
    const n=invCounter+1;
    setInvCounter(n);
    return String(n).padStart(5,'0');
  }
  async function saveFacture(payload){
    addLog("🧾 Facture créée",{numero:payload.numero,client:payload.client,montant:payload.montant_ttc});
    try{
      const {error}=await sb.from('factures').insert([payload]);
      if(error) throw error;
      return true;
    }catch(e){
      console.error('Erreur sauvegarde facture:',e);
      return false;
    }
  }
  async function cancelFacture(numero){
    try{
      await sb.from('factures').delete().eq('numero',numero);
      // Log directement via sb car addLog peut ne pas être encore défini
      sb.from('logs').insert([{user_email:user?.email||'inconnu',action:'🗑 Facture supprimée',details:{numero}}]).then();
      const isDevis=(numero||'').startsWith('DEV-');
      if(isDevis){
        const resD=await sb.from('factures').select('*',{count:'exact',head:true}).like('numero','DEV-%');
        await sb.from('counters').update({val:resD.count||0}).eq('id','devis');
      }else{
        const resF=await sb.from('factures').select('*',{count:'exact',head:true}).not('numero','ilike','DEV-%');
        await sb.from('counters').update({val:resF.count||0}).eq('id','invoice');
      }
    }catch(e){
      console.warn('cancelFacture error:',e);
    }
  }
  function doPrint(data){
    if(data) setPrintData(data);
    // Changer le titre pour éviter qu'il apparaisse à l'impression
    const oldTitle=document.title;
    document.title=' ';
    setPrintReady(true);
    setTimeout(()=>{document.title=oldTitle;},2000);
  }
  // Fermeture intelligente — annule le numéro réservé si non sauvegardé
  async function closeModal(){
    if(modal){
      const type=modal.type;
      // Facture libre non sauvegardée
      if(type==="freeInvoice"&&freeInvoice.invNum&&!freeInvoice.saved){
        await cancelFacture(freeInvoice.invNum);
      }
      // Facture réservation non sauvegardée
      if(type==="invoice"&&modal.invNum&&!modal.saved){
        await cancelFacture(modal.invNum);
      }
      // Devis non sauvegardé
      if(type==="devis"&&devisInfo.devNum&&!devisInfo.saved){
        await cancelFacture(devisInfo.devNum);
      }
    }
    setModal(null);
  }

  function openFreeInvoice(){
    setFreeInvoice({client:"",adresse:"",phone:"",email:"",mf:"",lines:[{code:"",desc:"",qty:1,prixTTC:0}],remise:0,notes:"",showCachet:true,invNum:null,saved:false});
    setModal({type:"freeInvoice"});
  }

  const showToast=(msg,type="success")=>setToast({msg,type});
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(null),3500);return()=>clearTimeout(t);}},[toast]);

  // ── Charger le rôle utilisateur ──
  useEffect(()=>{
    if(user?.id){
      sb.from('profiles').select('role').eq('id',user.id).single()
        .then(({data})=>setUserRole(data?.role||'receptionniste'));
    }
  },[user]);

  // ── Ajouter un log ──
  async function addLog(action, details={}){
    try{
      const {error} = await sb.from('logs').insert([{
        user_email: user?.email||'inconnu',
        action,
        details,
      }]);
      if(error) console.error('addLog error:', error.message, error.details);
    }catch(e){console.error('addLog catch:',e);}
  }

  // ── Charger les logs ──
  async function loadLogs(){
    setLogsLoading(true);
    try{
      const{data}=await sb.from('logs').select('*').order('created_at',{ascending:false}).limit(200);
      setLogs(data||[]);
    }catch(e){}
    setLogsLoading(false);
  }

  const filteredLogs = logsFilter
    ? logs.filter(l=>l.action.includes(logsFilter))
    : logs;

  const loadAll=useCallback(async()=>{
    try{
      const[{data:res},{data:rsc},{data:ctr}]=await Promise.all([
        sb.from("reservations").select("*").order("checkin",{ascending:false}),
        sb.from("resources").select("*").order("role"),
        sb.from("contrats").select("*").order("nom"),
      ]);
      setReservations((res||[]).map(fromDb));
      setResources(rsc||[]);
      setContrats(ctr||[]);
    }catch(e){showToast("Erreur de connexion","error");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    loadAll();
    // Realtime Supabase
    const ch=sb.channel("all-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"reservations"},loadAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"resources"},loadAll)
      .subscribe();
    // Polling toutes les 30s en secours
    const poll=setInterval(loadAll,30000);
    return()=>{sb.removeChannel(ch);clearInterval(poll);};
  },[loadAll]);

  const babyBedOccupied=reservations.some(r=>r.babyBed&&["confirmed","checkedin"].includes(r.status)&&r.checkin<=getToday()&&r.checkout>getToday());
  const occupiedRooms=ROOMS.filter(r=>isOcc(r.id,reservations));
  const freeRooms=ROOMS.filter(r=>!isOcc(r.id,reservations));
  const freeSuites=SUITES.filter(r=>!isOcc(r.id,reservations));
  const blockedRooms=ROOMS.filter(r=>{const res=getRoomRes(r.id,reservations);return res&&res.status==="blocked";});
  const claims=reservations.filter(r=>r.claim&&r.claim.trim()!=="");
  const activeBabyBed=reservations.find(r=>r.babyBed&&["confirmed","checkedin"].includes(r.status)&&r.checkin<=getToday()&&r.checkout>getToday());
  const menage=resources.filter(r=>r.role==="menage"&&r.active);
  const reception=resources.filter(r=>r.role==="reception"&&r.active);

  function openNew(roomId=null){setForm({roomId:roomId||"",guest:"",email:"",phone:"",checkin:TODAY,checkout:"",adults:1,children:0,breakfast:"non",status:"confirmed",paid:false,notes:"",extraBed:false,babyBed:false,babyBedLocation:"",claim:"",assignedMenage:"",pension:"lpd",billingType:null,remise:0,customPrice:undefined});setModal({type:"new"});}
  function openBlock(roomId){setForm({roomId,guest:"BLOQUÉE",email:"",phone:"",checkin:TODAY,checkout:"",adults:0,children:0,breakfast:"non",status:"blocked",paid:false,notes:"",extraBed:false,babyBed:false,babyBedLocation:"",claim:"",assignedMenage:"",pension:"lpd",billingType:null,remise:0,customPrice:undefined});setModal({type:"block"});}
  function openEdit(r){setForm({...r});setModal({type:"edit",data:r});}
  function openDetail(r){setModal({type:"detail",data:r});}
  function openInvoice(r){
    setModal({type:"invoice",data:r,saved:false,invNum:null});
  }
  async function nextDevNum(){
    try{
      const {data,error}=await sb.rpc('increment_counter',{counter_id:'devis'});
      if(!error && data!=null) return String(data).padStart(5,'0');
    }catch(e){}
    try{
      const res=await sb.from('factures').select('*',{count:'exact',head:true}).like('numero','DEV-%');
      const nextVal=(res.count||0)+1;
      return String(nextVal).padStart(5,'0');
    }catch(e){}
    return String(Math.floor(Math.random()*99999)).padStart(5,'0');
  }
  function openDevis(){
    setDevisInfo({client:"",phone:"",checkin:"",checkout:"",notes:"",remise:0,lines:[{code:"",desc:"",qty:1,prixTTC:0}],devNum:null,saved:false});
    setModal({type:"devis"});
  }

  async function saveReservation(){
    if(!form.roomId||!form.guest||!form.checkin||!form.checkout){showToast("Champs obligatoires manquants","error");return;}
    if(form.checkin>=form.checkout){showToast("Date de départ invalide","error");return;}
    // Vérification conflit de dates
    if(modal.type!=="block"&&isOccForDates(parseInt(form.roomId),reservations,form.checkin,form.checkout,form.id)){
      showToast("⚠ Cette chambre est déjà réservée pour ces dates","error");return;
    }
    setSyncing(true);
    try{
      if(modal.type==="new"||modal.type==="block"){
        const{error}=await sb.from("reservations").insert(toDb(form));
        if(error)throw error;
        showToast(modal.type==="block"?"Chambre bloquée ✓":"Réservation créée ✓");
        addLog(modal.type==="block"?"🔒 Chambre bloquée":"✅ Réservation créée",{client:form.guest,chambre:ROOMS.find(r=>r.id==form.roomId)?.number,checkin:form.checkin,checkout:form.checkout});
      }else{
        const{error}=await sb.from("reservations").update(toDb(form)).eq("id",form.id);
        if(error)throw error;
        showToast("Réservation mise à jour ✓");
        addLog("✏️ Réservation modifiée",{client:form.guest,chambre:ROOMS.find(r=>r.id==form.roomId)?.number,checkin:form.checkin,checkout:form.checkout});
      }
      // ── Mémorisation automatique du client ──
      if(form.guest&&form.guest!=="BLOQUÉE"&&modal.type!=="block"){
        try{
          const {data:existing}=await sb.from('clients').select('id').eq('nom',form.guest).maybeSingle();
          if(existing){
            await sb.from('clients').update({
              phone:form.phone||null,
              email:form.email||null,
              cin:form.cin||null,
            }).eq('id',existing.id);
          } else {
            await sb.from('clients').insert([{
              nom:form.guest,
              phone:form.phone||null,
              email:form.email||null,
              cin:form.cin||null,
            }]);
          }
        }catch(e){}
      }
      setModal(null);
    }catch(e){showToast("Erreur lors de l'enregistrement","error");}
    finally{setSyncing(false);}
  }

  async function deleteRes(id){
    const r=reservations.find(x=>x.id===id);
    addLog("🗑 Réservation supprimée",{client:r?.guest,chambre:ROOMS.find(rm=>rm.id===r?.roomId)?.number,checkin:r?.checkin,checkout:r?.checkout});
    setSyncing(true);
    try{await sb.from("reservations").delete().eq("id",id);setModal(null);showToast("Réservation supprimée");}
    catch(e){showToast("Erreur","error");}
    finally{setSyncing(false);}
  }

  async function updateStatus(id,status){
    const r=reservations.find(x=>x.id===id);
    const icons={"checkedin":"🛎 Check-in","checkedout":"✈️ Check-out","cancelled":"🚫 Annulation"};
    if(icons[status]) addLog(icons[status],{client:r?.guest,chambre:ROOMS.find(rm=>rm.id===r?.roomId)?.number});
    setSyncing(true);
    try{await sb.from("reservations").update({status}).eq("id",id);showToast("Statut mis à jour ✓");}
    catch(e){showToast("Erreur","error");}
    finally{setSyncing(false);}
  }

  async function markPaid(id){
    const r=reservations.find(x=>x.id===id);
    addLog("💰 Paiement encaissé",{client:r?.guest,chambre:ROOMS.find(rm=>rm.id===r?.roomId)?.number,montant:r?getEffectivePrice(r):null});
    setSyncing(true);
    try{await sb.from("reservations").update({paid:true}).eq("id",id);showToast("Paiement enregistré ✓");}
    catch(e){showToast("Erreur","error");}
    finally{setSyncing(false);}
  }

  async function addResource(){
    if(!newResName.trim())return;
    await sb.from("resources").insert({name:newResName.trim(),role:newResRole,active:true});
    setNewResName("");
    showToast("Ressource ajoutée ✓");
  }

  async function deleteResource(id){
    await sb.from("resources").delete().eq("id",id);
    showToast("Ressource supprimée");
  }

  const filtered=reservations.filter(r=>{
    const term=search.toLowerCase().trim();
    const ms=!term||r.guest.toLowerCase().includes(term)||(r.email||"").toLowerCase().includes(term)||(r.phone||"").toLowerCase().includes(term)||(r.cin||"").toLowerCase().includes(term)||String(r.roomId).includes(term);
    const byStatus=(filterStatus==="all"&&r.status!=="blocked")||r.status===filterStatus;
    const byDateFrom=!filterDateFrom||r.checkin>=filterDateFrom||r.checkout>filterDateFrom;
    const byDateTo=!filterDateTo||r.checkin<=filterDateTo;
    const byPaid=filterPaid==="all"||( filterPaid==="unpaid"&&!r.paid&&!["cancelled","blocked"].includes(r.status))||(filterPaid==="paid"&&r.paid);
    return ms&&byStatus&&byDateFrom&&byDateTo&&byPaid;
  });

  const css=`
    input,select,textarea{font-family:"Jost",sans-serif;background:#fff;border:1.5px solid #d4c5a0;color:#2a1e08;padding:10px 14px;border-radius:6px;width:100%;outline:none;font-size:14px;transition:border-color .2s}
    input:focus,select:focus,textarea:focus{border-color:#c9952a;box-shadow:0 0 0 3px rgba(201,149,42,0.1)}
    input::placeholder,textarea::placeholder{color:#b0a080}
    select option{background:#fff}
    button{cursor:pointer;font-family:"Jost",sans-serif}
    .nav-btn{background:none;border:none;color:#a09060;padding:11px 20px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;transition:all .2s;border-left:3px solid transparent;font-weight:500;text-align:left;width:100%;display:flex;align-items:center;gap:10px;border-radius:0 6px 6px 0}
    .nav-btn:hover{color:#2a1e08;background:#f5efe0}.nav-btn.active{color:#c9952a;border-left-color:#c9952a;background:#fef9f0;font-weight:700}
    .btn-gold{background:#c9952a;color:#fff;border:none;padding:11px 24px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;border-radius:6px;transition:all .2s;font-weight:600;box-shadow:0 2px 8px rgba(201,149,42,0.3)}
    .btn-gold:hover{background:#a87820;box-shadow:0 4px 12px rgba(201,149,42,0.4)}
    .btn-gold:disabled{opacity:.5;cursor:not-allowed}
    .btn-outline{background:#fff;border:1.5px solid #d4c5a0;color:#6a5530;padding:9px 18px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border-radius:6px;transition:all .2s;font-weight:500}
    .btn-outline:hover{border-color:#c9952a;color:#c9952a;background:#fef9f0}
    .btn-red{background:#fff;border:1.5px solid #e0a0a0;color:#9a2020;padding:9px 18px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border-radius:6px;transition:all .2s;font-weight:500}
    .btn-red:hover{background:#fdf0f0;border-color:#c95050}
    .btn-purple{background:#fff;border:1.5px solid #c0a0e0;color:#6b35b8;padding:9px 18px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border-radius:6px;transition:all .2s}
    .btn-purple:hover{background:#f5f0fc}
    .card{background:#fff;border:1px solid #e8ddc8;border-radius:10px;padding:24px;box-shadow:0 2px 8px rgba(42,30,8,0.06)}
    .room-cell{aspect-ratio:auto;min-height:145px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1.5px solid #e0d0b0;border-radius:8px;cursor:pointer;transition:all .2s;gap:1px;padding:8px;position:relative;background:#fff}
    .room-cell:hover{border-color:#c9952a;transform:scale(1.04);box-shadow:0 4px 12px rgba(201,149,42,0.15)}
    .room-free{background:#f8f5ee}
    .room-occupied{background:#fef9ee;border-color:#c9952a88}
    .room-checkedin{background:#f0f5fc;border-color:#5a82c9}
    .room-blocked{background:#f8f0fc;border-color:#9b5de5}
    .res-row{padding:14px 20px;border-bottom:1px solid #f0e8d8;display:grid;grid-template-columns:75px 1fr 95px 110px 120px 120px;align-items:center;gap:10px;transition:background .15s;cursor:pointer}
    .res-row:hover{background:#fef9f0}
    .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-family:"Jost",sans-serif;font-weight:500}
    .modal-overlay{position:fixed;inset:0;background:rgba(42,30,8,0.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;backdrop-filter:blur(4px)}
    .modal{background:#fff;border-radius:12px;padding:32px;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;animation:slideIn .22s ease;box-shadow:0 20px 60px rgba(42,30,8,0.2)}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .form-group label{display:block;font-family:"Jost",sans-serif;font-size:11px;letter-spacing:1.5px;color:#8a7040;text-transform:uppercase;margin-bottom:6px;font-weight:600}
    .toggle-row{display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fef9f0;border:1.5px solid #e8d8b0;border-radius:8px;cursor:pointer;transition:all .2s;margin-bottom:8px}
    .toggle-row:hover{border-color:#c9952a;background:#fef5e4}
    .divider{height:1px;background:#f0e8d8;margin:20px 0}
    .stat-card{background:#fff;border:1px solid #e8ddc8;border-radius:10px;padding:20px 24px;box-shadow:0 2px 8px rgba(42,30,8,0.06)}
    .section-title{font-size:22px;font-weight:400;letter-spacing:1px;color:#2a1e08;margin-bottom:4px}
    .section-sub{font-family:"Jost",sans-serif;font-size:13px;color:#8a7040;margin-bottom:28px}
    .tag{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-family:"Jost",sans-serif;font-size:12px;font-weight:500}
    @keyframes slideIn{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes toastIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
    .toast-wrap{animation:toastIn .3s ease}
    .pulse{animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    td:hover .cal-add{opacity:1!important}
    td:hover{background:#fef9ee!important}
    @media print{
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      html,body{background:#fff!important;margin:0;padding:0;width:210mm}
      #no-print{display:none!important}
      .no-print{display:none!important}
      .modal-overlay{display:none!important}
      .modal{display:none!important}
      .print-a4{display:none!important}
      /* Zone impression globale (facture/devis/bons) */
      #print-zone{display:block!important;background:#fff!important;position:fixed;top:0;left:0;width:210mm;min-height:297mm;z-index:9999}
      #print-zone *{background-color:transparent}
      #print-zone .print-a4{display:block!important;background:#fff!important;width:210mm;min-height:297mm;padding:12mm 14mm;box-sizing:border-box;font-family:"Inter",Arial,sans-serif;font-size:10pt;color:#000;margin:0}
      /* Zone impression dans modaux (facture réservation, facture libre, devis) */
      .print-only{display:none!important}
      .print-only.print-a4{display:block!important;background:#fff!important;position:fixed;top:0;left:0;width:210mm;min-height:297mm;padding:12mm 14mm;box-sizing:border-box;font-family:"Inter",Arial,sans-serif;font-size:10pt;color:#000;margin:0;z-index:9999}
      @page{size:A4 portrait;margin:0}
    }
    .print-only{display:none}
    .print-a4{display:none}
    .print-only{display:none}
  `;

  if(loading)return(
    <div style={{fontFamily:'"Cormorant Garamond",Georgia,serif',minHeight:"100vh",background:"#f5f0e8",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{css}</style>
      <img src={LOGO} alt="Impavid" style={{height:64,width:64,objectFit:"cover",borderRadius:8,boxShadow:"0 4px 16px rgba(42,30,8,0.15)"}}/>
      <p style={{fontSize:22,letterSpacing:4,color:"#c9952a",fontWeight:300}}>IMPAVID HOTEL</p>
      <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#8a7040",letterSpacing:2}} className="pulse">Chargement...</p>
    </div>
  );

  return(
    <>
    <div style={{fontFamily:'"Cormorant Garamond",Georgia,serif',minHeight:"100vh",background:"#f5f0e8",color:"#2a1e08",display:"flex"}}>
      <style>{css}</style>

      {/* ── SIDEBAR GAUCHE ── */}
      <aside id="no-print" style={{width:210,minWidth:210,background:"#fff",borderRight:"1px solid #e8ddc8",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,height:"100vh",zIndex:50,boxShadow:"2px 0 12px rgba(42,30,8,0.07)"}}>
        {/* Logo */}
        <div style={{padding:"22px 20px 18px",borderBottom:"1px solid #f0e8d8",display:"flex",alignItems:"center",gap:12}}>
          <img src={LOGO} alt="Impavid" style={{height:40,width:40,objectFit:"cover",borderRadius:6,border:"2px solid #e8d0a0",flexShrink:0}}/>
          <div>
            <p style={{fontSize:14,letterSpacing:4,color:"#c9952a",fontWeight:400,lineHeight:1.1}}>IMPAVID</p>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:8,letterSpacing:2,color:"#b0a070",textTransform:"uppercase"}}>Séjour Urbain Raffiné</p>
          </div>
        </div>
        {/* Navigation */}
        <nav style={{flex:1,padding:"12px 8px",overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
          {[
            ["dashboard","🏠","Tableau de Bord"],
            ["rooms","🛏","Chambres"],
            ["calendrier","📅","Calendrier"],
            ["reservations","📋","Réservations"],
            ["historique","📒","Historique"],
            ["archives","📁","Archives"],
            ["groupes","🏢","Groupes"],
            ["police","📋","Livre de Police"],
            ["contrats","🤝","Contrats"],
            ["charges","💸","Charges"],
            ["menage","🧹","Ménage"],
            ["linge","🧺","Linge"],
            ["resources","👥","Ressources"],
          ].map(([v,icon,l])=>(
            <button key={v} className={"nav-btn "+(view===v?"active":"")} onClick={()=>setView(v)}>
              <span style={{fontSize:15,flexShrink:0}}>{icon}</span>
              <span>{l}</span>
            </button>
          ))}
        </nav>
        {/* Statut connexion + utilisateur */}
        <div style={{padding:"14px 20px",borderTop:"1px solid #f0e8d8"}}>
          <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:syncing?"#c9952a":"#5a9e6f",display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:syncing?"#c9952a":"#5a9e6f",display:"inline-block",flexShrink:0}} className={syncing?"pulse":""}/>
            {syncing?"Synchronisation...":"Connecté"}
          </span>
          <div style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</div>
          {userRole==="gerant"&&(
            <button onClick={()=>{setShowJournal(true);loadLogs();}} style={{width:"100%",background:"#f0f4ff",border:"1px solid #c0cfee",color:"#3a5fc8",borderRadius:6,padding:"7px 0",fontSize:11,fontFamily:'"Jost",sans-serif',fontWeight:600,cursor:"pointer",letterSpacing:.5,marginBottom:6}}>
              📋 Journal d'activité
            </button>
          )}
          <button onClick={onLogout} style={{width:"100%",background:"#fdf0f0",border:"1px solid #e0a0a0",color:"#9a2020",borderRadius:6,padding:"7px 0",fontSize:11,fontFamily:'"Jost",sans-serif',fontWeight:600,cursor:"pointer",letterSpacing:.5}}>
            🚪 Déconnexion
          </button>
        </div>
      </aside>

      {/* ── CONTENU PRINCIPAL ── */}
      <div style={{marginLeft:210,flex:1,display:"flex",flexDirection:"column",minHeight:"100vh"}}>

        {/* Topbar actions */}
        <header id="no-print" style={{background:"#fff",borderBottom:"1px solid #e8ddc8",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"flex-end",height:60,position:"sticky",top:0,zIndex:40,boxShadow:"0 2px 8px rgba(42,30,8,0.06)",gap:10}}>
          <button onClick={loadAll} title="Actualiser" style={{background:"none",border:"1px solid #e0d0b0",color:"#8a7040",padding:"6px 10px",borderRadius:6,fontSize:14,cursor:"pointer",fontFamily:'"Jost",sans-serif'}}>🔄</button>
          <button className="btn-outline" onClick={openFreeInvoice}>🧾 Facture libre</button>
          <button className="btn-outline" onClick={openDevis}>📋 Devis Groupe</button>
          <button className="btn-outline" style={{background:"#fff8ee",borderColor:"#e8b84b",color:"#8a5c10"}} onClick={()=>doPrint({type:"bonsVierges"})}>🍽 Bons Restaurant</button>
          <button className="btn-gold" onClick={()=>openNew()}>+ Réservation</button>
        </header>

      {/* TOAST */}
      {toast&&(
        <div className="no-print toast-wrap" style={{position:"fixed",top:20,right:20,zIndex:200,background:toast.type==="error"?"#fff5f5":"#f0faf5",border:"1.5px solid "+(toast.type==="error"?"#e08080":"#5a9e6f"),borderRadius:8,padding:"13px 20px",fontFamily:'"Jost",sans-serif',fontSize:14,color:toast.type==="error"?"#9a2020":"#2d7a4f",boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
          {toast.msg}
        </div>
      )}

      <main id="no-print" style={{padding:"28px 32px",flex:1}}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard"&&(
          <div>
            <p className="section-title">Tableau de Bord</p>
            <p className="section-sub">{new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:16}}>
              {[
                {label:"Chambres Occupées",value:occupiedRooms.length,total:"/20",color:"#1a4f8a",bg:"#d0e4f8"},
                {label:"Chambres Libres",value:freeRooms.length,total:"/20",color:"#2d7a4f",bg:"#d4f0e0"},
                {label:"En Attente",value:reservations.filter(r=>r.status==="pending").length,total:" résa",color:"#b07d1a",bg:"#fef3d0"},
                {label:"Revenus payés",value:FMT(reservations.filter(r=>r.paid).reduce((a,r)=>a+getEffectivePrice(r),0)),total:"",color:"#c9952a",bg:"#fef3d0"},
              ].map((s,i)=>(
                <div key={i} className="stat-card" style={{borderTop:"3px solid "+s.color}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{s.label}</p>
                  <p style={{fontSize:typeof s.value==="string"?20:36,fontWeight:300,color:s.color}}>{s.value}<span style={{fontSize:15,color:"#b0a070"}}>{s.total}</span></p>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:28}}>
              {/* Suites */}
              <div className="stat-card" style={{borderTop:"3px solid #c9952a"}}>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>✨ Suites</p>
                <p style={{fontSize:32,fontWeight:300,color:"#c9952a"}}>{freeSuites.length}<span style={{fontSize:14,color:"#b0a070"}}>/{SUITES.length} dispo</span></p>
                <div style={{marginTop:10}}>
                  {SUITES.map(s=>{const occ=isOcc(s.id,reservations);return(
                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:occ?"#c95050":"#5a9e6f"}}/>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>Ch. {s.number} — {occ?"occupée":"libre"}</span>
                    </div>
                  );})}
                </div>
              </div>

              {/* Lit bébé */}
              <div className="stat-card" style={{borderTop:"3px solid "+(babyBedOccupied?"#e07820":"#5a9e6f")}}>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>🍼 Lit Bébé</p>
                <p style={{fontSize:22,fontWeight:400,color:babyBedOccupied?"#e07820":"#5a9e6f"}}>{babyBedOccupied?"Occupé":"Disponible"}</p>
                {activeBabyBed&&(()=>{const room=ROOMS.find(r=>r.id===activeBabyBed.roomId);return(
                  <div style={{marginTop:10,background:"#fef5e8",borderRadius:6,padding:"8px 12px"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a5520",fontWeight:600}}>Ch. {room?.number} — {activeBabyBed.guest.split(" ")[0]}</p>
                    {activeBabyBed.babyBedLocation&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b07840",marginTop:2}}>📍 {activeBabyBed.babyBedLocation}</p>}
                  </div>
                );})()}
              </div>

              {/* Réclamations */}
              <div className="stat-card" style={{borderTop:"3px solid "+(claims.length?"#c95050":"#d4c5a0"),cursor:claims.length?"pointer":"default"}} onClick={()=>claims.length&&(setView("reservations"),setFilterStatus("all"))}>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>⚠ Réclamations</p>
                <p style={{fontSize:36,fontWeight:300,color:claims.length?"#c95050":"#b0a070"}}>{claims.length}</p>
                {claims.slice(0,2).map(r=>{const room=ROOMS.find(rm=>rm.id===r.roomId);return(
                  <div key={r.id} style={{marginTop:6,background:"#fdf0f0",borderRadius:6,padding:"6px 10px"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#9a2020"}}>Ch. {room?.number} — {r.claim.slice(0,30)}{r.claim.length>30?"…":""}</p>
                  </div>
                );})}
              </div>

              {/* ☕ Petit-Déjeuner */}
              {(()=>{
                const now=new Date();
                const h=now.getHours();
                const TOMORROW=new Date(now);
                TOMORROW.setDate(TOMORROW.getDate()+1);
                const TOMORROW_STR=TOMORROW.toISOString().split("T")[0];
                const YESTERDAY=new Date(now);
                YESTERDAY.setDate(YESTERDAY.getDate()-1);
                const YESTERDAY_STR=YESTERDAY.toISOString().split("T")[0];
                const isPDJ=h>=6&&h<11;
                // 6h-11h (service) : ceux qui ont dormi la nuit dernière
                //   checkin < aujourd'hui ET checkout >= aujourd'hui
                // après 11h (PDJ demain) : ceux qui dorment cette nuit
                //   checkin <= aujourd'hui ET checkout > aujourd'hui
                const resPDJ=reservations.filter(r=>
                  ["confirmed","checkedin","checkedout"].includes(r.status)&&
                  (isPDJ
                    ? r.checkin<getToday()&&r.checkout>=getToday()
                    : r.checkin<=getToday()&&r.checkout>getToday()
                  )
                );
                const totalPersonnes=resPDJ.reduce((a,r)=>{
                  const adults=parseInt(r.adults)||1;
                  const children=parseInt(r.children)||0;
                  return a+adults+children;
                },0);
                const totalAdultes=resPDJ.reduce((a,r)=>a+(parseInt(r.adults)||1),0);
                const totalEnfants=resPDJ.reduce((a,r)=>a+(parseInt(r.children)||0),0);
                return(
                  <div className="stat-card" style={{borderTop:"3px solid "+(isPDJ?"#c9952a":"#a0785a")}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:6,fontWeight:600}}>
                      ☕ Petit-Déjeuner
                    </p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",marginBottom:8}}>
                      {isPDJ
                        ? <span style={{color:"#5a9e6f",fontWeight:600}}>🟢 En cours · 6h–11h</span>
                        : <span>Demain matin · {new Date(TOMORROW_STR).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</span>
                      }
                    </p>
                    <p style={{fontSize:32,fontWeight:300,color:"#c9952a"}}>{totalPersonnes}<span style={{fontSize:13,color:"#b0a070"}}> pers.</span></p>
                    <div style={{marginTop:6,display:"flex",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fef3d0",color:"#b07d1a",padding:"2px 8px",borderRadius:10}}>👤 {totalAdultes} adultes</span>
                      {totalEnfants>0&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#e8f5ee",color:"#2d7a4f",padding:"2px 8px",borderRadius:10}}>🧒 {totalEnfants} enfants</span>}
                    </div>
                    <div style={{marginTop:10}}>
                      {resPDJ.slice(0,4).map(r=>{const room=ROOMS.find(x=>x.id===r.roomId);const tot=(parseInt(r.adults)||1)+(parseInt(r.children)||0);return(
                        <div key={r.id} style={{display:"flex",justifyContent:"space-between",marginBottom:3,padding:"3px 0",borderBottom:"1px solid #f0e8d8"}}>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>Ch. {room?.number} — {r.guest.split(" ")[0]}</span>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:600,color:"#c9952a"}}>{tot} pers.</span>
                        </div>
                      );})}
                      {resPDJ.length>4&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070",marginTop:4}}>+{resPDJ.length-4} autres chambres</p>}
                      {resPDJ.length===0&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070",marginTop:4}}>Aucun petit-déjeuner demain</p>}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
              {(()=>{
                return(<>
              <div className="card">
                <h2 style={{fontSize:18,fontWeight:500,letterSpacing:1,marginBottom:18,color:"#c9952a"}}>Arrivées aujourd'hui</h2>
                {reservations.filter(r=>r.checkin===getToday()&&!["cancelled","blocked"].includes(r.status)).length===0
                  ?<p style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#b0a070"}}>Aucune arrivée prévue</p>
                  :reservations.filter(r=>r.checkin===getToday()&&!["cancelled","blocked"].includes(r.status)).map(r=>{
                    const room=ROOMS.find(rm=>rm.id===r.roomId);
                    return(
                      <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f0e8d8",cursor:"pointer"}} onClick={()=>openDetail(r)}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <p style={{fontSize:16,fontWeight:500}}>{r.guest}</p>
                            {r.claim&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fad4d4",color:"#9a2020",padding:"2px 8px",borderRadius:10}}>⚠</span>}
                            {r.babyBed&&<span>🍼</span>}
                            {r.extraBed&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fef3d0",color:"#b07d1a",padding:"2px 8px",borderRadius:10}}>+lit</span>}
                          </div>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>Ch. {room?.number} · {room?.type}</p>
                        </div>
                        <span className="badge" style={{background:STATUS[r.status].bg,color:STATUS[r.status].color}}>{STATUS[r.status].label}</span>
                      </div>
                    );
                  })}
              </div>
              <div className="card">
                <h2 style={{fontSize:18,fontWeight:500,letterSpacing:1,marginBottom:18,color:"#c9952a"}}>Départs aujourd'hui</h2>
                {reservations.filter(r=>r.checkout===getToday()&&!["cancelled","blocked"].includes(r.status)).length===0
                  ?<p style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#b0a070"}}>Aucun départ prévu</p>
                  :reservations.filter(r=>r.checkout===getToday()&&!["cancelled","blocked"].includes(r.status)).map(r=>{
                    const room=ROOMS.find(rm=>rm.id===r.roomId);
                    return(
                      <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f0e8d8",cursor:"pointer"}} onClick={()=>openDetail(r)}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <p style={{fontSize:16,fontWeight:500}}>{r.guest}</p>
                            {r.claim&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fad4d4",color:"#9a2020",padding:"2px 8px",borderRadius:10}}>⚠</span>}
                          </div>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>Ch. {room?.number} · {FMT(getEffectivePrice(r))}</p>
                        </div>
                        <span className="badge" style={{background:r.paid?"#d4f0e0":"#fad4d4",color:r.paid?"#2d7a4f":"#9a2020"}}>{r.paid?"✓ Payé":"À encaisser"}</span>
                      </div>
                    );
                  })}
              </div>
                </>);
              })()}
            </div>
          </div>
        )}

        {/* ── CHAMBRES ── */}
        {view==="rooms"&&(
          <div>
            <p className="section-title">Plan des Chambres</p>

            {/* ── BARRE DE RECHERCHE DISPONIBILITÉ ── */}
            <div style={{background:"#fff",border:"1.5px solid #e8d8b0",borderRadius:12,padding:"18px 24px",marginBottom:24,display:"flex",alignItems:"flex-end",gap:16,flexWrap:"wrap",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
              <div style={{flex:1,minWidth:160}}>
                <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Arrivée</label>
                <input type="date" value={searchDates.checkin} onChange={e=>setSearchDates(s=>({...s,checkin:e.target.value}))} style={{fontFamily:'"Jost",sans-serif'}}/>
              </div>
              <div style={{flex:1,minWidth:160}}>
                <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Départ</label>
                <input type="date" value={searchDates.checkout} onChange={e=>setSearchDates(s=>({...s,checkout:e.target.value}))} style={{fontFamily:'"Jost",sans-serif'}}/>
              </div>
              {searchDates.checkin&&searchDates.checkout&&searchDates.checkin<searchDates.checkout&&(()=>{
                const n=nights(searchDates.checkin,searchDates.checkout);
                const dispos=ROOMS.filter(r=>!isOccForDates(r.id,reservations,searchDates.checkin,searchDates.checkout));
                return(
                  <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <div style={{background:"#d4f0e0",borderRadius:8,padding:"10px 18px",textAlign:"center"}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:22,fontWeight:700,color:"#2d7a4f"}}>{dispos.length}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#2d7a4f",fontWeight:600}}>chambres libres</p>
                    </div>
                    <div style={{background:"#fef3d0",borderRadius:8,padding:"10px 18px",textAlign:"center"}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:22,fontWeight:700,color:"#b07d1a"}}>{ROOMS.length-dispos.length}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b07d1a",fontWeight:600}}>occupées</p>
                    </div>
                    <div style={{background:"#faf8f5",borderRadius:8,padding:"10px 18px",textAlign:"center"}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:22,fontWeight:700,color:"#c9952a"}}>{n}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",fontWeight:600}}>nuit{n>1?"s":""}</p>
                    </div>
                    <button className="btn-gold" onClick={()=>setSearchDates({checkin:"",checkout:""})} style={{fontSize:12,padding:"8px 14px"}}>✕ Effacer</button>
                  </div>
                );
              })()}
              {(!searchDates.checkin||!searchDates.checkout)&&(
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#b0a070",alignSelf:"center"}}>👆 Choisissez des dates pour voir les disponibilités</p>
              )}
            </div>

            {/* Légende */}
            <div style={{display:"flex",gap:20,marginBottom:24,flexWrap:"wrap"}}>
              {[
                ["#f8f5ee","#e0d0b0","Libre"],
                ["#d4f0e0","#5a9e6f","Libre (dates)"],
                ["#fef9ee","#c9952a88","Réservée"],
                ["#fce8e8","#c95050","Occupée (dates)"],
                ["#f0f5fc","#5a82c9","Présent"],
                ["#f8f0fc","#9b5de5","Bloquée"]
              ].map(([bg,border,label])=>(
                (!searchDates.checkin||!searchDates.checkout||label!=="Libre"&&label!=="Réservée")&&(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:16,height:16,borderRadius:4,background:bg,border:"1.5px solid "+border}}/>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{label}</span>
                  </div>
                )
              ))}
            </div>

            {[1,2,3,4].map(floor=>{
              const floorRooms=ROOMS.filter(r=>r.floor===floor);
              return(
                <div key={floor} style={{marginBottom:32}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,letterSpacing:3,color:"#8a7040",textTransform:"uppercase",marginBottom:14,fontWeight:600}}>Étage {floor} — {floorRooms.length} chambres</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat("+floorRooms.length+",minmax(100px,140px))",gap:12}}>
                    {floorRooms.map(room=>{
                      const res=getRoomRes(room.id,reservations);
                      const isBlocked=res?.status==="blocked";
                      const isCI=res?.status==="checkedin";
                      const occToday=!!res;
                      // Disponibilité selon les dates recherchées
                      const hasSearchDates=searchDates.checkin&&searchDates.checkout&&searchDates.checkin<searchDates.checkout;
                      const occSearch=hasSearchDates?isOccForDates(room.id,reservations,searchDates.checkin,searchDates.checkout):null;
                      const libreSearch=hasSearchDates&&!occSearch;

                      let cls="room-cell ";
                      if(isBlocked) cls+="room-blocked";
                      else if(hasSearchDates){
                        if(occSearch) cls+="room-occupied";
                        else cls+="room-free";
                      }
                      else if(isCI) cls+="room-checkedin";
                      else if(occToday) cls+="room-occupied";
                      else cls+="room-free";

                      // Bordure verte si libre pour les dates recherchées
                      const extraStyle=libreSearch?{borderColor:"#5a9e6f",borderWidth:2,background:"#f0faf5"}:
                                       (hasSearchDates&&occSearch)?{borderColor:"#c95050",borderWidth:2,background:"#fef0f0"}:{};

                      return(
                        <div key={room.id} className={cls} style={{...extraStyle}}>
                          {res?.claim&&<span style={{position:"absolute",top:5,right:5,fontSize:11}}>⚠</span>}
                          {res?.babyBed&&<span style={{position:"absolute",top:5,left:5,fontSize:11}}>🍼</span>}
                          {libreSearch&&<span style={{position:"absolute",top:4,right:4,fontSize:12}}>✅</span>}
                          {hasSearchDates&&occSearch&&!isBlocked&&<span style={{position:"absolute",top:4,right:4,fontSize:11}}>🚫</span>}
                          {isBlocked
                            ? <span style={{fontSize:22}}>🔒</span>
                            : <BedIcon type={room.type} size={36}/>
                          }
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:20,fontWeight:600,color:isBlocked?"#6b35b8":libreSearch?"#2d7a4f":(hasSearchDates&&occSearch)?"#c95050":occToday?(isCI?"#1a4f8a":"#c9952a"):"#2a1e08"}}>{room.number}</span>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:1,color:"#8a7040",textTransform:"uppercase"}}>{room.type}</span>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:8,color:"#b0a080",fontStyle:"italic"}}>{room.bedType}</span>
                          {!hasSearchDates&&res&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:isBlocked?"#9b5de5":isCI?"#1a4f8a":"#c9952a"}}>{isBlocked?"Bloquée":res.guest.split(" ")[0]}</span>}
                          {!hasSearchDates&&res?.assignedMenage&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040"}}>🧹 {res.assignedMenage}</span>}
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{room.price} TND</span>
                          {/* Bouton réserver avec dates pré-remplies */}
                          {!isBlocked&&(libreSearch||(!hasSearchDates&&!occToday))&&(
                            <div style={{display:"flex",gap:4,marginTop:4}}>
                              <button onClick={e=>{
                                e.stopPropagation();
                                const f={roomId:room.id,guest:"",email:"",phone:"",
                                  checkin:searchDates.checkin||TODAY,
                                  checkout:searchDates.checkout||"",
                                  adults:1,children:0,status:"confirmed",paid:false,
                                  notes:"",extraBed:false,babyBed:false,babyBedLocation:"",
                                  claim:"",assignedMenage:""};
                                setForm(f);setModal({type:"new"});
                              }} style={{fontSize:9,padding:"2px 6px",background:"#c9952a",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontFamily:'"Jost",sans-serif'}}>Réserver</button>
                              <button onClick={e=>{e.stopPropagation();openBlock(room.id);}} style={{fontSize:9,padding:"2px 6px",background:"#f0e8fc",color:"#6b35b8",border:"1px solid #9b5de5",borderRadius:4,cursor:"pointer",fontFamily:'"Jost",sans-serif'}}>🔒</button>
                            </div>
                          )}
                          {!hasSearchDates&&occToday&&<button onClick={()=>openDetail(res)} style={{fontSize:9,padding:"2px 8px",background:"transparent",color:"#8a7040",border:"1px solid #d4c5a0",borderRadius:4,cursor:"pointer",fontFamily:'"Jost",sans-serif',marginTop:4}}>Détail</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CALENDRIER ── */}
        {view==="calendrier"&&(()=>{
          const now=new Date();
          const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
          const days=Array.from({length:daysInMonth},(_,i)=>{
            const d=new Date(calYear,calMonth,i+1);
            return d.toISOString().split("T")[0];
          });

          const MONTHS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
          const DAY_LABELS=["L","M","M","J","V","S","D"];

          // Pour chaque chambre et chaque jour : trouver si occupée
          function getStatus(roomId, dateStr){
            const resDepart=reservations.find(r=>
              r.roomId===roomId&&
              ["confirmed","checkedin"].includes(r.status)&&
              r.checkout===dateStr&&
              r.checkin<dateStr
            );
            if(resDepart) return "depart";
            const res=reservations.find(r=>
              r.roomId===roomId&&
              ["confirmed","checkedin","pending","blocked","checkedout"].includes(r.status)&&
              r.checkin<=dateStr&&r.checkout>dateStr
            );
            if(!res) return null;
            if(res.groupeId) return "groupe";
            return res.status;
          }

          const STATUS_COLORS={
            confirmed:"#c9952a",
            checkedin:"#1a4f8a",
            pending:"#b07d1a",
            blocked:"#6b35b8",
            checkedout:"#7a9a7a",
            depart:"#e05a20",
            groupe:"#0f7a6b",
          };
          const STATUS_BG={
            confirmed:"#fef3d0",
            checkedin:"#d0e4f8",
            pending:"#fef3d0",
            blocked:"#ead4f8",
            checkedout:"#e8f0e8",
            depart:"#fde8e0",
            groupe:"#d0f0eb",
          };

          return(
            <div>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <p className="section-title">Calendrier des Chambres</p>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <button onClick={()=>{
                    if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}
                    else setCalMonth(m=>m-1);
                  }} style={{background:"#fff",border:"1px solid #e0d0b0",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:16,color:"#8a7040"}}>‹</button>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:15,fontWeight:600,color:"#2a1e08",minWidth:160,textAlign:"center"}}>{MONTHS[calMonth]} {calYear}</p>
                  <button onClick={()=>{
                    if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}
                    else setCalMonth(m=>m+1);
                  }} style={{background:"#fff",border:"1px solid #e0d0b0",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:16,color:"#8a7040"}}>›</button>
                </div>
                {/* Légende */}
                <div style={{display:"flex",gap:12}}>
                  {[["Réservée","#fef3d0","#c9952a"],["Présent","#d0e4f8","#1a4f8a"],["En attente","#fef3d0","#b07d1a"],["Bloquée","#ead4f8","#6b35b8"],["Départ ce jour","#fde8e0","#e05a20"],["Passée","#e8f0e8","#7a9a7a"]].map(([l,bg,c])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:14,height:14,borderRadius:3,background:bg,border:"1.5px solid "+c}}/>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calendrier */}
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:900,tableLayout:"fixed"}}>
                  <thead>
                    {/* Ligne jours */}
                    <tr>
                      <th style={{width:90,padding:"8px 10px",background:"#faf8f5",border:"1px solid #e8d8b0",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",textAlign:"left",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Chambre</th>
                      {days.map(d=>{
                        const date=new Date(d+"T12:00:00");
                        const dow=date.getDay();
                        const isToday=d===getToday();
                        const isWeekend=dow===0||dow===6;
                        return(
                          <th key={d} style={{padding:"4px 1px",background:isToday?"#fef3d0":isWeekend?"#faf5ee":"#faf8f5",border:"1px solid #e8d8b0",textAlign:"center",minWidth:26}}>
                            <div style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:isToday?"#c9952a":"#b0a070",fontWeight:isToday?700:400}}>{DAY_LABELS[(dow+6)%7]}</div>
                            <div style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:isToday?700:500,color:isToday?"#c9952a":isWeekend?"#8a7040":"#2a1e08"}}>{date.getDate()}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {[1,2,3,4].map(floor=>{
                      const floorRooms=ROOMS.filter(r=>r.floor===floor);
                      return(
                        <React.Fragment key={floor}>
                          {/* Étage header */}
                          <tr>
                            <td colSpan={days.length+1} style={{padding:"6px 10px",background:"#2a1e08",color:"#c9952a",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>
                              Étage {floor}
                            </td>
                          </tr>
                          {floorRooms.map(room=>(
                            <tr key={room.id}>
                              <td style={{padding:"4px 8px",background:"#faf8f5",border:"1px solid #e8d8b0",fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:600,color:"#2a1e08",whiteSpace:"nowrap"}}>
                                <span style={{color:"#c9952a",fontWeight:700}}>{room.number}</span>
                                <span style={{fontSize:9,color:"#8a7040",display:"block"}}>{room.type}</span>
                              </td>
                              {days.map(d=>{
                                const status=getStatus(room.id,d);
                                const res=reservations.find(r=>
                                  r.roomId===room.id&&
                                  ["confirmed","checkedin","pending","blocked","checkedout"].includes(r.status)&&
                                  r.checkin<=d&&r.checkout>=d
                                );
                                const isToday=d===getToday();
                                const prevD=new Date(d+"T12:00:00");prevD.setDate(prevD.getDate()-1);
                                const prevStr=prevD.toISOString().split("T")[0];
                                const nextD=new Date(d+"T12:00:00");nextD.setDate(nextD.getDate()+1);
                                const nextStr=nextD.toISOString().split("T")[0];
                                const prevSt=getStatus(room.id,prevStr);
                                const nextSt=getStatus(room.id,nextStr);
                                const isStart=status&&!prevSt;
                                const isEnd=status&&!nextSt;

                                // Clic : si libre → nouvelle résa, si départ ce jour → nouvelle résa, si occupé → détail
                                const handleClick=()=>{
                                  if(status==="depart"){
                                    // Départ ce jour → proposer nouvelle résa à partir de aujourd'hui
                                    setForm({roomId:room.id,guest:"",email:"",phone:"",
                                      checkin:d,checkout:"",
                                      adults:1,children:0,status:"confirmed",paid:false,
                                      notes:"",extraBed:false,babyBed:false,
                                      babyBedLocation:"",claim:"",assignedMenage:"",
                                      pension:"lpd",billingType:null,remise:0,customPrice:undefined});
                                    setModal({type:"new"});
                                  } else if(res){
                                    openDetail(res);
                                  } else {
                                    setForm({roomId:room.id,guest:"",email:"",phone:"",
                                      checkin:d,checkout:"",
                                      adults:1,children:0,status:"confirmed",paid:false,
                                      notes:"",extraBed:false,babyBed:false,
                                      babyBedLocation:"",claim:"",assignedMenage:"",
                                      pension:"lpd",billingType:null,remise:0,customPrice:undefined});
                                    setModal({type:"new"});
                                  }
                                };

                                return(
                                  <td key={d}
                                    onClick={handleClick}
                                    title={status==="depart"?"Départ ce jour — cliquer pour nouvelle réservation":status?(res?.guest||"")+" ("+res?.checkin+" → "+res?.checkout+")":"Réserver Ch."+room.number+" le "+d}
                                    style={{
                                      padding:"3px 1px",
                                      border:"1px solid #e8d8b0",
                                      background:status?STATUS_BG[status]:isToday?"#fffbf0":"#fff",
                                      textAlign:"center",
                                      position:"relative",
                                      cursor:(status==="depart"||!status)?"pointer":"pointer",
                                    }}>
                                    {status&&(
                                      <div style={{
                                        height:22,
                                        background:STATUS_COLORS[status],
                                        borderRadius:isStart&&isEnd?"4px":isStart?"4px 0 0 4px":isEnd?"0 4px 4px 0":"0",
                                        margin:isStart?"0 0 0 2px":isEnd?"0 2px 0 0":"0",
                                        opacity:.85,
                                        display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
                                      }}>
                                        {isStart&&res?.guest&&(
                                          <span style={{fontSize:8,color:"#fff",fontWeight:700,paddingLeft:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",fontFamily:'"Jost",sans-serif'}}>
                                            {res.groupeId?"🏢 ":""}{res.guest.split(" ")[0]}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {isToday&&!status&&(
                                      <div style={{width:2,height:22,background:"#c9952a",margin:"0 auto",borderRadius:2}}/>
                                    )}
                                    {!status&&!isToday&&(
                                      <div className="cal-add" style={{height:22,display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .15s"}}>
                                        <span style={{fontSize:10,color:"#c9952a",fontWeight:700}}>+</span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070",marginTop:12,textAlign:"center"}}>
                Cliquez sur une case libre pour créer une réservation · Cliquez sur une réservation pour voir le détail
              </p>
            </div>
          );
        })()}

        {/* ── RÉSERVATIONS ── */}
        {view==="reservations"&&(()=>{
          const G2="#8B6434";
          // ── Calculs bilan ─────────────────────────────
          const now=new Date();
          // Semaine courante (lun→dim)
          const dayOfWeek=now.getDay()===0?6:now.getDay()-1;
          const weekStart=new Date(now); weekStart.setDate(now.getDate()-dayOfWeek); weekStart.setHours(0,0,0,0);
          const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6); weekEnd.setHours(23,59,59,999);
          // Mois courant
          const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
          const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);

          function bilanPeriod(dateStart,dateEnd){
            const ds=dateStart.toISOString().slice(0,10);
            const de=dateEnd.toISOString().slice(0,10);
            const list=reservations.filter(r=>
              ["confirmed","checkedin","checkedout"].includes(r.status)&&
              r.checkin<=de&&r.checkout>ds
            );
            const revenus=list.reduce((a,r)=>a+getEffectivePrice(r),0);
            const encaisse=list.filter(r=>r.paid).reduce((a,r)=>a+getEffectivePrice(r),0);
            const chambresSet=new Set(list.map(r=>r.roomId));
            return{count:list.length,chambres:chambresSet.size,revenus:Math.round(revenus*100)/100,encaisse:Math.round(encaisse*100)/100,list};
          }

          const bilanSem=bilanPeriod(weekStart,weekEnd);
          const bilanMois=bilanPeriod(monthStart,monthEnd);

          const moisNom=now.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
          const semStr=weekStart.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" – "+weekEnd.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});

          return(
          <div>
            {/* ── TITRE + RECHERCHE ── */}
            <div style={{marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <p className="section-title">Réservations</p>
                  <p className="section-sub">{filtered.length} résultat{filtered.length>1?"s":""}</p>
                </div>
                <button className="btn-gold" onClick={openNew}>+ Nouvelle réservation</button>
              </div>

              {/* Barre de recherche + filtres */}
              <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:12,alignItems:"end",boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
                {/* Recherche par nom */}
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>🔍 Client / CIN / Email / Tél.</label>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher par nom, CIN, email, téléphone…" style={{width:"100%"}}/>
                </div>
                {/* Filtre par date d'arrivée */}
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>📅 Du (arrivée)</label>
                  <input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} style={{width:"100%"}}/>
                </div>
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>📅 Au (arrivée)</label>
                  <input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} style={{width:"100%"}}/>
                </div>
                {/* Statut */}
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>📋 Statut</label>
                  <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:"100%"}}>
                    <option value="all">Tous statuts</option>
                    {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {/* Paiement */}
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>💳 Paiement</label>
                  <select value={filterPaid} onChange={e=>setFilterPaid(e.target.value)} style={{width:"100%"}}>
                    <option value="all">Tous</option>
                    <option value="unpaid">⏳ Impayés</option>
                    <option value="paid">✅ Payés</option>
                  </select>
                  {(search||filterDateFrom||filterDateTo||filterStatus!=="all"||filterPaid!=="all")&&(
                    <button className="btn-outline" style={{fontSize:11,padding:"5px 12px"}}
                      onClick={()=>{setSearch("");setFilterDateFrom("");setFilterDateTo("");setFilterStatus("all");setFilterPaid("all");}}>
                      ✕ Réinitialiser
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── BILAN SEMAINE + MOIS ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
              {[
                {label:"Semaine en cours",sub:semStr,bilan:bilanSem,color:"#5a7fc8",bg:"#f0f4ff",border:"#c0cfee"},
                {label:"Mois en cours",sub:moisNom,bilan:bilanMois,color:"#2a8a5a",bg:"#f0faf4",border:"#a0d8b8"},
              ].map(({label,sub,bilan,color,bg,border})=>(
                <div key={label} style={{background:bg,border:"1.5px solid "+border,borderRadius:12,padding:"18px 22px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                    <div>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:1.2,marginBottom:2}}>{label}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>{sub}</p>
                    </div>
                    <span style={{fontSize:22}}>{label.includes("Semaine")?"📅":"📆"}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:10}}>
                    {[
                      {k:"Réservations",v:bilan.count,unit:"",icon:"🛎"},
                      {k:"Chambres",v:bilan.chambres,unit:"",icon:"🚪"},
                    ].map(({k,v,unit,icon})=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.7)",borderRadius:8,padding:"10px 12px",border:"1px solid "+border}}>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{icon} {k}</p>
                        <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:22,fontWeight:700,color:"#2a1e08",lineHeight:1}}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {[
                      {k:"CA Total",v:bilan.revenus.toFixed(3),icon:"💰",c:"#2a1e08"},
                      {k:"Encaissé",v:bilan.encaisse.toFixed(3),icon:"✅",c:"#2d7a4f"},
                      {k:"En attente",v:(bilan.revenus-bilan.encaisse).toFixed(3),icon:"⏳",c:"#c95050",action:true},
                    ].map(({k,v,icon,c,action})=>(
                      <div key={k} onClick={action?()=>{setView("reservations");setFilterPaid("unpaid");}:undefined} style={{background:"rgba(255,255,255,0.7)",borderRadius:8,padding:"10px 12px",border:"1px solid "+border,cursor:action?"pointer":"default"}}>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{icon} {k}</p>
                        <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:18,fontWeight:700,color:c,lineHeight:1}}>{v}</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040",marginTop:2}}>TND</p>
                      </div>
                    ))}
                  </div>
                  {bilan.revenus>0&&(
                    <div style={{marginTop:10,background:"rgba(255,255,255,0.5)",borderRadius:6,padding:"7px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:color,fontWeight:600}}>
                          Taux d'encaissement : {Math.round(bilan.encaisse/bilan.revenus*100)}%
                        </span>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#c95050"}}>
                          {(bilan.revenus-bilan.encaisse).toFixed(3)} TND restants
                        </span>
                      </div>
                      <div style={{height:8,background:"rgba(0,0,0,0.08)",borderRadius:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:Math.round(bilan.encaisse/bilan.revenus*100)+"%",background:"#2d7a4f",borderRadius:4,transition:"width .4s"}}/>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── LISTE ── */}
            <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
              <div style={{padding:"12px 20px",borderBottom:"1px solid #f0e8d8",display:"grid",gridTemplateColumns:"75px 1fr 95px 110px 120px 120px",gap:10,background:"#fef9f0"}}>
                {["Chambre","Client","Arrivée","Départ","Statut","Montant"].map(h=>(
                  <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
                ))}
              </div>
              {filtered.length===0&&<p style={{padding:40,color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:14,textAlign:"center"}}>Aucune réservation trouvée</p>}
              {filtered.map(r=>{
                const room=ROOMS.find(rm=>rm.id===r.roomId);
                return(
                  <div key={r.id} className="res-row" onClick={()=>openDetail(r)}>
                    <div>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:18,fontWeight:600,color:r.status==="blocked"?"#6b35b8":"#c9952a"}}>{room?.number}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{room?.type}</p>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <p style={{fontSize:16,fontWeight:500}}>{r.guest}</p>
                        {r.claim&&<span style={{fontSize:12,color:"#c95050"}}>⚠</span>}
                        {r.babyBed&&<span>🍼</span>}
                        {r.extraBed&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:10,background:"#fef3d0",color:"#b07d1a",padding:"1px 6px",borderRadius:8}}>+lit</span>}
                      </div>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070"}}>{r.cin?`CIN: ${r.cin} · `:""}{r.phone||r.email}</p>
                    </div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{new Date(r.checkin).toLocaleDateString("fr-FR")}</p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{new Date(r.checkout).toLocaleDateString("fr-FR")}</p>
                    <span className="badge" style={{background:STATUS[r.status]?.bg,color:STATUS[r.status]?.color}}>{STATUS[r.status]?.label}</span>
                    <div style={{textAlign:"right"}}>
                      {r.status==="blocked"?(
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#9b5de5",fontWeight:600}}>🔒 Panne</p>
                      ):r.status==="cancelled"?(
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#c95050",fontWeight:600}}>✕ Annulée</p>
                      ):(
                        <>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:r.paid?"#2d7a4f":"#2a1e08"}}>{FMT(getEffectivePrice(r))}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:r.paid?"#2d7a4f":"#c95050"}}>{r.paid?"✓ payé":"en attente"}</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* ── HISTORIQUE ── */}
        {view==="historique"&&(()=>{
          const G2="#8B6434";

          // États locaux via useState dans un sous-composant inline
          // On utilise des variables de module pour les filtres historique
          const terminees=reservations.filter(r=>r.status==="checkedout");

          // Grouper par mois/année pour le sélecteur
          const moisDispos=[...new Set(terminees.map(r=>r.checkout.slice(0,7)))].sort((a,b)=>b.localeCompare(a));

          return <HistoriqueView terminees={terminees} moisDispos={moisDispos} G2={G2} openDetail={openDetail}/>;
        })()}

        {/* ── ARCHIVES FACTURES ── */}
        {view==="archives"&&<ArchivesView sb={sb} openDetail={openDetail} ROOMS={ROOMS} LOGO={LOGO} G2="#8B6434" doPrint={doPrint} setModal={setModal}/>}
        {view==="groupes"&&<GroupesView sb={sb} ROOMS={ROOMS} reservations={reservations} setReservations={setReservations} showToast={showToast} doPrint={doPrint} montantEnLettres={montantEnLettres} SignatureBlock={SignatureBlock} LOGO={LOGO} saveFacture={saveFacture} nextInvNum={nextInvNum} userEmail={user?.email}/>}
        {view==="police"&&<LivreDePolice reservations={reservations} ROOMS={ROOMS} LOGO={LOGO}/>}
        {view==="contrats"&&<ContratsView sb={sb}/>}
        {view==="charges"&&<ChargesView sb={sb} LOGO={LOGO}/>}

        {/* ── MÉNAGE ── */}
        {view==="menage"&&(()=>{
          const menageList=resources.filter(r=>r.role==="menage"&&r.active);

          // 1. NETTOYER — checkout aujourd'hui (libérées)
          const aNettoyer=ROOMS.filter(r=>
            reservations.some(x=>x.roomId===r.id&&["confirmed","checkedin"].includes(x.status)&&x.checkout===getToday())
          );

          // 2. NETTOYER — chambres occupées (ménage quotidien)
          const occupees=ROOMS.filter(r=>{
            const res=getRoomRes(r.id,reservations);
            return res&&["confirmed","checkedin"].includes(res.status)&&res.checkin<getToday();
          });

          // 3. CONTRÔLER — arrivées aujourd'hui ou demain (vérifier que c'est propre)
          const TOMORROW=new Date();TOMORROW.setDate(TOMORROW.getDate()+1);
          const TOMORROW_STR=TOMORROW.toISOString().split("T")[0];
          const aControler=ROOMS.filter(r=>
            reservations.some(x=>x.roomId===r.id&&["confirmed","pending"].includes(x.status)&&(x.checkin===getToday()||x.checkin===TOMORROW_STR))
            && !aNettoyer.find(x=>x.id===r.id) // pas déjà dans "à nettoyer"
          );

          function getClean(roomId){
            return cleanStatus[roomId]||{status:"sale",assignee:""};
          }
          function setClean(roomId,updates){
            setCleanStatus(prev=>({...prev,[roomId]:{...getClean(roomId),...updates}}));
          }

          const STATUTS=[
            {key:"sale",    label:"À faire",  color:"#c95050",bg:"#fce8e8",icon:"🔴"},
            {key:"en_cours",label:"En cours", color:"#b07d1a",bg:"#fef3d0",icon:"🟡"},
            {key:"propre",  label:"Fait ✓",   color:"#2d7a4f",bg:"#d4f0e0",icon:"🟢"},
          ];

          function RoomCard({room,tag,tagColor,tagBg}){
            const c=getClean(room.id);
            const res=getRoomRes(room.id,reservations)||
              reservations.find(x=>x.roomId===room.id&&["confirmed","pending"].includes(x.status)&&(x.checkin===getToday()||x.checkin===TOMORROW_STR));
            const isDone=c.status==="propre";
            return(
              <div style={{
                background:isDone?"#f0faf5":"#fff",
                border:"1.5px solid "+(isDone?"#7bc4a0":"#e8d8b0"),
                borderRadius:10,padding:"12px 14px",marginBottom:8,
                opacity:isDone?.75:1,
                transition:"all .2s",
              }}>
                {/* Ligne 1 : numéro + tag + statut */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:20,fontWeight:700,color:"#c9952a",minWidth:40}}>{room.number}</span>
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040",textTransform:"uppercase",minWidth:40}}>{room.type}</span>
                  <span style={{fontSize:10,background:tagBg,color:tagColor,padding:"2px 8px",borderRadius:10,fontFamily:'"Jost",sans-serif',fontWeight:700,whiteSpace:"nowrap"}}>{tag}</span>
                  <div style={{flex:1}}/>
                  {/* Boutons statut */}
                  <div style={{display:"flex",gap:4}}>
                    {STATUTS.map(s=>(
                      <button key={s.key} onClick={()=>setClean(room.id,{status:s.key})}
                        title={s.label}
                        style={{width:30,height:30,borderRadius:6,border:"2px solid "+(c.status===s.key||(!c.status&&s.key==="sale")?s.color:"#e8d8b0"),background:(c.status===s.key||(!c.status&&s.key==="sale"))?s.bg:"#fff",cursor:"pointer",fontSize:12,transition:"all .15s"}}>
                        {s.icon}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Ligne 2 : client + lit + assignation */}
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    {res&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:600,color:"#2a1e08",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{res.guest}</p>}
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{room.bedType}</p>
                  </div>
                  <select value={c.assignee||""} onChange={e=>setClean(room.id,{assignee:e.target.value})}
                    style={{fontFamily:'"Jost",sans-serif',fontSize:12,padding:"5px 8px",border:"1px solid #e0d0b0",borderRadius:6,background:"#faf8f5",width:140,color:c.assignee?"#2a1e08":"#8a7040",flexShrink:0}}>
                    <option value="">— Assigner —</option>
                    {menageList.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            );
          }

          const totalTaches=aNettoyer.length+occupees.length+aControler.length;
          const totalFait=ROOMS.filter(r=>(aNettoyer.find(x=>x.id===r.id)||occupees.find(x=>x.id===r.id)||aControler.find(x=>x.id===r.id))&&getClean(r.id).status==="propre").length;

          return(
            <div>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
                <div>
                  <p className="section-title">🧹 Ménage du jour</p>
                  <p className="section-sub">{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {/* Barre de progression */}
                  <div style={{textAlign:"right"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:4}}>{totalFait}/{totalTaches} terminé{totalFait>1?"s":""}</p>
                    <div style={{width:180,height:8,background:"#e8d8b0",borderRadius:4,overflow:"hidden"}}>
                      <div style={{width:totalTaches>0?(totalFait/totalTaches*100)+"%":"0%",height:"100%",background:"#2d7a4f",borderRadius:4,transition:"width .4s ease"}}/>
                    </div>
                  </div>
                  <button onClick={()=>{if(confirm("Remettre tout à 'À faire' ?"))setCleanStatus({});}}
                    style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fff",border:"1px solid #e0d0b0",color:"#8a7040",padding:"7px 14px",borderRadius:6,cursor:"pointer"}}>
                    🔄 Réinitialiser
                  </button>
                </div>
              </div>

              {totalTaches===0&&(
                <div style={{textAlign:"center",padding:"60px 20px",background:"#fff",borderRadius:12,border:"1px solid #e8d8b0"}}>
                  <p style={{fontSize:40,marginBottom:12}}>✨</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:16,color:"#2d7a4f",fontWeight:600}}>Aucune tâche pour aujourd'hui !</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#b0a070",marginTop:6}}>Toutes les chambres sont en ordre.</p>
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                <div>
                  {/* Départs — NETTOYER en priorité */}
                  {aNettoyer.length>0&&(
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:16}}>🚨</span>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#c95050",textTransform:"uppercase",letterSpacing:1}}>
                          Nettoyer après départ ({aNettoyer.length})
                        </p>
                      </div>
                      {aNettoyer.map(r=><RoomCard key={r.id} room={r} tag="DÉPART" tagColor="#c95050" tagBg="#fce8e8"/>)}
                    </>
                  )}

                  {/* Occupées — ménage quotidien */}
                  {occupees.length>0&&(
                    <div style={{marginTop:aNettoyer.length?20:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:16}}>🛏</span>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#c9952a",textTransform:"uppercase",letterSpacing:1}}>
                          Ménage quotidien ({occupees.length})
                        </p>
                      </div>
                      {occupees.map(r=><RoomCard key={r.id} room={r} tag="OCCUPÉE" tagColor="#c9952a" tagBg="#fef3d0"/>)}
                    </div>
                  )}
                </div>

                <div>
                  {/* Arrivées — CONTRÔLER */}
                  {aControler.length>0&&(
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:16}}>✅</span>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#1a4f8a",textTransform:"uppercase",letterSpacing:1}}>
                          Contrôler avant arrivée ({aControler.length})
                        </p>
                      </div>
                      {aControler.map(r=>{
                        const res=reservations.find(x=>x.roomId===r.id&&["confirmed","pending"].includes(x.status)&&(x.checkin===getToday()||x.checkin===TOMORROW_STR));
                        const isAujourdhui=res?.checkin===getToday();
                        return <RoomCard key={r.id} room={r} tag={isAujourdhui?"ARRIVÉE AUJOURD'HUI":"ARRIVÉE DEMAIN"} tagColor="#1a4f8a" tagBg="#d0e4f8"/>;
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── LINGE ── */}
        {view==="linge"&&(()=>{

          // Stock des équipements (modifiable)
          const STOCK_INITIAL={
            "lit_simple":   {label:"Lit Simple",    icon:"🛏",  stock:10},
            "lit_double":   {label:"Lit Double",    icon:"🛏🛏", stock:12},
            "lit_bebe":     {label:"Lit Bébé",      icon:"🍼",  stock:2},
            "lit_extra":    {label:"Lit Supplémentaire", icon:"➕🛏",stock:4},
            "couverture":   {label:"Couvertures",   icon:"🟧",  stock:30},
            "oreiller":     {label:"Oreillers",     icon:"🟫",  stock:40},
            "serviette":    {label:"Serviettes",    icon:"🟦",  stock:60},
          };

          // Utilisation selon les réservations actives
          // Chaque chambre occupée consomme selon son type
          const actives=reservations.filter(r=>
            ["confirmed","checkedin"].includes(r.status)&&
            r.checkin<=getToday()&&r.checkout>getToday()
          );

          const utilise={lit_simple:0,lit_double:0,lit_bebe:0,lit_extra:0,couverture:0,oreiller:0,serviette:0};

          actives.forEach(r=>{
            const room=ROOMS.find(x=>x.id===r.roomId);
            if(!room) return;
            // Lits selon type de chambre
            if(room.type==="Single")  utilise.lit_simple+=1;
            if(room.type==="Double")  utilise.lit_double+=1;
            if(room.type==="Twin")    utilise.lit_simple+=2;
            if(room.type==="Triple")  utilise.lit_simple+=3;
            if(room.type==="Suite")   utilise.lit_double+=1;
            // Lit bébé
            if(r.babyBed) utilise.lit_bebe+=1;
            // Lit extra
            if(r.extraBed) utilise.lit_extra+=1;
            // Literie
            const adults=parseInt(r.adults)||1;
            const children=parseInt(r.children)||0;
            const pers=adults+children;
            utilise.couverture+=pers;
            utilise.oreiller+=pers*2;
            utilise.serviette+=adults*2+(children>0?children:0);
          });

          // Stock editable dans l'UI
          function getStock(key){
            return stockEdit[key]!==undefined?stockEdit[key]:STOCK_INITIAL[key].stock;
          }

          return(
            <div>
              <p className="section-title">📦 Stock des Équipements</p>
              <p className="section-sub">Suivi en temps réel selon les réservations actives</p>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16,marginBottom:28}}>
                {Object.entries(STOCK_INITIAL).map(([key,eq])=>{
                  const total=getStock(key);
                  const used=utilise[key]||0;
                  const dispo=total-used;
                  const pct=total>0?Math.round(used/total*100):0;
                  const color=dispo<=0?"#c95050":dispo<=total*0.2?"#b07d1a":"#2d7a4f";
                  const bg=dispo<=0?"#fce8e8":dispo<=total*0.2?"#fef3d0":"#f0faf5";
                  return(
                    <div key={key} className="card" style={{borderTop:"3px solid "+color}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <p style={{fontSize:22,marginBottom:4}}>{eq.icon}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:"#2a1e08"}}>{eq.label}</p>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <span style={{fontSize:11,background:bg,color,padding:"3px 10px",borderRadius:20,fontFamily:'"Jost",sans-serif',fontWeight:700}}>
                            {dispo<=0?"ÉPUISÉ":dispo+" dispo"}
                          </span>
                        </div>
                      </div>

                      {/* Barre de progression */}
                      <div style={{background:"#f0ebe3",borderRadius:4,height:6,marginBottom:10,overflow:"hidden"}}>
                        <div style={{width:pct+"%",height:"100%",background:color,borderRadius:4,transition:"width .3s"}}/>
                      </div>

                      {/* Chiffres */}
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12,fontFamily:'"Jost",sans-serif',fontSize:12}}>
                        <span style={{color:"#c95050"}}>🏨 {used} utilisé{used>1?"s":""}</span>
                        <span style={{color:"#2d7a4f"}}>✅ {dispo} libre{dispo>1?"s":""}</span>
                      </div>

                      {/* Stock modifiable */}
                      <div style={{display:"flex",alignItems:"center",gap:8,background:"#faf8f5",borderRadius:6,padding:"7px 10px",border:"1px solid #e8d8b0"}}>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",flex:1}}>Stock total</span>
                        <button onClick={()=>setStockEdit(s=>({...s,[key]:Math.max(0,(getStock(key)-1))}))}
                          style={{width:24,height:24,borderRadius:4,border:"1px solid #e0d0b0",background:"#fff",cursor:"pointer",fontSize:14,lineHeight:1,color:"#c95050"}}>−</button>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:700,color:"#2a1e08",minWidth:28,textAlign:"center"}}>{total}</span>
                        <button onClick={()=>setStockEdit(s=>({...s,[key]:getStock(key)+1}))}
                          style={{width:24,height:24,borderRadius:4,border:"1px solid #e0d0b0",background:"#fff",cursor:"pointer",fontSize:14,lineHeight:1,color:"#2d7a4f"}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Récap par chambre occupée */}
              {actives.length>0&&(
                <>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>
                    🏨 Détail par chambre occupée ({actives.length})
                  </p>
                  <div style={{background:"#fff",border:"1px solid #e8d8b0",borderRadius:10,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:"#faf8f5",borderBottom:"2px solid #e8d8b0"}}>
                          {["Chambre","Client","Lit","Extra","Lit bébé","Couv.","Oreil.","Serv."].map(h=>(
                            <th key={h} style={{padding:"9px 12px",textAlign:h==="Chambre"||h==="Client"?"left":"center",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {actives.map(r=>{
                          const room=ROOMS.find(x=>x.id===r.roomId);
                          const pers=(parseInt(r.adults)||1)+(parseInt(r.children)||0);
                          let litType="—";
                          if(room?.type==="Single") litType="1 simple";
                          else if(room?.type==="Double") litType="1 double";
                          else if(room?.type==="Twin") litType="2 simples";
                          else if(room?.type==="Triple") litType="3 simples";
                          else if(room?.type==="Suite") litType="1 double";
                          return(
                            <tr key={r.id} style={{borderBottom:"1px solid #f0ebe3"}}>
                              <td style={{padding:"9px 12px",fontWeight:700,color:"#c9952a",fontFamily:'"Jost",sans-serif'}}>{room?.number}</td>
                              <td style={{padding:"9px 12px",fontFamily:'"Jost",sans-serif',color:"#2a1e08"}}>{r.guest.split(" ")[0]}</td>
                              <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif',color:"#6a5530"}}>{litType}</td>
                              <td style={{padding:"9px 12px",textAlign:"center"}}>{r.extraBed?<span style={{color:"#c9952a",fontWeight:600}}>✓</span>:"—"}</td>
                              <td style={{padding:"9px 12px",textAlign:"center"}}>{r.babyBed?<span style={{color:"#e07820",fontWeight:600}}>✓</span>:"—"}</td>
                              <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif'}}>{pers}</td>
                              <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif'}}>{pers*2}</td>
                              <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif'}}>{(parseInt(r.adults)||1)*2+(parseInt(r.children)||0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{background:"#fef9f0",borderTop:"2px solid #e8d8b0"}}>
                          <td colSpan={5} style={{padding:"9px 12px",fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040"}}>TOTAL UTILISÉ</td>
                          <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontWeight:700,color:"#c9952a"}}>{utilise.couverture}</td>
                          <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontWeight:700,color:"#c9952a"}}>{utilise.oreiller}</td>
                          <td style={{padding:"9px 12px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontWeight:700,color:"#c9952a"}}>{utilise.serviette}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── RESSOURCES ── */}
        {view==="resources"&&(
          <div>
            <p className="section-title">Gestion des Ressources</p>
            <p className="section-sub">Femmes de ménage et réceptionnistes — ajoutez ou supprimez des membres</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
              {[{role:"menage",label:"🧹 Femmes de Ménage",color:"#b07d1a",bg:"#fef3d0",list:menage},{role:"reception",label:"🏨 Réceptionnistes",color:"#1a4f8a",bg:"#d0e4f8",list:reception}].map(({role,label,color,bg,list})=>(
                <div key={role} className="card">
                  <h2 style={{fontSize:20,fontWeight:500,color,marginBottom:20}}>{label}</h2>
                  <div style={{marginBottom:20}}>
                    {list.length===0&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#b0a070",marginBottom:12}}>Aucun membre</p>}
                    {list.map(res=>(
                      <div key={res.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:bg,borderRadius:8,marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:600}}>
                            {res.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:15,fontWeight:500,color:"#2a1e08"}}>{res.name}</span>
                        </div>
                        <button className="btn-red" style={{padding:"5px 12px",fontSize:11}} onClick={()=>deleteResource(res.id)}>Supprimer</button>
                      </div>
                    ))}
                  </div>
                  <div style={{borderTop:"1px solid #f0e8d8",paddingTop:16}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Ajouter un membre</p>
                    <div style={{display:"flex",gap:8}}>
                      <input placeholder="Prénom..." value={newResRole===role?newResName:""} onChange={e=>{setNewResName(e.target.value);setNewResRole(role);}} style={{flex:1}} onKeyDown={e=>e.key==="Enter"&&newResRole===role&&addResource()}/>
                      <button className="btn-gold" style={{padding:"10px 16px",whiteSpace:"nowrap"}} onClick={()=>{setNewResRole(role);addResource();}}>Ajouter</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chambres occupées avec assignation */}
            <div className="card" style={{marginTop:24}}>
              <h2 style={{fontSize:20,fontWeight:500,color:"#2a1e08",marginBottom:20}}>🧹 Assignation Ménage — Chambres occupées</h2>
              {reservations.filter(r=>["confirmed","checkedin"].includes(r.status)&&r.checkin<=getToday()&&r.checkout>getToday()).length===0
                ?<p style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#b0a070"}}>Aucune chambre occupée aujourd'hui</p>
                :(<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                  {reservations.filter(r=>["confirmed","checkedin"].includes(r.status)&&r.checkin<=getToday()&&r.checkout>getToday()).map(r=>{
                    const room=ROOMS.find(rm=>rm.id===r.roomId);
                    return(
                      <div key={r.id} style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"14px 16px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:600,color:"#c9952a"}}>Ch. {room?.number}</p>
                          <span className="badge" style={{background:STATUS[r.status].bg,color:STATUS[r.status].color,fontSize:11}}>{STATUS[r.status].label}</span>
                        </div>
                        <p style={{fontSize:15,marginBottom:8}}>{r.guest}</p>
                        <select value={r.assignedMenage||""} onChange={async e=>{
                          await sb.from("reservations").update({assigned_menage:e.target.value}).eq("id",r.id);
                          showToast("Assignation mise à jour ✓");
                        }} style={{fontSize:13}}>
                          <option value="">— Assigner ménage —</option>
                          {menage.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>)
              }
            </div>
          </div>
        )}
      </main>

      {/* ── MODALS ── */}
      {modal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>

          {/* FORMULAIRE RÉSERVATION */}
          {(modal.type==="new"||modal.type==="edit")&&(
            <div className="modal">
              <h2 style={{fontSize:24,fontWeight:400,letterSpacing:1,marginBottom:6,color:"#c9952a"}}>{modal.type==="new"?"Nouvelle Réservation":"Modifier la Réservation"}</h2>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:24}}>* Champs obligatoires</p>
              <div style={{display:"grid",gap:16}}>
                <div className="form-group">
                  <label>Chambre *</label>
                  <select value={form.roomId||""} onChange={e=>setForm(f=>({...f,roomId:e.target.value}))}>
                    <option value="">Sélectionner une chambre</option>
                    {[1,2,3,4].map(floor=>(
                      <optgroup key={floor} label={"── Étage "+floor}>
                        {ROOMS.filter(r=>r.floor===floor).map(r=>{const occ=isOccForDates(r.id,reservations,form.checkin,form.checkout,form.id);return <option key={r.id} value={r.id} disabled={occ}>{r.number} — {r.type} ({r.price} TND/nuit){occ?" [Occupée ces dates]":""}</option>;})}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nom du client *</label>
                    <GuestAutocomplete
                      value={form.guest||""}
                      onChange={val=>setForm(f=>({...f,guest:val}))}
                      onSelect={c=>setForm(f=>({...f,guest:c.nom,phone:c.phone||f.phone,email:c.email||f.email,cin:c.cin||f.cin}))}
                      sb={sb}
                    />
                  </div>
                  <div className="form-group"><label>Email</label><input value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemple.com" type="email"/></div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label style={{display:"flex",alignItems:"center",gap:6}}>
                      N° CIN
                      <span style={{fontSize:9,fontWeight:600,color:"#a09080",background:"#f5f0e8",padding:"1px 6px",borderRadius:8,textTransform:"uppercase",letterSpacing:.5}}>facultatif</span>
                    </label>
                    <input value={form.cin||""} onChange={e=>setForm(f=>({...f,cin:e.target.value}))} placeholder="ex : 12345678"/>
                  </div>
                  <div className="form-group"><label>Téléphone</label><input value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="xx xxx xxx"/></div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nationalité</label>
                    <input value={form.nationality||""} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} placeholder="ex : Tunisienne, Française…"/>
                  </div>
                  <div className="form-group">
                    <label style={{display:"flex",alignItems:"center",gap:6}}>
                      N° Passeport
                      <span style={{fontSize:9,fontWeight:600,color:"#a09080",background:"#f5f0e8",padding:"1px 6px",borderRadius:8,textTransform:"uppercase",letterSpacing:.5}}>étrangers</span>
                    </label>
                    <input value={form.passport||""} onChange={e=>setForm(f=>({...f,passport:e.target.value}))} placeholder="ex : AB123456"/>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Profession</label>
                    <input value={form.profession||""} onChange={e=>setForm(f=>({...f,profession:e.target.value}))} placeholder="ex : Ingénieur, Médecin…"/>
                  </div>
                  <div className="form-group">
                    <label>Provenance</label>
                    <input value={form.provenance||""} onChange={e=>setForm(f=>({...f,provenance:e.target.value}))} placeholder="ex : Tunis, Paris, Sousse…"/>
                  </div>
                </div>
                {/* Contrat partenaire */}
                {contrats.filter(c=>c.actif).length>0&&(
                  <div className="form-group">
                    <label style={{display:"flex",alignItems:"center",gap:6}}>
                      🤝 Contrat / Partenaire
                      <span style={{fontSize:9,fontWeight:500,color:"#a09080",textTransform:"none",letterSpacing:0}}>— tarif automatique</span>
                    </label>
                    <select value={form.contratId||""} onChange={e=>{
                      const c=contrats.find(x=>x.id===parseInt(e.target.value));
                      setForm(f=>{
                        const upd={...f,contratId:e.target.value?parseInt(e.target.value):null};
                        if(c){
                          // Appliquer le tarif du contrat
                          const room=ROOMS.find(r=>r.id===parseInt(f.roomId));
                          const typeKey=room?{Single:"tarif_single",Double:"tarif_double",Twin:"tarif_double",Triple:"tarif_triple",Suite:"tarif_suite"}[room.type]:"tarif_double";
                          const tarifContrat=c[typeKey];
                          if(tarifContrat) upd.customPrice=tarifContrat;
                          else if(c.remise_pct>0) upd.remise=c.remise_pct;
                        } else {
                          upd.customPrice=undefined;
                          upd.remise=0;
                        }
                        return upd;
                      });
                    }}>
                      <option value="">— Aucun contrat —</option>
                      {contrats.filter(c=>c.actif&&(!c.date_fin||c.date_fin>=getToday())).map(c=>(
                        <option key={c.id} value={c.id}>{c.nom} {c.remise_pct>0&&!c.tarif_double?`(−${c.remise_pct}%)`:""}</option>
                      ))}
                    </select>
                    {form.contratId&&(()=>{
                      const c=contrats.find(x=>x.id===form.contratId);
                      if(!c) return null;
                      return<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#2a8a5a",marginTop:4}}>✓ Tarif contrat appliqué{c.remise_pct>0&&!c.tarif_double?` — remise ${c.remise_pct}%`:""}</p>;
                    })()}
                  </div>
                )}

                {/* Accompagnants — affiché si adults > 1 */}
                {parseInt(form.adults||1)>1&&(
                  <div style={{background:"#faf8f5",border:"1px solid #e8d8b0",borderRadius:8,padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1}}>👥 Accompagnants ({parseInt(form.adults||1)-1})</p>
                      <button type="button" onClick={()=>{
                        const acc=[...(form.accompagnants||[])];
                        acc.push({nom:"",nationalite:"",cin:"",passport:"",profession:"",provenance:""});
                        setForm(f=>({...f,accompagnants:acc}));
                      }} style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fff",border:"1px dashed #c0b080",color:"#8a7040",padding:"4px 12px",borderRadius:5,cursor:"pointer"}}>+ Ajouter</button>
                    </div>
                    {(form.accompagnants||[]).length===0&&(
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#b0a070",textAlign:"center",padding:"8px 0"}}>Cliquez "+ Ajouter" pour saisir les infos des accompagnants</p>
                    )}
                    {(form.accompagnants||[]).map((acc,idx)=>(
                      <div key={idx} style={{background:"#fff",border:"1px solid #e0d0b0",borderRadius:6,padding:"10px 12px",marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#c9952a"}}>Personne {idx+2}</p>
                          <button type="button" onClick={()=>{
                            const a=[...(form.accompagnants||[])];
                            a.splice(idx,1);
                            setForm(f=>({...f,accompagnants:a}));
                          }} style={{background:"#fdf0f0",border:"1px solid #e0a0a0",color:"#9a2020",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {[["Nom & Prénom","nom","ex : Ben Ali Mohamed"],["Nationalité","nationalite","ex : Tunisienne"],["CIN","cin","ex : 12345678"],["Passeport","passport","ex : AB123456"],["Profession","profession","ex : Ingénieur"],["Provenance","provenance","ex : Sfax"]].map(([lbl,key,ph])=>(
                            <div key={key}>
                              <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{lbl}</label>
                              <input value={acc[key]||""} onChange={e=>{
                                const a=[...(form.accompagnants||[])];
                                a[idx]={...a[idx],[key]:e.target.value};
                                setForm(f=>({...f,accompagnants:a}));
                              }} placeholder={ph} style={{width:"100%",fontSize:11,padding:"5px 8px"}}/>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group"><label>Arrivée *</label><input type="date" value={form.checkin||""} onChange={e=>setForm(f=>({...f,checkin:e.target.value}))}/></div>
                  <div className="form-group"><label>Départ *</label><input type="date" value={form.checkout||""} onChange={e=>setForm(f=>({...f,checkout:e.target.value}))}/></div>
                </div>
                {form.checkin&&form.checkout&&nights(form.checkin,form.checkout)>0&&(
                  <div style={{background:"#fef3d0",border:"1px solid #e8c870",borderRadius:6,padding:"8px 14px",fontFamily:'"Jost",sans-serif',display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>🌙</span>
                    <span style={{fontSize:13,fontWeight:700,color:"#b07d1a"}}>{nights(form.checkin,form.checkout)} nuit{nights(form.checkin,form.checkout)>1?"s":""}</span>
                    <span style={{fontSize:12,color:"#8a7040"}}>— du {new Date(form.checkin).toLocaleDateString("fr-FR")} au {new Date(form.checkout).toLocaleDateString("fr-FR")}</span>
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label>Adultes</label>
                    <select value={form.adults||1} onChange={e=>setForm(f=>({...f,adults:e.target.value}))}>
                      {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Enfants</label>
                    <select value={form.children||0} onChange={e=>setForm(f=>({...f,children:e.target.value}))}>
                      {[0,1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group"><label>Statut</label><select value={form.status||"confirmed"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{Object.entries(STATUS).filter(([k])=>k!=="blocked").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div className="form-group">
                    <label>Type de pension</label>
                    <select value={form.pension||"lpd"} onChange={e=>setForm(f=>({...f,pension:e.target.value}))}>
                      <option value="lpd">LPD — Logement + Petit Déjeuner</option>
                      <option value="dp">DP — Demi Pension (+40 TND/nuit)</option>
                    </select>
                  </div>
                </div>
                {/* Tarification */}
                {(()=>{
                  const room=ROOMS.find(r=>r.id===parseInt(form.roomId));
                  if(!room) return null;
                  // Prix de base par type de facturation
                  const TARIFS=[
                    {key:"single",  label:"Single",    prix:100},
                    {key:"double",  label:"Double",    prix:160},
                    {key:"triple",  label:"Triple",    prix:220},
                    {key:"quad",    label:"Quadruple", prix:280},
                    {key:"suite",   label:"Suite",     prix:200},
                  ];
                  const dpExtra=form.pension==="dp"?40:0;
                  // Type de facturation auto selon la chambre, sauf si forcé
                  const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
                  const defaultType=typeMap[room.type]||"double";
                  const billingType=form.billingType||defaultType;
                  const tarif=TARIFS.find(t=>t.key===billingType)||TARIFS[1];
                  const prixBase=tarif.prix+dpExtra;
                  // Remise %
                  const remise=parseFloat(form.remise)||0;
                  const prixApresRemise=Math.round(prixBase*(1-remise/100)*100)/100;
                  // Prix final = customPrice si saisie manuelle, sinon prixApresRemise
                  const prixFinal=form.customPrice!==undefined?form.customPrice:prixApresRemise;
                  const n=nights(form.checkin||"",form.checkout||"");
                  const totalEstime=n>0?Math.round(prixFinal*n*100)/100:0;
                  return(
                    <div style={{background:"#fef9f0",border:"1.5px solid #e8d8b0",borderRadius:10,padding:"14px 16px",display:"grid",gap:12}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,margin:0}}>🏷 Tarification</p>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        {/* Type de facturation */}
                        <div>
                          <label style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,display:"block",marginBottom:4,fontWeight:600}}>Facturé comme</label>
                          <select value={billingType}
                            onChange={e=>setForm(f=>({...f,billingType:e.target.value,customPrice:undefined,remise:0}))}
                            style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600}}>
                            {TARIFS.map(t=><option key={t.key} value={t.key}>{t.label} — {t.prix+dpExtra} TND/nuit</option>)}
                          </select>
                          {billingType!==defaultType&&(
                            <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#c9952a",marginTop:3}}>
                              ⚠ Chambre {room.type} facturée en {tarif.label}
                            </p>
                          )}
                        </div>
                        {/* Remise % */}
                        <div>
                          <label style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,display:"block",marginBottom:4,fontWeight:600}}>Remise %</label>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <input type="number" min="0" max="100" value={form.remise||0}
                              onChange={e=>setForm(f=>({...f,remise:parseFloat(e.target.value)||0,customPrice:undefined}))}
                              style={{width:70,padding:"6px 10px",border:"1.5px solid #e0d0b0",borderRadius:6,fontSize:14,fontWeight:700,color:"#c95050",textAlign:"center"}}/>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>%</span>
                            {remise>0&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#c95050",fontWeight:600}}>−{Math.round(prixBase*remise/100*100)/100} TND</span>}
                          </div>
                        </div>
                      </div>
                      {/* Prix final modifiable */}
                      <div style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:8,padding:"10px 14px",border:"1px solid #e0d8cc"}}>
                        <div style={{flex:1}}>
                          <label style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,display:"block",marginBottom:4,fontWeight:600}}>Prix final / nuit (TTC)</label>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <input type="number" min="0" step="1"
                              value={prixFinal}
                              onChange={e=>setForm(f=>({...f,customPrice:parseFloat(e.target.value)||0}))}
                              style={{width:90,padding:"6px 10px",border:"1.5px solid #c9952a",borderRadius:6,fontSize:16,fontWeight:800,color:"#c9952a",textAlign:"right"}}/>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>TND/nuit</span>
                            {form.customPrice!==undefined&&(
                              <button onClick={()=>setForm(f=>({...f,customPrice:undefined}))}
                                style={{fontSize:10,background:"#fce8e8",color:"#c95050",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:'"Jost",sans-serif'}}>
                                ↺ Auto ({prixApresRemise} TND)
                              </button>
                            )}
                          </div>
                        </div>
                        {n>0&&(
                          <div style={{textAlign:"right"}}>
                            <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>Total {n} nuit{n>1?"s":""}</p>
                            <p style={{fontFamily:'"Jost",sans-serif',fontSize:20,fontWeight:800,color:"#c9952a"}}>{totalEstime.toFixed(3)} TND</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label style={{fontFamily:'"Jost",sans-serif',fontSize:11,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",display:"block",marginBottom:10,fontWeight:600}}>Options supplémentaires</label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={form.extraBed||false} onChange={e=>setForm(f=>({...f,extraBed:e.target.checked}))} style={{width:"auto",accentColor:"#c9952a"}}/>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#2a1e08"}}>Lit supplémentaire <span style={{color:"#8a7040",fontSize:12}}>(+30 TND/nuit)</span></span>
                  </label>
                  <label className="toggle-row" style={{opacity:babyBedOccupied&&!form.babyBed?.0:1}}>
                    <input type="checkbox" checked={form.babyBed||false} disabled={babyBedOccupied&&!form.babyBed} onChange={e=>setForm(f=>({...f,babyBed:e.target.checked}))} style={{width:"auto",accentColor:"#e07820"}}/>
                    <div>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#2a1e08"}}>🍼 Lit bébé <span style={{fontSize:12,color:"#8a7040"}}>(gratuit)</span></span>
                      {babyBedOccupied&&!form.babyBed&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#c95050",marginTop:2}}>⚠ Lit bébé déjà occupé dans une autre chambre</p>}
                    </div>
                  </label>
                  {form.babyBed&&<input value={form.babyBedLocation||""} onChange={e=>setForm(f=>({...f,babyBedLocation:e.target.value}))} placeholder="Emplacement du lit bébé..." style={{marginTop:4}}/>}
                </div>
                <div className="form-group"><label>Notes internes</label><textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Demandes spéciales..."/></div>
                <div className="form-group">
                  <label style={{color:"#c95050"}}>⚠ Réclamation</label>
                  <textarea value={form.claim||""} onChange={e=>setForm(f=>({...f,claim:e.target.value}))} rows={2} placeholder="Décrire la réclamation..." style={{borderColor:form.claim?"#e08080":"#d4c5a0"}}/>
                </div>
                <label className="toggle-row">
                  <input type="checkbox" checked={form.paid||false} onChange={e=>setForm(f=>({...f,paid:e.target.checked}))} style={{width:"auto",accentColor:"#2d7a4f"}}/>
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#2a1e08"}}>✓ Paiement reçu</span>
                </label>
              </div>
              {form.roomId&&form.checkin&&form.checkout&&(()=>{
                const n=nights(form.checkin,form.checkout);
                const room=ROOMS.find(r=>r.id==form.roomId);
                if(!room||n<=0) return null;

                // === MÊME LOGIQUE QUE LE BLOC TARIFICATION ===
                const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
                const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
                const defaultType=typeMap[room.type]||"double";
                const billingType=form.billingType||defaultType;
                const dpExtra=form.pension==="dp"?40:0;
                const prixBase=(TARIFS[billingType]||160)+dpExtra;
                const remise=parseFloat(form.remise)||0;
                const prixApresRemise=Math.round(prixBase*(1-remise/100)*100)/100;
                const prixTTC=form.customPrice!==undefined?form.customPrice:prixApresRemise;
                // ================================================

                const prixHT=Math.round((prixTTC/1.07)*1000)/1000;
                const extraTTC=form.extraBed?30:0;
                const extraHT=Math.round((extraTTC/1.07)*1000)/1000;
                const baseTTC=n*prixTTC;
                const baseHT=Math.round(n*prixHT*100)/100;
                const extraLineTTC=n*extraTTC;
                const extraLineHT=Math.round(n*extraHT*100)/100;
                const totalHT=Math.round((baseHT+extraLineHT)*100)/100;
                const totalTTC=Math.round((baseTTC+extraLineTTC)*100)/100;
                const tvaAmt=Math.round((totalTTC-totalHT)*100)/100;
                const timbre=1;
                const netAPayer=Math.round((totalTTC+timbre)*100)/100;
                return(
                  <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"16px",marginTop:16,fontFamily:'"Jost",sans-serif'}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <p style={{fontSize:10,color:"#8a7040",letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>Récapitulatif</p>
                      <span style={{fontSize:13,fontWeight:700,color:"#c9952a",background:"#fef3d0",padding:"3px 10px",borderRadius:20}}>{n} nuit{n>1?"s":""}</span>
                    </div>
                    {[
                      ["Chambre × "+n+" nuit"+(n>1?"s":"")+(remise>0?" (remise "+remise+"%)":""),FMT(baseHT),FMT(baseTTC)],
                      form.extraBed?["Lit supplémentaire × "+n,FMT(extraLineHT),FMT(extraLineTTC)]:null,
                    ].filter(Boolean).map(([l,ht,ttc])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6a5530",marginBottom:5}}>
                        <span style={{flex:1}}>{l}</span>
                        <span style={{minWidth:80,textAlign:"right",color:"#8a7040"}}>{ht} HT</span>
                        <span style={{minWidth:90,textAlign:"right",fontWeight:600}}>{ttc} TTC</span>
                      </div>
                    ))}
                    <div style={{borderTop:"1px solid #e8d8b0",paddingTop:8,marginTop:8}}>
                      {[["Sous-total HT",FMT(totalHT)],["TVA 7%",FMT(tvaAmt)],["Total TTC",FMT(totalTTC)],["Timbre fiscal","1,000 TND"]].map(([l,v])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6a5530",marginBottom:4}}><span>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",background:"#c9952a",color:"#fff",padding:"10px 14px",borderRadius:6,marginTop:8}}>
                        <span style={{fontWeight:700,fontSize:14}}>Net à payer</span>
                        <span style={{fontWeight:700,fontSize:20}}>{FMT(netAPayer)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
                <button className="btn-outline" onClick={()=>setModal(null)}>Annuler</button>
                <button className="btn-gold" onClick={saveReservation} disabled={syncing}>{syncing?"Enregistrement...":"Enregistrer"}</button>
              </div>
            </div>
          )}

          {/* BLOQUER UNE CHAMBRE */}
          {modal.type==="block"&&(
            <div className="modal" style={{maxWidth:440}}>
              <h2 style={{fontSize:22,fontWeight:400,color:"#6b35b8",marginBottom:6}}>🔒 Bloquer la Chambre</h2>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#8a7040",marginBottom:20}}>La chambre sera marquée indisponible et non réservable</p>
              <div style={{display:"grid",gap:14}}>
                <div className="form-group"><label>Chambre</label><p style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:600,color:"#6b35b8"}}>Ch. {ROOMS.find(r=>r.id==form.roomId)?.number}</p></div>
                <div className="form-grid">
                  <div className="form-group"><label>Du *</label><input type="date" value={form.checkin||""} onChange={e=>setForm(f=>({...f,checkin:e.target.value}))}/></div>
                  <div className="form-group"><label>Au *</label><input type="date" value={form.checkout||""} onChange={e=>setForm(f=>({...f,checkout:e.target.value}))}/></div>
                </div>
                <div className="form-group"><label>Raison du blocage</label><textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Ex: travaux, maintenance, rénovation..."/></div>
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
                <button className="btn-outline" onClick={()=>setModal(null)}>Annuler</button>
                <button className="btn-purple" onClick={saveReservation} disabled={syncing}>{syncing?"En cours...":"Bloquer"}</button>
              </div>
            </div>
          )}

          {/* DÉTAIL */}
          {modal.type==="detail"&&(()=>{
            const r=reservations.find(x=>x.id===modal.data.id)||modal.data;
            const room=ROOMS.find(rm=>rm.id===r.roomId);
            const n=nights(r.checkin,r.checkout);

            // ── Prix effectif (même logique que getEffectivePrice) ──
            const TARIFS_D={single:100,double:160,triple:220,quad:280,suite:200};
            const typeMap_D={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
            const defaultType_D=typeMap_D[room?.type]||"double";
            const billingType_D=r.billingType||defaultType_D;
            const dpExtra_D=r.pension==="dp"?40:0;
            const prixBase_D=(TARIFS_D[billingType_D]||160)+dpExtra_D;
            const remise_D=parseFloat(r.remise)||0;
            const prixApresRemise_D=Math.round(prixBase_D*(1-remise_D/100)*100)/100;
            const prixTTC=r.customPrice!==undefined?r.customPrice:prixApresRemise_D;
            // ─────────────────────────────────────────────────────────

            const prixHT=Math.round((prixTTC/1.07)*1000)/1000;
            const extraTTC=r.extraBed?30:0;
            const extraHT=Math.round((extraTTC/1.07)*1000)/1000;
            const baseTTC=n*prixTTC;
            const baseHT=Math.round(n*prixHT*100)/100;
            const extraLineTTC=n*extraTTC;
            const extraLineHT=Math.round(n*extraHT*100)/100;
            const totalHT=Math.round((baseHT+extraLineHT)*100)/100;
            const totalTTC=Math.round((baseTTC+extraLineTTC)*100)/100;
            const tvaAmt=Math.round((totalTTC-totalHT)*100)/100;
            return(
              <div className="modal" style={{maxWidth:500}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
                  <div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,letterSpacing:2,color:"#c9952a",textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Chambre {room?.number}</p>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <h2 style={{fontSize:24,fontWeight:400}}>{r.guest}</h2>
                      {r.claim&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:12,background:"#fad4d4",color:"#9a2020",padding:"3px 10px",borderRadius:10}}>⚠ réclamation</span>}
                    </div>
                  </div>
                  <span className="badge" style={{background:STATUS[r.status]?.bg,color:STATUS[r.status]?.color}}>{STATUS[r.status]?.label}</span>
                </div>
                {r.status==="blocked"&&(
                  <div style={{background:"#f3e8fc",border:"1.5px solid #9b5de5",borderRadius:8,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>🔒</span>
                    <div>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#6b35b8"}}>Chambre hors service</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#9b5de5"}}>Cette chambre est bloquée (panne, maintenance…) — non facturable</p>
                    </div>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                  {[["Type",room?.type],["Étage",room?.floor],["Arrivée",new Date(r.checkin).toLocaleDateString("fr-FR")],["Départ",new Date(r.checkout).toLocaleDateString("fr-FR")],["Durée",n+" nuit"+(n>1?"s":"")],["Adultes",r.adults],["Téléphone",r.phone||"—"],["Email",r.email||"—"]].map(([label,val])=>(
                    <div key={label}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",marginBottom:3,fontWeight:600}}>{label}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#2a1e08"}}>{val}</p>
                    </div>
                  ))}
                </div>
                {(r.extraBed||r.babyBed)&&(
                  <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                    {r.extraBed&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:12,background:"#fef3d0",color:"#b07d1a",padding:"4px 12px",borderRadius:20,fontWeight:500}}>🛏 Lit supplémentaire</span>}
                    {r.babyBed&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:12,background:"#fff3e8",color:"#e07820",padding:"4px 12px",borderRadius:20,fontWeight:500}}>🍼 Lit bébé{r.babyBedLocation?" — "+r.babyBedLocation:""}</span>}
                  </div>
                )}
                {r.notes&&<div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderLeft:"3px solid #c9952a",padding:"10px 14px",borderRadius:6,marginBottom:12,fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{r.notes}</div>}
                {r.claim&&<div style={{background:"#fdf0f0",border:"1px solid #e0a0a0",borderLeft:"3px solid #c95050",padding:"10px 14px",borderRadius:6,marginBottom:14,fontFamily:'"Jost",sans-serif',fontSize:13,color:"#9a2020"}}>⚠ {r.claim}</div>}
                {r.status!=="blocked"&&(
                  <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"14px 18px",marginBottom:18}}>
                    {/* Info tarification si modifiée */}
                    {(r.billingType&&r.billingType!==typeMap_D[room?.type]||remise_D>0||r.pension==="dp"||r.customPrice!==undefined)&&(
                      <div style={{marginBottom:10,padding:"6px 10px",background:"#fef3d0",borderRadius:6,fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a5c10",display:"flex",flexWrap:"wrap",gap:8}}>
                        {r.billingType&&r.billingType!==defaultType_D&&<span>📋 Facturé en <strong>{r.billingType}</strong></span>}
                        {r.pension==="dp"&&<span>🍽 Demi-Pension (+40 TND)</span>}
                        {remise_D>0&&<span>🏷 Remise <strong>{remise_D}%</strong> (−{Math.round(prixBase_D*remise_D/100*100)/100} TND/nuit)</span>}
                        {r.customPrice!==undefined&&<span>✏️ Prix manuel : <strong>{r.customPrice} TND/nuit</strong></span>}
                      </div>
                    )}
                    {[
                      ["Chambre HT",baseHT.toFixed(3)+" TND"],
                      r.extraBed?["Lit suppl. HT",extraLineHT.toFixed(3)+" TND"]:null,
                      ["TVA 7%",tvaAmt.toFixed(3)+" TND"],
                    ].filter(Boolean).map(([l,v])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}><span>{l}</span><span>{v}</span></div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #e8d8b0",paddingTop:10,marginTop:4}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#6a5530",fontWeight:600}}>Total TTC</span>
                      <div style={{textAlign:"right"}}>
                        <p style={{fontSize:22,fontWeight:600,color:"#2a1e08"}}>{totalTTC.toFixed(3)} TND</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:r.paid?"#2d7a4f":"#c95050",fontWeight:600}}>{r.paid?"✓ Payé":"Non payé"}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{height:1,background:"#f0e8d8",margin:"16px 0"}}/>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Actions</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
                  {r.status==="pending"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"confirmed");setModal({type:"detail",data:{...r,status:"confirmed"}});}}>Confirmer</button>}
                  {r.status==="confirmed"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"checkedin");setModal({type:"detail",data:{...r,status:"checkedin"}});}}>Check-in ✓</button>}
                  {r.status==="checkedin"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"checkedout");setModal({type:"detail",data:{...r,status:"checkedout"}});}}>Check-out ✓</button>}
                  {!["cancelled","blocked","checkedout"].includes(r.status)&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"cancelled");addLog("🚫 Réservation annulée",{client:r.guest,chambre:ROOMS.find(rm=>rm.id===r.roomId)?.number});setModal({type:"detail",data:{...r,status:"cancelled"}});}}>Annuler</button>}
                  {!r.paid&&r.status!=="blocked"&&<button className="btn-outline" onClick={()=>{markPaid(r.id);setModal({type:"detail",data:{...r,paid:true}});}}>Marquer payé</button>}
                  {!["blocked","cancelled"].includes(r.status)&&<button className="btn-outline" onClick={()=>openInvoice(r)}>Facture</button>}
                  {r.pension==="dp"&&["confirmed","checkedin"].includes(r.status)&&<button className="btn-outline" style={{background:"#fff8ee",borderColor:"#e8b84b",color:"#8a5c10"}} onClick={()=>setModal({type:"bonRestaurant",data:r})}>🍽 Bon Restaurant</button>}
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <button className="btn-red" onClick={()=>{if(confirm("Supprimer cette réservation ?"))deleteRes(r.id);}}>Supprimer</button>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn-outline" onClick={()=>setModal(null)}>Fermer</button>
                    <button className="btn-gold" onClick={()=>openEdit(r)}>Modifier</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* BON RESTAURANT */}
          {modal.type==="bonRestaurant"&&(()=>{
            const r=modal.data;
            const G2="#8B6434";
            const n=nights(r.checkin,r.checkout);
            const acc=r.accompagnants||[];
            const totalPersonnes=1+acc.length; // titulaire + accompagnants
            // Générer tous les bons : pour chaque nuit, un bon par personne
            const tousLesBons=[];
            Array.from({length:n},(_,i)=>{
              const d=new Date(r.checkin+"T12:00:00");
              d.setDate(d.getDate()+i);
              const dateStr=d.toISOString().split("T")[0];
              // Titulaire
              tousLesBons.push({date:dateStr,guest:r.guest});
              // Accompagnants
              acc.forEach(a=>{if(a.nom) tousLesBons.push({date:dateStr,guest:a.nom});});
            });
            const totalBons=tousLesBons.length;

            function BonRestaurantModal(){
              const [repas,setRepas]=React.useState("diner");
              const [showCachet,setShowCachet]=React.useState(true);
              function printBons(){
                doPrint({
                  type:"bonRestaurant",
                  guest:r.guest,
                  repas,
                  showCachet,
                  pension:"DP — Demi Pension",
                  bons:tousLesBons, // nouveau format avec guest par bon
                });
              }
              return(
                <div className="modal" style={{maxWidth:460,fontFamily:'"Inter",sans-serif'}}>
                  <div style={{borderBottom:"2px solid "+G2,paddingBottom:14,marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
                    <img src={LOGO} alt="" style={{height:44,width:44,objectFit:"cover",borderRadius:6,border:"1px solid #e0d8cc"}}/>
                    <div>
                      <p style={{fontSize:11,fontWeight:700,color:G2,letterSpacing:1,textTransform:"uppercase"}}>Bons de Restaurant</p>
                      <p style={{fontSize:13,fontWeight:800,color:"#2c2416"}}>IMPAVID HOTEL</p>
                    </div>
                  </div>
                  <div style={{display:"grid",gap:14,marginBottom:20}}>
                    {/* Infos */}
                    <div style={{background:"#faf8f5",border:"1px solid #e0d8cc",borderRadius:8,padding:"12px 16px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {[["Client",r.guest],["Pension","Demi-Pension (DP)"],["Séjour",new Date(r.checkin).toLocaleDateString("fr-FR")+" → "+new Date(r.checkout).toLocaleDateString("fr-FR")],["Total bons",totalBons+" bon"+(totalBons>1?"s":"")+" ("+n+" nuit"+(n>1?"s":"")+" × "+totalPersonnes+" pers.)"]].map(([lbl,val])=>(
                          <div key={lbl}>
                            <p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{lbl}</p>
                            <p style={{fontSize:13,fontWeight:600,color:"#2c2416"}}>{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Aperçu bons par nuit */}
                    <div>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Bons générés</p>
                      <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
                        {tousLesBons.map((b,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:6,padding:"5px 10px"}}>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#c9952a",minWidth:22}}>#{i+1}</span>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#2c2416",fontWeight:600,minWidth:120}}>{b.guest}</span>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{new Date(b.date+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Type de repas</label>
                      <select value={repas} onChange={e=>setRepas(e.target.value)}>
                        <option value="dejeuner">🌤 Déjeuner</option>
                        <option value="diner">🌙 Dîner</option>
                      </select>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#faf8f5",border:"1px solid #e0d8cc",borderRadius:8}}>
                      <input type="checkbox" id="cachetBon" checked={showCachet} onChange={e=>setShowCachet(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
                      <label htmlFor="cachetBon" style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#2a1e08",cursor:"pointer",userSelect:"none"}}>Afficher le cachet de l'hôtel</label>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                    <button className="btn-outline" onClick={()=>setModal({type:"detail",data:r})}>← Retour</button>
                    <button className="btn-gold" onClick={printBons}>🖨 Imprimer {totalBons} bon{totalBons>1?"s":""}</button>
                  </div>
                </div>
              );
            }
            return <BonRestaurantModal/>;
          })()}

          {/* FACTURE */}
          {modal.type==="invoice"&&(()=>{
            function InvoiceModal(){
            const [showCachet,setShowCachet]=React.useState(true);
            const r=modal.data;
            const room=ROOMS.find(rm=>rm.id===r.roomId);
            const n=nights(r.checkin,r.checkout);
            const G2="#8B6434";
            // Tarifs par type de facturation
            const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
            const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
            const defaultType=typeMap[room?.type]||"double";
            const billingType=r.billingType||defaultType;
            const dpExtra=r.pension==="dp"?40:0;
            const prixBase=(TARIFS[billingType]||160)+dpExtra;
            const remise=parseFloat(r.remise)||parseFloat(modal.remise)||0;
            const prixApresRemise=Math.round(prixBase*(1-remise/100)*100)/100;
            const prixTTC=r.customPrice!==undefined?r.customPrice:prixApresRemise;
            const prixHT=Math.round((prixTTC/1.07)*1000)/1000;
            const extraTTC=r.extraBed?30:0;
            const extraHT=Math.round((extraTTC/1.07)*1000)/1000;
            const baseTTC=n*prixTTC;
            const baseHT=Math.round(n*prixHT*100)/100;
            const extraLineTTC=n*extraTTC;
            const extraLineHT=Math.round(n*extraHT*100)/100;
            const totalHT=Math.round((baseHT+extraLineHT)*100)/100;
            const totalTTC=Math.round((baseTTC+extraLineTTC)*100)/100;
            const tvaAmt=Math.round((totalTTC-totalHT)*100)/100;
            // Remise supplémentaire depuis le modal (champ d'impression)
            const remisePrint=modal.remise||0;
            const remiseMont=Math.round(totalTTC*(remisePrint/100)*100)/100;
            const totalApresRemise=Math.round((totalTTC-remiseMont)*100)/100;
            return(
              <div className="modal" style={{maxWidth:600,background:"#fff",fontFamily:'"Inter",sans-serif'}}>
                {/* EN-TÊTE SOCIÉTÉ */}
                <div style={{borderBottom:"2px solid "+G2,paddingBottom:18,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                    <img src={LOGO} alt="Impavid" style={{height:54,width:54,objectFit:"cover",borderRadius:8,border:"1px solid #e0d8cc"}}/>
                    <div>
                      <p style={{fontSize:12,fontWeight:700,color:"#2c2416",lineHeight:1.4}}>Société Hedi pour les services touristiques</p>
                      <p style={{fontSize:13,fontWeight:800,color:G2,letterSpacing:1}}>SHST</p>
                      <p style={{fontSize:15,fontWeight:700,color:G2,marginTop:2}}>IMPAVID HOTEL</p>
                      <p style={{fontSize:11,color:"#8a7a65",marginTop:6}}>📍 Rue Jamel Abdelnasser, Gabès 6000</p>
                      <p style={{fontSize:11,color:"#8a7a65"}}>✉ impavidhotel@gmail.com</p>
                      <p style={{fontSize:11,color:"#8a7a65"}}>MF : <strong style={{color:"#2c2416"}}>1661336G</strong></p>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Facture N°</p>
                    <p style={{fontSize:20,fontWeight:800,color:"#2c2416"}}>F-{modal.invNum||"—"}</p>
                    <p style={{fontSize:12,color:"#8a7a65",marginTop:6}}>Date : {new Date().toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>

                {/* CLIENT */}
                <div style={{marginBottom:18,background:"#faf8f5",borderRadius:8,padding:"12px 16px",border:"1px solid #e0d8cc"}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Facturé à</p>
                  <p style={{fontSize:16,fontWeight:600,color:"#2c2416"}}>{r.guest}</p>
                  {r.email&&<p style={{fontSize:12,color:"#6a5a45",marginTop:2}}>{r.email}</p>}
                  {r.phone&&<p style={{fontSize:12,color:"#6a5a45"}}>{r.phone}</p>}
                  {r.cin&&<p style={{fontSize:12,color:"#6a5a45"}}>CIN : {r.cin}</p>}
                </div>

                {/* TABLEAU */}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:18}}>
                  <thead>
                    <tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
                      {["Description","Nuits","P.U. HT","P.U. TTC","Total HT","Total TTC"].map(h=>(
                        <th key={h} style={{textAlign:h==="Description"?"left":"right",padding:"9px 7px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{borderBottom:"1px solid #f0ebe3"}}>
                      <td style={{padding:"11px 7px",fontWeight:500,color:"#2c2416"}}>
                        Chambre {room?.number} — {room?.type}
                        {billingType!==defaultType&&<span style={{fontSize:10,color:"#c9952a",fontWeight:700}}> (facturé {TARIFS[billingType]?billingType:"?"}{dpExtra>0?"+DP":""})</span>}
                        {r.pension==="dp"&&<span style={{fontSize:10,color:"#5a9e6f"}}> · Demi-Pension</span>}
                        {remise>0&&<span style={{fontSize:10,color:"#c95050"}}> · Remise {remise}%</span>}
                        <br/><span style={{fontSize:10,color:"#8a7a65"}}>{new Date(r.checkin).toLocaleDateString("fr-FR")} → {new Date(r.checkout).toLocaleDateString("fr-FR")}</span>
                      </td>
                      <td style={{textAlign:"right",padding:"11px 7px"}}>{n}</td>
                      <td style={{textAlign:"right",padding:"11px 7px",color:"#6a5a45"}}>{prixHT.toFixed(3)}</td>
                      <td style={{textAlign:"right",padding:"11px 7px"}}>{prixTTC.toFixed(3)}</td>
                      <td style={{textAlign:"right",padding:"11px 7px",fontWeight:600}}>{baseHT.toFixed(3)}</td>
                      <td style={{textAlign:"right",padding:"11px 7px",fontWeight:600,color:G2}}>{baseTTC.toFixed(3)}</td>
                    </tr>
                    {r.extraBed&&(
                      <tr style={{borderBottom:"1px solid #f0ebe3"}}>
                        <td style={{padding:"8px 7px",color:"#6a5a45"}}>Lit supplémentaire</td>
                        <td style={{textAlign:"right",padding:"8px 7px",color:"#6a5a45"}}>{n}</td>
                        <td style={{textAlign:"right",padding:"8px 7px",color:"#6a5a45"}}>{extraHT.toFixed(3)}</td>
                        <td style={{textAlign:"right",padding:"8px 7px",color:"#6a5a45"}}>{extraTTC.toFixed(3)}</td>
                        <td style={{textAlign:"right",padding:"8px 7px",fontWeight:600,color:"#6a5a45"}}>{extraLineHT.toFixed(3)}</td>
                        <td style={{textAlign:"right",padding:"8px 7px",fontWeight:600,color:"#6a5a45"}}>{extraLineTTC.toFixed(3)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* TOTAUX */}
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                  <table style={{fontSize:12,borderCollapse:"collapse",minWidth:300,background:"#faf8f5",borderRadius:8,overflow:"hidden",border:"1px solid #e0d8cc"}}>
                    <tbody>
                      {[
                        ["Total HT",totalHT.toFixed(3)+" TND","#6a5a45",false],
                        ["TVA (7%)",tvaAmt.toFixed(3)+" TND","#6a5a45",false],
                      ].map(([l,v,c,bold])=>(
                        <tr key={l} style={{borderBottom:"1px solid #e0d8cc"}}>
                          <td style={{padding:"8px 16px",color:c,fontWeight:bold?700:400,fontSize:bold?13:12}}>{l}</td>
                          <td style={{padding:"8px 16px",color:bold?G2:c,fontWeight:bold?700:500,textAlign:"right",fontSize:bold?14:12}}>{v}</td>
                        </tr>
                      ))}
                      {remise>0&&(
                        <tr style={{borderBottom:"1px solid #e0d8cc"}}>
                          <td style={{padding:"8px 16px",color:"#c95050",fontWeight:600}}>Remise ({remise}%)</td>
                          <td style={{padding:"8px 16px",color:"#c95050",fontWeight:600,textAlign:"right"}}>- {remiseMont.toFixed(3)} TND</td>
                        </tr>
                      )}
                      <tr style={{borderBottom:"1px solid #e0d8cc"}}>
                        <td style={{padding:"8px 16px",color:"#6a5a45"}}>Timbre fiscal</td>
                        <td style={{padding:"8px 16px",color:"#6a5a45",fontWeight:600,textAlign:"right"}}>1,000 TND</td>
                      </tr>
                      <tr style={{background:G2}}>
                        <td style={{padding:"11px 16px",fontWeight:800,fontSize:14,color:"#fff"}}>Net à payer</td>
                        <td style={{padding:"11px 16px",fontWeight:800,fontSize:18,color:"#fff",textAlign:"right"}}>{(Math.round((totalApresRemise+1)*100)/100).toFixed(3)} TND</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* REMISE — masqué à l'impression */}
                <div className="no-print" style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                  <label style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,whiteSpace:"nowrap"}}>🏷 Remise %</label>
                  <input type="number" min="0" max="100" value={modal.remise||0}
                    onChange={e=>setModal(m=>({...m,remise:parseFloat(e.target.value)||0}))}
                    style={{width:80,padding:"6px 10px",border:"1.5px solid #e0d0b0",borderRadius:6,fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:600,color:"#c9952a",textAlign:"center"}}
                  />
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>
                    {remise>0?`→ Économie de ${remiseMont.toFixed(3)} TND`:"Aucune remise"}
                  </span>
                </div>

                {/* STATUT + MENTION LÉGALE */}
                <div style={{marginBottom:16}}>
                  <span style={{fontSize:12,fontWeight:700,color:r.paid?"#2a7a4a":"#a02a2a",background:r.paid?"#e8f5ee":"#fce8e8",padding:"5px 14px",borderRadius:20,border:"1px solid "+(r.paid?"#7bc4a0":"#e09090")}}>
                    {r.paid?"✓ PAYÉ":"⚠ EN ATTENTE DE PAIEMENT"}
                  </span>
                </div>
                <p style={{fontSize:10,color:"#a09080",borderTop:"1px solid #f0ebe3",paddingTop:12}}>
                  Arrêtée la présente facture à la somme de : <strong>{montantEnLettres(Math.round((totalApresRemise+1)*100)/100)}</strong>
                </p>
                <SignatureBlock showCachet={showCachet}/>

                <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:16,borderTop:"1px solid #f0ebe3",paddingTop:14}}>
                  {/* Toggle cachet */}
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530",userSelect:"none"}}>
                    <input type="checkbox" checked={showCachet} onChange={e=>setShowCachet(e.target.checked)} style={{width:15,height:15,cursor:"pointer"}}/>
                    🏷 Avec cachet
                  </label>
                  <div style={{display:"flex",gap:8}}>
                  <button className="btn-ghost" onClick={closeModal}>Fermer</button>
                  {!modal.saved?(
                    <button className="btn-gold" onClick={async()=>{
                      const r=modal.data;
                      const room=ROOMS.find(rm=>rm.id===r.roomId);
                      const n=nights(r.checkin,r.checkout);
                      const TARIFS_S={single:100,double:160,triple:220,quad:280,suite:200};
                      const typeMap_S={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
                      const billingType_S=r.billingType||(typeMap_S[room?.type]||"double");
                      const dpExtra_S=r.pension==="dp"?40:0;
                      const prixBase_S=(TARIFS_S[billingType_S]||160)+dpExtra_S;
                      const remise_S=parseFloat(r.remise)||0;
                      const prixTTC_S=r.customPrice!==undefined?r.customPrice:Math.round(prixBase_S*(1-remise_S/100)*100)/100;
                      const extraTTC_S=r.extraBed?30:0;
                      const totalTTC_S=Math.round((n*prixTTC_S+n*extraTTC_S)*100)/100;
                      const totalHT_S=Math.round((totalTTC_S/1.07)*100)/100;
                      const num=await nextInvNum();
                      const ok=await saveFacture({numero:num,type:'reservation',client:r.guest,phone:r.phone||null,email:r.email||null,cin:r.cin||null,reservation_id:r.id,montant_ht:totalHT_S,tva:Math.round((totalTTC_S-totalHT_S)*100)/100,timbre:1,montant_ttc:Math.round((totalTTC_S+1)*100)/100,remise:modal.remise||0,notes:r.notes||null,lignes:[{desc:"Chambre "+room?.number+" × "+n+" nuits",qty:n,prixTTC:prixTTC_S}]});
                      if(ok){setModal(m=>({...m,saved:true,invNum:num}));showToast('Facture F-'+num+' enregistrée ✓','success');}
                      else showToast('Erreur enregistrement','error');
                    }}>💾 Enregistrer</button>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2a8a5a",fontWeight:700}}>✓ F-{modal.invNum}</span>
                      {userRole==="gerant"&&(
                        <button className="btn-red" style={{fontSize:11,padding:"5px 12px"}} onClick={async()=>{
                          if(!confirm('Annuler et supprimer la facture F-'+modal.invNum+' ?')) return;
                          await cancelFacture(modal.invNum);
                          setModal(m=>({...m,saved:false,invNum:undefined}));
                          showToast('Facture annulée','error');
                        }}>✕ Annuler</button>
                      )}
                    </div>
                  )}
                  <button className="btn-primary" style={{opacity:modal.saved?1:.45,cursor:modal.saved?"pointer":"not-allowed"}} onClick={()=>{
                    if(!modal.saved) return;
                    const lignes=[{code:room?.type||"",desc:"Chambre "+room?.number+" × "+n+" nuits",qty:n,prixTTC:prixTTC}];
                    if(r.extraBed) lignes.push({code:"",desc:"Lit supplémentaire × "+n+" nuits",qty:n,prixTTC:30});
                    doPrint({numero:"F-"+modal.invNum,type:"reservation",client:r.guest,phone:r.phone,email:r.email,cin:r.cin,montant_ht:totalHT,tva:tvaAmt,montant_ttc:Math.round((totalApresRemise+1)*100)/100,remise:remisePrint,notes:r.notes,lignes,created_at:new Date(),showCachet});
                  }}>🖨 Imprimer</button>
                  </div>
                </div>
              </div>
            );} return <InvoiceModal/>;
          })()}

          {/* FACTURE LIBRE */}
          {modal.type==="freeInvoice"&&(
            <FreeInvoiceModal
              fi={freeInvoice}
              setFreeInvoice={setFreeInvoice}
              sb={sb}
              REFS={REFS}
              LOGO={LOGO}
              closeModal={closeModal}
              saveFacture={saveFacture}
              cancelFacture={cancelFacture}
              showToast={showToast}
              doPrint={doPrint}
              montantEnLettres={montantEnLettres}
              SignatureBlock={SignatureBlock}
              nextInvNum={nextInvNum}
              userRole={userRole}
            />
          )}

          {/* DEVIS GROUPE */}
          {modal.type==="devis"&&(()=>{
            const G2="#8B6434";
            const di=devisInfo;
            const setDI=fn=>setDevisInfo(f=>fn(f));
            const n=(di.checkin&&di.checkout)?nights(di.checkin,di.checkout):0;
            const devNum=di.devNum||"00000";

            const lines=(di.lines||[{code:"",desc:"",qty:1,prixTTC:0}]).map(l=>{
              const ttc=parseFloat(l.prixTTC)||0;
              const ht=Math.round((ttc/1.07)*1000)/1000;
              const qty=parseFloat(l.qty)||1;
              return{...l,prixHT:ht,prixTTC:ttc,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};
            });
            const grandTTC=Math.round(lines.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
            const grandHT=Math.round(lines.reduce((a,l)=>a+l.totalHT,0)*100)/100;
            const tvaAmt=Math.round((grandTTC-grandHT)*100)/100;
            const remise=parseFloat(di.remise)||0;
            const remiseMont=Math.round(grandTTC*(remise/100)*100)/100;
            const netAPayer=Math.round((grandTTC-remiseMont)*100)/100;

            return(
              <div className="modal" style={{maxWidth:680,fontFamily:'"Inter",sans-serif'}}>

                {/* ── FORMULAIRE ── */}
                <div className="no-print" style={{marginBottom:16}}>
                  <h2 style={{fontSize:20,fontWeight:600,color:G2,marginBottom:16,fontFamily:'"Cormorant Garamond",serif'}}>📋 Devis Groupe</h2>

                  {/* Infos client + dates */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    {[["Client","client","Nom / Groupe"],["Téléphone","phone","xx xxx xxx"],["Arrivée","checkin",""],["Départ","checkout",""]].map(([label,key,ph])=>(
                      <div key={key}>
                        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{label}</label>
                        <input type={key==="checkin"||key==="checkout"?"date":"text"} value={di[key]||""} onChange={e=>setDI(f=>({...f,[key]:e.target.value}))} placeholder={ph} style={{fontSize:12,padding:"7px 10px"}}/>
                      </div>
                    ))}
                  </div>
                  {n>0&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#c9952a",fontWeight:700,marginBottom:12,textAlign:"right"}}>📅 {n} nuit{n>1?"s":""}</p>}

                  {/* Lignes */}
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
                    <thead><tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
                      {["Réf.","Désignation","Nuits","P.U. TTC",""].map((h,i)=>(
                        <th key={i} style={{textAlign:i===3?"right":"left",padding:"7px 6px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(di.lines||[]).map((l,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
                          <td style={{padding:"5px 6px",width:90}}>
                            <select value={l.code||""} onChange={e=>{
                              const r=REFS.find(x=>x.code===e.target.value);
                              setDI(f=>{const ls=[...f.lines];ls[i]={...ls[i],code:e.target.value,desc:r?r.label:"",prixTTC:r?r.price:0};return{...f,lines:ls};});
                            }} style={{fontSize:11,padding:"4px 6px",width:85}}>
                              <option value="">— Choisir —</option>
                              {REFS.map(r=><option key={r.code} value={r.code}>{r.code}</option>)}
                              <option value="AUTRE">AUTRE</option>
                            </select>
                          </td>
                          <td style={{padding:"5px 6px"}}>
                            {l.code==="AUTRE"||!l.code
                              ?<input value={l.desc||""} onChange={e=>setDI(f=>{const ls=[...f.lines];ls[i]={...ls[i],desc:e.target.value};return{...f,lines:ls};})} placeholder={l.code==="AUTRE"?"Désignation...":"← Choisir une référence"} disabled={!l.code} style={{fontSize:12,padding:"4px 8px",opacity:l.code?1:.5}}/>
                              :<span style={{fontSize:12,fontWeight:500,padding:"4px 8px",display:"block"}}>{REFS.find(r=>r.code===l.code)?.label}</span>
                            }
                          </td>
                          <td style={{padding:"5px 6px",width:55}}>
                            <input type="number" min="1" value={l.qty} onChange={e=>setDI(f=>{const ls=[...f.lines];ls[i]={...ls[i],qty:e.target.value};return{...f,lines:ls};})} style={{fontSize:12,padding:"4px 6px",width:46,textAlign:"center"}}/>
                          </td>
                          <td style={{padding:"5px 6px",width:100}}>
                            <input type="number" min="0" step="0.001" value={l.prixTTC} onChange={e=>setDI(f=>{const ls=[...f.lines];ls[i]={...ls[i],prixTTC:e.target.value};return{...f,lines:ls};})} style={{fontSize:12,padding:"4px 8px",width:90,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 4px",width:30}}>
                            {(di.lines||[]).length>1&&<button onClick={()=>setDI(f=>({...f,lines:f.lines.filter((_,j)=>j!==i)}))} style={{background:"#fce8e8",color:"#a02a2a",border:"none",borderRadius:4,padding:"3px 7px",fontSize:11,cursor:"pointer"}}>✕</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={()=>setDI(f=>({...f,lines:[...(f.lines||[]),{code:"",desc:"",qty:n||1,prixTTC:0}]}))}
                    style={{fontSize:11,background:"#faf8f5",border:"1px dashed #c0b080",color:"#8a7040",padding:"5px 14px",borderRadius:6,cursor:"pointer",marginBottom:12,fontFamily:'"Jost",sans-serif'}}>
                    + Ajouter une ligne
                  </button>

                  {/* Remise + Notes */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"10px 14px"}}>
                      <label style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040",textTransform:"uppercase",whiteSpace:"nowrap"}}>🏷 Remise %</label>
                      <input type="number" min="0" max="100" value={di.remise||0} onChange={e=>setDI(f=>({...f,remise:e.target.value}))} style={{width:60,padding:"5px 8px",border:"1.5px solid #e0d0b0",borderRadius:6,fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:600,color:"#c9952a",textAlign:"center"}}/>
                      {remise>0&&<span style={{fontSize:11,color:"#c95050",fontWeight:600}}>− {remiseMont.toFixed(3)} TND</span>}
                    </div>
                    <div>
                      <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4,fontFamily:'"Jost",sans-serif'}}>Notes</label>
                      <input value={di.notes||""} onChange={e=>setDI(f=>({...f,notes:e.target.value}))} placeholder="Conditions particulières..." style={{fontSize:12,padding:"7px 10px"}}/>
                    </div>
                  </div>

                  {/* Totaux aperçu */}
                  <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
                    <div style={{fontFamily:'"Jost",sans-serif',fontSize:12,minWidth:260,background:"#faf8f5",borderRadius:8,padding:"12px 16px",border:"1px solid #e0d8cc"}}>
                      {[["Total HT",grandHT.toFixed(3)+" TND","#6a5a45"],["TVA (7%)",tvaAmt.toFixed(3)+" TND","#6a5a45"]].map(([l,v,c])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:5,color:c}}><span>{l}</span><span style={{fontWeight:500}}>{v}</span></div>
                      ))}
                      {remise>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5,color:"#c95050"}}><span>Remise ({remise}%)</span><span style={{fontWeight:600}}>− {remiseMont.toFixed(3)} TND</span></div>}
                      <div style={{display:"flex",justifyContent:"space-between",background:G2,color:"#fff",padding:"8px 12px",borderRadius:6,marginTop:6,fontWeight:700}}>
                        <span>Total TTC</span><span>{netAPayer.toFixed(3)} TND</span>
                      </div>
                    </div>
                  </div>

                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14,paddingTop:12,borderTop:"1px solid #f0ebe3"}}>
                    <button className="btn-ghost" onClick={closeModal}>Fermer</button>
                    {!di.saved?(
                      <button className="btn-gold" onClick={async()=>{
                        const linesCalc=(di.lines||[]).map(l=>{const ttc=parseFloat(l.prixTTC)||0;const ht=Math.round((ttc/1.07)*1000)/1000;const qty=parseFloat(l.qty)||1;return{...l,prixHT:ht,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};});
                        const gTTC=Math.round(linesCalc.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
                        const gHT=Math.round(linesCalc.reduce((a,l)=>a+l.totalHT,0)*100)/100;
                        const rem=parseFloat(di.remise)||0;
                        const remMont=Math.round(gTTC*(rem/100)*100)/100;
                        const net=Math.round((gTTC-remMont)*100)/100;
                        const devN=await nextDevNum();setDI(f=>({...f,devNum:"DEV-"+devN}));
                        const ok=await saveFacture({numero:"DEV-"+devN,type:'devis',client:di.client||null,phone:di.phone||null,montant_ht:gHT,tva:Math.round((gTTC-gHT)*100)/100,timbre:0,montant_ttc:net,remise:rem,notes:di.notes||null,lignes:di.lines});
                        if(ok){setDI(f=>({...f,saved:true}));showToast(di.devNum+' enregistré ✓','success');}
                        else showToast('Erreur enregistrement','error');
                      }}>💾 Enregistrer</button>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2a8a5a",fontWeight:700}}>✓ {di.devNum}</span>
                        {userRole==="gerant"&&(
                          <button className="btn-red" style={{fontSize:11,padding:"5px 12px"}} onClick={async()=>{
                            if(!confirm('Annuler et supprimer le devis '+di.devNum+' ?')) return;
                            await cancelFacture(di.devNum);
                            setDI(f=>({...f,saved:false}));
                            showToast('Devis annulé','error');
                          }}>✕ Annuler</button>
                        )}
                      </div>
                    )}
                    <button className="btn-primary" style={{opacity:di.saved?1:.45,cursor:di.saved?"pointer":"not-allowed"}} onClick={()=>{
                      if(!di.saved) return;
                      const lc2=(di.lines||[]).map(l=>{const ttc=parseFloat(l.prixTTC)||0;const ht=Math.round((ttc/1.07)*1000)/1000;const qty=parseFloat(l.qty)||1;return{...l,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};});
                      const gTTC2=Math.round(lc2.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
                      const gHT2=Math.round(lc2.reduce((a,l)=>a+l.totalHT,0)*100)/100;
                      const rem2=parseFloat(di.remise)||0;
                      const remMont2=Math.round(gTTC2*(rem2/100)*100)/100;
                      const net2=Math.round((gTTC2-remMont2)*100)/100;
                      doPrint({numero:di.devNum,type:'devis',client:di.client,phone:di.phone,montant_ht:gHT2,tva:Math.round((gTTC2-gHT2)*100)/100,montant_ttc:net2,remise:rem2,notes:di.notes,lignes:di.lines,created_at:new Date()});
                    }}>🖨 Imprimer</button>
                  </div>
                </div>

                {/* ══ ZONE A4 IMPRESSION ══ */}
                <div className="print-only print-a4">
                  {/* En-tête */}
                  <div style={{borderBottom:"2.5px solid "+G2,paddingBottom:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <img src={LOGO} style={{height:56,width:56,objectFit:"cover",borderRadius:8,border:"1px solid #e0d8cc"}}/>
                      <div>
                        <p style={{fontSize:11,fontWeight:700,color:"#2c2416"}}>Société Hedi pour les services touristiques — SHST</p>
                        <p style={{fontSize:16,fontWeight:700,color:G2,letterSpacing:1}}>IMPAVID HOTEL</p>
                        <p style={{fontSize:10,color:"#6a5a45",marginTop:3}}>Rue Jamel Abdelnasser, Gabès 6000</p>
                        <p style={{fontSize:10,color:"#6a5a45"}}>impavidhotel@gmail.com · MF : <strong>1661336G</strong> · Tél/Fax : 75 220 856</p>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <p style={{fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1}}>Devis N°</p>
                      <p style={{fontSize:20,fontWeight:800,color:"#2c2416"}}>{devNum}</p>
                      <p style={{fontSize:11,color:"#8a7a65",marginTop:4}}>Date : {new Date().toLocaleDateString("fr-FR")}</p>
                    </div>
                  </div>

                  {/* Client + dates */}
                  {(di.client||di.checkin)&&(
                    <div style={{display:"flex",gap:24,marginBottom:16,padding:"10px 14px",background:"#faf8f5",borderRadius:6,border:"1px solid #e0d8cc",flexWrap:"wrap"}}>
                      {di.client&&<div><p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",marginBottom:3}}>Client</p><p style={{fontSize:14,fontWeight:600,color:"#2c2416"}}>{di.client}</p>{di.phone&&<p style={{fontSize:11,color:"#6a5a45"}}>{di.phone}</p>}</div>}
                      {di.checkin&&<div><p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",marginBottom:3}}>Arrivée</p><p style={{fontSize:13,fontWeight:500}}>{new Date(di.checkin).toLocaleDateString("fr-FR")}</p></div>}
                      {di.checkout&&<div><p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",marginBottom:3}}>Départ</p><p style={{fontSize:13,fontWeight:500}}>{new Date(di.checkout).toLocaleDateString("fr-FR")}</p></div>}
                      {n>0&&<div><p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",marginBottom:3}}>Durée</p><p style={{fontSize:13,fontWeight:700,color:G2}}>{n} nuit{n>1?"s":""}</p></div>}
                    </div>
                  )}

                  {/* Tableau lignes */}
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:16}}>
                    <thead>
                      <tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
                        {["Réf.","Désignation","Nuits","P.U. HT","P.U. TTC","Total HT","Total TTC"].map((h,i)=>(
                          <th key={i} style={{textAlign:i>=3?"right":"left",padding:"9px 8px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.filter(l=>l.code||l.desc).map((l,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
                          <td style={{padding:"10px 8px",fontWeight:700,color:"#8a7040",fontSize:10}}>{l.code==="AUTRE"?"":l.code}</td>
                          <td style={{padding:"10px 8px",fontWeight:500,color:"#2c2416"}}>{l.code&&l.code!=="AUTRE"?REFS.find(r=>r.code===l.code)?.label:l.desc}</td>
                          <td style={{padding:"10px 8px",textAlign:"right"}}>{l.qty}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",color:"#6a5a45"}}>{l.prixHT.toFixed(3)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right"}}>{l.prixTTC.toFixed(3)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontWeight:600}}>{l.totalHT.toFixed(3)}</td>
                          <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:G2}}>{l.totalTTC.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totaux */}
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                    <table style={{fontSize:11,borderCollapse:"collapse",minWidth:280,border:"1px solid #e0d8cc",borderRadius:8,overflow:"hidden"}}>
                      <tbody>
                        <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}><td style={{padding:"8px 16px",color:"#6a5a45"}}>Total HT</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45",minWidth:130}}>{grandHT.toFixed(3)} TND</td></tr>
                        <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}><td style={{padding:"8px 16px",color:"#6a5a45"}}>TVA (7%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>{tvaAmt.toFixed(3)} TND</td></tr>
                        {remise>0&&<tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff5f5"}}><td style={{padding:"8px 16px",color:"#c95050",fontWeight:600}}>Remise ({remise}%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:700,color:"#c95050"}}>− {remiseMont.toFixed(3)} TND</td></tr>}
                        <tr style={{background:G2}}><td style={{padding:"11px 16px",fontWeight:800,fontSize:13,color:"#fff"}}>Total TTC</td><td style={{padding:"11px 16px",fontWeight:800,fontSize:16,color:"#fff",textAlign:"right"}}>{netAPayer.toFixed(3)} TND</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {di.notes&&<p style={{fontSize:10,color:"#6a5a45",background:"#faf8f5",padding:"8px 12px",borderRadius:6,marginBottom:12,borderLeft:"3px solid #c0a870"}}><strong>Notes :</strong> {di.notes}</p>}
                  <p style={{fontSize:9,color:"#a09080",borderTop:"1px solid #f0ebe3",paddingTop:10,marginTop:8}}>
                    Arrêtée la présente estimation à : <strong>{montantEnLettres(netAPayer)}</strong> — Devis non contractuel, valable 30 jours.
                  </p>
                  <SignatureBlock/>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── ZONE D'IMPRESSION GLOBALE (hors modaux) ── */}
      {printData&&(()=>{
        const G2="#8B6434";

        // ── 8 BONS VIERGES ──
        if(printData.type==="bonsVierges"){
          const BonVierge=({k})=>(
            <div key={k} style={{width:"48%",border:"1.5px solid #c9952a",borderRadius:4,overflow:"hidden",fontFamily:'"Inter",Arial,sans-serif',pageBreakInside:"avoid"}}>
              <div style={{background:"#2c2416",padding:"5px 0",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <img src={LOGO} alt="" style={{height:18,width:18,objectFit:"cover",borderRadius:2,border:"1px solid #c9952a"}}/>
                <div>
                  <p style={{fontSize:9,fontWeight:800,color:"#f5d984",letterSpacing:1,textTransform:"uppercase",margin:0}}>IMPAVID HOTEL</p>
                  <p style={{fontSize:6,color:"#c0a860",margin:0,letterSpacing:.5}}>BON DE RESTAURANT — DP</p>
                </div>
              </div>
              <div style={{padding:"6px 8px",background:"#fff"}}>
                {/* Badge 1 repas */}
                <div style={{background:"#fef3d0",border:"1px solid #e8c870",borderRadius:3,padding:"3px 0",textAlign:"center",marginBottom:6}}>
                  <p style={{fontSize:8,fontWeight:800,color:"#8a5c10",margin:0,letterSpacing:.5,textTransform:"uppercase"}}>🍽 1 REPAS</p>
                </div>
                {["Valable le","Client","Signature"].map(lbl=>(
                  <div key={lbl} style={{marginBottom:5}}>
                    <p style={{fontSize:6,fontWeight:700,color:"#a09080",textTransform:"uppercase",letterSpacing:.5,margin:"0 0 1px"}}>{lbl}</p>
                    <div style={{borderBottom:"1px solid #c0a870",height:11}}/>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                  <p style={{fontSize:5.5,color:"#b0a080",margin:0}}>Valable 1 repas · Non remboursable</p>
                  <div style={{width:30,height:30,border:"1px dashed #c9952a",borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <p style={{fontSize:5,color:"#d0c090",margin:0}}>Cachet</p>
                  </div>
                </div>
              </div>
            </div>
          );
          return(
            <div id="print-zone" style={{display:"none"}}>
              <div className="print-a4" style={{padding:"6mm"}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:"2%",rowGap:"5px"}}>
                  {[0,1,2,3,4,5,6,7,8,9].map(i=><BonVierge key={i} k={i}/>)}
                </div>
              </div>
            </div>
          );
        }

        // ── BON RESTAURANT NOMINATIF ──
        if(printData.type==="bonRestaurant"){
          const repasIcon=printData.repas==="diner"?"🌙":"🌤";
          const nuits=printData.bons||printData.nuits?.map(d=>({date:d,guest:printData.guest}))||[{date:printData.date,guest:printData.guest}];
          const UnBon=({dateStr,guest})=>(
            <div style={{
              width:"120mm",height:"48mm",
              border:"1.5px solid #c9952a",
              borderRadius:4,
              overflow:"hidden",
              fontFamily:'"Inter",Arial,sans-serif',
              pageBreakInside:"avoid",
              display:"flex",
              flexDirection:"column",
              boxSizing:"border-box",
            }}>
              {/* En-tête */}
              <div style={{background:"#2c2416",padding:"4px 8px",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <img src={LOGO} alt="" style={{height:20,width:20,objectFit:"cover",borderRadius:3,border:"1px solid #c9952a",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:9,fontWeight:800,color:"#f5d984",letterSpacing:1,textTransform:"uppercase",margin:0,lineHeight:1.2}}>IMPAVID HOTEL</p>
                  <p style={{fontSize:6,color:"#c0a860",margin:0,letterSpacing:.5}}>Gabès · 75 220 856</p>
                </div>
                <div style={{background:"#c9952a",borderRadius:3,padding:"3px 6px",textAlign:"center"}}>
                  <p style={{fontSize:14,margin:0,lineHeight:1}}>{repasIcon}</p>
                  <p style={{fontSize:7,fontWeight:800,color:"#fff",margin:0,letterSpacing:.5}}>1 REPAS</p>
                </div>
              </div>
              {/* Bandeau */}
              <div style={{background:"#c9952a",padding:"2px 0",textAlign:"center",flexShrink:0}}>
                <p style={{fontSize:7,fontWeight:800,color:"#fff",letterSpacing:1.5,textTransform:"uppercase",margin:0}}>BON DE RESTAURANT — {printData.pension}</p>
              </div>
              {/* Corps */}
              <div style={{padding:"5px 8px",background:"#fff",flex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:6,fontWeight:700,color:"#a09080",textTransform:"uppercase",letterSpacing:.5,margin:"0 0 1px"}}>Valable le</p>
                    <p style={{fontSize:9,fontWeight:800,color:"#2c2416",margin:"0 0 5px"}}>{new Date(dateStr+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long",year:"numeric"})}</p>
                    <p style={{fontSize:6,fontWeight:700,color:"#a09080",textTransform:"uppercase",letterSpacing:.5,margin:"0 0 1px"}}>Client</p>
                    <p style={{fontSize:11,fontWeight:800,color:"#2c2416",margin:0,lineHeight:1.2}}>{guest}</p>
                  </div>
                  {printData.showCachet&&(
                    <img src={CACHET_IMG} alt="" style={{width:40,height:40,objectFit:"contain",mixBlendMode:"multiply",flexShrink:0}}/>
                  )}
                </div>
                <div style={{borderTop:"1px dashed #e0d0b0",paddingTop:3,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <p style={{fontSize:5.5,color:"#b0a080",margin:0}}>Valable 1 repas · Non remboursable</p>
                  <div>
                    <p style={{fontSize:5.5,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",margin:"0 0 2px"}}>Signature</p>
                    <div style={{borderBottom:"1px solid #c0a870",width:50,height:8}}/>
                  </div>
                </div>
              </div>
            </div>
          );
          return(
            <div id="print-zone" style={{display:"none"}}>
              <div className="print-a4" style={{padding:"8mm"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"3mm"}}>
                  {nuits.map((b,idx)=>(
                    <React.Fragment key={idx}>
                      <UnBon dateStr={b.date} guest={b.guest}/>
                      {idx<nuits.length-1&&(
                        <div style={{width:"100%",borderTop:"1px dashed #d0c090",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <span style={{background:"#fff",padding:"0 6px",fontSize:7,color:"#c9952a"}}>✂</span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        // ── FACTURE / DEVIS ──
        return(
          <div id="print-zone" style={{display:"none"}}>
            <div className="print-a4">
              <div style={{borderBottom:"2px solid #333",paddingBottom:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <img src={LOGO} style={{height:56,width:56,objectFit:"cover",borderRadius:8,border:"1px solid #e0d8cc"}}/>
                  <div>
                    <p style={{fontSize:11,fontWeight:700,color:"#2c2416"}}>Société Hedi pour les services touristiques — SHST</p>
                    <p style={{fontSize:16,fontWeight:700,color:"#000",letterSpacing:1}}>IMPAVID HOTEL</p>
                    <p style={{fontSize:10,color:"#6a5a45"}}>Rue Jamel Abdelnasser, Gabès 6000</p>
                    <p style={{fontSize:10,color:"#6a5a45"}}>impavidhotel@gmail.com · MF : <strong>1661336G</strong> · Tél/Fax : 75 220 856</p>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{printData.type==="devis"?"Devis N°":"Facture N°"}</p>
                  <p style={{fontSize:22,fontWeight:800,color:"#000"}}>{printData.numero}</p>
                  <p style={{fontSize:11,color:"#8a7a65",marginTop:4}}>Date : {new Date(printData.created_at||Date.now()).toLocaleDateString("fr-FR")}</p>
                </div>
              </div>
              {printData.client&&(
                <div style={{marginBottom:14,background:"#faf8f5",borderRadius:6,padding:"10px 14px",border:"1px solid #e0d8cc"}}>
                  <p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Facturé à</p>
                  <p style={{fontSize:15,fontWeight:600,color:"#000",whiteSpace:"pre-line"}}>{printData.client}</p>
                  {printData.adresse&&<p style={{fontSize:11,color:"#6a5a45",marginTop:2,whiteSpace:"pre-line"}}>{printData.adresse}</p>}
                  {printData.mf&&<p style={{fontSize:11,color:"#6a5a45",fontWeight:600}}>MF : {printData.mf}</p>}
                  {printData.cin&&<p style={{fontSize:11,color:"#6a5a45"}}>CIN : {printData.cin}</p>}
                  {printData.phone&&<p style={{fontSize:11,color:"#6a5a45"}}>{printData.phone}</p>}
                  {printData.email&&<p style={{fontSize:11,color:"#6a5a45"}}>{printData.email}</p>}
                </div>
              )}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:16}}>
                <thead>
                  <tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
                    {["Réf.","Désignation","Qté","P.U. HT","P.U. TTC","Total HT","Total TTC"].map((h,i)=>(
                      <th key={i} style={{textAlign:i>=3?"right":"left",padding:"9px 8px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(printData.lignes||[]).filter(l=>l.desc||l.code).map((l,i)=>{
                    const ttc=parseFloat(l.prixTTC)||0;
                    const ht=Math.round((ttc/1.07)*1000)/1000;
                    const qty=parseFloat(l.qty)||1;
                    return(
                      <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
                        <td style={{padding:"10px 8px",fontSize:10,color:"#8a7040"}}>{l.code==="AUTRE"?"":l.code||""}</td>
                        <td style={{padding:"10px 8px",fontWeight:500,color:"#2c2416"}}>{l.desc||""}</td>
                        <td style={{padding:"10px 8px",textAlign:"right"}}>{qty}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:"#555"}}>{ht.toFixed(3)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right"}}>{ttc.toFixed(3)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",fontWeight:600}}>{(Math.round(qty*ht*100)/100).toFixed(3)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:"#000"}}>{(Math.round(qty*ttc*100)/100).toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                <table style={{fontSize:11,borderCollapse:"collapse",minWidth:280,border:"1px solid #e0d8cc"}}>
                  <tbody>
                    <tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff"}}><td style={{padding:"8px 16px",color:"#555"}}>Total HT</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,minWidth:130}}>{(printData.montant_ht||0).toFixed(3)} TND</td></tr>
                    <tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff"}}><td style={{padding:"8px 16px",color:"#555"}}>TVA (7%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600}}>{(printData.tva||0).toFixed(3)} TND</td></tr>
                    {(printData.remise||0)>0&&<tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff5f5"}}><td style={{padding:"8px 16px",color:"#c95050",fontWeight:600}}>Remise ({printData.remise}%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:700,color:"#c95050"}}>- {(Math.round((printData.montant_ht||0)*((printData.remise||0)/100)*100)/100).toFixed(3)} TND</td></tr>}
                    {printData.type!=="devis"&&<tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff"}}><td style={{padding:"8px 16px",color:"#555"}}>Timbre fiscal</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600}}>1,000 TND</td></tr>}
                    <tr style={{background:"#333"}}><td style={{padding:"11px 16px",fontWeight:800,fontSize:13,color:"#fff"}}>{printData.type==="devis"?"Total TTC":"Net à payer"}</td><td style={{padding:"11px 16px",fontWeight:800,fontSize:16,color:"#fff",textAlign:"right"}}>{(printData.montant_ttc||0).toFixed(3)} TND</td></tr>
                  </tbody>
                </table>
              </div>
              {printData.notes&&<p style={{fontSize:10,color:"#6a5a45",background:"#faf8f5",padding:"8px 12px",borderRadius:6,marginBottom:12,borderLeft:"3px solid #c0a870"}}><strong>Notes :</strong> {printData.notes}</p>}
              <p style={{fontSize:9,color:"#a09080",borderTop:"1px solid #f0ebe3",paddingTop:10,marginTop:8}}>
                {printData.type==="devis"?`Devis non contractuel, valable 30 jours — ${printData.numero}`:`Arrêtée la présente facture à la somme de : ${montantEnLettres(printData.montant_ttc||0)}`}
              </p>
              <SignatureBlock showCachet={printData.showCachet!==false}/>
            </div>
          </div>
        );
      })()}
      </div>{/* fin contenu principal */}
    </div>

    {showJournal&&(
      <>
        {/* Overlay */}
        <div onClick={()=>setShowJournal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:900}}/>
        {/* Drawer */}
        <div style={{position:"fixed",top:0,right:0,width:520,height:"100vh",background:"#fff",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",zIndex:901,display:"flex",flexDirection:"column"}}>
          {/* Header */}
          <div style={{padding:"20px 24px",borderBottom:"1px solid #f0e8d8",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fef9f0"}}>
            <div>
              <p style={{fontSize:18,fontWeight:600,color:"#2a1e08",fontFamily:'"Cormorant Garamond",serif'}}>📋 Journal d'activité</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginTop:2}}>{logs.length} actions enregistrées</p>
            </div>
            <button onClick={()=>setShowJournal(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#8a7040",padding:4}}>✕</button>
          </div>

          {/* Filtres rapides */}
          <div style={{padding:"10px 24px",borderBottom:"1px solid #f0e8d8",display:"flex",gap:8,flexWrap:"wrap"}}>
            {["Tout","✅ Créée","✏️ Modifiée","🚫 Annulée","💰 Paiement","🧾 Facture","🔒 Bloquée"].map(f=>(
              <button key={f} onClick={()=>setLogsFilter(f==="Tout"?"":f)}
                style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                  background:logsFilter===(f==="Tout"?"":f)?"#c9952a":"#f5f0e8",
                  color:logsFilter===(f==="Tout"?"":f)?"#fff":"#8a7040",
                  border:"1px solid "+(logsFilter===(f==="Tout"?"":f)?"#c9952a":"#e8d8b0")}}>
                {f}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {logsLoading&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Chargement...</p>}
            {!logsLoading&&filteredLogs.length===0&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Aucune action</p>}
            {filteredLogs.map(log=>{
              const d = new Date(log.created_at);
              const dateStr = d.toLocaleDateString("fr-FR");
              const timeStr = d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
              return(
                <div key={log.id} style={{padding:"12px 24px",borderBottom:"1px solid #f5f0ea",display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#2a1e08"}}>{log.action}</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{dateStr} {timeStr}</p>
                    </div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530",marginBottom:2}}>
                      👤 {log.user_email}
                    </p>
                    {log.details&&(
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>
                        {[
                          log.details.client&&`${log.details.client}`,
                          log.details.chambre&&`Ch.${log.details.chambre}`,
                          log.details.checkin&&`${new Date(log.details.checkin).toLocaleDateString("fr-FR")} → ${new Date(log.details.checkout).toLocaleDateString("fr-FR")}`,
                          log.details.montant&&`${parseFloat(log.details.montant).toFixed(3)} TND`,
                          log.details.numero&&`F-${log.details.numero}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer refresh */}
          <div style={{padding:"12px 24px",borderTop:"1px solid #f0e8d8",background:"#faf8f5"}}>
            <button onClick={loadLogs} style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#f0f4ff",border:"1px solid #c0cfee",color:"#3a5fc8",borderRadius:6,padding:"6px 16px",cursor:"pointer",fontWeight:600}}>
              🔄 Actualiser
            </button>
          </div>
        </div>
      </>
    )}
  </>
  );
}
