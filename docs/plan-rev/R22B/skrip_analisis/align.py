import json,numpy as np
o=np.array(json.load(open('/home/claude/vid/orange.json')))
vt=np.arange(len(o))/30.0
vdet=(o>100).astype(float)
d=json.load(open('/home/claude/data2/s970.json'))
s=[x for x in d['sessions'] if x['meta']['sessionId']=='S-970f4cb0'][0]
F=[f for f in s['frames'] if f['trialId']=='S-970f4cb0-T002']
st=np.array([f['t']/1000 for f in F]); sh=np.array([1.0 if f['hands']>0 else 0.0 for f in F])
def score(off,lo,hi):
    m=(vt>=lo)&(vt<hi)
    tt=vt[m]+off
    idx=np.searchsorted(st,tt)-1
    ok=(idx>=0)&(idx<len(st))
    a=vdet[m][ok]; b=sh[idx[ok]]
    return (a==b).mean() if len(a) else np.nan
offs=np.arange(80,92,0.05)
g=[score(x,0,87) for x in offs]
print('global best offset %.2f agree %.3f'%(offs[int(np.nanargmax(g))],np.nanmax(g)))
for lo in range(0,85,10):
    sc=[score(x,lo,lo+15) for x in offs]
    print('win v[%2d,%2d) best off %.2f agree %.3f'%(lo,lo+15,offs[int(np.nanargmax(sc))],np.nanmax(sc)))
