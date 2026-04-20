function GroupesView({sb, ROOMS, reservations, setReservations, showToast, doPrint, montantEnLettres, SignatureBlock, LOGO, saveFacture, nextInvNum, userEmail}) {
  const {useState, useEffect} = React;
  const [groupes, setGroupes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // 'new' | {type:'detail', data:g}
  const G2 = "#8B6434";

  // ── Formulaire nouveau groupe ──
  const emptyForm = {
    nomSociete:"", bonCommande:"", mf:"", checkin:"", checkout:"",
    notes:"", chambres:[], clientsParChambre:{}, adults:1,
    pension:"lpd", remise:0, billingType:null,
    datesParChambre:{}, prixParChambre:{}
  };
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(1); // 1=infos groupe, 2=sélection chambres, 3=clients
  const [saving, setSaving] = useState(false);
  const [factureModal, setFactureModal] = useState(null); // {groupe, lignes, grandTTC, grandHT, tvaAmt, netAPayer, adresse, num, saved}

  // ── Chargement groupes ──
  useEffect(()=>{
    loadGroupes();
  },[]);

  async function loadGroupes(){
    setLoading(true);
    try{
      const {data} = await sb.from('groupes').select('*').order('created_at',{ascending:false});
      setGroupes(data||[]);
    }catch(e){}
    setLoading(false);
  }

  async function supprimerGroupe(groupe){
    if(!confirm(`Supprimer le groupe "${groupe.nom_societe}" et toutes ses réservations ?\n\nCette action est irréversible.`)) return;
    try{
      await sb.from('reservations').delete().eq('groupe_id',groupe.id);
      await sb.from('groupes').delete().eq('id',groupe.id);
      setReservations(prev=>prev.filter(r=>r.groupeId!==groupe.id));
      setGroupes(prev=>prev.filter(g=>g.id!==groupe.id));
      setModal(null);
      showToast('Groupe supprimé ✓','success');
    }catch(e){
      showToast('Erreur : '+e.message,'error');
    }
  }

  // ── Chambres disponibles pour les dates ──
  function chambresDisponibles(){
    if(!form.checkin||!form.checkout) return ROOMS;
    return ROOMS.filter(room=>{
      const occ = reservations.some(r=>
        r.roomId===room.id &&
        ["confirmed","checkedin","pending","blocked"].includes(r.status) &&
        r.checkin < form.checkout && r.checkout > form.checkin
      );
      return !occ;
    });
  }

  function nights(roomId){
    const ci = (roomId&&form.datesParChambre[roomId]?.checkin)||form.checkin;
    const co = (roomId&&form.datesParChambre[roomId]?.checkout)||form.checkout;
    if(!ci||!co) return 0;
    return Math.max(0,(new Date(co)-new Date(ci))/86400000);
  }

  function getPrix(room){
    if(form.prixParChambre[room.id]!==undefined&&form.prixParChambre[room.id]!=="")
      return parseFloat(form.prixParChambre[room.id])||0;
    const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
    const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
    const base=TARIFS[form.billingType||(typeMap[room.type]||"double")]||160;
    const dp=form.pension==="dp"?40:0;
    const rem=parseFloat(form.remise)||0;
    return Math.round((base+dp)*(1-rem/100)*100)/100;
  }

  function totalGroupe(){
    return form.chambres.reduce((acc,roomId)=>{
      const room=ROOMS.find(r=>r.id===roomId);
      return acc+(room?getPrix(room)*nights(roomId):0);
    },0);
  }

  // ── Créer le groupe + réservations ──
  async function creerGroupe(){
    if(!form.nomSociete||!form.checkin||!form.checkout||form.chambres.length===0){
      showToast("Remplissez tous les champs obligatoires","error"); return;
    }
    setSaving(true);
    try{
      // 1. Créer le groupe
      const {data:groupe, error:gErr} = await sb.from('groupes').insert([{
        nom_societe: form.nomSociete,
        bon_commande: form.bonCommande||null,
        mf: form.mf||null,
        checkin: form.checkin,
        checkout: form.checkout,
        notes: form.notes||null,
      }]).select().single();
      if(gErr) throw gErr;

      // 2. Créer une réservation par chambre
      const resaInserts = form.chambres.map(roomId=>{
        const client = form.clientsParChambre[roomId]||form.nomSociete;
        const room = ROOMS.find(r=>r.id===roomId);
        const ci = form.datesParChambre[roomId]?.checkin||form.checkin;
        const co = form.datesParChambre[roomId]?.checkout||form.checkout;
        const prixCustom = form.prixParChambre[roomId]!==undefined&&form.prixParChambre[roomId]!==""
          ? parseFloat(form.prixParChambre[roomId]) : null;
        return {
          guest: client,
          email: "",
          phone: "",
          room_id: parseInt(roomId),
          checkin: ci,
          checkout: co,
          adults: parseInt(form.adults)||1,
          status: "confirmed",
          paid: false,
          extra_bed: false,
          baby_bed: false,
          baby_bed_location: "",
          notes: form.bonCommande?`BC: ${form.bonCommande}`:"",
          claim: "",
          assigned_menage: "",
          children: 0,
          breakfast: "non",
          pension: form.pension||"lpd",
          custom_price: prixCustom,
          billing_type: form.billingType||null,
          remise: parseFloat(form.remise)||0,
          cin: "",
          groupe_id: groupe.id,
          bon_commande: form.bonCommande||null,
        };
      });

      const {data:newResas, error:rErr} = await sb.from('reservations').insert(resaInserts).select();
      if(rErr) throw rErr;

      // 3. Mettre à jour le state local
      setReservations(prev=>[...prev, ...(newResas||[]).map(fromDb)]);
      await loadGroupes();
      showToast(`Groupe créé — ${form.chambres.length} chambre${form.chambres.length>1?"s":""} ✓`,"success");
      // Log via fonction globale si disponible
      try{await sb.from('logs').insert([{user_email:userEmail||"inconnu",action:"🏢 Groupe créé",details:{societe:form.nomSociete,bon_commande:form.bonCommande,chambres:form.chambres.length,checkin:form.checkin,checkout:form.checkout}}]);}catch(e){}
      setModal(null);
      setForm(emptyForm);
      setStep(1);
    }catch(e){
      showToast("Erreur : "+e.message,"error");
    }
    setSaving(false);
  }

  // ── Réservations d'un groupe ──
  function resasGroupe(groupeId){
    return reservations.filter(r=>r.groupeId===groupeId);
  }

  // ── Facture groupée ──
  function factureGroupee(groupe){
    const resas = resasGroupe(groupe.id);
    if(resas.length===0){showToast("Aucune réservation dans ce groupe","error");return;}
    const lignes = resas.map(r=>{
      const room = ROOMS.find(rm=>rm.id===r.roomId);
      const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
      const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
      const prix = r.customPrice!==undefined?r.customPrice:
        Math.round((TARIFS[r.billingType||(typeMap[room?.type]||"double")]||160)*(1-(r.remise||0)/100)*100)/100;
      const nuits = Math.max(0,(new Date(r.checkout)-new Date(r.checkin))/86400000);
      return {code:"", desc:`Ch. ${room?.number||"?"} (${room?.type||""}) — ${new Date(r.checkin).toLocaleDateString("fr-FR")} → ${new Date(r.checkout).toLocaleDateString("fr-FR")} — ${r.guest}`, qty:nuits, prixTTC:prix};
    });
    const grandTTC = Math.round(lignes.reduce((a,l)=>a+l.qty*l.prixTTC,0)*100)/100;
    const grandHT = Math.round((grandTTC/1.07)*100)/100;
    const tvaAmt = Math.round((grandTTC-grandHT)*100)/100;
    const netAPayer = Math.round((grandTTC+1)*100)/100;
    const adresse = groupe.bon_commande?`Bon de commande : ${groupe.bon_commande}`:"";
    setFactureModal({groupe, lignes, grandTTC, grandHT, tvaAmt, netAPayer, adresse, num:null, saved:false});
  }

  const dispo = chambresDisponibles();
  const n = nights();

  return(
    <>
    <div style={{padding:"24px 32px",maxWidth:1100,margin:"0 auto"}}>

      {/* ── EN-TÊTE ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <p className="section-title">Réservations Groupe</p>
          <p className="section-sub">{groupes.length} groupe{groupes.length>1?"s":""} enregistré{groupes.length>1?"s":""}</p>
        </div>
        <button className="btn-gold" onClick={()=>{setModal("new");setStep(1);setForm(emptyForm);}}>
          + Nouveau groupe
        </button>
      </div>

      {/* ── LISTE GROUPES ── */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
        <div style={{padding:"12px 20px",borderBottom:"1px solid #f0e8d8",display:"grid",gridTemplateColumns:"1fr 140px 100px 100px 80px 120px",gap:10,background:"#fef9f0"}}>
          {["Société / BC","Arrivée","Départ","Chambres","Statut","Montant"].map(h=>(
            <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
          ))}
        </div>
        {loading&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Chargement...</p>}
        {!loading&&groupes.length===0&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Aucun groupe</p>}
        {groupes.map(g=>{
          const resas = resasGroupe(g.id);
          const total = resas.reduce((a,r)=>{
            const room=ROOMS.find(rm=>rm.id===r.roomId);
            const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
            const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
            const prix=r.customPrice!==undefined?r.customPrice:
              Math.round((TARIFS[r.billingType||(typeMap[room?.type]||"double")]||160)*(1-(r.remise||0)/100)*100)/100;
            const nuits=Math.max(0,(new Date(g.checkout)-new Date(g.checkin))/86400000);
            return a+prix*nuits;
          },0);
          const allPaid = resas.length>0&&resas.every(r=>r.paid);
          const somePaid = resas.some(r=>r.paid);
          return(
            <div key={g.id} className="res-row" onClick={()=>setModal({type:"detail",data:g})}
              style={{display:"grid",gridTemplateColumns:"1fr 140px 100px 100px 80px 120px",gap:10,padding:"14px 20px",borderBottom:"1px solid #f5efe5",alignItems:"center",cursor:"pointer"}}>
              <div>
                <p style={{fontSize:15,fontWeight:600,color:"#2a1e08"}}>{g.nom_societe}</p>
                {g.bon_commande&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>BC : {g.bon_commande}</p>}
              </div>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{new Date(g.checkin).toLocaleDateString("fr-FR")}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{new Date(g.checkout).toLocaleDateString("fr-FR")}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:"#c9952a"}}>{resas.length} ch.</p>
              <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:8,background:allPaid?"#e8f8f0":somePaid?"#fef9e8":"#fef0f0",color:allPaid?"#2d7a4f":somePaid?"#b07d1a":"#c95050"}}>
                {allPaid?"✅ Payé":somePaid?"⚡ Partiel":"⏳ Impayé"}
              </span>
              <div style={{textAlign:"right"}}>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:"#2a1e08"}}>{total.toFixed(3)}</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>TND</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ MODAL NOUVEAU GROUPE ══ */}
      {modal==="new"&&(
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal" style={{maxWidth:700}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:20,fontWeight:600,color:G2,marginBottom:4,fontFamily:'"Cormorant Garamond",serif'}}>
              🏢 Nouveau groupe
            </h2>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginBottom:20}}>
              Étape {step} / 3 — {step===1?"Informations groupe":step===2?"Sélection des chambres":"Clients par chambre"}
            </p>

            {/* Barre de progression */}
            <div style={{display:"flex",gap:4,marginBottom:20}}>
              {[1,2,3].map(s=>(
                <div key={s} style={{flex:1,height:4,borderRadius:2,background:s<=step?"#c9952a":"#e8d8b0",transition:"background .3s"}}/>
              ))}
            </div>

            {/* ── ÉTAPE 1 : Infos groupe ── */}
            {step===1&&(
              <div style={{display:"grid",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>
                      Société / Groupe *
                    </label>
                    <input value={form.nomSociete} onChange={e=>setForm(f=>({...f,nomSociete:e.target.value}))}
                      placeholder="Nom de la société ou du groupe" style={{fontSize:13,padding:"8px 10px"}} autoFocus/>
                  </div>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>
                      N° Bon de commande
                    </label>
                    <input value={form.bonCommande} onChange={e=>setForm(f=>({...f,bonCommande:e.target.value}))}
                      placeholder="ex: BC-2024-0042" style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>
                      Matricule Fiscale
                      <span style={{fontSize:9,fontWeight:500,color:"#a09080",marginLeft:6,textTransform:"none"}}>facultatif</span>
                    </label>
                    <input value={form.mf} onChange={e=>setForm(f=>({...f,mf:e.target.value}))}
                      placeholder="ex: 1234567A/B/C/000" style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",fontStyle:"italic"}}>
                      💡 Les dates et prix peuvent être ajustés par chambre à l'étape 3
                    </p>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Arrivée *</label>
                    <input type="date" value={form.checkin} onChange={e=>setForm(f=>({...f,checkin:e.target.value,chambres:[]}))}
                      style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Départ *</label>
                    <input type="date" value={form.checkout} onChange={e=>setForm(f=>({...f,checkout:e.target.value,chambres:[]}))}
                      style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Pension</label>
                    <select value={form.pension} onChange={e=>setForm(f=>({...f,pension:e.target.value}))} style={{fontSize:13,padding:"8px 10px"}}>
                      <option value="lpd">Logement + Petit déj.</option>
                      <option value="dp">Demi-pension (+40 TND)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Remise %</label>
                    <input type="number" min="0" max="100" value={form.remise} onChange={e=>setForm(f=>({...f,remise:e.target.value}))}
                      style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                  <div>
                    <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Adultes / chambre</label>
                    <input type="number" min="1" max="4" value={form.adults} onChange={e=>setForm(f=>({...f,adults:e.target.value}))}
                      style={{fontSize:13,padding:"8px 10px"}}/>
                  </div>
                </div>
                <div>
                  <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Notes</label>
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                    placeholder="Remarques, instructions spéciales..." style={{fontSize:13,padding:"8px 10px",resize:"vertical"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
                  <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
                  <button className="btn-gold" onClick={()=>{
                    if(!form.nomSociete||!form.checkin||!form.checkout){showToast("Remplissez les champs obligatoires","error");return;}
                    setStep(2);
                  }}>Suivant →</button>
                </div>
              </div>
            )}

            {/* ── ÉTAPE 2 : Sélection chambres ── */}
            {step===2&&(
              <div>
                <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040"}}>
                    {new Date(form.checkin).toLocaleDateString("fr-FR")} → {new Date(form.checkout).toLocaleDateString("fr-FR")} · <strong>{n} nuit{n>1?"s":""}</strong>
                  </p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#c9952a"}}>
                    {form.chambres.length} chambre{form.chambres.length>1?"s":""} sélectionnée{form.chambres.length>1?"s":""}
                  </p>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16,maxHeight:320,overflowY:"auto"}}>
                  {dispo.map(room=>{
                    const selected = form.chambres.includes(room.id);
                    const prix = getPrix(room);
                    return(
                      <div key={room.id} onClick={()=>setForm(f=>({...f,chambres:selected?f.chambres.filter(id=>id!==room.id):[...f.chambres,room.id]}))}
                        style={{border:`2px solid ${selected?"#c9952a":"#e8d8b0"}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",background:selected?"#fef9f0":"#fff",transition:"all .15s"}}>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:18,fontWeight:700,color:selected?"#c9952a":"#2a1e08"}}>{room.number}</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{room.type}</p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:600,color:"#6a5530",marginTop:4}}>{prix} TND/nuit</p>
                        {selected&&<p style={{fontSize:10,color:"#c9952a",marginTop:2}}>✓ Sélectionnée</p>}
                      </div>
                    );
                  })}
                  {dispo.length===0&&<p style={{gridColumn:"1/-1",padding:20,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Aucune chambre disponible pour ces dates</p>}
                </div>

                {form.chambres.length>0&&(
                  <div style={{background:"#faf8f5",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>Total estimé ({n} nuit{n>1?"s":""})</span>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:700,color:"#c9952a"}}>{totalGroupe().toFixed(3)} TND</span>
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                  <button className="btn-ghost" onClick={()=>setStep(1)}>← Retour</button>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
                    <button className="btn-gold" onClick={()=>{
                      if(form.chambres.length===0){showToast("Sélectionnez au moins une chambre","error");return;}
                      setStep(3);
                    }}>Suivant →</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── ÉTAPE 3 : Clients par chambre ── */}
            {step===3&&(
              <div>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",marginBottom:12}}>
                  Laissez vide pour utiliser le nom de la société (<strong>{form.nomSociete}</strong>)
                </p>
                <div style={{display:"grid",gap:8,marginBottom:16,maxHeight:320,overflowY:"auto"}}>
                  {form.chambres.map(roomId=>{
                    const room = ROOMS.find(r=>r.id===roomId);
                    const prixDefaut = getPrix(room);
                    const ci = form.datesParChambre[roomId]?.checkin||form.checkin;
                    const co = form.datesParChambre[roomId]?.checkout||form.checkout;
                    const n = Math.max(0,(new Date(co)-new Date(ci))/86400000);
                    const prixFinal = form.prixParChambre[roomId]!==undefined&&form.prixParChambre[roomId]!==""
                      ? parseFloat(form.prixParChambre[roomId])||0 : prixDefaut;
                    return(
                      <div key={roomId} style={{padding:"12px 14px",background:"#faf8f5",borderRadius:8,border:"1px solid #e8d8b0"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:18,fontWeight:700,color:"#c9952a",minWidth:40}}>{room?.number}</span>
                          <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{room?.type}</span>
                          <span style={{marginLeft:"auto",fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#c9952a"}}>{(prixFinal*n).toFixed(3)} TND</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                          <div style={{gridColumn:"1/-1"}}>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Client</label>
                            <input value={form.clientsParChambre[roomId]||""} onChange={e=>setForm(f=>({...f,clientsParChambre:{...f.clientsParChambre,[roomId]:e.target.value}}))}
                              placeholder={form.nomSociete||"Nom du client"} style={{fontSize:12,padding:"6px 8px",width:"100%"}}/>
                          </div>
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Arrivée</label>
                            <input type="date" value={ci} onChange={e=>setForm(f=>({...f,datesParChambre:{...f.datesParChambre,[roomId]:{...(f.datesParChambre[roomId]||{}),checkin:e.target.value}}}))}
                              style={{fontSize:11,padding:"6px 8px",width:"100%"}}/>
                          </div>
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Départ</label>
                            <input type="date" value={co} onChange={e=>setForm(f=>({...f,datesParChambre:{...f.datesParChambre,[roomId]:{...(f.datesParChambre[roomId]||{}),checkout:e.target.value}}}))}
                              style={{fontSize:11,padding:"6px 8px",width:"100%"}}/>
                          </div>
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Prix/nuit TND</label>
                            <input type="number" min="0" step="0.001"
                              value={form.prixParChambre[roomId]!==undefined?form.prixParChambre[roomId]:prixDefaut}
                              onChange={e=>setForm(f=>({...f,prixParChambre:{...f.prixParChambre,[roomId]:e.target.value}}))}
                              style={{fontSize:11,padding:"6px 8px",width:"100%"}}/>
                          </div>
                          <div>
                            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Nuits</label>
                            <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#c9952a",padding:"6px 0"}}>{n}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"12px 14px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{form.chambres.length} chambre{form.chambres.length>1?"s":""} · {n} nuit{n>1?"s":""}</span>
                    <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:700,color:"#c9952a"}}>{totalGroupe().toFixed(3)} TND</span>
                  </div>
                  {form.bonCommande&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>BC : {form.bonCommande}</p>}
                </div>

                <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                  <button className="btn-ghost" onClick={()=>setStep(2)}>← Retour</button>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
                    <button className="btn-gold" onClick={creerGroupe} disabled={saving}>
                      {saving?"Création...":"✓ Créer le groupe"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL DÉTAIL GROUPE ══ */}
      {modal?.type==="detail"&&(()=>{
        const g = modal.data;
        const resas = resasGroupe(g.id);
        const n2 = Math.max(0,(new Date(g.checkout)-new Date(g.checkin))/86400000);
        const total = resas.reduce((a,r)=>{
          const room=ROOMS.find(rm=>rm.id===r.roomId);
          const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
          const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
          const prix=r.customPrice!==undefined?r.customPrice:
            Math.round((TARIFS[r.billingType||(typeMap[room?.type]||"double")]||160)*(1-(r.remise||0)/100)*100)/100;
          return a+prix*n2;
        },0);

        return(
          <div className="modal-overlay" onClick={()=>setModal(null)}>
            <div className="modal" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:22,fontWeight:400,marginBottom:4}}>{g.nom_societe}</h2>
                  {g.bon_commande&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#8a7040",background:"#fef9f0",padding:"3px 10px",borderRadius:6,display:"inline-block"}}>
                    📄 BC : {g.bon_commande}
                  </p>}
                </div>
                <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,background:"#fef3d0",color:"#b07d1a",padding:"4px 12px",borderRadius:10,fontWeight:700}}>
                  {resas.length} chambre{resas.length>1?"s":""}
                </span>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
                {[
                  ["📅 Arrivée", new Date(g.checkin).toLocaleDateString("fr-FR")],
                  ["📅 Départ", new Date(g.checkout).toLocaleDateString("fr-FR")],
                  ["🌙 Nuits", n2+" nuit"+(n2>1?"s":"")],
                ].map(([l,v])=>(
                  <div key={l} style={{background:"#faf8f5",borderRadius:8,padding:"10px 12px",border:"1px solid #e8d8b0"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{l}</p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:600,color:"#2a1e08"}}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Liste des chambres */}
              <div style={{border:"1px solid #e8d8b0",borderRadius:8,overflow:"hidden",marginBottom:16}}>
                <div style={{padding:"8px 14px",background:"#fef9f0",borderBottom:"1px solid #e8d8b0"}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1}}>Chambres</p>
                </div>
                {resas.map(r=>{
                  const room=ROOMS.find(rm=>rm.id===r.roomId);
                  const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
                  const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
                  const prix=r.customPrice!==undefined?r.customPrice:
                    Math.round((TARIFS[r.billingType||(typeMap[room?.type]||"double")]||160)*(1-(r.remise||0)/100)*100)/100;
                  return(
                    <div key={r.id} style={{padding:"10px 14px",borderBottom:"1px solid #f5efe5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:18,fontWeight:700,color:"#c9952a"}}>{room?.number}</span>
                        <div>
                          <p style={{fontSize:14,fontWeight:500}}>{r.guest}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{room?.type}</p>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:r.paid?"#2d7a4f":"#c95050"}}>
                          {r.paid?"✅ Payé":"⏳ Impayé"}
                        </p>
                        <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{(prix*n2).toFixed(3)} TND</p>
                      </div>
                    </div>
                  );
                })}
                <div style={{padding:"10px 14px",background:"#faf8f5",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#6a5530"}}>Total</span>
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:700,color:"#c9952a"}}>{total.toFixed(3)} TND</span>
                </div>
              </div>

              {g.notes&&<div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderLeft:"3px solid #c9952a",padding:"10px 14px",borderRadius:6,marginBottom:16,fontFamily:'"Jost",sans-serif',fontSize:13,color:"#6a5530"}}>{g.notes}</div>}

              <div style={{display:"flex",justifyContent:"space-between",gap:8,paddingTop:12,borderTop:"1px solid #f0e8d8"}}>
                <button className="btn-red" onClick={()=>supprimerGroupe(g)}>🗑 Supprimer</button>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn-ghost" onClick={()=>setModal(null)}>Fermer</button>
                  <button className="btn-gold" onClick={()=>factureGroupee(g)}>
                    🧾 Facture groupée
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>

    {/* ══ MODAL FACTURE GROUPÉE ══ */}
    {factureModal&&(
        <div className="modal-overlay" onClick={()=>setFactureModal(null)}>
          <div className="modal" style={{maxWidth:660}} onClick={e=>e.stopPropagation()}>
            <div className="no-print" style={{marginBottom:16}}>
              <h2 style={{fontSize:20,fontWeight:600,color:G2,marginBottom:4,fontFamily:'"Cormorant Garamond",serif'}}>🧾 Facture groupée</h2>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginBottom:16}}>
                {factureModal.groupe.nom_societe}{factureModal.groupe.bon_commande?` — BC : ${factureModal.groupe.bon_commande}`:""}
              </p>

              {/* Aperçu lignes */}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
                <thead><tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
                  {["Désignation","Nuits","P.U. TTC","Total"].map((h,i)=>(
                    <th key={i} style={{textAlign:i>0?"right":"left",padding:"7px 8px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {factureModal.lignes.map((l,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
                      <td style={{padding:"8px",fontSize:11,color:"#2c2416"}}>{l.desc}</td>
                      <td style={{padding:"8px",textAlign:"right"}}>{l.qty}</td>
                      <td style={{padding:"8px",textAlign:"right"}}>{l.prixTTC.toFixed(3)}</td>
                      <td style={{padding:"8px",textAlign:"right",fontWeight:600}}>{(l.qty*l.prixTTC).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totaux */}
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                <table style={{fontSize:11,borderCollapse:"collapse",minWidth:260,border:"1px solid #e0d8cc",borderRadius:8,overflow:"hidden"}}>
                  <tbody>
                    {[
                      ["Total HT", factureModal.grandHT.toFixed(3)+" TND"],
                      ["TVA (7%)", factureModal.tvaAmt.toFixed(3)+" TND"],
                      ["Timbre fiscal", "1,000 TND"],
                    ].map(([l,v])=>(
                      <tr key={l} style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}>
                        <td style={{padding:"8px 14px",color:"#6a5a45"}}>{l}</td>
                        <td style={{padding:"8px 14px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>{v}</td>
                      </tr>
                    ))}
                    <tr style={{background:G2}}>
                      <td style={{padding:"10px 14px",fontWeight:800,fontSize:13,color:"#fff"}}>Net à payer</td>
                      <td style={{padding:"10px 14px",fontWeight:800,fontSize:16,color:"#fff",textAlign:"right"}}>{factureModal.netAPayer.toFixed(3)} TND</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Boutons */}
              <div style={{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:12,borderTop:"1px solid #f0ebe3"}}>
                <button className="btn-ghost" onClick={()=>setFactureModal(null)}>Fermer</button>
                {!factureModal.saved?(
                  <button className="btn-gold" onClick={async()=>{
                    const num = await nextInvNum();
                    const fm = factureModal;
                    const ok = await saveFacture({
                      numero:num, type:'libre',
                      client:fm.groupe.nom_societe, adresse:fm.adresse,
                      phone:null, email:null, mf:fm.groupe.mf||null,
                      montant_ht:fm.grandHT, tva:fm.tvaAmt, timbre:1,
                      montant_ttc:fm.netAPayer, remise:0,
                      notes:fm.groupe.notes||null, lignes:fm.lignes
                    });
                    if(ok){
                      setFactureModal(f=>({...f,saved:true,num}));
                      showToast(`Facture F-${num} enregistrée ✓`,"success");
                    } else showToast("Erreur enregistrement","error");
                  }}>💾 Enregistrer</button>
                ):(
                  <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2a8a5a",fontWeight:700,alignSelf:"center"}}>✓ F-{factureModal.num}</span>
                )}
                <button className="btn-primary"
                  style={{opacity:factureModal.saved?1:.45,cursor:factureModal.saved?"pointer":"not-allowed"}}
                  onClick={()=>{
                    if(!factureModal.saved) return;
                    const fm = factureModal;
                    doPrint({
                      numero:`F-${fm.num}`, type:'libre',
                      client:fm.groupe.nom_societe, adresse:fm.adresse,
                      mf:fm.groupe.mf||null, phone:null, cin:null, showCachet:true,
                      montant_ht:fm.grandHT, tva:fm.tvaAmt,
                      montant_ttc:fm.netAPayer,
                      remise:0, notes:fm.groupe.notes, lignes:fm.lignes, created_at:new Date()
                    });
                  }}>🖨 Imprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
