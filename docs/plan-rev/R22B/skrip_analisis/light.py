import json,sys,collections,statistics as S
d=json.load(open(sys.argv[1]))
s=[x for x in d['sessions'] if x['meta']['sessionId']=='S-970f4cb0'][0]
OFF=87.85
def q(v,p): v=sorted(v); return round(v[min(len(v)-1,int(p*len(v)))],3) if v else None
for tid in ('S-970f4cb0-T001','S-970f4cb0-T002'):
    F=[f for f in s['frames'] if f['trialId']==tid]
    H=[f for f in F if f.get('lm')]
    nw=[f['nearWhiteHandPct'] for f in H if f.get('nearWhiteHandPct') is not None]
    cx=[sum(p[0] for p in f['lm'])/21 for f in H]; cy=[sum(p[1] for p in f['lm'])/21 for f in H]
    print('==',tid,'tracked',len(H),'nearWhite p25/p50/p75',q(nw,.25),q(nw,.5),q(nw,.75),' hand cx p10/50/90',q(cx,.1),q(cx,.5),q(cx,.9),' cy p50',q(cy,.5))
    print('   poses while tracked',collections.Counter(f['rawPose'] for f in H).most_common(8))
    # losses >3 frames
    rows=[]; i=0
    while i<len(F):
        if F[i]['hands']==0 and i>0 and F[i-1].get('lm'):
            j=i
            while j<len(F) and F[j]['hands']==0: j+=1
            if j-i>3 and j<len(F):
                pre=F[i-1]
                rows.append((round(F[i]['t']/1000-(OFF if tid.endswith('T002') else 0),2),j-i,F[j]['t']-F[i-1]['t'],pre['rawPose'],pre.get('nearWhiteHandPct'),round(sum(p[0] for p in pre['lm'])/21,2),round(sum(p[1] for p in pre['lm'])/21,2),pre.get('lumaP50')))
            i=j
        else: i+=1
    print('   losses>3f (t,frames,gap_ms,lastPose,lastNearWhite%,cx,cy,lumaP50):')
    for r in rows: print('     ',r)
    lw=[r[4] for r in rows if r[4] is not None]
    print('   lastNearWhite before loss: median',S.median(lw) if lw else None,' vs tracked median',S.median(nw))
    lp=[f['lumaP50'] for f in F if f['hands']==0 and f.get('lumaP50') is not None]; tp=[f['lumaP50'] for f in H if f.get('lumaP50') is not None]
    print('   global lumaP50 lost vs tracked:',q(lp,.5),q(tp,.5))
