function FreeInvoiceModal({fi,setFreeInvoice,sb,REFS,LOGO,closeModal,saveFacture,cancelFacture,showToast,doPrint,montantEnLettres,SignatureBlock,nextInvNum,userRole}){
  const setFI=fn=>setFreeInvoice(f=>fn(f));
  const G2="#8B6434";
  const [clients,setClients]=React.useState([]);
  const [clientSearch,setClientSearch]=React.useState("");
  const [showSuggestions,setShowSuggestions]=React.useState(false);
  const [savingClient,setSavingClient]=React.useState(false);

  React.useEffect(()=>{
    sb.from('clients').select('*').order('nom').then(({data})=>setClients(data||[]));
  },[]);

  const suggestions=clientSearch.length>=2?clients.filter(c=>
    c.nom.toLowerCase().includes(clientSearch.toLowerCase())||
    (c.mf||"").toLowerCase().includes(clientSearch.toLowerCase())||
    (c.phone||"").includes(clientSearch)
  ):[];

  function selectClient(c){
    setFI(f=>({...f,client:c.nom,phone:c.phone||"",email:c.email||"",mf:c.mf||"",cin:c.cin||""}));
    setClientSearch("");
    setShowSuggestions(false);
  }

  async function saveClient(){
    if(!fi.client) return;
    setSavingClient(true);
    try{
      const existing=clients.find(c=>c.nom.toLowerCase()===fi.client.toLowerCase());
      if(existing){
        await sb.from('clients').update({phone:fi.phone||null,email:fi.email||null,mf:fi.mf||null}).eq('id',existing.id);
      } else {
        await sb.from('clients').insert([{nom:fi.client,phone:fi.phone||null,email:fi.email||null,mf:fi.mf||null}]);
      }
      const {data}=await sb.from('clients').select('*').order('nom');
      setClients(data||[]);
      alert('Client "'+(fi.client)+'" sauvegardé ✓');
    }catch(e){alert('Erreur : '+e.message);}
    setSavingClient(false);
  }

  const lines=fi.lines.map(l=>{
    const ttc=parseFloat(l.prixTTC)||0;
    const ht=Math.round((ttc/1.07)*1000)/1000;
    const qty=parseFloat(l.qty)||1;
    return{...l,prixHT:ht,prixTTC:ttc,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};
  });
  const grandTTC=Math.round(lines.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
  const grandHT=Math.round(lines.reduce((a,l)=>a+l.totalHT,0)*100)/100;
  const tvaAmt=Math.round((grandTTC-grandHT)*100)/100;
  const remise=parseFloat(fi.remise)||0;
  const remiseMont=Math.round(grandTTC*(remise/100)*100)/100;
  const avantTimbre=Math.round((grandTTC-remiseMont)*100)/100;
  const timbre=1;
  const netAPayer=Math.round((avantTimbre+timbre)*100)/100;
  const invNum=fi.invNum||"00000";

  return(
  <div className="modal" style={{maxWidth:660,fontFamily:'"Inter",sans-serif'}}>
    {/* ── FORMULAIRE ── */}
    <div className="no-print" style={{marginBottom:16}}>
      <h2 style={{fontSize:20,fontWeight:600,color:G2,marginBottom:16,fontFamily:'"Cormorant Garamond",serif'}}>🧾 Facture libre</h2>

      {/* ── RECHERCHE CLIENT ── */}
      <div style={{background:"#f0f4ff",border:"1px solid #c0cfee",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#3a5fc8",textTransform:"uppercase",letterSpacing:.8}}>📋 Annuaire clients</p>
          {fi.client&&<button onClick={saveClient} disabled={savingClient} style={{fontSize:10,background:"#3a5fc8",color:"#fff",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontFamily:'"Jost",sans-serif',fontWeight:600}}>
            {savingClient?"...":"💾 Mémoriser"}
          </button>}
        </div>
        <div style={{position:"relative"}}>
          <input
            value={clientSearch}
            onChange={e=>{setClientSearch(e.target.value);setShowSuggestions(true);}}
            onFocus={()=>setShowSuggestions(true)}
            onBlur={()=>setTimeout(()=>setShowSuggestions(false),200)}
            placeholder="🔍 Rechercher un client mémorisé…"
            style={{width:"100%",fontSize:12,padding:"7px 10px",border:"1px solid #c0cfee",borderRadius:6,background:"#fff"}}
          />
          {showSuggestions&&suggestions.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1px solid #c0cfee",borderRadius:6,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,maxHeight:200,overflowY:"auto"}}>
              {suggestions.map(c=>(
                <div key={c.id} onMouseDown={()=>selectClient(c)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #f0f0f8",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                  <div>
                    <p style={{fontFamily:'"Jost",sans-serif',fontSize:12,fontWeight:700,color:"#2c2416"}}>{c.nom}</p>
                    {c.mf&&<p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#8a7040"}}>MF : {c.mf}</p>}
                  </div>
                  <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#b0a070"}}>{c.phone||""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Infos client */}
      <div style={{marginBottom:10}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>
          Client
          <span style={{fontSize:9,fontWeight:500,color:"#a09080",marginLeft:6,textTransform:"none",letterSpacing:0}}>un nom par ligne si plusieurs</span>
        </label>
        <textarea value={fi.client} onChange={e=>setFI(f=>({...f,client:e.target.value}))} rows={2} placeholder={"Ex : Société ABC\nM. Mohamed Ben Ali"} style={{fontSize:12,padding:"7px 10px",resize:"vertical",width:"100%"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        {[["Téléphone","phone","xx xxx xxx"],["Email","email","email@exemple.com"]].map(([label,key,ph])=>(
          <div key={key}>
            <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{label}</label>
            <input value={fi[key]} onChange={e=>setFI(f=>({...f,[key]:e.target.value}))} placeholder={ph} style={{fontSize:12,padding:"7px 10px"}}/>
          </div>
        ))}
      </div>
      {/* Adresse client */}
      <div style={{marginBottom:10}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4,fontFamily:'"Jost",sans-serif'}}>
          Adresse client
          <span style={{fontSize:9,fontWeight:500,color:"#a09080",marginLeft:6,textTransform:"none",letterSpacing:0}}>facultatif · un client par ligne si plusieurs</span>
        </label>
        <textarea
          value={fi.adresse||""}
          onChange={e=>setFI(f=>({...f,adresse:e.target.value}))}
          rows={2}
          placeholder={"Ex : Société ABC — Tunis\nSociété XYZ — Sfax"}
          style={{fontSize:12,padding:"7px 10px",resize:"vertical",width:"100%"}}
        />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>
            Matricule Fiscale client
            <span style={{fontSize:9,fontWeight:500,color:"#a09080",marginLeft:6,textTransform:"none",letterSpacing:0}}>facultatif</span>
          </label>
          <input value={fi.mf||""} onChange={e=>setFI(f=>({...f,mf:e.target.value}))} placeholder="ex : 1234567A/B/C/000" style={{fontSize:12,padding:"7px 10px"}}/>
        </div>
        {/* Toggle cachet */}
        <div style={{display:"flex",alignItems:"center",gap:12,background:"#faf8f5",border:"1px solid #e8d8b0",borderRadius:8,padding:"8px 14px"}}>
          <span style={{fontSize:20}}>🔵</span>
          <div style={{flex:1}}>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#6a5a45",marginBottom:2}}>Cachet de l'établissement</p>
            <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,color:"#a09080"}}>Afficher sur la facture</p>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
            <input type="checkbox" checked={fi.showCachet!==false} onChange={e=>setFI(f=>({...f,showCachet:e.target.checked}))}
              style={{width:20,height:20,cursor:"pointer",accentColor:"#2a3db0"}}/>
            <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>Cachet</span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginLeft:8}}>
            <input type="checkbox" checked={fi.showRib===true} onChange={e=>setFI(f=>({...f,showRib:e.target.checked}))}
              style={{width:20,height:20,cursor:"pointer",accentColor:"#c9952a"}}/>
            <span style={{fontFamily:'"Jost",sans-serif',fontSize:11,color:"#6a5530"}}>RIB</span>
          </label>
        </div>
      </div>
      {/* Lignes */}
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
        <thead><tr style={{background:"#faf8f5",borderBottom:"2px solid #e0d8cc"}}>
          {["Réf.","Désignation","Nuits","P.U. TTC",""].map((h,i)=>(
            <th key={i} style={{textAlign:i===3?"right":"left",padding:"7px 6px",fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase"}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {fi.lines.map((l,i)=>(
            <tr key={i} style={{borderBottom:"1px solid #f0ebe3"}}>
              <td style={{padding:"5px 6px",width:90}}>
                <select value={l.code||""} onChange={e=>{
                  const r=REFS.find(x=>x.code===e.target.value);
                  setFI(f=>{const ls=[...f.lines];ls[i]={...ls[i],code:e.target.value,desc:r?r.label:"",prixTTC:r?r.price:0};return{...f,lines:ls};});
                }} style={{fontSize:11,padding:"4px 6px",width:85}}>
                  <option value="">— Choisir —</option>
                  {REFS.map(r=><option key={r.code} value={r.code}>{r.code}</option>)}
                  <option value="AUTRE">AUTRE</option>
                </select>
              </td>
              <td style={{padding:"5px 6px"}}>
                {l.code==="AUTRE"||!l.code
                  ? <input value={l.desc||""} onChange={e=>setFI(f=>{const ls=[...f.lines];ls[i]={...ls[i],desc:e.target.value};return{...f,lines:ls};})} placeholder={l.code==="AUTRE"?"Saisir la désignation...":"← Choisir une référence"} disabled={!l.code} style={{fontSize:12,padding:"4px 8px",opacity:l.code?"1":".5"}}/>
                  : <span style={{fontSize:12,fontWeight:500,padding:"4px 8px",display:"block"}}>{REFS.find(r=>r.code===l.code)?.label}</span>
                }
              </td>
              <td style={{padding:"5px 6px",width:55}}>
                <input type="number" min="1" value={l.qty} onChange={e=>setFI(f=>{const ls=[...f.lines];ls[i]={...ls[i],qty:e.target.value};return{...f,lines:ls};})} style={{fontSize:12,padding:"4px 6px",width:46,textAlign:"center"}}/>
              </td>
              <td style={{padding:"5px 6px",width:100}}>
                <input type="number" min="0" step="0.001" value={l.prixTTC} onChange={e=>setFI(f=>{const ls=[...f.lines];ls[i]={...ls[i],prixTTC:e.target.value};return{...f,lines:ls};})} style={{fontSize:12,padding:"4px 8px",width:90,textAlign:"right"}}/>
              </td>
              <td style={{padding:"5px 4px",width:30}}>
                {fi.lines.length>1&&<button onClick={()=>setFI(f=>({...f,lines:f.lines.filter((_,j)=>j!==i)}))} style={{background:"#fce8e8",color:"#a02a2a",border:"none",borderRadius:4,padding:"3px 7px",fontSize:11,cursor:"pointer"}}>✕</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={()=>setFI(f=>({...f,lines:[...f.lines,{code:"",desc:"",qty:1,prixTTC:0}]}))} style={{fontSize:11,background:"#faf8f5",border:"1px dashed #c0b080",color:"#8a7040",padding:"5px 14px",borderRadius:6,cursor:"pointer",marginBottom:12,fontFamily:'"Jost",sans-serif'}}>
        + Ajouter une ligne
      </button>
      {/* Remise + Mode + Notes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#fef9f0",border:"1px solid #e8d8b0",borderRadius:8,padding:"10px 14px"}}>
          <label style={{fontFamily:'"Jost",sans-serif',fontSize:11,fontWeight:700,color:"#8a7040",textTransform:"uppercase",whiteSpace:"nowrap"}}>🏷 Remise %</label>
          <input type="number" min="0" max="100" value={fi.remise||0} onChange={e=>setFI(f=>({...f,remise:e.target.value}))} style={{width:60,padding:"5px 8px",border:"1.5px solid #e0d0b0",borderRadius:6,fontFamily:'"Jost",sans-serif',fontSize:14,fontWeight:600,color:"#c9952a",textAlign:"center"}}/>
          {remise>0&&<span style={{fontSize:11,color:"#c95050",fontWeight:600}}>− {remiseMont.toFixed(3)} TND</span>}
        </div>
        <div>
          <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4,fontFamily:'"Jost",sans-serif'}}>💳 Mode de paiement</label>
          <select value={fi.mode_paiement||"especes"} onChange={e=>setFI(f=>({...f,mode_paiement:e.target.value}))} style={{width:"100%",padding:"8px 10px",border:"1.5px solid #e0d0b0",borderRadius:6,fontSize:12}}>
            <option value="especes">💵 Espèces</option>
            <option value="carte">💳 Carte bancaire</option>
            <option value="cheque">📝 Chèque</option>
            <option value="virement">🏦 Virement</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:.8,marginBottom:4,fontFamily:'"Jost",sans-serif'}}>Notes</label>
          <textarea value={fi.notes} onChange={e=>setFI(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Remarques..." style={{fontSize:12,padding:"7px 10px",resize:"none",width:"100%"}}/>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14,paddingTop:12,borderTop:"1px solid #f0ebe3"}}>
        <button className="btn-ghost" onClick={closeModal}>Fermer</button>
        {!fi.saved?(
          <button className="btn-gold" onClick={async()=>{
            const linesCalc=fi.lines.map(l=>{const ttc=parseFloat(l.prixTTC)||0;const ht=Math.round((ttc/1.07)*1000)/1000;const qty=parseFloat(l.qty)||1;return{...l,prixHT:ht,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};});
            const gTTC=Math.round(linesCalc.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
            const gHT=Math.round(linesCalc.reduce((a,l)=>a+l.totalHT,0)*100)/100;
            const rem=parseFloat(fi.remise)||0;
            const remMont=Math.round(gTTC*(rem/100)*100)/100;
            const net=Math.round((gTTC-remMont+1)*100)/100;
            const num=await nextInvNum();setFI(f=>({...f,invNum:num}));
            const ok=await saveFacture({numero:num,type:'libre',client:fi.client||null,adresse:fi.adresse||null,phone:fi.phone||null,email:fi.email||null,mf:fi.mf||null,montant_ht:gHT,tva:Math.round((gTTC-gHT)*100)/100,timbre:1,montant_ttc:net,remise:rem,notes:fi.notes||null,lignes:fi.lines,mode_paiement:fi.mode_paiement||"especes"});
            if(ok){setFI(f=>({...f,saved:true}));showToast('Facture F-'+fi.invNum+' enregistrée ✓','success');}
            else showToast('Erreur enregistrement','error');
          }}>💾 Enregistrer</button>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontFamily:'"Jost",sans-serif',fontSize:12,color:"#2a8a5a",fontWeight:700}}>✓ F-{fi.invNum}</span>
            {userRole==="gerant"&&(
              <button className="btn-red" style={{fontSize:11,padding:"5px 12px"}} onClick={async()=>{
                if(!confirm('Annuler et supprimer la facture F-'+fi.invNum+' ?')) return;
                await cancelFacture(fi.invNum);
                setFI(f=>({...f,saved:false,invNum:undefined}));
                showToast('Facture annulée','error');
              }}>✕ Annuler</button>
            )}
          </div>
        )}
        <button className="btn-primary" style={{opacity:fi.saved?1:.45,cursor:fi.saved?"pointer":"not-allowed"}} onClick={()=>{
          if(!fi.saved) return;
          const lc=fi.lines.map(l=>{const ttc=parseFloat(l.prixTTC)||0;const ht=Math.round((ttc/1.07)*1000)/1000;const qty=parseFloat(l.qty)||1;return{...l,prixHT:ht,totalHT:Math.round(qty*ht*100)/100,totalTTC:Math.round(qty*ttc*100)/100};});
          const gTTC=Math.round(lc.reduce((a,l)=>a+l.totalTTC,0)*100)/100;
          const gHT=Math.round(lc.reduce((a,l)=>a+l.totalHT,0)*100)/100;
          const rem=parseFloat(fi.remise)||0;
          doPrint({numero:'F-'+fi.invNum,type:'libre',client:fi.client,adresse:fi.adresse,mf:fi.mf,phone:fi.phone,cin:null,showCachet:fi.showCachet!==false,showRib:fi.showRib===true,montant_ht:gHT,tva:Math.round((gTTC-gHT)*100)/100,montant_ttc:Math.round((gTTC-Math.round(gTTC*(rem/100)*100)/100+1)*100)/100,remise:rem,notes:fi.notes,lignes:fi.lines,created_at:new Date()});
        }}>🖨 Imprimer</button>
      </div>
    </div>

    {/* ══════════════════════════════════════════
        ZONE D'IMPRESSION A4
        ══════════════════════════════════════════ */}
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
          <p style={{fontSize:10,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1}}>Facture N°</p>
          <p style={{fontSize:20,fontWeight:800,color:"#2c2416"}}>{invNum}</p>
          <p style={{fontSize:11,color:"#8a7a65",marginTop:4}}>Date : {new Date().toLocaleDateString("fr-FR")}</p>
        </div>
      </div>

      {/* Client */}
      {fi.client&&(
        <div style={{marginBottom:14,background:"#faf8f5",borderRadius:6,padding:"10px 14px",border:"1px solid #e0d8cc"}}>
          <p style={{fontSize:9,fontWeight:700,color:"#8a7a65",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Facturé à</p>
          <p style={{fontSize:15,fontWeight:600,color:"#2c2416",whiteSpace:"pre-line"}}>{fi.client}</p>
          {fi.adresse&&<p style={{fontSize:11,color:"#6a5a45",marginTop:2,whiteSpace:"pre-line"}}>{fi.adresse}</p>}
          {fi.mf&&<p style={{fontSize:11,color:"#6a5a45",fontWeight:600}}>MF : {fi.mf}</p>}
          {fi.phone&&<p style={{fontSize:11,color:"#6a5a45"}}>{fi.phone}</p>}
          {fi.email&&<p style={{fontSize:11,color:"#6a5a45"}}>{fi.email}</p>}
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
            <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}>
              <td style={{padding:"8px 16px",color:"#6a5a45"}}>Total HT</td>
              <td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45",minWidth:120}}>{grandHT.toFixed(3)} TND</td>
            </tr>
            <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}>
              <td style={{padding:"8px 16px",color:"#6a5a45"}}>TVA (7%)</td>
              <td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>{tvaAmt.toFixed(3)} TND</td>
            </tr>
            {remise>0&&(
              <tr style={{borderBottom:"1px solid #e0d8cc",background:"#fff5f5"}}>
                <td style={{padding:"8px 16px",color:"#c95050",fontWeight:600}}>Remise ({remise}%)</td>
                <td style={{padding:"8px 16px",textAlign:"right",fontWeight:700,color:"#c95050"}}>− {remiseMont.toFixed(3)} TND</td>
              </tr>
            )}
            <tr style={{borderBottom:"1px solid #e0d8cc",background:"#faf8f5"}}>
              <td style={{padding:"8px 16px",color:"#6a5a45"}}>Timbre fiscal</td>
              <td style={{padding:"8px 16px",textAlign:"right",fontWeight:600,color:"#6a5a45"}}>1,000 TND</td>
            </tr>
            <tr style={{background:G2}}>
              <td style={{padding:"11px 16px",fontWeight:800,fontSize:13,color:"#fff"}}>Net à payer</td>
              <td style={{padding:"11px 16px",fontWeight:800,fontSize:16,color:"#fff",textAlign:"right"}}>{netAPayer.toFixed(3)} TND</td>
            </tr>
          </tbody>
        </table>
      </div>

      {fi.notes&&(
        <p style={{fontSize:10,color:"#6a5a45",background:"#faf8f5",padding:"8px 12px",borderRadius:6,marginBottom:12,borderLeft:"3px solid #c0a870"}}>
          <strong>Notes :</strong> {fi.notes}
        </p>
      )}

      <p style={{fontSize:9,color:"#a09080",borderTop:"1px solid #f0ebe3",paddingTop:10,marginTop:8}}>
        Arrêtée la présente facture à la somme de : <strong>{montantEnLettres(netAPayer)}</strong>
      </p>
      <SignatureBlock showCachet={fi.showCachet!==false} showRib={fi.showRib===true}/>
    </div>

  </div>
  );
}

