// Hidden or unavailable favorites keep their slots when the visible shelf moves.
export function reorderVisibleFavorites(current,visibleOrder){
 const visible=new Set(visibleOrder)
 if(visible.size!==visibleOrder.length||visibleOrder.some(id=>!current.includes(id)))return current
 let index=0
 return current.map(id=>visible.has(id)?visibleOrder[index++]:id)
}
