/* One deterministic calculation interface for server results and the explicitly labelled demo fallback.
 * This is NOT Base_Regras_JP v1.1: that external rule set has not been supplied to this repository. */
const ReportEngine=(()=>{
 const VERSION='feedback-demo-1.0',SCHEMA='VIABILEASY_ANALYSIS_V1';
 const norm={occupation:'https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4',
  parking:'https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=5',
  director:'https://www.joaopessoa.pb.gov.br/wp-content/uploads/2024/10/Lei-Complementar-no-164-2024.pdf',amendment:'https://sapl.joaopessoa.pb.leg.br/norma/22012'};
 const maxIA={MAD1:6,MAD2:4,MAD3:2,MBD:1,MPA:1};
 const profiles={ZH1:{to:50,tap:10},ZH2:{to:55,tap:5},ZH3:{to:50,tap:5},ZH4:{to:50,tap:15},ZH5:{to:50,tap:15}};
 const finite=n=>typeof n==='number'&&Number.isFinite(n),budget=n=>finite(n)&&n>=0?n:null;
 const code=s=>String(s||'').toUpperCase().replace(/[\s-]/g,'');
 const rounded=n=>Math.round(n*1e6)/1e6;
 const evidence=(reference,url,kind='documentary')=>({reference,url,kind,legalValidation:false});
 const feedback=evidence('Feedback do relatório demonstrativo · 03/11/2026; premissa de produto, não norma técnica',null,'product');
 function minimumParking({zone,use,units,unitArea}){
  if(!Number.isInteger(units)||units<0||!finite(unitArea)||unitArea<=0)return null;
  if(/^ZCS[1-4]$/.test(code(zone)))return 0;
  if(use==='H3')return Math.ceil(units/(unitArea<=30?4:2));
  if(use==='H1')return units;
  return null;
 }
 function financial({lot,config,vgv,totalBuilt,excessArea,elevator,pendings}){
  const f=config.finance||lot.studyAssumptions?.finance||{},cost=budget(config.cost),profit=finite(config.profit)?config.profit/100:.18;
  const direct=cost===null?null:totalBuilt*cost;
  const equipment={elevator:elevator?budget(f.elevatorCost):0,generator:elevator?budget(f.generatorCost):0};
  const projectsFloor=budget(f.projectsFloor),registry=budget(f.registrationCost);
  const projects=direct===null||projectsFloor===null?null:Math.max(direct*.03,projectsFloor);
  const grant=excessArea>1e-6?budget(f.outorgaCost):0;
  const ret=vgv*.04,commercialIndirect=vgv*.10,administration=direct===null?null:direct*.12;
  const items=[['Obra',direct],['Elevador',equipment.elevator],['Gerador',equipment.generator],['RET · hipótese 4%',ret],
   ['Indiretos · hipótese 10% do VGV',commercialIndirect],['Administração · hipótese 12% da obra',administration],['Projetos · piso a informar',projects],['Registro da incorporação',registry],['Outorga onerosa',grant]];
  const missing=items.filter(([,v])=>v===null).map(([name])=>name);
  for(const name of missing)pendings.push({id:'cost-'+name,status:'pending',message:name+': custo não incluído; valor pendente.',source:feedback});
  const nonLandKnown=items.reduce((s,[,v])=>s+(v??0),0),nonLand=missing.length?null:nonLandKnown,targetProfit=vgv*profit;
  const residualStatic=nonLand===null?null:(vgv-nonLand-targetProfit)/1.03;
  const discount=f.discount,annual=finite(discount?.annualRate)&&discount.annualRate>=0&&discount.annualRate<=1?discount.annualRate:null;
  const dated=typeof discount?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(discount.date)&&Number.isFinite(Date.parse(discount.date))&&new Date(discount.date).toISOString().slice(0,10)===discount.date&&typeof discount.source==='string'&&discount.source.trim().length>0;
  const rate=dated?annual:null;
  const months=Number.isInteger(f.constructionMonths)?f.constructionMonths:24,start=Number.isInteger(f.salesStartMonth)?f.salesStartMonth:12,sales=Number.isInteger(f.salesMonths)?f.salesMonths:12;
  if(months<1||months>120||start<0||start>120||sales<1||sales>120)throw Error('Cronograma financeiro inválido.');
  const cashflow=[];
  if(rate!==null&&nonLand!==null){
   const works=direct+equipment.elevator+equipment.generator+administration;
   for(let m=0;m<=Math.max(months,start+sales);m++){
    const revenue=m>start&&m<=start+sales?vgv/sales:0;
    const expense=(m>=1&&m<=months?works/months:0)+(revenue*.14)+(m===0?projects+registry+grant:0);
    cashflow.push({month:m,revenue,expense,targetProfit:revenue*profit});
   }
  }
  const residualNPV=cashflow.length?cashflow.reduce((sum,row)=>sum+(row.revenue-row.expense-row.targetProfit)/(1+rate)**(row.month/12),0)/1.03:null;
  if(rate===null)pendings.push({id:'selic',status:'pending',message:'TMA/Selic e data de referência pendentes. Residual a valor presente não calculado.',source:evidence('Banco Central · SGS 432','https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom')});
  pendings.push({id:'market',status:'pending',message:'Preço de venda informado/mediana de preço pedido não é venda fechada; faixa de custo do bairro e enquadramento tributário precisam de validação.',source:feedback});
  return {method:'monthly-residual-npv-v1',complete:nonLand!==null&&rate!==null,vgv,direct,items,nonLandKnown,nonLand,targetProfit,
   residualStatic,residualNPV,discount:rate===null?null:discount,cashflow,constructionMonths:months,salesStartMonth:start,salesMonths:sales,
   rates:{itbi:.03,ret:.04,commercialIndirect:.10,administration:.12},source:feedback,
   priceBasis:f.priceBasis||'Preço informado; não verificado como venda fechada',costBasis:f.costBasis||'Custo informado; faixa do bairro não validada'};
 }
 function calculate(lot,config,deps,{includeNoteB=true,execution='browser-demonstration'}={}){
  const {Geometry:G,Setbacks:R,Capacity:B}=deps;
  if(!lot||!config||!Number.isInteger(config.floors)||config.floors<1||config.floors>80||!finite(lot.area)||lot.area<=0||lot.area>1e6
   ||!finite(config.to)||config.to<0||config.to>100||!finite(config.unitArea)||config.unitArea<=0||config.unitArea>1e6||!['H1','H3','Comercial','Flats','Misto'].includes(config.use)
   ||!finite(config.price)||config.price<0||config.price>1e9||!finite(config.cost)||config.cost<0||config.cost>1e9||!finite(config.profit)||config.profit<0||config.profit>100)throw Error('Entradas do cenário inválidas.');
  const context=lot.urbanContext||{},zone=code(context.zone||lot.zone),macrozone=code(context.macrozone),baseCa=1,maxCa=maxIA[macrozone]??null;
  const g=lot.geometry||G.rectangle(lot.width,lot.depth);
  if(!g.valid)throw Error('Geometria inválida.');
  if(config.finance!=null){
   if(typeof config.finance!=='object'||Array.isArray(config.finance))throw Error('Orçamento inválido.');
   for(const key of ['elevatorCost','generatorCost','projectsFloor','registrationCost','outorgaCost'])if(config.finance[key]!=null&&(budget(config.finance[key])===null||config.finance[key]>1e9))throw Error('Orçamento inválido.');
   for(const key of ['constructionMonths','salesStartMonth','salesMonths'])if(config.finance[key]!=null&&!Number.isInteger(config.finance[key]))throw Error('Cronograma inválido.');
  }
  const pendings=[],supported=Boolean(profiles[zone]),floors=config.floors,profile=profiles[zone];
  const highwayFront=[g.front,...(Array.isArray(context.streetEdges)?context.streetEdges:[])].some(i=>context.roads?.[i]==='highway');
  const noteEligible=config.use==='H3'&&['local','collector'].includes(context.roadClass)&&!highwayFront;
  const noteRequested=config.regimeVariant==='note-b',noteApplied=noteRequested&&noteEligible&&floors<=4&&supported;
  if(noteRequested&&!noteApplied)pendings.push({id:'note-b',status:'pending',message:'Nota B não aplicada: confirme H3, via local/coletora e até quatro pavimentos.',source:evidence('LC 169/2024 · Anexo IV, nota B',norm.occupation)});
  let toMax=profile?.to??null,permeability=profile?.tap??null;
  if(noteApplied){toMax=floors<=3?50:55;permeability=5;}
  if(config.use==='H1'&&supported)toMax=60;
  const setbackConfig={...config,regimeVariant:noteApplied?'note-b':'general'};
  const setbackRule=R.resolve(lot,setbackConfig,g);
  const occupation=toMax===null?config.to:Math.min(config.to,toMax);
  const floorPlates=setbackRule.levels.map(level=>{
   const envelope=G.inset(g,{edgeOffsets:level.edgeOffsets});
   return {floor:level.floor,envelope,area:supported?Math.max(0,Math.min(lot.area*occupation/100,envelope.largest)):0};
  });
  const capacity=floorPlates.reduce((s,p)=>s+p.area,0),factor=maxCa===null||capacity===0?1:Math.min(1,lot.area*maxCa/capacity);
  const elevator=floors>4,coreArea=elevator?37.4:20,minWidth=5;
  for(const plate of floorPlates){
   plate.area*=factor;
   const footprint=G.footprint(g,plate.area,plate.envelope),a=g.vertices[g.front],b=g.vertices[(g.front+1)%g.vertices.length],length=G.distance(a,b),axis=[(b[0]-a[0])/length,(b[1]-a[1])/length];
   const projections=footprint.flat().map(p=>p[0]*axis[0]+p[1]*axis[1]);
   plate.width=projections.length?rounded(Math.max(...projections)-Math.min(...projections)):0;
   plate.eligible=plate.width+1e-6>=minWidth&&plate.area>coreArea;
   const projection=finite(config.balconyProjectionMeters)?Math.max(0,Math.min(.5,config.balconyProjectionMeters)):0;
   plate.balconyArea=plate.floor>=2&&plate.eligible?plate.width*projection:0;
   plate.coreArea=Math.min(coreArea,plate.area);plate.privateArea=plate.eligible?Math.max(0,plate.area-plate.coreArea)+plate.balconyArea:0;
   plate.units=plate.eligible?Math.floor((plate.privateArea+1e-7)/config.unitArea):0;
  }
  const envelope=floorPlates[0].envelope,footprint=floorPlates[0].area,gross=floorPlates.reduce((s,p)=>s+p.area,0),privateArea=floorPlates.reduce((s,p)=>s+p.privateArea,0);
  const units=config.use==='H1'?Math.min(1,Math.floor((privateArea+1e-7)/config.unitArea)):floorPlates.reduce((s,p)=>s+p.units,0);
  const sellable=units*config.unitArea,retail=0,totalBuilt=gross,vgv=sellable*config.price,excessArea=Math.max(0,gross-lot.area*baseCa);
  const layout=context.parkingLayout,available=layout&&Number.isInteger(layout.capacity)&&layout.capacity>=0&&typeof layout.reference==='string'&&layout.reference.trim()?layout.capacity:null;
  const legal=minimumParking({zone,use:config.use,units,unitArea:config.unitArea}),product=units;
  const parking={legalMinimum:legal,productTarget:product,capacity:available,capacityStatus:available===null?'pending':'informed',
   legalDeficit:available===null||legal===null?null:Math.max(0,legal-available),productDeficit:available===null?null:Math.max(0,product-available),
   directFrontageIllustration:Math.floor(g.frontage/3),frontageAssumption:'3 m de testada por acesso direto: referência ilustrativa de produto; não representa projeto completo de garagem.',
   source:evidence('LC 169/2024 · Anexo V; LUOS arts. 88–89',norm.parking),productSource:feedback,layoutReference:layout?.reference||null};
  const financialResult=financial({lot,config,vgv,totalBuilt,excessArea,elevator,pendings});
  const outorga={excessArea,status:excessArea>1e-6&&budget((config.finance||lot.studyAssumptions?.finance||{}).outorgaCost)===null?'pending':excessArea>1e-6?'informed':'not_required_by_area',
   message:'Regulamentação e cálculo de OODC não confirmados; PL 181/2023 não é tratado como lei sancionada.',source:evidence('Plano Diretor LC 164/2024, alterado pela LC 171/2025',norm.director)};
  if(maxCa===null)pendings.push({id:'macrozone',status:'pending',message:'Macrozona não confirmada: IA máximo não determinado.',source:evidence('LC 164/2024 e LC 171/2025',norm.amendment)});
  if(excessArea>1e-6)pendings.push({id:'outorga-regulation',status:'pending',message:outorga.message+' Custo '+(outorga.status==='pending'?'não incluído.':'informado como hipótese; não homologado.'),source:outorga.source});
  if(highwayFront&&['local','collector'].includes(context.roadClass))pendings.push({id:'road-conflict',status:'pending',message:'Classe local/coletora conflita com frente rodoviária. Nota B não aplicada; confirmar hierarquia e alinhamento.',source:evidence('LC 169/2024 · notas B e C',norm.occupation)});
  if(!supported)pendings.push({id:'zone',status:'pending',message:'Zona fora do recorte de cálculo: apenas identificação, sem estimativa de unidades ou viabilidade.',source:evidence('Cobertura ZH1–ZH5',norm.occupation)});
  const coastal=lot.coastal||context.coastal==='inside';
  pendings.push({id:'coastal',status:coastal?'special_review':context.coastal==='outside'?'informed':'pending',message:coastal?'Altura em revisão especial na faixa de 500 m da orla. Não há autorização de altura neste estudo.':'Situação de orla informada ou pendente; sem confirmação espacial de todas as restrições.',source:evidence('LUOS art. 62 e efeitos normativos/judiciais a verificar',norm.occupation)});
  pendings.push({id:'use',status:'pending',message:'Permissão de uso depende da zona e classe da via no Anexo III. Flats e salas não são usos automaticamente permitidos.',source:evidence('LC 169/2024 · Anexo III',norm.occupation)});
  pendings.push({id:'equipment',status:'pending',message:elevator?'Elevador e gerador considerados no cenário acima de quatro pavimentos; conferir exigência na base de regras e no projeto.':'Critério de elevador/gerador por pavimentos não substitui análise de acessibilidade e segurança.',source:feedback});
  pendings.push({id:'parking',status:available===null?'pending':parking.productDeficit>0?'incompatible':'informed',message:available===null?'Vagas: capacidade física não demonstrada. A quantidade de UH é estimativa por área.':'Capacidade informada: confirmar implantação, acessos, manobras e circulação.',source:parking.source});
  if(g.back==null||context.streetEdges?.length>1)pendings.push({id:'corner',status:'pending',message:'Esquina/divisas não frontais e alinhamentos devem ser confirmados na SEPLAN.',source:evidence('LUOS art. 68 e regras de alinhamento',norm.occupation)});
  if(config.balconyProjectionMeters>0)pendings.push({id:'balcony',status:'pending',message:'Balanço de varanda é hipótese de cenário, limitado a 0,50 m a partir do 2º pavimento; confirmar aplicação do COE art. 222 e cômputo de áreas.',source:feedback});
  if(!setbackRule.resolved)pendings.push({id:'setbacks',status:'pending',message:setbackRule.reason,source:evidence('Recuos ainda demonstrativos',norm.occupation)});
  const result={schema:SCHEMA,engine:{version:VERSION,rulesetId:null,execution,validatedRuleCount:0,notice:'Correções demonstrativas do feedback; Base_Regras_JP v1.1 (302 regras) ainda não integrada.'},
   classification:coastal?'revisão especial':parking.productDeficit>0?'incompatível com a meta de vagas':'indeterminado',calculationStatus:supported?'demonstration':'identification_only',legalValidation:false,zone,macrozone,baseCa,maxCa,floors,toMax,requestedOccupancy:config.to,permeability,
   equipment:{elevator:{required:elevator,cost:financialResult.items[1][1],source:feedback},generator:{required:elevator,cost:financialResult.items[2][1],source:feedback}},
   coreArea,minWidth,privateArea,parkingRules:parking,outorga,financial:financialResult,pendings,
   evidence:{ia:evidence('IA básico 1,0; máximo por macrozona · LC 164/2024 e LC 171/2025',norm.director),occupation:evidence(noteApplied?'LC 169/2024 · Anexo IV, nota B':'LC 169/2024 · Anexo IV, quadro geral',norm.occupation),core:feedback},
   buildingCapacity:B.resolve(lot,config,floorPlates),setbackRule,envelope,floorPlates,topSetbackArea:floorPlates.at(-1).envelope.area,setbackArea:envelope.area,contiguousArea:envelope.largest,
   setbackMethod:envelope.method,setbackReason:envelope.reason,footprint,gross,sellable,units,retail,totalBuilt,vgv,direct:financialResult.direct,
   indirect:financialResult.items[3][1]+financialResult.items[4][1]+(financialResult.items[5][1]??0),nonLand:financialResult.nonLand,targetProfit:financialResult.targetProfit,
   residual:financialResult.residualNPV,margin:financialResult.complete&&finite(config.landPrice)&&vgv>0?(vgv-financialResult.nonLand-config.landPrice*1.03)/vgv*100:null,
   height:floors*3,ca:gross/lot.area,parking:available,regimeVariant:noteApplied?'note-b':'general'};
  if(!supported){
   for(const key of ['gross','privateArea','sellable','units','totalBuilt','vgv','direct','indirect','nonLand','targetProfit','residual','margin','ca'])result[key]=null;
   result.parkingRules.productTarget=null;
   result.financial={...financialResult,complete:false,vgv:null,nonLand:null,residualStatic:null,residualNPV:null,cashflow:[]};
  }
  if(includeNoteB&&config.use==='H3')result.noteB=noteEligible&&supported?{status:'conditional',source:evidence('LC 169/2024 · Anexo IV, nota B',norm.occupation),result:calculate(lot,{...config,floors:4,to:55,regimeVariant:'note-b'},deps,{includeNoteB:false,execution})}:
   {status:'pending',result:null,message:'Nota B deve ser comparada: confirme classe de via local/coletora e cobertura da zona. Não foi escolhido um melhor cenário.'};
  return result;
 }
 return {VERSION,SCHEMA,calculate,minimumParking};
})();
if(typeof module!=='undefined')module.exports=ReportEngine;
