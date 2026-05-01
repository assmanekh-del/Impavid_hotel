function FichierClientsView({sb, showToast}) {
  const {useState, useEffect} = React;
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [factures, setFactures] = useState([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [filterStatut, setFilterStatut] = useState("all"); // all | impaye | paye
  const G2 = "#8B6434";

  useEffect(()=>{ loadClients(); },[]);

  async function loadClients(){
    setLoading(true);
    try{
      // 1. Charger toutes les factures libres et groupes
      const {data:facts} = await sb.from('factures')
        .select('*')
        .in('type',['libre','groupe'])
        .order('created_at',{ascending:false});

      // 2. Charger tous les groupes
      const {data:groupes} = await sb.from('groupes')
        .select('*')
        .order('created_at',{ascending:false});

      // Regrouper par nom de société
      const map = {};

      // Depuis factures libres
      (facts||[]).forEach(f=>{
        if(!f.client) return;
        const key = f.client.trim().toLowerCase();
        if(!map[key]) map[key] = {
          nom: f.client,
          mf: f.mf||null,
          phone: f.phone||null,
          email: f.email||null,
          factures: [],
          groupes: [],
        };
        map[key].factures.push(f);
        if(f.mf&&!map[key].mf) map[key].mf = f.mf;
        if(f.phone&&!map[key].phone) map[key].phone = f.phone;
        if(f.email&&!map[key].email) map[key].email = f.email;
      });

      // Depuis groupes
      (groupes||[]).forEach(g=>{
        const key = g.nom_societe.trim().toLowerCase();
        if(!map[key]) map[key] = {
          nom: g.nom_societe,
          mf: g.mf||null,
          phone: null,
          email: null,
          factures: [],
          groupes: [],
        };
        map[key].groupes.push(g);
        if(g.mf&&!map[key].mf) map[key].mf = g.mf;
      });

      // Calculer totaux
      const list = Object.values(map).map(c=>{
        const totalDu = c.factures.filter(f=>!f.paid).reduce((a,f)=>a+(f.montant_ttc||0),0);
        const totalPaye = c.factures.filter(f=>f.paid).reduce((a,f)=>a+(f.montant_ttc||0),0);
        const derniereFact = c.factures[0]?.created_at||null;
        return {...c, totalDu, totalPaye, derniereFact};
      });

      // Trier par montant dû décroissant
      list.sort((a,b)=>b.totalDu-a.totalDu);
      setClients(list);
    }catch(e){ showToast("Erreur chargement","error"); }
    setLoading(false);
  }

  async function loadFacturesClient(nom){
    const {data} = await sb.from('factures')
      .select('*')
      .eq('client', nom)
      .order('created_at',{ascending:false});
    setFactures(data||[]);
  }

  async function marquerPaye(factId){
    await sb.from('factures').update({paid:true}).eq('id',factId);
    setFactures(prev=>prev.map(f=>f.id===factId?{...f,paid:true}:f));
    loadClients();
    showToast("Facture marquée payée ✓");
  }

  const filtered = clients.filter(c=>{
    const ms = c.nom.toLowerCase().includes(search.toLowerCase())||
      (c.mf||"").toLowerCase().includes(search.toLowerCase());
    if(filterStatut==="impaye") return ms && c.totalDu>0;
    if(filterStatut==="paye") return ms && c.totalDu===0;
    return ms;
  });

  return(
    <div style={{padding:"24px 32px",maxWidth:1100,margin:"0 auto"}}>

      {/* EN-TÊTE */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <p className="section-title">📋 Fichier Clients Sociétés</p>
          <p className="section-sub">{clients.length} société{clients.length>1?"s":""} — {clients.filter(c=>c.totalDu>0).length} avec impayés</p>
        </div>
        <button className="btn-ghost" onClick={loadClients} style={{fontSize:11}}>🔄 Actualiser</button>
      </div>

      {/* FILTRES */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr auto auto",gap:12,alignItems:"center",marginBottom:16,boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher par nom ou MF..." style={{fontSize:13,padding:"8px 12px"}}/>
        {[
          {v:"all",l:"Tous"},
          {v:"impaye",l:"⏳ Impayés"},
          {v:"paye",l:"✅ Soldés"},
        ].map(({v,l})=>(
          <button key={v} onClick={()=>setFilterStatut(v)}
            style={{fontFamily:'"Jost",sans-serif',fontSize:11,padding:"7px 16px",borderRadius:8,cursor:"pointer",
              background:filterStatut===v?"#c9952a":"#f5f0e8",
              color:filterStatut===v?"#fff":"#8a7040",
              border:"1px solid "+(filterStatut===v?"#c9952a":"#e8d8b0"),fontWeight:600}}>
            {l}
          </button>
        ))}
      </div>

      {/* LISTE */}
      <div style={{display:"grid",gridTemplateColumns:selected?"1fr 1fr":"1fr",gap:16}}>

        {/* Colonne liste */}
        <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid #f0e8d8",background:"#fef9f0",display:"grid",gridTemplateColumns:"1fr 100px 100px 80px",gap:8}}>
            {["Société","CA Total","Impayé","Statut"].map(h=>(
              <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:2,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
            ))}
          </div>
          {loading&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Chargement...</p>}
          {!loading&&filtered.length===0&&<p style={{padding:40,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:13}}>Aucun client trouvé</p>}
          {filtered.map((c,i)=>(
            <div key={i} onClick={()=>{setSelected(c);loadFacturesClient(c.nom);setNote("");}}
              style={{display:"grid",gridTemplateColumns:"1fr 100px 100px 80px",gap:8,padding:"12px 16px",borderBottom:"1px solid #f5efe5",alignItems:"center",cursor:"pointer",background:selected?.nom===c.nom?"#fef9f0":"#fff",transition:"background .15s"}}>
              <div>
                <p style={{fontSize:14,fontWeight:600,color:"#2a1e08"}}>{c.nom}</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>
                  {[c.mf&&`MF: ${c.mf}`, c.phone, c.email].filter(Boolean).join(" · ")||"Pas de coordonnées"}
                </p>
              </div>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:600,color:"#6a5530"}}>{(c.totalPaye+c.totalDu).toFixed(3)}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:c.totalDu>0?"#c95050":"#2d7a4f"}}>{c.totalDu>0?c.totalDu.toFixed(3):"—"}</p>
              <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,
                background:c.totalDu>0?"#fef0f0":"#e8f8f0",
                color:c.totalDu>0?"#c95050":"#2d7a4f"}}>
                {c.totalDu>0?"⏳ Dû":"✅ Soldé"}
              </span>
            </div>
          ))}
        </div>

        {/* Colonne détail */}
        {selected&&(
          <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
            {/* Header */}
            <div style={{padding:"16px 20px",borderBottom:"1px solid #f0e8d8",background:"#fef9f0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <p style={{fontSize:17,fontWeight:600,color:"#2a1e08",marginBottom:2}}>{selected.nom}</p>
                {selected.mf&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>MF : {selected.mf}</p>}
              </div>
              <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#8a7040"}}>✕</button>
            </div>

            {/* Coordonnées */}
            <div style={{padding:"12px 20px",borderBottom:"1px solid #f0e8d8",display:"flex",gap:16}}>
              {selected.phone&&(
                <a href={`tel:${selected.phone}`} style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#1a5a8a",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                  📞 {selected.phone}
                </a>
              )}
              {selected.email&&(
                <a href={`mailto:${selected.email}`} style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#1a5a8a",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                  ✉️ {selected.email}
                </a>
              )}
              {!selected.phone&&!selected.email&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#b0a070"}}>Pas de coordonnées enregistrées</p>}
            </div>

            {/* Résumé financier */}
            <div style={{padding:"12px 20px",borderBottom:"1px solid #f0e8d8",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                ["💰 CA Total",(selected.totalPaye+selected.totalDu).toFixed(3)+" TND","#2a1e08"],
                ["✅ Encaissé",selected.totalPaye.toFixed(3)+" TND","#2d7a4f"],
                ["⏳ Impayé",selected.totalDu.toFixed(3)+" TND",selected.totalDu>0?"#c95050":"#2d7a4f"],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:"#faf8f5",borderRadius:8,padding:"8px 12px",border:"1px solid #e8d8b0"}}>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{l}</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:c}}>{v}</p>
                </div>
              ))}
            </div>

            {/* Factures */}
            <div style={{maxHeight:280,overflowY:"auto"}}>
              {factures.map(f=>(
                <div key={f.id} style={{padding:"10px 20px",borderBottom:"1px solid #f5efe5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#2a1e08"}}>{f.numero}</p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>{new Date(f.created_at).toLocaleDateString("fr-FR")} · {({especes:"💵",carte:"💳",cheque:"📝",virement:"🏦"})[f.mode_paiement||"especes"]||"💵"}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:f.paid?"#2d7a4f":"#c95050"}}>{(f.montant_ttc||0).toFixed(3)} TND</p>
                    {!f.paid&&(
                      <button onClick={()=>marquerPaye(f.id)}
                        style={{fontFamily:'"Jost",sans-serif',fontSize:10,background:"#f0faf5",border:"1px solid #a0d8b8",color:"#2d7a4f",borderRadius:6,padding:"2px 8px",cursor:"pointer",marginTop:2}}>
                        ✓ Marquer payé
                      </button>
                    )}
                    {f.paid&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#2d7a4f"}}>✅ Payé</p>}
                  </div>
                </div>
              ))}
              {factures.length===0&&<p style={{padding:20,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:12}}>Aucune facture</p>}
            </div>

            {/* Note de suivi */}
            <div style={{padding:"12px 20px",borderTop:"1px solid #f0e8d8",background:"#faf8f5"}}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>📝 Note de suivi</p>
              <div style={{display:"flex",gap:8}}>
                <input value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="ex: Appelé le 28/04, promet de payer vendredi..."
                  style={{flex:1,fontSize:12,padding:"7px 10px"}}
                  onKeyDown={async e=>{
                    if(e.key==="Enter"&&note.trim()){
                      setSavingNote(true);
                      await sb.from('logs').insert([{
                        user_email:"fichier-clients",
                        action:"📝 Note client",
                        details:{client:selected.nom,note:note.trim()}
                      }]);
                      setNote("");
                      setSavingNote(false);
                      showToast("Note enregistrée ✓");
                    }
                  }}
                />
                <button className="btn-gold" disabled={!note.trim()||savingNote}
                  onClick={async()=>{
                    if(!note.trim()) return;
                    setSavingNote(true);
                    await sb.from('logs').insert([{
                      user_email:"fichier-clients",
                      action:"📝 Note client",
                      details:{client:selected.nom,note:note.trim()}
                    }]);
                    setNote("");
                    setSavingNote(false);
                    showToast("Note enregistrée ✓");
                  }}
                  style={{fontSize:11,padding:"7px 14px"}}>
                  {savingNote?"...":"💾"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
