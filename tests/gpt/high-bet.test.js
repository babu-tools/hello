// 高額配慮の方針・既存版との比較・全候補の安全性を検証。
var setup=readFile('tests/gpt/cut-core.test.js').split('// ---- 2. テスト用ヘルパ ----')[0];
eval(setup);
var manualSource=readFile('tests/gpt/manual-cut.test.js');
eval(['assert','bets','combinations','verify','oracle'].map(name=>extractFunction(manualSource,name)).join('\n'));
function shape(r){return JSON.stringify({rows:r.rows && r.rows.slice().sort((a,b)=>a.seat-b.seat),plan:r.manualPlan,total:r.finalEffectiveTotal,fallback:r.searchFallback});}
function compare(values,L,G){
 var input=bets(values),old=computeSide(input,L,G),high=computeSide(input,L,G,'high');
 verify(high,L,G);
 return {old,high};
}
// 明確な高額差: 中間席の負担を高額席へ移し、余分なカットは増やさない。
var example=compare([500,500,1000,10000],3000,300);
assert(example.old.rows[2].cut===700 && example.high.rows[2].cut===600,'中間席の負担軽減');
assert(example.old.rows[3].cut===7900 && example.high.rows[3].cut===8000,'突出席へ負担移動');
assert(example.high.finalEffectiveTotal===3000 && !example.high.searchFallback,'上限ちょうど');
assert(example.high.highBetPolicy.median===750 && example.high.highBetPolicy.threshold===1500,'偶数中央値');
// 境界以下・同額・単独席では既存GPTと同じ。
[[1000,1000,1000,1000],[1000,1500,2000],[1500,1500,3000],[10000]].forEach(values=>{
 var pair=compare(values,3000,300);assert(shape(pair.old)===shape(pair.high),'突出なしで既存結果が変化');
});
// 2席は低い方を基準にして、明確な差を見落とさない。
var two=compare([1000,10000],5000,300);
assert(two.high.highBetPolicy.threshold===2000,'2席の基準');
assert(two.high.rows[0].cut < two.old.rows[0].cut && two.high.rows[1].cut > two.old.rows[1].cut,'2席でも負担を移す');
// 上限内・空席・最低保証が不可能なケース。
assert(computeSide([],3000,300,'high').state==='none','空席');
assert(computeSide(bets([100,100,1000]),3000,300,'high').state==='nocut','カット不要');
assert(computeSide(bets([500,500,5000]),500,300,'high').state==='overflow','保証不能');
// 多様な高額差、全ての手動候補、席順不変を検証。
var seed=130928;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);}
var changed=0,manual=0,fallbacks=0,extraCutCases=0;
for(var t=0;t<700;t++){
 var values=Array.from({length:3+rand(6)},()=>10*(10+rand(180)));
 values[values.length-1]=10*(500+rand(2500));
 var G=rand(8)*100,T=values.reduce((a,b)=>a+b,0),L=(50+rand(Math.floor(T/10)))*10;
 var pair=compare(values,L,G),r=pair.high;
 if(r.state!=='cut')continue;
 if(shape(pair.old)!==shape(r))changed++;
 if(r.manualPlan.length)manual++;
 if(r.searchFallback)fallbacks++;
 if(r.finalEffectiveTotal<pair.old.finalEffectiveTotal)extraCutCases++;
 assert(!r.searchFallback,'この検証範囲で保証床fallback');
 assert(r.finalEffectiveTotal>=pair.old.finalEffectiveTotal,'この検証範囲で比例版より過剰カット');
 assert(shape(r)===shape(computeSide(bets(values).reverse(),L,G,'high')),'席順によって配分が変化');
}
// 少額・突出席がある場合も独立全探索の最小カットと照合。
for(var t=0;t<100;t++){
 var values=[10*(1+rand(12)),10*(1+rand(12)),10*(40+rand(40))],L=10*(1+rand(80)),G=rand(3)*100;
 var r=computeSide(bets(values),L,G,'high');verify(r,L,G);
 if(r.state==='cut')assert(r.cutTotal+r.manualCutTotal===oracle(values,L,G),'独立全探索との不一致');
}
print('高額配慮: 700ケース、変更='+changed+'、端数判断='+manual+'、保証床fallback='+fallbacks+'、比例版より追加カット='+extraCutCases+'。小額100ケース全探索一致。');
