function montantEnLettres(montant){
  const n=Math.round(montant*1000);
  const dinars=Math.floor(n/1000);
  const millimes=n%1000;
  const u=['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const d=['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function dizaine(n){
    if(n<20) return u[n];
    const h=Math.floor(n/10),r=n%10;
    if(h===7||h===9) return d[h]+(r===0?'':(h===7&&r===1||h===9&&r===1?'-et-':'-')+u[10+r]);
    return d[h]+(r===0?(h===8?'s':''):(r===1&&h!==8&&h!==9?'-et-un':'-'+u[r]));
  }
  function centaine(n){
    if(n===0) return '';
    if(n<100) return dizaine(n);
    const h=Math.floor(n/100),r=n%100;
    const p=h===1?'cent':(u[h]+' cent')+(r===0&&h>1?'s':'');
    return r===0?p:p+' '+dizaine(r);
  }
  function millier(n){
    if(n===0) return '';
    if(n===1) return 'mille';
    return centaine(n)+' mille';
  }
  function grand(n){
    if(n===0) return 'zéro';
    let r='';
    if(n>=1000){r+=millier(Math.floor(n/1000))+' ';n%=1000;}
    if(n>0) r+=centaine(n);
    return r.trim();
  }
  let res=grand(dinars)+' dinar'+(dinars>1?'s':'');
  if(millimes>0) res+=' et '+grand(millimes)+' millime'+(millimes>1?'s':'');
  return res.charAt(0).toUpperCase()+res.slice(1);
}

// Calcul du prix effectif d'une réservation (billingType + remise + customPrice)
function getEffectivePrice(r){
  const room=ROOMS.find(rm=>rm.id===r.roomId);
  const TARIFS={single:100,double:160,triple:220,quad:280,suite:200};
  const typeMap={Single:"single",Double:"double",Twin:"double",Triple:"triple",Suite:"suite"};
  const defaultType=typeMap[room?.type]||"double";
  const billingType=r.billingType||defaultType;
  const dpExtra=r.pension==="dp"?40:0;
  const prixBase=(TARIFS[billingType]||160)+dpExtra;
  const remise=parseFloat(r.remise)||0;
  const prixApresRemise=Math.round(prixBase*(1-remise/100)*100)/100;
  const prixTTC=r.customPrice!==undefined?r.customPrice:prixApresRemise;
  const n=nights(r.checkin,r.checkout);
  const extraTTC=r.extraBed?30:0;
  return Math.round((n*prixTTC+n*extraTTC)*100)/100;
}

const TYPES_CONTRAT=["Agence","Entreprise","École","Association","Ambassade","Autre"];
const TARIFS_STD={single:100,double:160,triple:220,quad:280,suite:200};

function ContratsView({sb}){
  const {useState,useEffect}=React;
  const G2="#8B6434";
  const [contrats,setContrats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});

  useEffect(()=>{loadContrats();},[]);

  async function loadContrats(){
    setLoading(true);
    try{
      const{data}=await sb.from('contrats').select('*').order('nom');
      setContrats(data||[]);
    }catch(e){console.error(e);}
    setLoading(false);
  }

  function openNew(){
    setForm({nom:"",type:"Agence",mf:"",contact_nom:"",contact_phone:"",contact_email:"",
      date_debut:"",date_fin:"",remise_pct:0,
      tarif_single:"",tarif_double:"",tarif_triple:"",tarif_quad:"",tarif_suite:"",
      tarif_dp_extra:40,notes:"",actif:true});
    setModal("new");
  }

  function openEdit(c){setForm({...c,date_debut:c.date_debut||"",date_fin:c.date_fin||""});setModal("edit");}

  async function save(){
    if(!form.nom){alert("Nom obligatoire");return;}
    const payload={
      nom:form.nom,type:form.type||"Agence",mf:form.mf||null,
      contact_nom:form.contact_nom||null,contact_phone:form.contact_phone||null,contact_email:form.contact_email||null,
      date_debut:form.date_debut||null,date_fin:form.date_fin||null,
      remise_pct:parseFloat(form.remise_pct)||0,
      tarif_single:form.tarif_single?parseFloat(form.tarif_single):null,
      tarif_double:form.tarif_double?parseFloat(form.tarif_double):null,
      tarif_triple:form.tarif_triple?parseFloat(form.tarif_triple):null,
      tarif_quad:form.tarif_quad?parseFloat(form.tarif_quad):null,
      tarif_suite:form.tarif_suite?parseFloat(form.tarif_suite):null,
      tarif_dp_extra:parseFloat(form.tarif_dp_extra)||40,
      notes:form.notes||null,actif:form.actif!==false,
    };
    try{
      if(modal==="new") await sb.from('contrats').insert([payload]);
      else await sb.from('contrats').update(payload).eq('id',form.id);
      await loadContrats();
      setModal(null);
    }catch(e){alert("Erreur : "+e.message);}
  }

  async function toggleActif(c){
    await sb.from('contrats').update({actif:!c.actif}).eq('id',c.id);
    setContrats(prev=>prev.map(x=>x.id===c.id?{...x,actif:!c.actif}:x));
  }

  async function deleteContrat(id){
    if(!confirm("Supprimer ce contrat ?")) return;
    await sb.from('contrats').delete().eq('id',id);
    setContrats(prev=>prev.filter(c=>c.id!==id));
  }

  // Calculer le tarif effectif pour un type de chambre
  function getTarifEffectif(c,type){
    const tarifKey="tarif_"+type.toLowerCase();
    if(c[tarifKey]) return c[tarifKey];
    if(c.remise_pct>0) return Math.round(TARIFS_STD[type.toLowerCase()]*(1-c.remise_pct/100)*100)/100;
    return TARIFS_STD[type.toLowerCase()];
  }

  const TYPE_COLORS={
    "Agence":["#fef3d0","#b07d1a"],"Entreprise":["#d0e4f8","#1a4f8a"],
    "École":["#f0faf4","#2a8a5a"],"Association":["#ead4f8","#6b35b8"],
    "Ambassade":["#fde8e0","#e05a20"],"Autre":["#f5f0e8","#8a7040"],
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <p className="section-title">🤝 Contrats & Partenaires</p>
          <p className="section-sub">{contrats.length} contrat{contrats.length>1?"s":""}</p>
        </div>
        <button className="btn-gold" onClick={openNew}>+ Nouveau contrat</button>
      </div>

      {loading?<p style={{textAlign:"center",padding:40,fontFamily:'"Jost",sans-serif',color:"#8a7040"}}>Chargement…</p>:(
        <div style={{display:"grid",gap:16}}>
          {contrats.length===0&&<p style={{textAlign:"center",padding:40,color:"#b0a070",fontFamily:'"Jost",sans-serif'}}>Aucun contrat</p>}
          {contrats.map(c=>{
            const[bg,color]=TYPE_COLORS[c.type]||["#f5f0e8","#8a7040"];
            const isExpired=c.date_fin&&c.date_fin<getToday();
            return(
              <div key={c.id} style={{background:"#fff",border:"1.5px solid "+(c.actif&&!isExpired?"#e8d8b0":"#e0e0e0"),borderRadius:12,padding:"18px 20px",boxShadow:"0 2px 8px rgba(42,30,8,0.05)",opacity:c.actif&&!isExpired?1:.7}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <p style={{fontSize:17,fontWeight:700,color:"#2c2416"}}>{c.nom}</p>
                        <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:bg,color}}>{c.type}</span>
                        {!c.actif&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:9,background:"#ebebeb",color:"#888",padding:"2px 8px",borderRadius:10}}>Inactif</span>}
                        {isExpired&&c.actif&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:9,background:"#fad4d4",color:"#9a2020",padding:"2px 8px",borderRadius:10}}>Expiré</span>}
                      </div>
                      {c.mf&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>MF : {c.mf}</p>}
                      {c.contact_nom&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>👤 {c.contact_nom}{c.contact_phone?" · "+c.contact_phone:""}</p>}
                      {(c.date_debut||c.date_fin)&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>📅 {c.date_debut?new Date(c.date_debut+"T12:00:00").toLocaleDateString("fr-FR"):"…"} → {c.date_fin?new Date(c.date_fin+"T12:00:00").toLocaleDateString("fr-FR"):"…"}</p>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>toggleActif(c)} style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"4px 10px",borderRadius:8,border:"1px solid #e0d0b0",background:c.actif?"#f0faf4":"#f5f0e8",color:c.actif?"#2a8a5a":"#8a7040",cursor:"pointer",fontWeight:600}}>{c.actif?"✓ Actif":"Inactif"}</button>
                    <button onClick={()=>openEdit(c)} style={{background:"#fef9f0",border:"1.5px solid #d4c5a0",color:"#6a5530",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11}}>✏️</button>
                    <button onClick={()=>deleteContrat(c.id)} style={{background:"#fdf0f0",border:"1.5px solid #e0a0a0",color:"#9a2020",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11}}>🗑</button>
                  </div>
                </div>
                {/* Tarifs */}
                <div style={{background:"#faf8f5",borderRadius:8,padding:"10px 14px"}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
                    {c.remise_pct>0&&!c.tarif_single?`Remise globale : ${c.remise_pct}% sur tarifs standard`:"Tarifs contractuels (TTC/nuit)"}
                  </p>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {["single","double","triple","quad","suite"].map(t=>{
                      const effectif=getTarifEffectif(c,t);
                      const std=TARIFS_STD[t];
                      const hasSpecial=c["tarif_"+t]||c.remise_pct>0;
                      return(
                        <div key={t} style={{background:"#fff",border:"1px solid #e0d8cc",borderRadius:6,padding:"6px 10px",textAlign:"center",minWidth:70}}>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:8,color:"#a09080",textTransform:"uppercase",marginBottom:2}}>{t}</p>
                          <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:hasSpecial?"#2a8a5a":"#2c2416"}}>{effectif.toFixed(0)}</p>
                          {hasSpecial&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:8,color:"#a09080",textDecoration:"line-through"}}>{std}</p>}
                        </div>
                      );
                    })}
                    <div style={{background:"#fff",border:"1px solid #e0d8cc",borderRadius:6,padding:"6px 10px",textAlign:"center",minWidth:70}}>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:8,color:"#a09080",textTransform:"uppercase",marginBottom:2}}>DP +</p>
                      <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#2c2416"}}>{c.tarif_dp_extra||40}</p>
                    </div>
                  </div>
                </div>
                {c.notes&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginTop:8,fontStyle:"italic"}}>📝 {c.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nouveau/édition */}
      {modal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal" style={{maxWidth:580,fontFamily:'"Inter",sans-serif'}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:14,borderBottom:"1px solid #f0e8d8"}}>
              <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:20,fontWeight:700,color:G2}}>{modal==="new"?"+ Nouveau contrat":"✏️ Modifier"}</p>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Fermer</button>
            </div>
            <div style={{display:"grid",gap:12,maxHeight:"70vh",overflowY:"auto",paddingRight:4}}>
              {/* Infos générales */}
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1}}>Informations générales</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group"><label>Nom *</label><input value={form.nom||""} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} placeholder="ex : Agence ABC Tourism"/></div>
                <div className="form-group"><label>Type</label>
                  <select value={form.type||"Agence"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {TYPES_CONTRAT.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group"><label>Matricule Fiscale</label><input value={form.mf||""} onChange={e=>setForm(f=>({...f,mf:e.target.value}))} placeholder="ex : 1234567A/B/C/000"/></div>
                <div className="form-group"><label>Contact</label><input value={form.contact_nom||""} onChange={e=>setForm(f=>({...f,contact_nom:e.target.value}))} placeholder="Nom du responsable"/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group"><label>Téléphone</label><input value={form.contact_phone||""} onChange={e=>setForm(f=>({...f,contact_phone:e.target.value}))} placeholder="xx xxx xxx"/></div>
                <div className="form-group"><label>Email</label><input value={form.contact_email||""} onChange={e=>setForm(f=>({...f,contact_email:e.target.value}))} placeholder="email@exemple.com"/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group"><label>Date début</label><input type="date" value={form.date_debut||""} onChange={e=>setForm(f=>({...f,date_debut:e.target.value}))}/></div>
                <div className="form-group"><label>Date fin</label><input type="date" value={form.date_fin||""} onChange={e=>setForm(f=>({...f,date_fin:e.target.value}))}/></div>
              </div>

              {/* Tarification */}
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginTop:4}}>Tarification</p>
              <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"12px 14px"}}>
                <div className="form-group" style={{marginBottom:10}}>
                  <label style={{display:"flex",alignItems:"center",gap:6}}>
                    Remise globale %
                    <span style={{fontSize:9,color:"#a09080",fontWeight:400}}>— si pas de tarifs fixes</span>
                  </label>
                  <input type="number" min="0" max="100" value={form.remise_pct||""} onChange={e=>setForm(f=>({...f,remise_pct:e.target.value}))} placeholder="ex : 20"/>
                </div>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#a09080",marginBottom:8}}>OU tarifs fixes par type (laissez vide pour utiliser la remise %) :</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[["Single","tarif_single",100],["Double","tarif_double",160],["Triple","tarif_triple",220],["Quad","tarif_quad",280],["Suite","tarif_suite",200],["DP +","tarif_dp_extra",40]].map(([lbl,key,std])=>(
                    <div key={key}>
                      <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{lbl} <span style={{color:"#c0b080",fontWeight:400}}>(std:{std})</span></label>
                      <input type="number" value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={String(std)} style={{width:"100%",fontSize:12,padding:"5px 8px"}}/>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group"><label>Notes</label><input value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Conditions particulières, remarques…"/></div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f0faf4",border:"1px solid #a0d8b8",borderRadius:8}}>
                <input type="checkbox" id="actifCheck" checked={form.actif!==false} onChange={e=>setForm(f=>({...f,actif:e.target.checked}))} style={{width:16,height:16}}/>
                <label htmlFor="actifCheck" style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#2a8a5a",fontWeight:600,cursor:"pointer"}}>Contrat actif</label>
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-gold" onClick={save}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CATEGORIES_CHARGES=["Électricité","Eau","Salaires","Fournitures","Téléphone","Internet","Loyer","Entretien","Blanchisserie","Alimentation","Assurance","Taxes","Autre"];

function ChargesView({sb,LOGO}){
  const {useState,useEffect}=React;
  const G2="#8B6434";
  const [charges,setCharges]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null); // null | "new" | "edit"
  const [form,setForm]=useState({});
  const [filterMois,setFilterMois]=useState(String(new Date().getMonth()+1).padStart(2,'0'));
  const [filterAnnee,setFilterAnnee]=useState(String(new Date().getFullYear()));
  const [filterCat,setFilterCat]=useState("all");
  const [filterStatut,setFilterStatut]=useState("all");

  const MOIS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const annees=Array.from({length:5},(_,i)=>String(new Date().getFullYear()-i));

  useEffect(()=>{loadCharges();},[]);

  async function loadCharges(){
    setLoading(true);
    try{
      const{data,error}=await sb.from('charges').select('*').order('date',{ascending:false});
      if(!error) setCharges(data||[]);
    }catch(e){console.error(e);}
    setLoading(false);
  }

  function openNew(){
    setForm({date:getToday(),fournisseur:"",description:"",categorie:"Électricité",montant_ht:0,tva:0,montant_ttc:0,statut:"a_payer",notes:""});
    setModal("new");
  }

  function openEdit(c){
    setForm({...c});
    setModal("edit");
  }

  async function saveCharge(){
    if(!form.date||!form.description){alert("Date et description obligatoires");return;}
    const payload={
      date:form.date,
      fournisseur:form.fournisseur||null,
      description:form.description,
      categorie:form.categorie||"Autre",
      montant_ht:parseFloat(form.montant_ht)||0,
      tva:parseFloat(form.tva)||0,
      montant_ttc:parseFloat(form.montant_ttc)||0,
      statut:form.statut||"a_payer",
      notes:form.notes||null,
    };
    try{
      if(modal==="new"){
        const{error}=await sb.from('charges').insert([payload]);
        if(error) throw error;
      } else {
        const{error}=await sb.from('charges').update(payload).eq('id',form.id);
        if(error) throw error;
      }
      await loadCharges();
      setModal(null);
    }catch(e){alert("Erreur : "+e.message);}
  }

  async function deleteCharge(id){
    if(!confirm("Supprimer cette charge ?")) return;
    await sb.from('charges').delete().eq('id',id);
    setCharges(prev=>prev.filter(c=>c.id!==id));
  }

  async function toggleStatut(c){
    const newStatut=c.statut==="paye"?"a_payer":"paye";
    await sb.from('charges').update({statut:newStatut}).eq('id',c.id);
    setCharges(prev=>prev.map(x=>x.id===c.id?{...x,statut:newStatut}:x));
  }

  // Recalcul automatique TTC
  function handleMontantHT(val){
    const ht=parseFloat(val)||0;
    const tva=Math.round(ht*0.19*1000)/1000;
    const ttc=Math.round((ht+tva)*1000)/1000;
    setForm(f=>({...f,montant_ht:val,tva:tva,montant_ttc:ttc}));
  }

  const liste=charges.filter(c=>{
    const d=new Date(c.date);
    const matchMois=!filterMois||String(d.getMonth()+1).padStart(2,'0')===filterMois;
    const matchAnnee=!filterAnnee||String(d.getFullYear())===filterAnnee;
    const matchCat=filterCat==="all"||c.categorie===filterCat;
    const matchStatut=filterStatut==="all"||c.statut===filterStatut;
    return matchMois&&matchAnnee&&matchCat&&matchStatut;
  });

  const totalTTC=Math.round(liste.reduce((a,c)=>a+(c.montant_ttc||0),0)*1000)/1000;
  const totalPaye=Math.round(liste.filter(c=>c.statut==="paye").reduce((a,c)=>a+(c.montant_ttc||0),0)*1000)/1000;
  const totalAPayer=Math.round((totalTTC-totalPaye)*1000)/1000;

  // Couleurs catégories
  const CAT_COLORS={
    "Électricité":["#fef3d0","#b07d1a"],"Eau":["#d0e4f8","#1a4f8a"],
    "Salaires":["#f0faf4","#2a8a5a"],"Fournitures":["#ead4f8","#6b35b8"],
    "Téléphone":["#fde8e0","#e05a20"],"Internet":["#fde8e0","#e05a20"],
    "Loyer":["#fad4d4","#9a2020"],"Entretien":["#fef3d0","#b07d1a"],
    "Blanchisserie":["#d0e4f8","#1a4f8a"],"Alimentation":["#f0faf4","#2a8a5a"],
    "Assurance":["#ead4f8","#6b35b8"],"Taxes":["#fad4d4","#9a2020"],"Autre":["#f5f0e8","#8a7040"],
  };

  return(
    <div>
      {/* Titre */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <p className="section-title">💸 Charges</p>
          <p className="section-sub">{liste.length} charge{liste.length>1?"s":""}</p>
        </div>
        <button className="btn-gold" onClick={openNew}>+ Nouvelle charge</button>
      </div>

      {/* Filtres */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"140px 140px 1fr 160px",gap:12,marginBottom:20,boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Mois</label>
          <select value={filterMois} onChange={e=>setFilterMois(e.target.value)}>
            <option value="">Tous</option>
            {MOIS.map((m,i)=><option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Année</label>
          <select value={filterAnnee} onChange={e=>setFilterAnnee(e.target.value)}>
            <option value="">Toutes</option>
            {annees.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Catégorie</label>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="all">Toutes</option>
            {CATEGORIES_CHARGES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Statut</label>
          <select value={filterStatut} onChange={e=>setFilterStatut(e.target.value)}>
            <option value="all">Tous</option>
            <option value="paye">✓ Payé</option>
            <option value="a_payer">À payer</option>
          </select>
        </div>
      </div>

      {/* Résumé */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Total charges",val:totalTTC.toFixed(3)+" TND",color:"#c95050",bg:"#fdf0f0",border:"#e0a0a0"},
          {label:"Payé",val:totalPaye.toFixed(3)+" TND",color:"#2a8a5a",bg:"#f0faf4",border:"#a0d8b8"},
          {label:"À payer",val:totalAPayer.toFixed(3)+" TND",color:"#b07d1a",bg:"#fef9f0",border:"#e8d8b0"},
        ].map(({label,val,color,bg,border})=>(
          <div key={label} style={{background:bg,border:"1.5px solid "+border,borderRadius:10,padding:"14px 18px"}}>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{label}</p>
            <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:22,fontWeight:700,color:"#2a1e08"}}>{val}</p>
          </div>
        ))}
      </div>

      {/* Tableau */}
      {loading?(
        <p style={{textAlign:"center",padding:40,fontFamily:'"Jost",sans-serif',color:"#8a7040"}}>Chargement…</p>
      ):(
        <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#fef9f0",borderBottom:"1px solid #f0e8d8"}}>
                {["Date","Catégorie","Description","Fournisseur","HT","TVA","TTC","Statut","Actions"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:["HT","TVA","TTC"].includes(h)?"right":"left",fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liste.length===0&&<tr><td colSpan={9} style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:14}}>Aucune charge enregistrée</td></tr>}
              {liste.map((c,i)=>{
                const [bg,color]=CAT_COLORS[c.categorie]||["#f5f0e8","#8a7040"];
                return(
                  <tr key={c.id} style={{borderBottom:"1px solid #f5f0e8",background:i%2===0?"#fff":"#faf8f5"}}>
                    <td style={{padding:"10px 12px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{new Date(c.date+"T12:00:00").toLocaleDateString("fr-FR")}</td>
                    <td style={{padding:"10px 12px"}}>
                      <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:10,background:bg,color}}>{c.categorie}</span>
                    </td>
                    <td style={{padding:"10px 12px",fontWeight:500,color:"#2a1e08"}}>{c.description}</td>
                    <td style={{padding:"10px 12px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{c.fournisseur||"—"}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5a45"}}>{(c.montant_ht||0).toFixed(3)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5a45"}}>{(c.tva||0).toFixed(3)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:"#2a1e08"}}>{(c.montant_ttc||0).toFixed(3)}</td>
                    <td style={{padding:"10px 12px"}}>
                      <button onClick={()=>toggleStatut(c)} style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:10,border:"none",cursor:"pointer",background:c.statut==="paye"?"#d4f0e0":"#fad4d4",color:c.statut==="paye"?"#2d7a4f":"#9a2020"}}>
                        {c.statut==="paye"?"✓ Payé":"À payer"}
                      </button>
                    </td>
                    <td style={{padding:"10px 12px"}}>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>openEdit(c)} style={{background:"#fef9f0",border:"1.5px solid #d4c5a0",color:"#6a5530",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontFamily:'"Jost",sans-serif',fontWeight:600}}>✏️</button>
                        <button onClick={()=>deleteCharge(c.id)} style={{background:"#fdf0f0",border:"1.5px solid #e0a0a0",color:"#9a2020",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11}}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nouvelle/édition charge */}
      {modal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal" style={{maxWidth:500,fontFamily:'"Inter",sans-serif'}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:14,borderBottom:"1px solid #f0e8d8"}}>
              <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:20,fontWeight:700,color:G2}}>{modal==="new"?"+ Nouvelle charge":"✏️ Modifier la charge"}</p>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Fermer</button>
            </div>
            <div style={{display:"grid",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label>Catégorie</label>
                  <select value={form.categorie||"Autre"} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                    {CATEGORIES_CHARGES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="ex : Facture STEG Avril 2026"/>
              </div>
              <div className="form-group">
                <label>Fournisseur</label>
                <input value={form.fournisseur||""} onChange={e=>setForm(f=>({...f,fournisseur:e.target.value}))} placeholder="ex : STEG, SONEDE, …"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label>Montant HT</label>
                  <input type="number" value={form.montant_ht||""} onChange={e=>handleMontantHT(e.target.value)} placeholder="0.000"/>
                </div>
                <div className="form-group">
                  <label>TVA</label>
                  <input type="number" value={form.tva||""} onChange={e=>setForm(f=>({...f,tva:e.target.value,montant_ttc:Math.round(((parseFloat(form.montant_ht)||0)+(parseFloat(e.target.value)||0))*1000)/1000}))} placeholder="0.000"/>
                </div>
                <div className="form-group">
                  <label>Montant TTC</label>
                  <input type="number" value={form.montant_ttc||""} onChange={e=>setForm(f=>({...f,montant_ttc:e.target.value}))} placeholder="0.000" style={{fontWeight:700}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label>Statut</label>
                  <select value={form.statut||"a_payer"} onChange={e=>setForm(f=>({...f,statut:e.target.value}))}>
                    <option value="a_payer">À payer</option>
                    <option value="paye">✓ Payé</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Remarques…"/>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-gold" onClick={saveCharge}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LivreDePolice({reservations,ROOMS,LOGO}){
  const {useState}=React;
  const [filterDu,setFilterDu]=useState("");
  const [filterAu,setFilterAu]=useState("");
  const [search,setSearch]=useState("");

  const liste=reservations.filter(r=>{
    if(["blocked","cancelled"].includes(r.status)) return false;
    const matchDu=!filterDu||r.checkin>=filterDu;
    const matchAu=!filterAu||r.checkin<=filterAu;
    const term=search.toLowerCase().trim();
    const matchSearch=!term||
      (r.guest||"").toLowerCase().includes(term)||
      (r.cin||"").toLowerCase().includes(term)||
      (r.passport||"").toLowerCase().includes(term)||
      (r.nationality||"").toLowerCase().includes(term)||
      (r.provenance||"").toLowerCase().includes(term);
    return matchDu&&matchAu&&matchSearch;
  }).sort((a,b)=>b.checkin.localeCompare(a.checkin));

  function printPolice(){
    const G2b="#8B6434";
    // Construire toutes les lignes — titulaire + accompagnants
    let rowNum=0;
    const rows=liste.map((r,i)=>{
      const room=ROOMS.find(x=>x.id===r.roomId);
      const bg=i%2===0?"#fff":"#faf8f5";
      const mainRow=`<tr style="border-bottom:1px solid #f0ebe3;background:${bg}">
        <td style="padding:5px 6px;font-size:9px;text-align:center;color:#8a7040">${++rowNum}</td>
        <td style="padding:5px 6px;font-size:9px;font-weight:600">${r.guest||"—"}</td>
        <td style="padding:5px 6px;font-size:9px">${r.nationality||"—"}</td>
        <td style="padding:5px 6px;font-size:9px">${r.cin?r.cin:r.passport||"—"}</td>
        <td style="padding:5px 6px;font-size:9px">${r.profession||"—"}</td>
        <td style="padding:5px 6px;font-size:9px">${r.provenance||"—"}</td>
        <td style="padding:5px 6px;font-size:9px;text-align:center">${new Date(r.checkin+"T12:00:00").toLocaleDateString("fr-FR")}</td>
        <td style="padding:5px 6px;font-size:9px;text-align:center">${new Date(r.checkout+"T12:00:00").toLocaleDateString("fr-FR")}</td>
        <td style="padding:5px 6px;font-size:9px;text-align:center;font-weight:700;color:#c9952a">${room?.number||"—"}</td>
      </tr>`;
      const accRows=(r.accompagnants||[]).map(acc=>`
        <tr style="border-bottom:1px solid #f0ebe3;background:${bg}">
          <td style="padding:5px 6px;font-size:9px;text-align:center;color:#b0a070">${++rowNum}</td>
          <td style="padding:5px 6px;font-size:9px;color:#555">${acc.nom||"—"}</td>
          <td style="padding:5px 6px;font-size:9px">${acc.nationalite||"—"}</td>
          <td style="padding:5px 6px;font-size:9px">${acc.cin||acc.passport||"—"}</td>
          <td style="padding:5px 6px;font-size:9px">${acc.profession||"—"}</td>
          <td style="padding:5px 6px;font-size:9px">${acc.provenance||"—"}</td>
          <td style="padding:5px 6px;font-size:9px;text-align:center">${new Date(r.checkin+"T12:00:00").toLocaleDateString("fr-FR")}</td>
          <td style="padding:5px 6px;font-size:9px;text-align:center">${new Date(r.checkout+"T12:00:00").toLocaleDateString("fr-FR")}</td>
          <td style="padding:5px 6px;font-size:9px;text-align:center;color:#c9952a">${room?.number||"—"}</td>
        </tr>`).join("");
      return mainRow+accRows;
    }).join("");
    const html=`<html><head><meta charset="UTF-8"/>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Inter",Arial,sans-serif;font-size:9pt;color:#000;padding:10mm 12mm}@page{size:A4 landscape;margin:0}table{width:100%;border-collapse:collapse}</style>
    </head><body>
    <div style="border-bottom:2px solid ${G2b};padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <p style="font-size:10px;font-weight:700;color:#2c2416">Société Hedi pour les services touristiques — SHST</p>
        <p style="font-size:15px;font-weight:800;color:${G2b};letter-spacing:1px">IMPAVID HOTEL — LIVRE DE POLICE</p>
        <p style="font-size:9px;color:#6a5a45">Rue Jamel Abdelnasser, Gabès 6000 · MF : 1661336G · Tél/Fax : 75 220 856</p>
      </div>
      <div style="text-align:right">
        <p style="font-size:10px;color:#8a7a65">Période : ${filterDu?new Date(filterDu).toLocaleDateString("fr-FR"):"début"} → ${filterAu?new Date(filterAu).toLocaleDateString("fr-FR"):"fin"}</p>
        <p style="font-size:10px;color:#8a7a65">Édité le ${new Date().toLocaleDateString("fr-FR")}</p>
        <p style="font-size:11px;font-weight:700;color:#2c2416;margin-top:4px">${liste.length} enregistrement${liste.length>1?"s":""}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr style="background:#2c2416;color:#f5d984">
          ${["N°","Nom & Prénom","Nationalité","CIN / Passeport","Profession","Provenance","Arrivée","Départ","Chambre"].map(h=>`<th style="padding:7px 6px;font-size:8px;text-align:left;letter-spacing:0.5px">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:7px;color:#a09080;border-top:1px solid #e0d8cc;padding-top:6px;margin-top:12px">Document officiel — IMPAVID HOTEL · impavidhotel@gmail.com · Gabès</p>
    </body></html>`;
    const w=window.open("","_blank","width=1100,height=700");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),500);
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <p className="section-title">📋 Livre de Police</p>
          <p className="section-sub">{liste.length} enregistrement{liste.length>1?"s":""}</p>
        </div>
        <button className="btn-gold" onClick={printPolice}>🖨 Imprimer le registre</button>
      </div>

      {/* Filtres */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 160px 160px",gap:12,marginBottom:20,boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>🔍 Rechercher</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nom, CIN, passeport, nationalité…" style={{width:"100%"}}/>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Arrivée du</label>
          <input type="date" value={filterDu} onChange={e=>setFilterDu(e.target.value)} style={{width:"100%"}}/>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Arrivée au</label>
          <input type="date" value={filterAu} onChange={e=>setFilterAu(e.target.value)} style={{width:"100%"}}/>
        </div>
      </div>

      {/* Tableau */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead>
              <tr style={{background:"#2c2416"}}>
                {["N°","Nom & Prénom","Nationalité","CIN / Passeport","Profession","Provenance","Arrivée","Départ","Ch."].map((h,i)=>(
                  <th key={h} style={{padding:"10px 8px",textAlign:i===0||i>=6?"center":"left",fontSize:9,fontWeight:700,color:"#f5d984",textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liste.length===0?(
                <tr><td colSpan={9} style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:14}}>Aucun enregistrement</td></tr>
              ):liste.map((r,i)=>{
                const room=ROOMS.find(x=>x.id===r.roomId);
                const bg=i%2===0?"#fff":"#faf8f5";
                return(
                  <React.Fragment key={r.id}>
                    {/* Ligne titulaire */}
                    <tr style={{borderBottom:"1px solid #f0ebe3",background:bg}}>
                      <td style={{padding:"9px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070"}}>{i+1}</td>
                      <td style={{padding:"9px 8px",fontWeight:700,color:"#2c2416",fontSize:13}}>{r.guest||"—"}{(r.accompagnants||[]).length>0&&<span style={{fontFamily:'"Jost",sans-serif',fontSize:9,background:"#fef3d0",color:"#b07d1a",padding:"1px 6px",borderRadius:8,marginLeft:6}}>+{r.accompagnants.length}</span>}</td>
                      <td style={{padding:"9px 8px",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{r.nationality||<span style={{color:"#c0b080"}}>—</span>}</td>
                      <td style={{padding:"9px 8px",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{r.cin||r.passport||<span style={{color:"#c0b080"}}>—</span>}</td>
                      <td style={{padding:"9px 8px",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{r.profession||<span style={{color:"#c0b080"}}>—</span>}</td>
                      <td style={{padding:"9px 8px",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{r.provenance||<span style={{color:"#c0b080"}}>—</span>}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{new Date(r.checkin+"T12:00:00").toLocaleDateString("fr-FR")}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{new Date(r.checkout+"T12:00:00").toLocaleDateString("fr-FR")}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",fontWeight:700,color:"#c9952a",fontSize:13}}>{room?.number||"—"}</td>
                    </tr>
                    {/* Lignes accompagnants */}
                    {(r.accompagnants||[]).map((acc,j)=>(
                      <tr key={j} style={{borderBottom:"1px solid #f0ebe3",background:bg}}>
                        <td style={{padding:"7px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:10,color:"#c0b080"}}>↳</td>
                        <td style={{padding:"7px 8px",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#555"}}>{acc.nom||"—"}</td>
                        <td style={{padding:"7px 8px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>{acc.nationalite||<span style={{color:"#c0b080"}}>—</span>}</td>
                        <td style={{padding:"7px 8px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>{acc.cin||acc.passport||<span style={{color:"#c0b080"}}>—</span>}</td>
                        <td style={{padding:"7px 8px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>{acc.profession||<span style={{color:"#c0b080"}}>—</span>}</td>
                        <td style={{padding:"7px 8px",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>{acc.provenance||<span style={{color:"#c0b080"}}>—</span>}</td>
                        <td style={{padding:"7px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{new Date(r.checkin+"T12:00:00").toLocaleDateString("fr-FR")}</td>
                        <td style={{padding:"7px 8px",textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{new Date(r.checkout+"T12:00:00").toLocaleDateString("fr-FR")}</td>
                        <td style={{padding:"7px 8px",textAlign:"center",color:"#c9952a"}}>{room?.number||"—"}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

