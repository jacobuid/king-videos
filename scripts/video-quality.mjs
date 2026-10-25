export function videoQuality(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null
 const long=Math.max(width,height),short=Math.min(width,height)
 for(const [label,w,h]of [['2160p',3800,2100],['1440p',2500,1400],['1080p',1800,1000],['720p',1200,700],['576p',1000,560],['480p',800,460],['360p',600,350],['240p',400,230],['144p',240,140]])if(long>=w||short>=h)return label
 return null
}
