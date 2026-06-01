// ══════════════════════════════════════════════════════
//  MODULE RH — Employés, Congés, Salaires
// ══════════════════════════════════════════════════════

function RHView({sb, showToast}) {
  const {useState, useEffect} = React;
  const [tab, setTab] = useState("dashboard");
  const [employes, setEmployes] = useState([]);
  const [conges, setConges] = useState([]);
  const [salaires, setSalaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const G2 = "#8B6434";
  const TODAY = new Date().toISOString().split('T')[0];
  const MOIS_COURANT = new Date().toISOString().slice(0,7);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [e, c, s] = await Promise.all([
        sb.from('employes').select('*').order('nom'),
        sb.from('conges').select('*').order('date_debut', {ascending:false}),
        sb.from('salaires').select('*').order('mois', {ascending:false}),
      ]);
      setEmployes(e.data||[]);
      setConges(c.data||[]);
      setSalaires(s.data||[]);
    } catch(err) { showToast("Erreur chargement RH","error"); }
    setLoading(false);
  }

  // Stats dashboard
  const actifs = employes.filter(e=>e.actif);
  const congesActifs = conges.filter(c=>
    c.statut==='approuve' && c.date_debut<=TODAY && c.date_fin>=TODAY
  );
  const enConge = [...new Set(congesActifs.map(c=>c.employe_id))];
  const presents = actifs.filter(e=>!enConge.includes(e.id)).length;
  const salaireMois = salaires.filter(s=>s.mois===MOIS_COURANT)
    .reduce((a,s)=>a+(s.net_a_payer||0),0);

  const tabs = [
    {id:"dashboard", label:"📊 Tableau de bord"},
    {id:"employes",  label:"👥 Employés"},
    {id:"conges",    label:"📅 Congés & Absences"},
    {id:"salaires",  label:"💰 Salaires"},
  ];

  return (
    <div style={{padding:"24px 32px", maxWidth:1100, margin:"0 auto"}}>

      {/* EN-TÊTE */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
        <div>
          <p className="section-title">👥 Ressources Humaines</p>
          <p className="section-sub">{actifs.length} employé{actifs.length>1?"s":""} actif{actifs.length>1?"s":""}</p>
        </div>
        <button className="btn-ghost" onClick={loadAll} style={{fontSize:11}}>🔄 Actualiser</button>
      </div>

      {/* TABS */}
      <div style={{display:"flex", gap:8, marginBottom:20, borderBottom:`1px solid #e8ddc8`, paddingBottom:0}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{fontFamily:'"Jost",sans-serif', fontSize:12, padding:"8px 16px",
              background:"none", border:"none", cursor:"pointer",
              color:tab===t.id?G2:"#8a7040", fontWeight:tab===t.id?700:400,
              borderBottom:tab===t.id?`2px solid ${G2}`:"2px solid transparent",
              marginBottom:-1, transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p style={{textAlign:"center", padding:40, color:"#b0a070", fontFamily:'"Jost",sans-serif'}}>Chargement...</p>}

      {/* ── DASHBOARD ── */}
      {!loading && tab==="dashboard" && (
        <div>
          {/* Cartes stats */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24}}>
            {[
              {label:"Total Employés", val:actifs.length, icon:"👥", color:"#1a5a8a", bg:"#f0f5ff"},
              {label:"Présents", val:presents, icon:"✅", color:"#2d7a4f", bg:"#f0faf5"},
              {label:"En Congé", val:enConge.length, icon:"🏖", color:"#c9952a", bg:"#fef9ee"},
              {label:"Salaires Mois", val:salaireMois.toFixed(3)+" TND", icon:"💰", color:"#6b35b8", bg:"#f5f0fc"},
            ].map(({label,val,icon,color,bg})=>(
              <div key={label} style={{background:bg, border:`1px solid ${color}22`, borderRadius:10, padding:"16px 18px"}}>
                <p style={{fontFamily:'"Jost",sans-serif', fontSize:9, fontWeight:700, color, textTransform:"uppercase", letterSpacing:.8, marginBottom:6}}>{icon} {label}</p>
                <p style={{fontFamily:'"Cormorant Garamond",serif', fontSize:22, fontWeight:600, color:"#2a1e08"}}>{val}</p>
              </div>
            ))}
          </div>

          {/* Congés en cours */}
          <div style={{background:"#fff", border:"1px solid #e8ddc8", borderRadius:10, padding:"18px 20px", marginBottom:16}}>
            <p style={{fontFamily:'"Jost",sans-serif', fontSize:11, fontWeight:700, color:G2, textTransform:"uppercase", letterSpacing:.8, marginBottom:12}}>📅 Congés en cours</p>
            {congesActifs.length===0 ? (
              <p style={{fontFamily:'"Jost",sans-serif', fontSize:12, color:"#b0a070"}}>Aucun congé en cours</p>
            ) : congesActifs.map(c=>{
              const emp = employes.find(e=>e.id===c.employe_id);
              return (
                <div key={c.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f5efe5"}}>
                  <div>
                    <p style={{fontSize:14, fontWeight:500}}>{emp?.nom||"—"}</p>
                    <p style={{fontFamily:'"Jost",sans-serif', fontSize:10, color:"#8a7040"}}>{emp?.poste||""}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontFamily:'"Jost",sans-serif', fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:8,
                      background:c.type==="paye"?"#f0faf5":c.type==="maladie"?"#fff0f0":"#fff8ee",
                      color:c.type==="paye"?"#2d7a4f":c.type==="maladie"?"#c95050":"#c9952a"}}>
                      {c.type==="paye"?"Congé payé":c.type==="maladie"?"Congé maladie":"Absence"}
                    </span>
                    <p style={{fontFamily:'"Jost",sans-serif', fontSize:10, color:"#8a7040", marginTop:2}}>
                      {new Date(c.date_debut+"T12:00:00").toLocaleDateString("fr-FR")} → {new Date(c.date_fin+"T12:00:00").toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Liste présents/absents */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <div style={{background:"#f0faf5", border:"1px solid #a0d8b8", borderRadius:10, padding:"16px 18px"}}>
              <p style={{fontFamily:'"Jost",sans-serif', fontSize:10, fontWeight:700, color:"#2d7a4f", marginBottom:10}}>✅ PRÉSENTS ({presents})</p>
              {actifs.filter(e=>!enConge.includes(e.id)).map(e=>(
                <p key={e.id} style={{fontFamily:'"Jost",sans-serif', fontSize:12, padding:"3px 0", borderBottom:"1px solid rgba(0,0,0,0.05)"}}>
                  {e.nom} <span style={{fontSize:10, color:"#8a7040"}}>— {e.poste||"—"}</span>
                </p>
              ))}
            </div>
            <div style={{background:"#fff8ee", border:"1px solid #e8c060", borderRadius:10, padding:"16px 18px"}}>
              <p style={{fontFamily:'"Jost",sans-serif', fontSize:10, fontWeight:700, color:"#c9952a", marginBottom:10}}>🏖 ABSENTS / EN CONGÉ ({enConge.length})</p>
              {actifs.filter(e=>enConge.includes(e.id)).map(e=>(
                <p key={e.id} style={{fontFamily:'"Jost",sans-serif', fontSize:12, padding:"3px 0", borderBottom:"1px solid rgba(0,0,0,0.05)"}}>
                  {e.nom} <span style={{fontSize:10, color:"#8a7040"}}>— {e.poste||"—"}</span>
                </p>
              ))}
              {enConge.length===0 && <p style={{fontFamily:'"Jost",sans-serif', fontSize:12, color:"#b0a070"}}>Aucun absent</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── EMPLOYÉS ── */}
      {!loading && tab==="employes" && (
        <EmployesTab sb={sb} employes={employes} setEmployes={setEmployes} showToast={showToast} G2={G2} conges={conges}/>
      )}

      {/* ── CONGÉS ── */}
      {!loading && tab==="conges" && (
        <CongesTab sb={sb} conges={conges} setConges={setConges} employes={employes} showToast={showToast} G2={G2} TODAY={TODAY}/>
      )}

      {/* ── SALAIRES ── */}
      {!loading && tab==="salaires" && (
        <SalairesTab sb={sb} salaires={salaires} setSalaires={setSalaires} employes={employes} showToast={showToast} G2={G2} MOIS_COURANT={MOIS_COURANT}/>
      )}

    </div>
  );
}

// ══════════════════════════════════════════════════════
//  ONGLET EMPLOYÉS
// ══════════════════════════════════════════════════════
function EmployesTab({sb, employes, setEmployes, showToast, G2, conges}) {
  const {useState} = React;
  const empty = {nom:"", poste:"", date_embauche:"", salaire_base:"", telephone:"", cin:"", actif:true};
  const [form, setForm] = useState(empty);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [showSalaires, setShowSalaires] = useState(false);

  // Calcul congés par employé (depuis date embauche)
  function congesEmploye(emp) {
    if(!emp.date_embauche) return 0;
    const depuis = emp.date_embauche;
    const empConges = (conges||[]).filter(c=>
      c.employe_id===emp.id &&
      c.statut==="approuve" &&
      c.date_debut>=depuis
    );
    return empConges.reduce((a,c)=>{
      const jours = Math.max(1, Math.round((new Date(c.date_fin)-new Date(c.date_debut))/86400000)+1);
      return a+jours;
    },0);
  }

  const filtered = employes.filter(e=>
    e.nom.toLowerCase().includes(search.toLowerCase()) ||
    (e.poste||"").toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    try {
      const payload = {
        nom: form.nom.trim(),
        poste: form.poste||null,
        date_embauche: form.date_embauche||null,
        salaire_base: parseFloat(form.salaire_base)||0,
        telephone: form.telephone||null,
        cin: form.cin||null,
        actif: form.actif,
      };
      if(modal==="new") {
        const {data,error} = await sb.from('employes').insert([payload]).select();
        if(error) throw error;
        setEmployes(prev=>[...prev, data[0]].sort((a,b)=>a.nom.localeCompare(b.nom)));
        showToast("Employé ajouté ✓");
      } else {
        const {error} = await sb.from('employes').update(payload).eq('id', form.id);
        if(error) throw error;
        setEmployes(prev=>prev.map(e=>e.id===form.id?{...e,...payload}:e));
        showToast("Employé mis à jour ✓");
      }
      setModal(null);
      setForm(empty);
    } catch(e) { showToast("Erreur","error"); }
  }

  async function toggleActif(emp) {
    await sb.from('employes').update({actif:!emp.actif}).eq('id',emp.id);
    setEmployes(prev=>prev.map(e=>e.id===emp.id?{...e,actif:!e.actif}:e));
    showToast(emp.actif?"Employé désactivé":"Employé réactivé ✓");
  }

  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Rechercher un employé..."
          style={{fontSize:13, padding:"8px 12px", width:280}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowSalaires(s=>!s)}
            style={{fontFamily:'"Jost",sans-serif',fontSize:12,padding:"7px 14px",borderRadius:8,cursor:"pointer",
              background:showSalaires?"#fef9f0":"#f5f0e8",
              border:`1px solid ${showSalaires?"#c9952a":"#e0d0b0"}`,
              color:showSalaires?"#c9952a":"#8a7040",fontWeight:600}}>
            {showSalaires?"🙈 Masquer salaires":"👁 Voir salaires"}
          </button>
          <button className="btn-gold" onClick={()=>{setForm(empty);setModal("new");}}>+ Ajouter un employé</button>
        </div>
      </div>

      {/* Tableau */}
      <div style={{background:"#fff", border:"1px solid #e8ddc8", borderRadius:10, overflow:"hidden"}}>
        <div style={{display:"grid", gridTemplateColumns:"1fr 120px 100px 100px 90px 100px 120px", gap:8, padding:"10px 16px", background:"#fef9f0", borderBottom:"1px solid #f0e8d8"}}>
          {["Nom & Prénom","Poste","CIN","Téléphone","Congés pris","Salaire Base","Statut"].map(h=>(
            <p key={h} style={{fontFamily:'"Jost",sans-serif', fontSize:9, letterSpacing:1.5, color:"#8a7040", textTransform:"uppercase", fontWeight:600}}>{h}</p>
          ))}
        </div>
        {filtered.length===0 && <p style={{padding:30, textAlign:"center", color:"#b0a070", fontFamily:'"Jost",sans-serif', fontSize:13}}>Aucun employé</p>}
        {filtered.map(emp=>(
          <div key={emp.id} style={{display:"grid", gridTemplateColumns:"1fr 120px 100px 100px 90px 100px 120px", gap:8, padding:"12px 16px", borderBottom:"1px solid #f5efe5", alignItems:"center", opacity:emp.actif?1:0.5}}>
            <div>
              <p style={{fontSize:14, fontWeight:500}}>{emp.nom}</p>
              {emp.date_embauche && <p style={{fontFamily:'"Jost",sans-serif', fontSize:10, color:"#8a7040"}}>Depuis {new Date(emp.date_embauche+"T12:00:00").toLocaleDateString("fr-FR")}</p>}
            </div>
            <p style={{fontFamily:'"Jost",sans-serif', fontSize:12, color:"#6a5530"}}>{emp.poste||"—"}</p>
            <p style={{fontFamily:'"Jost",sans-serif', fontSize:11, color:"#8a7040"}}>{emp.cin||"—"}</p>
            <p style={{fontFamily:'"Jost",sans-serif', fontSize:11, color:"#8a7040"}}>{emp.telephone||"—"}</p>
            <div style={{textAlign:"center"}}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:congesEmploye(emp)>20?"#c95050":"#2d7a4f"}}>{congesEmploye(emp)} j</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040"}}>depuis embauche</p>
            </div>
            <p style={{fontFamily:'"Jost",sans-serif', fontSize:12, fontWeight:600, color:G2}}>
              {showSalaires?(emp.salaire_base||0).toFixed(3)+" TND":"● ● ● ●"}
            </p>
            <div style={{display:"flex", gap:6}}>
              <button onClick={()=>{setForm(emp);setModal("edit");}}
                style={{fontFamily:'"Jost",sans-serif', fontSize:10, padding:"3px 8px", background:"#f5f0e8", border:"1px solid #e0d0b0", borderRadius:4, cursor:"pointer"}}>✏️</button>
              <button onClick={()=>toggleActif(emp)}
                style={{fontFamily:'"Jost",sans-serif', fontSize:10, padding:"3px 8px",
                  background:emp.actif?"#fdf0f0":"#f0faf5",
                  border:`1px solid ${emp.actif?"#e0a0a0":"#a0d8b8"}`,
                  color:emp.actif?"#c95050":"#2d7a4f",
                  borderRadius:4, cursor:"pointer"}}>
                {emp.actif?"Désact.":"Activer"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal && ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setModal(null)}>
          <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:480,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:20,fontWeight:500,marginBottom:20,fontFamily:'"Cormorant Garamond",serif'}}>{modal==="new"?"Nouvel employé":"Modifier l'employé"}</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Nom & Prénom *","nom","text"],["Poste","poste","text"],["CIN","cin","text"],["Téléphone","telephone","text"],["Date d'embauche","date_embauche","date"],["Salaire de base (TND)","salaire_base","number"]].map(([lbl,key,type])=>(
                <div key={key} className="form-group">
                  <label>{lbl}</label>
                  <input type={type} value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={type==="number"?"0.000":""}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12}}>
              <input type="checkbox" checked={form.actif} onChange={e=>setForm(f=>({...f,actif:e.target.checked}))} id="actif_chk" style={{width:16,height:16}}/>
              <label htmlFor="actif_chk" style={{fontFamily:'"Jost",sans-serif',fontSize:13,cursor:"pointer"}}>Employé actif</label>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-gold" onClick={save} disabled={!form.nom?.trim()}>💾 Enregistrer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  ONGLET CONGÉS & ABSENCES
// ══════════════════════════════════════════════════════
function CongesTab({sb, conges, setConges, employes, showToast, G2, TODAY}) {
  const {useState} = React;
  const empty = {employe_id:"", type:"paye", date_debut:"", date_fin:"", statut:"approuve", notes:""};
  const [form, setForm] = useState(empty);
  const [modal, setModal] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const filtered = conges.filter(c=>filterType==="all"||c.type===filterType);

  function nuits(debut, fin) {
    if(!debut||!fin) return 0;
    return Math.max(0, (new Date(fin)-new Date(debut))/86400000);
  }

  async function save() {
    try {
      const payload = {
        employe_id: form.employe_id,
        type: form.type,
        date_debut: form.date_debut,
        date_fin: form.date_fin,
        statut: form.statut,
        notes: form.notes||null,
      };
      const {data,error} = await sb.from('conges').insert([payload]).select();
      if(error) throw error;
      setConges(prev=>[data[0],...prev]);
      showToast("Congé enregistré ✓");
      setModal(false);
      setForm(empty);
    } catch(e) { showToast("Erreur","error"); }
  }

  async function updateStatut(id, statut) {
    await sb.from('conges').update({statut}).eq('id',id);
    setConges(prev=>prev.map(c=>c.id===id?{...c,statut}:c));
    showToast("Statut mis à jour ✓");
  }

  async function deleteConge(id) {
    if(!confirm("Supprimer ce congé ?")) return;
    await sb.from('conges').delete().eq('id',id);
    setConges(prev=>prev.filter(c=>c.id!==id));
    showToast("Congé supprimé");
  }

  const typeColors = {paye:["#2d7a4f","#f0faf5"],maladie:["#c95050","#fdf0f0"],absence:["#c9952a","#fff8ee"]};
  const typeLabels = {paye:"Congé payé",maladie:"Congé maladie",absence:"Absence"};

  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
        <div style={{display:"flex", gap:8}}>
          {[["all","Tous"],["paye","Congés payés"],["maladie","Maladie"],["absence","Absences"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterType(v)}
              style={{fontFamily:'"Jost",sans-serif',fontSize:11,padding:"6px 12px",borderRadius:8,cursor:"pointer",
                background:filterType===v?"#c9952a":"#f5f0e8",
                color:filterType===v?"#fff":"#8a7040",
                border:`1px solid ${filterType===v?"#c9952a":"#e8d8b0"}`,fontWeight:600}}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn-gold" onClick={()=>{setForm(empty);setModal(true);}}>+ Nouveau congé</button>
      </div>

      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden"}}>
        {filtered.length===0 && <p style={{padding:30,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Aucun congé enregistré</p>}
        {filtered.map(c=>{
          const emp = employes.find(e=>e.id===c.employe_id);
          const [col,bg] = typeColors[c.type]||["#8a7040","#f5f0e8"];
          const jours = nuits(c.date_debut, c.date_fin)+1;
          const isActif = c.statut==="approuve" && c.date_debut<=TODAY && c.date_fin>=TODAY;
          return (
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #f5efe5",background:isActif?"#fffdf5":"#fff"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                {isActif && <span style={{width:6,height:6,borderRadius:"50%",background:"#c9952a",flexShrink:0,marginTop:1}}></span>}
                <div>
                  <p style={{fontSize:14,fontWeight:500}}>{emp?.nom||"—"}</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>
                    {new Date(c.date_debut+"T12:00:00").toLocaleDateString("fr-FR")} → {new Date(c.date_fin+"T12:00:00").toLocaleDateString("fr-FR")} · {jours} jour{jours>1?"s":""}
                    {c.notes && ` · ${c.notes}`}
                  </p>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:8,background:bg,color:col}}>
                  {typeLabels[c.type]}
                </span>
                <select value={c.statut} onChange={e=>updateStatut(c.id,e.target.value)}
                  style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"2px 6px",border:"1px solid #e8d8b0",borderRadius:6}}>
                  <option value="en_attente">⏳ En attente</option>
                  <option value="approuve">✅ Approuvé</option>
                  <option value="refuse">❌ Refusé</option>
                </select>
                <button onClick={()=>deleteConge(c.id)}
                  style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"2px 8px",background:"#fdf0f0",border:"1px solid #e0a0a0",color:"#c95050",borderRadius:6,cursor:"pointer"}}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:440,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:20,fontWeight:500,marginBottom:20,fontFamily:'"Cormorant Garamond",serif'}}>Nouveau congé / absence</h2>
            <div style={{display:"grid",gap:12}}>
              <div className="form-group">
                <label>Employé *</label>
                <select value={form.employe_id} onChange={e=>setForm(f=>({...f,employe_id:e.target.value}))}>
                  <option value="">— Choisir —</option>
                  {employes.filter(e=>e.actif).map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  <option value="paye">Congé payé</option>
                  <option value="maladie">Congé maladie</option>
                  <option value="absence">Absence</option>
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label>Date début *</label>
                  <input type="date" value={form.date_debut} onChange={e=>setForm(f=>({...f,date_debut:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label>Date fin *</label>
                  <input type="date" value={form.date_fin} min={form.date_debut} onChange={e=>setForm(f=>({...f,date_fin:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={form.statut} onChange={e=>setForm(f=>({...f,statut:e.target.value}))}>
                  <option value="approuve">✅ Approuvé</option>
                  <option value="en_attente">⏳ En attente</option>
                  <option value="refuse">❌ Refusé</option>
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Remarques..."/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
              <button className="btn-ghost" onClick={()=>setModal(false)}>Annuler</button>
              <button className="btn-gold" onClick={save}
                disabled={!form.employe_id||!form.date_debut||!form.date_fin}>
                💾 Enregistrer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  ONGLET SALAIRES
// ══════════════════════════════════════════════════════
function SalairesTab({sb, salaires, setSalaires, employes, showToast, G2, MOIS_COURANT}) {
  const {useState} = React;
  const [filterMois, setFilterMois] = useState(MOIS_COURANT);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const moisDispos = [...new Set(salaires.map(s=>s.mois))].sort().reverse();
  const filtered = salaires.filter(s=>!filterMois||s.mois===filterMois);

  const totalNet = filtered.reduce((a,s)=>a+(s.net_a_payer||0),0);
  const totalPaye = filtered.filter(s=>s.paye).reduce((a,s)=>a+(s.net_a_payer||0),0);

  async function openNew() {
    const emp = employes.filter(e=>e.actif);
    setForm({employe_id:"", mois:MOIS_COURANT, salaire_base:"", primes:0, acomptes:0, deductions:0, paye:false});
    setModal("new");
  }

  function calcNet(f) {
    const base = parseFloat(f.salaire_base)||0;
    const primes = parseFloat(f.primes)||0;
    const acomptes = parseFloat(f.acomptes)||0;
    const deductions = parseFloat(f.deductions)||0;
    return Math.max(0, base + primes - acomptes - deductions);
  }

  async function save() {
    try {
      const net = calcNet(form);
      const payload = {
        employe_id: form.employe_id,
        mois: form.mois,
        salaire_base: parseFloat(form.salaire_base)||0,
        primes: parseFloat(form.primes)||0,
        acomptes: parseFloat(form.acomptes)||0,
        deductions: parseFloat(form.deductions)||0,
        net_a_payer: net,
        paye: form.paye||false,
      };
      if(modal==="new") {
        const {data,error} = await sb.from('salaires').insert([payload]).select();
        if(error) throw error;
        setSalaires(prev=>[data[0],...prev]);
      } else {
        await sb.from('salaires').update(payload).eq('id',form.id);
        setSalaires(prev=>prev.map(s=>s.id===form.id?{...s,...payload}:s));
      }
      showToast("Salaire enregistré ✓");
      setModal(null);
    } catch(e) { showToast("Erreur","error"); }
  }

  async function togglePaye(s) {
    await sb.from('salaires').update({paye:!s.paye}).eq('id',s.id);
    setSalaires(prev=>prev.map(x=>x.id===s.id?{...x,paye:!s.paye}:x));
    showToast(s.paye?"Marqué non payé":"Salaire payé ✓");
  }

  async function genererMois() {
    const existants = salaires.filter(s=>s.mois===filterMois).map(s=>s.employe_id);
    const manquants = employes.filter(e=>e.actif&&!existants.includes(e.id));
    if(manquants.length===0){showToast("Tous les salaires existent déjà");return;}
    const rows = manquants.map(e=>({
      employe_id:e.id, mois:filterMois,
      salaire_base:e.salaire_base||0, primes:0, acomptes:0, deductions:0,
      net_a_payer:e.salaire_base||0, paye:false
    }));
    const {data,error} = await sb.from('salaires').insert(rows).select();
    if(error){showToast("Erreur","error");return;}
    setSalaires(prev=>[...data,...prev]);
    showToast(`${data.length} salaire${data.length>1?"s":""} générés ✓`);
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <select value={filterMois} onChange={e=>setFilterMois(e.target.value)}
            style={{fontFamily:'"Jost",sans-serif',fontSize:13,padding:"7px 12px"}}>
            <option value="">Tous les mois</option>
            {moisDispos.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn-outline" onClick={genererMois} style={{fontSize:11}}>
            ⚡ Générer salaires {filterMois||"mois"}
          </button>
        </div>
        <button className="btn-gold" onClick={openNew}>+ Ajouter un salaire</button>
      </div>

      {/* Résumé */}
      {filtered.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          {[
            ["💰 Total à payer", totalNet.toFixed(3)+" TND","#2a1e08","#fef9f0"],
            ["✅ Payé", totalPaye.toFixed(3)+" TND","#2d7a4f","#f0faf5"],
            ["⏳ Restant", (totalNet-totalPaye).toFixed(3)+" TND","#c95050","#fdf0f0"],
          ].map(([l,v,c,bg])=>(
            <div key={l} style={{background:bg,border:`1px solid ${c}22`,borderRadius:8,padding:"10px 14px"}}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:G2,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{l}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:700,color:c}}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Liste */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 80px 80px 80px 100px 80px",gap:8,padding:"10px 16px",background:"#fef9f0",borderBottom:"1px solid #f0e8d8"}}>
          {["Employé","Base","Primes","Acomptes","Déduct.","Net","Statut",""].map(h=>(
            <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
          ))}
        </div>
        {filtered.length===0 && (
          <p style={{padding:30,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>
            Aucun salaire — cliquez "Générer" pour créer automatiquement
          </p>
        )}
        {filtered.map(s=>{
          const emp = employes.find(e=>e.id===s.employe_id);
          return (
            <div key={s.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 80px 80px 80px 100px 80px",gap:8,padding:"11px 16px",borderBottom:"1px solid #f5efe5",alignItems:"center"}}>
              <div>
                <p style={{fontSize:13,fontWeight:500}}>{emp?.nom||"—"}</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{emp?.poste||""}</p>
              </div>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530"}}>{(s.salaire_base||0).toFixed(3)}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2d7a4f"}}>+{(s.primes||0).toFixed(3)}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#c95050"}}>-{(s.acomptes||0).toFixed(3)}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#c95050"}}>-{(s.deductions||0).toFixed(3)}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:G2}}>{(s.net_a_payer||0).toFixed(3)}</p>
              <button onClick={()=>togglePaye(s)}
                style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"3px 8px",borderRadius:8,cursor:"pointer",fontWeight:700,
                  background:s.paye?"#f0faf5":"#fdf0f0",
                  border:`1px solid ${s.paye?"#a0d8b8":"#e0a0a0"}`,
                  color:s.paye?"#2d7a4f":"#c95050"}}>
                {s.paye?"✅ Payé":"⏳ Impayé"}
              </button>
              <button onClick={()=>{setForm(s);setModal("edit");}}
                style={{fontFamily:'"Jost",sans-serif',fontSize:10,padding:"3px 8px",background:"#f5f0e8",border:"1px solid #e0d0b0",borderRadius:4,cursor:"pointer"}}>✏️ Modifier</button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(42,30,8,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}} onClick={()=>setModal(null)}>
          <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:460,width:"100%",boxShadow:"0 8px 40px rgba(42,30,8,0.18)"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:20,fontWeight:500,marginBottom:20,fontFamily:'"Cormorant Garamond",serif'}}>{modal==="new"?"Nouveau salaire":"Modifier le salaire"}</h2>
            <div style={{display:"grid",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="form-group">
                  <label>Employé *</label>
                  <select value={form.employe_id} onChange={e=>setForm(f=>({...f,employe_id:e.target.value}))}>
                    <option value="">— Choisir —</option>
                    {employes.filter(e=>e.actif).map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Mois *</label>
                  <input type="month" value={form.mois} onChange={e=>setForm(f=>({...f,mois:e.target.value}))}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["Salaire de base","salaire_base"],["Primes","primes"],["Acomptes","acomptes"],["Déductions","deductions"]].map(([l,k])=>(
                  <div key={k} className="form-group">
                    <label>{l}</label>
                    <input type="number" min="0" step="0.001" value={form[k]||0} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <div style={{background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"10px 14px"}}>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>Net à payer</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:20,fontWeight:700,color:G2}}>{calcNet(form).toFixed(3)} TND</p>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-gold" onClick={save} disabled={!form.employe_id||!form.mois}>💾 Enregistrer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
