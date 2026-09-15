function App({user,onLogout}){
  const [view,setView]=useState("dashboard");
  const [reservations,setReservations]=useState([]);
  const [resources,setResources]=useState([]);
  const [contrats,setContrats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [modal,setModal]=useState(null);
  const [userRole,setUserRole]=useState(null);
  const isGerant = !["receptionniste","Receptionniste"].includes(userRole); // null ou gerant → affiche
  const AMT = (n,suffix=" TND") => isGerant ? Number(n||0).toFixed(3)+suffix : "—";
  const [paiementModal,setPaiementModal]=useState(null);
  const [showPetitDej,setShowPetitDej]=useState(false);
  const [cancelModal,setCancelModal]=useState(null); // {numero, type, onDone}
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
  const [filterModePaiement,setFilterModePaiement]=useState("all");
  const [filterSource,setFilterSource]=useState("all");
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
    // Ajouter mode_paiement si présent dans le form actuel
    const isReservation = payload.checkin !== undefined || payload.checkout !== undefined || form?.checkin !== undefined;
    const extra = isReservation ? {avance:parseFloat(form?.avance||0)||0, source:form?.source||"direct"} : {};
    const payloadWithMode={...payload,mode_paiement:payload.mode_paiement||form?.modePaiement||"especes",...extra};
    try{
      const {error}=await sb.from('factures').insert([payloadWithMode]);
      if(error) throw error;
      return true;
    }catch(e){
      console.error('Erreur sauvegarde facture:',e);
      return false;
    }
  }
  // Annuler une facture (garde le numéro, restaurable)
  async function cancelFacture(numero){
    try{
      await sb.from('factures').update({
        annulee:true,
        annulee_par:user?.email||'inconnu',
        annulee_at:new Date().toISOString()
      }).eq('numero',numero);
      sb.from('logs').insert([{user_email:user?.email||'inconnu',action:'🚫 Facture annulée',details:{numero}}]).then();
    }catch(e){
      console.warn('cancelFacture error:',e);
    }
  }

  // Supprimer définitivement une facture
  async function deleteFacture(numero){
    try{
      await sb.from('factures').delete().eq('numero',numero);
      sb.from('logs').insert([{user_email:user?.email||'inconnu',action:'🗑 Facture supprimée définitivement',details:{numero}}]).then();
      const isDevis=(numero||'').startsWith('DEV-');
      if(isDevis){
        const resD=await sb.from('factures').select('*',{count:'exact',head:true}).like('numero','DEV-%').eq('annulee',false);
        await sb.from('counters').update({val:resD.count||0}).eq('id','devis');
      }else{
        const resF=await sb.from('factures').select('*',{count:'exact',head:true}).not('numero','ilike','DEV-%').eq('annulee',false);
        await sb.from('counters').update({val:resF.count||0}).eq('id','invoice');
      }
    }catch(e){
      console.warn('deleteFacture error:',e);
    }
  }

  // Restaurer une facture annulée
  async function restoreFacture(numero){
    try{
      await sb.from('factures').update({annulee:false,annulee_par:null,annulee_at:null}).eq('numero',numero);
      sb.from('logs').insert([{user_email:user?.email||'inconnu',action:'♻️ Facture restaurée',details:{numero}}]).then();
    }catch(e){
      console.warn('restoreFacture error:',e);
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

  function printVoucher(r){
    const room=ROOMS.find(x=>x.id===r.roomId);
    const n=Math.max(1,Math.round((new Date(r.checkout)-new Date(r.checkin))/86400000));
    const prixNuit=r.customPrice!==undefined?r.customPrice:(room?.price||0)+(r.pension==="dp"?40:0);
    const total=Math.round((prixNuit*n+(r.extraBed?30*n:0))*1000)/1000;
    const avance=Number(r.avance||0);
    const reste=Math.max(0,Math.round((total-avance)*1000)/1000);
    const fmt=v=>Number(v).toFixed(3);
    const fmtDate=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long",year:"numeric"});
    const dateRes=new Date(r.created_at||Date.now()).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long",year:"numeric"});
    const numRes=String(r.numero||"").padStart(8,"0");
    const nbPersonnes=(r.adults||1)+(r.children||0);
    const avanceSection=avance>0?`
      <div style="border-top:1px solid #d8c8a8;padding-top:10px;margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f5fcf8;border:1px solid #a0d8b8;border-radius:8px;padding:8px 12px;">
          <p style="font-size:7.5px;letter-spacing:1.5px;color:#2d7a4f;text-transform:uppercase;margin:0 0 2px;">Avance versee</p>
          <p style="font-size:16px;font-weight:800;color:#2d7a4f;margin:0;">${fmt(avance)} DT</p>
        </div>
        <div style="background:#fff5f5;border:1px solid #e0a0a0;border-radius:8px;padding:8px 12px;">
          <p style="font-size:7.5px;letter-spacing:1.5px;color:#c95050;text-transform:uppercase;margin:0 0 2px;">Reste a payer</p>
          <p style="font-size:16px;font-weight:800;color:#c95050;margin:0;">${fmt(reste)} DT</p>
        </div>
      </div>`:"";
    const rows=[
      ["M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z","DATE D'ARRIVEE",fmtDate(r.checkin)],
      ["M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z","DATE DE DEPART",fmtDate(r.checkout)],
      ["M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z","DUREE DU SEJOUR",n+" nuit"+(n>1?"s":"")],
      ["M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z","NOMBRE DE PERSONNES",nbPersonnes+" adulte"+(nbPersonnes>1?"s":"")],
      ["M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6","TYPE DE CHAMBRE",(room?.type||"—")],
    ].map(([p,lbl,val])=>`
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f0e8d8;">
        <div style="width:34px;height:34px;background:#f0e8d8;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b5872a" stroke-width="2" stroke-linecap="round"><path d="${p}"/></svg>
        </div>
        <div>
          <p style="font-size:7.5px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 1px;">${lbl}</p>
          <p style="font-size:13px;font-weight:700;color:#1a1208;margin:0;">${val}</p>
        </div>
      </div>`).join("");
    const html=`<div style="background:#faf7f2;width:210mm;min-height:297mm;margin:0 auto;font-family:Helvetica,Arial,sans-serif;padding:0;box-sizing:border-box;">
  <div style="text-align:center;padding:24px 30px 14px;background:#faf7f2;">
    <img src="${LOGO}" style="height:65px;width:auto;margin-bottom:6px;" alt="Logo"/>
    <p style="font-size:21px;font-weight:900;letter-spacing:6px;color:#1a1208;margin:0;">IMPAVID</p>
    <p style="font-size:12px;font-weight:700;letter-spacing:3px;color:#1a1208;margin:2px 0;">HOTEL</p>
    <p style="font-size:11px;color:#8a7040;font-style:italic;margin:2px 0;">Sejour Urbain Raffine</p>
  </div>
  <div style="padding:0 26px 20px;">
    <div style="text-align:center;margin:8px 0 14px;">
      <p style="font-size:16px;font-weight:900;letter-spacing:3px;color:#1a1208;margin:0;">VOUCHER DE RESERVATION</p>
      <div style="height:1.5px;background:linear-gradient(to right,transparent,#b5872a,transparent);margin:8px 0 0;"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:6px;">
      <div><p style="font-size:7.5px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 2px;">Numero de Reservation</p><p style="font-size:14px;font-weight:700;color:#1a1208;margin:0;">${numRes}</p></div>
      <div><p style="font-size:7.5px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 2px;">Code IATA/TIDS</p><p style="font-size:14px;font-weight:700;color:#1a1208;margin:0;">PC029090</p></div>
    </div>
    <div style="margin-bottom:12px;">
      <p style="font-size:7.5px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 2px;">Date de Reservation / Recue</p>
      <p style="font-size:13px;font-weight:700;color:#1a1208;margin:0;">${dateRes}</p>
    </div>
    <div style="background:#f0e8d8;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:14px;margin-bottom:8px;">
      <div style="width:38px;height:38px;background:#b5872a;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </div>
      <div>
        <p style="font-size:7.5px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 2px;">Nom du Client</p>
        <p style="font-size:18px;font-weight:700;color:#1a1208;margin:0;">${r.guest}</p>
      </div>
    </div>
    <div style="background:#faf7f2;border:1px solid #e8d8b8;border-radius:10px;padding:6px 14px;margin-bottom:8px;">${rows}</div>
    <div style="background:#f0e8d8;border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:38px;height:38px;background:#b5872a;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6m0 0v6m0-6h4m-4 0H8"/></svg>
        </div>
        <div>
          <p style="font-size:8px;letter-spacing:2px;color:#8a7040;text-transform:uppercase;margin:0 0 1px;">Montant Total</p>
          <p style="font-size:20px;font-weight:900;color:#1a1208;margin:0;">${fmt(total)} DT</p>
        </div>
      </div>
      ${avanceSection}
    </div>
    <p style="text-align:center;font-size:10px;color:#8a7040;font-style:italic;margin:8px 0;">Merci pour votre confiance.<br/>Nous sommes heureux de vous accueillir a l'<strong>IMPAVID HOTEL</strong>.</p>
    <!-- Signature block -->
    <div style="margin-top:16px;display:flex;justify-content:flex-end;align-items:flex-end;padding:0 10px;">
      <div style="text-align:center;">
        <p style="font-size:8px;color:#8a7040;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Cachet &amp; Signature</p>
        <p style="font-size:7px;color:#a09080;font-style:italic;margin-bottom:2px;">Pour IMPAVID HOTEL — SHST</p>
        <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCALaAl4DASIAAhEBAxEB/8QAHAABAAICAwEAAAAAAAAAAAAAAAEHBggCBAUD/8QARBAAAQMDAwMCBQIEBAQFAwQDAQACAwQFEQYSIQcxQRNRCBQiYXEygRUjQpEWJFKhM3KCsRdiksHRQ1PwJjXh8USisv/EABsBAQACAwEBAAAAAAAAAAAAAAABBQIDBAYH/8QANxEAAgICAAQEBAQGAgIDAQAAAAECAwQRBRIhMRNBUWEUIjJxBoGRoSNCUrHB0RXhJDND8PFy/9oADAMBAAIRAxEAPwDctERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAFGecKUQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAERFACIikBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBEQ8IAi4CRpkcwOBc0cjyuY7IAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgIwM5wMlSiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAhIAyeyIgOIe0nHlclGApQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAERM84QBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBPKKMc5QElcHyNY3c44C5FedeKWepp3RxucMlpy1+0jBBx2RkpbZ32SseBtcDn2XMLHnW2aO6w1jauVjGA+q0HDXZHHA7r3YZN7AcYOMlQg1o+iIikgIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAThFBAdwVKAIoccKR25UIBMBEUgIiIAiIgCIiAIiZQBFBcAvnPU08DN880cTc4y9wAz28ouoPqVGViuo+oOjtP1UlLdb7TQTRxvllYMvMbGbNxdtB2/8AEZ3/ANSxCl6p3y6dTv8AC1j0RW1VrYGufdpZDDHtLGu3NBbhww4cZBPstsceyabS6L8jFySLYzxyULlVdik62VN6urrlSado7eT/AJNplc9wx9OQWjsf1YcPOOF51D0p1xU2F9NfOqd7bXVNXLNVTUTi0GN/aOPJ/lgYBBbjBytnw0Yb5rF/cc3sXC6eJsjY3Ssa936WlwBP7L4SXO3snFO+upmzH+gyjd3x2z7kKrr10SpL9qez6gveprzU1lspI6bfHJ6RnLHh25+3j6sAHAGV1nfD3pd2pbnen3a8EXF5fLA2VoIJcXHEhG8cn3yMDnhZwqxn9dn7GLlLyRaEmo7DHy+9W9g3mL6qho+sHBb3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" alt="Cachet" style="width:75px;height:75px;object-fit:contain;mix-blend-mode:multiply;"/>
        <div style="border-top:1.5px solid #c0a870;width:150px;padding-top:4px;margin-top:2px;">
          <p style="font-size:8px;color:#a09080;">Signature autorisée</p>
        </div>
      </div>
    </div>
    <!-- Footer -->
    <div style="border-top:1px solid #e8d8b8;margin-top:10px;padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <p style="font-size:9px;color:#6a5530;margin:2px 0;">📍 Rue Jamel Abdelnacer, Gabès</p>
        <p style="font-size:9px;color:#6a5530;margin:2px 0;">📞 75220856 · ✉ impavidhotel@gmail.com</p>
      </div>
    </div>
  </div>
</div>`;
    var w=window.open("","_blank","width=900,height=1200");
    var css2="@page{size:A4 portrait;margin:0}body{margin:0;padding:0;background:#faf7f2;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'/><style>"+css2+"</style></head><body>"+html+"<script>window.onload=function(){window.print();}<\/script></body></html>");
    w.document.close();
  }


  function printEtatReservations(list){
    var sourceLabel={direct:"Direct",booking:"Booking.com",expedia:"Expedia",agence:"Agence",autre:"Autre"};
    var modeLabel={especes:"Especes",carte:"Carte",cheque:"Cheque",virement:"Virement"};
    var fmt=function(v){return Number(v||0).toFixed(3);};
    var totalNuits=0,totalMontant=0,totalPaye=0,totalReste=0;
    var fmtD=function(d){return new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});};
    var rows=list.map(function(r){
      var room=ROOMS.find(function(x){return x.id===r.roomId;});
      var n=Math.max(1,Math.round((new Date(r.checkout)-new Date(r.checkin))/86400000));
      var prixNuit=r.customPrice!==undefined?r.customPrice:(room?room.price:0)+(r.pension==="dp"?40:0);
      var total=Math.round((prixNuit*n+(r.extraBed?30*n:0))*1000)/1000;
      var avance=Number(r.avance||0);
      var reste=Math.max(0,Math.round((total-avance)*1000)/1000);
      var paye=r.paid?total:avance;
      totalNuits+=n; totalMontant+=total; totalPaye+=paye; totalReste+=reste;
      var numRes=String(r.numero||"").padStart(6,"0");
      var nbP=(r.adults||1)+(r.children||0);
      var resteColor=reste>0?"#c95050":"#2d7a4f";
      return "<tr style='border-bottom:1px solid #f0e8d8;'>"+
        "<td style='padding:5px 6px;font-size:9px;'>"+r.guest+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+numRes+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+fmtD(r.checkin)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+fmtD(r.checkout)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+n+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+nbP+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;'>"+(room?room.type:"—")+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:center;'>"+(room?room.number:"—")+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:right;'>"+fmt(prixNuit)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:right;font-weight:700;'>"+fmt(total)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:right;color:#2d7a4f;'>"+fmt(paye)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;text-align:right;color:"+resteColor+";'>"+fmt(reste)+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;'>"+(modeLabel[r.modePaiement||"especes"]||"—")+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;'>"+(sourceLabel[r.source||"direct"]||"—")+"</td>"+
        "<td style='padding:5px 6px;font-size:9px;color:#8a7040;'>"+(r.notes||"")+"</td>"+
        "</tr>";
    }).join("");
    var today=new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});
    var headers=["Client","N Res.","Arrivee","Depart","Nuits","Pers.","Type","Ch.","Tarif/N","Total","Paye/Av.","Reste","Paiement","Source","Observations"];
    var ths=headers.map(function(h){return "<th style='padding:6px 5px;text-align:left;font-size:8px;white-space:nowrap;'>"+h+"</th>";}).join("");
    var html="<div style='font-family:Arial,sans-serif;padding:10mm 8mm;width:297mm;min-height:210mm;box-sizing:border-box;'>"+
      "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:2px solid #b5872a;padding-bottom:10px;'>"+
        "<div><p style='font-size:18px;font-weight:900;letter-spacing:4px;color:#1a1208;margin:0;'>IMPAVID HOTEL</p>"+
        "<p style='font-size:10px;color:#8a7040;margin:2px 0;'>Rue Jamel Abdelnacer, Gabes - 75220856</p></div>"+
        "<div style='text-align:right;'>"+
          "<p style='font-size:14px;font-weight:700;color:#b5872a;margin:0;'>ETAT DES RESERVATIONS</p>"+
          "<p style='font-size:10px;color:#8a7040;margin:2px 0;'>Imprime le "+today+"</p>"+
          "<p style='font-size:10px;color:#8a7040;margin:0;'>"+list.length+" reservation"+(list.length>1?"s":"")+"</p>"+
        "</div>"+
      "</div>"+
      "<table style='width:100%;border-collapse:collapse;font-size:9px;'>"+
        "<thead><tr style='background:#b5872a;color:#fff;'>"+ths+"</tr></thead>"+
        "<tbody>"+rows+"</tbody>"+
        "<tfoot><tr style='background:#f5ede0;font-weight:700;border-top:2px solid #b5872a;'>"+
          "<td colspan='4' style='padding:7px 6px;font-size:9px;font-weight:700;'>TOTAUX</td>"+
          "<td style='padding:7px 6px;font-size:9px;text-align:center;'>"+totalNuits+"</td>"+
          "<td></td><td></td><td></td><td></td>"+
          "<td style='padding:7px 6px;font-size:10px;text-align:right;color:#1a1208;'>"+fmt(totalMontant)+"</td>"+
          "<td style='padding:7px 6px;font-size:10px;text-align:right;color:#2d7a4f;'>"+fmt(totalPaye)+"</td>"+
          "<td style='padding:7px 6px;font-size:10px;text-align:right;color:#c95050;'>"+fmt(totalReste)+"</td>"+
          "<td colspan='3'></td>"+
        "</tr></tfoot>"+
      "</table>"+
      "<p style='text-align:center;font-size:8px;color:#8a7040;margin-top:14px;border-top:1px solid #e8d8b0;padding-top:8px;'>"+
        "IMPAVID HOTEL - Rue Jamel Abdelnacer, Gabes - Tel: 75220856 - impavidhotel@gmail.com"+
      "</p></div>";
    var w=window.open("","_blank","width=1100,height=800");
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'/><style>@page{size:A4 landscape;margin:0}body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>"+html+"<script>window.onload=function(){window.print();}<\/script></body></html>");
    w.document.close();
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
    setFreeInvoice({client:"",adresse:"",phone:"",email:"",mf:"",lines:[{code:"",desc:"",qty:1,prixTTC:0}],remise:0,notes:"",showCachet:true,invNum:null,saved:false,mode_paiement:"especes"});
    setModal({type:"freeInvoice"});
  }

  const showToast=(msg,type="success")=>setToast({msg,type});
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(null),3500);return()=>clearTimeout(t);}},[toast]);

  // ── Charger le rôle utilisateur ──
  useEffect(()=>{
    if(user?.id){
      sb.from('profiles').select('role').eq('id',user.id).maybeSingle()
        .then(({data,error})=>{
          if(error) console.error('Role error:',error);
          setUserRole(data?.role||'receptionniste'); // défaut réceptionniste si profil manquant
        });
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
    setDevisInfo({client:"",phone:"",checkin:"",checkout:"",notes:"",remise:0,lines:[{code:"",desc:"",qty:1,prixTTC:0}],devNum:null,saved:false,validite:30});
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
      // ── Mémorisation automatique du client principal ──
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
      // ── Mémorisation automatique des accompagnants ──
      if((form.accompagnants||[]).length>0&&modal.type!=="block"){
        for(const acc of form.accompagnants){
          if(!acc.nom) continue;
          try{
            const {data:existingAcc}=await sb.from('clients').select('id').eq('nom',acc.nom).maybeSingle();
            if(existingAcc){
              await sb.from('clients').update({
                cin:acc.cin||null,
              }).eq('id',existingAcc.id);
            } else {
              await sb.from('clients').insert([{
                nom:acc.nom,
                cin:acc.cin||null,
                email:null,
                phone:null,
              }]);
            }
          }catch(e){}
        }
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

  async function markPaid(id, mode="especes"){
    const r=reservations.find(x=>x.id===id);
    const modeLabels={especes:"💵 Espèces",carte:"💳 Carte",cheque:"📝 Chèque",virement:"🏦 Virement"};
    addLog("💰 Paiement encaissé",{client:r?.guest,chambre:ROOMS.find(rm=>rm.id===r?.roomId)?.number,montant:r?getEffectivePrice(r):null,mode:modeLabels[mode]||mode});
    setSyncing(true);
    try{
      await sb.from("reservations").update({paid:true,mode_paiement:mode}).eq("id",id);
      setReservations(prev=>prev.map(x=>x.id===id?{...x,paid:true,modePaiement:mode}:x));
      showToast("Paiement enregistré — "+( modeLabels[mode]||mode)+" ✓");
    }
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
    const byMode=filterModePaiement==="all"||(r.modePaiement||"especes")===filterModePaiement;
    const bySource=filterSource==="all"||((r.source||"direct")===filterSource);
    return ms&&byStatus&&byDateFrom&&byDateTo&&byPaid&&byMode&&bySource;
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
    .modal-overlay{position:fixed;inset:0;background:rgba(42,30,8,0.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
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
      #print-zone{display:block!important;background:#fff!important;position:absolute;top:0;left:0;width:210mm;min-height:auto;z-index:9999}
      #print-zone *{background-color:transparent}
      #print-zone .print-a4{display:block!important;background:#fff!important;width:210mm;min-height:297mm;padding:12mm 14mm;box-sizing:border-box;font-family:"Inter",Arial,sans-serif;font-size:10pt;color:#000;margin:0}
      #print-zone ~ *{display:none!important}
      /* Zone impression dans modaux (facture réservation, facture libre, devis) */
      .print-only{display:none!important}
      .print-only.print-a4{display:block!important;background:#fff!important;position:static;top:auto;left:auto;width:210mm;min-height:297mm;padding:12mm 14mm;box-sizing:border-box;font-family:"Inter",Arial,sans-serif;font-size:10pt;color:#000;margin:0;z-index:9999}
      /* Eviter coupure sur éléments clés */
      table{page-break-inside:auto}
      tr{page-break-inside:avoid;page-break-after:auto}
      thead{display:table-header-group}
      tfoot{display:table-footer-group}
      @page{size:A4 portrait;margin:0}
      body{background:#fff!important}
      body{background-color:#fff!important}
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
            ["clients-societes","📋","Fichier Clients"],

            ["police","📋","Livre de Police"],
            ["contrats","🤝","Contrats"],
            ["charges","💸","Charges"],

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
          {isGerant&&(
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
                ...(isGerant?[{label:"Revenus payés",value:FMT(reservations.filter(r=>r.paid).reduce((a,r)=>a+getEffectivePrice(r),0)),total:"",color:"#c9952a",bg:"#fef3d0"}]:[]),
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
                const isPDJ=h>=6&&h<12; // service matin jusqu'à 12h
                // Avant 12h : clients qui ont dormi cette nuit (checkout >= aujourd'hui)
                // Après 12h : clients qui dorment cette nuit (arrivés aujourd'hui ou avant, partent demain ou après)
                const resPDJ=reservations.filter(r=>
                  ["confirmed","checkedin","checkedout"].includes(r.status)&&
                  (h<12
                    ? r.checkin<getToday()&&r.checkout>=getToday()  // avant 12h : clients de la nuit passée
                    : r.checkin<=getToday()&&r.checkout>getToday()  // après 12h : clients de la nuit à venir
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
                      {resPDJ.length>4&&(
                        <button onClick={()=>setShowPetitDej(true)} style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#c9952a",marginTop:4,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}}>
                          +{resPDJ.length-4} autres chambres — voir tout
                        </button>
                      )}
                      {resPDJ.length===0&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070",marginTop:4}}>Aucun petit-déjeuner demain</p>}
                    </div>
                    {resPDJ.length>0&&resPDJ.length<=4&&(
                      <button onClick={()=>setShowPetitDej(true)} style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#c9952a",marginTop:6,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}}>
                        Voir le détail complet →
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
              {(()=>{
                return(<>
              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                  <h2 style={{fontSize:18,fontWeight:500,letterSpacing:1,color:"#c9952a"}}>Arrivées aujourd'hui</h2>
                  <button onClick={()=>setShowPetitDej(true)} style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fff8ee",border:"1.5px solid #e8b84b",color:"#8a5c10",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:700}}>
                    🥐 Petit déjeuner
                  </button>
                </div>
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
            const firstDayOfMonth=TODAY.slice(0,7)+"-01";
            if(["receptionniste","Receptionniste"].includes(userRole)&&dateStr<firstDayOfMonth) return null;
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
                                // Réservation qui arrive ce jour (checkin=d)
                                const resArrivee = reservations.find(r=>
                                  r.roomId===room.id&&
                                  ["confirmed","checkedin","pending"].includes(r.status)&&
                                  r.checkin===d
                                );
                                // Réservation qui part ce jour (checkout=d)
                                const resDepart = reservations.find(r=>
                                  r.roomId===room.id&&
                                  ["confirmed","checkedin"].includes(r.status)&&
                                  r.checkout===d&&r.checkin<d
                                );
                                // Vrai conflit seulement si ce sont deux réservations DIFFÉRENTES
                                const vraiConflit = resDepart&&resArrivee&&resDepart.id!==resArrivee.id;

                                const handleClick=()=>{
                                  if(status==="depart"&&vraiConflit){
                                    // Départ ET arrivée le même jour → menu de choix
                                    setModal({type:"calChoix",room,date:d,resDepart,resArrivee});
                                  } else if(status==="depart"){
                                    // Départ ce jour → nouvelle résa
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
                <div style={{display:"flex",gap:8}}>
                  {isGerant&&<button className="btn-outline" style={{fontSize:12,padding:"7px 14px"}} onClick={()=>printEtatReservations(filtered)}>📋 État PDF</button>}
                  <button className="btn-gold" onClick={openNew}>+ Nouvelle réservation</button>
                </div>
              </div>

              {/* Barre de recherche + filtres */}
              <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:12,alignItems:"end",boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
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
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>🌐 Source réservation</label>
                    <select value={filterSource} onChange={e=>setFilterSource(e.target.value)} style={{width:"100%"}}>
                        <option value="all">Toutes sources</option>
                        <option value="direct">🏨 Direct</option>
                        <option value="booking">🌐 Booking</option>
                        <option value="expedia">✈️ Expedia</option>
                        <option value="agence">🤝 Agence</option>
                        <option value="autre">📋 Autre</option>
                      </select>
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label style={{fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,display:"block",marginBottom:4}}>Mode paiement</label>
                    <select value={filterModePaiement} onChange={e=>setFilterModePaiement(e.target.value)} style={{width:"100%"}}>
                      <option value="all">Tous</option>
                      <option value="especes">💵 Espèces</option>
                      <option value="carte">💳 Carte</option>
                      <option value="cheque">📝 Chèque</option>
                      <option value="virement">🏦 Virement</option>
                    </select>
                  </div>
                  {(search||filterDateFrom||filterDateTo||filterStatus!=="all"||filterPaid!=="all"||filterModePaiement!=="all")&&(
                    <button className="btn-outline" style={{fontSize:11,padding:"5px 12px"}}
                      onClick={()=>{setSearch("");setFilterDateFrom("");setFilterDateTo("");setFilterStatus("all");setFilterPaid("all");setFilterModePaiement("all");}}>
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
                  {isGerant&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
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
                  </div>}
                  {bilan.revenus>0&&isGerant&&(
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
                          {isGerant&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:r.paid?"#2d7a4f":"#2a1e08"}}>{FMT(getEffectivePrice(r))}</p>}
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:r.paid?"#2d7a4f":r.avance>0?"#c9952a":"#c95050"}}>
                            {r.paid?"✓ payé":r.avance>0?"⟳ avance":"en attente"}
                          </p>
                          {r.avance>0&&!r.paid&&(
                            <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>
                              Reste: {Math.max(0,(()=>{const rm=ROOMS.find(x=>x.id===r.roomId);const n=Math.max(1,Math.round((new Date(r.checkout)-new Date(r.checkin))/86400000));const p=r.customPrice!==undefined?r.customPrice:(rm?.price||0)*(1+(r.pension==="dp"?40/rm?.price||0:0));return p*n;})()-Number(r.avance||0)).toFixed(3)} TND
                            </p>
                          )}
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

          return <HistoriqueView terminees={terminees} moisDispos={moisDispos} G2={G2} openDetail={openDetail} userRole={userRole}/>;
        })()}

        {/* ── ARCHIVES FACTURES ── */}
        {view==="archives"&&<ArchivesView sb={sb} openDetail={openDetail} ROOMS={ROOMS} LOGO={LOGO} G2="#8B6434" doPrint={doPrint} setModal={setModal} restoreFacture={restoreFacture} showToast={showToast} REFS={REFS} userRole={userRole}/>}
        {/* ══ MODAL MODE DE PAIEMENT ══ */}
        {paiementModal&&(()=>{
          const r=paiementModal.data;
          const room=ROOMS.find(rm=>rm.id===r.roomId);
          const selectedMode=paiementModal.mode||"especes";
          const modes=[
            {value:"especes",label:"💵 Espèces",color:"#2d7a4f",bg:"#f0faf5"},
            {value:"carte",label:"💳 Carte bancaire",color:"#1a5a8a",bg:"#f0f5ff"},
            {value:"cheque",label:"📝 Chèque",color:"#8a5c10",bg:"#fff8ee"},
            {value:"virement",label:"🏦 Virement",color:"#6b35b8",bg:"#f5f0fc"},
          ];
          return ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={closeModal}>
              <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
                <h2 style={{fontSize:20,fontWeight:500,marginBottom:4,fontFamily:'"Cormorant Garamond",serif'}}>💰 Mode de paiement</h2>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:20}}>
                  {r.guest} — Ch. {room?.number} — {getEffectivePrice(r).toFixed(3)} TND
                </p>
                <div style={{display:"grid",gap:8,marginBottom:20}}>
                  {modes.map(m=>(
                    <button key={m.value}
                      onClick={()=>setPaiementModal(mod=>({...mod,mode:m.value}))}
                      style={{padding:"12px 16px",borderRadius:8,border:"2px solid "+(selectedMode===m.value?m.color:"#e8d8b0"),background:selectedMode===m.value?m.bg:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:selectedMode===m.value?700:400,color:selectedMode===m.value?m.color:"#6a5530"}}>{m.label}</span>
                      {selectedMode===m.value&&<span style={{marginLeft:"auto",color:m.color,fontWeight:700}}>✓</span>}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                  <button className="btn-ghost" onClick={()=>setPaiementModal(null)}>Annuler</button>
                  <button className="btn-gold" onClick={async(e)=>{
                    e.stopPropagation();
                    await markPaid(r.id, selectedMode);
                    setPaiementModal(null);
                    setModal({type:"detail",data:{...r,paid:true,modePaiement:selectedMode}});
                  }}>✓ Confirmer le paiement</button>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

        {/* ══ MODAL CHOIX DÉPART/ARRIVÉE MÊME JOUR ══ */}
        {modal?.type==="calChoix"&&(
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
              <h2 style={{fontSize:18,fontWeight:500,marginBottom:6,fontFamily:'"Cormorant Garamond",serif'}}>
                Ch. {modal.room?.number} — {new Date(modal.date+"T12:00:00").toLocaleDateString("fr-FR")}
              </h2>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginBottom:20}}>
                Départ et arrivée le même jour — que voulez-vous faire ?
              </p>
              <div style={{display:"grid",gap:10}}>
                <button className="btn-outline" style={{textAlign:"left",padding:"12px 16px"}}
                  onClick={()=>{closeModal();openDetail(modal.resDepart);}}>
                  <p style={{fontWeight:700,marginBottom:2}}>✈️ Voir le départ</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{modal.resDepart?.guest}</p>
                </button>
                <button className="btn-outline" style={{textAlign:"left",padding:"12px 16px"}}
                  onClick={()=>{closeModal();openDetail(modal.resArrivee);}}>
                  <p style={{fontWeight:700,marginBottom:2}}>🛎 Voir l'arrivée</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{modal.resArrivee?.guest}</p>
                </button>
                <button className="btn-gold" style={{textAlign:"left",padding:"12px 16px"}}
                  onClick={()=>{
                    closeModal();
                    setForm({roomId:modal.room.id,guest:"",email:"",phone:"",
                      checkin:modal.date,checkout:"",adults:1,children:0,
                      status:"confirmed",paid:false,notes:"",extraBed:false,
                      babyBed:false,babyBedLocation:"",claim:"",assignedMenage:"",
                      pension:"lpd",billingType:null,remise:0,customPrice:undefined});
                    setModal({type:"new"});
                  }}>
                  <p style={{fontWeight:700,marginBottom:2}}>+ Nouvelle réservation</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#fff9"}}>À partir du {new Date(modal.date+"T12:00:00").toLocaleDateString("fr-FR")}</p>
                </button>
                <button className="btn-ghost" onClick={closeModal}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {view==="clients-societes"&&<FichierClientsView sb={sb} showToast={showToast}/>}
        {view==="rh"&&<RHView sb={sb} showToast={showToast}/>}
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
                        {ROOMS.filter(r=>r.floor===floor).map(r=>{const occ=isOccForDates(r.id,reservations,form.checkin,form.checkout,form.id);return <option key={r.id} value={r.id} disabled={occ}>{r.number} — {r.type} ({r.price} TND/nuit){occ?" [Occupée ces dates)":""}</option>;})}
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
                    <select value={["","Tunisienne","Algérienne","Marocaine","Libyenne","Française","Italienne","Allemande","Espagnole","Britannique","Belge","Suisse","Américaine","Australienne"].includes(form.nationality||"")?form.nationality||"":"__autre__"} onChange={e=>{if(e.target.value!=="__autre__")setForm(f=>({...f,nationality:e.target.value}));else setForm(f=>({...f,nationality:"__autre__"}));}}>
                      <option value="">— Choisir —</option>
                      <option>Tunisienne</option>
                      <option>Algérienne</option>
                      <option>Marocaine</option>
                      <option>Libyenne</option>
                      <option>Française</option>
                      <option>Italienne</option>
                      <option>Allemande</option>
                      <option>Espagnole</option>
                      <option>Britannique</option>
                      <option>Belge</option>
                      <option>Suisse</option>
                      <option>Américaine</option>
                      <option>Australienne</option>
                      <option value=" autre">✏️ Autre...</option>
                    </select>
                    {(form.nationality==="__autre__"||(!["","Tunisienne","Algérienne","Marocaine","Libyenne","Française","Italienne","Allemande","Espagnole","Britannique","Belge","Suisse","Américaine","Australienne","__autre__"].includes(form.nationality||"")))&&(
                      <input autoFocus value={form.nationality==="__autre__"?"":form.nationality||""} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} placeholder="Saisir la nationalité..." style={{marginTop:6,fontSize:12,padding:"6px 10px",width:"100%"}}/>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Date de naissance</label>
                    <input type="date" value={form.dateNaissance||""} onChange={e=>setForm(f=>({...f,dateNaissance:e.target.value}))}/>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label style={{display:"flex",alignItems:"center",gap:6}}>
                      N° Passeport
                      <span style={{fontSize:9,fontWeight:600,color:"#a09080",background:"#f5f0e8",padding:"1px 6px",borderRadius:8,textTransform:"uppercase",letterSpacing:.5}}>étrangers</span>
                    </label>
                    <input value={form.passport||""} onChange={e=>setForm(f=>({...f,passport:e.target.value}))} placeholder="ex : AB123456"/>
                  </div>
                  <div className="form-group">
                    <label>Mode de paiement</label>
                    <select value={form.modePaiement||"especes"} onChange={e=>setForm(f=>({...f,modePaiement:e.target.value}))}>
                      <option value="especes">💵 Espèces</option>
                      <option value="carte">💳 Carte bancaire</option>
                      <option value="cheque">📝 Chèque</option>
                      <option value="virement">🏦 Virement bancaire</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Avance reçue (TND)</label>
                    <input type="number" min="0" step="0.001"
                      value={form.avance||""}
                      onChange={e=>setForm(f=>({...f,avance:e.target.value}))}
                      placeholder="0.000"/>
                  </div>
                  <div className="form-group">
                    <label>Source de réservation</label>
                    <select value={form.source||"direct"} onChange={e=>setForm(f=>({...f,source:e.target.value}))}>
                      <option value="direct">🏨 Direct</option>
                      <option value="booking">🌐 Booking.com</option>
                      <option value="expedia">✈️ Expedia</option>
                      <option value="agence">🤝 Agence</option>
                      <option value="autre">📋 Autre</option>
                    </select>
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
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Nom & Prénom</label>
                            <GuestAutocomplete
                              value={acc.nom||""}
                              onChange={val=>{const a=[...(form.accompagnants||[])];a[idx]={...a[idx],nom:val};setForm(f=>({...f,accompagnants:a}));}}
                              onSelect={c=>{const a=[...(form.accompagnants||[])];a[idx]={...a[idx],nom:c.nom,cin:c.cin||a[idx].cin};setForm(f=>({...f,accompagnants:a}));}}
                              sb={sb}
                            />
                          </div>
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Nationalité</label>
                            <select value={["Tunisienne","Algérienne","Marocaine","Libyenne","Française","Italienne","Allemande","Espagnole","Britannique","Belge","Suisse","Américaine"].includes(acc.nationalite||"")?acc.nationalite||"":" autre"} onChange={e=>{
                              const a=[...(form.accompagnants||[])];
                              a[idx]={...a[idx],nationalite:e.target.value===" autre"?"":e.target.value};
                              setForm(f=>({...f,accompagnants:a}));
                            }} style={{width:"100%",fontSize:11,padding:"5px 8px"}}>
                              <option value="">— Choisir —</option>
                              <option>Tunisienne</option>
                              <option>Algérienne</option>
                              <option>Marocaine</option>
                              <option>Libyenne</option>
                              <option>Française</option>
                              <option>Italienne</option>
                              <option>Allemande</option>
                              <option>Espagnole</option>
                              <option>Britannique</option>
                              <option>Belge</option>
                              <option>Suisse</option>
                              <option>Américaine</option>
                              <option>Australienne</option>
                              <option value=" autre">✏️ Autre...</option>
                            </select>
                            {!["Tunisienne","Algérienne","Marocaine","Libyenne","Française","Italienne","Allemande","Espagnole","Britannique","Belge","Suisse","Américaine","Australienne"].includes(acc.nationalite||"")&&acc.nationalite&&(
                              <input value={acc.nationalite||""} onChange={e=>{
                                const a=[...(form.accompagnants||[])];
                                a[idx]={...a[idx],nationalite:e.target.value};
                                setForm(f=>({...f,accompagnants:a}));
                              }} placeholder="Saisir la nationalité..." style={{marginTop:4,width:"100%",fontSize:11,padding:"5px 8px"}}/>
                            )}
                          </div>
                          {[["CIN","cin","ex : 12345678"],["Passeport","passport","ex : AB123456"],["Profession","profession","ex : Ingénieur"],["Provenance","provenance","ex : Sfax"]].map(([lbl,key,ph])=>(
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
                    <div style={{borderTop:"1px solid #e8d8b0",paddingTop:10,marginTop:4}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,color:"#6a5530",fontWeight:600}}>Total TTC</span>
                        <span style={{fontSize:18,fontWeight:700,color:"#2a1e08"}}>{totalTTC.toFixed(3)} TND</span>
                      </div>
                      {(r.avance>0)&&(
                        <div style={{background:"#f0faf5",border:"1px solid #a0d8b8",borderRadius:8,padding:"8px 12px",marginTop:6}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2d7a4f"}}>✅ Avance reçue</span>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#2d7a4f"}}>{Number(r.avance||0).toFixed(3)} TND</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#c95050"}}>⏳ Reste à payer</span>
                            <span style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#c95050"}}>{Math.max(0,totalTTC-Number(r.avance||0)).toFixed(3)} TND</span>
                          </div>
                        </div>
                      )}
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:r.paid?"#2d7a4f":"#c95050",fontWeight:600,marginTop:6}}>{r.paid?"✓ Payé intégralement":"⏳ Non payé"}</p>
                    </div>
                  </div>
                )}
                <div style={{height:1,background:"#f0e8d8",margin:"16px 0"}}/>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Actions</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
                  {r.status==="pending"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"confirmed");setModal({type:"detail",data:{...r,status:"confirmed"}});}}>Confirmer</button>}
                  {r.status==="confirmed"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"checkedin");setModal({type:"detail",data:{...r,status:"checkedin"}});}}>Check-in ✓</button>}
                  {r.status==="checkedin"&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"checkedout");setModal({type:"detail",data:{...r,status:"checkedout"}});}}>Check-out ✓</button>}
                  {["confirmed","checkedin"].includes(r.status)&&<button className="btn-outline" style={{background:"#f0f8ff",borderColor:"#a0c8e8",color:"#1a5a8a"}} onClick={()=>{
                      const d=new Date(r.checkout+"T12:00:00");
                      d.setDate(d.getDate()+1);
                      const nextDay=d.toISOString().split("T")[0];
                      setModal({type:"prolonger",data:r,newCheckout:nextDay});
                    }}>📅 Prolonger</button>}
                  {!["cancelled","blocked","checkedout"].includes(r.status)&&<button className="btn-outline" onClick={()=>{updateStatus(r.id,"cancelled");addLog("🚫 Réservation annulée",{client:r.guest,chambre:ROOMS.find(rm=>rm.id===r.roomId)?.number});setModal({type:"detail",data:{...r,status:"cancelled"}});}}>Annuler</button>}
                  {!r.paid&&r.status!=="blocked"&&<button className="btn-outline" style={{background:"#f0faf5",borderColor:"#a0d8b8",color:"#2d7a4f"}} onClick={()=>setPaiementModal({data:r,mode:"especes"})}>💰 Marquer payé</button>}
                  {!["blocked","cancelled"].includes(r.status)&&<button className="btn-outline" onClick={()=>openInvoice(r)}>Facture</button>}
                  {!["blocked","cancelled"].includes(r.status)&&<button className="btn-outline" style={{background:"#fef9ee",borderColor:"#e8c060",color:"#8a5c10"}} onClick={()=>printVoucher(r)}>🎫 Voucher</button>}
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
                      <input type="checkbox" id="ribBon" checked={showRib} onChange={e=>setShowRib(e.target.checked)} style={{width:16,height:16,cursor:"pointer",marginLeft:12}}/>
                      <label htmlFor="ribBon" style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#2a1e08",cursor:"pointer",userSelect:"none"}}>Afficher le RIB</label>
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
            const [showRib,setShowRib]=React.useState(false);
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
                      <p style={{fontSize:16,fontWeight:800,color:"#2c2416",lineHeight:1.2}}>Société Hedi pour les services touristiques</p>
                      <p style={{fontSize:18,fontWeight:900,color:G2,letterSpacing:2}}>SHST</p>
                      <p style={{fontSize:11,fontWeight:500,color:"#6a5530",marginTop:2,letterSpacing:1}}>IMPAVID HOTEL — Gabès</p>
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
                <SignatureBlock showCachet={showCachet} showRib={showRib}/>

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
                      const ok=await saveFacture({numero:num,type:'reservation',client:r.guest,phone:r.phone||null,email:r.email||null,cin:r.cin||null,reservation_id:r.id,montant_ht:totalHT_S,tva:Math.round((totalTTC_S-totalHT_S)*100)/100,timbre:1,montant_ttc:Math.round((totalTTC_S+1)*100)/100,remise:modal.remise||0,notes:r.notes||null,mode_paiement:r.modePaiement||'especes',lignes:[{desc:"Chambre "+room?.number+" × "+n+" nuits",qty:n,prixTTC:prixTTC_S}]});
                      if(ok){setModal(m=>({...m,saved:true,invNum:num}));showToast('Facture F-'+num+' enregistrée ✓','success');}
                      else showToast('Erreur enregistrement','error');
                    }}>💾 Enregistrer</button>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2a8a5a",fontWeight:700}}>✓ F-{modal.invNum}</span>
                      {isGerant&&(
                        <button className="btn-red" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>{
                          setCancelModal({numero:'F-'+modal.invNum,onDone:()=>{setModal(m=>({...m,saved:false,invNum:undefined}));showToast('Facture annulée','error');}});
                        }}>✕ Annuler</button>
                      )}
                    </div>
                  )}
                  <button className="btn-primary" style={{opacity:modal.saved?1:.45,cursor:modal.saved?"pointer":"not-allowed"}} onClick={()=>{
                    if(!modal.saved) return;
                    const lignes=[{code:room?.type||"",desc:"Chambre "+room?.number+" × "+n+" nuits",qty:n,prixTTC:prixTTC}];
                    if(r.extraBed) lignes.push({code:"",desc:"Lit supplémentaire × "+n+" nuits",qty:n,prixTTC:30});
                    doPrint({numero:"F-"+modal.invNum,type:"reservation",client:r.guest,phone:r.phone,email:r.email,cin:r.cin,montant_ht:totalHT,tva:tvaAmt,montant_ttc:Math.round((totalApresRemise+1)*100)/100,remise:remisePrint,notes:r.notes,lignes,created_at:new Date(),showCachet,showRib});
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
              setCancelModal={setCancelModal}
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
                    <div>
                      <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4,fontFamily:'"Jost",sans-serif'}}>Validité (jours)</label>
                      <select value={di.validite||30} onChange={e=>setDI(f=>({...f,validite:parseInt(e.target.value)}))} style={{fontSize:12,padding:"7px 10px"}}>
                        <option value={7}>7 jours</option>
                        <option value={15}>15 jours</option>
                        <option value={30}>30 jours</option>
                        <option value={45}>45 jours</option>
                        <option value={60}>60 jours</option>
                        <option value={90}>90 jours</option>
                      </select>
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
                        {isGerant&&(
                          <button className="btn-red" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>{
                            setCancelModal({numero:di.devNum,onDone:()=>{setDI(f=>({...f,saved:false}));showToast('Devis annulé','error');}});
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
                      doPrint({numero:di.devNum,type:'devis',client:di.client,phone:di.phone,montant_ht:gHT2,tva:Math.round((gTTC2-gHT2)*100)/100,montant_ttc:net2,remise:rem2,notes:di.notes,lignes:di.lines,created_at:new Date(),validite:di.validite||30});
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
                        <p style={{fontSize:15,fontWeight:800,color:"#2c2416"}}>Société Hedi pour les services touristiques</p>
                        <p style={{fontSize:17,fontWeight:900,color:G2,letterSpacing:2}}>SHST</p>
                        <p style={{fontSize:10,fontWeight:500,color:"#6a5530",letterSpacing:1}}>IMPAVID HOTEL — Gabès</p>
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
                    Arrêtée la présente estimation à : <strong>{montantEnLettres(netAPayer)}</strong> — Devis non contractuel, valable {di.validite||30} jours.
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
                    <p style={{fontSize:15,fontWeight:800,color:"#2c2416"}}>Société Hedi pour les services touristiques</p>
                    <p style={{fontSize:17,fontWeight:900,color:"#8B6434",letterSpacing:2}}>SHST</p>
                    <p style={{fontSize:10,fontWeight:500,color:"#6a5530",letterSpacing:1}}>IMPAVID HOTEL — Gabès</p>
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
                {printData.type==="devis"?`Devis non contractuel, valable ${printData.validite||30} jours — ${printData.numero}`:`Arrêtée la présente facture à la somme de : ${montantEnLettres(printData.montant_ttc||0)}`}
              </p>
              <SignatureBlock showCachet={printData.showCachet!==false} showRib={printData.showRib===true}/>
            </div>
          </div>
        );
      })()}
      </div>{/* fin contenu principal */}
    </div>

    {/* ══ MODAL PROLONGER SÉJOUR ══ */}
    {modal?.type==="prolonger"&&ReactDOM.createPortal((()=>{
          const r=modal.data;
          const room=ROOMS.find(rm=>rm.id===r.roomId);
          const newCo=modal.newCheckout;
          // Vérifier si la chambre est libre après le checkout actuel
          const conflit=newCo>r.checkout?reservations.find(res=>
            res.roomId===r.roomId&&
            res.id!==r.id&&
            ["confirmed","checkedin","pending","blocked"].includes(res.status)&&
            res.checkin>=r.checkout&&
            res.checkin<newCo
          ):null;
          const nNow=Math.max(0,(new Date(r.checkout)-new Date(r.checkin))/86400000);
          const nNew=Math.max(0,(new Date(newCo)-new Date(r.checkin))/86400000);
          const nExtra=nNew-nNow;
          const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
          const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
          const prix=r.customPrice!==undefined?r.customPrice:
            Math.round((TARIFS[r.billingType||(typeMap[room?.type]||"double")]||160)*(1-(r.remise||0)/100)*100)/100;
          const coutExtra=Math.round(nExtra*prix*100)/100;
          return(
            <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={closeModal}>
              <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
                <h2 style={{fontSize:20,fontWeight:500,marginBottom:4,fontFamily:'"Cormorant Garamond",serif'}}>📅 Prolonger le séjour</h2>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#aaa",marginBottom:4}}>
                  checkout actuel: {r.checkout} | nouveau: {newCo} | conflit: {String(!!conflit)}
                </p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:20}}>
                  {r.guest} — Ch. {room?.number}
                </p>
                <div style={{background:"#faf8f5",borderRadius:8,padding:"12px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Arrivée</p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600}}>{new Date(r.checkin+"T12:00:00").toLocaleDateString("fr-FR")}</p>
                  </div>
                  <div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Départ actuel</p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:"#c95050"}}>{new Date(r.checkout+"T12:00:00").toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>
                    Nouveau départ *
                  </label>
                  <input type="date" value={newCo} min={r.checkout}
                    onChange={e=>setModal(m=>({...m,newCheckout:e.target.value}))}
                    style={{fontSize:14,padding:"9px 12px",width:"100%"}}/>
                </div>
                {newCo>r.checkout&&(
                  <div style={{background:conflit?"#fdf0f0":"#f0faf5",border:"1px solid "+(conflit?"#e0a0a0":"#a0d8b8"),borderRadius:8,padding:"10px 14px",marginBottom:16}}>
                    {conflit?(
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#c95050",fontWeight:700}}>
                        ⚠️ Chambre déjà réservée à partir du {new Date(conflit.checkin+"T12:00:00").toLocaleDateString("fr-FR")} ({conflit.guest})
                      </p>
                    ):(
                      <>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2d7a4f",fontWeight:700,marginBottom:4}}>✅ Chambre disponible</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>
                          +{nExtra} nuit{nExtra>1?"s":""} × {prix.toFixed(3)} TND = <strong>{coutExtra.toFixed(3)} TND</strong> supplémentaires
                        </p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginTop:2}}>
                          Total : {nNew} nuits — {(nNew*prix).toFixed(3)} TND
                        </p>
                      </>
                    )}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                  <button className="btn-ghost" onClick={closeModal}>Annuler</button>
                  <button className="btn-gold"
                    disabled={!newCo||newCo<=r.checkout||!!conflit}
                    style={{opacity:(!newCo||newCo<=r.checkout||!!conflit)?0.4:1,cursor:(!newCo||newCo<=r.checkout||!!conflit)?"not-allowed":"pointer"}}
                    onClick={async(e)=>{
                      e.stopPropagation();
                      try{
                        const {error:pErr}=await sb.from("reservations").update({checkout:newCo}).eq("id",r.id);
                        if(pErr){console.error("prolonger error:",pErr);showToast("Erreur: "+pErr.message,"error");return;}
                        setReservations(prev=>prev.map(x=>x.id===r.id?{...x,checkout:newCo}:x));
                        addLog("📅 Séjour prolongé",{client:r.guest,chambre:room?.number,ancien_checkout:r.checkout,nouveau_checkout:newCo});
                        showToast("Séjour prolongé jusqu'au "+new Date(newCo+"T12:00:00").toLocaleDateString("fr-FR")+" ✓");
                        closeModal();
                      }catch(e){console.error("prolonger catch:",e);showToast("Erreur","error");}
                    }}>
                    ✓ Confirmer la prolongation
                  </button>
                </div>
              </div>
            </div>
          );
        })(),document.body)}

    {/* ══ MODAL CONFIRMATION ANNULATION/SUPPRESSION FACTURE ══ */}
    {/* ══ MODAL PETIT DÉJEUNER ══ */}
    {showPetitDej&&ReactDOM.createPortal(
      <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setShowPetitDej(false)}>
        <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:600,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:14,borderBottom:"1px solid #f0e8d8"}}>
            <div>
              <p style={{fontSize:20,fontWeight:600,fontFamily:'"Cormorant Garamond",serif'}}>🥐 Petit déjeuner — {new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginTop:2}}>
                {(()=>{
                  const list=reservations.filter(r=>
                    ["confirmed","checkedin"].includes(r.status)&&
                    r.checkin<=TODAY&&r.checkout>TODAY
                  );
                  const total=list.reduce((a,r)=>(r.breakfast!=="non"?a+(parseInt(r.adults)||1)+(parseInt(r.children)||0):a),0);
                  return `${total} personne${total>1?"s":""}`;
                })()}
              </p>
            </div>
            <button onClick={()=>setShowPetitDej(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#8a7040"}}>✕</button>
          </div>
          {(()=>{
            const now2=new Date();
            const h2=now2.getHours();
            const isPDJ2=h2>=6&&h2<11;
            const presentsAujourd = reservations.filter(r=>
              ["confirmed","checkedin","checkedout"].includes(r.status)&&
              (isPDJ2 ? r.checkin<TODAY&&r.checkout>=TODAY : r.checkin<=TODAY&&r.checkout>TODAY)
            );
            const avecPetitDej = presentsAujourd;
            const sansPetitDej = [];
            return(
              <>
                {avecPetitDej.length===0&&(
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#b0a070",textAlign:"center",padding:20}}>Aucun client avec petit déjeuner aujourd'hui</p>
                )}
                {avecPetitDej.map(r=>{
                  const room=ROOMS.find(rm=>rm.id===r.roomId);
                  const nbPers=(parseInt(r.adults)||1)+(parseInt(r.children)||0);
                  return(
                    <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f5efe5"}}>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <div style={{background:"#fef3d0",borderRadius:8,padding:"6px 10px",textAlign:"center",minWidth:48}}>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:700,color:"#c9952a"}}>{room?.number}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040"}}>{room?.type}</p>
                        </div>
                        <div>
                          <p style={{fontSize:15,fontWeight:500}}>{r.guest}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>
                            {nbPers} personne{nbPers>1?"s":""} · {r.pension==="dp"?"🍽 Demi-pension":"🥐 Petit déj."}
                          </p>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#c9952a"}}>{nbPers} pers.</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{new Date(r.checkout).toLocaleDateString("fr-FR")} départ</p>
                      </div>
                    </div>
                  );
                })}
                {sansPetitDej.length>0&&(
                  <div style={{marginTop:16,padding:"10px 14px",background:"#faf8f5",borderRadius:8,border:"1px solid #e8d8b0"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Sans petit déjeuner ({sansPetitDej.length})</p>
                    {sansPetitDej.map(r=>{
                      const room=ROOMS.find(rm=>rm.id===r.roomId);
                      return(
                        <p key={r.id} style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:4}}>
                          Ch. {room?.number} — {r.guest}
                        </p>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>,
      document.body
    )}

    {cancelModal&&ReactDOM.createPortal(
      <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setCancelModal(null)}>
        <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
          <h2 style={{fontSize:20,fontWeight:600,color:"#9a2020",marginBottom:8,fontFamily:'"Cormorant Garamond",serif'}}>⚠️ {cancelModal.numero}</h2>
          <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530",marginBottom:24}}>Que voulez-vous faire avec cette facture ?</p>
          <div style={{display:"grid",gap:10}}>
            <button style={{padding:"12px 16px",borderRadius:8,border:"2px solid #e8a000",background:"#fff8ee",cursor:"pointer",textAlign:"left"}}
              onClick={async()=>{
                await cancelFacture(cancelModal.numero);
                cancelModal.onDone&&cancelModal.onDone();
                setCancelModal(null);
              }}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#8a5c10",marginBottom:2}}>🚫 Annuler la facture</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b07d1a"}}>Le numéro est conservé — facture restaurable depuis les archives</p>
            </button>
            <button style={{padding:"12px 16px",borderRadius:8,border:"2px solid #e0a0a0",background:"#fdf0f0",cursor:"pointer",textAlign:"left"}}
              onClick={async()=>{
                if(!confirm("Supprimer DÉFINITIVEMENT "+cancelModal.numero+" ? Cette action est irréversible.")) return;
                await deleteFacture(cancelModal.numero);
                cancelModal.onDone&&cancelModal.onDone();
                setCancelModal(null);
              }}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#9a2020",marginBottom:2}}>🗑 Supprimer définitivement</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#c05050"}}>Le numéro sera perdu — action irréversible</p>
            </button>
            <button className="btn-ghost" onClick={()=>setCancelModal(null)}>Retour</button>
          </div>
        </div>
      </div>,
      document.body
    )}

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
// placeholder
