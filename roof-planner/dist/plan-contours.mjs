// Inspect a single, calibrated exterior elevation. The crop's top is the low
// eave and its bottom is the floor. Return proposals in feet and crop pixels.
export function detectElevationOpenings(imageData,{side,span,height}){
 const {width:sourceW,height:sourceH,data}=imageData||{};
 if(!Number.isInteger(sourceW)||!Number.isInteger(sourceH)||sourceW<4||sourceH<4||
    sourceW*sourceH>24_000_000||data?.length!==sourceW*sourceH*4||
    ![span,height].every(v=>Number.isFinite(v)&&v>0))throw Error('Choose a single elevation and enter its wall span and eave height.');
 const factor=Math.min(1,1600/sourceW,960/sourceH),w=Math.max(1,Math.floor(sourceW*factor)),h=Math.max(1,Math.floor(sourceH*factor));
 const gray=new Uint8Array(w*h),neutral=new Uint8Array(w*h),hist=new Uint32Array(256);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=Math.floor((x+.5)*sourceW/w),sy=Math.floor((y+.5)*sourceH/h),i=4*(sy*sourceW+sx),k=y*w+x;
  const red=data[i],green=data[i+1],blue=data[i+2],alpha=data[i+3]/255;
  const value=Math.round((.299*red+.587*green+.114*blue)*alpha+255*(1-alpha));
  gray[k]=value;neutral[k]=Math.max(red,green,blue)-Math.min(red,green,blue)<=26;
  if(neutral[k])hist[value]++;
 }
 const mask=new Uint8Array(w*h),queue=new Int32Array(w*h),found=[];
 const footX=span/w,footY=height/h;
 function closeInkGaps(){
  // Bridge thin dimension leaders through an otherwise solid opening.
  const gap=Math.min(4,Math.floor(.35/footX));
  if(!gap)return;
  for(let y=0;y<h;y++){
   const row=y*w;let last=-gap-2;
   for(let x=0;x<w;x++)if(mask[row+x]){
    if(x-last>1&&x-last<=gap+1)for(let k=last+1;k<x;k++)mask[row+k]=1;
    last=x;
   }
  }
 }
 function bordered(l,r,t,b){
  // Empty interiors need an ink frame on both jambs and the head/sill.
  function lineScore(x,y,dx,dy,count){
   let score=0;
   for(let i=0;i<count;i++){
    let ink=false;
    for(let j=-2;j<=2;j++){const cx=x+i*dx+j*dy,cy=y+i*dy+j*dx;if(cx>=0&&cx<w&&cy>=0&&cy<h&&gray[cy*w+cx]<110)ink=true}
    if(ink)score++;
   }
   return score/count;
  }
  return lineScore(l,t,0,1,b-t+1)>.65&&lineScore(r,t,0,1,b-t+1)>.65&&lineScore(l,t,1,0,r-l+1)>.65&&
   (b>=h-2||lineScore(l,b,1,0,r-l+1)>.65);
 }
 function collect(outlined){
  for(let k=0;k<mask.length;k++)if(mask[k]){
   let n=1,head=0,l=w,r=0,t=h,b=0;
   queue[0]=k;mask[k]=0;
   while(head<n){
    const at=queue[head++],y=Math.floor(at/w),x=at-y*w;
    if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;
    if(x>0&&mask[at-1]){mask[at-1]=0;queue[n++]=at-1}
    if(x<w-1&&mask[at+1]){mask[at+1]=0;queue[n++]=at+1}
    if(y>0&&mask[at-w]){mask[at-w]=0;queue[n++]=at-w}
    if(y<h-1&&mask[at+w]){mask[at+w]=0;queue[n++]=at+w}
   }
   const bw=r-l+1,bh=b-t+1,ratio=n/(bw*bh);
   if(bw<3||bh<3||n<10||ratio<(outlined?.93:.78)||bw*footX<1||bh*footY<1||
      bw*footX>bh*footY*16||bh*footY>bw*footX*8||bh>=h-2&&bw>=w*.94)continue;
   if(outlined&&!bordered(l,r,t,b))continue;
   // Mid-gray paper/wall fills commonly span the full eave height. Distinguish
   // the facade field from an opening even if a neighboring shape bisects it.
   if(t<=1&&b>=h-2)continue;
   const x0=Math.max(0,l-.5),x1=Math.min(w,r+1.5),y0=Math.max(0,t-.5),y1=Math.min(h,b+1.5);
   const floor=(h-y1)*footY<=Math.max(.3,2*footY),physicalW=(x1-x0)*footX,physicalH=((floor?h:y1)-y0)*footY;
   const kind=floor?(physicalW>=7?'Garage door':'Door'):'Window';
   found.push({ratio,kind,side,offset:x0*footX,width:physicalW,height:physicalH,sill:floor?0:(h-y1)*footY,
    box:{x:x0*sourceW/w,y:y0*sourceH/h,width:(x1-x0)*sourceW/w,height:((floor?h:y1)-y0)*sourceH/h}});
  }
 }
 const minPixels=Math.max(8,Math.floor(w*h*.00012));
 for(let pass=0;pass<5;pass++){
  let peak=0;
  for(let v=65;v<=223;v++)if(!peak||hist[v]>hist[peak])peak=v;
  if(!peak||hist[peak]<minPixels)break;
  for(let v=Math.max(0,peak-14);v<=Math.min(255,peak+14);v++)hist[v]=0;
  for(let i=0;i<mask.length;i++)mask[i]=neutral[i]&&Math.abs(gray[i]-peak)<=10;
  closeInkGaps();collect(false);
 }
 if(!found.length){
  for(let i=0;i<mask.length;i++)mask[i]=neutral[i]&&gray[i]>=228;
  collect(true);
 }
 const kept=[];
 for(const row of found.sort((a,b)=>b.ratio-a.ratio)){
  const a=row.box;
  const duplicate=kept.some(({box:b})=>{
   const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
   return overlap>.75*Math.min(a.width*a.height,b.width*b.height);
  });
  if(!duplicate){const {ratio,...proposal}=row;kept.push(proposal)}
  if(kept.length>200)throw Error('This crop contains too many candidate openings. Select one exterior elevation.');
 }
 return kept.sort((a,b)=>a.offset-b.offset||a.sill-b.sill);
}
