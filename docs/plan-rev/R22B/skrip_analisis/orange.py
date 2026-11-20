import subprocess, numpy as np, sys, json
W,H=300,330  # crop of camera panel
cmd=['ffmpeg','-v','error','-i',sys.argv[1],'-vf','crop=300:330:0:180','-f','rawvideo','-pix_fmt','rgb24','-']
p=subprocess.Popen(cmd,stdout=subprocess.PIPE)
fs=W*H*3; out=[]
while True:
    b=p.stdout.read(fs)
    if len(b)<fs: break
    a=np.frombuffer(b,np.uint8).reshape(H,W,3).astype(np.int16)
    r,g,bb=a[...,0],a[...,1],a[...,2]
    m=(r>180)&(r-g>80)&(r-bb>120)
    out.append(int(m.sum()))
json.dump(out,open(sys.argv[2],'w'))
print(len(out),'frames; orange px p50',int(np.median(out)),'max',max(out))
