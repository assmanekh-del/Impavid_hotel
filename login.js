function LoginScreen({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [showPw,setShowPw]=useState(false);

  async function handleLogin(){
    if(!email||!password){setError("Veuillez remplir tous les champs.");return;}
    setLoading(true);setError("");
    try{
      const {data,error:err}=await sb.auth.signInWithPassword({email:email.trim(),password});
      if(err) throw err;
      onLogin(data.user);
    }catch(e){
      setError("Email ou mot de passe incorrect.");
    }
    setLoading(false);
  }

  return(
    <div style={{minHeight:"100vh",background:"#f5f0e8",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:'"Cormorant Garamond",Georgia,serif'}}>
      <div style={{background:"#fff",borderRadius:16,boxShadow:"0 8px 40px rgba(42,30,8,0.12)",padding:"48px 40px",width:380,maxWidth:"90vw"}}>
        {/* Logo + titre */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src={LOGO} alt="Impavid" style={{height:64,width:64,objectFit:"cover",borderRadius:10,border:"2px solid #e8d0a0",marginBottom:16}}/>
          <p style={{fontSize:24,letterSpacing:5,color:"#c9952a",fontWeight:400,lineHeight:1.1}}>IMPAVID</p>
          <p style={{fontFamily:'"Jost",sans-serif',fontSize:10,letterSpacing:3,color:"#b0a070",textTransform:"uppercase",marginTop:4}}>Gestion Hôtelière</p>
        </div>

        {/* Formulaire */}
        <div style={{display:"grid",gap:14}}>
          <div>
            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="votre@email.com"
              style={{width:"100%",padding:"11px 14px",border:"1.5px solid #e0d0b0",borderRadius:8,fontSize:14,fontFamily:'"Jost",sans-serif',outline:"none",background:"#faf8f5"}}
              autoFocus
            />
          </div>
          <div>
            <label style={{display:"block",fontFamily:'"Jost",sans-serif',fontSize:10,fontWeight:700,color:"#8a7040",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Mot de passe</label>
            <div style={{position:"relative"}}>
              <input
                type={showPw?"text":"password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="••••••••"
                style={{width:"100%",padding:"11px 40px 11px 14px",border:"1.5px solid #e0d0b0",borderRadius:8,fontSize:14,fontFamily:'"Jost",sans-serif',outline:"none",background:"#faf8f5"}}
              />
              <button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#8a7040",padding:4}}>
                {showPw?"🙈":"👁"}
              </button>
            </div>
          </div>

          {error&&(
            <div style={{background:"#fdf0f0",border:"1px solid #e0a0a0",borderRadius:8,padding:"10px 14px",fontFamily:'"Jost",sans-serif',fontSize:13,color:"#9a2020"}}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{background:"#c9952a",color:"#fff",border:"none",padding:"13px",borderRadius:8,fontSize:13,fontFamily:'"Jost",sans-serif',fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",cursor:loading?"not-allowed":"pointer",opacity:loading?.7:1,marginTop:4,boxShadow:"0 2px 8px rgba(201,149,42,0.3)"}}>
            {loading?"Connexion...":"Se connecter"}
          </button>
        </div>

        <p style={{textAlign:"center",fontFamily:'"Jost",sans-serif',fontSize:11,color:"#b0a070",marginTop:24}}>
          IMPAVID HOTEL — Gabès © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

function Root(){
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(true);

  useEffect(()=>{
    // Vérifier session existante
    sb.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user||null);
      setChecking(false);
    });
    // Écouter les changements de session
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user||null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  if(checking) return(
    <div style={{minHeight:"100vh",background:"#f5f0e8",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <p style={{fontFamily:'"Jost",sans-serif',fontSize:13,color:"#8a7040",letterSpacing:2}}>Chargement...</p>
    </div>
  );

  if(!user) return <LoginScreen onLogin={setUser}/>;
  return <App user={user} onLogout={async()=>{await sb.auth.signOut();setUser(null);}}/>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root/>);