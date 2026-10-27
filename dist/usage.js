/* Per-user authorizations are backed by server accounting; no monthly renewal. */
(() => {
  let usage=null,ownerId=null,pending=null,loading=false;
  function cancel(){if(pending){pending.resolve(false);pending=null;}}
  function set(info,id){usage=info;ownerId=id;const node=document.getElementById('usage-balance');if(!node)return;node.hidden=!info;node.textContent=info?(info.unlimited?'Uso sem limite':`${number(info.balance)} ${info.balance===1?'uso disponível':'usos disponíveis'}`):'';}
  function clear(){cancel();usage=null;ownerId=null;loading=false;const node=document.getElementById('usage-balance');if(node){node.hidden=true;node.textContent='';}}
  function hasAccess(lot=state.lot){return Boolean(ownerId&&ownerId===window.ViabilAuth?.accountId()&&(usage?.unlimited||state.savedCustom[lot.id]&&AnalysisIdentity.key(state.savedCustom[lot.id].lot)===AnalysisIdentity.key(lot)));}
  function notice(){if(!usage||usage.unlimited)return '';return `<div class="usage-notice"><strong>${number(usage.balance)} ${usage.balance===1?'uso disponível':'usos disponíveis'}</strong><span>Uma nova análise consome 1 uso. Reabrir o estudo e ajustar suas premissas não consome outro uso. O superadministrador libera sua quantidade individualmente.</span></div>`;}
  async function refresh(){const id=window.ViabilAuth.accountId();const response=await fetch('/api/usage',{credentials:'same-origin',cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível consultar seus usos.');if(id!==window.ViabilAuth.accountId())throw Error('A sessão mudou. Entre novamente.');set(data.usage,id);return data.usage;}
  function blocked(){modal('Seus usos disponíveis acabaram.','<p>O superadministrador precisa liberar mais usos para você iniciar outra análise de terreno.</p><p>Seus estudos já analisados continuam disponíveis para consulta e ajustes de premissas.</p>',btn('Entendi','check','close-modal','primary'));}
  async function execute(task){
    const button=document.querySelector('[data-usage-confirm]');if(button){button.disabled=true;button.textContent='Registrando análise…';}
    try{
      if(window.ViabilAuth.accountId()!==task.owner||AnalysisIdentity.key(state.lot)!==task.identity)return cancel();
      const saved=await window.ViabilAuth.saveStudy(task.entry);
      if(window.ViabilAuth.accountId()!==task.owner)return cancel();
      state.savedCustom[saved.lot.id]=saved;state.saved.add(saved.lot.id);
      if(pending===task){pending=null;closeModal();if(AnalysisIdentity.key(state.lot)===task.identity&&state.page===task.page){task.next();}task.resolve(true);}
    }catch(error){
      if(pending===task){pending=null;task.resolve(false);closeModal();if(error.code==='NO_CREDITS'){try{await refresh();}catch{}blocked();}else notify(error.message||'Não foi possível iniciar a análise.');}
    }
  }
  async function run(next){
    if(!guardSelection())return false;
    if(hasAccess()){next();return true;}
    if(pending&&!document.querySelector('[data-usage-confirm]'))cancel();
    if(pending||loading)return false;
    loading=true;
    const id=window.ViabilAuth.accountId(),identity=AnalysisIdentity.key(state.lot);
    try{
      await refresh();
      if(window.ViabilAuth.accountId()!==id||AnalysisIdentity.key(state.lot)!==identity)return false;
      if(usage.unlimited){next();return true;}
      if(usage.balance<1){blocked();return false;}
      return await new Promise(resolve=>{
        pending={owner:id,identity,page:state.page,entry:parcelStudyEntry(),next,resolve};
        modal('Iniciar análise do terreno?',`<p>Esta análise utilizará <strong>1 uso</strong> do seu saldo de <strong>${number(usage.balance)}</strong>.</p><p>O estudo ficará salvo para você reabrir e ajustar as premissas. Uma mudança na geometria ou localização inicia outra análise.</p>`,'<button class="btn" data-action="close-modal">Voltar</button><button class="btn primary" data-usage-confirm>Analisar · 1 uso</button>');
      });
    }catch(error){notify(error.message||'Não foi possível consultar seus usos.');return false;}
    finally{loading=false;}
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-usage-confirm]')&&pending){execute(pending);return;}if(event.target.closest('[data-action=close-modal]'))cancel();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')cancel();});
  window.ViabilUsage={set,clear,hasAccess,notice,run,refresh};
})();
