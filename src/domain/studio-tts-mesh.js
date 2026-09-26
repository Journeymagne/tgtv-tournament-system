// Closed, UV-mapped token silhouettes for custom infinite bags. Coordinates
// match the Studio SVG artwork; all geometry comes from these fixed shapes.
function outline(shape) {
  if (shape === 'diamond') return [[50,2],[98,50],[50,98],[2,50]];
  if (shape === 'octagon') return [[29,3],[71,3],[97,29],[97,71],[71,97],[29,97],[3,71],[3,29]];
  if (shape === 'trapezoid') {
    const points = [[27,7]];
    const curve = (a,b,c) => { for (let i=1;i<=12;i++) { const t=i/12,u=1-t; points.push([u*u*a[0]+2*u*t*b[0]+t*t*c[0],u*u*a[1]+2*u*t*b[1]+t*t*c[1]]); } };
    curve([27,7],[50,12],[73,7]); points.push([94,86]);
    curve([94,86],[95,95],[50,95]); curve([50,95],[5,95],[6,86]);
    return points;
  }
  return Array.from({length:64},(_,i)=>[50+50*Math.cos(i*Math.PI/32),50+50*Math.sin(i*Math.PI/32)]);
}

function tokenMesh(shape = 'circle') {
  const points = outline(shape), count = points.length;
  const lines = ['# KT Studio token dispenser', 'o TokenDispenser'];
  const fmt = n => Number(n.toFixed(6)).toString();
  // TTS treats OBJ X/Z as the tabletop; SVG Y maps to Z, UV V runs upwards.
  for (const y of [0.04,-0.04]) for (const [x,z] of points) lines.push(`v ${fmt((x-50)/100)} ${y} ${fmt((z-50)/100)}`);
  lines.push('v 0 0.04 0','v 0 -0.04 0');
  for (const [x,z] of points) lines.push(`vt ${fmt((x+2)/104)} ${fmt(1-(z+2)/104)}`);
  lines.push('vt 0.5 0.5', 'vt 0.5 0.9', 'vn 0 1 0', 'vn 0 -1 0');
  for (let i=0;i<count;i++) {
    const next=(i+1)%count;
    let nx=points[next][1]-points[i][1],nz=points[i][0]-points[next][0];
    const length=Math.hypot(nx,nz);nx/=length;nz/=length;
    lines.push(`vn ${fmt(nx)} 0 ${fmt(nz)}`);
  }
  lines.push('s off');
  for (let i=0;i<count;i++) {
    const a=i+1,b=(i+1)%count+1,center=count+1,side=count+2,normal=i+3;
    lines.push(`f ${count*2+1}/${center}/1 ${b}/${b}/1 ${a}/${a}/1`);
    lines.push(`f ${count*2+2}/${center}/2 ${a+count}/${a}/2 ${b+count}/${b}/2`);
    lines.push(`f ${a}/${side}/${normal} ${b}/${side}/${normal} ${b+count}/${side}/${normal}`);
    lines.push(`f ${a}/${side}/${normal} ${b+count}/${side}/${normal} ${a+count}/${side}/${normal}`);
  }
  return lines.join('\n')+'\n';
}
module.exports = { tokenMesh };
