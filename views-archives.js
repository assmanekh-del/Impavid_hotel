function ArchivesView({sb,openDetail,ROOMS,LOGO,G2,doPrint,setModal}){
  const [factures,setFactures]=React.useState([]);
  const [loading,setLoading]=React.useState(true);
  const [search,setSearch]=React.useState("");
  const [filterType,setFilterType]=React.useState("all");
  const [filterMois,setFilterMois]=React.useState("");
  const [filterAnnee,setFilterAnnee]=React.useState("");
  const [filterMode,setFilterMode]=React.useState("all");
  const [modalFact,setModalFact]=React.useState(null);
  const [showSuivi,setShowSuivi]=React.useState(false);
  const [suiviDu,setSuiviDu]=React.useState("");
  const [suiviAu,setSuiviAu]=React.useState("");

  const MOIS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const anneeActuelle=new Date().getFullYear();
  const annees=Array.from({length:5},(_,i)=>String(anneeActuelle-i));

  React.useEffect(()=>{
    loadFactures();
  },[]);

  async function loadFactures(){
    setLoading(true);
    try{
      const {data,error}=await sb.from('factures').select('*').order('created_at',{ascending:false});
      if(!error) setFactures(data||[]);
    }catch(e){console.error(e);}
    setLoading(false);
  }

  const liste=factures.filter(f=>{
    const term=search.toLowerCase().trim();
    const matchSearch=!term||(f.client||"").toLowerCase().includes(term)||(f.numero||"").toLowerCase().includes(term)||(f.mf||"").toLowerCase().includes(term)||(f.phone||"").toLowerCase().includes(term);
    const matchType=filterType==="all"||f.type===filterType;
    const d=new Date(f.created_at);
    const matchMois=!filterMois||String(d.getMonth()+1).padStart(2,'0')===filterMois;
    const matchAnnee=!filterAnnee||String(d.getFullYear())===filterAnnee;
    const matchMode=filterMode==="all"||( f.mode_paiement||"especes")===filterMode;
    return matchSearch&&matchType&&matchMois&&matchAnnee&&matchMode;
  });

  const totalTTC=liste.reduce((a,f)=>a+(f.montant_ttc||0),0);

  return(
    <div>
      {/* Titre */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <p className="section-title">Archives Factures</p>
          <p className="section-sub">{liste.length} document{liste.length>1?"s":""}</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-outline" style={{background:"#f0f4ff",borderColor:"#c0cfee",color:"#3a5fc8"}} onClick={()=>setShowSuivi(true)}>📊 Suivi des factures</button>
          <button className="btn-outline" onClick={loadFactures}>🔄 Actualiser</button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 140px 140px 160px",gap:12,marginBottom:20,boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>🔍 Rechercher</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="N° facture, client, MF, téléphone…" style={{width:"100%"}}/>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Mois</label>
          <select value={filterMois} onChange={e=>setFilterMois(e.target.value)}>
            <option value="">Tous</option>
            {MOIS.map((m,i)=>(
              <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Année</label>
          <select value={filterAnnee} onChange={e=>setFilterAnnee(e.target.value)}>
            <option value="">Toutes</option>
            {annees.map(a=>(
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Type</label>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)}>
            <option value="all">Tous</option>
            <option value="libre">Facture libre</option>
            <option value="reservation">Facture réservation</option>
            <option value="devis">Devis</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>💳 Mode paiement</label>
          <select value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
            <option value="all">Tous</option>
            <option value="especes">💵 Espèces</option>
            <option value="carte">💳 Carte</option>
            <option value="cheque">📝 Chèque</option>
            <option value="virement">🏦 Virement</option>
          </select>
        </div>
      </div>

      {/* Résumé */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Documents",val:liste.length,color:"#c9952a",bg:"#fef9f0",border:"#e8d8b0"},
          {label:"Total TTC",val:totalTTC.toFixed(3)+" TND",color:"#2a8a5a",bg:"#f0faf4",border:"#a0d8b8"},
          {label:"Factures libres",val:liste.filter(f=>f.type==="libre").length,color:"#5a7fc8",bg:"#f0f4ff",border:"#c0cfee"},
        ].map(({label,val,color,bg,border})=>(
          <div key={label} style={{background:bg,border:"1.5px solid "+border,borderRadius:10,padding:"14px 18px"}}>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{label}</p>
            <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:22,fontWeight:700,color:"#2a1e08"}}>{val}</p>
          </div>
        ))}
      </div>

      {/* Tableau */}
      {loading?(
        <p style={{textAlign:"center",padding:40,fontFamily:'"Jost",sans-serif',color:"#8a7040"}}>Chargement…</p>
      ):(
        <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
          <div style={{padding:"11px 18px",borderBottom:"1px solid #f0e8d8",display:"grid",gridTemplateColumns:"120px 110px 1fr 120px 100px 130px 160px",gap:8,background:"#fef9f0"}}>
            {["N° Facture","Date","Client","Type","Paiement","Montant TTC","Actions"].map(h=>(
              <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
            ))}
          </div>
          {liste.length===0&&<p style={{padding:40,color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:14,textAlign:"center"}}>Aucune facture archivée</p>}
          {liste.map(f=>(
            <div key={f.id} style={{display:"grid",gridTemplateColumns:"120px 110px 1fr 120px 100px 130px 160px",gap:8,padding:"12px 18px",borderBottom:"1px solid #f5f0e8",alignItems:"center"}}>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:800,color:"#c9952a"}}>{f.numero}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{new Date(f.created_at).toLocaleDateString("fr-FR")}</p>
              <div>
                <p style={{fontSize:14,fontWeight:500,color:"#2a1e08"}}>{f.client||"—"}</p>
                {f.mf&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>MF : {f.mf}</p>}
                {f.phone&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{f.phone}</p>}
              </div>
              <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:10,background:f.type==="libre"?"#fef3d0":f.type==="devis"?"#f0f4ff":"#f0faf4",color:f.type==="libre"?"#b07d1a":f.type==="devis"?"#5a7fc8":"#2a8a5a",display:"inline-block"}}>
                {f.type==="libre"?"Facture libre":f.type==="devis"?"Devis":"Réservation"}
              </span>
              <div style={{textAlign:"center"}}>
                <select
                  value={f.mode_paiement||"especes"}
                  onChange={async e=>{
                    const mode=e.target.value;
                    try{
                      await sb.from('factures').update({mode_paiement:mode}).eq('id',f.id);
                      setFactures(prev=>prev.map(x=>x.id===f.id?{...x,mode_paiement:mode}:x));
                    }catch(err){alert('Erreur');}
                  }}
                  style={{fontSize:11,padding:"4px 6px",border:"1.5px solid #e8d8b0",borderRadius:6,background:"#fef9f0",cursor:"pointer",color:"#6a5530",fontFamily:'"Jost",sans-serif'}}>
                  <option value="especes">💵 Espèces</option>
                  <option value="carte">💳 Carte</option>
                  <option value="cheque">📝 Chèque</option>
                  <option value="virement">🏦 Virement</option>
                </select>
              </div>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:700,color:"#2a1e08",textAlign:"right"}}>{(f.montant_ttc||0).toFixed(3)}<span style={{fontSize:9,color:"#8a7040",marginLeft:2}}>TND</span></p>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button style={{flex:1,fontSize:11,padding:"6px 8px",background:"#fef9f0",border:"1.5px solid #d4c5a0",color:"#6a5530",borderRadius:6,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontWeight:600,letterSpacing:.5}} onClick={()=>setModalFact(f)}>
                  🖨 Imprimer
                </button>
                <button title="Annuler cette facture" style={{padding:"6px 9px",background:"#fdf0f0",border:"1.5px solid #e0a0a0",color:"#9a2020",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700,lineHeight:1}} onClick={async()=>{
                  if(!confirm('Supprimer la facture '+f.numero+' des archives ?\n\nCette action est irréversible.')) return;
                  try{
                    await sb.from('factures').delete().eq('id',f.id);
                    const _isD=(f.numero||'').startsWith('DEV-');
                    if(_isD){const _rd=await sb.from('factures').select('*',{count:'exact',head:true}).like('numero','DEV-%');await sb.from('counters').update({val:_rd.count||0}).eq('id','devis');}
                    else{const _rf=await sb.from('factures').select('*',{count:'exact',head:true}).not('numero','ilike','DEV-%');await sb.from('counters').update({val:_rf.count||0}).eq('id','invoice');}
                    setFactures(prev=>prev.filter(x=>x.id!==f.id));
                    if(modalFact?.id===f.id) setModalFact(null);
                  }catch(e){console.error(e);alert('Erreur suppression');}
                }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Suivi Factures */}
      {showSuivi&&(()=>{
        const du=suiviDu;
        const au=suiviAu;
        const listeSuivi=factures.filter(f=>{
          const d=f.created_at?f.created_at.split("T")[0]:"";
          const matchDu=!du||d>=du;
          const matchAu=!au||d<=au;
          return matchDu&&matchAu&&f.type!=="devis";
        }).sort((a,b)=>a.created_at.localeCompare(b.created_at));
        const totalHT=Math.round(listeSuivi.reduce((a,f)=>a+(f.montant_ht||0),0)*1000)/1000;
        const totalTVA=Math.round(listeSuivi.reduce((a,f)=>a+(f.tva||0),0)*1000)/1000;
        const totalTTC=Math.round(listeSuivi.reduce((a,f)=>a+(f.montant_ttc||0),0)*1000)/1000;

        function printSuivi(){
          const G2b="#8B6434";
          // Construire HTML du rapport
          const rows=listeSuivi.map((f,i)=>`
            <tr style="border-bottom:1px solid #f0ebe3;background:${i%2===0?"#fff":"#faf8f5"}">
              <td style="padding:6px 8px;font-size:10px;color:#8a7040">${new Date(f.created_at).toLocaleDateString("fr-FR")}</td>
              <td style="padding:6px 8px;font-size:10px;font-weight:700;color:#c9952a">${f.numero}</td>
              <td style="padding:6px 8px;font-size:10px;color:#2c2416">${f.client||"—"}</td>
              <td style="padding:6px 8px;font-size:10px;text-align:right">${(f.montant_ht||0).toFixed(3)}</td>
              <td style="padding:6px 8px;font-size:10px;text-align:right">${(f.tva||0).toFixed(3)}</td>
              <td style="padding:6px 8px;font-size:10px;text-align:right;font-weight:700">${(f.montant_ttc||0).toFixed(3)}</td>
              <td style="padding:6px 8px;font-size:10px;text-align:center">${f.echeance?new Date(f.echeance).toLocaleDateString("fr-FR"):"—"}</td>
              <td style="padding:6px 8px;font-size:10px;text-align:center">
                <span style="background:${f.paid?"#d4f0e0":"#fad4d4"};color:${f.paid?"#2d7a4f":"#9a2020"};padding:2px 6px;border-radius:8px;font-size:9px;font-weight:700">
                  ${f.paid?"✓ Payé":"À encaisser"}
                </span>
              </td>
              <td style="padding:6px 8px;font-size:10px;text-align:center">
                ${{especes:"💵 Espèces",carte:"💳 Carte",cheque:"📝 Chèque",virement:"🏦 Virement"}[f.mode_paiement||"especes"]||"💵 Espèces"}
              </td>
            </tr>
          `).join("");
          const html=`
            <html><head><meta charset="UTF-8"/>
            <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Inter",Arial,sans-serif;font-size:10pt;color:#000;padding:14mm 16mm}@page{size:A4 portrait;margin:0}@media print{body{padding:14mm 16mm}}</style>
            </head><body>
            <div style="border-bottom:2px solid ${G2b};padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <p style="font-size:11px;font-weight:700;color:#2c2416">Société Hedi pour les services touristiques — SHST</p>
                <p style="font-size:16px;font-weight:800;color:${G2b};letter-spacing:1px">IMPAVID HOTEL</p>
                <p style="font-size:9px;color:#6a5a45">Rue Jamel Abdelnasser, Gabès 6000 · MF : 1661336G · Tél/Fax : 75 220 856</p>
              </div>
              <div style="text-align:right">
                <p style="font-size:14px;font-weight:800;color:#2c2416">SUIVI DES FACTURES</p>
                <p style="font-size:10px;color:#8a7a65;margin-top:4px">Période : ${du?new Date(du).toLocaleDateString("fr-FR"):"début"} → ${au?new Date(au).toLocaleDateString("fr-FR"):"fin"}</p>
                <p style="font-size:10px;color:#8a7a65">Édité le ${new Date().toLocaleDateString("fr-FR")}</p>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:16px">
              <thead>
                <tr style="background:#2c2416;color:#f5d984">
                  ${["Date","N° Facture","Client","HT (TND)","TVA (TND)","TTC (TND)","Échéance","Statut","Paiement"].map(h=>`<th style="padding:8px;text-align:${["HT (TND)","TVA (TND)","TTC (TND)"].includes(h)?"right":"left"};font-size:9px;letter-spacing:0.5px">${h}</th>`).join("")}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="background:#${G2b.replace("#","")};color:#fff;font-weight:700">
                  <td colspan="3" style="padding:8px;font-size:11px">TOTAL — ${listeSuivi.length} facture${listeSuivi.length>1?"s":""}</td>
                  <td style="padding:8px;text-align:right;font-size:11px">${totalHT.toFixed(3)}</td>
                  <td style="padding:8px;text-align:right;font-size:11px">${totalTVA.toFixed(3)}</td>
                  <td style="padding:8px;text-align:right;font-size:13px">${totalTTC.toFixed(3)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
            <p style="font-size:8px;color:#a09080;border-top:1px solid #e0d8cc;padding-top:8px">Document généré automatiquement — IMPAVID HOTEL · impavidhotel@gmail.com</p>
            </body></html>
          `;
          const w=window.open("","_blank","width=900,height=700");
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(()=>w.print(),500);
        }

        return(
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowSuivi(false)}>
            <div className="modal" style={{maxWidth:700,fontFamily:'"Inter",sans-serif'}}>
              {/* Titre */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:14,borderBottom:"1px solid #f0e8d8"}}>
                <div>
                  <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:20,fontWeight:700,color:"#3a5fc8"}}>📊 Suivi des Factures</p>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",marginTop:2}}>{listeSuivi.length} facture{listeSuivi.length>1?"s":""} · Total TTC : {totalTTC.toFixed(3)} TND</p>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn-ghost" onClick={()=>setShowSuivi(false)}>Fermer</button>
                  <button className="btn-gold" onClick={printSuivi} disabled={listeSuivi.length===0}>🖨 Imprimer</button>
                </div>
              </div>
              {/* Sélection dates */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                <div className="form-group">
                  <label>Du</label>
                  <input type="date" value={suiviDu} onChange={e=>setSuiviDu(e.target.value)}/>
                </div>
                <div className="form-group">
                  <label>Au</label>
                  <input type="date" value={suiviAu} onChange={e=>setSuiviAu(e.target.value)}/>
                </div>
              </div>
              {/* Résumé */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
                {[["Total HT",totalHT.toFixed(3),"#5a7fc8","#f0f4ff"],["TVA (7%)",totalTVA.toFixed(3),"#8a7040","#faf8f5"],["Total TTC",totalTTC.toFixed(3),"#2a8a5a","#f0faf4"]].map(([l,v,c,bg])=>(
                  <div key={l} style={{background:bg,borderRadius:8,padding:"10px 14px",border:"1px solid #e0d8cc"}}>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{l}</p>
                    <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:18,fontWeight:700,color:"#2a1e08"}}>{v} <span style={{fontSize:11,color:"#8a7040"}}>TND</span></p>
                  </div>
                ))}
              </div>
              {/* Tableau */}
              <div style={{maxHeight:320,overflowY:"auto",border:"1px solid #e8d8b0",borderRadius:8}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0}}>
                    <tr style={{background:"#2c2416"}}>
                      {["Date","N° Facture","Client","HT","TVA","TTC","Échéance","Statut","Paiement"].map((h,i)=>(
                        <th key={h} style={{padding:"8px 8px",textAlign:i>=3&&i<=5?"right":"left",fontSize:9,fontWeight:700,color:"#f5d984",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listeSuivi.length===0?(
                      <tr><td colSpan={8} style={{padding:20,textAlign:"center",color:"#b0a070",fontFamily:'"Jost",sans-serif'}}>Aucune facture sur cette période</td></tr>
                    ):listeSuivi.map((f,i)=>(
                      <tr key={f.id} style={{borderBottom:"1px solid #f0ebe3",background:i%2===0?"#fff":"#faf8f5"}}>
                        <td style={{padding:"7px 8px",color:"#8a7040",fontSize:10}}>{new Date(f.created_at).toLocaleDateString("fr-FR")}</td>
                        <td style={{padding:"7px 8px",fontWeight:700,color:"#c9952a",fontSize:10}}>{f.numero}</td>
                        <td style={{padding:"7px 8px",color:"#2c2416"}}>{f.client||"—"}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",color:"#6a5a45"}}>{(f.montant_ht||0).toFixed(3)}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",color:"#6a5a45"}}>{(f.tva||0).toFixed(3)}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontWeight:700,color:"#2c2416"}}>{(f.montant_ttc||0).toFixed(3)}</td>
                        <td style={{padding:"7px 8px",textAlign:"center",fontSize:10,color:"#8a7040"}}>{f.echeance?new Date(f.echeance+"T12:00:00").toLocaleDateString("fr-FR"):"—"}</td>
                        <td style={{padding:"7px 8px",textAlign:"center"}}>
                          <span style={{fontSize:9,background:f.paid?"#d4f0e0":"#fad4d4",color:f.paid?"#2d7a4f":"#9a2020",padding:"2px 7px",borderRadius:8,fontWeight:700}}>
                            {f.paid?"✓ Payé":"À encaisser"}
                          </span>
                        </td>
                        <td style={{padding:"7px 8px",textAlign:"center"}}>
                          <select value={f.mode_paiement||"especes"} onChange={async e=>{
                            const mode=e.target.value;
                            await sb.from('factures').update({mode_paiement:mode}).eq('id',f.id);
                            setFactures(prev=>prev.map(x=>x.id===f.id?{...x,mode_paiement:mode}:x));
                          }} style={{fontSize:10,padding:"2px 4px",border:"1px solid #e8d8b0",borderRadius:4,background:"#fef9f0",cursor:"pointer"}}>
                            <option value="especes">💵</option>
                            <option value="carte">💳</option>
                            <option value="cheque">📝</option>
                            <option value="virement">🏦</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {listeSuivi.length>0&&(
                    <tfoot>
                      <tr style={{background:"#8B6434"}}>
                        <td colSpan={3} style={{padding:"8px",fontWeight:700,color:"#fff",fontSize:11}}>TOTAL — {listeSuivi.length} facture{listeSuivi.length>1?"s":""}</td>
                        <td style={{padding:"8px",textAlign:"right",fontWeight:700,color:"#fff"}}>{totalHT.toFixed(3)}</td>
                        <td style={{padding:"8px",textAlign:"right",fontWeight:700,color:"#fff"}}>{totalTVA.toFixed(3)}</td>
                        <td style={{padding:"8px",textAlign:"right",fontWeight:800,fontSize:13,color:"#fff"}}>{totalTTC.toFixed(3)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        );
      })()}
      {modalFact&&(()=>{
        const G2b="#8B6434";

        function ArchiveModal({fact}){
          const [editMode,setEditMode]=React.useState(false);
          const [showCachetPrint,setShowCachetPrint]=React.useState(true);
          const [ed,setEd]=React.useState({
            client:fact.client||"",
            phone:fact.phone||"",
            email:fact.email||"",
            mf:fact.mf||"",
            cin:fact.cin||"",
            notes:fact.notes||"",
            remise:fact.remise||0,
            echeance:fact.echeance||"",
            paid:fact.paid||false,
            lignes:(fact.lignes||[]).map(l=>({...l})),
          });

          const lines=ed.lignes.map(l=>{
            const ttc=parseFloat(l.prixTTC)||0;
            const ht=Math.round((ttc/1.07)*1000)/1000;
            const qty=parseFloat(l.qty)||1;
            return{...l,prixHT:ht,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};
          });
          const grandTTC=Math.round(lines.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
          const grandHT=Math.round(lines.reduce((a,l)=>a+l.totalHT,0)*100)/100;
          const remiseMont=Math.round(grandTTC*((parseFloat(ed.remise)||0)/100)*100)/100;
          const netBase=Math.round((grandTTC-remiseMont)*100)/100;
          const netAPayer=fact.type!=="devis"?Math.round((netBase+1)*100)/100:netBase;
          const tvaAmt=Math.round((grandTTC-grandHT)*100)/100;

          async function saveEdit(){
            const payload={
              client:ed.client||null,
              phone:ed.phone||null,
              email:ed.email||null,
              mf:ed.mf||null,
              cin:ed.cin||null,
              notes:ed.notes||null,
              remise:parseFloat(ed.remise)||0,
              echeance:ed.echeance||null,
              paid:ed.paid||false,
              lignes:ed.lignes,
              montant_ht:grandHT,
              tva:tvaAmt,
              montant_ttc:netAPayer,
            };
            try{
              const{error}=await sb.from('factures').update(payload).eq('id',fact.id);
              if(error) throw error;
              setFactures(prev=>prev.map(x=>x.id===fact.id?{...x,...payload}:x));
              setModalFact({...fact,...payload});
              setEditMode(false);
            }catch(e){alert('Erreur sauvegarde : '+e.message);}
          }

          return(
            <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModalFact(null)}>
              <div className="modal" style={{maxWidth:680,fontFamily:'"Inter",sans-serif'}}>

                {/* Barre titre */}
                <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:12,borderBottom:"1px solid #f0e8d8"}}>
                  <div>
                    <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:18,fontWeight:700,color:G2b}}>
                      {editMode?"✏️ Modifier — ":"📄 "}{fact.numero}
                    </p>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040"}}>{fact.client} · {new Date(fact.created_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button className="btn-ghost" onClick={()=>setModalFact(null)}>Fermer</button>
                    {!editMode&&<button style={{fontSize:11,padding:"7px 12px",background:"#f0f4ff",border:"1.5px solid #c0cfee",color:"#3a5fc8",borderRadius:6,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontWeight:600}} onClick={()=>setEditMode(true)}>✏️ Modifier</button>}
                    {editMode&&<button style={{fontSize:11,padding:"7px 12px",background:"#f0faf4",border:"1.5px solid #a0d8b8",color:"#2a8a5a",borderRadius:6,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontWeight:600}} onClick={saveEdit}>💾 Enregistrer</button>}
                    {editMode&&<button className="btn-ghost" onClick={()=>{setEditMode(false);setEd({client:fact.client||"",phone:fact.phone||"",email:fact.email||"",mf:fact.mf||"",cin:fact.cin||"",notes:fact.notes||"",remise:fact.remise||0,echeance:fact.echeance||"",paid:fact.paid||false,lignes:(fact.lignes||[]).map(l=>({...l}))});}}>Annuler</button>}
                    {!editMode&&<button style={{fontSize:11,padding:"7px 12px",background:"#fdf0f0",border:"1.5px solid #e0a0a0",color:"#9a2020",borderRadius:6,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontWeight:600}} onClick={async()=>{
                      if(!confirm('Supprimer '+fact.numero+' ?\n\nIrréversible.')) return;
                      try{
                        await sb.from('factures').delete().eq('id',fact.id);
                        const _isD=(fact.numero||'').startsWith('DEV-');
                        if(_isD){const _r=await sb.from('factures').select('*',{count:'exact',head:true}).like('numero','DEV-%');await sb.from('counters').update({val:_r.count||0}).eq('id','devis');}
                        else{const _r=await sb.from('factures').select('*',{count:'exact',head:true}).not('numero','ilike','DEV-%');await sb.from('counters').update({val:_r.count||0}).eq('id','invoice');}
                        setFactures(prev=>prev.filter(x=>x.id!==fact.id));
                        setModalFact(null);
                      }catch(e){alert('Erreur suppression');}
                    }}>🗑 Supprimer</button>}
                    {!editMode&&(
                      <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530",userSelect:"none"}}>
                        <input type="checkbox" checked={showCachetPrint} onChange={e=>setShowCachetPrint(e.target.checked)} style={{width:14,height:14}}/>
                        🏷 Cachet
                      </label>
                    )}
                    {!editMode&&<button className="btn-gold" onClick={()=>doPrint({...fact,lignes:fact.lignes,showCachet:showCachetPrint})}>🖨 Imprimer</button>}
                  </div>
                </div>

                {/* ── MODE ÉDITION ── */}
                {editMode&&(
                  <div style={{display:"grid",gap:12,marginBottom:16}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {[["Client","client"],["Téléphone","phone"],["Email","email"],["MF","mf"],["CIN","cin"]].map(([lbl,key])=>(
                        <div key={key}>
                          <label style={{display:"block",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3,fontFamily:'"Jost",sans-serif'}}>{lbl}</label>
                          <input value={ed[key]} onChange={e=>setEd(x=>({...x,[key]:e.target.value}))} style={{width:"100%",fontSize:12,padding:"6px 10px"}}/>
                        </div>
                      ))}
                      <div>
                        <label style={{display:"block",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3,fontFamily:'"Jost",sans-serif'}}>Remise %</label>
                        <input type="number" min="0" max="100" value={ed.remise} onChange={e=>setEd(x=>({...x,remise:e.target.value}))} style={{width:"100%",fontSize:12,padding:"6px 10px"}}/>
                      </div>
                      <div>
                        <label style={{display:"block",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3,fontFamily:'"Jost",sans-serif'}}>Échéance</label>
                        <input type="date" value={ed.echeance} onChange={e=>setEd(x=>({...x,echeance:e.target.value}))} style={{width:"100%",fontSize:12,padding:"6px 10px"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#faf8f5",border:"1px solid #e0d8cc",borderRadius:8}}>
                      <input type="checkbox" id="paidCheck" checked={ed.paid} onChange={e=>setEd(x=>({...x,paid:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/>
                      <label htmlFor="paidCheck" style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#2a1e08",cursor:"pointer",userSelect:"none"}}>✓ Facture payée</label>
                    </div>
                    <div>
                      <label style={{display:"block",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:3,fontFamily:'"Jost",sans-serif'}}>Notes</label>
                      <input value={ed.notes} onChange={e=>setEd(x=>({...x,notes:e.target.value}))} style={{width:"100%",fontSize:12,padding:"6px 10px"}}/>
                    </div>
                    {/* Lignes */}
                    <div>
                      <label style={{display:"block",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:6,fontFamily:'"Jost",sans-serif'}}>Lignes</label>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead><tr style={{background:"#faf8f5",borderBottom:"1px solid #e0d8cc"}}>
                          {["Réf.","Désignation","Qté","P.U. TTC",""].map((h,i)=>(
                            <th key={i} style={{padding:"6px 6px",textAlign:i>=3?"right":"left",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase"}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {ed.lignes.map((l,i)=>(
                            <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
                              <td style={{padding:"4px 4px"}}><input value={l.code||""} onChange={e=>{const nl=[...ed.lignes];nl[i]={...nl[i],code:e.target.value};setEd(x=>({...x,lignes:nl}));}} style={{width:60,fontSize:11,padding:"4px 6px"}}/></td>
                              <td style={{padding:"4px 4px"}}><input value={l.desc||""} onChange={e=>{const nl=[...ed.lignes];nl[i]={...nl[i],desc:e.target.value};setEd(x=>({...x,lignes:nl}));}} style={{width:"100%",fontSize:11,padding:"4px 6px"}}/></td>
                              <td style={{padding:"4px 4px"}}><input type="number" value={l.qty||1} onChange={e=>{const nl=[...ed.lignes];nl[i]={...nl[i],qty:e.target.value};setEd(x=>({...x,lignes:nl}));}} style={{width:50,fontSize:11,padding:"4px 6px",textAlign:"right"}}/></td>
                              <td style={{padding:"4px 4px"}}><input type="number" value={l.prixTTC||0} onChange={e=>{const nl=[...ed.lignes];nl[i]={...nl[i],prixTTC:e.target.value};setEd(x=>({...x,lignes:nl}));}} style={{width:80,fontSize:11,padding:"4px 6px",textAlign:"right"}}/></td>
                              <td style={{padding:"4px 4px",textAlign:"center"}}><button onClick={()=>{const nl=ed.lignes.filter((_,j)=>j!==i);setEd(x=>({...x,lignes:nl}));}} style={{background:"#fdf0f0",border:"1px solid #e0a0a0",color:"#9a2020",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:12}}>×</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button onClick={()=>setEd(x=>({...x,lignes:[...x.lignes,{code:"",desc:"",qty:1,prixTTC:0}]}))} style={{marginTop:6,fontSize:11,background:"#faf8f5",border:"1px dashed #c0b080",color:"#8a7040",padding:"4px 12px",borderRadius:5,cursor:"pointer",fontFamily:'"Jost",sans-serif'}}>+ Ligne</button>
                    </div>
                    {/* Aperçu total */}
                    <div style={{display:"flex",justifyContent:"flex-end"}}>
                      <div style={{fontFamily:'"Jost",sans-serif',fontSize:12,minWidth:240,background:"#faf8f5",borderRadius:8,padding:"10px 14px",border:"1px solid #e0d8cc"}}>
                        {[["Total HT",grandHT.toFixed(3)+" TND"],["TVA 7%",tvaAmt.toFixed(3)+" TND"]].map(([l,v])=>(
                          <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4,color:"#6a5a45"}}><span>{l}</span><span style={{fontWeight:500}}>{v}</span></div>
                        ))}
                        {(parseFloat(ed.remise)||0)>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4,color:"#c95050"}}><span>Remise ({ed.remise}%)</span><span style={{fontWeight:600}}>− {remiseMont.toFixed(3)} TND</span></div>}
                        {fact.type!=="devis"&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4,color:"#6a5a45"}}><span>Timbre fiscal</span><span style={{fontWeight:500}}>1,000 TND</span></div>}
                        <div style={{display:"flex",justifyContent:"space-between",background:G2b,color:"#fff",padding:"7px 10px",borderRadius:5,marginTop:6,fontWeight:700}}>
                          <span>{fact.type==="devis"?"Total TTC":"Net à payer"}</span><span>{netAPayer.toFixed(3)} TND</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── MODE APERÇU (impression) ── */}
                {!editMode&&(
                  <div className="print-only print-a4">
                    <div style={{borderBottom:"2.5px solid "+G2b,paddingBottom:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        <img src={LOGO} style={{height:54,width:54,objectFit:"cover",borderRadius:8,border:"1px solid #e0d8cc"}}/>
                        <div>
                          <p style={{fontSize:11,fontWeight:700,color:"#2c2416"}}>Société Hedi pour les services touristiques — SHST</p>
                          <p style={{fontSize:15,fontWeight:700,color:G2b,letterSpacing:1}}>IMPAVID HOTEL</p>
                          <p style={{fontSize:10,color:"#6a5a45"}}>Rue Jamel Abdelnasser, Gabès 6000 · MF : 1661336G</p>
                          <p style={{fontSize:10,color:"#6a5a45"}}>✉ impavidhotel@gmail.com · Tél/Fax : 75 220 856</p>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <p style={{fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{fact.type==="devis"?"Devis N°":"Facture N°"}</p>
                        <p style={{fontSize:20,fontWeight:800,color:"#2c2416"}}>{fact.numero}</p>
                        <p style={{fontSize:11,color:"#555",marginTop:4}}>Date : {new Date(fact.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                    </div>
                    {fact.client&&(
                      <div style={{marginBottom:14,borderRadius:4,padding:"10px 14px",border:"1px solid #ccc"}}>
                        <p style={{fontSize:9,fontWeight:700,color:"#555",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Facturé à</p>
                        <p style={{fontSize:15,fontWeight:600,color:"#2c2416",whiteSpace:"pre-line"}}>{fact.client}</p>
                        {fact.adresse&&<p style={{fontSize:11,color:"#6a5a45",marginTop:2,whiteSpace:"pre-line"}}>{fact.adresse}</p>}
                        {fact.mf&&<p style={{fontSize:11,color:"#6a5a45",fontWeight:600}}>MF : {fact.mf}</p>}
                        {fact.cin&&<p style={{fontSize:11,color:"#6a5a45"}}>CIN : {fact.cin}</p>}
                        {fact.phone&&<p style={{fontSize:11,color:"#6a5a45"}}>{fact.phone}</p>}
                        {fact.email&&<p style={{fontSize:11,color:"#6a5a45"}}>{fact.email}</p>}
                      </div>
                    )}
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:16}}>
                      <thead>
                        <tr style={{borderBottom:"2px solid #000"}}>
                          {["Réf.","Désignation","Qté","P.U. HT","P.U. TTC","Total HT","Total TTC"].map((h,i)=>(
                            <th key={i} style={{textAlign:i>=3?"right":"left",padding:"9px 8px",fontSize:9,fontWeight:700,color:"#555",textTransform:"uppercase"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.filter(l=>l.desc||l.code).map((l,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #eee"}}>
                            <td style={{padding:"10px 8px",fontSize:10,color:"#555"}}>{l.code==="AUTRE"?"":l.code||""}</td>
                            <td style={{padding:"10px 8px",fontWeight:500,color:"#2c2416"}}>{l.desc||""}</td>
                            <td style={{padding:"10px 8px",textAlign:"right"}}>{l.qty}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",color:"#6a5a45"}}>{l.prixHT.toFixed(3)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right"}}>{(parseFloat(l.prixTTC)||0).toFixed(3)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontWeight:600}}>{l.totalHT.toFixed(3)}</td>
                            <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:G2b}}>{l.totalTTC.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                      <table style={{fontSize:11,borderCollapse:"collapse",minWidth:280,border:"1px solid #ccc",borderRadius:8,overflow:"hidden"}}>
                        <tbody>
                          <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}><td style={{padding:"8px 16px",color:"#6a5a45"}}>Total HT</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45",minWidth:130}}>{(fact.montant_ht||0).toFixed(3)} TND</td></tr>
                          <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}><td style={{padding:"8px 16px",color:"#6a5a45"}}>TVA (7%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>{(fact.tva||0).toFixed(3)} TND</td></tr>
                          {(fact.remise||0)>0&&<tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff5f5"}}><td style={{padding:"8px 16px",color:"#c95050",fontWeight:600}}>Remise ({fact.remise}%)</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:700,color:"#c95050"}}>− {(Math.round((fact.montant_ht||0)*((fact.remise||0)/100)*100)/100).toFixed(3)} TND</td></tr>}
                          {fact.type!=="devis"&&<tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}><td style={{padding:"8px 16px",color:"#6a5a45"}}>Timbre fiscal</td><td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>1,000 TND</td></tr>}
                          <tr style={{background:G2b}}><td style={{padding:"11px 16px",fontWeight:800,fontSize:13,color:"#fff"}}>{fact.type==="devis"?"Total TTC":"Net à payer"}</td><td style={{padding:"11px 16px",fontWeight:800,fontSize:16,color:"#fff",textAlign:"right"}}>{(fact.montant_ttc||0).toFixed(3)} TND</td></tr>
                        </tbody>
                      </table>
                    </div>
                    {fact.notes&&<p style={{fontSize:10,color:"#333",background:"#fff",padding:"8px 12px",borderRadius:6,marginBottom:12,borderLeft:"3px solid #999"}}><strong>Notes :</strong> {fact.notes}</p>}
                    <p style={{fontSize:9,color:"#333",borderTop:"1px solid #ccc",paddingTop:10,marginTop:8}}>
                      {fact.type==="devis"?`Devis non contractuel, valable 30 jours — ${fact.numero}`:`Arrêtée la présente facture à la somme de : ${montantEnLettres(fact.montant_ttc||0)}`}
                    </p>
                    <SignatureBlock showCachet={true}/>
                  </div>
                )}

              </div>
            </div>
          );
        }

        return <ArchiveModal fact={modalFact}/>;
      })()}
    </div>
  );
}

function HistoriqueView({terminees,moisDispos,G2,openDetail}){
  const [moisSel,setMoisSel]=React.useState(moisDispos[0]||"");
  const [searchH,setSearchH]=React.useState("");
  const [printMode,setPrintMode]=React.useState(false);

  const liste=terminees.filter(r=>{
    const matchMois=!moisSel||r.checkout.slice(0,7)===moisSel||r.checkin.slice(0,7)===moisSel;
    const term=searchH.toLowerCase().trim();
    const matchSearch=!term||r.guest.toLowerCase().includes(term)||(r.cin||"").includes(term)||(r.phone||"").includes(term);
    return matchMois&&matchSearch;
  }).sort((a,b)=>b.checkout.localeCompare(a.checkout));

  const totalRev=liste.reduce((a,r)=>a+getEffectivePrice(r),0);
  const totalEnc=liste.filter(r=>r.paid).reduce((a,r)=>a+getEffectivePrice(r),0);
  const totalHT_b=Math.round((totalRev/1.07)*100)/100;
  const totalTVA=Math.round((totalRev-totalHT_b)*100)/100;
  const totalNuits=liste.reduce((a,r)=>a+nights(r.checkin,r.checkout),0);

  const moisLabel=moisSel?new Date(moisSel+"-01").toLocaleDateString("fr-FR",{month:"long",year:"numeric"}):"Toutes périodes";

  return(
    <div>
      {/* ── EN-TÊTE ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <p className="section-title">Historique</p>
          <p className="section-sub">{liste.length} séjour{liste.length>1?"s":""} terminé{liste.length>1?"s":""}{moisSel?" — "+moisLabel:""}</p>
        </div>
        <button className="btn-gold" onClick={()=>{setPrintMode(true);setTimeout(()=>window.print(),100);}}>
          🖨 Imprimer le bilan
        </button>
      </div>

      {/* ── FILTRES ── */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20,boxShadow:"0 1px 4px rgba(42,30,8,0.05)"}}>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>📅 Période</label>
          <select value={moisSel} onChange={e=>setMoisSel(e.target.value)} style={{width:"100%"}}>
            <option value="">Toutes les périodes</option>
            {moisDispos.map(m=>(
              <option key={m} value={m}>{new Date(m+"-01").toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>🔍 Rechercher</label>
          <input value={searchH} onChange={e=>setSearchH(e.target.value)} placeholder="Nom, CIN, téléphone…" style={{width:"100%"}}/>
        </div>
      </div>

      {/* ── CARTES BILAN ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
        {[
          {label:"Séjours",val:liste.length,unit:"",color:"#c9952a",bg:"#fef9f0",border:"#e8d8b0"},
          {label:"Nuits totales",val:totalNuits,unit:"",color:"#5a7fc8",bg:"#f0f4ff",border:"#c0cfee"},
          {label:"Revenus TTC",val:totalRev.toFixed(3),unit:"TND",color:"#2a8a5a",bg:"#f0faf4",border:"#a0d8b8"},
          {label:"Encaissé",val:totalEnc.toFixed(3),unit:"TND",color:"#2d7a4f",bg:"#e8f5ee",border:"#90c8a8"},
          {label:"En attente",val:(Math.round((totalRev-totalEnc)*100)/100).toFixed(3),unit:"TND",color:"#c95050",bg:"#fdf0f0",border:"#e0a0a0"},
        ].map(({label,val,unit,color,bg,border})=>(
          <div key={label} style={{background:bg,border:"1.5px solid "+border,borderRadius:10,padding:"14px 16px"}}>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{label}</p>
            <p style={{fontFamily:'"Cormorant Garamond",serif',fontSize:22,fontWeight:700,color:"#2a1e08",lineHeight:1.1}}>{val}</p>
            {unit&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040",marginTop:2}}>{unit}</p>}
          </div>
        ))}
      </div>

      {/* ── RÉCAPITULATIF TVA ── */}
      {liste.length>0&&(
        <div style={{background:"#faf8f5",border:"1px solid #e8ddc8",borderRadius:8,padding:"12px 18px",marginBottom:20,display:"flex",gap:32,flexWrap:"wrap"}}>
          <div><p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Total HT</p><p style={{fontFamily:'"Jost",sans-serif',fontSize:15,fontWeight:700,color:"#2a1e08"}}>{totalHT_b.toFixed(3)} TND</p></div>
          <div><p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>TVA 7%</p><p style={{fontFamily:'"Jost",sans-serif',fontSize:15,fontWeight:700,color:"#2a1e08"}}>{totalTVA.toFixed(3)} TND</p></div>
          <div><p style={{fontFamily:'"Jost",sans-serif',fontSize:9,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>Total TTC</p><p style={{fontFamily:'"Jost",sans-serif',fontSize:15,fontWeight:700,color:G2}}>{totalRev.toFixed(3)} TND</p></div>
          {totalRev>0&&<div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#2a8a5a",fontWeight:600,whiteSpace:"nowrap"}}>Taux encaissement : {Math.round(totalEnc/totalRev*100)}%</p>
            <div style={{flex:1,height:6,background:"#e0d8cc",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:Math.round(totalEnc/totalRev*100)+"%",background:"#2a8a5a",borderRadius:3}}/>
            </div>
          </div>}
        </div>
      )}

      {/* ── TABLEAU ── */}
      <div style={{background:"#fff",border:"1px solid #e8ddc8",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(42,30,8,0.06)"}}>
        <div style={{padding:"11px 18px",borderBottom:"1px solid #f0e8d8",display:"grid",gridTemplateColumns:"70px 1fr 85px 85px 70px 80px 95px 110px",gap:8,background:"#fef9f0"}}>
          {["Ch.","Client","Arrivée","Départ","Nuits","Type","Montant","Statut paiement"].map(h=>(
            <p key={h} style={{fontFamily:'"Jost",sans-serif',fontSize:9,letterSpacing:1.5,color:"#8a7040",textTransform:"uppercase",fontWeight:600}}>{h}</p>
          ))}
        </div>
        {liste.length===0&&(
          <p style={{padding:40,color:"#b0a070",fontFamily:'"Jost",sans-serif',fontSize:14,textAlign:"center"}}>
            Aucun séjour terminé {moisSel?"pour cette période":""} 
          </p>
        )}
        {liste.map(r=>{
          const room=ROOMS.find(rm=>rm.id===r.roomId);
          const n=nights(r.checkin,r.checkout);
          const montant=getEffectivePrice(r);
          return(
            <div key={r.id} className="res-row" onClick={()=>openDetail(r)}
              style={{display:"grid",gridTemplateColumns:"70px 1fr 85px 85px 70px 80px 95px 110px",gap:8,padding:"12px 18px",borderBottom:"1px solid #f5f0e8",cursor:"pointer",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#fef9f0"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              <div>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:16,fontWeight:700,color:"#c9952a"}}>{room?.number}</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:9,color:"#8a7040"}}>{room?.type}</p>
              </div>
              <div>
                <p style={{fontSize:14,fontWeight:500,color:"#2a1e08"}}>{r.guest}</p>
                <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{r.cin?`CIN: ${r.cin}`:r.phone||r.email||""}</p>
              </div>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530",alignSelf:"center"}}>{new Date(r.checkin).toLocaleDateString("fr-FR")}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#6a5530",alignSelf:"center"}}>{new Date(r.checkout).toLocaleDateString("fr-FR")}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:600,color:"#2a1e08",alignSelf:"center"}}>{n}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#8a7040",alignSelf:"center"}}>{r.pension==="dp"?"DP":"LPD"}</p>
              <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,fontWeight:700,color:"#2a1e08",alignSelf:"center",textAlign:"right"}}>{montant.toFixed(3)}<span style={{fontSize:9,color:"#8a7040",marginLeft:2}}>TND</span></p>
              <div style={{alignSelf:"center"}}>
                <span style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:12,background:r.paid?"#e8f5ee":"#fdf0f0",color:r.paid?"#2d7a4f":"#c95050"}}>
                  {r.paid?"✓ Payé":"En attente"}
                </span>
              </div>
            </div>
          );
        })}
        {/* TOTAL EN BAS */}
        {liste.length>0&&(
          <div style={{padding:"12px 18px",background:"#faf8f2",borderTop:"2px solid #e8ddc8",display:"grid",gridTemplateColumns:"70px 1fr 85px 85px 70px 80px 95px 110px",gap:8}}>
            <div/>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040",alignSelf:"center"}}>{liste.length} séjour{liste.length>1?"s":""}</p>
            <div/><div/>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#2a1e08",alignSelf:"center"}}>{totalNuits} n.</p>
            <div/>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:800,color:G2,alignSelf:"center",textAlign:"right"}}>{totalRev.toFixed(3)}<span style={{fontSize:9,marginLeft:2}}>TND</span></p>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#2d7a4f",alignSelf:"center"}}>{totalEnc.toFixed(3)} enc.</p>
          </div>
        )}
      </div>

      {/* ── ZONE IMPRESSION A4 ── */}
      <div className="print-only print-a4">
        {/* En-tête */}
        <div style={{borderBottom:"2px solid "+G2,paddingBottom:12,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <img src={typeof LOGO!=="undefined"?LOGO:""} style={{height:50,width:50,objectFit:"cover",borderRadius:6,border:"1px solid #e0d8cc"}}/>
            <div>
              <p style={{fontSize:11,fontWeight:700,color:"#2c2416"}}>Société Hedi pour les services touristiques — SHST</p>
              <p style={{fontSize:15,fontWeight:700,color:G2,letterSpacing:1}}>IMPAVID HOTEL</p>
              <p style={{fontSize:9,color:"#6a5a45"}}>Rue Jamel Abdelnasser, Gabès 6000 · MF : 1661336G</p>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{fontSize:14,fontWeight:800,color:"#2c2416"}}>Bilan d'activité</p>
            <p style={{fontSize:12,color:G2,fontWeight:600}}>{moisLabel}</p>
            <p style={{fontSize:10,color:"#8a7a65"}}>Édité le {new Date().toLocaleDateString("fr-FR")}</p>
          </div>
        </div>

        {/* Résumé chiffres */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>
          {[
            ["Séjours",liste.length,""],
            ["Nuits",totalNuits,""],
            ["Total HT",totalHT_b.toFixed(3),"TND"],
            ["TVA 7%",totalTVA.toFixed(3),"TND"],
            ["Total TTC",totalRev.toFixed(3),"TND"],
          ].map(([l,v,u])=>(
            <div key={l} style={{border:"1px solid #e0d8cc",borderRadius:6,padding:"8px 10px",background:"#fafaf8"}}>
              <p style={{fontSize:8,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.6,marginBottom:3}}>{l}</p>
              <p style={{fontSize:14,fontWeight:700,color:"#2c2416"}}>{v}{u&&<span style={{fontSize:8,marginLeft:2,color:"#8a7a65"}}>{u}</span>}</p>
            </div>
          ))}
        </div>

        {/* Tableau */}
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:9,marginBottom:14}}>
          <thead>
            <tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
              {["Ch.","Client","CIN / Tél.","Arrivée","Départ","Nuits","Type","Montant TTC","Paiement"].map(h=>(
                <th key={h} style={{padding:"7px 6px",textAlign:"left",fontWeight:700,color:"#6a5a45",textTransform:"uppercase",letterSpacing:.4,fontSize:8}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liste.map((r,i)=>{
              const room=ROOMS.find(rm=>rm.id===r.roomId);
              const n=nights(r.checkin,r.checkout);
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f0ebe3",background:i%2===0?"#fff":"#fdfbf8"}}>
                  <td style={{padding:"7px 6px",fontWeight:700,color:G2}}>{room?.number}</td>
                  <td style={{padding:"7px 6px",fontWeight:500}}>{r.guest}</td>
                  <td style={{padding:"7px 6px",color:"#8a7a65"}}>{r.cin||r.phone||"—"}</td>
                  <td style={{padding:"7px 6px"}}>{new Date(r.checkin).toLocaleDateString("fr-FR")}</td>
                  <td style={{padding:"7px 6px"}}>{new Date(r.checkout).toLocaleDateString("fr-FR")}</td>
                  <td style={{padding:"7px 6px",textAlign:"center",fontWeight:600}}>{n}</td>
                  <td style={{padding:"7px 6px",color:"#6a5a45"}}>{r.pension==="dp"?"DP":"LPD"}</td>
                  <td style={{padding:"7px 6px",textAlign:"right",fontWeight:700,color:G2}}>{getEffectivePrice(r).toFixed(3)}</td>
                  <td style={{padding:"7px 6px"}}>
                    <span style={{fontWeight:700,color:r.paid?"#2d7a4f":"#c95050"}}>{r.paid?"✓ Payé":"Attente"}</span>
                  </td>
                </tr>
              );
            })}
            {/* Ligne total */}
            <tr style={{background:"#f5f0e8",borderTop:"2px solid #e0d8cc",fontWeight:700}}>
              <td colSpan={5} style={{padding:"9px 6px",fontWeight:700,color:"#2c2416"}}>TOTAL — {liste.length} séjour{liste.length>1?"s":""}</td>
              <td style={{padding:"9px 6px",textAlign:"center",fontWeight:700}}>{totalNuits}</td>
              <td/>
              <td style={{padding:"9px 6px",textAlign:"right",fontWeight:800,color:G2,fontSize:11}}>{totalRev.toFixed(3)}</td>
              <td style={{padding:"9px 6px",color:"#2d7a4f",fontWeight:700}}>{totalEnc.toFixed(3)} enc.</td>
            </tr>
          </tbody>
        </table>

        <p style={{fontSize:8,color:"#a09080",borderTop:"1px solid #f0ebe3",paddingTop:8}}>
          Document généré automatiquement — IMPAVID HOTEL, Gabès · MF : 1661336G · impavidhotel@gmail.com
        </p>
      </div>
    </div>
  );
}

// Convertit un montant TND en toutes lettres (français)
