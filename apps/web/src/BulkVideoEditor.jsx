import {useState} from 'react'

export default function BulkVideoEditor({count,genres,saving,onApply,onClear}){
  const[rating,setRating]=useState('keep'),[age,setAge]=useState('keep'),[blocked,setBlocked]=useState('keep'),[replaceGenres,setReplaceGenres]=useState(false),[chosenGenres,setChosenGenres]=useState([])
  const changed=rating!=='keep'||age!=='keep'||blocked!=='keep'||replaceGenres
  function submit(event){event.preventDefault();const settings={};if(rating!=='keep')settings.rating=rating||null;if(age!=='keep')settings.minAge=Number(age);if(blocked!=='keep')settings.blocked=blocked==='blocked';if(replaceGenres)settings.genres=chosenGenres;onApply(settings)}
  return <form className="bulk-video-editor" onSubmit={submit} aria-label="Bulk video settings">
    <header><strong>{count} selected</strong><button type="button" onClick={onClear} disabled={saving}>Clear selection</button></header>
    <fieldset disabled={saving} className="bulk-settings"><legend className="sr-only">Settings to apply</legend>
      <label>Rating<select value={rating} onChange={e=>setRating(e.target.value)}><option value="keep">Keep unchanged</option><option value="">Unrated</option>{['G','PG','PG-13','R','NC-17','TV-Y','TV-Y7','TV-G','TV-PG','TV-14','TV-MA','NR'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Available Age<select value={age} onChange={e=>setAge(e.target.value)}><option value="keep">Keep unchanged</option>{Array.from({length:22},(_,value)=><option key={value} value={value}>{value===0?'All ages (0+)':`${value}+`}</option>)}</select></label>
      <label>Blocked Status<select value={blocked} onChange={e=>setBlocked(e.target.value)}><option value="keep">Keep unchanged</option><option value="blocked">Blocked</option><option value="unblocked">Unblocked</option></select></label>
      <label className="bulk-genre-toggle"><input type="checkbox" checked={replaceGenres} onChange={e=>setReplaceGenres(e.target.checked)}/>Replace genres</label>
    </fieldset>
    {replaceGenres&&<fieldset className="bulk-genres" disabled={saving}><legend>Genres for every selected title</legend><p>This replaces existing genres. Leave all unselected to clear them.</p><div className="genre-editor">{genres.map(genre=><button type="button" key={genre} className={chosenGenres.includes(genre)?'selected':''} aria-pressed={chosenGenres.includes(genre)} onClick={()=>setChosenGenres(current=>current.includes(genre)?current.filter(g=>g!==genre):[...current,genre])}>{genre}</button>)}</div></fieldset>}
    <footer><small>Only the settings you change will be applied. PG-13 movies stay 16+; R movies stay 21+.</small><button type="submit" className="primary-button" disabled={!changed||saving}>{saving?'Applying…':'Apply to selected'}</button></footer>
  </form>
}
