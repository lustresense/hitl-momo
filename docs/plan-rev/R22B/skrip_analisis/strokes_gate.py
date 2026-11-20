import json,sys,math
sys.path.insert(0,'/home/claude/scripts')
d=json.load(open(sys.argv[1]))
SID=sys.argv[2] if len(sys.argv)>2 else 'S-970f4cb0'; TID=sys.argv[3] if len(sys.argv)>3 else SID+'-T002'
s=[x for x in d['sessions'] if x['meta']['sessionId']==SID][0]
F=[f for f in s['frames'] if f['trialId']==TID]
E=[e for e in s['events'] if e.get('trialId')==TID]
def D(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def ang(a,b,c):
    v1=(a[0]-b[0],a[1]-b[1]); v2=(c[0]-b[0],c[1]-b[1]); n=math.hypot(*v1)*math.hypot(*v2)
    return math.degrees(math.acos(max(-1,min(1,(v1[0]*v2[0]+v1[1]*v2[1])/n)))) if n else float('nan')
def gate(f):
    L=[(p[0]*(f.get('aspect') or 1.7778),p[1]) for p in f['lm']]; sc=D(L[0],L[9])
    r3=ang(L[5],L[6],L[7])>=60
    r4=bool((f.get('thumb') or {}).get('open'))
    r2=D(L[4],L[5])/sc>=0.33
    fs=f.get('fingerStates') or ['?']*4
    if sum(1 for v in fs[1:] if v=='extended')>=2: return True
    return r3 and (r4 or r2)
st={}
for e in E:
    sid=(e.get('data') or {}).get('strokeId')
    if e['type']=='STROKE_START': st.setdefault(sid,{})['a']=e['t']
    if e['type']=='STROKE_END': st.setdefault(sid,{}).update(b=e['t'],n=e['data'].get('points'),why=e['data'].get('endReason'))
OFF=87.85 if SID=='S-970f4cb0' else 0
print('stroke  v_start  dur_ms  pts  end                    pinchFrames  passGate  first2pass  prevStablePose')
for k in sorted(st):
    a,b=st[k]['a'],st[k].get('b')
    fr=[f for f in F if a-150<=f['t']<=b and f.get('lm') and f['rawPose']=='pinch']
    ok=[gate(f) for f in fr]
    prev=[f['stablePose'] for f in F if a-700<=f['t']<a-80 and f.get('lm')]
    print('%4d   %6.2f   %5d  %3s  %-22s %5d        %5d     %-5s     %s'%(k,a/1000-OFF,b-a,st[k].get('n'),st[k].get('why'),len(fr),sum(ok),all(ok[:2]) if ok else None,'>'.join(dict.fromkeys(prev))))
# also: the undo-window pinch frames that would still pass
print('\nundo-window pinch frames passing gate:',[(round(f['t']/1000-OFF,2)) for f in F if 155800<=f['t']<=168000 and f.get('lm') and f['rawPose']=='pinch' and gate(f)])
